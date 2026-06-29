// create-checkout-session
// ログイン済みユーザー向けに Stripe Checkout(サブスク/税込1200円) のセッションを作り URL を返す。
// verify_jwt = true（Supabaseゲートウェイで認証必須）。
// 必要シークレット: STRIPE_SECRET_KEY, STRIPE_PRICE_ID
//   （SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は Edge 既定で利用可能）
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
    const priceId = Deno.env.get("STRIPE_PRICE_ID")!;
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // JWT からユーザー特定
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: ures, error: uerr } = await admin.auth.getUser(jwt);
    if (uerr || !ures?.user) return json({ error: "unauthorized" }, 401);
    const user = ures.user;

    const body = await req.json().catch(() => ({} as any));
    const origin = (body.returnUrl as string) || req.headers.get("origin") || "";

    // Stripe顧客を取得 or 作成して profiles に紐付け
    const { data: prof } = await admin
      .from("profiles").select("stripe_customer_id").eq("id", user.id).single();
    let customerId = prof?.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}?checkout=success`,
      cancel_url: `${origin}?checkout=cancel`,
      allow_promotion_codes: true,
      subscription_data: { metadata: { supabase_user_id: user.id } },
      client_reference_id: user.id,
    });

    return json({ url: session.url });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
