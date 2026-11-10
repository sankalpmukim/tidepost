import { handle } from "hono/vercel";
import { app } from "./app";
import { startScheduler } from "./sync";
import { startQueue } from "./mail";

startScheduler();
startQueue();

export default handle(app);
