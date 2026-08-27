const DEFAULT_QUAD = Object.freeze([
  Object.freeze({ x: 0.06, y: 0.06 }),
  Object.freeze({ x: 0.94, y: 0.06 }),
  Object.freeze({ x: 0.94, y: 0.94 }),
  Object.freeze({ x: 0.06, y: 0.94 }),
]);

const distance = (first, second) => Math.hypot(second.x - first.x, second.y - first.y);
const radiansToDegrees = (radians) => radians * (180 / Math.PI);

function sourceDistance(first, second, sourceWidth, sourceHeight) {
  return Math.hypot(
    (second.x - first.x) * sourceWidth,
    (second.y - first.y) * sourceHeight,
  );
}

export function createCorrectionRecipe() {
  return {
    quad: DEFAULT_QUAD.map((point) => ({ ...point })),
  };
}

export function isConvexQuad(quad) {
  if (!Array.isArray(quad) || quad.length !== 4) return false;
  const crosses = quad.map((point, index) => {
    const next = quad[(index + 1) % 4];
    const after = quad[(index + 2) % 4];
    return ((next.x - point.x) * (after.y - next.y))
      - ((next.y - point.y) * (after.x - next.x));
  });
  const allPositive = crosses.every((value) => value > 0.0001);
  const allNegative = crosses.every((value) => value < -0.0001);
  const area = Math.abs(quad.reduce((sum, point, index) => {
    const next = quad[(index + 1) % 4];
    return sum + (point.x * next.y) - (next.x * point.y);
  }, 0) / 2);
  return (allPositive || allNegative) && area >= 0.01;
}

function lineAngle(first, second) {
  return radiansToDegrees(Math.atan2(second.y - first.y, second.x - first.x));
}

function normalizedDifference(first, second) {
  return Math.abs(first - second) / Math.max(first, second, 0.0001);
}

export function assessCaptureGeometry(recipe) {
  const quad = recipe.quad;
  if (!isConvexQuad(quad)) {
    return {
      level: "reshoot",
      label: "角度或裁剪范围无效，建议重拍",
      valid: false,
      rotation: null,
      opposingDifference: null,
      convergence: null,
    };
  }

  const topAngle = lineAngle(quad[0], quad[1]);
  const bottomAngle = lineAngle(quad[3], quad[2]);
  const leftAngle = lineAngle(quad[0], quad[3]);
  const rightAngle = lineAngle(quad[1], quad[2]);
  const rotation = Math.abs((topAngle + bottomAngle) / 2);
  const opposingDifference = Math.max(
    normalizedDifference(distance(quad[0], quad[1]), distance(quad[3], quad[2])),
    normalizedDifference(distance(quad[0], quad[3]), distance(quad[1], quad[2])),
  );
  const convergence = Math.max(
    Math.abs(topAngle - bottomAngle),
    Math.abs(leftAngle - rightAngle),
  );

  if (rotation <= 1 && opposingDifference <= 0.03 && convergence <= 1) {
    return {
      level: "direct",
      label: "拍摄角度良好，可直接测量",
      valid: true,
      rotation,
      opposingDifference,
      convergence,
    };
  }

  if (rotation <= 5 && opposingDifference <= 0.1 && convergence <= 4) {
    return {
      level: "correct",
      label: "建议先校正，测量会更可靠",
      valid: true,
      rotation,
      opposingDifference,
      convergence,
    };
  }

  return {
    level: "reshoot",
    label: "角度偏斜明显，建议重拍",
    valid: true,
    rotation,
    opposingDifference,
    convergence,
  };
}

export function solveUnitSquareToQuad(quad) {
  if (!isConvexQuad(quad)) return null;
  const [p0, p1, p2, p3] = quad;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  const denominator = (dx1 * dy2) - (dx2 * dy1);
  let g = 0;
  let h = 0;

  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    if (Math.abs(denominator) < 1e-9) return null;
    g = ((dx3 * dy2) - (dx2 * dy3)) / denominator;
    h = ((dx1 * dy3) - (dx3 * dy1)) / denominator;
  }

  return [
    p1.x - p0.x + (g * p1.x),
    p3.x - p0.x + (h * p3.x),
    p0.x,
    p1.y - p0.y + (g * p1.y),
    p3.y - p0.y + (h * p3.y),
    p0.y,
    g,
    h,
    1,
  ];
}

export function projectPoint(matrix, x, y) {
  const denominator = (matrix[6] * x) + (matrix[7] * y) + matrix[8];
  return {
    x: ((matrix[0] * x) + (matrix[1] * y) + matrix[2]) / denominator,
    y: ((matrix[3] * x) + (matrix[4] * y) + matrix[5]) / denominator,
  };
}

function rectifiedGeometry(sourceWidth, sourceHeight, recipe) {
  const quad = recipe.quad;
  const naturalWidth = (
    sourceDistance(quad[0], quad[1], sourceWidth, sourceHeight)
    + sourceDistance(quad[3], quad[2], sourceWidth, sourceHeight)
  ) / 2;
  const naturalHeight = (
    sourceDistance(quad[0], quad[3], sourceWidth, sourceHeight)
    + sourceDistance(quad[1], quad[2], sourceWidth, sourceHeight)
  ) / 2;
  return { quad, naturalWidth, naturalHeight };
}

export function correctionOutputSize(sourceWidth, sourceHeight, recipe, maximumEdge = 4096) {
  const { naturalWidth, naturalHeight } = rectifiedGeometry(
    sourceWidth,
    sourceHeight,
    recipe,
  );
  let width = Math.max(64, naturalWidth);
  let height = Math.max(64, naturalHeight);
  const scale = Math.min(1, maximumEdge / Math.max(width, height));
  width = Math.max(64, Math.round(width * scale));
  height = Math.max(64, Math.round(height * scale));
  return { width, height };
}

export function requiresProjectiveCorrection(recipe) {
  const quad = recipe.quad;
  const epsilon = 1e-5;
  return Math.abs(quad[0].x - quad[3].x) > epsilon
    || Math.abs(quad[1].x - quad[2].x) > epsilon
    || Math.abs(quad[0].y - quad[1].y) > epsilon
    || Math.abs(quad[3].y - quad[2].y) > epsilon;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "WebGL shader compilation failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

const webGlRenderers = new WeakMap();

function createWebGlRenderer(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, `
    attribute vec2 a_position;
    attribute vec2 a_uv;
    varying vec2 v_uv;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_uv = a_uv;
    }
  `);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform sampler2D u_image;
    uniform mat3 u_map;
    varying vec2 v_uv;
    void main() {
      vec3 mapped = u_map * vec3(v_uv, 1.0);
      vec2 sourceUv = mapped.xy / mapped.z;
      if (sourceUv.x < 0.0 || sourceUv.x > 1.0 || sourceUv.y < 0.0 || sourceUv.y > 1.0) {
        gl_FragColor = vec4(0.0);
      } else {
        gl_FragColor = texture2D(u_image, sourceUv);
      }
    }
  `);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "WebGL program linking failed");
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, 1, 0, 0,
    -1, -1, 0, 1,
    1, 1, 1, 0,
    1, -1, 1, 1,
  ]), gl.STATIC_DRAW);
  gl.useProgram(program);
  const positionLocation = gl.getAttribLocation(program, "a_position");
  const uvLocation = gl.getAttribLocation(program, "a_uv");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(uvLocation);
  gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 16, 8);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // DOM image rows already line up with this shader's top-down UV coordinates.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);
  const mapLocation = gl.getUniformLocation(program, "u_map");
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return { gl, program, buffer, texture, mapLocation, sourceVersion: null };
}

function renderWithWebGl(source, matrix, canvas) {
  let renderer = webGlRenderers.get(canvas);
  if (!renderer) {
    renderer = createWebGlRenderer(canvas);
    if (!renderer) return false;
    webGlRenderers.set(canvas, renderer);
  }
  const { gl, program, buffer, texture, mapLocation } = renderer;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  const sourceVersion = source.currentSrc || source.src || source;
  if (renderer.sourceVersion !== sourceVersion) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    renderer.sourceVersion = sourceVersion;
  }
  gl.uniformMatrix3fv(mapLocation, false, new Float32Array([
    matrix[0], matrix[3], matrix[6],
    matrix[1], matrix[4], matrix[7],
    matrix[2], matrix[5], matrix[8],
  ]));
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return true;
}

function renderFallback(source, quad, canvas) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("当前浏览器无法创建图片校正画布");
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  const left = Math.min(...quad.map(({ x }) => x)) * sourceWidth;
  const top = Math.min(...quad.map(({ y }) => y)) * sourceHeight;
  const right = Math.max(...quad.map(({ x }) => x)) * sourceWidth;
  const bottom = Math.max(...quad.map(({ y }) => y)) * sourceHeight;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, left, top, right - left, bottom - top, 0, 0, canvas.width, canvas.height);
}

export function renderCorrectionToCanvas(source, recipe, canvas, outputSize) {
  const quad = recipe.quad;
  const matrix = solveUnitSquareToQuad(quad);
  if (!matrix) throw new Error("四个裁剪角点需要形成完整的卡片区域");
  canvas.width = Math.max(1, Math.round(outputSize.width));
  canvas.height = Math.max(1, Math.round(outputSize.height));
  try {
    if (renderWithWebGl(source, matrix, canvas)) return "webgl";
  } catch {
    // A crop-only fallback still lets the user continue on devices without reliable WebGL.
  }
  renderFallback(source, quad, canvas);
  return "crop-only";
}
