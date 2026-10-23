import { afterEach, describe, expect, it, vi } from 'vitest';

import { speakSequence } from '@/features/cooking/speech';

class FakeUtterance {
  lang = '';
  rate = 1;
  voice: unknown = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onboundary: ((event: { name?: string; charIndex: number; charLength?: number }) => void) | null =
    null;
  constructor(public text: string) {}
}

function installSpeech() {
  const spoken: FakeUtterance[] = [];
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('speechSynthesis', {
    cancel: vi.fn(),
    getVoices: () => [],
    speak: (utterance: FakeUtterance) => spoken.push(utterance),
  });
  return spoken;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('speakSequence onWord/onStart', () => {
  it('charIndex cộng dồn offset theo từng câu; đầu câu báo length 0', () => {
    const spoken = installSpeech();
    const onWord = vi.fn();
    const onStart = vi.fn();
    const intro = 'Rửa sạch rau thơm, để ráo nước rồi xếp ra đĩa cho gọn gàng. '.repeat(3);
    const text = `${intro}Thái nhỏ hành lá.`;
    const cancel = speakSequence(text, 'vi-VN', () => undefined, onWord, onStart);

    expect(spoken.length).toBeGreaterThan(1);
    const fullText = spoken.map((utterance) => utterance.text).join(' ');
    expect(onStart).toHaveBeenCalledWith(fullText);

    const last = spoken[spoken.length - 1];
    if (!last) throw new Error('Không có câu nào được đọc');
    const offset = fullText.lastIndexOf(last.text);
    last.onstart?.();
    expect(onWord).toHaveBeenLastCalledWith(0, offset);
    const word = last.text.indexOf('hành');
    last.onboundary?.({ name: 'word', charIndex: word, charLength: 4 });
    expect(onWord).toHaveBeenLastCalledWith(4, offset + word);
    expect(fullText.slice(offset + word, offset + word + 4)).toBe('hành');
    // Boundary câu (sentence) bị bỏ qua.
    last.onboundary?.({ name: 'sentence', charIndex: 0 });
    expect(onWord).toHaveBeenCalledTimes(2);
    cancel();
  });
});
