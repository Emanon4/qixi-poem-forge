/**
 * 玩法目录 —— 全部照抄创意文档，一处定义，选择页/文案层/海报层共用。
 * 任何新增选项只改这里，不改组件。
 */

// ── 送给谁 ──────────────────────────────────────────────────
export const RECIPIENTS = [
  { id: 'lover', label: '恋人', motif: '两颗靠近的星', palette: '桃粉 · 暮紫 · 月白', tint: '#f2a5bc' },
  { id: 'bestie', label: '闺蜜', motif: '碰杯', palette: '奶油黄 · 樱花粉 · 薄荷绿', tint: '#f7d9a1' },
  { id: 'family', label: '家人', motif: '暖灯', palette: '米白 · 暖黄 · 原木色', tint: '#efc77a' },
  { id: 'pet', label: '毛茸茸', motif: '发光爪印', palette: '奶油白 · 奶茶色 · 燕麦色', tint: '#d9b48f' },
] as const

export type RecipientId = (typeof RECIPIENTS)[number]['id']

// ── 送礼目的 ────────────────────────────────────────────────
export const PURPOSES = [
  { id: 'confess', label: '好想跟你表白', short: '表白' },
  { id: 'surprise', label: '偷偷送个惊喜', short: '惊喜' },
  { id: 'gratitude', label: '感谢一路陪伴', short: '陪伴' },
  { id: 'blessing', label: '希望你幸福', short: '祝福' },
] as const

export type PurposeId = (typeof PURPOSES)[number]['id']

// ── 心选文风 ────────────────────────────────────────────────
/** P0 = demo 必做（深做动效皮肤）；P1/P2 = 静帧示意，正式版再补。 */
export const STYLES = [
  {
    id: 'guofeng',
    label: '古风七言',
    tier: 'P0',
    visual: '月下诗笺 · 宣纸纹理 · 月亮 · 树影',
    sample: '一缕清光绕玉环，一心相许入长安。',
  },
  {
    id: 'fafeng',
    label: '发疯文学',
    tier: 'P0',
    visual: '大字报 · 贴纸 · 表情包 · 手写体',
    sample: '本人郑重申请：以后所有时间优先分配给你。',
  },
  {
    id: 'galgame',
    label: '恋爱 Galgame',
    tier: 'P0',
    visual: '恋爱游戏界面 · UI 框 · 好感度条 · 选项按钮',
    sample: '【系统提示】检测到特殊对象：你。好感度：99%',
  },
  {
    id: 'idol',
    label: '偶像剧台词',
    tier: 'P1',
    visual: '台偶截图感 · 胶片 · 夜景灯光 · 车站雨夜',
    sample: '因为喜欢你这件事，每一天都很确定。',
  },
  {
    id: 'jinjiang',
    label: '晋江文学',
    tier: 'P1',
    visual: '小说封面感 · 书签 · 流光 · 羽毛笔',
    sample: '我偷偷藏了很久的偏心，都留给你。',
  },
  {
    id: 'chuuni',
    label: '中二二次元',
    tier: 'P1',
    visual: '二次元动漫 · 星轨 · 魔法阵',
    sample: '以星辰为证，以月光为印。七夕羁绊值 +999！',
  },
  {
    id: 'haiku',
    label: '日式俳句',
    tier: 'P2',
    visual: '日剧氛围 · 樱花 · 阳光 · 窗台',
    sample: '灯下添新茶，岁月慢慢走远，愿你常欢喜。',
  },
  {
    id: 'emoji',
    label: 'Emoji 抽象文学',
    tier: 'P2',
    visual: '糖果色 · emoji 漂浮 · 彩色气泡',
    sample: '🌷🤝✨＝👭 你是我的快乐 buff',
  },
] as const

export type StyleId = (typeof STYLES)[number]['id']

/** 有完整动效皮肤的文风。tokens.css 里也只为这三个定义了 [data-skin]。 */
export const P0_STYLE_IDS = STYLES.filter((s) => s.tier === 'P0').map((s) => s.id)

export function styleById(id: StyleId) {
  return STYLES.find((s) => s.id === id)!
}

export function recipientById(id: RecipientId) {
  return RECIPIENTS.find((r) => r.id === id)!
}

export function purposeById(id: PurposeId) {
  return PURPOSES.find((p) => p.id === id)!
}
