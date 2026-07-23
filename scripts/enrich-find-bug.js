/*
 * Ergänzt die vorhandenen find-bug-Fragen um direkt im Code bewertbare
 * Fehlerstellen. Die bisherigen options/answerIndices bleiben als
 * Rückwärtskompatibilität und redaktionelle Quelle erhalten.
 *
 * Aufruf im Repository-Root:
 *   node scripts/enrich-find-bug.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JSON_FILE = path.join(ROOT, 'data', 'questions.json');
const JS_FILE = path.join(ROOT, 'data', 'questions.js');

const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
const questions = data.questions.filter((q) => q.type === 'find-bug');
data.meta.version = '1.1';

function correctDescriptions(q) {
  return q.answerIndices.map((i) => q.options[i]);
}

function description(q, pattern) {
  const hit = correctDescriptions(q).find((text) => pattern.test(text));
  if (!hit) throw new Error(`${q.id}: Keine Lösungsbeschreibung für ${pattern}`);
  return hit;
}

function target(q, id, line, solution, acceptedCorrections, pattern, extra) {
  return Object.assign({
    id,
    line,
    solution,
    acceptedCorrections,
    description: description(q, pattern),
  }, extra || {});
}

function setTargets(ids, build) {
  for (const id of ids) {
    const q = questions.find((item) => item.id === id);
    if (!q) throw new Error(`Frage fehlt: ${id}`);
    q.prompt = 'Markieren Sie alle Fehler direkt im Code und tragen Sie jeweils eine Korrektur ein.';
    q.bugTargets = build(q);
  }
}

setTargets(['Q-001352', 'Q-001353', 'Q-001354'], (q) => {
  const functionMatch = q.code.match(/int (\w+)\(int (\w+)\)/);
  const functionName = functionMatch[1];
  const variable = functionMatch[2];
  const functionHead = `int ${functionName}(int ${variable}) {`;
  return [
    target(q, 'function-brace', 3, '{', ['{', functionHead], /Funktionskopf/, {}),
    target(q, 'return-semicolon', 5, ';', [';', 'return ergebnis;'], /return ergebnis/),
    target(q, 'scanf-address', 10, `&${variable}`, [
      `&${variable}`,
      `scanf("%d", &${variable});`,
      `scanf("%d",&${variable});`,
    ], /Adress-Operator/),
    target(q, 'function-case', 11, `${functionName}(${variable})`, [
      functionName,
      `${functionName}(${variable})`,
      `printf("%d", ${functionName}(${variable}));`,
      `printf("%d",${functionName}(${variable}));`,
    ], /Groß-\/Kleinschreibung/, { caseSensitive: true }),
  ];
});

setTargets(['Q-001355', 'Q-001356', 'Q-001357'], (q) => {
  const declaration = q.code.match(/int a = (\d+)/)[0];
  return [
    target(q, 'declaration-semicolon', 4, ';', [';', `${declaration};`], /int a = \d+ fehlt/),
    target(q, 'printf-semicolon', 7, ';', [';', 'printf("%d", summe);', 'printf("%d",summe);'], /printf-Aufruf/),
    target(q, 'main-closing-brace', 9, '}', ['}'], /geschweifte Klammer von main/),
  ];
});

setTargets(['Q-001358', 'Q-001359', 'Q-001360'], (q) => {
  const condition = q.code.match(/if \(x = (\d+)\)/);
  const value = condition[1];
  return [
    target(q, 'comparison-operator', 5, '==', [
      '==',
      `x == ${value}`,
      `if (x == ${value}) {`,
      `if(x==${value}){`,
    ], /Zuweisung x = \d+ statt/),
    target(q, 'printf-semicolon', 6, ';', [';', 'printf("gleich");'], /printf\("gleich"\)/),
  ];
});

setTargets(['Q-001361', 'Q-001362', 'Q-001363'], (q) => {
  const variable = q.code.match(/int (\w+) = 0;/)[1];
  return [
    target(q, 'scanf-address', 6, `&${variable}`, [
      `&${variable}`,
      `scanf("%d", &${variable});`,
      `scanf("%d",&${variable});`,
    ], /Adress-Operator/),
    target(q, 'double-format', 7, '%lf', [
      '%lf',
      'scanf("%lf", &preis);',
      'scanf("%lf",&preis);',
    ], /Specifier %lf/),
  ];
});

setTargets(['Q-001364', 'Q-001365', 'Q-001366'], (q) => {
  const functionName = q.code.match(/printf\("%d", (\w+)\(/)[1];
  const returnLine = q.code.split(/\r?\n/).find((line) => /return /.test(line) && !/return 0/.test(line)).trim();
  return [
    target(q, 'function-prototype', 2, `int ${functionName}(int s);`, [
      `int ${functionName}(int s);`,
      `int ${functionName}(int);`,
    ], /Prototyp/),
    target(q, 'return-semicolon', 9, ';', [';', `${returnLine};`], /Nach return/),
  ];
});

setTargets(['Q-001367', 'Q-001368', 'Q-001369'], (q) => {
  const functionName = q.code.match(/void (\w+)\(/)[1];
  const printfLine = q.code.split(/\r?\n/)[10].trim();
  return [
    target(q, 'return-type', 3, 'int', [
      'int',
      `int ${functionName}(int a, int b) {`,
      `int ${functionName}(int a,int b){`,
    ], /Rückgabetyp void/),
    target(q, 'printf-semicolon', 11, ';', [
      ';',
      `${printfLine};`,
    ], /printf-Aufruf/),
  ];
});

setTargets(['Q-001370', 'Q-001371', 'Q-001372'], (q) => {
  const declared = q.code.match(/int (\w+) =/)[1];
  const wrong = declared[0].toUpperCase() + declared.slice(1);
  const correctedLine = q.code.split(/\r?\n/)[5].trim().replace(wrong, declared);
  return [
    target(q, 'identifier-case', 6, declared, [
      declared,
      correctedLine,
    ], new RegExp(`${wrong} ist nicht deklariert`), { caseSensitive: true }),
    target(q, 'loop-closing-brace', 7, '}', ['}'], /Klammer der for-Schleife/),
  ];
});

setTargets(['Q-001373', 'Q-001374', 'Q-001375'], (q) => [
  target(q, 'math-header', 2, '#include <math.h>', [
    '#include <math.h>',
  ], /math\.h/),
  target(q, 'const-reassignment', 5, 'Zuweisung entfernen oder const entfernen', [
    'löschen',
    'zeile löschen',
    'entfernen',
    'zuweisung entfernen',
    'const entfernen',
    'double pi = 3.14159;',
  ], /const-Variablen/, {
    acceptedLines: [4, 5],
    acceptedRepairs: [
      {
        line: 4,
        corrections: ['const entfernen', 'double pi = 3.14159;'],
      },
      {
        line: 5,
        corrections: ['löschen', 'zeile löschen', 'entfernen', 'zuweisung entfernen'],
      },
    ],
  }),
]);

setTargets(['Q-001376', 'Q-001377', 'Q-001378'], (q) => {
  const declaration = q.code.split(/\r?\n/)[3].trim();
  return [
    target(q, 'declaration-semicolon', 4, ';', [';', `${declaration};`], /double a .* fehlt/),
    target(q, 'double-format', 6, '%f oder %lf', [
      '%f',
      '%lf',
      'printf("%f", q);',
      'printf("%.2f", q);',
      'printf("%lf", q);',
      'printf("%.2lf", q);',
      'printf("%f",q);',
      'printf("%.2f",q);',
      'printf("%lf",q);',
      'printf("%.2lf",q);',
    ], /Specifier %d/),
  ];
});

setTargets(['Q-001379', 'Q-001380', 'Q-001381'], (q) => {
  const limit = q.code.match(/i < (\d+)/)[1];
  return [
    target(q, 'for-separators', 4, 'Semikolons statt Kommas', [
      ';;',
      '; ;',
      'semikolons statt kommas',
      `for (int i = 0; i < ${limit}; i++) {`,
      `for(int i=0;i<${limit};i++){`,
    ], /Semikolons getrennt/),
    target(q, 'printf-semicolon', 5, ';', [';', 'printf("%d ", i);', 'printf("%d ",i);'], /printf-Aufruf/),
  ];
});

for (const q of questions) {
  if (!Array.isArray(q.bugTargets) || q.bugTargets.length === 0) {
    throw new Error(`${q.id}: Keine bugTargets erzeugt`);
  }
}

const json = JSON.stringify(data, null, 1) + '\n';
fs.writeFileSync(JSON_FILE, json, 'utf8');
fs.writeFileSync(JS_FILE, '\uFEFFwindow.CKT_EMBEDDED_DATA = ' + JSON.stringify(data, null, 1) + ';\r\n', 'utf8');

console.log(`${questions.length} find-bug-Fragen mit strukturierten Fehlerstellen aktualisiert.`);
