import * as THREE from 'three';
import { STAND_CRY_LIBRARY, type StandCryClip, type StandCryId } from '../game/StandCries';

export type BugKind = 'fly' | 'mosquito';

interface BugBuzzVoice {
  id: number;
  kind: BugKind;
  oscMain: OscillatorNode;
  oscHarmonic: OscillatorNode;
  flutterLfo: OscillatorNode;
  flutterGain: GainNode;
  vibratoLfo: OscillatorNode;
  vibratoGain: GainNode;
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
  voiceGain: GainNode;
  baseFreq: number;
  prevDistance: number;
}

export class ProceduralAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buzzBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private weatherGain: GainNode | null = null;
  private weatherFilter: BiquadFilterNode | null = null;
  private weatherNoise: AudioBufferSourceNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private standCryBuffers = new Map<StandCryId, AudioBuffer>();
  private standCryFetchStarted = false;
  private voices = new Map<number, BugBuzzVoice>();
  private muted = false;
  private unlocked = false;
  private bgmEnabled = false;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private bgmPanic = false;
  private tmpLocal = new THREE.Vector3();

  public isMuted(): boolean {
    return this.muted;
  }

  public isUnlocked(): boolean {
    return this.unlocked && !!this.ctx && this.ctx.state === 'running';
  }

  public isBgmEnabled(): boolean {
    return this.bgmEnabled;
  }

  public async unlock(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }
    this.unlocked = ctx.state === 'running';
    if (this.unlocked) {
      this.ensureWeatherBed();
      void this.preloadStandCries();
    }
    return this.unlocked;
  }

  private async preloadStandCries(): Promise<void> {
    if (this.standCryFetchStarted || !this.ctx) return;
    this.standCryFetchStarted = true;
    for (const clip of STAND_CRY_LIBRARY) {
      try {
        const res = await fetch(`/api/audio/jojo-cry?id=${encodeURIComponent(clip.id)}`);
        if (!res.ok) continue;
        const payload = (await res.json()) as { audioBase64?: string };
        if (!payload.audioBase64 || !this.ctx) continue;
        const bin = atob(payload.audioBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
          bytes[i] = bin.charCodeAt(i);
        }
        const decoded = await this.ctx.decodeAudioData(bytes.buffer.slice(0));
        this.standCryBuffers.set(clip.id, decoded);
      } catch {
        // Formant vocal synthesis still guarantees battle cries if offline
      }
    }
  }

  public setMuted(muted: boolean): boolean {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.03);
    }
    return this.muted;
  }

  public toggleMute(): boolean {
    return this.setMuted(!this.muted);
  }

  public async toggleBgm(): Promise<boolean> {
    await this.unlock();
    this.bgmEnabled = !this.bgmEnabled;
    if (this.bgmEnabled) {
      this.startBgmLoop();
    } else {
      this.stopBgmLoop();
    }
    return this.bgmEnabled;
  }

  public setPanicState(panic: boolean): void {
    this.bgmPanic = panic;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.9;
      this.masterGain.connect(this.ctx.destination);

      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.14;
      compressor.connect(this.masterGain);

      this.buzzBus = this.ctx.createGain();
      this.buzzBus.gain.value = 0.85;
      this.buzzBus.connect(compressor);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.95;
      this.sfxBus.connect(compressor);

      this.weatherGain = this.ctx.createGain();
      this.weatherGain.gain.value = 0.018;
      this.weatherFilter = this.ctx.createBiquadFilter();
      this.weatherFilter.type = 'bandpass';
      this.weatherFilter.frequency.value = 650;
      this.weatherFilter.Q.value = 0.7;
      this.weatherFilter.connect(this.weatherGain);
      this.weatherGain.connect(compressor);

      this.buildNoiseBuffer(this.ctx);
    }
    return this.ctx;
  }

  private ensureWeatherBed(): void {
    if (!this.ctx || !this.noiseBuffer || !this.weatherFilter || this.weatherNoise) return;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      src.connect(this.weatherFilter);
      src.start();
      this.weatherNoise = src;
    } catch {
      // ignore
    }
  }

  public setWeatherAudio(
    rainIntensity: number,
    windStrength: number,
    location: 'room' | 'balcony' | 'toilet' = 'balcony',
  ): void {
    if (!this.ctx || this.ctx.state !== 'running' || !this.weatherGain || !this.weatherFilter) {
      return;
    }
    const now = this.ctx.currentTime;
    let gain = 0.008 + rainIntensity * 0.032 + windStrength * 0.025;
    let freq = 480 + windStrength * 950 + rainIntensity * 650;
    if (location === 'room') {
      gain = 0.007 + windStrength * 0.024;
      freq = 260 + windStrength * 480;
    } else if (location === 'toilet') {
      gain = 0.011 + Math.max(rainIntensity, windStrength) * 0.028;
      freq = 760 + Math.max(rainIntensity, windStrength) * 980;
    }
    this.weatherGain.gain.setTargetAtTime(gain, now, 0.2);
    this.weatherFilter.frequency.setTargetAtTime(freq, now, 0.25);
  }

  private startBgmLoop(): void {
    this.stopBgmLoop();
    const tickMs = 150;
    const bassScale = [55.0, 55.0, 65.41, 73.42, 82.41, 73.42, 65.41, 49.0];
    const leadScale = [220, 261.63, 329.63, 293.66, 392.0, 329.63, 293.66, 246.94];

    this.bgmTimer = window.setInterval(() => {
      if (!this.bgmEnabled || this.muted || !this.ctx || this.ctx.state !== 'running' || !this.sfxBus) {
        return;
      }
      const now = this.ctx.currentTime;
      const step = this.bgmStep++ % bassScale.length;
      const shift = this.bgmPanic ? 1.122 : 1.0;

      // Punchy JoJo synthwave bass pulse
      const bass = this.ctx.createOscillator();
      bass.type = 'sawtooth';
      bass.frequency.setValueAtTime(bassScale[step] * shift, now);
      const bFilter = this.ctx.createBiquadFilter();
      bFilter.type = 'lowpass';
      bFilter.frequency.setValueAtTime(this.bgmPanic ? 680 : 440, now);
      const bGain = this.ctx.createGain();
      bGain.gain.setValueAtTime(0.001, now);
      bGain.gain.linearRampToValueAtTime(0.085, now + 0.012);
      bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      bass.connect(bFilter).connect(bGain).connect(this.sfxBus);
      bass.start(now);
      bass.stop(now + 0.14);

      if (step % 2 === 0) {
        const lead = this.ctx.createOscillator();
        lead.type = 'triangle';
        lead.frequency.setValueAtTime(leadScale[step] * shift, now);
        const lGain = this.ctx.createGain();
        lGain.gain.setValueAtTime(0.001, now);
        lGain.gain.linearRampToValueAtTime(0.045, now + 0.01);
        lGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        lead.connect(lGain).connect(this.sfxBus);
        lead.start(now);
        lead.stop(now + 0.19);
      }
    }, tickMs);
  }

  private stopBgmLoop(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  private buildNoiseBuffer(ctx: AudioContext): void {
    const length = Math.floor(ctx.sampleRate * 1.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  public syncBugVoice(
    id: number,
    kind: BugKind,
    worldPos: THREE.Vector3,
    speed: number,
    camera: THREE.Camera,
  ): { distance: number; intensity: number; pan: number } {
    const distance = worldPos.distanceTo(camera.position);
    this.tmpLocal.copy(worldPos).applyMatrix4(camera.matrixWorldInverse);
    const pan = THREE.MathUtils.clamp(this.tmpLocal.x / Math.max(0.32, distance), -0.95, 0.95);

    const proximity = THREE.MathUtils.clamp(1 - (distance - 0.35) / 3.85, 0, 1);
    const intensity = Math.pow(proximity, 1.85);

    if (!this.ctx || this.ctx.state !== 'running') {
      return { distance, intensity, pan };
    }

    let voice = this.voices.get(id);
    if (!voice) {
      const created = this.createBugVoice(id, kind, distance);
      if (!created) return { distance, intensity, pan };
      voice = created;
      this.voices.set(id, voice);
    }

    const now = this.ctx.currentTime;
    const approachRate = THREE.MathUtils.clamp((voice.prevDistance - distance) * 14, -1.2, 1.8);
    voice.prevDistance = distance;

    const dopplerMult = 1 + approachRate * 0.045;
    const agitationMult = 1 + intensity * (kind === 'mosquito' ? 0.15 : 0.11);
    const speedMult = 1 + THREE.MathUtils.clamp(speed / 8, 0, 0.09);
    const targetFreq = voice.baseFreq * dopplerMult * agitationMult * speedMult;

    voice.oscMain.frequency.setTargetAtTime(targetFreq, now, 0.04);
    voice.oscHarmonic.frequency.setTargetAtTime(
      kind === 'mosquito' ? targetFreq * 1.98 : targetFreq * 1.52,
      now,
      0.04,
    );

    const flutterRate = kind === 'mosquito' ? 36 + intensity * 18 : 24 + intensity * 14;
    voice.flutterLfo.frequency.setTargetAtTime(flutterRate, now, 0.06);
    voice.flutterGain.gain.setTargetAtTime(
      kind === 'mosquito' ? 0.025 + intensity * 0.08 : 0.035 + intensity * 0.095,
      now,
      0.05,
    );

    const minCutoff = kind === 'mosquito' ? 750 : 380;
    const maxCutoff = kind === 'mosquito' ? 5400 : 3500;
    const cutoff = minCutoff + (maxCutoff - minCutoff) * Math.pow(proximity, 1.35);
    voice.filter.frequency.setTargetAtTime(cutoff, now, 0.045);
    voice.filter.Q.setTargetAtTime(
      kind === 'mosquito' ? 2.2 + intensity * 2.5 : 1.1 + intensity * 1.4,
      now,
      0.05,
    );

    const baseAmbient = kind === 'mosquito' ? 0.008 : 0.01;
    const maxGain = kind === 'mosquito' ? 0.25 : 0.27;
    const targetGain = baseAmbient + (maxGain - baseAmbient) * intensity;
    voice.voiceGain.gain.setTargetAtTime(targetGain, now, 0.035);
    voice.panner.pan.setTargetAtTime(pan, now, 0.03);

    return { distance, intensity, pan };
  }

  private createBugVoice(id: number, kind: BugKind, initialDistance: number): BugBuzzVoice | null {
    if (!this.ctx || !this.buzzBus) return null;
    const now = this.ctx.currentTime;

    const baseFreq =
      kind === 'mosquito' ? 495 + Math.random() * 115 : 162 + Math.random() * 38;

    const oscMain = this.ctx.createOscillator();
    oscMain.type = 'sawtooth';
    oscMain.frequency.setValueAtTime(baseFreq, now);

    const oscHarmonic = this.ctx.createOscillator();
    oscHarmonic.type = kind === 'mosquito' ? 'sine' : 'triangle';
    oscHarmonic.frequency.setValueAtTime(
      kind === 'mosquito' ? baseFreq * 1.98 : baseFreq * 1.52,
      now,
    );

    const harmonicGain = this.ctx.createGain();
    harmonicGain.gain.setValueAtTime(kind === 'mosquito' ? 0.55 : 0.42, now);

    const vibratoLfo = this.ctx.createOscillator();
    vibratoLfo.type = 'sine';
    vibratoLfo.frequency.setValueAtTime(
      kind === 'mosquito' ? 6.4 + Math.random() * 2.5 : 4.2 + Math.random() * 1.8,
      now,
    );
    const vibratoGain = this.ctx.createGain();
    vibratoGain.gain.setValueAtTime(kind === 'mosquito' ? 24 : 9, now);
    vibratoLfo.connect(vibratoGain);
    vibratoGain.connect(oscMain.frequency);
    vibratoGain.connect(oscHarmonic.frequency);

    const filter = this.ctx.createBiquadFilter();
    filter.type = kind === 'mosquito' ? 'bandpass' : 'lowpass';
    filter.frequency.setValueAtTime(kind === 'mosquito' ? 1100 : 600, now);
    filter.Q.setValueAtTime(kind === 'mosquito' ? 2.4 : 1.3, now);

    const voiceGain = this.ctx.createGain();
    voiceGain.gain.setValueAtTime(0.001, now);

    const flutterLfo = this.ctx.createOscillator();
    flutterLfo.type = 'triangle';
    flutterLfo.frequency.setValueAtTime(kind === 'mosquito' ? 36 : 26, now);
    const flutterGain = this.ctx.createGain();
    flutterGain.gain.setValueAtTime(0.03, now);
    flutterLfo.connect(flutterGain);
    flutterGain.connect(voiceGain.gain);

    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(0, now);

    oscMain.connect(filter);
    oscHarmonic.connect(harmonicGain);
    harmonicGain.connect(filter);
    filter.connect(voiceGain);
    voiceGain.connect(panner);
    panner.connect(this.buzzBus);

    oscMain.start(now);
    oscHarmonic.start(now);
    vibratoLfo.start(now);
    flutterLfo.start(now);

    return {
      id,
      kind,
      oscMain,
      oscHarmonic,
      flutterLfo,
      flutterGain,
      vibratoLfo,
      vibratoGain,
      filter,
      panner,
      voiceGain,
      baseFreq,
      prevDistance: initialDistance,
    };
  }

  public removeBugVoice(id: number): void {
    const voice = this.voices.get(id);
    if (!voice || !this.ctx) return;
    this.voices.delete(id);

    const now = this.ctx.currentTime;
    try {
      voice.voiceGain.gain.cancelScheduledValues(now);
      voice.voiceGain.gain.setTargetAtTime(0.0001, now, 0.015);
      const stopAt = now + 0.08;
      voice.oscMain.stop(stopAt);
      voice.oscHarmonic.stop(stopAt);
      voice.flutterLfo.stop(stopAt);
      voice.vibratoLfo.stop(stopAt);
      setTimeout(() => {
        try {
          voice.oscMain.disconnect();
          voice.oscHarmonic.disconnect();
          voice.flutterLfo.disconnect();
          voice.vibratoLfo.disconnect();
          voice.filter.disconnect();
          voice.panner.disconnect();
          voice.voiceGain.disconnect();
        } catch {
          // ignore cleanup
        }
      }, 120);
    } catch {
      // ignore
    }
  }

  public clearAllVoices(): void {
    for (const id of Array.from(this.voices.keys())) {
      this.removeBugVoice(id);
    }
  }

  public playClap(hitCount = 0): void {
    if (this.muted || !this.ctx || !this.sfxBus || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    [0, 0.013].forEach((offset, idx) => {
      if (!this.ctx || !this.sfxBus || !this.noiseBuffer) return;
      const t = now + offset;
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(idx === 0 ? 1550 : 2100, t);
      filter.Q.setValueAtTime(1.1, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(idx === 0 ? 0.55 : 0.42, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.095);

      const pan = this.ctx.createStereoPanner();
      pan.pan.setValueAtTime(idx === 0 ? -0.18 : 0.18, t);

      noise.connect(filter).connect(gain).connect(pan).connect(this.sfxBus);
      noise.start(t, Math.random() * 0.5, 0.12);
    });

    const thump = this.ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(hitCount > 0 ? 190 : 155, now);
    thump.frequency.exponentialRampToValueAtTime(58, now + 0.08);
    const thumpGain = this.ctx.createGain();
    thumpGain.gain.setValueAtTime(0.001, now);
    thumpGain.gain.linearRampToValueAtTime(0.28, now + 0.004);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    thump.connect(thumpGain).connect(this.sfxBus);
    thump.start(now);
    thump.stop(now + 0.1);
  }

  public playSmash(side: 'left' | 'right', hitCount = 0): void {
    if (this.muted || !this.ctx || !this.sfxBus || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const panVal = side === 'left' ? -0.48 : 0.48;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(1950, now + 0.055);
    filter.frequency.exponentialRampToValueAtTime(480, now + 0.13);
    filter.Q.setValueAtTime(1.4, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(hitCount > 0 ? 0.52 : 0.34, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(panVal, now);

    noise.connect(filter).connect(gain).connect(panner).connect(this.sfxBus);
    noise.start(now, Math.random() * 0.4, 0.16);

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(side === 'left' ? 145 : 160, now + 0.03);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.12);
    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.001, now + 0.03);
    oscGain.gain.linearRampToValueAtTime(hitCount > 0 ? 0.3 : 0.16, now + 0.035);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(oscGain).connect(panner).connect(this.sfxBus);
    osc.start(now + 0.03);
    osc.stop(now + 0.14);
  }

  public playLockOnChirp(targetCount: number): void {
    if (this.muted || !this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    const pips = Math.max(1, Math.min(6, targetCount));

    for (let i = 0; i < pips; i++) {
      const t = now + i * 0.055;
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      const freq = 920 + i * 165;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.38, t + 0.045);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(freq * 1.4, t);
      filter.Q.setValueAtTime(2.0, t);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

      osc.connect(filter).connect(g).connect(this.sfxBus);
      osc.start(t);
      osc.stop(t + 0.075);
    }

    // Dramatic bass lock-in drop
    const lockSub = this.ctx.createOscillator();
    lockSub.type = 'sine';
    lockSub.frequency.setValueAtTime(180, now);
    lockSub.frequency.exponentialRampToValueAtTime(52, now + 0.22);
    const lGain = this.ctx.createGain();
    lGain.gain.setValueAtTime(0.001, now);
    lGain.gain.linearRampToValueAtTime(0.26, now + 0.015);
    lGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    lockSub.connect(lGain).connect(this.sfxBus);
    lockSub.start(now);
    lockSub.stop(now + 0.25);
  }

  public playSuperHandSlam(magnitude = 1.0): void {
    if (this.muted || !this.ctx || !this.sfxBus || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const power = THREE.MathUtils.clamp(magnitude, 0.55, 2.0);

    // 1. Descending JoJo Stand whistle
    const whistle = this.ctx.createOscillator();
    whistle.type = 'sawtooth';
    whistle.frequency.setValueAtTime(920 + power * 120, now);
    whistle.frequency.exponentialRampToValueAtTime(95, now + 0.14);
    const wGain = this.ctx.createGain();
    wGain.gain.setValueAtTime(0.001, now);
    wGain.gain.linearRampToValueAtTime(0.14 * Math.min(1.4, power), now + 0.02);
    wGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    whistle.connect(wGain).connect(this.sfxBus);
    whistle.start(now);
    whistle.stop(now + 0.17);

    // 2. Massive floor slam sub-bass boom scaled by magnitude
    const impactAt = now + 0.06;
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(125 + power * 18, impactAt);
    sub.frequency.exponentialRampToValueAtTime(24, impactAt + 0.42 + power * 0.08);
    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.001, impactAt);
    subGain.gain.linearRampToValueAtTime(Math.min(0.75, 0.44 * power), impactAt + 0.01);
    subGain.gain.exponentialRampToValueAtTime(0.001, impactAt + 0.46 + power * 0.08);
    sub.connect(subGain).connect(this.sfxBus);
    sub.start(impactAt);
    sub.stop(impactAt + 0.58);

    // 3. Desk/floor crunch noise burst
    const crunch = this.ctx.createBufferSource();
    crunch.buffer = this.noiseBuffer;
    const cFilter = this.ctx.createBiquadFilter();
    cFilter.type = 'lowpass';
    cFilter.frequency.setValueAtTime(1900, impactAt);
    cFilter.frequency.exponentialRampToValueAtTime(160, impactAt + 0.34);
    const cGain = this.ctx.createGain();
    cGain.gain.setValueAtTime(0.001, impactAt);
    cGain.gain.linearRampToValueAtTime(Math.min(0.65, 0.38 * power), impactAt + 0.008);
    cGain.gain.exponentialRampToValueAtTime(0.001, impactAt + 0.36);
    crunch.connect(cFilter).connect(cGain).connect(this.sfxBus);
    crunch.start(impactAt, 0, 0.38);

    // 4. JoJo golden Stand brass chord
    [220, 277.18, 329.63, 440].forEach((freq) => {
      if (!this.ctx || !this.sfxBus) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, impactAt);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, impactAt);
      g.gain.linearRampToValueAtTime(0.075 * Math.min(1.4, power), impactAt + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, impactAt + 0.44);
      osc.connect(g).connect(this.sfxBus);
      osc.start(impactAt);
      osc.stop(impactAt + 0.46);
    });
  }

  public playStandCry(clip: StandCryClip): void {
    if (this.muted || !this.ctx || !this.sfxBus) return;

    const decodedBuffer = this.standCryBuffers.get(clip.id);
    if (decodedBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = decodedBuffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(1.15, this.ctx.currentTime);
      src.connect(gain).connect(this.sfxBus);
      src.start(this.ctx.currentTime);
      return;
    }

    // Immediate multi-syllable Web Audio Formant Vocal Synthesizer ("ORA! ORA!" / "MUDA! MUDA!")
    let cursor = this.ctx.currentTime + 0.01;
    clip.syllables.forEach((syl, idx) => {
      if (!this.ctx || !this.sfxBus) return;
      const t = cursor;
      const dur = syl.dur;
      cursor += dur * 0.92;

      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(syl.pitch, t);
      osc.frequency.exponentialRampToValueAtTime(
        idx === clip.syllables.length - 1 ? syl.pitch * 0.88 : syl.pitch * 1.12,
        t + dur,
      );

      const subOsc = this.ctx.createOscillator();
      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(syl.pitch * 0.5, t);

      const f1 = this.ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.setValueAtTime(syl.f1, t);
      f1.Q.setValueAtTime(4.5, t);

      const f2 = this.ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.setValueAtTime(syl.f2, t);
      f2.Q.setValueAtTime(5.5, t);

      const vGain = this.ctx.createGain();
      vGain.gain.setValueAtTime(0.001, t);
      vGain.gain.linearRampToValueAtTime(0.32, t + 0.014);
      vGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc.connect(f1);
      osc.connect(f2);
      subOsc.connect(f1);
      f1.connect(vGain);
      f2.connect(vGain);
      vGain.connect(this.sfxBus);

      osc.start(t);
      subOsc.start(t);
      osc.stop(t + dur + 0.02);
      subOsc.stop(t + dur + 0.02);
    });
  }

  public playSplashKill(kind: BugKind, combo = 1, isClap = false): void {
    if (this.muted || !this.ctx || !this.sfxBus || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const splatNoise = this.ctx.createBufferSource();
    splatNoise.buffer = this.noiseBuffer;
    const splatFilter = this.ctx.createBiquadFilter();
    splatFilter.type = 'bandpass';
    splatFilter.frequency.setValueAtTime(2400, now);
    splatFilter.frequency.exponentialRampToValueAtTime(380, now + 0.11);
    splatFilter.Q.setValueAtTime(3.2, now);

    const splatGain = this.ctx.createGain();
    splatGain.gain.setValueAtTime(0.001, now);
    splatGain.gain.linearRampToValueAtTime(0.38, now + 0.006);
    splatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    splatNoise.connect(splatFilter).connect(splatGain).connect(this.sfxBus);
    splatNoise.start(now, Math.random() * 0.3, 0.15);

    const pop = this.ctx.createOscillator();
    pop.type = 'sine';
    pop.frequency.setValueAtTime(kind === 'mosquito' ? 760 : 520, now);
    pop.frequency.exponentialRampToValueAtTime(190, now + 0.085);
    const popGain = this.ctx.createGain();
    popGain.gain.setValueAtTime(0.24, now);
    popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    pop.connect(popGain).connect(this.sfxBus);
    pop.start(now);
    pop.stop(now + 0.1);

    const semitoneSteps = Math.min(12, Math.max(0, combo - 1));
    const baseChime = (isClap ? 659.25 : 523.25) * Math.pow(2, semitoneSteps / 12);
    [baseChime, baseChime * 1.25].forEach((freq, i) => {
      if (!this.ctx || !this.sfxBus) return;
      const t = now + 0.035 + i * 0.045;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(g).connect(this.sfxBus);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  public playBiteSting(): void {
    if (this.muted || !this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(720, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.18);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.22, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(g).connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  public playHeartBreak(): void {
    if (this.muted || !this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    [320, 210, 110].forEach((freq, i) => {
      if (!this.ctx || !this.sfxBus) return;
      const t = now + i * 0.055;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.11);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.24, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(g).connect(this.sfxBus);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  }

  public playVictory(): void {
    if (this.muted || !this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      if (!this.ctx || !this.sfxBus) return;
      const t = now + i * 0.09;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(g).connect(this.sfxBus);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  }

  public playHospitalAlarm(): void {
    if (this.muted || !this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    [0, 0.24, 0.48].forEach((offset, i) => {
      if (!this.ctx || !this.sfxBus) return;
      const t = now + offset;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(i === 2 ? 740 : 880, t);
      const dur = i === 2 ? 0.65 : 0.11;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g).connect(this.sfxBus);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    });
  }

  public dispose(): void {
    this.stopBgmLoop();
    this.clearAllVoices();
    if (this.weatherNoise) {
      try {
        this.weatherNoise.stop();
        this.weatherNoise.disconnect();
      } catch {
        // ignore
      }
      this.weatherNoise = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
