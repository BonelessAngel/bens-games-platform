// Teilen-Knopf: auf Handys das System-Menü (Web Share API), sonst wird der Link kopiert.

export async function share({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text ? `${text} ${url}` : url);
    return 'copied';
  } catch {
    window.prompt('Link zum Kopieren:', url);
    return 'prompted';
  }
}

/** Knopf, der beim Klick die Daten von getData() teilt. */
export function shareButton(getData, label = 'Teilen') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button--secondary button--small share-button';
  button.textContent = `↗ ${label}`;
  button.addEventListener('click', async () => {
    const result = await share(getData());
    if (result === 'copied') {
      button.textContent = '✓ Link kopiert';
      setTimeout(() => { button.textContent = `↗ ${label}`; }, 2000);
    }
  });
  return button;
}
