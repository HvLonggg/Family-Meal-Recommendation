import { useCallback, useState, type ReactNode } from 'react';

import { ConfirmDialog, type ConfirmOptions } from '@/components/common/ConfirmDialog';

/**
 * Hook dạng promise: `const ok = await confirm({...})` trả `null` khi hủy,
 * ngược lại trả chuỗi ghi chú (rỗng nếu không có ô ghi chú).
 */
export function useConfirmDialog(): {
  confirm: (options: ConfirmOptions) => Promise<string | null>;
  dialog: ReactNode;
} {
  const [state, setState] = useState<{
    key: number;
    options: ConfirmOptions;
    resolve: (value: string | null) => void;
  } | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<string | null>((resolve) => {
        setState((current) => {
          current?.resolve(null);
          return { key: (current?.key ?? 0) + 1, options, resolve };
        });
      }),
    [],
  );

  const close = (value: string | null) => {
    state?.resolve(value);
    setState(null);
  };

  const dialog = state ? (
    <ConfirmDialog
      {...state.options}
      key={state.key}
      onCancel={() => close(null)}
      onConfirm={(note) => close(note)}
      open
    />
  ) : null;

  return { confirm, dialog };
}
