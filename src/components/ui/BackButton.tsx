import Link from 'next/link'

export function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-sm text-brand-muted hover:text-brand-text transition-colors"
    >
      ← {label}
    </Link>
  )
}
