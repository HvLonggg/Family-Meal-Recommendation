import { useId, useState } from 'react';

import { AppIcon } from '@/components/common/AppIcon';
import type { CatalogFacetOption } from '@/data/recipeCatalogFilters';
import { useI18n } from '@/features/i18n/I18nContext';
import './CatalogFilters.css';

interface CatalogFiltersProps {
  ingredientOptions: CatalogFacetOption[];
  methodOptions: CatalogFacetOption[];
  ingredients: string[];
  methods: string[];
  region: string;
  fitMe: boolean;
  canPersonalize: boolean;
  onToggleFacet: (key: 'ingredients' | 'methods', id: string) => void;
  onRegionChange: (value: string) => void;
  onFitChange: () => void;
  onClear: () => void;
}

function FacetGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: CatalogFacetOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const visible = options.filter(
    (option, index) => expanded || index < 6 || selected.includes(option.id),
  );
  const hiddenCount = options.length - visible.length;
  if (!options.length) return null;

  return (
    <fieldset className="catalog-filters__group">
      <legend>{t(label)}</legend>
      <div className="catalog-filters__options" id={id}>
        {visible.map((option) => (
          <button
            aria-pressed={selected.includes(option.id)}
            className="catalog-filters__chip"
            key={option.id}
            onClick={() => onToggle(option.id)}
            type="button"
          >
            <AppIcon name={selected.includes(option.id) ? 'check' : 'plus'} size={16} />
            {t(option.label)}
          </button>
        ))}
      </div>
      {expanded || hiddenCount > 0 ? (
        <button
          aria-controls={id}
          aria-expanded={expanded}
          aria-label={t(expanded ? 'Thu gọn {group}' : 'Xem thêm {group}', { group: t(label) })}
          className="catalog-filters__more"
          onClick={() => setExpanded(!expanded)}
          type="button"
        >
          {expanded ? t('Thu gọn') : t('Xem thêm ({count})', { count: hiddenCount })}
          <AppIcon name="chevron" size={16} />
        </button>
      ) : null}
    </fieldset>
  );
}

export function CatalogFilters({
  ingredientOptions,
  methodOptions,
  ingredients,
  methods,
  region,
  fitMe,
  canPersonalize,
  onToggleFacet,
  onRegionChange,
  onFitChange,
  onClear,
}: CatalogFiltersProps) {
  const { t } = useI18n();
  const id = useId();
  const activeId = useId();
  const [open, setOpen] = useState(false);
  const [showAllActive, setShowAllActive] = useState(false);
  const active = [
    ...ingredientOptions
      .filter(({ id: optionId }) => ingredients.includes(optionId))
      .map((option) => ({
        ...option,
        key: `ingredients-${option.id}`,
        remove: () => onToggleFacet('ingredients', option.id),
      })),
    ...methodOptions
      .filter(({ id: optionId }) => methods.includes(optionId))
      .map((option) => ({
        ...option,
        key: `methods-${option.id}`,
        remove: () => onToggleFacet('methods', option.id),
      })),
    ...(region !== 'Tất cả'
      ? [{ key: 'region', label: region, remove: () => onRegionChange('Tất cả') }]
      : []),
    ...(fitMe && canPersonalize
      ? [{ key: 'fit', label: 'Hợp chế độ ăn của tôi', remove: onFitChange }]
      : []),
  ];
  const count = active.length;

  return (
    <section className="catalog-filters" aria-label={t('Bộ lọc món ăn')}>
      <div className="catalog-filters__toolbar">
        <button
          aria-controls={id}
          aria-expanded={open}
          className="catalog-filters__toggle"
          onClick={() => setOpen(!open)}
          type="button"
        >
          <AppIcon name="settings" size={16} />
          {t(open ? 'Ẩn bộ lọc' : 'Bộ lọc')}
          {count > 0 ? <span className="catalog-filters__count">{count}</span> : null}
          <AppIcon name="chevron" size={16} />
        </button>
        {count > 0 ? (
          <button className="catalog-filters__clear" onClick={onClear} type="button">
            {t('Xóa bộ lọc ({count})', { count })}
          </button>
        ) : null}
      </div>
      {count > 0 ? (
        <div className="catalog-filters__active" aria-label={t('Bộ lọc đang chọn')} role="group">
          <div className="catalog-filters__options" id={activeId}>
            {active.slice(0, showAllActive ? undefined : 3).map((option) => (
              <button
                aria-label={t('Bỏ lọc {label}', { label: t(option.label) })}
                className="catalog-filters__chip catalog-filters__chip--active"
                key={option.key}
                onClick={option.remove}
                type="button"
              >
                {t(option.label)}
                <AppIcon name="close" size={16} />
              </button>
            ))}
          </div>
          {count > 3 ? (
            <button
              aria-controls={activeId}
              aria-expanded={showAllActive}
              aria-label={t(showAllActive ? 'Thu gọn bộ lọc đã chọn' : 'Xem thêm bộ lọc đã chọn')}
              className="catalog-filters__more"
              onClick={() => setShowAllActive(!showAllActive)}
              type="button"
            >
              {showAllActive ? t('Thu gọn') : t('Xem thêm ({count})', { count: count - 3 })}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="catalog-filters__body" hidden={!open} id={id}>
        <p className="catalog-filters__hint">{t('Có thể chọn nhiều trong mỗi nhóm')}</p>
        <fieldset className="catalog-filters__group">
          <legend>{t('Vùng miền')}</legend>
          <div className="catalog-filters__options">
            {['Tất cả', 'Bắc', 'Trung', 'Nam', 'Ba miền'].map((item) => (
              <button
                aria-pressed={region === item}
                className="catalog-filters__chip"
                key={item}
                onClick={() => onRegionChange(item)}
                type="button"
              >
                {t(item)}
              </button>
            ))}
          </div>
        </fieldset>
        <FacetGroup
          label="Nguyên liệu chính"
          options={ingredientOptions}
          selected={ingredients}
          onToggle={(value) => onToggleFacet('ingredients', value)}
        />
        <FacetGroup
          label="Cách chế biến"
          options={methodOptions}
          selected={methods}
          onToggle={(value) => onToggleFacet('methods', value)}
        />
        {canPersonalize ? (
          <fieldset className="catalog-filters__group">
            <legend>{t('Cá nhân hóa')}</legend>
            <button
              aria-pressed={fitMe}
              className="catalog-filters__chip"
              onClick={onFitChange}
              type="button"
            >
              <AppIcon name={fitMe ? 'check' : 'plus'} size={16} />
              {t('Hợp chế độ ăn của tôi')}
            </button>
          </fieldset>
        ) : null}
      </div>
    </section>
  );
}
