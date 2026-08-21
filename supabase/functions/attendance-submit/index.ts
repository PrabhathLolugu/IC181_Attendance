import { handleOptions, withCors } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { verifyQrToken } from "../_shared/qr.ts";
import { haversineMeters } from "../_shared/geo.ts";
import { logAudit } from "../_shared/audit.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const body = await req.json();
    const qrCheck = await verifyQrToken(String(body.qrToken ?? ""), Deno.env.get("QR_SIGNING_SECRET")!);
    if (!qrCheck.valid) return withCors({ error: qrCheck.error }, 400);

    const roll = String(body.rollNumber ?? "").trim().toUpperCase();
    if (!roll) return withCors({ error: "Roll number is required." }, 400);

    const db = serviceClient();

    const { data: session } = await db.from("sessions").select("*").eq("id", qrCheck.payload.sid).maybeSingle();
    if (!session) return withCors({ error: "Attendance session not found." }, 404);
    if (session.status !== "active") {
      return withCors({ error: "This attendance session has already ended." }, 410);
    }

    const { data: student } = await db.from("students").select("*").ilike("roll_number", roll).maybeSingle();
    if (!student || student.status === "deleted") {
      return withCors(
        { error: "No student found with that roll number. Check spelling and try again.", code: "not_found" },
        404,
      );
    }

    // ── Student duplicate check ───────────────────────────────────────────────
    const { data: existing } = await db
      .from("attendance_records")
      .select("marked_at, status")
      .eq("session_id", session.id)
      .eq("student_id", student.id)
      .maybeSingle();
    if (existing) {
      return withCors({ duplicate: true, markedAt: existing.marked_at, status: existing.status });
    }

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const hasPosition = Number.isFinite(lat) && Number.isFinite(lng);

    async function requestOverride(reason: "gps_denied" | "outside_radius" | "gps_unavailable", distance: number | null) {
      await db
        .from("gps_override_requests")
        .upsert(
          {
            session_id: session.id,
            student_id: student.id,
            roll_number: student.roll_number,
            distance_meters: distance,
            reason,
            status: "pending",
          },
          { onConflict: "session_id,student_id", ignoreDuplicates: true },
        );
      await logAudit({
        actorLabel: `student:${roll}`,
        action: "gps_override_requested",
        entityType: "session",
        entityId: session.id,
        after: { reason, distance },
      });
      return withCors({ overridePending: true, reason });
    }

    if (!hasPosition) {
      if (!session.allow_gps_override) {
        return withCors({ error: "Location is required for this session. Please enable GPS and try again." }, 400);
      }
      return await requestOverride(body.gpsDenied ? "gps_denied" : "gps_unavailable", null);
    }

    const distance = haversineMeters(lat, lng, session.anchor_lat, session.anchor_lng);
    const accuracy = Number.isFinite(Number(body.accuracy)) ? Number(body.accuracy) : 0;
    // Account for mobile GPS accuracy variance in university lecture halls / indoor buildings (up to 100m indoor buffer)
    const effectiveDistance = Math.max(0, distance - Math.min(accuracy, 100));
    const sessionRadius = session.radius_meters || 150;
    const withinRadius = effectiveDistance <= sessionRadius;

    if (!withinRadius) {
      if (!session.allow_gps_override) {
        return withCors({ error: `You appear to be ${Math.round(distance)}m away from class (allowed: ${sessionRadius}m). Ask your instructor for the Override Code.` }, 400);
      }
      return await requestOverride("outside_radius", distance);
    }

    const { data: record, error: insertErr } = await db
      .from("attendance_records")
      .insert({
        session_id: session.id,
        student_id: student.id,
        roll_number: student.roll_number,
        status: "present",
        method: "gps",
        distance_meters: distance,
        gps_lat: lat,
        gps_lng: lng,
        gps_accuracy: Number.isFinite(Number(body.accuracy)) ? Number(body.accuracy) : null,
      })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        return withCors({ duplicate: true });
      }
      return withCors({ error: "Could not record attendance. Please try again." }, 500);
    }

    await logAudit({
      actorLabel: `student:${roll}`,
      action: "attendance_submitted",
      entityType: "attendance_record",
      entityId: record.id,
      after: record,
    });

    return withCors({ record, student, session });
  } catch (err) {
    return withCors({ error: err instanceof Error ? err.message : "Something went wrong. Please try again." }, 400);
  }
});
