import { handleOptions, withCors } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { requireStaff } from "../_shared/staffAuth.ts";
import ExcelJS from "npm:exceljs@4.4.0";

const BUCKET = "attendance-exports";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const auth = await requireStaff(req);
  if ("error" in auth) return withCors({ error: auth.error }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const fromDate: string | undefined = body.fromDate || undefined;
    const toDate: string | undefined = body.toDate || undefined;

    const db = serviceClient();

    const { data: settings } = await db.from("course_settings").select("course_name").single();
    const { data: students } = await db
      .from("students")
      .select("roll_number, name, section")
      .eq("status", "active")
      .order("roll_number");

    let sessionQuery = db.from("sessions").select("id, session_date, session_type, course_name, section_filter").eq("status", "ended").order("session_date");
    if (fromDate) sessionQuery = sessionQuery.gte("session_date", fromDate);
    if (toDate) sessionQuery = sessionQuery.lte("session_date", toDate);
    const { data: sessions } = await sessionQuery;

    const { data: records } = sessions?.length
      ? await db.from("attendance_records").select("session_id, roll_number, status").in("session_id", sessions.map((s) => s.id))
      : { data: [] };

    const byStudentSession = new Map<string, string>();
    for (const r of records ?? []) byStudentSession.set(`${r.roll_number}|${r.session_id}`, r.status);

    const workbook = new ExcelJS.Workbook();
    const sheetName = (settings?.course_name || "Attendance").slice(0, 31);
    const sheet = workbook.addWorksheet(sheetName);

    sheet.columns = [
      { header: "Roll Number", key: "roll", width: 16 },
      { header: "Name", key: "name", width: 26 },
      { header: "Section", key: "section", width: 10 },
      ...(sessions ?? []).map((s) => ({
        header: `${s.session_date} · ${s.course_name} (${s.session_type})`,
        key: s.id,
        width: 16,
      })),
      { header: "Present %", key: "pct", width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };

    const LABELS: Record<string, string> = { late: "Late", manual: "Manual", override: "Override", excused: "Excused", present: "P" };

    for (const student of students ?? []) {
      const applicableSessions = (sessions ?? []).filter((s) => !s.section_filter || s.section_filter === student.section);
      let presentCount = 0;
      let excusedCount = 0;
      const row: Record<string, string | number> = {
        roll: student.roll_number,
        name: student.name,
        section: student.section ?? "",
      };
      for (const s of sessions ?? []) {
        const applicable = applicableSessions.some((a) => a.id === s.id);
        if (!applicable) {
          row[s.id] = "-";
          continue;
        }
        const status = byStudentSession.get(`${student.roll_number}|${s.id}`);
        if (status === "excused") {
          excusedCount += 1;
          row[s.id] = "Excused";
        } else if (status) {
          presentCount += 1;
          row[s.id] = LABELS[status] ?? "P";
        } else {
          row[s.id] = "A";
        }
      }
      const denominator = applicableSessions.length - excusedCount;
      row.pct = denominator > 0 ? Math.round((presentCount / denominator) * 1000) / 10 : 0;
      sheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();

    await db.storage.createBucket(BUCKET, { public: false }).catch(() => {});
    const path = fromDate || toDate ? `Attendance_${fromDate || "start"}_to_${toDate || "end"}.xlsx` : "Attendance.xlsx";
    const { error: uploadErr } = await db.storage.from(BUCKET).upload(path, buffer, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });
    if (uploadErr) return withCors({ error: "Could not save the Excel file: " + uploadErr.message }, 500);

    const { data: signed, error: signErr } = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (signErr || !signed) return withCors({ error: "File saved, but could not generate a download link." }, 500);

    return withCors({ url: signed.signedUrl });
  } catch {
    return withCors({ error: "Excel export failed." }, 500);
  }
});
