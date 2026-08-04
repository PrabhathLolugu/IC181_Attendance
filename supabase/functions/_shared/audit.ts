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
  const admin = serviceClient();
  await admin.from("audit_log").insert({
    actor_id: params.actorId ?? null,
    actor_label: params.actorLabel,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    before: params.before ?? null,
    after: params.after ?? null,
  });
}
