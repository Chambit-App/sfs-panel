import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) return jsonResponse({ error: 'Unauthorized' }, 401)

    const { data: callerProfile } = await callerClient
      .from('user_profiles')
      .select('is_super_admin')
      .eq('id', caller.id)
      .single()

    if (!callerProfile?.is_super_admin) {
      return jsonResponse({ error: 'Forbidden: Super admin only' }, 403)
    }

    const body = await req.json()
    const { user_id, profile, password } = body as {
      user_id?: string
      profile?: {
        full_name?: string
        role?: string
        firm_id?: string | null
        tenant_id?: string | null
        is_active?: boolean
        is_super_admin?: boolean
      }
      password?: string
    }

    if (!user_id) return jsonResponse({ error: 'user_id zorunlu.' }, 400)

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Last super admin guard: cannot strip the only remaining super admin
    if (profile?.is_super_admin === false) {
      const { count } = await adminClient
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('is_super_admin', true)
        .neq('id', user_id)
      if ((count ?? 0) === 0) {
        return jsonResponse({ error: 'Son süper admin yetkisi kaldırılamaz.' }, 400)
      }
    }

    // Profile update (only if there is at least one field)
    if (profile && Object.keys(profile).length > 0) {
      const allowed: Record<string, unknown> = {}
      const fields: (keyof typeof profile)[] = [
        'full_name', 'role', 'firm_id', 'tenant_id', 'is_active', 'is_super_admin',
      ]
      for (const f of fields) {
        if (profile[f] !== undefined) allowed[f] = profile[f]
      }
      if (Object.keys(allowed).length > 0) {
        const { error } = await adminClient
          .from('user_profiles')
          .update(allowed)
          .eq('id', user_id)
        if (error) return jsonResponse({ error: error.message }, 400)
      }
    }

    // Password update (writes to auth.users via admin API, handles bcrypt cost)
    if (password) {
      if (typeof password !== 'string' || password.length < 6) {
        return jsonResponse({ error: 'Şifre en az 6 karakter olmalıdır.' }, 400)
      }
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { password })
      if (error) return jsonResponse({ error: error.message }, 400)
    }

    return jsonResponse({ success: true }, 200)
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
