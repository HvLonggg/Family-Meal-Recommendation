import { describe, expect, it } from 'vitest';

import {
  buildAccountReportHtml,
  reportTitle,
  usageDuration,
  type AccountExportData,
} from '@/features/account/accountReport';
import { translate } from '@/features/i18n/translate';

const t = (text: string, vars?: Record<string, string | number>) => translate('vi', text, vars);

const data: AccountExportData = {
  profile: {
    full_name: 'Nguyễn Ngọc <Lan>',
    email: 'lan@example.com',
    role: 'user',
    created_at: '2026-08-20T03:00:00Z',
  },
  preferences: {
    dietary_tags: ['low_salt'],
    allergies: 'tôm, đậu phộng',
    spice_level: 'mild',
    preferred_regions: ['Bắc'],
    household_members: [{ label: 'Mẹ', age: 40, appetite: 'normal' }],
    servings_mode: 'auto',
    computed_servings: 1,
    vegetarian_weekdays: [0],
    vegetarian_lunar_days: true,
  },
  favorites: [{ name: 'Phở bò', saved_at: '2026-09-01T00:00:00Z' }],
  cook_logs: [{ recipe_name: 'Canh chua', cooked_at: '2026-11-20T10:00:00Z' }],
  saved_meals: [],
  recipe_submissions: [],
  meal_plans: [
    { date: '2026-11-27', meal_type: 'dinner', recipe_name: 'Canh chua', status: 'completed' },
    { date: '2026-11-27', meal_type: 'dinner', recipe_name: 'Cá kho' },
    { date: '2026-11-30', meal_type: 'lunch', recipe_name: 'Bún chả' },
    { date: '2026-01-02', meal_type: 'lunch', recipe_name: 'Món cũ' },
  ],
};

function parse(html: string) {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('account data report', () => {
  it('renders profile, habits, activity and planned meals sections', () => {
    const doc = parse(buildAccountReportHtml(data, { today: '2026-11-28', t }));

    expect(doc.title).toBe('Bếp Việt – Dữ liệu của Nguyễn Ngọc <Lan> – 28/11/2026');
    expect(doc.querySelector('meta[charset]')?.getAttribute('charset')).toBe('utf-8');
    const sections = [...doc.querySelectorAll('section')].map((item) => item.dataset.section);
    expect(sections).toEqual(['profile', 'habits', 'activity', 'plans']);

    const profile = doc.querySelector('[data-section="profile"]')!.textContent;
    expect(profile).toContain('lan@example.com');
    expect(profile).toContain('20/08/2026');
    expect(profile).toContain('Đã dùng Bếp Việt được 3 tháng');

    const habits = doc.querySelector('[data-section="habits"]')!.textContent;
    expect(habits).toContain('tôm, đậu phộng');
    expect(habits).toContain('Ít muối');
    expect(habits).toContain('Mẹ (40 tuổi)');
    expect(habits).toContain('Thứ Hai hằng tuần');

    const activity = doc.querySelector('[data-section="activity"]')!.textContent;
    expect(activity).toContain('Bữa đã lên kế hoạch');
    expect(activity).toContain('01/09/2026');

    const rows = [...doc.querySelectorAll('[data-section="plans"] tbody tr')].map(
      (row) => row.textContent,
    );
    expect(rows).toEqual([
      '02/01/2026Bữa trưaMón cũ',
      '27/11/2026Bữa tốiCanh chua, Cá kho',
      '30/11/2026Bữa trưaBún chả',
    ]);
  });

  it('escapes user content instead of injecting markup', () => {
    const html = buildAccountReportHtml(data, { today: '2026-11-28', t });
    expect(html).not.toContain('<Lan>');
    expect(html).toContain('&lt;Lan&gt;');
  });

  it('describes how long the account has been used', () => {
    expect(usageDuration('2026-11-20T00:00:00Z', '2026-11-28', t)).toBe('8 ngày');
    expect(usageDuration('2025-08-01T00:00:00Z', '2026-11-28', t)).toBe('1 năm 3 tháng');
    expect(reportTitle('', '2026-11-28', t)).toBe('Bếp Việt – Dữ liệu của tôi – 28/11/2026');
  });
});
