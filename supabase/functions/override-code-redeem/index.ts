import { handleOptions, withCors } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { verifyQrToken } from "../_shared/qr.ts";
import { logAudit } from "../_shared/audit.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const body = await req.json();
    const qrCheck = await verifyQrToken(String(body.qrToken ?? ""), Deno.env.get("QR_SIGNING_SECRET")!);
    if (!qrCheck.valid) return withCors({ error: qrCheck.error }, 400);

    const roll = String(body.rollNumber ?? "").trim().toUpperCase();
    const code = String(body.code ?? "").trim();
    if (!roll || !code) return withCors({ error: "Roll number and code are required." }, 400);

    // device_fingerprint is optional — sent by the student web app.
    const deviceFingerprint = body.deviceFingerprint
      ? String(body.deviceFingerprint).trim().slice(0, 64) || null
      : null;

    const db = serviceClient();
    const { data: session } = await db.from("sessions").select("*").eq("id", qrCheck.payload.sid).eq("status", "active").maybeSingle();
    if (!session) return withCors({ error: "Attendance session not found or has ended." }, 404);

    if (!session.override_code || session.override_code !== code) {
      return withCors({ error: "Incorrect code. Please check with your instructor." }, 400);
    }
    if (!session.override_code_expires_at || new Date(session.override_code_expires_at).getTime() < Date.now()) {
      return withCors({ error: "This code has expired. Ask your instructor to generate a new one." }, 400);
    }

    const { data: student } = await db.from("students").select("*").eq("roll_number", roll).maybeSingle();
    if (!student) return withCors({ error: "No student found with that roll number." }, 404);

    // ── Device fingerprint check ─────────────────────────────────────────────
    // Block the redemption if a DIFFERENT student already marked from this device.
    if (deviceFingerprint) {
      const { data: deviceRecord } = await db
        .from("attendance_records")
        .select("roll_number, student_id")
        .eq("session_id", session.id)
        .eq("device_fingerprint", deviceFingerprint)
        .maybeSingle();

      if (deviceRecord && deviceRecord.student_id !== student.id) {
        return withCors(
          { deviceBlocked: true, blockedRoll: deviceRecord.roll_number },
          409,
        );
      }
    }

    const { data: record, error } = await db
      .from("attendance_records")
      .insert({
        session_id: session.id,
        student_id: student.id,
        roll_number: student.roll_number,
        status: "override",
        method: "override_code",
        device_fingerprint: deviceFingerprint,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        // Check whether it's a device or student duplicate
        if (error.message?.includes("device")) {
          return withCors({ deviceBlocked: true }, 409);
        }
        return withCors({ duplicate: true });
      }
      return withCors({ error: "Could not record attendance." }, 500);
    }

    await logAudit({
      actorLabel: `student:${roll}`,
      action: "override_code_redeemed",
      entityType: "attendance_record",
      entityId: record.id,
      after: record,
    });

    return withCors({ record, student });
  } catch {
    return withCors({ error: "Invalid request." }, 400);
  }
});
