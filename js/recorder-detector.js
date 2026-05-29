class RecorderDetector {
  constructor(onDetect) {
    this.onDetect = onDetect;
    this.recording = false;
    this._originalGetDisplayMedia = null;
    this._originalMediaRecorder = null;
    this._checkInterval = null;

    this._monkeyPatchDisplayMedia();
    this._monkeyPatchMediaRecorder();
    this._monitorVisibility();
    this._pollScreenCapture();
  }

  _monkeyPatchDisplayMedia() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return;
    const orig = navigator.mediaDevices.getDisplayMedia;
    this._originalGetDisplayMedia = orig;
    const self = this;
    navigator.mediaDevices.getDisplayMedia = function () {
      self._triggerDetection('screen-capture');
      return orig.apply(this, arguments);
    };
  }

  _monkeyPatchMediaRecorder() {
    if (typeof MediaRecorder === 'undefined') return;
    const self = this;
    const Orig = window.MediaRecorder;
    window.MediaRecorder = function (stream, options) {
      const isScreenCapture =
        stream && stream.getTracks && stream.getTracks().some(t => t.kind === 'video');
      if (isScreenCapture) self._triggerDetection('mediarecorder');
      return new Orig(stream, options);
    };
    window.MediaRecorder.prototype = Orig.prototype;
    window.MediaRecorder.isTypeSupported = Orig.isTypeSupported;
  }

  _monitorVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this._triggerDetection('visibility');
      }
    });
  }

  _pollScreenCapture() {
    let normalTime = null;
    this._checkInterval = setInterval(() => {
      const t = performance.now();
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        if (normalTime !== null && t - normalTime > 500) {
          if (t - normalTime > 2000) {
            this._triggerDetection('performance');
          }
        }
        normalTime = t;
      }
    }, 300);
  }

  _triggerDetection(source) {
    if (this.recording) return;
    this.recording = true;
    this.onDetect(true, source);
  }

  stopDetection() {
    if (this.recording) return;
    this.recording = true;
    if (this._checkInterval) clearInterval(this._checkInterval);
  }

  isRecording() {
    return this.recording;
  }
}
