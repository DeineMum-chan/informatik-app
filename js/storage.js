/*
 * storage.js — Fortschritt & Statistik: localStorage + optionaler Server-Sync.
 *
 * Betriebsarten:
 *  - Gastmodus (statisches Hosting / Doppelklick): alles nur im localStorage,
 *    Schlüssel "ckt-progress-v1" — Verhalten wie in der reinen Offline-Version.
 *  - Angemeldet (Node-Server, siehe server.js): pro Nutzer ein eigener
 *    localStorage-Schlüssel "ckt-progress-v1:<name>" als Offline-Cache,
 *    zusätzlich wird jeder Stand (entprellt) an PUT /api/state geschickt.
 *    Konflikte zwischen Geräten löst der Zeitstempel savedAt (neuer gewinnt).
 *
 * Datenmodell (ein JSON-Blob pro Nutzer):
 * {
 *   perQuestion: { "Q-000001": { s, c, w, box: 0..4, last, m } },
 *   global: { answered, correct, streak, bestStreak, lastPracticed },
 *   exams:  [ { ts, points, max, percent, grade, negative, timed } ],
 *   savedAt: Zeitstempel des letzten save()
 * }
 *
 * "box" ist die Leitner-Stufe für "Fehler wiederholen":
 * falsch → box 0 (kommt oft), richtig → box+1, ab box 4 gilt sie als gelernt.
 */

(function () {
  'use strict';

  window.CKT = window.CKT || {};

  const BASE_KEY = 'ckt-progress-v1';
  const THEME_KEY = 'ckt-theme';
  const LAST_USER_KEY = 'ckt-last-user';
  const MAX_BOX = 4;
  const MAX_EXAM_HISTORY = 10;
  const SYNC_DEBOUNCE_MS = 2000;

  let currentUser = null;   // null = Gastmodus
  let syncEnabled = false;  // true nur bei aktiver Server-Anmeldung
  let syncTimer = null;
  let syncDirty = false;

  function storageKey() {
    return currentUser ? `${BASE_KEY}:${currentUser}` : BASE_KEY;
  }

  function emptyState() {
    return {
      perQuestion: {},
      global: { answered: 0, correct: 0, streak: 0, bestStreak: 0, lastPracticed: null },
      exams: [],
      savedAt: 0,
    };
  }

  function sanitize(parsed) {
    const base = emptyState();
    if (!parsed || typeof parsed !== 'object') return base;
    return {
      perQuestion: (typeof parsed.perQuestion === 'object' && parsed.perQuestion) || base.perQuestion,
      global: Object.assign(base.global, parsed.global),
      exams: Array.isArray(parsed.exams) ? parsed.exams : base.exams,
      savedAt: Number(parsed.savedAt) || 0,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(storageKey());
      return raw ? sanitize(JSON.parse(raw)) : emptyState();
    } catch (err) {
      return emptyState(); // beschädigter/gesperrter Speicher — App bleibt nutzbar
    }
  }

  let state = load();

  function save() {
    state.savedAt = Date.now();
    try {
      localStorage.setItem(storageKey(), JSON.stringify(state));
    } catch (err) {
      /* Speicher voll/gesperrt (z. B. privater Modus) — App bleibt nutzbar. */
    }
    scheduleSync();
  }

  // ---- Server-Sync ----------------------------------------------------------

  function scheduleSync() {
    if (!syncEnabled) return;
    syncDirty = true;
    if (syncTimer) return;
    syncTimer = window.setTimeout(() => { syncTimer = null; flushSync(); }, SYNC_DEBOUNCE_MS);
  }

  /** Ausstehenden Stand sofort zum Server schicken (Fehler = später erneut). */
  function flushSync(useKeepalive) {
    if (!syncEnabled || !syncDirty) return;
    syncDirty = false;
    fetch('api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      keepalive: !!useKeepalive,
      body: JSON.stringify({ state, savedAt: state.savedAt }),
    }).catch(() => { syncDirty = true; /* offline — nächster save() versucht es wieder */ });
  }

  // Beim Verlassen/Wegblättern nichts verlieren
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (syncTimer) { window.clearTimeout(syncTimer); syncTimer = null; }
      flushSync(true);
    }
  });
  window.addEventListener('online', () => { if (syncDirty) flushSync(); });

  /**
   * Aktiven Nutzer setzen (oder null für Gastmodus) und dessen lokalen
   * Stand laden. sync=true aktiviert den Server-Abgleich.
   */
  function setUser(name, opts) {
    currentUser = name || null;
    syncEnabled = !!(opts && opts.sync) && !!currentUser;
    syncDirty = false;
    if (syncTimer) { window.clearTimeout(syncTimer); syncTimer = null; }
    state = load();
    try {
      if (currentUser) localStorage.setItem(LAST_USER_KEY, currentUser);
    } catch (err) { /* egal */ }
  }

  function getUser() { return currentUser; }

  function lastKnownUser() {
    try { return localStorage.getItem(LAST_USER_KEY); } catch (err) { return null; }
  }

  function clearLastUser() {
    try { localStorage.removeItem(LAST_USER_KEY); } catch (err) { /* egal */ }
  }

  function getSavedAt() { return state.savedAt || 0; }

  /** Vom Server geholten Stand übernehmen (der Zeitstempel-Vergleich passiert im Aufrufer). */
  function adoptState(remoteState) {
    state = sanitize(remoteState);
    try { localStorage.setItem(storageKey(), JSON.stringify(state)); } catch (err) { /* egal */ }
  }

  /** Lokalen Stand einmalig zum Server schieben (nach Login, wenn lokal neuer). */
  function pushNow() {
    syncDirty = true;
    flushSync();
  }

  function hasProgress() {
    return state.global.answered > 0 || Object.keys(state.perQuestion).length > 0;
  }

  // ---- Fachlogik (unverändert zur Offline-Version) ---------------------------

  function rec(id) {
    let r = state.perQuestion[id];
    if (!r) {
      r = { s: 0, c: 0, w: 0, box: MAX_BOX, last: 0, m: false };
      state.perQuestion[id] = r;
    }
    return r;
  }

  /**
   * Eine beantwortete Frage verbuchen.
   * opts.streak: false im Klausurmodus (Batch-Auswertung zählt nicht als Serie).
   */
  function recordAnswer(id, correct, opts) {
    const countStreak = !opts || opts.streak !== false;
    const r = rec(id);
    r.s += 1;
    r.last = Date.now();
    if (correct) {
      r.c += 1;
      r.box = Math.min(MAX_BOX, r.box + 1); // richtig → seltener wiederholen
    } else {
      r.w += 1;
      r.box = 0; // falsch → zurück auf Stufe 0, kommt häufig wieder
    }
    const g = state.global;
    g.answered += 1;
    if (correct) g.correct += 1;
    if (countStreak) {
      g.streak = correct ? g.streak + 1 : 0;
      if (g.streak > g.bestStreak) g.bestStreak = g.streak;
    }
    g.lastPracticed = Date.now();
    save();
  }

  function toggleMark(id) {
    const r = rec(id);
    r.m = !r.m;
    save();
    return r.m;
  }

  function isMarked(id) {
    const r = state.perQuestion[id];
    return !!(r && r.m);
  }

  function getRecord(id) {
    return state.perQuestion[id] || null;
  }

  /** IDs für "Fehler wiederholen": markiert oder falsch beantwortet & noch nicht verheilt. */
  function reviewIds() {
    const ids = [];
    for (const id of Object.keys(state.perQuestion)) {
      const r = state.perQuestion[id];
      if (r.m || (r.w > 0 && r.box < MAX_BOX)) ids.push(id);
    }
    return ids;
  }

  function globalStats() {
    const g = state.global;
    return {
      answered: g.answered,
      correct: g.correct,
      rate: g.answered > 0 ? g.correct / g.answered : null,
      streak: g.streak,
      bestStreak: g.bestStreak,
      lastPracticed: g.lastPracticed,
    };
  }

  /**
   * Statistik pro Thema, abgeleitet aus den Frage-Datensätzen.
   * Liefert Map topicId → { total, seen, answers, correct }.
   */
  function topicStats(questions) {
    const map = {};
    for (const q of questions) {
      let t = map[q.topicId];
      if (!t) { t = { total: 0, seen: 0, answers: 0, correct: 0 }; map[q.topicId] = t; }
      t.total += 1;
      const r = state.perQuestion[q.id];
      if (r && r.s > 0) {
        t.seen += 1;
        t.answers += r.s;
        t.correct += r.c;
      }
    }
    return map;
  }

  function addExamResult(summary) {
    state.exams.unshift(summary);
    if (state.exams.length > MAX_EXAM_HISTORY) state.exams.length = MAX_EXAM_HISTORY;
    save();
  }

  function examHistory() {
    return state.exams.slice();
  }

  function resetAll() {
    state = emptyState();
    try { localStorage.removeItem(storageKey()); } catch (err) { /* egal */ }
    save(); // schreibt den leeren Stand lokal & (falls angemeldet) zum Server
  }

  // ---- Farbschema -------------------------------------------------------------

  function getTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (err) { return null; }
  }

  function setTheme(theme) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (err) { /* egal */ }
  }

  CKT.storage = {
    MAX_BOX,
    // Nutzer & Sync
    setUser,
    getUser,
    lastKnownUser,
    clearLastUser,
    getSavedAt,
    adoptState,
    pushNow,
    hasProgress,
    flushSync,
    // Fachlogik
    recordAnswer,
    toggleMark,
    isMarked,
    getRecord,
    reviewIds,
    globalStats,
    topicStats,
    addExamResult,
    examHistory,
    resetAll,
    getTheme,
    setTheme,
  };
})();
