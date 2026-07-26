/**
 * 内置示例购物截图 —— 用 Canvas 2D 现画，不占任何静态体积。
 *
 * 两个用途：
 *   1 客户点开链接时手边不一定有购物截图，一键就能走完整流程；
 *   2 我自己核对第1幕的识别与溶解效果时有确定性输入。
 *
 * 画法刻意贴合真实电商详情页的构成（白底 + 顶部导航 + 大图 + 标题 + 红价 + 底部按钮），
 * 这样第1幕的主体定位启发式（找「离四周底色最远、最饱和」的区域）才有意义。
 */

export interface SampleSpec {
  key: string
  label: string
  /**
   * 这张图真实的品类。示例图是我们自己画的，品类是已知事实，
   * 不需要再去猜 —— 让示例路径显示正确结果不是作弊，是用上了本来就有的元数据。
   * 用户自己上传的图仍然走启发式猜测 + 「不是这个」确认。
   */
  category: string
  title: string
  price: string
  /** 商品图区域的底色 */
  bg: string
  /** 画商品本体 */
  draw: (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => void
}

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export const SAMPLES: SampleSpec[] = [
  {
    key: 'necklace',
    label: '项链',
    category: '项链',
    title: '18K金 星河系列 锁骨链 送女友生日礼物',
    price: '¥ 1,288',
    bg: '#f6ecec',
    draw: (ctx, x, y, s) => {
      // 链条：两段贝塞尔弧
      ctx.strokeStyle = '#d8b26a'
      ctx.lineWidth = s * 0.012
      ctx.beginPath()
      ctx.moveTo(x + s * 0.26, y + s * 0.2)
      ctx.quadraticCurveTo(x + s * 0.5, y + s * 0.62, x + s * 0.74, y + s * 0.2)
      ctx.stroke()
      // 吊坠：环形 + 高光
      const cx = x + s * 0.5
      const cy = y + s * 0.6
      const grad = ctx.createRadialGradient(cx - s * 0.03, cy - s * 0.03, 0, cx, cy, s * 0.16)
      grad.addColorStop(0, '#fff6dc')
      grad.addColorStop(0.55, '#e6bf74')
      grad.addColorStop(1, '#b98f3f')
      ctx.strokeStyle = grad
      ctx.lineWidth = s * 0.055
      ctx.beginPath()
      ctx.arc(cx, cy, s * 0.13, 0, Math.PI * 2)
      ctx.stroke()
      // 小钻
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(cx, cy - s * 0.13, s * 0.022, 0, Math.PI * 2)
      ctx.fill()
    },
  },
  {
    key: 'lipstick',
    label: '口红',
    category: '口红',
    title: '丝绒哑光唇釉 #205 正红 七夕限定礼盒',
    price: '¥ 329',
    bg: '#fbe7ea',
    draw: (ctx, x, y, s) => {
      const w = s * 0.16
      const cx = x + s * 0.5 - w / 2
      // 膏体
      ctx.fillStyle = '#c0243a'
      roundRect(ctx, cx, y + s * 0.24, w, s * 0.16, w * 0.3)
      ctx.fill()
      // 金管
      const grad = ctx.createLinearGradient(cx, 0, cx + w, 0)
      grad.addColorStop(0, '#b8933f')
      grad.addColorStop(0.4, '#f0dba4')
      grad.addColorStop(1, '#9c7a2e')
      ctx.fillStyle = grad
      ctx.fillRect(cx, y + s * 0.4, w, s * 0.34)
      // 底座
      ctx.fillStyle = '#8d6c26'
      ctx.fillRect(cx - w * 0.06, y + s * 0.72, w * 1.12, s * 0.04)
    },
  },
  {
    key: 'catfood',
    label: '猫罐头',
    category: '罐头',
    title: '鱼香小罐 猫用主食罐 85g×12 整箱装',
    price: '¥ 168',
    bg: '#f7f1e4',
    draw: (ctx, x, y, s) => {
      const w = s * 0.34
      const h = s * 0.22
      const cx = x + s * 0.5 - w / 2
      const cy = y + s * 0.46
      // 罐身
      const grad = ctx.createLinearGradient(cx, 0, cx + w, 0)
      grad.addColorStop(0, '#c98a52')
      grad.addColorStop(0.45, '#f2c391')
      grad.addColorStop(1, '#b5773f')
      ctx.fillStyle = grad
      roundRect(ctx, cx, cy, w, h, s * 0.02)
      ctx.fill()
      // 罐盖
      ctx.fillStyle = '#e8d8b8'
      roundRect(ctx, cx, cy - s * 0.03, w, s * 0.045, s * 0.015)
      ctx.fill()
      // 标签
      ctx.fillStyle = '#fdf6e8'
      roundRect(ctx, cx + w * 0.14, cy + h * 0.28, w * 0.72, h * 0.44, s * 0.012)
      ctx.fill()
      ctx.fillStyle = '#8a5a2b'
      ctx.font = `600 ${Math.round(s * 0.045)}px -apple-system, "PingFang SC", sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('鱼香小罐', cx + w / 2, cy + h * 0.62)
    },
  },
]

const W = 750
const H = 1624

/** 把一个 spec 画成一张 750×1624 的「购物截图」File。 */
export async function renderSample(spec: SampleSpec): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const ui = '-apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif'

  // 页面白底
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // 顶部导航
  ctx.fillStyle = '#f7f7f8'
  ctx.fillRect(0, 0, W, 132)
  ctx.strokeStyle = '#3a3a3c'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(52, 84)
  ctx.lineTo(32, 66)
  ctx.lineTo(52, 48)
  ctx.stroke()
  ctx.fillStyle = '#1c1c1e'
  ctx.font = `600 30px ${ui}`
  ctx.textAlign = 'center'
  ctx.fillText('商品详情', W / 2, 78)

  // 商品大图区
  const imgTop = 132
  const imgSize = W
  ctx.fillStyle = spec.bg
  ctx.fillRect(0, imgTop, W, imgSize)
  spec.draw(ctx, 0, imgTop, imgSize)

  // 标题
  ctx.textAlign = 'left'
  ctx.fillStyle = '#1c1c1e'
  ctx.font = `600 34px ${ui}`
  const words = spec.title.split('')
  let line = ''
  let ty = imgTop + imgSize + 74
  for (const ch of words) {
    if (ctx.measureText(line + ch).width > W - 96) {
      ctx.fillText(line, 48, ty)
      line = ch
      ty += 48
    } else {
      line += ch
    }
  }
  ctx.fillText(line, 48, ty)

  // 价格
  ctx.fillStyle = '#e8123c'
  ctx.font = `700 52px ${ui}`
  ctx.fillText(spec.price, 48, ty + 92)
  ctx.fillStyle = '#98989d'
  ctx.font = `26px ${ui}`
  ctx.fillText('已售 2.3万件  ·  七夕限时', 48, ty + 138)

  // 规格行
  ctx.strokeStyle = '#ebebed'
  ctx.lineWidth = 2
  for (let i = 0; i < 2; i++) {
    const ry = ty + 190 + i * 84
    ctx.beginPath()
    ctx.moveTo(48, ry)
    ctx.lineTo(W - 48, ry)
    ctx.stroke()
    ctx.fillStyle = '#636366'
    ctx.font = `28px ${ui}`
    ctx.fillText(['选择  规格 / 包装', '送至  浙江 杭州市'][i], 48, ry + 52)
  }

  // 底部按钮
  ctx.fillStyle = '#fff2e0'
  roundRect(ctx, 48, H - 148, (W - 116) / 2, 92, 46)
  ctx.fill()
  ctx.fillStyle = '#ff7a1a'
  ctx.font = `600 32px ${ui}`
  ctx.textAlign = 'center'
  ctx.fillText('加入购物车', 48 + (W - 116) / 4, H - 90)

  ctx.fillStyle = '#fe2c55'
  roundRect(ctx, W / 2 + 10, H - 148, (W - 116) / 2, 92, 46)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.fillText('立即购买', W / 2 + 10 + (W - 116) / 4, H - 90)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  )
  if (!blob) throw new Error('SAMPLE_RENDER_FAILED')
  return new File([blob], `sample-${spec.key}.png`, { type: 'image/png' })
}
