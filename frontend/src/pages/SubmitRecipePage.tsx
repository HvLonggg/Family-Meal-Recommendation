import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
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

const regions: SubmissionWrite['region'][] = ['Ba miền', 'Bắc', 'Trung', 'Nam'];
const categories = [
  'Món mặn',
  'Món canh',
  'Món rau',
  'Món chay',
  'Món nước',
  'Món ăn sáng',
  'Món tráng miệng',
  'Món ăn kèm',
];

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
  return <SubmissionForm existing={existing} key={existing?.id ?? 'new'} />;
}

function SubmissionForm({ existing }: { existing?: Submission }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const defaultServings = useDefaultServings();
  const [form, setForm] = useState<Omit<SubmissionWrite, 'submit'>>(() =>
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
      : {
          name: '',
          region: 'Ba miền',
          category: 'Món mặn',
          servings: defaultServings,
          total_minutes: 30,
          story: '',
          ingredients: '',
          steps: '',
        },
  );
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: (submit: boolean) =>
      existing
        ? updateSubmission(existing.id, { ...form, submit })
        : createSubmission({ ...form, submit }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mySubmissionsQueryKey(user?.id) });
      await navigate('/account/submissions');
    },
    onError: (saveError) => setError(errorMessage(saveError, t)),
  });

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setError('');
    setForm((current) => ({ ...current, [key]: value }));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate(true);
  };

  return (
    <div className="page-wrap">
      <section className="page-hero page-hero--compact">
        <div className="container">
          <span className="section-label">{t('Cộng đồng Bếp Việt')}</span>
          <h1>{existing ? t('Cập nhật món bạn đề xuất') : t('Đề xuất món nhà bạn yêu thích')}</h1>
          <p>
            {t(
              'Chia sẻ tên món, câu chuyện và công thức. Ban nội dung sẽ kiểm tra trước khi xuất bản.',
            )}
          </p>
        </div>
      </section>
      <section className="content-section">
        <div className="container submission-layout">
          <form className="submission-form" onSubmit={submit}>
            {existing?.admin_note ? (
              <Notice tone="warning">
                {t('Phản hồi từ ban nội dung')}: {existing.admin_note}
              </Notice>
            ) : null}
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <label>
              <span>{t('Tên món ăn')} *</span>
              <input
                maxLength={180}
                minLength={2}
                onChange={(event) => update('name', event.target.value)}
                placeholder={t('Ví dụ: Thịt kho trứng của mẹ')}
                required
                value={form.name}
              />
            </label>
            <div className="form-row form-row--4">
              <label>
                <span>{t('Vùng miền')}</span>
                <select
                  onChange={(event) =>
                    update('region', event.target.value as SubmissionWrite['region'])
                  }
                  value={form.region}
                >
                  {regions.map((region) => (
                    <option key={region} value={region}>
                      {t(region)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('Loại món')}</span>
                <select
                  onChange={(event) => update('category', event.target.value)}
                  value={form.category}
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {t(category)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('Khẩu phần (người)')}</span>
                <input
                  max={30}
                  min={1}
                  onChange={(event) =>
                    update('servings', Math.max(1, Math.min(30, Number(event.target.value) || 1)))
                  }
                  type="number"
                  value={form.servings}
                />
              </label>
              <label>
                <span>{t('Tổng thời gian (phút)')}</span>
                <input
                  max={1440}
                  min={0}
                  onChange={(event) =>
                    update(
                      'total_minutes',
                      Math.max(0, Math.min(1440, Number(event.target.value) || 0)),
                    )
                  }
                  type="number"
                  value={form.total_minutes}
                />
              </label>
            </div>
            <label>
              <span>{t('Câu chuyện hoặc mô tả ngắn')} *</span>
              <textarea
                maxLength={3000}
                minLength={10}
                onChange={(event) => update('story', event.target.value)}
                placeholder={t('Điều gì khiến món này đặc biệt với gia đình bạn?')}
                required
                rows={4}
                value={form.story}
              />
            </label>
            <label>
              <span>{t('Nguyên liệu chính')} *</span>
              <textarea
                maxLength={5000}
                onChange={(event) => update('ingredients', event.target.value)}
                placeholder={t('Mỗi nguyên liệu một dòng, ghi rõ số lượng và đơn vị')}
                required
                rows={6}
                value={form.ingredients}
              />
            </label>
            <label>
              <span>{t('Các bước thực hiện')} *</span>
              <textarea
                maxLength={8000}
                minLength={10}
                onChange={(event) => update('steps', event.target.value)}
                placeholder={t('Mỗi bước một dòng, thêm thời gian hoặc dấu hiệu món đạt nếu có')}
                required
                rows={7}
                value={form.steps}
              />
            </label>
            <div className="editor-form__actions">
              <Link className="text-button" to="/account/submissions">
                {t('Xem đề xuất của tôi')}
              </Link>
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
          <aside className="submission-guide">
            <h3>{t('Một đề xuất tốt nên có')}</h3>
            <ol>
              <li>{t('Tên món rõ ràng, đúng cách gọi quen thuộc.')}</li>
              <li>{t('Định lượng và đơn vị cụ thể cho khẩu phần gốc.')}</li>
              <li>{t('Tách riêng sơ chế và quá trình nấu.')}</li>
              <li>{t('Ảnh tự chụp, đủ sáng và không có watermark.')}</li>
            </ol>
            <p>{t('Nội dung gửi lên chưa tự động hiển thị công khai.')}</p>
          </aside>
        </div>
      </section>
    </div>
  );
}
