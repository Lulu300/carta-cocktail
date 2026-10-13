import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useClickOutside } from './useClickOutside';

function Panel({ onOutside, enabled }: { onOutside: () => void; enabled?: boolean }) {
  const ref = useClickOutside<HTMLDivElement>(onOutside, enabled);
  return (
    <>
      <div ref={ref} data-testid="panel">
        <button type="button">inside</button>
      </div>
      <button type="button">outside</button>
    </>
  );
}

describe('useClickOutside', () => {
  it('calls the handler on a press outside the element, mouse or touch', () => {
    const onOutside = vi.fn();
    render(<Panel onOutside={onOutside} />);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    fireEvent.touchStart(document.body);

    expect(onOutside).toHaveBeenCalledTimes(2);
  });

  it('ignores a press inside the element', () => {
    const onOutside = vi.fn();
    render(<Panel onOutside={onOutside} />);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'inside' }));
    fireEvent.touchStart(screen.getByTestId('panel'));

    expect(onOutside).not.toHaveBeenCalled();
  });

  it('listens to nothing while disabled', () => {
    const onOutside = vi.fn();
    render(<Panel onOutside={onOutside} enabled={false} />);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));

    expect(onOutside).not.toHaveBeenCalled();
  });

  it('stops listening once unmounted', () => {
    const onOutside = vi.fn();
    const { unmount } = render(<Panel onOutside={onOutside} />);

    unmount();
    fireEvent.mouseDown(document.body);

    expect(onOutside).not.toHaveBeenCalled();
  });
});
