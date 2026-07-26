import { Program } from './Program'
import { RenderTarget } from './RenderTarget'
import { CHUNK_COLOR, QUAD_VERT } from './glsl'
import type { Renderer } from './Renderer'

const HEAD = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uTexel;
`

/** 亮部提取。带 knee 软过渡，硬阈值会在光晕边缘留下一圈台阶。 */
const BRIGHT_FRAG = `${HEAD}
uniform float uThreshold;
uniform float uKnee;

void main() {
  vec3 c = texture(uTex, vUV).rgb;
  float lum = max(c.r, max(c.g, c.b));
  // soft knee：阈值附近平滑过渡，而不是一刀切
  float soft = clamp(lum - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  float contrib = max(soft, lum - uThreshold) / max(lum, 1e-5);
  fragColor = vec4(c * contrib, 1.0);
}
`

/** 13 抽样降采样（Jimenez / COD 的那套），比朴素双线性稳，不会闪。 */
const DOWN_FRAG = `${HEAD}
void main() {
  vec2 t = uTexel;
  vec3 a = texture(uTex, vUV + vec2(-2.0, 2.0) * t).rgb;
  vec3 b = texture(uTex, vUV + vec2( 0.0, 2.0) * t).rgb;
  vec3 c = texture(uTex, vUV + vec2( 2.0, 2.0) * t).rgb;
  vec3 d = texture(uTex, vUV + vec2(-2.0, 0.0) * t).rgb;
  vec3 e = texture(uTex, vUV).rgb;
  vec3 f = texture(uTex, vUV + vec2( 2.0, 0.0) * t).rgb;
  vec3 g = texture(uTex, vUV + vec2(-2.0,-2.0) * t).rgb;
  vec3 h = texture(uTex, vUV + vec2( 0.0,-2.0) * t).rgb;
  vec3 i = texture(uTex, vUV + vec2( 2.0,-2.0) * t).rgb;
  vec3 j = texture(uTex, vUV + vec2(-1.0, 1.0) * t).rgb;
  vec3 k = texture(uTex, vUV + vec2( 1.0, 1.0) * t).rgb;
  vec3 l = texture(uTex, vUV + vec2(-1.0,-1.0) * t).rgb;
  vec3 m = texture(uTex, vUV + vec2( 1.0,-1.0) * t).rgb;
  vec3 sum = e * 0.125;
  sum += (a + c + g + i) * 0.03125;
  sum += (b + d + f + h) * 0.0625;
  sum += (j + k + l + m) * 0.125;
  fragColor = vec4(sum, 1.0);
}
`

/** 可分离高斯，9 抽样，权重走线性采样的双抽样技巧。 */
const BLUR_FRAG = `${HEAD}
uniform vec2 uDirection;

void main() {
  // 线性采样偏移：用 5 次采样拿到 9 抽样的效果
  const float o1 = 1.3846153846;
  const float o2 = 3.2307692308;
  const float w0 = 0.2270270270;
  const float w1 = 0.3162162162;
  const float w2 = 0.0702702703;

  vec2 d = uDirection * uTexel;
  vec3 sum = texture(uTex, vUV).rgb * w0;
  sum += texture(uTex, vUV + d * o1).rgb * w1;
  sum += texture(uTex, vUV - d * o1).rgb * w1;
  sum += texture(uTex, vUV + d * o2).rgb * w2;
  sum += texture(uTex, vUV - d * o2).rgb * w2;
  fragColor = vec4(sum, 1.0);
}
`

/** 合成：场景 + 两级辉光 → 曝光 → ACES → sRGB → 抖动。整条管线只在这里落地成 8bit。 */
const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uTex;      // 场景 HDR
uniform sampler2D uBloomA;   // 1/2 级
uniform sampler2D uBloomB;   // 1/8 级
uniform float uIntensity;
uniform float uExposure;
uniform vec2  uRes;
uniform float uVignette;
uniform vec3  uFlash;        // 过场白闪（线性叠加）

${CHUNK_COLOR}

void main() {
  vec3 scene = texture(uTex, vUV).rgb;
  vec3 bloom = texture(uBloomA, vUV).rgb * 0.62 + texture(uBloomB, vUV).rgb * 1.05;
  vec3 col = scene + bloom * uIntensity + uFlash;

  // 暗角放在色调映射之前，才是「少收了点光」而不是「盖了层黑」
  vec2 v = (vUV - 0.5) * vec2(1.06, 1.0);
  col *= 1.0 - uVignette * pow(clamp(length(v) * 1.42, 0.0, 1.0), 2.1);

  col = aces(col * uExposure);
  col = lin2srgb(col);
  col = dither(col, gl_FragCoord.xy);
  fragColor = vec4(col, 1.0);
}
`

export interface PostFXOptions {
  threshold: number
  knee: number
  intensity: number
  exposure: number
  vignette: number
}

/**
 * HDR 辉光后处理链。
 *
 * 这是整个项目「看起来贵」的最大单点来源：月亮、星芒、金色余烬、印章冲击
 * 只有在超过 1.0 的亮度上真正外溢，画面才有光学质感。
 * 没有它，所有高光都止步于纯白色块。
 */
export class PostFX {
  readonly options: PostFXOptions = {
    threshold: 0.88,
    knee: 0.30,
    intensity: 0.72,
    exposure: 0.96,
    vignette: 0.46,
  }

  /** 过场白闪，各幕切换时拉一下再回落 */
  readonly flash = { value: 0 }

  readonly scene: RenderTarget
  private readonly half: RenderTarget
  private readonly halfPing: RenderTarget
  private readonly eighth: RenderTarget
  private readonly eighthPing: RenderTarget

  private readonly bright: Program
  private readonly down: Program
  private readonly blur: Program
  private readonly composite: Program

  constructor(
    private readonly renderer: Renderer,
    private readonly gl: WebGL2RenderingContext,
  ) {
    const hdr = RenderTarget.enableFloat(gl)
    if (!hdr) console.info('[postfx] 无浮点渲染目标扩展，降级为 RGBA8，辉光会偏弱')

    this.scene = new RenderTarget(gl, 2, 2, hdr)
    this.half = new RenderTarget(gl, 2, 2, hdr)
    this.halfPing = new RenderTarget(gl, 2, 2, hdr)
    this.eighth = new RenderTarget(gl, 2, 2, hdr)
    this.eighthPing = new RenderTarget(gl, 2, 2, hdr)

    this.bright = new Program(gl, QUAD_VERT, BRIGHT_FRAG, 'postfx:bright')
    this.down = new Program(gl, QUAD_VERT, DOWN_FRAG, 'postfx:down')
    this.blur = new Program(gl, QUAD_VERT, BLUR_FRAG, 'postfx:blur')
    this.composite = new Program(gl, QUAD_VERT, COMPOSITE_FRAG, 'postfx:composite')
  }

  resize(width: number, height: number): void {
    this.scene.resize(width, height)
    this.half.resize(width / 2, height / 2)
    this.halfPing.resize(width / 2, height / 2)
    this.eighth.resize(width / 8, height / 8)
    this.eighthPing.resize(width / 8, height / 8)
  }

  /** 场景 pass 之前调用：把绘制导向离屏 HDR 目标。 */
  beginScene(): void {
    this.scene.bind()
    const { gl } = this
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  private blit(program: Program, source: RenderTarget, target: RenderTarget): void {
    target.bind()
    program.use()
    program.uniTexture('uTex', source.texture, 0)
    program.uni('uTexel', [1 / source.width, 1 / source.height])
    this.renderer.setBlend('none')
    this.renderer.drawQuad(program)
  }

  /** 场景画完之后调用：跑辉光链并合成到屏幕。 */
  endScene(canvasWidth: number, canvasHeight: number): void {
    const { gl } = this
    const o = this.options

    // 1. 亮部提取到 1/2
    this.half.bind()
    this.bright.use()
    this.bright.uniTexture('uTex', this.scene.texture, 0)
    this.bright
      .uni('uTexel', [1 / this.scene.width, 1 / this.scene.height])
      .uni('uThreshold', o.threshold)
      .uni('uKnee', o.knee)
    this.renderer.setBlend('none')
    this.renderer.drawQuad(this.bright)

    // 2. 1/2 级横竖各模糊一次
    this.blurPass(this.half, this.halfPing, [1, 0])
    this.blurPass(this.halfPing, this.half, [0, 1])

    // 3. 降到 1/8 再模糊，拿到大范围的柔光
    this.blit(this.down, this.half, this.eighth)
    this.blurPass(this.eighth, this.eighthPing, [1, 0])
    this.blurPass(this.eighthPing, this.eighth, [0, 1])

    // 4. 合成到屏幕
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvasWidth, canvasHeight)
    this.composite.use()
    this.composite.uniTexture('uTex', this.scene.texture, 0)
    this.composite.uniTexture('uBloomA', this.half.texture, 1)
    this.composite.uniTexture('uBloomB', this.eighth.texture, 2)
    this.composite
      .uni('uIntensity', o.intensity)
      .uni('uExposure', o.exposure)
      .uni('uVignette', o.vignette)
      .uni('uRes', [canvasWidth, canvasHeight])
      .uni('uFlash', [this.flash.value, this.flash.value * 0.94, this.flash.value * 0.86])
    this.renderer.setBlend('none')
    this.renderer.drawQuad(this.composite)
  }

  private blurPass(source: RenderTarget, target: RenderTarget, dir: [number, number]): void {
    target.bind()
    this.blur.use()
    this.blur.uniTexture('uTex', source.texture, 0)
    this.blur
      .uni('uTexel', [1 / source.width, 1 / source.height])
      .uni('uDirection', dir)
    this.renderer.setBlend('none')
    this.renderer.drawQuad(this.blur)
  }

  dispose(): void {
    for (const rt of [this.scene, this.half, this.halfPing, this.eighth, this.eighthPing]) {
      rt.dispose()
    }
    for (const p of [this.bright, this.down, this.blur, this.composite]) p.dispose()
  }
}
