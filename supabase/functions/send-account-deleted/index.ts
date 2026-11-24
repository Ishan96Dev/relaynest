// Supabase Edge Function: sends RelayNest's branded account deletion confirmation email
// using the rendered HTML from `supabase/templates/account_deleted.html` via Brevo SMTP HTTP API
// (or Resend if configured). Deploy with: `supabase functions deploy send-account-deleted`
//
// deno-lint-ignore-file no-explicit-any
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!serviceKey || !token || !safeEqual(token, serviceKey)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, any> | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const subject = typeof body?.subject === "string" ? body.subject : "Your RelayNest account has been deleted";
  const html = typeof body?.html === "string" ? body.html : "";
  const name = typeof body?.name === "string" ? body.name : undefined;

  if (!email || !html) {
    return new Response(JSON.stringify({ error: "Missing email or rendered HTML body" }), { status: 400 });
  }

  const brevoKey = Deno.env.get("BREVO_API_KEY");
  const fromEmail = Deno.env.get("MAIL_FROM_ADDRESS") || "noreply@relaynest.app";
  const fromName = Deno.env.get("MAIL_FROM_NAME") || "RelayNest";

  if (brevoKey) {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email, ...(name ? { name } : {}) }],
        subject,
        htmlContent: html,
        tags: ["account_deleted", "supabase-edge"],
      }),
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Brevo status ${res.status}` }), { status: 502 });
    }
    return new Response(JSON.stringify({ sent: true, provider: "brevo" }), { status: 200 });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [email], subject, html }),
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Resend status ${res.status}` }), { status: 502 });
    }
    return new Response(JSON.stringify({ sent: true, provider: "resend" }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: "Configure BREVO_API_KEY or RESEND_API_KEY secret in Supabase Edge Functions" }), {
    status: 503,
  });
});
