import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '../../test/test-utils';
import LiveResultCount from './LiveResultCount';

function liveRegion() {
  return document.querySelector('[aria-live="polite"]');
}

describe('LiveResultCount', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('announces the count after a short pause', () => {
    render(<LiveResultCount count={3} />);
    expect(liveRegion()).toBeEmptyDOMElement();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText('3 results')).toBe(liveRegion());
  });

  it('announces only the last count while the user is typing', () => {
    const { rerender } = render(<LiveResultCount count={12} />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender(<LiveResultCount count={4} />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender(<LiveResultCount count={1} />);
    expect(liveRegion()).toBeEmptyDOMElement();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(liveRegion()).toHaveTextContent('1 result');
  });

  it('empties the region when there is nothing to announce', () => {
    const { rerender } = render(<LiveResultCount count={2} />);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    rerender(<LiveResultCount count={null} />);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(liveRegion()).toBeEmptyDOMElement();
  });
});
