type FormatNumber = (value: number, options?: Intl.NumberFormatOptions) => string;

const GRAM_UNITS = new Set(['g', 'gam', 'gram', 'grams']);
const MILLILITRE_UNITS = new Set(['ml', 'mililit', 'milliliter', 'milliliters']);

/**
 * Định lượng dễ đọc: ≥ 1000 g → kg, ≥ 1000 ml → lít; gam/ml từ 10 trở lên làm tròn số nguyên.
 * Dấu thập phân theo `formatNumber` của ngôn ngữ đang chọn (tiếng Việt: “1,2 kg”).
 */
export function formatIngredientQuantity(
  amount: number,
  unit: string,
  formatNumber: FormatNumber,
  language: 'vi' | 'en' = 'vi',
) {
  const normalizedUnit = unit.trim().toLocaleLowerCase('vi-VN');
  const isGram = GRAM_UNITS.has(normalizedUnit);
  const isMillilitre = MILLILITRE_UNITS.has(normalizedUnit);
  if ((isGram || isMillilitre) && amount >= 1000) {
    const largeUnit = isGram ? 'kg' : language === 'en' ? 'L' : 'lít';
    return `${formatNumber(amount / 1000, { maximumFractionDigits: 2 })} ${largeUnit}`;
  }
  if (isGram || isMillilitre) {
    const digits = amount >= 10 ? 0 : 1;
    return `${formatNumber(amount, { maximumFractionDigits: digits })} ${unit}`;
  }
  return `${formatNumber(amount, { maximumFractionDigits: 2 })} ${unit}`;
}

// Ghi chú sinh hàng loạt, lặp ở hàng trăm nguyên liệu và đã có hướng dẫn chung ở cuối danh sách.
const GENERIC_INGREDIENT_NOTES = new Set([
  'Nguyên liệu chính; cân phần dùng được trừ khi ghi nguyên vỏ/có xương.',
  'Gia vị; lượng khởi điểm, nếm sau khi nấu chín.',
  'Main ingredient; weigh the usable part unless stated as shell-on/bone-in.',
  'Seasoning; starting amount, taste once cooked.',
]);

export function isGenericIngredientNote(note: string | undefined) {
  return !note || GENERIC_INGREDIENT_NOTES.has(note.trim());
}

// Câu khẩu phần mặc định của bộ 300 món: khó hiểu và không nói gì riêng về món.
const GENERIC_SERVING_BASIS =
  /^\d+ (?:người lớn; món cùng cơm là phần dùng chung|adults; dishes eaten with rice are shared portions)/;

export function isGenericServingBasis(text: string | undefined) {
  return !text || GENERIC_SERVING_BASIS.test(text.trim());
}
