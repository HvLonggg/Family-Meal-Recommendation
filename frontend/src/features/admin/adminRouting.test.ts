import { describe, expect, it } from 'vitest';

import { adminDestinationFor, isAdminPreviewPath } from '@/features/admin/adminRouting';

describe('admin routing', () => {
  it('keeps recipe and article detail pages available as previews', () => {
    expect(isAdminPreviewPath('/recipes/pho-bo')).toBe(true);
    expect(isAdminPreviewPath('/articles/bep-tet')).toBe(true);
    expect(adminDestinationFor('/recipes/pho-bo')).toBeNull();
    expect(adminDestinationFor('/articles/bep-tet/')).toBeNull();
  });

  it('maps public pages to their management equivalents', () => {
    expect(adminDestinationFor('/stories/new')).toBe('/admin/articles/new');
    expect(adminDestinationFor('/stories/42/edit')).toBe('/admin/articles/42/edit');
    expect(adminDestinationFor('/account/settings')).toBe('/admin/settings');
    expect(adminDestinationFor('/account/security')).toBe('/admin/security');
    expect(adminDestinationFor('/account/submissions')).toBe('/admin/submissions');
    expect(adminDestinationFor('/submit-recipe')).toBe('/admin/submissions');
    expect(adminDestinationFor('/recipes')).toBe('/admin/recipes');
    expect(adminDestinationFor('/planner')).toBe('/admin/plans');
    expect(adminDestinationFor('/contact')).toBe('/admin/support');
  });

  it('sends every other public page to the dashboard', () => {
    for (const path of ['/', '/meals', '/random-meal', '/favorites', '/account', '/khong-co']) {
      expect(adminDestinationFor(path)).toBe('/admin');
    }
  });
});
