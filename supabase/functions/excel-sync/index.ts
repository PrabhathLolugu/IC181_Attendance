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
      .select("roll_number, name, group_label")
      .eq("status", "active")
      .order("roll_number");
    const { data: summaries } = await db.from("student_attendance_summary").select("roll_number, attendance_percentage");
    const pctByRoll = new Map((summaries ?? []).map((s) => [s.roll_number, s.attendance_percentage]));

    let sessionQuery = db.from("sessions").select("id, session_date, session_type, course_name, group_filter, round_id").eq("status", "ended").order("session_date");
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
      { header: "Group", key: "group", width: 10 },
      ...(sessions ?? []).map((s) => ({
        header: `${s.session_date} · ${s.course_name} (${s.session_type})${s.round_id ? " ↻" : ""}`,
        key: s.id,
        width: 16,
      })),
      { header: "Present %", key: "pct", width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };

    const LABELS: Record<string, string> = { late: "Late", manual: "Manual", override: "Override", excused: "Excused", present: "P" };

    for (const student of students ?? []) {
      const row: Record<string, string | number> = {
        roll: student.roll_number,
        name: student.name,
        group: student.group_label ?? "",
      };
      for (const s of sessions ?? []) {
        const applicable = !s.group_filter || s.group_filter === student.group_label;
        if (!applicable) {
          row[s.id] = "-";
          continue;
        }
        const status = byStudentSession.get(`${student.roll_number}|${s.id}`);
        row[s.id] = status ? (LABELS[status] ?? "P") : "A";
      }
      row.pct = pctByRoll.get(student.roll_number) ?? 0;
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
