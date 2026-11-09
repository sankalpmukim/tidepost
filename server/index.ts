// Server entry: loads .env, serves the API (and the built client in production).
import fs from "node:fs";
import path from "node:path";

if (fs.existsSync(".env")) process.loadEnvFile(".env");

const { serve } = await import("@hono/node-server");
const { serveStatic } = await import("@hono/node-server/serve-static");
const { app } = await import("./app");
const { config } = await import("./config");
const { startScheduler } = await import("./sync");
const { startQueue } = await import("./mail");

if (config.production) {
  const dist = path.resolve("dist");
  app.use("/assets/*", serveStatic({ root: "./dist" }));
  app.use("/fonts/*", serveStatic({ root: "./dist" }));
  app.get("*", async (c, next) => {
    if (c.req.path.startsWith("/api/")) return next();
    const file = path.join(dist, c.req.path);
    if (c.req.path !== "/" && file.startsWith(dist) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      return serveStatic({ root: "./dist" })(c, next);
    }
    return c.html(fs.readFileSync(path.join(dist, "index.html"), "utf8"));
  });
}

startScheduler();
startQueue();

serve({ fetch: app.fetch, port: config.port, hostname: process.env.HOST ?? "127.0.0.1" }, (info) => {
  console.log(`Tidepost API on http://${info.address}:${info.port}${config.production ? "" : `  (open ${config.appUrl})`}`);
  const missing = [
    !config.google.clientId && "Gmail (GOOGLE_CLIENT_ID/SECRET)",
    !config.microsoft.clientId && "Outlook (MICROSOFT_CLIENT_ID/SECRET)",
    !config.ai.apiKey && "assistant AI (ANTHROPIC_API_KEY)",
  ].filter(Boolean);
  if (missing.length) console.log(`Not configured: ${missing.join(", ")}. See README.md.`);
});
