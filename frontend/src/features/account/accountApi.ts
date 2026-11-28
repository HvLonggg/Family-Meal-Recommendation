import type { AccountExportData } from '@/features/account/accountReport';
import type { AuthUser, UserPreferences } from '@/features/auth/types';
import { apiDelete, apiPatch, apiPost, apiPut, apiRequest } from '@/lib/api/client';

export interface AccountOverview {
  user: AuthUser;
  stats: {
    favorites: number;
    planned_meals: number;
    cooked_meals: number;
    stories: number;
    published_stories: number;
    submissions: number;
  };
  has_password: boolean;
  last_login_at: string | null;
  linked_providers: string[];
}

export const accountOverviewQueryKey = (userId?: string) => ['account-overview', userId] as const;

export function getAccountOverview(signal?: AbortSignal) {
  return apiRequest<AccountOverview>('/account/overview', { signal });
}

export function updateProfile(fullName: string) {
  return apiPatch<AuthUser>('/account/profile', { full_name: fullName });
}

export function uploadAvatar(dataUrl: string) {
  return apiPut<AuthUser>('/account/avatar', { data_url: dataUrl });
}

export function removeAvatar() {
  return apiDelete<AuthUser>('/account/avatar');
}

export function savePreferences(preferences: UserPreferences) {
  return apiPut<UserPreferences>('/account/preferences', preferences);
}

export function revokeAllSessions() {
  return apiPost<{ message: string }>('/account/sessions/revoke-all');
}

export function exportAccountData() {
  return apiRequest<AccountExportData>('/account/export');
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiPost<{ message: string }>('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

export interface EmailChangeChallenge {
  challenge_id: string;
  development_code: string | null;
  expires_in: number;
  message: string;
}

export function requestEmailChange(newEmail: string, currentPassword?: string) {
  return apiPost<EmailChangeChallenge>('/auth/change-email', {
    new_email: newEmail,
    current_password: currentPassword ?? null,
  });
}

export function confirmEmailChange(challengeId: string, code: string) {
  return apiPost<AuthUser>('/auth/change-email/confirm', { challenge_id: challengeId, code });
}

export interface DeleteAccountPayload {
  confirmation: string;
  password?: string;
  challenge_id?: string;
  code?: string;
}

/** Tài khoản chỉ đăng nhập mạng xã hội (không có mật khẩu) xác nhận xóa bằng mã email. */
export function requestAccountDeletionCode() {
  return apiPost<EmailChangeChallenge>('/account/delete/request-code');
}

export function deleteAccount(payload: DeleteAccountPayload) {
  return apiPost<{ message: string }>('/account/delete', payload);
}

export function acceptTerms(version: string) {
  return apiPost<AuthUser>('/account/accept-terms', { version });
}
