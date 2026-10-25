import { ingredientAmount, recipeMinutes, type Recipe } from '@/data/recipes';
import { spokenUnits, toSpokenLang } from '@/features/assistant/spokenUnits';
import type { Language } from '@/features/auth/types';
import { translate } from '@/features/i18n/translate';

/** Tạo lời thuyết minh và chọn giọng theo ngôn ngữ của từng đoạn. */
export type NarrationSection =
  'intro' | 'ingredients' | 'preparation' | 'cooking' | 'finished' | 'tips';

export type NarrationLang = 'vi-VN' | 'en-US';

export type NarrationSegment = {
  section: NarrationSection;
  /** Khóa `data-narration` của phần tử trên trang để tô sáng đoạn đang đọc. */
  anchor: string;
  text: string;
  lang: NarrationLang;
};

export const narrationSectionLabels: Record<NarrationSection, string> = {
  intro: 'Giới thiệu',
  ingredients: 'Nguyên liệu',
  preparation: 'Sơ chế',
  cooking: 'Thực hiện',
  finished: 'Thành phẩm',
  tips: 'Mẹo',
};

// Một số giọng đọc (nhất là giọng online của Chrome) tự dừng khi câu quá dài,
// nên tách đoạn dài thành các câu ngắn hơn ngưỡng này.
const MAX_CHUNK_LENGTH = 180;

const VIETNAMESE_LETTERS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

/** Đoạn có dấu tiếng Việt thì đọc bằng giọng Việt, còn lại theo ngôn ngữ giao diện. */
export function detectNarrationLang(text: string, language: Language): NarrationLang {
  return language === 'vi' || VIETNAMESE_LETTERS.test(text) ? 'vi-VN' : 'en-US';
}

/** Viết lại ký hiệu khó đọc (đơn vị, khoảng số, phân số, nhiệt độ) thành lời. */
export function toSpokenText(text: string, lang: NarrationLang = 'vi-VN') {
  return spokenUnits(text, toSpokenLang(lang)).replace(/\s+/g, ' ').trim();
}

function endSentence(text: string) {
  const trimmed = text.trim();
  return /[.!?…:]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Tách văn bản thành các câu ngắn, giữ nguyên dấu câu. */
export function splitIntoChunks(text: string, maxLength = MAX_CHUNK_LENGTH) {
  const sentences = text.match(/[^.!?…;]+[.!?…;]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > maxLength) {
      chunks.push(current.trim());
      current = '';
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  // Câu đơn vẫn quá dài: cắt tiếp theo dấu phẩy để giọng đọc không bị ngắt giữa chừng.
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxLength) return [chunk];
    const parts: string[] = [];
    let part = '';
    for (const clause of chunk.split(/(?<=,)\s*/)) {
      if (part && part.length + clause.length > maxLength) {
        parts.push(part.trim());
        part = '';
      }
      part += `${clause} `;
    }
    if (part.trim()) parts.push(part.trim());
    return parts;
  });
}

function spokenDuration(minutes: number, language: Language) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts =
    language === 'vi'
      ? [hours ? `${hours} giờ` : '', rest || !hours ? `${rest} phút` : '']
      : [
          hours ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : '',
          rest || !hours ? `${rest} ${rest === 1 ? 'minute' : 'minutes'}` : '',
        ];
  return parts.filter(Boolean).join(' ');
}

const scriptWords = {
  vi: {
    overview: (time: string, difficulty: string) =>
      `Tổng thời gian khoảng ${time}, độ khó ${difficulty.toLowerCase()}`,
    ingredientsFor: (servings: number) => `Nguyên liệu cho ${servings} người`,
    preparation: 'Phần sơ chế',
    cooking: 'Phần thực hiện',
    step: (index: number) => `Bước ${index}`,
    finished: 'Thành phẩm đạt chuẩn',
    tips: 'Mách nhỏ của bếp',
    serving: 'Cách dùng',
  },
  en: {
    overview: (time: string, difficulty: string) =>
      `Total time about ${time}, difficulty: ${difficulty.toLowerCase()}`,
    ingredientsFor: (servings: number) =>
      `Ingredients for ${servings} ${servings === 1 ? 'person' : 'people'}`,
    preparation: 'Preparation',
    cooking: 'Cooking',
    step: (index: number) => `Step ${index}`,
    finished: 'The finished dish',
    tips: 'Kitchen tips',
    serving: 'How to serve',
  },
};

export function buildRecipeScript(
  recipe: Recipe,
  servings: number,
  language: Language = 'vi',
): NarrationSegment[] {
  const words = scriptWords[language];
  const numberFormat = new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    maximumFractionDigits: 2,
  });
  const segments: NarrationSegment[] = [];
  const add = (section: NarrationSection, anchor: string, text: string) => {
    const lang = detectNarrationLang(text, language);
    for (const chunk of splitIntoChunks(toSpokenText(endSentence(text), lang))) {
      segments.push({ section, anchor, text: chunk, lang });
    }
  };

  add('intro', 'intro', recipe.name);
  if (recipe.excerpt) add('intro', 'intro', recipe.excerpt);
  add(
    'intro',
    'intro',
    words.overview(
      spokenDuration(recipeMinutes(recipe), language),
      translate(language, recipe.difficulty),
    ),
  );

  add('ingredients', 'ingredients', words.ingredientsFor(servings));
  for (const group of recipe.ingredients) {
    if (recipe.ingredients.length > 1) add('ingredients', 'ingredients', group.group);
    for (const item of group.items) {
      const amount = ingredientAmount(item, recipe, servings);
      const quantity = amount == null ? item.unit : `${numberFormat.format(amount)} ${item.unit}`;
      add(
        'ingredients',
        'ingredients',
        `${item.name}: ${quantity}${item.note ? `, ${item.note}` : ''}`,
      );
    }
  }

  // Câu dẫn và nội dung tách riêng để mỗi phần được đọc bằng đúng giọng của nó.
  const addSteps = (section: 'preparation' | 'cooking', title: string, list: string[]) => {
    if (!list.length) return;
    add(section, `${section}-0`, title);
    list.forEach((step, index) => {
      add(section, `${section}-${index}`, words.step(index + 1));
      add(section, `${section}-${index}`, step);
    });
  };
  addSteps('preparation', words.preparation, recipe.preparation);
  addSteps('cooking', words.cooking, recipe.cooking);

  if (recipe.finishedDish) {
    add('finished', 'finished', words.finished);
    add('finished', 'finished', recipe.finishedDish);
  }

  const tips = (recipe.tips ?? [recipe.tip]).filter(Boolean);
  if (tips.length) {
    add('tips', 'tips', words.tips);
    for (const tip of tips) add('tips', 'tips', tip);
  }
  if (recipe.serving) {
    add('tips', 'serving', words.serving);
    add('tips', 'serving', recipe.serving);
  }

  return segments;
}
