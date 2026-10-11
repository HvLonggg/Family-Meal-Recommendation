import { apiDelete, apiPost, apiPut, apiRequest } from '@/lib/api/client';

export type SubmissionStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export const submissionStatusLabels: Record<SubmissionStatus, string> = {
  draft: 'Bản nháp',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Chưa phù hợp',
};

export interface SubmissionWrite {
  name: string;
  region: 'Bắc' | 'Trung' | 'Nam' | 'Ba miền';
  category: string;
  servings: number;
  total_minutes: number;
  story: string;
  ingredients: string;
  steps: string;
  submit: boolean;
}

export interface Submission extends Omit<SubmissionWrite, 'submit'> {
  id: string;
  status: SubmissionStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminSubmission extends Submission {
  submitter: { id: string; full_name: string; email: string | null };
}

export const mySubmissionsQueryKey = (userId?: string) => ['my-submissions', userId] as const;

export function listMySubmissions(signal?: AbortSignal) {
  return apiRequest<{ data: Submission[]; total: number }>('/submissions/mine', { signal });
}

export function createSubmission(payload: SubmissionWrite) {
  return apiPost<Submission>('/submissions', payload);
}

export function updateSubmission(id: string, payload: SubmissionWrite) {
  return apiPut<Submission>(`/submissions/${encodeURIComponent(id)}`, payload);
}

export function deleteSubmission(id: string) {
  return apiDelete(`/submissions/${encodeURIComponent(id)}`);
}

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const submissionStatusTone: Record<SubmissionStatus, StatusTone> = {
  draft: 'neutral',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};
