import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { quatrefoilPath } from '@/design/shapes'
import { readScreenshot, useFlow } from '@/state/flow'
import { renderSample, SAMPLES, type SampleSpec } from '@/dev/sampleShots'
import type { GalaxyStage } from './GalaxyStage'
import './portal.css'

/** 海棠窗轮廓：外框与内框同形不同径，做出参考海报里的双线开窗。 */
const OUTER_PATH = quatrefoilPath(96)
const INNER_PATH = quatrefoilPath(87)

interface Props {
  stage: GalaxyStage | null
}

export function PortalScene({ stage }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const screenshot = useFlow((s) => s.screenshot)
  const setScreenshot = useFlow((s) => s.setScreenshot)
  const setAct = useFlow((s) => s.setAct)
  const setKnownCategory = useFlow((s) => s.setKnownCategory)
  const [error, setError] = useState<string | null>(null)

  /**
   * GL 舞台就绪后，把「天空曝光」和「文字入场」编进同一条时间轴。
   * 两条独立时间轴会在慢设备上错开半秒，所以必须共享起点。
   */
  useEffect(() => {
    const root = rootRef.current
    if (!stage || !root) return

    const q = gsap.utils.selector(root)

    // 静帧模式：?intro=1 直接停在最终画面（截图核对 / 客户想先看成品态）
    const params = new URLSearchParams(location.search)
    const intro = params.get('intro')
    if (intro !== null) {
      stage.freeze(Number(intro), Number(params.get('at') ?? 6))
      return
    }

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
    tl.to(stage.intro, { value: 1, duration: 2.6, ease: 'power2.out' }, 0)
      .from(q('.portal__eyebrow'), { autoAlpha: 0, y: 14, duration: 1.0 }, 0.45)
      .from(q('.portal__title-sm'), { autoAlpha: 0, y: 18, duration: 1.0 }, 0.7)
      .from(
        q('.portal__title-lg'),
        { autoAlpha: 0, y: 26, filter: 'blur(10px)', duration: 1.3 },
        0.85,
      )
      .from(q('.portal__sub'), { autoAlpha: 0, y: 14, duration: 1.0 }, 1.25)
      .from(
        q('.portal__gate'),
        { autoAlpha: 0, scale: 0.72, duration: 1.4, ease: 'back.out(1.6)' },
        1.45,
      )
      .from(q('.portal__foot'), { autoAlpha: 0, duration: 1.0 }, 2.05)

    return () => {
      tl.kill()
    }
  }, [stage])

  const handlePick = (): void => {
    setError(null)
    inputRef.current?.click()
  }

  /** 截图落位 → 窗内亮出来 → 整幕交棒给第1幕。手动选图和示例图共用这条路。 */
  const accept = async (file: File): Promise<void> => {
    try {
      setScreenshot(await readScreenshot(file))
      const root = rootRef.current
      if (!root) return
      const q = gsap.utils.selector(root)
      gsap
        .timeline()
        .fromTo(
          q('.portal__shot'),
          { autoAlpha: 0, scale: 1.14 },
          { autoAlpha: 1, scale: 1, duration: 0.7, ease: 'power3.out' },
        )
        .to(q('.portal__head, .portal__foot'), { autoAlpha: 0, duration: 0.5 }, 0.25)
        .to(q('.portal__gate'), { scale: 1.06, duration: 0.6, ease: 'power2.inOut' }, 0.3)
        .to(q('.portal'), { autoAlpha: 0, duration: 0.45 }, 0.85)
        .call(() => setAct('awaken'))
      // 兜底：gsap 走 rAF，页面切后台就停。这条保证一定会进第1幕。
      window.setTimeout(() => setAct('awaken'), 2200)
    } catch {
      setError('这张图读不出来，换一张试试')
    }
  }

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    // 先清空 value，否则连续选同一张图不会再触发 change
    event.target.value = ''
    if (file) {
      setKnownCategory(null) // 真实上传：品类未知，交给启发式 + 用户确认
      await accept(file)
    }
  }

  const handleSample = async (spec: SampleSpec): Promise<void> => {
    setError(null)
    setKnownCategory(spec.category)
    await accept(await renderSample(spec))
  }

  return (
    <div className="portal" ref={rootRef}>
      <header className="portal__head">
        <p className="portal__eyebrow">抖音商城 · 七夕</p>
        <p className="portal__title-sm">AI 七 夕</p>
        <h1 className="portal__title-lg">礼物炼诗局</h1>
        <p className="portal__sub">
          上传一张购物截图
          <br />
          让 AI 把它炼成一首诗
        </p>
      </header>

      <button
        className="portal__gate"
        type="button"
        onClick={handlePick}
        aria-label="投递你的心意，上传购物截图"
      >
        <span className="portal__halo" aria-hidden />

        <svg className="portal__window" viewBox="-100 -100 200 200" aria-hidden>
          <defs>
            <clipPath id="qxWindow">
              <path d={INNER_PATH} />
            </clipPath>
            <radialGradient id="qxFill" cx="50%" cy="40%" r="66%">
              <stop offset="0%" stopColor="rgb(255 240 210 / 20%)" />
              <stop offset="55%" stopColor="rgb(210 170 240 / 11%)" />
              <stop offset="100%" stopColor="rgb(120 95 190 / 22%)" />
            </radialGradient>
          </defs>

          <path d={INNER_PATH} fill="url(#qxFill)" />
          {screenshot && (
            <image
              className="portal__shot"
              href={screenshot.url}
              x="-100"
              y="-100"
              width="200"
              height="200"
              preserveAspectRatio="xMidYMid slice"
              clipPath="url(#qxWindow)"
            />
          )}

          <path className="portal__frame portal__frame--outer" d={OUTER_PATH} />
          <path className="portal__frame portal__frame--inner" d={INNER_PATH} />
        </svg>

        {!screenshot && (
          <span className="portal__glyph" aria-hidden>
            <svg viewBox="0 0 44 44">
              <path d="M22 30V13" />
              <path d="M14.5 20.5 22 12.5l7.5 8" />
              <path d="M11 33h22" />
            </svg>
          </span>
        )}

        <span className="portal__gate-label">
          {screenshot ? '心意已投递' : '投递你的心意'}
        </span>
      </button>

      <footer className="portal__foot">
        {error ? (
          <p className="portal__error">{error}</p>
        ) : (
          <p>支持任意购物截图 · 全程约 30 秒</p>
        )}
        {/* 手边没有截图也能立刻走完整流程 —— 分享给客户时这条路比上传更常用 */}
        <div className="portal__samples">
          <span>没有截图？试试</span>
          {SAMPLES.map((spec) => (
            <button key={spec.key} type="button" onClick={() => void handleSample(spec)}>
              {spec.label}
            </button>
          ))}
        </div>
      </footer>

      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} />
    </div>
  )
}
