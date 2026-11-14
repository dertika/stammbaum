// Farbschema: „auto“ folgt der Geräteeinstellung, „light“/„dark“ legen es fest.
// Die Farben selbst stehen in app.css (light-dark()), hier wird nur color-scheme gesteuert.
export type ThemeMode = 'auto' | 'light' | 'dark'

const KEY = 'sb_theme'
const ORDER: ThemeMode[] = ['auto', 'light', 'dark']
const LABELS: Record<ThemeMode, string> = { auto: 'Auto', light: 'Hell', dark: 'Dunkel' }
const THEME_COLOR = { light: '#f6f3ee', dark: '#1b1d22' }

function load(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

function apply(mode: ThemeMode) {
  const root = document.documentElement
  if (mode === 'auto') root.removeAttribute('data-theme')
  else root.dataset.theme = mode
  const dark = mode === 'dark' || (mode === 'auto' && !!darkQuery?.matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light)
}

class Theme {
  mode = $state<ThemeMode>(load())
  get label() { return LABELS[this.mode] }
  get title() { return `Farbschema: ${LABELS[this.mode]} – klicken zum Wechseln` }

  constructor() {
    apply(this.mode)
    darkQuery?.addEventListener('change', () => { if (this.mode === 'auto') apply('auto') })
  }

  cycle() {
    this.mode = ORDER[(ORDER.indexOf(this.mode) + 1) % ORDER.length]
    apply(this.mode)
    try {
      if (this.mode === 'auto') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, this.mode)
    } catch { /* Speicher gesperrt: Wahl gilt nur für diese Sitzung */ }
  }
}

export const theme = new Theme()
