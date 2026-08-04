import { anonClientForRequest, serviceClient } from "./client.ts";

export async function requireStaff(req: Request, opts: { adminOnly?: boolean } = {}) {
  const authed = anonClientForRequest(req);
  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData?.user) {
    return { error: "Not authenticated." } as const;
  }

  const admin = serviceClient();
  const { data: staff, error: staffErr } = await admin
    .from("staff")
    .select("*")
    .eq("id", userData.user.id)
    .eq("status", "active")
    .maybeSingle();

  if (staffErr || !staff) {
    return { error: "Not an active staff account." } as const;
  }
  if (opts.adminOnly && staff.role !== "admin") {
    return { error: "Admin access required." } as const;
  }
  return { staff } as const;
}
