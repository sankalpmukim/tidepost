// Vercel Node handler: same Hono app as `npm start`, plus the sync/send loops.
import { handle } from "hono/vercel";
import { app } from "../server/app";
import { startScheduler } from "../server/sync";
import { startQueue } from "../server/mail";

startScheduler();
startQueue();

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

export default handle(app);
