import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import './i18n';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { SiteSettingsProvider } from './contexts/SiteSettingsContext';
import { registerChunkReloadHandler } from './utils/chunkReload';
import { createQueryClient } from './queries/queryClient';

registerChunkReloadHandler();

const queryClient = createQueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SiteSettingsProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </SiteSettingsProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
