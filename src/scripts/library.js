// Bibliothek: Die Seite enthält schon die öffentlichen Apps (beim Build erzeugt).
// Wo Konten aktiv sind, wird die Liste durch die passende Liste für den angemeldeten Nutzer ersetzt –
// inklusive Beta- und freigegebener Apps.
import { renderLibrary } from '../../lib/library.js';
import './nav.js';
import './intro.js';

const container = document.querySelector('[data-library]');

if (container && document.querySelector('meta[name="bg-accounts"]')) {
  fetch('/api/apps', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (Array.isArray(data?.apps)) container.innerHTML = renderLibrary(data.apps, { filter: false });
    })
    .catch(() => {
      // Ohne API bleibt die beim Build erzeugte Liste stehen.
    });
}
