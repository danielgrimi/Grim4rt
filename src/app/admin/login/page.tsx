import { LoginForm } from '@/components/admin/LoginForm'

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen bg-brand-black text-brand-text flex flex-col items-center justify-center px-6">
      <h1 className="font-display text-3xl mb-8">Grim4rt Admin</h1>
      <LoginForm />
    </div>
  )
}
