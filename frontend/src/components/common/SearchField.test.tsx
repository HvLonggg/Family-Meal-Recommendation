import { fireEvent, render, screen } from '@testing-library/react';
import { useState, type SyntheticEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

import { SearchField } from '@/components/common/SearchField';

describe('SearchField', () => {
  afterEach(cleanup);
  it('clears the query and returns keyboard focus to the input', () => {
    function Search() {
      const [value, setValue] = useState('bún chả');
      return (
        <SearchField label="Tìm món" onChange={setValue} placeholder="Tên món" value={value} />
      );
    }
    render(<Search />);
    fireEvent.click(screen.getByRole('button', { name: 'Xóa từ khóa' }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByRole('searchbox')).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Xóa từ khóa' })).not.toBeInTheDocument();
  });

  it('submits through the containing form', () => {
    const onSubmit = vi.fn((event: SyntheticEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <SearchField
          actionLabel="Tìm kiếm"
          label="Tìm món"
          onChange={() => {}}
          placeholder="Tên món"
          value=""
        />
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
