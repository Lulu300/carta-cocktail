// Whether a new version took over while an admin page was open. Set by the service worker
// registration (a public chunk), read by UpdateAvailableBanner (admin chunks): a store of its
// own keeps the banner's React code out of the registration chunk.
let updateAvailable = false;
const listeners = new Set<() => void>();

export function announceUpdate(): void {
  updateAvailable = true;
  listeners.forEach((listener) => listener());
}

export function isUpdateAvailable(): boolean {
  return updateAvailable;
}

/** Subscribes for useSyncExternalStore; returns the unsubscribe function. */
export function subscribeToUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
