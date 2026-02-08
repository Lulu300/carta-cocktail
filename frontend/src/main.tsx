import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import './i18n';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { SiteSettingsProvider } from './contexts/SiteSettingsContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SiteSettingsProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </SiteSettingsProvider>
    </BrowserRouter>
  </StrictMode>,
);
