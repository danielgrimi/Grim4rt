import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
})

export const uploadRequestSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024, 'File must be 10MB or smaller'),
})

export const artworkFormSchema = z.object({
  type: z.enum(['PAINTING', 'DRAWING']),
  titleEs: z.string().min(1),
  titleEn: z.string().min(1),
  techniqueEs: z.string().min(1),
  techniqueEn: z.string().min(1),
  size: z.string().min(1),
  year: z.string().min(1),
  price: z.string().min(1),
  status: z.enum(['AVAILABLE', 'SOLD']),
  isPublished: z.boolean(),
  uploadId: z.string().optional(),
})

export const collectionFormSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case'),
  nameEs: z.string().min(1),
  nameEn: z.string().min(1),
})
