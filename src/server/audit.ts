import { db } from "./db";
import { auditEvents } from "./schema";

export async function audit(input: {
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  requestId?: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(auditEvents).values({
    actorId: input.actorId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    requestId: input.requestId ?? crypto.randomUUID(),
    metadata: input.metadata ?? {},
  });
}
