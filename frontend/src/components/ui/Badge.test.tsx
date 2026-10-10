import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/test-utils';
import Badge from './Badge';

describe('Badge', () => {
  it('uses the neutral tone by default', () => {
    render(<Badge>Draft</Badge>);
    expect(screen.getByText('Draft')).toHaveClass('bg-line', 'text-fg-muted');
  });

  it('applies the requested tone', () => {
    render(<Badge tone="danger">Empty</Badge>);
    expect(screen.getByText('Empty')).toHaveClass('bg-danger/10', 'text-danger');
  });
});
