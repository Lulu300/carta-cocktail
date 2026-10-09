import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';
import PublicLayout from './components/layout/PublicLayout';
import HomePage from './pages/public/HomePage';
import MenuPublicPage from './pages/public/MenuPublicPage';
import CocktailPublicPage from './pages/public/CocktailPublicPage';

// Guests scanning a menu QR code only need the public pages: everything behind
// /login and /admin is split into on-demand chunks to keep the first load small.
const AdminLayout = lazy(() => import('./components/layout/AdminLayout'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const CategoriesPage = lazy(() => import('./pages/admin/CategoriesPage'));
const BottlesPage = lazy(() => import('./pages/admin/BottlesPage'));
const IngredientsPage = lazy(() => import('./pages/admin/IngredientsPage'));
const UnitsPage = lazy(() => import('./pages/admin/UnitsPage'));
const CocktailsPage = lazy(() => import('./pages/admin/CocktailsPage'));
const CocktailFormPage = lazy(() => import('./pages/admin/CocktailFormPage'));
const MenusPage = lazy(() => import('./pages/admin/MenusPage'));
const MenuEditPage = lazy(() => import('./pages/admin/MenuEditPage'));
const MenuBottleEditPage = lazy(() => import('./pages/admin/MenuBottleEditPage'));
const ShortagesPage = lazy(() => import('./pages/admin/ShortagesPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));

function RouteFallback() {
  const { t } = useTranslation();
  return (
    <div role="status" className="min-h-screen bg-[#0f0f1a] flex items-center justify-center text-gray-500">
      {t('common.loading')}
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <RouteFallback />;
  // Remember the requested page so LoginPage can return to it after sign-in
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}

export default function App() {
  // Router navigations run in a transition, so moving between admin pages keeps
  // the current page on screen while the next chunk loads: one boundary is enough.
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Public routes */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/menu/:slug" element={<MenuPublicPage />} />
          <Route path="/menu/:slug/cocktail/:id" element={<CocktailPublicPage />} />
        </Route>

        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="bottles" element={<BottlesPage />} />
          <Route path="ingredients" element={<IngredientsPage />} />
          <Route path="units" element={<UnitsPage />} />
          <Route path="cocktails" element={<CocktailsPage />} />
          <Route path="cocktails/new" element={<CocktailFormPage />} />
          <Route path="cocktails/:id" element={<CocktailFormPage />} />
          <Route path="menus" element={<MenusPage />} />
          <Route path="menus/:id" element={<MenuEditPage />} />
          <Route path="menus/:id/bottles" element={<MenuBottleEditPage />} />
          <Route path="shortages" element={<ShortagesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
}
