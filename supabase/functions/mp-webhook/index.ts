import { serve } from "std/http/server.ts"
import { createClient } from "@supabase/supabase-js"

serve(async (req: Request) => {
    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const payload = await req.json()
        const { type, data } = payload

        // Only handle payment notifications
        if (type === 'payment' && data.id) {
            // 1. Fetch payment details from Mercado Pago (to verify status)
            // Note: In production you MUST verify the signature or fetch status from MP API.
            // For this MVP, we might trust the payload status or mock it.
            // Assuming we get status in notification (often we don't, we just get ID).

            // Let's assume we fetch it (mocked logic here for brevity or future implementation)
            // const mpPayment = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, ...)

            // 2. Parse external_reference: "company_id|plan_id"
            // const [companyId, planId] = mpPayment.external_reference.split('|')

            // 3. Update subscription

            // Example logging
            console.log('Payment received:', data.id)

            // Store event for audit
            await supabase.from('mp_webhook_events').insert({
                event_id: data.id,
                payload: payload,
                processed: false // Process async or now
            })

            // TODO: Implement actual update logic once MP integration is live
            // For now, we just log it.
        }

        return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
        })
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        })
    }
})
