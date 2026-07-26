import type { PurposeId, RecipientId, StyleId } from '@/design/catalog'
import type { Word, WordWeights } from './words'

/**
 * 「读星」—— 把用户捞到的七枚字读成一份心意。
 *
 * 用户以为自己只是在捞好看的字，实际上每一枚都带隐藏倾向。
 * 这里把倾向加总，读出送给谁 / 想说什么 / 什么口气，
 * 再据此连出一幅只属于这次的星官。
 *
 * 「它怎么知道」的那一下就发生在这里 —— 所以读出来的结果必须
 * 真的跟着捞的字变，不能是装样子。
 */

export interface Reading {
  recipient: RecipientId
  purpose: PurposeId
  style: StyleId
  /** 星官名，两个字，从捞到的字里挑 */
  name: string
  /** 心意类型，那句「你是……的人」 */
  persona: string
  /** 稀有度 0–3，决定几颗星 */
  rarity: number
  /** 签的成色 */
  fortune: string
  /** 星点位置（byWidth 空间的相对坐标，-0.5…0.5） */
  stars: { x: number; y: number; text: string }[]
}

const RECIPIENTS: RecipientId[] = ['lover', 'bestie', 'family', 'pet']
const PURPOSES: PurposeId[] = ['confess', 'surprise', 'gratitude', 'blessing']
/** 只有 P0 三风参与读星 —— 字库里也只为这三个定义了倾向。 */
type WeightedStyle = Extract<StyleId, 'guofeng' | 'fafeng' | 'galgame'>
const STYLES: WeightedStyle[] = ['guofeng', 'fafeng', 'galgame']

function sum(words: Word[], key: keyof WordWeights): number {
  return words.reduce((acc, w) => acc + (w.weights[key] ?? 0), 0)
}

/** 在一组候选里取权重最高的；全为 0 时回退到 fallback。 */
function dominant<T extends keyof WordWeights>(
  words: Word[],
  keys: T[],
  fallback: T,
): { key: T; score: number; total: number } {
  let best = fallback
  let bestScore = -1
  let total = 0
  for (const k of keys) {
    const s = sum(words, k)
    total += s
    if (s > bestScore) {
      bestScore = s
      best = k
    }
  }
  return { key: best, score: Math.max(bestScore, 0), total }
}

/** 字符串 → 稳定的 32 位种子。同一组字必须连出同一幅星官。 */
function seedOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 由种子驱动的确定性随机。 */
function rng(seed: number): () => number {
  let s = seed || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

/**
 * 星点布局：沿一条起伏的弧线撒开，再各自抖动。
 * 纯随机撒点会连成一团乱麻；沿弧线撒才有真实星官那种「一串」的走势。
 */
function layoutStars(words: Word[], seed: number): Reading['stars'] {
  const rand = rng(seed)
  const n = words.length
  // 整条弧的朝向和弯曲度都由种子决定 —— 所以每个人的星官形状不同
  const baseAngle = rand() * Math.PI * 2
  const curve = 0.5 + rand() * 1.6
  const spread = 0.30 + rand() * 0.10

  return words.map((w, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1)
    const along = (t - 0.5) * 2 // -1…1
    const a = baseAngle + along * curve
    const r = spread * (0.55 + 0.45 * Math.abs(along))
    return {
      x: Math.cos(a) * r + (rand() - 0.5) * 0.07,
      y: Math.sin(a) * r * 0.82 + (rand() - 0.5) * 0.07,
      text: w.text,
    }
  })
}

/** 心意类型：那句「你是……的人」。按「想说什么 × 什么口气」取。 */
const PERSONA: Record<string, string> = {
  'confess:guofeng': '月下不肯把话说完的人',
  'confess:fafeng': '喜欢起来毫无章法的人',
  'confess:galgame': '在心里反复读档的人',
  'surprise:guofeng': '把心事藏进袖中的人',
  'surprise:fafeng': '憋不住三秒的惊喜制造机',
  'surprise:galgame': '偷偷埋好支线的人',
  'gratitude:guofeng': '把陪伴写进岁岁的人',
  'gratitude:fafeng': '嘴上发疯心里踏实的人',
  'gratitude:galgame': '默默刷满好感度的人',
  'blessing:guofeng': '愿人间常有暖的人',
  'blessing:fafeng': '强制给人塞快乐的人',
  'blessing:galgame': '把幸福设成永久生效的人',
}

const FORTUNE_TIERS = ['小吉', '中吉', '上吉', '上上签']

/** 星官名：从捞到的字里挑两枚组成。优先「意象 + 情绪」，读起来才像星官。 */
function nameFrom(words: Word[], seed: number): string {
  const rand = rng(seed ^ 0x9e3779b9)
  const images = words.filter((w) => w.kind === 'image' || w.kind === 'object')
  const feelings = words.filter((w) => w.kind === 'feeling')

  const pick = <T,>(arr: T[], fb: T[]): T => {
    const src = arr.length > 0 ? arr : fb
    return src[Math.floor(rand() * src.length)]
  }
  const a = pick(images, words)
  const b = pick(
    feelings.filter((w) => w.text !== a.text),
    words.filter((w) => w.text !== a.text),
  )
  // 标点和符号不适合入名，退回第一个汉字
  const clean = (w: Word): string => (/[一-龥]/.test(w.text) ? w.text : '')
  const first = clean(a) || words.map(clean).find(Boolean) || '星'
  const second =
    clean(b) ||
    words
      .map(clean)
      .filter((c) => c && c !== first)
      .shift() ||
    '河'
  return first + second
}

export function readCatch(words: Word[]): Reading {
  const key = words.map((w) => w.text).join('')
  const seed = seedOf(key)

  const r = dominant(words, RECIPIENTS, 'lover')
  const p = dominant(words, PURPOSES, 'confess')
  const s = dominant(words, STYLES, 'guofeng')

  // 稀有度：捞到的稀有字越多、倾向越纯粹，成色越好
  const rarityScore = words.reduce((a, w) => a + w.rarity, 0)
  const purity = s.total > 0 ? s.score / s.total : 0
  const composite = rarityScore / (words.length * 3) + purity * 0.6
  const rarity = Math.min(3, Math.floor(composite * 3.4))

  return {
    recipient: r.key,
    purpose: p.key,
    style: s.key,
    name: nameFrom(words, seed),
    persona: PERSONA[`${p.key}:${s.key}`] ?? PERSONA['confess:guofeng'],
    rarity,
    fortune: FORTUNE_TIERS[rarity],
    stars: layoutStars(words, seed),
  }
}
