import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { apiPost, setAccessToken, setSessionHandlers } from '@/lib/api/client';
import type { AuthSession, AuthUser } from '@/features/auth/types';

interface LoginPayload {
  email: string;
  password: string;
  remember_me: boolean;
}

interface AuthContextValue {
  acceptSession: (session: AuthSession) => void;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Phiên vừa hết hạn (không gia hạn được): trang đăng nhập hiện thông báo phù hợp. */
  sessionExpired: boolean;
  /** Cập nhật hồ sơ tài khoản trong bộ nhớ. */
  updateUser: (user: AuthUser) => void;
  user: AuthUser | null;
}

// Đăng xuất ở một tab thì các tab khác cũng thoát theo.
const LOGOUT_SIGNAL_KEY = 'bep-viet.auth.logout';

const AuthContext = createContext<AuthContextValue | null>(null);
let bootstrapPromise: Promise<AuthSession | null> | null = null;

function bootstrapSession() {
  return revalidateSession();
}

function revalidateSession() {
  if (!bootstrapPromise) {
    const pending = apiPost<AuthSession>('/auth/refresh').catch(() => null);
    bootstrapPromise = pending;
    void pending.finally(() => {
      if (bootstrapPromise === pending) bootstrapPromise = null;
    });
  }
  return bootstrapPromise;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const acceptSession = useCallback((session: AuthSession) => {
    bootstrapPromise = null;
    setAccessToken(session.access_token);
    setUser(session.user);
    setSessionExpired(false);
  }, []);

  useEffect(() => {
    setSessionHandlers({
      refresh: async () => {
        const session = await revalidateSession();
        if (session) acceptSession(session);
        return Boolean(session);
      },
      expired: () => {
        setAccessToken(null);
        setUser(null);
        setSessionExpired(true);
      },
    });
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LOGOUT_SIGNAL_KEY || !event.newValue) return;
      setAccessToken(null);
      setUser(null);
      bootstrapPromise = null;
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      setSessionHandlers(null);
      window.removeEventListener('storage', handleStorage);
    };
  }, [acceptSession]);

  useEffect(() => {
    let active = true;
    void bootstrapSession().then((session) => {
      if (!active) return;
      if (session) acceptSession(session);
      setIsLoading(false);
    });

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setAccessToken(null);
      setUser(null);
      setIsLoading(true);
      void revalidateSession().then((session) => {
        if (!active) return;
        if (session) acceptSession(session);
        setIsLoading(false);
      });
    };
    window.addEventListener('pageshow', handlePageShow);
    const handleHistoryNavigation = () => {
      setAccessToken(null);
      setUser(null);
      setIsLoading(true);
      void revalidateSession().then((session) => {
        if (!active) return;
        if (session) acceptSession(session);
        setIsLoading(false);
      });
    };
    window.addEventListener('popstate', handleHistoryNavigation);
    return () => {
      active = false;
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('popstate', handleHistoryNavigation);
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

  const logout = useCallback(async () => {
    try {
      await apiPost('/auth/logout');
    } finally {
      setAccessToken(null);
      setUser(null);
      setSessionExpired(false);
      bootstrapPromise = null;
      try {
        localStorage.setItem(LOGOUT_SIGNAL_KEY, String(Date.now()));
      } catch {
        // Trình duyệt chặn bộ nhớ cục bộ: tab hiện tại vẫn đăng xuất bình thường.
      }
    }
  }, []);

  const updateUser = useCallback((nextUser: AuthUser) => setUser(nextUser), []);

  const value = useMemo(
    () => ({ acceptSession, isLoading, login, logout, sessionExpired, updateUser, user }),
    [acceptSession, isLoading, login, logout, sessionExpired, updateUser, user],
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
