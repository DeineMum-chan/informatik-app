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
 *   perQuestion: { "Q-000001": { s, c, w, last, m, d, rv } },
 *   global: { answered, correct, streak, bestStreak, lastPracticed },
 *   exams:  [ { ts, points, max, percent, grade, negative, timed } ],
 *   examSeries: {
 *     id, generatedCount, familyKeys, variantKeys, fingerprints, createdAt
 *   },
 *   savedAt: Zeitstempel des letzten save()
 * }
 *
 * Fahrschul-Prinzip (zwei Flags pro Frage):
 *   d  = "im aktuellen Durchlauf schon richtig beantwortet". Solche Fragen
 *        kommen im Übungsmodus nicht mehr. Ist der Durchlauf komplett, werden
 *        alle d-Flags der Auswahl zurückgesetzt (resetRun) und es geht von vorn.
 *   rv = "steht im Fehler-Pool" (falsch beantwortet, noch nicht korrigiert).
 *        Einmal richtig beantwortet → rv=false → raus aus dem Pool.
 *
 * s/c/w bleiben kumulative Statistik (für Quote und Themen-Fortschritt) und
 * werden von den Durchlauf-Resets nicht angetastet.
 */

(function () {
  'use strict';

  window.CKT = window.CKT || {};

  const BASE_KEY = 'ckt-progress-v1';
  const THEME_KEY = 'ckt-theme';
  const LAST_USER_KEY = 'ckt-last-user';
  const LEGACY_MAX_BOX = 4; // nur noch für die Migration alter Stände
  const MAX_EXAM_HISTORY = 10;
  const SYNC_DEBOUNCE_MS = 2000;

  let currentUser = null;   // null = Gastmodus
  let syncEnabled = false;  // true nur bei aktiver Server-Anmeldung
  let syncTimer = null;
  let syncDirty = false;

  function storageKey() {
    return currentUser ? `${BASE_KEY}:${currentUser}` : BASE_KEY;
  }

  function emptyExamSeries() {
    return {
      id: '',
      generatedCount: 0,
      familyKeys: [],
      variantKeys: [],
      fingerprints: [],
      createdAt: 0,
    };
  }

  function emptyState() {
    return {
      perQuestion: {},
      global: { answered: 0, correct: 0, streak: 0, bestStreak: 0, lastPracticed: null },
      exams: [],
      lastExamSelection: { familyKeys: [], variantKeys: [] },
      examSeries: emptyExamSeries(),
      newsSeen: 0,   // zuletzt bestätigte Neuerungs-Version (siehe NEWS_VERSION in app.js)
      runSeed: 0,    // rotiert die Varianten-Auswahl pro Übungs-Durchlauf
      savedAt: 0,
    };
  }

  /**
   * Alte Datensätze (Leitner-Modell mit "box") auf d/rv umstellen.
   * Läuft nur, wenn die Felder fehlen — bestehender Fortschritt bleibt erhalten:
   *   rv (Fehler-Pool) = frühere Bedingung "falsch gehabt und noch nicht gelernt"
   *   d  (Durchlauf)   = schon mal richtig beantwortet und nicht im Fehler-Pool
   */
  function migrateRecord(r) {
    if (!r || typeof r !== 'object') return { s: 0, c: 0, w: 0, last: 0, m: false, d: false, rv: false };
    if (typeof r.rv === 'undefined') {
      const box = typeof r.box === 'number' ? r.box : LEGACY_MAX_BOX;
      r.rv = (r.w > 0 && box < LEGACY_MAX_BOX);
    }
    if (typeof r.d === 'undefined') {
      r.d = (r.c > 0 && !r.rv);
    }
    delete r.box; // wird nicht mehr verwendet
    r.m = !!r.m;
    return r;
  }

  function sanitize(parsed) {
    const base = emptyState();
    if (!parsed || typeof parsed !== 'object') return base;
    const perQuestion = (typeof parsed.perQuestion === 'object' && parsed.perQuestion) || base.perQuestion;
    for (const id of Object.keys(perQuestion)) migrateRecord(perQuestion[id]);
    const selection = parsed.lastExamSelection && typeof parsed.lastExamSelection === 'object'
      ? parsed.lastExamSelection : base.lastExamSelection;
    const familyKeys = Array.isArray(selection.familyKeys)
      ? selection.familyKeys.filter((key) => typeof key === 'string').slice(0, 100)
      : [];
    const variantKeys = Array.isArray(selection.variantKeys)
      ? selection.variantKeys.filter((key) => typeof key === 'string').slice(0, 100)
      : [];
    const rawSeries = parsed.examSeries && typeof parsed.examSeries === 'object'
      ? parsed.examSeries : emptyExamSeries();
    const sanitizeKeys = (values, limit) => Array.isArray(values)
      ? values.filter((value) => typeof value === 'string').slice(0, limit)
      : [];
    const generatedCount = Math.min(6, Math.max(0, Number(rawSeries.generatedCount) || 0));
    const examSeries = {
      id: typeof rawSeries.id === 'string' ? rawSeries.id.slice(0, 80) : '',
      generatedCount,
      familyKeys: sanitizeKeys(rawSeries.familyKeys, 300),
      variantKeys: sanitizeKeys(rawSeries.variantKeys, 300),
      fingerprints: sanitizeKeys(rawSeries.fingerprints, 300),
      createdAt: Number(rawSeries.createdAt) || 0,
    };
    return {
      perQuestion,
      global: Object.assign(base.global, parsed.global),
      exams: Array.isArray(parsed.exams) ? parsed.exams : base.exams,
      lastExamSelection: { familyKeys, variantKeys },
      examSeries,
      newsSeen: Number(parsed.newsSeen) || 0,
      runSeed: Number(parsed.runSeed) || 0,
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
      r = { s: 0, c: 0, w: 0, last: 0, m: false, d: false, rv: false };
      state.perQuestion[id] = r;
    }
    return r;
  }

  /**
   * Eine beantwortete Frage verbuchen.
   * opts.streak: false im Klausurmodus (Batch-Auswertung zählt nicht als Serie).
   *
   * Richtig → gilt als geschafft (d) und verlässt den Fehler-Pool (rv).
   * Falsch  → zurück in den Durchlauf (d=false) und rein in den Fehler-Pool.
   */
  function recordAnswer(id, correct, opts) {
    const countStreak = !opts || opts.streak !== false;
    const r = rec(id);
    r.s += 1;
    r.last = Date.now();
    if (correct) {
      r.c += 1;
      r.d = true;
      r.rv = false;
    } else {
      r.w += 1;
      r.d = false;
      r.rv = true;
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

  /** Markierung entfernen (z. B. wenn eine Frage im Wiederholen-Modus sitzt). */
  function clearMark(id) {
    const r = state.perQuestion[id];
    if (r && r.m) { r.m = false; save(); }
  }

  function getRecord(id) {
    return state.perQuestion[id] || null;
  }

  /**
   * IDs für "Fehler wiederholen": aktuell offene Fehler (rv) oder gemerkte Fragen.
   * Eine falsch beantwortete Frage fliegt raus, sobald sie einmal richtig
   * beantwortet wurde (rv=false) — gemerkte bleiben, bis die Markierung weg ist.
   */
  function reviewIds() {
    const ids = [];
    for (const id of Object.keys(state.perQuestion)) {
      const r = state.perQuestion[id];
      if (r.m || r.rv) ids.push(id);
    }
    return ids;
  }

  /** Im aktuellen Durchlauf bereits richtig beantwortet? */
  function isDone(id) {
    const r = state.perQuestion[id];
    return !!(r && r.d);
  }

  /**
   * Fortschritt über eine Fragenmenge:
   *   done     = im aktuellen Durchlauf schon richtig beantwortet (wird beim Reset genullt)
   *   answered = jemals beantwortet (überlebt Durchlauf-Resets → echter Gesamt-Lernstand)
   *   fresh    = noch nie gesehen
   */
  function runProgress(questions) {
    let done = 0, answered = 0;
    for (const q of questions) {
      const r = state.perQuestion[q.id];
      if (r && r.d) done += 1;
      if (r && r.s > 0) answered += 1;
    }
    const total = questions.length;
    return { total, done, open: total - done, answered, fresh: total - answered };
  }

  /**
   * Durchlauf zurücksetzen: d-Flags der übergebenen Frage-IDs löschen.
   * Statistik (s/c/w), Markierungen und Fehler-Pool bleiben unberührt.
   * Der runSeed wird hochgezählt → der nächste Durchlauf zeigt pro Konzept
   * eine ANDERE Variante (Werte/Namen wechseln, die Antwort ist nicht merkbar).
   */
  function resetRun(ids) {
    for (const id of ids) {
      const r = state.perQuestion[id];
      if (r) r.d = false;
    }
    state.runSeed = (state.runSeed || 0) + 1;
    save();
  }

  function getRunSeed() { return state.runSeed || 0; }

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

  /**
   * Unmittelbar vorherige Klausurauswahl für den Wiederholungsschutz.
   * Es werden nur technische Familien-/Varianten-Schlüssel gespeichert,
   * keine Antworten oder Klausurinhalte.
   */
  function rememberExamSelection(selection) {
    const familyKeys = selection && Array.isArray(selection.familyKeys)
      ? selection.familyKeys.filter((key) => typeof key === 'string').slice(0, 100)
      : [];
    const variantKeys = selection && Array.isArray(selection.variantKeys)
      ? selection.variantKeys.filter((key) => typeof key === 'string').slice(0, 100)
      : [];
    state.lastExamSelection = { familyKeys, variantKeys };
    save();
  }

  function getLastExamSelection() {
    return {
      familyKeys: state.lastExamSelection.familyKeys.slice(),
      variantKeys: state.lastExamSelection.variantKeys.slice(),
    };
  }

  /**
   * Eine erzeugte Klausur gilt als verbraucht, sobald ihr Inhalt angezeigt
   * wird. So lässt sich der Wiederholungsschutz nicht durch Abbrechen umgehen.
   */
  function rememberExamSeriesSelection(selection) {
    if (state.examSeries.generatedCount >= 6) return getExamSeries();
    if (!state.examSeries.id) {
      state.examSeries.id = `series-${Date.now()}`;
      state.examSeries.createdAt = Date.now();
    }
    const appendUnique = (target, values, limit) => {
      const seen = new Set(target);
      for (const value of Array.isArray(values) ? values : []) {
        if (typeof value !== 'string' || seen.has(value)) continue;
        seen.add(value);
        target.push(value);
        if (target.length >= limit) break;
      }
    };
    appendUnique(state.examSeries.familyKeys, selection && selection.familyKeys, 300);
    appendUnique(state.examSeries.variantKeys, selection && selection.variantKeys, 300);
    appendUnique(state.examSeries.fingerprints, selection && selection.fingerprints, 300);
    state.examSeries.generatedCount += 1;
    save();
    return getExamSeries();
  }

  function getExamSeries() {
    return {
      id: state.examSeries.id,
      generatedCount: state.examSeries.generatedCount,
      familyKeys: state.examSeries.familyKeys.slice(),
      variantKeys: state.examSeries.variantKeys.slice(),
      fingerprints: state.examSeries.fingerprints.slice(),
      createdAt: state.examSeries.createdAt,
    };
  }

  function resetExamSeries() {
    state.examSeries = emptyExamSeries();
    save();
    return getExamSeries();
  }

  function resetAll() {
    const seen = state.newsSeen; // Neuerungs-Hinweis nicht erneut zeigen
    state = emptyState();
    state.newsSeen = seen;
    try { localStorage.removeItem(storageKey()); } catch (err) { /* egal */ }
    save(); // schreibt den leeren Stand lokal & (falls angemeldet) zum Server
  }

  // ---- Neuerungs-Hinweis ("Was ist neu?") -----------------------------------

  function getNewsSeen() { return state.newsSeen || 0; }

  function setNewsSeen(version) {
    state.newsSeen = version;
    save();
  }

  // ---- Farbschema -------------------------------------------------------------

  function getTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (err) { return null; }
  }

  function setTheme(theme) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (err) { /* egal */ }
  }

  CKT.storage = {
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
    clearMark,
    getRecord,
    reviewIds,
    isDone,
    runProgress,
    resetRun,
    getRunSeed,
    globalStats,
    topicStats,
    addExamResult,
    examHistory,
    rememberExamSelection,
    getLastExamSelection,
    rememberExamSeriesSelection,
    getExamSeries,
    resetExamSeries,
    resetAll,
    getNewsSeen,
    setNewsSeen,
    getTheme,
    setTheme,
  };
})();
