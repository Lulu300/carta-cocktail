import { cx } from '../ui/classNames';

const DEV_VERSION = 'dev';

/**
 * Label of a build version: "v1.8.0" for a release, "dev" when the version is
 * unknown (`npm run dev`, or an image built without the APP_VERSION build arg).
 */
function formatAppVersion(version: string | undefined): string {
  const trimmed = version?.trim();
  if (!trimmed || trimmed === DEV_VERSION) return DEV_VERSION;
  return `v${trimmed}`;
}

/**
 * Version of the running frontend. VITE_APP_VERSION is set at image build time
 * from the release tag (see frontend/Dockerfile and the release workflow).
 */
export default function AppVersion({ className }: { className?: string }) {
  return <p className={cx('text-xs text-fg-muted', className)}>{formatAppVersion(import.meta.env.VITE_APP_VERSION)}</p>;
}
