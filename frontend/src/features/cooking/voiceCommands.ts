import {
  foldVietnamese,
  wordsToDigits,
  isAsciiText,
  parseClockTime,
  parseSpokenDuration,
  stripDurations,
  type ClockTarget,
} from '@/features/cooking/durations';

export type TimerSpec = { seconds: number; label?: string };
export type AdjustMode = 'add' | 'subtract' | 'set';

/** Hiểu câu người dùng nói khi đang nấu: "xong rồi", "chưa xong", "nhắc tôi sau 10 phút"… */
export type VoiceCommand =
  /** Đặt một chuông; `seconds` null = dùng thời lượng ghi trong bước. `clock`: hẹn theo giờ. */
  | { type: 'timer'; seconds: number | null; label?: string; clock?: ClockTarget }
  /** Nhiều chuông trong một câu: "hẹn 10 phút luộc trứng và 25 phút hầm xương". */
  | { type: 'timers'; timers: TimerSpec[] }
  /** Chỉnh chuông đang chạy: thêm/bớt `seconds`, hoặc đổi thời gian còn lại thành `seconds`. */
  | { type: 'adjustTimer'; mode: AdjustMode; seconds: number; target?: string }
  | { type: 'cancelTimer'; all: boolean; target?: string }
  | { type: 'stopAlarm' }
  | { type: 'timerStatus'; target?: string }
  /** "Dừng đi", "im đi", "stop": rồng im ngay (chuông đang kêu thì tắt chuông). */
  | { type: 'stopSpeaking' }
  | { type: 'done' }
  | { type: 'notDone' }
  | { type: 'repeat' }
  | { type: 'back' }
  | { type: 'ingredients' }
  | { type: 'pause' }
  | { type: 'exit' }
  | { type: 'question'; text: string }
  | { type: 'unknown' };

const PHRASES = {
  // Chắc chắn là hẹn giờ, kể cả khi chưa nói thời lượng ("hẹn giờ cho bước này").
  timer: [
    'hẹn',
    'hẹn giờ',
    'đặt giờ',
    'bấm giờ',
    'báo thức',
    'đặt chuông',
    'hẹn chuông',
    'đếm ngược',
    'canh giờ',
    'canh giùm',
    'canh giúp',
    'canh hộ',
    'canh dùm',
    'nhắc tôi',
    'nhắc mình',
    'nhắc em',
    'nhắc anh',
    'nhắc chị',
    'nhắc nhé',
    'nhắc giúp',
    'gọi tôi',
    'gọi mình',
    'báo tôi',
    'báo mình',
    'báo em',
    'báo giúp',
    'timer',
    'remind me',
    'alarm',
    'countdown',
    'count down',
  ],
  // Chỉ là hẹn giờ khi có kèm thời lượng hoặc mốc giờ ("để 20 phút hầm xương").
  timerWeak: ['nhắc', 'báo', 'gọi', 'canh', 'để', 'đặt', 'set', 'call me', 'tell me', 'ping me'],
  stopAlarm: [
    'tắt chuông',
    'tắt báo thức',
    'dừng chuông',
    'tắt chuông đi',
    'stop alarm',
    'stop the alarm',
  ],
  timerStatus: [
    'còn bao lâu',
    'còn mấy phút',
    'còn bao nhiêu phút',
    'còn bao nhiêu thời gian',
    'mấy phút nữa',
    'how long left',
    'how much time',
    'time left',
  ],
  exit: ['thoát', 'kết thúc nấu', 'thoát chế độ', 'ra ngoài', 'exit', 'quit cooking'],
  pause: [
    'tạm dừng',
    'dừng nghe',
    'đừng nghe',
    'im lặng',
    'tắt mic',
    'tắt giọng',
    'stop listening',
    'pause',
  ],
  back: ['quay lại', 'bước trước', 'lùi lại', 'trở lại', 'go back', 'previous', 'back'],
  repeat: [
    'đọc lại',
    'nhắc lại',
    'lặp lại',
    'nói lại',
    'đọc lại đi',
    'gì cơ',
    'sao cơ',
    'hả',
    'nghe không rõ',
    'repeat',
    'say again',
    'say that again',
    'pardon',
    'what',
  ],
  ingredients: [
    'nguyên liệu',
    'cần những gì',
    'cần gì',
    'thành phần',
    'ingredients',
    'what do i need',
  ],
  notDone: [
    'chưa xong',
    'chưa được',
    'chưa làm xong',
    'chưa kịp',
    'chưa đâu',
    'đợi chút',
    'đợi tí',
    'đợi đã',
    'chờ chút',
    'chờ tí',
    'chờ đã',
    'từ từ',
    'khoan',
    'not yet',
    'not done',
    'wait',
    'hold on',
    'one moment',
  ],
  done: [
    'xong rồi',
    'xong',
    'làm xong',
    'rồi',
    'được rồi',
    'ok',
    'oke',
    'okay',
    'tiếp',
    'tiếp đi',
    'tiếp theo',
    'bước tiếp',
    'bước tiếp theo',
    'làm tiếp',
    'sang bước',
    'chuyển bước',
    'done',
    'finished',
    'next',
    'next step',
    'ready',
  ],
};

// Trả lời một từ khi được hỏi "xong chưa?".
const BARE_NOT_DONE = new Set(['chưa', 'không', 'no', 'nope']);
const QUESTION_CUES = [
  'sao',
  'thế nào',
  'như nào',
  'làm sao',
  'bao nhiêu',
  'có được không',
  'được không',
  'có nên',
  'nên',
  'tại sao',
  'vì sao',
  'là gì',
  'gì',
  'nếu',
  'thay bằng',
  'thay thế',
  'bị',
  'how',
  'what',
  'why',
  'can i',
  'should',
  'instead',
];

// "Nguyên liệu này thay bằng gì?" là câu hỏi, không phải yêu cầu đọc danh sách.
const SUBSTITUTE = [
  'thay',
  'thay bằng',
  'thay thế',
  'bị',
  'hết',
  'không có',
  'instead',
  'substitute',
];

const STRONG_DONE = [
  'xong rồi',
  'làm xong',
  'đã xong',
  'xong bước',
  'xong phần',
  'xong hết',
  'i m done',
  'all done',
  'finished it',
];

// --- Dừng nói ------------------------------------------------------------------------------
// Cả câu (sau khi bỏ lời gọi và tiểu từ) phải là lệnh dừng: "thôi xong rồi" không phải lệnh dừng.
const STOP_SPEAKING = new Set([
  'dừng',
  'thôi',
  'im',
  'nín',
  'ngừng',
  'ngừng nói',
  'đừng nói',
  'thôi đừng nói',
  'thôi im',
  'thôi dừng',
  'thôi ngừng nói',
  'đủ rồi',
  'thôi đủ rồi',
  'tắt',
  'stop',
  'stop it',
  'stop talking',
  'be quiet',
  'quiet',
  'shush',
  'shut up',
  'enough',
  'that s enough',
]);
const STOP_LEAD = new Set(['ê', 'này', 'ơi', 'rồng', 'chú', 'bạn', 'ok', 'okay', 'hey', 'please']);
const STOP_TAIL = new Set([
  'đi',
  'lại',
  'nữa',
  'nha',
  'nhé',
  'nhe',
  'nhá',
  'ạ',
  'nào',
  'mà',
  'ngay',
  'please',
  'now',
  'giùm',
  'giúp',
  'bạn',
  'rồng',
  'ơi',
]);
// Ngắt lời khi rồng đang nói: chỉ nhận vài từ khóa dừng ở cuối câu nghe được.
const BARGE_IN = [
  'dừng',
  'dừng lại',
  'dừng đi',
  'im đi',
  'ngừng nói',
  'ngừng lại',
  'đừng nói nữa',
  'thôi',
  'đủ rồi',
  'tắt đi',
  'stop',
  'be quiet',
  'shut up',
];

// --- Hẹn giờ: hủy, chỉnh, nhãn ---------------------------------------------------------------
const CANCEL_VERBS = [
  'hủy',
  'huỷ',
  'bỏ',
  'xóa',
  'xoá',
  'dẹp',
  'tắt',
  'dừng',
  'cancel',
  'delete',
  'remove',
  'clear',
  'stop',
];
const TIMER_NOUNS = [
  'hẹn giờ',
  'chuông',
  'đồng hồ',
  'báo thức',
  'timer',
  'timers',
  'alarm',
  'alarms',
  'countdown',
];
const ALL_WORDS = ['hết', 'tất cả', 'toàn bộ', 'mọi', 'các', 'all', 'every', 'everything'];
const NEW_TIMER = [
  'chuông mới',
  'một chuông',
  'cái chuông',
  'thêm chuông',
  'thêm một chuông',
  'another timer',
  'new timer',
  'second timer',
];
const ADJUST_WORDS: Record<AdjustMode, string[]> = {
  subtract: [
    'bớt',
    'giảm',
    'trừ',
    'trừ đi',
    'rút ngắn',
    'less',
    'fewer',
    'take off',
    'minus',
    'subtract',
  ],
  set: [],
  add: ['thêm', 'cộng', 'cộng thêm', 'gia hạn', 'add', 'more', 'extra', 'another', 'plus'],
};
const SET_PATTERN =
  /(^|\s)(đổi|chỉnh|sửa|đặt lại|change|make|reset)(\s+\S+){0,3}?\s+(thành|còn|to|it)(\s|$)/u;
const SET_PATTERN_ASCII =
  /(^|\s)(doi|chinh|sua|dat lai|change|make|reset)(\s+\S+){0,3}?\s+(thanh|con|to|it)(\s|$)/u;

// Từ đệm/từ lệnh bỏ đi khi lấy nhãn chuông ("15 phút nữa nhắc mình tắt bếp" → "tắt bếp").
const LABEL_PHRASES = [
  'hẹn giờ',
  'đặt giờ',
  'bấm giờ',
  'báo thức',
  'đặt chuông',
  'hẹn chuông',
  'đếm ngược',
  'đồng hồ',
  'canh giờ',
  'canh giùm',
  'canh giúp',
  'canh hộ',
  'canh dùm',
  'làm ơn',
  'set a timer',
  'remind me',
  'call me',
  'tell me',
  'ping me',
  'count down',
];
const LABEL_DROP = [
  'hẹn',
  'giờ',
  'đặt',
  'bấm',
  'báo',
  'thức',
  'nhắc',
  'gọi',
  'để',
  'cho',
  'giùm',
  'giúp',
  'hộ',
  'dùm',
  'mình',
  'tôi',
  'tui',
  'tớ',
  'em',
  'anh',
  'chị',
  'bạn',
  'nhé',
  'nha',
  'nhá',
  'nhe',
  'nhen',
  'đi',
  'ạ',
  'à',
  'nữa',
  'sau',
  'trong',
  'khoảng',
  'tầm',
  'chừng',
  'lúc',
  'vào',
  'với',
  'ơi',
  'rồng',
  'chú',
  'hãy',
  'được',
  'cái',
  'chuông',
  'phút',
  'giây',
  'tiếng',
  'rưỡi',
  'nửa',
  'khi',
  'là',
  'thì',
  'xong',
  'đang',
  'một',
  'mới',
  'nhắc',
  'the',
  'a',
  'an',
  'for',
  'in',
  // Không bỏ 'me' đơn lẻ: tiếng Việt là quả me ("remind me" đã bị bỏ theo cụm ở trên).
  'set',
  'timer',
  'remind',
  'alarm',
  'please',
  'to',
  'of',
  'my',
  'countdown',
  'start',
  'minutes',
  'minute',
  'hours',
  'hour',
  'seconds',
  'second',
  'mins',
  'min',
  'when',
  'it',
  'is',
  'ok',
  'okay',
];
const TARGET_DROP = [
  'thêm',
  'cộng',
  'bớt',
  'giảm',
  'trừ',
  'rút',
  'ngắn',
  'đổi',
  'chỉnh',
  'sửa',
  'thành',
  'còn',
  'lại',
  'hủy',
  'huỷ',
  'bỏ',
  'xóa',
  'xoá',
  'dẹp',
  'tắt',
  'dừng',
  'hết',
  'tất',
  'cả',
  'toàn',
  'bộ',
  'các',
  'mọi',
  'bao',
  'lâu',
  'mấy',
  'nhiêu',
  'thời',
  'gian',
  'của',
  'rồi',
  'gia',
  'hạn',
  'cancel',
  'delete',
  'remove',
  'clear',
  'stop',
  'add',
  'more',
  'less',
  'fewer',
  'change',
  'make',
  'take',
  'off',
  'how',
  'long',
  'left',
  'much',
  'time',
  'there',
  'all',
  'every',
  'extra',
  'another',
  'plus',
  'minus',
  'timers',
  'alarms',
  'reset',
];
const STEP_ONLY = new Set(['bước này', 'bước', 'cho bước này', 'this step', 'step']);

export function normalizeSpeech(text: string) {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Câu gõ không dấu ("hen 10p", "dung lai") so với cụm từ đã bỏ dấu.
function has(text: string, phrases: string[]) {
  const padded = ` ${text} `;
  const ascii = isAsciiText(text);
  return phrases.some(
    (phrase) =>
      padded.includes(` ${phrase} `) || (ascii && padded.includes(` ${foldVietnamese(phrase)} `)),
  );
}

function inSet(value: string, set: Set<string>, ascii: boolean) {
  if (set.has(value)) return true;
  if (!ascii) return false;
  for (const item of set) if (foldVietnamese(item) === value) return true;
  return false;
}

/** "Dừng đi", "thôi đừng nói nữa", "rồng ơi im đi nha", "stop", "be quiet"… */
export function isStopSpeaking(raw: string) {
  const text = normalizeSpeech(raw);
  const ascii = isAsciiText(text);
  const words = text.split(' ');
  while (words.length > 1 && inSet(words[0]!, STOP_LEAD, ascii)) words.shift();
  while (words.length > 1 && inSet(words.at(-1)!, STOP_TAIL, ascii)) words.pop();
  return words.length <= 4 && inSet(words.join(' '), STOP_SPEAKING, ascii);
}

/**
 * Ngắt lời khi rồng đang nói: micro nghe cả tiếng rồng, nên chỉ nhận từ khóa dừng nằm ở cuối
 * câu nghe được VÀ không có trong câu rồng đang đọc (tránh tự nghe tiếng mình mà dừng).
 */
export function isBargeInStop(heard: string, speaking: string) {
  const tail = ` ${normalizeSpeech(heard).split(' ').slice(-4).join(' ')} `;
  const said = ` ${normalizeSpeech(speaking)} `;
  return BARGE_IN.some((phrase) => tail.includes(` ${phrase} `) && !said.includes(` ${phrase} `));
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Phần còn lại của câu sau khi bỏ thời lượng, mốc giờ và từ lệnh/từ đệm. */
function remainder(segment: string, drop: string[]) {
  let text = ` ${stripDurations(segment)} `;
  const ascii = isAsciiText(text);
  const fold = (value: string) => (ascii ? foldVietnamese(value) : value);
  for (const phrase of [...LABEL_PHRASES, ...TIMER_NOUNS].sort((a, b) => b.length - a.length)) {
    text = text.replaceAll(` ${fold(phrase)} `, ' ');
  }
  text = text.replace(/^\s*canh\s/u, ' ');
  const dropped = new Set(drop.map(fold));
  return text
    .split(' ')
    .filter((word) => /\p{L}/u.test(word) && !dropped.has(word))
    .join(' ');
}

/** Nhãn chuông lấy từ câu nói ("để 20 phút hầm xương" → "Hầm xương"); không có thì undefined. */
export function timerLabel(segment: string) {
  const label = remainder(segment, LABEL_DROP);
  if (!label || label.split(' ').length > 6 || STEP_ONLY.has(label)) return undefined;
  return capitalize(label);
}

/** Tên chuông người dùng nhắc tới ("thêm 5 phút cho nồi xương" → "nồi xương"). */
function timerTarget(text: string) {
  const target = remainder(text, [...LABEL_DROP, ...TARGET_DROP]);
  return target && target.split(' ').length <= 6 ? target : undefined;
}

// Từ "thêm/bớt" phải đứng sát con số ("thêm 5 phút", "5 more minutes"), để "nêm thêm muối rồi
// đun 5 phút" không bị hiểu là chỉnh chuông.
function nearNumber(text: string, phrases: string[]) {
  const ascii = isAsciiText(text);
  const tokens = wordsToDigits(text).split(' ');
  const numbers = tokens.flatMap((token, index) => (/^\d/.test(token) ? [index] : []));
  return phrases.some((phrase) => {
    const parts = (ascii ? foldVietnamese(phrase) : phrase).split(' ');
    return tokens.some(
      (_, index) =>
        parts.every((part, offset) => tokens[index + offset] === part) &&
        numbers.some((at) => at - (index + parts.length - 1) <= 3 && index - at <= 2),
    );
  });
}

function adjustMode(text: string): AdjustMode | null {
  const ascii = isAsciiText(text);
  if (nearNumber(text, ADJUST_WORDS.subtract)) return 'subtract';
  if ((ascii ? SET_PATTERN_ASCII : SET_PATTERN).test(text)) return 'set';
  if (nearNumber(text, ADJUST_WORDS.add)) return 'add';
  return null;
}

function cancelCommand(text: string, seconds: number | null): VoiceCommand | null {
  if (!has(text, CANCEL_VERBS) || !has(text, TIMER_NOUNS)) return null;
  // "Bỏ cá vào rồi hẹn giờ 10 phút" là đặt chuông; chỉ "hủy/xóa" mới chắc là hủy.
  if (seconds && !has(text, ['hủy', 'huỷ', 'xóa', 'xoá', 'cancel', 'delete', 'remove']))
    return null;
  const all = has(text, ALL_WORDS);
  const target = all ? undefined : timerTarget(text);
  // "Tắt chuông" (không nêu chuông nào) là tắt chuông đang kêu.
  if (!all && !target && has(text, ['tắt', 'dừng', 'stop']) && !has(text, ['hẹn giờ', 'timer'])) {
    return { type: 'stopAlarm' };
  }
  return target ? { type: 'cancelTimer', all, target } : { type: 'cancelTimer', all };
}

function timerCommand(raw: string, text: string, now: Date): VoiceCommand | null {
  const seconds = parseSpokenDuration(raw);
  const clock = seconds ? null : parseClockTime(raw, now);
  // Chỉ nói thời lượng/mốc giờ ("15 phút", "1 tiếng 15", "lúc 19h30") cũng là hẹn giờ.
  const bare =
    (seconds !== null || clock !== null) &&
    !remainder(raw, LABEL_DROP) &&
    !has(text, ['nữa', 'more', 'extra', 'another']);
  const strong = has(text, PHRASES.timer);
  if (!strong && !bare && !((seconds || clock) && has(text, PHRASES.timerWeak))) return null;
  if (clock) {
    const label = timerLabel(raw);
    return label
      ? { type: 'timer', seconds: clock.seconds, clock, label }
      : { type: 'timer', seconds: clock.seconds, clock };
  }
  // Nhiều chuông: "hẹn 10 phút luộc trứng và 25 phút hầm xương".
  const timed = normalizeSpeech(raw.replace(/[,;]/g, ' và '))
    .split(/\s(?:và|với|and|va|voi)\s/u)
    .flatMap<TimerSpec>((part) => {
      const partSeconds = parseSpokenDuration(part);
      const label = timerLabel(part);
      if (partSeconds === null) return [];
      return label ? [{ seconds: partSeconds, label }] : [{ seconds: partSeconds }];
    });
  if (timed.length >= 2 && timed.some((part) => part.label))
    return { type: 'timers', timers: timed };
  const label = seconds !== null ? timerLabel(raw) : undefined;
  return label ? { type: 'timer', seconds, label } : { type: 'timer', seconds };
}

export function parseVoiceCommand(raw: string, now: Date = new Date()): VoiceCommand {
  const text = normalizeSpeech(raw);
  if (!text) return { type: 'unknown' };
  const words = text.split(' ');

  if (isStopSpeaking(text)) return { type: 'stopSpeaking' };
  const seconds = parseSpokenDuration(raw);
  const cancel = cancelCommand(text, seconds);
  if (cancel) return cancel;
  if (has(text, PHRASES.stopAlarm)) return { type: 'stopAlarm' };

  const asksQuestion = raw.includes('?') || (words.length >= 3 && has(text, QUESTION_CUES));
  // "thêm 5 phút cho nồi xương", "bớt 3 phút", "đổi thành 20 phút": chỉnh chuông đang chạy.
  const mode = seconds && !asksQuestion && !has(text, NEW_TIMER) ? adjustMode(text) : null;
  if (mode && seconds) {
    const target = timerTarget(raw);
    return target
      ? { type: 'adjustTimer', mode, seconds, target }
      : { type: 'adjustTimer', mode, seconds };
  }
  const timer = timerCommand(raw, text, now);
  if (timer) return timer;
  // "5 phút nữa": hoãn chuông đang kêu, hoặc chờ thêm.
  if (seconds && !asksQuestion && has(text, ['nữa', 'more', 'extra'])) {
    return { type: 'adjustTimer', mode: 'add', seconds };
  }
  if (has(text, PHRASES.timerStatus)) {
    const target = timerTarget(text);
    return target ? { type: 'timerStatus', target } : { type: 'timerStatus' };
  }
  if (has(text, PHRASES.exit)) return { type: 'exit' };
  if (has(text, PHRASES.pause)) return { type: 'pause' };
  if (has(text, PHRASES.back)) return { type: 'back' };

  if (has(text, PHRASES.notDone) || (words.length <= 2 && BARE_NOT_DONE.has(words[0]!))) {
    return { type: 'notDone' };
  }
  if (!asksQuestion && words.length <= 12 && has(text, PHRASES.repeat)) return { type: 'repeat' };
  if (words.length <= 12 && has(text, PHRASES.ingredients) && !has(text, SUBSTITUTE)) {
    return { type: 'ingredients' };
  }
  if (!asksQuestion && words.length <= 6 && has(text, PHRASES.done)) return { type: 'done' };
  // Câu dài, tự nhiên nhưng rõ là đã xong ("mình làm xong cái bước này rồi đó").
  if (!asksQuestion && words.length <= 14 && has(text, STRONG_DONE)) return { type: 'done' };
  if (asksQuestion || words.length >= 4) return { type: 'question', text: raw.trim() };
  return { type: 'unknown' };
}
