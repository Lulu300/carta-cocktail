import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/test-utils';
import Spinner from './Spinner';

describe('Spinner', () => {
  it('announces the default loading label', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toHaveTextContent('common.loading');
    expect(screen.getByText('common.loading')).toHaveClass('sr-only');
  });

  it('announces a custom label', () => {
    render(<Spinner label="Saving" className="text-accent" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Saving');
    expect(status).toHaveClass('text-accent');
  });
});
