import { describe, it, expect } from 'vitest';
import { render } from '../../test/test-utils';
import Icon from './Icon';

describe('Icon', () => {
  it('renders a decorative 20 px svg', () => {
    const { container } = render(<Icon name="search" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '20');
    expect(svg).toHaveAttribute('height', '20');
    expect(container.querySelector('path')?.getAttribute('d')).toContain('M21 21l-6-6');
  });

  it('keeps the default size with a colour-only className', () => {
    const { container } = render(<Icon name="edit" className="text-danger" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('class', 'text-danger');
    expect(svg).toHaveAttribute('width', '20');
  });
});
