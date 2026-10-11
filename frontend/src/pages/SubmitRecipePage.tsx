import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import familyMealImage from '@/assets/auth/mam-com-nha.webp';
import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { Button } from '@/components/ui/Button';
import { LoadingBlock, Notice } from '@/components/ui/Workspace';
import { useDefaultServings } from '@/features/account/preferences';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';
import {
  createSubmission,
  listMySubmissions,
  mySubmissionsQueryKey,
  updateSubmission,
  type Submission,
  type SubmissionWrite,
} from '@/features/submissions/submissionsApi';
import { errorMessage } from '@/lib/errors';

type SubmissionForm = Omit<SubmissionWrite, 'submit'>;

const regions: SubmissionWrite['region'][] = ['Ba miền', 'Bắc', 'Trung', 'Nam'];
const categories: { id: string; icon: IconName }[] = [
  { id: 'Món mặn', icon: 'plate' },
  { id: 'Món canh', icon: 'chef' },
  { id: 'Món rau', icon: 'leaf' },
  { id: 'Món chay', icon: 'leaf' },
  { id: 'Món nước', icon: 'chef' },
  { id: 'Món ăn sáng', icon: 'clock' },
  { id: 'Món tráng miệng', icon: 'sparkles' },
  { id: 'Món ăn kèm', icon: 'plate' },
];
const LIMITS = { name: 180, story: 3000, ingredients: 5000, steps: 8000 };

const countLines = (text: string) => text.split('\n').filter((line) => line.trim()).length;

function draftKey(userId: string | undefined) {
  return `bep-viet:submission-draft:${userId ?? 'guest'}`;
}

function readDraft(userId: string | undefined): SubmissionForm | null {
  try {
    const raw = window.localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<SubmissionForm>;
    return typeof draft.name === 'string' && typeof draft.story === 'string'
      ? (draft as SubmissionForm)
      : null;
  } catch {
    return null;
  }
}

function writeDraft(userId: string | undefined, form: SubmissionForm | null) {
  try {
    if (form) window.localStorage.setItem(draftKey(userId), JSON.stringify(form));
    else window.localStorage.removeItem(draftKey(userId));
  } catch {
    // Trình duyệt chặn lưu trữ: chỉ mất tính năng tự lưu nháp trên máy.
  }
}

export function SubmitRecipePage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const submissions = useQuery({
    queryKey: mySubmissionsQueryKey(user?.id),
    queryFn: ({ signal }) => listMySubmissions(signal),
    enabled: Boolean(user && editId),
  });

  if (editId && submissions.isLoading) return <LoadingBlock label={t('Đang mở đề xuất…')} />;
  const existing = editId ? submissions.data?.data.find((item) => item.id === editId) : undefined;
  return <SubmissionEditor existing={existing} key={existing?.id ?? 'new'} />;
}

function SubmissionEditor({ existing }: { existing?: Submission }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const defaultServings = useDefaultServings();
  const emptyForm: SubmissionForm = {
    name: '',
    region: 'Ba miền',
    category: 'Món mặn',
    servings: defaultServings,
    total_minutes: 30,
    story: '',
    ingredients: '',
    steps: '',
  };
  // Đề xuất mới được tự lưu nháp trên máy để không mất công khi lỡ tải lại trang.
  const [restored] = useState(() => (existing ? null : readDraft(user?.id)));
  const [form, setForm] = useState<SubmissionForm>(() =>
    existing
      ? {
          name: existing.name,
          region: existing.region,
          category: existing.category,
          servings: existing.servings,
          total_minutes: existing.total_minutes,
          story: existing.story,
          ingredients: existing.ingredients,
          steps: existing.steps,
        }
      : (restored ?? emptyForm),
  );
  const [showRestored, setShowRestored] = useState(Boolean(restored));
  const [error, setError] = useState('');

  useEffect(() => {
    if (existing) return;
    const timer = window.setTimeout(() => {
      const touched =
        form.name.trim() || form.story.trim() || form.ingredients.trim() || form.steps.trim();
      writeDraft(user?.id, touched ? form : null);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [existing, form, user?.id]);

  const save = useMutation({
    mutationFn: (submit: boolean) =>
      existing
        ? updateSubmission(existing.id, { ...form, submit })
        : createSubmission({ ...form, submit }),
    onSuccess: async () => {
      if (!existing) writeDraft(user?.id, null);
      await queryClient.invalidateQueries({ queryKey: mySubmissionsQueryKey(user?.id) });
      await navigate('/account/submissions');
    },
    onError: (saveError) => setError(errorMessage(saveError, t)),
  });

  const update = <K extends keyof SubmissionForm>(key: K, value: SubmissionForm[K]) => {
    setError('');
    setForm((current) => ({ ...current, [key]: value }));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate(true);
  };

  const ingredientCount = countLines(form.ingredients);
  const stepCount = countLines(form.steps);
  const checklist = [
    { done: form.name.trim().length >= 2, label: t('Tên món rõ ràng') },
    { done: form.story.trim().length >= 10, label: t('Câu chuyện hoặc mô tả ngắn') },
    { done: ingredientCount >= 2, label: t('Ít nhất 2 nguyên liệu kèm định lượng') },
    { done: stepCount >= 2, label: t('Ít nhất 2 bước thực hiện') },
  ];
  const progress = Math.round(
    (checklist.filter((item) => item.done).length / checklist.length) * 100,
  );
  const sections = [
    { id: 'submit-basics', label: t('Thông tin món'), done: checklist[0]!.done },
    { id: 'submit-story', label: t('Câu chuyện'), done: checklist[1]!.done },
    { id: 'submit-recipe', label: t('Công thức'), done: checklist[2]!.done && checklist[3]!.done },
  ];

  return (
    <div className="page-wrap submit-page">
      <section className="submit-hero">
        <div className="container submit-hero__inner">
          <span className="section-label">{t('Cộng đồng Bếp Việt')}</span>
          <h1>{existing ? t('Cập nhật món bạn đề xuất') : t('Đề xuất món nhà bạn yêu thích')}</h1>
          <p>
            {t(
              'Chia sẻ tên món, câu chuyện và công thức. Ban nội dung sẽ kiểm tra trước khi xuất bản.',
            )}
          </p>
          <ol className="submit-steps" aria-label={t('Các phần cần điền')}>
            {sections.map((section, index) => (
              <li className={section.done ? 'is-done' : ''} key={section.id}>
                <a href={`#${section.id}`}>
                  <span>{section.done ? <AppIcon name="check" size={15} /> : index + 1}</span>
                  {section.label}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="content-section submit-body">
        <div className="container submit-layout">
          <form className="submit-form" onSubmit={submit}>
            {existing?.admin_note ? (
              <Notice tone="warning">
                {t('Phản hồi từ ban nội dung')}: {existing.admin_note}
              </Notice>
            ) : null}
            {showRestored ? (
              <div className="submit-restored" role="status">
                <AppIcon name="history" size={18} />
                <span>{t('Đã khôi phục bản nháp bạn đang soạn dở trên máy này.')}</span>
                <button
                  onClick={() => {
                    setForm(emptyForm);
                    setShowRestored(false);
                    writeDraft(user?.id, null);
                  }}
                  type="button"
                >
                  {t('Bắt đầu lại')}
                </button>
              </div>
            ) : null}
            {error ? <Notice tone="danger">{error}</Notice> : null}

            <FormCard
              description={t('Tên gọi quen thuộc giúp mọi người dễ tìm thấy món của bạn.')}
              icon="plate"
              id="submit-basics"
              step={1}
              title={t('Thông tin món')}
            >
              <label className="submit-field">
                <span className="submit-field__label">
                  {t('Tên món ăn')} <b aria-hidden="true">*</b>
                </span>
                <input
                  className="submit-input submit-input--large"
                  maxLength={LIMITS.name}
                  minLength={2}
                  onChange={(event) => update('name', event.target.value)}
                  placeholder={t('Ví dụ: Thịt kho trứng của mẹ')}
                  required
                  value={form.name}
                />
              </label>
              <fieldset className="submit-field">
                <legend className="submit-field__label">{t('Vùng miền')}</legend>
                <div className="submit-chips">
                  {regions.map((region) => (
                    <label className="submit-chip" key={region}>
                      <input
                        checked={form.region === region}
                        name="region"
                        onChange={() => update('region', region)}
                        type="radio"
                        value={region}
                      />
                      <span>
                        <AppIcon name="pin" size={15} />
                        {t(region)}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="submit-field">
                <legend className="submit-field__label">{t('Loại món')}</legend>
                <div className="submit-chips">
                  {categories.map((category) => (
                    <label className="submit-chip" key={category.id}>
                      <input
                        checked={form.category === category.id}
                        name="category"
                        onChange={() => update('category', category.id)}
                        type="radio"
                        value={category.id}
                      />
                      <span>
                        <AppIcon name={category.icon} size={15} />
                        {t(category.id)}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="submit-steppers">
                <NumberStepper
                  icon="users"
                  label={t('Khẩu phần (người)')}
                  max={30}
                  min={1}
                  onChange={(value) => update('servings', value)}
                  step={1}
                  value={form.servings}
                />
                <NumberStepper
                  icon="clock"
                  label={t('Tổng thời gian (phút)')}
                  max={1440}
                  min={0}
                  onChange={(value) => update('total_minutes', value)}
                  step={5}
                  value={form.total_minutes}
                />
              </div>
            </FormCard>

            <FormCard
              description={t('Kỷ niệm, xuất xứ hay lý do món này đặc biệt với gia đình bạn.')}
              icon="heart"
              id="submit-story"
              step={2}
              title={t('Câu chuyện')}
            >
              <label className="submit-field">
                <span className="submit-field__label">
                  {t('Câu chuyện hoặc mô tả ngắn')} <b aria-hidden="true">*</b>
                </span>
                <textarea
                  className="submit-input"
                  maxLength={LIMITS.story}
                  minLength={10}
                  onChange={(event) => update('story', event.target.value)}
                  placeholder={t('Điều gì khiến món này đặc biệt với gia đình bạn?')}
                  required
                  rows={4}
                  value={form.story}
                />
                <span className="submit-field__meta">
                  {form.story.length}/{LIMITS.story}
                </span>
              </label>
            </FormCard>

            <FormCard
              description={t(
                'Mỗi dòng một nguyên liệu hoặc một bước, ghi rõ định lượng và dấu hiệu món đạt.',
              )}
              icon="chef"
              id="submit-recipe"
              step={3}
              title={t('Công thức')}
            >
              <label className="submit-field">
                <span className="submit-field__label">
                  {t('Nguyên liệu chính')} <b aria-hidden="true">*</b>
                </span>
                <textarea
                  className="submit-input submit-input--lines"
                  maxLength={LIMITS.ingredients}
                  onChange={(event) => update('ingredients', event.target.value)}
                  placeholder={[
                    t('Ví dụ:'),
                    t('500 g thịt ba chỉ'),
                    t('4 quả trứng vịt'),
                    t('3 muỗng canh nước mắm'),
                  ].join('\n')}
                  required
                  rows={6}
                  value={form.ingredients}
                />
                <span className="submit-field__meta">
                  <AppIcon name="leaf" size={14} />
                  {t('{count} nguyên liệu', { count: ingredientCount })}
                </span>
              </label>
              <label className="submit-field">
                <span className="submit-field__label">
                  {t('Các bước thực hiện')} <b aria-hidden="true">*</b>
                </span>
                <textarea
                  className="submit-input submit-input--lines"
                  maxLength={LIMITS.steps}
                  minLength={10}
                  onChange={(event) => update('steps', event.target.value)}
                  placeholder={[
                    t('Ví dụ:'),
                    t('Thịt rửa sạch, cắt miếng vừa ăn, ướp nước mắm 20 phút.'),
                    t('Thắng nước màu, cho thịt vào đảo đến khi săn.'),
                  ].join('\n')}
                  required
                  rows={7}
                  value={form.steps}
                />
                <span className="submit-field__meta">
                  <AppIcon name="check" size={14} />
                  {t('{count} bước', { count: stepCount })}
                </span>
              </label>
            </FormCard>

            <div className="submit-actions">
              <Link className="text-button" to="/account/submissions">
                {t('Xem đề xuất của tôi')}
              </Link>
              <span className="submit-actions__spacer" />
              {!existing ? (
                <small className="submit-actions__autosave">
                  <AppIcon name="save" size={14} /> {t('Tự lưu nháp trên máy')}
                </small>
              ) : null}
              <Button
                disabled={save.isPending}
                onClick={() => save.mutate(false)}
                variant="secondary"
              >
                <AppIcon name="save" size={16} /> {t('Lưu bản nháp')}
              </Button>
              <Button isLoading={save.isPending} type="submit">
                <AppIcon name="check" size={16} /> {t('Gửi đề xuất')}
              </Button>
            </div>
          </form>

          <aside className="submit-aside">
            <div className="submit-progress">
              <div
                aria-label={t('Mức độ hoàn thiện')}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={progress}
                className="submit-progress__ring"
                role="progressbar"
                style={{
                  background: `conic-gradient(var(--color-primary) ${progress * 3.6}deg, #efe3d6 0deg)`,
                }}
              >
                <span>{progress}%</span>
              </div>
              <div>
                <strong>{progress === 100 ? t('Sẵn sàng gửi!') : t('Mức độ hoàn thiện')}</strong>
                <ul>
                  {checklist.map((item) => (
                    <li className={item.done ? 'is-done' : ''} key={item.label}>
                      <AppIcon name={item.done ? 'check' : 'minus'} size={14} />
                      {item.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="submit-preview">
              <span className="submit-preview__label">
                <AppIcon name="eye" size={15} /> {t('Xem trước thẻ món')}
              </span>
              <article>
                <div className="submit-preview__media">
                  <img alt="" src={familyMealImage} />
                  <span>{t(form.category)}</span>
                </div>
                <div className="submit-preview__body">
                  <small>
                    <AppIcon name="pin" size={13} /> {t(form.region)}
                  </small>
                  <h3>{form.name.trim() || t('Tên món của bạn')}</h3>
                  <p>{form.story.trim() || t('Câu chuyện ngắn về món ăn sẽ hiển thị ở đây.')}</p>
                  <div className="submit-preview__facts">
                    <span>
                      <AppIcon name="clock" size={14} />{' '}
                      {t('{count} phút', { count: form.total_minutes })}
                    </span>
                    <span>
                      <AppIcon name="users" size={14} />{' '}
                      {t('{count} người', { count: form.servings })}
                    </span>
                  </div>
                </div>
              </article>
            </div>

            <div className="submit-guide">
              <h3>
                <AppIcon name="sparkles" size={18} /> {t('Một đề xuất tốt nên có')}
              </h3>
              <ol>
                <li>{t('Tên món rõ ràng, đúng cách gọi quen thuộc.')}</li>
                <li>{t('Định lượng và đơn vị cụ thể cho khẩu phần gốc.')}</li>
                <li>{t('Tách riêng sơ chế và quá trình nấu.')}</li>
                <li>{t('Ảnh tự chụp, đủ sáng và không có watermark.')}</li>
              </ol>
              <p>
                <AppIcon name="shield" size={15} />
                {t('Nội dung gửi lên chưa tự động hiển thị công khai.')}
              </p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function FormCard({
  children,
  description,
  icon,
  id,
  step,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: IconName;
  id: string;
  step: number;
  title: string;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="submit-card" id={id}>
      <header className="submit-card__head">
        <span className="submit-card__step">{step}</span>
        <div>
          <h2 id={`${id}-title`}>
            <AppIcon name={icon} size={19} /> {title}
          </h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="submit-card__body">{children}</div>
    </section>
  );
}

function NumberStepper({
  icon,
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  icon: IconName;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  const { t } = useI18n();
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  return (
    <label className="submit-field number-stepper">
      <span className="submit-field__label">
        <AppIcon name={icon} size={15} /> {label}
      </span>
      <span className="number-stepper__control">
        <button
          aria-label={t('Giảm {label}', { label })}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
          type="button"
        >
          <AppIcon name="minus" size={16} />
        </button>
        <input
          inputMode="numeric"
          max={max}
          min={min}
          onChange={(event) => onChange(clamp(Number(event.target.value) || 0))}
          type="number"
          value={value}
        />
        <button
          aria-label={t('Tăng {label}', { label })}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + step))}
          type="button"
        >
          <AppIcon name="plus" size={16} />
        </button>
      </span>
    </label>
  );
}
