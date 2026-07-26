/**
 * GLSL 片段库 —— 用 TS 模板字符串组装，不引第三方 glsl 插件。
 * 好处：composePass() 里可以按质量档位做条件拼接（低端机直接少编译几个八度），
 *       而且 shader 里的 uniform 名字和 TS 侧是同一份真相。
 */

/** 所有 quad pass 共用的顶点着色器：全屏两个三角形。 */
export const QUAD_VERT = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vUV;
void main() {
  vUV = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

/** 每个 pass 都会被注入的标准 uniform 与坐标工具。 */
export const CHUNK_COMMON = /* glsl */ `
precision highp float;

uniform vec2  uRes;      // 绘制缓冲尺寸（物理像素）
uniform float uTime;     // 累计秒
uniform float uDelta;    // 帧间隔秒
uniform float uQuality;  // 0.55 低 / 0.75 中 / 1.0 高
uniform vec3  uPointer;  // xy = 归一化触点(左下原点)，z = 是否按下

const float PI  = 3.14159265359;
const float TAU = 6.28318530718;

/** 以高度归一化的居中坐标。横屏构图用这个。 */
vec2 centered(vec2 uv) {
  return (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
}

/**
 * 以宽度归一化的居中坐标 —— 竖屏 H5 的主工作空间。
 * x ∈ [-0.5, 0.5] 恒等于「半个屏宽」，y 按真实比例向上下延伸。
 * 这样同一份构图数值在 375×812 和 430×932 上都落在同样的相对位置。
 */
vec2 byWidth(vec2 uv) {
  return (uv - 0.5) * vec2(1.0, uRes.y / uRes.x);
}

float aspect() { return uRes.x / uRes.y; }

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
`

/** 哈希族：无贴图伪随机，来自 Dave Hoskins《Hash without Sine》。 */
export const CHUNK_HASH = /* glsl */ `
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 hash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
`

/** 噪声族：值噪声、梯度噪声、fbm、域扭曲 fbm（星云的关键）。 */
export const CHUNK_NOISE = /* glsl */ `
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i),               hash12(i + vec2(1, 0)), u.x),
    mix(hash12(i + vec2(0, 1)),  hash12(i + vec2(1, 1)), u.x),
    u.y
  );
}

/** 梯度（Perlin 式）噪声：比值噪声少块状感，星云用它。 */
float gnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i)              * 2.0 - 1.0, f);
  float b = dot(hash22(i + vec2(1, 0)) * 2.0 - 1.0, f - vec2(1, 0));
  float c = dot(hash22(i + vec2(0, 1)) * 2.0 - 1.0, f - vec2(0, 1));
  float d = dot(hash22(i + vec2(1, 1)) * 2.0 - 1.0, f - vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 0.5 + 0.5;
}

/** 八度数走 uniform，低端机自动少算几层。 */
float fbm(vec2 p, int octaves) {
  float sum = 0.0, amp = 0.5;
  mat2 m = mat2(0.8, 0.6, -0.6, 0.8); // 每层旋转，去掉轴向条纹
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * gnoise(p);
    p = m * p * 2.03;
    amp *= 0.5;
  }
  return sum;
}

/** 域扭曲：fbm 的输入再被一层 fbm 推偏，出来的形状像真星云而不像噪点。 */
float warpedFbm(vec2 p, int octaves, float warp) {
  vec2 q = vec2(fbm(p + vec2(0.0, 1.7), octaves), fbm(p + vec2(5.2, 1.3), octaves));
  return fbm(p + warp * q, octaves);
}
`

/** 色彩与成像：色彩空间、ACES 近似、抖动去色带。 */
export const CHUNK_COLOR = /* glsl */ `
vec3 srgb2lin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 lin2srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

/** ACES 近似（Narkowicz）：月亮和光晕过曝时收得住，出胶片味而不是死白。 */
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

/**
 * 交错梯度噪声（Jorge Jimenez）。夜空大面积渐变在 8bit 屏上必出色带，
 * 加约 1/255 的抖动就能彻底消掉——这一行是「看起来贵」和「看起来廉价」的分界。
 */
float ign(vec2 fragCoord) {
  return fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
}
vec3 dither(vec3 c, vec2 fragCoord) {
  return c + (ign(fragCoord) - 0.5) / 255.0;
}

/** 渐变映射：按亮度把画面重新着色，是「切文风整页换皮」的底层手段。 */
vec3 gradientMap(float t, vec3 shadow, vec3 mid, vec3 light) {
  t = clamp(t, 0.0, 1.0);
  return t < 0.5
    ? mix(shadow, mid,   smoothstep(0.0, 0.5, t))
    : mix(mid,    light, smoothstep(0.5, 1.0, t));
}
`

/** 有向距离场：桥、月、诗行容器都靠它画。 */
export const CHUNK_SDF = /* glsl */ `
float sdCircle(vec2 p, float r) { return length(p) - r; }

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

/** 圆环的一段弧，鹊桥的桥拱用它。 */
float sdArc(vec2 p, float radius, float thickness) {
  return abs(length(p) - radius) - thickness;
}

/** 海棠形（四瓣开窗）—— 从参考海报里提取的品牌形状，贯穿上传口/卡牌/海报开窗。 */
float sdQuatrefoil(vec2 p, float r) {
  float a = atan(p.y, p.x);
  float lobed = r * (0.86 + 0.14 * cos(4.0 * a));
  return length(p) - lobed;
}
`

/** 按需组装一个 fragment shader。 */
export function composeFrag(body: string, chunks: string[] = []): string {
  return [
    '#version 300 es',
    CHUNK_COMMON,
    ...chunks,
    'in vec2 vUV;',
    'out vec4 fragColor;',
    body,
  ].join('\n')
}

/** 绝大多数画面 pass 都要的那一套。 */
export const FULL_KIT = [CHUNK_HASH, CHUNK_NOISE, CHUNK_COLOR, CHUNK_SDF]
