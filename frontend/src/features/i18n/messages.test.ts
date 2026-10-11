import { describe, expect, it } from 'vitest';

import { dietaryTagLabels, householdPresets } from '@/features/account/preferences';
import { articleCategories, articleStatusLabels } from '@/features/articles/articlesApi';
import { en } from '@/features/i18n/messages.en';
import { translate } from '@/features/i18n/translate';
import { submissionStatusLabels } from '@/features/submissions/submissionsApi';
import { supportStatusLabels, supportTopics } from '@/features/support/supportApi';
import { mealSets } from '@/data/recipes';
import { profileDetails, roleDetails } from '@/data/randomMeals';

const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

function literalKeys() {
  const keys = new Set<string>();
  const pattern = /\bt\(\s*'((?:\\.|[^'\\])*)'/g;
  for (const source of Object.values(sources)) {
    for (const match of source.matchAll(pattern)) keys.add(match[1]!.replace(/\\'/g, "'"));
  }
  return [...keys];
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('English dictionary', () => {
  it('translates every literal passed to t()', () => {
    const keys = literalKeys();
    expect(keys.length).toBeGreaterThan(500);
    expect(keys.filter((key) => !(key in en))).toEqual([]);
  });

  it('translates labels that are rendered from data constants', () => {
    const labels = [
      ...Object.values(roleDetails).flatMap((role) => [role.label, role.shortLabel]),
      ...Object.values(profileDetails).flatMap((profile) => [profile.label, profile.description]),
      ...articleCategories.map((category) => category.label),
      ...Object.values(articleStatusLabels),
      ...Object.values(submissionStatusLabels),
      ...supportTopics.map((topic) => topic.label),
      ...Object.values(supportStatusLabels),
      ...Object.values(dietaryTagLabels),
      ...householdPresets.flatMap((preset) => [preset.label, preset.description]),
      ...mealSets.flatMap((meal) => [meal.title, meal.description]),
      'Bắc',
      'Trung',
      'Nam',
      'Ba miền',
      'Dễ',
      'Vừa',
      'Trung bình',
      'Khó',
    ];
    expect(labels.filter((label) => !(label in en))).toEqual([]);
  });

  it('keeps interpolation placeholders intact', () => {
    const broken = Object.entries(en).filter(
      ([key, value]) => placeholders(key).join() !== placeholders(value).join(),
    );
    expect(broken).toEqual([]);
  });

  it('falls back to Vietnamese and interpolates variables', () => {
    expect(translate('en', 'Kế hoạch của {name}', { name: 'Lan' })).toBe("Lan's plan");
    expect(translate('vi', 'Kế hoạch của {name}', { name: 'Lan' })).toBe('Kế hoạch của Lan');
    expect(translate('en', 'Chuỗi chưa có bản dịch')).toBe('Chuỗi chưa có bản dịch');
  });
});
