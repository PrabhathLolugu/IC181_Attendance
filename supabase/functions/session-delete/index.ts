import { handleOptions, withCors } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { requireStaff } from "../_shared/staffAuth.ts";
import { logAudit } from "../_shared/audit.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const auth = await requireStaff(req, { adminOnly: true });
  if ("error" in auth) return withCors({ error: auth.error }, 403);

  try {
    const { sessionId } = await req.json();
    if (!sessionId) return withCors({ error: "A session id is required." }, 400);

    const db = serviceClient();
    const { data: before } = await db.from("sessions").select("*").eq("id", sessionId).maybeSingle();
    if (!before) return withCors({ error: "Session not found." }, 404);

    const { count: recordCount } = await db
      .from("attendance_records")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId);

    const { error } = await db.from("sessions").delete().eq("id", sessionId);
    if (error) return withCors({ error: "Could not delete the session." }, 500);

    await logAudit({
      actorId: auth.staff.id,
      actorLabel: auth.staff.email,
      action: "session_deleted",
      entityType: "session",
      entityId: sessionId,
      before: { ...before, deleted_attendance_records: recordCount ?? 0 },
    });

    return withCors({ ok: true });
  } catch {
    return withCors({ error: "Invalid request." }, 400);
  }
});
