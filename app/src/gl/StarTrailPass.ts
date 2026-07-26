import { Program } from './Program'
import type { FrameCtx, Pass, Renderer } from './Renderer'

const TRAIL_VERT = /* glsl */ `#version 300 es
in vec2  aPos;   // byWidth 空间：x∈[-0.5,0.5]，y 按比例延伸
in vec3  aData;  // x=剩余寿命01  y=像素尺寸  z=色相种子

uniform float uAspectY; // uRes.y / uRes.x
uniform float uDpr;

out float vLife;
out float vSeed;

void main() {
  vLife = aData.x;
  vSeed = aData.z;
  vec2 uv = vec2(aPos.x + 0.5, aPos.y / uAspectY + 0.5);
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
  // 越接近消亡越小，收尾自然
  gl_PointSize = aData.y * uDpr * (0.30 + 0.70 * aData.x);
}
`

const TRAIL_FRAG = /* glsl */ `#version 300 es
precision highp float;

in float vLife;
in float vSeed;
out vec4 fragColor;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c);
  float core = exp(-d2 * 26.0);
  float glow = exp(-d2 * 5.5) * 0.42;
  // 寿命平方衰减：尾部消失得更快，拖尾才有「速度感」而不是一条等亮的线
  float a = (core + glow) * vLife * vLife;
  if (a < 0.004) discard;

  vec3 gold  = vec3(1.000, 0.870, 0.620);
  vec3 pink  = vec3(1.000, 0.720, 0.820);
  vec3 lilac = vec3(0.780, 0.700, 1.000);
  vec3 col = vSeed < 0.5
    ? mix(gold, pink, vSeed * 2.0)
    : mix(pink, lilac, (vSeed - 0.5) * 2.0);

  fragColor = vec4(col * a, a); // 加法混合，只贡献光
}
`

const FLOATS_PER_PARTICLE = 5 // x, y, life, size, seed

/**
 * 手指划屏的星尘拖尾。
 *
 * CPU 模拟 + 每帧上传 —— 粒子数在千级以内，bufferSubData 的开销远小于
 * 为它单独搭一套 transform-feedback 的复杂度。真正上万级的粒子（第3幕炼诗的
 * 词云碎片）再走 GPU 端程序化生成。
 */
export class StarTrailPass implements Pass {
  readonly name = 'starTrail'
  enabled = true

  private readonly gl: WebGL2RenderingContext
  private readonly program: Program
  private readonly vbo: WebGLBuffer
  private readonly vao: WebGLVertexArrayObject

  private readonly max: number
  private readonly gpu: Float32Array
  private readonly vel: Float32Array
  private readonly ttl: Float32Array
  private count = 0

  private emitBudget = 0
  private lastEmitAt = { x: 0, y: 0 }
  private smoothedEnergy = 0

  /** 0→1 的「手指搅动星河」强度，供天空 pass 做整体提亮。 */
  get energy(): number {
    return this.smoothedEnergy
  }

  constructor(
    private readonly renderer: Renderer,
    maxParticles = 900,
  ) {
    this.gl = renderer.gl
    this.max = maxParticles
    this.gpu = new Float32Array(maxParticles * FLOATS_PER_PARTICLE)
    this.vel = new Float32Array(maxParticles * 2)
    this.ttl = new Float32Array(maxParticles)

    this.program = new Program(this.gl, TRAIL_VERT, TRAIL_FRAG, 'starTrail')

    const { gl } = this
    this.vbo = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
    gl.bufferData(gl.ARRAY_BUFFER, this.gpu.byteLength, gl.DYNAMIC_DRAW)

    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    const stride = FLOATS_PER_PARTICLE * 4
    const posLoc = this.program.attrib('aPos')
    const dataLoc = this.program.attrib('aData')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(dataLoc)
    gl.vertexAttribPointer(dataLoc, 3, gl.FLOAT, false, stride, 2 * 4)
    gl.bindVertexArray(null)
  }

  private spawn(x: number, y: number, vx: number, vy: number, quality: number): void {
    if (this.count >= this.max) return
    const i = this.count++
    const o = i * FLOATS_PER_PARTICLE

    // 垂直于运动方向散开，形成有宽度的尾迹而不是一条线
    const speed = Math.hypot(vx, vy) || 1e-4
    const nx = -vy / speed
    const ny = vx / speed
    const spread = (Math.random() - 0.5) * 0.030

    this.gpu[o] = x + nx * spread
    this.gpu[o + 1] = y + ny * spread
    this.gpu[o + 2] = 1
    this.gpu[o + 3] = (2.5 + Math.random() * 7.5) * (0.6 + 0.4 * quality)
    this.gpu[o + 4] = Math.random()

    // 继承一部分手指速度，再叠一点随机漂移和上浮
    this.vel[i * 2] = vx * 0.20 + (Math.random() - 0.5) * 0.055
    this.vel[i * 2 + 1] = vy * 0.20 + (Math.random() - 0.5) * 0.055 + 0.020
    this.ttl[i] = 0.55 + Math.random() * 0.75
  }

  /** 交换删除：把队尾粒子搬到空洞位置，保持数组前 count 个全是活的。 */
  private kill(i: number): void {
    const last = --this.count
    if (i === last) return
    const from = last * FLOATS_PER_PARTICLE
    const to = i * FLOATS_PER_PARTICLE
    for (let k = 0; k < FLOATS_PER_PARTICLE; k++) this.gpu[to + k] = this.gpu[from + k]
    this.vel[i * 2] = this.vel[last * 2]
    this.vel[i * 2 + 1] = this.vel[last * 2 + 1]
    this.ttl[i] = this.ttl[last]
  }

  private simulate(ctx: FrameCtx): void {
    const { dt, pointer } = ctx
    const aspectY = ctx.h / ctx.w

    // 触点转到 byWidth 空间
    const px = pointer.x - 0.5
    const py = (pointer.y - 0.5) * aspectY
    const vx = pointer.vx
    const vy = pointer.vy * aspectY

    const speed = Math.hypot(vx, vy)
    // 能量：快速划动拉满，抬手后缓慢回落
    const targetEnergy = Math.min(speed / 1.6, 1)
    const k = targetEnergy > this.smoothedEnergy ? 8 : 2.2
    this.smoothedEnergy += (targetEnergy - this.smoothedEnergy) * Math.min(dt * k, 1)

    // 按移动距离发射，慢慢划也能连成线，停手就不再冒粒子
    const moved = Math.hypot(px - this.lastEmitAt.x, py - this.lastEmitAt.y)
    if (moved > 0.0015) {
      this.emitBudget += moved * 620 * (0.55 + 0.45 * ctx.quality)
      this.lastEmitAt = { x: px, y: py }
    }
    const toEmit = Math.min(Math.floor(this.emitBudget), 26)
    this.emitBudget -= toEmit
    for (let n = 0; n < toEmit; n++) this.spawn(px, py, vx, vy, ctx.quality)

    // 反向遍历，配合交换删除不会漏掉搬过来的粒子
    const drag = Math.exp(-dt * 2.1)
    for (let i = this.count - 1; i >= 0; i--) {
      const o = i * FLOATS_PER_PARTICLE
      const life = this.gpu[o + 2] - dt / this.ttl[i]
      if (life <= 0) {
        this.kill(i)
        continue
      }
      this.gpu[o + 2] = life
      this.gpu[o] += this.vel[i * 2] * dt
      this.gpu[o + 1] += this.vel[i * 2 + 1] * dt
      this.vel[i * 2] *= drag
      this.vel[i * 2 + 1] = this.vel[i * 2 + 1] * drag + 0.045 * dt // 余烬上浮
    }
  }

  draw(ctx: FrameCtx): void {
    this.simulate(ctx)
    if (this.count === 0) return

    const { gl } = this
    this.program.use()
    this.program.uni('uAspectY', ctx.h / ctx.w).uni('uDpr', ctx.dpr)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      this.gpu.subarray(0, this.count * FLOATS_PER_PARTICLE),
    )

    // 走 renderer 的混合状态机，别自己 enable/disable，否则它的缓存会失真
    this.renderer.setBlend('add') // 纯加法：星尘只加光，不遮挡
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.POINTS, 0, this.count)
    gl.bindVertexArray(null)
  }

  dispose(): void {
    this.program.dispose()
    this.gl.deleteBuffer(this.vbo)
    this.gl.deleteVertexArray(this.vao)
  }
}
