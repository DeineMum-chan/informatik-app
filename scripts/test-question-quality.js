#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'data', 'questions.json'), 'utf8'));
let runSeed = 0;
const ckt = {
  storage: {
    isDone: () => false,
    getRecord: () => null,
    getRunSeed: () => runSeed,
    reviewIds: () => [],
  },
};
const sandbox = {
  window: {
    CKT: ckt,
    CKT_CONFIG: { disabledTopics: ['T-24'] },
  },
  CKT: ckt,
  console,
  Set,
  Map,
  Math,
  Date,
};

vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(root, 'js', 'quiz-engine.js'), 'utf8'),
  sandbox,
  { filename: 'js/quiz-engine.js' },
);

const engine = ckt.engine;
const dataset = engine.prepare(raw);
const qualityTag = 'quality-round-2026-07';
const details = raw.questions.filter((q) => q.qualityTag === qualityTag);
const masteryTag = 'mastery-q2-2026-07';
const masteryQuestions = raw.questions.filter((q) => q.qualityTag === masteryTag);
const examSnippetTag = 'exam-snippets-professor-ss25-v1';
const examSnippetQuestions = raw.questions.filter((q) => q.examSnippetPool === examSnippetTag);
const allExamSnippetQuestions = raw.questions.filter((q) => q.examOnly === true && q.group);

assert.equal(raw.meta.version, '1.6', 'Der Fragenpool muss Datenversion 1.6 verwenden.');
assert.equal(raw.questions.length, 1550, 'Der vollständige Pool muss 1550 Fragen enthalten.');
assert.equal(dataset.questions.length, 1450,
  'Nach T-24 und den drei Löschaufgaben müssen 1450 Fragen aktiv sein.');
assert.equal(dataset.skipped, 0, 'Keine aktive Frage darf an der Validierung scheitern.');
assert.equal(details.length, 28, 'Die Qualitätsrunde muss genau 28 Detailfragen enthalten.');
assert.ok(details.every((q) => q.verified && q.familyId && engine.validateQuestion(q)),
  'Jede neue Detailfrage muss verifiziert, familienmarkiert und valide sein.');
assert.ok(details.filter((q) => q.difficulty === 'schwer').length >= 6,
  'Die Qualitätsrunde muss mehrere anspruchsvolle Detailfragen enthalten.');
assert.equal(masteryQuestions.length, 56,
  'Die Q2-Runde muss genau 56 zusätzliche Verständnisvarianten enthalten.');
assert.equal(masteryQuestions.filter((q) => q.type === 'true-false').length, 30,
  'Der Q2-Pool muss 30 klausurnahe Wahr/Falsch-Familien bereitstellen.');
assert.equal(masteryQuestions.filter((q) => q.type === 'mc-single').length, 26,
  'Der Q2-Pool muss 26 anspruchsvollere Einfachauswahlen bereitstellen.');
assert.ok(masteryQuestions.every((q) =>
  q.verified && q.qualityLevel === 2 && q.familyId && q.variantAngle &&
  engine.validateQuestion(q)),
'Jede Q2-Variante muss verifiziert, familienmarkiert, perspektivmarkiert und valide sein.');
assert.equal(examSnippetQuestions.length, 80,
  'Die acht neu geschriebenen Dozentenprogramme müssen zusammen 80 Aussagen besitzen.');
assert.equal(allExamSnippetQuestions.length, 240,
  'Die Sechser-Serie benötigt 24 klausurexklusive Programme mit 240 Aussagen.');
assert.ok(allExamSnippetQuestions.every((q) =>
  q.examOnly === true && q.type === 'true-false' && q.difficulty === 'schwer' &&
  q.verified && q.qualityLevel === 2 && q.examArchetype &&
  Number.isInteger(q.examSeriesRound) && engine.validateQuestion(q)),
'Jede exklusive Snippet-Aussage muss schwer, verifiziert und valide sein.');
const examSnippetGroups = new Map();
for (const q of allExamSnippetQuestions) {
  if (!examSnippetGroups.has(q.group)) examSnippetGroups.set(q.group, []);
  examSnippetGroups.get(q.group).push(q);
}
assert.equal(examSnippetGroups.size, 24,
  'Der Klausurpool muss 24 unterschiedliche Programme enthalten.');
assert.equal(new Set(allExamSnippetQuestions.map((q) => q.familyId)).size, 24,
  'Jedes exklusive Klausurprogramm benötigt eine eigene Familie.');
for (const [groupId, questions] of examSnippetGroups) {
  assert.equal(questions.length, 10, `${groupId}: Ein Programm benötigt exakt zehn Aussagen.`);
  assert.equal(new Set(questions.map((q) => q.prompt)).size, 10,
    `${groupId}: Die zehn Aussagen müssen unterschiedlich sein.`);
  const codeLineCount = questions[0].code.split('\n').length;
  assert.ok(codeLineCount >= 16 && codeLineCount <= 40,
    `${groupId}: Der Dozentenstil benötigt einen zusammenhängenden Codeblock.`);
  const trueCount = questions.filter((q) => q.answerIndex === 0).length;
  assert.ok(trueCount >= 4 && trueCount <= 6,
    `${groupId}: Richtig/Falsch darf nicht einseitig verteilt sein.`);
}
assert.equal(dataset.families.length, 362,
  'Der aktive Gesamtpool muss 362 Familien einschließlich 24 Klausurfamilien bilden.');
assert.deepEqual(
  JSON.parse(JSON.stringify(engine.overallProgress(dataset))),
  {
    families: { total: 338, done: 0, open: 338 },
    questions: { total: 1210, answered: 0 },
  },
  'Klausurexklusive Inhalte dürfen den normalen Lernfortschritt nicht vergrößern.',
);
ckt.storage.reviewIds = () => examSnippetQuestions.map((q) => q.id);
assert.equal(engine.buildReviewPool(dataset).length, 0,
  'Klausurexklusive Aussagen dürfen nicht im Modus Fehler wiederholen erscheinen.');
ckt.storage.reviewIds = () => [];

for (const id of ['Q-001205', 'Q-001215']) {
  const q = raw.questions.find((candidate) => candidate.id === id);
  assert.equal(q.options[q.answerIndex], 'Falsch',
    `${id}: Eine richtige Zahl darf die falsche kausale Aussage nicht wahr machen.`);
}

function topicFamilyIds(topicId, predicate = () => true) {
  const ids = new Set();
  for (const q of dataset.questions.filter((candidate) =>
    candidate.topicId === topicId && predicate(candidate))) {
    const unitKey = q.group ? `g:${q.group}` : `q:${q.id}`;
    ids.add(dataset.familyByUnitKey[unitKey]);
  }
  return ids;
}

assert.equal(topicFamilyIds('T-20').size, 6,
  'Die sechs Umrechnungsrichtungen müssen sechs getrennte Familien sein.');
assert.equal(topicFamilyIds('T-47', (q) => q.examOnly !== true).size, 10,
  'Die 40 Codeblöcke müssen auf zehn echte Snippet-Archetypen gebündelt sein.');
assert.equal(topicFamilyIds('T-47', (q) => q.examOnly === true).size, 24,
  'Die klausurexklusiven Codeblöcke müssen 24 eigenständige Familien bilden.');
assert.equal(topicFamilyIds('T-48').size, 9,
  'Die 27 aktiven Vollzeilen-Fehlersuchaufgaben müssen auf neun Archetypen gebündelt sein.');

const allDifficulties = new Set(['leicht', 'mittel', 'schwer']);
const conversionRun = engine.createPracticeSession(dataset, {
  topicIds: new Set(['T-20']),
  difficulties: allDifficulties,
});
assert.equal(conversionRun.stats().total, 6,
  'Ein T-20-Durchlauf muss aus sechs Konzepten statt 156 Zahlenvarianten bestehen.');
const conversionRunFamilies = new Set();
for (let i = 0; i < 6; i += 1) {
  const unit = conversionRun.next();
  conversionRunFamilies.add(dataset.familyByUnitKey[`q:${unit.q.id}`]);
}
assert.equal(conversionRunFamilies.size, 6,
  'Im T-20-Durchlauf muss jede Umrechnungsrichtung genau einmal erscheinen.');

const snippetRun = engine.createPracticeSession(dataset, {
  topicIds: new Set(['T-47']),
  difficulties: allDifficulties,
});
assert.equal(snippetRun.stats().total, 10,
  'Ein T-47-Durchlauf muss aus zehn Code-Archetypen statt 40 Namensvarianten bestehen.');
const snippetRunFamilies = new Set();
for (let i = 0; i < 10; i += 1) {
  const unit = snippetRun.next();
  assert.notEqual(unit.group.examOnly, true,
    'Ein klausurexklusives Snippet darf nicht im Übungsmodus erscheinen.');
  snippetRunFamilies.add(dataset.familyByUnitKey[`g:${unit.group.id}`]);
}
assert.equal(snippetRunFamilies.size, 10,
  'Im T-47-Durchlauf muss jeder Code-Archetyp genau einmal erscheinen.');

const q2Filters = {
  topicIds: new Set(dataset.topics.map((topic) => topic.id)),
  difficulties: new Set(['mittel', 'schwer']),
};

function selectedUnitsByFamily(session) {
  const selected = new Map();
  const total = session.stats().total;
  for (let i = 0; i < total; i += 1) {
    const unit = session.next();
    const key = engine.unitKey(unit);
    const familyIndex = dataset.familyByUnitKey[key];
    selected.set(dataset.families[familyIndex].key, unit);
  }
  return selected;
}

runSeed = 0;
const q2RunA = engine.createPracticeSession(dataset, q2Filters);
assert.equal(q2RunA.stats().total, 116,
  'Der normale Q2-Durchlauf muss 116 semantische Konzeptfamilien enthalten.');
assert.equal(q2RunA.stats().singleVariant, 0,
  'Keine Q2-Familie darf nur eine auswählbare Variante besitzen.');
const selectedA = selectedUnitsByFamily(q2RunA);

runSeed = 1;
const q2RunB = engine.createPracticeSession(dataset, q2Filters);
const selectedB = selectedUnitsByFamily(q2RunB);
for (const [familyKey, unitA] of selectedA) {
  assert.notEqual(
    engine.unitKey(unitA),
    engine.unitKey(selectedB.get(familyKey)),
    `${familyKey}: Zwei aufeinanderfolgende Q2-Durchläufe dürfen nicht dieselbe Variante zeigen.`,
  );
}

const q2Topics = new Set();
for (const unit of selectedA.values()) {
  for (const q of engine.unitQuestions(unit)) q2Topics.add(q.topicId);
}
assert.equal(q2Topics.size, dataset.topics.length,
  'Der Q2-Durchlauf muss jedes aktive Thema abdecken.');
runSeed = 0;

const expectedT20Families = new Set([
  'T20-dec-to-bin',
  'T20-bin-to-dec',
  'T20-dec-to-hex',
  'T20-hex-to-dec',
  'T20-bin-to-hex',
  'T20-hex-to-bin',
]);

for (let run = 0; run < 100; run += 1) {
  const exam = engine.buildExam(dataset, { timed: false, negative: false });
  assert.equal(exam.units.length, 45, 'Eine Klausur muss aus 45 Einheiten bestehen.');
  assert.equal(exam.maxPoints, 81, 'Eine Klausur muss 81 Punkte umfassen.');

  const singles = exam.units.filter((unit) => unit.kind === 'single');
  const groups = exam.units.filter((unit) => unit.kind === 'group');
  assert.equal(singles.length, 41, 'Eine Klausur muss 41 Einzelfragen enthalten.');
  assert.equal(groups.length, 4, 'Eine Klausur muss vier Snippet-Gruppen enthalten.');
  assert.ok(groups.every((unit) =>
    unit.group.examOnly === true &&
    unit.group.questions.length === 10 &&
    unit.group.code.split('\n').length >= 16),
  'Alle vier Klausurgruppen müssen exklusiv, lang und aus zehn Aussagen aufgebaut sein.');
  assert.equal(singles.filter((unit) => unit.q.type === 'true-false').length, 5,
    'Teil 1 muss fünf Wahr/Falsch-Einzelfragen enthalten.');
  assert.equal(singles.filter((unit) => unit.q.type === 'mc-multi').length, 13,
    'Teil 1 muss 13 Mehrfachauswahlen enthalten.');
  assert.equal(singles.filter((unit) => unit.q.type === 'predict-output').length, 13,
    'Teil 1 muss 13 Predict-Output-Fragen enthalten.');
  assert.equal(singles.filter((unit) => unit.q.type === 'mc-single').length, 3,
    'Teil 1 muss drei Einfachauswahlen enthalten.');
  assert.equal(singles.filter((unit) => unit.q.type === 'find-bug').length, 1,
    'Teil 2 muss genau eine Fehlersuchaufgabe enthalten.');
  assert.equal(singles.filter((unit) => unit.q.difficulty === 'leicht').length, 0,
    'Eine Q2-Klausur darf keine leichte Einzelfrage enthalten.');

  const familyIds = singles.map((unit) => dataset.familyByUnitKey[`q:${unit.q.id}`]);
  assert.equal(new Set(familyIds).size, familyIds.length,
    'Eine Klausur darf keine zwei Einzelfragen derselben Konzeptfamilie enthalten.');

  const groupFamilyIds = groups.map((unit) =>
    dataset.familyByUnitKey[`g:${unit.group.id}`]);
  assert.equal(new Set(groupFamilyIds).size, groupFamilyIds.length,
    'Die vier Codeblöcke müssen aus vier verschiedenen Archetypen stammen.');

  const conversions = singles.filter((unit) =>
    unit.q.type === 'short-answer' && unit.q.topicId === 'T-20');
  assert.equal(conversions.length, 6,
    'Jede Klausur muss alle sechs Umrechnungsrichtungen abdecken.');
  assert.deepEqual(
    new Set(conversions.map((unit) => unit.q.familyId)),
    expectedT20Families,
    'Jede Umrechnungsrichtung darf pro Klausur genau einmal vorkommen.',
  );
  assert.equal(new Set(exam.coverageTopics).size, dataset.topics.length,
    'Jede Klausur muss alle aktiven Themen abdecken.');
}

for (let cycle = 0; cycle < 20; cycle += 1) {
  let seriesSelection = {
    generatedCount: 0,
    familyKeys: [],
    variantKeys: [],
    fingerprints: [],
  };
  for (let number = 1; number <= 6; number += 1) {
    const exam = engine.buildExam(dataset, {
      timed: false,
      negative: false,
      seriesSelection,
    });
    const selection = engine.examSelectionSummary(dataset, exam);
    assert.equal(exam.seriesNumber, number,
      'Die Klausurnummer innerhalb der Serie muss korrekt fortgeschrieben werden.');
    assert.equal(new Set(exam.coverageTopics).size, dataset.topics.length,
      'Jede Serienklausur muss 47/47 Themen abdecken.');
    const usedVariants = new Set(seriesSelection.variantKeys);
    assert.equal(selection.variantKeys.filter((key) => usedVariants.has(key)).length, 0,
      'Innerhalb einer Sechser-Serie darf keine konkrete Variante wiederkehren.');
    const usedFingerprints = new Set(seriesSelection.fingerprints);
    assert.equal(selection.fingerprints.filter((key) => usedFingerprints.has(key)).length, 0,
      'Auch inhaltsgleiche Varianten mit anderer ID dürfen nicht wiederkehren.');
    seriesSelection = {
      generatedCount: number,
      familyKeys: [...seriesSelection.familyKeys, ...selection.familyKeys],
      variantKeys: [...seriesSelection.variantKeys, ...selection.variantKeys],
      fingerprints: [...seriesSelection.fingerprints, ...selection.fingerprints],
    };
  }
  assert.throws(
    () => engine.buildExam(dataset, { seriesSelection }),
    (error) => error && error.code === 'EXAM_SERIES_COMPLETE',
    'Nach sechs Klausuren muss ein expliziter Serien-Neustart erforderlich sein.',
  );
}

const localValues = new Map([
  ['ckt-progress-v1', JSON.stringify({
    perQuestion: {},
    global: { answered: 0, correct: 0 },
    exams: [],
    savedAt: 1,
  })],
]);
const storageCkt = {};
const storageSandbox = {
  window: {
    CKT: storageCkt,
    setTimeout,
    clearTimeout,
    addEventListener: () => {},
  },
  CKT: storageCkt,
  document: {
    visibilityState: 'visible',
    addEventListener: () => {},
  },
  localStorage: {
    getItem: (key) => localValues.get(key) || null,
    setItem: (key, value) => localValues.set(key, value),
    removeItem: (key) => localValues.delete(key),
  },
  fetch: () => Promise.resolve(),
  Date,
  JSON,
  Object,
  Array,
  Number,
  Math,
  console,
};
vm.createContext(storageSandbox);
vm.runInContext(
  fs.readFileSync(path.join(root, 'js', 'storage.js'), 'utf8'),
  storageSandbox,
  { filename: 'js/storage.js' },
);
const storage = storageSandbox.window.CKT.storage;
assert.equal(
  JSON.stringify(storage.getLastExamSelection()),
  JSON.stringify({ familyKeys: [], variantKeys: [] }),
  'Ein alter Speicherstand muss ohne Klausurauswahl-Historie migriert werden.',
);
storage.rememberExamSelection({
  familyKeys: ['E|A', 'E|B'],
  variantKeys: ['q:Q-1', 'g:G-1'],
});
assert.equal(
  JSON.stringify(storage.getLastExamSelection()),
  JSON.stringify({
    familyKeys: ['E|A', 'E|B'],
    variantKeys: ['q:Q-1', 'g:G-1'],
  }),
  'Die letzte Klausurauswahl muss für den Wiederholungsschutz gespeichert werden.',
);
assert.equal(storage.getExamSeries().generatedCount, 0,
  'Ein alter Speicherstand muss mit einer leeren Klausurserie migriert werden.');
storage.rememberExamSeriesSelection({
  familyKeys: ['E|A'],
  variantKeys: ['q:Q-1'],
  fingerprints: ['fingerprint-1'],
});
assert.deepEqual(
  JSON.parse(JSON.stringify(storage.getExamSeries())),
  {
    id: storage.getExamSeries().id,
    generatedCount: 1,
    familyKeys: ['E|A'],
    variantKeys: ['q:Q-1'],
    fingerprints: ['fingerprint-1'],
    createdAt: storage.getExamSeries().createdAt,
  },
  'Der Serienstand muss Varianten und Inhaltsfingerabdrücke dauerhaft sammeln.',
);
storage.resetExamSeries();
assert.equal(storage.getExamSeries().generatedCount, 0,
  'Ein bewusster Serien-Neustart muss den Wiederholungsschutz zurücksetzen.');

console.log(
  `OK: ${details.length} Detailfragen, ${masteryQuestions.length} Q2-Varianten, `
    + '24 exklusive Klausur-Snippets, '
    + `${dataset.families.length} Familien, zwei Q2-Durchläufe und `
    + '100 Einzelklausuren sowie 20 vollständige Sechser-Serien geprüft.',
);
