#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const jsonFile = path.join(root, 'data', 'questions.json');
const jsFile = path.join(root, 'data', 'questions.js');
const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
const byId = new Map(data.questions.map((q) => [q.id, q]));

for (const q of data.questions) delete q.examFamilyRole;

function requireQuestion(id) {
  const q = byId.get(id);
  if (!q) throw new Error(`Frage fehlt: ${id}`);
  return q;
}

function setFamily(question, familyId) {
  question.familyId = familyId;
}

// ---------------------------------------------------------------------------
// Fachliche Korrekturen
// ---------------------------------------------------------------------------

for (const id of ['Q-001205', 'Q-001215']) {
  const q = requireQuestion(id);
  q.answerIndex = 1;
  q.explanation = 'Falsch: Die Begründung ist falsch. Der Vergleich s[i] == c ist case-sensitiv; '
    + 'dass der genannte Zahlenwert zufällig stimmt, macht die gesamte Aussage nicht richtig.';
}

for (const id of ['Q-001376', 'Q-001377', 'Q-001378']) {
  const q = requireQuestion(id);
  const optionIndex = q.options.findIndex((option) => option.includes('Specifier %d'));
  if (optionIndex < 0) throw new Error(`${id}: Format-Specifier-Lösung fehlt`);
  q.options[optionIndex] = 'Der Specifier %d passt nicht zum double-Wert q – bei printf sind %f und %lf korrekt.';
  q.explanation = q.explanation.replace(
    /Der Specifier %d passt nicht zum double-Wert q – korrekt wäre %lf\./,
    'Der Specifier %d passt nicht zum double-Wert q. Bei printf sind %f und %lf für double korrekt; '
      + 'anders als bei scanf ist das l hier nicht erforderlich.',
  );
  const target = q.bugTargets && q.bugTargets.find((item) => item.id === 'double-format');
  if (target) {
    target.solution = '%f oder %lf';
    target.description = q.options[optionIndex];
    target.acceptedCorrections = [
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
    ];
  }
}

// ---------------------------------------------------------------------------
// Explizite semantische Konzeptfamilien
// ---------------------------------------------------------------------------

for (const q of data.questions) {
  if (q.topicId === 'T-20') {
    if (q.prompt.startsWith('Rechnen Sie die vorzeichenlose Dezimalzahl')
        && q.prompt.includes('Binärzahl')) {
      setFamily(q, 'T20-dec-to-bin');
    } else if (q.prompt.startsWith('Rechnen Sie die vorzeichenlose Binärzahl')
        && q.prompt.includes('Dezimalzahl')) {
      setFamily(q, 'T20-bin-to-dec');
    } else if (q.prompt.startsWith('Rechnen Sie die vorzeichenlose Dezimalzahl')
        && q.prompt.includes('Hexadezimalzahl')) {
      setFamily(q, 'T20-dec-to-hex');
    } else if (q.prompt.startsWith('Rechnen Sie die vorzeichenlose Hexadezimalzahl')
        && q.prompt.includes('Dezimalzahl')) {
      setFamily(q, 'T20-hex-to-dec');
    } else if (q.prompt.startsWith('Rechnen Sie die vorzeichenlose Binärzahl')
        && q.prompt.includes('Hexadezimalzahl')) {
      setFamily(q, 'T20-bin-to-hex');
    } else if (q.prompt.startsWith('Rechnen Sie die vorzeichenlose Hexadezimalzahl')
        && q.prompt.includes('Binärzahl')) {
      setFamily(q, 'T20-hex-to-bin');
    }
    // Binär↔Hex ist zwar durch Vierergruppen effizient lösbar, prüft aber
    // weiterhin eine vollständige Umrechnungsrichtung und gehört im
    // klausurnahen Q2-Pool nicht zu den bloßen Einstiegsfragen.
    if (q.familyId === 'T20-bin-to-hex' || q.familyId === 'T20-hex-to-bin') {
      q.difficulty = 'mittel';
    }
  }

  if (q.topicId === 'T-06') {
    const text = `${q.prompt} ${q.code || ''}`;
    if (/%zu|sizeof/.test(text)) setFamily(q, 'T06-size-format');
    else if (/%llu|%u|unsigned/.test(text)) setFamily(q, 'T06-unsigned-formats');
    else if (/%lf|%f|double|float/.test(text)) setFamily(q, 'T06-floating-formats');
    else if (/%s|%c|String|Zeichen/.test(text)) setFamily(q, 'T06-text-formats');
    else setFamily(q, 'T06-signed-integer-formats');
  }

  if (q.topicId === 'T-10') {
    const text = `${q.prompt} ${q.code || ''}`;
    setFamily(q, /double|float/.test(text) ? 'T10-floating-sizes' : 'T10-integer-sizes');
  }

  if (q.topicId === 'T-14') {
    const text = `${q.prompt} ${q.code || ''}`;
    let family = 'T14-general';
    if (/M_PI|π|atan\(1\)/.test(text)) family = 'T14-pi';
    else if (/Rückgabetyp/.test(text)) family = 'T14-return-types';
    else if (/Header|#include|deklariert|Bibliothek/.test(text)) family = 'T14-headers';
    else if (/Radiant|Grad|Winkel|180\/π/.test(text)) family = 'T14-angle-unit';
    else if (/ceil|floor|rundet/.test(text)) family = 'T14-rounding';
    else if (/sqrt|pow|hoch/.test(text)) family = 'T14-powers-roots';
    else if (/fabs|fmod|Betrag/.test(text)) family = 'T14-absolute-modulo';
    else if (/log10|log\(/.test(text)) family = 'T14-logarithms';
    setFamily(q, family);
  }

  if (q.topicId === 'T-25') {
    setFamily(q, q.type === 'predict-output' ? 'T25-precedence-evaluation' : 'T25-precedence-rules');
  }

  if (q.topicId === 'T-37') {
    setFamily(q, q.type === 'mc-multi' ? 'T37-array-size-calculation' : 'T37-sizeof-rules');
  }

  if (q.topicId === 'T-43') {
    if (q.type === 'true-false') setFamily(q, 'T43-struct-basics');
    else if (q.prompt.includes('Struct-Typ')) setFamily(q, 'T43-struct-definition');
    else setFamily(q, 'T43-member-access');
  }

  if (q.topicId === 'T-45') {
    if (q.type === 'mc-multi') setFamily(q, 'T45-combined');
    else if (/Kopie|Referenz|Funktionsaufruf/.test(q.prompt)) setFamily(q, 'T45-pass-by-value');
    else if (/zurückgeben|zurück/.test(q.prompt)) setFamily(q, 'T45-struct-return');
    else setFamily(q, 'T45-struct-size');
  }

  if (q.topicId === 'T-47' && q.group) {
    const groupNumber = Number(q.group.match(/\d+/)[0]);
    const archetype = Math.floor((groupNumber - 1) / 4) + 1;
    setFamily(q, `T47-archetype-${String(archetype).padStart(2, '0')}`);
  }

  if (q.topicId === 'T-48') {
    const questionNumber = Number(q.id.match(/\d+/)[0]);
    const archetype = Math.floor((questionNumber - 1352) / 3) + 1;
    setFamily(q, `T48-archetype-${String(archetype).padStart(2, '0')}`);
  }
}

// Bisherige mittel/schwere Einzelvarianten werden mit den passenden
// Verständnisfamilien verbunden. Dadurch besitzt der Q2-Standardpool keine
// Familie mehr, die beim nächsten Durchlauf wortgleich wiederkommen müsste.
for (const id of ['Q-000793']) {
  const q = requireQuestion(id);
  setFamily(q, 'MASTER-T14-angle-and-pi');
  q.variantAngle = 'rule';
}
for (const id of ['Q-000882', 'Q-000883', 'Q-000886', 'Q-000888']) {
  const q = requireQuestion(id);
  setFamily(q, 'MASTER-T21-char-arithmetic');
  q.variantAngle = 'application';
}
for (const id of ['Q-000906']) {
  const q = requireQuestion(id);
  setFamily(q, 'MASTER-T27-switch-flow');
  q.variantAngle = 'application';
}
for (const id of ['Q-000629', 'Q-000637', 'Q-000641']) {
  const q = requireQuestion(id);
  setFamily(q, 'MASTER-T36-array-init-size');
  q.variantAngle = 'application';
}

// ---------------------------------------------------------------------------
// Anspruchsvollere Detailfragen innerhalb des vorhandenen Stoffs
// ---------------------------------------------------------------------------

const qualityTag = 'quality-round-2026-07';
data.questions = data.questions.filter((q) => q.qualityTag !== qualityTag);
const masterFamilyOverrides = {
  'Q-001388': 'MASTER-T14-angle-and-pi',
  'Q-001392': 'MASTER-T21-char-arithmetic',
  'Q-001396': 'MASTER-T27-switch-flow',
  'Q-001401': 'MASTER-T36-array-init-size',
};

const details = [
  {
    id: 'Q-001382', topicId: 'T-04', type: 'mc-multi', difficulty: 'schwer',
    prompt: 'Was trifft auf dieses Fragment zu?',
    code: '#define LIMIT 5\nint a[LIMIT];',
    options: [
      'Der Präprozessor ersetzt LIMIT, bevor der Compiler die Array-Deklaration verarbeitet.',
      'Hinter #define LIMIT 5 ist kein Semikolon erforderlich.',
      'Erst der Linker entscheidet, welchen Zahlenwert LIMIT besitzt.',
      'Das Array besitzt fünf Elemente mit den gültigen Indizes 0 bis 4.',
    ],
    answerIndices: [0, 1, 3],
    explanation: 'Makros werden vor dem Compiler textuell ersetzt. Die Direktive endet nicht mit einem '
      + 'Semikolon; nach der Ersetzung sieht der Compiler int a[5].',
    familyId: 'DETAIL-T04-macro-array',
  },
  {
    id: 'Q-001383', topicId: 'T-06', type: 'mc-multi', difficulty: 'schwer',
    prompt: 'Welche Aussagen zu den Format-Specifiern sind korrekt?',
    code: 'double d;\nscanf("%lf", &d);\nprintf("%.2f", d);',
    options: [
      '%lf ist bei scanf für double erforderlich.',
      '%f ist bei printf für den übergebenen double-Wert korrekt.',
      'Bei printf müsste zwingend %.2lf verwendet werden.',
      '&d ist bei diesem scanf-Aufruf erforderlich.',
    ],
    answerIndices: [0, 1, 3],
    explanation: 'Bei scanf unterscheidet %f einen float* von %lf für double*. Bei printf wird ein float '
      + 'ohnehin zu double befördert; %f und %lf sind dort beide zulässig.',
    familyId: 'DETAIL-T06-printf-vs-scanf',
  },
  {
    id: 'Q-001384', topicId: 'T-08', type: 'mc-multi', difficulty: 'schwer',
    prompt: 'Was muss bei diesem Einlesen beachtet werden?',
    code: 'int n;\ndouble x;\nscanf("%d;%lf", &n, &x);',
    options: [
      'Eine passende Eingabe wäre 3;2.5.',
      'Das Semikolon im Formatstring muss auch in der Eingabe vorkommen.',
      'Die Eingabe 3 2.5 passt ohne weitere Änderung zum Formatstring.',
      'Beide Zielvariablen werden über ihre Adressen übergeben.',
    ],
    answerIndices: [0, 1, 3],
    explanation: 'Nicht-Whitespace-Zeichen im scanf-Formatstring müssen wörtlich in der Eingabe stehen. '
      + 'Für die einfachen Variablen werden außerdem die Adressen benötigt.',
    familyId: 'DETAIL-T08-literal-separator',
  },
  {
    id: 'Q-001385', topicId: 'T-10', type: 'mc-multi', difficulty: 'mittel',
    prompt: 'Welche Größen gelten nach der Kurskonvention?',
    code: 'char c;\nshort s;\nint i;\ndouble d;',
    options: ['sizeof(c) ist 1.', 'sizeof(s) ist 2.', 'sizeof(i) ist 8.', 'sizeof(d) ist 8.'],
    answerIndices: [0, 1, 3],
    explanation: 'Im Kurs gilt char=1, short=2, int=4 und double=8 Byte.',
    familyId: 'DETAIL-T10-combined-sizes',
  },
  {
    id: 'Q-001386', topicId: 'T-12', type: 'predict-output', difficulty: 'schwer',
    prompt: 'Was gibt das Fragment aus?',
    code: 'int a = 5, b = 2;\ndouble x = (double)(a / b);\nprintf("%.1f", x);',
    options: ['2.0', '2.5', '5.0', 'Compilerfehler'],
    answerIndex: 0,
    explanation: 'a / b wird innerhalb der Klammer zuerst ganzzahlig zu 2 ausgewertet. Der spätere Cast '
      + 'wandelt nur noch diesen Wert in 2.0 um.',
    familyId: 'DETAIL-T12-cast-after-division',
  },
  {
    id: 'Q-001387', topicId: 'T-12', type: 'predict-output', difficulty: 'schwer',
    prompt: 'Was gibt das Fragment aus?',
    code: 'int a = 5, b = 2;\ndouble x = (double)a / b;\nprintf("%.1f", x);',
    options: ['2.0', '2.5', '5.0', 'Compilerfehler'],
    answerIndex: 1,
    explanation: 'Durch den Cast ist bereits der linke Operand ein double. Deshalb wird 5.0 / 2 als '
      + 'Gleitkommadivision ausgeführt.',
    familyId: 'DETAIL-T12-cast-before-division',
  },
  {
    id: 'Q-001388', topicId: 'T-14', type: 'predict-output', difficulty: 'mittel',
    prompt: 'Was gibt das Fragment aus (stdio.h und math.h seien eingebunden)?',
    code: 'double x = cos(0);\nprintf("%.1f", x);',
    options: ['0.0', '1.0', '90.0', 'Compilerfehler'],
    answerIndex: 1,
    explanation: 'Die trigonometrischen Funktionen arbeiten in Radiant. Null Radiant ist zugleich null Grad; '
      + 'cos(0) ist 1.',
    familyId: 'DETAIL-T14-radian-evaluation',
  },
  {
    id: 'Q-001389', topicId: 'T-15', type: 'predict-output', difficulty: 'mittel',
    prompt: 'Was passiert bei diesem Programm?',
    code: 'int main() {\n    const int n = 5;\n    n += 1;\n    return 0;\n}',
    options: ['Es gibt 6 aus.', 'Compilerfehler', 'n bleibt 5.', 'Undefiniertes Verhalten ohne Compilerdiagnose'],
    answerIndex: 1,
    explanation: 'Ein const-Objekt darf nach seiner Initialisierung nicht mehr verändert werden.',
    familyId: 'DETAIL-T15-const-update',
  },
  {
    id: 'Q-001390', topicId: 'T-17', type: 'predict-output', difficulty: 'schwer',
    prompt: 'Was gibt das Programm aus?',
    code: '#include <stdio.h>\n\nint x = 10;\n\nint f() {\n    int x = 3;\n    return x;\n}\n\nint main() {\n    int x = 5;\n    printf("%d %d", x, f());\n    return 0;\n}',
    options: ['10 10', '5 3', '5 10', 'Compilerfehler'],
    answerIndex: 1,
    explanation: 'Die lokale Variable in main verdeckt dort die globale. In f verdeckt wiederum das lokale x '
      + 'die globale Variable.',
    familyId: 'DETAIL-T17-nested-shadowing',
  },
  {
    id: 'Q-001391', topicId: 'T-19', type: 'predict-output', difficulty: 'schwer',
    prompt: 'Was gibt das eindeutig definierte Fragment aus?',
    code: 'int i = 3;\nint a = i++;\nint b = ++i;\nprintf("%d %d %d", a, b, i);',
    options: ['3 5 5', '4 5 5', '3 4 5', '3 5 4'],
    answerIndex: 0,
    explanation: 'Post-Inkrement speichert zuerst 3 in a und erhöht i auf 4. Prä-Inkrement erhöht danach auf 5 '
      + 'und speichert 5 in b.',
    familyId: 'DETAIL-T19-sequenced-increments',
  },
  {
    id: 'Q-001392', topicId: 'T-21', type: 'predict-output', difficulty: 'mittel',
    prompt: 'Was gibt das Fragment in ASCII aus?',
    code: "char c = 'A';\nc += 3;\nprintf(\"%c %d\", c, c);",
    options: ['D 68', 'C 67', 'D 65', 'Compilerfehler'],
    answerIndex: 0,
    explanation: 'A besitzt den ASCII-Wert 65. Drei Schritte weiter liegt D mit dem Wert 68.',
    familyId: 'DETAIL-T21-char-arithmetic',
  },
  {
    id: 'Q-001393', topicId: 'T-22', type: 'predict-output', difficulty: 'schwer',
    prompt: 'Was gibt das Fragment aus?',
    code: 'int x = 100;\nprintf("%d", 3 < x < 8);',
    options: ['0', '1', 'Compilerfehler', '100'],
    answerIndex: 1,
    explanation: 'C kennt keine mathematische Vergleichskette. Zuerst wird 3 < x zu 1, danach wird 1 < 8 '
      + 'ausgewertet – ebenfalls wahr.',
    familyId: 'DETAIL-T22-chained-comparison',
  },
  {
    id: 'Q-001394', topicId: 'T-23', type: 'predict-output', difficulty: 'schwer',
    prompt: 'Was gibt das Fragment wegen der Kurzschlussauswertung aus?',
    code: 'int x = 0;\nif (0 && ++x) {\n    x = 10;\n}\nprintf("%d", x);',
    options: ['0', '1', '10', 'Compilerfehler'],
    answerIndex: 0,
    explanation: 'Bei && wird der rechte Operand nicht ausgewertet, wenn der linke bereits falsch ist. ++x '
      + 'wird daher nicht ausgeführt.',
    familyId: 'DETAIL-T23-short-circuit',
  },
  {
    id: 'Q-001395', topicId: 'T-25', type: 'predict-output', difficulty: 'schwer',
    prompt: 'Was gibt das Fragment unter Beachtung des Operatorvorrangs aus?',
    code: 'int d = 10 == 5 + 2 * 2;\nprintf("%d", d);',
    options: ['0', '1', '9', '10'],
    answerIndex: 0,
    explanation: 'Zuerst 2*2=4, dann 5+4=9 und zuletzt 10==9. Der Vergleich ist falsch und liefert 0.',
    familyId: 'DETAIL-T25-combined-precedence',
  },
  {
    id: 'Q-001396', topicId: 'T-27', type: 'predict-output', difficulty: 'schwer',
    prompt: 'Was gibt das Fragment aus?',
    code: 'int x = 0;\nswitch (2) {\ncase 1: x += 1;\ncase 2: x += 2;\ncase 3: x += 3; break;\n}\nprintf("%d", x);',
    options: ['2', '3', '5', '6'],
    answerIndex: 2,
    explanation: 'Der Einstieg erfolgt bei case 2. Wegen des fehlenden break läuft der Code in case 3 weiter: '
      + 'x wird 2+3=5.',
    familyId: 'DETAIL-T27-fallthrough',
  },
  {
    id: 'Q-001397', topicId: 'T-28', type: 'predict-output', difficulty: 'mittel',
    prompt: 'Was gibt das Fragment aus?',
    code: 'int x = 3;\ndo {\n    x++;\n} while (x < 3);\nprintf("%d", x);',
    options: ['3', '4', '0', 'Die Schleife läuft endlos.'],
    answerIndex: 1,
    explanation: 'Der Körper einer do-while-Schleife wird vor der ersten Prüfung einmal ausgeführt.',
    familyId: 'DETAIL-T28-do-while-first-run',
  },
  {
    id: 'Q-001398', topicId: 'T-29', type: 'predict-output', difficulty: 'schwer',
    prompt: 'Was passiert bei diesem Programm?',
    code: '#include <stdio.h>\n\nint main() {\n    for (int i = 0; i < 3; i++) {\n        printf("%d", i);\n    }\n    printf("%d", i);\n    return 0;\n}',
    options: ['Es gibt 0123 aus.', 'Es gibt 0122 aus.', 'Compilerfehler', 'Es gibt nur 3 aus.'],
    answerIndex: 2,
    explanation: 'Das im for-Kopf deklarierte i ist nach der Schleife außerhalb seines Gültigkeitsbereichs.',
    familyId: 'DETAIL-T29-for-scope',
  },
  {
    id: 'Q-001399', topicId: 'T-30', type: 'predict-output', difficulty: 'mittel',
    prompt: 'Was gibt das Fragment aus?',
    code: 'int s = 0;\nfor (int i = 1; i <= 5; i++) {\n    if (i % 2 == 0) continue;\n    s += i;\n}\nprintf("%d", s);',
    options: ['6', '9', '15', 'Compilerfehler'],
    answerIndex: 1,
    explanation: 'continue überspringt die geraden Werte. Addiert werden 1+3+5=9.',
    familyId: 'DETAIL-T30-continue-sum',
  },
  {
    id: 'Q-001400', topicId: 'T-33', type: 'mc-multi', difficulty: 'schwer',
    prompt: 'Welche Zeilen sind gültige Prototypen für eine Funktion, die aus einem double-Array und einer '
      + 'int-Länge einen double-Wert berechnet?',
    options: [
      'double mittel(double[], int);',
      'double mittel(double a[], int n);',
      'double mittel(double a[], int n)',
      'void mittel(double[], int);',
    ],
    answerIndices: [0, 1],
    explanation: 'Parameternamen dürfen im Prototyp fehlen, die Typen und der Rückgabetyp müssen stimmen. '
      + 'Der Prototyp endet mit einem Semikolon.',
    familyId: 'DETAIL-T33-array-prototype',
  },
  {
    id: 'Q-001401', topicId: 'T-36', type: 'mc-multi', difficulty: 'schwer',
    prompt: 'Was trifft nach dieser teilweise angegebenen Initialisierung zu?',
    code: 'int a[5] = {1, 2};',
    options: [
      'a[0] ist 1 und a[1] ist 2.',
      'a[2], a[3] und a[4] werden mit 0 initialisiert.',
      'a[5] ist das letzte gültige Element.',
      'Nach der Kurskonvention belegt das Array 20 Byte.',
    ],
    answerIndices: [0, 1, 3],
    explanation: 'Nicht angegebene Elemente werden mit 0 initialisiert. Die Indizes reichen von 0 bis 4; '
      + 'fünf int-Werte zu je 4 Byte ergeben 20 Byte.',
    familyId: 'DETAIL-T36-partial-initialization',
  },
  {
    id: 'Q-001402', topicId: 'T-37', type: 'mc-multi', difficulty: 'schwer',
    prompt: 'Welche Aussagen sind nach der Kurskonvention korrekt?',
    code: 'double ary[250];',
    options: [
      'sizeof(ary) liefert 2000.',
      'sizeof(ary) / sizeof(ary[0]) liefert 250.',
      'Der letzte gültige Index ist 250.',
      'sizeof(ary[0]) liefert 8.',
    ],
    answerIndices: [0, 1, 3],
    explanation: '250 double-Elemente zu je 8 Byte ergeben 2000 Byte. Die Indizes reichen von 0 bis 249.',
    familyId: 'DETAIL-T37-bytes-elements-index',
  },
  {
    id: 'Q-001403', topicId: 'T-38', type: 'mc-multi', difficulty: 'schwer',
    prompt: 'Was trifft auf diese Funktion zu?',
    code: 'void setze(int a[], int n) {\n    a[0] = n;\n}',
    options: [
      'Die Änderung an a[0] wirkt auf das ursprüngliche Array.',
      'sizeof(a) liefert in der Funktion zuverlässig die Gesamtgröße des ursprünglichen Arrays.',
      'Die Länge n muss separat übergeben werden, wenn die Funktion sie benötigt.',
      'Beim Aufruf wird das vollständige Array kopiert.',
    ],
    answerIndices: [0, 2],
    explanation: 'Der Array-Parameter repräsentiert die Startadresse. Änderungen wirken auf das Original; '
      + 'die ursprüngliche Elementzahl lässt sich dort nicht mit sizeof(a) bestimmen.',
    familyId: 'DETAIL-T38-array-parameter',
  },
  {
    id: 'Q-001404', topicId: 'T-41', type: 'mc-multi', difficulty: 'schwer',
    prompt: 'Welche Aussagen gelten für dieses Array?',
    code: 'char s[10] = "Yes";',
    options: [
      'strlen(s) liefert 3.',
      'sizeof(s) liefert 10.',
      's[3] enthält den Null-Terminator.',
      'Der letzte gültige Index ist 10.',
    ],
    answerIndices: [0, 1, 2],
    explanation: 'Der Text hat drei sichtbare Zeichen und danach den Terminator. Der reservierte Behälter '
      + 'besitzt zehn char-Elemente mit den Indizes 0 bis 9.',
    familyId: 'DETAIL-T41-sizeof-strlen-terminator',
  },
  {
    id: 'Q-001405', topicId: 'T-42', type: 'predict-output', difficulty: 'mittel',
    prompt: 'Was gibt das Programm aus?',
    code: '#include <stdio.h>\n\nvoid gross(char s[]) {\n    s[0] = \'X\';\n}\n\nint main() {\n    char s[] = "test";\n    gross(s);\n    printf("%s", s);\n    return 0;\n}',
    options: ['test', 'Xest', 'X', 'Compilerfehler'],
    answerIndex: 1,
    explanation: 'Das char-Array wird über seine Startadresse übergeben. Die Änderung von s[0] betrifft daher '
      + 'das ursprüngliche Array in main.',
    familyId: 'DETAIL-T42-string-mutation',
  },
  {
    id: 'Q-001406', topicId: 'T-43', type: 'mc-multi', difficulty: 'schwer',
    prompt: 'Was trifft auf diese Struct-Initialisierung zu?',
    code: 'struct punkt { double x; double y; };\nstruct punkt p = {1.5, 2.5};',
    options: [
      'p.x besitzt den Wert 1.5.',
      'p.y besitzt den Wert 2.5.',
      'Auf x wird mit p->x zugegriffen, obwohl p kein Zeiger ist.',
      'Nach der Kurskonvention belegt p 16 Byte.',
    ],
    answerIndices: [0, 1, 3],
    explanation: 'Bei einer normalen Struct-Variablen wird der Punkt-Operator verwendet. Zwei double-Elemente '
      + 'belegen in der Kurskonvention zusammen 16 Byte.',
    familyId: 'DETAIL-T43-struct-initialization',
  },
  {
    id: 'Q-001407', topicId: 'T-45', type: 'predict-output', difficulty: 'schwer',
    prompt: 'Was gibt das Programm aus?',
    code: '#include <stdio.h>\n\nstruct wert { int x; };\n\nvoid setze(struct wert w) {\n    w.x = 9;\n}\n\nint main() {\n    struct wert w = {3};\n    setze(w);\n    printf("%d", w.x);\n    return 0;\n}',
    options: ['3', '9', '0', 'Compilerfehler'],
    answerIndex: 0,
    explanation: 'Der Struct wird als Kopie übergeben. Die Änderung betrifft nur den lokalen Parameter in setze.',
    familyId: 'DETAIL-T45-struct-copy-effect',
  },
  {
    id: 'Q-001408', topicId: 'T-46', type: 'mc-multi', difficulty: 'schwer',
    prompt: 'Welche Einordnungen sind korrekt?',
    options: [
      'Eine erneute Zuweisung an ein const-Objekt ist ein Compilerfehler.',
      'scanf("%d", zahl) ohne & muss vom Compiler zwingend abgelehnt werden.',
      'Ein Zugriff auf a[5] bei int a[5] kann kompilieren, verursacht aber undefiniertes Verhalten.',
      'Der Aufruf Quadrat(x) bei einer definierten Funktion quadrat(x) führt wegen der Großschreibung zu einem '
        + 'Übersetzungs-/Linkfehler.',
    ],
    answerIndices: [0, 2, 3],
    explanation: 'Nicht jeder schwere Laufzeitfehler ist ein Compilerfehler. Ein fehlendes & oder ein Zugriff '
      + 'außerhalb des Arrays kann übersetzt werden, führt aber zu undefiniertem Verhalten.',
    familyId: 'DETAIL-T46-error-classification',
  },
  {
    id: 'Q-001409', topicId: 'T-31', type: 'predict-output', difficulty: 'mittel',
    prompt: 'Was gibt das Programm aus?',
    code: '#include <stdio.h>\n\nint erhoehe(int x) {\n    x++;\n    return x;\n}\n\nint main() {\n    int a = 4;\n    int b = erhoehe(a);\n    printf("%d %d", a, b);\n    return 0;\n}',
    options: ['4 5', '5 5', '4 4', 'Compilerfehler'],
    answerIndex: 0,
    explanation: 'Der int-Parameter x ist eine Kopie von a. Die Funktion liefert 5 zurück, a selbst bleibt 4.',
    familyId: 'DETAIL-T31-parameter-copy',
  },
].map((q) => ({
  ...q,
  source: 'Klausurabgleich mit Dozentenmaterial / redaktionelle Vertiefung',
  verified: true,
  qualityLevel: 2,
  variantAngle: q.variantAngle || (q.type === 'mc-multi' ? 'transfer' : 'application'),
  familyId: masterFamilyOverrides[q.id] || q.familyId,
  qualityTag,
}));

const masteryTag = 'mastery-q2-2026-07';
data.questions = data.questions.filter((q) => q.qualityTag !== masteryTag);

const masteryQuestions = [
  // Gegenperspektiven zu den 28 Detailfamilien -------------------------------
  {
    id: 'Q-001410', topicId: 'T-04', type: 'true-false', difficulty: 'mittel',
    familyId: 'DETAIL-T04-macro-array', variantAngle: 'diagnosis',
    prompt: 'Die Aussage ist richtig: Bei `#define LIMIT 5` legt erst der Linker den Wert von LIMIT fest.',
    options: ['Richtig', 'Falsch'], answerIndex: 1,
    explanation: 'Falsch. Der Präprozessor ersetzt LIMIT bereits vor der Übersetzung des C-Codes.',
  },
  {
    id: 'Q-001411', topicId: 'T-06', type: 'mc-single', difficulty: 'schwer',
    familyId: 'DETAIL-T06-printf-vs-scanf', variantAngle: 'diagnosis',
    prompt: 'Welche Kombination liest einen double korrekt ein und gibt ihn anschließend korrekt aus?',
    code: 'double d;',
    options: [
      'scanf("%f", &d); printf("%lf", d);',
      'scanf("%lf", &d); printf("%f", d);',
      'scanf("%lf", d); printf("%f", &d);',
      'scanf("%d", &d); printf("%d", d);',
    ],
    answerIndex: 1,
    explanation: 'scanf benötigt für double* den Specifier %lf und die Adresse. Bei printf ist %f für den '
      + 'durch die Argumentübergabe vorliegenden double-Wert korrekt.',
  },
  {
    id: 'Q-001412', topicId: 'T-08', type: 'true-false', difficulty: 'mittel',
    familyId: 'DETAIL-T08-literal-separator', variantAngle: 'diagnosis',
    prompt: 'Die Eingabe `4 5` passt unverändert zu `scanf("%d,%d", &a, &b);`.',
    options: ['Richtig', 'Falsch'], answerIndex: 1,
    explanation: 'Falsch. Das Komma ist ein wörtliches Zeichen im Formatstring und muss auch in der Eingabe stehen.',
  },
  {
    id: 'Q-001413', topicId: 'T-10', type: 'mc-single', difficulty: 'mittel',
    familyId: 'DETAIL-T10-combined-sizes', variantAngle: 'application',
    prompt: 'Welchen Wert hat der Ausdruck nach der Kurskonvention?',
    code: 'sizeof(char) + sizeof(short) + sizeof(int) + sizeof(double)',
    options: ['14', '15', '16', '18'],
    answerIndex: 1,
    explanation: 'Nach der Kurskonvention gilt 1 + 2 + 4 + 8 = 15 Byte.',
  },
  {
    id: 'Q-001414', topicId: 'T-12', type: 'true-false', difficulty: 'schwer',
    familyId: 'DETAIL-T12-cast-after-division', variantAngle: 'rule',
    prompt: 'Der Ausdruck `(double)(7 / 2)` besitzt den Wert 3.5.',
    options: ['Richtig', 'Falsch'], answerIndex: 1,
    explanation: 'Falsch. Zuerst entsteht durch die Integer-Division der Wert 3; erst dieser wird zu 3.0 gecastet.',
  },
  {
    id: 'Q-001415', topicId: 'T-12', type: 'true-false', difficulty: 'schwer',
    familyId: 'DETAIL-T12-cast-before-division', variantAngle: 'rule',
    prompt: 'Der Ausdruck `(double)7 / 2` besitzt den Wert 3.5.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Durch den Cast ist ein Operand bereits vor der Division ein double.',
  },
  {
    id: 'Q-001416', topicId: 'T-14', type: 'mc-single', difficulty: 'mittel',
    familyId: 'MASTER-T14-angle-and-pi', variantAngle: 'application',
    prompt: 'Welchen Wert liefert der Ausdruck (math.h sei eingebunden)?',
    code: 'sin(M_PI / 2)',
    options: ['-1.0', '0.0', '1.0', '90.0'],
    answerIndex: 2,
    explanation: 'M_PI/2 entspricht 90 Grad im Bogenmaß. Der Sinus davon ist 1.',
  },
  {
    id: 'Q-001417', topicId: 'T-15', type: 'mc-single', difficulty: 'mittel',
    familyId: 'DETAIL-T15-const-update', variantAngle: 'rule',
    prompt: 'Welche Zeile ist zulässig?',
    options: [
      'const int n = 5; n++;',
      'const int n = 5; int m = n + 1;',
      'const int n = 5; n = 7;',
      'const double pi = 3.14; pi *= 2;',
    ],
    answerIndex: 1,
    explanation: 'Ein const-Objekt darf gelesen und in Ausdrücken verwendet, aber nicht erneut beschrieben werden.',
  },
  {
    id: 'Q-001418', topicId: 'T-17', type: 'true-false', difficulty: 'mittel',
    familyId: 'DETAIL-T17-nested-shadowing', variantAngle: 'rule',
    prompt: 'Eine lokale Variable mit demselben Namen verdeckt die globale Variable nur in ihrem eigenen Gültigkeitsbereich.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Außerhalb des lokalen Gültigkeitsbereichs ist die globale Variable weiterhin sichtbar.',
  },
  {
    id: 'Q-001419', topicId: 'T-19', type: 'mc-single', difficulty: 'mittel',
    familyId: 'DETAIL-T19-sequenced-increments', variantAngle: 'application',
    prompt: 'Welche Werte besitzen x und i danach?',
    code: 'int i = 4;\nint x = ++i;',
    options: ['x=4, i=5', 'x=5, i=5', 'x=4, i=4', 'x=5, i=4'],
    answerIndex: 1,
    explanation: 'Das Prä-Inkrement erhöht i vor der Wertübernahme. Beide Werte sind daher 5.',
  },
  {
    id: 'Q-001420', topicId: 'T-21', type: 'true-false', difficulty: 'mittel',
    familyId: 'MASTER-T21-char-arithmetic', variantAngle: 'transfer',
    prompt: 'Im ASCII-Zeichensatz liefert der Ausdruck `\'9\' - \'0\'` den ganzzahligen Wert 9.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Die Ziffern liegen in ASCII lückenlos aufeinander; ihre Differenz entspricht dem Ziffernwert.',
  },
  {
    id: 'Q-001421', topicId: 'T-22', type: 'true-false', difficulty: 'schwer',
    familyId: 'DETAIL-T22-chained-comparison', variantAngle: 'diagnosis',
    prompt: 'Der Ausdruck `0 < x < 10` prüft in C für jeden int-Wert zuverlässig, ob x zwischen 0 und 10 liegt.',
    options: ['Richtig', 'Falsch'], answerIndex: 1,
    explanation: 'Falsch. Zuerst entsteht 0 oder 1; anschließend wird nur noch dieser Wert mit 10 verglichen.',
  },
  {
    id: 'Q-001422', topicId: 'T-23', type: 'mc-single', difficulty: 'schwer',
    familyId: 'DETAIL-T23-short-circuit', variantAngle: 'application',
    prompt: 'Welchen Wert besitzt x danach?',
    code: 'int x = 0;\nint wahr = 1 || ++x;',
    options: ['0', '1', '2', 'Der Ausdruck ist ungültig.'],
    answerIndex: 0,
    explanation: 'Weil der linke Operand von || bereits wahr ist, wird ++x nicht ausgewertet.',
  },
  {
    id: 'Q-001423', topicId: 'T-25', type: 'true-false', difficulty: 'mittel',
    familyId: 'DETAIL-T25-combined-precedence', variantAngle: 'rule',
    prompt: 'Der Ausdruck `2 + 3 * 4` besitzt wegen der üblichen Operatorrangfolge den Wert 20.',
    options: ['Richtig', 'Falsch'], answerIndex: 1,
    explanation: 'Falsch. Die Multiplikation wird zuerst ausgeführt: 2 + 12 = 14.',
  },
  {
    id: 'Q-001424', topicId: 'T-27', type: 'true-false', difficulty: 'mittel',
    familyId: 'MASTER-T27-switch-flow', variantAngle: 'rule',
    prompt: 'Nach einem passenden case werden ohne break auch die folgenden case-Blöcke ausgeführt, bis ein break oder das switch-Ende erreicht ist.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Dieses Weiterlaufen wird als Fall-through bezeichnet.',
  },
  {
    id: 'Q-001425', topicId: 'T-28', type: 'mc-single', difficulty: 'mittel',
    familyId: 'DETAIL-T28-do-while-first-run', variantAngle: 'application',
    prompt: 'Welchen Wert besitzt n danach?',
    code: 'int n = 0;\ndo {\n    n++;\n} while (0);',
    options: ['0', '1', '2', 'Die Schleife ist endlos.'],
    answerIndex: 1,
    explanation: 'Der do-while-Körper wird einmal ausgeführt, bevor die Bedingung geprüft wird.',
  },
  {
    id: 'Q-001426', topicId: 'T-29', type: 'true-false', difficulty: 'mittel',
    familyId: 'DETAIL-T29-for-scope', variantAngle: 'rule',
    prompt: 'Eine im for-Kopf mit `for (int i = ...` deklarierte Variable i ist nach der Schleife weiterhin sichtbar.',
    options: ['Richtig', 'Falsch'], answerIndex: 1,
    explanation: 'Falsch. Ihr Gültigkeitsbereich endet mit der for-Schleife.',
  },
  {
    id: 'Q-001427', topicId: 'T-30', type: 'true-false', difficulty: 'mittel',
    familyId: 'DETAIL-T30-continue-sum', variantAngle: 'rule',
    prompt: 'continue überspringt nur den Rest der aktuellen Schleifeniteration; die Schleife selbst wird nicht beendet.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. break würde die Schleife verlassen, continue springt zur nächsten Iteration.',
  },
  {
    id: 'Q-001428', topicId: 'T-33', type: 'mc-single', difficulty: 'schwer',
    familyId: 'DETAIL-T33-array-prototype', variantAngle: 'diagnosis',
    prompt: 'Welcher Prototyp passt zu einer Funktion, die ein int-Array und dessen Länge erhält und einen int zurückgibt?',
    options: [
      'int summe(int a[], int n);',
      'void summe(int a[], int n);',
      'int summe(int a, int n);',
      'int summe(int a[], int n)',
    ],
    answerIndex: 0,
    explanation: 'Rückgabetyp, Array-Parameter und Längenparameter müssen stimmen; ein Prototyp endet mit Semikolon.',
  },
  {
    id: 'Q-001429', topicId: 'T-36', type: 'true-false', difficulty: 'mittel',
    familyId: 'MASTER-T36-array-init-size', variantAngle: 'rule',
    prompt: 'Bei `int a[4] = {1};` werden a[1], a[2] und a[3] automatisch mit 0 initialisiert.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Fehlende Initialisierer eines initialisierten Arrays werden mit 0 aufgefüllt.',
  },
  {
    id: 'Q-001430', topicId: 'T-37', type: 'mc-single', difficulty: 'mittel',
    familyId: 'DETAIL-T37-bytes-elements-index', variantAngle: 'application',
    prompt: 'Welcher Ausdruck liefert für dieses Array die Elementanzahl 6?',
    code: 'double a[6];',
    options: ['sizeof(a)', 'sizeof(a[0])', 'sizeof(a) / sizeof(a[0])', 'sizeof(a) / 6'],
    answerIndex: 2,
    explanation: 'Gesamtgröße in Byte geteilt durch die Größe eines Elements ergibt die Elementanzahl.',
  },
  {
    id: 'Q-001431', topicId: 'T-38', type: 'true-false', difficulty: 'mittel',
    familyId: 'DETAIL-T38-array-parameter', variantAngle: 'rule',
    prompt: 'Schreibt eine Funktion über einen Array-Parameter nach a[0], wird das erste Element des ursprünglichen Arrays verändert.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Der Parameter verweist auf die Elemente des übergebenen Arrays.',
  },
  {
    id: 'Q-001432', topicId: 'T-41', type: 'mc-single', difficulty: 'schwer',
    familyId: 'DETAIL-T41-sizeof-strlen-terminator', variantAngle: 'transfer',
    prompt: 'Welche Wertekombination ist korrekt?',
    code: 'char s[8] = "Hi";',
    options: [
      'strlen(s)=2 und sizeof(s)=8',
      'strlen(s)=3 und sizeof(s)=8',
      'strlen(s)=8 und sizeof(s)=2',
      'strlen(s)=2 und sizeof(s)=3',
    ],
    answerIndex: 0,
    explanation: 'strlen zählt sichtbare Zeichen bis zum Terminator; sizeof misst den gesamten reservierten Array-Speicher.',
  },
  {
    id: 'Q-001433', topicId: 'T-42', type: 'true-false', difficulty: 'mittel',
    familyId: 'DETAIL-T42-string-mutation', variantAngle: 'rule',
    prompt: 'Wird ein beschreibbares char-Array an eine Funktion übergeben, kann die Funktion seine Zeichen im ursprünglichen Array verändern.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Der Array-Parameter ermöglicht den Zugriff auf dieselben Elemente wie im Aufrufer.',
  },
  {
    id: 'Q-001434', topicId: 'T-43', type: 'mc-single', difficulty: 'mittel',
    familyId: 'DETAIL-T43-struct-initialization', variantAngle: 'diagnosis',
    prompt: 'Welcher Zugriff auf x ist korrekt?',
    code: 'struct punkt { int x; int y; };\nstruct punkt p = {1, 2};',
    options: ['p->x', 'p.x', 'punkt.x', '*p.x'],
    answerIndex: 1,
    explanation: 'p ist eine normale Struct-Variable und wird deshalb mit dem Punkt-Operator angesprochen.',
  },
  {
    id: 'Q-001435', topicId: 'T-45', type: 'true-false', difficulty: 'schwer',
    familyId: 'DETAIL-T45-struct-copy-effect', variantAngle: 'rule',
    prompt: 'Wird ein Struct als normaler Funktionsparameter übergeben, verändert eine Zuweisung an dessen Member nur die lokale Kopie.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Struct-Parameter werden in C ohne Zeiger als Wertkopie übergeben.',
  },
  {
    id: 'Q-001436', topicId: 'T-46', type: 'mc-single', difficulty: 'schwer',
    familyId: 'DETAIL-T46-error-classification', variantAngle: 'diagnosis',
    prompt: 'Welcher Fall kann übersetzt werden, führt bei der Ausführung aber zu undefiniertem Verhalten?',
    options: [
      'Erneute Zuweisung an ein const-Objekt',
      'Zugriff auf a[5] bei int a[5]',
      'Fehlendes Semikolon nach einer Deklaration',
      'Zwei Definitionen derselben lokalen Variablen im selben Block',
    ],
    answerIndex: 1,
    explanation: 'Der Index 5 liegt außerhalb der gültigen Indizes 0 bis 4. Das muss nicht beim Übersetzen erkannt werden.',
  },
  {
    id: 'Q-001437', topicId: 'T-31', type: 'true-false', difficulty: 'mittel',
    familyId: 'DETAIL-T31-parameter-copy', variantAngle: 'rule',
    prompt: 'Erhöht eine Funktion ihren int-Parameter x, ändert sich dadurch nicht automatisch die beim Aufruf verwendete int-Variable.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Ein normaler int-Parameter ist eine Wertkopie.',
  },

  // Q2-Abdeckung für bisher ausschließlich leichte Themen --------------------
  {
    id: 'Q-001438', topicId: 'T-03', type: 'true-false', difficulty: 'mittel',
    familyId: 'MASTER-T03-main-contract', variantAngle: 'rule',
    prompt: '`return 0;` in main signalisiert dem aufrufenden System eine erfolgreiche Programmbeendigung.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Der Rückgabewert 0 steht üblicherweise für eine erfolgreiche Beendigung.',
  },
  {
    id: 'Q-001439', topicId: 'T-03', type: 'mc-single', difficulty: 'mittel',
    familyId: 'MASTER-T03-main-contract', variantAngle: 'diagnosis',
    prompt: 'Welche Definition ist ein gültiger Programmeinstieg ohne Parameter?',
    options: ['void main()', 'int main(void)', 'main int(void)', 'int start(void)'],
    answerIndex: 1,
    explanation: 'Der standardkonforme Programmeinstieg besitzt den Rückgabetyp int; void kennzeichnet die leere Parameterliste.',
  },
  {
    id: 'Q-001440', topicId: 'T-05', type: 'true-false', difficulty: 'mittel',
    familyId: 'MASTER-T05-printf-escapes', variantAngle: 'application',
    prompt: '`printf("A\\nB");` gibt A und B in zwei verschiedenen Zeilen aus.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Die Escape-Sequenz \\n erzeugt einen Zeilenumbruch.',
  },
  {
    id: 'Q-001441', topicId: 'T-05', type: 'mc-single', difficulty: 'mittel',
    familyId: 'MASTER-T05-printf-escapes', variantAngle: 'diagnosis',
    prompt: 'Welcher Aufruf gibt genau ein Prozentzeichen aus?',
    options: ['printf("%");', 'printf("%%");', 'printf("\\%");', 'printf("%d", "%");'],
    answerIndex: 1,
    explanation: 'Im printf-Formatstring wird ein wörtliches Prozentzeichen als %% geschrieben.',
  },
  {
    id: 'Q-001442', topicId: 'T-09', type: 'true-false', difficulty: 'mittel',
    familyId: 'MASTER-T09-declaration-initialization', variantAngle: 'diagnosis',
    prompt: '`int 2wert = 5;` ist ungültig, weil ein Bezeichner nicht mit einer Ziffer beginnen darf.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Ziffern sind erst nach dem ersten Zeichen eines Bezeichners erlaubt.',
  },
  {
    id: 'Q-001443', topicId: 'T-09', type: 'mc-single', difficulty: 'mittel',
    familyId: 'MASTER-T09-declaration-initialization', variantAngle: 'application',
    prompt: 'Welche Zeile deklariert und initialisiert eine double-Variable korrekt?',
    options: ['double = x 2.0;', 'double x = 2.0;', 'x double = 2.0;', 'double 2x = 2.0;'],
    answerIndex: 1,
    explanation: 'Typ, gültiger Bezeichner, Zuweisungsoperator und Initialwert stehen in dieser Reihenfolge.',
  },
  {
    id: 'Q-001444', topicId: 'T-11', type: 'true-false', difficulty: 'schwer',
    familyId: 'MASTER-T11-unsigned-boundary', variantAngle: 'rule',
    prompt: 'Ein Überlauf eines unsigned-Integer-Typs ist in C modulo 2 hoch Bitbreite definiert.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Unsigned-Arithmetik läuft am Wertebereichsende definiert wieder von vorn.',
  },
  {
    id: 'Q-001445', topicId: 'T-11', type: 'mc-single', difficulty: 'schwer',
    familyId: 'MASTER-T11-unsigned-boundary', variantAngle: 'application',
    prompt: 'Welchen Wert besitzt x danach?',
    code: 'unsigned int x = 0;\nx--;',
    options: ['-1', '0', 'UINT_MAX', 'Undefiniertes Verhalten'],
    answerIndex: 2,
    explanation: 'Unsigned-Arithmetik ist modular. Unterhalb von 0 wird daher zum größten darstellbaren Wert gewechselt.',
  },
  {
    id: 'Q-001446', topicId: 'T-13', type: 'true-false', difficulty: 'mittel',
    familyId: 'MASTER-T13-modulo-fmod', variantAngle: 'diagnosis',
    prompt: 'Der Ausdruck `5.5 % 2.0` ist in C eine gültige Gleitkomma-Restberechnung.',
    options: ['Richtig', 'Falsch'], answerIndex: 1,
    explanation: 'Falsch. Der Operator % erwartet ganzzahlige Operanden; für Gleitkommawerte dient fmod aus math.h.',
  },
  {
    id: 'Q-001447', topicId: 'T-13', type: 'mc-single', difficulty: 'mittel',
    familyId: 'MASTER-T13-modulo-fmod', variantAngle: 'application',
    prompt: 'Welchen Wert liefert der Ausdruck (math.h sei eingebunden)?',
    code: 'fmod(7.5, 2.0)',
    options: ['0.5', '1.0', '1.5', '3.75'],
    answerIndex: 2,
    explanation: '7.5 = 3 * 2.0 + 1.5; der verbleibende Rest ist 1.5.',
  },
  {
    id: 'Q-001448', topicId: 'T-16', type: 'true-false', difficulty: 'mittel',
    familyId: 'MASTER-T16-global-local-scope', variantAngle: 'rule',
    prompt: 'Eine lokale Variable x kann eine globale Variable x verdecken, ohne deren gespeicherten Wert zu verändern.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Es handelt sich um zwei verschiedene Objekte in unterschiedlichen Gültigkeitsbereichen.',
  },
  {
    id: 'Q-001449', topicId: 'T-16', type: 'mc-single', difficulty: 'schwer',
    familyId: 'MASTER-T16-global-local-scope', variantAngle: 'application',
    prompt: 'Was gibt das Programm aus?',
    code: '#include <stdio.h>\n\nint x = 4;\nvoid f(void) {\n    int x = 9;\n    x++;\n}\nint main(void) {\n    f();\n    printf("%d", x);\n    return 0;\n}',
    options: ['4', '5', '9', '10'],
    answerIndex: 0,
    explanation: 'f verändert nur sein lokales x. Das globale x bleibt 4.',
  },
  {
    id: 'Q-001450', topicId: 'T-18', type: 'true-false', difficulty: 'mittel',
    familyId: 'MASTER-T18-compound-assignment', variantAngle: 'transfer',
    prompt: 'Nach `int x = 10; x *= 2 + 1;` besitzt x den Wert 30.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Die rechte Seite ist 3; die zusammengesetzte Zuweisung entspricht hier x = x * 3.',
  },
  {
    id: 'Q-001451', topicId: 'T-18', type: 'mc-single', difficulty: 'mittel',
    familyId: 'MASTER-T18-compound-assignment', variantAngle: 'application',
    prompt: 'Welchen Wert besitzt x danach?',
    code: 'int x = 8;\nx /= 2 + 2;',
    options: ['1', '2', '4', '6'],
    answerIndex: 1,
    explanation: 'Zuerst wird die rechte Seite zu 4 ausgewertet, anschließend erfolgt 8 / 4.',
  },
  {
    id: 'Q-001452', topicId: 'T-26', type: 'true-false', difficulty: 'schwer',
    familyId: 'MASTER-T26-dangling-else', variantAngle: 'rule',
    prompt: 'Ohne geschweifte Klammern gehört ein else zum nächsten noch nicht zugeordneten if.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Diese Regel erklärt das sogenannte dangling-else-Verhalten.',
  },
  {
    id: 'Q-001453', topicId: 'T-26', type: 'mc-single', difficulty: 'schwer',
    familyId: 'MASTER-T26-dangling-else', variantAngle: 'application',
    prompt: 'Welchen Wert besitzt x danach?',
    code: 'int x = 0;\nif (1)\n    if (0) x = 1;\n    else x = 2;',
    options: ['0', '1', '2', 'Compilerfehler'],
    answerIndex: 2,
    explanation: 'Das else gehört zum inneren if. Dessen Bedingung ist falsch, deshalb wird x auf 2 gesetzt.',
  },

  // Weitere klausurrelevante Perspektivpaare -------------------------------
  {
    id: 'Q-001454', topicId: 'T-01', type: 'true-false', difficulty: 'mittel',
    familyId: 'MASTER-T01-toolchain-stage', variantAngle: 'rule',
    prompt: 'Der Linker verbindet Objektdateien und löst dabei Verweise auf Funktionen aus anderen Übersetzungseinheiten auf.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Präprozessor und Compiler arbeiten früher; das Zusammenführen der Objektdateien übernimmt der Linker.',
  },
  {
    id: 'Q-001455', topicId: 'T-01', type: 'mc-single', difficulty: 'schwer',
    familyId: 'MASTER-T01-toolchain-stage', variantAngle: 'diagnosis',
    prompt: 'Eine Funktion ist deklariert und wird aufgerufen, aber in keiner eingebundenen Objektdatei definiert. Wo scheitert der normale Build?',
    options: ['Beim Präprozessor', 'Beim Compiler wegen der Deklaration', 'Beim Linker', 'Erst zwingend zur Laufzeit'],
    answerIndex: 2,
    explanation: 'Der Aufruf kann anhand der Deklaration übersetzt werden; die fehlende Definition fällt beim Auflösen des Symbols auf.',
  },
  {
    id: 'Q-001456', topicId: 'T-02', type: 'true-false', difficulty: 'mittel',
    familyId: 'MASTER-T02-source-object-header', variantAngle: 'rule',
    prompt: 'Eine Headerdatei enthält typischerweise Deklarationen und wird über #include in eine C-Quelldatei eingebunden.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Die eigentlichen Übersetzungseinheiten entstehen normalerweise aus den C-Quelldateien.',
  },
  {
    id: 'Q-001457', topicId: 'T-02', type: 'mc-single', difficulty: 'mittel',
    familyId: 'MASTER-T02-source-object-header', variantAngle: 'application',
    prompt: 'Welche Datei entsteht typischerweise aus der Übersetzung einer einzelnen .c-Datei vor dem Linken?',
    options: ['Eine .h-Datei', 'Eine Objektdatei (.o/.obj)', 'Immer sofort die fertige .exe-Datei', 'Eine weitere .c-Datei'],
    answerIndex: 1,
    explanation: 'Compiler und Assembler erzeugen eine Objektdatei; der Linker verbindet sie später zum Programm.',
  },
  {
    id: 'Q-001458', topicId: 'T-07', type: 'true-false', difficulty: 'schwer',
    familyId: 'MASTER-T07-width-precision', variantAngle: 'rule',
    prompt: 'Im Format `%08.2f` bezeichnet 8 eine Mindestfeldbreite und 2 die Anzahl der Nachkommastellen.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Die 0 fordert eine Auffüllung mit Nullen, soweit die Mindestbreite zusätzlichen Platz erzeugt.',
  },
  {
    id: 'Q-001459', topicId: 'T-07', type: 'mc-single', difficulty: 'mittel',
    familyId: 'MASTER-T07-width-precision', variantAngle: 'application',
    prompt: 'Welche Ausgabe erzeugt der Aufruf? Punkte markieren hier Leerzeichen.',
    code: 'printf("%6.2f", 3.5);',
    options: ['..3.50', '.3.500', '3.5000', '...3.5'],
    answerIndex: 0,
    explanation: '3.50 benötigt vier Zeichen. Für die Mindestbreite 6 werden links zwei Leerzeichen ergänzt.',
  },
  {
    id: 'Q-001460', topicId: 'T-32', type: 'true-false', difficulty: 'mittel',
    familyId: 'MASTER-T32-function-signatures', variantAngle: 'rule',
    prompt: '`void f(void);` deklariert eine Funktion ohne Parameter und ohne Rückgabewert.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Das erste void ist der Rückgabetyp, das zweite kennzeichnet die leere Parameterliste.',
  },
  {
    id: 'Q-001461', topicId: 'T-32', type: 'mc-single', difficulty: 'mittel',
    familyId: 'MASTER-T32-function-signatures', variantAngle: 'diagnosis',
    prompt: 'Welcher Prototyp beschreibt eine Funktion mit einem int-Parameter und ohne Rückgabewert?',
    options: ['int f(void);', 'void f(int x);', 'int f(int x);', 'void f(void);'],
    answerIndex: 1,
    explanation: 'void vor dem Funktionsnamen bedeutet kein Rückgabewert; int x ist der einzelne Parameter.',
  },
  {
    id: 'Q-001462', topicId: 'T-34', type: 'true-false', difficulty: 'schwer',
    familyId: 'MASTER-T34-declaration-definition', variantAngle: 'diagnosis',
    prompt: 'Eine normale, nicht static Funktionsdefinition in einem Header kann bei Einbindung in mehrere .c-Dateien zu mehrfachen Definitionen beim Linken führen.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. In einen Header gehört hier die Deklaration; die einmalige Definition liegt in einer Quelldatei.',
  },
  {
    id: 'Q-001463', topicId: 'T-34', type: 'mc-single', difficulty: 'mittel',
    familyId: 'MASTER-T34-declaration-definition', variantAngle: 'rule',
    prompt: 'Welche Zeile ist nur eine Funktionsdeklaration und noch keine Definition?',
    options: ['int summe(int a, int b);', 'int summe(int a, int b) { return a + b; }', 'return summe(1, 2);', '#define summe(a,b) ((a)+(b))'],
    answerIndex: 0,
    explanation: 'Der Prototyp endet mit einem Semikolon und besitzt keinen Funktionskörper.',
  },
  {
    id: 'Q-001464', topicId: 'T-35', type: 'true-false', difficulty: 'mittel',
    familyId: 'MASTER-T35-no-overloading', variantAngle: 'rule',
    prompt: 'C erlaubt nicht, zwei Funktionen nur anhand unterschiedlicher Parametertypen unter demselben Namen zu überladen.',
    options: ['Richtig', 'Falsch'], answerIndex: 0,
    explanation: 'Richtig. Eine solche Überladung gehört nicht zum C-Sprachmodell.',
  },
  {
    id: 'Q-001465', topicId: 'T-35', type: 'mc-single', difficulty: 'schwer',
    familyId: 'MASTER-T35-no-overloading', variantAngle: 'diagnosis',
    prompt: 'Was gilt für diese beiden Deklarationen in demselben C-Programm?',
    code: 'int f(int x);\ndouble f(double x);',
    options: [
      'Sie überladen f gültig.',
      'Sie sind wegen widersprüchlicher Typen für denselben Funktionsnamen unvereinbar.',
      'Der Linker wählt anhand des Arguments.',
      'Nur die Reihenfolge der Deklarationen entscheidet.',
    ],
    answerIndex: 1,
    explanation: 'C besitzt keine Funktionsüberladung; die beiden Typangaben für f stehen im Konflikt.',
  },
].map((q) => ({
  ...q,
  // Pooltexte werden per textContent gerendert, nicht als Markdown.
  prompt: q.prompt.replace(/`/g, ''),
  source: 'Q2-Verständnisstandard / Abgleich mit Dozentenmaterial',
  verified: true,
  qualityLevel: 2,
  qualityTag: masteryTag,
}));

for (const q of details) {
  if (byId.has(q.id) && byId.get(q.id).qualityTag !== qualityTag) {
    throw new Error(`ID bereits anderweitig belegt: ${q.id}`);
  }
  data.questions.push(q);
}

for (const q of masteryQuestions) {
  if (byId.has(q.id) && byId.get(q.id).qualityTag !== masteryTag) {
    throw new Error(`ID bereits anderweitig belegt: ${q.id}`);
  }
  data.questions.push(q);
}

const trueFalseExamFamilies = new Set([
  'DETAIL-T04-macro-array',
  'DETAIL-T08-literal-separator',
  'DETAIL-T12-cast-after-division',
  'DETAIL-T12-cast-before-division',
  'DETAIL-T17-nested-shadowing',
  'MASTER-T21-char-arithmetic',
  'DETAIL-T22-chained-comparison',
  'DETAIL-T25-combined-precedence',
  'MASTER-T27-switch-flow',
  'DETAIL-T29-for-scope',
  'DETAIL-T30-continue-sum',
  'MASTER-T36-array-init-size',
  'DETAIL-T38-array-parameter',
  'DETAIL-T42-string-mutation',
  'DETAIL-T45-struct-copy-effect',
  'DETAIL-T31-parameter-copy',
  'MASTER-T03-main-contract',
  'MASTER-T05-printf-escapes',
  'MASTER-T09-declaration-initialization',
  'MASTER-T11-unsigned-boundary',
  'MASTER-T13-modulo-fmod',
  'MASTER-T16-global-local-scope',
  'MASTER-T18-compound-assignment',
  'MASTER-T26-dangling-else',
  'MASTER-T01-toolchain-stage',
  'MASTER-T02-source-object-header',
  'MASTER-T07-width-precision',
  'MASTER-T32-function-signatures',
  'MASTER-T34-declaration-definition',
  'MASTER-T35-no-overloading',
]);
const singleExamFamilies = new Set([
  'DETAIL-T06-printf-vs-scanf',
  'DETAIL-T10-combined-sizes',
  'MASTER-T14-angle-and-pi',
  'DETAIL-T15-const-update',
  'DETAIL-T19-sequenced-increments',
  'DETAIL-T23-short-circuit',
  'DETAIL-T28-do-while-first-run',
  'DETAIL-T33-array-prototype',
  'DETAIL-T37-bytes-elements-index',
  'DETAIL-T41-sizeof-strlen-terminator',
  'DETAIL-T43-struct-initialization',
  'DETAIL-T46-error-classification',
]);
for (const q of data.questions) {
  if (trueFalseExamFamilies.has(q.familyId)) q.examFamilyRole = 'true-false';
  else if (singleExamFamilies.has(q.familyId)) q.examFamilyRole = 'mc-single';
}

data.meta.version = '1.3';
const json = JSON.stringify(data, null, 1) + '\n';
fs.writeFileSync(jsonFile, json, 'utf8');
fs.writeFileSync(
  jsFile,
  '\uFEFFwindow.CKT_EMBEDDED_DATA = ' + JSON.stringify(data, null, 1) + ';\r\n',
  'utf8',
);

console.log(
  `${details.length} Detailfragen und ${masteryQuestions.length} Q2-Varianten ergänzt; `
    + 'semantische Familien und Fachkorrekturen aktualisiert.',
);
