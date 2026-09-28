import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { apiPost, setAccessToken } from '@/lib/api/client';
import type { AuthSession, AuthUser } from '@/features/auth/types';

interface LoginPayload {
  email: string;
  password: string;
}

interface RegisterPayload extends LoginPayload {
  full_name: string;
}

interface AuthContextValue {
  acceptSession: (session: AuthSession) => void;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<AuthUser>;
  logout: () => Promise<void>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  user: AuthUser | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);
let bootstrapPromise: Promise<AuthSession | null> | null = null;

function bootstrapSession() {
  bootstrapPromise ??= apiPost<AuthSession>('/auth/refresh').catch(() => null);
  return bootstrapPromise;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const acceptSession = useCallback((session: AuthSession) => {
    setAccessToken(session.access_token);
    setUser(session.user);
  }, []);

  useEffect(() => {
    let active = true;
    void bootstrapSession().then((session) => {
      if (!active) return;
      if (session) acceptSession(session);
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [acceptSession]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const session = await apiPost<AuthSession>('/auth/login', payload);
      acceptSession(session);
      return session.user;
    },
    [acceptSession],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const session = await apiPost<AuthSession>('/auth/register', payload);
      acceptSession(session);
      return session.user;
    },
    [acceptSession],
  );

  const logout = useCallback(async () => {
    try {
      await apiPost('/auth/logout');
    } finally {
      setAccessToken(null);
      setUser(null);
      bootstrapPromise = null;
    }
  }, []);

  const value = useMemo(
    () => ({ acceptSession, isLoading, login, logout, register, user }),
    [acceptSession, isLoading, login, logout, register, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phải được sử dụng bên trong AuthProvider.');
  }
  return context;
}
