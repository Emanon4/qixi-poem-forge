/**
 * 极薄的 WebGL2 program 封装：编译、链接、缓存 uniform location。
 * 编译失败时把带行号的源码打进 console —— shader 报错不给行号是最浪费时间的事。
 */
export class Program {
  readonly handle: WebGLProgram
  private readonly locations = new Map<string, WebGLUniformLocation | null>()
  private readonly attribs = new Map<string, number>()

  constructor(
    private readonly gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string,
    private readonly label = 'program',
  ) {
    const vs = this.compile(gl.VERTEX_SHADER, vertexSource, 'vertex')
    const fs = this.compile(gl.FRAGMENT_SHADER, fragmentSource, 'fragment')

    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`[${label}] 链接失败: ${log}`)
    }

    // 链接完成后 shader 对象即可释放，program 已持有编译产物
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    this.handle = program
  }

  private compile(type: number, source: string, kind: string): WebGLShader {
    const { gl } = this
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? ''
      const numbered = source
        .split('\n')
        .map((line, i) => `${String(i + 1).padStart(4, ' ')} | ${line}`)
        .join('\n')
      gl.deleteShader(shader)
      console.error(`[${this.label}] ${kind} shader 编译失败:\n${log}\n${numbered}`)
      throw new Error(`[${this.label}] ${kind} shader 编译失败: ${log}`)
    }
    return shader
  }

  use(): void {
    this.gl.useProgram(this.handle)
  }

  /** 缓存 getUniformLocation —— 它是同步查询，每帧调是实打实的开销。 */
  loc(name: string): WebGLUniformLocation | null {
    let location = this.locations.get(name)
    if (location === undefined) {
      location = this.gl.getUniformLocation(this.handle, name)
      this.locations.set(name, location)
    }
    return location
  }

  attrib(name: string): number {
    let index = this.attribs.get(name)
    if (index === undefined) {
      index = this.gl.getAttribLocation(this.handle, name)
      this.attribs.set(name, index)
    }
    return index
  }

  /** 按值的形状自动分派到对应的 uniform*() 调用。 */
  uni(name: string, value: number | readonly number[] | Float32Array): this {
    const location = this.loc(name)
    if (location === null) return this // 该 uniform 被优化掉了，静默跳过

    const { gl } = this
    if (typeof value === 'number') {
      gl.uniform1f(location, value)
      return this
    }
    switch (value.length) {
      case 2:
        gl.uniform2f(location, value[0], value[1])
        break
      case 3:
        gl.uniform3f(location, value[0], value[1], value[2])
        break
      case 4:
        gl.uniform4f(location, value[0], value[1], value[2], value[3])
        break
      case 9:
        gl.uniformMatrix3fv(location, false, value as Float32Array)
        break
      case 16:
        gl.uniformMatrix4fv(location, false, value as Float32Array)
        break
      default:
        gl.uniform1fv(location, value as Float32Array)
    }
    return this
  }

  uniInt(name: string, value: number): this {
    const location = this.loc(name)
    if (location !== null) this.gl.uniform1i(location, value)
    return this
  }

  /** 绑定一张贴图到指定纹理单元并设好 sampler。 */
  uniTexture(name: string, texture: WebGLTexture, unit: number): this {
    const { gl } = this
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    this.uniInt(name, unit)
    return this
  }

  dispose(): void {
    this.gl.deleteProgram(this.handle)
    this.locations.clear()
    this.attribs.clear()
  }
}
