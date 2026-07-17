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
      case 'find-bug':
        return hasOptions && isIndexArray(q.answerIndices, q.options.length);
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
            questions: [],
          };
          result.groups[q.group] = g;
          result.groupOrder.push(q.group);
        }
        if (!g.code && isNonEmptyString(q.code)) g.code = q.code;
        if (!g.groupPrompt && isNonEmptyString(q.groupPrompt)) g.groupPrompt = q.groupPrompt;
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
        fam = { key, units: [] };
        byKey.set(key, fam);
        dataset.families.push(fam);
      }
      fam.units.push(u);
      dataset.familyByUnitKey[unitKey(u)] = dataset.families.length - 1;
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

  /** Fortschritt in Familien ("Konzepten") + Fragen über den ganzen Pool. */
  function overallProgress(dataset) {
    let doneF = 0;
    for (const fam of dataset.families) {
      if (fam.units.some(unitFullyDone)) doneF += 1;
    }
    let answeredQ = 0;
    for (const q of dataset.questions) {
      const r = CKT.storage.getRecord(q.id);
      if (r && r.s > 0) answeredQ += 1;
    }
    return {
      families: { total: dataset.families.length, done: doneF, open: dataset.families.length - doneF },
      questions: { total: dataset.questions.length, answered: answeredQ },
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
      // Varianten-Rotation: pro Durchlauf (seed) eine andere Variante
      chosen: units[(hashStr(dataset.families[fi].key) + seed) % units.length],
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
        return { total: families.length, done, open: families.length - done };
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
    return ids.map((id) => dataset.byId[id]).filter(Boolean);
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
    { take: 15, label: 'Einzelaussagen (R/F)', filter: (q) => q.type === 'true-false' && !q.group },
    { take: 8,  label: '„Was trifft zu?"',      filter: (q) => q.type === 'mc-multi' },
    { take: 8,  label: 'Predict-Output',        filter: (q) => q.type === 'predict-output' },
    { take: 6,  label: 'Zahlensysteme',         filter: (q) => q.type === 'short-answer' && q.topicId === 'T-20' },
    { take: 3,  label: 'Einfachauswahl',        filter: (q) => q.type === 'mc-single' },
  ];
  const EXAM_GROUP_COUNT = 4;
  const EXAM_FINDBUG_COUNT = 1;

  function buildExam(dataset, options) {
    const used = new Set();
    const part1 = [];

    for (const bucket of EXAM_PART1) {
      const pool = dataset.questions.filter((q) => !used.has(q.id) && !q.group && bucket.filter(q));
      for (const q of sample(pool, bucket.take)) {
        used.add(q.id);
        part1.push({ kind: 'single', q });
      }
    }
    // Falls ein Topf zu klein war: mit beliebigen Teil-1-tauglichen Fragen auffüllen.
    const target1 = EXAM_PART1.reduce((s, b) => s + b.take, 0);
    if (part1.length < target1) {
      const fillPool = dataset.questions.filter((q) =>
        !used.has(q.id) && !q.group && q.type !== 'find-bug' && q.type !== 'code-explain');
      for (const q of sample(fillPool, target1 - part1.length)) {
        used.add(q.id);
        part1.push({ kind: 'single', q });
      }
    }

    const part2 = [];
    const groupIds = sample(dataset.groupOrder, EXAM_GROUP_COUNT);
    for (const gid of groupIds) {
      part2.push({ kind: 'group', group: dataset.groups[gid] });
    }
    const bugPool = dataset.questions.filter((q) => q.type === 'find-bug' && !q.group);
    for (const q of sample(bugPool, EXAM_FINDBUG_COUNT)) {
      part2.push({ kind: 'single', q });
    }

    const units = shuffle(part1).concat(part2);
    let maxPoints = 0;
    for (const u of units) maxPoints += unitQuestions(u).length;

    return {
      units,
      maxPoints,
      options: {
        timed: !!(options && options.timed),
        minutes: (options && options.minutes) || 90,
        negative: !!(options && options.negative),
      },
      startedAt: Date.now(),
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

  /** Ist überhaupt eine Antwort abgegeben worden? (relevant fürs Negativ-Marking) */
  function isAnswered(q, answer) {
    if (answer == null) return false;
    switch (q.type) {
      case 'mc-multi':
      case 'find-bug':
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
    toUnits,
    unitQuestions,
    unitKey,
    createPracticeSession,
    buildReviewPool,
    drawReviewQuestion,
    buildExam,
    gradeSingle,
    isAnswered,
    shortAnswerMatches,
    normalizeShort,
    estimateGrade,
    gradeExam,
    shuffle,
  };
})();
