// Audio-Quelle als austauschbares Modul (Plan 5.3):
//  - BrowserMic: getUserMedia → AudioWorklet → 16 kHz Mono PCM16 (Weg 2)
//  - NativeAudio: Android-Hülle mit AccessibilityService liefert PCM16 per WebMessage (Weg 1)
// Beide liefern Frames à 100 ms an einen Callback.

export type PcmHandler = (pcm: Int16Array) => void;
export type StatusHandler = (status: AudioStatus) => void;

export type AudioStatus = "starting" | "running" | "silenced" | "stopped" | "denied" | "error";

export interface AudioSource {
  readonly kind: "browser" | "native";
  start(onPcm: PcmHandler, onStatus: StatusHandler): Promise<void>;
  stop(): void;
  /** Pegel 0–1 der letzten 100 ms (für die Anzeige im Spike). */
  level(): number;
}

function rms(pcm: Int16Array): number {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += (pcm[i]! / 32768) ** 2;
  return Math.sqrt(sum / Math.max(1, pcm.length));
}

export class BrowserMic implements AudioSource {
  readonly kind = "browser" as const;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private lastLevel = 0;
  private readonly opts: { record: boolean };

  constructor(opts: { record: boolean }) {
    this.opts = opts;
  }

  async start(onPcm: PcmHandler, onStatus: StatusHandler): Promise<void> {
    onStatus("starting");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      onStatus((e as DOMException).name === "NotAllowedError" ? "denied" : "error");
      throw e;
    }
    this.ctx = new AudioContext();
    await this.ctx.audioWorklet.addModule(new URL("./pcm-worklet.js", import.meta.url));
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm16k");
    this.node.port.onmessage = (ev: MessageEvent<Int16Array>) => {
      this.lastLevel = rms(ev.data);
      onPcm(ev.data);
    };
    src.connect(this.node);
    // Weg 2: parallel komprimiert aufnehmen, Datei später zu TwinMind hochladen.
    if (this.opts.record && "MediaRecorder" in window) {
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
      this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : undefined);
      this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
      this.recorder.start(10_000);
    }
    this.stream.getAudioTracks()[0]?.addEventListener("ended", () => onStatus("stopped"));
    onStatus("running");
  }

  stop(): void {
    this.recorder?.stop();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ctx = null;
  }

  level(): number {
    return this.lastLevel;
  }

  /** Aufnahme als Datei (Weg 2), null wenn nichts aufgenommen wurde. */
  recording(): Blob | null {
    return this.chunks.length ? new Blob(this.chunks, { type: this.chunks[0]!.type }) : null;
  }
}

/** Brücke zur Android-Hülle (android/). Die Hülle ruft window.__overlayNative.* auf. */
interface NativeBridge {
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    OverlayNative?: NativeBridge;
    __overlayNative?: { pcm(b64: string): void; status(s: AudioStatus): void };
  }
}

export class NativeAudio implements AudioSource {
  readonly kind = "native" as const;
  private lastLevel = 0;

  static available(): boolean {
    return typeof window.OverlayNative?.start === "function";
  }

  async start(onPcm: PcmHandler, onStatus: StatusHandler): Promise<void> {
    if (!NativeAudio.available()) {
      onStatus("error");
      throw new Error("Android-Hülle nicht gefunden");
    }
    window.__overlayNative = {
      pcm: (b64) => {
        const bin = atob(b64);
        const buf = new Int16Array(bin.length / 2);
        for (let i = 0; i < buf.length; i++) buf[i] = (bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) << 16 >> 16;
        this.lastLevel = rms(buf);
        onPcm(buf);
      },
      // „silenced“ meldet die Hülle über AudioRecordingConfiguration.isClientSilenced().
      status: (s) => onStatus(s),
    };
    onStatus("starting");
    window.OverlayNative!.start();
  }

  stop(): void {
    window.OverlayNative?.stop();
  }

  level(): number {
    return this.lastLevel;
  }
}
