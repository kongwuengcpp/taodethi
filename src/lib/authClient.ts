import type { UserAccount } from '../types/exam';

// Stored strictly in memory (never in localStorage) to prevent token/role tampering
let inMemorySessionToken: string | null = null;
let inMemoryCurrentUser: UserAccount | null = null;

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || ''
).replace(/\/+$/, '');

export function resolveApiUrl(url: string): string {
  // If absolute URL provided:
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // If it points to localhost but the current browser is running on external domain or iframe, convert to relative same-origin
    if (
      typeof window !== 'undefined' &&
      window.location &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1' &&
      (url.includes('localhost:') || url.includes('127.0.0.1:'))
    ) {
      try {
        const parsed = new URL(url);
        return parsed.pathname + parsed.search + parsed.hash;
      } catch {
        // Fallback
      }
    }
    return url;
  }

  let clean = url.startsWith('/') ? url : `/${url}`;
  if (clean.startsWith('/api/api/')) {
    clean = clean.replace('/api/api/', '/api/');
  }

  // If running in browser and API_BASE_URL is localhost, discard it to use same-origin relative URLs!
  let base = API_BASE_URL;
  if (
    typeof window !== 'undefined' &&
    window.location &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1' &&
    (base.includes('localhost') || base.includes('127.0.0.1'))
  ) {
    base = '';
  }

  if (!base) {
    return clean;
  }

  if (base.endsWith('/api') && clean.startsWith('/api/')) {
    return `${base.replace(/\/api$/, '')}${clean}`;
  }

  return `${base}${clean}`;
}

/**
 * Determines which standalone frontend application should run:
 * - 'student': Deployed at Student domain (e.g., https://www.taodethi.xyz or VITE_APP_TARGET=student)
 * - 'admin': Deployed at Admin domain (e.g., https://admin.taodethi.xyz or VITE_APP_TARGET=admin)
 */
export function detectStandaloneAppTarget(pathname: string): 'student' | 'admin' {
  const cleanPath = (pathname || '').trim().toLowerCase().replace(/\/+$/, '');

  // 1. Explicit admin/teacher paths always take top priority!
  if (
    cleanPath === '/admin' ||
    cleanPath.startsWith('/admin/') ||
    cleanPath === '/teacher' ||
    cleanPath.startsWith('/teacher/')
  ) {
    return 'admin';
  }

  // 2. Check window location (hash, search params, hostname, referrer)
  if (typeof window !== 'undefined') {
    const hash = (window.location.hash || '').toLowerCase();
    if (hash.includes('/admin') || hash.includes('/teacher')) {
      return 'admin';
    }
    const search = (window.location.search || '').toLowerCase();
    if (
      search.includes('admin') ||
      search.includes('teacher') ||
      search.includes('portal=admin')
    ) {
      return 'admin';
    }
    const host = (window.location.hostname || '').toLowerCase();
    if (host.startsWith('admin.') || host.includes('-admin.')) {
      return 'admin';
    }
    if (typeof document !== 'undefined' && document.referrer) {
      const ref = document.referrer.toLowerCase();
      if (
        ref.includes('/admin') ||
        ref.includes('/teacher') ||
        ref.includes('portal=admin')
      ) {
        return 'admin';
      }
    }
  }

  // 3. Fallback to student domain
  return 'student';
}

export function setAuthSession(token: string | null, user: UserAccount | null) {
  inMemorySessionToken = token;
  inMemoryCurrentUser = user;
}

export function getAuthToken(): string | null {
  return inMemorySessionToken;
}

export function getCurrentUser(): UserAccount | null {
  return inMemoryCurrentUser;
}

export function getAuthHeaders(
  extraHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    ...extraHeaders,
  };
  if (inMemorySessionToken) {
    headers['Authorization'] = `Bearer ${inMemorySessionToken}`;
  }
  return headers;
}

export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = getAuthHeaders(
    (options.headers as Record<string, string>) || {}
  );
  try {
    return await fetch(resolveApiUrl(url), {
      ...options,
      credentials: 'include', // Sends HttpOnly cookie across same-origin or CORS with credentials
      headers,
    });
  } catch (error) {
    // Return a safe 503 response instead of throwing unhandled TypeError: Failed to fetch
    return new Response(
      JSON.stringify({
        error:
          'Không thể kết nối máy chủ backend. Vui lòng kiểm tra lại kết nối mạng hoặc thử lại sau vài giây.',
        networkError: true,
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
