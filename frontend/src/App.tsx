import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import AdminLayout from './components/layout/AdminLayout';
import PublicLayout from './components/layout/PublicLayout';
import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/admin/DashboardPage';
import CategoriesPage from './pages/admin/CategoriesPage';
import BottlesPage from './pages/admin/BottlesPage';
import IngredientsPage from './pages/admin/IngredientsPage';
import UnitsPage from './pages/admin/UnitsPage';
import CocktailsPage from './pages/admin/CocktailsPage';
import CocktailFormPage from './pages/admin/CocktailFormPage';
import MenusPage from './pages/admin/MenusPage';
import MenuEditPage from './pages/admin/MenuEditPage';
import ShortagesPage from './pages/admin/ShortagesPage';
import MenuPublicPage from './pages/public/MenuPublicPage';
import CocktailPublicPage from './pages/public/CocktailPublicPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center text-gray-500">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route element={<PublicLayout />}>
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
        <Route path="shortages" element={<ShortagesPage />} />
      </Route>

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}
