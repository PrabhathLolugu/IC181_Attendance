import type { SupabaseClient } from '@supabase/supabase-js';
import { getSessionCategory } from './utils';

const PAGE_SIZE = 1000; // Supabase/PostgREST silently caps a single response at 1000 rows.
const ID_CHUNK = 40;

interface SessionRow { id: string; session_date: string; session_type: string; group_filter: string | null; }
interface StudentRow { id: string; roll_number: string; name: string; role_type: string | null; department: string | null; program: string | null; group_label: string | null; }
interface RecordRow { session_id: string; student_id: string; roll_number: string; }

export interface TheoryExportOptions {
  courseName: string;
  fromDate?: string;
  toDate?: string;
}

export interface TheoryExportResult {
  buffer: ArrayBuffer;
  fileName: string;
  sessionCount: number;
  studentCount: number;
  skippedEmptySessions: number;
}

/** Reads every row of a query by paging past the 1000-row response cap. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/**
 * Builds the Theory-only attendance workbook.
 *
 * A student is "P" for a session if they have ANY attendance record for it (GPS in/out of radius,
 * override code, manual, instructor-approved, excused). "A" only when there is no record at all.
 */
export async function buildTheoryAttendanceWorkbook(db: SupabaseClient, { courseName, fromDate, toDate }: TheoryExportOptions): Promise<TheoryExportResult> {
  const { default: ExcelJS } = await import('exceljs');

  const allSessions = await fetchAll<SessionRow>((from, to) => {
    let q = db.from('sessions').select('id, session_date, session_type, group_filter')
      .eq('course_name', courseName).eq('status', 'ended')
      .order('session_date').order('created_at').order('id').range(from, to);
    if (fromDate) q = q.gte('session_date', fromDate);
    if (toDate) q = q.lte('session_date', toDate);
    return q;
  });
  const theorySessions = allSessions.filter((s) => getSessionCategory(s.session_type) === 'theory_lecture');

  const students = await fetchAll<StudentRow>((from, to) =>
    db.from('students').select('id, roll_number, name, role_type, department, program, group_label')
      .eq('status', 'active').order('roll_number').order('id').range(from, to));

  const records: RecordRow[] = [];
  for (let i = 0; i < theorySessions.length; i += ID_CHUNK) {
    const ids = theorySessions.slice(i, i + ID_CHUNK).map((s) => s.id);
    records.push(...await fetchAll<RecordRow>((from, to) =>
      db.from('attendance_records').select('session_id, student_id, roll_number')
        .in('session_id', ids).order('id').range(from, to)));
  }

  const markedBySession = new Map<string, Set<string>>();
  const sessionsWithMarks = new Set<string>();
  for (const r of records) {
    sessionsWithMarks.add(r.session_id);
    const set = markedBySession.get(r.session_id) ?? new Set<string>();
    set.add(r.student_id);
    set.add(r.roll_number.trim().toUpperCase());
    markedBySession.set(r.session_id, set);
  }

  // A session nobody was marked in (e.g. started and immediately ended by mistake) is not a held class.
  const sessions = theorySessions.filter((s) => sessionsWithMarks.has(s.id));
  const skippedEmptySessions = theorySessions.length - sessions.length;

  const dateCount = new Map<string, number>();
  for (const s of sessions) dateCount.set(s.session_date, (dateCount.get(s.session_date) ?? 0) + 1);
  const dateSeen = new Map<string, number>();
  const sessionHeader = (s: SessionRow) => {
    const n = (dateSeen.get(s.session_date) ?? 0) + 1;
    dateSeen.set(s.session_date, n);
    const suffix = (dateCount.get(s.session_date) ?? 1) > 1 ? ` #${n}` : '';
    return `${s.session_date} · ${s.session_type}${suffix}`;
  };

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Theory Attendance');
  const infoCols = 5;
  sheet.columns = [
    { header: 'Roll / Emp ID', key: 'roll', width: 16 },
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Role', key: 'role', width: 16 },
    { header: 'School / Centre', key: 'dept', width: 30 },
    { header: 'Group', key: 'group', width: 8 },
    ...sessions.map((s) => ({ header: sessionHeader(s), key: s.id, width: 20 })),
    { header: 'Present', key: 'present', width: 10 },
    { header: 'Total Sessions', key: 'total', width: 15 },
    { header: 'Attendance %', key: 'pct', width: 14 },
  ];

  const presentTotals = new Map<string, number>(sessions.map((s) => [s.id, 0]));
  for (const student of students) {
    const roll = student.roll_number.trim().toUpperCase();
    const row: Record<string, string | number> = {
      roll: student.roll_number,
      name: student.name,
      role: student.role_type === 'faculty' ? 'Faculty / Staff' : 'Student',
      dept: student.department ?? '',
      group: student.group_label ?? '',
    };
    let present = 0;
    let total = 0;
    for (const s of sessions) {
      const marked = markedBySession.get(s.id);
      const attended = !!marked && (marked.has(student.id) || marked.has(roll));
      const applicable = !s.group_filter || s.group_filter === student.group_label;
      if (!applicable && !attended) { row[s.id] = '-'; continue; }
      total += 1;
      if (attended) { present += 1; presentTotals.set(s.id, (presentTotals.get(s.id) ?? 0) + 1); }
      row[s.id] = attended ? 'P' : 'A';
    }
    row.present = present;
    row.total = total;
    row.pct = total === 0 ? 0 : present / total;
    sheet.addRow(row);
  }

  const totalsRow: Record<string, string | number> = { name: 'Total present', dept: '', group: '' };
  for (const s of sessions) totalsRow[s.id] = presentTotals.get(s.id) ?? 0;
  const totals = sheet.addRow(totalsRow);
  totals.font = { bold: true };

  const pctCol = infoCols + sessions.length + 3;
  sheet.getColumn(pctCol).numFmt = '0.0%';
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 32;
  const green = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFDCFCE7' } };
  const red = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFEE2E2' } };
  for (let r = 2; r <= sheet.rowCount - 1; r += 1) {
    for (let c = infoCols + 1; c <= infoCols + sessions.length; c += 1) {
      const cell = sheet.getCell(r, c);
      cell.alignment = { horizontal: 'center' };
      if (cell.value === 'P') cell.fill = green;
      else if (cell.value === 'A') cell.fill = red;
    }
  }
  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: pctCol } };

  const buffer = await workbook.xlsx.writeBuffer() as ArrayBuffer;
  const safeCourse = courseName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const range = fromDate || toDate ? `_${fromDate || 'start'}_to_${toDate || 'end'}` : '';
  return { buffer, fileName: `${safeCourse}_Theory_Attendance${range}.xlsx`, sessionCount: sessions.length, studentCount: students.length, skippedEmptySessions };
}

export function downloadWorkbook(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
