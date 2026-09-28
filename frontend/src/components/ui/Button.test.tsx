import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('gọi hành động khi người dùng nhấn nút', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Lưu công thức</Button>);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu công thức' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('khóa tương tác và hiển thị trạng thái tiếng Việt khi đang xử lý', () => {
    render(<Button isLoading>Lưu công thức</Button>);

    const button = screen.getByRole('button', { name: 'Đang xử lý' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
