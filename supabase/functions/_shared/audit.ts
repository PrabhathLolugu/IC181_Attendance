import { serviceClient } from "./client.ts";

export async function logAudit(params: {
  actorId?: string | null;
  actorLabel: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  try {
    const admin = serviceClient();
    await admin.from("audit_logs").insert({
      actor_id: params.actorId ?? null,
      actor_label: params.actorLabel,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      before: params.before ?? null,
      after: params.after ?? null,
    });
  } catch {
    // Audit logging is non-critical — never let it break the main request flow
  }
}
