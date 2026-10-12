import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth as authApi, setUnauthorizedHandler } from '../services/api';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Applies a profile change: the new email, and the new token when the password changed. */
  updateSession: (user: User, token?: string) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(() => !!localStorage.getItem('token'));

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }, []);

  // Any API call rejected with a 401 ends the session, so ProtectedRoute redirects to /login.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Only the token found at mount needs validating: login() already returns the user.
  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    authApi.me()
      .then(setUser)
      .catch(logout)
      .finally(() => setIsLoading(false));
  }, [logout]);

  const storeToken = useCallback((newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    storeToken(data.token);
    setUser(data.user);
  }, [storeToken]);

  // A password change revokes the previous token: keeping the new one keeps the admin logged in.
  const updateSession = useCallback((updatedUser: User, newToken?: string) => {
    if (newToken) storeToken(newToken);
    setUser(updatedUser);
  }, [storeToken]);

  const value = useMemo(
    () => ({ user, token, login, logout, updateSession, isLoading }),
    [user, token, login, logout, updateSession, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
