'use client'

import { useActionState } from 'react'
import { login, type LoginState } from '@/lib/actions/auth-actions'

const initialState: LoginState = { error: null }

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, initialState)

  return (
    <form action={formAction} className="w-full max-w-sm space-y-4">
      <label className="block text-sm">
        Email
        <input
          type="email"
          name="email"
          required
          autoFocus
          autoComplete="username"
          className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1 text-brand-text"
        />
      </label>
      <label className="block text-sm">
        Contraseña
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1 text-brand-text"
        />
      </label>
      {state.error && <p className="text-brand-accentLight text-sm">{state.error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-2 bg-brand-accent text-brand-text text-sm disabled:opacity-50"
      >
        {isPending ? 'Verificando…' : 'Entrar'}
      </button>
    </form>
  )
}
