import type { AssistantMessage, ConversationSummary } from '@/features/assistant/assistantApi';

/** Lưu lịch sử khách trên thiết bị; bỏ qua lỗi truy cập bộ nhớ. */
const STORAGE_KEY = 'bep-viet.assistant.guest.v1';
const MAX_CONVERSATIONS = 20;
const MAX_MESSAGES = 60;

export interface GuestConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: AssistantMessage[];
}

function readAll(): GuestConversation[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as GuestConversation[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: GuestConversation[]) {
  const trimmed = items
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, MAX_CONVERSATIONS)
    .map((item) => ({ ...item, messages: item.messages.slice(-MAX_MESSAGES) }));
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Hết dung lượng: bỏ ảnh thu nhỏ rồi thử lại một lần.
    try {
      const light = trimmed.map((item) => ({
        ...item,
        messages: item.messages.map((message) => ({
          ...message,
          attachments: message.attachments.map((file) => ({ ...file, thumbnail: null })),
        })),
      }));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(light));
    } catch {
      /* Trình duyệt không cho lưu: lịch sử chỉ còn trong phiên hiện tại. */
    }
  }
}

function plainPreview(messages: AssistantMessage[]) {
  const last = [...messages].reverse().find((message) => message.role === 'assistant');
  return (last?.content ?? '')
    .replace(/[*_`#>-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export const guestStore = {
  list(): ConversationSummary[] {
    return readAll()
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((item) => ({
        id: item.id,
        title: item.title,
        preview: plainPreview(item.messages),
        message_count: item.messages.length,
        created_at: item.created_at,
        updated_at: item.updated_at,
      }));
  },
  get(id: string): GuestConversation | undefined {
    return readAll().find((item) => item.id === id);
  },
  save(conversation: GuestConversation) {
    writeAll([conversation, ...readAll().filter((item) => item.id !== conversation.id)]);
  },
  rename(id: string, title: string) {
    writeAll(readAll().map((item) => (item.id === id ? { ...item, title } : item)));
  },
  remove(id: string) {
    writeAll(readAll().filter((item) => item.id !== id));
  },
  clear() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* bỏ qua */
    }
  },
};
