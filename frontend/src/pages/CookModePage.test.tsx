import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getRecipe } from '@/data/recipes';
import type { CompanionReply, CompanionRequest } from '@/features/cooking/cookingApi';
import { CLOSING } from '@/features/cooking/cookScript';
import { I18nProvider } from '@/features/i18n/I18nContext';
import { CookModePage } from '@/pages/CookModePage';

const api = vi.hoisted(() => ({
  logCooked: vi.fn(),
  getServerTimers: vi.fn(),
  saveServerTimer: vi.fn(),
  updateServerTimer: vi.fn(),
  getPushConfig: vi.fn(),
  savePushSubscription: vi.fn(),
  askCompanion: vi.fn(),
}));
const assistant = vi.hoisted(() => ({ sendAssistantMessage: vi.fn() }));

vi.mock('@/features/cooking/cookingApi', async (importActual) => ({
  ...(await importActual<object>()),
  ...api,
}));
vi.mock('@/features/assistant/assistantApi', async (importActual) => ({
  ...(await importActual<object>()),
  ...assistant,
}));
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/features/account/preferences', async (importActual) => ({
  ...(await importActual<object>()),
  useUserPreferences: () => ({
    isPersonal: false,
    preferences: { computed_servings: 4 },
    user: { id: 'user-1' },
  }),
}));

const PLAN_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const recipe = getRecipe('canh-chua-ca')!;

// --- Giả lập Web Speech API --------------------------------------------------------------
const spoken: string[] = [];
const synthCancel = vi.fn();
type Listener = {
  onresult: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};
let recognizer: Listener | null = null;

class FakeRecognition implements Listener {
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: Listener['onresult'] = null;
  onend: Listener['onend'] = null;
  onerror: Listener['onerror'] = null;
  start() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    recognizer = this;
  }
  stop() {
    this.onend?.();
  }
  abort() {
    if (recognizer === this) recognizer = null;
  }
}

class FakeUtterance {
  lang = '';
  rate = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

/** `hold`: giọng đọc không tự kết thúc (để thử nút "Dừng nói" và ngắt lời). */
function installSpeech({ hold = false } = {}) {
  Object.assign(window, { webkitSpeechRecognition: FakeRecognition });
  Object.assign(globalThis, { SpeechSynthesisUtterance: FakeUtterance });
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      cancel: synthCancel,
      getVoices: () => [],
      speak: (utterance: FakeUtterance) => {
        spoken.push(utterance.text);
        if (!hold) window.setTimeout(() => utterance.onend?.(), 0);
      },
    },
  });
}

function removeSpeech() {
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  delete (window as unknown as Record<string, unknown>).speechSynthesis;
}

/** Người dùng nói một câu vào micro. */
async function userSays(text: string) {
  await waitFor(() => expect(recognizer).not.toBeNull());
  const current = recognizer!;
  recognizer = null;
  spoken.length = 0;
  act(() => {
    current.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: text } } },
    });
    current.onend?.();
  });
}

const lastSpeech = () => spoken.join(' ');

const companion = (
  reply: string,
  type: CompanionReply['action']['type'],
  action: Partial<CompanionReply['action']> = {},
): CompanionReply => ({
  handled: true,
  reply,
  action: { type, seconds: null, step: null, label: null, ...action },
  off_topic: false,
});

function renderCook(path = `/cook?dish=canh-chua-ca:2:${PLAN_ID}`) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<CookModePage />} path="/cook" />
            <Route element={<p>planner page</p>} path="/planner" />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  spoken.length = 0;
  recognizer = null;
  api.getServerTimers.mockResolvedValue([]);
  api.saveServerTimer.mockResolvedValue({});
  api.updateServerTimer.mockResolvedValue({});
  api.logCooked.mockResolvedValue({ id: 'log-1' });
  api.askCompanion.mockResolvedValue(companion('', 'none'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  removeSpeech();
  localStorage.clear();
});

describe('CookModePage', () => {
  it('walks through every step with buttons and logs the planned dish as cooked', async () => {
    renderCook();
    expect(screen.getByRole('heading', { name: recipe.name })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
    expect(
      screen.getByRole('heading', { name: 'Chuẩn bị nguyên liệu cho 2 người' }),
    ).toBeInTheDocument();

    const steps = recipe.preparation.length + recipe.cooking.length;
    for (let index = 0; index <= steps; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Xong, bước tiếp/ }));
    }
    expect(screen.getByText('Hoàn thiện món')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Hoàn thành/ }));

    expect(await screen.findByRole('heading', { name: 'Hoàn thành!' })).toBeInTheDocument();
    expect(api.logCooked).toHaveBeenCalledTimes(1);
    expect(api.logCooked).toHaveBeenCalledWith(
      expect.objectContaining({
        recipe_slug: 'canh-chua-ca',
        servings: 2,
        source: 'cook_mode',
        plan_item_id: PLAN_ID,
      }),
    );
    expect(screen.getByRole('link', { name: /Về kế hoạch/ })).toHaveAttribute('href', '/planner');
  });

  it('reads each step, waits for "xong rồi", repeats on "chưa xong" and sets timers by voice', async () => {
    installSpeech();
    renderCook('/cook?dish=canh-chua-ca:2');
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu nấu' }));

    // Bước đầu: đọc nguyên liệu và kết bằng lời mời làm rồi báo lại.
    await waitFor(() => expect(lastSpeech()).toContain('Mình cùng nấu'));
    expect(lastSpeech()).toContain(CLOSING.vi);

    await userSays('xong rồi');
    await waitFor(() => expect(lastSpeech()).toContain('Sơ chế, bước 1'));
    expect(screen.getByText(recipe.preparation[0]!)).toBeInTheDocument();

    // Chưa xong: đọc lại đúng bước đó và xác nhận đang chờ, không chuyển bước.
    await userSays('chưa xong');
    await waitFor(() => expect(lastSpeech()).toContain('Mình nhắc lại bước này'));
    expect(lastSpeech()).toContain('Mình đang chờ');
    expect(screen.getByText(recipe.preparation[0]!)).toBeInTheDocument();

    await userSays('báo thức nhắc tôi sau 10 phút');
    await waitFor(() => expect(lastSpeech()).toContain('Đã hẹn 10 phút'));
    expect(screen.getByText(/^(10:00|09:5\d)$/)).toBeInTheDocument();
    expect(api.saveServerTimer).toHaveBeenCalledWith(
      expect.objectContaining({ seconds: 600, recipe_slug: 'canh-chua-ca' }),
    );

    await userSays('quay lại');
    await waitFor(() => expect(lastSpeech()).toContain('Quay lại bước trước'));
    expect(
      screen.getByRole('heading', { name: 'Chuẩn bị nguyên liệu cho 2 người' }),
    ).toBeInTheDocument();

    // Gặp vướng mắc: Chú Rồng phụ bếp hiểu câu hỏi theo bối cảnh bước đang nấu.
    api.askCompanion.mockResolvedValue(
      companion('Dùng thêm cà chua và dứa cho vị chua dịu nhé.', 'none'),
    );
    await userSays('Không có me thì thay bằng gì?');
    await waitFor(() => expect(lastSpeech()).toContain('Dùng thêm cà chua'));
    const [request] = api.askCompanion.mock.calls[0] as [CompanionRequest];
    expect(request.utterance).toBe('Không có me thì thay bằng gì?');
    expect(request.recipe_name).toBe(recipe.name);
    expect(request.step_index).toBe(0);
    expect(request.steps).toHaveLength(recipe.preparation.length + recipe.cooking.length + 2);
    expect(request.timers.map((timer) => timer.label)[0]).toContain(recipe.name);
    expect(request.history.at(-1)).toEqual({
      role: 'user',
      content: 'Không có me thì thay bằng gì?',
    });
    // Hội thoại hiện cạnh Chú Rồng.
    const log = screen.getByRole('region', { name: 'Chú Rồng phụ bếp' });
    expect(log).toHaveTextContent('Không có me thì thay bằng gì?');
    expect(log).toHaveTextContent('Dùng thêm cà chua');
  });

  it('lets the cooking buddy set timers, move on, redirect small talk and fall back offline', async () => {
    installSpeech();
    renderCook('/cook?dish=canh-chua-ca:2');
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
    await waitFor(() => expect(lastSpeech()).toContain('Mình cùng nấu'));

    api.askCompanion.mockResolvedValueOnce(
      companion('Ok, mình canh 15 phút cho bạn nha!', 'set_timer', {
        seconds: 900,
        label: 'Ngâm me',
      }),
    );
    await userSays('nhắc mình khi ngâm me xong nhé');
    await waitFor(() => expect(lastSpeech()).toContain('canh 15 phút'));
    expect(screen.getByText('Ngâm me')).toBeInTheDocument();
    expect(api.saveServerTimer).toHaveBeenCalledWith(
      expect.objectContaining({ seconds: 900, label: 'Ngâm me' }),
    );

    api.askCompanion.mockResolvedValueOnce(companion('Giỏi quá!', 'next'));
    await userSays('ok mình chuẩn bị đủ đồ rồi đó');
    await waitFor(() => expect(lastSpeech()).toContain('Giỏi quá! Sơ chế, bước 1'));

    api.askCompanion.mockResolvedValueOnce({
      ...companion('Chuyện bóng đá để lát nha, nồi canh đang chờ bạn đó!', 'none'),
      off_topic: true,
    });
    await userSays('tối qua đội nào thắng vậy');
    await waitFor(() => expect(lastSpeech()).toContain('nồi canh đang chờ'));
    expect(screen.getByText('Chú Rồng chưa hiểu lắm')).toBeInTheDocument();

    // Gõ chữ thay cho micro; AI tắt (handled=false) thì dùng bộ lệnh trên máy.
    api.askCompanion.mockResolvedValueOnce({ ...companion('', 'none'), handled: false });
    fireEvent.change(screen.getByLabelText('Nói với Chú Rồng'), {
      target: { value: 'mình làm xong cái bước này rồi đó nha bạn' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi cho Chú Rồng' }));
    await waitFor(() => expect(lastSpeech()).toContain('Sơ chế, bước 2'));

    // Mất mạng: vẫn hiểu câu lệnh cơ bản.
    api.askCompanion.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await userSays('làm ơn đọc lại bước này giùm mình với nhé');
    await waitFor(() => expect(lastSpeech()).toContain('Sơ chế, bước 2'));
  });

  it('rings when a timer is due and lets the user snooze or confirm it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const now = Date.now();
    localStorage.setItem(
      'bep-viet-cook-timers',
      JSON.stringify([
        {
          id: 'timer-a',
          label: 'Hầm xương',
          recipeSlug: 'canh-chua-ca',
          startedAt: now,
          dueAt: now + 2000,
        },
        {
          id: 'timer-b',
          label: 'Ngâm me',
          recipeSlug: 'canh-chua-ca',
          startedAt: now,
          dueAt: now + 2000,
        },
      ]),
    );
    renderCook('/cook?dish=canh-chua-ca:2');
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
    expect(screen.queryByText('Hết giờ!')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getAllByText('Hết giờ!')).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: '+5 phút' })[0]!);
    expect(api.updateServerTimer).toHaveBeenCalledWith('timer-a', 'snooze', 300);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText(/^0[45]:\d\d$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xong rồi' }));
    expect(api.updateServerTimer).toHaveBeenCalledWith('timer-b', 'done');
    expect(screen.queryByText('Ngâm me')).not.toBeInTheDocument();
    expect(screen.queryByText('Hết giờ!')).not.toBeInTheDocument();
    // Tải lại trang vẫn còn chuông đang chạy (lưu theo mốc giờ tuyệt đối).
    expect(JSON.parse(localStorage.getItem('bep-viet-cook-timers')!)).toHaveLength(1);
  });

  it('stops talking at once with the button, keeping timers, step and cook mode', async () => {
    installSpeech({ hold: true });
    const now = Date.now();
    localStorage.setItem(
      'bep-viet-cook-timers',
      JSON.stringify([
        {
          id: 't1',
          label: 'Hầm xương',
          recipeSlug: 'canh-chua-ca',
          startedAt: now,
          dueAt: now + 600_000,
        },
      ]),
    );
    renderCook('/cook?dish=canh-chua-ca:2');
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
    const hush = await screen.findByRole('button', { name: 'Dừng nói ngay' });
    expect(hush).toHaveTextContent('Dừng nói');
    fireEvent.click(hush);
    expect(synthCancel).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Dừng nói ngay' })).not.toBeInTheDocument();
    // Không đổi bước, không thoát chế độ nấu, chuông vẫn chạy.
    expect(
      screen.getByRole('heading', { name: 'Chuẩn bị nguyên liệu cho 2 người' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Hầm xương')).toBeInTheDocument();
    expect(api.updateServerTimer).not.toHaveBeenCalled();
    // Rồng nghe tiếp ngay sau khi im.
    await waitFor(() => expect(recognizer).not.toBeNull());
  });

  it('lets the user cut in with a stop word while the dragon talks, ignoring its own voice', async () => {
    installSpeech({ hold: true });
    renderCook('/cook?dish=canh-chua-ca:2');
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
    await screen.findByRole('button', { name: 'Dừng nói ngay' });
    // Micro mở trong lúc nói nhưng chỉ chờ từ khóa dừng.
    await waitFor(() => expect(recognizer).not.toBeNull(), { timeout: 2000 });
    const listener = recognizer!;
    act(() => {
      listener.onresult?.({
        resultIndex: 0,
        results: { length: 1, 0: { isFinal: false, length: 1, 0: { transcript: 'xong rồi' } } },
      });
    });
    expect(screen.getByRole('button', { name: 'Dừng nói ngay' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Chuẩn bị nguyên liệu cho 2 người' }),
    ).toBeInTheDocument();
    act(() => {
      listener.onresult?.({
        resultIndex: 0,
        results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: 'dừng lại' } } },
      });
    });
    expect(screen.queryByRole('button', { name: 'Dừng nói ngay' })).not.toBeInTheDocument();
    expect(synthCancel).toHaveBeenCalled();
  });

  it('sets, adjusts, reports and cancels named timers by voice', async () => {
    installSpeech();
    renderCook('/cook?dish=canh-chua-ca:2');
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
    await waitFor(() => expect(lastSpeech()).toContain('Mình cùng nấu'));

    await userSays('hẹn 10 phút luộc trứng và 25 phút hầm xương');
    await waitFor(() =>
      expect(lastSpeech()).toContain('Đã hẹn 10 phút cho Luộc trứng và 25 phút cho Hầm xương'),
    );
    expect(screen.getByText('Luộc trứng')).toBeInTheDocument();
    expect(screen.getByText('Hầm xương')).toBeInTheDocument();
    const bone = (api.saveServerTimer.mock.calls as [{ id: string; label: string }][])
      .map(([timer]) => timer)
      .find((timer) => timer.label === 'Hầm xương')!;

    await userSays('thêm 5 phút cho nồi xương');
    await waitFor(() =>
      expect(lastSpeech()).toContain('Đã thêm 5 phút cho Hầm xương, còn 30 phút'),
    );
    expect(api.updateServerTimer).toHaveBeenLastCalledWith(
      bone.id,
      'snooze',
      expect.closeTo(1800, -1),
    );

    await userSays('nồi xương còn mấy phút');
    await waitFor(() => expect(lastSpeech()).toBe('Hầm xương: còn 30 phút.'));

    // Nhiều chuông mà không nói chuông nào: hỏi lại, không đoán khi hủy.
    await userSays('hủy hẹn giờ');
    await waitFor(() => expect(lastSpeech()).toContain('chuông nào: Luộc trứng, Hầm xương'));

    await userSays('bỏ chuông luộc trứng');
    await waitFor(() => expect(lastSpeech()).toContain('Đã hủy chuông Luộc trứng'));
    expect(screen.queryByText('Luộc trứng')).not.toBeInTheDocument();

    await userSays('bớt 3 phút');
    await waitFor(() => expect(lastSpeech()).toContain('Đã bớt 3 phút cho Hầm xương, còn 27 phút'));

    await userSays('xóa hết hẹn giờ');
    await waitFor(() => expect(lastSpeech()).toContain('Đã hủy cả 1 chuông'));
    expect(screen.queryByText('Hầm xương')).not.toBeInTheDocument();
    // Các lệnh này rõ ràng nên xử lý ngay trên máy, không gọi AI.
    expect(api.askCompanion).not.toHaveBeenCalled();
  });

  it('turns "dừng đi" into stopping a ringing alarm and quietly logs it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const now = Date.now();
    localStorage.setItem(
      'bep-viet-cook-timers',
      JSON.stringify([
        {
          id: 'ring',
          label: 'Ngâm me',
          recipeSlug: 'canh-chua-ca',
          startedAt: now,
          dueAt: now + 1000,
        },
      ]),
    );
    renderCook('/cook?dish=canh-chua-ca:2');
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText('Hết giờ!')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nói với Chú Rồng'), { target: { value: 'dừng đi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi cho Chú Rồng' }));
    expect(api.updateServerTimer).toHaveBeenCalledWith('ring', 'done');
    expect(screen.queryByText('Hết giờ!')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Chú Rồng phụ bếp' })).toHaveTextContent(
      'Đã tắt chuông Ngâm me',
    );
    expect(api.askCompanion).not.toHaveBeenCalled();
  });

  it('answers a ringing alarm at once from a long natural sentence, without the AI', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const now = Date.now();
    localStorage.setItem(
      'bep-viet-cook-timers',
      JSON.stringify([
        {
          id: 'ring',
          label: 'Ngâm me',
          recipeSlug: 'canh-chua-ca',
          startedAt: now,
          dueAt: now + 1000,
        },
      ]),
    );
    renderCook('/cook?dish=canh-chua-ca:2');
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText('Hết giờ!')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nói với Chú Rồng'), {
      target: { value: 'mình kiểm tra rồi, me ngâm xong rồi nha' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi cho Chú Rồng' }));
    expect(api.updateServerTimer).toHaveBeenCalledWith('ring', 'done');
    expect(screen.queryByText('Hết giờ!')).not.toBeInTheDocument();
    expect(api.askCompanion).not.toHaveBeenCalled();
  });

  it('applies the companion timer actions to the targeted timer', async () => {
    installSpeech();
    const now = Date.now();
    localStorage.setItem(
      'bep-viet-cook-timers',
      JSON.stringify([
        {
          id: 'egg',
          label: 'Luộc trứng',
          recipeSlug: 'canh-chua-ca',
          startedAt: now,
          dueAt: now + 300_000,
        },
        {
          id: 'bone',
          label: 'Hầm xương',
          recipeSlug: 'canh-chua-ca',
          startedAt: now,
          dueAt: now + 600_000,
        },
      ]),
    );
    renderCook('/cook?dish=canh-chua-ca:2');
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
    await waitFor(() => expect(lastSpeech()).toContain('Mình cùng nấu'));

    api.askCompanion.mockResolvedValueOnce(
      companion('Ok, thêm cho nồi xương nè.', 'adjust_timer', {
        mode: 'add',
        seconds: 120,
        timer_id: 'bone',
      }),
    );
    await userSays('cho cái nồi xương thêm hai phút nữa được không bạn');
    await waitFor(() =>
      expect(lastSpeech()).toContain('Đã thêm 2 phút cho Hầm xương, còn 12 phút'),
    );
    const [request] = api.askCompanion.mock.calls[0] as [CompanionRequest];
    expect(request.timers.map((timer) => timer.id)).toEqual(['egg', 'bone']);
    expect(request.local_seconds).toBeGreaterThanOrEqual(0);
    expect(api.updateServerTimer).toHaveBeenLastCalledWith(
      'bone',
      'snooze',
      expect.closeTo(720, -1),
    );

    api.askCompanion.mockResolvedValueOnce(
      companion('Mình bỏ chuông trứng nhé.', 'cancel_timer', { timer_id: 'egg' }),
    );
    await userSays('thôi khỏi canh trứng nữa đâu nha bạn');
    await waitFor(() => expect(lastSpeech()).toContain('Đã hủy chuông Luộc trứng'));
    expect(api.updateServerTimer).toHaveBeenLastCalledWith('egg', 'cancel');
  });

  it('resumes an interrupted session from the saved step', () => {
    localStorage.setItem(
      'bep-viet-cook-progress',
      JSON.stringify({
        key: 'canh-chua-ca:2',
        stepIndex: 3,
        startedAt: Date.now(),
        dishStartedAt: {},
        logged: [],
      }),
    );
    renderCook('/cook?dish=canh-chua-ca:2');
    fireEvent.click(screen.getByRole('button', { name: /Nấu tiếp từ bước 4/ }));
    expect(screen.getByText(recipe.preparation[2] ?? recipe.cooking[0]!)).toBeInTheDocument();
  });

  it('explains how to start when no dish is selected', () => {
    renderCook('/cook');
    expect(screen.getByRole('heading', { name: 'Chưa chọn món để vào bếp' })).toBeInTheDocument();
  });
});
