import type { Recipe } from '@/data/recipes';
import type { Translate, TranslateVars } from '@/features/i18n/I18nContext';
import { normalizeSearchText } from '@/lib/search';

type MealComponent = Pick<Recipe, 'aliases' | 'category' | 'name' | 'slug' | 'tags'> &
  Partial<Pick<Recipe, 'ingredientCategory'>>;
export type MealRole = 'main' | 'soup' | 'vegetable' | 'other';

/**
 * Món chính của mâm cơm phải là món mặn ăn cùng cơm. Bún, phở, cháo, cơm, xôi, lẩu là
 * món một tô/đĩa; bánh, chè là món ngọt hoặc ăn vặt nên không đứng vai món chính.
 */
const NON_MAIN_SLUG =
  /^(banh|bun|pho|mien|hu tieu|chao|com|xoi|lau|che|canh|sup|soup|goi|nom|khoai|nham|thach|sua chua|kem|men men|cao lau)( |$)|^mi( |$)(?!can\b)/;

const NON_MAIN_GROUPS = new Set(
  [
    'Món nước',
    'Món bún',
    'Món hủ tiếu',
    'Bún, phở, mì và miến',
    'Cháo',
    'Món cơm',
    'Món xôi',
    'Món lẩu',
    'Món trộn',
    'Món gỏi',
    'Món ăn vặt',
    'Món ăn kèm',
    'Món ăn sáng',
    'Món ăn dân dã',
    'Món tráng miệng',
    'Món ngọt',
    'Món bánh',
    'Bánh ngọt',
    'Bánh và ăn sáng',
    'Món canh',
  ].map(normalizeSearchText),
);

const NON_MAIN_TAGS = new Set(
  ['tráng miệng', 'món tráng miệng', 'món ngọt', 'món ăn vặt', 'ăn vặt', 'món khai vị'].map(
    normalizeSearchText,
  ),
);
const BREAKFAST_TAGS = new Set(['bữa sáng', 'món ăn sáng'].map(normalizeSearchText));
const FAMILY_MEAL_TAGS = new Set(
  ['trưa', 'tối', 'bữa trưa', 'bữa tối', 'bữa chính', 'bữa cơm gia đình', 'mâm cơm gia đình'].map(
    normalizeSearchText,
  ),
);

/** Món có thể đứng vai món chính (món mặn ăn với cơm) trong mâm cơm nhà. */
export function canServeAsMainDish(item: MealComponent) {
  if (item.category !== 'Món mặn' && item.category !== 'Món chay') return false;
  if (NON_MAIN_SLUG.test(normalizeSearchText(item.slug))) return false;
  if (item.ingredientCategory && NON_MAIN_GROUPS.has(normalizeSearchText(item.ingredientCategory)))
    return false;
  const tags = item.tags.map(normalizeSearchText);
  if (tags.some((tag) => NON_MAIN_TAGS.has(tag))) return false;
  // Món chỉ dành cho bữa sáng không phải món mặn của mâm cơm trưa/tối.
  return !(
    tags.some((tag) => BREAKFAST_TAGS.has(tag)) && !tags.some((tag) => FAMILY_MEAL_TAGS.has(tag))
  );
}

function hasDishType(item: MealComponent, label: string) {
  const normalizedLabel = label.toLocaleLowerCase('vi');
  return item.tags.some((tag) => {
    const normalizedTag = tag.trim().toLocaleLowerCase('vi');
    return normalizedTag === normalizedLabel || normalizedTag.startsWith(`${normalizedLabel} `);
  });
}

export function hasVegetarianMealLabel(item: MealComponent) {
  return (
    item.category === 'Món chay' || (item.category !== 'Món mặn' && hasDishType(item, 'Món chay'))
  );
}

export function getMealRole(item: MealComponent): MealRole {
  if (
    item.category === 'Món canh' ||
    hasDishType(item, 'Món canh') ||
    (item.category === 'Món mặn' && item.ingredientCategory === 'Món canh')
  )
    return 'soup';
  if (
    item.category === 'Món rau' ||
    item.category === 'Món ăn kèm' ||
    hasDishType(item, 'Món rau') ||
    hasDishType(item, 'Món ăn kèm')
  ) {
    return 'vegetable';
  }
  if (item.category === 'Món chay') {
    const names = [item.name, ...(item.aliases ?? [])].map((name) =>
      name.trim().toLocaleLowerCase('vi'),
    );
    if (
      names.some((name) => ['canh ', 'súp ', 'soup '].some((prefix) => name.startsWith(prefix)))
    ) {
      return 'soup';
    }
    if (
      names.some((name) =>
        [
          'gỏi ',
          'nộm ',
          'vả trộn ',
          'rau ',
          'rau củ ',
          'cải ',
          'bông cải ',
          'bắp cải luộc',
          'bắp cải hấp',
          'bắp cải xào',
          'rau luộc',
          'rau hấp',
          'rau xào',
          'đậu đũa xào ',
          'nấm kim châm xào ',
          'bắp non xào ',
          'củ sen xào ',
          'củ cải trắng xào ',
          'mướp xào ',
          'măng xào ',
          'đậu bắp xào ',
          'đậu bắp luộc',
          'đậu bắp hấp',
          'su su luộc',
          'su su xào',
          'bầu luộc',
          'mướp luộc',
          'cà tím nướng ',
        ].some((prefix) => name.startsWith(prefix)),
      )
    ) {
      return 'vegetable';
    }
    if (names.some((name) => name.startsWith('chè '))) return 'other';
  }
  return canServeAsMainDish(item) ? 'main' : 'other';
}

export function getMealRoleLabel(item: MealComponent) {
  const role = getMealRole(item);
  if (role === 'main') return 'Món chính';
  if (role === 'soup') return 'Món canh';
  if (role === 'vegetable') {
    return item.category === 'Món ăn kèm' || hasDishType(item, 'Món ăn kèm')
      ? 'Món ăn kèm'
      : 'Món rau';
  }
  return item.category;
}

function renderCopy(source: string, vars?: TranslateVars, translate?: Translate) {
  if (translate) return translate(source, vars);
  if (!vars) return source;
  return source.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export function describeMealComposition(items: MealComponent[], translate?: Translate) {
  const main = items.find((item) => getMealRole(item) === 'main');
  const soup = items.find((item) => getMealRole(item) === 'soup');
  const vegetable = items.find((item) => getMealRole(item) === 'vegetable');

  if (main && soup && vegetable) {
    const coreSlugs = new Set([main.slug, soup.slug, vegetable.slug]);
    const extras = items.filter((item) => !coreSlugs.has(item.slug)).map((item) => item.name);
    const mainTaste = hasVegetarianMealLabel(main) ? 'thanh vị' : 'đậm đà';
    const vegetableNote = getMealRoleLabel(vegetable) === 'Món rau' ? 'tươi xanh' : 'vừa vị';
    const summary = renderCopy(
      '{main} {main_taste} hòa cùng {soup} thanh dịu và {vegetable} {vegetable_note}.',
      {
        main: main.name,
        main_taste: translate ? translate(mainTaste) : mainTaste,
        soup: soup.name,
        vegetable: vegetable.name,
        vegetable_note: translate ? translate(vegetableNote) : vegetableNote,
      },
      translate,
    );
    const extraPhrase = extras.length
      ? ` ${renderCopy('Thêm {extras} để mâm cơm thêm phong phú.', { extras: extras.join(', ') }, translate)}`
      : '';
    return `${summary}${extraPhrase}`;
  }

  if (!items.length) {
    return renderCopy(
      'Mâm cơm được phối vị hài hòa, thân thuộc và dễ thưởng thức.',
      undefined,
      translate,
    );
  }
  if (items.length === 1) {
    return renderCopy(
      '{dish} là điểm nhấn cho bữa cơm nhà trọn vị.',
      { dish: items[0]!.name },
      translate,
    );
  }

  const [highlight, ...supporting] = items.map((item) => item.name);
  return renderCopy(
    '{highlight} làm điểm nhấn, {supporting} góp thêm sắc vị riêng.',
    { highlight: highlight!, supporting: supporting.join(', ') },
    translate,
  );
}
