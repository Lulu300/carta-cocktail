import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import TagList from './TagList';

describe('TagList', () => {
  it('shows one badge per tag, a repeated tag included', () => {
    render(<TagList tags="rum, mint, rum" />);
    expect(screen.getAllByText('rum')).toHaveLength(2);
    expect(screen.getByText('mint')).toBeInTheDocument();
  });

  it('renders nothing without tags', () => {
    const { container } = render(<TagList tags=" , " />);
    expect(container).toBeEmptyDOMElement();
  });
});
