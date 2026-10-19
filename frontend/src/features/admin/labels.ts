import type { ActivityKind, AdminPlanItem } from '@/features/admin/adminApi';
import type { IconName } from '@/components/common/AppIcon';
import type { BadgeTone } from '@/components/ui/Workspace';

export const mealLabels: Record<AdminPlanItem['meal_type'], string> = {
  breakfast: 'Bữa sáng',
  lunch: 'Bữa trưa',
  dinner: 'Bữa tối',
};

export const planStatusLabels: Record<AdminPlanItem['completion_status'], string> = {
  planned: 'Theo kế hoạch',
  completed: 'Đã nấu',
  skipped: 'Đã bỏ qua',
};

export const planStatusTone: Record<AdminPlanItem['completion_status'], BadgeTone> = {
  planned: 'info',
  completed: 'success',
  skipped: 'neutral',
};

export const activityKinds: { kind: ActivityKind; label: string; icon: IconName }[] = [
  { kind: 'plan', label: 'Kế hoạch', icon: 'calendar' },
  { kind: 'favorite', label: 'Yêu thích', icon: 'heart' },
  { kind: 'saved_meal', label: 'Mâm cơm', icon: 'plate' },
  { kind: 'story', label: 'Bài viết', icon: 'pen' },
  { kind: 'submission', label: 'Đề xuất món', icon: 'chef' },
  { kind: 'support', label: 'Hỗ trợ', icon: 'message' },
];

/** Nhãn hành động theo loại và tên hành động. */
export const activityActionLabels: Record<string, string> = {
  'plan:added': 'Thêm vào kế hoạch',
  'plan:updated': 'Cập nhật kế hoạch',
  'plan:removed': 'Xóa khỏi kế hoạch',
  'plan:completed': 'Đã nấu xong',
  'plan:skipped': 'Bỏ qua bữa',
  'plan:reopened': 'Mở lại bữa ăn',
  'favorite:favorited': 'Thêm vào yêu thích',
  'saved_meal:saved': 'Lưu mâm cơm',
  'story:created': 'Viết bài',
  'submission:submitted': 'Gửi đề xuất món',
  'support:opened': 'Gửi yêu cầu hỗ trợ',
};

export const activityTone: Record<string, BadgeTone> = {
  'plan:completed': 'success',
  'plan:removed': 'danger',
  'plan:skipped': 'warning',
  'favorite:favorited': 'danger',
};

export const providerLabels: Record<string, string> = {
  password: 'Email & mật khẩu',
  google: 'Google',
  facebook: 'Facebook',
  phone: 'Số điện thoại',
};
