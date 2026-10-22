// Umschalter Auto → Hell → Dunkel in der Kopfzeile. Die Wahl merkt sich nur dieser Browser (localStorage „bg-theme“).
const KEY = 'bg-theme';
const ORDER = ['auto', 'light', 'dark'];
const LABELS = { auto: 'Farbschema: automatisch', light: 'Farbschema: hell', dark: 'Farbschema: dunkel' };
const ICONS = { auto: '◐', light: '☀', dark: '☾' };

function stored() {
  try {
    const value = localStorage.getItem(KEY);
    return ORDER.includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

function apply(theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // ohne Speicher gilt die Wahl nur für diese Seite
  }
}

export function setupThemeToggle() {
  const nav = document.querySelector('.site-header nav');
  if (!nav || nav.querySelector('.theme-toggle')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-toggle';
  const render = (theme) => {
    button.textContent = ICONS[theme];
    button.title = `${LABELS[theme]} – klicken zum Wechseln`;
    button.setAttribute('aria-label', button.title);
  };
  let theme = stored();
  render(theme);
  button.addEventListener('click', () => {
    theme = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    apply(theme);
    render(theme);
  });
  nav.append(button);
}

setupThemeToggle();
