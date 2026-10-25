import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildVisemeTimeline,
  createLipSyncEngine,
  PAUSE_MS,
  softenViseme,
  syllabify,
  syllableTimeAt,
  useLipSync,
  visemeAt,
  type MouthShape,
  type Viseme,
} from '@/components/assistant/lipSync';

/** Các khẩu hình (đã gộp trùng) theo thứ tự xuất hiện. */
const visemes = (text: string) => buildVisemeTimeline(text).frames.map((frame) => frame.viseme);

/** Đồng hồ giả: tự tay chạy từng khung hình. */
function fakeClock() {
  let time = 0;
  let next = 1;
  const queue = new Map<number, () => void>();
  return {
    now: () => time,
    request: (callback: () => void) => {
      queue.set(next, callback);
      return next++;
    },
    cancel: (handle: number) => {
      queue.delete(handle);
    },
    pending: () => queue.size,
    advance(ms: number) {
      time += ms;
      const callbacks = [...queue.values()];
      queue.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('syllabify', () => {
  it('tiếng Việt: một từ là một tiếng, tách phụ âm đầu/vần/âm cuối, bỏ dấu', () => {
    expect(syllabify('phở')).toEqual([
      { charIndex: 0, onset: 'ph', nucleus: 'o', coda: '', letters: 3 },
    ]);
    expect(syllabify('nướng', 10)).toEqual([
      { charIndex: 10, onset: 'n', nucleus: 'uo', coda: 'ng', letters: 5 },
    ]);
    expect(syllabify('đường')[0]?.onset).toBe('d');
  });

  it('"qu" và "gi" thuộc phụ âm đầu', () => {
    expect(syllabify('quả')[0]).toMatchObject({ onset: 'qu', nucleus: 'a' });
    expect(syllabify('giờ')[0]).toMatchObject({ onset: 'gi', nucleus: 'o' });
    expect(syllabify('gì')[0]).toMatchObject({ onset: 'g', nucleus: 'i' });
  });

  it('tiếng Anh: tách nhiều tiếng theo cụm nguyên âm, bỏ "e" câm cuối', () => {
    const cooking = syllabify('cooking');
    expect(cooking.map((s) => [s.onset, s.nucleus, s.coda])).toEqual([
      ['c', 'oo', ''],
      ['k', 'i', 'ng'],
    ]);
    expect(cooking[1]?.charIndex).toBe(3);
    expect(syllabify('rice')).toHaveLength(1);
  });
});

describe('buildVisemeTimeline', () => {
  it('m/b/p/ph đầu tiếng → mbp; a → open; o/ô/ơ/u/ư → round; i/y/e/ê → wide', () => {
    expect(visemes('ba')).toEqual(['mbp', 'open', 'rest']);
    expect(visemes('phở')).toEqual(['mbp', 'round', 'rest']);
    expect(visemes('mì')).toEqual(['mbp', 'wide', 'rest']);
    expect(visemes('ư')).toEqual(['round', 'rest']);
    expect(visemes('hành')).toEqual(['small', 'open', 'small', 'rest']);
    expect(visemes('cơm')).toEqual(['small', 'round', 'mbp', 'rest']);
  });

  it('nguyên âm đôi chuyển dáng môi trong một tiếng (hoa: tròn → há)', () => {
    expect(visemes('hoa')).toEqual(['small', 'round', 'open', 'rest']);
  });

  it('dấu phẩy nghỉ ~180ms, dấu chấm ~350ms (khép miệng)', () => {
    const comma = buildVisemeTimeline('a, a');
    const stop = buildVisemeTimeline('a. a');
    const plain = buildVisemeTimeline('a a');
    expect(comma.duration - plain.duration).toBeCloseTo(PAUSE_MS.comma);
    expect(stop.duration - plain.duration).toBeCloseTo(PAUSE_MS.stop);
    const pause = comma.frames.find((frame) => frame.charIndex === 1);
    expect(pause).toMatchObject({ viseme: 'rest', openness: 0 });
  });

  it('tốc độ ~4.5–5.5 tiếng/giây ở rate 1, rate 2 nhanh gấp đôi', () => {
    const text = 'Cho thịt bò vào nồi rồi đun sôi khoảng mười phút cho thật mềm';
    const timeline = buildVisemeTimeline(text);
    const perSecond = timeline.syllables.length / (timeline.duration / 1000);
    expect(timeline.syllables).toHaveLength(14);
    expect(perSecond).toBeGreaterThanOrEqual(4.5);
    expect(perSecond).toBeLessThanOrEqual(5.5);
    expect(buildVisemeTimeline(text, 2).duration).toBeCloseTo(timeline.duration / 2);
  });

  it('khung tăng dần theo thời gian và luôn kết thúc bằng rest', () => {
    const { frames, duration } = buildVisemeTimeline('Xin chào, mình là Chú Rồng!');
    frames.slice(1).forEach((frame, k) => expect(frame.at).toBeGreaterThan(frames[k]?.at ?? 0));
    expect(frames[frames.length - 1]?.viseme).toBe('rest');
    expect(frames[frames.length - 1]?.at).toBeLessThanOrEqual(duration);
    for (const frame of frames) {
      expect(frame.openness).toBeGreaterThanOrEqual(0);
      expect(frame.openness).toBeLessThanOrEqual(1);
    }
  });

  it('văn bản rỗng hoặc chỉ ký hiệu → chỉ một khung rest', () => {
    expect(buildVisemeTimeline('').frames).toEqual([
      { at: 0, viseme: 'rest', openness: 0, charIndex: 0 },
    ]);
    expect(buildVisemeTimeline('🐉 ---').syllables).toHaveLength(0);
  });
});

describe('visemeAt / syllableTimeAt', () => {
  const timeline = buildVisemeTimeline('ba mẹ');

  it('trả khẩu hình tại thời điểm; ngoài khoảng → rest', () => {
    expect(visemeAt(timeline, 0).viseme).toBe('mbp');
    expect(visemeAt(timeline, 100).viseme).toBe('open');
    expect(visemeAt(timeline, -5)).toEqual({ viseme: 'rest', openness: 0 });
    expect(visemeAt(timeline, timeline.duration + 1)).toEqual({ viseme: 'rest', openness: 0 });
  });

  it('charIndex của từ thứ hai → mốc tiếng thứ hai', () => {
    expect(syllableTimeAt(timeline, 0)).toBe(0);
    expect(syllableTimeAt(timeline, 3)).toBe(timeline.syllables[1]?.at);
    expect(syllableTimeAt(timeline, 4)).toBe(timeline.syllables[1]?.at);
  });
});

describe('softenViseme', () => {
  it.each<[Viseme, number, Viseme, number]>([
    ['open', 0.95, 'small', 0.2],
    ['round', 0.55, 'small', 0.17],
    ['mbp', 0, 'rest', 0],
  ])('%s %s → %s %s', (_viseme, openness, soft, value) => {
    expect(softenViseme(openness)).toEqual({ viseme: soft, openness: value });
  });
});

describe('createLipSyncEngine', () => {
  it('tự chạy theo ước lượng, end() khép miệng và dừng rAF', () => {
    const clock = fakeClock();
    const shapes: MouthShape[] = [];
    const engine = createLipSyncEngine(
      (shape) => shapes.push(shape),
      clock,
      () => false,
    );
    engine.begin('ba ba');
    clock.advance(0);
    expect(shapes.at(-1)?.viseme).toBe('mbp');
    clock.advance(100);
    expect(shapes.at(-1)?.viseme).toBe('open');
    engine.end();
    expect(shapes.at(-1)).toEqual({ viseme: 'rest', openness: 0 });
    expect(clock.pending()).toBe(0);
  });

  it('sync(charIndex) căn lại đồng hồ về tiếng đang đọc', () => {
    const clock = fakeClock();
    const shapes: MouthShape[] = [];
    const engine = createLipSyncEngine(
      (shape) => shapes.push(shape),
      clock,
      () => false,
    );
    engine.begin('hoa mai');
    clock.advance(0);
    expect(shapes.at(-1)?.viseme).toBe('small');
    // Trình duyệt báo đang đọc "mai" (ký tự 4) ngay từ đầu.
    engine.sync(4);
    clock.advance(0);
    expect(shapes.at(-1)?.viseme).toBe('mbp');
  });

  it('hết ước lượng thì khép miệng, dừng rAF; sync() chạy lại', () => {
    const clock = fakeClock();
    const shapes: MouthShape[] = [];
    const engine = createLipSyncEngine(
      (shape) => shapes.push(shape),
      clock,
      () => false,
    );
    engine.begin('ba');
    clock.advance(0);
    clock.advance(5000);
    expect(shapes.at(-1)?.viseme).toBe('rest');
    expect(clock.pending()).toBe(0);
    engine.sync(0);
    expect(clock.pending()).toBe(1);
    clock.advance(0);
    expect(shapes.at(-1)?.viseme).toBe('mbp');
  });

  it('prefers-reduced-motion: chỉ mấp máy nhẹ', () => {
    const clock = fakeClock();
    const shapes: MouthShape[] = [];
    const engine = createLipSyncEngine(
      (shape) => shapes.push(shape),
      clock,
      () => true,
    );
    engine.begin('ba ba ba');
    for (let k = 0; k < 40; k += 1) clock.advance(16);
    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) {
      expect(['small', 'rest']).toContain(shape.viseme);
      expect(shape.openness).toBeLessThanOrEqual(0.2);
    }
  });
});

describe('useLipSync', () => {
  it('trả khẩu hình theo rAF và dọn rAF khi unmount', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let next = 1;
    const cancel = vi.fn((handle: number) => callbacks.delete(handle));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.set(next, callback);
      return next++;
    });
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const flush = () =>
      act(() => {
        const pending = [...callbacks.values()];
        callbacks.clear();
        pending.forEach((callback) => callback(0));
      });

    const { result, unmount } = renderHook(() => useLipSync());
    expect(result.current).toMatchObject({ viseme: 'rest', openness: 0 });
    act(() => result.current.begin('**Bánh** mì'));
    flush();
    expect(result.current.viseme).toBe('mbp');
    now.mockReturnValue(1080);
    flush();
    expect(result.current.viseme).toBe('open');
    expect(result.current.openness).toBeGreaterThan(0.5);
    act(() => result.current.end());
    expect(result.current).toMatchObject({ viseme: 'rest', openness: 0 });

    act(() => result.current.begin('ba'));
    expect(callbacks.size).toBe(1);
    unmount();
    expect(cancel).toHaveBeenCalled();
    expect(callbacks.size).toBe(0);
    now.mockRestore();
  });
});
