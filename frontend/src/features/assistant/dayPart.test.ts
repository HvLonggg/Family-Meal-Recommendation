import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  streamAssistantMessage,
  streamingText,
  type ChatResult,
} from '@/features/assistant/assistantApi';
import { dayPart, dayPartPrompts, vietnamHour } from '@/features/assistant/dayPart';
import { pickTeaser } from '@/features/assistant/teasers';
import { en } from '@/features/i18n/messages.en';

/** Giờ Việt Nam (UTC+7) dựng từ giờ UTC để test không phụ thuộc múi giờ của máy chạy test. */
const vn = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 22, hour - 7, minute));

describe('day part in Vietnam time', () => {
  it.each([
    [6, 'sang'],
    [9, 'sang'],
    [10, 'sang'],
    [11, 'trua'],
    [13, 'trua'],
    [15, 'chieu'],
    [18, 'toi'],
    [22, 'khuya'],
    [26, 'khuya'], // 2 giờ sáng hôm sau
  ])('%s h is %s', (hour, part) => {
    expect(dayPart(vn(hour))).toBe(part);
  });

  it('reads the hour in Asia/Ho_Chi_Minh regardless of the device time zone', () => {
    expect(vietnamHour(new Date('2026-10-22T05:30:00Z'))).toBe(12);
  });

  it('suggests the right meal in teasers and starters', () => {
    expect(dayPartPrompts[dayPart(vn(12))].starter).toBe('Trưa nay ăn gì?');
    expect(dayPartPrompts[dayPart(vn(19))].starter).toBe('Tối nay ăn gì?');
    // Chỉ lấy câu theo buổi (không lấy câu trò chuyện vui).
    expect(pickTeaser(vn(12), () => 0.5)).toMatch(/trưa/i);
    expect(pickTeaser(vn(7), () => 0.5)).toMatch(/sáng/i);
  });

  it('has English copy for every greeting, starter and teaser', () => {
    const texts = Object.values(dayPartPrompts).flatMap((item) => [item.greeting, item.starter]);
    for (let hour = 0; hour < 24; hour += 1) {
      for (let step = 0; step < 10; step += 1) {
        texts.push(pickTeaser(vn(hour), () => step / 10));
      }
    }
    expect(texts.filter((text) => !(text in en))).toEqual([]);
  });
});

describe('streaming replies', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hides citation markers, even half-written ones', () => {
    expect(streamingText('Thử **Phở bò** [1] nhé [2, 3]')).toBe('Thử **Phở bò** nhé');
    expect(streamingText('Món này ngon [1')).toBe('Món này ngon');
    expect(streamingText('Bước 1 [')).toBe('Bước 1');
  });

  it('passes each chunk to onDelta and resolves with the saved reply', async () => {
    const done = { conversation_id: null, title: 'Trưa nay ăn gì?' } as unknown as ChatResult;
    const body = [
      'event: start\ndata: {}\n\n',
      'event: delta\ndata: {"text": "Trưa nay "}\n\nevent: del',
      'ta\ndata: {"text": "ăn phở nhé!"}\n\n',
      `event: done\ndata: ${JSON.stringify(done)}\n\n`,
    ];
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of body) controller.enqueue(encoder.encode(part));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const deltas: string[] = [];
    const result = await streamAssistantMessage(
      { message: 'Trưa nay ăn gì?', language: 'vi' },
      { onDelta: (text) => deltas.push(text) },
    );
    expect(deltas).toEqual(['Trưa nay ', 'ăn phở nhé!']);
    expect(result).toEqual(done);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/assistant/chat/stream');
  });

  it('turns a server error event into a safe message', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'event: error\ndata: {"message": "Đã có lỗi xảy ra. Vui lòng thử lại."}\n\n',
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));
    await expect(
      streamAssistantMessage({ message: 'Chào', language: 'vi' }, { onDelta: () => undefined }),
    ).rejects.toThrow('Đã có lỗi xảy ra. Vui lòng thử lại.');
  });
});
