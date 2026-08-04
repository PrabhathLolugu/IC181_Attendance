import { Client } from 'pg';

const c = new Client({
  connectionString: `postgresql://postgres.${process.env.SUPABASE_PROJECT_REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@${process.env.SUPABASE_POOLER_HOST}:5432/postgres`,
});
await c.connect();

function assert(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) process.exitCode = 1;
}

let staffIdCache = null;
async function makeStaff() {
  if (staffIdCache) return staffIdCache;
  const { rows } = await c.query(`select id from staff limit 1;`);
  staffIdCache = rows[0].id;
  return staffIdCache;
}
async function makeStudent(roll, group) {
  const { rows } = await c.query(`insert into students (roll_number, name, group_label) values ($1, $1, $2) returning id;`, [roll, group]);
  return rows[0].id;
}
async function makeSession(groupFilter, status, roundId) {
  const { rows } = await c.query(
    `insert into sessions (session_type, course_name, status, started_by, anchor_lat, anchor_lng, radius_meters, rotation_id, rotation_expires_at, group_filter, round_id)
     values ('Yoga','IC181',$1,$2,31.77,76.98,100,'x',now(),$3,$4) returning id;`,
    [status, await makeStaff(), groupFilter, roundId],
  );
  return rows[0].id;
}
async function makeRound(name) {
  const { rows } = await c.query(`insert into activity_rounds (name) values ($1) returning id;`, [name]);
  return rows[0].id;
}
async function mark(sessionId, studentId, roll, status) {
  await c.query(
    `insert into attendance_records (session_id, student_id, roll_number, status, method) values ($1,$2,$3,$4,'manual');`,
    [sessionId, studentId, roll, status],
  );
}
async function summary(studentId) {
  const { rows } = await c.query(`select * from student_attendance_summary where student_id = $1;`, [studentId]);
  const r = rows[0];
  return {
    total_sessions: Number(r.total_sessions),
    present_count: Number(r.present_count),
    attendance_percentage: Number(r.attendance_percentage),
  };
}

// Scenario 1 & 2: round with D-session and F-session, both ended.
const round1 = await makeRound('Yoga W3');
const dSession = await makeSession('D', 'ended', round1);
const fSession = await makeSession('F', 'ended', round1);

const studentX = await makeStudent('RX01', 'D'); // attends F instead of own D session
await mark(fSession, studentX, 'RX01', 'present');
const sumX = await summary(studentX);
assert(sumX.total_sessions === 1 && sumX.present_count === 1 && sumX.attendance_percentage === 100,
  `D-group student who skipped D but attended F is present for the round (got total=${sumX.total_sessions}, present=${sumX.present_count}, pct=${sumX.attendance_percentage})`);

const studentY = await makeStudent('RY01', 'D'); // attends neither
const sumY = await summary(studentY);
assert(sumY.total_sessions === 1 && sumY.present_count === 0 && sumY.attendance_percentage === 0,
  `D-group student who attended neither is absent for the round (got total=${sumY.total_sessions}, present=${sumY.present_count})`);

// Scenario 3: round still open (one member session still active) should not count yet.
const round2 = await makeRound('Yoga W4 (in progress)');
await makeSession('A', 'ended', round2);
await makeSession('B', 'active', round2);
const studentZ = await makeStudent('RZ01', 'A');
const sumZ = await summary(studentZ);
assert(sumZ.total_sessions === 0, `open round (one session still active) does not count in denominator yet (got total=${sumZ.total_sessions})`);

// Scenario 4: round not applicable to a student in an unrelated group.
const studentC = await makeStudent('RC01', 'C'); // round1 only has D and F sessions
const sumC = await summary(studentC);
assert(sumC.total_sessions === 0, `round with no session matching student's group does not apply to them (got total=${sumC.total_sessions})`);

// Scenario 5: excused from the only session they attended in the round -> round excluded, not held against them.
const round3 = await makeRound('Yoga W5');
const eSession = await makeSession('E', 'ended', round3);
const gSession = await makeSession('G', 'ended', round3);
const studentE = await makeStudent('RE01', 'E');
await mark(eSession, studentE, 'RE01', 'excused');
const sumE = await summary(studentE);
assert(sumE.total_sessions === 0 && sumE.present_count === 0,
  `student excused from their only round session is excluded from the denominator entirely, not marked absent (got total=${sumE.total_sessions}, present=${sumE.present_count})`);

// Scenario 6: regression check, standalone (non-round) sessions still work as before.
const standalone = await makeSession(null, 'ended', null);
const studentS = await makeStudent('RS01', null);
await mark(standalone, studentS, 'RS01', 'present');
const sumS = await summary(studentS);
assert(sumS.total_sessions === 1 && sumS.present_count === 1, `standalone general session still counts individually as before (got total=${sumS.total_sessions}, present=${sumS.present_count})`);

// Scenario 7: general (group_filter null) session inside a round matches everyone.
const round4 = await makeRound('Open Round');
await makeSession(null, 'ended', round4);
const studentAny = await makeStudent('RANY01', 'Q'); // group not otherwise referenced
const sumAny = await summary(studentAny);
assert(sumAny.total_sessions === 2, `a round containing a general session AND the earlier general standalone session both apply to every student (got total=${sumAny.total_sessions}, expected 2 = 1 standalone + 1 round)`);

// Cleanup
await c.query(`delete from attendance_records where roll_number like 'R%01';`);
await c.query(`delete from sessions where round_id in (select id from activity_rounds where name like 'Yoga %' or name = 'Open Round') or id = $1;`, [standalone]);
await c.query(`delete from activity_rounds where name like 'Yoga %' or name = 'Open Round';`);
await c.query(`delete from students where roll_number like 'R%01';`);
console.log('Cleaned up.');

await c.end();
