class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sourceNode = null;
    this.gainNormal = null;
    this.gainInverted = null;
    this.antiRecActive = false;
    this.isPlaying = false;
    this.audioBuffer = null;
    this.startTime = 0;
    this.resumeAt = 0;
    this.analyser = null;
  }

  async init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 48000,
      channelCount: 2,
    });
    this.gainNormal = this.ctx.createGain();
    this.gainNormal.gain.value = 1;
    this.gainNormal.channelCount = 2;
    this.gainNormal.channelCountMode = 'explicit';

    this.gainInverted = this.ctx.createGain();
    this.gainInverted.gain.value = -1;
    this.gainInverted.channelCount = 2;
    this.gainInverted.channelCountMode = 'explicit';
  }

  async loadAudio(url) {
    const resp = await fetch(url);
    const arrayBuf = await resp.arrayBuffer();
    this.audioBuffer = await this.ctx.decodeAudioData(arrayBuf);
  }

  _playInternal() {
    if (!this.audioBuffer) return;
    if (this.sourceNode) this.sourceNode.disconnect();

    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.channelCount = 2;
    this.sourceNode.channelCountMode = 'explicit';

    if (this.antiRecActive) {
      this.sourceNode.connect(this.gainNormal).connect(this.ctx.destination);
      this.sourceNode.connect(this.gainInverted).connect(this.ctx.destination);
    } else {
      this.sourceNode.connect(this.gainNormal).connect(this.ctx.destination);
    }

    this.startTime = this.ctx.currentTime;
    this.sourceNode.start(0, this.resumeAt);
    this.isPlaying = true;
  }

  play() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this._playInternal();
  }

  pause() {
    if (this.sourceNode && this.isPlaying) {
      this.resumeAt += this.ctx.currentTime - this.startTime;
      this.sourceNode.stop();
      this.sourceNode.disconnect();
      this.sourceNode = null;
      this.isPlaying = false;
    }
  }

  stop() {
    if (this.sourceNode) {
      this.sourceNode.stop();
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.resumeAt = 0;
    this.isPlaying = false;
  }

  setAntiRecording(active) {
    this.antiRecActive = active;
    if (this.isPlaying) {
      this.pause();
      this._playInternal();
    }
  }

  getCurrentTime() {
    if (!this.isPlaying || !this.sourceNode) return this.resumeAt;
    return this.resumeAt + (this.ctx.currentTime - this.startTime);
  }

  getDuration() {
    return this.audioBuffer ? this.audioBuffer.duration : 0;
  }

  destroy() {
    if (this.ctx) this.ctx.close();
  }
}
