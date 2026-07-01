import { createHash, randomUUID } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type Surface = "public" | "admin" | "platform" | "system";
export type ActorType = "guest" | "staff" | "platform" | "impersonation" | "system" | "unknown";

export interface LogContext {
  event: string;
  message?: string;
  requestId?: string;
  tenantId?: string;
  tenantSlug?: string;
  surface?: Surface;
  actorType?: ActorType;
  actorId?: string;
  route?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  ipHash?: string;
  userAgentHash?: string;
  reservationId?: string;
  reference?: string;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

const SECRET = process.env.SESSION_SECRET || "reservation-system-log-salt";
const REDACTED = "[redacted]";
const SENSITIVE_KEY_RE = /pass|password|token|secret|cookie|session|authorization|smtp|email|phone|notes|comment/i;

export function hashValue(value: unknown): string | undefined {
  const s = String(value ?? "").trim();
  if (!s) return undefined;
  return createHash("sha256").update(SECRET).update(":").update(s).digest("hex").slice(0, 24);
}

export function newRequestId(): string {
  return randomUUID();
}

export function safeError(err: unknown): { name?: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack?.split("\n").slice(0, 8).join("\n"),
    };
  }
  return { message: typeof err === "string" ? err : "Unknown error" };
}

export function sanitizeMetadata(input: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!input) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      out[key] = REDACTED;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeMetadata(value as Record<string, unknown>) ?? {};
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 20).map((v) =>
        v && typeof v === "object" ? sanitizeMetadata(v as Record<string, unknown>) : v,
      );
    } else {
      out[key] = value;
    }
  }
  return out;
}

function write(level: LogLevel, ctx: LogContext, err?: unknown): void {
  if (process.env.NODE_ENV === "test" && process.env.OBS_LOG_IN_TESTS !== "1") return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    ...ctx,
    actorId: ctx.actorId ? hashValue(ctx.actorId) : undefined,
    metadata: sanitizeMetadata(ctx.metadata),
    err: err === undefined ? undefined : safeError(err),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (ctx: LogContext) => write("debug", ctx),
  info: (ctx: LogContext) => write("info", ctx),
  warn: (ctx: LogContext) => write("warn", ctx),
  error: (ctx: LogContext, err?: unknown) => write("error", ctx, err),
};
