// Apply the saved theme before first paint so there is no flash.
// Kept in its own file so the page's security policy can forbid inline scripts.
try {
  var t = localStorage.getItem('theme') || 'dark'
  if (t === 'system') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  document.documentElement.dataset.theme = t
} catch {}
