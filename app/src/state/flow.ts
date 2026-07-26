import { create } from 'zustand'
import type { PurposeId, RecipientId, StyleId } from '@/design/catalog'
import type { SubjectBox } from '@/vision/subject'

/** 五幕。玩法B（拼贴诗）复用 upload/forge/result，只把 choose 换成 salvage。 */
export type Act = 'portal' | 'awaken' | 'choose' | 'salvage' | 'forge' | 'result'

/** 两条玩法路径。 */
export type Playbook = 'choice' | 'collage'

export interface Screenshot {
  file: File
  /** createObjectURL 产生的地址，换图/卸载时必须 revoke */
  url: string
  width: number
  height: number
}

interface FlowState {
  act: Act
  playbook: Playbook
  screenshot: Screenshot | null

  /** 第1幕定位出的商品主体框（CPU 启发式，非分割模型） */
  subject: SubjectBox | null
  /** 识别出的品类，用户可在第1幕改 */
  category: string
  /**
   * 已知为真的品类。走内置示例图时有值（那几张是我们自己画的，
   * 品类是确定的事实）；用户自己上传时为 null，走启发式猜测。
   */
  knownCategory: string | null

  recipient: RecipientId | null
  purpose: PurposeId | null
  style: StyleId

  setAct: (act: Act) => void
  setPlaybook: (playbook: Playbook) => void
  setScreenshot: (screenshot: Screenshot | null) => void
  setSubject: (subject: SubjectBox) => void
  setCategory: (category: string) => void
  setKnownCategory: (category: string | null) => void
  setRecipient: (recipient: RecipientId) => void
  setPurpose: (purpose: PurposeId) => void
  setStyle: (style: StyleId) => void
  reset: () => void
}

const INITIAL = {
  act: 'portal' as Act,
  playbook: 'choice' as Playbook,
  screenshot: null,
  subject: null,
  category: '项链',
  knownCategory: null,
  recipient: null,
  purpose: null,
  style: 'guofeng' as StyleId,
}

export const useFlow = create<FlowState>((set, get) => ({
  ...INITIAL,

  setAct: (act) => set({ act }),
  setPlaybook: (playbook) => set({ playbook }),

  setScreenshot: (screenshot) => {
    // 换图前把上一张的 blob URL 释放掉，反复试玩不会漏内存
    const previous = get().screenshot
    if (previous && previous.url !== screenshot?.url) URL.revokeObjectURL(previous.url)
    set({ screenshot })
  },

  setSubject: (subject) => set({ subject }),
  setCategory: (category) => set({ category }),
  setKnownCategory: (knownCategory) => set({ knownCategory }),
  setRecipient: (recipient) => set({ recipient }),
  setPurpose: (purpose) => set({ purpose }),
  setStyle: (style) => set({ style }),

  reset: () => {
    const previous = get().screenshot
    if (previous) URL.revokeObjectURL(previous.url)
    set({ ...INITIAL })
  },
}))

/** 读取一张图的像素尺寸并包成 Screenshot。 */
export async function readScreenshot(file: File): Promise<Screenshot> {
  const url = URL.createObjectURL(file)
  try {
    const bitmap = await createImageBitmap(file)
    const shot = { file, url, width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return shot
  } catch {
    // createImageBitmap 对个别 HEIC/渐进式 JPEG 会抛，退回 <img> 解码
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'))
      img.src = url
    })
    return { file, url, ...size }
  }
}
