import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { DragonMascot, type DragonMood } from '@/components/assistant/DragonMascot';
import { useLipSync } from '@/components/assistant/lipSync';
import { AppIcon } from '@/components/common/AppIcon';
import { type Recipe } from '@/data/recipes';
import { useUserPreferences } from '@/features/account/preferences';
import { sendAssistantMessage } from '@/features/assistant/assistantApi';
import { useSpeechRecognition } from '@/features/assistant/useSpeech';
import {
  closeTimerNotification,
  enableTimerNotifications,
  notificationPermission,
  registerCookWorker,
  requestWakeLock,
  showTimerNotification,
  startRinging,
  stopRinging,
  unlockAudio,
  type PushState,
} from '@/features/cooking/alarm';
import {
  askCompanion,
  getPushConfig,
  logCooked,
  savePushSubscription,
  type CompanionReply,
} from '@/features/cooking/cookingApi';
import { stepSpeech, voiceLines } from '@/features/cooking/cookScript';
import {
  buildCookSteps,
  loadProgress,
  parseCookDishes,
  saveProgress,
  type CookProgress,
  type CookStep,
} from '@/features/cooking/cookSession';
import {
  clockText,
  formatClock,
  parseSpokenDuration,
  roughDuration,
  spokenDuration,
  type ClockTarget,
} from '@/features/cooking/durations';
import { speakSequence } from '@/features/cooking/speech';
import {
  isRinging,
  MIN_TIMER_SECONDS,
  pickTimer,
  useCookTimers,
  type CookTimer,
} from '@/features/cooking/useCookTimers';
import {
  isBargeInStop,
  parseVoiceCommand,
  type AdjustMode,
  type VoiceCommand,
} from '@/features/cooking/voiceCommands';
import { useI18n } from '@/features/i18n/I18nContext';
import { useRecipeCatalog } from '@/features/i18n/recipeContent';
import { errorMessage } from '@/lib/errors';

type Phase = 'intro' | 'cooking' | 'done';
type Dish = { recipe: Recipe; servings: number; planItemId?: string };

const SNOOZE_SECONDS = 300;
// Im lặng quá lâu ở một bước (không có chuông nào chạy): Chú Rồng hỏi thăm một lần.
const CHECK_IN_MS = 4 * 60 * 1000;
// Câu lệnh rõ ràng, ngắn: xử lý ngay trên máy cho nhanh; câu khác hỏi AI phụ bếp.
const QUICK_COMMANDS = new Set<VoiceCommand['type']>([
  'done',
  'notDone',
  'repeat',
  'back',
  'stopAlarm',
  'pause',
  'exit',
  'timerStatus',
  'ingredients',
]);
// Lệnh về chuông có thể dài hơn ("thêm 5 phút cho nồi xương"), vẫn xử lý ngay trên máy.
const TIMER_COMMANDS = new Set<VoiceCommand['type']>(['adjustTimer', 'cancelTimer', 'timerStatus']);
const ALARM_REPLIES = new Set<VoiceCommand['type']>(['done', 'stopAlarm', 'notDone']);
const MAX_LOG = 6;
const COMPANION_TIMEOUT_MS = 10_000;
// Ngắt lời: nghe từ khóa dừng cả khi rồng đang nói (chờ một nhịp để không bắt tiếng đầu câu).
// Trên điện thoại, bật micro lúc đang phát giọng hay làm tắt tiếng/ngắt giọng đọc nên chỉ dùng nút.
const BARGE_IN_DELAY_MS = 700;
const BARGE_IN_SUPPORTED =
  typeof navigator !== 'undefined' && !/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

type Talk = { id: number; role: 'user' | 'dragon'; text: string };

/** Giờ trên máy người dùng (giây kể từ nửa đêm) cho câu "báo mình lúc 7 giờ tối". */
function localSeconds() {
  const date = new Date();
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

export function CookModePage() {
  const [params] = useSearchParams();
  const catalog = useRecipeCatalog();
  const { isPersonal, preferences } = useUserPreferences();
  const { t } = useI18n();
  const household = isPersonal ? preferences.computed_servings : null;
  const dishParams = params.getAll('dish');
  const key = dishParams.join('|');
  const dishes = useMemo<Dish[]>(
    () =>
      parseCookDishes(key ? key.split('|') : []).flatMap((dish) => {
        const recipe = catalog.find((item) => item.slug === dish.slug);
        return recipe
          ? [
              {
                recipe,
                servings: dish.servings || household || recipe.servings,
                planItemId: dish.planItemId,
              },
            ]
          : [];
      }),
    [catalog, household, key],
  );
  if (!dishes.length) {
    return (
      <div className="cook cook--empty">
        <div className="cook-empty">
          <AppIcon name="chef" size={36} />
          <h1>{t('Chưa chọn món để vào bếp')}</h1>
          <p>{t('Mở một món ăn hoặc một bữa trong kế hoạch rồi bấm "Vào bếp" nhé.')}</p>
          <Link className="button button--primary" to="/recipes">
            {t('Chọn món')}
          </Link>
        </div>
      </div>
    );
  }
  return <CookSession dishes={dishes} sessionKey={key} />;
}

function CookSession({ dishes, sessionKey }: { dishes: Dish[]; sessionKey: string }) {
  const { language, t } = useI18n();
  const lines = voiceLines[language];
  const speechLang = language === 'vi' ? 'vi-VN' : 'en-US';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const steps = useMemo(() => buildCookSteps(dishes, language), [dishes, language]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [progress, setProgress] = useState<CookProgress>(
    () =>
      loadProgress(sessionKey) ?? {
        key: sessionKey,
        stepIndex: 0,
        startedAt: Date.now(),
        dishStartedAt: {},
        logged: [],
      },
  );
  const stepIndex = Math.min(progress.stepIndex, steps.length - 1);
  const step = steps[stepIndex]!;
  const dish = dishes[step.dishIndex]!;
  const [voiceOn, setVoiceOn] = useState(true);
  const [heard, setHeard] = useState('');
  const [notice, setNotice] = useState('');
  // Hội thoại gần nhất hiện cạnh Chú Rồng; trạng thái nói/khẩu hình/cảm xúc của rồng.
  const [talkLog, setTalkLog] = useState<Talk[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [flash, setFlash] = useState<DragonMood | null>(null);
  const [typed, setTyped] = useState('');
  const talkId = useRef(0);
  const logRef = useRef<HTMLOListElement>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  // Khẩu hình theo âm tiết của câu đang đọc (tự căn lại theo sự kiện ranh giới từ của giọng).
  const { viseme, openness, begin: lipBegin, sync: lipSync, end: lipEnd } = useLipSync();
  const [pushState, setPushState] = useState<PushState>(() => {
    const permission = notificationPermission();
    return permission;
  });
  const [customMinutes, setCustomMinutes] = useState('10');
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const returnPath = `/cook?${new URLSearchParams(sessionKey.split('|').map((value) => ['dish', value])).toString()}`;
  const exitPath = dishes.some((item) => item.planItemId)
    ? '/planner'
    : `/recipes/${dishes[0]!.recipe.slug}`;

  // --- Giọng nói: đọc xong mới nghe, nghe xong thì xử lý rồi lại đọc -------------------------
  const recognition = useSpeechRecognition();
  const { abort: abortRecognition, start: startRecognition } = recognition;
  const voiceOnRef = useRef(voiceOn);
  const speakingRef = useRef(false);
  const sayToken = useRef(0);
  const cancelSpeech = useRef<() => void>(() => undefined);
  const restartTimer = useRef<number | undefined>(undefined);
  const listenRef = useRef<() => void>(() => undefined);
  const handleRef = useRef<(text: string) => void>(() => undefined);
  const conversationRef = useRef<string | null>(null);
  const bargeTimer = useRef<number | undefined>(undefined);
  const bargeInRef = useRef<(token: number, text: string) => void>(() => undefined);
  const stopCommandRef = useRef<() => void>(() => undefined);

  const pushTalk = useCallback((role: Talk['role'], text: string) => {
    const id = ++talkId.current;
    setTalkLog((current) => [...current, { id, role, text }].slice(-MAX_LOG));
  }, []);

  const showMood = useCallback((mood: DragonMood, ms = 2600) => {
    setFlash(mood);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), ms);
  }, []);

  const say = useCallback(
    (text: string) => {
      pushTalk('dragon', text);
      const token = ++sayToken.current;
      if (!voiceOnRef.current) return;
      window.clearTimeout(restartTimer.current);
      abortRecognition();
      speakingRef.current = true;
      setSpeaking(true);
      lipEnd();
      cancelSpeech.current = speakSequence(
        text,
        speechLang,
        () => {
          if (token !== sayToken.current) return;
          lipEnd();
          speakingRef.current = false;
          setSpeaking(false);
          listenRef.current();
        },
        (_length, charIndex) => {
          if (token === sayToken.current) lipSync(charIndex);
        },
        (spoken) => {
          if (token === sayToken.current) lipBegin(spoken);
        },
      );
      // Nghe từ khóa "dừng" trong lúc đang nói (ngắt lời).
      window.clearTimeout(bargeTimer.current);
      bargeTimer.current = window.setTimeout(
        () => bargeInRef.current(token, text),
        BARGE_IN_DELAY_MS,
      );
    },
    [abortRecognition, pushTalk, speechLang, lipBegin, lipSync, lipEnd],
  );

  const listen = useCallback(() => {
    if (!voiceOnRef.current || speakingRef.current || !recognition.supported) return;
    let finalText = '';
    const started = startRecognition({
      lang: speechLang,
      onInterim: setHeard,
      onFinal: (text) => {
        finalText = text;
      },
      onError: (error) => {
        if (error === 'not-allowed') {
          voiceOnRef.current = false;
          setVoiceOn(false);
          setNotice(lines.noMic);
        }
      },
      onEnd: () => {
        if (finalText) {
          setHeard(finalText);
          handleRef.current(finalText);
          return;
        }
        // Im lặng quá lâu thì trình duyệt tự dừng nghe: nghe lại ngay.
        if (voiceOnRef.current && !speakingRef.current) {
          restartTimer.current = window.setTimeout(() => listenRef.current(), 400);
        }
      },
    });
    if (!started && voiceOnRef.current) {
      restartTimer.current = window.setTimeout(() => listenRef.current(), 1500);
    }
  }, [lines.noMic, recognition.supported, startRecognition, speechLang]);

  useEffect(() => {
    listenRef.current = listen;
  }, [listen]);

  /**
   * Ngắt lời: trong lúc rồng nói, micro chỉ chờ từ khóa dừng ("dừng lại", "thôi", "stop"), bỏ qua
   * mọi thứ khác (kể cả tiếng rồng lọt vào micro). Nghe được thì dừng nói như bấm nút.
   */
  const bargeIn = useCallback(
    (token: number, spokenText: string) => {
      if (!BARGE_IN_SUPPORTED || !recognition.supported || !voiceOnRef.current) return;
      if (token !== sayToken.current || !speakingRef.current) return;
      const check = (heard: string) => {
        if (token === sayToken.current && speakingRef.current && isBargeInStop(heard, spokenText)) {
          stopCommandRef.current();
        }
      };
      startRecognition({
        lang: speechLang,
        onInterim: check,
        onFinal: check,
        onEnd: () => {
          if (token !== sayToken.current || !speakingRef.current) return;
          bargeTimer.current = window.setTimeout(() => bargeInRef.current(token, spokenText), 300);
        },
      });
    },
    [recognition.supported, speechLang, startRecognition],
  );

  useEffect(() => {
    bargeInRef.current = bargeIn;
  }, [bargeIn]);

  /** Nút/lệnh "Dừng nói": im ngay, không thoát chế độ nấu, không tắt chuông, không đổi bước. */
  const stopSpeaking = useCallback(() => {
    sayToken.current += 1;
    window.clearTimeout(bargeTimer.current);
    cancelSpeech.current();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window)
      window.speechSynthesis.cancel();
    speakingRef.current = false;
    setSpeaking(false);
    lipEnd();
    abortRecognition();
    listenRef.current();
  }, [abortRecognition, lipEnd]);

  const stopVoice = useCallback(() => {
    voiceOnRef.current = false;
    sayToken.current += 1;
    window.clearTimeout(restartTimer.current);
    window.clearTimeout(bargeTimer.current);
    cancelSpeech.current();
    speakingRef.current = false;
    setSpeaking(false);
    lipEnd();
    abortRecognition();
  }, [abortRecognition, lipEnd]);

  useEffect(() => stopVoice, [stopVoice]);

  // --- Chuông hẹn giờ -------------------------------------------------------------------------
  const onRing = useCallback(
    (timer: CookTimer) => {
      if (document.visibilityState !== 'visible') {
        void showTimerNotification({
          id: timer.id,
          label: timer.label,
          url: `${returnPath}&timer=${timer.id}`,
        });
      }
      say(lines.ring(timer.label));
    },
    [lines, returnPath, say],
  );
  const { timers, now, start, snooze, adjust, finish } = useCookTimers({ returnPath, onRing });
  const ringingTimers = timers.filter((timer) => isRinging(timer, now));
  const hasRinging = ringingTimers.length > 0;

  useEffect(() => {
    if (hasRinging) startRinging();
    else stopRinging();
  }, [hasRinging]);
  useEffect(() => stopRinging, []);

  const timerLabel = () =>
    step.kind === 'cooking' || step.kind === 'preparation'
      ? `${dish.recipe.name} – ${step.text.slice(0, 48)}${step.text.length > 48 ? '…' : ''}`
      : dish.recipe.name;

  const startTimer = (seconds: number, label?: string) => {
    const name = label ?? timerLabel();
    start(name, seconds, dish.recipe.slug);
    say(lines.timerSet(spokenDuration(seconds, language), name, pushState === 'push'));
  };

  const stopAlarm = (timer: CookTimer, action: 'done' | 'snooze', seconds = SNOOZE_SECONDS) => {
    void closeTimerNotification(timer.id);
    if (action === 'done') {
      finish(timer.id);
      say(lines.alarmDone(timer.label));
    } else {
      snooze(timer.id, seconds);
      say(lines.snoozed(timer.label, spokenDuration(seconds, language)));
    }
  };

  // --- Chọn/chỉnh/hủy chuông bằng lời -------------------------------------------------------
  const labelsOf = (list: CookTimer[]) => list.map((timer) => timer.label).join(', ');

  /** Chuông người dùng nói tới; không rõ thì rồng hỏi lại và trả về null. */
  const resolveTimer = (target: string | undefined, fallback: 'latest' | 'ask') => {
    const pick = pickTimer(timers, target, Date.now(), fallback);
    if (pick.kind === 'one') return pick.timer;
    if (pick.kind === 'none') say(lines.noTimers);
    else if (pick.kind === 'missing') say(lines.timerMissing(target ?? '', labelsOf(timers)));
    else say(lines.whichTimer(labelsOf(pick.timers)));
    return null;
  };

  /** Thêm/bớt/đổi thời gian còn lại của chuông rồi xác nhận ngắn ("còn 12 phút"). */
  const changeTimer = (timer: CookTimer, mode: AdjustMode, seconds: number) => {
    const remaining = Math.max(0, Math.round((timer.dueAt - Date.now()) / 1000));
    const target =
      mode === 'add' ? remaining + seconds : mode === 'subtract' ? remaining - seconds : seconds;
    if (target < MIN_TIMER_SECONDS) {
      return say(lines.cantShorten(timer.label, roughDuration(remaining, language)));
    }
    void closeTimerNotification(timer.id);
    const left = adjust(timer.id, target);
    say(
      lines.adjusted(
        mode,
        timer.label,
        spokenDuration(seconds, language),
        roughDuration(left, language),
      ),
    );
  };

  const cancelTimers = (list: CookTimer[]) => {
    for (const timer of list) {
      void closeTimerNotification(timer.id);
      finish(timer.id, isRinging(timer, Date.now()) ? 'done' : 'cancel');
    }
  };

  const startClockTimer = (clock: ClockTarget, label?: string) => {
    const time = clockText(clock.hour, clock.minute);
    start(label ?? lines.clockLabel(time), clock.seconds, dish.recipe.slug);
    say(lines.timerAt(time, roughDuration(clock.seconds, language), clock.tomorrow));
  };

  // Bấm nút trên thông báo hệ thống (service worker gửi về) hoặc mở trang từ thông báo.
  const alarmRef = useRef(stopAlarm);
  useEffect(() => {
    alarmRef.current = stopAlarm;
  });
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (
      event: MessageEvent<{ type?: string; timerId?: string; action?: string }>,
    ) => {
      if (event.data?.type !== 'cook-timer-action' || !event.data.timerId) return;
      const timer = timers.find((item) => item.id === event.data.timerId);
      if (!timer) return;
      if (event.data.action === 'done' || event.data.action === 'snooze') {
        alarmRef.current(timer, event.data.action);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [timers]);
  const timerAction = params.get('timerAction');
  const timerParam = params.get('timer');
  useEffect(() => {
    if (!timerParam) return;
    const timer = timers.find((item) => item.id === timerParam);
    if (timer && (timerAction === 'done' || timerAction === 'snooze')) {
      alarmRef.current(timer, timerAction);
    }
    const next = new URLSearchParams(params);
    next.delete('timer');
    next.delete('timerAction');
    setParams(next, { replace: true });
  }, [params, setParams, timerAction, timerParam, timers]);

  // --- Tiến độ, ghi nhận đã nấu -------------------------------------------------------------
  useEffect(() => {
    saveProgress(phase === 'done' ? null : progress);
  }, [phase, progress]);

  const logMutation = useMutation({
    mutationFn: (target: { dish: Dish; startedAt?: number }) =>
      logCooked({
        recipe_slug: target.dish.recipe.slug,
        servings: target.dish.servings,
        source: 'cook_mode',
        ...(target.dish.planItemId ? { plan_item_id: target.dish.planItemId } : {}),
        ...(target.startedAt
          ? {
              started_at: new Date(target.startedAt).toISOString(),
              duration_seconds: Math.round((Date.now() - target.startedAt) / 1000),
            }
          : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cook-logs'] });
      void queryClient.invalidateQueries({ queryKey: ['planner-items'] });
      void queryClient.invalidateQueries({ queryKey: ['planner-meal-history'] });
      void queryClient.invalidateQueries({ queryKey: ['planner-history'] });
    },
  });

  const context = (target: CookStep) => ({
    dishName: dishes[target.dishIndex]!.recipe.name,
    servings: dishes[target.dishIndex]!.servings,
    dishNumber: target.dishIndex + 1,
    dishCount: dishes.length,
  });

  const goTo = (index: number, prefix = '') => {
    const target = steps[index]!;
    const slug = dishes[target.dishIndex]!.recipe.slug;
    setProgress((current) => ({
      ...current,
      stepIndex: index,
      dishStartedAt: current.dishStartedAt[slug]
        ? current.dishStartedAt
        : { ...current.dishStartedAt, [slug]: Date.now() },
    }));
    say(`${prefix}${stepSpeech(target, context(target), language)}`);
  };

  const completeStep = (lead = '') => {
    if (step.kind !== 'finish') {
      goTo(stepIndex + 1, lead ? `${lead} ` : '');
      return;
    }
    let prefix = lead ? `${lead} ` : '';
    if (!progress.logged.includes(dish.recipe.slug)) {
      logMutation.mutate({ dish, startedAt: progress.dishStartedAt[dish.recipe.slug] });
      setProgress((current) => ({ ...current, logged: [...current.logged, dish.recipe.slug] }));
      prefix += `${lines.logged(dish.recipe.name)} `;
    }
    if (stepIndex + 1 < steps.length) {
      goTo(stepIndex + 1, prefix);
      return;
    }
    setPhase('done');
    const seconds = Math.max(60, Math.round((Date.now() - progress.startedAt) / 1000));
    say(
      `${prefix}${lines.finished(dishes.length, spokenDuration(seconds - (seconds % 60), language))}`,
    );
  };

  const askAssistant = useMutation({
    mutationFn: (question: string) =>
      sendAssistantMessage({
        message:
          language === 'vi'
            ? `[Mình đang nấu ${dish.recipe.name}, tới bước: "${step.text || step.kind}"] ${question}`
            : `[I'm cooking ${dish.recipe.name}, at the step: "${step.text || step.kind}"] ${question}`,
        language,
        conversation_id: conversationRef.current,
      }),
    onSuccess: (result) => {
      conversationRef.current = result.conversation_id;
      say(`${result.reply.content} ${lines.answerTail}`);
    },
    onError: () => say(lines.answerFailed),
  });

  const runCommand = (command: VoiceCommand) => {
    const alarm = ringingTimers.at(-1);
    if (alarm) {
      if (command.type === 'done' || command.type === 'stopAlarm') return stopAlarm(alarm, 'done');
      if (command.type === 'notDone') return stopAlarm(alarm, 'snooze');
      if (command.type === 'adjustTimer' && command.mode === 'add' && !command.target) {
        return stopAlarm(alarm, 'snooze', command.seconds);
      }
      if (command.type === 'stopSpeaking') {
        // "Dừng đi" khi chuông đang kêu: tắt chuông và im luôn (chỉ ghi vào khung hội thoại).
        void closeTimerNotification(alarm.id);
        finish(alarm.id);
        stopSpeaking();
        pushTalk('dragon', lines.alarmDone(alarm.label));
        return;
      }
    }
    switch (command.type) {
      case 'done':
        return completeStep();
      case 'notDone':
        return say(
          lines.waiting(
            step.kind === 'ingredients' ? lines.ingredients(step.items ?? []) : step.text,
          ),
        );
      case 'repeat':
        return say(stepSpeech(step, context(step), language));
      case 'back':
        return stepIndex > 0 ? goTo(stepIndex - 1, `${lines.back} `) : say(lines.first);
      case 'ingredients': {
        const first = steps.find((item) => item.dishIndex === step.dishIndex);
        return say(lines.ingredients(first?.items ?? []));
      }
      case 'stopSpeaking':
        return stopSpeaking();
      case 'timer': {
        if (command.clock) return startClockTimer(command.clock, command.label);
        const seconds = command.seconds ?? step.timerSeconds;
        return seconds ? startTimer(seconds, command.label) : say(lines.askDuration);
      }
      case 'timers': {
        const items = command.timers.map((item) => ({
          ...item,
          label: item.label ?? timerLabel(),
        }));
        for (const item of items) start(item.label, item.seconds, dish.recipe.slug);
        return say(
          lines.timersSet(
            items.map((item) =>
              lines.timerItem(spokenDuration(item.seconds, language), item.label),
            ),
          ),
        );
      }
      case 'adjustTimer': {
        // Chưa có chuông: "thêm 5 phút" nghĩa là chờ thêm 5 phút → đặt chuông mới.
        if (!timers.length) {
          return command.mode === 'add' ? startTimer(command.seconds) : say(lines.noTimers);
        }
        const timer = resolveTimer(command.target, 'latest');
        return timer ? changeTimer(timer, command.mode, command.seconds) : undefined;
      }
      case 'cancelTimer': {
        if (!timers.length) return say(lines.noTimers);
        if (command.all) {
          const count = timers.length;
          cancelTimers(timers);
          return say(lines.cancelledAll(count));
        }
        // Hủy là thao tác mất dữ liệu: nhiều chuông mà không nêu tên thì hỏi lại.
        const timer = resolveTimer(command.target, 'ask');
        if (!timer) return;
        cancelTimers([timer]);
        return say(lines.cancelled(timer.label));
      }
      case 'stopAlarm':
        return say(timers.length ? lines.noRinging : lines.noTimers);
      case 'timerStatus': {
        if (!timers.length) return say(lines.noTimers);
        const picked = command.target ? resolveTimer(command.target, 'latest') : null;
        if (command.target && !picked) return;
        return say(
          (picked ? [picked] : timers)
            .map((timer) =>
              lines.remaining(
                timer.label,
                roughDuration(Math.max(0, (timer.dueAt - Date.now()) / 1000), language),
              ),
            )
            .join(' '),
        );
      }
      case 'pause':
        say(lines.paused);
        voiceOnRef.current = false;
        setVoiceOn(false);
        return;
      case 'exit':
        stopVoice();
        void navigate(exitPath);
        return;
      case 'question':
        return askAssistant.mutate(command.text);
      default:
        showMood('confused');
        return say(lines.unknown);
    }
  };

  // --- Chú Rồng phụ bếp: hiểu câu tự nhiên theo bối cảnh và chọn hành động --------------------
  const companion = useMutation({
    mutationFn: async (utterance: string) => {
      // Quá 10 giây thì thôi chờ AI: bộ hiểu lệnh trên máy xử lý ngay (onError).
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), COMPANION_TIMEOUT_MS);
      try {
        return await askCompanion(companionRequest(utterance), controller.signal);
      } finally {
        window.clearTimeout(timeout);
      }
    },
  });

  const companionRequest = (utterance: string) => ({
    utterance,
    language,
    recipe_name: dish.recipe.name,
    servings: dish.servings,
    ingredients: steps.find((item) => item.dishIndex === step.dishIndex)?.items ?? [],
    steps: steps
      .filter((item) => item.dishIndex === step.dishIndex)
      .map((item) => ({
        kind: item.kind,
        text: (item.kind === 'ingredients' ? lines.ingredients(item.items ?? []) : item.text).slice(
          0,
          1150,
        ),
      })),
    step_index: stepIndex - steps.findIndex((item) => item.dishIndex === step.dishIndex),
    timers: timers.map((timer) => ({
      id: timer.id,
      label: timer.label,
      remaining_seconds: Math.round((timer.dueAt - now) / 1000),
    })),
    local_seconds: localSeconds(),
    history: talkLog.slice(-6).map((item) => ({
      role: item.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: item.text.slice(0, 900),
    })),
  });

  const applyCompanion = (reply: CompanionReply, fallback: VoiceCommand) => {
    if (!reply.handled) return runCommand(fallback);
    if (reply.off_topic) showMood('confused');
    const { action } = reply;
    const lead = reply.reply;
    const byId = action.timer_id ? timers.find((timer) => timer.id === action.timer_id) : undefined;
    const alarm = byId ?? ringingTimers.at(-1) ?? timers.at(-1);
    const dishStart = steps.findIndex((item) => item.dishIndex === step.dishIndex);
    switch (action.type) {
      case 'next':
        return completeStep(lead);
      case 'back':
        return stepIndex > 0 ? goTo(stepIndex - 1, `${lead} `) : say(lead || lines.first);
      case 'goto':
        return action.step !== null && dishStart + action.step < steps.length
          ? goTo(dishStart + action.step, `${lead} `)
          : say(lead);
      case 'repeat':
        return say(`${lead} ${stepSpeech(step, context(step), language)}`.trim());
      case 'ingredients':
        return say(`${lead} ${lines.ingredients(steps[dishStart]?.items ?? [])}`.trim());
      case 'set_timer':
        if (!action.seconds) return say(lead);
        start(action.label || timerLabel(), action.seconds, dish.recipe.slug);
        return say(
          lead ||
            lines.timerSet(
              spokenDuration(action.seconds, language),
              action.label || timerLabel(),
              pushState === 'push',
            ),
        );
      case 'snooze_timer':
        if (!alarm) return say(lead);
        void closeTimerNotification(alarm.id);
        snooze(alarm.id, action.seconds ?? SNOOZE_SECONDS);
        return say(lead);
      case 'stop_timer':
        if (!alarm) return say(lead);
        void closeTimerNotification(alarm.id);
        finish(alarm.id);
        return say(lead);
      case 'adjust_timer': {
        const timer = byId ?? (timers.length === 1 ? timers[0] : undefined);
        if (!timer || !action.seconds || !action.mode) {
          return say(lead || lines.whichTimer(labelsOf(timers)));
        }
        // Lời xác nhận do máy tính từ chuông thật (số phút luôn đúng), không lấy số AI nói.
        return changeTimer(timer, action.mode, action.seconds);
      }
      case 'cancel_timer': {
        if (action.all_timers) {
          const count = timers.length;
          cancelTimers(timers);
          return say(lines.cancelledAll(count));
        }
        const timer = byId ?? (timers.length === 1 ? timers[0] : undefined);
        if (!timer) return say(lead || lines.whichTimer(labelsOf(timers)));
        cancelTimers([timer]);
        return say(lines.cancelled(timer.label));
      }
      case 'finish': {
        const finishIndex = steps.findIndex(
          (item) => item.dishIndex === step.dishIndex && item.kind === 'finish',
        );
        if (step.kind === 'finish' || finishIndex < 0) return completeStep(lead);
        return goTo(finishIndex, `${lead} `);
      }
      case 'pause_listening':
        say(lead || lines.paused);
        voiceOnRef.current = false;
        setVoiceOn(false);
        return;
      default:
        return say(lead || lines.unknown);
    }
  };

  const handleUtterance = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    pushTalk('user', clean);
    setHeard('');
    const command = parseVoiceCommand(clean);
    const words = clean.split(/\s+/).length;
    const quick =
      command.type === 'stopSpeaking' ||
      command.type === 'timers' ||
      // Chuông đang kêu: "xong/tắt/chưa" xử lý ngay trên máy, không chờ mạng hay AI.
      (hasRinging && ALARM_REPLIES.has(command.type)) ||
      (QUICK_COMMANDS.has(command.type) && words <= 6) ||
      (TIMER_COMMANDS.has(command.type) && words <= 10) ||
      (command.type === 'timer' && command.seconds !== null);
    if (quick) return runCommand(command);
    companion.mutate(clean, {
      onSuccess: (reply) => applyCompanion(reply, command),
      // Mất mạng hoặc máy chủ lỗi: vẫn hiểu được câu lệnh cơ bản trên máy.
      onError: () => runCommand(command),
    });
  };

  useEffect(() => {
    handleRef.current = handleUtterance;
    stopCommandRef.current = () => runCommand({ type: 'stopSpeaking' });
  });

  // Luôn thấy câu mới nhất trong khung hội thoại.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [talkLog, heard]);

  // Hỏi thăm khi người dùng im lặng quá lâu ở một bước (một lần mỗi bước, không khi đang chờ chuông).
  const checkedIn = useRef(-1);
  const hasTimers = timers.length > 0;
  useEffect(() => {
    if (phase !== 'cooking' || checkedIn.current === stepIndex) return;
    const timer = window.setTimeout(() => {
      if (speakingRef.current || hasTimers) return;
      checkedIn.current = stepIndex;
      say(lines.checkIn);
    }, CHECK_IN_MS);
    return () => window.clearTimeout(timer);
  }, [hasTimers, lines.checkIn, phase, say, stepIndex, talkLog.length]);

  // --- Giữ màn hình sáng khi đang nấu --------------------------------------------------------
  useEffect(() => {
    if (phase !== 'cooking') return;
    let lock: Awaited<ReturnType<typeof requestWakeLock>> = null;
    let active = true;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      void requestWakeLock().then((value) => {
        if (active) lock = value;
        else void value?.release();
      });
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => undefined);
    };
  }, [phase]);

  useEffect(() => {
    if (pushState !== 'granted' || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    void navigator.serviceWorker
      .getRegistration('/')
      .then((registration) => registration?.pushManager?.getSubscription())
      .then((subscription) => {
        if (subscription && !cancelled) setPushState('push');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pushState]);

  const enableAlarms = async () => {
    unlockAudio();
    setPushState(await enableTimerNotifications(getPushConfig, savePushSubscription));
  };

  const begin = () => {
    unlockAudio();
    void registerCookWorker();
    voiceOnRef.current = voiceOn && (recognition.supported || ttsSupported);
    setPhase('cooking');
    goTo(stepIndex);
  };

  const toggleVoice = () => {
    if (voiceOnRef.current) {
      stopVoice();
      setVoiceOn(false);
      setHeard('');
      return;
    }
    unlockAudio();
    voiceOnRef.current = true;
    setVoiceOn(true);
    setNotice('');
    say(stepSpeech(step, context(step), language));
  };

  const elapsed = Math.max(0, Math.round((now - progress.startedAt) / 1000));
  const percent = Math.round(((stepIndex + (phase === 'done' ? 1 : 0)) / steps.length) * 100);
  const isIos =
    typeof navigator !== 'undefined' &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !window.matchMedia?.('(display-mode: standalone)').matches;

  // Cảm xúc của rồng: ưu tiên chuông kêu > đang nghĩ > đang nói > thoáng qua > đang nghe > chờ.
  const mood: DragonMood = hasRinging
    ? 'alarm'
    : companion.isPending || askAssistant.isPending
      ? 'thinking'
      : speaking
        ? 'speaking'
        : (flash ?? (recognition.listening ? 'listening' : timers.length ? 'waiting' : 'happy'));
  const moodLabel: Record<DragonMood, string> = {
    idle: t('Chú Rồng đang chờ bạn'),
    happy: t('Chú Rồng đang chờ bạn'),
    thinking: t('Chú Rồng đang nghĩ…'),
    speaking: t('Chú Rồng đang nói…'),
    listening: t('Đang nghe…'),
    waiting: t('Đang canh chuông cho bạn'),
    alarm: t('Hết giờ rồi!'),
    celebrate: t('Hoàn thành!'),
    confused: t('Chú Rồng chưa hiểu lắm'),
  };

  const stepTitle =
    step.kind === 'ingredients'
      ? t('Chuẩn bị nguyên liệu')
      : step.kind === 'finish'
        ? t('Hoàn thiện món')
        : t('{group} · Bước {number}/{total}', {
            group: step.kind === 'preparation' ? t('Sơ chế') : t('Thực hiện'),
            number: step.number,
            total: step.groupSize,
          });

  return (
    <div className="cook">
      <header className="cook__bar">
        <Link
          aria-label={t('Thoát chế độ vào bếp')}
          className="cook__exit"
          onClick={stopVoice}
          to={exitPath}
        >
          <AppIcon name="close" size={20} />
        </Link>
        <div className="cook__title">
          <small>
            {dishes.length > 1
              ? t('Món {number}/{total}', { number: step.dishIndex + 1, total: dishes.length })
              : t('Vào bếp')}
          </small>
          <strong>{dish.recipe.name}</strong>
        </div>
        {phase === 'cooking' ? (
          <button
            aria-label={voiceOn ? t('Tắt trợ lý giọng nói') : t('Bật trợ lý giọng nói')}
            aria-pressed={voiceOn}
            className={`cook__mic${voiceOn ? ' is-on' : ''}${recognition.listening ? ' is-listening' : ''}`}
            disabled={!recognition.supported && !ttsSupported}
            onClick={toggleVoice}
            type="button"
          >
            <AppIcon name={voiceOn ? 'mic' : 'volumeOff'} size={20} />
          </button>
        ) : null}
        <div
          aria-label={t('Tiến độ nấu')}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          className="cook__progress"
          role="progressbar"
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      </header>

      {phase === 'intro' ? (
        <main className="cook__intro">
          <span className="section-label">{t('Chế độ vào bếp')}</span>
          <h1>
            {dishes.length > 1
              ? t('Nấu {count} món cho bữa này', { count: dishes.length })
              : dish.recipe.name}
          </h1>
          <ul className="cook-dishes">
            {dishes.map((item) => (
              <li key={item.recipe.slug}>
                <img alt="" src={item.recipe.image} />
                <span>
                  <strong>{item.recipe.name}</strong>
                  <small>
                    {t('{count} người', { count: item.servings })} ·{' '}
                    {t('{count} bước', {
                      count: item.recipe.preparation.length + item.recipe.cooking.length,
                    })}
                  </small>
                </span>
              </li>
            ))}
          </ul>
          <p className="cook__lead">
            {t(
              'Chú Rồng sẽ đọc từng bước và chờ bạn làm xong. Nói "xong rồi" để sang bước tiếp, "chưa xong" để được nhắc lại, "hẹn giờ 15 phút" để đặt chuông, hoặc hỏi bất cứ khi nào bị vướng.',
            )}
          </p>
          <label className="cook-toggle">
            <input
              checked={voiceOn && (recognition.supported || ttsSupported)}
              disabled={!recognition.supported && !ttsSupported}
              onChange={(event) => setVoiceOn(event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>{t('Điều khiển bằng giọng nói')}</strong>
              <small>
                {recognition.supported
                  ? t('Cần cho phép dùng micro. Bạn vẫn có thể bấm nút bất cứ lúc nào.')
                  : t(
                      'Trình duyệt này chưa hỗ trợ nhận giọng nói; hãy dùng Chrome, Edge hoặc Safari.',
                    )}
              </small>
            </span>
          </label>
          <AlarmSetup isIos={isIos} onEnable={() => void enableAlarms()} state={pushState} />
          <button className="button button--primary cook__start" onClick={begin} type="button">
            <AppIcon name="chef" size={20} />
            {progress.stepIndex > 0
              ? t('Nấu tiếp từ bước {number}/{total}', {
                  number: stepIndex + 1,
                  total: steps.length,
                })
              : t('Bắt đầu nấu')}
          </button>
          {progress.stepIndex > 0 ? (
            <button
              className="button button--outline"
              onClick={() =>
                setProgress({
                  key: sessionKey,
                  stepIndex: 0,
                  startedAt: Date.now(),
                  dishStartedAt: {},
                  logged: [],
                })
              }
              type="button"
            >
              {t('Nấu lại từ đầu')}
            </button>
          ) : null}
        </main>
      ) : phase === 'done' ? (
        <main className="cook__done">
          <DragonMascot
            className="cook__done-dragon"
            mood="celebrate"
            size={150}
            title={t('Chú Rồng ăn mừng')}
          />
          <h1>{t('Hoàn thành!')}</h1>
          <p>
            {t('Bạn đã nấu xong {count} món trong {time}.', {
              count: dishes.length,
              time: formatClock(elapsed),
            })}
          </p>
          {logMutation.isError ? (
            <p className="cook__error" role="alert">
              {errorMessage(logMutation.error, t)}
            </p>
          ) : (
            <p className="cook__muted" role="status">
              {logMutation.isPending
                ? t('Đang ghi vào lịch sử món đã nấu…')
                : t('Đã ghi vào lịch sử món đã nấu của bạn.')}
            </p>
          )}
          <div className="cook__done-actions">
            <Link className="button button--primary" to="/account/cooked">
              <AppIcon name="history" size={18} /> {t('Xem lịch sử món đã nấu')}
            </Link>
            <Link className="button button--outline" to={exitPath}>
              {dishes.some((item) => item.planItemId) ? t('Về kế hoạch') : t('Về trang món')}
            </Link>
          </div>
        </main>
      ) : (
        <>
          <main className="cook__stage">
            <section aria-label={t('Chú Rồng phụ bếp')} className="cook-buddy">
              <div className="cook-buddy__dragon">
                <DragonMascot
                  mood={mood}
                  size={190}
                  viseme={speaking ? viseme : undefined}
                  openness={speaking ? openness : undefined}
                />
                <span className={`cook-buddy__status is-${mood}`} role="status">
                  {moodLabel[mood]}
                </span>
                {speaking ? (
                  <button
                    aria-label={t('Dừng nói ngay')}
                    className="cook-buddy__hush"
                    onClick={stopSpeaking}
                    type="button"
                  >
                    <AppIcon name="stop" size={14} />
                    <span>{t('Dừng nói')}</span>
                  </button>
                ) : null}
              </div>
              <ol aria-live="polite" className="cook-buddy__log" ref={logRef}>
                {talkLog.map((item) => (
                  <li className={`cook-bubble is-${item.role}`} key={item.id}>
                    {item.text}
                  </li>
                ))}
                {heard ? <li className="cook-bubble is-user is-interim">{heard}</li> : null}
              </ol>
              <form
                className="cook-buddy__ask"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!typed.trim()) return;
                  unlockAudio();
                  handleUtterance(typed);
                  setTyped('');
                }}
              >
                <input
                  aria-label={t('Nói với Chú Rồng')}
                  maxLength={500}
                  onChange={(event) => setTyped(event.target.value)}
                  placeholder={t('Hỏi hoặc nói với Chú Rồng… (vd: cá bị dính chảo thì sao?)')}
                  value={typed}
                />
                <button
                  aria-label={t('Gửi cho Chú Rồng')}
                  className="button button--primary"
                  disabled={companion.isPending || !typed.trim()}
                  type="submit"
                >
                  <AppIcon name="send" size={18} />
                </button>
              </form>
              {notice ? (
                <p className="cook__error" role="alert">
                  {notice}
                </p>
              ) : null}
            </section>
            <p className="cook__phase">{stepTitle}</p>
            {step.kind === 'ingredients' ? (
              <>
                <h1 className="cook__step">
                  {t('Chuẩn bị nguyên liệu cho {count} người', { count: dish.servings })}
                </h1>
                <ul className="cook-checklist">
                  {(step.items ?? []).map((item) => (
                    <li key={item}>
                      <label>
                        <input
                          checked={checked.has(item)}
                          onChange={() =>
                            setChecked((current) => {
                              const next = new Set(current);
                              if (next.has(item)) next.delete(item);
                              else next.add(item);
                              return next;
                            })
                          }
                          type="checkbox"
                        />
                        <span>{item}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <h1 className="cook__step">
                {step.kind === 'finish'
                  ? step.text || t('Nếm lại, trình bày và dọn món ra mâm.')
                  : step.text}
              </h1>
            )}
            {step.timerSeconds ? (
              <button
                className="cook__suggest"
                onClick={() => {
                  unlockAudio();
                  startTimer(step.timerSeconds!);
                }}
                type="button"
              >
                <AppIcon name="bell" size={18} />
                {t('Hẹn giờ {time}', { time: formatClock(step.timerSeconds) })}
              </button>
            ) : null}
          </main>

          <section aria-label={t('Chuông hẹn giờ')} className="cook__timers">
            {timers.map((timer) => {
              const ringing = isRinging(timer, now);
              return (
                <article className={`cook-timer${ringing ? ' is-ringing' : ''}`} key={timer.id}>
                  <AppIcon name="bell" size={20} />
                  <div>
                    <strong>{timer.label}</strong>
                    <span className="cook-timer__clock">
                      {ringing ? t('Hết giờ!') : formatClock((timer.dueAt - now) / 1000)}
                    </span>
                  </div>
                  {ringing ? (
                    <div className="cook-timer__actions">
                      <button
                        className="button button--primary"
                        onClick={() => stopAlarm(timer, 'done')}
                        type="button"
                      >
                        {t('Xong rồi')}
                      </button>
                      <button
                        className="button button--outline"
                        onClick={() => stopAlarm(timer, 'snooze')}
                        type="button"
                      >
                        {t('+5 phút')}
                      </button>
                    </div>
                  ) : (
                    <div className="cook-timer__actions">
                      <button
                        aria-label={t('Thêm 1 phút cho {label}', { label: timer.label })}
                        className="button button--outline"
                        onClick={() =>
                          snooze(timer.id, Math.round((timer.dueAt - now) / 1000) + 60)
                        }
                        type="button"
                      >
                        +1
                      </button>
                      <button
                        aria-label={t('Hủy chuông {label}', { label: timer.label })}
                        className="button button--outline"
                        onClick={() => finish(timer.id, 'cancel')}
                        type="button"
                      >
                        <AppIcon name="close" size={16} />
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
            <form
              className="cook-timer-form"
              onSubmit={(event) => {
                event.preventDefault();
                const seconds =
                  parseSpokenDuration(`${customMinutes} phút`) ?? Number(customMinutes) * 60;
                if (seconds >= 5) {
                  unlockAudio();
                  startTimer(Math.min(seconds, 86_400));
                }
              }}
            >
              <label>
                <span>{t('Hẹn giờ (phút)')}</span>
                <input
                  inputMode="decimal"
                  max={1440}
                  step="any"
                  min={1}
                  onChange={(event) => setCustomMinutes(event.target.value)}
                  type="number"
                  value={customMinutes}
                />
              </label>
              <button className="button button--outline" type="submit">
                <AppIcon name="bell" size={16} /> {t('Đặt chuông')}
              </button>
            </form>
            {pushState !== 'push' ? (
              <AlarmSetup
                compact
                isIos={isIos}
                onEnable={() => void enableAlarms()}
                state={pushState}
              />
            ) : null}
          </section>

          <footer className="cook__controls">
            <button
              className="button button--outline"
              disabled={stepIndex === 0}
              onClick={() => runCommand({ type: 'back' })}
              type="button"
            >
              <AppIcon name="skipBack" size={18} />
              <span>{t('Bước trước')}</span>
            </button>
            <button
              className="button button--outline"
              onClick={() => runCommand({ type: 'repeat' })}
              type="button"
            >
              <AppIcon name="refresh" size={18} />
              <span>{t('Đọc lại')}</span>
            </button>
            <button
              className="button button--outline"
              onClick={() => runCommand({ type: 'notDone' })}
              type="button"
            >
              <AppIcon name="clock" size={18} />
              <span>{t('Chưa xong')}</span>
            </button>
            <button
              className="button button--primary cook__next"
              onClick={() => runCommand({ type: 'done' })}
              type="button"
            >
              <span>
                {step.kind === 'finish'
                  ? stepIndex + 1 < steps.length
                    ? t('Xong món, sang món tiếp')
                    : t('Hoàn thành')
                  : t('Xong, bước tiếp')}
              </span>
              <AppIcon name="arrow" size={18} />
            </button>
          </footer>
        </>
      )}
    </div>
  );
}

function AlarmSetup({
  compact = false,
  isIos,
  onEnable,
  state,
}: {
  compact?: boolean;
  isIos: boolean;
  onEnable: () => void;
  state: PushState;
}) {
  const { t } = useI18n();
  if (state === 'unsupported') {
    return compact ? null : (
      <p className="cook-alarm cook-alarm--muted">
        <AppIcon name="bell" size={18} />
        {isIos
          ? t(
              'Trên iPhone: bấm Chia sẻ → "Thêm vào MH chính" rồi mở Bếp Việt từ đó để chuông kêu cả khi khóa máy.',
            )
          : t('Trình duyệt này không hỗ trợ thông báo; chuông chỉ kêu khi ứng dụng đang mở.')}
      </p>
    );
  }
  return (
    <div className={`cook-alarm${compact ? ' cook-alarm--compact' : ''}`}>
      <AppIcon name="bell" size={18} />
      <span>
        {state === 'push'
          ? t('Chuông sẽ báo cả khi bạn tắt màn hình.')
          : state === 'local'
            ? t(
                'Chuông báo khi ứng dụng còn mở. Trình duyệt hoặc máy chủ chưa hỗ trợ thông báo đẩy nên khi khóa máy có thể không kêu.',
              )
            : state === 'granted'
              ? t('Bấm "Bật chuông" để nhận chuông cả khi bạn khóa màn hình.')
              : state === 'denied'
                ? t('Bạn đã chặn thông báo. Mở cài đặt trang web của trình duyệt để cho phép lại.')
                : t('Cho phép thông báo để chuông kêu cả khi bạn tắt màn hình.')}
      </span>
      {state === 'default' || state === 'granted' ? (
        <button className="button button--outline" onClick={onEnable} type="button">
          {t('Bật chuông')}
        </button>
      ) : null}
    </div>
  );
}
