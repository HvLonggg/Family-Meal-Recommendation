import { describe, expect, it } from 'vitest';

import { getRecipe } from '@/data/recipes';
import { CLOSING, stepSpeech } from '@/features/cooking/cookScript';
import { buildCookSteps, cookPath, parseCookDishes } from '@/features/cooking/cookSession';
import {
  detectStepTimer,
  formatClock,
  parseClockTime,
  roughDuration,
  parseSpokenDuration,
  spokenDuration,
  wordsToDigits,
} from '@/features/cooking/durations';
import {
  isBargeInStop,
  isStopSpeaking,
  parseVoiceCommand,
  type VoiceCommand,
} from '@/features/cooking/voiceCommands';
import { pickTimer, type CookTimer } from '@/features/cooking/useCookTimers';

describe('durations', () => {
  it.each([
    ['hẹn giờ 30 phút', 1800],
    ['nhắc tôi sau 1 tiếng rưỡi', 5400],
    ['báo thức sau nửa tiếng', 1800],
    ['nhắc mình sau mười lăm phút', 900],
    ['hẹn giờ hai mươi lăm phút', 1500],
    ['hẹn ba mươi phút nhé', 1800],
    ['hẹn năm phút', 300],
    ['đặt chuông 1 giờ 15 phút', 4500],
    ['hẹn 45 giây', 45],
    ['set a timer for ten minutes', 600],
    ['remind me in twenty five minutes', 1500],
    ['remind me in half an hour', 1800],
    ['set a timer', null],
  ])('reads "%s" as %s seconds', (text, seconds) => {
    expect(parseSpokenDuration(text)).toBe(seconds);
  });

  it('keeps ordinary words that look like numbers', () => {
    expect(wordsToDigits('năm nay ba người ăn')).toBe('năm nay ba người ăn');
  });

  it.each([
    ['Ninh xương với lửa nhỏ 30 phút, vớt bọt thường xuyên.', 1800],
    ['Chần 2 phút rồi hầm thêm 1 giờ 30 phút cho mềm.', 5400],
    ['Ướp thịt 15–20 phút cho ngấm.', 900],
    ['Đun sôi rồi nêm gia vị vừa ăn.', null],
    ['Đảo nhanh tay 30 giây.', null],
  ])('suggests a timer for "%s"', (text, seconds) => {
    expect(detectStepTimer(text)).toBe(seconds);
  });

  it('formats clocks and spoken durations', () => {
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(-3)).toBe('00:00');
    expect(spokenDuration(5400, 'vi')).toBe('1 giờ 30 phút');
    expect(spokenDuration(61, 'en')).toBe('1 minute 1 second');
  });
});

describe('voice commands', () => {
  it.each([
    ['Xong rồi', 'done'],
    ['ok tiếp đi', 'done'],
    ['rồi', 'done'],
    ['Chưa xong', 'notDone'],
    ['chưa', 'notDone'],
    ['đợi chút đã', 'notDone'],
    ['đọc lại đi', 'repeat'],
    ['quay lại bước trước', 'back'],
    ['tạm dừng', 'pause'],
    ['tắt chuông', 'stopAlarm'],
    ['còn bao lâu nữa', 'timerStatus'],
    ['cần những nguyên liệu gì', 'ingredients'],
    ["I'm done", 'done'],
    ['not yet', 'notDone'],
  ])('understands "%s"', (text, type) => {
    expect(parseVoiceCommand(text).type).toBe(type);
  });

  it('sets timers and snoozes with durations', () => {
    expect(parseVoiceCommand('Báo thức nhắc tôi sau 20 phút')).toEqual({
      type: 'timer',
      seconds: 1200,
    });
    expect(parseVoiceCommand('báo thức nhắc tôi')).toEqual({ type: 'timer', seconds: null });
    // "Chưa xong, nhắc tôi…" vẫn là hẹn giờ chứ không phải chỉ "chưa xong".
    expect(parseVoiceCommand('chưa xong, nhắc tôi sau 5 phút').type).toBe('timer');
    expect(parseVoiceCommand('cho thêm 5 phút nữa')).toEqual({
      type: 'adjustTimer',
      mode: 'add',
      seconds: 300,
    });
  });

  it('treats problems and questions as questions for the assistant', () => {
    expect(parseVoiceCommand('nước dùng bị đục thì làm sao').type).toBe('question');
    expect(parseVoiceCommand('Không có me thì thay bằng gì?').type).toBe('question');
    expect(parseVoiceCommand('cá xong rồi nhưng bị dính chảo thì sao').type).toBe('question');
    expect(parseVoiceCommand('ờ').type).toBe('unknown');
  });
});

describe('cook session', () => {
  it('parses dish params safely', () => {
    const plan = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(
      parseCookDishes([`canh-chua-ca:3:${plan}`, 'canh-chua-ca:2', 'BAD SLUG', 'bun-cha:x:nope']),
    ).toEqual([
      { slug: 'canh-chua-ca', servings: 3, planItemId: plan },
      { slug: 'bun-cha', servings: 0 },
    ]);
    expect(cookPath([{ slug: 'canh-chua-ca', servings: 4 }])).toBe('/cook?dish=canh-chua-ca%3A4');
  });

  it('builds ingredients, every step and a finish step per dish', () => {
    const recipe = getRecipe('canh-chua-ca')!;
    const steps = buildCookSteps([{ recipe, servings: 2 }], 'vi');
    expect(steps[0]!.kind).toBe('ingredients');
    expect(steps[0]!.items!.length).toBeGreaterThan(3);
    expect(steps.at(-1)!.kind).toBe('finish');
    expect(steps).toHaveLength(recipe.preparation.length + recipe.cooking.length + 2);

    const speech = stepSpeech(
      steps[1]!,
      { dishName: recipe.name, servings: 2, dishNumber: 1, dishCount: 1 },
      'vi',
    );
    expect(speech).toContain(`Sơ chế, bước 1 trên ${recipe.preparation.length}.`);
    expect(speech.endsWith(CLOSING.vi)).toBe(true);
  });
});

describe('long natural sentences', () => {
  it.each([
    ['mình làm xong cái bước này rồi đó nha bạn', 'done'],
    ['ok mình đã xong phần sơ chế rồi', 'done'],
    ['mình chưa làm xong cái bước này đâu', 'notDone'],
    ['làm xong rồi thì có cần đậy nắp không?', 'question'],
  ])('understands "%s"', (text, type) => {
    expect(parseVoiceCommand(text).type).toBe(type);
  });
});

// --- Hẹn giờ nói đa dạng, dừng nói --------------------------------------------------------
// 18:00 giờ máy người dùng.
const EVENING = new Date(2026, 9, 23, 18, 0, 0);

describe('flexible spoken timers', () => {
  it.each<[string, VoiceCommand]>([
    ['hẹn 10p', { type: 'timer', seconds: 600 }],
    ['hen 10p', { type: 'timer', seconds: 600 }],
    ['10 phút nữa gọi mình', { type: 'timer', seconds: 600 }],
    ['canh giùm mình 15 phút', { type: 'timer', seconds: 900 }],
    ['canh gium minh 15 phut', { type: 'timer', seconds: 900 }],
    ['đếm ngược 5 phút', { type: 'timer', seconds: 300 }],
    ['1 tiếng 15', { type: 'timer', seconds: 4500 }],
    ['một tiếng mười lăm phút', { type: 'timer', seconds: 4500 }],
    ['nửa tiếng nữa nhắc mình', { type: 'timer', seconds: 1800 }],
    ['nua tieng nua nhac minh', { type: 'timer', seconds: 1800 }],
    ['15 phút nữa nhắc mình tắt bếp', { type: 'timer', seconds: 900, label: 'Tắt bếp' }],
    ['để 20 phút hầm xương', { type: 'timer', seconds: 1200, label: 'Hầm xương' }],
    [
      'nhắc mình sau 1 phút nữa nhé, mình đang ngâm me',
      { type: 'timer', seconds: 60, label: 'Ngâm me' },
    ],
    ['hẹn giờ cho bước này', { type: 'timer', seconds: null }],
    ['hẹn giờ hai mươi lăm phút luộc gà', { type: 'timer', seconds: 1500, label: 'Luộc gà' }],
    ['nhac minh sau muoi lam phut', { type: 'timer', seconds: 900 }],
    ['set a timer for ten minutes', { type: 'timer', seconds: 600 }],
    ['remind me in half an hour', { type: 'timer', seconds: 1800 }],
    ['15 phút', { type: 'timer', seconds: 900 }],
    [
      'hẹn 10 phút luộc trứng và 25 phút hầm xương',
      {
        type: 'timers',
        timers: [
          { seconds: 600, label: 'Luộc trứng' },
          { seconds: 1500, label: 'Hầm xương' },
        ],
      },
    ],
    // Điều chỉnh chuông đang chạy.
    ['thêm 5 phút', { type: 'adjustTimer', mode: 'add', seconds: 300 }],
    ['cộng thêm 2 phút nữa', { type: 'adjustTimer', mode: 'add', seconds: 120 }],
    ['bớt 3 phút', { type: 'adjustTimer', mode: 'subtract', seconds: 180 }],
    ['bot 3 phut', { type: 'adjustTimer', mode: 'subtract', seconds: 180 }],
    ['đổi thành 20 phút', { type: 'adjustTimer', mode: 'set', seconds: 1200 }],
    ['change it to 20 minutes', { type: 'adjustTimer', mode: 'set', seconds: 1200 }],
    ['add 5 minutes', { type: 'adjustTimer', mode: 'add', seconds: 300 }],
    [
      'thêm 5 phút cho nồi xương',
      { type: 'adjustTimer', mode: 'add', seconds: 300, target: 'nồi xương' },
    ],
    ['5 phút nữa', { type: 'adjustTimer', mode: 'add', seconds: 300 }],
    // Hủy.
    ['hủy hẹn giờ', { type: 'cancelTimer', all: false }],
    ['huy hen gio', { type: 'cancelTimer', all: false }],
    ['bỏ chuông luộc trứng', { type: 'cancelTimer', all: false, target: 'luộc trứng' }],
    ['xóa hết hẹn giờ', { type: 'cancelTimer', all: true }],
    ['cancel all timers', { type: 'cancelTimer', all: true }],
    // Hỏi.
    ['còn bao lâu', { type: 'timerStatus' }],
    ['nồi xương còn mấy phút', { type: 'timerStatus', target: 'nồi xương' }],
    // Dừng nói.
    ['dừng đi', { type: 'stopSpeaking' }],
    ['dừng lại', { type: 'stopSpeaking' }],
    ['thôi', { type: 'stopSpeaking' }],
    ['im đi', { type: 'stopSpeaking' }],
    ['thôi đừng nói nữa', { type: 'stopSpeaking' }],
    ['ngừng nói', { type: 'stopSpeaking' }],
    ['đủ rồi', { type: 'stopSpeaking' }],
    ['Rồng ơi, dừng lại nhé!', { type: 'stopSpeaking' }],
    ['tắt đi', { type: 'stopSpeaking' }],
    ['dung lai', { type: 'stopSpeaking' }],
    ['stop', { type: 'stopSpeaking' }],
    ['be quiet', { type: 'stopSpeaking' }],
    // Không nhầm với lệnh khác.
    ['tạm dừng', { type: 'pause' }],
    ['dừng chuông', { type: 'stopAlarm' }],
    ['tắt chuông', { type: 'stopAlarm' }],
    ['stop the alarm', { type: 'stopAlarm' }],
    ['thôi xong rồi', { type: 'done' }],
  ])('understands "%s"', (text, command) => {
    expect(parseVoiceCommand(text, EVENING)).toEqual(command);
  });

  it.each([
    ['năm nay nấu canh', 'question'],
    ['nêm thêm muối rồi đun 5 phút có được không', 'question'],
    ['thêm 5 phút thì có bị nát không?', 'question'],
    ['nhắc lại bước này', 'repeat'],
    ['dừng nghe', 'pause'],
  ])('does not mistake "%s" for a timer command', (text, type) => {
    expect(parseVoiceCommand(text, EVENING).type).toBe(type);
  });

  it('turns clock times into seconds left on this device', () => {
    expect(parseVoiceCommand('báo mình lúc 7 giờ tối', EVENING)).toEqual({
      type: 'timer',
      seconds: 3600,
      clock: { seconds: 3600, hour: 19, minute: 0, tomorrow: false },
    });
    expect(parseVoiceCommand('lúc 19h30', EVENING)).toMatchObject({ type: 'timer', seconds: 5400 });
    expect(parseVoiceCommand('nhắc mình lúc 19:45 nấu cơm', EVENING)).toMatchObject({
      seconds: 6300,
      label: 'Nấu cơm',
    });
    // Đã qua 7 giờ sáng hôm nay: hiểu là 7 giờ sáng mai.
    expect(parseClockTime('lúc 7 giờ sáng', EVENING)).toEqual({
      seconds: 13 * 3600,
      hour: 7,
      minute: 0,
      tomorrow: true,
    });
    // Không nói buổi: chọn lần gần nhất sắp tới (6 giờ lúc 18:10 → 6 giờ sáng mai).
    const later = new Date(2026, 9, 23, 18, 10, 0);
    expect(parseClockTime('lúc 6 giờ', later)).toMatchObject({ hour: 6, tomorrow: true });
    expect(parseClockTime('at 7 pm', EVENING)).toMatchObject({ seconds: 3600, hour: 19 });
    expect(parseClockTime('lúc 7 giờ kém 15 tối', EVENING)).toMatchObject({ hour: 18, minute: 45 });
    expect(parseClockTime('hẹn 10 phút', EVENING)).toBeNull();
    expect(parseClockTime('nhắc mình lúc 10 phút nữa', EVENING)).toBeNull();
  });

  it('only stops on stop words and ignores its own voice while speaking', () => {
    expect(isStopSpeaking('thôi được rồi tiếp đi')).toBe(false);
    expect(isStopSpeaking('thôi im đi')).toBe(true);
    const speech = 'Bước 2: tạm dừng lửa rồi đảo đều tay cho thịt săn lại.';
    expect(isBargeInStop('bước 2 tạm dừng lửa rồi đảo', speech)).toBe(false);
    expect(isBargeInStop('đảo đều tay cho thịt dừng lại', speech)).toBe(true);
    expect(isBargeInStop('rồi đảo đều tay cho thịt săn', speech)).toBe(false);
    expect(isBargeInStop('stop', 'Okay, five more minutes.')).toBe(true);
  });

  it('picks the timer the user means', () => {
    const now = Date.now();
    const timer = (id: string, label: string, startedAt: number, dueAt = now + 600_000) => ({
      id,
      label,
      recipeSlug: 'canh-chua-ca',
      startedAt,
      dueAt,
    });
    const timers: CookTimer[] = [
      timer('egg', 'Luộc trứng', now - 2000),
      timer('bone', 'Hầm xương', now - 1000),
      timer('bone-2', 'Ninh xương gà', now - 3000),
    ];
    expect(pickTimer(timers, 'luộc trứng', now)).toEqual({ kind: 'one', timer: timers[0] });
    expect(pickTimer(timers, 'nồi xương', now)).toMatchObject({ kind: 'ambiguous' });
    expect(pickTimer(timers, 'ham xuong', now)).toEqual({ kind: 'one', timer: timers[1] });
    expect(pickTimer(timers, 'cơm', now)).toEqual({ kind: 'missing' });
    expect(pickTimer(timers, undefined, now)).toEqual({ kind: 'one', timer: timers[1] });
    expect(pickTimer(timers, undefined, now, 'ask')).toMatchObject({ kind: 'ambiguous' });
    expect(pickTimer([], undefined, now)).toEqual({ kind: 'none' });
    expect(roughDuration(725, 'vi')).toBe('12 phút');
    expect(roughDuration(65, 'vi')).toBe('1 phút 5 giây');
  });
});
