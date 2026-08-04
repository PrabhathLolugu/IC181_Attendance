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
    if (!roll || !name) return withCors({ error: "Roll number and name are required." }, 400);

    const email = body.email ? String(body.email).trim() : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return withCors({ error: "Please enter a valid email address." }, 400);
    }

    const db = serviceClient();
    const { data, error } = await db
      .from("students")
      .insert({
        roll_number: roll,
        name,
        email,
        phone: body.phone ? String(body.phone).trim() : null,
        department: body.department ? String(body.department).trim() : null,
        program: body.program ? String(body.program).trim() : null,
        semester: body.semester ? String(body.semester).trim() : null,
        batch: body.batch ? String(body.batch).trim() : null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return withCors(
          { error: "This roll number is already registered. Continue to attendance instead.", code: "already_registered" },
          409,
        );
      }
      return withCors({ error: "Registration failed. Please try again." }, 500);
    }

    await logAudit({
      actorLabel: `student:${roll}`,
      action: "student_registered",
      entityType: "student",
      entityId: data.id,
      after: data,
    });

    return withCors({ student: data });
  } catch {
    return withCors({ error: "Invalid request." }, 400);
  }
});
