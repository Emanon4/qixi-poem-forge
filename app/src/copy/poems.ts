import type { PurposeId, RecipientId, StyleId } from '@/design/catalog'

/**
 * 文案库 —— demo 阶段不打任何 AI 接口，诗全部本地生成。
 * 背景文档 §10.3 明确允许这一档降级：「文案库按 对象×目的×文风×品类 匹配」。
 * 「AI 感」由第3幕的炼诗动画产生，不由网络请求产生。
 *
 * 三层匹配：
 *   1 FEATURED  —— 品类也对得上时，出创意文档里那几首原文（客户会认出来是自己的例子）
 *   2 BY_PURPOSE_STYLE —— 目的 × 文风的模板，{gift} 填品类
 *   3 PET_VOICE —— 送宠物时整体换成宠物口吻
 */

export interface Poem {
  title: string
  lines: string[]
}

/** 品类。第1幕识别后给用户确认，两字词为主，好嵌进七言。 */
export const CATEGORIES = [
  '项链',
  '戒指',
  '手表',
  '香水',
  '口红',
  '鲜花',
  '礼盒',
  '巧克力',
  '耳机',
  '罐头',
] as const

export type Category = (typeof CATEGORIES)[number]

const fill = (poem: Poem, gift: string): Poem => ({
  title: poem.title.replaceAll('{gift}', gift),
  lines: poem.lines.map((line) => line.replaceAll('{gift}', gift)),
})

// ── 1. 创意文档原文（品类也命中时优先出）────────────────────
const FEATURED: Record<string, Poem> = {
  'lover:confess:guofeng:项链': {
    title: '赠卿星河引',
    lines: ['一缕清光绕玉环，', '一心相许入长安。', '愿将此物系君侧，', '岁岁相伴不相瞒。'],
  },
  'pet:blessing:guofeng:罐头': {
    title: '猫将军食罐歌',
    lines: ['一罐鱼香慰圣颜，', '三声喵喵胜万言。', '愿君日日盆中满，', '不抢纸箱也成仙。'],
  },
  'lover:gratitude:fafeng:手表': {
    title: '时间管理大师申请书',
    lines: [
      '本人郑重申请：',
      '以后所有时间',
      '优先分配给你。',
      '工作暂停想你 3 分钟，',
      '吃饭抽空想你 5 分钟，',
      '睡前必须想你直到入梦。',
      '审核结果：',
      '通过！立即执行！',
    ],
  },
  'lover:confess:galgame:礼盒': {
    title: '七夕恋爱事件开启',
    lines: [
      '【系统提示】',
      '检测到特殊对象：你。',
      '好感度：99%',
      '隐藏剧情已解锁：',
      '「想陪你吃很多饭」',
      '「想和你看很多风景」',
      '「想把未来章节，都写成我们」',
      '是否确认开启恋爱线？',
      '▶ YES',
    ],
  },
}

// ── 2. 目的 × 文风模板 ──────────────────────────────────────
const BY_PURPOSE_STYLE: Record<string, Poem> = {
  // 古风七言
  'confess:guofeng': {
    title: '赠卿星河引',
    lines: ['一缕清光绕{gift}，', '一心相许入长安。', '愿将此物系君侧，', '岁岁相伴不相瞒。'],
  },
  'surprise:guofeng': {
    title: '月下藏珍',
    lines: ['星桥暗度不曾言，', '偷把{gift}裹锦笺。', '待到灯前君启处，', '方知心事已多年。'],
  },
  'gratitude:guofeng': {
    title: '长相守',
    lines: ['朝朝共对一盏灯，', '{gift}相随不问程。', '纵是人间烟火事，', '有你便算好光景。'],
  },
  'blessing:guofeng': {
    title: '愿君安',
    lines: ['愿君岁岁得清欢，', '{gift}长伴不曾寒。', '但使心中常有暖，', '人间处处是春山。'],
  },

  // 发疯文学
  'confess:fafeng': {
    title: '紧急情况通报',
    lines: [
      '紧急通报：',
      '我对你的喜欢',
      '已超出可控范围。',
      '现决定用这{gift}',
      '向你正式宣战。',
      '投降请回复「好」。',
      '不投降也请回复「好」。',
    ],
  },
  'surprise:fafeng': {
    title: '突袭申请书',
    lines: [
      '本人申请：',
      '对你实施一次',
      '不讲道理的突袭。',
      '武器是这{gift}。',
      '预计后果：',
      '你会笑，',
      '我会更喜欢你。',
      '申请通过！立即执行！',
    ],
  },
  'gratitude:fafeng': {
    title: '时间管理大师申请书',
    lines: [
      '本人郑重申请：',
      '以后所有时间',
      '优先分配给你。',
      '{gift}负责计时，',
      '我负责一直在。',
      '审核结果：',
      '通过！立即执行！',
    ],
  },
  'blessing:fafeng': {
    title: '快乐强制派送通知',
    lines: [
      '通知：',
      '你的快乐额度已上调。',
      '本次随{gift}一并派送。',
      '不接受退货，',
      '不接受不开心。',
      '签收人：你。',
      '派送人：我。',
    ],
  },

  // 恋爱 Galgame
  'confess:galgame': {
    title: '七夕恋爱事件开启',
    lines: [
      '【系统提示】',
      '检测到特殊对象：你。',
      '好感度：99%',
      '获得道具：{gift}',
      '隐藏剧情已解锁：',
      '「想陪你吃很多饭」',
      '「想把未来章节，都写成我们」',
      '是否确认开启恋爱线？',
      '▶ YES',
    ],
  },
  'surprise:galgame': {
    title: '突发事件：惊喜来袭',
    lines: [
      '【剧情分支】',
      '你没走的那条路上，',
      '我埋了一个{gift}。',
      '好感度 +30',
      '成就解锁：',
      '「被偷偷记住的人」',
      '是否查看？',
      '▶ 当然要',
    ],
  },
  'gratitude:galgame': {
    title: '同行记录已更新',
    lines: [
      '【存档读取成功】',
      '共同游玩时长：很久',
      '共同结局达成：进行中',
      '本回合道具：{gift}',
      '羁绊等级 ↑',
      '「下一章，也一起吧。」',
      '▶ 继续',
    ],
  },
  'blessing:galgame': {
    title: '幸福值校准完成',
    lines: [
      '【系统广播】',
      '目标对象：你',
      '当前幸福值：偏低',
      '已注入{gift} ×1',
      '幸福值 → 满格',
      '本效果永久生效。',
      '▶ 收下',
    ],
  },
}

// ── 3. 送「毛茸茸」时整体换口吻 ──────────────────────────────
const PET_VOICE: Record<StyleId | string, Poem> = {
  guofeng: {
    title: '毛将军食俸歌',
    lines: ['一份{gift}慰圣颜，', '三声撒娇胜万言。', '愿君日日盆中满，', '不拆沙发也成仙。'],
  },
  fafeng: {
    title: '铲屎官述职报告',
    lines: [
      '述职报告：',
      '本季度已购入{gift}若干。',
      '主子满意度：未知。',
      '本人幸福度：拉满。',
      '下季度计划：',
      '继续买，继续被无视。',
      '汇报完毕，请赐一个头。',
    ],
  },
  galgame: {
    title: '主子好感度刷新',
    lines: [
      '【系统提示】',
      '已向主子投喂{gift}。',
      '好感度：+5（上限 10）',
      '解锁互动：「勉强让你摸一下」',
      '是否继续投喂？',
      '▶ 必须继续',
    ],
  },
}

export function pickPoem(
  recipient: RecipientId,
  purpose: PurposeId,
  style: StyleId,
  category: string,
): Poem {
  const featured = FEATURED[`${recipient}:${purpose}:${style}:${category}`]
  if (featured) return featured

  if (recipient === 'pet') {
    const petPoem = PET_VOICE[style] ?? PET_VOICE.guofeng
    return fill(petPoem, category)
  }

  const template =
    BY_PURPOSE_STYLE[`${purpose}:${style}`] ?? BY_PURPOSE_STYLE[`${purpose}:guofeng`]
  return fill(template, category)
}

/**
 * 第1幕识别完成后的情绪化反馈。
 * 背景文档反复强调不要冷冰冰报「识别到项链」，要给一句有情绪的话。
 */
const RECOGNITION_LINES: Record<string, string> = {
  项链: '它看起来像一句尚未说出口的喜欢。',
  戒指: '一个圈，把「以后」框在了里面。',
  手表: '你买的不是时间，是想一起度过的那部分。',
  香水: '气味会先到，然后你才想起是谁。',
  口红: '一支被反复挑选过的颜色，就是心意。',
  鲜花: '会枯的东西，才更像认真说出口的话。',
  礼盒: '还没打开，惊喜就已经在路上了。',
  巧克力: '甜是借口，想见你才是真的。',
  耳机: '想把你喜欢的声音，都塞进这一小块里。',
  罐头: '在它眼里，这就是整个世界的分量。',
}

export function recognitionLine(category: string): string {
  return RECOGNITION_LINES[category] ?? '它看起来像一句还没说出口的话。'
}
