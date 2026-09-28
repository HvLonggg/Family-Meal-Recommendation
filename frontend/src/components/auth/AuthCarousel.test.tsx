import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthCarousel } from '@/components/auth/AuthCarousel';

describe('AuthCarousel', () => {
  it('cho phép người dùng chuyển nội dung bằng nút điều hướng', () => {
    render(<AuthCarousel />);

    expect(
      screen.getByRole('heading', { name: 'Cùng Quyên, trọn vị cơm nhà' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Nội dung tiếp theo' }));

    expect(
      screen.getByRole('heading', { name: 'Món Việt phong phú, cảm hứng mỗi ngày' }),
    ).toBeInTheDocument();
  });
});
