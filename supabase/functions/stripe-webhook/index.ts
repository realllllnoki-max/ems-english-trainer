// stripe-webhook
// Stripe からの Webhook を受け、課金状態(profiles.is_pro)を更新する「有料判定の正本」。
// verify_jwt = false（StripeはSupabase JWTを持たない）。代わりに Stripe 署名で検証する。
// 必要シークレット: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID
// 相乗り対策: STRIPE_PRICE_ID に一致するサブスクのみ処理し、既存事業の決済には触れない。
import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
  const whSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
  const ourPrice = Deno.env.get("STRIPE_PRICE_ID")!;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 署名検証（Deno では async 版を使う）
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig!, whSecret);
  } catch (e) {
    return new Response(`signature_error: ${(e as Error).message}`, { status: 400 });
  }

  const subHasOurPrice = (sub: Stripe.Subscription) =>
    (sub.items?.data || []).some((it) => it.price?.id === ourPrice);

  const setPro = async (customerId: string, isPro: boolean, periodEnd?: number | null) => {
    const upd: Record<string, unknown> = { is_pro: isPro };
    if (periodEnd) upd.current_period_end = new Date(periodEnd * 1000).toISOString();
    await admin.from("profiles").update(upd).eq("stripe_customer_id", customerId);
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode === "subscription" && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(s.subscription as string);
          if (subHasOurPrice(sub)) {
            const active = sub.status === "active" || sub.status === "trialing";
            await setPro(s.customer as string, active, sub.current_period_end);
          }
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        if (subHasOurPrice(sub)) {
          const active = sub.status === "active" || sub.status === "trialing";
          await setPro(sub.customer as string, active, sub.current_period_end);
        }
        break;
      }
      default:
        // 関係ないイベントは無視
        break;
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(`handler_error: ${(e as Error).message}`, { status: 500 });
  }
});
