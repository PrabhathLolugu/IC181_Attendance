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
    const body = await req.json();
    const sessionId = String(body.sessionId ?? "");
    if (!sessionId) return withCors({ error: "A session id is required." }, 400);

    const courseName = String(body.courseName ?? "").trim();
    const sessionType = String(body.sessionType ?? "").trim();
    const sessionDate = String(body.sessionDate ?? "").trim();
    const groupFilter = body.groupFilter ? String(body.groupFilter).trim().toUpperCase() : null;
    const notes = body.notes ? String(body.notes).trim() : null;
    const radiusMeters = Number(body.radiusMeters);
    const allowGpsOverride = body.allowGpsOverride !== false;

    if (!courseName) return withCors({ error: "Course is required." }, 400);
    if (!sessionType) return withCors({ error: "Session type is required." }, 400);
    if (!sessionDate || Number.isNaN(Date.parse(sessionDate))) {
      return withCors({ error: "A valid date is required." }, 400);
    }
    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
      return withCors({ error: "A valid GPS radius is required." }, 400);
    }

    const db = serviceClient();
    const { data: before } = await db.from("sessions").select("*").eq("id", sessionId).maybeSingle();
    if (!before) return withCors({ error: "Session not found." }, 404);

    const { data: after, error } = await db
      .from("sessions")
      .update({
        course_name: courseName,
        session_type: sessionType,
        session_date: sessionDate,
        group_filter: groupFilter,
        notes,
        radius_meters: radiusMeters,
        allow_gps_override: allowGpsOverride,
      })
      .eq("id", sessionId)
      .select()
      .single();

    if (error) return withCors({ error: "Could not update the session." }, 500);

    await logAudit({
      actorId: auth.staff.id,
      actorLabel: auth.staff.email,
      action: "session_edited",
      entityType: "session",
      entityId: sessionId,
      before,
      after,
    });

    return withCors({ session: after });
  } catch {
    return withCors({ error: "Invalid request." }, 400);
  }
});
