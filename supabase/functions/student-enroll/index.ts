import { handleOptions, withCors } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { logAudit } from "../_shared/audit.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const body = await req.json();
    const roll = String(body.rollNumber ?? "").trim().toUpperCase();
    const name = String(body.name ?? "").trim();
    if (!roll || !name) return withCors({ error: "ID / Roll number and name are required." }, 400);

    const roleType = body.roleType === 'faculty' ? 'faculty' : 'student';
    const department = body.department ? String(body.department).trim() : null; // School / Centre
    const program = body.program ? String(body.program).trim() : null;       // Program (e.g. B.Tech, M.Tech, Ph.D.)

    const db = serviceClient();
    const { data, error } = await db
      .from("students")
      .insert({
        roll_number: roll,
        name,
        role_type: roleType,
        department,
        program,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return withCors(
          { error: "This ID / Roll number is already registered.", code: "already_registered" },
          409,
        );
      }
      return withCors({ error: "Registration failed. Please try again." }, 500);
    }

    await logAudit({
      actorLabel: `${roleType}:${roll}`,
      action: "participant_registered",
      entityType: "student",
      entityId: data.id,
      after: data,
    });

    return withCors({ student: data });
  } catch {
    return withCors({ error: "Invalid request." }, 400);
  }
});
