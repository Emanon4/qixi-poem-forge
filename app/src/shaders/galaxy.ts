import { composeFrag, FULL_KIT } from '@/gl/glsl'

/**
 * 第0幕「银河渡口」的天空 pass。
 *
 * 自上而下分九层，全程程序化生成、零贴图：
 *   1 天空竖向渐变（墨蓝 → 暮紫 → 地平线暖光）
 *   2 银河带（域扭曲 fbm，沿倾斜轴分布，带尘埃暗带）
 *   3 桃粉水彩云（对齐参考海报的粉色云雾）
 *   4 三层星野 + 亮星十字星芒
 *   5 漂移星尘
 *   6 月亮（圆盘 + 环形山 + 双段光晕）
 *   7 偶发流星
 *   8 鹊桥剪影（拱洞 + 桥面 + 栏杆立柱）
 *   9 水面（镜像天空 + 涟漪折射 + 桥倒影 + 月光碎金）
 * 最后统一做 ACES 色调映射 + 暗角 + 抖动去色带。
 *
 * 【坐标约定】形状一律画在 byWidth 等比空间（x∈[-0.5,0.5] 恒为半屏宽），
 * 保证圆是圆、旋转不变形；而所有竖向锚点用 yAt() 从「屏高分数」换算，
 * 保证 375×812 和 430×932 上构图落在同样的相对位置。
 */
export const GALAXY_FRAG = composeFrag(
  /* glsl */ `
uniform float uIntro;        // 入场进度 0→1
uniform float uHorizonFrac;  // 水平线所在的屏高分数（0=底 1=顶）
uniform vec3  uMoon;         // x,y = 月心屏宽/屏高分数, z = 半径(byWidth 单位)
uniform float uEnergy;       // 手指搅动星河的强度 0→1
uniform vec3  uTint;         // 换皮目标色
uniform float uTintAmount;   // 换皮强度 0→1

/** 屏高分数 → byWidth 空间的 y。构图数值全部经由它，才不会被机型比例带跑。 */
float yAt(float frac) {
  return (frac - 0.5) * (uRes.y / uRes.x);
}

// ── 天空竖向渐变 ────────────────────────────────────────────
/* 比 tokens 里的夜色基底整体提亮约两档、并加饱和：
   对齐《赠卿星河引》海报开窗内那种「深紫蓝 + 明亮月光」的明度关系，
   而不是一片压死的墨黑——那样在手机上只会看成一块脏屏。 */
vec3 skyGradient(float t) {
  vec3 zenith  = srgb2lin(vec3(0.043, 0.031, 0.141)); // 天顶 深紫蓝
  vec3 high    = srgb2lin(vec3(0.102, 0.071, 0.251));
  vec3 mid     = srgb2lin(vec3(0.180, 0.122, 0.361)); // 暮紫
  vec3 low     = srgb2lin(vec3(0.290, 0.184, 0.471));
  vec3 horizon = srgb2lin(vec3(0.431, 0.247, 0.420)); // 紫粉交界
  vec3 warm    = srgb2lin(vec3(0.612, 0.333, 0.439)); // 地平线暖光 桃粉

  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(warm, horizon, smoothstep(0.00, 0.10, t));
  c = mix(c, low,    smoothstep(0.06, 0.24, t));
  c = mix(c, mid,    smoothstep(0.20, 0.46, t));
  c = mix(c, high,   smoothstep(0.42, 0.72, t));
  c = mix(c, zenith, smoothstep(0.68, 1.00, t));
  return c;
}

// ── 银河带 ─────────────────────────────────────────────────
vec3 galaxyBand(vec2 p, int oct) {
  // 倾斜到与画面对角线大致平行，压在标题区背后而不是横穿画面中部
  vec2 q = rot(-0.62) * (p - vec2(0.02, yAt(0.82)));
  float band = exp(-pow(q.y / 0.16, 2.0)); // 沿带宽方向的高斯衰减

  float n  = warpedFbm(q * vec2(1.30, 2.60) + vec2(uTime * 0.014, 0.0), oct, 1.35);
  float n2 = warpedFbm(q * vec2(2.70, 5.10) - vec2(uTime * 0.021, 1.7), max(oct - 1, 2), 0.90);

  float density = smoothstep(0.30, 0.86, n) * 0.75 + smoothstep(0.44, 0.92, n2) * 0.45;
  // 尘埃暗带：真实银河靠遮挡才有层次，少了这层就只是一团亮雾
  float dust = smoothstep(0.62, 0.34, warpedFbm(q * vec2(1.9, 4.2) + 9.3, max(oct - 1, 2), 1.0));

  vec3 coolCore = srgb2lin(vec3(0.635, 0.514, 0.965));
  vec3 warmCore = srgb2lin(vec3(1.000, 0.871, 0.694));
  vec3 pinkEdge = srgb2lin(vec3(1.000, 0.663, 0.784));

  vec3 col = mix(coolCore, warmCore, smoothstep(0.35, 0.95, n));
  col = mix(col, pinkEdge, smoothstep(0.55, 1.0, n2) * 0.55);
  return col * band * density * (0.35 + 0.65 * dust) * 1.05;
}

// ── 桃粉水彩云 ──────────────────────────────────────────────
vec3 watercolorClouds(vec2 p, int oct) {
  float n = warpedFbm(vec2(p.x * 2.1 + uTime * 0.010, p.y * 2.9 - 0.35), max(oct - 1, 2), 1.15);
  float mask = smoothstep(0.50, 0.84, n);
  // 只出现在最上部，别糊住画面中段 —— 云太满会把整屏拍平
  float band = smoothstep(yAt(0.62), yAt(0.80), p.y) * smoothstep(yAt(1.04), yAt(0.90), p.y);
  vec3 tint = mix(
    srgb2lin(vec3(0.988, 0.796, 0.847)), // --peach-300
    srgb2lin(vec3(0.831, 0.714, 0.949)), // 淡紫
    smoothstep(0.3, 0.9, n)
  );
  return tint * mask * band * 0.22;
}

// ── 星野 ───────────────────────────────────────────────────
/** 单格一星：把星点约束在格心附近，就不必做 3×3 邻域采样。 */
float starLayer(vec2 p, float density, float sharp, float thresh, float seed) {
  vec2 gp = p * density;
  vec2 cell = floor(gp);
  vec2 f = fract(gp);
  vec2 h = hash22(cell + seed);
  float present = step(thresh, hash12(cell + seed * 7.31));
  float d = length(f - (vec2(0.2) + h * 0.6));
  float twinkle = 0.45 + 0.55 * sin(uTime * (0.7 + h.x * 2.6) + h.y * TAU);
  return present * exp(-d * d * sharp) * twinkle * (0.35 + 0.65 * h.y);
}

/** 少数亮星给十字星芒，画面才有「点」而不是一片糊。 */
float starGlints(vec2 p, float density, float seed) {
  vec2 gp = p * density;
  vec2 cell = floor(gp);
  vec2 f = fract(gp) - 0.5;
  vec2 h = hash22(cell + seed);
  float present = step(0.955, hash12(cell + seed * 3.77));
  vec2 q = f - (h - 0.5) * 0.55;
  float twinkle = 0.4 + 0.6 * sin(uTime * (1.1 + h.x * 1.8) + h.y * TAU);
  float core  = exp(-dot(q, q) * 900.0);
  float spike = exp(-abs(q.x) * 190.0) * exp(-abs(q.y) * 24.0)
              + exp(-abs(q.y) * 190.0) * exp(-abs(q.x) * 24.0);
  return present * (core * 1.6 + spike * 0.30) * twinkle;
}

float stardust(vec2 p) {
  vec2 drift = vec2(uTime * 0.0075, uTime * 0.0035);
  return starLayer(p + drift, 170.0, 2600.0, 0.88, 41.0) * 0.6
       + starLayer(p * 1.7 - drift * 1.6, 170.0, 2200.0, 0.91, 77.0) * 0.4;
}

// ── 月亮 ───────────────────────────────────────────────────
vec3 moonLayer(vec2 p, vec2 center, float r, int oct) {
  vec2 mp = p - center;
  float d = length(mp);
  float disc = smoothstep(r, r - 0.0035, d);

  // 环形山对比要拉开，否则一到高曝光就糊成一块纯白圆片
  float craters = fbm(mp * 34.0 + 4.2, max(oct - 2, 2));
  float shade = mix(0.62, 1.06, craters);
  float limb = 0.70 + 0.30 * smoothstep(r, r * 0.15, d); // 边缘压暗，读起来是球不是贴纸
  vec3 body = srgb2lin(vec3(1.0, 0.941, 0.788)) * shade * limb * 0.88;

  // 双段光晕：近处收得紧，远处铺得开。别给太满，否则整片天空被它抬平。
  float halo = exp(-d / (r * 0.80)) * 0.42 + exp(-d / (r * 3.2)) * 0.15;
  vec3 haloCol = srgb2lin(vec3(1.0, 0.882, 0.706)) * halo;

  return body * disc + haloCol * (1.0 - disc * 0.65);
}

// ── 流星 ───────────────────────────────────────────────────
float meteors(vec2 p) {
  float acc = 0.0;
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float period = 8.5 + fi * 5.4;
    float local = uTime + fi * 3.7;
    float phase = fract(local / period);
    float life = smoothstep(0.0, 0.04, phase) * smoothstep(0.20, 0.10, phase);
    if (life <= 0.001) continue;

    vec2 h = hash22(vec2(floor(local / period), fi * 13.0));
    vec2 start = vec2(mix(-0.42, 0.46, h.x), yAt(mix(0.74, 1.00, h.y)));
    vec2 dir = normalize(vec2(-0.78, -0.60));
    vec2 head = start + dir * (phase / 0.20) * 0.60;
    vec2 tail = head - dir * 0.15;

    vec2 seg = head - tail;
    float along = clamp(dot(p - tail, seg) / dot(seg, seg), 0.0, 1.0);
    float d = length(p - (tail + seg * along));
    acc += life * exp(-d * 460.0) * (0.20 + 0.80 * along);
  }
  return acc;
}

// ── 鹊桥 ───────────────────────────────────────────────────
/* 中式单孔石拱桥。关键是「实心桥身 + 挖出一个大拱洞」：
   只画一条细弧线的话，拱洞无处可挖，桥身和水中倒影会拼成一个 X 形，
   读起来像铁路高架而不是鹊桥。 */
/** 返回 vec2(桥身遮罩, 拱洞遮罩)。拱洞要单独拿出来，因为它不能直接透出天空 —— */
vec2 bridgeParts(vec2 p, float horizonY) {
  const float halfSpan = 0.42;
  if (abs(p.x) > halfSpan + 0.03) return vec2(0.0);

  float t = clamp(abs(p.x) / halfSpan, 0.0, 1.0);
  float deckY = horizonY + 0.115 * (1.0 - pow(t, 1.8)); // 起拱的桥面
  float inSpan = smoothstep(halfSpan, halfSpan - 0.008, abs(p.x));

  // 桥身：桥面之下、水面之上的实心块（连带桥墩）
  float slab = smoothstep(0.0025, 0.0, p.y - deckY)
             * smoothstep(-0.002, 0.004, p.y - horizonY)
             * inSpan;
  // 中央拱洞。半径必须小于桥面起拱高度（0.115），
  // 否则拱会穿透桥面，读成一扇发光的门而不是桥孔。
  float hole = (1.0 - smoothstep(-0.003, 0.005, length(p - vec2(0.0, horizonY)) - 0.085)) * slab;
  float body = slab - hole;

  // 桥面板：比桥身略微出挑，桥的轮廓才有交代
  float deck = smoothstep(0.0025, 0.0, abs(p.y - (deckY - 0.008)) - 0.009)
             * smoothstep(halfSpan + 0.022, halfSpan + 0.012, abs(p.x));

  // 栏杆：纤细立柱 + 上横杆
  float phase = fract(p.x * 30.0 + 0.5);
  float post = smoothstep(0.11, 0.06, abs(phase - 0.5))
             * step(p.y, deckY + 0.030)
             * step(deckY, p.y)
             * inSpan;
  float rail = smoothstep(0.0032, 0.0014, abs(p.y - (deckY + 0.031)))
             * smoothstep(halfSpan + 0.016, halfSpan + 0.006, abs(p.x));

  return vec2(clamp(body + deck + post * 0.88 + rail * 0.92, 0.0, 1.0), hole);
}

/** 把桥（含拱洞内的远雾）合成到底图上。天空和水面倒影共用。 */
vec3 compositeBridge(vec3 col, vec2 p, float horizonY) {
  vec2 parts = bridgeParts(p, horizonY);
  // 拱洞里看到的是远处的水汽，不是最亮的地平线暖光 ——
  // 直接透出天空会在桥下憋出一个「第二个月亮」。
  col = mix(col, srgb2lin(vec3(0.157, 0.106, 0.220)), parts.y * 0.78);
  return mix(col, srgb2lin(vec3(0.086, 0.063, 0.157)), parts.x * 0.94);
}

// ── 天空总成（水面反射复用它，所以抽成函数）────────────────
vec3 skyStack(vec2 p, float horizonY, vec2 moonC, int oct, float starGate, float moonGate) {
  float topY = yAt(1.0);
  vec3 col = skyGradient((p.y - horizonY) / max(topY - horizonY, 1e-3));

  col += galaxyBand(p, oct);
  col += watercolorClouds(p, oct);

  float stars = starLayer(p, 34.0, 1500.0, 0.55, 3.0) * 0.85
              + starLayer(p, 78.0, 2100.0, 0.72, 19.0) * 0.55
              + stardust(p) * 0.45;
  float glints = starGlints(p, 21.0, 5.0);

  // 靠近地平线的星星被大气吃掉
  float extinction = smoothstep(horizonY + 0.01, yAt(uHorizonFrac + 0.14), p.y);
  col += srgb2lin(vec3(1.0, 0.965, 0.905)) * (stars * 1.15 + glints * 1.9) * extinction * starGate;
  col += srgb2lin(vec3(1.0, 0.94, 0.86)) * meteors(p) * 2.2 * starGate;
  col += moonLayer(p, moonC, uMoon.z, oct) * moonGate;
  return col;
}

// ── 水面 ───────────────────────────────────────────────────
vec3 waterLayer(vec2 p, float horizonY, vec2 moonC, int oct, float starGate, float moonGate) {
  float depth = horizonY - p.y; // >0，越大越靠近观者

  // 涟漪折射：越近的水面扰动越大、频率越低
  float ripple = (gnoise(vec2(p.x * 19.0, depth * 74.0 - uTime * 1.05)) - 0.5) * 0.75
               + (gnoise(vec2(p.x * 41.0 + 3.1, depth * 138.0 - uTime * 1.7)) - 0.5) * 0.25;
  float amp = 0.004 + depth * 0.075;

  // 镜像采样点（落在水面之上）
  vec2 rp = vec2(p.x + ripple * amp, horizonY + depth * 0.92 + ripple * amp * 0.35);

  vec3 refl = skyStack(rp, horizonY, moonC, max(oct - 1, 3), starGate, moonGate);
  // rp 已是镜像点，桥的倒影就是该点处的桥。再整体压暗一档，
  // 免得倒影和桥身一样重，两者拼成一个对称的怪形状。
  refl = mix(refl, compositeBridge(refl, rp, horizonY) * 0.55, 0.85);

  // 水本身：更暗、更蓝、对比更低
  vec3 water = mix(refl * 0.66, srgb2lin(vec3(0.106, 0.086, 0.235)), 0.30);

  // 月光碎金：月亮正下方一条竖带里的破碎高光。
  // 用平滑噪声取高次幂造稀疏亮点 —— floor+hash 会留下肉眼可见的方格。
  // x 频率远低于 y 频率，高光才横向拉长，像真的水面反光。
  float lane = exp(-pow((p.x - moonC.x) / 0.075, 2.0));
  float g1 = vnoise(vec2(p.x * 62.0, p.y * 210.0 - uTime * 1.6));
  float g2 = vnoise(vec2(p.x * 130.0 + 4.3, p.y * 320.0 - uTime * 2.7));
  float glitter = lane * (pow(g1, 7.0) * 2.0 + pow(g2, 9.0) * 1.3)
                * smoothstep(0.0, 0.05, depth) * smoothstep(0.60, 0.10, depth);
  water += srgb2lin(vec3(1.0, 0.93, 0.78)) * glitter * moonGate;

  // 近岸（画面最下缘）压得更狠：既把视线推回中央，也给底部说明文字留出可读的底
  return water * (1.0 - smoothstep(0.08, 0.40, depth) * 0.74);
}

// ══════════════════════════════════════════════════════════
void main() {
  vec2 p = byWidth(vUV);
  int oct = 3 + int(uQuality * 3.0);

  float horizonY = yAt(uHorizonFrac);
  vec2 moonC = vec2(uMoon.x - 0.5, yAt(uMoon.y));

  // 入场分三段起：先月亮，再天空曝光，最后星野铺满
  float intro    = smoothstep(0.0, 1.0, uIntro);
  float moonGate = smoothstep(0.08, 0.70, uIntro);
  float starGate = smoothstep(0.18, 0.95, uIntro);

  vec3 col;
  if (p.y > horizonY) {
    col = skyStack(p, horizonY, moonC, oct, starGate, moonGate);
    col = compositeBridge(col, p, horizonY);
  } else {
    col = waterLayer(p, horizonY, moonC, oct, starGate, moonGate);
  }

  // 水平线上一道薄雾，把天与水焊在一起
  col += srgb2lin(vec3(0.85, 0.66, 0.66)) * exp(-pow((p.y - horizonY) / 0.030, 2.0)) * 0.10;

  // 手指划过时整体微微提亮，交互有「触到星河」的实感
  col *= 1.0 + uEnergy * 0.14;

  /* 换皮：按亮度重新着色。保留整幅画的明暗结构，只换色相 ——
     所以切文风时星河、月亮、水面会「整体变成另一个色系」，
     而不是盖一层半透明色片。这是第2幕最炸的那一击的底层手段。 */
  if (uTintAmount > 0.001) {
    vec3 t = srgb2lin(uTint);
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    vec3 tinted = gradientMap(
      pow(clamp(lum, 0.0, 1.0), 0.85),
      t * 0.08,
      t * 0.60,
      mix(t, vec3(1.0), 0.55)
    );
    col = mix(col, tinted, uTintAmount);
  }

  // 暗角
  vec2 v = (vUV - 0.5) * vec2(1.06, 1.0);
  col *= 1.0 - 0.44 * pow(clamp(length(v) * 1.42, 0.0, 1.0), 2.1);

  col = aces(col * mix(0.15, 0.86, intro));
  col = lin2srgb(col);
  col = dither(col, gl_FragCoord.xy);
  fragColor = vec4(col, 1.0);
}
`,
  FULL_KIT,
)

/**
 * 构图锚点。改这里就能整体调构图，shader 里不再散落魔法数。
 *
 * 竖屏文字占位是硬约束：标题组吃掉 y 0.70–0.92，海棠窗吃掉 y 0.24–0.51，
 * 底部说明在 y 0.03 附近。所以——
 *   · 水平线压到 0.14，鹊桥落在海棠窗之下，不和上传口打架；
 *   · 月亮放到海棠窗正后方，窗口本身就成了「月下开的一扇窗」，
 *     既是构图里唯一的亮核，也正好呼应古风文风的「月下诗笺」。
 */
export const GALAXY_COMPOSITION = {
  /** 水平线所在的屏高分数 */
  horizonFrac: 0.125,
  /** 月心（屏宽分数, 屏高分数）与半径（byWidth 单位，0.5 = 半屏宽） */
  moon: [0.74, 0.6, 0.058] as const,
}
