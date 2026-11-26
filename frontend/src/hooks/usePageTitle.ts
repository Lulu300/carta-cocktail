import { useEffect } from 'react';
import { useSiteSettings } from '../contexts/SiteSettingsContext';
import { joinTitle } from '../utils/pageTitle';

/**
 * Sets the tab title to the non-empty parts, then the site name:
 * `usePageTitle('Mojito', 'Summer menu')` gives "Mojito · Summer menu · My Bar".
 * The site name alone comes back when the page unmounts.
 */
export function usePageTitle(...parts: (string | null | undefined)[]): void {
  const { setPageTitle } = useSiteSettings();
  // The context joins this with the site name, so the order of the effects never matters.
  const title = joinTitle(...parts);

  useEffect(() => {
    setPageTitle(title);
    return () => setPageTitle('');
  }, [title, setPageTitle]);
}
