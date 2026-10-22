// Kleine, ausfallsichere Anbindung an Statistik und Ranglisten der Plattform.
// Keine dieser Funktionen darf das Spiel blockieren oder Fehler weiterreichen.

const LEVEL_RE = /^[A-Za-z0-9_.-]{1,32}$/;
const DATA_KEY_RE = /^[a-z0-9_]{1,32}$/;
const DATA_ID_RE = /^[a-z0-9_-]{1,32}$/;
const RESULTS = new Set(['win', 'lose', 'abort']);
const RELEASE_RE = /^\d+\.\d+\.\d+$/;

const integer = (value, max = Number.MAX_SAFE_INTEGER) => Math.min(max, Math.max(0, Math.floor(Number(value) || 0)));

export function platformEnabled(version, navigatorObject = globalThis.navigator, locationObject = globalThis.location) {
  const host = locationObject?.hostname ?? '';
  return RELEASE_RE.test(version ?? '') && navigatorObject?.globalPrivacyControl !== true &&
    host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
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
} = {}) {
  const enabled = Boolean(fetchImpl) && platformEnabled(version, navigatorObject, locationObject);
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
      return await fetchImpl('/api/events', {
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
    if (!enabled) return null;
    if (!accountPromise) accountPromise = (async () => {
      try {
        const response = await fetchImpl('/api/account/me', { credentials: 'same-origin' });
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

  async function submitScore(board, score, { keepalive = false } = {}) {
    if (!enabled || !LEVEL_RE.test(board)) return null;
    if (!csrfToken && !keepalive) await prepareAccount();
    if (!csrfToken) return null;
    try {
      const response = await fetchImpl(`/api/games/${encodeURIComponent(app)}/scores`, {
        method: 'POST', credentials: 'same-origin', keepalive,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ board, score: integer(score, 1_000_000_000) }),
      });
      return response?.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }

  function stop() {
    if (timer !== null && clearIntervalImpl) clearIntervalImpl(timer);
    documentObject?.removeEventListener?.('visibilitychange', onVisibilityChange);
    timer = null;
  }

  return {
    enabled, visit, start, stop, beginLevel, endLevel, heartbeat, flush, prepareAccount, submitScore,
    pending: () => queue.map((event) => ({ ...event })),
  };
}
