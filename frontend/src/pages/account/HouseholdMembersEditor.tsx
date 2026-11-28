import { useState } from 'react';

import { AppIcon } from '@/components/common/AppIcon';
import { MAX_HOUSEHOLD_MEMBERS, ageGroupLabel } from '@/features/account/householdMembers';
import { portionFactor } from '@/features/account/preferences';
import type { Appetite, HouseholdMember } from '@/features/auth/types';
import { useI18n } from '@/features/i18n/I18nContext';

import './settings-page.css';

const appetiteLabels: Record<Appetite, string> = {
  light: 'Ăn ít',
  normal: 'Bình thường',
  big: 'Ăn nhiều',
};

interface HouseholdMembersEditorProps {
  members: HouseholdMember[];
  onChange: (members: HouseholdMember[]) => void;
}

const MAX_AGE = 120;

/**
 * Ô tuổi dạng chữ số: bản nháp cho phép xóa trống khi đang gõ ("23" gõ liền, không bị "0" chặn).
 * Giá trị hợp lệ (0–120) được ghi ngay khi gõ; để trống thì giữ tuổi cũ và trả lại khi rời ô.
 */
function AgeInput({
  age,
  label,
  onCommit,
}: {
  age: number;
  label: string;
  onCommit: (age: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      aria-label={label}
      autoComplete="off"
      inputMode="numeric"
      maxLength={3}
      onBlur={() => setDraft(null)}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, '').slice(0, 3);
        if (digits === '') {
          setDraft('');
          return;
        }
        const next = Math.min(MAX_AGE, Number(digits));
        setDraft(String(next));
        onCommit(next);
      }}
      onFocus={(event) => event.target.select()}
      pattern="[0-9]*"
      value={draft ?? String(age)}
    />
  );
}

export function HouseholdMembersEditor({ members, onChange }: HouseholdMembersEditorProps) {
  const { formatNumber, t } = useI18n();
  const nameOf = (member: HouseholdMember, index: number) =>
    member.label.trim() || t('Thành viên {index}', { index: index + 1 });
  const patch = (index: number, change: Partial<HouseholdMember>) =>
    onChange(
      members.map((member, position) => (position === index ? { ...member, ...change } : member)),
    );

  return (
    <div className="household-editor">
      {members.length === 0 ? (
        <div className="household-editor__empty">
          <AppIcon name="users" size={22} />
          <p>{t('Chưa có thành viên nào. Thêm từng người ăn cùng để tự tính khẩu phần.')}</p>
        </div>
      ) : (
        <ul aria-label={t('Thành viên trong bữa ăn')} className="household-editor__list">
          {members.map((member, index) => {
            const name = nameOf(member, index);
            return (
              <li className="household-member" key={index}>
                <span aria-hidden="true" className="household-member__avatar">
                  {name.charAt(0).toLocaleUpperCase('vi-VN')}
                </span>
                <label className="household-member__field household-member__field--name">
                  <span>{t('Tên gọi')}</span>
                  <input
                    aria-label={t('Tên gọi thành viên {index}', { index: index + 1 })}
                    maxLength={40}
                    onChange={(event) => patch(index, { label: event.target.value })}
                    placeholder={t('Thành viên {index}', { index: index + 1 })}
                    value={member.label}
                  />
                </label>
                <label className="household-member__field household-member__field--age">
                  <span>{t('Tuổi')}</span>
                  <AgeInput
                    age={member.age}
                    label={t('Tuổi của {name}', { name })}
                    onCommit={(age) => patch(index, { age })}
                  />
                  <small>{t(ageGroupLabel(member.age))}</small>
                </label>
                <label className="household-member__field">
                  <span>{t('Sức ăn')}</span>
                  <select
                    aria-label={t('Sức ăn của {name}', { name })}
                    onChange={(event) => patch(index, { appetite: event.target.value as Appetite })}
                    value={member.appetite}
                  >
                    {(Object.keys(appetiteLabels) as Appetite[]).map((key) => (
                      <option key={key} value={key}>
                        {t(appetiteLabels[key])}
                      </option>
                    ))}
                  </select>
                  <small>
                    {t('≈ {portion} suất', {
                      portion: formatNumber(portionFactor(member.age, member.appetite), {
                        maximumFractionDigits: 2,
                      }),
                    })}
                  </small>
                </label>
                <button
                  aria-label={t('Xóa {name}', { name })}
                  className="icon-button icon-button--small household-member__remove"
                  onClick={() => onChange(members.filter((_, position) => position !== index))}
                  type="button"
                >
                  <AppIcon name="trash" size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        className="button button--outline household-editor__add"
        disabled={members.length >= MAX_HOUSEHOLD_MEMBERS}
        onClick={() => onChange([...members, { label: '', age: 30, appetite: 'normal' }])}
        type="button"
      >
        <AppIcon name="plus" size={16} /> {t('Thêm thành viên')}
      </button>
    </div>
  );
}
