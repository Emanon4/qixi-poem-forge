import { Program } from './Program'
import { ORDER, type FrameCtx, type Pass, type Renderer } from './Renderer'

/**
 * GPU 实例化粒子系统。
 *
 * 每颗粒子的位置是 (种子, 进度) 的**纯函数**，在顶点着色器里算 ——
 * CPU 每帧零开销，上万颗也不掉帧。代价是不能做粒子间碰撞之类的有状态模拟，
 * 但这个项目要的迸发、轨道、磁吸三种运动都不需要状态。
 *
 * 实例属性只在 setInstances() 时上传一次，之后每帧只改几个 uniform。
 */

const FLOATS_PER_INSTANCE = 11 // origin(2) target(2) seed(3) params(4)

export type ParticleMode = 'burst' | 'orbit' | 'magnet'

const MODE_ID: Record<ParticleMode, number> = { burst: 0, orbit: 1, magnet: 2 }

export interface ParticleSpec {
  /** byWidth 空间起点 */
  origin: [number, number]
  /** 磁吸模式的终点；其他模式忽略 */
  target?: [number, number]
  /** 像素尺寸（会再乘 dpr） */
  size: number
  /** 出场延迟，占总进度的比例 0–1 */
  delay: number
  /** 存活时长，占总进度的比例 0–1 */
  life: number
  /** 调色板索引 0–3 */
  color: number
}

const VERT = /* glsl */ `#version 300 es
in vec2 aCorner;   // 四边形角点 -1..1
in vec2 aOrigin;
in vec2 aTarget;
in vec3 aSeed;
in vec4 aParams;   // x=size y=delay z=life w=colorIdx

uniform float uTime;
uniform float uPhase;
uniform vec2  uRes;
uniform float uDpr;
uniform int   uMode;
uniform vec2  uCenter;
uniform float uSpread;
uniform float uGravity;

out vec2  vCorner;
out float vAlpha;
out float vColorIdx;

const float PI  = 3.14159265359;
const float TAU = 6.28318530718;

void main() {
  float aspectY = uRes.y / uRes.x;
  float t = clamp((uPhase - aParams.y) / max(aParams.z, 1e-4), 0.0, 1.0);

  vec2 pos;
  float alpha;
  float sizeScale = 1.0;

  if (uMode == 0) {
    // 迸发：随机方向初速度 + 指数阻尼 + 重力/上浮
    float ang = aSeed.x * TAU;
    float spd = mix(0.25, 1.0, aSeed.y) * uSpread;
    vec2 dir = vec2(cos(ang), sin(ang));
    float damp = 1.0 - exp(-t * 3.2);
    pos = aOrigin + dir * spd * damp * 0.34 + vec2(0.0, uGravity * t * t);
    // 先亮后灭，收尾快
    alpha = smoothstep(0.0, 0.08, t) * (1.0 - t) * (1.0 - t);
    sizeScale = 0.45 + 0.55 * (1.0 - t);
  } else if (uMode == 1) {
    // 轨道：绕中心做椭圆运动，各自相位与半径不同
    float ang = aSeed.x * TAU + uTime * mix(0.30, 0.85, aSeed.y) + uPhase * 5.0;
    float rad = mix(0.14, 0.36, aSeed.z) * uSpread;
    pos = uCenter + vec2(cos(ang) * rad, sin(ang) * rad * 0.58);
    alpha = smoothstep(0.0, 0.12, t);
    // 远端的稍小，制造纵深
    sizeScale = 0.7 + 0.3 * (0.5 + 0.5 * sin(ang));
  } else {
    // 磁吸：起点飞向终点，途中侧向甩出一点弧线，末端过冲回落
    float e = t * t * (3.0 - 2.0 * t);
    vec2 mid = mix(aOrigin, aTarget, 0.5) + vec2((aSeed.x - 0.5), (aSeed.y - 0.5)) * 0.30;
    // 二次贝塞尔：直线插值会让一堆粒子走成扇形，弧线才像被吸过去
    vec2 a = mix(aOrigin, mid, e);
    vec2 b = mix(mid, aTarget, e);
    pos = mix(a, b, e);
    alpha = smoothstep(0.0, 0.1, t);
    sizeScale = mix(1.0, 0.55, e);
  }

  float px = aParams.x * uDpr * sizeScale;
  vec2 uvPos = vec2(pos.x + 0.5, pos.y / aspectY + 0.5);
  vec2 clip = uvPos * 2.0 - 1.0;
  // 像素尺寸换算到 clip space，x/y 各自除以对应的分辨率才不会拉扁。
  // 注意：half 是 GLSL ES 保留字，不能拿来当变量名。
  vec2 halfSize = vec2(px / uRes.x, px / uRes.y) * 2.0;

  gl_Position = vec4(clip + aCorner * halfSize, 0.0, 1.0);
  vCorner = aCorner;
  vAlpha = alpha;
  vColorIdx = aParams.w;
}
`

const FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2  vCorner;
in float vAlpha;
in float vColorIdx;
out vec4 fragColor;

uniform vec3  uPalette0;
uniform vec3  uPalette1;
uniform vec3  uPalette2;
uniform vec3  uPalette3;
uniform float uIntensity;

void main() {
  float d2 = dot(vCorner, vCorner);
  if (d2 > 1.0) discard;
  // 双段衰减：紧实的核 + 松散的辉，单独一个高斯会显得像糊点
  float core = exp(-d2 * 6.5);
  float glow = exp(-d2 * 1.8) * 0.35;

  int idx = int(vColorIdx + 0.5);
  vec3 c = idx == 0 ? uPalette0 : idx == 1 ? uPalette1 : idx == 2 ? uPalette2 : uPalette3;

  float a = (core + glow) * vAlpha;
  if (a < 0.003) discard;
  // 线性 HDR，预乘 alpha。乘 uIntensity 推到 1.0 以上，辉光才抓得到。
  fragColor = vec4(c * a * uIntensity, a);
}
`

export class InstancedParticles implements Pass {
  enabled = true
  order: number = ORDER.particles

  mode: ParticleMode = 'burst'
  /** 0→1 的总进度，由 gsap 驱动 */
  phase = 0
  center: [number, number] = [0, 0]
  spread = 1
  gravity = 0.08
  intensity = 1.6
  palette: [number, number, number][] = [
    [1.0, 0.78, 0.36], // 星金
    [1.0, 0.62, 0.72], // 桃粉
    [0.72, 0.62, 1.0], // 淡紫
    [1.0, 0.97, 0.9], // 月白
  ]

  private readonly gl: WebGL2RenderingContext
  private readonly program: Program
  private readonly cornerVbo: WebGLBuffer
  private readonly instanceVbo: WebGLBuffer
  private readonly vao: WebGLVertexArrayObject
  private count = 0

  constructor(
    readonly name: string,
    private readonly renderer: Renderer,
    private readonly capacity: number,
  ) {
    const gl = renderer.gl
    this.gl = gl
    this.program = new Program(gl, VERT, FRAG, name)

    // 一个四边形，两三角六顶点。数量少，不值得再上 index buffer。
    this.cornerVbo = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerVbo)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]),
      gl.STATIC_DRAW,
    )

    this.instanceVbo = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo)
    gl.bufferData(gl.ARRAY_BUFFER, capacity * FLOATS_PER_INSTANCE * 4, gl.DYNAMIC_DRAW)

    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerVbo)
    const corner = this.program.attrib('aCorner')
    gl.enableVertexAttribArray(corner)
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo)
    const stride = FLOATS_PER_INSTANCE * 4
    const bind = (attr: string, size: number, offset: number): void => {
      const loc = this.program.attrib(attr)
      if (loc < 0) return
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4)
      gl.vertexAttribDivisor(loc, 1) // 每个实例推进一次，而不是每个顶点
    }
    bind('aOrigin', 2, 0)
    bind('aTarget', 2, 2)
    bind('aSeed', 3, 4)
    bind('aParams', 4, 7)

    gl.bindVertexArray(null)
  }

  /** 上传一批粒子。只在配置变化时调，不要每帧调。 */
  setInstances(specs: ParticleSpec[]): void {
    const n = Math.min(specs.length, this.capacity)
    const data = new Float32Array(n * FLOATS_PER_INSTANCE)
    for (let i = 0; i < n; i++) {
      const s = specs[i]
      const o = i * FLOATS_PER_INSTANCE
      data[o] = s.origin[0]
      data[o + 1] = s.origin[1]
      data[o + 2] = s.target?.[0] ?? s.origin[0]
      data[o + 3] = s.target?.[1] ?? s.origin[1]
      data[o + 4] = Math.random()
      data[o + 5] = Math.random()
      data[o + 6] = Math.random()
      data[o + 7] = s.size
      data[o + 8] = s.delay
      data[o + 9] = s.life
      data[o + 10] = s.color
    }
    const { gl } = this
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data)
    this.count = n
  }

  /** 便捷构造：在一点周围迸发 n 颗。 */
  static burstAt(
    origin: [number, number],
    n: number,
    opts: { size?: number; spreadDelay?: number; color?: () => number } = {},
  ): ParticleSpec[] {
    const specs: ParticleSpec[] = []
    for (let i = 0; i < n; i++) {
      specs.push({
        origin,
        size: (opts.size ?? 5) * (0.5 + Math.random()),
        delay: Math.random() * (opts.spreadDelay ?? 0.15),
        life: 0.55 + Math.random() * 0.4,
        color: opts.color ? opts.color() : Math.floor(Math.random() * 4),
      })
    }
    return specs
  }

  draw(ctx: FrameCtx): void {
    if (this.count === 0) return
    const { gl } = this
    this.program.use()
    this.program
      .uni('uTime', ctx.t)
      .uni('uPhase', this.phase)
      .uni('uRes', [ctx.w, ctx.h])
      .uni('uDpr', ctx.dpr)
      .uni('uCenter', this.center)
      .uni('uSpread', this.spread)
      .uni('uGravity', this.gravity)
      .uni('uIntensity', this.intensity)
      .uni('uPalette0', this.palette[0])
      .uni('uPalette1', this.palette[1])
      .uni('uPalette2', this.palette[2])
      .uni('uPalette3', this.palette[3])
    this.program.uniInt('uMode', MODE_ID[this.mode])

    this.renderer.setBlend('add') // 粒子只加光，不遮挡
    gl.bindVertexArray(this.vao)
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count)
    gl.bindVertexArray(null)
  }

  dispose(): void {
    this.program.dispose()
    this.gl.deleteBuffer(this.cornerVbo)
    this.gl.deleteBuffer(this.instanceVbo)
    this.gl.deleteVertexArray(this.vao)
  }
}
