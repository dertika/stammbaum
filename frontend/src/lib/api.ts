import type { PersonDetails, TreeResponse, ViewInfo } from '../../../shared/types.ts'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new ApiError(res.status, body.error ?? `Fehler ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const fetchInfo = () => getJson<ViewInfo>('/api/view/info')
export const fetchTree = () => getJson<TreeResponse>('/api/view/tree')
export const fetchPerson = (id: string, signal?: AbortSignal) =>
  getJson<PersonDetails>(`/api/view/person/${encodeURIComponent(id)}`, signal)
