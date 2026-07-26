import type { Poem } from '@/copy/poems'
import type { StyleId } from '@/design/catalog'
import type { SubjectBox } from '@/vision/subject'

/**
 * 静态海报合成器 —— 独立的 Canvas 2D 通道，不复用 WebGL 舞台。
 *
 * 为什么不用 html2canvas：它永远对不上 shader 舞台的像素，
 * 而且中文字体、混合模式、滤镜的还原都不可靠。
 * 单独写一遍合成，代价是几十行，换来的是「导出即所见」。
 */

const W = 1080
const H = 1440

const UI = '-apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif'
const SERIF = '"Songti SC", "STSong", "Source Han Serif SC", serif'
const KAI = '"Kaiti SC", "STKaiti", "Songti SC", serif'

interface SkinPaint {
  /** 背景渐变的三档色 */
  bg: [string, string, string]
  ink: string
  accent: string
  seal: string
  titleFont: string
  poemFont: string
  /** 古风走竖排 */
  vertical: boolean
}

const SKINS: Record<StyleId | string, SkinPaint> = {
  guofeng: {
    bg: ['#f7f1e2', '#efe7d5', '#e3d6bd'],
    ink: '#241f33',
    accent: '#b9975b',
    seal: '#b3342a',
    titleFont: KAI,
    poemFont: SERIF,
    vertical: true,
  },
  fafeng: {
    bg: ['#fff06a', '#ffe24b', '#ffcf2e'],
    ink: '#111111',
    accent: '#ff3e7f',
    seal: '#e3170a',
    titleFont: UI,
    poemFont: UI,
    vertical: false,
  },
  galgame: {
    bg: ['#2a2c60', '#1b1c3f', '#111230'],
    ink: '#f2f4ff',
    accent: '#6c7bff',
    seal: '#ff9ec4',
    titleFont: UI,
    poemFont: UI,
    vertical: false,
  },
}

/** 海棠形（四曲）路径，与 shader / SVG 用的是同一条极坐标公式。 */
function quatrefoil(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  lobe = 0.14,
): void {
  ctx.beginPath()
  const steps = 256
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const r = radius * (1 - lobe + lobe * Math.cos(4 * t))
    const x = cx + r * Math.cos(t)
    const y = cy + r * Math.sin(t)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

/** 竖排：逐字往下画，列从右往左推。 */
function drawVertical(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  rightX: number,
  topY: number,
  fontSize: number,
): void {
  const colGap = fontSize * 1.75
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  lines.forEach((line, col) => {
    const x = rightX - col * colGap
    // 行末标点不占一格，省掉一个视觉空洞
    const chars = [...line.replace(/[，。、；：]$/, '')]
    chars.forEach((ch, row) => {
      ctx.fillText(ch, x, topY + row * fontSize * 1.28)
    })
  })
}

function drawHorizontal(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  centerX: number,
  topY: number,
  fontSize: number,
): void {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  lines.forEach((line, i) => {
    ctx.fillText(line, centerX, topY + i * fontSize * 1.72)
  })
}

export interface PosterInput {
  poem: Poem
  style: StyleId
  category: string
  /** 商品截图。传了就在海棠窗里放主体裁切 */
  bitmap?: ImageBitmap | HTMLImageElement | null
  subject?: SubjectBox | null
}

export async function composePoster(input: PosterInput): Promise<Blob> {
  const skin = SKINS[input.style] ?? SKINS.guofeng
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // ── 底：三档竖向渐变 + 极淡噪点，避免大面积平色显廉价 ──
  const bg = ctx.createLinearGradient(0, 0, W * 0.35, H)
  bg.addColorStop(0, skin.bg[0])
  bg.addColorStop(0.55, skin.bg[1])
  bg.addColorStop(1, skin.bg[2])
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  ctx.save()
  ctx.globalAlpha = 0.05
  for (let i = 0; i < 2600; i++) {
    const x = Math.floor((i * 7919) % W)
    const y = Math.floor((i * 104729) % H)
    ctx.fillStyle = i % 2 ? skin.ink : '#ffffff'
    ctx.fillRect(x, y, 2, 2)
  }
  ctx.restore()

  // ── 标题 ──
  ctx.fillStyle = skin.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.font = `600 84px ${skin.titleFont}`
  ctx.fillText(input.poem.title, W / 2, 104)

  // ── 海棠开窗 + 商品主体 ──
  const winCX = W / 2
  const winCY = 480
  const winR = 208

  ctx.save()
  quatrefoil(ctx, winCX, winCY, winR)
  ctx.clip()
  // 窗底
  const inner = ctx.createRadialGradient(winCX, winCY - winR * 0.3, 0, winCX, winCY, winR)
  inner.addColorStop(0, '#ffffff')
  inner.addColorStop(1, skin.bg[2])
  ctx.fillStyle = inner
  ctx.fillRect(winCX - winR, winCY - winR, winR * 2, winR * 2)

  if (!input.bitmap || !input.subject) {
    // 没有截图（例如直接深链到结果页）时，窗里放品类名，不留一个空洞
    ctx.fillStyle = skin.accent
    ctx.globalAlpha = 0.5
    ctx.font = `600 96px ${skin.titleFont}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(input.category, winCX, winCY)
    ctx.globalAlpha = 1
    ctx.textBaseline = 'top'
  } else {
    const iw = 'width' in input.bitmap ? input.bitmap.width : 0
    const ih = 'height' in input.bitmap ? input.bitmap.height : 0
    const s = input.subject
    // 主体框稍微外扩，别把商品边缘贴死在窗口上
    const pad = 0.06
    const sx = Math.max(0, (s.x - pad) * iw)
    const sy = Math.max(0, (s.y - pad) * ih)
    const sw = Math.min(iw - sx, (s.w + pad * 2) * iw)
    const sh = Math.min(ih - sy, (s.h + pad * 2) * ih)
    // cover 进窗口
    const scale = Math.max((winR * 2) / sw, (winR * 2) / sh)
    const dw = sw * scale
    const dh = sh * scale
    ctx.drawImage(input.bitmap, sx, sy, sw, sh, winCX - dw / 2, winCY - dh / 2, dw, dh)
  }
  ctx.restore()

  // 双线海棠框
  ctx.strokeStyle = skin.accent
  ctx.lineWidth = 4
  quatrefoil(ctx, winCX, winCY, winR)
  ctx.stroke()
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 2
  quatrefoil(ctx, winCX, winCY, winR - 16)
  ctx.stroke()
  ctx.globalAlpha = 1

  // ── 诗 ──
  // 发疯文学/Galgame 的行数多（最多 9 行），字号要收，否则会顶到落款
  const poemTop = 772
  const lineCount = input.poem.lines.length
  const poemSize = skin.vertical ? 46 : Math.min(40, Math.floor(300 / lineCount))
  ctx.fillStyle = skin.ink
  ctx.font = `400 ${poemSize}px ${skin.poemFont}`

  let poemBottom: number
  if (skin.vertical) {
    // 竖排整体居中：列数决定总宽；最长那列决定总高
    const colGap = poemSize * 1.75
    const totalW = (lineCount - 1) * colGap
    drawVertical(ctx, input.poem.lines, W / 2 + totalW / 2, poemTop, poemSize)
    const maxRows = Math.max(
      ...input.poem.lines.map((l) => [...l.replace(/[，。、；：]$/, '')].length),
    )
    poemBottom = poemTop + maxRows * poemSize * 1.28
  } else {
    drawHorizontal(ctx, input.poem.lines, W / 2, poemTop, poemSize)
    poemBottom = poemTop + lineCount * poemSize * 1.72
  }

  // ── 印章 ──
  // 位置跟着诗块底部走，否则竖排的末列会压在章上
  const sealSize = 76
  const sealX = W / 2 - sealSize / 2
  const sealY = Math.min(poemBottom + 26, H - 250)
  ctx.fillStyle = skin.seal
  ctx.beginPath()
  ctx.roundRect(sealX, sealY, sealSize, sealSize, 10)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 26px ${SERIF}`
  ctx.textBaseline = 'middle'
  ctx.fillText('七夕', W / 2, sealY + sealSize / 2)

  // ── 落款 ──
  ctx.textBaseline = 'top'
  ctx.fillStyle = skin.ink
  ctx.globalAlpha = 0.72
  ctx.font = `300 30px ${UI}`
  ctx.fillText('这份礼物，替我说给你听。', W / 2, H - 156)
  ctx.globalAlpha = 0.42
  ctx.font = `300 24px ${UI}`
  ctx.fillText(`抖音商城 · 七夕  |  AI 礼物炼诗局  ·  ${input.category}`, W / 2, H - 96)
  ctx.globalAlpha = 1

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  )
  if (!blob) throw new Error('POSTER_COMPOSE_FAILED')
  return blob
}
