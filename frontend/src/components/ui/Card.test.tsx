import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/test-utils';
import Card from './Card';

describe('Card', () => {
  it('renders a padded surface div by default', () => {
    render(<Card data-testid="card">Content</Card>);
    const card = screen.getByTestId('card');
    expect(card.tagName).toBe('DIV');
    expect(card).toHaveClass('bg-surface', 'border-line', 'rounded-xl', 'p-6');
  });

  it('renders as a section without padding', () => {
    render(<Card as="section" padding="none" aria-label="Stats" className="mt-4">Content</Card>);
    const card = screen.getByRole('region', { name: 'Stats' });
    expect(card.tagName).toBe('SECTION');
    expect(card).not.toHaveClass('p-6');
    expect(card).toHaveClass('mt-4');
  });
});
