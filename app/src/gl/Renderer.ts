import { Program } from './Program'
import { PostFX } from './PostFX'
import { QUAD_VERT } from './glsl'

export type QualityTier = 'high' | 'mid' | 'low'

const TIERS: Record<QualityTier, { maxDpr: number; quality: number }> = {
  high: { maxDpr: 2.0, quality: 1.0 },
  mid: { maxDpr: 1.5, quality: 0.75 },
  low: { maxDpr: 1.0, quality: 0.55 },
}

const TIER_ORDER: QualityTier[] = ['high', 'mid', 'low']

export interface PointerState {
  /** 归一化坐标，左下原点（与 shader 里的 vUV 同一套） */
  x: number
  y: number
  /** 归一化速度，单位「屏宽/秒」 */
  vx: number
  vy: number
  down: boolean
  /**
   * 最近一次移动的时间戳（performance.now）。
   * 命中判定要用它而不是瞬时速度：速度每帧按指数衰减，
   * 手指慢慢挪的时候，判定那一刻速度可能已经衰减到 0，会漏判。
   */
  movedAt: number
}

export interface FrameCtx {
  /** 累计秒（页面隐藏期间不累计） */
  t: number
  /** 帧间隔秒，已钳到 [0, 1/20]，防止切回前台时物理炸开 */
  dt: number
  /** 绘制缓冲尺寸（物理像素） */
  w: number
  h: number
  dpr: number
  quality: number
  tier: QualityTier
  pointer: PointerState
}

export interface Pass {
  readonly name: string
  enabled: boolean
  /**
   * 绘制顺序，小的先画。不给就按 ORDER.scene 处理。
   * 有这个字段是因为：各幕通过 createQuadPass 追加自己的 pass，
   * 单纯按数组顺序的话，后加的墨迹会盖住先加的粒子层。
   */
  order?: number
  draw(ctx: FrameCtx): void
  resize?(w: number, h: number): void
  dispose?(): void
}

/** 固定的层次约定。各幕的 pass 落在 scene 层，粒子和拖尾永远在最上。 */
export const ORDER = {
  sky: 0,
  scene: 10,
  particles: 20,
  trail: 30,
} as const

export type Blend = 'none' | 'alpha' | 'add'

/** 一个全屏 quad 的着色器 pass —— 星河、扫描、溶解、墨扩散都是这种形态。 */
export class QuadPass implements Pass {
  enabled = true
  // 显式标 number：ORDER 是 as const，直接赋值会把类型收窄成字面量 10
  order: number = ORDER.scene
  readonly program: Program

  constructor(
    readonly name: string,
    private readonly renderer: Renderer,
    fragmentSource: string,
    private readonly onUniforms?: (program: Program, ctx: FrameCtx) => void,
    private readonly blend: Blend = 'none',
  ) {
    this.program = new Program(renderer.gl, QUAD_VERT, fragmentSource, name)
  }

  draw(ctx: FrameCtx): void {
    const { program } = this
    program.use()
    program
      .uni('uRes', [ctx.w, ctx.h])
      .uni('uTime', ctx.t)
      .uni('uDelta', ctx.dt)
      .uni('uQuality', ctx.quality)
      .uni('uPointer', [ctx.pointer.x, ctx.pointer.y, ctx.pointer.down ? 1 : 0])
    this.onUniforms?.(program, ctx)
    this.renderer.setBlend(this.blend)
    this.renderer.drawQuad(program)
  }

  dispose(): void {
    this.program.dispose()
  }
}

export class Renderer {
  readonly gl: WebGL2RenderingContext
  /**
   * HDR 辉光后处理。各幕的 pass 一律输出**线性 HDR**，
   * 色调映射、暗角、抖动统一在这里落地成 8bit —— 不要在幕的 shader 里再做一遍。
   */
  readonly postFX: PostFX
  private readonly quadVbo: WebGLBuffer
  private readonly quadVaos = new Map<WebGLProgram, WebGLVertexArrayObject>()
  private readonly passes: Pass[] = []

  private rafId = 0
  private running = false
  private lastTs = 0
  private elapsed = 0
  private currentBlend: Blend = 'none'

  private cssW = 0
  private cssH = 0
  private dpr = 1
  tier: QualityTier = 'high'

  readonly pointer: PointerState = { x: 0.5, y: 0.5, vx: 0, vy: 0, down: false, movedAt: 0 }
  private lastPointer = { x: 0.5, y: 0.5, t: 0 }

  /** FPS 治理：只降不升，避免在临界点来回抖动。 */
  private frameAccum = 0
  private frameCount = 0

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false, // 不透明画布：省一次混合，也避免和 DOM 背景抢色
      antialias: false, // 自己在 shader 里做边缘处理，MSAA 在移动端太贵
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      desynchronized: true,
    })
    if (!gl) throw new Error('WEBGL2_UNSUPPORTED')
    this.gl = gl

    // 全屏两个三角形，clip space 直给，不需要任何矩阵
    const vbo = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]), // 覆盖屏幕的大三角，比 quad 少一个顶点和一次对角线撕裂
      gl.STATIC_DRAW,
    )
    this.quadVbo = vbo

    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.clearColor(0, 0, 0, 1) // 场景先进 HDR 目标，底色由天空 pass 铺满

    // 必须在 resize() 之前建好：resize 会顺带调整后处理的所有渲染目标
    this.postFX = new PostFX(this, gl)

    this.bindPointerEvents()
    this.resize()
  }

  // ── pass 管理 ─────────────────────────────────────────────

  add(pass: Pass): void {
    this.passes.push(pass)
    // 稳定排序：同 order 的保持加入先后，跨 order 的严格按层次
    this.passes.sort((a, b) => (a.order ?? ORDER.scene) - (b.order ?? ORDER.scene))
    pass.resize?.(this.canvas.width, this.canvas.height)
  }

  remove(pass: Pass): void {
    const i = this.passes.indexOf(pass)
    if (i >= 0) {
      this.passes.splice(i, 1)
      pass.dispose?.()
    }
  }

  get(name: string): Pass | undefined {
    return this.passes.find((p) => p.name === name)
  }

  createQuadPass(
    name: string,
    fragmentSource: string,
    onUniforms?: (program: Program, ctx: FrameCtx) => void,
    blend: Blend = 'none',
  ): QuadPass {
    const pass = new QuadPass(name, this, fragmentSource, onUniforms, blend)
    this.add(pass)
    return pass
  }

  // ── 绘制 ─────────────────────────────────────────────────

  setBlend(blend: Blend): void {
    if (blend === this.currentBlend) return
    const { gl } = this
    this.currentBlend = blend
    if (blend === 'none') {
      gl.disable(gl.BLEND)
      return
    }
    gl.enable(gl.BLEND)
    if (blend === 'add') gl.blendFunc(gl.ONE, gl.ONE)
    else gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  }

  /** 用给定 program 画全屏三角。VAO 按 program 缓存，避免每帧重设属性指针。 */
  drawQuad(program: Program): void {
    const { gl } = this
    let vao = this.quadVaos.get(program.handle)
    if (!vao) {
      vao = gl.createVertexArray()!
      gl.bindVertexArray(vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo)
      const loc = program.attrib('aPosition')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
      this.quadVaos.set(program.handle, vao)
    }
    gl.bindVertexArray(vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }

  private frame = (ts: number): void => {
    if (!this.running) return
    this.rafId = requestAnimationFrame(this.frame)

    if (this.lastTs === 0) this.lastTs = ts
    const rawDt = (ts - this.lastTs) / 1000
    this.lastTs = ts
    const dt = Math.min(rawDt, 1 / 20)
    this.elapsed += dt

    this.governQuality(rawDt)
    this.decayPointerVelocity(dt)

    const ctx: FrameCtx = {
      t: this.elapsed,
      dt,
      w: this.canvas.width,
      h: this.canvas.height,
      dpr: this.dpr,
      quality: TIERS[this.tier].quality,
      tier: this.tier,
      pointer: this.pointer,
    }

    this.drawFrame(ctx)
  }

  /**
   * 一帧的完整流程：场景 pass 全部画进离屏 HDR 目标，
   * 再由后处理跑辉光链并合成到屏幕。frame() 和 renderOnce() 共用。
   */
  private drawFrame(ctx: FrameCtx): void {
    this.postFX.beginScene()
    for (const pass of this.passes) {
      if (pass.enabled) pass.draw(ctx)
    }
    this.postFX.endScene(this.canvas.width, this.canvas.height)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastTs = 0
    this.rafId = requestAnimationFrame(this.frame)
  }

  /**
   * 不依赖 rAF 地画一帧。给定 atTime 就画那个时刻的确定性静帧。
   * 用途：截图核对画面、以及 ?intro= 静帧模式。
   */
  renderOnce(atTime?: number): void {
    if (atTime !== undefined) this.elapsed = atTime
    const ctx: FrameCtx = {
      t: this.elapsed,
      dt: 0,
      w: this.canvas.width,
      h: this.canvas.height,
      dpr: this.dpr,
      quality: TIERS[this.tier].quality,
      tier: this.tier,
      pointer: this.pointer,
    }
    this.drawFrame(ctx)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  // ── 质量治理 ──────────────────────────────────────────────

  private governQuality(rawDt: number): void {
    // 首帧和切回前台的长帧不计入统计
    if (rawDt <= 0 || rawDt > 0.5) return
    this.frameAccum += rawDt
    this.frameCount++
    if (this.frameCount < 45) return

    const avgFps = this.frameCount / this.frameAccum
    this.frameAccum = 0
    this.frameCount = 0

    if (avgFps < 50) {
      const next = TIER_ORDER[TIER_ORDER.indexOf(this.tier) + 1]
      if (next) {
        this.tier = next
        console.info(`[renderer] ${avgFps.toFixed(0)}fps → 降档至 ${next}`)
        this.resize()
      }
    }
  }

  // ── 尺寸 ─────────────────────────────────────────────────

  resize(): void {
    const { canvas } = this
    const cssW = canvas.clientWidth || window.innerWidth
    const cssH = canvas.clientHeight || window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, TIERS[this.tier].maxDpr)

    if (cssW === this.cssW && cssH === this.cssH && dpr === this.dpr) return
    this.cssW = cssW
    this.cssH = cssH
    this.dpr = dpr

    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    this.postFX?.resize(canvas.width, canvas.height)
    for (const pass of this.passes) pass.resize?.(canvas.width, canvas.height)
  }

  // ── 触点 ─────────────────────────────────────────────────

  private bindPointerEvents(): void {
    const { canvas } = this
    const update = (clientX: number, clientY: number, down?: boolean): void => {
      const rect = canvas.getBoundingClientRect()
      const x = (clientX - rect.left) / rect.width
      const y = 1 - (clientY - rect.top) / rect.height // 翻成 y 向上，和 vUV 对齐

      const now = performance.now()
      const dtMs = now - this.lastPointer.t
      if (dtMs > 0 && dtMs < 200) {
        const k = 1000 / dtMs
        this.pointer.vx = (x - this.lastPointer.x) * k
        this.pointer.vy = (y - this.lastPointer.y) * k
      }
      this.lastPointer = { x, y, t: now }
      this.pointer.x = x
      this.pointer.y = y
      this.pointer.movedAt = now
      if (down !== undefined) this.pointer.down = down
    }

    canvas.addEventListener(
      'pointerdown',
      (e) => update(e.clientX, e.clientY, true),
      { passive: true },
    )
    canvas.addEventListener('pointermove', (e) => update(e.clientX, e.clientY), {
      passive: true,
    })
    const release = (e: PointerEvent): void => update(e.clientX, e.clientY, false)
    canvas.addEventListener('pointerup', release, { passive: true })
    canvas.addEventListener('pointercancel', release, { passive: true })
    canvas.addEventListener('pointerleave', release, { passive: true })
  }

  /** 抬手后速度自然衰减，拖尾不会僵在最后一帧的方向上。 */
  private decayPointerVelocity(dt: number): void {
    const decay = Math.exp(-dt * 6)
    this.pointer.vx *= decay
    this.pointer.vy *= decay
  }

  dispose(): void {
    this.stop()
    this.postFX.dispose()
    for (const pass of this.passes) pass.dispose?.()
    this.passes.length = 0
    for (const vao of this.quadVaos.values()) this.gl.deleteVertexArray(vao)
    this.quadVaos.clear()
    this.gl.deleteBuffer(this.quadVbo)
    // 刻意不调 WEBGL_lose_context.loseContext()：一个 canvas 只能有一个上下文，
    // 主动弄丢它之后，HMR / 重挂载在同一个 canvas 上再 getContext 拿回的还是那个
    // 已失效的上下文，之后所有 shader 编译都会失败且驱动不给任何日志。
  }
}
