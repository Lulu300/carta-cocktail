/**
 * The admin side (/admin, /login): always loaded from the network (navigateFallbackDenylist in
 * vite.config.ts), and never reloaded by a new version, which would lose a form in progress.
 */
export const ADMIN_PAGES = /^\/(admin|login)(\/|$)/;
