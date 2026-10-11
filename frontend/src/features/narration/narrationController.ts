import type { NarrationLang, NarrationSegment } from '@/features/narration/recipeScript';

export type NarrationStatus = 'idle' | 'playing' | 'paused';

export type NarrationState = {
  status: NarrationStatus;
  /** Vị trí đoạn đang đọc (hoặc sẽ đọc tiếp khi tiếp tục). */
  index: number;
  rate: number;
  volume: number;
  error: boolean;
};

type SpeechEngine = Pick<SpeechSynthesis, 'speak' | 'cancel'>;
type UtteranceFactory = (text: string) => SpeechSynthesisUtterance;

export const NARRATION_RATES = [0.75, 1, 1.25, 1.5, 1.75] as const;

export type NarrationVoices = Partial<Record<NarrationLang, SpeechSynthesisVoice>>;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Điều khiển hàng đợi thuyết minh, mỗi lần chỉ phát một đoạn ngắn.
 *
 * "Tạm dừng" được làm bằng `cancel()` rồi đọc lại đoạn hiện tại khi tiếp tục, vì
 * `speechSynthesis.pause()` không ổn định trên Chrome Android và một số giọng online.
 * Cách này cũng cho phép đổi tốc độ, âm lượng ngay giữa chừng.
 */
export class NarrationController {
  private segments: NarrationSegment[] = [];
  private voices: NarrationVoices = {};
  // Mỗi lần phát tăng thế hệ; sự kiện `end`/`error` của câu cũ (do cancel) sẽ bị bỏ qua.
  private generation = 0;
  private listeners = new Set<() => void>();
  private state: NarrationState;

  constructor(
    private readonly engine: SpeechEngine,
    private readonly createUtterance: UtteranceFactory,
    initial: { rate?: number; volume?: number } = {},
  ) {
    this.state = {
      status: 'idle',
      index: 0,
      rate: clamp(initial.rate ?? 1, 0.5, 2),
      volume: clamp(initial.volume ?? 1, 0, 1),
      error: false,
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  setSegments(segments: NarrationSegment[]) {
    this.segments = segments;
    if (this.state.index >= segments.length) this.stop();
  }

  /** Giọng cho từng ngôn ngữ; đoạn nào không có giọng phù hợp thì để trình duyệt tự chọn theo `lang`. */
  setVoices(voices: NarrationVoices) {
    this.voices = voices;
  }

  play(index = this.state.status === 'idle' ? 0 : this.state.index) {
    this.speak(index);
  }

  pause() {
    if (this.state.status !== 'playing') return;
    this.generation += 1;
    this.engine.cancel();
    this.update({ status: 'paused' });
  }

  resume() {
    if (this.state.status === 'paused') this.speak(this.state.index);
  }

  stop() {
    this.generation += 1;
    this.engine.cancel();
    this.update({ status: 'idle', index: 0 });
  }

  next() {
    this.jump(this.state.index + 1);
  }

  previous() {
    this.jump(this.state.index - 1);
  }

  setRate(rate: number) {
    this.update({ rate: clamp(rate, 0.5, 2) });
    this.applySettings();
  }

  /** `apply = false` khi đang kéo thanh âm lượng; gọi `applySettings()` lúc thả tay. */
  setVolume(volume: number, apply = true) {
    this.update({ volume: clamp(volume, 0, 1) });
    if (apply) this.applySettings();
  }

  /** Đọc lại đoạn hiện tại để tốc độ/âm lượng mới có hiệu lực ngay. */
  applySettings() {
    if (this.state.status === 'playing') this.speak(this.state.index);
  }

  private jump(index: number) {
    const target = clamp(index, 0, Math.max(0, this.segments.length - 1));
    if (this.state.status === 'playing') this.speak(target);
    else this.update({ index: target, status: 'paused' });
  }

  private speak(index: number) {
    const generation = ++this.generation;
    this.engine.cancel();
    const segment = this.segments[index];
    if (!segment) {
      this.update({ status: 'idle', index: 0 });
      return;
    }
    const utterance = this.createUtterance(segment.text);
    utterance.lang = segment.lang;
    const voice = this.voices[segment.lang];
    if (voice) utterance.voice = voice;
    utterance.rate = this.state.rate;
    utterance.volume = this.state.volume;
    utterance.onend = () => {
      if (generation === this.generation) this.speak(index + 1);
    };
    utterance.onerror = (event) => {
      if (generation !== this.generation) return;
      if (event.error === 'interrupted' || event.error === 'canceled') return;
      this.update({ status: 'paused', error: true });
    };
    this.update({ status: 'playing', index, error: false });
    this.engine.speak(utterance);
  }

  private update(patch: Partial<NarrationState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}

/**
 * Chọn giọng cho một ngôn ngữ: ưu tiên đúng vùng (vi-VN, en-US), rồi giọng cài sẵn trên máy
 * (ổn định, chạy cả khi offline) trước giọng online.
 */
export function pickVoice(voices: SpeechSynthesisVoice[], lang: NarrationLang) {
  const normalize = (value: string) => value.toLowerCase().replace('_', '-');
  const target = normalize(lang);
  const prefix = target.split('-')[0]!;
  const matches = voices.filter((voice) => normalize(voice.lang).startsWith(prefix));
  const score = (voice: SpeechSynthesisVoice) =>
    (normalize(voice.lang) === target ? 2 : 0) + (voice.localService ? 1 : 0);
  return [...matches].sort((a, b) => score(b) - score(a))[0] ?? null;
}
