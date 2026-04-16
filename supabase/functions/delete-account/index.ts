import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Required Supabase secrets (set in Dashboard -> Edge Functions -> Secrets):
//   SUPABASE_URL            — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — must be set manually; never expose to client

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Verify the caller's JWT using the anon client
  const userToken = authHeader.replace('Bearer ', '');
  const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? serviceRoleKey);
  const { data: { user }, error: userErr } = await anonClient.auth.getUser(userToken);

  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Use the service role client to delete the auth user.
  // All cascade-linked rows (profiles, daily_logs, community_posts, etc.)
  // are removed automatically via ON DELETE CASCADE.
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: deleteErr } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteErr) {
    console.error('[delete-account] deleteUser failed:', deleteErr.message);
    return new Response(JSON.stringify({ error: 'Failed to delete account' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
