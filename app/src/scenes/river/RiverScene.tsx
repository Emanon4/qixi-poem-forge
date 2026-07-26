import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { RIVER_FRAG } from '@/shaders/river'
import type { QuadPass } from '@/gl/Renderer'
import { buildRiver, RIVER_CATCH_TARGET, type Word } from '@/game/words'
import { readCatch } from '@/game/constellation'
import { inspect } from '@/dev/inspect'
import { useFlow } from '@/state/flow'
import { sfx } from '@/audio/sfx'
import type { GalaxyStage } from '@/scenes/portal/GalaxyStage'
import './river.css'

/** 河心所在的屏高分数。字在这条带子附近漂。 */
const BAND_Y = 0.46
/** 捞取判定半径（byWidth 单位）。手指够到就算，不需要精确点中。 */
const CATCH_RADIUS = 0.075

interface Floater {
  word: Word
  /** byWidth 空间 */
  x: number
  y: number
  vx: number
  /** 上下浮动的相位 */
  bob: number
  caught: boolean
  el: HTMLElement | null
}

export function RiverScene({ stage }: { stage: GalaxyStage | null }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const category = useFlow((s) => s.category)
  const setReading = useFlow((s) => s.setReading)
  const setCaught = useFlow((s) => s.setCaught)
  const setAct = useFlow((s) => s.setAct)

  /**
   * 一河的字只造一次。用 useState 的惰性初始化而不是在 effect 里造 ——
   * effect 在首次渲染之后才跑，那样第一帧会 map 出一个空数组，字永远出不来。
   */
  const [words] = useState(() => buildRiver(category))
  const floatersRef = useRef<Floater[]>([])
  if (floatersRef.current.length === 0) {
    floatersRef.current = words.map((word, i) => ({
      word,
      // 三条泳道错开，避免所有字挤在河心一条线上
      x: -0.54 + (i / words.length) * 1.08 + (Math.random() - 0.5) * 0.06,
      y: ((i % 3) - 1) * 0.085 + (Math.random() - 0.5) * 0.05,
      vx: 0.018 + Math.random() * 0.016,
      bob: Math.random() * Math.PI * 2,
      caught: false,
      el: null,
    }))
  }
  const [caughtWords, setCaughtWords] = useState<Word[]>([])
  const caughtRef = useRef<Word[]>([])
  const doneRef = useRef(false)

  /** 一次捞取：粒子迸发 + 涟漪 + 音效 + 入篮。 */
  const catchWord = useCallback(
    (f: Floater, ripple: { at: [number, number]; age: number }) => {
      if (f.caught || doneRef.current) return
      f.caught = true
      ripple.at = [f.x, f.y]
      ripple.age = 0

      sfx.catch(caughtRef.current.length)

      if (stage) {
        const { particles } = stage
        particles.enabled = true
        particles.mode = 'burst'
        particles.spread = 0.5
        particles.gravity = 0.04
        particles.phase = 0
        particles.setInstances(
          Array.from({ length: 150 }, () => ({
            origin: [f.x, f.y] as [number, number],
            size: 2 + Math.random() * 4,
            delay: Math.random() * 0.08,
            life: 0.5 + Math.random() * 0.4,
            color: f.word.kind === 'object' ? 1 : 0,
          })),
        )
        gsap.to(particles, { phase: 1, duration: 0.85, ease: 'none', overwrite: true })
      }

      // 字飞进底部的篮子
      if (f.el) {
        gsap.to(f.el, {
          scale: 0.2,
          autoAlpha: 0,
          duration: 0.42,
          ease: 'power2.in',
        })
      }

      caughtRef.current = [...caughtRef.current, f.word]
      setCaughtWords(caughtRef.current)

      if (caughtRef.current.length >= RIVER_CATCH_TARGET) {
        doneRef.current = true
        const reading = readCatch(caughtRef.current)
        setCaught(caughtRef.current.map((w) => w.text))
        setReading(reading)
        sfx.complete()
        window.setTimeout(() => setAct('constellation'), 900)
      }
    },
    [stage, setAct, setReading, setCaught],
  )

  useEffect(() => {
    const root = rootRef.current
    const layer = layerRef.current
    if (!root || !layer || !stage) return

    const { renderer } = stage
    const river = { rise: 0 }
    const ripple = { at: [0, 0] as [number, number], age: 9 }

    const floaters = floatersRef.current

    const riverPass: QuadPass = renderer.createQuadPass(
      'river',
      RIVER_FRAG,
      (program, ctx) => {
        ripple.age += ctx.dt
        program
          .uni('uRise', river.rise)
          .uni('uBandY', BAND_Y)
          .uni('uEnergy', Math.min(Math.hypot(ctx.pointer.vx, ctx.pointer.vy) / 1.4, 1))
          .uni('uRipple', ripple.at)
          .uni('uRippleAge', ripple.age)
      },
      'alpha',
    )

    // ── 漂流与命中判定 ──
    const bandCenter = (BAND_Y - 0.5) // byWidth y 需乘 aspect，绘制时再换算
    let raf = 0
    let last = performance.now()

    /**
     * 把当前状态写进 transform。
     * 单独抽出来是因为挂载后必须**同步**摆一次 —— 只靠 rAF 的话，
     * 一旦首帧被推迟（低电量、后台、节流），一河的字会全叠在左上角。
     */
    const layout = (): void => {
      const rect = renderer.canvas.getBoundingClientRect()
      const aspectY = rect.height / rect.width
      const cy = bandCenter * aspectY
      for (const f of floaters) {
        if (f.caught || !f.el) continue
        const drawY = cy + f.y + Math.sin(f.bob) * 0.014
        const sx = (f.x + 0.5) * rect.width
        const sy = (0.5 - drawY / aspectY) * rect.height
        f.el.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%)`
      }
    }

    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min((now - last) / 1000, 1 / 20)
      last = now

      const rect = renderer.canvas.getBoundingClientRect()
      const aspectY = rect.height / rect.width
      const cy = bandCenter * aspectY

      for (const f of floaters) {
        if (f.caught) continue
        f.x += f.vx * dt
        if (f.x > 0.56) f.x = -0.56
        f.bob += dt * 0.9
        const drawY = cy + f.y + Math.sin(f.bob) * 0.014

        if (f.el) {
          const sx = (f.x + 0.5) * rect.width
          const sy = (0.5 - drawY / aspectY) * rect.height
          f.el.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%)`
        }
      }
    }

    layout() // 先同步摆一次，不等第一帧

    /**
     * 命中判定由 pointermove 直接驱动，而不是等下一帧。
     * 两个好处：响应零帧延迟（捞的手感全在这一下）；
     * 掉帧或 rAF 被节流时也照样能捞，不会整局卡死。
     */
    const onMove = (e: PointerEvent): void => {
      if (doneRef.current) return
      const rect = renderer.canvas.getBoundingClientRect()
      const aspectY = rect.height / rect.width
      const cy = bandCenter * aspectY
      const px = (e.clientX - rect.left) / rect.width - 0.5
      const py = 0.5 - (e.clientY - rect.top) / rect.height
      const pyw = py * aspectY

      for (const f of floaters) {
        if (f.caught) continue
        const drawY = cy + f.y + Math.sin(f.bob) * 0.014
        if (Math.hypot(f.x - px, drawY - pyw) < CATCH_RADIUS) {
          catchWord(f, ripple)
          break // 一次移动只捞一枚，否则划一下会把半条河扫空
        }
      }
    }
    const canvas = renderer.canvas
    canvas.addEventListener('pointermove', onMove, { passive: true })
    canvas.addEventListener('pointerdown', onMove, { passive: true })

    const cleanup = (): void => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerdown', onMove)
      renderer.remove(riverPass)
      if (stage) stage.particles.enabled = false
    }

    if (inspect.frozen) {
      river.rise = 1
      stage.intro.value = 1
      renderer.renderOnce(inspect.at)
      return cleanup
    }

    raf = requestAnimationFrame(tick)
    const tl = gsap
      .timeline()
      .to(river, { rise: 1, duration: 1.4, ease: 'power2.out' })
      .from('.river__hint', { autoAlpha: 0, y: 12, duration: 0.6 }, '-=0.3')
    // 字的入场刻意不走 gsap：ticker 被节流时 .from(autoAlpha:0) 会把字
    // 永久留在不可见状态，整局就没法玩了。交给 CSS 动画更稳。

    return () => {
      tl.kill()
      cleanup()
    }
  }, [stage, catchWord])

  const remaining = RIVER_CATCH_TARGET - caughtWords.length

  return (
    <div className="river" ref={rootRef}>
      <header className="river__head">
        <p className="river__eyebrow">第二夜 · 捞星</p>
        <h2 className="river__title">
          从星河里捞起 <em>{RIVER_CATCH_TARGET}</em> 枚字
        </h2>
        <p className="river__hint">
          {remaining > 0 ? `手指划过河面 · 还差 ${remaining} 枚` : '够了，它们要连成星官了'}
        </p>
      </header>

      {/* 漂浮的字。位置由 rAF 直接写 transform，不走 React 渲染。 */}
      <div className="river__layer" ref={layerRef} aria-hidden>
        {words.map((word, i) => (
          <span
            key={`${word.text}-${i}`}
            className={`river__word river__word--${word.kind}`}
            ref={(el) => {
              const f = floatersRef.current[i]
              if (f) f.el = el
            }}
          >
            {word.text}
          </span>
        ))}
      </div>

      {/* 捞到的字 */}
      <footer className="river__basket">
        {Array.from({ length: RIVER_CATCH_TARGET }, (_, i) => (
          <span key={i} className={`river__slot${caughtWords[i] ? ' is-filled' : ''}`}>
            {caughtWords[i]?.text ?? ''}
          </span>
        ))}
      </footer>
    </div>
  )
}
