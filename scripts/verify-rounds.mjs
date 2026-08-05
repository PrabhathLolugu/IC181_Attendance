import { Client } from 'pg';

const c = new Client({
  connectionString: `postgresql://postgres.${process.env.SUPABASE_PROJECT_REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@${process.env.SUPABASE_POOLER_HOST}:5432/postgres`,
});
await c.connect();

function assert(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) process.exitCode = 1;
}

// Distinctive, collision-proof group labels so this test is safe to run against a
// database that already has real groups/sessions in it (only ambient GENERAL
// sessions, which apply to everyone, need to be accounted for via `baseline` below).
const G = { D: 'ZTEST-D', F: 'ZTEST-F', A: 'ZTEST-A', B: 'ZTEST-B', C: 'ZTEST-C', E: 'ZTEST-E', G: 'ZTEST-G', Q: 'ZTEST-Q', BASE: 'ZTEST-BASELINE' };

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
async function makeSession(groupFilter, status, roundId, courseName = 'IC181') {
  const { rows } = await c.query(
    `insert into sessions (session_type, course_name, status, started_by, anchor_lat, anchor_lng, radius_meters, rotation_id, rotation_expires_at, group_filter, round_id)
     values ('Yoga',$5,$1,$2,31.77,76.98,100,'x',now(),$3,$4) returning id;`,
    [status, await makeStaff(), groupFilter, roundId, courseName],
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
async function summary(studentId, courseName = 'IC181') {
  const { rows } = await c.query(`select * from student_attendance_summary($2) where student_id = $1;`, [studentId, courseName]);
  const r = rows[0];
  return {
    total_sessions: Number(r.total_sessions),
    present_count: Number(r.present_count),
    attendance_percentage: Number(r.attendance_percentage),
  };
}

// Baseline: a student in a group nothing else in this test (or real usage) targets.
// Their total_sessions equals however many ambient GENERAL (group_filter null)
// ended standalone sessions already exist in the database -- real ones included.
const studentBaseline = await makeStudent('ZTESTSTU-BASE01', G.BASE);
const baseline = (await summary(studentBaseline)).total_sessions;
console.log(`(ambient general-session baseline in this database: ${baseline})`);

// Scenario 1 & 2: round with D-session and F-session, both ended.
const round1 = await makeRound('ZTest Yoga W3');
const dSession = await makeSession(G.D, 'ended', round1);
const fSession = await makeSession(G.F, 'ended', round1);

const studentX = await makeStudent('ZTESTSTU-X01', G.D); // attends F instead of own D session
await mark(fSession, studentX, 'ZTESTSTU-X01', 'present');
const sumX = await summary(studentX);
assert(sumX.total_sessions === baseline + 1 && sumX.present_count === 1,
  `D-group student who skipped D but attended F is present for the round (got total=${sumX.total_sessions}, present=${sumX.present_count}, expected total=${baseline + 1})`);

const studentY = await makeStudent('ZTESTSTU-Y01', G.D); // attends neither
const sumY = await summary(studentY);
assert(sumY.total_sessions === baseline + 1 && sumY.present_count === 0,
  `D-group student who attended neither is absent for the round (got total=${sumY.total_sessions}, present=${sumY.present_count})`);

// Scenario 3: round still open (one member session still active) should not count yet.
const round2 = await makeRound('ZTest Yoga W4 (in progress)');
await makeSession(G.A, 'ended', round2);
await makeSession(G.B, 'active', round2);
const studentZ = await makeStudent('ZTESTSTU-Z01', G.A);
const sumZ = await summary(studentZ);
assert(sumZ.total_sessions === baseline, `open round (one session still active) does not count in denominator yet (got total=${sumZ.total_sessions}, expected ${baseline})`);

// Scenario 4: round not applicable to a student in an unrelated group.
const studentC = await makeStudent('ZTESTSTU-C01', G.C); // round1 only has D and F sessions
const sumC = await summary(studentC);
assert(sumC.total_sessions === baseline, `round with no session matching student's group does not apply to them (got total=${sumC.total_sessions}, expected ${baseline})`);

// Scenario 5: excused from the only session they attended in the round -> round excluded, not held against them.
const round3 = await makeRound('ZTest Yoga W5');
const eSession = await makeSession(G.E, 'ended', round3);
await makeSession(G.G, 'ended', round3);
const studentE = await makeStudent('ZTESTSTU-E01', G.E);
await mark(eSession, studentE, 'ZTESTSTU-E01', 'excused');
const sumE = await summary(studentE);
assert(sumE.total_sessions === baseline && sumE.present_count === 0,
  `student excused from their only round session is excluded from the denominator entirely, not marked absent (got total=${sumE.total_sessions}, expected ${baseline})`);

// Scenario 6: regression check, standalone (non-round) sessions still work as before.
const standalone = await makeSession(G.Q, 'ended', null);
const studentS = await makeStudent('ZTESTSTU-S01', G.Q);
await mark(standalone, studentS, 'ZTESTSTU-S01', 'present');
const sumS = await summary(studentS);
assert(sumS.total_sessions === baseline + 1 && sumS.present_count === 1,
  `standalone group-targeted session still counts individually as before (got total=${sumS.total_sessions}, present=${sumS.present_count}, expected total=${baseline + 1})`);

// Scenario 7: general (group_filter null) session inside a round matches everyone.
const round4 = await makeRound('ZTest Open Round');
await makeSession(null, 'ended', round4);
const studentAny = await makeStudent('ZTESTSTU-ANY01', 'ZTEST-UNRELATED');
const sumAny = await summary(studentAny);
assert(sumAny.total_sessions === baseline + 1, `a round containing a general (no group) session applies to every student (got total=${sumAny.total_sessions}, expected ${baseline + 1})`);

// From scenario 7 onward, round4 ("ZTest Open Round") contains a general
// (group_filter null) session, so it legitimately applies to every student
// created from here on -- +1 to everyone's expected total below.
const openRoundOffset = 1;

// Scenario 8 (bug fix regression): a student with NO group who actually attends a
// group-targeted standalone session must have it count -- actual attendance always
// counts, even across groups / when unassigned.
const crossGroupSession = await makeSession(G.A, 'ended', null);
const studentCross = await makeStudent('ZTESTSTU-CROSS01', null);
await mark(crossGroupSession, studentCross, 'ZTESTSTU-CROSS01', 'present');
const sumCross = await summary(studentCross);
assert(sumCross.total_sessions === baseline + openRoundOffset + 1 && sumCross.present_count === 1,
  `unassigned student who actually attends a group-targeted session gets credit for it, not silently dropped (got total=${sumCross.total_sessions}, present=${sumCross.present_count}, expected total=${baseline + openRoundOffset + 1})`);

// Scenario 9 (bug fix regression): same, but for a round -- attending a different
// group's round session while unassigned/mismatched must still count.
const round5 = await makeRound('ZTest Cross-Group Round');
const round5Session = await makeSession(G.D, 'ended', round5);
const studentCrossRound = await makeStudent('ZTESTSTU-CROSS02', 'ZTEST-UNRELATED2');
await mark(round5Session, studentCrossRound, 'ZTESTSTU-CROSS02', 'present');
const sumCrossRound = await summary(studentCrossRound);
assert(sumCrossRound.total_sessions === baseline + openRoundOffset + 1 && sumCrossRound.present_count === 1,
  `student outside the round's target groups who still attends gets round credit (got total=${sumCrossRound.total_sessions}, present=${sumCrossRound.present_count}, expected total=${baseline + openRoundOffset + 1})`);

// Scenario 10 (course isolation): a session in a different course must not affect
// -- or be affected by -- the primary course's percentage at all. (By this point
// round4's general session from scenario 7 is a real closed IC181 round that
// applies to everyone querying IC181 -- accounted for via openRoundOffset.)
const demoSession = await makeSession(null, 'ended', null, 'ZTEST-DemoCourse');
const studentDemo = await makeStudent('ZTESTSTU-DEMO01', null);
await mark(demoSession, studentDemo, 'ZTESTSTU-DEMO01', 'present');
const sumDemoAsIC181 = await summary(studentDemo, 'IC181');
const sumDemoAsDemo = await summary(studentDemo, 'ZTEST-DemoCourse');
assert(sumDemoAsIC181.total_sessions === baseline + openRoundOffset && sumDemoAsIC181.present_count === 0,
  `a demo-course session does not appear at all when viewing IC181's stats (got total=${sumDemoAsIC181.total_sessions}, expected ${baseline + openRoundOffset} from ambient + the unrelated open IC181 round only)`);
assert(sumDemoAsDemo.total_sessions === 1 && sumDemoAsDemo.present_count === 1 && sumDemoAsDemo.attendance_percentage === 100,
  `the same session correctly shows 100% when viewing the demo course's own stats (got total=${sumDemoAsDemo.total_sessions}, present=${sumDemoAsDemo.present_count})`);

// Scenario 11: the ambient baseline student (real IC181 context) must be completely
// unaffected by the demo course's session existing at all.
const sumBaselineAfterDemo = await summary(studentBaseline, 'IC181');
assert(sumBaselineAfterDemo.total_sessions === baseline + openRoundOffset,
  `an IC181 student's stats are unaffected by an unrelated demo-course session existing (got total=${sumBaselineAfterDemo.total_sessions}, expected ${baseline + openRoundOffset}, unchanged from before scenario 10)`);

// Cleanup
await c.query(`delete from attendance_records where roll_number like 'ZTESTSTU-%';`);
await c.query(`delete from sessions where round_id in (select id from activity_rounds where name like 'ZTest %') or group_filter like 'ZTEST-%' or course_name = 'ZTEST-DemoCourse';`);
await c.query(`delete from activity_rounds where name like 'ZTest %';`);
await c.query(`delete from students where roll_number like 'ZTESTSTU-%';`);
console.log('Cleaned up.');

await c.end();
