import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthField } from '@/components/auth/AuthField';

describe('AuthField', () => {
  it('liên kết nhãn và thông báo lỗi để hỗ trợ truy cập', () => {
    render(<AuthField error="Email chưa đúng định dạng." id="email" label="Địa chỉ email" />);

    const input = screen.getByLabelText('Địa chỉ email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Email chưa đúng định dạng.');
  });

  it('cho phép hiện và ẩn mật khẩu', () => {
    render(<AuthField id="password" label="Mật khẩu" type="password" />);

    const input = screen.getByLabelText('Mật khẩu');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(input).toHaveAttribute('type', 'text');
  });
});
