import { createCollection } from '@/lib/actions/collections'

export default function NewCollectionPage() {
  return (
    <div>
      <h1 className="font-display text-3xl mb-8">Nueva colección</h1>
      <form action={createCollection} className="space-y-6 max-w-md">
        <label className="block text-sm">Slug
          <input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="figura-humana" className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="block text-sm">Nombre (ES)
          <input name="nameEs" required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="block text-sm">Nombre (EN)
          <input name="nameEn" required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <button type="submit" className="px-6 py-3 bg-brand-accent text-sm">Crear</button>
      </form>
    </div>
  )
}
