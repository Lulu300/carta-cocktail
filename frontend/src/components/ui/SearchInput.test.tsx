import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/test-utils';
import SearchInput from './SearchInput';

function Harness({ placeholder }: { placeholder?: string }) {
  const [value, setValue] = useState('');
  return <SearchInput value={value} onChange={setValue} label="Search units" placeholder={placeholder} />;
}

describe('SearchInput', () => {
  it('is a search field named by its label, not by its placeholder', () => {
    render(<Harness />);

    const input = screen.getByRole('searchbox', { name: 'Search units' });
    expect(input).toHaveAttribute('placeholder', 'common.search');
    expect(input).toHaveAttribute('enterkeyhint', 'search');
  });

  it('keeps a given placeholder', () => {
    render(<Harness placeholder="Name or abbreviation" />);
    expect(screen.getByLabelText('Search units')).toHaveAttribute('placeholder', 'Name or abbreviation');
  });

  it('shows a named clear button only once something is typed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'common.clearSearch' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Search units'), 'cl');
    await user.click(screen.getByRole('button', { name: 'common.clearSearch' }));

    expect(screen.getByLabelText('Search units')).toHaveValue('');
  });
});
