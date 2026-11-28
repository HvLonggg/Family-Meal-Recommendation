import { useState, type KeyboardEvent } from 'react';

import { AppIcon } from '@/components/common/AppIcon';
import {
  ALLERGIES_MAX_LENGTH,
  COMMON_ALLERGENS,
  allergyKey,
  joinAllergies,
  parseAllergies,
} from '@/features/account/allergies';
import { useI18n } from '@/features/i18n/I18nContext';

import './settings-page.css';

interface AllergyFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/** Chọn nhanh dị ứng phổ biến hoặc tự thêm; vẫn lưu thành chuỗi "tôm, cua, sữa". */
export function AllergyField({ value, onChange }: AllergyFieldProps) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const items = parseAllergies(value);
  const keys = new Set(items.map(allergyKey));
  const custom = items.filter(
    (item) => !COMMON_ALLERGENS.some((allergen) => allergyKey(allergen) === allergyKey(item)),
  );

  const commit = (next: string[]) => {
    const text = joinAllergies(next);
    if (text.length > ALLERGIES_MAX_LENGTH) {
      setError(t('Danh sách dị ứng tối đa {max} ký tự.', { max: ALLERGIES_MAX_LENGTH }));
      return false;
    }
    setError('');
    onChange(text);
    return true;
  };
  const toggle = (allergen: string) =>
    commit(
      keys.has(allergyKey(allergen))
        ? items.filter((item) => allergyKey(item) !== allergyKey(allergen))
        : [...items, allergen],
    );
  const addFromInput = () => {
    const added = parseAllergies(input);
    if (!added.length) return;
    if (commit([...items, ...added])) setInput('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addFromInput();
    } else if (event.key === 'Backspace' && !input && custom.length) {
      commit(items.filter((item) => item !== custom[custom.length - 1]));
    }
  };

  return (
    <div className="ws-fieldset allergy-field">
      <span className="ws-fieldset__label" id="allergy-label">
        {t('Dị ứng')}
      </span>
      <div aria-labelledby="allergy-label" className="chip-group" role="group">
        {COMMON_ALLERGENS.map((allergen) => {
          const active = keys.has(allergyKey(allergen));
          return (
            <button
              aria-pressed={active}
              className={`chip${active ? ' is-active' : ''}`}
              key={allergen}
              onClick={() => toggle(allergen)}
              type="button"
            >
              {t(allergen)}
            </button>
          );
        })}
      </div>
      <div className="allergy-field__custom">
        {custom.map((item) => (
          <span className="allergy-tag" key={item}>
            {item}
            <button
              aria-label={t('Bỏ {name}', { name: item })}
              onClick={() => commit(items.filter((other) => other !== item))}
              type="button"
            >
              <AppIcon name="close" size={12} />
            </button>
          </span>
        ))}
        <input
          aria-label={t('Thêm dị ứng khác')}
          maxLength={60}
          onBlur={addFromInput}
          onChange={(event) => {
            const next = event.target.value;
            if (next.includes(',')) {
              const pieces = next.split(',');
              const rest = pieces.pop() ?? '';
              const added = parseAllergies(pieces.join(','));
              if (!added.length || commit([...items, ...added])) setInput(rest);
              return;
            }
            setInput(next);
          }}
          onKeyDown={onKeyDown}
          placeholder={t('Thêm khác, nhấn Enter')}
          value={input}
        />
      </div>
      {error ? (
        <small className="allergy-field__error" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}
