import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import App from "./App";
import { api } from "./api";
import { TidepostConvex } from "./convexAuth";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: true, retry: (n, err) => n < 2 && !(err instanceof Error && "status" in err && (err as { status: number }).status < 500) },
  },
});

function Root() {
  const cfg = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  if (cfg.isLoading) {
    return <div style={{ height: "100vh", display: "grid", placeItems: "center" }}><span className="spinner" /></div>;
  }
  if (cfg.error || !cfg.data?.convexUrl) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <strong>Tidepost can't reach Convex.</strong>
          <span style={{ color: "var(--text-tertiary)" }}>Set CONVEX_URL and start the API with <code>npm run dev</code>.</span>
        </div>
      </div>
    );
  }
  return (
    <TidepostConvex url={cfg.data.convexUrl}>
      <App />
    </TidepostConvex>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>,
);
