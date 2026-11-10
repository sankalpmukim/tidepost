import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("purge expired sessions", { hours: 6 }, internal.maintenance.purgeExpiredSessions);
crons.interval("purge old send queue", { hours: 6 }, internal.maintenance.purgeOldQueue);
export default crons;
