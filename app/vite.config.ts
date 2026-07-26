import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import os from 'node:os'
import path from 'node:path'

/**
 * 真机联调用：把本机局域网 IP 编译进产物，桌面端引导页据此生成二维码，
 * 手机扫码直接进同一个 dev server。客户只在手机端浏览，这条链路必须零摩擦。
 */
function lanHost(): string {
  const nets = os.networkInterfaces()
  const candidates: string[] = []
  for (const infos of Object.values(nets)) {
    for (const net of infos ?? []) {
      if (net.family === 'IPv4' && !net.internal) candidates.push(net.address)
    }
  }
  // 优先常见家用/办公网段，避免选到 docker/utun 之类的虚拟网卡
  const preferred = candidates.find((a) => /^(192\.168|10\.)/.test(a))
  return preferred ?? candidates[0] ?? 'localhost'
}

export default defineConfig({
  // 相对路径：GitHub Pages 会把站点挂在 /仓库名/ 子路径下，
  // base 留 '/' 的话资源会全部 404。相对路径在子路径和根路径下都成立。
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  define: {
    __LAN_HOST__: JSON.stringify(lanHost()),
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 2048,
  },
})
