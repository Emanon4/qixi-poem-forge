import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { pickPoem } from '@/copy/poems'
import { composeCharm } from '@/poster/composePoster'
import { inspect } from '@/dev/inspect'
import { sfx } from '@/audio/sfx'
import { useFlow } from '@/state/flow'
import type { GalaxyStage } from '@/scenes/portal/GalaxyStage'
import './charm.css'

const VB = 100

export function CharmScene({ stage }: { stage: GalaxyStage | null }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const reading = useFlow((s) => s.reading)
  const category = useFlow((s) => s.category)
  const setAct = useFlow((s) => s.setAct)
  const reset = useFlow((s) => s.reset)

  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const poem = useMemo(
    () => (reading ? pickPoem(reading.recipient, reading.purpose, reading.style, category) : null),
    [reading, category],
  )

  useEffect(() => {
    if (!reading) setAct('river')
  }, [reading, setAct])

  useEffect(() => {
    const root = rootRef.current
    if (!root || !stage) return
    stage.intro.value = 1

    const { particles } = stage
    const { postFX } = stage.renderer

    if (inspect.frozen) {
      stage.renderer.renderOnce(inspect.at)
      return
    }

    particles.enabled = true
    particles.mode = 'burst'
    particles.center = [0, 0]
    particles.spread = 1.1
    particles.gravity = -0.05
    particles.phase = 0
    // 数量和尺寸都收着给：这是一发庆祝，不是烟雾弹。
    // 之前 500 颗 × 最大 6.5px 在动画中途会把整屏糊白。
    particles.setInstances(
      Array.from({ length: 260 }, () => ({
        origin: [(Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7] as [number, number],
        size: 1.5 + Math.random() * 3,
        delay: Math.random() * 0.25,
        life: 0.5 + Math.random() * 0.4,
        color: Math.floor(Math.random() * 4),
      })),
    )

    const tl = gsap
      .timeline()
      .fromTo(
        root.querySelector('.charm__slip'),
        { autoAlpha: 0, y: 40, rotateX: 22, scale: 0.92 },
        { autoAlpha: 1, y: 0, rotateX: 0, scale: 1, duration: 0.9, ease: 'power3.out' },
      )
      .to(particles, { phase: 1, duration: 1.2, ease: 'none' }, 0)
      .fromTo(postFX.flash, { value: 0.3 }, { value: 0, duration: 0.6 }, 0)
      .from(root.querySelectorAll('.charm__actions > *'), {
        autoAlpha: 0,
        y: 14,
        duration: 0.5,
        stagger: 0.08,
      })

    /**
     * 兜底：gsap 一旦被节流，迸发会永久停在中途 —— 满屏粒子把签盖住。
     * 这条保证无论如何都会收场。
     */
    const failsafe = window.setTimeout(() => {
      // 必须先杀时间轴：补间还活着的话，它每 tick 一次就把下面这些值又写回去，
      // 兜底等于没兜。（白闪卡在 0.23 把整屏糊白，就是这么来的。）
      tl.kill()
      particles.enabled = false
      postFX.flash.value = 0
      gsap.set(root.querySelector('.charm__slip'), { autoAlpha: 1, y: 0, rotateX: 0, scale: 1 })
      gsap.set(root.querySelectorAll('.charm__actions > *'), { autoAlpha: 1, y: 0 })
    }, 2600)

    return () => {
      tl.kill()
      window.clearTimeout(failsafe)
      particles.enabled = false
      postFX.flash.value = 0
    }
  }, [stage])

  useEffect(
    () => () => {
      if (posterUrl) URL.revokeObjectURL(posterUrl)
    },
    [posterUrl],
  )

  if (!reading || !poem) return null

  const pts = reading.stars.map((s) => ({ ...s, sx: s.x * VB * 1.15, sy: -s.y * VB * 1.15 }))

  const savePoster = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    sfx.tap()
    try {
      const blob = await composeCharm({ reading, poem, category })
      const url = URL.createObjectURL(blob)
      setPosterUrl(url)
      const a = document.createElement('a')
      a.href = url
      a.download = `${reading.name}星官·七夕心意签.png`
      a.click()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="charm" ref={rootRef} data-skin={reading.style}>
      <div className="charm__slip">
        <div className="charm__top">
          <span className="charm__fortune">{reading.fortune}</span>
          <span className="charm__rarity" aria-label={`稀有度 ${reading.rarity + 1} 星`}>
            {'★'.repeat(reading.rarity + 1)}
            {'☆'.repeat(3 - reading.rarity)}
          </span>
        </div>

        <h2 className="charm__name">
          {reading.name}
          <small>星官</small>
        </h2>

        {/* 星官图缩略 */}
        <svg className="charm__chart" viewBox={`${-VB / 2} ${-VB / 2} ${VB} ${VB}`} aria-hidden>
          {pts.slice(0, -1).map((p, i) => (
            <line key={i} x1={p.sx} y1={p.sy} x2={pts[i + 1].sx} y2={pts[i + 1].sy} />
          ))}
          {pts.map((p, i) => (
            <circle key={i} cx={p.sx} cy={p.sy} r={1.5} />
          ))}
        </svg>

        <p className="charm__persona">
          你是<em>{reading.persona}</em>
        </p>

        <div className="charm__poem">
          <h3>{poem.title}</h3>
          {poem.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>

        <p className="charm__words">
          捞得 · {reading.stars.map((s) => s.text).join(' ')}
        </p>
        <p className="charm__sign">抖音商城 · 七夕　这份礼物，替我说给你听</p>
      </div>

      {posterUrl && (
        <div className="charm__preview">
          <img src={posterUrl} alt={`${reading.name}星官 心意签`} />
          <p>长按图片可保存到相册</p>
        </div>
      )}

      <div className="charm__actions">
        <button type="button" className="charm__cta" onClick={() => void savePoster()}>
          {busy ? '正在制签…' : posterUrl ? '重新制签' : '保存这枚签'}
        </button>
        <button
          type="button"
          className="charm__ghost"
          onClick={() => {
            sfx.tap()
            setAct('river')
          }}
        >
          再捞一次
        </button>
        <button
          type="button"
          className="charm__ghost"
          onClick={() => {
            sfx.tap()
            reset()
          }}
        >
          换一件礼物
        </button>
      </div>
    </div>
  )
}
