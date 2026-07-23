#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'data', 'questions.json'), 'utf8'));
const ckt = {
  storage: {
    isDone: () => false,
    getRecord: () => null,
    getRunSeed: () => 0,
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
const findBugQuestions = raw.questions.filter((q) => q.type === 'find-bug');

assert.equal(raw.meta.version, '1.3', 'Der Fragenpool muss die Datenversion 1.3 verwenden.');
assert.equal(dataset.skipped, 0, 'Keine aktive Frage darf an der Validierung scheitern.');
assert.equal(findBugQuestions.length, 30, 'Der Pool muss weiterhin 30 Fehlersuchaufgaben enthalten.');
assert.ok(findBugQuestions.every(engine.isStructuredFindBug),
  'Jede Fehlersuchaufgabe benötigt strukturierte Fehlerziele.');

for (const question of findBugQuestions) {
  assert.equal(engine.validateQuestion(question), true, `${question.id} ist nicht valide.`);

  const correctAnswer = {
    marks: question.bugTargets.map((target) => ({
      line: target.line,
      correction: target.acceptedCorrections[0],
    })),
  };
  const correctResult = engine.gradeFindBug(question, correctAnswer);
  assert.equal(correctResult.correct, true, `${question.id}: Musterkorrektur wurde abgelehnt.`);

  const locationsOnly = {
    marks: question.bugTargets.map((target) => ({ line: target.line, correction: '' })),
  };
  const locationResult = engine.gradeFindBug(question, locationsOnly);
  assert.equal(locationResult.correct, false, `${question.id}: Leere Korrekturen dürfen nicht genügen.`);
  assert.equal(locationResult.locationHits, question.bugTargets.length,
    `${question.id}: Richtig markierte Zeilen müssen als Treffer erkannt werden.`);

  const extraMark = {
    marks: correctAnswer.marks.concat({ line: 999, correction: 'kein Fehler' }),
  };
  assert.equal(engine.gradeFindBug(question, extraMark).correct, false,
    `${question.id}: Eine zusätzliche falsche Markierung muss die Antwort falsch machen.`);
}

const constQuestion = findBugQuestions.find((q) => q.id === 'Q-001373');
const constAnswer = {
  marks: [
    { line: 2, correction: '#include <math.h>' },
    { line: 4, correction: 'double pi = 3.14159;' },
  ],
};
assert.equal(engine.gradeFindBug(constQuestion, constAnswer).correct, true,
  'Die alternative Reparatur an Zeile 4 muss akzeptiert werden.');
assert.equal(engine.gradeFindBug(constQuestion, {
  marks: [
    { line: 2, correction: '#include <math.h>' },
    { line: 4, correction: 'Zeile löschen' },
  ],
}).correct, false, 'Eine Reparatur darf nicht an einer unpassenden Alternativzeile akzeptiert werden.');
assert.equal(engine.gradeFindBug(constQuestion, {
  marks: [
    { line: 2, correction: '#include <math.h>' },
    { line: 5, correction: 'const entfernen' },
  ],
}).correct, false, 'Eine Reparatur muss zur markierten Zeile passen.');

const printfDoubleQuestion = findBugQuestions.find((q) => q.id === 'Q-001376');
const printfDoubleAnswer = {
  marks: printfDoubleQuestion.bugTargets.map((target) => ({
    line: target.line,
    correction: target.id === 'double-format' ? '%f' : target.acceptedCorrections[0],
  })),
};
assert.equal(engine.gradeFindBug(printfDoubleQuestion, printfDoubleAnswer).correct, true,
  'Bei printf muss %f für einen double-Wert als korrekte Reparatur gelten.');

const caseQuestion = findBugQuestions.find((q) => q.id === 'Q-001352');
const caseAnswer = {
  marks: caseQuestion.bugTargets.map((target) => ({
    line: target.line,
    correction: target.id === 'function-case'
      ? 'QUADRAT(zahl)'
      : target.acceptedCorrections[0],
  })),
};
assert.equal(engine.gradeFindBug(caseQuestion, caseAnswer).correct, false,
  'Groß-/Kleinschreibung darf bei Bezeichnern nicht ignoriert werden.');

const legacyQuestion = JSON.parse(JSON.stringify(caseQuestion));
delete legacyQuestion.bugTargets;
assert.equal(engine.validateQuestion(legacyQuestion), true,
  'Das bisherige Optionsformat muss weiterhin valide bleiben.');
assert.equal(engine.gradeSingle(legacyQuestion, legacyQuestion.answerIndices).correct, true,
  'Das bisherige Optionsformat muss weiterhin korrekt bewertet werden.');

for (let i = 0; i < 100; i += 1) {
  const exam = engine.buildExam(dataset, { timed: false, negative: false });
  assert.equal(exam.units.length, 45, 'Eine Klausur muss aus 45 Einheiten bestehen.');
  assert.equal(exam.maxPoints, 81, 'Eine Klausur muss weiterhin 81 Punkte umfassen.');
  assert.equal(exam.units.filter((unit) => unit.kind === 'group').length, 4,
    'Eine Klausur muss vier Snippet-Gruppen enthalten.');
  assert.equal(exam.units.filter((unit) =>
    unit.kind === 'single' && unit.q.type === 'find-bug').length, 1,
  'Eine Klausur muss genau eine Fehlersuchaufgabe enthalten.');
}

const embeddedSource = fs.readFileSync(path.join(root, 'data', 'questions.js'), 'utf8')
  .replace(/^\uFEFF/, '');
const embeddedSandbox = { window: {} };
vm.createContext(embeddedSandbox);
vm.runInContext(embeddedSource, embeddedSandbox, { filename: 'data/questions.js' });
assert.deepEqual(
  JSON.parse(JSON.stringify(embeddedSandbox.window.CKT_EMBEDDED_DATA)),
  raw,
  'questions.json und die eingebettete questions.js müssen identisch sein.',
);

console.log(`OK: ${findBugQuestions.length} Fehlersuchaufgaben und 100 Klausuren geprüft.`);
