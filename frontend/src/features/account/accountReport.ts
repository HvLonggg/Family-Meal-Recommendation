/**
 * Báo cáo "Dữ liệu của tôi" dạng trang in: dựng HTML tĩnh từ /account/export rồi mở hộp thoại in
 * của trình duyệt để người dùng chọn "Lưu dưới dạng PDF". Không cần thư viện PDF; dấu tiếng Việt
 * hiển thị bằng phông hệ thống như trên web.
 */
import { dietaryTagLabels } from '@/features/account/preferences';
import type { UserPreferences } from '@/features/auth/types';
import type { Translate } from '@/features/i18n/translate';
import { vegetarianRulesFrom } from '@/features/planner/plannerCalendar';
import { formatDisplayDate } from '@/lib/formatDate';

export interface AccountExportData {
  exported_at?: string;
  profile: {
    full_name: string;
    email: string | null;
    phone_e164?: string | null;
    role: string;
    created_at: string;
    last_login_at?: string | null;
  };
  preferences?: Partial<UserPreferences>;
  favorites?: { name: string; saved_at: string }[];
  meal_plans?: {
    date: string;
    meal_type: string;
    servings?: number;
    status?: string;
    recipe_name: string;
  }[];
  stories?: { created_at: string }[];
  recipe_submissions?: { name: string; status: string; created_at: string }[];
  assistant_conversations?: { created_at: string }[];
  cook_logs?: { recipe_name: string; cooked_at: string }[];
  saved_meals?: { created_at: string }[];
}

export interface AccountReportOptions {
  /** Ngày hôm nay dạng YYYY-MM-DD (giờ Việt Nam). */
  today: string;
  /** Số điện thoại từ phiên đăng nhập khi dữ liệu xuất không có. */
  phone?: string | null;
  t: Translate;
}

/** Danh sách nhỏ thì in hết; nhiều thì chỉ in 90 ngày gần nhất và các bữa sắp tới. */
export const REPORT_FULL_PLAN_LIMIT = 120;
export const REPORT_RECENT_DAYS = 90;

const MEAL_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2 };
const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Bữa sáng',
  lunch: 'Bữa trưa',
  dinner: 'Bữa tối',
};
const WEEKDAY_NAMES = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
const SPICE_LABELS: Record<string, string> = {
  mild: 'Không cay',
  medium: 'Cay vừa',
  hot: 'Cay nhiều',
};

export function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dayNumber(value: string) {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Math.floor(date.getTime() / 86_400_000);
}

function shiftDate(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "12 ngày", "3 tháng", "1 năm 2 tháng" (tháng tính theo lịch). */
export function usageDuration(createdAt: string, today: string, t: Translate) {
  const [fromYear = 0, fromMonth = 0, fromDay = 0] = createdAt.slice(0, 10).split('-').map(Number);
  const [toYear = 0, toMonth = 0, toDay = 0] = today.split('-').map(Number);
  const totalMonths = Math.max(
    0,
    (toYear - fromYear) * 12 + (toMonth - fromMonth) - (toDay < fromDay ? 1 : 0),
  );
  if (totalMonths < 1) {
    const days = Math.max(0, dayNumber(today) - dayNumber(createdAt.slice(0, 10)));
    return days < 1 ? t('chưa tới một ngày') : t('{count} ngày', { count: days });
  }
  if (totalMonths < 12) return t('{count} tháng', { count: totalMonths });
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return months ? t('{years} năm {months} tháng', { years, months }) : t('{years} năm', { years });
}

function row(label: string, value: string) {
  return `<tr><th scope="row">${escapeHtml(label)}</th><td>${value || '—'}</td></tr>`;
}

function vegetarianSummary(preferences: Partial<UserPreferences>, t: Translate) {
  const rules = vegetarianRulesFrom(preferences);
  const parts: string[] = [];
  if (rules.weekdays.length) {
    const names = rules.weekdays.map((day) => t(WEEKDAY_NAMES[day] ?? ''));
    parts.push(t('{days} hằng tuần', { days: names.join(', ') }));
  }
  if (rules.monthDays.length) {
    parts.push(t('ngày {days} hằng tháng', { days: rules.monthDays.join(', ') }));
  }
  if (parts.length && rules.months.length) {
    parts.push(t('tháng {months}', { months: rules.months.join(', ') }));
  }
  if (rules.lunarDays) parts.push(t('mùng 1 và rằm âm lịch'));
  return parts.join('; ');
}

function activityRange(data: AccountExportData) {
  const stamps = [
    ...(data.favorites ?? []).map((item) => item.saved_at),
    ...(data.cook_logs ?? []).map((item) => item.cooked_at),
    ...(data.saved_meals ?? []).map((item) => item.created_at),
    ...(data.recipe_submissions ?? []).map((item) => item.created_at),
    ...(data.stories ?? []).map((item) => item.created_at),
    ...(data.assistant_conversations ?? []).map((item) => item.created_at),
  ]
    .filter(Boolean)
    .sort();
  return { first: stamps[0], last: stamps.at(-1) };
}

export function reportTitle(name: string, today: string, t: Translate) {
  return t('Bếp Việt – Dữ liệu của {name} – {date}', {
    name: name || t('tôi'),
    date: formatDisplayDate(today),
  });
}

/** Trang HTML hoàn chỉnh, tự chứa CSS in, sẵn sàng đưa vào iframe để in/lưu PDF. */
export function buildAccountReportHtml(data: AccountExportData, options: AccountReportOptions) {
  const { t, today } = options;
  const profile = data.profile;
  const preferences = data.preferences ?? {};
  const plans = data.meal_plans ?? [];
  const title = reportTitle(profile.full_name, today, t);
  const phone = profile.phone_e164 ?? options.phone ?? '';

  const members = preferences.household_members ?? [];
  const membersText = members.length
    ? members
        .map(
          (member) =>
            `${escapeHtml(member.label)} (${escapeHtml(t('{age} tuổi', { age: member.age }))})`,
        )
        .join(', ')
    : escapeHtml(t('Chưa khai báo'));
  const servings =
    preferences.servings_mode === 'manual'
      ? t('{count} suất (tự đặt)', { count: preferences.manual_servings ?? 0 })
      : t('{count} suất (tự tính)', { count: preferences.computed_servings ?? members.length });
  const diet = (preferences.dietary_tags ?? []).map((tag) => t(dietaryTagLabels[tag] ?? tag));
  const regions = (preferences.preferred_regions ?? []).map((region) => t(region));

  const cooked = Math.max(
    (data.cook_logs ?? []).length,
    plans.filter((plan) => plan.status === 'completed').length,
  );
  const range = activityRange(data);
  const upcoming = plans.filter((plan) => plan.date >= today).length;

  const showAll = plans.length <= REPORT_FULL_PLAN_LIMIT;
  const since = shiftDate(today, -REPORT_RECENT_DAYS);
  const listed = (showAll ? plans : plans.filter((plan) => plan.date >= since))
    .slice()
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (MEAL_ORDER[a.meal_type] ?? 9) - (MEAL_ORDER[b.meal_type] ?? 9),
    );
  const grouped = new Map<string, { date: string; meal: string; dishes: string[] }>();
  for (const plan of listed) {
    const key = `${plan.date}|${plan.meal_type}`;
    const entry = grouped.get(key) ?? { date: plan.date, meal: plan.meal_type, dishes: [] };
    entry.dishes.push(plan.recipe_name);
    grouped.set(key, entry);
  }
  const planRows = [...grouped.values()]
    .map(
      (entry) =>
        `<tr${entry.date >= today ? ' class="is-upcoming"' : ''}><td>${escapeHtml(
          formatDisplayDate(entry.date),
        )}</td><td>${escapeHtml(t(MEAL_LABELS[entry.meal] ?? entry.meal))}</td><td>${escapeHtml(
          entry.dishes.join(', '),
        )}</td></tr>`,
    )
    .join('');

  const stat = (label: string, value: number) =>
    `<div class="stat"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`;

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #2b2118; background: #fff; font: 12.5px/1.55 "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; border-bottom: 3px solid #b43b2c; padding-bottom: 10px; margin-bottom: 18px; }
  header h1 { margin: 0; font-size: 20px; color: #8e291f; }
  header p { margin: 2px 0 0; color: #6b5a4b; }
  .brand { font-weight: 800; color: #b43b2c; letter-spacing: .02em; }
  section { margin: 0 0 18px; break-inside: avoid; }
  section.plans { break-inside: auto; }
  h2 { margin: 0 0 8px; font-size: 14px; color: #8e291f; text-transform: uppercase; letter-spacing: .04em; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 5px 8px; border-bottom: 1px solid #eadfd3; }
  .facts th { width: 34%; color: #6b5a4b; font-weight: 600; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .stat { border: 1px solid #eadfd3; border-radius: 10px; padding: 8px 10px; background: #fdf8f2; }
  .stat strong { display: block; font-size: 18px; color: #8e291f; }
  .stat span { color: #6b5a4b; }
  .muted { color: #6b5a4b; margin: 6px 0 0; }
  .plans thead th { background: #f6ece1; color: #5a4636; font-weight: 700; }
  .plans tr { break-inside: avoid; }
  .plans td:first-child { white-space: nowrap; width: 90px; }
  .plans td:nth-child(2) { white-space: nowrap; width: 80px; }
  .is-upcoming td { background: #fffaf0; }
  footer { margin-top: 20px; color: #8a7867; font-size: 11px; border-top: 1px solid #eadfd3; padding-top: 8px; }
</style>
</head>
<body>
<header>
  <div>
    <div class="brand">Bếp Việt</div>
    <h1>${escapeHtml(t('Dữ liệu của {name}', { name: profile.full_name || t('tôi') }))}</h1>
  </div>
  <p>${escapeHtml(t('Xuất ngày {date}', { date: formatDisplayDate(today) }))}</p>
</header>

<section data-section="profile">
  <h2>${escapeHtml(t('Thông tin tài khoản'))}</h2>
  <table class="facts"><tbody>
    ${row(t('Họ và tên'), escapeHtml(profile.full_name))}
    ${row(t('Email'), escapeHtml(profile.email ?? ''))}
    ${row(t('Số điện thoại'), escapeHtml(phone))}
    ${row(t('Vai trò'), escapeHtml(profile.role === 'admin' ? t('Quản trị viên') : t('Thành viên')))}
    ${row(t('Ngày tạo tài khoản'), escapeHtml(formatDisplayDate(profile.created_at)))}
    ${row(t('Thời gian sử dụng'), escapeHtml(t('Đã dùng Bếp Việt được {duration}', { duration: usageDuration(profile.created_at, today, t) })))}
  </tbody></table>
</section>

<section data-section="habits">
  <h2>${escapeHtml(t('Thói quen & tình trạng ăn uống'))}</h2>
  <table class="facts"><tbody>
    ${row(t('Chế độ ăn'), escapeHtml(diet.join(', ')))}
    ${row(t('Dị ứng'), escapeHtml(preferences.allergies ?? ''))}
    ${row(t('Độ cay yêu thích'), escapeHtml(t(SPICE_LABELS[preferences.spice_level ?? ''] ?? '')))}
    ${row(t('Vùng miền yêu thích'), escapeHtml(regions.join(', ')))}
    ${row(t('Thành viên trong bữa ăn'), membersText)}
    ${row(t('Khẩu phần mặc định mỗi bữa'), escapeHtml(servings))}
    ${row(t('Ngày ăn chay'), escapeHtml(vegetarianSummary(preferences, t)))}
  </tbody></table>
</section>

<section data-section="activity">
  <h2>${escapeHtml(t('Tóm tắt hoạt động'))}</h2>
  <div class="stats">
    ${stat(t('Bữa đã lên kế hoạch'), plans.length)}
    ${stat(t('Lần đã nấu'), cooked)}
    ${stat(t('Món yêu thích'), (data.favorites ?? []).length)}
    ${stat(t('Mâm cơm đã lưu'), (data.saved_meals ?? []).length)}
    ${stat(t('Món đã đề xuất'), (data.recipe_submissions ?? []).length)}
    ${stat(t('Bữa sắp tới'), upcoming)}
  </div>
  ${
    range.first
      ? `<p class="muted">${escapeHtml(
          t('Hoạt động đầu tiên {first} · gần nhất {last}', {
            first: formatDisplayDate(range.first),
            last: formatDisplayDate(range.last ?? range.first),
          }),
        )}</p>`
      : ''
  }
</section>

<section class="plans" data-section="plans">
  <h2>${escapeHtml(t('Các bữa đã lên kế hoạch'))}</h2>
  ${
    planRows
      ? `<table><thead><tr><th>${escapeHtml(t('Ngày'))}</th><th>${escapeHtml(t('Bữa'))}</th><th>${escapeHtml(
          t('Món'),
        )}</th></tr></thead><tbody>${planRows}</tbody></table>`
      : `<p class="muted">${escapeHtml(t('Chưa có bữa nào trong kế hoạch.'))}</p>`
  }
  ${
    showAll
      ? ''
      : `<p class="muted">${escapeHtml(
          t('Hiển thị {days} ngày gần nhất và các bữa sắp tới ({shown}/{total} món).', {
            days: REPORT_RECENT_DAYS,
            shown: listed.length,
            total: plans.length,
          }),
        )}</p>`
  }
</section>

<footer>${escapeHtml(
    t('Tài liệu cá nhân do Bếp Việt tạo theo yêu cầu của bạn. Vui lòng không chia sẻ công khai.'),
  )}</footer>
</body>
</html>`;
}

/** In trang báo cáo qua iframe ẩn; người dùng chọn "Lưu dưới dạng PDF" trong hộp thoại in. */
export function printAccountReport(html: string, title: string) {
  document.getElementById('account-report-frame')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'account-report-frame';
  frame.title = title;
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(frame);
  const view = frame.contentWindow;
  const doc = frame.contentDocument ?? view?.document;
  if (!view || !doc) {
    frame.remove();
    return false;
  }
  doc.open();
  doc.write(html);
  doc.close();
  // Chrome lấy tên tệp PDF mặc định theo tiêu đề trang cha.
  const previousTitle = document.title;
  document.title = title;
  const restore = () => {
    document.title = previousTitle;
    window.setTimeout(() => frame.remove(), 1000);
  };
  view.addEventListener('afterprint', restore, { once: true });
  window.setTimeout(() => {
    try {
      view.focus();
      view.print();
    } catch {
      restore();
    }
  }, 60);
  return true;
}
