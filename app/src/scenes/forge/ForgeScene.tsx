import { useEffect, useMemo, useRef } from 'react'
import gsap from 'gsap'
import { PURPOSES, RECIPIENTS } from '@/design/catalog'
import { pickPoem } from '@/copy/poems'
import { inspect } from '@/dev/inspect'
import { useFlow } from '@/state/flow'
import type { GalaxyStage } from '@/scenes/portal/GalaxyStage'
import './forge.css'

/** 每个文风自带的意象词，炼诗时从远处飞入。 */
const STYLE_WORDS: Record<string, string[]> = {
  guofeng: ['月光', '星河', '岁岁', '清光', '长安', '相许'],
  fafeng: ['郑重', '申请', '审核', '通过', '立即', '执行'],
  galgame: ['好感度', '隐藏剧情', '已解锁', '羁绊', '存档', 'YES'],
}

interface Chip {
  text: string
  /** true = AI 补的词，用金色区分。这是「AI 感可见」最便宜也最有效的一招。 */
  fromAI: boolean
  angle: number
  radius: number
}

export function ForgeScene({ stage }: { stage: GalaxyStage | null }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const category = useFlow((s) => s.category)
  const recipient = useFlow((s) => s.recipient)
  const purpose = useFlow((s) => s.purpose)
  const style = useFlow((s) => s.style)
  const setAct = useFlow((s) => s.setAct)

  const poem = useMemo(
    () => pickPoem(recipient ?? 'lover', purpose ?? 'confess', style, category),
    [recipient, purpose, style, category],
  )

  /** 用户给的料（品类字 + 对象 + 目的）在内圈，AI 补的意象词在外圈。 */
  const chips = useMemo<Chip[]>(() => {
    const mine = [
      ...category.split(''),
      RECIPIENTS.find((r) => r.id === recipient)?.label ?? '恋人',
      PURPOSES.find((p) => p.id === purpose)?.short ?? '表白',
    ]
    const ai = STYLE_WORDS[style] ?? STYLE_WORDS.guofeng
    const total = mine.length + ai.length
    return [
      ...mine.map((text, i) => ({
        text,
        fromAI: false,
        angle: (i / mine.length) * 360,
        radius: 74,
      })),
      ...ai.map((text, i) => ({
        text,
        fromAI: true,
        angle: (i / ai.length) * 360 + 180 / total,
        radius: 120,
      })),
    ]
  }, [category, recipient, purpose, style])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const q = gsap.utils.selector(root)

    // 定格模式：直接停在成诗后的画面
    if (inspect.frozen) {
      gsap.set(q('.forge__cloud'), { autoAlpha: 0 })
      gsap.set(q('.forge__line'), { autoAlpha: 1, y: 0 })
      gsap.set(q('.forge__ink'), { scale: 1, autoAlpha: 1 })
      gsap.set(q('.forge__seal'), { autoAlpha: 1, scale: 1 })
      if (stage) {
        stage.intro.value = 1
        stage.renderer.renderOnce(inspect.at)
      }
      return
    }

    const tl = gsap.timeline()

    // 一幕 · 料从中心炸开
    tl.from(q('.forge__chip'), {
      x: 0,
      y: 0,
      scale: 0,
      autoAlpha: 0,
      duration: 0.75,
      stagger: 0.03,
      ease: 'back.out(2)',
    })
      // 二幕 · 词云加速旋转（转速由 CSS 动画负责，这里只推快慢）
      .to(q('.forge__cloud'), { '--spin': 1, duration: 0.6 }, '-=0.2')
      // 三幕 · 云收拢，诗行逐句落位
      .to(q('.forge__cloud'), { scale: 0.35, autoAlpha: 0, duration: 0.7, ease: 'power2.in' }, '+=0.9')
      .to(q('.forge__ink'), { scale: 1, autoAlpha: 1, duration: 0.9, ease: 'power2.out' }, '-=0.45')
      .from(
        q('.forge__title'),
        { autoAlpha: 0, y: 18, duration: 0.5, ease: 'power3.out' },
        '-=0.5',
      )
      .to(
        q('.forge__line'),
        { autoAlpha: 1, y: 0, duration: 0.42, stagger: 0.13, ease: 'power3.out' },
        '-=0.25',
      )
      // 四幕 · 印章落下 + 轻微震屏
      .to(q('.forge__seal'), { autoAlpha: 1, scale: 1, duration: 0.28, ease: 'back.out(3)' })
      .to(
        root,
        { x: 4, duration: 0.06, repeat: 3, yoyo: true, ease: 'none' },
        '-=0.12',
      )
      .set(root, { x: 0 })
      .call(() => setAct('result'), undefined, '+=0.55')

    /**
     * 兜底：gsap 的 ticker 走 rAF，页面被切到后台时会停。
     * 现场演示时用户一旦切走再切回来，就会卡在炼诗这一幕。
     * 用一个不依赖 rAF 的定时器保证一定会走到结果页。
     */
    const failsafe = window.setTimeout(() => setAct('result'), 9000)

    return () => {
      tl.kill()
      window.clearTimeout(failsafe)
    }
  }, [stage, setAct, chips])

  return (
    <div className="forge" ref={rootRef} data-skin={style}>
      <p className="forge__status">AI 正在炼诗</p>

      <div className="forge__stage">
        {/* 词云 */}
        <div className="forge__cloud">
          {chips.map((chip, i) => (
            <span
              key={`${chip.text}-${i}`}
              className={`forge__chip${chip.fromAI ? ' is-ai' : ''}`}
              style={
                {
                  '--angle': `${chip.angle}deg`,
                  '--radius': `calc(${chip.radius} * var(--su))`,
                } as React.CSSProperties
              }
            >
              <span className="forge__chip-text">{chip.text}</span>
            </span>
          ))}
        </div>

        {/* 墨迹晕开 + 诗 */}
        <div className="forge__ink" aria-hidden />
        <div className="forge__poem">
          <h3 className="forge__title">{poem.title}</h3>
          {poem.lines.map((line, i) => (
            <p key={i} className="forge__line">
              {line}
            </p>
          ))}
          <span className="forge__seal" aria-hidden>
            七夕
          </span>
        </div>
      </div>

      <p className="forge__legend">
        <i /> 你给的
        <i className="is-ai" /> AI 补的
      </p>
    </div>
  )
}
