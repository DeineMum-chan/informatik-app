/*
 * quiz-engine.js — Datenvalidierung, Fragenauswahl, Klausur-Bau & Bewertung.
 *
 * Grundsätze:
 *  - Kein eval, kein Ausführen von Fragen-Code: alle Lösungen stehen im Pool.
 *  - Fehlerhafte Fragen werden beim Laden übersprungen und gezählt, nie geworfen.
 *  - Snippet-Gruppen (gleiche `group`) werden als Einheit behandelt.
 */

(function () {
  'use strict';

  window.CKT = window.CKT || {};

  const KNOWN_TYPES = ['mc-single', 'mc-multi', 'predict-output', 'true-false', 'find-bug', 'short-answer', 'code-explain'];
  const DIFFICULTIES = ['leicht', 'mittel', 'schwer'];

  // ---------------------------------------------------------------------------
  // Hilfsfunktionen
  // ---------------------------------------------------------------------------

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function sample(arr, n) {
    return shuffle(arr).slice(0, n);
  }

  function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
  }

  function isIndexArray(v, optionCount) {
    return Array.isArray(v) && v.length > 0 &&
      v.every((i) => Number.isInteger(i) && i >= 0 && i < optionCount);
  }

  function isStructuredFindBug(q) {
    return q && q.type === 'find-bug' && Array.isArray(q.bugTargets) && q.bugTargets.length > 0;
  }

  function hasValidBugTargets(q) {
    return isNonEmptyString(q.code) && Array.isArray(q.bugTargets) && q.bugTargets.length > 0 &&
      q.bugTargets.every((target) =>
        target && isNonEmptyString(target.id) && Number.isInteger(target.line) && target.line > 0 &&
        typeof target.originalLine === 'string' &&
        isNonEmptyString(target.solution) &&
        Array.isArray(target.acceptedCorrectedLines) && target.acceptedCorrectedLines.length > 0 &&
        target.acceptedCorrectedLines.every(isNonEmptyString) &&
        (!target.acceptedLines ||
          (Array.isArray(target.acceptedLines) && target.acceptedLines.length > 0 &&
            target.acceptedLines.every((line) => Number.isInteger(line) && line > 0))));
  }

  // ---------------------------------------------------------------------------
  // Validierung & Aufbereitung des Pools
  // ---------------------------------------------------------------------------

  /** Prüft eine einzelne Frage gegen den Datenvertrag. true = brauchbar. */
  function validateQuestion(q) {
    if (!q || typeof q !== 'object') return false;
    if (!isNonEmptyString(q.id)) return false;
    if (!isNonEmptyString(q.prompt)) return false;
    if (!KNOWN_TYPES.includes(q.type)) return false;

    const hasOptions = Array.isArray(q.options) && q.options.length >= 2 &&
      q.options.every(isNonEmptyString);

    switch (q.type) {
      case 'mc-single':
      case 'predict-output':
      case 'true-false':
        return hasOptions && Number.isInteger(q.answerIndex) &&
          q.answerIndex >= 0 && q.answerIndex < q.options.length;
      case 'mc-multi':
        return hasOptions && isIndexArray(q.answerIndices, q.options.length);
      case 'find-bug':
        // Neue Aufgaben werden direkt im Code markiert. Die bisherige
        // Optionsliste bleibt als rückwärtskompatibler Fallback erlaubt.
        return hasValidBugTargets(q) ||
          (hasOptions && isIndexArray(q.answerIndices, q.options.length));
      case 'short-answer':
      case 'code-explain':
        return isNonEmptyString(q.answer);
      default:
        return false;
    }
  }

  /**
   * Rohdaten (geparstes questions.json) validieren und indexieren.
   * Liefert das Dataset, mit dem die App arbeitet.
   */
  function prepare(raw) {
    const result = {
      meta: (raw && raw.meta) || {},
      topics: [],
      topicById: {},
      areas: [],            // [{ name, topics: [topic] }] in Pool-Reihenfolge
      questions: [],
      byId: {},
      groups: {},           // groupId → { id, code, groupPrompt, topicId, questions: [] }
      groupOrder: [],
      skipped: 0,
      disabledCount: 0,     // Fragen aus deaktivierten Themen (siehe config.js)
      disabledTopicNames: [],
    };
    if (!raw || typeof raw !== 'object') return result;

    // Global deaktivierte Themen (config.js) — Fragen bleiben in der Datei,
    // werden aber nirgends verwendet.
    const cfg = (typeof window !== 'undefined' && window.CKT_CONFIG) || {};
    const disabled = new Set(Array.isArray(cfg.disabledTopics) ? cfg.disabledTopics : []);

    // Themen übernehmen (defekte und deaktivierte überspringen)
    const rawTopics = Array.isArray(raw.topics) ? raw.topics : [];
    for (const t of rawTopics) {
      if (!t || !isNonEmptyString(t.id) || !isNonEmptyString(t.name)) continue;
      if (disabled.has(t.id)) { result.disabledTopicNames.push(t.name); continue; }
      const topic = { id: t.id, name: t.name, area: isNonEmptyString(t.area) ? t.area : 'Sonstiges' };
      result.topics.push(topic);
      result.topicById[topic.id] = topic;
    }

    const rawQuestions = Array.isArray(raw.questions) ? raw.questions : [];
    const seenIds = new Set();
    for (const q of rawQuestions) {
      if (q && q.disabled === true) { result.disabledCount += 1; continue; }
      // Deaktivierte Themen ganz früh aussortieren — vor der Fallback-Logik,
      // sonst würde eine solche Frage unter einem Ersatzthema wieder auftauchen.
      if (q && disabled.has(q.topicId)) { result.disabledCount += 1; continue; }
      if (!validateQuestion(q) || seenIds.has(q.id)) { result.skipped += 1; continue; }
      seenIds.add(q.id);

      // Unbekannte topicId → Pseudo-Thema, damit die Frage nicht verloren geht.
      if (!result.topicById[q.topicId]) {
        const fallbackId = isNonEmptyString(q.topicId) ? q.topicId : 'T-??';
        const topic = { id: fallbackId, name: 'Weitere Fragen', area: 'Sonstiges' };
        result.topicById[fallbackId] = topic;
        result.topics.push(topic);
        q.topicId = fallbackId;
      }

      result.questions.push(q);
      result.byId[q.id] = q;

      if (isNonEmptyString(q.group)) {
        let g = result.groups[q.group];
        if (!g) {
          g = {
            id: q.group,
            code: isNonEmptyString(q.code) ? q.code : '',
            groupPrompt: isNonEmptyString(q.groupPrompt) ? q.groupPrompt : '',
            topicId: q.topicId,
            examOnly: q.examOnly === true,
            examArchetype: isNonEmptyString(q.examArchetype) ? q.examArchetype : q.group,
            examSeriesRound: Number.isInteger(q.examSeriesRound) ? q.examSeriesRound : null,
            coverageTopics: [],
            questions: [],
          };
          result.groups[q.group] = g;
          result.groupOrder.push(q.group);
        }
        if (!g.code && isNonEmptyString(q.code)) g.code = q.code;
        if (!g.groupPrompt && isNonEmptyString(q.groupPrompt)) g.groupPrompt = q.groupPrompt;
        const coverage = Array.isArray(q.coverageTopics) ? q.coverageTopics : [];
        for (const topicId of coverage) {
          if (result.topicById[topicId] && !g.coverageTopics.includes(topicId)) {
            g.coverageTopics.push(topicId);
          }
        }
        g.questions.push(q);
      }
    }

    // Bereiche in Reihenfolge des ersten Auftretens gruppieren
    const areaMap = {};
    for (const t of result.topics) {
      let a = areaMap[t.area];
      if (!a) { a = { name: t.area, topics: [] }; areaMap[t.area] = a; result.areas.push(a); }
      a.topics.push(t);
    }

    buildFamilies(result);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Varianten-Familien
  //
  // Der Pool wurde aus Vorlagen generiert: Viele Fragen sind Werte-Varianten
  // derselben Vorlage ("double a[25]" vs. "double a[40]", quadrat vs. umfang,
  // gleiches Snippet mit anderem Array). Wer mehrere Varianten im selben
  // Durchlauf sieht, erkennt die Antwort wieder, statt das Konzept zu prüfen.
  //
  // Lösung: Varianten werden zu einer FAMILIE gebündelt. Der Übungsmodus zeigt
  // pro Durchlauf genau eine Variante je Familie; im nächsten Durchlauf
  // rotiert die Auswahl (runSeed). Klausur & Fehler-Pool nutzen weiter alle.
  // ---------------------------------------------------------------------------

  /** Zahlen, Hex, String-Literale, variablen Funktionsnamen → Platzhalter. */
  function normalizeForFamily(s, fname) {
    let t = String(s == null ? '' : s);
    if (fname) t = t.split(fname).join('F');
    return t
      .replace(/"[^"]*"/g, '"S"')
      .replace(/0x[0-9a-fA-F]+/g, '#')
      .replace(/\d+(\.\d+)?/g, '#')
      .toLowerCase();
  }

  function familyKeyOf(dataset, q) {
    // Redaktionell gesetzte Familien-ID hat Vorrang vor der heuristischen
    // Textnormalisierung. So lassen sich semantisch gleiche Varianten auch
    // dann bündeln, wenn Variablennamen oder Array-Längen verschieden sind.
    if (isNonEmptyString(q.familyId)) return 'E|' + q.familyId;
    if (isNonEmptyString(q.group) && dataset.groups[q.group]) {
      const g = dataset.groups[q.group];
      return 'G|' + g.topicId + '|' + normalizeForFamily(g.code, null);
    }
    // Bewusst NUR Prompt + Code (nicht die Optionen): Viele Vorlagen rotieren
    // ihre Distraktoren — die Frage ist trotzdem dieselbe. Der Code ist Teil
    // des Schlüssels, damit z. B. Predict-Output-Fragen (identischer Prompt,
    // anderes Fragment) sauber getrennt bleiben.
    const fm = q.prompt.match(/Die Funktion (\w+) soll/);
    const fname = fm ? fm[1] : null;
    return q.type + '|' + q.topicId + '|' + normalizeForFamily(q.prompt, fname) + '|' + normalizeForFamily(q.code, fname);
  }

  /**
   * dataset.families: Array von { key, units: [unit, …] } — Einheiten (Frage
   * oder Snippet-Gruppe), die Varianten derselben Vorlage sind.
   * dataset.familyByUnitKey: unitKey → Familien-Index.
   */
  function buildFamilies(dataset) {
    const units = toUnits(dataset, dataset.questions);
    const byKey = new Map();
    dataset.families = [];
    dataset.familyByUnitKey = {};
    for (const u of units) {
      const q = u.kind === 'group' ? u.group.questions[0] : u.q;
      const key = familyKeyOf(dataset, q);
      let fam = byKey.get(key);
      if (!fam) {
        fam = { key, units: [], index: dataset.families.length };
        byKey.set(key, fam);
        dataset.families.push(fam);
      }
      fam.units.push(u);
      dataset.familyByUnitKey[unitKey(u)] = fam.index;
    }
  }

  /** Simpler, stabiler String-Hash für die Varianten-Rotation. */
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function unitFullyDone(unit) {
    return unitQuestions(unit).every((q) => CKT.storage.isDone(q.id));
  }

  function unitIsExamOnly(unit) {
    return unit.kind === 'group' ? unit.group.examOnly === true : unit.q.examOnly === true;
  }

  /** Fortschritt in Familien ("Konzepten") + Fragen über den ganzen Pool. */
  function overallProgress(dataset) {
    let doneF = 0;
    let totalF = 0;
    for (const fam of dataset.families) {
      const practiceUnits = fam.units.filter((unit) => !unitIsExamOnly(unit));
      if (practiceUnits.length === 0) continue;
      totalF += 1;
      if (practiceUnits.some(unitFullyDone)) doneF += 1;
    }
    let answeredQ = 0;
    const practiceQuestions = dataset.questions.filter((q) => q.examOnly !== true);
    for (const q of practiceQuestions) {
      const r = CKT.storage.getRecord(q.id);
      if (r && r.s > 0) answeredQ += 1;
    }
    return {
      families: { total: totalF, done: doneF, open: totalF - doneF },
      questions: { total: practiceQuestions.length, answered: answeredQ },
    };
  }

  // ---------------------------------------------------------------------------
  // Einheiten (Frage oder Snippet-Gruppe)
  // ---------------------------------------------------------------------------

  /** Fragenliste in Einheiten umwandeln; Gruppen bleiben zusammen. */
  function toUnits(dataset, questions) {
    const units = [];
    const groupsDone = new Set();
    for (const q of questions) {
      if (isNonEmptyString(q.group) && dataset.groups[q.group]) {
        if (groupsDone.has(q.group)) continue;
        groupsDone.add(q.group);
        units.push({ kind: 'group', group: dataset.groups[q.group] });
      } else {
        units.push({ kind: 'single', q });
      }
    }
    return units;
  }

  function unitQuestions(unit) {
    return unit.kind === 'group' ? unit.group.questions : [unit.q];
  }

  function unitKey(unit) {
    return unit.kind === 'group' ? 'g:' + unit.group.id : 'q:' + unit.q.id;
  }

  function variantAngleOf(unit) {
    const q = unit.kind === 'group' ? unit.group.questions[0] : unit.q;
    return isNonEmptyString(q.variantAngle) ? q.variantAngle : q.type;
  }

  /**
   * Rotiert zunächst zwischen fachlich unterschiedlichen Perspektiven und
   * danach zwischen Werte-/Namensvarianten derselben Perspektive.
   */
  function choosePracticeVariant(familyKey, units, seed) {
    const byAngle = new Map();
    for (const unit of units) {
      const angle = variantAngleOf(unit);
      if (!byAngle.has(angle)) byAngle.set(angle, []);
      byAngle.get(angle).push(unit);
    }
    const angles = [...byAngle.entries()];
    const position = hashStr(familyKey) + seed;
    const angleIndex = position % angles.length;
    const variants = angles[angleIndex][1];
    const variantRound = Math.floor(position / angles.length);
    return variants[variantRound % variants.length];
  }

  // ---------------------------------------------------------------------------
  // Übungsmodus: endloser Strom mit Anti-Wiederholung (Shuffle + Rückstell-Queue)
  // ---------------------------------------------------------------------------

  /**
   * filters: { topicIds: Set|null, difficulties: Set|null }
   *
   * Fahrschul-Prinzip auf FAMILIEN-Basis: Ein Durchlauf umfasst jedes Konzept
   * (Varianten-Familie) genau einmal. Pro Familie wird eine Variante gewählt —
   * deterministisch aus runSeed, sodass der nächste Durchlauf andere Varianten
   * zeigt und man Antworten nicht wiedererkennen kann.
   *
   * Eine Familie gilt als geschafft, sobald EINE ihrer Varianten vollständig
   * richtig beantwortet ist (auch z. B. über die Klausursimulation).
   */
  function createPracticeSession(dataset, filters) {
    const topicIds = filters && filters.topicIds;
    const difficulties = filters && filters.difficulties;

    const eligible = dataset.questions.filter((q) => {
      if (q.examOnly === true) return false;
      // Leere Auswahl bedeutet "nichts ausgewählt", nicht "kein Filter".
      if (topicIds && !topicIds.has(q.topicId)) return false;
      // Sind alle Schwierigkeiten gewählt, auch Fragen mit unbekanntem Wert zulassen.
      if (difficulties && difficulties.size < DIFFICULTIES.length && !difficulties.has(q.difficulty)) return false;
      if (difficulties && difficulties.size === 0) return false;
      return true;
    });

    // Auswählbare Einheiten nach Familien bündeln (nur Familien mit Treffern)
    const eligibleUnits = toUnits(dataset, eligible);
    const famMap = new Map(); // Familien-Index → [unit, …]
    for (const u of eligibleUnits) {
      const fi = dataset.familyByUnitKey[unitKey(u)];
      if (!famMap.has(fi)) famMap.set(fi, []);
      famMap.get(fi).push(u);
    }
    const seed = CKT.storage.getRunSeed();
    const families = [...famMap.entries()].map(([fi, units]) => ({
      key: dataset.families[fi].key,
      units,
      chosen: choosePracticeVariant(dataset.families[fi].key, units, seed),
    }));

    function familyDone(fam) {
      return fam.units.some(unitFullyDone);
    }

    function openFamilies() {
      return families.filter((f) => !familyDone(f));
    }

    let queue = [];
    const recent = []; // zuletzt gezeigte Familien-Keys (FIFO), gegen direkte Wiederholung

    function refill(open) {
      const recentSet = new Set(recent);
      let candidates = open.filter((f) => !recentSet.has(f.key));
      if (candidates.length === 0) candidates = open.slice();
      queue = shuffle(candidates);
    }

    function remember(fam, poolSize) {
      recent.push(fam.key);
      const cap = Math.min(200, Math.max(1, Math.floor(poolSize / 2)));
      while (recent.length > cap) recent.shift();
    }

    return {
      eligibleIds: () => eligible.map((q) => q.id),
      questionCount: eligible.length,
      /** Fortschritt in Konzepten (Familien) — das ist die Durchlauf-Einheit. */
      stats() {
        let done = 0;
        for (const f of families) if (familyDone(f)) done += 1;
        return {
          total: families.length,
          done,
          open: families.length - done,
          singleVariant: families.filter((family) => family.units.length < 2).length,
        };
      },
      next() {
        const open = openFamilies();
        if (open.length === 0) return null; // Durchlauf geschafft
        if (queue.length === 0) refill(open);
        while (queue.length > 0) {
          const fam = queue.pop();
          if (!familyDone(fam)) { remember(fam, open.length); return fam.chosen; }
        }
        refill(open);
        const fam = queue.pop();
        remember(fam, open.length);
        return fam.chosen;
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Fehler wiederholen: falsch beantwortete + gemerkte Fragen
  // ---------------------------------------------------------------------------

  function buildReviewPool(dataset) {
    const ids = CKT.storage.reviewIds();
    return ids.map((id) => dataset.byId[id])
      .filter((q) => q && q.examOnly !== true);
  }

  /**
   * Zieht die nächste Frage aus dem Fehler-Pool (zufällig, gleichverteilt).
   * Der Pool schrumpft von selbst: Wer eine Frage richtig beantwortet, nimmt
   * sie aus dem Pool (storage.recordAnswer setzt rv=false).
   * excludeId verhindert, dass direkt dieselbe Frage nochmal kommt.
   */
  function drawReviewQuestion(dataset, excludeId) {
    const pool = buildReviewPool(dataset);
    if (pool.length === 0) return null;
    let candidates = pool.filter((q) => q.id !== excludeId);
    if (candidates.length === 0) candidates = pool;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // ---------------------------------------------------------------------------
  // Klausursimulation
  // ---------------------------------------------------------------------------

  /*
   * Blueprint nach exam-profile: Teil 1 ≈ 50 % klassische Ankreuz- und
   * Umrechnungsaufgaben, Teil 2 ≈ 50 % Code-Verständnis (4 Snippet-Gruppen
   * à ~10 Aussagen) + 1 Fehler-finden-Aufgabe. Jede Aussage/Frage = 1 Punkt.
   */
  const EXAM_PART1 = [
    { key: 'tf', take: 5, label: 'Einzelaussagen (R/F)', filter: (q) => q.type === 'true-false' && !q.group },
    { key: 'multi', take: 13, label: '„Was trifft zu?"', filter: (q) => q.type === 'mc-multi' },
    { key: 'predict', take: 13, label: 'Predict-Output', filter: (q) => q.type === 'predict-output' },
    { key: 'conversion', take: 6, label: 'Zahlensysteme', filter: (q) => q.type === 'short-answer' && q.topicId === 'T-20' },
    { key: 'single', take: 3, label: 'Einfachauswahl', filter: (q) => q.type === 'mc-single' },
  ];
  const EXAM_GROUP_COUNT = 4;
  const EXAM_FINDBUG_COUNT = 1;
  const EXAM_SERIES_LENGTH = 6;
  const CONVERSION_FAMILIES = [
    'T20-dec-to-bin', 'T20-bin-to-dec', 'T20-dec-to-hex',
    'T20-hex-to-dec', 'T20-bin-to-hex', 'T20-hex-to-bin',
  ];

  function canonicalText(value) {
    return String(value == null ? '' : value)
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .trim()
      .toLowerCase();
  }

  /**
   * Inhaltlicher Fingerabdruck statt bloßer ID: Auch versehentlich doppelt
   * importierte Aufgaben werden innerhalb einer Sechser-Serie ausgeschlossen.
   */
  function questionFingerprint(q) {
    const answer = Array.isArray(q.answerIndices)
      ? q.answerIndices.slice().sort((a, b) => a - b)
      : (Number.isInteger(q.answerIndex) ? q.answerIndex : q.answer);
    return JSON.stringify([
      q.type,
      canonicalText(q.prompt),
      canonicalText(q.code),
      Array.isArray(q.options) ? q.options.map(canonicalText) : [],
      answer,
    ]);
  }

  function groupFingerprint(group) {
    return JSON.stringify([
      canonicalText(group.code),
      group.questions.map((q) => [
        canonicalText(q.prompt),
        Number.isInteger(q.answerIndex) ? q.answerIndex : q.answerIndices,
      ]),
    ]);
  }

  function coverageTopicsOfQuestion(q) {
    const values = Array.isArray(q.coverageTopics) ? q.coverageTopics : [];
    const text = [q.prompt, q.code].concat(Array.isArray(q.options) ? q.options : [])
      .join('\n').toLowerCase();
    const inferred = [];
    const addIf = (topicId, pattern) => { if (pattern.test(text)) inferred.push(topicId); };
    addIf('T-03', /\bmain\s*\(|return\s+0\b/);
    addIf('T-04', /#\s*(include|define)|präprozessor/);
    addIf('T-05', /\bprintf\s*\(|escape-sequenz/);
    addIf('T-06', /%[-+ #0]*\d*(?:\.\d+)?(?:ll|l|z)?[diufecs]/);
    addIf('T-08', /\bscanf\s*\(|\bgetchar\s*\(|clrbuf|eingabepuffer/);
    addIf('T-11', /\bunsigned\b|vorzeichenlos|modulo\s+2\s*(?:hoch|\^)/);
    addIf('T-13', /\bfmod\s*\(|modulo-operator|rest(?:wert)?\s+einer|%\s*[a-z0-9(]/);
    addIf('T-14', /math\.h|\b(?:sin|cos|tan|sqrt|pow|ceil|floor)\s*\(/);
    addIf('T-15', /\bconst\b|magic number/);
    addIf('T-16', /globale?\s+variable|lokale?\s+variable|gültigkeitsbereich/);
    addIf('T-17', /shadow|verdeckt|gleichen namen.*(?:block|bereich|variable)/);
    addIf('T-18', /(?:\+=|-=|\*=|\/=|%=)/);
    addIf('T-26', /\bif\s*\(|\belse\b/);
    addIf('T-31', /rückgabewert|funktionsparameter|\breturn\b/);
    addIf('T-32', /\bvoid\b|funktion ohne rückgabewert/);
    addIf('T-44', /\btypedef\b|verschachtelte[nr]?\s+struct/);
    return [...new Set([q.topicId].concat(values, inferred).filter(isNonEmptyString))];
  }

  function coverageTopicsOfGroup(group) {
    return [...new Set(['T-47'].concat(
      Array.isArray(group.coverageTopics) ? group.coverageTopics : [],
    ))];
  }

  function examQuestionEligible(q, filter, usedVariantKeys, usedFingerprints) {
    return !q.group && q.examOnly !== true && q.verified === true &&
      (q.difficulty === 'mittel' || q.difficulty === 'schwer') &&
      filter(q) &&
      !usedVariantKeys.has('q:' + q.id) &&
      !usedFingerprints.has(questionFingerprint(q));
  }

  function familyIndexForQuestion(dataset, q) {
    return dataset.familyByUnitKey['q:' + q.id];
  }

  function candidatesForBucket(dataset, bucket, series) {
    return shuffle(dataset.questions.filter((q) =>
      examQuestionEligible(q, bucket.filter, series.usedVariantKeys, series.usedFingerprints)));
  }

  function chooseConversions(dataset, candidates, usedFamilies) {
    const selected = [];
    for (const familyId of CONVERSION_FAMILIES) {
      const options = candidates.filter((q) =>
        q.familyId === familyId && !usedFamilies.has(familyIndexForQuestion(dataset, q)));
      if (options.length === 0) return null;
      const q = options[0];
      selected.push(q);
      usedFamilies.add(familyIndexForQuestion(dataset, q));
    }
    return selected;
  }

  function fillBucket(dataset, candidates, target, selected, usedFamilies, usedIds) {
    const primaryAvailability = new Map();
    const familyAvailability = new Map();
    for (const q of candidates) {
      primaryAvailability.set(q.topicId, (primaryAvailability.get(q.topicId) || 0) + 1);
      const familyIndex = familyIndexForQuestion(dataset, q);
      familyAvailability.set(familyIndex, (familyAvailability.get(familyIndex) || 0) + 1);
    }
    const ordered = shuffle(candidates).sort((left, right) => {
      const topicDifference =
        (primaryAvailability.get(right.topicId) || 0) -
        (primaryAvailability.get(left.topicId) || 0);
      if (topicDifference !== 0) return topicDifference;
      return (familyAvailability.get(familyIndexForQuestion(dataset, right)) || 0) -
        (familyAvailability.get(familyIndexForQuestion(dataset, left)) || 0);
    });
    const addCandidates = (allowRepeatedPrimaryTopic) => {
      const usedPrimaryTopics = new Set([...usedIds]
        .map((id) => dataset.byId[id])
        .filter(Boolean)
        .map((q) => q.topicId));
      for (const q of ordered) {
        if (selected.length >= target) break;
        const familyIndex = familyIndexForQuestion(dataset, q);
        if (usedIds.has(q.id) || usedFamilies.has(familyIndex)) continue;
        if (!allowRepeatedPrimaryTopic && usedPrimaryTopics.has(q.topicId)) continue;
        selected.push(q);
        usedIds.add(q.id);
        usedFamilies.add(familyIndex);
        usedPrimaryTopics.add(q.topicId);
      }
    };
    // Knappe Themenvarianten nicht als beliebige Füller mehrfach in derselben
    // Klausur verbrauchen. Erst wenn der Topf sonst nicht voll wird, sind
    // weitere Fragen desselben Primärthemas erlaubt.
    addCandidates(false);
    if (selected.length < target) {
      addCandidates(true);
    }
    return selected.length === target;
  }

  /**
   * Belegt zuerst noch fehlende Themen und füllt danach die festen Fragetöpfe.
   * Die Rekursion läuft über höchstens 34 offene Plätze; seltene Themen werden
   * zuerst verarbeitet. Scheitert eine Belegung, wird sauber zurückgesetzt.
   */
  function selectSinglesForCoverage(dataset, groups, series) {
    const bucketStates = EXAM_PART1.map((bucket) => ({
      bucket,
      candidates: candidatesForBucket(dataset, bucket, series),
      selected: [],
    }));
    const findBugBucket = {
      bucket: {
        key: 'find-bug',
        take: EXAM_FINDBUG_COUNT,
        filter: (q) => q.type === 'find-bug',
      },
      candidates: candidatesForBucket(dataset, {
        filter: (q) => q.type === 'find-bug',
      }, series),
      selected: [],
    };
    const allStates = bucketStates.concat(findBugBucket);
    if (allStates.some((state) => state.candidates.length < state.bucket.take)) return null;

    const usedFamilies = new Set();
    const usedIds = new Set();
    const conversionState = bucketStates.find((state) => state.bucket.key === 'conversion');
    const conversions = chooseConversions(dataset, conversionState.candidates, usedFamilies);
    if (!conversions) return null;
    conversionState.selected.push(...conversions);
    conversions.forEach((q) => usedIds.add(q.id));

    const covered = new Set();
    groups.forEach((group) => coverageTopicsOfGroup(group).forEach((id) => covered.add(id)));
    conversions.forEach((q) => coverageTopicsOfQuestion(q).forEach((id) => covered.add(id)));

    const activeTopics = dataset.topics.map((topic) => topic.id);
    const initialMissing = activeTopics.filter((id) => !covered.has(id));
    const selectableStates = bucketStates
      .filter((state) => state.bucket.key !== 'conversion')
      .concat(findBugBucket);
    let visited = 0;

    function search(missing) {
      visited += 1;
      if (visited > 120000) return null;
      if (missing.length === 0) {
        const snapshots = selectableStates.map((state) => state.selected.length);
        const familySnapshot = new Set(usedFamilies);
        const idSnapshot = new Set(usedIds);
        const complete = selectableStates.every((state) =>
          fillBucket(
            dataset,
            state.candidates,
            state.bucket.take,
            state.selected,
            usedFamilies,
            usedIds,
          ));
        if (complete) return true;
        selectableStates.forEach((state, index) => { state.selected.length = snapshots[index]; });
        usedFamilies.clear();
        familySnapshot.forEach((value) => usedFamilies.add(value));
        usedIds.clear();
        idSnapshot.forEach((value) => usedIds.add(value));
        return null;
      }

      let chosenTopic = null;
      let chosenOptions = null;
      for (const topicId of missing) {
        const options = [];
        for (const state of selectableStates) {
          if (state.selected.length >= state.bucket.take) continue;
          for (const q of state.candidates) {
            const familyIndex = familyIndexForQuestion(dataset, q);
            if (usedIds.has(q.id) || usedFamilies.has(familyIndex)) continue;
            if (coverageTopicsOfQuestion(q).includes(topicId)) options.push({ state, q, familyIndex });
          }
        }
        if (options.length === 0) return null;
        if (!chosenOptions || options.length < chosenOptions.length) {
          chosenTopic = topicId;
          chosenOptions = options;
        }
      }

      for (const option of shuffle(chosenOptions).slice(0, 40)) {
        const { state, q, familyIndex } = option;
        state.selected.push(q);
        usedIds.add(q.id);
        usedFamilies.add(familyIndex);
        const qCoverage = new Set(coverageTopicsOfQuestion(q));
        const nextMissing = missing.filter((id) => !qCoverage.has(id));
        if (search(nextMissing)) return true;
        state.selected.pop();
        usedIds.delete(q.id);
        usedFamilies.delete(familyIndex);
      }
      return null;
    }

    if (!search(initialMissing)) return null;
    const questions = [];
    for (const state of allStates) questions.push(...state.selected);
    return questions;
  }

  function groupCandidates(dataset, series) {
    const requiredRound = series.generatedCount + 1;
    return shuffle(dataset.groupOrder
      .map((id) => dataset.groups[id])
      .filter((group) =>
        group.examOnly === true &&
        (!Number.isInteger(group.examSeriesRound) || group.examSeriesRound === requiredRound) &&
        !series.usedVariantKeys.has('g:' + group.id) &&
        !series.usedFingerprints.has(groupFingerprint(group))));
  }

  function groupCombinations(dataset, candidates) {
    const combinations = [];
    for (let a = 0; a < candidates.length - 3; a++) {
      for (let b = a + 1; b < candidates.length - 2; b++) {
        for (let c = b + 1; c < candidates.length - 1; c++) {
          for (let d = c + 1; d < candidates.length; d++) {
            const groups = [candidates[a], candidates[b], candidates[c], candidates[d]];
            const families = groups.map((group) =>
              dataset.familyByUnitKey['g:' + group.id]);
            const archetypes = groups.map((group) => group.examArchetype);
            if (new Set(families).size === EXAM_GROUP_COUNT &&
                new Set(archetypes).size === EXAM_GROUP_COUNT) {
              combinations.push(groups);
            }
          }
        }
      }
    }
    return shuffle(combinations).sort((left, right) => {
      const l = new Set(left.flatMap(coverageTopicsOfGroup)).size;
      const r = new Set(right.flatMap(coverageTopicsOfGroup)).size;
      return r - l;
    });
  }

  function buildExam(dataset, options) {
    const stored = options && (options.seriesSelection || options.recentSelection) || {};
    const series = {
      generatedCount: Number(stored.generatedCount) || 0,
      usedVariantKeys: new Set(Array.isArray(stored.variantKeys) ? stored.variantKeys : []),
      usedFingerprints: new Set(Array.isArray(stored.fingerprints) ? stored.fingerprints : []),
    };
    if (series.generatedCount >= EXAM_SERIES_LENGTH) {
      const error = new Error('Die Klausurserie ist vollständig. Starten Sie bewusst eine neue Sechser-Serie.');
      error.code = 'EXAM_SERIES_COMPLETE';
      throw error;
    }

    const candidates = groupCandidates(dataset, series);
    if (candidates.length < EXAM_GROUP_COUNT) {
      const error = new Error('Der unverbrauchte Code-Snippet-Pool reicht für diese Klausur nicht aus.');
      error.code = 'EXAM_POOL_EXHAUSTED';
      throw error;
    }

    let chosenGroups = null;
    let chosenQuestions = null;
    for (const groups of groupCombinations(dataset, candidates)) {
      const questions = selectSinglesForCoverage(dataset, groups, series);
      if (questions) {
        chosenGroups = groups;
        chosenQuestions = questions;
        break;
      }
    }
    if (!chosenGroups || !chosenQuestions) {
      const error = new Error(
        'Keine Klausur erfüllt gleichzeitig Themenabdeckung, Anspruch und Wiederholungsschutz. '
        + 'Es wurde keine vereinfachte Ersatzklausur erzeugt.',
      );
      error.code = 'EXAM_CONSTRAINTS_UNSATISFIED';
      throw error;
    }

    const part1 = shuffle(chosenQuestions
      .filter((q) => q.type !== 'find-bug')
      .map((q) => ({ kind: 'single', q })));
    const part2 = chosenGroups.map((group) => ({ kind: 'group', group }))
      .concat(chosenQuestions
        .filter((q) => q.type === 'find-bug')
        .map((q) => ({ kind: 'single', q })));
    const units = part1.concat(part2);
    const coverageTopics = new Set();
    for (const unit of units) {
      const values = unit.kind === 'group'
        ? coverageTopicsOfGroup(unit.group)
        : coverageTopicsOfQuestion(unit.q);
      values.forEach((id) => coverageTopics.add(id));
    }
    const missingTopics = dataset.topics
      .map((topic) => topic.id)
      .filter((id) => !coverageTopics.has(id));
    const maxPoints = units.reduce((sum, unit) => sum + unitQuestions(unit).length, 0);
    if (units.length !== 45 || maxPoints !== 81 || missingTopics.length > 0) {
      const error = new Error(`Interner Klausurvalidator fehlgeschlagen: ${missingTopics.join(', ')}`);
      error.code = 'EXAM_VALIDATION_FAILED';
      throw error;
    }

    return {
      units,
      maxPoints,
      coverageTopics: [...coverageTopics],
      seriesNumber: series.generatedCount + 1,
      options: {
        timed: !!(options && options.timed),
        minutes: (options && options.minutes) || 90,
        negative: !!(options && options.negative),
      },
      startedAt: Date.now(),
    };
  }

  function examSelectionSummary(dataset, exam) {
    const familyKeys = [];
    const variantKeys = [];
    const fingerprints = [];
    for (const unit of exam.units) {
      const key = unitKey(unit);
      const familyIndex = dataset.familyByUnitKey[key];
      if (Number.isInteger(familyIndex)) familyKeys.push(dataset.families[familyIndex].key);
      variantKeys.push(key);
      fingerprints.push(unit.kind === 'group'
        ? groupFingerprint(unit.group)
        : questionFingerprint(unit.q));
    }
    return {
      familyKeys: [...new Set(familyKeys)],
      variantKeys: [...new Set(variantKeys)],
      fingerprints: [...new Set(fingerprints)],
      coverageTopics: Array.isArray(exam.coverageTopics) ? exam.coverageTopics.slice() : [],
    };
  }

  // ---------------------------------------------------------------------------
  // Bewertung
  // ---------------------------------------------------------------------------

  /** Normalisierung für Kurzantworten: Groß/Klein, Leerzeichen, 0x/0b, führende Nullen. */
  function normalizeShort(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '');
  }

  function normalizeNumberish(s) {
    let n = normalizeShort(s);
    n = n.replace(/^([+-]?)0[xb]/, '$1');    // 0x / 0b Präfix tolerieren
    n = n.replace(/^([+-]?)0+(?=[0-9a-f])/, '$1'); // führende Nullen tolerieren
    return n;
  }

  function shortAnswerMatches(q, input) {
    const given = normalizeShort(input);
    if (given.length === 0) return false;
    const accepted = [q.answer].concat(Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : []);
    for (const a of accepted) {
      if (given === normalizeShort(a)) return true;
      if (normalizeNumberish(given) === normalizeNumberish(a)) return true;
    }
    return false;
  }

  function normalizeBugCorrection(value, caseSensitive) {
    const source = String(value == null ? '' : value)
      .trim()
      .replace(/[„“”]/g, '"')
      .replace(/[’]/g, "'");
    let normalized = '';
    let quote = '';
    let escaped = false;

    // Formatierung außerhalb von Zeichen- und Stringliteralen ignorieren.
    // Leerzeichen innerhalb eines Literals sind dagegen Teil des C-Codes.
    for (const char of source) {
      if (quote) {
        normalized += char;
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === quote) {
          quote = '';
        }
      } else if (char === '"' || char === "'") {
        quote = char;
        normalized += char;
      } else if (!/\s/.test(char)) {
        normalized += char;
      }
    }

    if (!caseSensitive) normalized = normalized.toLowerCase();
    return normalized;
  }

  function bugCorrectionMatches(target, correction, line) {
    const caseSensitive = target.caseSensitive !== false;
    const given = normalizeBugCorrection(correction, caseSensitive);
    if (!given) return false;
    const acceptedLines = Array.isArray(target.acceptedLines) ? target.acceptedLines : [target.line];
    if (Number.isInteger(line) && !acceptedLines.includes(line)) return false;
    return target.acceptedCorrectedLines.some((accepted) =>
      given === normalizeBugCorrection(accepted, caseSensitive));
  }

  /**
   * Strukturierte Fehlersuche bewerten.
   * answer = { marks: [{ line: 3, correction: "int f(int x) {" }, ...] }
   *
   * Für "richtig" müssen alle Fehlerkonzepte mit zulässiger Zeile UND
   * vollständig korrigierter Codezeile getroffen sein; zusätzliche Markierungen
   * sind falsch.
   * Die Detailzahlen ermöglichen in der UI trotzdem hilfreiches Teilfeedback.
   */
  function gradeFindBug(q, answer) {
    const targets = isStructuredFindBug(q) ? q.bugTargets : [];
    const rawMarks = answer && typeof answer === 'object' && Array.isArray(answer.marks)
      ? answer.marks : [];
    const marks = rawMarks
      .filter((mark) => mark && Number.isInteger(mark.line) && mark.line > 0)
      .map((mark) => ({ line: mark.line, correction: String(mark.correction || '') }));

    const usedMarks = new Set();
    const matchedTargets = [];
    const locationTargets = [];

    for (const target of targets) {
      const acceptedLines = Array.isArray(target.acceptedLines) ? target.acceptedLines : [target.line];
      const locationIndex = marks.findIndex((mark) => acceptedLines.includes(mark.line));
      if (locationIndex >= 0) locationTargets.push(target.id);

      const exactIndex = marks.findIndex((mark, index) =>
        !usedMarks.has(index) && acceptedLines.includes(mark.line) &&
        bugCorrectionMatches(target, mark.correction, mark.line));
      if (exactIndex >= 0) {
        usedMarks.add(exactIndex);
        matchedTargets.push(target.id);
      }
    }

    const wrongMarks = marks.filter((_, index) => !usedMarks.has(index));
    const missingTargets = targets.filter((target) => !matchedTargets.includes(target.id));
    const answered = marks.length > 0;
    const correct = answered && matchedTargets.length === targets.length &&
      marks.length === targets.length && wrongMarks.length === 0;

    return {
      answered,
      correct,
      total: targets.length,
      marked: marks.length,
      locationHits: locationTargets.length,
      correctionHits: matchedTargets.length,
      matchedTargets,
      wrongMarks,
      missingTargets,
    };
  }

  /** Ist überhaupt eine Antwort abgegeben worden? (relevant fürs Negativ-Marking) */
  function isAnswered(q, answer) {
    if (answer == null) return false;
    switch (q.type) {
      case 'mc-multi':
        return Array.isArray(answer) && answer.length > 0;
      case 'find-bug':
        if (isStructuredFindBug(q)) {
          return typeof answer === 'object' && Array.isArray(answer.marks) && answer.marks.length > 0;
        }
        return Array.isArray(answer) && answer.length > 0;
      case 'short-answer':
        return normalizeShort(answer).length > 0;
      case 'code-explain':
        return typeof answer === 'object' && typeof answer.self === 'boolean';
      default:
        return Number.isInteger(answer);
    }
  }

  /**
   * Eine Einzelfrage bewerten. answer je nach Typ:
   * Index (Radio), Index-Array (Checkbox), String (Kurzantwort),
   * { self: bool } (code-explain, Selbsteinschätzung).
   */
  function gradeSingle(q, answer) {
    if (!isAnswered(q, answer)) return { answered: false, correct: false };
    switch (q.type) {
      case 'mc-single':
      case 'predict-output':
      case 'true-false':
        return { answered: true, correct: answer === q.answerIndex };
      case 'mc-multi':
      case 'find-bug': {
        if (isStructuredFindBug(q)) return gradeFindBug(q, answer);
        const want = new Set(q.answerIndices);
        const got = new Set(answer);
        const correct = want.size === got.size && [...want].every((i) => got.has(i));
        return { answered: true, correct };
      }
      case 'short-answer':
        return { answered: true, correct: shortAnswerMatches(q, answer) };
      case 'code-explain':
        return { answered: true, correct: !!answer.self };
      default:
        return { answered: false, correct: false };
    }
  }

  /** Notenschätzung nach üblichem Hochschulschlüssel (Bestehensgrenze 50 %). */
  function estimateGrade(percent) {
    const table = [
      [95, '1,0'], [90, '1,3'], [85, '1,7'], [80, '2,0'], [75, '2,3'],
      [70, '2,7'], [65, '3,0'], [60, '3,3'], [55, '3,7'], [50, '4,0'],
    ];
    for (const [minP, grade] of table) {
      if (percent >= minP) return grade;
    }
    return '5,0';
  }

  const NEGATIVE_PENALTY = 0.5; // Punktabzug pro unbeantworteter Frage/Aussage

  /**
   * Klausur auswerten.
   * answers: Map questionId → Antwort (siehe gradeSingle).
   * Liefert Gesamtergebnis, Ergebnis pro Frage und Themen-Schwächen.
   */
  function gradeExam(dataset, exam, answers) {
    const perQuestion = [];
    let points = 0;
    let unansweredCount = 0;
    const topicAgg = {};

    for (const unit of exam.units) {
      for (const q of unitQuestions(unit)) {
        const res = gradeSingle(q, answers[q.id]);
        let p = 0;
        if (res.correct) p = 1;
        else if (!res.answered) {
          unansweredCount += 1;
          if (exam.options.negative) p = -NEGATIVE_PENALTY;
        }
        points += p;
        perQuestion.push({ q, unit, answer: answers[q.id], answered: res.answered, correct: res.correct, points: p });

        let t = topicAgg[q.topicId];
        if (!t) { t = { total: 0, correct: 0 }; topicAgg[q.topicId] = t; }
        t.total += 1;
        if (res.correct) t.correct += 1;
      }
    }

    points = Math.max(0, Math.round(points * 2) / 2);
    const percent = exam.maxPoints > 0 ? (points / exam.maxPoints) * 100 : 0;

    const weakTopics = Object.keys(topicAgg)
      .map((id) => ({
        topicId: id,
        topic: dataset.topicById[id],
        total: topicAgg[id].total,
        correct: topicAgg[id].correct,
        rate: topicAgg[id].correct / topicAgg[id].total,
      }))
      .sort((a, b) => a.rate - b.rate || b.total - a.total);

    return {
      points,
      maxPoints: exam.maxPoints,
      percent,
      grade: estimateGrade(percent),
      passed: percent >= 50,
      unansweredCount,
      perQuestion,
      weakTopics,
      negativePenalty: exam.options.negative ? NEGATIVE_PENALTY : 0,
    };
  }

  CKT.engine = {
    DIFFICULTIES,
    prepare,
    overallProgress,
    validateQuestion,
    isStructuredFindBug,
    toUnits,
    unitQuestions,
    unitKey,
    createPracticeSession,
    buildReviewPool,
    drawReviewQuestion,
    buildExam,
    examSelectionSummary,
    questionFingerprint,
    groupFingerprint,
    coverageTopicsOfQuestion,
    coverageTopicsOfGroup,
    gradeSingle,
    isAnswered,
    shortAnswerMatches,
    bugCorrectionMatches,
    gradeFindBug,
    normalizeShort,
    estimateGrade,
    gradeExam,
    shuffle,
  };
})();
