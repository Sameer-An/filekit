// src/lib/rate-limit.ts
import { NextRequest, NextResponse } from "next/server";

interface RateLimitRecord {
  tokens: number;
  lastRefill: number;
}

interface RateLimitOptions {
  /** Maximum burst capacity (tokens). Default: 20 */
  capacity?: number;
  /** Window duration in milliseconds. Default: 60,000ms (1 minute) */
  windowMs?: number;
}

/**
 * In-memory token bucket rate limiter keyed by client IP.
 * NOTE FOR PRODUCTION: In multi-server or serverless cluster environments,
 * replace this in-memory Map with a distributed shared store (e.g. Redis or Upstash).
 */
const ipStore = new Map<string, RateLimitRecord>();

// Cleanup stale records periodically (every 5 minutes)
if (typeof setInterval !== "undefined") {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipStore.entries()) {
      if (now - record.lastRefill > 5 * 60 * 1000) {
        ipStore.delete(ip);
      }
    }
  }, 5 * 60 * 1000);
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

/**
 * Extracts client IP from standard proxy headers or socket remote address.
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "127.0.0.1";
}

/**
 * Checks rate limit for the request.
 * Returns null if allowed, or a 429 NextResponse if rate limit exceeded.
 */
export function checkRateLimit(
  req: NextRequest,
  options: RateLimitOptions = {},
): NextResponse | null {
  const capacity = options.capacity ?? 20;
  const windowMs = options.windowMs ?? 60_000;
  const refillRatePerMs = capacity / windowMs;

  const ip = getClientIp(req);
  const now = Date.now();

  let record = ipStore.get(ip);
  if (!record) {
    record = { tokens: capacity, lastRefill: now };
    ipStore.set(ip, record);
  } else {
    const elapsed = now - record.lastRefill;
    record.tokens = Math.min(capacity, record.tokens + elapsed * refillRatePerMs);
    record.lastRefill = now;
  }

  if (record.tokens < 1) {
    const waitMs = Math.ceil((1 - record.tokens) / refillRatePerMs);
    return NextResponse.json(
      { error: "Too many requests. Please slow down and try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil(waitMs / 1000))),
          "X-RateLimit-Limit": String(capacity),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  record.tokens -= 1;
  return null;
}
