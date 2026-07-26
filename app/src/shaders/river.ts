import { composeFrag, FULL_KIT } from '@/gl/glsl'

/**
 * 《捞星记》的星河 —— 一条横贯画面的发光暗流。
 *
 * 不是「一条亮带」那么简单，要读得出「在流动」：
 *   · 沿流向拉长的噪声，制造水纹的方向性；
 *   · 两层不同速度的流，产生剪切感（真实水流的关键）；
 *   · 表面漂浮的碎光点随流移动；
 *   · 手指划过的位置泛起涟漪 —— 捞的手感一半来自这里。
 */
export const RIVER_FRAG = composeFrag(
  /* glsl */ `
uniform float uRise;      // 星河升起进度 0→1
uniform float uBandY;     // 河心所在的屏高分数
uniform float uEnergy;    // 手指搅动强度
uniform vec2  uRipple;    // 最近一次涟漪中心（byWidth）
uniform float uRippleAge; // 涟漪年龄（秒），> 1.2 视为结束

float yAt(float frac) { return (frac - 0.5) * (uRes.y / uRes.x); }

void main() {
  vec2 p = byWidth(vUV);
  float bandY = yAt(uBandY);
  float dy = p.y - bandY;

  // 河面宽度随升起进度展开
  float halfWidth = mix(0.02, 0.24, smoothstep(0.0, 1.0, uRise));
  float band = exp(-pow(dy / halfWidth, 2.0));
  if (band < 0.004) discard;

  // 两层不同速度的流 —— 单层噪声只会像一块动的雾，双层才有剪切的水感
  float t = uTime;
  vec2 q1 = vec2(p.x * 1.5 - t * 0.085, dy * 6.0);
  vec2 q2 = vec2(p.x * 2.9 + t * 0.045, dy * 11.0 + 4.3);
  float flow1 = warpedFbm(q1, 5, 1.1);
  float flow2 = warpedFbm(q2, 4, 0.7);
  float current = flow1 * 0.65 + flow2 * 0.35;

  // 主体颜色：河心偏月白，边缘转紫，靠外散成粉
  vec3 core = srgb2lin(vec3(0.90, 0.93, 1.00));
  vec3 mid  = srgb2lin(vec3(0.55, 0.50, 0.92));
  vec3 edge = srgb2lin(vec3(0.85, 0.55, 0.72));
  float depth = smoothstep(0.15, 0.85, current);
  vec3 col = mix(mid, core, depth);
  col = mix(edge, col, smoothstep(0.0, 0.55, band));

  // 亮度：河心亮，越靠边越暗，再叠一层沿流向的明暗条纹
  float streak = 0.35 + 0.65 * sin(p.x * 9.0 - t * 0.6 + current * 5.0);
  float lum = band * (0.16 + 0.62 * depth) * streak;

  // 漂浮碎光：跟着流走的高光点
  vec2 gp = vec2(p.x * 46.0 - t * 1.1, dy * 90.0);
  vec2 cell = floor(gp);
  vec2 f = fract(gp) - 0.5;
  vec2 h = hash22(cell);
  float spark = step(0.86, hash12(cell + 3.7))
              * exp(-dot(f - (h - 0.5) * 0.6, f - (h - 0.5) * 0.6) * 26.0)
              * (0.5 + 0.5 * sin(t * 3.0 + h.x * 6.28));
  col += srgb2lin(vec3(1.0, 0.95, 0.85)) * spark * band * 2.2;

  // 涟漪：捞字时从触点扩散出去的一圈
  if (uRippleAge < 1.2) {
    float rr = length(p - uRipple);
    float age = uRippleAge / 1.2;
    float ring = exp(-pow((rr - age * 0.34) / 0.022, 2.0)) * (1.0 - age);
    col += srgb2lin(vec3(1.0, 0.92, 0.78)) * ring * band * 3.0;
  }

  // 手指划过整体提亮
  lum *= 1.0 + uEnergy * 0.5;

  float alpha = clamp(lum * 0.85, 0.0, 1.0) * smoothstep(0.0, 0.25, uRise);
  // 线性 HDR + 预乘 alpha。
  // 注意 col 已经按 lum 调过一次亮度，这里只再乘一次 alpha 做预乘 ——
  // 之前多乘了一个 lum*1.5，河面直接糊成一大团白云，把字全压住了。
  fragColor = vec4(col * alpha, alpha);
}
`,
  FULL_KIT,
)
