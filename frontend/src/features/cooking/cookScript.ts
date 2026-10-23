import type { Language } from '@/features/auth/types';
import type { CookStep } from '@/features/cooking/cookSession';
import { spokenDuration } from '@/features/cooking/durations';
import { toSpokenText } from '@/features/narration/recipeScript';

/** Lời của "người phụ bếp" đứng cạnh: đọc bước, chờ, nhắc giờ. */
export const CLOSING: Record<Language, string> = {
  vi: 'Bạn thực hiện đi, nếu xong hoặc gặp vướng mắc gì thì nói tôi nhé.',
  en: "Go ahead. When you're done or get stuck, just tell me.",
};

// Công đoạn chờ thụ động: có thể làm việc khác trong lúc chờ.
const PASSIVE =
  /hầm|ninh|ướp|ngâm|ủ|luộc|kho|hấp|nướng|simmer|marinate|soak|braise|stew|bake|steam/;

type StepContext = { dishName: string; servings: number; dishNumber: number; dishCount: number };

function spoken(text: string, language: Language) {
  return toSpokenText(text, language === 'vi' ? 'vi-VN' : 'en-US');
}

function end(text: string) {
  const trimmed = text.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function stepSpeech(step: CookStep, context: StepContext, language: Language) {
  const vi = language === 'vi';
  const parts: string[] = [];
  if (step.kind === 'ingredients') {
    const dish =
      context.dishCount > 1
        ? vi
          ? `Món thứ ${context.dishNumber} trên ${context.dishCount}: ${context.dishName}`
          : `Dish ${context.dishNumber} of ${context.dishCount}: ${context.dishName}`
        : vi
          ? `Mình cùng nấu ${context.dishName}`
          : `Let's cook ${context.dishName}`;
    parts.push(
      vi ? `${dish}, cho ${context.servings} người.` : `${dish}, for ${context.servings}.`,
    );
    parts.push(
      vi
        ? `Trước tiên, bạn chuẩn bị đủ nguyên liệu: ${(step.items ?? []).join('; ')}.`
        : `First, get your ingredients ready: ${(step.items ?? []).join('; ')}.`,
    );
  } else if (step.kind === 'finish') {
    parts.push(
      vi ? `Bước cuối của món ${context.dishName}.` : `Final check for ${context.dishName}.`,
    );
    if (step.text) parts.push(end(step.text));
    parts.push(
      vi
        ? 'Nếu món đã đạt như vậy, bạn nói "xong rồi" để mình ghi nhận là đã nấu nhé.'
        : 'If it looks like that, say "done" and I will log it as cooked.',
    );
    return spoken(parts.join(' '), language);
  } else {
    const group = step.kind === 'preparation' ? (vi ? 'Sơ chế' : 'Prep') : vi ? 'Nấu' : 'Cooking';
    parts.push(
      vi
        ? `${group}, bước ${step.number} trên ${step.groupSize}.`
        : `${group}, step ${step.number} of ${step.groupSize}.`,
    );
    parts.push(end(step.text));
    if (step.timerSeconds) {
      const duration = spokenDuration(step.timerSeconds, language);
      // Bước chờ lâu (hầm, ninh, ướp…): gợi ý tranh thủ làm bước kế tiếp trong lúc chờ.
      const long = step.timerSeconds >= 600 && PASSIVE.test(step.text.toLowerCase());
      parts.push(
        vi
          ? `Bước này cần khoảng ${duration}. Muốn mình canh giờ thì nói "hẹn giờ" nhé.`
          : `This takes about ${duration}. Say "set a timer" and I'll keep track.`,
      );
      if (long) {
        parts.push(
          vi
            ? 'Trong lúc chờ, bạn cứ làm bước kế tiếp, chuông kêu mình sẽ gọi.'
            : "While it waits, you can move on to the next step — I'll call you when the timer rings.",
        );
      }
    }
  }
  parts.push(CLOSING[language]);
  return spoken(parts.join(' '), language);
}

export const voiceLines = {
  vi: {
    waiting: (step: string) =>
      `Không sao, bạn cứ từ từ. Mình nhắc lại bước này: ${end(step)} Mình đang chờ, xong thì nói "xong rồi" nhé.`,
    unknown:
      'Mình chưa nghe rõ. Bạn nói "xong rồi" để sang bước tiếp, "chưa xong" để mình chờ, "đọc lại", hoặc "hẹn giờ 10 phút" nhé.',
    askDuration: 'Bạn muốn hẹn bao lâu? Ví dụ: hẹn giờ 10 phút.',
    timerSet: (duration: string, label: string, background: boolean) =>
      `Đã hẹn ${duration} cho ${label}, tính từ bây giờ. ${
        background
          ? 'Đến giờ mình sẽ đổ chuông, kể cả khi bạn khóa màn hình.'
          : 'Đến giờ mình sẽ đổ chuông, bạn nhớ để ứng dụng mở nhé.'
      } Trong lúc chờ, xong bước nào thì cứ nói mình.`,
    noTimers: 'Hiện chưa có chuông nào đang chạy.',
    remaining: (label: string, duration: string) => `${label}: còn ${duration}.`,
    ring: (label: string) =>
      `Reng reng! Hết giờ ${label} rồi. Bạn kiểm tra xem đã xong chưa? Nói "xong rồi" để tắt chuông, hoặc "chưa xong" để mình hẹn thêm 5 phút.`,
    alarmDone: (label: string) => `Đã tắt chuông ${label}. Mình tiếp tục ở bước hiện tại nhé.`,
    snoozed: (label: string, duration: string) =>
      `Được, mình hẹn thêm ${duration} cho ${label}. Đến giờ mình gọi lại.`,
    back: 'Quay lại bước trước nhé.',
    first: 'Đây là bước đầu tiên rồi.',
    paused: 'Mình tạm ngừng nghe. Cần mình thì bấm nút micro nhé.',
    logged: (name: string) => `Tuyệt vời! Mình đã ghi ${name} vào lịch sử món đã nấu.`,
    finished: (count: number, duration: string) =>
      `Hoàn thành ${count} món trong ${duration}. Chúc cả nhà ăn ngon miệng!`,
    thinking: 'Để mình xem nhé.',
    answerTail: 'Xong thì nói "xong rồi" để mình đọc bước tiếp nhé.',
    answerFailed: 'Mình chưa trả lời được câu này, bạn thử hỏi lại ngắn hơn nhé.',
    ingredients: (items: string[]) => `Nguyên liệu gồm: ${items.join('; ')}.`,
    noMic: 'Trình duyệt chưa cho dùng micro, bạn bấm nút để điều khiển nhé.',
    checkIn: 'Bạn làm tới đâu rồi? Xong thì nói "xong rồi", còn vướng gì cứ hỏi mình nhé.',
    noRinging: 'Không có chuông nào đang kêu.',
    adjusted: (mode: 'add' | 'subtract' | 'set', label: string, amount: string, left: string) =>
      mode === 'set'
        ? `Đã đổi ${label} thành ${left}.`
        : `Đã ${mode === 'add' ? 'thêm' : 'bớt'} ${amount} cho ${label}, còn ${left}.`,
    cantShorten: (label: string, left: string) =>
      `${label} chỉ còn ${left}, mình không bớt thêm được. Muốn hủy thì nói "hủy chuông" nhé.`,
    cancelled: (label: string) => `Đã hủy chuông ${label}.`,
    cancelledAll: (count: number) => `Đã hủy cả ${count} chuông.`,
    whichTimer: (labels: string) => `Bạn muốn mình làm với chuông nào: ${labels}?`,
    timerMissing: (target: string, labels: string) =>
      `Mình không thấy chuông nào tên ${target}. Đang có: ${labels}.`,
    timersSet: (items: string[]) => `Đã hẹn ${items.join(' và ')}. Đến giờ mình gọi bạn.`,
    timerItem: (duration: string, label: string) => `${duration} cho ${label}`,
    clockLabel: (time: string) => `Hẹn lúc ${time}`,
    timerAt: (time: string, left: string, tomorrow: boolean) =>
      tomorrow
        ? `Giờ đó hôm nay đã qua nên mình hẹn lúc ${time} ngày mai, còn ${left} nữa.`
        : `Đã hẹn lúc ${time}, còn ${left} nữa. Đến giờ mình đổ chuông.`,
  },
  en: {
    waiting: (step: string) =>
      `No rush. Here's this step again: ${end(step)} I'm waiting — say "done" when you're ready.`,
    unknown:
      'Sorry, I didn\'t catch that. Say "done" for the next step, "not yet" to wait, "repeat", or "set a timer for 10 minutes".',
    askDuration: 'How long should I set it for? For example: set a timer for 10 minutes.',
    timerSet: (duration: string, label: string, background: boolean) =>
      `Timer set for ${duration}: ${label}. ${
        background
          ? "I'll ring even if your screen is locked."
          : "I'll ring when it's time — keep the app open."
      } Tell me whenever you finish a step.`,
    noTimers: 'There are no timers running.',
    remaining: (label: string, duration: string) => `${label}: ${duration} left.`,
    ring: (label: string) =>
      `Ding ding! Time's up for ${label}. Is it ready? Say "done" to stop the alarm, or "not yet" for 5 more minutes.`,
    alarmDone: (label: string) => `Alarm for ${label} stopped. Let's carry on with this step.`,
    snoozed: (label: string, duration: string) =>
      `Okay, ${duration} more for ${label}. I'll call you again.`,
    back: 'Going back one step.',
    first: 'This is already the first step.',
    paused: "I've stopped listening. Tap the mic when you need me.",
    logged: (name: string) => `Great job! I've added ${name} to your cooking history.`,
    finished: (count: number, duration: string) =>
      `You cooked ${count} ${count === 1 ? 'dish' : 'dishes'} in ${duration}. Enjoy your meal!`,
    thinking: 'Let me check.',
    answerTail: 'Say "done" when you\'re ready for the next step.',
    answerFailed: "I couldn't answer that one — try asking a shorter question.",
    ingredients: (items: string[]) => `You'll need: ${items.join('; ')}.`,
    noMic: "The browser won't let me use the microphone — use the buttons instead.",
    checkIn: "How's it going? Say \"done\" when you're ready, or ask me if you're stuck.",
    noRinging: 'No alarm is ringing right now.',
    adjusted: (mode: 'add' | 'subtract' | 'set', label: string, amount: string, left: string) =>
      mode === 'set'
        ? `${label} is now set to ${left}.`
        : `${mode === 'add' ? 'Added' : 'Took off'} ${amount} ${mode === 'add' ? 'to' : 'from'} ${label}, ${left} left.`,
    cantShorten: (label: string, left: string) =>
      `${label} only has ${left} left, so I can't take off that much. Say "cancel the timer" to remove it.`,
    cancelled: (label: string) => `Timer ${label} cancelled.`,
    cancelledAll: (count: number) => `Cancelled all ${count} timers.`,
    whichTimer: (labels: string) => `Which timer do you mean: ${labels}?`,
    timerMissing: (target: string, labels: string) =>
      `I can't find a timer called ${target}. Running now: ${labels}.`,
    timersSet: (items: string[]) => `Timers set: ${items.join(' and ')}. I'll call you.`,
    timerItem: (duration: string, label: string) => `${duration} for ${label}`,
    clockLabel: (time: string) => `Reminder at ${time}`,
    timerAt: (time: string, left: string, tomorrow: boolean) =>
      tomorrow
        ? `That time has passed today, so I set it for ${time} tomorrow, ${left} from now.`
        : `Set for ${time}, ${left} from now. I'll ring when it's time.`,
  },
} satisfies Record<Language, Record<string, unknown>>;
