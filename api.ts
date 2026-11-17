const TOKEN_KEY = 'mafia_auth_token';

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

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = (await response.json().catch(() => ({}))) as T & {
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
    throw new Error(data.error || 'حدث خطأ في الاتصال بالخادم.');
  }

  return data;
}
