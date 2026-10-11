import { vi } from 'vitest';

/** jsdom has no IntersectionObserver: this stand-in records observers so tests can trigger them. */
export class IntersectionObserverMock {
  static instances: IntersectionObserverMock[] = [];

  readonly observed: Element[] = [];
  readonly callback: IntersectionObserverCallback;
  readonly options?: IntersectionObserverInit;
  readonly disconnect = vi.fn();
  readonly unobserve = vi.fn();

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    IntersectionObserverMock.instances.push(this);
  }

  observe(target: Element) {
    this.observed.push(target);
  }

  /** Reports the given elements as entering (or leaving) the observed area. */
  trigger(targets: { target: Element; isIntersecting: boolean; top?: number }[]) {
    const entries = targets.map(({ target, isIntersecting, top = 0 }) => ({
      target,
      isIntersecting,
      boundingClientRect: { top } as DOMRectReadOnly,
    })) as IntersectionObserverEntry[];
    this.callback(entries, this as unknown as IntersectionObserver);
  }

  static latest(): IntersectionObserverMock {
    return IntersectionObserverMock.instances[IntersectionObserverMock.instances.length - 1];
  }
}

/** Installs the mock for the current test; undo with `vi.unstubAllGlobals()`. */
export function installIntersectionObserverMock() {
  IntersectionObserverMock.instances = [];
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
}
