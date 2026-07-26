import { useEffect, useState } from 'react'
import { GalaxyCanvas } from '@/ui/GalaxyCanvas'
import { PortalScene } from '@/scenes/portal/PortalScene'
import { AwakenScene } from '@/scenes/awaken/AwakenScene'
import { RiverScene } from '@/scenes/river/RiverScene'
import { ConstellationScene } from '@/scenes/constellation/ConstellationScene'
import { CharmScene } from '@/scenes/charm/CharmScene'
import { readScreenshot, useFlow, type Act } from '@/state/flow'
import { renderSample, SAMPLES } from '@/dev/sampleShots'
import { inspect } from '@/dev/inspect'
import { sfx } from '@/audio/sfx'
import type { GalaxyStage } from '@/scenes/portal/GalaxyStage'
import './app.css'

/**
 * 《捞星记》· 抖音商城七夕
 *
 * 一个链接两端都能看：手机端整屏铺满；桌面端自动套进手机边框居中。
 * GL 画布挂在 .frame 上跨幕常驻 —— 一个上下文活到最后，
 * 各幕只往 renderer 上加/撤自己的 pass，不重建上下文。
 */
export default function App() {
  const [stage, setStage] = useState<GalaxyStage | null>(null)
  const act = useFlow((s) => s.act)
  const setAct = useFlow((s) => s.setAct)
  const setScreenshot = useFlow((s) => s.setScreenshot)
  const setCategory = useFlow((s) => s.setCategory)
  const setKnownCategory = useFlow((s) => s.setKnownCategory)

  // 音频必须在用户手势里解锁，否则 iOS 上永远不出声
  useEffect(() => {
    const unlock = (): void => sfx.unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  // ?sample=necklace&act=river —— 跳过上传直接进指定幕
  useEffect(() => {
    if (!inspect.sample) return
    const spec = SAMPLES.find((s) => s.key === inspect.sample)
    if (!spec) return
    void (async () => {
      setScreenshot(await readScreenshot(await renderSample(spec)))
      // 深链可能跳过第1幕，品类就没人设了 —— 示例图的品类是已知事实，直接给上
      setKnownCategory(spec.category)
      setCategory(spec.category)
      if (inspect.act) setAct(inspect.act as Act)
    })()
  }, [setScreenshot, setAct, setCategory, setKnownCategory])

  return (
    <div className="frame">
      <GalaxyCanvas onReady={setStage} />
      {act === 'portal' && <PortalScene stage={stage} />}
      {act === 'awaken' && <AwakenScene stage={stage} />}
      {act === 'river' && <RiverScene stage={stage} />}
      {act === 'constellation' && <ConstellationScene stage={stage} />}
      {act === 'charm' && <CharmScene stage={stage} />}
    </div>
  )
}
