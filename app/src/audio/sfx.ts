/**
 * 音效 —— 全部用 Web Audio 现场合成，零素材、零请求。
 *
 * 「爱不释手」很大一部分来自听觉反馈：每捞到一枚字都该有回应，
 * 而且音高要往上走 —— 连捞七枚会自然形成一段上行音阶，
 * 这比任何进度条都更让人想捞满。
 *
 * 浏览器要求首次发声必须发生在用户手势里，所以 unlock() 挂在第一次点击上。
 */

class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  muted = false

  /** 必须在用户手势里调一次，否则 iOS 上永远不出声。 */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.22
    this.master.connect(this.ctx.destination)
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gain = 1,
    detune = 0,
  ): void {
    if (this.muted || !this.ctx || !this.master) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const env = this.ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    osc.detune.value = detune
    // 指数衰减包络：线性衰减听起来会「断」，指数才像真实的敲击
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(gain, t + 0.012)
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    osc.connect(env).connect(this.master)
    osc.start(t)
    osc.stop(t + duration + 0.02)
  }

  /** 捞到一枚字。音高按已捞数量沿五声音阶上行。 */
  catch(index: number): void {
    // 宫商角徵羽 —— 五声音阶不会出现半音冲突，连续上行怎么听都是对的
    const pentatonic = [0, 2, 4, 7, 9, 12, 14, 16]
    const semitone = pentatonic[Math.min(index, pentatonic.length - 1)]
    const freq = 523.25 * Math.pow(2, semitone / 12) // C5 起
    this.tone(freq, 0.5, 'sine', 0.9)
    this.tone(freq * 2, 0.28, 'triangle', 0.22) // 泛音，出「叮」的质感
  }

  /** 捞满七枚。 */
  complete(): void {
    ;[0, 4, 7, 12].forEach((s, i) => {
      window.setTimeout(() => this.tone(523.25 * Math.pow(2, s / 12), 0.9, 'sine', 0.8), i * 90)
    })
  }

  /** 印章落下：一记低沉的闷响。 */
  stamp(): void {
    this.tone(96, 0.42, 'sine', 1.0)
    this.tone(150, 0.2, 'square', 0.16)
  }

  /** 界面轻点。 */
  tap(): void {
    this.tone(880, 0.09, 'sine', 0.4)
  }

  /** 星官连线时，一条线一声。 */
  link(index: number): void {
    this.tone(392 * Math.pow(2, (index % 5) / 12), 0.34, 'triangle', 0.5)
  }
}

export const sfx = new Sfx()
