import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/reservations/mysql-pool";
import { ensureSchema } from "@/lib/reservations/mysql-schema";
import { hashValue, log, sanitizeMetadata, type ActorType, type LogLevel, type Surface } from "./logger";
import type { RequestContext } from "./request-context";

export interface AppEventInput {
  level?: LogLevel;
  event: string;
  surface: Surface;
  tenantId?: string;
  actorType?: ActorType;
  actorIdHash?: string;
  requestId?: string;
  reservationId?: string;
  reference?: string;
  status?: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface AppEvent extends Required<Pick<AppEventInput, "event" | "surface">> {
  id: string;
  createdAt: string;
  level: LogLevel;
  tenantId?: string;
  actorType: ActorType;
  actorIdHash?: string;
  requestId?: string;
  reservationId?: string;
  reference?: string;
  status?: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

interface EventRow extends RowDataPacket {
  id: string;
  created_at: string;
  level: LogLevel;
  event: string;
  surface: Surface;
  tenant_id: string | null;
  actor_type: ActorType;
  actor_id_hash: string | null;
  request_id: string | null;
  reservation_id: string | null;
  reference: string | null;
  status: number | null;
  reason: string | null;
  metadata: string | Record<string, unknown> | null;
}

export interface AppEventFilter {
  tenantId?: string;
  level?: LogLevel;
  surface?: Surface;
  actorType?: ActorType;
  event?: string;
  requestId?: string;
  reservationId?: string;
  reference?: string;
  status?: number;
  reason?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
}

function metadataJson(metadata: Record<string, unknown> | undefined): string | null {
  const safe = sanitizeMetadata(metadata);
  return safe ? JSON.stringify(safe).slice(0, 16_000) : null;
}

function toEvent(row: EventRow): AppEvent {
  const raw = row.metadata;
  const metadata = typeof raw === "string" && raw
    ? JSON.parse(raw) as Record<string, unknown>
    : raw && typeof raw === "object"
      ? raw as Record<string, unknown>
      : undefined;
  return {
    id: row.id,
    createdAt: row.created_at,
    level: row.level,
    event: row.event,
    surface: row.surface,
    tenantId: row.tenant_id ?? undefined,
    actorType: row.actor_type,
    actorIdHash: row.actor_id_hash ?? undefined,
    requestId: row.request_id ?? undefined,
    reservationId: row.reservation_id ?? undefined,
    reference: row.reference ?? undefined,
    status: row.status ?? undefined,
    reason: row.reason ?? undefined,
    metadata,
  };
}

export async function recordAppEvent(input: AppEventInput): Promise<void> {
  try {
    await ensureSchema();
    await getPool().query(
      `INSERT INTO app_events
        (id, created_at, level, event, surface, tenant_id, actor_type, actor_id_hash,
         request_id, reservation_id, reference, status, reason, metadata)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        randomUUID(),
        new Date().toISOString(),
        input.level ?? "info",
        input.event,
        input.surface,
        input.tenantId ?? null,
        input.actorType ?? "unknown",
        input.actorIdHash ?? null,
        input.requestId ?? null,
        input.reservationId ?? null,
        input.reference ?? null,
        input.status ?? null,
        input.reason?.slice(0, 120) ?? null,
        metadataJson(input.metadata),
      ],
    );
  } catch (err) {
    log.error({ event: "observability.app_event.write_failed", surface: "system" }, err);
  }
}

export function eventFromRequest(
  ctx: RequestContext,
  input: Omit<AppEventInput, "surface" | "tenantId" | "actorType" | "actorIdHash" | "requestId">,
): AppEventInput {
  return {
    ...input,
    surface: ctx.surface,
    tenantId: ctx.tenantId,
    actorType: ctx.actorType,
    actorIdHash: hashValue(ctx.actorId),
    requestId: ctx.requestId,
  };
}

function clean(value: string | undefined, max = 120): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

export async function listAppEvents(filter: AppEventFilter = {}): Promise<AppEvent[]> {
  await ensureSchema();
  const where: string[] = [];
  const params: unknown[] = [];
  const tenantId = clean(filter.tenantId, 64);
  const level = clean(filter.level, 8);
  const surface = clean(filter.surface, 16);
  const actorType = clean(filter.actorType, 16);
  const event = clean(filter.event, 96);
  const requestId = clean(filter.requestId, 64);
  const reservationId = clean(filter.reservationId, 64);
  const reference = clean(filter.reference, 16)?.toUpperCase();
  const reason = clean(filter.reason, 120);
  const q = clean(filter.q, 120);
  const from = clean(filter.from, 32);
  const to = clean(filter.to, 32);

  if (tenantId) {
    where.push("tenant_id = ?");
    params.push(tenantId);
  }
  if (level) {
    where.push("level = ?");
    params.push(level);
  }
  if (surface) {
    where.push("surface = ?");
    params.push(surface);
  }
  if (actorType) {
    where.push("actor_type = ?");
    params.push(actorType);
  }
  if (event) {
    where.push("event = ?");
    params.push(event);
  }
  if (requestId) {
    where.push("request_id = ?");
    params.push(requestId);
  }
  if (reservationId) {
    where.push("reservation_id = ?");
    params.push(reservationId);
  }
  if (reference) {
    where.push("reference = ?");
    params.push(reference);
  }
  if (Number.isInteger(filter.status)) {
    where.push("status = ?");
    params.push(filter.status);
  }
  if (reason) {
    where.push("reason LIKE ?");
    params.push(`%${reason}%`);
  }
  if (from) {
    where.push("created_at >= ?");
    params.push(from);
  }
  if (to) {
    where.push("created_at <= ?");
    params.push(to);
  }
  if (q) {
    where.push("(event LIKE ? OR reason LIKE ? OR reference LIKE ? OR request_id LIKE ? OR reservation_id LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  const limit = Math.min(500, Math.max(1, Math.trunc(Number(filter.limit ?? 100)) || 100));
  const [rows] = await getPool().query<EventRow[]>(
    `SELECT id, created_at, level, event, surface, tenant_id, actor_type, actor_id_hash,
            request_id, reservation_id, reference, status, reason, metadata
       FROM app_events
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC
       LIMIT ${limit}`,
    params,
  );
  return rows.map(toEvent);
}
