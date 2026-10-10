import { describe, it, expect } from 'vitest';
import { render } from '../../test/test-utils';
import Icon from './Icon';

describe('Icon', () => {
  it('renders a decorative svg with the default size', () => {
    const { container } = render(<Icon name="search" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('class', 'size-5');
    expect(container.querySelector('path')?.getAttribute('d')).toContain('M21 21l-6-6');
  });

  it('lets className replace the default size', () => {
    const { container } = render(<Icon name="plus" className="size-4" />);
    expect(container.querySelector('svg')).toHaveAttribute('class', 'size-4');
  });
});
