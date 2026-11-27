import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import IconButton from './IconButton';

/** Switches the public menu between the dark theme and the light one, which suits daylight. */
export default function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const isLight = theme === 'light';

  return (
    <IconButton
      icon="sun"
      variant="neutral"
      label={t('nav.lightTheme')}
      aria-pressed={isLight}
      onClick={() => setTheme(isLight ? 'dark' : 'light')}
      className={isLight ? 'text-accent' : undefined}
    />
  );
}
