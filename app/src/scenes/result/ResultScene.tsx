import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { PURPOSES, RECIPIENTS, STYLES } from '@/design/catalog'
import { pickPoem } from '@/copy/poems'
import { composePoster } from '@/poster/composePoster'
import { loadBitmap } from '@/gl/Texture'
import { inspect } from '@/dev/inspect'
import { useFlow } from '@/state/flow'
import type { GalaxyStage } from '@/scenes/portal/GalaxyStage'
import './result.css'

export function ResultScene({ stage }: { stage: GalaxyStage | null }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const screenshot = useFlow((s) => s.screenshot)
  const subject = useFlow((s) => s.subject)
  const category = useFlow((s) => s.category)
  const recipient = useFlow((s) => s.recipient)
  const purpose = useFlow((s) => s.purpose)
  const style = useFlow((s) => s.style)
  const setAct = useFlow((s) => s.setAct)
  const reset = useFlow((s) => s.reset)

  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const poem = useMemo(
    () => pickPoem(recipient ?? 'lover', purpose ?? 'confess', style, category),
    [recipient, purpose, style, category],
  )

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (stage) {
      stage.intro.value = 1
      if (inspect.frozen) stage.renderer.renderOnce(inspect.at)
    }
    if (inspect.frozen) return

    const q = gsap.utils.selector(root)
    const tl = gsap
      .timeline()
      .from(q('.result__sheet'), {
        autoAlpha: 0,
        y: 30,
        scale: 0.96,
        duration: 0.8,
        ease: 'power3.out',
      })
      .from(q('.result__actions > *'), {
        autoAlpha: 0,
        y: 14,
        duration: 0.5,
        stagger: 0.08,
      })
    return () => {
      tl.kill()
    }
  }, [stage])

  // 卸载时释放海报 blob
  useEffect(
    () => () => {
      if (posterUrl) URL.revokeObjectURL(posterUrl)
    },
    [posterUrl],
  )

  const makePoster = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const bitmap = screenshot ? await loadBitmap(screenshot.url) : null
      const blob = await composePoster({ poem, style, category, bitmap, subject })
      const url = URL.createObjectURL(blob)
      setPosterUrl(url)
      // demo 阶段按「长按保存 / 录屏」交付：站内 webview 的一键存相册各家行为不一
      const a = document.createElement('a')
      a.href = url
      a.download = `七夕诗影-${poem.title}.png`
      a.click()
    } finally {
      setBusy(false)
    }
  }

  const styleLabel = STYLES.find((s) => s.id === style)?.label
  const recipientLabel = RECIPIENTS.find((r) => r.id === recipient)?.label
  const purposeLabel = PURPOSES.find((p) => p.id === purpose)?.short

  return (
    <div className="result" ref={rootRef} data-skin={style}>
      <div className="result__sheet">
        <p className="result__meta">
          {recipientLabel} · {purposeLabel} · {styleLabel} · {category}
        </p>
        <h2 className="result__title">{poem.title}</h2>
        <div className={`result__poem${style === 'guofeng' ? ' is-vertical' : ''}`}>
          {poem.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        <span className="result__seal" aria-hidden>
          七夕
        </span>
        <p className="result__tag">这份礼物，替我说给你听。</p>
      </div>

      {posterUrl && (
        <div className="result__preview">
          <img src={posterUrl} alt={`${poem.title} 海报`} />
          <p>长按图片可保存到相册</p>
        </div>
      )}

      <div className="result__actions">
        <button type="button" className="result__cta" onClick={() => void makePoster()}>
          {busy ? '正在合成…' : posterUrl ? '重新生成海报' : '生成可保存的海报'}
        </button>
        <div className="result__row">
          <button type="button" className="result__ghost" onClick={() => setAct('choose')}>
            换个文风再来
          </button>
          <button
            type="button"
            className="result__ghost"
            onClick={() => {
              reset()
              if (stage) gsap.to(stage.tint, { amount: 0, duration: 0.6 })
            }}
          >
            换一件礼物
          </button>
        </div>
      </div>
    </div>
  )
}
