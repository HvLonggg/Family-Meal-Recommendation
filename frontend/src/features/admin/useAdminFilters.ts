import { useSearchParams } from 'react-router';

/** Đồng bộ bộ lọc bảng quản trị với URL. */
export function useAdminFilters<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(keys.map((key) => [key, params.get(key) ?? ''])) as Record<
    K,
    string
  >;
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);

  const setFilter = (key: K | 'offset', value: string | number) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (key !== 'offset') next.delete('offset');
        if (value === '' || value === 0) next.delete(key);
        else next.set(key, String(value));
        return next;
      },
      { replace: true },
    );
  };

  return { values, offset, setFilter };
}
