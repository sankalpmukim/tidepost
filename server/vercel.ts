import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { app } from "./app";
import { startScheduler } from "./sync";
import { startQueue } from "./mail";

let booted = false;
function boot(): void {
  if (booted) return;
  booted = true;
  startScheduler();
  startQueue();
}

const listener = getRequestListener(app.fetch);

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  boot();
  void listener(req, res);
}
