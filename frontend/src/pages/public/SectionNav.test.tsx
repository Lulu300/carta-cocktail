import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntersectionObserverMock, installIntersectionObserverMock } from '../../test/intersectionObserverMock';
import SectionNav from './SectionNav';

const items = [
  { anchorId: 'section-1', label: 'Classics' },
  { anchorId: 'section-2', label: 'Signatures' },
  { anchorId: 'section-3', label: 'Mocktails' },
];

function renderWithSections(navItems = items) {
  return render(
    <>
      <SectionNav items={navItems} />
      {items.map((item) => <section key={item.anchorId} id={item.anchorId}>{item.label}</section>)}
    </>,
  );
}

function chip(label: string) {
  return screen.getByRole('button', { name: label });
}

function section(id: string) {
  return document.getElementById(id)!;
}

describe('SectionNav', () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    installIntersectionObserverMock();
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the sections in a labelled navigation, the first one active', () => {
    renderWithSections();

    expect(screen.getByRole('navigation', { name: 'public.sectionNav' })).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Classics', 'Signatures', 'Mocktails']);
    expect(chip('Classics')).toHaveAttribute('aria-current', 'true');
    expect(chip('Signatures')).not.toHaveAttribute('aria-current');
  });

  it('scrolls to the section on click and marks it active', async () => {
    const user = userEvent.setup();
    renderWithSections();

    await user.click(chip('Mocktails'));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(scrollIntoView.mock.contexts[0]).toBe(section('section-3'));
    expect(chip('Mocktails')).toHaveAttribute('aria-current', 'true');
  });

  it('jumps without animation when the user prefers reduced motion', async () => {
    vi.mocked(window.matchMedia).mockReturnValueOnce({ matches: true } as MediaQueryList);
    const user = userEvent.setup();
    renderWithSections();

    await user.click(chip('Signatures'));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('follows the section that crosses the top of the screen while scrolling', () => {
    renderWithSections();
    const observer = IntersectionObserverMock.latest();
    expect(observer.observed).toEqual([section('section-1'), section('section-2'), section('section-3')]);

    act(() => observer.trigger([
      { target: section('section-1'), isIntersecting: false },
      { target: section('section-3'), isIntersecting: true, top: 400 },
      { target: section('section-2'), isIntersecting: true, top: 100 },
    ]));

    expect(chip('Signatures')).toHaveAttribute('aria-current', 'true');
    expect(chip('Classics')).not.toHaveAttribute('aria-current');
  });

  it('keeps the active section when nothing crosses the band', () => {
    renderWithSections();

    act(() => IntersectionObserverMock.latest().trigger([{ target: section('section-1'), isIntersecting: false }]));

    expect(chip('Classics')).toHaveAttribute('aria-current', 'true');
  });

  it('falls back to the first section left when a search removes the active one', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithSections();
    await user.click(chip('Mocktails'));

    rerender(<SectionNav items={items.slice(0, 2)} />);

    expect(chip('Classics')).toHaveAttribute('aria-current', 'true');
  });

  it('stops observing when unmounted', () => {
    const { unmount } = renderWithSections();
    const observer = IntersectionObserverMock.latest();

    unmount();

    expect(observer.disconnect).toHaveBeenCalled();
  });
});
