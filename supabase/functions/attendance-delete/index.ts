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
    const { recordId } = await req.json();
    if (!recordId) return withCors({ error: "A record id is required." }, 400);

    const db = serviceClient();
    const { data: before } = await db.from("attendance_records").select("*").eq("id", recordId).maybeSingle();
    if (!before) return withCors({ error: "Attendance record not found." }, 404);

    const { error } = await db.from("attendance_records").delete().eq("id", recordId);
    if (error) return withCors({ error: "Could not delete attendance record." }, 500);

    await logAudit({
      actorId: auth.staff.id,
      actorLabel: auth.staff.email,
      action: "attendance_deleted",
      entityType: "attendance_record",
      entityId: recordId,
      before,
    });

    return withCors({ ok: true });
  } catch {
    return withCors({ error: "Invalid request." }, 400);
  }
});
