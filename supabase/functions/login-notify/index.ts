// Supabase Edge Function: login-notify
// Sends an email to the user when a new login is detected.
//
// Deploy with:  supabase functions deploy login-notify
// Required env secret (set in Supabase dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY  — get a free key at https://resend.com
//   RESEND_FROM     — verified sender address, e.g. "KaloriFit <no-reply@kalorifit.no>"
//
// If RESEND_API_KEY is not set the function exits silently (logins still work).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      // Not configured — skip silently
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fromAddr = Deno.env.get('RESEND_FROM') ?? 'KaloriFit <no-reply@kalorifit.no>';

    const now = new Date();
    const dateStr = now.toLocaleString('nb-NO', {
      timeZone: 'Europe/Oslo',
      dateStyle: 'full',
      timeStyle: 'short',
    });

    // Parse a human-readable device hint from the user-agent
    const ua = req.headers.get('user-agent') ?? '';
    let deviceHint = 'ukjent enhet';
    if (/iPhone|iPad/.test(ua)) deviceHint = 'iPhone / iPad';
    else if (/Android/.test(ua)) deviceHint = 'Android';
    else if (/Windows/.test(ua)) deviceHint = 'Windows PC';
    else if (/Mac/.test(ua)) deviceHint = 'Mac';
    else if (/Linux/.test(ua)) deviceHint = 'Linux';

    const html = `
<!DOCTYPE html>
<html lang="nb">
<body style="font-family:sans-serif;background:#f4f4f5;margin:0;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);border-radius:12px;padding:12px 16px;">
        <span style="font-size:28px;">🔥</span>
      </div>
      <h1 style="margin:12px 0 4px;font-size:20px;color:#18181b;">KaloriFit</h1>
    </div>
    <h2 style="font-size:16px;color:#18181b;margin:0 0 8px;">Ny innlogging på kontoen din</h2>
    <p style="color:#52525b;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Vi varsler deg om at det akkurat ble logget inn på KaloriFit-kontoen din.
    </p>
    <div style="background:#f4f4f5;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:13px;color:#71717a;">Tidspunkt</p>
      <p style="margin:0;font-size:14px;font-weight:600;color:#18181b;">${dateStr}</p>
      <p style="margin:12px 0 6px;font-size:13px;color:#71717a;">Enhet</p>
      <p style="margin:0;font-size:14px;font-weight:600;color:#18181b;">${deviceHint}</p>
    </div>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#dc2626;line-height:1.5;">
        <strong>Var det ikke deg?</strong> Bytt passord umiddelbart og kontakt oss på
        <a href="mailto:support@kalorifit.no" style="color:#dc2626;">support@kalorifit.no</a>.
      </p>
    </div>
    <p style="margin:0;font-size:12px;color:#a1a1aa;text-align:center;">
      Dette er en automatisk sikkerhetsmelding fra KaloriFit.
    </p>
  </div>
</body>
</html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddr,
        to: user.email,
        subject: 'Ny innlogging på KaloriFit-kontoen din',
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('Resend error:', res.status, body);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('login-notify error:', err);
    return new Response('Internal error', { status: 500, headers: corsHeaders });
  }
});
