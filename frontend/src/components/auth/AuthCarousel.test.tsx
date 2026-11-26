import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthCarousel } from '@/components/auth/AuthCarousel';

describe('AuthCarousel', () => {
  it('cho phép người dùng chuyển nội dung bằng nút điều hướng', () => {
    render(<AuthCarousel />);

    // Tiêu đề slide là đoạn văn, không phải heading: mỗi trang auth chỉ có một h1 (R-08).
    expect(screen.getByText('Cùng Bếp Việt, trọn vị cơm nhà')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Nội dung tiếp theo' }));

    const active = screen.getByText('Món Việt phong phú, cảm hứng mỗi ngày').closest('article');
    expect(active).toHaveClass('is-active');
  });
});
