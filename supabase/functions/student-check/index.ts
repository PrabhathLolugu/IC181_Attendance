import { handleOptions, withCors } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { verifyQrToken } from "../_shared/qr.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const body = await req.json();
    const roll = String(body.rollNumber ?? "").trim().toUpperCase();

    const db = serviceClient();

    // Check device fingerprint against session if qrToken provided
    if (body.qrToken && body.deviceFingerprint) {
      const qrCheck = await verifyQrToken(String(body.qrToken), Deno.env.get("QR_SIGNING_SECRET")!);
      if (qrCheck.valid) {
        const { data: deviceRecord } = await db
          .from("attendance_records")
          .select("roll_number, marked_at")
          .eq("session_id", qrCheck.payload.sid)
          .eq("device_fingerprint", String(body.deviceFingerprint).slice(0, 64))
          .maybeSingle();

        if (deviceRecord) {
          if (roll && deviceRecord.roll_number !== roll) {
            return withCors({ deviceBlocked: true, blockedRoll: deviceRecord.roll_number });
          }
          return withCors({ alreadyMarked: true, markedAt: deviceRecord.marked_at, rollNumber: deviceRecord.roll_number });
        }
      }
    }

    if (!roll) return withCors({ error: "Roll number is required." }, 400);

    const { data, error } = await db
      .from("students")
      .select("id, roll_number, name, email, phone, department, program, semester, group_label, batch, photo_url, status")
      .eq("roll_number", roll)
      .maybeSingle();

    if (error) return withCors({ error: "Lookup failed. Please try again." }, 500);
    if (!data || data.status === "deleted") return withCors({ exists: false });
    return withCors({ exists: true, student: data });
  } catch {
    return withCors({ error: "Invalid request." }, 400);
  }
});
