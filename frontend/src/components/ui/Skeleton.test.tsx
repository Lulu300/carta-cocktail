import { describe, it, expect } from 'vitest';
import { render } from '../../test/test-utils';
import Skeleton from './Skeleton';

describe('Skeleton', () => {
  it('renders a hidden pulsing placeholder that respects reduced motion', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    const skeleton = container.firstElementChild;
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton).toHaveClass('animate-pulse', 'motion-reduce:animate-none', 'h-4', 'w-32');
  });
});
