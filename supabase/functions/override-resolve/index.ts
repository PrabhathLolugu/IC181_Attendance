import { handleOptions, withCors } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { requireStaff } from "../_shared/staffAuth.ts";
import { logAudit } from "../_shared/audit.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const auth = await requireStaff(req);
  if ("error" in auth) return withCors({ error: auth.error }, 401);

  try {
    const { requestId, action } = await req.json();
    if (!["approve", "reject"].includes(action)) return withCors({ error: "Invalid action." }, 400);

    const db = serviceClient();
    const { data: reqRow } = await db
      .from("gps_override_requests")
      .select("*")
      .eq("id", requestId)
      .eq("status", "pending")
      .maybeSingle();
    if (!reqRow) return withCors({ error: "This request is no longer pending." }, 404);

    await db
      .from("gps_override_requests")
      .update({
        status: action === "approve" ? "approved" : "rejected",
        resolved_at: new Date().toISOString(),
        resolved_by: auth.staff.id,
      })
      .eq("id", requestId);

    let record = null;
    if (action === "approve") {
      const { data, error } = await db
        .from("attendance_records")
        .insert({
          session_id: reqRow.session_id,
          student_id: reqRow.student_id,
          roll_number: reqRow.roll_number,
          status: "override",
          method: "instructor_approved",
          distance_meters: reqRow.distance_meters,
          recorded_by: auth.staff.id,
        })
        .select()
        .single();
      if (error && error.code !== "23505") return withCors({ error: "Could not record attendance." }, 500);
      record = data;
    }

    await logAudit({
      actorId: auth.staff.id,
      actorLabel: auth.staff.email,
      action: action === "approve" ? "gps_override_approved" : "gps_override_rejected",
      entityType: "gps_override_request",
      entityId: requestId,
      before: reqRow,
    });

    return withCors({ ok: true, record });
  } catch {
    return withCors({ error: "Invalid request." }, 400);
  }
});
