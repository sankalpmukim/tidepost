// The per-user hub Durable Object: SSE fan-out for server events plus the
// snapshot registry of background runs. The logic lives in HubCore
// (server/hubcore.ts); the Worker proxies GET /api/events here.
import { DurableObject } from "cloudflare:workers";
import type { Run } from "../shared/types";
import type { ServerEvent } from "./bus";
import type { Env } from "./config";
import { initConfig } from "./config";
import { HubCore } from "./hubcore";

export class HubDO extends DurableObject {
  private core = new HubCore();

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    initConfig(env);
  }

  /** The Worker proxies GET /api/events here and streams the response back. */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/sse") return this.core.sse();
    return new Response("Not found", { status: 404 });
  }

  async emit(e: ServerEvent): Promise<void> {
    this.core.emit(e);
  }

  async getRun(id: string): Promise<Run | null> {
    return this.core.getRun(id);
  }

  async listRuns(): Promise<Run[]> {
    return this.core.listRuns();
  }
}
