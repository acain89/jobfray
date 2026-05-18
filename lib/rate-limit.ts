import "server-only";

type Entry = {
  count: number;
  expiresAt: number;
};

const globalForRateLimit =
  globalThis as unknown as {
    jobFrayRateLimit?: Map<string, Entry>;
  };

const store =
  globalForRateLimit.jobFrayRateLimit ??
  new Map<string, Entry>();

if (!globalForRateLimit.jobFrayRateLimit) {
  globalForRateLimit.jobFrayRateLimit =
    store;
}

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

export function enforceRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitOptions): {
  allowed: boolean;
  remaining: number;
} {
  const now = Date.now();

  const existing = store.get(key);

  if (!existing || existing.expiresAt < now) {
    store.set(key, {
      count: 1,
      expiresAt: now + windowMs,
    });

    return {
      allowed: true,
      remaining: limit - 1,
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
    };
  }

  existing.count += 1;

  store.set(key, existing);

  return {
    allowed: true,
    remaining:
      limit - existing.count,
  };
}

export function getRequestIp(
  request: Request,
): string {
  const forwardedFor =
    request.headers.get(
      "x-forwarded-for",
    );

  if (forwardedFor) {
    return forwardedFor
      .split(",")[0]
      ?.trim() ?? "unknown";
  }

  return "unknown";
}