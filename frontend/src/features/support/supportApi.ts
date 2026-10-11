import { apiPost, apiRequest } from '@/lib/api/client';

export type SupportTopic = 'general' | 'account' | 'recipe' | 'planner' | 'bug' | 'partnership';
export type SupportStatus = 'open' | 'in_progress' | 'resolved';

export const supportTopics: { id: SupportTopic; label: string }[] = [
  { id: 'general', label: 'Câu hỏi chung' },
  { id: 'account', label: 'Tài khoản & đăng nhập' },
  { id: 'recipe', label: 'Công thức & nội dung' },
  { id: 'planner', label: 'Kế hoạch bữa ăn' },
  { id: 'bug', label: 'Báo lỗi ứng dụng' },
  { id: 'partnership', label: 'Hợp tác' },
];

export const supportStatusLabels: Record<SupportStatus, string> = {
  open: 'Đã tiếp nhận',
  in_progress: 'Đang được xử lý',
  resolved: 'Đã giải quyết',
};

export interface SupportTicketCreate {
  name: string;
  email: string;
  topic: SupportTopic;
  subject: string;
  message: string;
  website: string;
}

export interface SupportTicketReceipt {
  id: string;
  reference: string;
  message: string;
}

export interface SupportTicket {
  id: string;
  name: string;
  email: string;
  topic: SupportTopic;
  subject: string;
  message: string;
  status: SupportStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export function createSupportTicket(payload: SupportTicketCreate) {
  return apiPost<SupportTicketReceipt>('/support/tickets', payload);
}

export function listMySupportTickets(signal?: AbortSignal) {
  return apiRequest<{ data: SupportTicket[]; total: number }>('/support/tickets/mine', { signal });
}
