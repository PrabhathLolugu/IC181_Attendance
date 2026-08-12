import { handleOptions, withCors } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { requireStaff } from "../_shared/staffAuth.ts";
import { logAudit } from "../_shared/audit.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const auth = await requireStaff(req, { adminOnly: true });
  if ("error" in auth) return withCors({ error: auth.error }, 403);

  try {
    const body = await req.json();
    const db = serviceClient();

    if (body.action === "create" || body.action === "invite") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const name = String(body.name ?? "").trim();
      const password = String(body.password ?? "");
      const role = body.role === "admin" ? "admin" : "ta";

      if (!email || !name) return withCors({ error: "Name and email are required." }, 400);
      if (!password || password.length < 6) return withCors({ error: "Password must be at least 6 characters." }, 400);

      // Create user directly with password and auto-confirm email (no email sent)
      const { data: newUser, error: createErr } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });

      if (createErr || !newUser?.user) {
        return withCors({ error: createErr?.message || "Could not create user account." }, 500);
      }

      const { data: staffRow, error: staffErr } = await db
        .from("staff")
        .upsert({
          id: newUser.user.id,
          email,
          name,
          role,
          status: "active",
          created_by: auth.staff.id,
        })
        .select()
        .single();

      if (staffErr) {
        return withCors({ error: "User account created, but staff profile could not be saved: " + staffErr.message }, 500);
      }

      await logAudit({
        actorId: auth.staff.id,
        actorLabel: auth.staff.email,
        action: "staff_created",
        entityType: "staff",
        entityId: staffRow.id,
        after: staffRow,
      });

      return withCors({ staff: staffRow });
    }

    if (body.action === "disable" || body.action === "enable") {
      const status = body.action === "disable" ? "disabled" : "active";
      const { data: before } = await db.from("staff").select("*").eq("id", body.staffId).maybeSingle();
      const { data: after, error } = await db.from("staff").update({ status }).eq("id", body.staffId).select().single();
      if (error) return withCors({ error: "Could not update staff status." }, 500);
      await logAudit({
        actorId: auth.staff.id,
        actorLabel: auth.staff.email,
        action: status === "disabled" ? "staff_disabled" : "staff_enabled",
        entityType: "staff",
        entityId: body.staffId,
        before,
        after,
      });
      return withCors({ staff: after });
    }

    if (body.action === "update_role") {
      const role = body.role === "admin" ? "admin" : "ta";
      const { data: before } = await db.from("staff").select("*").eq("id", body.staffId).maybeSingle();
      const { data: after, error } = await db.from("staff").update({ role }).eq("id", body.staffId).select().single();
      if (error) return withCors({ error: "Could not update role." }, 500);
      await logAudit({
        actorId: auth.staff.id,
        actorLabel: auth.staff.email,
        action: "staff_role_changed",
        entityType: "staff",
        entityId: body.staffId,
        before,
        after,
      });
      return withCors({ staff: after });
    }

    if (body.action === "remove") {
      const { data: before } = await db.from("staff").select("*").eq("id", body.staffId).maybeSingle();
      if (!before) return withCors({ error: "Staff member not found." }, 404);
      await db.from("staff").delete().eq("id", body.staffId);
      await db.auth.admin.deleteUser(body.staffId);
      await logAudit({
        actorId: auth.staff.id,
        actorLabel: auth.staff.email,
        action: "staff_removed",
        entityType: "staff",
        entityId: body.staffId,
        before,
      });
      return withCors({ ok: true });
    }

    return withCors({ error: "Unknown action." }, 400);
  } catch {
    return withCors({ error: "Invalid request." }, 400);
  }
});
