// API Client for Platform Operations

const API_BASE = '/api/v1/platform';

export class ApiError extends Error {
  public status: number;
  public data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('platform_token');
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Handle both relative paths ('/tenants') and redundant prefixes ('/platform/tenants')
  const cleanEndpoint = endpoint.startsWith('/platform/')
    ? endpoint.replace(/^\/platform/, '')
    : endpoint;

  const url = cleanEndpoint.startsWith('http') || cleanEndpoint.startsWith('/api')
    ? cleanEndpoint
    : `${API_BASE}${cleanEndpoint.startsWith('/') ? '' : '/'}${cleanEndpoint}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // If not on login page, clear token and trigger auth reset
    if (!window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('platform_token');
      localStorage.removeItem('platform_staff');
      window.location.href = '/login';
    }
  }

  const contentType = response.headers.get('content-type');
  let data: any = null;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg = data?.message || data?.title || response.statusText || 'API Request Failed';
    throw new ApiError(Array.isArray(errorMsg) ? errorMsg.join(', ') : errorMsg, response.status, data);
  }

  return data as T;
}
