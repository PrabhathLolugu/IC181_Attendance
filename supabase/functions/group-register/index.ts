import { handleOptions, withCors } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { logAudit } from "../_shared/audit.ts";

// Must match MAX_CAPACITY in the Yoga group registration Apps Script — this
// is a backstop against the Apps Script's own choice-list filtering, not the
// primary enforcement (the form already hides a group once it's full).
const MAX_CAPACITY = 45;

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const body = await req.json();
    const roll = String(body.rollNumber ?? "").trim().toUpperCase();
    const name = String(body.name ?? "").trim();
    const rawGroup = String(body.group ?? "").trim();
    if (!roll || !name || !rawGroup) {
      return withCors({ error: "Roll number, name and group are required." }, 400);
    }

    // Form choices look like "Group A — Monday (7:00–8:00 AM) MORNING";
    // pull out just the letter so it matches the group_label already used
    // elsewhere in the system (e.g. staff bulk-assignment uses "A".."H").
    const match = rawGroup.match(/^Group\s+([A-Za-z])\b/);
    const code = (match ? match[1] : rawGroup.slice(0, 3)).toUpperCase();

    const email = body.email ? String(body.email).trim() : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return withCors({ error: "Please enter a valid email address." }, 400);
    }

    const db = serviceClient();

    const { data: existing, error: lookupErr } = await db
      .from("students")
      .select("*")
      .eq("roll_number", roll)
      .maybeSingle();
    if (lookupErr) return withCors({ error: "Lookup failed. Please try again." }, 500);

    if (existing && existing.status === "deleted") {
      return withCors({ error: "This roll number is not active in the system. Please contact the instructor." }, 409);
    }

    if (!existing || existing.group_label !== code) {
      const { count, error: countErr } = await db
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("group_label", code)
        .eq("status", "active");
      if (countErr) return withCors({ error: "Could not check group capacity. Please try again." }, 500);
      if ((count ?? 0) >= MAX_CAPACITY) {
        return withCors({ error: `Group ${code} is already full. Please refresh the form and pick another group.` }, 409);
      }
    }

    let student;
    if (existing) {
      const { data, error } = await db
        .from("students")
        .update({ group_label: code, email: existing.email ?? email })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) return withCors({ error: "Could not update your group. Please try again." }, 500);
      student = data;
    } else {
      const { data, error } = await db
        .from("students")
        .insert({ roll_number: roll, name, email, group_label: code })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") {
          return withCors({ error: "This roll number was just registered — please resubmit." }, 409);
        }
        return withCors({ error: "Registration failed. Please try again." }, 500);
      }
      student = data;
    }

    await logAudit({
      actorLabel: `student:${roll}`,
      action: existing ? "student_group_updated" : "student_group_registered",
      entityType: "student",
      entityId: student.id,
      before: existing ?? null,
      after: student,
    });

    return withCors({ student, group: code });
  } catch {
    return withCors({ error: "Invalid request." }, 400);
  }
});
