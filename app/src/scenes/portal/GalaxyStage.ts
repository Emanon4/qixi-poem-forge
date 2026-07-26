import gsap from 'gsap'
import { Renderer } from '@/gl/Renderer'
import { StarTrailPass } from '@/gl/StarTrailPass'
import { GALAXY_COMPOSITION, GALAXY_FRAG } from '@/shaders/galaxy'

/**
 * 第0幕的 WebGL 舞台控制器。
 * 负责：建上下文、挂 pass、驱动入场进度、跟随尺寸变化、切后台时暂停。
 * 不负责：任何 DOM 文字与交互（那些在 React 层）。
 */
export class GalaxyStage {
  readonly renderer: Renderer
  /**
   * 入场进度 0→1。公开出来是为了让 React 层把它和 DOM 文字动画编进
   * 同一条 gsap 时间轴 —— 两条独立时间轴会在慢设备上错开半秒。
   */
  readonly intro = { value: 0 }
  /**
   * 换皮状态。gsap 直接补间这四个数，天空就会整体渐变到另一个色系。
   * 拆成 r/g/b 三个独立数值而不是数组，是为了让 gsap 能逐通道补间。
   */
  readonly tint = { r: 1, g: 1, b: 1, amount: 0 }
  private readonly trail: StarTrailPass
  private readonly resizeObserver: ResizeObserver
  private introTween?: gsap.core.Tween

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas)

    // 先建拖尾（天空 pass 的 uniform 回调要读它的 energy），但后挂，保证画在天空之上
    this.trail = new StarTrailPass(this.renderer)

    this.renderer.createQuadPass('galaxy', GALAXY_FRAG, (program) => {
      program
        .uni('uIntro', this.intro.value)
        .uni('uHorizonFrac', GALAXY_COMPOSITION.horizonFrac)
        .uni('uMoon', GALAXY_COMPOSITION.moon)
        .uni('uEnergy', this.trail.energy)
        .uni('uTint', [this.tint.r, this.tint.g, this.tint.b])
        .uni('uTintAmount', this.tint.amount)
    })
    this.renderer.add(this.trail)

    this.resizeObserver = new ResizeObserver(() => this.renderer.resize())
    this.resizeObserver.observe(canvas)
    // iOS 上地址栏收起/展开只会触发 visualViewport 的 resize，ResizeObserver 未必跟得上
    window.visualViewport?.addEventListener('resize', this.handleViewportResize)
    document.addEventListener('visibilitychange', this.handleVisibility)

    this.renderer.start()
  }

  private handleViewportResize = (): void => {
    this.renderer.resize()
  }

  private handleVisibility = (): void => {
    if (document.hidden) this.renderer.stop()
    else this.renderer.start()
  }

  /** 月亮先亮，天空再曝光，星野最后铺满 —— 分段在 shader 的 gate 里。 */
  playIntro(duration = 2.6): gsap.core.Tween {
    this.introTween?.kill()
    this.introTween = gsap.to(this.intro, {
      value: 1,
      duration,
      ease: 'power2.out',
    })
    return this.introTween
  }

  /**
   * 跳过入场，直接停在指定进度的确定性静帧。
   * ?intro=1 直接看最终画面；?intro=1&at=12 看第 12 秒。
   * 截图核对靠它，客户想直接看成品态也靠它。
   */
  freeze(introValue: number, atTime = 6): void {
    this.introTween?.kill()
    this.intro.value = introValue
    this.renderer.renderOnce(atTime)
  }

  dispose(): void {
    this.introTween?.kill()
    this.resizeObserver.disconnect()
    window.visualViewport?.removeEventListener('resize', this.handleViewportResize)
    document.removeEventListener('visibilitychange', this.handleVisibility)
    this.renderer.dispose()
  }
}
