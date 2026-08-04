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
    const db = serviceClient();

    const { data: settings } = await db.from("course_settings").select("course_name").single();
    const { data: students } = await db
      .from("students")
      .select("roll_number, name, section")
      .eq("status", "active")
      .order("roll_number");
    const { data: sessions } = await db
      .from("sessions")
      .select("id, session_date, session_type, section_filter")
      .eq("status", "ended")
      .order("session_date");
    const { data: records } = await db.from("attendance_records").select("session_id, roll_number, status");

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
        header: `${s.session_date} (${s.session_type === "practical" ? "P" : "T"})`,
        key: s.id,
        width: 14,
      })),
      { header: "Present %", key: "pct", width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const student of students ?? []) {
      const applicableSessions = (sessions ?? []).filter((s) => !s.section_filter || s.section_filter === student.section);
      let presentCount = 0;
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
        if (status) {
          presentCount += 1;
          row[s.id] = status === "late" ? "Late" : status === "manual" ? "Manual" : status === "override" ? "Override" : "P";
        } else {
          row[s.id] = "A";
        }
      }
      row.pct = applicableSessions.length > 0 ? Math.round((presentCount / applicableSessions.length) * 1000) / 10 : 0;
      sheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();

    await db.storage.createBucket(BUCKET, { public: false }).catch(() => {});
    const path = "Attendance.xlsx";
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
