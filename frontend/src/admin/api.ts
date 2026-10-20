import type { AdminInfo, AdminStatus, DetailSettings, ShareLink, ShareLinkInput } from '../../../shared/types.ts'

export class AdminError extends Error {}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    location.href = `/auth/login?returnTo=${encodeURIComponent(location.pathname)}`
    throw new AdminError('Anmeldung erforderlich')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new AdminError((data as { error?: string }).error ?? `Fehler ${res.status}`)
  return data as T
}

export const admin = {
  me: () => request<AdminInfo>('GET', '/api/admin/me'),
  status: () => request<AdminStatus>('GET', '/api/admin/status'),
  refresh: () => request<AdminStatus>('POST', '/api/admin/refresh', {}),
  settings: () => request<{ details: DetailSettings }>('GET', '/api/admin/settings'),
  saveSettings: (details: DetailSettings) => request<{ details: DetailSettings }>('PUT', '/api/admin/settings', { details }),
  links: () => request<ShareLink[]>('GET', '/api/admin/links'),
  createLink: (input: ShareLinkInput) => request<ShareLink>('POST', '/api/admin/links', input),
  updateLink: (id: string, input: ShareLinkInput) => request<ShareLink>('PUT', `/api/admin/links/${id}`, input),
  revokeLink: (id: string, revoked: boolean) => request<ShareLink>('POST', `/api/admin/links/${id}/revoke`, { revoked }),
  deleteLink: (id: string) => request<{ ok: true }>('DELETE', `/api/admin/links/${id}`, {}),
  logout: () => request<{ ok: true }>('POST', '/auth/logout', {}),
}

export function formatDateTime(iso: string | null, withTime = false): string {
  if (!iso) return '–'
  const d = new Date(iso)
  return withTime
    ? d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString('de-DE', { dateStyle: 'medium' })
}
