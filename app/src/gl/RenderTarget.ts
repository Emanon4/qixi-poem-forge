/**
 * 离屏渲染目标。
 *
 * 用半浮点（RGBA16F）而不是 RGBA8：辉光要在场景亮度超过 1.0 的地方才好看，
 * 8bit 目标会把所有高光先削平到 1.0，再怎么提亮部都只能得到一坨白。
 * 拿不到浮点扩展时降级到 RGBA8，画面还在，只是辉光会弱一些。
 */
export class RenderTarget {
  readonly framebuffer: WebGLFramebuffer
  readonly texture: WebGLTexture
  width = 0
  height = 0

  constructor(
    private readonly gl: WebGL2RenderingContext,
    width: number,
    height: number,
    private readonly hdr = true,
  ) {
    this.framebuffer = gl.createFramebuffer()!
    this.texture = gl.createTexture()!

    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.texture,
      0,
    )
    this.resize(width, height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** 半浮点渲染要显式开扩展，否则 framebuffer 会 INCOMPLETE。 */
  static enableFloat(gl: WebGL2RenderingContext): boolean {
    return (
      gl.getExtension('EXT_color_buffer_half_float') !== null ||
      gl.getExtension('EXT_color_buffer_float') !== null
    )
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    if (w === this.width && h === this.height) return
    this.width = w
    this.height = h

    const { gl } = this
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    if (this.hdr) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null)
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    }
  }

  bind(): void {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
    gl.viewport(0, 0, this.width, this.height)
  }

  dispose(): void {
    this.gl.deleteFramebuffer(this.framebuffer)
    this.gl.deleteTexture(this.texture)
  }
}
