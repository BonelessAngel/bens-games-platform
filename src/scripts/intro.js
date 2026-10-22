// Kurze Einführung beim ersten Besuch: Spiele als App installieren, Vorteile eines Kontos.
// Ob sie schon gezeigt wurde, merkt sich nur dieser Browser (localStorage); über „So funktioniert’s“ jederzeit erneut.
import { userReady } from './nav.js';

const SEEN_KEY = 'bg-intro-v1';

function seen() {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // ohne Speicher lieber nicht bei jedem Besuch zeigen
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // egal
  }
}

/** Welches Gerät? Bestimmt, welche Installationsanleitung zuerst erscheint. */
export function detectDevice(userAgent = navigator.userAgent, maxTouchPoints = navigator.maxTouchPoints ?? 0) {
  if (/iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1) || /iPad/.test(userAgent)) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'desktop';
}

const INSTALL = {
  ios: {
    title: 'iPhone und iPad (Safari)',
    steps: [
      'Spiel in <strong>Safari</strong> öffnen.',
      'Unten (iPad: oben) auf das <strong>Teilen-Symbol</strong> tippen – das Quadrat mit dem Pfeil nach oben.',
      'Nach unten scrollen und <strong>„Zum Home-Bildschirm“</strong> wählen.',
      'Rechts oben auf <strong>„Hinzufügen“</strong> tippen.',
    ],
  },
  android: {
    title: 'Android (Chrome)',
    steps: [
      'Spiel in <strong>Chrome</strong> öffnen.',
      'Oben rechts auf das <strong>Menü ⋮</strong> tippen.',
      '<strong>„App installieren“</strong> bzw. <strong>„Zum Startbildschirm hinzufügen“</strong> wählen.',
      'Mit <strong>„Installieren“</strong> bestätigen.',
    ],
  },
  desktop: {
    title: 'PC und Mac (Chrome oder Edge)',
    steps: [
      'Spiel im Browser öffnen.',
      'Rechts in der Adresszeile auf das <strong>Installieren-Symbol</strong> klicken (Bildschirm mit Pfeil).',
      'Mit <strong>„Installieren“</strong> bestätigen – das Spiel startet dann wie ein Programm.',
    ],
  },
};

function installHtml(device) {
  const order = [device, ...Object.keys(INSTALL).filter((d) => d !== device)];
  return order.map((key, index) => `
    <details class="intro__device"${index === 0 ? ' open' : ''}>
      <summary>${INSTALL[key].title}${index === 0 ? ' <span class="badge">dein Gerät</span>' : ''}</summary>
      <ol>${INSTALL[key].steps.map((step) => `<li>${step}</li>`).join('')}</ol>
    </details>`).join('');
}

function buildSteps(user) {
  const steps = [
    {
      title: 'Willkommen bei Bens Games',
      html: `<p>Hier spielst du alle Spiele von Ben direkt im Browser – kostenlos, ohne Download und ohne Werbung.</p>
        <p>In drei kurzen Schritten zeigen wir dir, wie du am meisten davon hast.</p>`,
    },
    {
      title: 'Als App auf den Home-Bildschirm',
      html: `<p>Jedes Spiel lässt sich wie eine App installieren: eigenes Symbol, Vollbild und auch offline spielbar.
        Das geht <strong>pro Spiel</strong> – öffne dazu zuerst das Spiel.</p>${installHtml(detectDevice())}`,
    },
  ];
  if (!user) {
    steps.push({
      title: 'Mit Konto geht noch mehr',
      html: `<ul class="intro__benefits">
          <li><strong>Spielstand auf allen Geräten</strong> – am Handy weiterspielen, wo du am PC aufgehört hast.</li>
          <li><strong>Ranglisten</strong> – vergleiche dich jede Woche mit anderen.</li>
          <li><strong>Deine Statistik</strong> – Spielzeit und Bestwerte auf einen Blick.</li>
        </ul>
        <p class="intro__small">Ein Konto ist freiwillig und kostenlos. Ohne Konto bleibt dein Spielstand nur auf diesem Gerät.</p>`,
      actions: '<a class="button" href="/konto/registrieren/">Konto erstellen</a><a class="button button--secondary" href="/konto/anmelden/">Anmelden</a>',
    });
  }
  return steps;
}

let dialog;

export async function openIntro() {
  const user = await userReady;
  const steps = buildSteps(user);
  let index = 0;

  dialog?.remove();
  dialog = document.createElement('dialog');
  dialog.className = 'intro';
  dialog.setAttribute('aria-labelledby', 'intro-title');
  document.body.append(dialog);

  const render = () => {
    const step = steps[index];
    const last = index === steps.length - 1;
    dialog.innerHTML = `
      <button class="intro__close" type="button" aria-label="Schließen" data-intro-close>×</button>
      <p class="intro__progress">Schritt ${index + 1} von ${steps.length}</p>
      <h2 id="intro-title">${step.title}</h2>
      <div class="intro__body">${step.html}</div>
      <div class="intro__actions">
        ${step.actions ?? ''}
        ${index > 0 ? '<button class="button button--secondary" type="button" data-intro-back>Zurück</button>' : ''}
        <button class="button${step.actions ? ' button--secondary' : ''}" type="button" data-intro-next>${last ? (step.actions ? 'Später' : 'Los geht’s') : 'Weiter'}</button>
      </div>`;
    dialog.querySelector('[data-intro-close]').onclick = close;
    dialog.querySelector('[data-intro-next]').onclick = () => (last ? close() : (index++, render()));
    const back = dialog.querySelector('[data-intro-back]');
    if (back) back.onclick = () => { index--; render(); };
    for (const link of dialog.querySelectorAll('a')) link.addEventListener('click', markSeen);
  };

  const close = () => {
    markSeen();
    dialog.close();
  };

  dialog.addEventListener('cancel', markSeen);
  render();
  dialog.showModal();
}

for (const button of document.querySelectorAll('[data-open-intro]')) {
  button.addEventListener('click', () => openIntro());
}

if (!seen()) {
  // Erst zeigen, wenn die Seite steht – nicht mitten ins Laden hinein.
  window.setTimeout(openIntro, 400);
}
