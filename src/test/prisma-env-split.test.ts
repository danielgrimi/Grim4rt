import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

describe('runtime vs. migration connection-string split', () => {
  it('src/lib/prisma.ts never references DIRECT_URL', () => {
    const source = readFileSync('src/lib/prisma.ts', 'utf-8')
    expect(source).not.toContain('DIRECT_URL')
  })

  it('prisma.config.ts never references DATABASE_URL', () => {
    const source = readFileSync('prisma.config.ts', 'utf-8')
    expect(source).not.toContain('DATABASE_URL')
  })
})
