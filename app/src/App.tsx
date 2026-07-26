import { useEffect, useState } from 'react'
import { GalaxyCanvas } from '@/ui/GalaxyCanvas'
import { PortalScene } from '@/scenes/portal/PortalScene'
import { AwakenScene } from '@/scenes/awaken/AwakenScene'
import { ChooseScene } from '@/scenes/choose/ChooseScene'
import { ForgeScene } from '@/scenes/forge/ForgeScene'
import { ResultScene } from '@/scenes/result/ResultScene'
import { readScreenshot, useFlow, type Act } from '@/state/flow'
import { renderSample, SAMPLES } from '@/dev/sampleShots'
import { inspect } from '@/dev/inspect'
import type { GalaxyStage } from '@/scenes/portal/GalaxyStage'
import './app.css'

/**
 * 一个链接两端都能看：
 *   手机端 —— 整屏铺满，就是原生 H5 体感；
 *   桌面端 —— 自动套进手机边框居中，客户在电脑上点开链接也是对的比例。
 *
 * GL 画布挂在 .frame 上，跨幕常驻：一个上下文活到最后，
 * 各幕只往 renderer 上加/撤自己的 pass，不重建上下文。
 */
export default function App() {
  const [stage, setStage] = useState<GalaxyStage | null>(null)
  const act = useFlow((s) => s.act)
  const setAct = useFlow((s) => s.setAct)
  const setScreenshot = useFlow((s) => s.setScreenshot)

  // ?sample=necklace&act=awaken —— 跳过上传直接进指定幕
  useEffect(() => {
    if (!inspect.sample) return
    const spec = SAMPLES.find((s) => s.key === inspect.sample)
    if (!spec) return
    void (async () => {
      setScreenshot(await readScreenshot(await renderSample(spec)))
      if (inspect.act) setAct(inspect.act as Act)
    })()
  }, [setScreenshot, setAct])

  return (
    <div className="frame">
      <GalaxyCanvas onReady={setStage} />
      {act === 'portal' && <PortalScene stage={stage} />}
      {act === 'awaken' && <AwakenScene stage={stage} />}
      {act === 'choose' && <ChooseScene stage={stage} />}
      {act === 'forge' && <ForgeScene stage={stage} />}
      {act === 'result' && <ResultScene stage={stage} />}
    </div>
  )
}
