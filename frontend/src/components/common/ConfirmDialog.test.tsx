import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConfirmOptions } from '@/components/common/ConfirmDialog';
import { useConfirmDialog } from '@/components/common/useConfirmDialog';

function Harness({
  options,
  onResult,
}: {
  options: ConfirmOptions;
  onResult: (value: string | null) => void;
}) {
  const { confirm, dialog } = useConfirmDialog();
  return (
    <>
      <button onClick={() => void confirm(options).then(onResult)} type="button">
        mở
      </button>
      {dialog}
    </>
  );
}

const base: ConfirmOptions = { title: 'Xóa món?', confirmLabel: 'Xóa', tone: 'danger' };

describe('ConfirmDialog', () => {
  afterEach(cleanup);

  it('focus vào nút Hủy và Esc trả về null', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} options={base} />);
    fireEvent.click(screen.getByText('mở'));

    const dialog = await screen.findByRole('alertdialog', { name: 'Xóa món?' });
    expect(screen.getByRole('button', { name: 'Hủy' })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith(null));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('trả về ghi chú đã nhập khi xác nhận', async () => {
    const onResult = vi.fn();
    render(
      <Harness
        onResult={onResult}
        options={{ ...base, note: { label: 'Lý do', defaultValue: 'cũ' } }}
      />,
    );
    fireEvent.click(screen.getByText('mở'));

    const note = await screen.findByLabelText('Lý do');
    expect(note).toHaveValue('cũ');
    fireEvent.change(note, { target: { value: '  thiếu ảnh  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith('thiếu ảnh'));
  });
});
