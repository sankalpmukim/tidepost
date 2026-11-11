import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import App from "./App";
import { api } from "./api";
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
  if (cfg.error) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <strong>Tidepost can't reach its API.</strong>
          <span style={{ color: "var(--text-tertiary)" }}>Start the server with <code>npm run dev</code> and reload.</span>
        </div>
      </div>
    );
  }
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>,
);
