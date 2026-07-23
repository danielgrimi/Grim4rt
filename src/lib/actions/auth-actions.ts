'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loginSchema } from '@/lib/validation'

export interface LoginState {
  error: string | null
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: 'Credenciales inválidas.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)

  // Same generic message whether Supabase rejected the credentials or the
  // account authenticated fine but isn't the admin account — no signal to
  // an attacker about which case they hit.
  if (error || !data.user) {
    return { error: 'Credenciales inválidas.' }
  }
  if (data.user.id !== process.env.ADMIN_USER_ID) {
    await supabase.auth.signOut()
    return { error: 'Credenciales inválidas.' }
  }

  redirect('/admin')
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/admin/login')
}
