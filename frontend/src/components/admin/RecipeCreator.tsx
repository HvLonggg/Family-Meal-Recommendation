import { useState, type FormEvent } from 'react';

import { CutoutImagePicker } from '@/components/admin/CutoutImagePicker';
import { AppIcon } from '@/components/common/AppIcon';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Workspace';
import {
  ingredientGroups,
  type AdminRecipe,
  type AdminRecipeCreate,
  type AdminRecipeIngredientInput,
} from '@/features/admin/adminApi';
import { useI18n } from '@/features/i18n/I18nContext';

interface RecipeCreatorProps {
  categories: readonly string[];
  difficulties: readonly string[];
  error?: string | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: AdminRecipeCreate) => void;
  regions: readonly string[];
  statusLabels: Record<AdminRecipe['status'], string>;
}

const emptyIngredient = (
  group_name: AdminRecipeIngredientInput['group_name'] = 'Nguyên liệu chính',
): AdminRecipeIngredientInput => ({ group_name, name: '', amount: '', unit: '' });

const lines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-•])\s*/, '').trim())
    .filter(Boolean);

export function RecipeCreator({
  categories,
  difficulties,
  error,
  isSaving,
  onClose,
  onSave,
  regions,
  statusLabels,
}: RecipeCreatorProps) {
  const { t } = useI18n();
  const [image, setImage] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    excerpt: '',
    region: regions[0] ?? 'Ba miền',
    category: categories[0] ?? 'Món mặn',
    difficulty: difficulties[0] ?? 'Dễ',
    prep_minutes: 15,
    cook_minutes: 30,
    base_servings: 4,
    status: 'published' as AdminRecipe['status'],
    tip: '',
    serving: '',
  });
  const [ingredients, setIngredients] = useState<AdminRecipeIngredientInput[]>([
    emptyIngredient(),
    emptyIngredient(),
    emptyIngredient('Gia vị'),
  ]);
  const [preparation, setPreparation] = useState('');
  const [cooking, setCooking] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const updateIngredient = (index: number, patch: Partial<AdminRecipeIngredientInput>) =>
    setIngredients((current) =>
      current.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const filled = ingredients
      .filter((item) => item.name.trim())
      .map((item) => ({
        ...item,
        name: item.name.trim(),
        unit: item.unit.trim(),
        amount: item.amount?.toString().trim() ? item.amount.toString().replace(',', '.') : null,
      }));
    const cookingSteps = lines(cooking);
    if (!image) return setLocalError(t('Hãy tải ảnh món đã tách nền.'));
    if (!filled.length) return setLocalError(t('Thêm ít nhất một nguyên liệu.'));
    if (!cookingSteps.length) return setLocalError(t('Thêm ít nhất một bước nấu.'));
    setLocalError(null);
    onSave({
      ...form,
      image,
      image_alt: form.name.trim(),
      ingredients: filled,
      preparation_steps: lines(preparation),
      cooking_steps: cookingSteps,
    });
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        aria-labelledby="recipe-creator-title"
        aria-modal="true"
        className="modal modal--wide ws-form recipe-creator"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
        onSubmit={submit}
        role="dialog"
      >
        <header className="modal__head">
          <div>
            <span className="section-label">{t('Kho món Bếp Việt')}</span>
            <h2 id="recipe-creator-title">{t('Thêm món mới')}</h2>
          </div>
          <button aria-label={t('Đóng')} className="icon-button" onClick={onClose} type="button">
            <AppIcon name="close" size={18} />
          </button>
        </header>
        <div className="modal__body recipe-creator__body">
          <section className="recipe-creator__media">
            <CutoutImagePicker onChange={setImage} required value={image} />
          </section>

          <section className="recipe-creator__section">
            <h3>
              <span>1</span> {t('Thông tin món')}
            </h3>
            <label className="ws-field">
              <span>{t('Tên món')}</span>
              <input
                autoFocus
                maxLength={180}
                minLength={2}
                onChange={(event) => update('name', event.target.value)}
                placeholder={t('Ví dụ: Gà kho gừng')}
                required
                value={form.name}
              />
            </label>
            <label className="ws-field">
              <span>{t('Mô tả ngắn')}</span>
              <textarea
                maxLength={2000}
                minLength={5}
                onChange={(event) => update('excerpt', event.target.value)}
                required
                rows={2}
                value={form.excerpt}
              />
            </label>
            <div className="ws-grid-3">
              <label className="ws-field">
                <span>{t('Vùng miền')}</span>
                <select
                  onChange={(event) => update('region', event.target.value)}
                  value={form.region}
                >
                  {regions.map((region) => (
                    <option key={region} value={region}>
                      {t(region)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ws-field">
                <span>{t('Loại món')}</span>
                <select
                  onChange={(event) => update('category', event.target.value)}
                  value={form.category}
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {t(category)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ws-field">
                <span>{t('Độ khó')}</span>
                <select
                  onChange={(event) => update('difficulty', event.target.value)}
                  value={form.difficulty}
                >
                  {difficulties.map((difficulty) => (
                    <option key={difficulty} value={difficulty}>
                      {t(difficulty)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="ws-grid-4">
              <label className="ws-field">
                <span>{t('Sơ chế (phút)')}</span>
                <input
                  max={1440}
                  min={0}
                  onChange={(event) => update('prep_minutes', Number(event.target.value) || 0)}
                  type="number"
                  value={form.prep_minutes}
                />
              </label>
              <label className="ws-field">
                <span>{t('Nấu (phút)')}</span>
                <input
                  max={1440}
                  min={0}
                  onChange={(event) => update('cook_minutes', Number(event.target.value) || 0)}
                  type="number"
                  value={form.cook_minutes}
                />
              </label>
              <label className="ws-field">
                <span>{t('Khẩu phần gốc')}</span>
                <input
                  max={30}
                  min={1}
                  onChange={(event) =>
                    update('base_servings', Math.max(1, Number(event.target.value) || 1))
                  }
                  type="number"
                  value={form.base_servings}
                />
              </label>
              <label className="ws-field">
                <span>{t('Trạng thái')}</span>
                <select
                  onChange={(event) =>
                    update('status', event.target.value as AdminRecipe['status'])
                  }
                  value={form.status}
                >
                  {(Object.keys(statusLabels) as AdminRecipe['status'][]).map((status) => (
                    <option key={status} value={status}>
                      {t(statusLabels[status])}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="recipe-creator__section">
            <h3>
              <span>2</span> {t('Nguyên liệu')}
            </h3>
            <p className="recipe-creator__hint">
              {t(
                'Danh sách đi chợ tự xếp mắm, muối, đường, mì chính… vào cột gia vị; hành, tỏi, rau thơm vào nguyên liệu.',
              )}
            </p>
            <ol className="recipe-creator__ingredients">
              {ingredients.map((ingredient, index) => (
                <li key={index}>
                  <input
                    aria-label={t('Tên nguyên liệu {index}', { index: index + 1 })}
                    maxLength={180}
                    onChange={(event) => updateIngredient(index, { name: event.target.value })}
                    placeholder={t('Tên nguyên liệu')}
                    value={ingredient.name}
                  />
                  <input
                    aria-label={t('Định lượng {index}', { index: index + 1 })}
                    inputMode="decimal"
                    onChange={(event) => updateIngredient(index, { amount: event.target.value })}
                    placeholder={t('Lượng')}
                    value={ingredient.amount ?? ''}
                  />
                  <input
                    aria-label={t('Đơn vị {index}', { index: index + 1 })}
                    maxLength={60}
                    onChange={(event) => updateIngredient(index, { unit: event.target.value })}
                    placeholder={t('Đơn vị')}
                    value={ingredient.unit}
                  />
                  <select
                    aria-label={t('Nhóm nguyên liệu {index}', { index: index + 1 })}
                    onChange={(event) =>
                      updateIngredient(index, {
                        group_name: event.target.value as AdminRecipeIngredientInput['group_name'],
                      })
                    }
                    value={ingredient.group_name}
                  >
                    {ingredientGroups.map((group) => (
                      <option key={group} value={group}>
                        {t(group)}
                      </option>
                    ))}
                  </select>
                  <button
                    aria-label={t('Xóa nguyên liệu {index}', { index: index + 1 })}
                    className="icon-button"
                    disabled={ingredients.length === 1}
                    onClick={() =>
                      setIngredients((current) =>
                        current.filter((_, position) => position !== index),
                      )
                    }
                    type="button"
                  >
                    <AppIcon name="trash" size={16} />
                  </button>
                </li>
              ))}
            </ol>
            <button
              className="recipe-creator__add"
              disabled={ingredients.length >= 60}
              onClick={() => setIngredients((current) => [...current, emptyIngredient()])}
              type="button"
            >
              <AppIcon name="plus" size={16} /> {t('Thêm nguyên liệu')}
            </button>
          </section>

          <section className="recipe-creator__section">
            <h3>
              <span>3</span> {t('Cách làm')}
            </h3>
            <div className="ws-grid-2">
              <label className="ws-field">
                <span>{t('Sơ chế (mỗi dòng một bước)')}</span>
                <textarea
                  onChange={(event) => setPreparation(event.target.value)}
                  rows={5}
                  value={preparation}
                />
              </label>
              <label className="ws-field">
                <span>{t('Nấu (mỗi dòng một bước)')}</span>
                <textarea
                  onChange={(event) => setCooking(event.target.value)}
                  required
                  rows={5}
                  value={cooking}
                />
              </label>
            </div>
            <div className="ws-grid-2">
              <label className="ws-field">
                <span>{t('Mách nhỏ')}</span>
                <textarea
                  maxLength={2000}
                  onChange={(event) => update('tip', event.target.value)}
                  rows={2}
                  value={form.tip}
                />
              </label>
              <label className="ws-field">
                <span>{t('Cách dùng')}</span>
                <textarea
                  maxLength={2000}
                  onChange={(event) => update('serving', event.target.value)}
                  rows={2}
                  value={form.serving}
                />
              </label>
            </div>
          </section>
          {localError || error ? <Notice tone="danger">{localError ?? error}</Notice> : null}
        </div>
        <footer className="modal__foot">
          <button className="text-button" onClick={onClose} type="button">
            {t('Hủy')}
          </button>
          <Button isLoading={isSaving} type="submit">
            <AppIcon name="plus" size={16} /> {t('Thêm vào kho món')}
          </Button>
        </footer>
      </form>
    </div>
  );
}
