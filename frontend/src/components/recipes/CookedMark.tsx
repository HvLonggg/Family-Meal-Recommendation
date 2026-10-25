import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { useAuth } from '@/features/auth/AuthContext';
import {
  deleteCookLog,
  getRecipeCookSummary,
  logCooked,
  recipeCookQueryKey,
} from '@/features/cooking/cookingApi';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage } from '@/lib/errors';

/** Mục nhỏ ở trang món: đánh dấu đã nấu, xem số lần đã nấu và hoàn tác ngay. */
export function CookedMark({ servings, slug }: { servings: number; slug: string }) {
  const { user } = useAuth();
  const { formatDate, t } = useI18n();
  const queryClient = useQueryClient();
  const [justLogged, setJustLogged] = useState<string | null>(null);
  const summary = useQuery({
    queryKey: recipeCookQueryKey(user?.id, slug),
    queryFn: ({ signal }) => getRecipeCookSummary(slug, signal),
    enabled: Boolean(user),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['cook-logs'] });
  const mark = useMutation({
    mutationFn: () => logCooked({ recipe_slug: slug, servings, source: 'manual' }),
    onSuccess: (log) => {
      setJustLogged(log.id);
      void refresh();
    },
  });
  const undo = useMutation({
    mutationFn: (id: string) => deleteCookLog(id),
    onSuccess: () => {
      setJustLogged(null);
      void refresh();
    },
  });
  if (!user) return null;
  const count = summary.data?.count ?? 0;

  return (
    <div className="cooked-mark" role="group" aria-label={t('Ghi nhận đã nấu')}>
      {justLogged ? (
        <>
          <span className="cooked-mark__done">
            <AppIcon name="check" size={16} /> {t('Đã ghi nhận lần nấu này')}
          </span>
          <button
            className="cooked-mark__link"
            disabled={undo.isPending}
            onClick={() => undo.mutate(justLogged)}
            type="button"
          >
            {t('Hoàn tác')}
          </button>
        </>
      ) : (
        <button
          className="cooked-mark__button"
          disabled={mark.isPending}
          onClick={() => mark.mutate()}
          type="button"
        >
          <AppIcon name="check" size={16} /> {t('Đánh dấu đã nấu')}
        </button>
      )}
      {count ? (
        <Link className="cooked-mark__link" to="/account/cooked">
          {t('Đã nấu {count} lần · gần nhất {date}', {
            count,
            date: summary.data?.last_cooked_at
              ? formatDate(summary.data.last_cooked_at, { day: 'numeric', month: 'numeric' })
              : '',
          })}
        </Link>
      ) : null}
      {mark.isError || undo.isError ? (
        <span className="cooked-mark__error" role="alert">
          {errorMessage(mark.error ?? undo.error, t)}
        </span>
      ) : null}
    </div>
  );
}
