/*
 * server.js — Mini-Backend des C-Klausurtrainers für den Online-Betrieb
 * (VPS/Coolify). Läuft mit Node.js ohne jede npm-Abhängigkeit.
 *
 * Aufgaben:
 *  1. Statische Auslieferung der App (index.html, css/, js/, data/ …)
 *  2. Login per Name (Allowlist aus users.json) über ein Session-Cookie
 *  3. Speichern/Laden des Lernfortschritts pro Nutzer als JSON-Datei
 *
 * API:
 *  GET  /api/health  → 200 {ok:true}
 *  GET  /api/me      → 200 {name} | 401
 *  POST /api/login   → Body {name} · 200 {name} | 403
 *  POST /api/logout  → 204
 *  GET  /api/state   → 200 {state, savedAt}   (state=null, wenn noch nichts gespeichert)
 *  PUT  /api/state   → Body {state, savedAt} · 204
 *
 * Konfiguration über Umgebungsvariablen:
 *  PORT      (Standard 3000)
 *  DATA_DIR  Ablage der Nutzer-Stände (Standard ./data-store) —
 *            in Coolify als persistentes Volume mounten, sonst sind
 *            die Stats nach jedem Redeploy weg!
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data-store');
const USERS_FILE = path.join(ROOT, 'users.json');
const COOKIE_NAME = 'ckt_user';
// Die Anmeldung gilt nur für den KALENDERTAG, an dem man sich einloggt.
// So sieht jeder täglich wieder den Login-Screen (mit dem Spenden-QR-Code).
// Das Cookie enthält "name~YYYY-MM-DD"; ist das Datum nicht mehr heute
// (deutsche Zeit), zählt man als abgemeldet. Max-Age nur als Aufräum-Puffer.
const COOKIE_MAX_AGE = 60 * 60 * 36; // 36 h — der Kalendertag-Check erzwingt täglich neu

/** Heutiges Datum als YYYY-MM-DD in deutscher Zeit (DST-sicher via Intl). */
function todayBerlin() {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
  } catch (err) {
    // Sollte Intl/Zeitzonen wider Erwarten fehlen: UTC-Datum als Rückfall.
    return new Date().toISOString().slice(0, 10);
  }
}
const MAX_BODY = 2 * 1024 * 1024; // 2 MB reichen für den Fortschritts-Blob locker

// Diese Dateien gibt der statische Handler nicht heraus.
const STATIC_DENY = new Set(['server.js', 'users.json', 'Dockerfile', '.dockerignore', '.gitignore']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Nutzer-Allowlist
// ---------------------------------------------------------------------------

/** users.json bei jedem Login frisch lesen — so wirken Änderungen sofort. */
function loadUsers() {
  try {
    const parsed = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const list = Array.isArray(parsed) ? parsed : parsed.users;
    return new Set((list || []).map((n) => String(n).trim().toLowerCase()).filter(Boolean));
  } catch (err) {
    console.error('users.json konnte nicht gelesen werden:', err.message);
    return new Set();
  }
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

/** Nur einfache Namen zulassen — schützt zugleich die Dateinamen im DATA_DIR. */
function isSafeName(name) {
  return /^[a-z0-9_-]{1,32}$/.test(name);
}

// ---------------------------------------------------------------------------
// HTTP-Hilfen
// ---------------------------------------------------------------------------

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error('body_too_large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

/**
 * Angemeldeten Nutzer aus dem Cookie lesen und gegen die Allowlist prüfen.
 * Zusätzlich muss der im Cookie hinterlegte Login-Tag der heutige sein —
 * sonst gilt die Anmeldung als abgelaufen (täglich neuer Login).
 */
function currentUser(req) {
  const raw = parseCookies(req)[COOKIE_NAME] || '';
  const sep = raw.indexOf('~');
  if (sep < 0) return null; // altes/ungültiges Cookie ohne Datum → neu einloggen
  const name = normalizeName(raw.slice(0, sep));
  const day = raw.slice(sep + 1);
  if (!isSafeName(name)) return null;
  if (day !== todayBerlin()) return null; // gestern eingeloggt → abgelaufen
  return loadUsers().has(name) ? name : null;
}

function stateFile(name) {
  return path.join(DATA_DIR, `state-${name}.json`);
}

/** Atomar schreiben (Temp-Datei + rename), damit nie ein halber Stand liegt. */
function writeStateFile(name, payload) {
  const file = stateFile(name);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload));
  fs.renameSync(tmp, file);
}

// ---------------------------------------------------------------------------
// API-Routen
// ---------------------------------------------------------------------------

async function handleApi(req, res, pathname) {
  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (err) { return sendJson(res, 400, { error: 'bad_request' }); }
    const name = normalizeName(body && body.name);
    if (!isSafeName(name) || !loadUsers().has(name)) {
      return sendJson(res, 403, { error: 'unknown_user' });
    }
    const value = encodeURIComponent(name + '~' + todayBerlin());
    res.setHeader('Set-Cookie',
      `${COOKIE_NAME}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax`);
    return sendJson(res, 200, { name });
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    return res.end();
  }

  // Ab hier nur mit gültiger Anmeldung
  const user = currentUser(req);
  if (!user) return sendJson(res, 401, { error: 'not_logged_in' });

  if (pathname === '/api/me' && req.method === 'GET') {
    return sendJson(res, 200, { name: user });
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    try {
      const raw = fs.readFileSync(stateFile(user), 'utf8');
      const payload = JSON.parse(raw);
      return sendJson(res, 200, { state: payload.state || null, savedAt: payload.savedAt || null });
    } catch (err) {
      return sendJson(res, 200, { state: null, savedAt: null }); // noch nichts gespeichert
    }
  }

  if (pathname === '/api/state' && req.method === 'PUT') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (err) { return sendJson(res, 400, { error: 'bad_request' }); }
    if (!body || typeof body.state !== 'object' || body.state === null) {
      return sendJson(res, 400, { error: 'bad_request' });
    }
    writeStateFile(user, { state: body.state, savedAt: Number(body.savedAt) || Date.now() });
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    return res.end();
  }

  return sendJson(res, 404, { error: 'not_found' });
}

// ---------------------------------------------------------------------------
// Statische Auslieferung
// ---------------------------------------------------------------------------

function handleStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); return res.end();
  }
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';

  // Pfad absichern: keine Ausbrüche aus dem App-Ordner, keine internen Dateien
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) {
    res.writeHead(403); return res.end();
  }
  const base = path.basename(file);
  if (STATIC_DENY.has(base) || file.startsWith(DATA_DIR)) {
    res.writeHead(404); return res.end();
  }

  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found'); }
    const ext = path.extname(file).toLowerCase();
    // 'no-cache' heißt NICHT "nicht cachen", sondern "vor Nutzung beim Server
    // rückfragen" (billiges 304, wenn unverändert). Wichtig: Sonst könnte der
    // Browser nach einem Deploy bis zu einer Stunde alte JS/CSS liefern — und
    // der Service Worker würde diese veralteten Dateien beim Neuinstallieren
    // sogar in seinen Offline-Cache übernehmen. Das echte Offline-Caching
    // macht ohnehin der Service Worker, nicht der HTTP-Cache.
    const longLived = ext === '.woff2' || ext === '.png'; // Fonts/Icons ändern sich praktisch nie
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': longLived ? 'public, max-age=86400' : 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname).catch((err) => {
      console.error('API-Fehler:', err.message);
      if (!res.headersSent) sendJson(res, 500, { error: 'server_error' });
    });
  } else {
    handleStatic(req, res, pathname);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`C-Klausurtrainer läuft auf http://${HOST}:${PORT}`);
  console.log(`Nutzer-Stände: ${DATA_DIR}`);
  console.log(`Bekannte Nutzer: ${[...loadUsers()].join(', ') || '(users.json fehlt/leer!)'}`);
});
