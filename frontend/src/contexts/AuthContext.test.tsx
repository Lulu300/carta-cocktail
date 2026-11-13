import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { ApiError, auth } from '../services/api';
import { server } from '../test/msw/server';
import { captureRequest, errorResponse, mockApiError, mockApiResponse, mockNetworkError } from '../test/msw/utils';
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
    expect(result.current.sessionError).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('should keep a session signed in meanwhile when the check of the previous token gets a 401', async () => {
    localStorage.setItem('token', 'expired-token');
    let answer: () => void = () => {};
    const answered = new Promise<void>((resolve) => { answer = resolve; });
    server.use(http.get('/api/auth/me', async () => {
      await answered;
      return errorResponse(401, 'Token expired');
    }));
    mockApiResponse('post', '/api/auth/login', { token: 'new-token', user: admin });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('admin@test.local', 'password');
    });
    // Only the 401 path of services/api.ts decides: it ignores a 401 for a replaced token
    await act(async () => answer());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toEqual(admin);
    expect(result.current.token).toBe('new-token');
    expect(localStorage.getItem('token')).toBe('new-token');
  });

  describe('when the stored token cannot be checked', () => {
    it.each([
      {
        failure: 'the rate limit (429)',
        fail: () => mockApiError('get', '/api/auth/me', 429, 'Too many requests: try again in a few minutes'),
        status: 429,
        message: 'Too many requests: try again in a few minutes',
      },
      {
        failure: 'a server error (500)',
        fail: () => mockApiError('get', '/api/auth/me', 500, 'Internal server error'),
        status: 500,
        message: 'Internal server error',
      },
      {
        failure: 'the HTML page of nginx while the backend restarts (502)',
        fail: () => server.use(http.get('/api/auth/me', () => new HttpResponse(
          '<html><body><h1>502 Bad Gateway</h1></body></html>',
          { status: 502, headers: { 'Content-Type': 'text/html' } },
        ))),
        status: 502,
        message: 'The server is not responding, try again in a moment.',
      },
    ])('should keep the token after $failure', async ({ fail, status, message }) => {
      localStorage.setItem('token', 'stored-token');
      fail();

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.user).toBeNull();
      expect(result.current.token).toBe('stored-token');
      expect(localStorage.getItem('token')).toBe('stored-token');
      expect(result.current.sessionError).toBeInstanceOf(ApiError);
      expect(result.current.sessionError).toMatchObject({ status, message });
    });

    it('should keep the token after a network error', async () => {
      localStorage.setItem('token', 'stored-token');
      mockNetworkError('get', '/api/auth/me');

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.user).toBeNull();
      expect(result.current.token).toBe('stored-token');
      expect(localStorage.getItem('token')).toBe('stored-token');
      expect(result.current.sessionError).toBeInstanceOf(TypeError);
    });

    it('should restore the session when a retry succeeds', async () => {
      localStorage.setItem('token', 'stored-token');
      mockApiError('get', '/api/auth/me', 429, 'Too many requests: try again in a few minutes');
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => {
        expect(result.current.sessionError).not.toBeNull();
      });

      mockSession();
      act(() => {
        result.current.retrySession();
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.sessionError).toBeNull();
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.user).toEqual(admin);
      expect(result.current.token).toBe('stored-token');
    });

    it('should end the session when a retry gets a 401', async () => {
      localStorage.setItem('token', 'stored-token');
      mockApiError('get', '/api/auth/me', 500, 'Internal server error');
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => {
        expect(result.current.sessionError).not.toBeNull();
      });

      mockApiError('get', '/api/auth/me', 401, 'Token expired');
      act(() => {
        result.current.retrySession();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(result.current.sessionError).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
    });

    it('should sign out without a request when the token was removed before the retry', async () => {
      localStorage.setItem('token', 'stored-token');
      mockNetworkError('get', '/api/auth/me');
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => {
        expect(result.current.sessionError).not.toBeNull();
      });
      const me = captureRequest('get', '/api/auth/me');

      // Another tab signed out
      localStorage.removeItem('token');
      act(() => {
        result.current.retrySession();
      });

      expect(me.count()).toBe(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.token).toBeNull();
      expect(result.current.sessionError).toBeNull();
    });
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
