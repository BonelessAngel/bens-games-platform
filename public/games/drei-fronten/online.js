// Online-Duelle: Räume-Schnittstelle der Webseite (AUFTRAG-MULTIPLAYER.md, Abschnitt C) und Hilfen für die Spielansicht.
//
// Der Server ist nur ein „Briefkasten“ für Aktionen. Beide Geräte rechnen mit denselben Regeln, demselben Startwert (seed)
// und denselben Aktionen in derselben Reihenfolge – und kommen so zum selben Spielstand.
// Auf bens-games.de spricht ApiTransport mit /api/games/drei-fronten/rooms/…, sonst simuliert LocalTransport den Server
// im Browser (localStorage), damit man mit zwei Fenstern lokal testen kann.

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOCAL_KEY = 'drei-fronten:lokale-raeume';
const ONLINE_MS = 15_000;

export class RoomError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const randomText = (chars, length, random = Math.random) => Array.from({ length }, () => chars[Math.floor(random() * chars.length)]).join('');

// ---------- Lokaler Ersatz-Server (nur zum Testen ohne Webseite) ----------

export function createLocalTransport({ storage = globalThis.localStorage, now = () => Date.now(), random = Math.random } = {}) {
  let session = null; // { code, seat, token }

  const load = () => {
    try { return JSON.parse(storage.getItem(LOCAL_KEY) ?? '{}') ?? {}; } catch { return {}; }
  };
  const persist = (rooms) => {
    // Alte Räume (über 24 h) aufräumen.
    for (const [code, room] of Object.entries(rooms)) if (now() - room.updated > 86_400_000) delete rooms[code];
    storage.setItem(LOCAL_KEY, JSON.stringify(rooms));
  };
  const publicRoom = (room) => ({
    code: room.code, status: room.status, mode: room.mode, visibility: room.visibility, max_players: room.max_players,
    host_seat: room.host_seat, seed: room.status === 'waiting' ? null : room.seed, settings: room.settings,
    players: room.players.map(({ seat, name, ready, left, seen }) => ({
      seat, name, avatar_url: null, account: false, online: now() - seen < ONLINE_MS, ready, left,
    })),
  });
  const guest = () => `Gast ${1000 + Math.floor(random() * 9000)}`;
  const mine = (rooms) => {
    const room = session && rooms[session.code];
    if (!room) throw new RoomError(404, 'room_not_found');
    if (room.tokens[session.seat] !== session.token) throw new RoomError(403, 'not_in_room');
    return room;
  };
  const enter = (rooms, room) => {
    const active = room.players.filter((player) => !player.left);
    if (room.status !== 'waiting') throw new RoomError(409, 'already_started');
    if (active.length >= room.max_players) throw new RoomError(409, 'room_full');
    const seat = room.players.length;
    const token = randomText('abcdef0123456789', 32, random);
    room.players.push({ seat, name: guest(), ready: false, left: false, seen: now() });
    room.tokens[seat] = token;
    room.updated = now();
    persist(rooms);
    session = { code: room.code, seat, token };
    return { room: publicRoom(room), you: { seat, token } };
  };

  return {
    kind: 'lokal',
    session: () => session,
    resume(saved) { session = saved; },
    async create({ max_players = 2, visibility = 'private', mode = 'duell', settings = {} } = {}) {
      const rooms = load();
      let code;
      do code = randomText(CODE_CHARS, 6, random); while (rooms[code]);
      rooms[code] = {
        code, status: 'waiting', mode, visibility, max_players, host_seat: 0, seed: null, settings,
        players: [], tokens: {}, actions: [], updated: now(),
      };
      return enter(rooms, rooms[code]);
    },
    async join(code) {
      const rooms = load();
      const room = rooms[String(code ?? '').toUpperCase()];
      if (!room) throw new RoomError(404, 'room_not_found');
      return enter(rooms, room);
    },
    async quick({ mode = 'duell', max_players = 2 } = {}) {
      const rooms = load();
      const open = Object.values(rooms).find((room) => room.visibility === 'public' && room.status === 'waiting' &&
        room.mode === mode && room.players.filter((player) => !player.left).length < room.max_players &&
        room.players.some((player) => !player.left && now() - player.seen < ONLINE_MS));
      return open ? enter(rooms, open) : this.create({ max_players, visibility: 'public', mode });
    },
    async poll(after = 0) {
      const rooms = load();
      const room = mine(rooms);
      room.players[session.seat].seen = now();
      persist(rooms);
      const actions = room.actions.filter((action) => action.seq > after).slice(0, 200);
      return { room: publicRoom(room), actions, last_seq: room.actions.length };
    },
    async start() {
      const rooms = load();
      const room = mine(rooms);
      if (room.host_seat !== session.seat) throw new RoomError(403, 'not_host');
      if (room.status !== 'waiting') throw new RoomError(409, 'already_started');
      room.status = 'playing';
      room.seed = Math.floor(random() * 2 ** 31);
      room.updated = now();
      persist(rooms);
      return { room: publicRoom(room) };
    },
    async action(data) {
      const rooms = load();
      const room = mine(rooms);
      const seq = room.actions.length + 1;
      room.actions.push({ seq, seat: session.seat, data, at: new Date(now()).toISOString() });
      room.updated = now();
      persist(rooms);
      return { seq };
    },
    async finish() {
      const rooms = load();
      const room = mine(rooms);
      room.status = 'finished';
      persist(rooms);
      return { ok: true };
    },
    async leave() {
      const rooms = load();
      const room = session && rooms[session.code];
      if (room) {
        if (room.status === 'waiting') room.players = room.players.filter((player) => player.seat !== session.seat);
        else if (room.players[session.seat]) room.players[session.seat].left = true;
        if (!room.players.some((player) => !player.left)) delete rooms[room.code];
        else if (room.host_seat === session.seat) room.host_seat = room.players.find((player) => !player.left).seat;
        persist(rooms);
      }
      session = null;
      return { ok: true };
    },
  };
}

// ---------- Echte Räume auf bens-games.de ----------

export function createApiTransport({ app = 'drei-fronten', fetchImpl = globalThis.fetch?.bind(globalThis), getCsrf = async () => null } = {}) {
  let session = null;
  const base = `/api/games/${encodeURIComponent(app)}/rooms/`;

  async function request(path, { method = 'GET', body } = {}) {
    const headers = {};
    if (session?.token) headers['X-Room-Token'] = session.token;
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
      const csrf = await getCsrf();
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }
    const response = await fetchImpl(base + path, { method, credentials: 'same-origin', headers, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new RoomError(response.status, data?.error ?? 'error');
    return data;
  }
  const remember = (result) => {
    if (result?.you?.token) session = { code: result.room.code, seat: result.you.seat, token: result.you.token };
    return result;
  };

  return {
    kind: 'api',
    session: () => session,
    resume(saved) { session = saved; },
    create: async (options) => remember(await request('create', { method: 'POST', body: options })),
    join: async (code) => remember(await request('join', { method: 'POST', body: { code } })),
    quick: async (options) => remember(await request('quick', { method: 'POST', body: options })),
    poll: (after = 0) => request(`poll?code=${encodeURIComponent(session?.code ?? '')}&after=${Number(after) || 0}`),
    start: () => request('start', { method: 'POST', body: {} }),
    action: (data) => request('action', { method: 'POST', body: { data } }),
    finish: (results) => request('finish', { method: 'POST', body: { results } }),
    leave: async () => {
      try { return await request('leave', { method: 'POST', body: {} }); } finally { session = null; }
    },
  };
}

// ---------- Spielansicht aus Sicht von Platz 1 ----------
// Die Regeln rechnen immer mit Platz 0 und 1. Wer auf Platz 1 sitzt, sieht eine gespiegelte Kopie: er selbst ist dort Spieler 0.

const swap = (pair) => (Array.isArray(pair) ? [pair[1], pair[0]] : pair);
const flip = (value) => (value === 0 || value === 1 ? 1 - value : value);

export function mirrorResult(result) {
  if (!result) return result;
  return {
    ...result,
    winner: flip(result.winner),
    fold: flip(result.fold),
    points: swap(result.points),
    fronts: (result.fronts ?? []).map((front) => ({ ...front, totals: swap(front.totals), winner: flip(front.winner) })),
  };
}

export function mirrorState(state) {
  const copy = structuredClone(state);
  copy.players = swap(copy.players);
  copy.banners = swap(copy.banners);
  copy.drumUsed = swap(copy.drumUsed);
  copy.energyBonus = swap(copy.energyBonus);
  copy.extraEnergy = swap(copy.extraEnergy);
  copy.initiative = flip(copy.initiative);
  copy.winner = flip(copy.winner);
  for (const front of copy.fronts) {
    front.sides = swap(front.sides);
    front.shield = swap(front.shield);
    for (const side of front.sides) for (const card of side) card.owner = flip(card.owner);
  }
  copy.lastResult = mirrorResult(copy.lastResult);
  return copy;
}

export function mirrorFrame(frame) {
  return {
    ...frame,
    owner: flip(frame.owner),
    view: frame.view.map((front) => ({
      ...front,
      shield: swap(front.shield),
      totals: swap(front.totals),
      winner: flip(front.winner),
      sides: swap(front.sides).map((side) => side.map((card) => ({ ...card, owner: flip(card.owner) }))),
    })),
  };
}
