/**
 * 定格检查入口 —— 用 URL 参数把任意一幕停在任意一段。
 *
 * 存在的理由很实际：无头/后台浏览器会节流 requestAnimationFrame，
 * 动画根本不推进，靠截图核对画面就永远只能看到第一帧。
 * 有了它，每一段演出都能停在确定的位置来核对构图。
 *
 * 对客户也有用：可以直接把「某一幕的成品态」当链接发出去。
 *
 *   ?intro=1              第0幕天空直接停在最终曝光
 *   ?act=awaken&p=3       跳到第1幕并停在演出末尾（主体已浮起）
 *   ?sample=necklace      自动载入内置示例截图，跳过上传
 *   ?at=7                 定格时把 shader 的 uTime 设成 7 秒
 */

export interface InspectParams {
  /** 直接进入的幕 */
  act: string | null
  /** 自动载入的示例截图 key */
  sample: string | null
  /** 幕内进度。第1幕用 0–3（扫描/溶解/上浮各占 1 段） */
  p: number | null
  /** 定格时 shader 的 uTime */
  at: number
  /** 是否处于定格模式（有 p 或 intro 就算） */
  frozen: boolean
}

function parse(): InspectParams {
  const q = new URLSearchParams(location.search)
  const num = (key: string): number | null => {
    const raw = q.get(key)
    if (raw === null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  const p = num('p')
  return {
    act: q.get('act'),
    sample: q.get('sample'),
    p,
    at: num('at') ?? 6,
    frozen: p !== null || q.get('intro') !== null,
  }
}

export const inspect: InspectParams = parse()

/** 把 0–3 的总进度切成三段各自的 0–1。 */
export function segment(p: number, index: number): number {
  return Math.max(0, Math.min(1, p - index))
}
