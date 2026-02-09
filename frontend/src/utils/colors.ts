export const CATEGORY_TYPE_COLORS = [
  'blue', 'purple', 'green', 'red', 'orange', 'yellow', 'pink', 'teal', 'indigo', 'gray',
] as const;

export type CategoryTypeColor = (typeof CATEGORY_TYPE_COLORS)[number];

export const COLOR_BADGE_CLASSES: Record<string, string> = {
  blue: 'bg-blue-500/20 text-blue-400',
  purple: 'bg-purple-500/20 text-purple-400',
  green: 'bg-green-500/20 text-green-400',
  red: 'bg-red-500/20 text-red-400',
  orange: 'bg-orange-500/20 text-orange-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  pink: 'bg-pink-500/20 text-pink-400',
  teal: 'bg-teal-500/20 text-teal-400',
  indigo: 'bg-indigo-500/20 text-indigo-400',
  gray: 'bg-gray-500/20 text-gray-400',
};

export const COLOR_DOT_CLASSES: Record<string, string> = {
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  green: 'bg-green-500',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-500',
  pink: 'bg-pink-500',
  teal: 'bg-teal-500',
  indigo: 'bg-indigo-500',
  gray: 'bg-gray-500',
};

export function getBadgeClasses(color?: string | null): string {
  return COLOR_BADGE_CLASSES[color || 'gray'] || COLOR_BADGE_CLASSES.gray;
}
