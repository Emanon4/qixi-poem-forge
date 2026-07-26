import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { PURPOSES, RECIPIENTS, STYLES, type RecipientId } from '@/design/catalog'
import { inspect } from '@/dev/inspect'
import { useFlow } from '@/state/flow'
import type { GalaxyStage } from '@/scenes/portal/GalaxyStage'
import './choose.css'

type Step = 'recipient' | 'purpose' | 'style'

const STEP_TITLE: Record<Step, string> = {
  recipient: '这份心意，要送给谁',
  purpose: '为什么想送给 TA',
  style: '想用什么口气说',
}

/** 只做 P0 三风：有完整皮肤的就这三个。 */
const P0 = STYLES.filter((s) => s.tier === 'P0')

const SKIN_TINT: Record<string, string> = {
  guofeng: '#c9a227',
  fafeng: '#ffe24b',
  galgame: '#6c7bff',
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** 四张命运卡的图形符号，全部来自创意文档 §4.3 的「融合元素」。 */
function Motif({ id }: { id: RecipientId }) {
  if (id === 'lover')
    return (
      <svg viewBox="0 0 48 48" aria-hidden>
        <circle cx="19" cy="21" r="5.5" />
        <circle cx="30" cy="27" r="3.6" />
        <path d="M23 24.5 26.5 26" strokeLinecap="round" />
      </svg>
    )
  if (id === 'bestie')
    return (
      <svg viewBox="0 0 48 48" aria-hidden>
        <path d="M13 14h11l-2.5 10a3 3 0 0 1-6 0Z" />
        <path d="M18.5 24v9M15 33h7" strokeLinecap="round" />
        <path d="M24 18h11l-2.5 10a3 3 0 0 1-6 0Z" />
        <path d="M29.5 28v7M26 35h7" strokeLinecap="round" />
      </svg>
    )
  if (id === 'family')
    return (
      <svg viewBox="0 0 48 48" aria-hidden>
        <path d="M24 10v5" strokeLinecap="round" />
        <path d="M16 25a8 8 0 0 1 16 0Z" />
        <path d="M18 25 14 38h20l-4-13" strokeLinecap="round" />
      </svg>
    )
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      <ellipse cx="24" cy="30" rx="7" ry="6" />
      <circle cx="15" cy="22" r="2.8" />
      <circle cx="21" cy="17.5" r="2.8" />
      <circle cx="28" cy="17.5" r="2.8" />
      <circle cx="34" cy="22" r="2.8" />
    </svg>
  )
}

export function ChooseScene({ stage }: { stage: GalaxyStage | null }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState<Step>('recipient')

  const recipient = useFlow((s) => s.recipient)
  const purpose = useFlow((s) => s.purpose)
  const style = useFlow((s) => s.style)
  const category = useFlow((s) => s.category)
  const setRecipient = useFlow((s) => s.setRecipient)
  const setPurpose = useFlow((s) => s.setPurpose)
  const setStyle = useFlow((s) => s.setStyle)
  const setAct = useFlow((s) => s.setAct)

  /**
   * 换皮的核心：把目标色补间进 shader。
   * 选对象时天空跟对象色系走；进到文风步骤后，改由文风主导 ——
   * 于是每点一个文风，整片星河、月亮、水面会一起变成那个色系。
   */
  useEffect(() => {
    if (!stage) return
    const hex = step === 'style' ? SKIN_TINT[style] : RECIPIENTS.find((r) => r.id === recipient)?.tint
    if (!hex) return
    const [r, g, b] = hexToRgb(hex)
    const amount = step === 'style' ? 0.72 : 0.42

    // 定格模式下 gsap 的 ticker 不推进，直接赋值并画一帧
    if (inspect.frozen) {
      Object.assign(stage.tint, { r, g, b, amount })
      stage.intro.value = 1
      stage.renderer.renderOnce(inspect.at)
      return
    }
    gsap.to(stage.tint, { r, g, b, amount, duration: 0.85, ease: 'power2.inOut' })
  }, [stage, step, recipient, style])

  /** 每步切换时整块面板重新入场，读起来是「翻到下一题」。 */
  useEffect(() => {
    const root = rootRef.current
    if (!root || inspect.frozen) return
    const q = gsap.utils.selector(root)
    const tl = gsap
      .timeline()
      .from(q('.choose__title'), { autoAlpha: 0, y: 16, duration: 0.6, ease: 'power3.out' })
      .from(
        q('.choose__opt'),
        { autoAlpha: 0, y: 22, scale: 0.94, duration: 0.55, stagger: 0.07, ease: 'back.out(1.4)' },
        '-=0.35',
      )
    return () => {
      tl.kill()
    }
  }, [step])

  const advance = (next: Step): void => {
    // 点完给 260ms 让选中态被看见，再翻页
    window.setTimeout(() => setStep(next), 260)
  }

  return (
    <div
      className="choose"
      ref={rootRef}
      data-recipient={recipient ?? undefined}
      data-skin={step === 'style' ? style : undefined}
    >
      <header className="choose__head">
        <div className="choose__dots" aria-hidden>
          {(['recipient', 'purpose', 'style'] as Step[]).map((s) => (
            <i key={s} className={s === step ? 'is-on' : undefined} />
          ))}
        </div>
        <h2 className="choose__title">{STEP_TITLE[step]}</h2>
        <p className="choose__gift">
          一件<strong>{category}</strong>
          {recipient && ` · 送${RECIPIENTS.find((r) => r.id === recipient)?.label}`}
          {purpose && ` · ${PURPOSES.find((p) => p.id === purpose)?.short}`}
        </p>
      </header>

      {step === 'recipient' && (
        <div className="choose__grid choose__grid--cards">
          {RECIPIENTS.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`choose__opt choose__card${recipient === r.id ? ' is-on' : ''}`}
              style={{ '--card-tint': r.tint } as React.CSSProperties}
              onClick={() => {
                setRecipient(r.id)
                advance('purpose')
              }}
            >
              <span className="choose__card-motif">
                <Motif id={r.id} />
              </span>
              <span className="choose__card-label">{r.label}</span>
              <span className="choose__card-sub">{r.motif}</span>
            </button>
          ))}
        </div>
      )}

      {step === 'purpose' && (
        <div className="choose__grid choose__grid--orbs">
          {PURPOSES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`choose__opt choose__orb${purpose === p.id ? ' is-on' : ''}`}
              onClick={() => {
                setPurpose(p.id)
                advance('style')
              }}
            >
              <span className="choose__orb-glow" aria-hidden />
              <span className="choose__orb-label">{p.label}</span>
            </button>
          ))}
        </div>
      )}

      {step === 'style' && (
        <div className="choose__styles">
          {P0.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`choose__opt choose__style${style === s.id ? ' is-on' : ''}`}
              onClick={() => setStyle(s.id)}
            >
              <span className="choose__style-name">{s.label}</span>
              <span className="choose__style-sample">{s.sample}</span>
              <span className="choose__style-visual">{s.visual}</span>
            </button>
          ))}
        </div>
      )}

      <footer className="choose__foot">
        {step === 'style' ? (
          <button type="button" className="choose__cta" onClick={() => setAct('forge')}>
            就这么写
          </button>
        ) : (
          <p className="choose__hint">
            {step === 'recipient' ? '点一张卡，整片星河会跟着换色' : '选一个，看天空怎么变'}
          </p>
        )}
      </footer>
    </div>
  )
}
