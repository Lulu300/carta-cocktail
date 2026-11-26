import { useSiteSettings } from '../../contexts/SiteSettingsContext';

/** The name is empty until the settings arrive; a no-break space keeps the line at its height. */
export default function SiteName() {
  const { siteSettings } = useSiteSettings();
  return <>{siteSettings.siteName || ' '}</>;
}
