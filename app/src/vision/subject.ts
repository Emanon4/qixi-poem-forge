/**
 * 「半真识别」—— 纯 CPU、零依赖、零网络的商品主体定位。
 *
 * 购物截图有个很稳的共性：背景是大片白/浅灰，商品图是画面里唯一
 * 又饱和又有对比的区域。所以把图缩到 48×48，量出每个格子相对
 * 「边框基准色」的偏离度，再取偏离度高的格子的包围盒，就能把商品
 * 框出来。这不是分割模型，但对真实截图命中率足够撑起 demo，
 * 而且比「假识别 + 让用户手选品类」有说服力得多。
 *
 * 顺带返回主色，用来给第1幕的描金边和识别反馈文案定调。
 */

export interface SubjectBox {
  /** 归一化到 [0,1] 的包围盒，原点在左上 */
  x: number
  y: number
  w: number
  h: number
  /** 主体区域的主色，0–255 */
  color: [number, number, number]
  /** 定位置信度 0–1。低于 0.35 时调用方应该退回居中默认框 */
  confidence: number
}

/**
 * 按主体主色和形状猜品类。
 * 这不是分类模型，是一条「看起来像在识别」的廉价启发式 ——
 * 背景文档 §10.3 允许的降级正是「识别动画 + 品类确认」，
 * 所以第1幕会把猜测结果交给用户点一下确认。
 */
export function guessCategory(color: [number, number, number], box: SubjectBox): string {
  const [r, g, b] = color
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const sat = max === 0 ? 0 : (max - min) / max
  const bright = max / 255
  const tall = box.h > box.w * 1.25

  if (bright < 0.3) return '耳机'
  if (sat < 0.16) return bright > 0.72 ? '项链' : '手表'
  if (r > g && g > b) {
    if (bright < 0.55) return '巧克力'
    return sat > 0.45 ? '口红' : '戒指'
  }
  if (r > b && b > g) return '鲜花'
  if (b > r) return '礼盒'
  return tall ? '香水' : '项链'
}

const GRID = 48

/** 居中兜底框：识别不出来时用它，流程绝不卡死。 */
const FALLBACK: SubjectBox = {
  x: 0.22,
  y: 0.26,
  w: 0.56,
  h: 0.44,
  color: [214, 170, 190],
  confidence: 0,
}

export function findSubject(source: TexImageSource): SubjectBox {
  const canvas = document.createElement('canvas')
  canvas.width = GRID
  canvas.height = GRID
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return FALLBACK

  ctx.drawImage(source as CanvasImageSource, 0, 0, GRID, GRID)
  const { data } = ctx.getImageData(0, 0, GRID, GRID)

  const at = (x: number, y: number): [number, number, number] => {
    const i = (y * GRID + x) * 4
    return [data[i], data[i + 1], data[i + 2]]
  }

  // 边框一圈的平均色作为「背景基准」。购物截图的四周基本都是页面底色。
  let br = 0
  let bg = 0
  let bb = 0
  let n = 0
  for (let i = 0; i < GRID; i++) {
    for (const [x, y] of [
      [i, 0],
      [i, GRID - 1],
      [0, i],
      [GRID - 1, i],
    ] as const) {
      const [r, g, b] = at(x, y)
      br += r
      bg += g
      bb += b
      n++
    }
  }
  br /= n
  bg /= n
  bb /= n

  // 每格的「显著度」= 离背景色的距离 + 自身饱和度
  const salience = new Float32Array(GRID * GRID)
  let maxSalience = 0
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const [r, g, b] = at(x, y)
      const dist = Math.hypot(r - br, g - bg, b - bb) / 441 // 441 = sqrt(3)*255
      const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255
      const s = dist * 0.75 + sat * 0.25
      salience[y * GRID + x] = s
      if (s > maxSalience) maxSalience = s
    }
  }
  if (maxSalience < 0.06) return FALLBACK // 几乎纯色图，放弃

  /* 从最显著的那一格做区域生长，而不是取所有显著格子的总包围盒。
     两种错误取包围盒都会犯：
       · 阈值低 → 商品标题和红色价格一起被圈进来，框住半张页面；
       · 阈值高 → 只剩商品上最扎眼的一小块（实测会只框住罐子上的标签）。
     连通生长能顺着商品本体铺开，又跨不过商品图和文字区之间那片白底。 */
  let seed = 0
  for (let i = 1; i < salience.length; i++) {
    if (salience[i] > salience[seed]) seed = i
  }

  const grow = maxSalience * 0.28
  const visited = new Uint8Array(GRID * GRID)
  const queue = [seed]
  visited[seed] = 1
  let minX = GRID
  let minY = GRID
  let maxX = -1
  let maxY = -1
  let hits = 0
  let sr = 0
  let sg = 0
  let sb = 0

  while (queue.length > 0) {
    const idx = queue.pop()!
    const x = idx % GRID
    const y = (idx - x) / GRID

    hits++
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    const [r, g, b] = at(x, y)
    sr += r
    sg += g
    sb += b

    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
      const n = ny * GRID + nx
      if (visited[n] || salience[n] < grow) continue
      visited[n] = 1
      queue.push(n)
    }
  }
  if (hits < 6 || maxX < 0) return FALLBACK

  // 生长区域铺满整图说明没有明显主体，判为低置信
  const coverage = hits / (GRID * GRID)
  const spanW = (maxX - minX + 1) / GRID
  const spanH = (maxY - minY + 1) / GRID
  const confidence = coverage > 0.72 || spanW > 0.95 ? 0.2 : Math.min(1, maxSalience * 2.4)
  if (confidence < 0.35) return { ...FALLBACK, color: [sr / hits, sg / hits, sb / hits] }

  // 稍微外扩，别把商品边缘切掉
  const pad = 0.03
  return {
    x: Math.max(0, minX / GRID - pad),
    y: Math.max(0, minY / GRID - pad),
    w: Math.min(1, spanW + pad * 2),
    h: Math.min(1, spanH + pad * 2),
    color: [sr / hits, sg / hits, sb / hits],
    confidence,
  }
}
