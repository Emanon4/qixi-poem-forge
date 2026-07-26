import { useEffect, useRef, useState } from 'react'
import { GalaxyStage } from '@/scenes/portal/GalaxyStage'
import './galaxy-canvas.css'

interface Props {
  /** 舞台就绪后回调，用于把入场时间轴和 DOM 动画对齐 */
  onReady?: (stage: GalaxyStage) => void
}

/**
 * WebGL 舞台的挂载点。
 * 拿不到 WebGL2 时降级为一层纯 CSS 夜空 —— 流程照样能走完，
 * 只是没有粒子和实时光。这是「不能白屏」的底线。
 */
export function GalaxyCanvas({ onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [degraded, setDegraded] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let stage: GalaxyStage
    try {
      stage = new GalaxyStage(canvas)
    } catch (error) {
      console.warn('[galaxy] WebGL2 不可用，降级为 CSS 夜空', error)
      setDegraded(true)
      return
    }

    // 调试句柄：控制台里可以直接查 pass 列表 / 强制重绘一帧
    ;(window as unknown as { __qixi?: GalaxyStage }).__qixi = stage

    onReady?.(stage)
    return () => stage.dispose()
    // onReady 只在挂载时用一次；把它放进依赖会导致父组件每次渲染都重建 GL 上下文
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (degraded) return <div className="galaxy-canvas galaxy-canvas--degraded" aria-hidden />
  return <canvas ref={canvasRef} className="galaxy-canvas" aria-hidden />
}
