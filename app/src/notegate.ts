// Vorfilter für Schicht C (Live-Notiz): spart Aufrufe, wenn der Satz nur die Folie wiederholt.
import type { SlideTracker } from "./tracker.ts";

export interface NoteGateOptions {
  minGapMs: number;
  minTokens: number;
  minNovelty: number;
}

export class NoteGate {
  lastAt = -Infinity;
  readonly opts: NoteGateOptions;

  constructor(opts: Partial<NoteGateOptions> = {}) {
    this.opts = { minGapMs: 8000, minTokens: 5, minNovelty: 0.4, ...opts };
  }

  /** true = jetzt eine Live-Notiz anfragen (Satzende erreicht, genug Neues). */
  shouldRequest(now: number, sentence: string, tracker: SlideTracker): boolean {
    if (tracker.state === "tafel") return false;
    if (now - this.lastAt < this.opts.minGapMs) return false;
    const nov = tracker.novelty(sentence);
    if (nov.count < this.opts.minTokens || nov.ratio < this.opts.minNovelty) return false;
    this.lastAt = now;
    return true;
  }
}
