/**
 * 字库 —— 《捞星记》的核心数据。
 *
 * 设计要点：每一枚字都**暗含维度倾向**。用户以为自己只是在捞好看的字，
 * 实际上捞的组合决定了送给谁、想说什么、用什么口气。
 * 最后 AI「读出」这些倾向 —— 这是整个体验里「它怎么知道」的那一下。
 *
 * 所以字不能是随便一堆好词：每一枚都要既独立成立（单看有味道），
 * 又在组合里指向明确。
 */

/** 四个隐藏维度。三个对应创意文档的三层选择，第四个是稀有度权重。 */
export interface WordWeights {
  /** 送给谁：lover / bestie / family / pet */
  lover?: number
  bestie?: number
  family?: number
  pet?: number
  /** 想说什么 */
  confess?: number
  surprise?: number
  gratitude?: number
  blessing?: number
  /** 什么口气 */
  guofeng?: number
  fafeng?: number
  galgame?: number
}

export interface Word {
  text: string
  /** 分组，决定在河里的视觉呈现 */
  kind: 'object' | 'image' | 'feeling' | 'tone'
  weights: WordWeights
  /** 稀有度 0–3。越高越少出现，捞到会让签的成色更好 */
  rarity: number
}

/** 七夕意象。这一组是「古典」的重心。 */
const IMAGE_WORDS: Word[] = [
  { text: '月', kind: 'image', weights: { guofeng: 3, lover: 1 }, rarity: 0 },
  { text: '星', kind: 'image', weights: { guofeng: 2, lover: 1 }, rarity: 0 },
  { text: '河', kind: 'image', weights: { guofeng: 3 }, rarity: 1 },
  { text: '桥', kind: 'image', weights: { guofeng: 3, lover: 2 }, rarity: 1 },
  { text: '鹊', kind: 'image', weights: { guofeng: 4, lover: 2 }, rarity: 2 },
  { text: '夜', kind: 'image', weights: { guofeng: 2 }, rarity: 0 },
  { text: '风', kind: 'image', weights: { guofeng: 2 }, rarity: 0 },
  { text: '露', kind: 'image', weights: { guofeng: 3 }, rarity: 2 },
  { text: '灯', kind: 'image', weights: { family: 3, guofeng: 1 }, rarity: 1 },
  { text: '窗', kind: 'image', weights: { family: 2, guofeng: 1 }, rarity: 1 },
  { text: '云', kind: 'image', weights: { guofeng: 2 }, rarity: 0 },
  { text: '霜', kind: 'image', weights: { guofeng: 3 }, rarity: 2 },
  { text: '砂', kind: 'image', weights: { guofeng: 2, galgame: 1 }, rarity: 3 },
  { text: '渡', kind: 'image', weights: { guofeng: 4, lover: 1 }, rarity: 3 },
]

/** 情绪。这一组决定「为什么送」。 */
const FEELING_WORDS: Word[] = [
  { text: '想', kind: 'feeling', weights: { confess: 3, lover: 2 }, rarity: 0 },
  { text: '念', kind: 'feeling', weights: { confess: 3, guofeng: 1 }, rarity: 1 },
  { text: '等', kind: 'feeling', weights: { confess: 2, gratitude: 1 }, rarity: 1 },
  { text: '藏', kind: 'feeling', weights: { surprise: 4 }, rarity: 2 },
  { text: '偷', kind: 'feeling', weights: { surprise: 4, fafeng: 1 }, rarity: 2 },
  { text: '暖', kind: 'feeling', weights: { family: 3, gratitude: 2 }, rarity: 0 },
  { text: '陪', kind: 'feeling', weights: { gratitude: 4 }, rarity: 1 },
  { text: '久', kind: 'feeling', weights: { gratitude: 3, guofeng: 1 }, rarity: 1 },
  { text: '愿', kind: 'feeling', weights: { blessing: 4, guofeng: 1 }, rarity: 0 },
  { text: '安', kind: 'feeling', weights: { blessing: 3, family: 2 }, rarity: 1 },
  { text: '甜', kind: 'feeling', weights: { bestie: 2, surprise: 1 }, rarity: 0 },
  { text: '疯', kind: 'feeling', weights: { fafeng: 5, bestie: 2 }, rarity: 2 },
  { text: '痴', kind: 'feeling', weights: { confess: 3, fafeng: 2 }, rarity: 3 },
  { text: '嗷', kind: 'feeling', weights: { pet: 5, fafeng: 2 }, rarity: 3 },
  { text: '乖', kind: 'feeling', weights: { pet: 4 }, rarity: 2 },
]

/** 语气。这一组是「现代」的重心，决定口气跑向发疯还是 Galgame。 */
const TONE_WORDS: Word[] = [
  { text: '也', kind: 'tone', weights: { guofeng: 2 }, rarity: 0 },
  { text: '罢', kind: 'tone', weights: { guofeng: 3 }, rarity: 2 },
  { text: '呀', kind: 'tone', weights: { fafeng: 2, bestie: 1 }, rarity: 0 },
  { text: '！', kind: 'tone', weights: { fafeng: 4 }, rarity: 0 },
  { text: '？', kind: 'tone', weights: { galgame: 2, surprise: 1 }, rarity: 1 },
  { text: '…', kind: 'tone', weights: { galgame: 2, confess: 1 }, rarity: 1 },
  { text: '▶', kind: 'tone', weights: { galgame: 5 }, rarity: 2 },
  { text: '％', kind: 'tone', weights: { galgame: 4 }, rarity: 3 },
  { text: '嘛', kind: 'tone', weights: { fafeng: 3 }, rarity: 1 },
  { text: '哦', kind: 'tone', weights: { bestie: 2, fafeng: 1 }, rarity: 0 },
]

/**
 * 由商品品类派生的「物」字。
 * 这几枚是真正来自用户截图的，视觉上要和别的字区分开 ——
 * 「这是我的截图变出来的字」是整个体验的私人感来源。
 */
const OBJECT_WORDS: Record<string, string[]> = {
  项链: ['链', '金', '颈', '坠'],
  戒指: ['环', '指', '圈', '约'],
  手表: ['针', '时', '腕', '刻'],
  香水: ['香', '雾', '瓶', '息'],
  口红: ['朱', '唇', '色', '印'],
  鲜花: ['花', '枝', '瓣', '露'],
  礼盒: ['盒', '结', '缎', '启'],
  巧克力: ['甜', '糖', '融', '苦'],
  耳机: ['音', '声', '耳', '静'],
  罐头: ['罐', '鱼', '香', '食'],
}

export function objectWordsFor(category: string): Word[] {
  const texts = OBJECT_WORDS[category] ?? ['物', '心', '意', '赠']
  return texts.map((text) => ({
    text,
    kind: 'object' as const,
    // 物字不带倾向：它们是「你的」，不该替你决定说什么
    weights: {},
    rarity: 1,
  }))
}

/**
 * 组一河的字。
 * 固定放入全部物字（用户必须能看到自己的东西），其余按稀有度加权抽样。
 */
export function buildRiver(category: string, total = 26): Word[] {
  const objects = objectWordsFor(category)
  const pool = [...IMAGE_WORDS, ...FEELING_WORDS, ...TONE_WORDS]

  // 稀有的少出现：权重 = 4 - rarity
  const weighted: Word[] = []
  for (const w of pool) {
    const copies = Math.max(1, 4 - w.rarity)
    for (let i = 0; i < copies; i++) weighted.push(w)
  }

  const picked = new Map<string, Word>()
  let guard = 0
  while (picked.size < total - objects.length && guard < 4000) {
    guard++
    const w = weighted[Math.floor(Math.random() * weighted.length)]
    picked.set(w.text, w)
  }

  const river = [...objects, ...picked.values()]
  // 洗牌，物字不要总在开头
  for (let i = river.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[river[i], river[j]] = [river[j], river[i]]
  }
  return river
}

export const RIVER_CATCH_TARGET = 7
