// stripe-webhook
// Stripe からの Webhook を受け、課金状態(profiles.is_pro)を更新する「有料判定の正本」。
// verify_jwt = false（StripeはSupabase JWTを持たない）。代わりに Stripe 署名で検証する。
// 必要シークレット: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//   STRIPE_PRICE_ID(月額), STRIPE_PRICE_ID_6M(6ヶ月), STRIPE_PRICE_ID_1Y(1年)
// 相乗り対策: 自社の価格ID（月/6ヶ月/1年）に一致するサブスクのみ処理し、既存事業の決済には触れない。
import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
  const whSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
  // 自社の価格ID一式（月/6ヶ月/1年）。未設定は除外。
  const ourPrices = new Set(
    [
      Deno.env.get("STRIPE_PRICE_ID"),
      Deno.env.get("STRIPE_PRICE_ID_6M"),
      Deno.env.get("STRIPE_PRICE_ID_1Y"),
    ].filter(Boolean) as string[],
  );
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
    (sub.items?.data || []).some((it) => !!it.price?.id && ourPrices.has(it.price.id));

  // 課金状態の反映。失敗や対象0件を握りつぶすと Stripe が成功扱いにして
  // リトライされず「支払済みなのに Pro にならない」が恒久化するため、throw して 500 を返す。
  // stripe_customer_id で見つからない場合は metadata の supabase_user_id にフォールバック。
  const setPro = async (
    customerId: string,
    isPro: boolean,
    periodEnd?: number | null,
    fallbackUserId?: string | null,
  ) => {
    const upd: Record<string, unknown> = { is_pro: isPro };
    if (periodEnd) upd.current_period_end = new Date(periodEnd * 1000).toISOString();
    const { data, error } = await admin
      .from("profiles").update(upd).eq("stripe_customer_id", customerId).select("id");
    if (error) throw new Error(`profiles_update_failed: ${error.message}`);
    if (data && data.length > 0) return;
    if (fallbackUserId) {
      const { data: d2, error: e2 } = await admin
        .from("profiles")
        .update({ ...upd, stripe_customer_id: customerId })
        .eq("id", fallbackUserId)
        .select("id");
      if (e2) throw new Error(`profiles_update_failed(fallback): ${e2.message}`);
      if (d2 && d2.length > 0) return;
    }
    throw new Error(`profile_not_found: customer=${customerId}`);
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode === "subscription" && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(s.subscription as string);
          if (subHasOurPrice(sub)) {
            const active = sub.status === "active" || sub.status === "trialing";
            await setPro(
              s.customer as string,
              active,
              sub.current_period_end,
              s.client_reference_id || sub.metadata?.supabase_user_id || null,
            );
          }
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        if (subHasOurPrice(sub)) {
          const active = sub.status === "active" || sub.status === "trialing";
          await setPro(
            sub.customer as string,
            active,
            sub.current_period_end,
            sub.metadata?.supabase_user_id || null,
          );
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
    console.error(`[stripe-webhook] ${event.type}: ${(e as Error).message}`);
    return new Response(`handler_error: ${(e as Error).message}`, { status: 500 });
  }
});
