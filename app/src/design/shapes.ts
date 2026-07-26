/**
 * 海棠形（四曲开窗）—— 从参考海报里提取的品牌形状，
 * 贯穿上传口 / 命运卡牌 / 海报开窗。
 *
 * 极坐标定义与 shader 里的 sdQuatrefoil() 完全一致：
 *   r(θ) = R · (1 - lobe + lobe · cos(4θ))
 * 保证 DOM 里的 SVG 轮廓和 WebGL 里的遮罩严丝合缝。
 */
export function quatrefoilPath(radius: number, lobe = 0.14, samples = 256): string {
  const points: string[] = []
  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * Math.PI * 2
    const r = radius * (1 - lobe + lobe * Math.cos(4 * theta))
    const x = r * Math.cos(theta)
    const y = r * Math.sin(theta)
    points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return `${points.join(' ')} Z`
}
