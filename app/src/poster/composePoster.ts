import type { Poem } from '@/copy/poems'
import type { Reading } from '@/game/constellation'

/**
 * 心意签的图片合成 —— 独立的 Canvas 2D 通道，不复用 WebGL 舞台。
 *
 * 为什么不用 html2canvas：它永远对不上 shader 舞台的像素，中文字体、
 * 混合模式、滤镜的还原都不可靠。单独写一遍，换来「导出即所见」。
 *
 * 出 9:16 —— 这是要发抖音的。
 */

const W = 1080
const H = 1920

const UI = '-apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif'
const SERIF = '"Songti SC", "STSong", "Source Han Serif SC", serif'
const KAI = '"Kaiti SC", "STKaiti", "Songti SC", serif'

interface SkinPaint {
  paper: string
  ink: string
  accent: string
  seal: string
  titleFont: string
  poemFont: string
}

const SKINS: Record<string, SkinPaint> = {
  guofeng: {
    paper: '#efe7d5',
    ink: '#241f33',
    accent: '#b9975b',
    seal: '#b3342a',
    titleFont: KAI,
    poemFont: SERIF,
  },
  fafeng: {
    paper: '#ffe24b',
    ink: '#111111',
    accent: '#ff3e7f',
    seal: '#e3170a',
    titleFont: UI,
    poemFont: UI,
  },
  galgame: {
    paper: '#1b1c3f',
    ink: '#f2f4ff',
    accent: '#6c7bff',
    seal: '#ff9ec4',
    titleFont: UI,
    poemFont: UI,
  },
}

/** 夜空底。星位用固定散列，同一枚签导出多少次都长一样。 */
function paintNight(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, H, W * 0.4, 0)
  g.addColorStop(0, '#6e3f6b')
  g.addColorStop(0.22, '#4a2f78')
  g.addColorStop(0.55, '#2e1f5c')
  g.addColorStop(1, '#0b0824')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  let s = 2166136261
  const rand = (): number => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
  ctx.fillStyle = '#fff8e8'
  for (let i = 0; i < 420; i++) {
    const x = rand() * W
    const y = rand() * H
    const r = rand() * 1.9 + 0.35
    ctx.globalAlpha = 0.25 + rand() * 0.7
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export interface CharmInput {
  reading: Reading
  poem: Poem
  category: string
}

export async function composeCharm(input: CharmInput): Promise<Blob> {
  const { reading, poem, category } = input
  const skin = SKINS[reading.style] ?? SKINS.guofeng

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  paintNight(ctx)

  // ── 签本体 ──
  const slipW = 840
  const slipH = 1400
  const slipX = (W - slipW) / 2
  const slipY = 240

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 60
  ctx.shadowOffsetY = 24
  ctx.fillStyle = skin.paper
  roundRect(ctx, slipX, slipY, slipW, slipH, 8)
  ctx.fill()
  ctx.restore()

  // 内框：中式签文的双线边
  ctx.strokeStyle = skin.accent
  ctx.globalAlpha = 0.45
  ctx.lineWidth = 2
  roundRect(ctx, slipX + 22, slipY + 22, slipW - 44, slipH - 44, 4)
  ctx.stroke()
  ctx.globalAlpha = 1

  const cx = W / 2
  let y = slipY + 92

  // ── 成色 + 稀有度 ──
  ctx.fillStyle = skin.seal
  roundRect(ctx, slipX + 52, y - 36, 134, 54, 4)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 30px ${UI}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(reading.fortune, slipX + 119, y - 8)

  ctx.textAlign = 'right'
  ctx.fillStyle = skin.accent
  ctx.font = `26px ${UI}`
  ctx.fillText(
    '★'.repeat(reading.rarity + 1) + '☆'.repeat(3 - reading.rarity),
    slipX + slipW - 52,
    y - 8,
  )

  // ── 星官名 ──
  y += 130
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = skin.ink
  ctx.font = `500 108px ${KAI}`
  ctx.fillText(reading.name, cx, y)
  y += 46
  ctx.font = `300 24px ${UI}`
  ctx.globalAlpha = 0.5
  ctx.fillText('星　官', cx, y)
  ctx.globalAlpha = 1

  // ── 星官图 ──
  const chartR = 200
  const chartCY = y + 230
  ctx.save()
  ctx.translate(cx, chartCY)
  ctx.strokeStyle = skin.accent
  ctx.globalAlpha = 0.8
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  const pts = reading.stars.map((s) => ({ x: s.x * chartR * 2.3, y: -s.y * chartR * 2.3 }))
  ctx.beginPath()
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.fillStyle = skin.ink
  for (const p of pts) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.font = `34px ${KAI}`
  ctx.textAlign = 'center'
  ctx.globalAlpha = 0.82
  reading.stars.forEach((s, i) => ctx.fillText(s.text, pts[i].x, pts[i].y - 24))
  ctx.globalAlpha = 1
  ctx.restore()

  y = chartCY + chartR + 40

  // ── 心意类型 ──
  ctx.fillStyle = skin.ink
  ctx.globalAlpha = 0.72
  ctx.font = `300 30px ${UI}`
  ctx.fillText(`你是${reading.persona}`, cx, y)
  ctx.globalAlpha = 1

  // ── 分隔 ──
  y += 46
  ctx.strokeStyle = skin.ink
  ctx.globalAlpha = 0.2
  ctx.lineWidth = 2
  ctx.setLineDash([8, 10])
  ctx.beginPath()
  ctx.moveTo(slipX + 90, y)
  ctx.lineTo(slipX + slipW - 90, y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1

  // ── 诗 ──
  y += 68
  ctx.fillStyle = skin.ink
  ctx.font = `600 44px ${skin.titleFont}`
  ctx.fillText(poem.title, cx, y)

  // 行数多的文风（发疯/Galgame 最多 9 行）要自动收字号，否则会顶出签外
  const lineSize = Math.max(26, Math.min(38, Math.floor(340 / poem.lines.length)))
  ctx.font = `400 ${lineSize}px ${skin.poemFont}`
  y += 20
  for (const line of poem.lines) {
    y += lineSize * 1.7
    ctx.fillText(line, cx, y)
  }

  // ── 捞得的字 ──
  ctx.font = `30px ${KAI}`
  ctx.globalAlpha = 0.55
  ctx.fillText(`捞得 · ${reading.stars.map((s) => s.text).join(' ')}`, cx, slipY + slipH - 116)
  ctx.globalAlpha = 1

  // ── 落款 ──
  ctx.font = `300 24px ${UI}`
  ctx.globalAlpha = 0.42
  ctx.fillText(`抖音商城 · 七夕　${category}`, cx, slipY + slipH - 58)
  ctx.globalAlpha = 1

  // ── 签外一句话，留给转发时的第一眼 ──
  ctx.fillStyle = '#f6efdc'
  ctx.globalAlpha = 0.8
  ctx.font = `300 30px ${UI}`
  ctx.fillText('这份礼物，替我说给你听', cx, slipY + slipH + 96)
  ctx.globalAlpha = 1

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('CHARM_COMPOSE_FAILED')
  return blob
}
