const TOKEN_KEY = 'mafia_auth_token';

export function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL || '').trim();
  return raw.replace(/\/+$/, '');
}

export function resolveApiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = getApiBaseUrl();
  if (!base) return pathOrUrl;
  const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${normalizedPath}`;
}

export function resolveWsUrl(path: string): string {
  const base = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (base) {
    const parsed = new URL(base);
    const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${parsed.host}${normalizedPath}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${normalizedPath}`;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(resolveApiUrl(url), {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      'تعذر الاتصال بالخادم. تأكد من أن الخادم (Backend) يعمل وأن رابط API مهيأ بشكل صحيح.'
    );
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  const data = (isJson ? await response.json().catch(() => ({})) : {}) as T & {
    error?: string;
    suspended?: boolean;
    maintenance?: boolean;
  };

  if (!response.ok) {
    if (response.status === 503 && data.maintenance) {
      window.dispatchEvent(
        new CustomEvent('mvia:maintenance', {
          detail:
            data.error ||
            'المنصة في وضع الصيانة حالياً لإجراء تحديثات. سنعود قريباً.',
        })
      );
    }
    if (response.status === 403 && data.suspended && !url.includes('/auth/login')) {
      setStoredToken(null);
      window.dispatchEvent(
        new CustomEvent('mvia:suspended', {
          detail:
            data.error ||
            'تم حظر حسابك مؤقتاً لمخالفة الشروط والأحكام، ولا يمكن الدخول إلا بإذن الأدمن.',
        })
      );
    }
    if (!isJson && (response.status === 404 || response.status === 405)) {
      throw new Error(
        'خادم الـ API غير متاح على هذا الرابط (Backend غير منشور أو VITE_API_URL غير مضبوط).'
      );
    }
    throw new Error(data.error || 'حدث خطأ في الاتصال بالخادم.');
  }

  return data;
}
