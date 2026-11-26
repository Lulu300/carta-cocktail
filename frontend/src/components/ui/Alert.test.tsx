import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/test-utils';
import Alert from './Alert';

describe('Alert', () => {
  it('interrupts the reader for a danger tone', () => {
    render(<Alert tone="danger">Failed</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    expect(screen.getByRole('alert')).toHaveClass(
      'bg-danger/10',
      'border-danger/30',
      'text-danger',
    );
  });

  it.each(['warning', 'success', 'info'] as const)('announces a %s tone politely', (tone) => {
    render(<Alert tone={tone}>Note</Alert>);
    expect(screen.getByRole('status')).toHaveClass(`text-${tone}`);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the title only when given', () => {
    const { rerender } = render(
      <Alert tone="warning" title="Careful">
        Body
      </Alert>,
    );
    expect(screen.getByText('Careful')).toHaveClass('font-semibold');
    rerender(<Alert tone="warning">Body</Alert>);
    expect(screen.queryByText('Careful')).not.toBeInTheDocument();
  });

  it('lets the caller override the role and the size', () => {
    render(
      <Alert tone="success" role="note" size="banner" className="text-lg">
        Done
      </Alert>,
    );
    expect(screen.getByRole('note')).toHaveClass('rounded-xl', 'px-6', 'py-8', 'text-lg');
  });
});
