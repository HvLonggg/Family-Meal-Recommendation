import { useEffect, useMemo, useState } from 'react';

/** Nh?m ?m v? ???c quy ??i th?nh c?c tr?ng th?i kh?u h?nh c?a Ch? R?ng. */
export type Viseme = 'rest' | 'mbp' | 'open' | 'round' | 'wide' | 'small';

/** Độ mở miệng mặc định (0..1) của từng khẩu hình. */
export const VISEME_OPENNESS: Record<Viseme, number> = {
  rest: 0,
  mbp: 0,
  small: 0.3,
  wide: 0.45,
  round: 0.55,
  open: 0.95,
};

export interface VisemeFrame {
  /** Mốc bắt đầu (ms) tính từ đầu đoạn đọc. */
  at: number;
  viseme: Viseme;
  openness: number;
  /** Vị trí ký tự trong văn bản (đầu tiếng) — để căn lại theo `onboundary`. */
  charIndex: number;
}

export interface VisemeTimeline {
  frames: VisemeFrame[];
  /** Mốc thời gian của từng tiếng (âm tiết), sắp theo charIndex tăng dần. */
  syllables: { charIndex: number; at: number }[];
  duration: number;
}

/** Nghỉ ở dấu câu (ms, tốc độ đọc 1). */
export const PAUSE_MS = { comma: 180, stop: 350 } as const;

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);

interface Letter {
  ch: string;
  index: number;
}

/** Bỏ dấu thanh/dấu mũ để phân loại: "ướ" → "uo", "đ" → "d". */
function baseLetter(char: string) {
  const plain = char.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  return plain === 'đ' ? 'd' : plain.charAt(0);
}

function vowelViseme(ch: string): Viseme {
  if (ch === 'a') return 'open';
  if (ch === 'o' || ch === 'u') return 'round';
  return 'wide';
}

function onsetViseme(onset: string): Viseme {
  if (/^[mbp]/.test(onset)) return 'mbp';
  if (/^(qu|w)/.test(onset)) return 'round';
  return 'small';
}

function codaViseme(coda: string): Viseme {
  return /[mpb]$/.test(coda) ? 'mbp' : 'small';
}

interface Syllable {
  charIndex: number;
  onset: string;
  nucleus: string;
  coda: string;
  letters: number;
}

/** Tách một từ thành các tiếng theo cụm nguyên âm (tiếng Việt thường là đúng một tiếng). */
export function syllabify(word: string, offset = 0): Syllable[] {
  const letters: Letter[] = [];
  Array.from(word).reduce((index, char) => {
    const ch = baseLetter(char);
    if (ch) letters.push({ ch, index: offset + index });
    return index + char.length;
  }, 0);
  if (!letters.length) return [];
  const isVowel = letters.map(({ ch }, k) => {
    if (!VOWELS.has(ch)) return false;
    const prev = letters[k - 1]?.ch;
    const next = letters[k + 1]?.ch;
    // "qu", "gi" + nguyên âm: u/i thuộc phụ âm đầu.
    if (ch === 'u' && prev === 'q') return false;
    if (ch === 'i' && prev === 'g' && next !== undefined && VOWELS.has(next)) return false;
    // "y" đầu từ tiếng Anh trước nguyên âm (yes, you) là phụ âm.
    if (ch === 'y' && k === 0 && next !== undefined && VOWELS.has(next) && next !== 'e')
      return false;
    return true;
  });
  // Cụm nguyên âm liền nhau.
  const groups: [number, number][] = [];
  isVowel.forEach((vowel, k) => {
    if (!vowel) return;
    const last = groups[groups.length - 1];
    if (last && last[1] === k - 1) last[1] = k;
    else groups.push([k, k]);
  });
  // "e" câm cuối từ tiếng Anh (make, rice).
  const tail = groups[groups.length - 1];
  if (
    groups.length > 1 &&
    tail &&
    tail[0] === tail[1] &&
    tail[0] === letters.length - 1 &&
    letters[tail[0]]?.ch === 'e'
  ) {
    groups.pop();
  }
  const text = (from: number, to: number) =>
    letters
      .slice(from, to)
      .map(({ ch }) => ch)
      .join('');
  if (!groups.length) {
    return [
      {
        charIndex: offset,
        onset: text(0, letters.length),
        nucleus: '',
        coda: '',
        letters: letters.length,
      },
    ];
  }
  return groups.map(([start, end], g) => {
    const prevEnd = g === 0 ? -1 : (groups[g - 1]?.[1] ?? -1);
    const between = start - prevEnd - 1;
    // Phụ âm giữa hai cụm: phụ âm cuối cùng làm phụ âm đầu tiếng sau.
    const onsetStart = g === 0 ? 0 : start - Math.min(1, between);
    const next = groups[g + 1];
    const codaEnd = next ? next[0] - Math.min(1, next[0] - end - 1) : letters.length;
    return {
      charIndex: letters[onsetStart]?.index ?? offset,
      onset: text(onsetStart, start),
      nucleus: text(start, end + 1),
      coda: text(end + 1, codaEnd),
      letters: codaEnd - onsetStart,
    };
  });
}

const TOKEN = /[\p{L}\p{M}]+|\d+|[,;:]|[.!?…]+|\n/gu;

/**
 * Sinh dòng thời gian khẩu hình theo tiếng từ văn bản tiếng Việt/Anh.
 * Tốc độ ~5 tiếng/giây ở rate 1; dấu phẩy nghỉ ~180ms, dấu chấm ~350ms.
 */
export function buildVisemeTimeline(text: string, rate = 1): VisemeTimeline {
  const speed = rate > 0 ? rate : 1;
  const frames: VisemeFrame[] = [];
  const syllables: { charIndex: number; at: number }[] = [];
  let at = 0;
  let beat = 0;
  const push = (viseme: Viseme, duration: number, charIndex: number, openness?: number) => {
    const value = openness ?? VISEME_OPENNESS[viseme];
    const last = frames[frames.length - 1];
    // Gộp khung trùng khẩu hình để giảm số lần vẽ lại.
    if (!(last && last.viseme === viseme && last.openness === value)) {
      frames.push({ at, viseme, openness: value, charIndex });
    }
    at += duration;
  };
  const speakSyllable = (syllable: Syllable) => {
    const total = Math.min(260, Math.max(160, 150 + syllable.letters * 12)) / speed;
    syllables.push({ charIndex: syllable.charIndex, at });
    // Nhịp mạnh/nhẹ xen kẽ cho lời nói đỡ đều đều.
    const stress = beat++ % 2 === 0 ? 1 : 0.86;
    const onset = syllable.onset ? total * 0.22 : 0;
    const coda = syllable.coda ? total * 0.2 : 0;
    const nucleus: Viseme[] = [];
    for (const ch of syllable.nucleus) {
      const viseme = vowelViseme(ch);
      if (nucleus[nucleus.length - 1] !== viseme) nucleus.push(viseme);
    }
    if (!nucleus.length) nucleus.push('small');
    if (onset) push(onsetViseme(syllable.onset), onset, syllable.charIndex);
    const part = (total - onset - coda) / nucleus.length;
    for (const viseme of nucleus) {
      push(
        viseme,
        part,
        syllable.charIndex,
        Math.round(VISEME_OPENNESS[viseme] * stress * 100) / 100,
      );
    }
    if (coda) push(codaViseme(syllable.coda), coda, syllable.charIndex);
  };
  for (const match of text.matchAll(TOKEN)) {
    const token = match[0];
    const index = match.index;
    if (/^[,;:]$/.test(token)) {
      push('rest', PAUSE_MS.comma / speed, index);
    } else if (/^([.!?…]+|\n)$/.test(token)) {
      push('rest', PAUSE_MS.stop / speed, index);
    } else if (/^\d+$/.test(token)) {
      // Số đọc thành chữ: ước mỗi chữ số ~ một tiếng.
      Array.from(token).forEach((_, k) =>
        speakSyllable({
          charIndex: index + k,
          onset: 'n',
          nucleus: k % 2 ? 'a' : 'o',
          coda: '',
          letters: 3,
        }),
      );
    } else {
      syllabify(token, index).forEach(speakSyllable);
    }
  }
  push('rest', 0, text.length);
  return { frames, syllables, duration: at };
}

/** Khung khẩu hình tại thời điểm `ms` (tìm nhị phân). Ngoài dòng thời gian → khép miệng. */
export function visemeAt(
  timeline: VisemeTimeline,
  ms: number,
): Pick<VisemeFrame, 'viseme' | 'openness'> {
  const { frames } = timeline;
  if (ms < 0 || ms >= timeline.duration || !frames.length) return { viseme: 'rest', openness: 0 };
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((frames[mid]?.at ?? 0) <= ms) low = mid;
    else high = mid - 1;
  }
  const frame = frames[low];
  return frame
    ? { viseme: frame.viseme, openness: frame.openness }
    : { viseme: 'rest', openness: 0 };
}

/** Mốc thời gian của tiếng chứa ký tự `charIndex` (tiếng gần nhất phía trước). */
export function syllableTimeAt(timeline: VisemeTimeline, charIndex: number) {
  let time = 0;
  for (const syllable of timeline.syllables) {
    if (syllable.charIndex > charIndex) break;
    time = syllable.at;
  }
  return time;
}

/** Giảm chuyển động: chỉ mấp máy nhẹ, không đổi dáng môi. */
export function softenViseme(openness: number): MouthShape {
  const soft = Math.round(Math.min(0.2, openness * 0.3) * 100) / 100;
  return { viseme: soft > 0 ? ('small' as const) : ('rest' as const), openness: soft };
}

interface Clock {
  now: () => number;
  request: (callback: () => void) => number;
  cancel: (handle: number) => void;
}

const browserClock: Clock = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  request: (callback) =>
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(callback)
      : (setTimeout(callback, 16) as unknown as number),
  cancel: (handle) =>
    typeof cancelAnimationFrame === 'function'
      ? cancelAnimationFrame(handle)
      : clearTimeout(handle),
};

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  );
}

export interface MouthShape {
  viseme: Viseme;
  openness: number;
}

const REST: MouthShape = { viseme: 'rest', openness: 0 };

/**
 * Bộ chạy khẩu hình không phụ thuộc React: tự chạy theo ước lượng bằng requestAnimationFrame,
 * `sync(charIndex)` căn lại đồng hồ khi trình duyệt phát `onboundary`/bắt đầu câu.
 */
export function createLipSyncEngine(
  onChange: (shape: MouthShape) => void,
  clock: Clock = browserClock,
  reducedMotion: () => boolean = prefersReducedMotion,
) {
  let timeline: VisemeTimeline | null = null;
  let origin = 0;
  let handle = 0;
  let reduced = false;
  let current: MouthShape = REST;

  const emit = (shape: MouthShape) => {
    if (shape.viseme === current.viseme && shape.openness === current.openness) return;
    current = shape;
    onChange(shape);
  };
  const halt = () => {
    if (handle) clock.cancel(handle);
    handle = 0;
  };
  const frame = () => {
    handle = 0;
    if (!timeline) return;
    const elapsed = clock.now() - origin;
    const shape = visemeAt(timeline, elapsed);
    emit(reduced ? softenViseme(shape.openness) : shape);
    // Hết ước lượng mà chưa có end(): khép miệng, chờ sync() tiếp theo.
    if (elapsed < timeline.duration) handle = clock.request(frame);
  };
  const run = () => {
    if (!handle) handle = clock.request(frame);
  };

  return {
    begin: (text: string, rate = 1) => {
      halt();
      reduced = reducedMotion();
      timeline = buildVisemeTimeline(text, rate);
      origin = clock.now();
      run();
    },
    sync: (charIndex: number) => {
      if (!timeline) return;
      origin = clock.now() - syllableTimeAt(timeline, charIndex);
      run();
    },
    end: () => {
      halt();
      timeline = null;
      emit(REST);
    },
    /** Dọn rAF khi unmount, không phát thay đổi. */
    dispose: () => {
      halt();
    },
  };
}

export interface LipSync extends MouthShape {
  /**
   * Bắt đầu đọc `text` với tốc độ `rate`. Truyền đúng văn bản sẽ đọc (`onStart` của
   * speakSequence) để `sync(charIndex)` khớp vị trí.
   */
  begin: (text: string, rate?: number) => void;
  /** Căn lại theo vị trí ký tự đang đọc (từ `onboundary` hoặc đầu câu). */
  sync: (charIndex: number) => void;
  end: () => void;
}

/** Khẩu hình khớp lời cho Chú Rồng: truyền `viseme`/`openness` vào `<DragonMascot>`. */
export function useLipSync(): LipSync {
  const [shape, setShape] = useState<MouthShape>(REST);
  const [engine] = useState(() => createLipSyncEngine(setShape));
  useEffect(() => () => engine.dispose(), [engine]);
  return useMemo(
    () => ({ ...shape, begin: engine.begin, sync: engine.sync, end: engine.end }),
    [engine, shape],
  );
}
