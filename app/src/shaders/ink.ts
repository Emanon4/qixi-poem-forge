import { composeFrag, FULL_KIT } from '@/gl/glsl'

/**
 * 第3幕的墨迹晕开 —— 诗笺从一点吸墨般铺开。
 *
 * 关键是别做成「一个放大的模糊圆」：
 *   · 轮廓在角度域上用 fbm 扰动，边界才像宣纸吸墨而不是几何圆；
 *   · 边缘留一圈更深的「墨圈」，真实的水墨在边界处颜料会堆积；
 *   · 纸面叠一层纤维噪声，避免大面积平色；
 *   · 主体外围甩几点飞溅。
 */
export const INK_FRAG = composeFrag(
  /* glsl */ `
uniform float uSpread;   // 扩散进度 0→1
uniform vec2  uCenter;   // byWidth 空间的落墨点
uniform float uRadius;   // 满开时的半径
uniform vec3  uPaper;    // 纸色（跟文风皮肤走）
uniform float uFade;

void main() {
  vec2 p = byWidth(vUV) - uCenter;
  float r = length(p);
  float ang = atan(p.y, p.x);

  float s = smoothstep(0.0, 1.0, uSpread);
  if (s <= 0.001) discard;

  // 轮廓：在角度域上取 fbm，得到不规则但连续的边界
  vec2 ring = vec2(cos(ang), sin(ang));
  float wobble = fbm(ring * 2.4 + 11.3, 4) * 0.34 + fbm(ring * 6.1 - 4.7, 3) * 0.14;
  float edge = uRadius * s * (0.70 + wobble);

  // 主体遮罩，边界随扩散推进而变软
  float feather = 0.012 + 0.05 * (1.0 - s);
  float mask = smoothstep(edge, edge - feather, r);
  if (mask <= 0.002) discard;

  // 纸面纤维：大面积平色一定显廉价
  float fiber = fbm(p * 30.0 + 3.1, 4);
  // 乘 0.62：纸是被照亮的，不是自己发光的。给满会被辉光烧成一团白饼。
  // 0.62 太狠，纸会读成一块脏灰。0.86 既压得住辉光，又还是纸。
  vec3 paper = srgb2lin(uPaper) * (0.90 + 0.16 * fiber) * 0.86;

  // 边缘墨圈：真实水墨在边界处颜料堆积，颜色更深
  float rim = smoothstep(edge - feather * 3.2, edge - feather, r) * (1.0 - mask * 0.15);
  paper = mix(paper, paper * 0.72, rim * 0.55);

  /* 飞溅：外围几点独立小圆，扩散到后段才出现。
     整段用 s > 0.55 包住 —— 扩散初期 sz 会趋近 0，
     而 smoothstep(0, 0, x) 在 GLSL 里是未定义行为，
     实测会返回 1.0 把整屏点亮（表现为一片竖条纹）。 */
  if (s > 0.55) {
    float splat = 0.0;
    float grow = smoothstep(0.55, 0.95, s);
    for (int i = 0; i < 5; i++) {
      vec2 h = hash22(vec2(float(i) * 7.3, 2.1));
      float sa = h.x * TAU;
      float sr = uRadius * (1.05 + h.y * 0.35);
      vec2 sp = uCenter + vec2(cos(sa), sin(sa)) * sr * s;
      float sd = length(byWidth(vUV) - sp);
      // 再给一个下限，杜绝 edge0 == edge1
      float sz = max(uRadius * (0.018 + h.y * 0.030) * grow, 1e-4);
      splat = max(splat, smoothstep(sz, sz * 0.4, sd));
    }
    mask = max(mask, splat * 0.9);
  }

  float a = mask * uFade;
  // 线性 HDR，预乘 alpha
  fragColor = vec4(paper * a, a);
}
`,
  FULL_KIT,
)
