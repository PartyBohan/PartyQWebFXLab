import * as Tone from 'tone'
import type { Adsr, FxState, SoundPreset } from '../types'

// ---------------------------------------------------------------------------
// Tone.js sound engine + DSP FX rack.
//
// Signal chain:
//   PolySynth -> Distortion -> Chorus -> Filter -> Compressor -> Delay
//             -> Reverb -> limiter -> destination
//
// Every effect stays connected at all times; "disabled" means neutral settings
// (wet=0, open filter, ratio≈1) so toggling never causes reconnection clicks.
// ---------------------------------------------------------------------------

export class AudioEngine {
  private synth: Tone.PolySynth | null = null
  private distortion!: Tone.Distortion
  private chorus!: Tone.Chorus
  private filter!: Tone.Filter
  private compressor!: Tone.Compressor
  private delay!: Tone.FeedbackDelay
  private reverb!: Tone.Reverb
  private limiter!: Tone.Limiter
  private preGain!: Tone.Gain

  private started = false
  private builtFx = false

  /**
   * Safe to call repeatedly: once on load (works where autoplay is allowed,
   * e.g. the Capacitor WKWebView) and again from a user gesture otherwise.
   * The context is built once; each call only retries resume().
   */
  async start(): Promise<void> {
    if (this.started) return

    if (!this.builtFx) {
      // Low-latency interactive context: the browser/WKWebView picks the smallest
      // safe output buffer. Pair this with AppDelegate's small IO buffer on iOS.
      const ctx = new Tone.Context({ latencyHint: 'interactive' })
      // lookAhead = 0 → notes triggered "now" play as soon as possible (live feel).
      // The web-audio output buffer is the only remaining latency. Keep updateInterval
      // small so envelopes/automation stay smooth without adding scheduling delay.
      ctx.lookAhead = 0
      ctx.updateInterval = 0.02
      Tone.setContext(ctx)
      this.buildFxChain()
    }

    await Tone.start()
    if (Tone.getContext().state === 'running') this.started = true
  }

  get isStarted(): boolean {
    return this.started
  }

  private buildFxChain() {
    if (this.builtFx) return
    this.preGain = new Tone.Gain(0.9)
    this.distortion = new Tone.Distortion({ distortion: 0.2, wet: 0 })
    this.chorus = new Tone.Chorus({ frequency: 1.5, depth: 0.6, wet: 0 }).start()
    this.filter = new Tone.Filter({ frequency: 20000, type: 'lowpass', Q: 0 })
    this.compressor = new Tone.Compressor({ threshold: -24, ratio: 1 })
    this.delay = new Tone.FeedbackDelay({ delayTime: 0.28, feedback: 0.3, wet: 0 })
    this.reverb = new Tone.Reverb({ decay: 2.2, preDelay: 0.02, wet: 0 })
    this.limiter = new Tone.Limiter(-1)

    this.preGain.chain(
      this.distortion,
      this.chorus,
      this.filter,
      this.compressor,
      this.delay,
      this.reverb,
      this.limiter,
      Tone.getDestination(),
    )
    this.builtFx = true
  }

  /** (Re)build the synth voice for a preset. ADSR override is optional. */
  setPreset(preset: SoundPreset, adsr?: Adsr) {
    if (!this.started) return

    // Dispose the old voice cleanly.
    if (this.synth) {
      this.synth.releaseAll()
      this.synth.dispose()
      this.synth = null
    }

    const envelope = adsr ?? preset.envelope
    const voice = this.voiceClass(preset)
    const options = this.voiceOptions(preset, envelope)

    this.synth = new Tone.PolySynth(voice, options as Tone.SynthOptions)
    this.synth.maxPolyphony = 24
    this.synth.connect(this.preGain)
    this.preGain.gain.rampTo(preset.gain ?? 0.85, 0.05)
  }

  /** Update just the envelope of the live synth (cheap — no rebuild). */
  setAdsr(adsr: Adsr) {
    if (this.synth) {
      this.synth.set({ envelope: adsr } as Partial<Tone.SynthOptions>)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private voiceClass(preset: SoundPreset): any {
    switch (preset.kind) {
      case 'fm':
        return Tone.FMSynth
      case 'am':
        return Tone.AMSynth
      default:
        return Tone.Synth
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private voiceOptions(preset: SoundPreset, envelope: Adsr): any {
    const oscillator: Record<string, unknown> = { type: preset.oscillator }
    if (preset.oscillator.startsWith('fat') && preset.spread != null) {
      oscillator.spread = preset.spread
      oscillator.count = 3
    }

    const base: Record<string, unknown> = { oscillator, envelope }

    if (preset.kind === 'fm' || preset.kind === 'am') {
      if (preset.modulation?.harmonicity != null) {
        base.harmonicity = preset.modulation.harmonicity
      }
      if (preset.kind === 'fm' && preset.modulation?.modulationIndex != null) {
        base.modulationIndex = preset.modulation.modulationIndex
      }
      if (preset.modulation?.modulationType) {
        base.modulation = { type: preset.modulation.modulationType }
      }
    }
    return base
  }

  /** Apply the full FX rack state. */
  updateFx(fx: FxState) {
    if (!this.started) return
    const t = 0.03

    // Reverb (decay can't ramp; set directly, others ramp).
    this.reverb.wet.rampTo(fx.reverb.enabled ? fx.reverb.wet : 0, t)
    this.reverb.decay = Math.max(0.1, fx.reverb.decay)
    this.reverb.preDelay = Math.min(0.2, fx.reverb.roomSize * 0.1)

    // Delay.
    this.delay.wet.rampTo(fx.delay.enabled ? fx.delay.wet : 0, t)
    this.delay.delayTime.rampTo(fx.delay.time, t)
    this.delay.feedback.rampTo(Math.min(0.95, fx.delay.feedback), t)

    // Chorus.
    this.chorus.wet.rampTo(fx.chorus.enabled ? fx.chorus.wet : 0, t)
    this.chorus.depth = fx.chorus.depth
    this.chorus.frequency.rampTo(fx.chorus.rate, t)

    // Filter (open it fully when disabled).
    this.filter.frequency.rampTo(fx.filter.enabled ? fx.filter.cutoff : 20000, t)
    this.filter.Q.rampTo(fx.filter.enabled ? fx.filter.resonance : 0, t)

    // Distortion.
    this.distortion.wet.rampTo(fx.distortion.enabled ? fx.distortion.wet : 0, t)
    this.distortion.distortion = fx.distortion.drive

    // Compressor (ratio 1 = effectively bypassed).
    this.compressor.threshold.rampTo(fx.compressor.enabled ? fx.compressor.threshold : 0, t)
    this.compressor.ratio.rampTo(fx.compressor.enabled ? fx.compressor.ratio : 1, t)
  }

  triggerAttack(midi: number, velocity = 0.8) {
    if (!this.synth) return
    const freq = Tone.Frequency(midi, 'midi').toFrequency()
    this.synth.triggerAttack(freq, Tone.now(), Math.max(0.05, velocity))
  }

  triggerRelease(midi: number) {
    if (!this.synth) return
    const freq = Tone.Frequency(midi, 'midi').toFrequency()
    this.synth.triggerRelease(freq, Tone.now())
  }

  /** Master output level 0..1. */
  setMasterVolume(v: number) {
    Tone.getDestination().volume.rampTo(Tone.gainToDb(Math.max(0.0001, v)), 0.05)
  }

  releaseAll() {
    this.synth?.releaseAll()
  }
}

export const audioEngine = new AudioEngine()
