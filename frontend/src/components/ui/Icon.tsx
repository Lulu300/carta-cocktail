import type { ComponentPropsWithRef } from 'react';

// Outline paths (24x24) previously copied inline across the pages.
const ICON_PATHS = {
  edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  delete: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  close: 'M6 18L18 6M6 6l12 12',
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  'chevron-down': 'M19 9l-7 7-7-7',
  download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  plus: 'M12 4v16m8-8H4',
} as const;

export type IconName = keyof typeof ICON_PATHS;

interface IconProps extends Omit<ComponentPropsWithRef<'svg'>, 'children'> {
  name: IconName;
}

/**
 * Decorative icon: the surrounding control carries the accessible name.
 * `className` replaces the default size, since two size utilities would conflict.
 */
export default function Icon({ name, className = 'size-5', ...rest }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      {...rest}
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON_PATHS[name]} />
    </svg>
  );
}
