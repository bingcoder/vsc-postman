export function createId(prefix = 'id'): string {
  const random = globalThis.crypto?.randomUUID?.()
  if (random) return random
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
