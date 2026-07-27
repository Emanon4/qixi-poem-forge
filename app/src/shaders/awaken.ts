import { composeFrag, FULL_KIT } from '@/gl/glsl'

/**
 * 第1幕「商品被 AI 唤醒」。
 *
 * 三段连续演出，全在一个 pass 里由三个进度 uniform 驱动：
 *   uScan     0→1  月光扫描线自上而下扫过截图，扫过之处浮出青色分析网格并轻微去饱和
 *   uDissolve 0→1  主体框之外的像素按噪声阈值烧成金色余烬后消失
 *   uLift     0→1  留下的主体上浮、放大、描一道金边
 *
 * 主体遮罩用圆角方 SDF 而不是矩形——矩形读起来是「裁了张照片」，
 * 柔边圆角才读得出「从截图里抠出来的东西」。
 */
export const AWAKEN_FRAG = composeFrag(
  /* glsl */ `
uniform sampler2D uShot;
uniform vec4  uRect;      // 截图在屏幕 uv 上的绘制区域 (x,y,w,h)，y 向上
uniform vec4  uSubject;   // 主体框在截图 uv 上的位置 (x,y,w,h)，y 向上
uniform float uScan;
uniform float uDissolve;
uniform float uLift;
uniform float uFade;      // 整幕淡出，交给下一幕时用

/* 截图整体的曝光系数。
   购物截图大面积是纯白 #ffffff，线性空间就是 1.0，远高于辉光阈值 ——
   原样进场景会被当成光源，整张糊成一团白饼（真机上就是这么翻的车）。
   它应该读作「夜色里被照亮的一张纸」，不是灯。 */
const float SHEET_GAIN = 0.40;

/** 主体遮罩：圆角方 SDF，柔边。inset 往内收，用来取描边环。 */
float subjectMask(vec2 q, vec4 box, float inset) {
  vec2 c = box.xy + box.zw * 0.5;
  vec2 r = max(box.zw * 0.5, vec2(1e-3));
  vec2 p = (q - c) / r;
  float d = length(max(abs(p) - 0.34, 0.0)) - (0.64 - inset);
  return smoothstep(0.10, -0.10, d);
}

void main() {
  // 屏幕空间的矩形内坐标（y 向上），再换到图片空间（y 向下）。
  // 之后所有主体运算都在图片空间进行，和 CPU 算出来的框同一套坐标。
  vec2 q = (vUV - uRect.xy) / uRect.zw;
  vec2 img = vec2(q.x, 1.0 - q.y);

  // ── 主体上浮：反向变换采样，让主体看起来在升起放大 ──
  vec2 subCenter = uSubject.xy + uSubject.zw * 0.5;
  float lift = smoothstep(0.0, 1.0, uLift);
  float scale = mix(1.0, 1.42, lift);
  vec2 liftOffset = vec2(0.0, -mix(0.0, 0.13, lift)); // 图片空间里「往上」是负 y
  vec2 imgSub = (img - subCenter - liftOffset) / scale + subCenter;

  float mask = subjectMask(imgSub, uSubject, 0.0);

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  // ── 背景层：截图的非主体部分，会被扫描、然后被溶解掉 ──
  if (img.x > 0.0 && img.x < 1.0 && img.y > 0.0 && img.y < 1.0) {
    // 贴图采样出来是 sRGB，必须转线性才能和后面的加光、ACES 对齐
    vec3 shot = srgb2lin(texture(uShot, img).rgb) * SHEET_GAIN;

    // 扫描线自上而下：img.y 从 0(顶) 到 1(底)，扫过的区域在线之上
    float scanned = smoothstep(uScan + 0.03, uScan - 0.03, img.y);

    // 扫过之处：去饱和 + 青色分析网格，读起来像被机器读过一遍
    float lum = dot(shot, vec3(0.299, 0.587, 0.114));
    vec3 analyzed = mix(shot, vec3(lum), 0.42 * scanned);
    float grid = step(0.955, fract(img.x * 42.0)) + step(0.955, fract(img.y * 42.0));
    analyzed += vec3(0.32, 0.78, 0.98) * grid * 0.13 * scanned;

    // 溶解：噪声阈值决定每个像素何时消失，主体框内不参与
    float n = fbm(img * 6.5 + 2.3, 4);
    float outside = 1.0 - subjectMask(img, uSubject, 0.0);
    float burn = smoothstep(n - 0.16, n + 0.03, uDissolve) * outside;
    // 消失前先烧成一道金边，才有「余烬」而不是「橡皮擦」
    float ember = smoothstep(n - 0.07, n, uDissolve) * (1.0 - smoothstep(n, n + 0.12, uDissolve));
    analyzed += srgb2lin(vec3(1.0, 0.70, 0.28)) * ember * 0.85 * outside;

    /* 主体之外随着提取推进而去饱和 + 压暗。
       这样即使主体框判偏了，读起来也只是「聚焦到了别处」，
       而不是「一大块高亮 = 坏了」。失败姿态要体面。 */
    float defocus = max(uDissolve, lift) * outside;
    analyzed = mix(analyzed, vec3(lum * SHEET_GAIN) * 0.55, defocus * 0.75);

    col = analyzed;
    alpha = (1.0 - burn) * (1.0 - lift * 0.85); // 背景整体也随上浮淡出
  }

  // ── 主体层：叠在背景之上，带金色描边 ──
  if (imgSub.x > 0.0 && imgSub.x < 1.0 && imgSub.y > 0.0 && imgSub.y < 1.0 && mask > 0.001) {
    vec3 subject = srgb2lin(texture(uShot, imgSub).rgb) * SHEET_GAIN;
    // 描边：内外两条遮罩取差，得到一圈沿主体轮廓的环
    float rim = mask - subjectMask(imgSub, uSubject, 0.09);
    subject += srgb2lin(vec3(1.0, 0.84, 0.52)) * clamp(rim, 0.0, 1.0) * 1.1 * lift;
    // 主体略微提亮，从截图里「被点亮」。系数不能大 —— 白底商品图一提就过曝。
    subject *= 1.0 + 0.28 * lift;

    col = mix(col, subject, mask);
    alpha = max(alpha, mask);
  }

  // ── 扫描线本体：亮线 + 上下辉光 ──
  float onSheet = step(0.0, img.x) * step(img.x, 1.0) * step(0.0, img.y) * step(img.y, 1.0);
  float lineD = abs(img.y - uScan);
  // 注意：active 是 GLSL ES 保留字，不能用作变量名
  float sweeping = smoothstep(0.0, 0.02, uScan) * smoothstep(1.0, 0.96, uScan);
  float line = (exp(-lineD * 320.0) * 1.0 + exp(-lineD * 42.0) * 0.28) * onSheet * sweeping;
  col += srgb2lin(vec3(0.72, 0.95, 1.0)) * line * 1.0;
  alpha = max(alpha, line * 0.9);

  if (alpha < 0.004) discard;

  // 线性 HDR + 预乘 alpha；色调映射交给 PostFX
  fragColor = vec4(col * alpha, alpha) * uFade;
}
`,
  FULL_KIT,
)
