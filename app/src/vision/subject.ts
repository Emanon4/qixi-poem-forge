/**
 * 「半真识别」—— 纯 CPU、零依赖、零网络的商品主体定位。
 *
 * 两阶段，因为单看像素永远分不清「商品」和「文字」：
 *
 *   一、找商品图所在的**行带**。判别特征是稠密度 ——
 *       商品照片会把整行填满，而标题/价格/规格这些文字行是稀疏的
 *       （大片白底 + 少量笔画）。取最长的稠密行带。
 *   二、只在这条带**之内**做区域生长找主体，永远不会跑到价格区去。
 *
 * 第一版只算「离背景色的距离 + 饱和度」，被商品图自带的浅色底整块骗过；
 * 加了局部梯度之后，又被红色价格文字骗过 —— 文字的梯度和饱和度
 * 恰恰是全图最高的。所以判别必须落在「稠密 vs 稀疏」这个维度上。
 *
 * 这不是分割模型，但对真实购物截图的版式命中率足够撑起 demo。
 * 顺带返回主色，给第1幕的描金边和识别反馈文案定调。
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

const GRID = 56

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

  // ── 页面底色：取四条边的平均。购物截图四周基本都是页面白 ──
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

  const distAt = (x: number, y: number): number => {
    const [r, g, b] = at(x, y)
    return Math.hypot(r - br, g - bg, b - bb) / 441 // 441 = sqrt(3)*255
  }

  /* ── 一、找商品图的行带 ──
     判据用**行内中位数**，不是「偏离底色的格子占比」。
     占比会被中文标题骗过去：一行汉字的笔画能让大半格子都偏离底色。
     中位数则很干脆 —— 文字行大部分格子仍是白底，中位数≈0；
     照片行整行都偏离底色，中位数显著为正。 */
  const density = new Float32Array(GRID)
  const row = new Float32Array(GRID)
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) row[x] = distAt(x, y)
    const sorted = Array.from(row).sort((p, q) => p - q)
    density[y] = sorted[GRID >> 1]
  }

  const DENSE = 0.03
  const searchTo = Math.floor(GRID * 0.8) // 大图基本不会出现在页面最底部
  let bandTop = -1
  let bandBottom = -1
  let runStart = -1
  for (let y = 0; y <= searchTo; y++) {
    if (density[y] >= DENSE) {
      if (runStart < 0) runStart = y
      if (y - runStart > bandBottom - bandTop) {
        bandTop = runStart
        bandBottom = y
      }
    } else {
      runStart = -1
    }
  }

  // 没找到稠密带（比如商品图也是纯白底）→ 退回电商详情页大图的常见位置
  if (bandTop < 0 || bandBottom - bandTop < 6) {
    bandTop = Math.floor(GRID * 0.08)
    bandBottom = Math.floor(GRID * 0.62)
  }

  /* ── 二、只在带内找主体 ──
     上下各裁掉两行：商品图区域和页面白底的交界本身是一条**全宽的高梯度线**，
     不裁的话它会被当成最显著的东西，包围盒直接撑满整幅宽度。
     那是容器的边，不是商品。 */
  const innerTop = Math.min(bandTop + 2, bandBottom)
  const innerBottom = Math.max(bandBottom - 2, bandTop)

  const salience = new Float32Array(GRID * GRID)
  let maxSalience = 0
  for (let y = innerTop; y <= innerBottom; y++) {
    for (let x = 0; x < GRID; x++) {
      const [r, g, b] = at(x, y)
      const dist = distAt(x, y)
      const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255

      // 与四邻的色差 —— 平坦区域为 0，商品的轮廓与细节处高
      let grad = 0
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = Math.min(GRID - 1, Math.max(0, x + dx))
        const ny = Math.min(innerBottom, Math.max(innerTop, y + dy))
        const [nr, ng, nb] = at(nx, ny)
        grad += Math.hypot(r - nr, g - ng, b - nb)
      }
      grad = Math.min(1, grad / (441 * 1.4))

      const v = dist * 0.30 + sat * 0.20 + grad * 0.50
      salience[y * GRID + x] = v
      if (v > maxSalience) maxSalience = v
    }
  }
  if (maxSalience < 0.05) {
    console.info('[subject] 放弃：全图显著度过低 ' + JSON.stringify({ maxSalience: +maxSalience.toFixed(3), bandTop, bandBottom }))
    return FALLBACK
  }

  /* 不做连通生长，改用**坐标分位数包围盒**。
     连通性在这里是错的假设：项链这种细环细链，环的内部就是背景色，
     显著度分布是双峰的（边缘极高、大片背景极低），中间没有过渡 ——
     于是任何阈值要么只圈住种子周围几格，要么一路淹掉整条带。
     取「显著度前若干的格子」再对它们的坐标取分位数，
     细轮廓和实心块都成立，也天然抗离群点。 */
  const values: number[] = []
  for (let y = innerTop; y <= innerBottom; y++) {
    for (let x = 0; x < GRID; x++) values.push(salience[y * GRID + x])
  }
  values.sort((a2, b2) => a2 - b2)
  const quantile = (q: number): number => values[Math.floor(q * (values.length - 1))]

  let picked: { x: number; y: number }[] = []
  let sr = 0
  let sg = 0
  let sb = 0
  for (const q of [0.88, 0.8, 0.7, 0.55]) {
    const threshold = quantile(q)
    picked = []
    sr = 0
    sg = 0
    sb = 0
    for (let y = innerTop; y <= innerBottom; y++) {
      for (let x = 0; x < GRID; x++) {
        if (salience[y * GRID + x] < threshold) continue
        picked.push({ x, y })
        const [r, g, b] = at(x, y)
        sr += r
        sg += g
        sb += b
      }
    }
    if (picked.length >= 10) break
  }
  const hits = picked.length
  if (hits < 6) {
    console.info('[subject] 放弃：显著格子太少 ' + JSON.stringify({ hits, bandTop, bandBottom }))
    return FALLBACK
  }

  // 坐标分位数：掐掉两头各 6% 的离群格，剩下的就是主体的实际范围
  const xs = picked.map((c) => c.x).sort((a2, b2) => a2 - b2)
  const ys = picked.map((c) => c.y).sort((a2, b2) => a2 - b2)
  const pick = (arr: number[], q: number): number => arr[Math.floor(q * (arr.length - 1))]
  const minX = pick(xs, 0.06)
  const maxX = pick(xs, 0.94)
  const minY = pick(ys, 0.06)
  const maxY = pick(ys, 0.94)

  const spanW = (maxX - minX + 1) / GRID
  const spanH = (maxY - minY + 1) / GRID

  /* 主色取**包围盒内部**的均值，而不是显著格子的均值。
     显著格子基本都落在轮廓上，取它们的均值会偏向边缘的过渡色，
     猜品类时三张样图会一律猜成同一个东西。 */
  let cr = 0
  let cg = 0
  let cb = 0
  let cn = 0
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const [r, g, b] = at(x, y)
      cr += r
      cg += g
      cb += b
      cn++
    }
  }
  const color: [number, number, number] =
    cn > 0 ? [cr / cn, cg / cn, cb / cn] : [sr / hits, sg / hits, sb / hits]

  // 细长如一条线（多半抓到了文字行或边框），或者铺满整条带，都判低置信
  const thin = spanW < 0.05 || spanH < 0.05
  const sprawl = spanW > 0.92 && spanH > 0.85
  const confidence = thin || sprawl ? 0.25 : Math.min(1, maxSalience * 2.6)
  if (confidence < 0.35) {
    console.info('[subject] 放弃：置信度不足 ' + JSON.stringify({ confidence: +confidence.toFixed(3), thin, spanW: +spanW.toFixed(3), spanH: +spanH.toFixed(3), maxSalience: +maxSalience.toFixed(3), bandTop, bandBottom, hits }))
    return { ...FALLBACK, color }
  }

  // 稍微外扩，别把商品边缘切掉
  const pad = 0.035
  return {
    x: Math.max(0, minX / GRID - pad),
    y: Math.max(0, minY / GRID - pad),
    w: Math.min(1, spanW + pad * 2),
    h: Math.min(1, spanH + pad * 2),
    color,
    confidence,
  }
}
