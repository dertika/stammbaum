import { mount } from 'svelte'
import './app.css'

const target = document.getElementById('app')!

// Admin-Bereich als eigenes Bundle, damit die Familie es nicht mitlädt
if (location.pathname.startsWith('/admin')) {
  import('./admin/AdminApp.svelte').then(({ default: AdminApp }) => mount(AdminApp, { target }))
} else {
  import('./App.svelte').then(({ default: App }) => mount(App, { target }))
}
