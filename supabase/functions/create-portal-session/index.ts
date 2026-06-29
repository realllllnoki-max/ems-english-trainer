// create-portal-session
// ログイン済みユーザーの Stripe カスタマーポータル(解約・カード変更)のURLを返す。
// verify_jwt = true。必要シークレット: STRIPE_SECRET_KEY
//   （Stripe側で Billing Portal を有効化しておくこと）
import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: ures, error: uerr } = await admin.auth.getUser(jwt);
    if (uerr || !ures?.user) return json({ error: "unauthorized" }, 401);
    const user = ures.user;

    const { data: prof } = await admin
      .from("profiles").select("stripe_customer_id").eq("id", user.id).single();
    const customerId = prof?.stripe_customer_id as string | null;
    if (!customerId) return json({ error: "no_customer" }, 400);

    const body = await req.json().catch(() => ({} as any));
    const origin = (body.returnUrl as string) || req.headers.get("origin") || "";

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: origin || undefined,
    });

    return json({ url: portal.url });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
