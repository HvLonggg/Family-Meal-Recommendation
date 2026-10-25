import type { Recipe } from '@/data/recipes';
import type { Translate, TranslateVars } from '@/features/i18n/I18nContext';

type MealComponent = Pick<Recipe, 'category' | 'name' | 'slug'>;

function renderCopy(source: string, vars?: TranslateVars, translate?: Translate) {
  if (translate) return translate(source, vars);
  if (!vars) return source;
  return source.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export function describeMealComposition(items: MealComponent[], translate?: Translate) {
  const main = items.find((item) => ['Món mặn', 'Món chay'].includes(item.category));
  const soup = items.find((item) => item.category === 'Món canh');
  const vegetable = items.find(
    (item) => item.category === 'Món rau' || item.category === 'Món ăn kèm',
  );

  if (main && soup && vegetable) {
    const coreSlugs = new Set([main.slug, soup.slug, vegetable.slug]);
    const extras = items.filter((item) => !coreSlugs.has(item.slug)).map((item) => item.name);
    const mainTaste = main.category === 'Món chay' ? 'thanh vị' : 'đậm đà';
    const vegetableNote = vegetable.category === 'Món rau' ? 'tươi xanh' : 'vừa vị';
    const summary = renderCopy(
      '{main} {main_taste} hòa cùng {soup} thanh dịu và {vegetable} {vegetable_note}. Ba món nâng đỡ hương vị cho nhau, tạo nên mâm cơm nhà tròn vị.',
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
    '{highlight} làm điểm nhấn, {supporting} góp thêm sắc vị riêng. Cùng tạo nên mâm cơm hài hòa, gần gũi mà vẫn đầy sức hấp dẫn.',
    { highlight: highlight!, supporting: supporting.join(', ') },
    translate,
  );
}
