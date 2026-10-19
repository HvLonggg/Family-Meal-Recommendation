import { apiPatch, apiRequest } from '@/lib/api/client';

export type AssistantMode = 'ai' | 'local';
export type AttachmentKind = 'image' | 'text' | 'pdf';

export interface AssistantRecipeCard {
  slug: string;
  name: string;
  image_path: string;
  region: string;
  category: string;
  minutes: number;
  difficulty: string;
}

export interface AssistantAttachmentMeta {
  name: string;
  content_type: string;
  size: number;
  kind: AttachmentKind;
  thumbnail?: string | null;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  recipes: AssistantRecipeCard[];
  suggestions: string[];
  actions: { label: string; to: string }[];
  attachments: AssistantAttachmentMeta[];
  mode?: AssistantMode | null;
  /** Chỉ có ở phía giao diện: tin nhắn gửi lỗi, cho phép gửi lại. */
  failed?: boolean;
}

export interface AssistantAttachmentUpload {
  name: string;
  content_type: string;
  data: string;
  thumbnail?: string | null;
}

export interface ChatPayload {
  message: string;
  conversation_id?: string | null;
  language: 'vi' | 'en';
  history?: { role: 'user' | 'assistant'; content: string }[];
  attachments?: AssistantAttachmentUpload[];
  recent_recipes?: string[];
}

export interface ChatResult {
  conversation_id: string | null;
  title: string | null;
  user_message: AssistantMessage;
  reply: AssistantMessage;
}

export interface ConversationSummary {
  id: string;
  title: string;
  preview: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: AssistantMessage[];
}

export interface AssistantStatus {
  mode: AssistantMode;
  name: string;
  accepts: string[];
  max_attachments: number;
}

export const assistantKeys = {
  status: ['assistant', 'status'] as const,
  conversations: ['assistant', 'conversations'] as const,
  conversation: (id: string) => ['assistant', 'conversation', id] as const,
};

export function getAssistantStatus(signal?: AbortSignal) {
  return apiRequest<AssistantStatus>('/assistant/status', { signal });
}

export function sendAssistantMessage(payload: ChatPayload, signal?: AbortSignal) {
  return apiRequest<ChatResult>('/assistant/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });
}

export function listConversations(signal?: AbortSignal) {
  return apiRequest<{ data: ConversationSummary[] }>('/assistant/conversations', { signal });
}

export function getConversation(id: string, signal?: AbortSignal) {
  return apiRequest<ConversationDetail>(`/assistant/conversations/${encodeURIComponent(id)}`, {
    signal,
  });
}

export function renameConversation(id: string, title: string) {
  return apiPatch<ConversationSummary>(`/assistant/conversations/${encodeURIComponent(id)}`, {
    title,
  });
}

export function deleteConversation(id: string) {
  return apiRequest<void>(`/assistant/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function clearConversations() {
  return apiRequest<void>('/assistant/conversations', { method: 'DELETE' });
}
