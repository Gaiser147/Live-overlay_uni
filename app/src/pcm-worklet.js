// AudioWorklet: beliebige Abtastrate → 16 kHz Mono PCM16, Pakete à 100 ms.
class Pcm16k extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.acc = 0;
    this.sum = 0;
    this.n = 0;
    this.out = new Int16Array(1600);
    this.pos = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      // Mittelwert über die Eingangsproben eines Ausgangsschritts (einfacher Tiefpass).
      this.sum += ch[i];
      this.n++;
      this.acc += 1;
      if (this.acc >= this.ratio) {
        this.acc -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.sum / this.n));
        this.out[this.pos++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        this.sum = 0;
        this.n = 0;
        if (this.pos === this.out.length) {
          this.port.postMessage(this.out, [this.out.buffer]);
          this.out = new Int16Array(1600);
          this.pos = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm16k", Pcm16k);
