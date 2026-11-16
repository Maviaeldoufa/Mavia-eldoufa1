import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AcademicYear, User } from '../types';
import { apiRequest, getStoredToken, setStoredToken } from '../utils/api';

interface RegisterPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
  year: AcademicYear;
  adminCode?: string;
  acceptedTerms: boolean;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  justRegistered: boolean;
  suspensionNotice: string | null;
  clearSuspensionNotice: () => void;
  clearJustRegistered: () => void;
  login: (identifier: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUserDirect: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [justRegistered, setJustRegistered] = useState<boolean>(false);
  const [suspensionNotice, setSuspensionNotice] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiRequest<{ user: User }>('/api/auth/me');
      setUser(data.user);
    } catch (err) {
      setStoredToken(null);
      setUser(null);
      if (err instanceof Error && err.message.includes('حظر')) {
        setSuspensionNotice(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const onSuspended = (event: Event) => {
      const custom = event as CustomEvent<string>;
      setStoredToken(null);
      setJustRegistered(false);
      setUser(null);
      setSuspensionNotice(
        custom.detail ||
          'تم حظر حسابك مؤقتاً لمخالفة الشروط والأحكام، ولا يمكن الدخول إلا بإذن من الأدمن.'
      );
    };
    window.addEventListener('mvia:suspended', onSuspended);
    return () => window.removeEventListener('mvia:suspended', onSuspended);
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const data = await apiRequest<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    setStoredToken(data.token);
    setSuspensionNotice(null);
    setJustRegistered(false);
    setUser(data.user);
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const data = await apiRequest<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoredToken(data.token);
    setJustRegistered(true);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore if session already expired
    } finally {
      setStoredToken(null);
      setJustRegistered(false);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        justRegistered,
        suspensionNotice,
        clearSuspensionNotice: () => setSuspensionNotice(null),
        clearJustRegistered: () => setJustRegistered(false),
        login,
        register,
        logout,
        refreshUser,
        setUserDirect: setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
