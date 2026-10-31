import type { KnownLink, PersonDetails, Presentation, TreeResponse, ViewInfo } from '../../../shared/types.ts'

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

/** Ändernde Anfrage als JSON (der Server verlangt das als CSRF-Schutz) */
async function send(method: 'POST' | 'DELETE', path: string): Promise<void> {
  const res = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new ApiError(res.status, body.error ?? `Fehler ${res.status}`)
  }
}

export const fetchInfo = () => getJson<ViewInfo>('/api/view/info')
export const fetchTree = () => getJson<TreeResponse>('/api/view/tree')
export const fetchPerson = (id: string, signal?: AbortSignal) =>
  getJson<PersonDetails>(`/api/view/person/${encodeURIComponent(id)}`, signal)
export const fetchPresentation = (id: string) => getJson<Presentation>(`/api/view/presentations/${encodeURIComponent(id)}`)
export const fetchKnownLinks = () => getJson<KnownLink[]>('/api/view/links')
export const openKnownLink = (id: string) => send('POST', `/api/view/links/${encodeURIComponent(id)}/open`)
export const forgetKnownLink = (id: string) => send('DELETE', `/api/view/links/${encodeURIComponent(id)}`)
export const endPreview = () => send('DELETE', '/api/view/preview')
