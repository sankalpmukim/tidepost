import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, isQuotaOrRateLimit } from "../server/providers/http";
import { RateLimitedError, type TokenSource } from "../server/providers/types";

const tokens: TokenSource = {
  getAccessToken: async () => "token",
  refresh: async () => "refreshed",
};

const QUOTA_403 = {
  error: {
    code: 403,
    message: "Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user' of service 'gmail.googleapis.com' for consumer 'project_number:886630937684'.",
    errors: [{ message: "Quota exceeded for quota metric 'Total Query Cost'", domain: "usageLimits", reason: "rateLimitExceeded" }],
  },
};

const FORBIDDEN_403 = {
  error: {
    code: 403,
    message: "Gmail API has not been used in project 1 before or it is disabled.",
    errors: [{ message: "Gmail API has not been used in project 1 before or it is disabled.", domain: "usageLimits", reason: "accessNotConfigured" }],
  },
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isQuotaOrRateLimit", () => {
  it("treats Gmail per-minute quota 403s as rate limits", () => {
    expect(isQuotaOrRateLimit(403, JSON.stringify(QUOTA_403))).toBe(true);
  });

  it("does not treat accessNotConfigured as a rate limit", () => {
    expect(isQuotaOrRateLimit(403, JSON.stringify(FORBIDDEN_403))).toBe(false);
  });
});

describe("ApiError", () => {
  it("shows a short Gmail slow-down message instead of the raw JSON", () => {
    const err = new ApiError(403, JSON.stringify(QUOTA_403), "https://gmail.googleapis.com/gmail/v1/users/me/messages");
    expect(err.message).toBe("Gmail asked us to slow down. Wait a minute, then retry.");
    expect(err.message).not.toContain("project_number");
    expect(err.message).not.toContain("{");
  });

  it("uses Google's message for other 403s", () => {
    const err = new ApiError(403, JSON.stringify(FORBIDDEN_403), "https://gmail.googleapis.com/gmail/v1/users/me/messages");
    expect(err.message).toBe("Gmail API has not been used in project 1 before or it is disabled.");
  });
});

describe("apiFetch", () => {
  it("turns exhausted Gmail quota 403s into RateLimitedError", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(QUOTA_403), { status: 403 }));
    await expect(apiFetch(tokens, "https://gmail.googleapis.com/gmail/v1/users/me/messages", { maxRetries: 0 })).rejects.toBeInstanceOf(RateLimitedError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry permission 403s", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(FORBIDDEN_403), { status: 403 }));
    await expect(apiFetch(tokens, "https://gmail.googleapis.com/gmail/v1/users/me/messages", { maxRetries: 2 })).rejects.toMatchObject({
      name: "ApiError",
      message: "Gmail API has not been used in project 1 before or it is disabled.",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
