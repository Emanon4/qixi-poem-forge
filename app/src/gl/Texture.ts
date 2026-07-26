/** 把一张图变成 WebGL 贴图。非 2 次幂尺寸走 CLAMP + LINEAR，不生成 mipmap。 */
export function createTexture(
  gl: WebGL2RenderingContext,
  source: TexImageSource,
): WebGLTexture {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  // 刻意不用 UNPACK_FLIP_Y_WEBGL：它对 ImageBitmap 源在各家实现里表现不一致
  // （实测会被忽略，导致图上下翻转）。方向统一由 shader 采样时换算，
  // 这样 CPU 侧算出来的主体框可以保持图片原生的 y 向下坐标，少一层转换。
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  return texture
}

/** 从 blob URL 解码出可直接上传的位图。 */
export async function loadBitmap(url: string): Promise<ImageBitmap | HTMLImageElement> {
  try {
    const response = await fetch(url)
    return await createImageBitmap(await response.blob())
  } catch {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('BITMAP_LOAD_FAILED'))
      img.src = url
    })
  }
}
