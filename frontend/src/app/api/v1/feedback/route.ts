import { z } from "zod";
import { ok, readJson, route } from "@backend/lib/http/api";
import { createAdminClient } from "@backend/lib/supabase/admin";
import { rateLimit } from "@backend/server/ai/provider";
import { requireAuth } from "@backend/server/auth/context";
import { isSupabaseConfigured } from "@backend/lib/env/public";

const feedbackSchema = z.object({
  kind: z.enum(["contact", "feedback"]),
  name: z.string().trim().min(2, "Enter your name.").max(100),
  email: z.string().trim().email("Enter a valid email address.").max(160),
  category: z.string().trim().min(2).max(80).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  subject: z.string().trim().min(2, "Enter a subject.").max(160),
  message: z.string().trim().min(10, "Please share at least 10 characters.").max(4000),
});

export const POST = route(async (req, _ctx, requestId) => {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "local";
  rateLimit(`public-feedback:${ip}`, 8, 60_000);

  const input = feedbackSchema.parse(await readJson(req));
  if (isSupabaseConfigured()) {
    const auth = await requireAuth().catch(() => null);
    const admin = createAdminClient();
    await admin.from("user_audit_logs").insert({
      user_id: auth?.userId ?? null,
      user_email: input.email,
      workspace_id: auth?.workspaceId ?? null,
      event: input.kind === "feedback" ? "public.feedback" : "public.contact",
      page_path: input.kind === "feedback" ? "/feedback" : "/contact",
      detail: JSON.stringify({
        name: input.name,
        category: input.category ?? "General",
        rating: input.rating ?? null,
        subject: input.subject,
        message: input.message,
      }).slice(0, 3500),
    });
  }

  return ok(
    {
      received: true,
      kind: input.kind,
      message: "Thank you! Your message has been logged and our team will respond promptly.",
    },
    {},
    201,
    requestId,
  );
});
