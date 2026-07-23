import { logoutAction } from '@/lib/actions/auth-actions'

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="text-sm text-brand-muted hover:text-brand-text transition-colors">
        Cerrar sesión
      </button>
    </form>
  )
}
