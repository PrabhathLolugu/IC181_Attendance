import { handleOptions, withCors } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { rollNumber } = await req.json();
    const roll = String(rollNumber ?? "").trim().toUpperCase();
    if (!roll) return withCors({ error: "Roll number is required." }, 400);

    const db = serviceClient();
    const { data, error } = await db
      .from("students")
      .select("id, roll_number, name, email, phone, department, program, semester, group_label, batch, photo_url, status")
      .eq("roll_number", roll)
      .maybeSingle();

    if (error) return withCors({ error: "Lookup failed. Please try again." }, 500);
    if (!data || data.status === "deleted") return withCors({ exists: false });
    return withCors({ exists: true, student: data });
  } catch {
    return withCors({ error: "Invalid request." }, 400);
  }
});
