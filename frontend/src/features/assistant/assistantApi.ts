import { apiDelete, apiPatch, apiPost, apiRequest, apiStream } from '@/lib/api/client';
import { UserFacingError } from '@/lib/errors';

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

export interface AssistantSource {
  title: string;
  url: string;
  kind: 'recipe' | 'article' | 'guide' | 'doc';
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
  /** Nguồn trong kho tri thức (RAG) mà câu trả lời đã dựa vào. */
  sources?: AssistantSource[];
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

/** Bỏ chú thích nguồn [1] (kể cả đang viết dở "[1") khỏi chữ đang stream. */
export function streamingText(text: string) {
  return text.replace(/\s?\[\d+(?:[,\s]+\d+)*\]/g, '').replace(/\s?\[\d*(?:[,\s]+\d*)*$/, '');
}

/**
 * Gửi tin và nhận câu trả lời theo luồng: `onDelta` nhận từng đoạn chữ ngay khi AI viết ra,
 * promise trả về câu trả lời đã lưu (giống `sendAssistantMessage`).
 */
export async function streamAssistantMessage(
  payload: ChatPayload,
  { onDelta, signal }: { onDelta: (text: string) => void; signal?: AbortSignal },
): Promise<ChatResult> {
  const response = await apiStream('/assistant/chat/stream', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { Accept: 'text/event-stream' },
    signal,
  });
  const reader = response.body?.getReader();
  if (!reader) return sendAssistantMessage(payload, signal);
  const decoder = new TextDecoder();
  let buffer = '';
  let result: ChatResult | null = null;
  const handle = (block: string) => {
    let event = 'message';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) return;
    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (event === 'delta' && typeof parsed.text === 'string') onDelta(parsed.text);
    else if (event === 'done') result = parsed as unknown as ChatResult;
    else if (event === 'error') {
      throw new UserFacingError(
        typeof parsed.message === 'string' ? parsed.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.',
      );
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      handle(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) handle(buffer);
  if (!result) throw new Error('Assistant stream ended early');
  return result;
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

export type MemoryKind = 'allergy' | 'diet' | 'household' | 'note';

export interface AssistantMemory {
  id: string;
  content: string;
  kind: MemoryKind;
  created_at: string;
  updated_at: string;
}

export const memoryKeys = { all: ['assistant', 'memories'] as const };

export function listMemories(signal?: AbortSignal) {
  return apiRequest<{ data: AssistantMemory[]; limit: number }>('/assistant/memories', { signal });
}

export function addMemory(content: string) {
  return apiPost<AssistantMemory>('/assistant/memories', { content });
}

export function updateMemory(id: string, content: string) {
  return apiPatch<AssistantMemory>(`/assistant/memories/${encodeURIComponent(id)}`, { content });
}

export function deleteMemory(id: string) {
  return apiDelete(`/assistant/memories/${encodeURIComponent(id)}`);
}

export function clearMemories() {
  return apiDelete('/assistant/memories');
}
