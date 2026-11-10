import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { app } from "./app";
import { initPersist } from "./persist";
import { startScheduler } from "./sync";
import { startQueue } from "./mail";

let booted = false;
let booting: Promise<void> | null = null;
function boot(): Promise<void> {
  if (booted) return Promise.resolve();
  if (booting) return booting;
  booting = (async () => {
    await initPersist();
    startScheduler();
    startQueue();
    booted = true;
  })();
  return booting;
}

const listener = getRequestListener(app.fetch);

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  void boot().then(() => listener(req, res));
}
