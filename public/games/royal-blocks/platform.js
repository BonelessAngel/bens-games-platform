// Kleine, ausfallsichere Anbindung an Statistik und Ranglisten der Plattform.
// Keine dieser Funktionen darf das Spiel blockieren oder Fehler weiterreichen.

const LEVEL_RE = /^[A-Za-z0-9_.-]{1,32}$/;
const DATA_KEY_RE = /^[a-z0-9_]{1,32}$/;
const DATA_ID_RE = /^[a-z0-9_-]{1,32}$/;
const RESULTS = new Set(['win', 'lose', 'abort']);
const RELEASE_RE = /^\d+\.\d+\.\d+$/;
const ACHIEVEMENT_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const integer = (value, max = Number.MAX_SAFE_INTEGER) => Math.min(max, Math.max(0, Math.floor(Number(value) || 0)));

export function platformHosted(version, locationObject = globalThis.location) {
  const host = locationObject?.hostname ?? '';
  return RELEASE_RE.test(version ?? '') && !LOCAL_HOSTS.has(host) && locationObject?.protocol !== 'file:' &&
    (locationObject?.pathname ?? '').startsWith('/games/');
}

export function platformEnabled(version, navigatorObject = globalThis.navigator, locationObject = globalThis.location) {
  return platformHosted(version, locationObject) && navigatorObject?.globalPrivacyControl !== true;
}

export function leaderboardPath(board) {
  return LEVEL_RE.test(board ?? '')
    ? `/ranglisten/?spiel=royal-blocks&liste=${encodeURIComponent(board)}`
    : '/ranglisten/?spiel=royal-blocks';
}

export function randomVisit(cryptoObject = globalThis.crypto, random = Math.random) {
  const bytes = new Uint8Array(16);
  if (cryptoObject?.getRandomValues) cryptoObject.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(random() * 256);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function cleanData(data) {
  const result = {};
  for (const [key, value] of Object.entries(data ?? {}).slice(0, 12)) {
    if (!DATA_KEY_RE.test(key)) continue;
    if (Number.isInteger(value) && value >= 0) result[key] = value;
    else if (typeof value === 'string' && DATA_ID_RE.test(value)) result[key] = value;
  }
  return result;
}

function cleanEvent(event) {
  if (event.type === 'start') return { type: 'start' };
  if (event.type === 'heartbeat') return { type: 'heartbeat', seconds: integer(event.seconds, 600) };
  if (event.type === 'level_start' && LEVEL_RE.test(event.level)) return { type: 'level_start', level: event.level };
  if (event.type !== 'level_end' || !LEVEL_RE.test(event.level) || !RESULTS.has(event.result)) return null;
  const cleaned = {
    type: 'level_end', level: event.level, result: event.result,
    score: integer(event.score, 1_000_000_000), stars: integer(event.stars, 10), seconds: integer(event.seconds),
  };
  const data = cleanData(event.data);
  if (Object.keys(data).length) cleaned.data = data;
  return cleaned;
}

function csrfFrom(account) {
  return account?.csrf_token ?? account?.csrfToken ?? account?.csrf ?? null;
}

export function createPlatformClient({
  app = 'royal-blocks', version, fetchImpl = globalThis.fetch?.bind(globalThis),
  navigatorObject = globalThis.navigator, documentObject = globalThis.document, locationObject = globalThis.location,
  cryptoObject = globalThis.crypto, now = () => globalThis.performance?.now?.() ?? Date.now(),
  setIntervalImpl = globalThis.setInterval?.bind(globalThis), clearIntervalImpl = globalThis.clearInterval?.bind(globalThis),
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis), clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis),
} = {}) {
  const hosted = Boolean(fetchImpl) && platformHosted(version, locationObject);
  const enabled = hosted && navigatorObject?.globalPrivacyControl !== true;
  const visit = randomVisit(cryptoObject);
  const queue = [];
  let started = false;
  let timer = null;
  let visibleAt = null;
  let activeMs = 0;
  let heartbeatMark = 0;
  let level = null;
  let levelStartedAt = 0;
  let accountPromise = null;
  let csrfToken = null;

  async function request(url, options = {}) {
    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    const timeout = controller && setTimeoutImpl ? setTimeoutImpl(() => controller.abort(), 3_000) : null;
    try {
      return await fetchImpl(url, { ...options, signal: controller?.signal });
    } finally {
      if (timeout !== null && clearTimeoutImpl) clearTimeoutImpl(timeout);
    }
  }

  function updateActive() {
    if (visibleAt === null) return;
    const current = now();
    activeMs += Math.max(0, current - visibleAt);
    visibleAt = current;
  }

  function enqueue(event) {
    if (!enabled) return false;
    const cleaned = cleanEvent(event);
    if (!cleaned) return false;
    if (queue.length >= 50) queue.shift();
    queue.push(cleaned);
    return true;
  }

  async function flush({ keepalive = false } = {}) {
    if (!enabled || !queue.length) return null;
    const events = queue.splice(0, 50);
    try {
      return await request('/api/events', {
        method: 'POST', credentials: 'same-origin', keepalive,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app, visit, events }),
      });
    } catch {
      return null;
    }
  }

  function heartbeat({ keepalive = false } = {}) {
    if (!enabled) return Promise.resolve(null);
    updateActive();
    const seconds = Math.min(600, Math.floor((activeMs - heartbeatMark) / 1000));
    if (seconds > 0) {
      enqueue({ type: 'heartbeat', seconds });
      heartbeatMark += seconds * 1000;
    }
    return flush({ keepalive });
  }

  function onVisibilityChange() {
    if (documentObject?.visibilityState === 'hidden') {
      updateActive();
      visibleAt = null;
      void heartbeat({ keepalive: true });
    } else if (visibleAt === null) {
      visibleAt = now();
    }
  }

  function start() {
    if (!enabled || started) return false;
    started = true;
    visibleAt = documentObject?.visibilityState === 'hidden' ? null : now();
    enqueue({ type: 'start' });
    documentObject?.addEventListener?.('visibilitychange', onVisibilityChange);
    if (setIntervalImpl) timer = setIntervalImpl(() => void heartbeat(), 60_000);
    return true;
  }

  function beginLevel(nextLevel) {
    if (!enabled || !LEVEL_RE.test(nextLevel)) return false;
    updateActive();
    level = nextLevel;
    levelStartedAt = activeMs;
    return enqueue({ type: 'level_start', level });
  }

  function endLevel({ result, score = 0, stars = 0, data = {} } = {}) {
    if (!enabled || !level || !RESULTS.has(result)) return false;
    updateActive();
    const endedLevel = level;
    level = null;
    return enqueue({
      type: 'level_end', level: endedLevel, result, score, stars,
      seconds: Math.floor((activeMs - levelStartedAt) / 1000), data,
    });
  }

  async function prepareAccount() {
    if (!hosted) return null;
    if (!accountPromise) accountPromise = (async () => {
      try {
        const response = await request('/api/account/me', { credentials: 'same-origin' });
        if (!response?.ok) return null;
        const account = await response.json();
        csrfToken = csrfFrom(account);
        return csrfToken ? account : null;
      } catch {
        return null;
      }
    })();
    const account = await accountPromise;
    if (!csrfToken) accountPromise = null; // Anmeldung kann sich während einer langen Runde ändern.
    return account;
  }

  async function fetchHub() {
    if (!hosted) return null;
    try {
      const response = await request(`/api/games/${encodeURIComponent(app)}/hub`, { credentials: 'same-origin' });
      return response?.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }

  async function loadCloudSave() {
    if (!hosted || !(await prepareAccount())) return null;
    try {
      const response = await request(`/api/games/${encodeURIComponent(app)}/save`, { credentials: 'same-origin' });
      return response?.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }

  async function putCloudSave(data, t, achievements = [], { keepalive = false } = {}) {
    if (!hosted || typeof data !== 'string' || data.length > 512_000 || !(await prepareAccount())) return null;
    const ids = [...new Set(achievements.filter((id) => typeof id === 'string' && ACHIEVEMENT_RE.test(id)))];
    try {
      const response = await request(`/api/games/${encodeURIComponent(app)}/save/put`, {
        method: 'POST', credentials: 'same-origin', keepalive,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ data, t: integer(t), achievements: ids }),
      });
      const body = await response?.json?.().catch(() => null);
      if (response?.ok) return { ok: true, ...body };
      if (response?.status === 409 && body?.save) return { ok: false, conflict: true, ...body };
      return null;
    } catch {
      return null;
    }
  }

  async function submitScore(board, score, { keepalive = false } = {}) {
    if (!enabled || !LEVEL_RE.test(board)) return null;
    if (!csrfToken && !keepalive) await prepareAccount();
    if (!csrfToken) return null;
    try {
      const response = await request(`/api/games/${encodeURIComponent(app)}/scores`, {
        method: 'POST', credentials: 'same-origin', keepalive,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ board, score: integer(score, 1_000_000_000) }),
      });
      return response?.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }

  // Fehlermeldungen an die Zentrale (docs/spiele-anbindung.md der Webseite, Abschnitt 7):
  // nur auf der Plattform per https, ohne GPC, gleiche Fehler einmal, höchstens 5 pro Besuch, keine Spieler- oder Spielstanddaten.
  const reportedErrors = new Set();
  const text = (value, max) => String(value ?? '').slice(0, max);
  function reportError({ message, source = '', line = 0, col = 0, stack = '' } = {}) {
    if (!enabled || locationObject?.protocol !== 'https:' || reportedErrors.size >= 5) return false;
    const key = `${text(message, 120)}|${integer(line)}`;
    if (reportedErrors.has(key)) return false;
    reportedErrors.add(key);
    try {
      void Promise.resolve(fetchImpl('/api/errors', {
        method: 'POST', credentials: 'same-origin', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app, message: text(message || 'Unbekannter Fehler', 300), source: text(source, 300),
          line: integer(line), col: integer(col), stack: text(stack, 3000),
        }),
      })).catch(() => {});
    } catch {
      // Melden darf nie selbst einen Fehler auslösen.
    }
    return true;
  }

  function watchErrors(target = globalThis) {
    if (!enabled || typeof target?.addEventListener !== 'function') return false;
    target.addEventListener('error', (event) => {
      if (event?.message) reportError({ message: event.message, source: event.filename, line: event.lineno, col: event.colno, stack: event.error?.stack });
    });
    target.addEventListener('unhandledrejection', (event) => {
      const reason = event?.reason;
      reportError({ message: reason?.message ?? String(reason), stack: reason?.stack });
    });
    return true;
  }

  function stop() {
    if (timer !== null && clearIntervalImpl) clearIntervalImpl(timer);
    documentObject?.removeEventListener?.('visibilitychange', onVisibilityChange);
    timer = null;
  }

  return {
    hosted, enabled, visit, start, stop, beginLevel, endLevel, heartbeat, flush, fetchHub, prepareAccount,
    loadCloudSave, putCloudSave, submitScore, reportError, watchErrors,
    pending: () => queue.map((event) => ({ ...event })),
  };
}
