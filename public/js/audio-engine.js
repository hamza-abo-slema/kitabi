/**
 * audio-engine.js — محرك الصوت المزدوج مع تقنية عكس الطور (Phase Inversion)
 * =========================================================================
 * 
 * المعمارية:
 *   AudioContext واحد → AudioBufferSourceNode واحد
 *     → ChannelSplitterNode (2 مسارات)
 *         → المسار A: GainNode(1.0) → ChannelMerger → destination (طور 0°)
 *         → المسار B: AudioWorkletNode(PhaseInvert) → GainNode(0.0) → ChannelMerger → destination (طور 180°)
 * 
 * القناة B تظل خاملة (Gain = 0) إلى أن يتم تفعيلها عبر FusionEngine.
 */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.currentBook = null;
    this.isPlaying = false;
    this.isProtectionActive = false;
    this.currentTime = 0;
    this.duration = 0;
    this.playbackRate = 1.0;
    this.volume = 1.0;
    this.analyserNode = null;
    this.gainNode1 = null;
    this.gainNode2 = null;
    this.sourceNode = null;
    this.invertNode = null;
    this.mergerNode = null;
    this.splitterNode = null;
    this.audioBuffer = null;
    this.startTime = 0;
    this.startOffset = 0;
    this.animationId = null;
    this.onTimeUpdate = null;
    this.onEnded = null;
    this.onProtectionChange = null;
    this.workletLoaded = false;
    this.useWorklet = false;
  }

  async init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 48000,
        latencyHint: 'playback'
      });
      console.log(`[AudioEngine] AudioContext initialized: ${this.ctx.sampleRate}Hz`);

      try {
        await this.ctx.audioWorklet.addModule('/js/phase-invert-processor.js');
        this.workletLoaded = true;
        this.useWorklet = true;
        console.log('[AudioEngine] AudioWorklet loaded successfully');
      } catch (e) {
        console.warn('[AudioEngine] AudioWorklet not supported, using fallback', e);
        this.useWorklet = false;
      }

      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 2048;

      this.setupGraph();
      return true;
    } catch (e) {
      console.error('[AudioEngine] Init failed:', e);
      return false;
    }
  }

  setupGraph() {
    if (!this.ctx) return;

    this.gainNode1 = this.ctx.createGain();
    this.gainNode1.gain.value = 1.0;

    this.gainNode2 = this.ctx.createGain();
    this.gainNode2.gain.value = 0.0;

    this.gainNode1.connect(this.ctx.destination);
    this.gainNode2.connect(this.ctx.destination);

    console.log('[AudioEngine] Audio graph configured (dual-channel ready)');
  }

  async loadBook(book) {
    if (!this.ctx) await this.init();

    this.currentBook = book;
    this.stop();

    try {
      const response = await fetch(book.audio_url || book.audioUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const arrayBuffer = await response.arrayBuffer();
      this.audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.duration = this.audioBuffer.duration;

      console.log(`[AudioEngine] Loaded: "${book.title}" (${this.formatTime(this.duration)})`);
      return true;
    } catch (e) {
      console.error('[AudioEngine] Load failed for', book.title, e);
      this.showToast('تعذر تحميل الملف الصوتي', 'error');
      return false;
    }
  }

  play(offset) {
    if (!this.ctx || !this.audioBuffer) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.stopAnimation();

    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.playbackRate.value = this.playbackRate;

    this.splitterNode = this.ctx.createChannelSplitter(2);
    const merger = this.ctx.createChannelMerger(2);

    this.sourceNode.connect(this.splitterNode);

    this.gainNode1 = this.ctx.createGain();
    this.gainNode1.gain.value = 1.0;

    this.splitterNode.connect(this.gainNode1, 0, 0);
    this.splitterNode.connect(this.gainNode1, 1, 1);
    this.gainNode1.connect(merger, 0, 0);
    this.gainNode1.connect(merger, 0, 1);

    if (this.useWorklet && this.invertNode) {
      this.splitterNode.connect(this.invertNode, 0, 0);
      this.splitterNode.connect(this.invertNode, 1, 1);
      this.invertNode.connect(this.gainNode2);
    } else {
      this.splitterNode.connect(this.gainNode2, 0, 0);
      this.splitterNode.connect(this.gainNode2, 1, 1);
    }
    this.gainNode2.connect(merger, 0, 0);
    this.gainNode2.connect(merger, 0, 1);

    merger.connect(this.analyserNode);
    this.analyserNode.connect(this.ctx.destination);

    const playOffset = offset || this.startOffset || 0;
    this.sourceNode.start(0, playOffset);
    this.startTime = this.ctx.currentTime - playOffset;
    this.startOffset = playOffset;
    this.isPlaying = true;

    this.sourceNode.onended = () => {
      this.isPlaying = false;
      if (this.onEnded) this.onEnded();
    };

    this.startAnimation();
    console.log(`[AudioEngine] Playing: offset=${this.formatTime(playOffset)} rate=${this.playbackRate}x`);
  }

  pause() {
    if (!this.isPlaying || !this.ctx || !this.sourceNode) return;
    this.startOffset = this.currentTime;
    this.sourceNode.stop();
    this.isPlaying = false;
    this.stopAnimation();
    this.ctx.suspend();
  }

  resume() {
    if (this.isPlaying || !this.ctx || !this.audioBuffer) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.play(this.startOffset);
  }

  stop() {
    this.isPlaying = false;
    this.stopAnimation();
    if (this.sourceNode) {
      try { this.sourceNode.stop(); } catch (e) { /* ignore */ }
      this.sourceNode = null;
    }
    this.startOffset = 0;
    this.currentTime = 0;
  }

  seek(time) {
    const seekTime = Math.max(0, Math.min(time, this.duration));
    this.startOffset = seekTime;
    if (this.isPlaying) {
      try { this.sourceNode && this.sourceNode.stop(); } catch(e) {}
      this.play(seekTime);
    }
    this.currentTime = seekTime;
    if (this.onTimeUpdate) this.onTimeUpdate(seekTime);
  }

  skipForward(seconds = 10) {
    this.seek(this.currentTime + seconds);
  }

  skipBack(seconds = 10) {
    this.seek(this.currentTime - seconds);
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(2, val));
    if (this.gainNode1) this.gainNode1.gain.value = this.volume;
  }

  setPlaybackRate(rate) {
    this.playbackRate = Math.max(0.5, Math.min(3, rate));
    if (this.sourceNode) {
      this.sourceNode.playbackRate.value = this.playbackRate;
    }
  }

  activateProtection() {
    if (this.isProtectionActive) return;
    this.isProtectionActive = true;

    if (this.useWorklet && !this.invertNode) {
      try {
        this.invertNode = new AudioWorkletNode(this.ctx, 'phase-invert-processor');
        console.log('[AudioEngine] AudioWorkletNode created for phase inversion');
      } catch (e) {
        console.warn('[AudioEngine] Falling back to manual inversion', e);
        this.useWorklet = false;
      }
    }

    if (!this.useWorklet) {
      if (this.sourceNode && this.audioBuffer) {
        this.setupFallbackInversion();
      }
    }

    if (this.isPlaying && this.useWorklet && this.invertNode && this.splitterNode) {
      try {
        this.splitterNode.disconnect(this.gainNode2);
        this.splitterNode.connect(this.invertNode, 0, 0);
        this.splitterNode.connect(this.invertNode, 1, 1);
        this.invertNode.connect(this.gainNode2);
      } catch (e) {
        console.warn('[AudioEngine] Could not reconnect invertNode:', e);
      }
    }

    if (this.gainNode2) {
      this.gainNode2.gain.setValueAtTime(this.gainNode2.gain.value, this.ctx.currentTime);
      this.gainNode2.gain.linearRampToValueAtTime(1.0, this.ctx.currentTime + 0.05);
    }

    this.showToast('🛡️ تم تفعيل الحماية الصوتية', 'info');
    if (this.onProtectionChange) this.onProtectionChange(true);
    console.log('[AudioEngine] Protection ACTIVATED — phase-inverted channel engaged');
  }

  deactivateProtection() {
    if (!this.isProtectionActive) return;

    if (this.gainNode2) {
      this.gainNode2.gain.setValueAtTime(this.gainNode2.gain.value, this.ctx.currentTime);
      this.gainNode2.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + 0.05);
    }

    this.isProtectionActive = false;
    if (this.onProtectionChange) this.onProtectionChange(false);
    console.log('[AudioEngine] Protection DEACTIVATED — normal playback');
  }

  setupFallbackInversion() {
    if (!this.sourceNode || !this.audioBuffer) return;

    const invCtx = new OfflineAudioContext(
      this.audioBuffer.numberOfChannels,
      this.audioBuffer.length,
      this.audioBuffer.sampleRate
    );

    const invSource = invCtx.createBufferSource();
    const invBuffer = invCtx.createBuffer(
      this.audioBuffer.numberOfChannels,
      this.audioBuffer.length,
      this.audioBuffer.sampleRate
    );

    for (let ch = 0; ch < this.audioBuffer.numberOfChannels; ch++) {
      const src = this.audioBuffer.getChannelData(ch);
      const dst = invBuffer.getChannelData(ch);
      for (let i = 0; i < src.length; i++) {
        dst[i] = src[i] * -1.0;
      }
    }

    console.log(`[AudioEngine] Fallback inverted buffer created (${invBuffer.length} samples, ${invBuffer.sampleRate}Hz)`);
    this.invertedBuffer = invBuffer;
  }

  createInvertedBufferOnline(buffer) {
    const inverted = this.ctx.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = inverted.getChannelData(ch);
      for (let i = 0; i < src.length; i++) {
        dst[i] = src[i] * -1.0;
      }
    }
    return inverted;
  }

  startAnimation() {
    this.stopAnimation();
    const tick = () => {
      if (!this.isPlaying || !this.ctx) return;
      this.currentTime = this.ctx.currentTime - this.startTime;
      if (this.currentTime >= this.duration) {
        this.currentTime = this.duration;
        this.isPlaying = false;
        if (this.onEnded) this.onEnded();
        return;
      }
      if (this.currentTime < 0) this.currentTime = 0;
      if (this.onTimeUpdate) this.onTimeUpdate(this.currentTime);
      this.animationId = requestAnimationFrame(tick);
    };
    this.animationId = requestAnimationFrame(tick);
  }

  stopAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  getAnalyserData() {
    if (!this.analyserNode) return null;
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteTimeDomainData(data);
    return data;
  }

  showToast(msg, type) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    toast.setAttribute('role', 'alert');
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }
}

window.audioEngine = new AudioEngine();
