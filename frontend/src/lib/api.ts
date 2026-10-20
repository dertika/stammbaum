import type { TreeResponse } from '../../../shared/types.ts'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new ApiError(res.status, body.error ?? `Fehler ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const fetchTree = () => getJson<TreeResponse>('/api/view/tree')
