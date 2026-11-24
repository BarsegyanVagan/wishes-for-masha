const samples = ["key-1", "key-2", "key-3", "key-4", "feed", "release", "paper"];

export class SoundDesk {
  constructor(radio) {
    this.radio = radio;
    this.enabled = true;
    this.cache = new Map();
    this.mechanical = new Map();
    this.tuner = null;
    this.voice = null;
    this.playRequest = 0;
  }

  async unlock() {
    const Audio = window.AudioContext ?? window.webkitAudioContext;
    if (!Audio) return false;
    try {
      if (!this.context) {
        this.context = new Audio();
        this.master = this.context.createGain();
        this.master.gain.value = this.enabled ? .71 : 0;
        this.master.connect(this.context.destination);
      }
      if (this.context.state !== "running") await this.context.resume();
      return this.context.state === "running";
    } catch {
      return false;
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!this.master) return;
    this.master.gain.setTargetAtTime(enabled ? .71 : 0, this.context.currentTime, .04);
  }

  load(path) {
    if (!this.context || !path) return Promise.resolve(null);
    if (!this.cache.has(path)) {
      const asset = new URL(path, import.meta.url);
      this.cache.set(path, fetch(asset)
        .then(response => response.ok ? response.arrayBuffer() : null)
        .then(bytes => bytes ? this.context.decodeAudioData(bytes) : null)
        .catch(() => null));
    }
    return this.cache.get(path);
  }

  prepareMechanical() {
    return Promise.all(samples.map(async name => {
      const buffer = await this.load(`assets/${name}.wav`);
      if (buffer) this.mechanical.set(name, buffer);
    }));
  }

  noise(duration) {
    const length = Math.ceil(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let color = 0;
    for (let i = 0; i < length; i += 1) {
      const value = Math.random() * 2 - 1;
      color = .48 * color + .52 * value;
      data[i] = value * .38 + color * .56;
    }
    return buffer;
  }

  testCue() {
    const buffer = this.context.createBuffer(1, this.context.sampleRate * 1.65, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    const notes = [[.03, .12, 650], [.22, .12, 650], [.42, .29, 780]];
    for (const [start, length, pitch] of notes) {
      const from = Math.floor(start * this.context.sampleRate);
      const count = Math.floor(length * this.context.sampleRate);
      for (let i = 0; i < count; i += 1) {
        const time = i / this.context.sampleRate;
        const envelope = Math.min(1, time / .011, (length - time) / .026);
        data[from + i] = Math.sin(time * pitch * Math.PI * 2) * envelope * .54;
      }
    }
    return buffer;
  }

  async startTuner(state) {
    this.stopTuner();
    if (!this.context || this.context.state !== "running") return;

    const noise = this.context.createBufferSource();
    noise.buffer = this.noise(1.87);
    noise.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = .67;
    const noiseLevel = this.context.createGain();
    noiseLevel.gain.value = 0;
    noise.connect(filter).connect(noiseLevel).connect(this.master);
    noise.start();

    const cueLevel = this.context.createGain();
    cueLevel.gain.value = 0;
    const cueFilter = this.context.createBiquadFilter();
    cueFilter.type = "bandpass";
    cueFilter.Q.value = .45;
    cueFilter.connect(cueLevel).connect(this.master);

    const reception = { noise, filter, noiseLevel, cueLevel, cueFilter };
    this.tuner = reception;
    this.tune(state.strength, state.frequency);

    const cuePath = this.radio.cueSrc || this.radio.src;
    const [buffer] = await Promise.all([
      cuePath ? this.load(cuePath) : this.testCue(),
      this.load(this.radio.src)
    ]);
    if (this.tuner !== reception || !buffer) return;
    const cue = this.context.createBufferSource();
    cue.buffer = buffer;
    cue.loop = true;
    cue.loopEnd = Math.min(buffer.duration, this.radio.cueSrc ? 3.5 : 2.4);
    cue.connect(cueFilter);
    reception.cue = cue;
    cue.start();
  }

  tune(strength, frequency) {
    if (!this.tuner) return;
    const { noiseLevel, filter, cueLevel, cueFilter } = this.tuner;
    const time = this.context.currentTime;
    noiseLevel.gain.setTargetAtTime(.013 + .15 * (1 - strength) ** 1.4, time, .055);
    filter.frequency.setTargetAtTime(1300 + frequency % 149 * 12, time, .065);
    cueFilter.frequency.setTargetAtTime(950 + strength * 630, time, .08);
    const signalGain = (this.radio.src || this.radio.cueSrc ? .48 : .22) * strength ** 1.8;
    cueLevel.gain.setTargetAtTime(signalGain, time, .065);
  }

  stopTuner() {
    const receiver = this.tuner;
    this.tuner = null;
    if (!receiver) return;
    const { noise, noiseLevel, cue, cueLevel } = receiver;
    const now = this.context.currentTime;
    noiseLevel.gain.setTargetAtTime(0, now, .032);
    cueLevel.gain.setTargetAtTime(0, now, .032);
    noise.stop(now + .13);
    cue?.stop(now + .13);
    noise.addEventListener("ended", () => {
      receiver.filter.disconnect();
      noiseLevel.disconnect();
      receiver.cueFilter.disconnect();
      cueLevel.disconnect();
    }, { once: true });
  }

  stopVoice() {
    this.playRequest += 1;
    this.voice?.stop();
    this.voice = null;
  }

  async playVoice() {
    this.stopVoice();
    const request = this.playRequest;
    const buffer = await this.load(this.radio.src);
    if (!buffer || this.playRequest !== request || this.context.state !== "running") return false;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.master);
    source.addEventListener("ended", () => {
      if (this.voice === source) this.voice = null;
    }, { once: true });
    this.voice = source;
    source.start();
    return true;
  }

  clip(name, gain = .69, rate = 1) {
    const buffer = this.mechanical.get(name);
    if (!buffer || this.context?.state !== "running") return false;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const level = this.context.createGain();
    level.gain.value = gain;
    source.connect(level).connect(this.master);
    source.start();
    return true;
  }

  tone(pitch, duration, volume, kind = "sine") {
    if (this.context?.state !== "running") return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const level = this.context.createGain();
    oscillator.type = kind;
    oscillator.frequency.value = pitch;
    level.gain.setValueAtTime(.0001, now);
    level.gain.exponentialRampToValueAtTime(volume, now + .008);
    level.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(level).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + .014);
  }

  telegraph(long) {
    this.tone(long ? 680 : 755, long ? .18 : .077, .13);
  }

  bell() {
    this.tone(1540, .32, .098);
    this.tone(2210, .21, .045);
  }

  strike(number, space) {
    const sample = `key-${number % 4 + 1}`;
    if (!this.clip(sample, space ? .23 : .58, .89 + (number % 7) * .033)) {
      this.tone(space ? 320 : 510, .049, space ? .065 : .098, "triangle");
    }
  }

  feed() {
    if (!this.clip("feed")) this.tone(190, .21, .093, "triangle");
  }

  release() {
    if (!this.clip("release")) this.tone(420, .083, .12, "triangle");
  }

  paper() {
    if (!this.clip("paper", .84)) this.tone(120, .17, .075, "triangle");
  }

  motor(duration) {
    if (this.context?.state !== "running") return;
    this.tone(157, duration, .047, "triangle");
    this.tone(311, duration * .95, .028, "triangle");
  }
}
