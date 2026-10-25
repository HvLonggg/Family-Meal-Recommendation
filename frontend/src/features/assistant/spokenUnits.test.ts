import { describe, expect, it } from 'vitest';

import { spokenUnits, toSpokenLang } from '@/features/assistant/spokenUnits';
import { speakableText } from '@/features/assistant/useSpeech';

describe('spokenUnits (vi)', () => {
  it.each([
    ['Thêm 250g thịt bò', 'Thêm 250 gam thịt bò'],
    ['250 g đường', '250 gam đường'],
    ['100gr tôm, 50 gram mỡ', '100 gam tôm, 50 gam mỡ'],
    ['1kg xương, 2 KG gạo', '1 ki lô gam xương, 2 ki lô gam gạo'],
    ['5mg muối', '5 mi li gam muối'],
    ['200ml nước, 30 mL dầu', '200 mi li lít nước, 30 mi li lít dầu'],
    ['2l nước dùng, 1,5 L sữa', '2 lít nước dùng, 1 phẩy 5 lít sữa'],
    ['Cắt khúc 5cm, dày 3 mm', 'Cắt khúc 5 xen ti mét, dày 3 mi li mét'],
    ['Nướng 180°C, chiên ở 170 ºC', 'Nướng 180 độ C, chiên ở 170 độ C'],
    ['Lò 350°F', 'Lò 350 độ F'],
    ['Đun tới 90°', 'Đun tới 90 độ'],
    ['Giảm 30% đường', 'Giảm 30 phần trăm đường'],
    ['Hầm 2h cho mềm', 'Hầm 2 giờ cho mềm'],
    ['Ninh 1h30 rồi tắt bếp', 'Ninh 1 giờ 30 rồi tắt bếp'],
    ['Ướp 1h30p', 'Ướp 1 giờ 30 phút'],
    ['Luộc 15p, chần 5 ph', 'Luộc 15 phút, chần 5 phút'],
    ['2 tbsp nước mắm, 1 tsp tiêu', '2 muỗng canh nước mắm, 1 muỗng cà phê tiêu'],
    ['1 mc nước mắm, 2mcf đường', '1 muỗng canh nước mắm, 2 muỗng cà phê đường'],
    ['1 m.c dầu hào', '1 muỗng canh dầu hào'],
    ['Thêm 1 thìa cf hạt nêm', 'Thêm 1 thìa cà phê hạt nêm'],
  ])('đọc đơn vị: %s', (input, expected) => {
    expect(spokenUnits(input)).toBe(expected);
  });

  it.each([
    ['Luộc 8-10 phút', 'Luộc 8 đến 10 phút'],
    ['Thêm 8–10g muối', 'Thêm 8 đến 10 gam muối'],
    ['Cho 2 - 3 muỗng đường', 'Cho 2 đến 3 muỗng đường'],
    ['Hấp 1,5-2kg cá', 'Hấp 1 phẩy 5 đến 2 ki lô gam cá'],
    ['Cho ~5g muối', 'Cho khoảng 5 gam muối'],
    ['Nhân đôi x2 khẩu phần', 'Nhân đôi nhân 2 khẩu phần'],
    ['Khuôn 20x30cm', 'Khuôn 20 nhân 30 xen ti mét'],
    ['2 + 3 muỗng', '2 cộng 3 muỗng'],
  ])('đọc khoảng và ký hiệu: %s', (input, expected) => {
    expect(spokenUnits(input)).toBe(expected);
  });

  it.each([
    ['Thêm 1/2 muỗng đường', 'Thêm nửa muỗng đường'],
    ['1/2kg thịt', 'nửa ki lô gam thịt'],
    ['Dùng 1/3 chén nước', 'Dùng một phần ba chén nước'],
    ['Còn 3/4 lượng', 'Còn ba phần tư lượng'],
    ['Chỉ lấy 1/2.', 'Chỉ lấy một phần hai.'],
    ['1 1/2 muỗng canh', '1 rưỡi muỗng canh'],
    ['2 1/4 chén bột', '2 và một phần tư chén bột'],
    ['1,5kg sườn', '1 phẩy 5 ki lô gam sườn'],
    ['1.5kg sườn', '1 phẩy 5 ki lô gam sườn'],
    ['Giá 100.000 đồng', 'Giá 100000 đồng'],
  ])('đọc phân số và số thập phân: %s', (input, expected) => {
    expect(spokenUnits(input)).toBe(expected);
  });

  it.each([
    'Cho 2 gói gia vị, 1 lá chanh, 3 lát gừng',
    'Thêm 2 gà, 1 lần nữa, 3 hành, 4 phần',
    'Đặt lịch ngày 22-10-2026 lúc 10:30',
    'Hẹn ngày 1/5 nhé',
    'Gọi 0912 345 678 hoặc 0912-345-678',
    'Xem https://bepviet.vn/cong-thuc/1/2-pho-bo nhé',
    'Mở cửa 24/7, giảm 22/10',
    'Bước 1. Rửa sạch',
    'Ngày 2026-10-22 mình nấu phở',
  ])('giữ nguyên văn bản thường: %s', (input) => {
    expect(spokenUnits(input)).toBe(input);
  });

  it('idempotent', () => {
    const samples = [
      'Thêm 250g thịt, 1/2 muỗng đường, 1 1/2 chén nước, 1,5kg xương, ~5g muối',
      'Nướng 180°C trong 8-10 phút, giảm 30%, hầm 1h30p, khuôn 20x30cm, x2 khẩu phần',
      '2 tbsp nước mắm, 1 mcf tiêu, 100.000 đồng, 3/4 lượng',
    ];
    for (const sample of samples) {
      const once = spokenUnits(sample);
      expect(spokenUnits(once)).toBe(once);
    }
  });
});

describe('spokenUnits (en)', () => {
  it.each([
    ['Add 250g pork', 'Add 250 grams pork'],
    ['Add 1 g salt', 'Add 1 gram salt'],
    ['2kg bones, 1 kg rice', '2 kilograms bones, 1 kilogram rice'],
    ['500ml water and 1 l stock', '500 milliliters water and 1 liter stock'],
    ['2 tbsp fish sauce, 1 tsp pepper', '2 tablespoons fish sauce, 1 teaspoon pepper'],
    ['1/2 tsp sugar', 'one half teaspoon sugar'],
    ['1 1/2 tbsp oil', '1 and a half tablespoons oil'],
    ['3/4 cup milk', 'three quarters cup milk'],
    ['Bake at 180°C', 'Bake at 180 degrees Celsius'],
    ['Cut sugar by 30%', 'Cut sugar by 30 percent'],
    ['Simmer 8-10 minutes', 'Simmer 8 to 10 minutes'],
    ['Simmer 2h, rest 15 min', 'Simmer 2 hours, rest 15 minutes'],
    ['About ~5g, x2 servings, 2 + 3', 'About about 5 grams, times 2 servings, 2 plus 3'],
  ])('reads %s', (input, expected) => {
    expect(spokenUnits(input, 'en')).toBe(expected);
  });

  it('keeps plain words and is idempotent', () => {
    expect(spokenUnits('Add 2 large eggs and 1 lemon', 'en')).toBe('Add 2 large eggs and 1 lemon');
    const once = spokenUnits('Add 250g pork, 1 1/2 tbsp oil, 180°C, 8-10 minutes', 'en');
    expect(spokenUnits(once, 'en')).toBe(once);
  });
});

describe('speakableText', () => {
  it('bỏ markdown rồi đọc đơn vị theo ngôn ngữ', () => {
    expect(speakableText('**Thịt bò** 250g 🥩\n- 1/2 muỗng muối')).toBe(
      'Thịt bò 250 gam nửa muỗng muối',
    );
    expect(speakableText('- 250g beef', 'en-US')).toBe('250 grams beef');
  });

  it('nhận mã ngôn ngữ dạng vi-VN / en-US', () => {
    expect(toSpokenLang('vi-VN')).toBe('vi');
    expect(toSpokenLang('en-US')).toBe('en');
    expect(toSpokenLang(undefined)).toBe('vi');
  });
});
