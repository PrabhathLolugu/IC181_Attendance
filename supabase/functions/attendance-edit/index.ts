import { handleOptions, withCors } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { requireStaff } from "../_shared/staffAuth.ts";
import { logAudit } from "../_shared/audit.ts";

const VALID_STATUSES = ["present", "late", "manual", "override", "excused"];

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const auth = await requireStaff(req);
  if ("error" in auth) return withCors({ error: auth.error }, 401);

  try {
    const body = await req.json();
    const recordId = String(body.recordId ?? "");
    const status = String(body.status ?? "");
    const notes = body.notes ? String(body.notes).trim() : null;
    if (!recordId || !VALID_STATUSES.includes(status)) {
      return withCors({ error: "A valid record and status are required." }, 400);
    }

    const db = serviceClient();
    const { data: before } = await db.from("attendance_records").select("*").eq("id", recordId).maybeSingle();
    if (!before) return withCors({ error: "Attendance record not found." }, 404);

    const { data: after, error } = await db
      .from("attendance_records")
      .update({ status, notes, recorded_by: auth.staff.id })
      .eq("id", recordId)
      .select()
      .single();

    if (error) return withCors({ error: "Could not update attendance." }, 500);

    await logAudit({
      actorId: auth.staff.id,
      actorLabel: auth.staff.email,
      action: "attendance_edited",
      entityType: "attendance_record",
      entityId: recordId,
      before,
      after,
    });

    return withCors({ record: after });
  } catch {
    return withCors({ error: "Invalid request." }, 400);
  }
});
