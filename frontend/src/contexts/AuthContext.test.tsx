import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';

// Mock the API
vi.mock('../services/api', () => ({
  auth: {
    login: vi.fn(),
    me: vi.fn(),
  },
  setUnauthorizedHandler: vi.fn(),
}));

import { auth as authApi, setUnauthorizedHandler } from '../services/api';
const mockLogin = vi.mocked(authApi.login);
const mockMe = vi.mocked(authApi.me);
const mockSetUnauthorizedHandler = vi.mocked(setUnauthorizedHandler);

/** Returns the last handler AuthProvider registered with the API client. */
function registeredUnauthorizedHandler(): () => void {
  const handler = mockSetUnauthorizedHandler.mock.calls.at(-1)?.[0];
  if (!handler) throw new Error('No unauthorized handler registered');
  return handler;
}

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('AuthContext', () => {
  it('should have null user and token initially when no stored token', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('should validate stored token on mount', async () => {
    localStorage.setItem('token', 'stored-token');
    mockMe.mockResolvedValueOnce({ id: 1, email: 'admin@test.local' });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toEqual({ id: 1, email: 'admin@test.local' });
    expect(mockMe).toHaveBeenCalledTimes(1);
  });

  it('should clear token if validation fails', async () => {
    localStorage.setItem('token', 'invalid-token');
    mockMe.mockRejectedValueOnce(new Error('Unauthorized'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('should login and set user/token without calling /auth/me', async () => {
    mockLogin.mockResolvedValueOnce({
      token: 'new-token',
      user: { id: 1, email: 'admin@test.local' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('admin@test.local', 'password');
    });

    expect(result.current.user).toEqual({ id: 1, email: 'admin@test.local' });
    expect(result.current.token).toBe('new-token');
    expect(localStorage.getItem('token')).toBe('new-token');
    expect(mockMe).not.toHaveBeenCalled();
  });

  it('should clear user and token when the API reports an unauthorized request', async () => {
    localStorage.setItem('token', 'stored-token');
    mockMe.mockResolvedValueOnce({ id: 1, email: 'admin@test.local' });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.user).not.toBeNull();
    });

    act(() => {
      registeredUnauthorizedHandler()();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('should unregister the unauthorized handler on unmount', () => {
    const { unmount } = renderHook(() => useAuth(), { wrapper });

    unmount();

    expect(mockSetUnauthorizedHandler).toHaveBeenLastCalledWith(null);
  });

  it('should logout and clear state', async () => {
    localStorage.setItem('token', 'stored-token');
    mockMe.mockResolvedValueOnce({ id: 1, email: 'admin@test.local' });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.user).not.toBeNull();
    });

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });
});

describe('useAuth outside provider', () => {
  it('should throw when used outside AuthProvider', () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within AuthProvider');
  });
});
