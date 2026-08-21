import { handleOptions, withCors } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { verifyQrToken } from "../_shared/qr.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const body = await req.json();
    const roll = String(body.rollNumber ?? "").trim().toUpperCase();

    if (!roll) return withCors({ error: "Roll number is required." }, 400);

    const db = serviceClient();

    const { data: student, error } = await db
      .from("students")
      .select("id, roll_number, name, role_type, department, program, group_label, photo_url, status")
      .ilike("roll_number", roll)
      .maybeSingle();

    if (error) return withCors({ error: "Lookup failed. Please try again." }, 500);
    if (!student || student.status === "deleted") return withCors({ exists: false });

    // If QR token is present, check if this specific student has already marked for this session
    if (body.qrToken) {
      const qrCheck = await verifyQrToken(String(body.qrToken), Deno.env.get("QR_SIGNING_SECRET")!);
      if (qrCheck.valid) {
        const { data: record } = await db
          .from("attendance_records")
          .select("marked_at, status")
          .eq("session_id", qrCheck.payload.sid)
          .eq("student_id", student.id)
          .maybeSingle();

        if (record) {
          return withCors({
            exists: true,
            student,
            alreadyMarked: true,
            markedAt: record.marked_at,
            status: record.status,
          });
        }
      }
    }

    return withCors({ exists: true, student });
  } catch {
    return withCors({ error: "Invalid request." }, 400);
  }
});
