import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { createTexture, loadBitmap } from '@/gl/Texture'
import type { QuadPass } from '@/gl/Renderer'
import { AWAKEN_FRAG } from '@/shaders/awaken'
import { findSubject, guessCategory } from '@/vision/subject'
import { CATEGORIES, recognitionLine } from '@/copy/poems'
import { inspect, segment } from '@/dev/inspect'
import { useFlow } from '@/state/flow'
import type { GalaxyStage } from '@/scenes/portal/GalaxyStage'
import './awaken.css'

/** 截图的最大绘制区域（屏幕 uv，y 向上）。真实矩形按图片比例在此框内 contain。 */
const SHEET_BOX = [0.13, 0.395, 0.74, 0.45] as const

function containRect(
  imageAspect: number,
  screenW: number,
  screenH: number,
): [number, number, number, number] {
  const [bx, by, bw, bh] = SHEET_BOX
  const boxAspect = (bw * screenW) / (bh * screenH)
  let w = bw
  let h = bh
  if (imageAspect > boxAspect) h = bh * (boxAspect / imageAspect)
  else w = bw * (imageAspect / boxAspect)
  return [bx + (bw - w) / 2, by + (bh - h) / 2, w, h]
}

type Phase = 'scanning' | 'extracting' | 'done'

const PHASE_LABEL: Record<Phase, string> = {
  scanning: 'AI 正在读取这张截图',
  extracting: '正在把商品从截图里取出来',
  done: 'AI 识别到',
}

export function AwakenScene({ stage }: { stage: GalaxyStage | null }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const screenshot = useFlow((s) => s.screenshot)
  const category = useFlow((s) => s.category)
  const setSubject = useFlow((s) => s.setSubject)
  const setCategory = useFlow((s) => s.setCategory)
  const knownCategory = useFlow((s) => s.knownCategory)
  const setAct = useFlow((s) => s.setAct)

  const [phase, setPhase] = useState<Phase>('scanning')
  const [picking, setPicking] = useState(false)
  /** 三段演出进度。用 ref 让 gsap 直接改数值，不触发 React 重渲染。 */
  const progress = useRef({ scan: 0, dissolve: 0, lift: 0, fade: 1 })

  useEffect(() => {
    if (!stage || !screenshot) return

    let cancelled = false
    let pass: QuadPass | null = null
    let texture: WebGLTexture | null = null
    let timeline: gsap.core.Timeline | null = null
    const { renderer } = stage
    const { gl } = renderer

    void (async () => {
      const bitmap = await loadBitmap(screenshot.url)
      if (cancelled) return

      // 「半真识别」：CPU 启发式定位主体 + 按主色猜品类，零网络
      const box = findSubject(bitmap)
      setSubject(box)
      setCategory(knownCategory ?? guessCategory(box.color, box))

      texture = createTexture(gl, bitmap)
      if ('close' in bitmap) bitmap.close()

      const imageAspect = screenshot.width / screenshot.height
      // shader 内部统一用图片空间（y 向下），CPU 的框可以直接送进去
      const subjectUv: [number, number, number, number] = [box.x, box.y, box.w, box.h]

      pass = renderer.createQuadPass(
        'awaken',
        AWAKEN_FRAG,
        (program, ctx) => {
          program
            .uni('uRect', containRect(imageAspect, ctx.w, ctx.h))
            .uni('uSubject', subjectUv)
            .uni('uScan', progress.current.scan)
            .uni('uDissolve', progress.current.dissolve)
            .uni('uLift', progress.current.lift)
            .uni('uFade', progress.current.fade)
          if (texture) program.uniTexture('uShot', texture, 0)
        },
        'alpha',
      )

      // 定格模式：不跑时间轴，直接把三段进度摆到位并画一帧
      if (inspect.p !== null) {
        progress.current.scan = segment(inspect.p, 0)
        progress.current.dissolve = segment(inspect.p, 1)
        progress.current.lift = segment(inspect.p, 2)
        if (inspect.p >= 2.6) setPhase('done')
        else if (inspect.p >= 1) setPhase('extracting')
        stage.intro.value = 1
        renderer.renderOnce(inspect.at)
        return
      }

      const root = rootRef.current
      const q = root ? gsap.utils.selector(root) : null

      timeline = gsap.timeline()
      timeline
        .to(progress.current, { scan: 1, duration: 1.5, ease: 'none' })
        .call(() => setPhase('extracting'))
        .to(progress.current, { dissolve: 1, duration: 1.15, ease: 'power1.inOut' })
        .to(progress.current, { lift: 1, duration: 0.95, ease: 'power2.out' }, '-=0.35')
        .call(() => setPhase('done'))
      if (q) {
        timeline.from(
          q('.awaken__card'),
          { autoAlpha: 0, y: 26, duration: 0.7, ease: 'power3.out' },
          '>-0.15',
        )
      }
    })()

    /**
     * 兜底：gsap 走 rAF，页面切后台就停。演示时用户切走再切回来，
     * 会永远卡在「正在读取」而看不到确认卡。用不依赖 rAF 的定时器保底。
     */
    const failsafe = window.setTimeout(() => {
      progress.current.scan = 1
      progress.current.dissolve = 1
      progress.current.lift = 1
      setPhase('done')
    }, 6000)

    return () => {
      cancelled = true
      timeline?.kill()
      window.clearTimeout(failsafe)
      if (pass) renderer.remove(pass)
      if (texture) gl.deleteTexture(texture)
    }
  }, [stage, screenshot, setSubject, setCategory, knownCategory])

  // 直接访问 /awaken 之类的情况：没有截图就退回第0幕，不白屏
  useEffect(() => {
    if (!screenshot) setAct('portal')
  }, [screenshot, setAct])

  if (!screenshot) return null

  return (
    <div className="awaken" ref={rootRef}>
      <header className="awaken__head">
        <p className="awaken__phase">{PHASE_LABEL[phase]}</p>
        {phase !== 'done' && (
          <span className="awaken__pulse" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        )}
      </header>

      {phase === 'done' && (
        <div className="awaken__card">
          {picking ? (
            <>
              <p className="awaken__card-title">它其实是——</p>
              <div className="awaken__chips">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`awaken__chip${c === category ? ' is-on' : ''}`}
                    onClick={() => {
                      setCategory(c)
                      setPicking(false)
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="awaken__card-title">
                一{category === '鲜花' ? '束' : category === '巧克力' ? '盒' : '件'}
                <strong>{category}</strong>
              </p>
              <p className="awaken__card-line">{recognitionLine(category)}</p>
              <div className="awaken__actions">
                <button
                  type="button"
                  className="awaken__ghost"
                  onClick={() => setPicking(true)}
                >
                  不是这个
                </button>
                <button
                  type="button"
                  className="awaken__cta"
                  onClick={() => {
                    gsap.to(progress.current, {
                      fade: 0,
                      duration: 0.5,
                      onComplete: () => setAct('river'),
                    })
                  }}
                >
                  把它投进星河
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
