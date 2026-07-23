'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPendingUpload } from '@/lib/actions/uploads'
import { createArtwork, updateArtwork } from '@/lib/actions/artworks'
import type { ArtworkType, ArtworkStatus } from '@prisma/client'

interface ArtworkFormValues {
  id?: string
  type: ArtworkType
  titleEs: string
  titleEn: string
  techniqueEs: string
  techniqueEn: string
  size: string
  year: string
  price: string
  status: ArtworkStatus
  isPublished: boolean
  imageUrl: string
}

export function ArtworkForm({ initial }: { initial?: ArtworkFormValues }) {
  const router = useRouter()
  const [uploadId, setUploadId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(initial?.imageUrl ?? null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const { uploadId: id, signedUrl } = await createPendingUpload(file.name, file.type, file.size)
      const res = await fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!res.ok) throw new Error('Upload failed')
      setUploadId(id)
      setPreviewUrl(URL.createObjectURL(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(formData: FormData) {
    setSubmitting(true)
    setError(null)
    if (uploadId) formData.set('uploadId', uploadId)
    try {
      if (initial?.id) {
        await updateArtwork(initial.id, formData)
      } else {
        await createArtwork(formData)
      }
      router.push('/admin/artworks')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
      setSubmitting(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-xl">
      {error && <p className="text-brand-accentLight text-sm">{error}</p>}

      <div>
        <label className="block text-sm mb-2">Imagen</label>
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="w-40 aspect-[4/5] object-cover mb-2 border border-brand-border" />
        )}
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} />
        {uploading && <p className="text-xs text-brand-muted mt-1">Subiendo…</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm">Tipo
          <select name="type" defaultValue={initial?.type ?? 'PAINTING'} className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1">
            <option value="PAINTING">Pintura</option>
            <option value="DRAWING">Dibujo</option>
          </select>
        </label>
        <label className="text-sm">Estado
          <select name="status" defaultValue={initial?.status ?? 'AVAILABLE'} className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1">
            <option value="AVAILABLE">Disponible</option>
            <option value="SOLD">Vendida</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm">Título (ES)
          <input name="titleEs" defaultValue={initial?.titleEs} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="text-sm">Título (EN)
          <input name="titleEn" defaultValue={initial?.titleEn} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm">Técnica (ES)
          <input name="techniqueEs" defaultValue={initial?.techniqueEs} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="text-sm">Técnica (EN)
          <input name="techniqueEn" defaultValue={initial?.techniqueEn} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <label className="text-sm">Tamaño
          <input name="size" defaultValue={initial?.size} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="text-sm">Año
          <input name="year" defaultValue={initial?.year} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="text-sm">Precio
          <input name="price" defaultValue={initial?.price} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublished" defaultChecked={initial?.isPublished ?? true} />
        Publicada
      </label>

      <button type="submit" disabled={submitting || uploading} className="px-6 py-3 bg-brand-accent text-sm">
        {submitting ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}
