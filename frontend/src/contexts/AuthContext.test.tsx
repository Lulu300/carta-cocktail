import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { auth } from '../services/api';
import { captureRequest, mockApiError, mockApiResponse } from '../test/msw/utils';
import { AuthProvider, useAuth } from './AuthContext';

const admin = { id: 1, email: 'admin@test.local' };

function mockSession(user = admin) {
  mockApiResponse('get', '/api/auth/me', user);
}

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  localStorage.clear();
});

describe('AuthContext', () => {
  it('should have null user and token initially when no stored token', () => {
    const me = captureRequest('get', '/api/auth/me');
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(me.count()).toBe(0);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('should validate stored token on mount', async () => {
    localStorage.setItem('token', 'stored-token');
    mockSession();
    const me = captureRequest('get', '/api/auth/me');

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toEqual(admin);
    expect(me.count()).toBe(1);
  });

  it('should clear token if validation fails', async () => {
    localStorage.setItem('token', 'invalid-token');
    mockApiError('get', '/api/auth/me', 401, 'Invalid token');

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('should login and set user/token without calling /auth/me', async () => {
    mockApiResponse('post', '/api/auth/login', { token: 'new-token', user: admin });
    const loginRequest = captureRequest('post', '/api/auth/login');
    const me = captureRequest('get', '/api/auth/me');

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('admin@test.local', 'password');
    });

    expect(await loginRequest.body).toEqual({ email: 'admin@test.local', password: 'password' });
    expect(result.current.user).toEqual(admin);
    expect(result.current.token).toBe('new-token');
    expect(localStorage.getItem('token')).toBe('new-token');
    expect(me.count()).toBe(0);
  });

  it('should reject a login with wrong credentials and stay signed out', async () => {
    mockApiError('post', '/api/auth/login', 401, 'Invalid credentials');
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await expect(result.current.login('admin@test.local', 'wrong')).rejects.toThrow('Invalid credentials');
    });

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('should store the new token and email after a password change', async () => {
    localStorage.setItem('token', 'old-token');
    mockSession();
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => {
      expect(result.current.user).not.toBeNull();
    });

    act(() => {
      result.current.updateSession({ id: 1, email: 'new@test.local' }, 'new-token');
    });

    expect(result.current.user).toEqual({ id: 1, email: 'new@test.local' });
    expect(result.current.token).toBe('new-token');
    expect(localStorage.getItem('token')).toBe('new-token');
  });

  it('should keep the token when the profile update returns none', async () => {
    localStorage.setItem('token', 'current-token');
    mockSession();
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => {
      expect(result.current.user).not.toBeNull();
    });

    act(() => {
      result.current.updateSession({ id: 1, email: 'new@test.local' });
    });

    expect(result.current.user).toEqual({ id: 1, email: 'new@test.local' });
    expect(result.current.token).toBe('current-token');
    expect(localStorage.getItem('token')).toBe('current-token');
  });

  it('should clear user and token when a later API request is rejected with a 401', async () => {
    localStorage.setItem('token', 'stored-token');
    mockSession();

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.user).not.toBeNull();
    });

    // The token expires: the next request of any page comes back with a 401
    mockApiError('get', '/api/auth/me', 401, 'Token expired');
    await act(async () => {
      await auth.me().catch(() => {});
    });

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('should logout and clear state', async () => {
    localStorage.setItem('token', 'stored-token');
    mockSession();

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
