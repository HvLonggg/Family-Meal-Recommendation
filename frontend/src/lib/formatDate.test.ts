import { describe, expect, it } from 'vitest';

import { formatDisplayDate, formatDisplayDateTime } from './formatDate';

describe('formatDate', () => {
  it('định dạng ngày dd/MM/yyyy', () => {
    expect(formatDisplayDate(new Date(2026, 10, 4, 9, 5))).toBe('04/11/2026');
    expect(formatDisplayDate('2026-11-14')).toBe('14/11/2026');
  });

  it('định dạng giờ HH:mm dd/MM/yyyy', () => {
    expect(formatDisplayDateTime(new Date(2026, 10, 14, 21, 8))).toBe('21:08 14/11/2026');
  });

  it('trả chuỗi rỗng khi giá trị không hợp lệ', () => {
    expect(formatDisplayDate('không phải ngày')).toBe('');
    expect(formatDisplayDateTime('')).toBe('');
  });
});
