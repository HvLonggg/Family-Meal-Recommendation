/** Định dạng ngày thống nhất toàn app: `dd/MM/yyyy` và `HH:mm dd/MM/yyyy`. */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function toDate(value: Date | string | number): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    // Ngày không kèm giờ được hiểu theo giờ địa phương, tránh lệch một ngày.
    const match = DATE_ONLY.exec(value);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** `14/11/2026`; trả chuỗi rỗng khi giá trị không hợp lệ. */
export function formatDisplayDate(value: Date | string | number): string {
  const date = toDate(value);
  if (!date) return '';
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** `14/11`, dùng kèm thứ trong tuần (vd. "Thứ Bảy, 14/11"). */
export function formatDayMonth(value: Date | string | number): string {
  const date = toDate(value);
  if (!date) return '';
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

/** `21:38 14/11/2026`; trả chuỗi rỗng khi giá trị không hợp lệ. */
export function formatDisplayDateTime(value: Date | string | number): string {
  const date = toDate(value);
  if (!date) return '';
  return `${pad(date.getHours())}:${pad(date.getMinutes())} ${formatDisplayDate(date)}`;
}
