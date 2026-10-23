import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { UserView } from "@wallet/contracts/onboarding";
import { endSession } from "../features/auth/auth-api";

export type ActiveSession = {
  token: string;
  expiresAt: string;
  user: UserView;
};

export const SESSION_EXPIRED_NOTICE =
  "Tu sesión venció. Ingresa de nuevo para ver tu billetera.";
export const LOGOUT_REMOTE_FAILED_NOTICE =
  "No se pudo cerrar la sesión en el servidor. Se cerró en este navegador.";

type SessionValue = {
  session: ActiveSession | null;
  notice: string | undefined;
  signIn: (session: ActiveSession) => void;
  expire: () => void;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | undefined>(undefined);

// The token stays in React state only: never localStorage, sessionStorage or the URL.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();

  const clearProtectedData = useCallback(async () => {
    // Cancel first so a response still in flight cannot refill the cache.
    await queryClient.cancelQueries();
    queryClient.clear();
  }, [queryClient]);

  const signIn = useCallback((next: ActiveSession) => {
    setNotice(undefined);
    setSession(next);
  }, []);

  const expire = useCallback(() => {
    setSession(null);
    setNotice(SESSION_EXPIRED_NOTICE);
    void clearProtectedData();
  }, [clearProtectedData]);

  const logout = useCallback(async () => {
    const current = session;
    setSession(null);
    setNotice(undefined);
    await clearProtectedData();
    if (!current) return;
    try {
      await endSession(current.token);
    } catch {
      setNotice(LOGOUT_REMOTE_FAILED_NOTICE);
    }
  }, [session, clearProtectedData]);

  const value = useMemo(
    () => ({ session, notice, signIn, expire, logout }),
    [session, notice, signIn, expire, logout],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return value;
}
