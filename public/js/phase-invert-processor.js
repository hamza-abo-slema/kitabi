/**
 * phase-invert-processor.js — AudioWorkletProcessor لعكس الطور (Phase Inversion)
 * 
 * يقوم هذا المعالج بعكس طور الإشارة الصوتية (ضرب كل عينة بـ -1.0)
 * في الوقت الفعلي مع أقل كمون ممكن.
 * 
 * المعادلة: y[n] = x[n] * -1.0
 */

class PhaseInvertProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.inversionEnabled = true;
    this.sampleCount = 0;

    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'toggle') {
        this.inversionEnabled = event.data.enabled !== false;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input.length || !input[0] || !input[0].length) {
      return true;
    }

    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      if (!inputChannel || !outputChannel) continue;

      if (this.inversionEnabled) {
        for (let sample = 0; sample < inputChannel.length; sample++) {
          outputChannel[sample] = inputChannel[sample] * -1.0;
          this.sampleCount++;
        }
      } else {
        for (let sample = 0; sample < inputChannel.length; sample++) {
          outputChannel[sample] = inputChannel[sample];
          this.sampleCount++;
        }
      }
    }

    if (this.sampleCount % (sampleRate * 10) < 128) {
      this.port.postMessage({
        type: 'stats',
        samplesProcessed: this.sampleCount,
        sampleRate: sampleRate
      });
    }

    return true;
  }
}

registerProcessor('phase-invert-processor', PhaseInvertProcessor);
