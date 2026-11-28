import type { HouseholdMember } from '@/features/auth/types';

export const MAX_HOUSEHOLD_MEMBERS = 12;

export function ageGroupLabel(age: number) {
  if (age < 3) return 'Em bé';
  if (age <= 6) return 'Mầm non';
  if (age <= 12) return 'Thiếu nhi';
  if (age < 18) return 'Thiếu niên';
  if (age < 65) return 'Người lớn';
  return 'Người cao tuổi';
}

/** Tên gọi không bắt buộc; backend cần nhãn nên điền "Thành viên N" khi để trống. */
export function withMemberLabels(members: HouseholdMember[], fallback: (index: number) => string) {
  return members.map((member, index) => ({
    ...member,
    label: member.label.trim() || fallback(index + 1),
  }));
}
