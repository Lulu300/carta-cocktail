import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter';
import '@fontsource-variable/playfair-display';
import './index.css';
import './i18n';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { SiteSettingsProvider } from './contexts/SiteSettingsContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import Toaster from './components/ui/Toaster';
import { registerChunkReloadHandler } from './utils/chunkReload';
import { createQueryClient } from './queries/queryClient';

registerChunkReloadHandler();

// Production only: the dev server builds no service worker. Loaded after the page, from a
// chunk of its own, so that the first load of the public menu does not carry it. Offline,
// before the precache holds that chunk, the page simply runs without a service worker.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    import('./pwa/registerServiceWorker')
      .then(({ registerServiceWorker }) => registerServiceWorker())
      .catch(() => undefined);
  });
}

const queryClient = createQueryClient();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('The #root element is missing from index.html');

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SiteSettingsProvider>
          <AuthProvider>
            <ConfirmProvider>
              <App />
              <Toaster />
            </ConfirmProvider>
          </AuthProvider>
        </SiteSettingsProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
