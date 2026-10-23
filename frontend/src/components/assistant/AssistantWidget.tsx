import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { AssistantMessageView } from '@/components/assistant/AssistantMessageView';
import { DragonMascot, type DragonMood } from '@/components/assistant/DragonMascot';
import { AppIcon } from '@/components/common/AppIcon';
import {
  assistantKeys,
  clearConversations,
  deleteConversation,
  getAssistantStatus,
  getConversation,
  listConversations,
  renameConversation,
  streamAssistantMessage,
  streamingText,
  type AssistantMessage,
  type ConversationSummary,
} from '@/features/assistant/assistantApi';
import {
  ACCEPT_ATTR,
  AttachmentError,
  formatSize,
  MAX_ATTACHMENTS,
  prepareAttachment,
  type PendingAttachment,
} from '@/features/assistant/attachments';
import { guestStore } from '@/features/assistant/guestStore';
import { dayPart, dayPartPrompts } from '@/features/assistant/dayPart';
import { pickTeaser, teaserReplies } from '@/features/assistant/teasers';
import { useSpeechRecognition, useSpeechSynthesis } from '@/features/assistant/useSpeech';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage } from '@/lib/errors';

type View = 'chat' | 'history';
type VoiceState = 'off' | 'listening' | 'thinking' | 'speaking' | 'paused';

const TEASER_SNOOZE_KEY = 'bep-viet.assistant.teaser-snooze';
const TEASER_COUNT_KEY = 'bep-viet.assistant.teaser-count';
const TEASER_SNOOZE_MS = 15 * 60_000;
const FIRST_TEASER_MS = 10_000;
const NEXT_TEASER_MS = 55_000;
const TEASER_VISIBLE_MS = 6_000;
const MAX_TEASERS_PER_SESSION = 30;

function safeGet(storage: 'local' | 'session', key: string) {
  try {
    return (storage === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function safeSet(storage: 'local' | 'session', key: string, value: string) {
  try {
    (storage === 'local' ? window.localStorage : window.sessionStorage).setItem(key, value);
  } catch {
    /* bỏ qua khi trình duyệt chặn lưu trữ */
  }
}

const localId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function botMessage(content: string, suggestions: string[] = []): AssistantMessage {
  return {
    id: localId(),
    role: 'assistant',
    content,
    created_at: new Date().toISOString(),
    recipes: [],
    suggestions,
    actions: [],
    attachments: [],
    mode: 'local',
  };
}

function dayGroup(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff =
    startOfToday - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (diff <= 0) return 'Hôm nay';
  if (diff <= 86_400_000) return 'Hôm qua';
  if (diff <= 7 * 86_400_000) return '7 ngày qua';
  return 'Cũ hơn';
}

export function AssistantWidget() {
  const { user } = useAuth();
  const { formatDate, language, t } = useI18n();
  const queryClient = useQueryClient();
  const member = Boolean(user);
  const speechLang = language === 'en' ? 'en-US' : 'vi-VN';

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<View>('chat');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  // Chữ AI đang viết dở (stream): hiện ngay thay cho dấu ba chấm chờ.
  const [streamText, setStreamText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [teaser, setTeaser] = useState<string | null>(null);
  const [unread, setUnread] = useState(false);
  const [voice, setVoice] = useState<VoiceState>('off');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [guestTick, setGuestTick] = useState(0);

  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const retryRef = useRef(new Map<string, { text: string; files: PendingAttachment[] }>());
  // Giữ trạng thái giọng đọc mới nhất giữa các lần render.
  const voiceRef = useRef<VoiceState>('off');
  const messagesRef = useRef<AssistantMessage[]>(messages);
  const changeVoice = useCallback((next: VoiceState) => {
    voiceRef.current = next;
    setVoice(next);
  }, []);

  const recognition = useSpeechRecognition();
  const synthesis = useSpeechSynthesis();

  const status = useQuery({
    queryKey: assistantKeys.status,
    queryFn: ({ signal }) => getAssistantStatus(signal),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const history = useQuery({
    queryKey: assistantKeys.conversations,
    queryFn: ({ signal }) => listConversations(signal),
    enabled: open && member && view === 'history',
  });

  // Đổi tài khoản (đăng nhập/đăng xuất): bắt đầu cuộc trò chuyện mới.
  const userId = user?.id ?? null;
  const [seenUserId, setSeenUserId] = useState(userId);
  if (seenUserId !== userId) {
    setSeenUserId(userId);
    setConversationId(null);
    setTitle(null);
    setMessages([]);
    setView('chat');
  }

  // ---------------- Lời mời bật lên thỉnh thoảng ----------------
  useEffect(() => {
    if (open) return undefined;
    const snoozedUntil = Number(safeGet('local', TEASER_SNOOZE_KEY) ?? 0);
    let shown = Number(safeGet('session', TEASER_COUNT_KEY) ?? 0);
    if (snoozedUntil > Date.now() || shown >= MAX_TEASERS_PER_SESSION) return undefined;
    let hideTimer = 0;
    const show = () => {
      if (shown >= MAX_TEASERS_PER_SESSION || document.hidden) return;
      shown += 1;
      safeSet('session', TEASER_COUNT_KEY, String(shown));
      setTeaser(pickTeaser());
      setUnread(true);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setTeaser(null), TEASER_VISIBLE_MS);
    };
    const first = window.setTimeout(show, FIRST_TEASER_MS);
    const repeat = window.setInterval(show, NEXT_TEASER_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(repeat);
      window.clearTimeout(hideTimer);
    };
  }, [open]);

  const dismissTeaser = () => {
    setTeaser(null);
    safeSet('local', TEASER_SNOOZE_KEY, String(Date.now() + TEASER_SNOOZE_MS));
  };

  // ---------------- Mở / đóng ----------------
  const stopVoice = useCallback(() => {
    recognition.abort();
    synthesis.cancel();
    changeVoice('off');
    setVoiceTranscript('');
  }, [changeVoice, recognition, synthesis]);

  const openPanel = (seed?: string) => {
    setOpen(true);
    setUnread(false);
    setTeaser(null);
    if (seed && messages.length === 0) {
      setMessages([
        botMessage(
          t(seed),
          teaserReplies().map((item) => t(item)),
        ),
      ]);
    }
  };
  const closePanel = useCallback(() => {
    stopVoice();
    setOpen(false);
    setExpanded(false);
    window.setTimeout(() => launcherRef.current?.focus(), 0);
  }, [stopVoice]);

  useEffect(() => {
    if (open && view === 'chat' && voice === 'off') inputRef.current?.focus();
  }, [open, view, voice]);

  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    if (typeof log.scrollTo === 'function') {
      log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
    } else {
      log.scrollTop = log.scrollHeight;
    }
  }, [messages, sending, streamText]);

  useEffect(() => {
    document.body.classList.toggle('has-assistant-open', open);
    return () => document.body.classList.remove('has-assistant-open');
  }, [open]);

  // ---------------- Gửi tin nhắn ----------------
  const persistGuest = useCallback(
    (id: string, nextTitle: string, nextMessages: AssistantMessage[]) => {
      const existing = guestStore.get(id);
      guestStore.save({
        id,
        title: existing?.title ?? nextTitle,
        created_at: existing?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: nextMessages.filter((message) => !message.failed),
      });
      setGuestTick((value) => value + 1);
    },
    [],
  );

  const send = useCallback(
    async (rawText: string, pending: PendingAttachment[] = files) => {
      const text = rawText.trim();
      if ((!text && !pending.length) || sending) return null;
      setNotice(null);
      const tempId = localId();
      const optimistic: AssistantMessage = {
        id: tempId,
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
        recipes: [],
        suggestions: [],
        actions: [],
        attachments: pending.map((file) => ({
          name: file.name,
          content_type: file.contentType,
          size: file.size,
          kind: file.kind,
          thumbnail: file.thumbnail,
        })),
      };
      const before = messagesRef.current.filter((message) => !message.failed);
      setMessages([...before, optimistic]);
      setInput('');
      setFiles([]);
      setSending(true);
      setStreamText('');
      try {
        let streamed = '';
        const onDelta = (chunk: string) => {
          streamed += chunk;
          setStreamText(streamed);
        };
        const result = await streamAssistantMessage(
          {
            message: text,
            conversation_id: member ? conversationId : null,
            language,
            history: member
              ? undefined
              : before.slice(-12).map((message) => ({
                  role: message.role,
                  content: message.content.slice(0, 6000),
                })),
            attachments: pending.map((file) => ({
              name: file.name,
              content_type: file.contentType,
              data: file.data,
              thumbnail: file.thumbnail,
            })),
            recent_recipes: before
              .flatMap((message) => message.recipes.map((r) => r.slug))
              .slice(-30),
          },
          { onDelta },
        );
        const userMessage = {
          ...result.user_message,
          attachments: result.user_message.attachments.map((file, index) => ({
            ...file,
            thumbnail: file.thumbnail ?? optimistic.attachments[index]?.thumbnail ?? null,
          })),
        };
        const next = [...before, userMessage, result.reply];
        setMessages(next);
        if (member) {
          setConversationId(result.conversation_id);
          setTitle(result.title);
          void queryClient.invalidateQueries({ queryKey: assistantKeys.conversations });
        } else {
          const id = conversationId ?? localId();
          setConversationId(id);
          setTitle((current) => current ?? result.title);
          persistGuest(id, result.title ?? t('Cuộc trò chuyện mới'), next);
        }
        retryRef.current.delete(tempId);
        return result.reply;
      } catch (error) {
        retryRef.current.set(tempId, { text, files: pending });
        setMessages([...before, { ...optimistic, failed: true }]);
        setNotice(errorMessage(error, t));
        return null;
      } finally {
        setSending(false);
        setStreamText('');
      }
    },
    [conversationId, files, language, member, persistGuest, queryClient, sending, t],
  );
  const sendRef = useRef(send);

  const retry = (message: AssistantMessage) => {
    const payload = retryRef.current.get(message.id);
    if (!payload) return;
    setMessages((current) => current.filter((item) => item.id !== message.id));
    void send(payload.text, payload.files);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(input);
  };
  const onComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(input);
    }
  };

  // ---------------- Tệp đính kèm ----------------
  const addFiles = async (list: FileList | File[]) => {
    const incoming = Array.from(list);
    if (!incoming.length) return;
    const room = MAX_ATTACHMENTS - files.length;
    if (room <= 0) {
      setNotice(t('Mỗi tin nhắn đính kèm tối đa {count} tệp.', { count: MAX_ATTACHMENTS }));
      return;
    }
    const accepted: PendingAttachment[] = [];
    for (const file of incoming.slice(0, room)) {
      try {
        accepted.push(await prepareAttachment(file));
      } catch (error) {
        setNotice(error instanceof AttachmentError ? t(error.message) : t('Không đọc được tệp.'));
      }
    }
    if (incoming.length > room) {
      setNotice(t('Mỗi tin nhắn đính kèm tối đa {count} tệp.', { count: MAX_ATTACHMENTS }));
    }
    if (accepted.length) setFiles((current) => [...current, ...accepted]);
  };
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith('image/'),
    );
    if (images.length) {
      event.preventDefault();
      void addFiles(images);
    }
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void addFiles(event.dataTransfer.files);
  };

  // ---------------- Giọng nói ----------------
  const toggleDictation = () => {
    if (recognition.listening) {
      recognition.stop();
      return;
    }
    setNotice(null);
    const base = input.trim();
    recognition.start({
      lang: speechLang,
      onInterim: (text) => setInput(base ? `${base} ${text}` : text),
      onFinal: (text) => {
        setInput(base ? `${base} ${text}` : text);
        inputRef.current?.focus();
      },
      onError: (error) =>
        setNotice(
          error === 'not-allowed'
            ? t('Trình duyệt chưa cho phép dùng micro. Hãy bật quyền micro cho trang này.')
            : error === 'no-speech'
              ? t('Mình chưa nghe thấy gì, bạn thử nói lại nhé.')
              : t('Không nhận diện được giọng nói, bạn thử lại nhé.'),
        ),
    });
  };

  const listenRef = useRef<() => void>(() => undefined);
  const listenInVoiceMode = useCallback(() => {
    changeVoice('listening');
    setVoiceTranscript('');
    let heard = false;
    const ok = recognition.start({
      lang: speechLang,
      onInterim: setVoiceTranscript,
      onFinal: (text) => {
        heard = true;
        setVoiceTranscript(text);
        changeVoice('thinking');
        void sendRef.current(text, []).then((reply) => {
          if (voiceRef.current === 'off') return;
          if (!reply) {
            changeVoice('paused');
            return;
          }
          changeVoice('speaking');
          synthesis.speak(reply.id, reply.content, speechLang, () => {
            if (voiceRef.current === 'speaking') listenRef.current();
          });
        });
      },
      onError: (error) => {
        if (error === 'not-allowed') {
          setNotice(t('Trình duyệt chưa cho phép dùng micro. Hãy bật quyền micro cho trang này.'));
          changeVoice('off');
        }
      },
      onEnd: () => {
        if (!heard && voiceRef.current === 'listening') changeVoice('paused');
      },
    });
    if (!ok) changeVoice('off');
  }, [changeVoice, recognition, speechLang, synthesis, t]);

  useEffect(() => {
    messagesRef.current = messages;
    sendRef.current = send;
    listenRef.current = listenInVoiceMode;
  });

  const startVoiceMode = () => {
    setNotice(null);
    setView('chat');
    synthesis.cancel();
    listenInVoiceMode();
  };

  // ---------------- Lịch sử ----------------
  const guestHistory = useMemo(
    () => (member ? [] : guestStore.list()),
    // guestTick buộc đọc lại sau mỗi lần lưu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [member, guestTick, view],
  );
  const conversations: ConversationSummary[] = member ? (history.data?.data ?? []) : guestHistory;
  const filtered = conversations.filter((item) =>
    `${item.title} ${item.preview}`.toLowerCase().includes(historySearch.trim().toLowerCase()),
  );
  const grouped = filtered.reduce<Record<string, ConversationSummary[]>>((groups, item) => {
    const key = dayGroup(item.updated_at);
    (groups[key] ??= []).push(item);
    return groups;
  }, {});

  const resetChat = () => {
    stopVoice();
    setConversationId(null);
    setTitle(null);
    setMessages([]);
    setFiles([]);
    setNotice(null);
  };
  const newChat = () => {
    resetChat();
    setView('chat');
  };

  const openConversation = async (id: string) => {
    stopVoice();
    setNotice(null);
    if (member) {
      try {
        const detail = await queryClient.fetchQuery({
          queryKey: assistantKeys.conversation(id),
          queryFn: ({ signal }) => getConversation(id, signal),
          staleTime: 0,
        });
        setMessages(detail.messages);
        setTitle(detail.title);
      } catch (error) {
        setNotice(errorMessage(error, t));
        return;
      }
    } else {
      const stored = guestStore.get(id);
      if (!stored) return;
      setMessages(stored.messages);
      setTitle(stored.title);
    }
    setConversationId(id);
    setView('chat');
  };

  const saveRename = async () => {
    if (!renaming) return;
    const value = renaming.title.trim();
    if (!value) return setRenaming(null);
    try {
      if (member) {
        await renameConversation(renaming.id, value);
        await queryClient.invalidateQueries({ queryKey: assistantKeys.conversations });
      } else {
        guestStore.rename(renaming.id, value);
        setGuestTick((tick) => tick + 1);
      }
      if (renaming.id === conversationId) setTitle(value);
      setRenaming(null);
    } catch (error) {
      setNotice(errorMessage(error, t));
    }
  };

  const removeConversation = async (id: string) => {
    try {
      if (id === 'all') {
        if (member) await clearConversations();
        else guestStore.clear();
      } else if (member) await deleteConversation(id);
      else guestStore.remove(id);
      if (member) await queryClient.invalidateQueries({ queryKey: assistantKeys.conversations });
      setGuestTick((tick) => tick + 1);
      // Xóa cuộc đang mở: làm trống khung chat nhưng vẫn ở lại danh sách lịch sử.
      if (id === 'all' || id === conversationId) resetChat();
    } catch (error) {
      setNotice(errorMessage(error, t));
    } finally {
      setConfirmDelete(null);
    }
  };

  // ---------------- Giao diện ----------------
  const isAi = status.data?.mode === 'ai';
  const mood: DragonMood =
    voice === 'listening'
      ? 'listening'
      : voice === 'speaking'
        ? 'speaking'
        : sending || voice === 'thinking'
          ? 'thinking'
          : 'happy';
  // Lời chào và câu hỏi gợi ý theo buổi giờ Việt Nam (sáng, trưa, chiều, tối, khuya).
  const moment = dayPartPrompts[dayPart()];
  const greeting = t(moment.greeting);
  const starters = [
    t(moment.starter),
    t('Gợi ý mâm cơm 4 người'),
    t('Món chay dưới 30 phút'),
    t('Tủ lạnh còn trứng và cà chua'),
  ];

  return (
    <div className={`rc-root${open ? ' is-open' : ''}${expanded ? ' is-expanded' : ''}`}>
      {!open && teaser ? (
        <div className="rc-teaser" role="status">
          <button className="rc-teaser__body" onClick={() => openPanel(teaser)} type="button">
            <strong>{t('Chú Rồng')}</strong>
            <span>{t(teaser)}</span>
          </button>
          <button
            aria-label={t('Ẩn lời nhắn')}
            className="rc-teaser__close"
            onClick={dismissTeaser}
            type="button"
          >
            <AppIcon name="close" size={13} />
          </button>
        </div>
      ) : null}

      {!open ? (
        <button
          aria-label={t('Mở trợ lý Chú Rồng')}
          className="rc-launcher"
          onClick={() => openPanel()}
          ref={launcherRef}
          type="button"
        >
          <DragonMascot mood={teaser ? 'happy' : 'idle'} size={96} />
          <span aria-hidden="true" className="rc-launcher__label">
            {t('Hỏi Chú Rồng')}
          </span>
          {unread ? <span className="rc-launcher__dot" aria-hidden="true" /> : null}
        </button>
      ) : null}

      {open ? (
        <section
          aria-label={t('Trò chuyện với Chú Rồng')}
          aria-modal={false}
          className={`rc-panel${dragging ? ' is-dragging' : ''}`}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDragging(false);
          }}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) {
              event.preventDefault();
              setDragging(true);
            }
          }}
          onDrop={onDrop}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            if (voice !== 'off') stopVoice();
            else if (view === 'history') setView('chat');
            else closePanel();
          }}
          role="dialog"
        >
          <header className="rc-header">
            <span className="rc-header__avatar" aria-hidden="true">
              <DragonMascot mood={mood} size={68} />
            </span>
            <div className="rc-header__title">
              <strong>{t('Chú Rồng')}</strong>
              <small>
                <span className="rc-header__status" aria-hidden="true" />
                {isAi ? t('Trợ lý AI của Bếp Việt') : t('Trợ lý bếp · luôn sẵn sàng')}
              </small>
            </div>
            <div className="rc-header__actions">
              <button
                aria-label={t('Trò chuyện mới')}
                className="rc-icon-button"
                onClick={newChat}
                title={t('Trò chuyện mới')}
                type="button"
              >
                <AppIcon name="plus" size={18} />
              </button>
              <button
                aria-label={t('Lịch sử trò chuyện')}
                aria-pressed={view === 'history'}
                className="rc-icon-button"
                onClick={() => setView((current) => (current === 'history' ? 'chat' : 'history'))}
                title={t('Lịch sử trò chuyện')}
                type="button"
              >
                <AppIcon name="history" size={18} />
              </button>
              <button
                aria-label={expanded ? t('Thu nhỏ cửa sổ') : t('Mở rộng cửa sổ')}
                className="rc-icon-button rc-hide-mobile"
                onClick={() => setExpanded((current) => !current)}
                title={expanded ? t('Thu nhỏ') : t('Mở rộng')}
                type="button"
              >
                <AppIcon name={expanded ? 'collapse' : 'expand'} size={17} />
              </button>
              <button
                aria-label={t('Đóng trò chuyện')}
                className="rc-icon-button"
                onClick={closePanel}
                title={t('Đóng')}
                type="button"
              >
                <AppIcon name="close" size={18} />
              </button>
            </div>
          </header>

          {view === 'history' ? (
            <div className="rc-history">
              <div className="rc-history__top">
                <label className="rc-history__search">
                  <AppIcon name="search" size={16} />
                  <input
                    aria-label={t('Tìm trong lịch sử')}
                    onChange={(event) => setHistorySearch(event.target.value)}
                    placeholder={t('Tìm cuộc trò chuyện…')}
                    value={historySearch}
                  />
                </label>
                <button className="rc-history__new" onClick={newChat} type="button">
                  <AppIcon name="plus" size={15} /> {t('Mới')}
                </button>
              </div>
              {!member ? (
                <p className="rc-history__hint">
                  <AppIcon name="lock" size={13} />{' '}
                  {t('Lịch sử đang lưu trên trình duyệt này. Đăng nhập để lưu vào tài khoản.')}
                </p>
              ) : null}
              {member && history.isLoading ? (
                <p className="rc-history__empty">{t('Đang tải lịch sử…')}</p>
              ) : filtered.length === 0 ? (
                <div className="rc-history__empty">
                  <DragonMascot mood="idle" size={84} still />
                  <p>
                    {historySearch
                      ? t('Không tìm thấy cuộc trò chuyện phù hợp.')
                      : t('Chưa có cuộc trò chuyện nào. Hỏi Chú Rồng điều gì đó nhé!')}
                  </p>
                </div>
              ) : (
                <div className="rc-history__groups">
                  {Object.entries(grouped).map(([group, items]) => (
                    <section key={group}>
                      <h3>{t(group)}</h3>
                      <ul>
                        {items.map((item) => (
                          <li
                            className={item.id === conversationId ? 'is-active' : ''}
                            key={item.id}
                          >
                            {renaming?.id === item.id ? (
                              <form
                                className="rc-history__rename"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  void saveRename();
                                }}
                              >
                                <input
                                  aria-label={t('Tên cuộc trò chuyện')}
                                  autoFocus
                                  maxLength={120}
                                  onChange={(event) =>
                                    setRenaming({ id: item.id, title: event.target.value })
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === 'Escape') {
                                      event.stopPropagation();
                                      setRenaming(null);
                                    }
                                  }}
                                  value={renaming.title}
                                />
                                <button aria-label={t('Lưu tên')} type="submit">
                                  <AppIcon name="check" size={15} />
                                </button>
                              </form>
                            ) : confirmDelete === item.id ? (
                              <div className="rc-history__confirm">
                                <span>{t('Xóa cuộc trò chuyện này?')}</span>
                                <button
                                  className="is-danger"
                                  onClick={() => void removeConversation(item.id)}
                                  type="button"
                                >
                                  {t('Xóa')}
                                </button>
                                <button onClick={() => setConfirmDelete(null)} type="button">
                                  {t('Hủy')}
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  className="rc-history__item"
                                  onClick={() => void openConversation(item.id)}
                                  type="button"
                                >
                                  <strong>{item.title}</strong>
                                  <small>{item.preview || t('Chưa có câu trả lời')}</small>
                                  <time dateTime={item.updated_at}>
                                    {formatDate(item.updated_at, {
                                      day: '2-digit',
                                      month: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </time>
                                </button>
                                <span className="rc-history__tools">
                                  <button
                                    aria-label={t('Đổi tên {title}', { title: item.title })}
                                    onClick={() => setRenaming({ id: item.id, title: item.title })}
                                    type="button"
                                  >
                                    <AppIcon name="pen" size={14} />
                                  </button>
                                  <button
                                    aria-label={t('Xóa {title}', { title: item.title })}
                                    onClick={() => setConfirmDelete(item.id)}
                                    type="button"
                                  >
                                    <AppIcon name="trash" size={14} />
                                  </button>
                                </span>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
              {conversations.length ? (
                <footer className="rc-history__footer">
                  {confirmDelete === 'all' ? (
                    <div className="rc-history__confirm">
                      <span>{t('Xóa toàn bộ lịch sử?')}</span>
                      <button
                        className="is-danger"
                        onClick={() => void removeConversation('all')}
                        type="button"
                      >
                        {t('Xóa hết')}
                      </button>
                      <button onClick={() => setConfirmDelete(null)} type="button">
                        {t('Hủy')}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="rc-history__clear"
                      onClick={() => setConfirmDelete('all')}
                      type="button"
                    >
                      <AppIcon name="trash" size={14} /> {t('Xóa toàn bộ lịch sử')}
                    </button>
                  )}
                </footer>
              ) : null}
            </div>
          ) : (
            <>
              {title && messages.length ? (
                <div className="rc-thread-title" title={title}>
                  {title}
                </div>
              ) : null}
              <ol aria-live="polite" className="rc-log" ref={logRef}>
                {messages.length === 0 ? (
                  <li className="rc-welcome">
                    <DragonMascot mood="happy" size={132} />
                    <h2>{greeting}</h2>
                    <p>
                      {t(
                        'Mình là Chú Rồng — kể mình nghe nguyên liệu bạn có, khẩu vị hay thời gian rảnh, mình gợi ý món ngay!',
                      )}
                    </p>
                    <div className="rc-suggestions">
                      {starters.map((starter) => (
                        <button key={starter} onClick={() => void send(starter, [])} type="button">
                          {starter}
                        </button>
                      ))}
                    </div>
                  </li>
                ) : (
                  messages.map((message, index) => (
                    <AssistantMessageView
                      canSpeak={synthesis.supported}
                      isLatest={index === messages.length - 1}
                      key={message.id}
                      message={message}
                      onNavigate={() => setExpanded(false)}
                      onRetry={() => retry(message)}
                      onSpeak={() =>
                        synthesis.speakingId === message.id
                          ? synthesis.cancel()
                          : synthesis.speak(message.id, message.content, speechLang)
                      }
                      onSuggestion={(text) => void send(text, [])}
                      speaking={synthesis.speakingId === message.id}
                    />
                  ))
                )}
                {sending && streamText ? (
                  <AssistantMessageView
                    canSpeak={false}
                    isLatest={false}
                    message={{
                      id: 'streaming',
                      role: 'assistant',
                      content: streamingText(streamText),
                      created_at: new Date().toISOString(),
                      recipes: [],
                      suggestions: [],
                      actions: [],
                      attachments: [],
                      mode: 'ai',
                    }}
                    onNavigate={() => setExpanded(false)}
                    onRetry={() => undefined}
                    onSpeak={() => undefined}
                    onSuggestion={() => undefined}
                    speaking={false}
                  />
                ) : sending ? (
                  <li
                    className="rc-message is-bot rc-typing"
                    aria-label={t('Chú Rồng đang soạn trả lời')}
                  >
                    <span aria-hidden="true" className="rc-message__avatar">
                      <DragonMascot mood="thinking" size={36} variant="face" />
                    </span>
                    <div className="rc-message__bubble">
                      <span className="rc-typing__dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    </div>
                  </li>
                ) : null}
              </ol>

              {voice !== 'off' ? (
                <div className="rc-voice" role="status">
                  <div className={`rc-voice__orb is-${voice}`}>
                    <DragonMascot mood={mood} size={150} />
                  </div>
                  <strong>
                    {voice === 'listening'
                      ? t('Chú Rồng đang nghe…')
                      : voice === 'thinking'
                        ? t('Chú Rồng đang nghĩ…')
                        : voice === 'speaking'
                          ? t('Chú Rồng đang trả lời…')
                          : t('Mình chưa nghe rõ')}
                  </strong>
                  <p>{voiceTranscript || t('Hãy nói điều bạn muốn hỏi, ví dụ “Tối nay ăn gì?”')}</p>
                  <div className="rc-voice__actions">
                    {voice === 'paused' ? (
                      <button
                        className="rc-voice__primary"
                        onClick={listenInVoiceMode}
                        type="button"
                      >
                        <AppIcon name="mic" size={16} /> {t('Nói tiếp')}
                      </button>
                    ) : null}
                    {voice === 'speaking' ? (
                      <button
                        onClick={() => {
                          synthesis.cancel();
                          listenInVoiceMode();
                        }}
                        type="button"
                      >
                        <AppIcon name="skipForward" size={16} /> {t('Bỏ qua')}
                      </button>
                    ) : null}
                    <button className="rc-voice__stop" onClick={stopVoice} type="button">
                      <AppIcon name="stop" size={16} /> {t('Kết thúc')}
                    </button>
                  </div>
                </div>
              ) : null}

              {notice ? (
                <p className="rc-notice" role="alert">
                  <span>{notice}</span>
                  <button
                    aria-label={t('Đóng thông báo')}
                    onClick={() => setNotice(null)}
                    type="button"
                  >
                    <AppIcon name="close" size={13} />
                  </button>
                </p>
              ) : null}

              <form className="rc-composer" onSubmit={submit}>
                {files.length ? (
                  <ul className="rc-composer__files" aria-label={t('Tệp sẽ gửi')}>
                    {files.map((file) => (
                      <li key={file.id}>
                        {file.thumbnail ? (
                          <img alt="" src={file.thumbnail} />
                        ) : (
                          <AppIcon name="file" size={16} />
                        )}
                        <span>
                          <strong>{file.name}</strong>
                          <small>{formatSize(file.size)}</small>
                        </span>
                        <button
                          aria-label={t('Bỏ tệp {name}', { name: file.name })}
                          onClick={() =>
                            setFiles((current) => current.filter((item) => item.id !== file.id))
                          }
                          type="button"
                        >
                          <AppIcon name="close" size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="rc-composer__row">
                  <button
                    aria-label={t('Đính kèm ảnh hoặc tệp')}
                    className="rc-composer__tool"
                    disabled={files.length >= MAX_ATTACHMENTS || voice !== 'off'}
                    onClick={() => fileRef.current?.click()}
                    title={t('Đính kèm ảnh, PDF hoặc tệp văn bản')}
                    type="button"
                  >
                    <AppIcon name="paperclip" size={18} />
                  </button>
                  <input
                    accept={ACCEPT_ATTR}
                    className="visually-hidden"
                    multiple
                    onChange={(event) => {
                      if (event.target.files) void addFiles(event.target.files);
                      event.target.value = '';
                    }}
                    ref={fileRef}
                    tabIndex={-1}
                    type="file"
                  />
                  <textarea
                    aria-label={t('Nhập tin nhắn cho Chú Rồng')}
                    disabled={voice !== 'off'}
                    maxLength={2000}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={onComposerKey}
                    onPaste={onPaste}
                    placeholder={
                      recognition.listening ? t('Đang nghe bạn nói…') : t('Hỏi Chú Rồng về món ăn…')
                    }
                    ref={inputRef}
                    rows={1}
                    value={input}
                  />
                  <button
                    aria-label={recognition.listening ? t('Dừng ghi âm') : t('Nói thay vì gõ')}
                    aria-pressed={recognition.listening && voice === 'off'}
                    className={`rc-composer__tool${recognition.listening && voice === 'off' ? ' is-recording' : ''}`}
                    disabled={!recognition.supported || voice !== 'off'}
                    onClick={toggleDictation}
                    title={
                      recognition.supported
                        ? t('Nhập bằng giọng nói')
                        : t('Trình duyệt này chưa hỗ trợ nhận diện giọng nói')
                    }
                    type="button"
                  >
                    <AppIcon name="mic" size={18} />
                  </button>
                  {input.trim() || files.length ? (
                    <button
                      aria-label={t('Gửi tin nhắn')}
                      className="rc-composer__send"
                      disabled={sending}
                      type="submit"
                    >
                      <AppIcon name="send" size={17} />
                    </button>
                  ) : (
                    <button
                      aria-label={t('Trò chuyện bằng giọng nói')}
                      className="rc-composer__send is-voice"
                      disabled={!recognition.supported || !synthesis.supported || sending}
                      onClick={voice === 'off' ? startVoiceMode : stopVoice}
                      title={
                        recognition.supported && synthesis.supported
                          ? t('Trò chuyện rảnh tay bằng giọng nói')
                          : t('Trình duyệt này chưa hỗ trợ trò chuyện bằng giọng nói')
                      }
                      type="button"
                    >
                      <AppIcon name="headphones" size={17} />
                    </button>
                  )}
                </div>
                <p className="rc-composer__hint">
                  {t('Chú Rồng có thể nhầm, hãy kiểm tra lại công thức trước khi nấu.')}
                </p>
              </form>
              {dragging ? (
                <div className="rc-dropzone" aria-hidden="true">
                  <AppIcon name="upload" size={28} />
                  <strong>{t('Thả ảnh hoặc tệp vào đây')}</strong>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
