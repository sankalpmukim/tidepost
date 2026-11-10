import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useUi } from "./store";

const clients = new Map<string, ConvexReactClient>();

function clientFor(url: string): ConvexReactClient {
  const existing = clients.get(url);
  if (existing) return existing;
  const c = new ConvexReactClient(url);
  clients.set(url, c);
  return c;
}

function useTidepostAuth() {
  const tick = useUi((s) => s.authTick);
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      void forceRefreshToken;
      const res = await fetch("/api/auth/convex-token", { credentials: "same-origin" });
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: string };
      return data.token ?? null;
    },
    [tick],
  );
  const isLoading = false;
  const isAuthenticated = tick >= 0;
  return useMemo(
    () => ({ isLoading, isAuthenticated, fetchAccessToken }),
    [fetchAccessToken, isAuthenticated, isLoading],
  );
}

export function TidepostConvex({ url, children }: { url: string; children: ReactNode }) {
  const client = useRef(clientFor(url)).current;
  return (
    <ConvexProviderWithAuth client={client} useAuth={useTidepostAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
