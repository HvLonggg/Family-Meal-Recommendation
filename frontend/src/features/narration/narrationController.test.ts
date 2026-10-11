import { beforeEach, describe, expect, it } from 'vitest';

import { NarrationController, pickVoice } from '@/features/narration/narrationController';
import type { NarrationSegment } from '@/features/narration/recipeScript';

type FakeUtterance = SpeechSynthesisUtterance & { finish: () => void };

class FakeEngine {
  spoken: FakeUtterance[] = [];
  cancelled = 0;
  speak = (utterance: SpeechSynthesisUtterance) => {
    this.spoken.push(utterance as FakeUtterance);
  };
  cancel = () => {
    this.cancelled += 1;
    // Như trình duyệt thật: câu đang đọc bị hủy sẽ bắn lỗi "interrupted".
    const last = this.spoken.at(-1);
    last?.onerror?.({ error: 'interrupted' } as SpeechSynthesisErrorEvent);
  };
  get last() {
    return this.spoken.at(-1)!;
  }
}

const createUtterance = (text: string) => {
  const utterance = { text } as FakeUtterance;
  utterance.finish = () => {
    utterance.onend?.({} as SpeechSynthesisEvent);
  };
  return utterance;
};

const segments: NarrationSegment[] = [
  { section: 'intro', anchor: 'intro', text: 'Cá kho.', lang: 'vi-VN' },
  { section: 'preparation', anchor: 'preparation-0', text: 'Bước 1. Rửa cá.', lang: 'vi-VN' },
  { section: 'cooking', anchor: 'cooking-0', text: 'Step 1.', lang: 'en-US' },
];

describe('NarrationController', () => {
  let engine: FakeEngine;
  let controller: NarrationController;

  beforeEach(() => {
    engine = new FakeEngine();
    controller = new NarrationController(engine, createUtterance);
    controller.setSegments(segments);
  });

  it('reads segments in order in Vietnamese and returns to idle at the end', () => {
    controller.play();
    expect(engine.last.text).toBe('Cá kho.');
    expect(engine.last.lang).toBe('vi-VN');
    engine.last.finish();
    expect(controller.getSnapshot()).toMatchObject({ status: 'playing', index: 1 });
    engine.last.finish();
    expect(engine.last.lang).toBe('en-US');
    engine.last.finish();
    expect(controller.getSnapshot()).toMatchObject({ status: 'idle', index: 0 });
    expect(engine.spoken).toHaveLength(3);
  });

  it('pauses without advancing and resumes from the same segment', () => {
    controller.play(1);
    const interrupted = engine.last;
    controller.pause();
    expect(controller.getSnapshot()).toMatchObject({ status: 'paused', index: 1 });
    // Sự kiện end muộn của câu đã hủy không được kéo sang đoạn sau.
    interrupted.finish();
    expect(engine.spoken).toHaveLength(1);
    controller.resume();
    expect(engine.last.text).toBe('Bước 1. Rửa cá.');
    expect(controller.getSnapshot().status).toBe('playing');
  });

  it('uses the voice matching each segment language', () => {
    const vietnamese = { name: 'Microsoft An' } as SpeechSynthesisVoice;
    const english = { name: 'Microsoft Aria' } as SpeechSynthesisVoice;
    controller.setVoices({ 'vi-VN': vietnamese, 'en-US': english });
    controller.play(1);
    expect(engine.last.voice).toBe(vietnamese);
    engine.last.finish();
    expect(engine.last.voice).toBe(english);
  });

  it('applies speed and volume immediately while playing', () => {
    controller.play();
    controller.setRate(1.5);
    expect(engine.last).toMatchObject({ text: 'Cá kho.', rate: 1.5 });
    controller.setVolume(0.4, false);
    expect(engine.spoken).toHaveLength(2);
    controller.applySettings();
    expect(engine.last).toMatchObject({ text: 'Cá kho.', volume: 0.4 });
  });

  it('clamps settings and navigation to valid bounds', () => {
    controller.setRate(5);
    controller.setVolume(-1);
    expect(controller.getSnapshot()).toMatchObject({ rate: 2, volume: 0 });
    controller.previous();
    expect(controller.getSnapshot().index).toBe(0);
    controller.play(2);
    controller.next();
    expect(controller.getSnapshot()).toMatchObject({ status: 'playing', index: 2 });
  });

  it('stops and surfaces real playback errors', () => {
    controller.play();
    engine.last.onerror?.({ error: 'audio-busy' } as SpeechSynthesisErrorEvent);
    expect(controller.getSnapshot()).toMatchObject({ status: 'paused', error: true });
    controller.stop();
    expect(controller.getSnapshot()).toMatchObject({ status: 'idle', index: 0 });
  });
});

describe('pickVoice', () => {
  const voice = (lang: string, localService: boolean, name = lang) =>
    ({ lang, localService, name, voiceURI: name }) as SpeechSynthesisVoice;

  it('prefers the exact region, then an installed voice', () => {
    const online = voice('vi-VN', false, 'Google Tiếng Việt');
    const local = voice('vi-VN', true, 'Microsoft An');
    const british = voice('en-GB', true, 'Microsoft Hazel');
    const american = voice('en-US', false, 'Google US English');
    const voices = [british, online, american, local];
    expect(pickVoice(voices, 'vi-VN')).toBe(local);
    expect(pickVoice(voices, 'en-US')).toBe(american);
    expect(pickVoice([british], 'en-US')).toBe(british);
    expect(pickVoice([british], 'vi-VN')).toBeNull();
  });
});
