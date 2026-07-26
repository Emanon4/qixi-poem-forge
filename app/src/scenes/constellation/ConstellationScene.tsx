import { useEffect, useMemo, useRef } from 'react'
import gsap from 'gsap'
import { pickPoem } from '@/copy/poems'
import { INK_FRAG } from '@/shaders/ink'
import type { QuadPass } from '@/gl/Renderer'
import { inspect } from '@/dev/inspect'
import { sfx } from '@/audio/sfx'
import { useFlow } from '@/state/flow'
import type { GalaxyStage } from '@/scenes/portal/GalaxyStage'
import './constellation.css'

const PAPER: Record<string, [number, number, number]> = {
  guofeng: [0.937, 0.906, 0.835],
  fafeng: [1.0, 0.886, 0.294],
  galgame: [0.106, 0.11, 0.247],
}

/** SVG 画布用 -50…50 的居中坐标系，星点坐标乘 100 落进来。 */
const VB = 100

export function ConstellationScene({ stage }: { stage: GalaxyStage | null }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const reading = useFlow((s) => s.reading)
  const category = useFlow((s) => s.category)
  const setAct = useFlow((s) => s.setAct)

  const poem = useMemo(
    () =>
      reading
        ? pickPoem(reading.recipient, reading.purpose, reading.style, category)
        : null,
    [reading, category],
  )

  // 没有读星结果（比如直接深链进来）就退回捞星
  useEffect(() => {
    if (!reading) setAct('river')
  }, [reading, setAct])

  useEffect(() => {
    const root = rootRef.current
    if (!root || !stage || !reading) return

    const q = gsap.utils.selector(root)
    const { renderer, particles } = stage
    const ink = { spread: 0, fade: 1 }
    const paper = PAPER[reading.style] ?? PAPER.guofeng

    const inkPass: QuadPass = renderer.createQuadPass(
      'ink',
      INK_FRAG,
      (program) => {
        program
          .uni('uSpread', ink.spread)
          .uni('uCenter', [0, -0.40])
          .uni('uRadius', 0.37)
          .uni('uPaper', paper)
          .uni('uFade', ink.fade)
      },
      'alpha',
    )

    // 星点上各撒一簇光尘
    particles.enabled = true
    particles.mode = 'orbit'
    particles.center = [0, 0.22]
    particles.spread = 0.55
    particles.phase = 0
    particles.setInstances(
      reading.stars.flatMap((s) =>
        Array.from({ length: 40 }, () => ({
          origin: [s.x, s.y + 0.22] as [number, number],
          size: 1.5 + Math.random() * 3,
          delay: Math.random() * 0.3,
          life: 1,
          color: Math.random() < 0.7 ? 0 : 3,
        })),
      ),
    )

    const cleanup = (): void => {
      renderer.remove(inkPass)
      particles.enabled = false
    }

    if (inspect.frozen) {
      ink.spread = 1
      particles.phase = 1
      gsap.set(q('.cons__star, .cons__starLabel'), { autoAlpha: 1, scale: 1 })
      gsap.set(q('.cons__link'), { strokeDashoffset: 0, autoAlpha: 1 })
      gsap.set(q('.cons__name, .cons__poem, .cons__cta'), { autoAlpha: 1, y: 0 })
      gsap.set(q('.cons__ch'), { autoAlpha: 1, y: 0, filter: 'blur(0px)' })
      stage.intro.value = 1
      renderer.renderOnce(inspect.at)
      return cleanup
    }

    let linkIndex = 0
    const tl = gsap.timeline()

    // 一 · 星点依次亮起
    tl.from(q('.cons__star'), {
      scale: 0,
      autoAlpha: 0,
      duration: 0.5,
      stagger: 0.12,
      ease: 'back.out(2.6)',
      onStart: () => sfx.tap(),
    })
      .from(q('.cons__starLabel'), { autoAlpha: 0, duration: 0.4, stagger: 0.12 }, '-=0.7')
      .to(particles, { phase: 1, duration: 0.9 }, '<')

      // 二 · 连线。一条线一声，连成星官
      .to(
        q('.cons__link'),
        {
          strokeDashoffset: 0,
          autoAlpha: 1,
          duration: 0.34,
          // stagger 的 onStart 里拿不到稳定的序号，用闭包计数最简单
          stagger: { each: 0.14, onStart: () => sfx.link(linkIndex++) },
          ease: 'power2.inOut',
        },
        '+=0.1',
      )

      // 三 · 星官得名
      .from(q('.cons__name'), { autoAlpha: 0, y: 18, duration: 0.6, ease: 'power3.out' }, '+=0.15')
      .from(q('.cons__fortune'), { autoAlpha: 0, scale: 0.7, duration: 0.5, ease: 'back.out(2)' }, '-=0.3')

      // 四 · 墨迹铺开，诗沿星官写出
      .to(ink, { spread: 1, duration: 0.9, ease: 'power2.out' }, '+=0.1')
      .from(q('.cons__title'), { autoAlpha: 0, y: 14, duration: 0.45 }, '-=0.5')
      .to(
        q('.cons__ch'),
        {
          autoAlpha: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.3,
          stagger: 0.024,
          ease: 'power3.out',
        },
        '-=0.2',
      )
      .from(q('.cons__cta'), { autoAlpha: 0, y: 14, duration: 0.5 }, '-=0.1')

    const failsafe = window.setTimeout(() => {
      tl.kill() // 同理：不先杀时间轴，下面 set 的值会被补间覆盖回去
      gsap.set(q('.cons__star, .cons__starLabel, .cons__name, .cons__fortune, .cons__title, .cons__cta'), {
        autoAlpha: 1,
        scale: 1,
        y: 0,
      })
      gsap.set(q('.cons__link'), { strokeDashoffset: 0, autoAlpha: 1 })
      gsap.set(q('.cons__ch'), { autoAlpha: 1, y: 0, filter: 'blur(0px)' })
      ink.spread = 1
      particles.phase = 1
    }, 7000)

    return () => {
      tl.kill()
      window.clearTimeout(failsafe)
      cleanup()
    }
  }, [stage, reading])

  if (!reading || !poem) return null

  const pts = reading.stars.map((s) => ({ ...s, sx: s.x * VB * 1.6, sy: -s.y * VB * 1.6 }))

  return (
    <div className="cons" ref={rootRef} data-skin={reading.style}>
      {/* 星官图 */}
      <div className="cons__chart">
        <svg viewBox={`${-VB / 2} ${-VB / 2} ${VB} ${VB}`} aria-hidden>
          {pts.slice(0, -1).map((p, i) => {
            const n = pts[i + 1]
            const len = Math.hypot(n.sx - p.sx, n.sy - p.sy)
            return (
              <line
                key={i}
                className="cons__link"
                x1={p.sx}
                y1={p.sy}
                x2={n.sx}
                y2={n.sy}
                strokeDasharray={len}
                strokeDashoffset={len}
              />
            )
          })}
          {pts.map((p, i) => (
            <circle key={i} className="cons__star" cx={p.sx} cy={p.sy} r={1.7} />
          ))}
        </svg>
        {pts.map((p, i) => (
          <span
            key={i}
            className="cons__starLabel"
            style={{
              left: `${50 + (p.sx / VB) * 100}%`,
              top: `${50 + (p.sy / VB) * 100}%`,
            }}
          >
            {p.text}
          </span>
        ))}
      </div>

      <div className="cons__caption">
        <h2 className="cons__name">
          {reading.name}
          <small>星官</small>
        </h2>
        <span className="cons__fortune">
          {reading.fortune}
          <i aria-hidden>
            {'★'.repeat(reading.rarity + 1)}
            {'☆'.repeat(3 - reading.rarity)}
          </i>
        </span>
      </div>

      {/* 诗 */}
      <div className="cons__poem">
        <h3 className="cons__title">{poem.title}</h3>
        {poem.lines.map((line, i) => (
          <p key={i} className="cons__line">
            {[...line].map((ch, j) => (
              <span key={j} className="cons__ch">
                {ch}
              </span>
            ))}
          </p>
        ))}
      </div>

      <button
        type="button"
        className="cons__cta"
        onClick={() => {
          sfx.stamp()
          setAct('charm')
        }}
      >
        收下这枚心意签
      </button>
    </div>
  )
}
