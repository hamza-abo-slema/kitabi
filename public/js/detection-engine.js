/**
 * detection-engine.js — محرك كشف تسجيل الشاشة متعدد الطبقات
 * ==========================================================
 * 
 * Layers:
 *   1. MediaDevices — يرصد تغيّرات أجهزة الإدخال/الإخراج
 *   2. Visibility & Focus — يرصد حالة التبويب والتركيز
 *   3. Performance & Frame Timing — يرصد FPS و jitter
 *   4. Audio Latency — يرصد كمون الصوت
 * 
 * Fusion Engine يجمع النتائج بوزن ويقرر تفعيل الحماية.
 */

class DetectionEngine {
  constructor() {
    this.layers = {};
    this.fusionThreshold = 0.7;
    this.cooldownMs = 5000;
    this.isActivated = false;
    this.lastActivation = 0;
    this.intervalId = null;
    this.onProtectionTrigger = null;
    this.onProtectionRelease = null;

    this.layerWeights = {
      mediaDevices: 0.35,
      visibility: 0.25,
      performance: 0.20,
      audioLatency: 0.20
    };
  }

  async start() {
    console.log('[DetectionEngine] Starting multi-layer detection...');

    this.layers.mediaDevices = new MediaDevicesLayer();
    this.layers.visibility = new VisibilityLayer();
    this.layers.performance = new PerformanceLayer();
    this.layers.audioLatency = new AudioLatencyLayer();

    for (const [name, layer] of Object.entries(this.layers)) {
      try {
        await layer.start();
        console.log(`[DetectionEngine] Layer "${name}" started`);
      } catch (e) {
        console.warn(`[DetectionEngine] Layer "${name}" failed to start:`, e.message);
      }
    }

    this.intervalId = setInterval(() => this.fusionTick(), 1000);
    console.log('[DetectionEngine] All layers active, fusion engine running');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    for (const layer of Object.values(this.layers)) {
      if (layer.stop) layer.stop();
    }
  }

  fusionTick() {
    if (this.isActivated) {
      const elapsed = Date.now() - this.lastActivation;
      if (elapsed >= this.cooldownMs) {
        this.isActivated = false;
        if (this.onProtectionRelease) this.onProtectionRelease();
      }
      return;
    }

    let weightedSum = 0;
    let totalWeight = 0;
    const layerScores = {};

    for (const [name, layer] of Object.entries(this.layers)) {
      const score = layer.getScore ? layer.getScore() : 0;
      const weight = this.layerWeights[name] || 0.1;
      layerScores[name] = { score, weight };
      weightedSum += score * weight;
      totalWeight += weight;
    }

    const combinedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    if (combinedScore >= this.fusionThreshold) {
      const triggeredBy = Object.entries(layerScores)
        .filter(([, v]) => v.score > 0.3)
        .map(([k]) => k);

      console.log(`[DetectionEngine] ⚠️ SCORE ${(combinedScore * 100).toFixed(0)}% — TRIGGERED by: ${triggeredBy.join(', ')}`);

      this.isActivated = true;
      this.lastActivation = Date.now();

      if (this.onProtectionTrigger) {
        this.onProtectionTrigger({
          score: combinedScore,
          layers: layerScores,
          triggeredBy
        });
      }

      this.logProtectionEvent({ combinedScore, triggeredBy, layerScores });
    } else if (combinedScore > 0.3) {
      console.log(`[DetectionEngine] Score: ${(combinedScore * 100).toFixed(0)}% — monitoring`);
    }
  }

  async logProtectionEvent(data) {
    try {
      const token = localStorage.getItem('kitabi_token');
      await fetch('/api/books/protection-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          detection_score: data.combinedScore,
          triggered_by: JSON.stringify(data.triggeredBy),
          layer_scores: JSON.stringify(data.layerScores)
        })
      });
    } catch (e) {
      /* silent — logging is non-critical */
    }
  }
}

/* Layer 1: MediaDevices Monitoring */
class MediaDevicesLayer {
  constructor() {
    this.score = 0;
    this.lastDeviceList = [];
    this.bindHandler = this.handler.bind(this);
  }

  async start() {
    try {
      this.lastDeviceList = await navigator.mediaDevices.enumerateDevices();
      navigator.mediaDevices.addEventListener('devicechange', this.bindHandler);
      setInterval(() => this.poll(), 3000);
    } catch (e) {
      console.warn('[MediaDevicesLayer] Not available');
    }
  }

  async handler() {
    const current = await navigator.mediaDevices.enumerateDevices();
    const changes = this.detectChanges(this.lastDeviceList, current);

    if (changes.added.length > 0) {
      const hasVideo = changes.added.some(d => d.kind === 'videoinput');
      const hasAudio = changes.added.some(d => d.kind === 'audioinput');

      if (hasVideo) {
        this.score = Math.min(1.0, this.score + 0.5);
        console.log('[MediaDevicesLayer] New video device detected — possible screen recording');
      }
      if (hasAudio) {
        this.score = Math.min(1.0, this.score + 0.3);
      }
    }

    this.lastDeviceList = current;
    this.score = Math.max(0, this.score - 0.05);
  }

  async poll() {
    try {
      const current = await navigator.mediaDevices.enumerateDevices();
      if (JSON.stringify(current.map(d => d.deviceId + d.kind)) !==
          JSON.stringify(this.lastDeviceList.map(d => d.deviceId + d.kind))) {
        await this.handler();
      }
    } catch (e) { /* ignore */ }
  }

  detectChanges(oldList, newList) {
    const oldMap = new Map(oldList.map(d => [d.deviceId + d.kind, d]));
    const added = newList.filter(d => !oldMap.has(d.deviceId + d.kind));
    return { added };
  }

  getScore() { return this.score; }

  stop() {
    navigator.mediaDevices.removeEventListener('devicechange', this.bindHandler);
  }
}

/* Layer 2: Visibility & Focus */
class VisibilityLayer {
  constructor() {
    this.score = 0;
    this.hiddenStart = null;
    this.bindVisibility = () => this.handleVisibility();
    this.bindFocus = () => this.handleFocus();
  }

  start() {
    document.addEventListener('visibilitychange', this.bindVisibility);
    window.addEventListener('blur', this.bindFocus);
    window.addEventListener('focus', () => {
      this.hiddenStart = null;
      this.score = Math.max(0, this.score - 0.3);
    });
  }

  handleVisibility() {
    if (document.hidden) {
      this.hiddenStart = Date.now();
      this.score = Math.min(1.0, this.score + 0.3);
    } else {
      const duration = this.hiddenStart ? (Date.now() - this.hiddenStart) : 0;
      if (duration > 10000) this.score = Math.min(1.0, this.score + 0.2);
      this.hiddenStart = null;
    }
  }

  handleFocus() {
    this.score = Math.min(1.0, this.score + 0.2);
  }

  getScore() { return this.score; }

  stop() {
    document.removeEventListener('visibilitychange', this.bindVisibility);
    window.removeEventListener('blur', this.bindFocus);
  }
}

/* Layer 3: Performance & Frame Timing */
class PerformanceLayer {
  constructor() {
    this.frameTimes = [];
    this.score = 0;
    this.lastTime = performance.now();
    this.running = false;
    this.bindTick = (ts) => this.tick(ts);
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.bindTick);
  }

  tick(timestamp) {
    if (!this.running) return;
    const delta = timestamp - this.lastTime;
    this.frameTimes.push(delta);
    if (this.frameTimes.length > 60) this.frameTimes.shift();

    if (this.frameTimes.length >= 30) {
      const avg = this.frameTimes.reduce((a, b) => a + b) / this.frameTimes.length;
      const variance = this.frameTimes.reduce((sum, t) => sum + (t - avg) ** 2, 0) / this.frameTimes.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev < 1.5 && avg > 25) {
        this.score = Math.min(1.0, this.score + 0.08);
      } else if (avg > 50) {
        this.score = Math.min(1.0, this.score + 0.05);
      } else {
        this.score = Math.max(0, this.score - 0.02);
      }
    }

    this.lastTime = timestamp;
    requestAnimationFrame(this.bindTick);
  }

  getScore() { return this.score; }

  stop() { this.running = false; }
}

/* Layer 4: Audio Latency */
class AudioLatencyLayer {
  constructor() {
    this.score = 0;
    this.baseLatency = null;
    this.intervalId = null;
  }

  async start() {
    try {
      const testCtx = new OfflineAudioContext(1, 1024, 44100);
      this.baseLatency = testCtx.baseLatency || 0.01;
      console.log(`[AudioLatencyLayer] Base latency: ${(this.baseLatency * 1000).toFixed(1)}ms`);
    } catch (e) {
      this.baseLatency = 0.01;
    }

    this.intervalId = setInterval(() => this.measure(), 5000);
  }

  async measure() {
    try {
      const ctx = window.audioEngine && window.audioEngine.ctx;
      if (!ctx) return;

      const latency = ctx.baseLatency + ctx.outputLatency;
      if (latency > this.baseLatency * 3) {
        this.score = Math.min(1.0, this.score + 0.3);
      } else {
        this.score = Math.max(0, this.score - 0.05);
      }
    } catch (e) { /* ignore */ }
  }

  getScore() { return this.score; }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
  }
}

window.detectionEngine = new DetectionEngine();
