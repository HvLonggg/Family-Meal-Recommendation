/**
 * Buổi trong ngày theo giờ Việt Nam (Asia/Ho_Chi_Minh), không theo múi giờ của máy người dùng,
 * để lời gợi ý "trưa nay ăn gì" luôn đúng bữa. Mốc giờ trùng với máy chủ (engine.DAY_PARTS).
 */
export type DayPart = 'sang' | 'trua' | 'chieu' | 'toi' | 'khuya';

const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

/** Số phút tính từ 0h theo giờ Việt Nam. */
export function vietnamMinutes(now = new Date()) {
  const parts = TIME_FORMAT.formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  return Number.isFinite(hour) && Number.isFinite(minute)
    ? (hour % 24) * 60 + minute
    : now.getHours() * 60 + now.getMinutes();
}

export function vietnamHour(now = new Date()) {
  return Math.floor(vietnamMinutes(now) / 60);
}

/** Người Việt ăn trưa khoảng 11h-12h30 nên "trưa" bắt đầu từ 10h30. */
export function dayPart(now = new Date()): DayPart {
  const minute = vietnamMinutes(now);
  if (minute >= 5 * 60 && minute < 10 * 60 + 30) return 'sang';
  if (minute >= 10 * 60 + 30 && minute < 14 * 60) return 'trua';
  if (minute >= 14 * 60 && minute < 17 * 60) return 'chieu';
  if (minute >= 17 * 60 && minute < 21 * 60) return 'toi';
  return 'khuya';
}

/** Lời chào và câu hỏi nhanh đầu tiên theo buổi. */
export const dayPartPrompts: Record<DayPart, { greeting: string; starter: string }> = {
  sang: { greeting: 'Chào buổi sáng! Bữa sáng nay ăn gì nhỉ?', starter: 'Sáng nay ăn gì?' },
  trua: { greeting: 'Trưa rồi! Hôm nay ăn trưa món gì đây?', starter: 'Trưa nay ăn gì?' },
  chieu: {
    greeting: 'Chào buổi chiều! Tối nay nấu gì để còn kịp đi chợ?',
    starter: 'Tối nay nên nấu gì?',
  },
  toi: { greeting: 'Chào bạn! Bữa tối nay bạn ăn gì?', starter: 'Tối nay ăn gì?' },
  khuya: {
    greeting: 'Khuya rồi! Đói bụng thì làm món gì nhẹ nhé?',
    starter: 'Ăn khuya món gì nhẹ?',
  },
};
