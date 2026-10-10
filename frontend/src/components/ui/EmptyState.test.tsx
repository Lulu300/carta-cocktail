import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/test-utils';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
  it('renders the title only when nothing else is given', () => {
    const { container } = render(<EmptyState title="No cocktails" />);
    expect(screen.getByText('No cocktails')).toBeInTheDocument();
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('renders the icon, description and action', () => {
    render(
      <EmptyState
        icon="🍸"
        title="No cocktails"
        description="Create your first cocktail"
        action={<button type="button">Create</button>}
      />,
    );
    expect(screen.getByText('🍸')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Create your first cocktail')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });
});
