#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const jsonFile = path.join(root, 'data', 'questions.json');
const jsFile = path.join(root, 'data', 'questions.js');
const poolTag = 'exam-snippets-professor-ss25-v1';
const seriesQuestionTag = 'exam-series-capacity-v1';
const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
const commonCoverage = [
  'T-03', 'T-04', 'T-05', 'T-06', 'T-09', 'T-10', 'T-12', 'T-18',
  'T-22', 'T-26', 'T-29', 'T-31', 'T-33', 'T-36', 'T-37', 'T-38', 'T-47',
];
const coverageByArchetype = {
  'array-average': ['T-15', 'T-19', 'T-23', 'T-25'],
  'array-count': ['T-13', 'T-19', 'T-23', 'T-25', 'T-30'],
  'array-frequency': ['T-16', 'T-17', 'T-19', 'T-23', 'T-25'],
  'array-distance': ['T-19', 'T-23', 'T-25', 'T-28'],
  'array-positive': ['T-15', 'T-16', 'T-19', 'T-23', 'T-25', 'T-30'],
  'array-index': ['T-19', 'T-23', 'T-25'],
  'string-count': ['T-21', 'T-23', 'T-25', 'T-28', 'T-40', 'T-41', 'T-42'],
  'array-transform': ['T-19', 'T-23', 'T-25', 'T-32'],
  'trimmed-mean': ['T-15', 'T-17', 'T-19', 'T-23', 'T-25'],
  'reverse-checksum': ['T-19', 'T-23', 'T-25', 'T-32'],
  'prefix-sums': ['T-19', 'T-23', 'T-25', 'T-32'],
  'matrix-analysis': ['T-15', 'T-23', 'T-25', 'T-32', 'T-39'],
  'string-replacement': ['T-19', 'T-21', 'T-23', 'T-25', 'T-28', 'T-40', 'T-41', 'T-42'],
  'struct-ranking': ['T-19', 'T-23', 'T-25', 'T-43', 'T-44', 'T-45'],
  'matrix-search': ['T-19', 'T-23', 'T-25', 'T-27', 'T-30', 'T-39', 'T-43'],
  'positive-filter': ['T-19', 'T-23', 'T-25', 'T-30', 'T-32'],
};
const currentArchetypes = {
  'exam-snip-001': 'trimmed-mean',
  'exam-snip-002': 'reverse-checksum',
  'exam-snip-003': 'prefix-sums',
  'exam-snip-004': 'matrix-analysis',
  'exam-snip-005': 'string-replacement',
  'exam-snip-006': 'struct-ranking',
  'exam-snip-007': 'matrix-search',
  'exam-snip-008': 'positive-filter',
};
const legacyArchetypes = {
  'snip-001': 'array-average', 'snip-002': 'array-average',
  'snip-005': 'array-count', 'snip-006': 'array-count',
  'snip-009': 'array-frequency', 'snip-010': 'array-frequency',
  'snip-013': 'array-distance', 'snip-014': 'array-distance',
  'snip-017': 'array-positive', 'snip-018': 'array-positive',
  'snip-021': 'array-index', 'snip-022': 'array-index',
  'snip-025': 'string-count', 'snip-026': 'string-count',
  'snip-029': 'array-transform', 'snip-030': 'array-transform',
};
const seriesRoundByGroup = {
  'exam-snip-001': 1, 'exam-snip-002': 1, 'exam-snip-003': 1, 'exam-snip-004': 1,
  'exam-snip-005': 2, 'exam-snip-006': 2, 'exam-snip-007': 2, 'exam-snip-008': 2,
  'snip-001': 3, 'snip-005': 3, 'snip-009': 3, 'snip-013': 3,
  'snip-002': 4, 'snip-006': 4, 'snip-010': 4, 'snip-014': 4,
  'snip-017': 5, 'snip-021': 5, 'snip-025': 5, 'snip-029': 5,
  'snip-018': 6, 'snip-022': 6, 'snip-026': 6, 'snip-030': 6,
};

function coverageFor(archetype) {
  return [...new Set(commonCoverage.concat(coverageByArchetype[archetype] || []))];
}

const snippets = [
  {
    id: 'exam-snip-001',
    familyId: 'T47-exam-trimmed-mean',
    title: 'Summe und Mittelwert ohne Extremwerte',
    code: String.raw`#include <stdio.h>

int summe_ohne_extreme(const int a[], int n) {
    int summe = 0;
    int min = a[0];
    int max = a[0];

    for (int i = 0; i < n; i++) {
        summe += a[i];
        if (a[i] < min) {
            min = a[i];
        }
        if (a[i] > max) {
            max = a[i];
        }
    }
    return summe - min - max;
}

double mittel_ohne_extreme(const int a[], int n) {
    return (double)summe_ohne_extreme(a, n) / (n - 2);
}

int main() {
    int daten[] = {4, 9, 2, 9, 6, 5};
    int n = sizeof(daten) / sizeof(daten[0]);
    printf("%d %.2f\n",
           summe_ohne_extreme(daten, n),
           mittel_ohne_extreme(daten, n));
    return 0;
}`,
    statements: [
      {
        correct: true,
        prompt: 'summe_ohne_extreme liefert für das angegebene Array den Wert 24.',
        explanation: 'Die Summe ist 35. Abgezogen werden ein Minimum 2 und genau ein Maximum 9: 35 - 2 - 9 = 24.',
      },
      {
        correct: false,
        prompt: 'Die Funktion entfernt bei mehrfach vorkommendem Maximum alle Vorkommen des Maximums aus der Summe.',
        explanation: 'Es werden nur die beiden gespeicherten Werte min und max jeweils einmal abgezogen.',
      },
      {
        correct: true,
        prompt: 'Die Ausgabe des Programms lautet 24 6.00.',
        explanation: 'Nach dem Abzug bleiben 24; geteilt durch vier verbleibende Werte ergibt das 6.00.',
      },
      {
        correct: true,
        prompt: 'const int a[] verhindert, dass die Funktionen die Arrayelemente über a verändern.',
        explanation: 'Der Parameter zeigt auf konstante int-Werte; Schreibzugriffe wie a[i] = ... wären darüber nicht zulässig.',
      },
      {
        correct: true,
        prompt: 'Der Cast zu double verhindert allgemein eine Ganzzahldivision.',
        explanation: 'Durch den Cast ist der linke Operand der Division vom Typ double.',
      },
      {
        correct: false,
        prompt: 'Die Schleife beginnt bei i = 1, weil min und max schon mit a[0] initialisiert wurden.',
        explanation: 'Im Code beginnt die Schleife bei i = 0; a[0] wird auch zur Summe addiert.',
      },
      {
        correct: true,
        prompt: 'Bei einem Aufruf mit n == 2 würde der Nenner n - 2 gleich 0.',
        explanation: 'Für n == 2 entsteht eine Gleitkommadivision durch 0; der Code prüft diesen Randfall nicht.',
      },
      {
        correct: false,
        prompt: 'Das Array daten wird beim Funktionsaufruf vollständig kopiert.',
        explanation: 'Arrayparameter werden als Zeiger auf das erste Element übergeben.',
      },
      {
        correct: false,
        prompt: 'max wird mit 0 initialisiert.',
        explanation: 'min und max werden beide mit dem ersten Arrayelement a[0], hier also 4, initialisiert.',
      },
      {
        correct: false,
        prompt: 'Der Rückgabewert von summe_ohne_extreme ist immer positiv.',
        explanation: 'Bei negativen Werten oder kleinen n gibt es keine solche Garantie.',
      },
    ],
  },
  {
    id: 'exam-snip-002',
    familyId: 'T47-exam-reverse-checksum',
    title: 'Array umkehren und gewichtet auswerten',
    code: String.raw`#include <stdio.h>

void tausche(int *x, int *y) {
    int temp = *x;
    *x = *y;
    *y = temp;
}

void umkehren(int a[], int n) {
    for (int i = 0; i < n / 2; i++) {
        tausche(&a[i], &a[n - 1 - i]);
    }
}

int gewichtete_summe(const int a[], int n) {
    int summe = 0;
    for (int i = 0; i < n; i++) {
        summe += (i + 1) * a[i];
    }
    return summe;
}

int main() {
    int daten[] = {3, 1, 4, 1, 5};
    int n = sizeof(daten) / sizeof(daten[0]);

    umkehren(daten, n);
    printf("%d %d %d\n",
           daten[0], daten[n - 1],
           gewichtete_summe(daten, n));
    return 0;
}`,
    statements: [
      {
        correct: true,
        prompt: 'Die Ausgabe des Programms lautet 5 3 38.',
        explanation: 'Nach dem Umkehren lautet das Array {5, 1, 4, 1, 3}; die gewichtete Summe ist 5 + 2 + 12 + 4 + 15 = 38.',
      },
      {
        correct: true,
        prompt: 'Für n == 5 wird tausche genau zweimal aufgerufen.',
        explanation: 'Die Schleife läuft für i = 0 und i = 1, weil 5 / 2 bei int-Division 2 ergibt.',
      },
      {
        correct: false,
        prompt: 'Das mittlere Element mit dem ursprünglichen Wert 4 wird mit einem anderen Element vertauscht.',
        explanation: 'Bei ungerader Länge bleibt das Element am Index 2 unberührt.',
      },
      {
        correct: true,
        prompt: 'umkehren verändert das Array daten aus main.',
        explanation: 'Die Funktion erhält die Adresse des ersten Elements und vertauscht die ursprünglichen Arrayelemente.',
      },
      {
        correct: false,
        prompt: 'Ein Aufruf umkehren(daten, 0) greift auf daten[-1] zu.',
        explanation: 'Bei n == 0 ist 0 < 0 falsch; der Schleifenrumpf wird nicht ausgeführt.',
      },
      {
        correct: false,
        prompt: 'tausche erhält Kopien der beiden int-Werte und kann deshalb daten nicht verändern.',
        explanation: 'tausche erhält int-Zeiger und schreibt über *x und *y in die ursprünglichen Variablen.',
      },
      {
        correct: true,
        prompt: 'Mit der Bedingung i <= n / 2 würde tausche bei n == 5 dreimal aufgerufen.',
        explanation: 'Dann wären i = 0, 1 und 2 erlaubt; beim dritten Aufruf würde das mittlere Element mit sich selbst getauscht.',
      },
      {
        correct: false,
        prompt: 'gewichtete_summe berechnet lediglich die normale Summe aller Arraywerte.',
        explanation: 'Jeder Wert wird zusätzlich mit seiner einsbasierten Position i + 1 multipliziert.',
      },
      {
        correct: true,
        prompt: 'Für i == 1 verwendet umkehren als zweiten Index den Wert 3.',
        explanation: 'n - 1 - i ergibt bei n = 5 und i = 1 den Index 3.',
      },
      {
        correct: true,
        prompt: 'Eine void-Funktion wie umkehren muss keinen Wert zurückgeben.',
        explanation: 'void kennzeichnet eine Funktion ohne Rückgabewert.',
      },
    ],
  },
  {
    id: 'exam-snip-003',
    familyId: 'T47-exam-prefix-sums',
    title: 'Präfixsummen und Schwellwert',
    code: String.raw`#include <stdio.h>

void praefixsummen(int a[], int n) {
    for (int i = 1; i < n; i++) {
        a[i] += a[i - 1];
    }
}

int zaehle_ab(const int a[], int n, int grenze) {
    int anzahl = 0;
    for (int i = 0; i < n; i++) {
        if (a[i] >= grenze) {
            anzahl++;
        }
    }
    return anzahl;
}

int main() {
    int daten[] = {2, -1, 3, 0, 4};
    int n = sizeof(daten) / sizeof(daten[0]);

    praefixsummen(daten, n);
    printf("%d %d %d\n",
           daten[2],
           daten[n - 1],
           zaehle_ab(daten, n, 4));
    return 0;
}`,
    statements: [
      {
        correct: true,
        prompt: 'Nach praefixsummen enthält daten die Werte {2, 1, 4, 4, 8}.',
        explanation: 'Jedes Element ab Index 1 wird um die bereits berechnete Präfixsumme seines Vorgängers erhöht.',
      },
      {
        correct: true,
        prompt: 'Die Ausgabe des Programms lautet 4 8 3.',
        explanation: 'daten[2] ist 4, das letzte Element ist 8 und die Werte 4, 4 und 8 erfüllen >= 4.',
      },
      {
        correct: true,
        prompt: 'Bei der Berechnung von a[3] wird bereits der veränderte Wert a[2] verwendet.',
        explanation: 'Die Funktion arbeitet von links nach rechts direkt im ursprünglichen Array.',
      },
      {
        correct: false,
        prompt: 'Die Schleife könnte ohne weitere Änderung bei i = 0 beginnen.',
        explanation: 'Dann würde der Ausdruck a[i - 1] beim ersten Durchlauf auf a[-1] zugreifen.',
      },
      {
        correct: true,
        prompt: 'Bei n == 1 bleibt das einzige Arrayelement unverändert.',
        explanation: 'Die Bedingung i < n ist bereits für den Startwert i = 1 falsch.',
      },
      {
        correct: false,
        prompt: 'praefixsummen arbeitet auf einer Kopie von daten.',
        explanation: 'Der Arrayparameter verweist auf dasselbe Array wie daten in main.',
      },
      {
        correct: true,
        prompt: 'Mit der Bedingung a[i] > grenze würde zaehle_ab für grenze 4 nur den Wert 8 zählen.',
        explanation: 'Die beiden Werte 4 wären bei einem strikten Größer-Vergleich nicht mehr enthalten.',
      },
      {
        correct: false,
        prompt: 'Ein negatives Element im Eingabearray führt zwingend zu einer negativen letzten Präfixsumme.',
        explanation: 'Entscheidend ist die Summe aller Elemente; hier ist die letzte Präfixsumme trotz -1 gleich 8.',
      },
      {
        correct: true,
        prompt: 'a[i] += a[i - 1] ist gleichbedeutend mit a[i] = a[i] + a[i - 1].',
        explanation: 'Der zusammengesetzte Zuweisungsoperator += addiert und weist das Ergebnis zurück zu.',
      },
      {
        correct: false,
        prompt: 'praefixsummen hat den Rückgabetyp int.',
        explanation: 'Die Funktion ist als void deklariert und verändert das Array direkt.',
      },
    ],
  },
  {
    id: 'exam-snip-004',
    familyId: 'T47-exam-matrix-analysis',
    title: 'Zeilen- und Spaltenauswertung einer Matrix',
    code: String.raw`#include <stdio.h>

#define SPALTEN 3

int zeilensumme(const int m[][SPALTEN], int zeile) {
    int summe = 0;
    for (int j = 0; j < SPALTEN; j++) {
        summe += m[zeile][j];
    }
    return summe;
}

int spaltenmaximum(const int m[][SPALTEN],
                   int zeilen, int spalte) {
    int max = m[0][spalte];
    for (int i = 1; i < zeilen; i++) {
        if (m[i][spalte] > max) {
            max = m[i][spalte];
        }
    }
    return max;
}

int main() {
    int matrix[3][SPALTEN] = {
        {3, 1, 4},
        {1, 5, 9},
        {2, 6, 5}
    };

    printf("%d %d\n",
           zeilensumme(matrix, 1),
           spaltenmaximum(matrix, 3, 2));
    return 0;
}`,
    statements: [
      {
        correct: true,
        prompt: 'zeilensumme(matrix, 1) liefert den Wert 15.',
        explanation: 'Der Zeilenindex 1 bezeichnet die zweite Zeile {1, 5, 9}; ihre Summe ist 15.',
      },
      {
        correct: true,
        prompt: 'spaltenmaximum(matrix, 3, 2) liefert den Wert 9.',
        explanation: 'In der dritten Spalte stehen die Werte 4, 9 und 5.',
      },
      {
        correct: true,
        prompt: 'Der Index 1 bezeichnet bei zeilensumme die zweite Matrixzeile.',
        explanation: 'Arrayindizes beginnen in C bei 0.',
      },
      {
        correct: true,
        prompt: 'Bei einem zweidimensionalen Arrayparameter muss die zweite Dimension hier bekannt sein.',
        explanation: 'Der Compiler benötigt die Spaltenzahl, um die Adresse von m[i][j] zu berechnen.',
      },
      {
        correct: false,
        prompt: 'Die vollständige Matrix wird beim Aufruf von zeilensumme kopiert.',
        explanation: 'Der Parameter verweist auf die ursprünglichen Matrixzeilen; const verhindert nur Schreibzugriffe darüber.',
      },
      {
        correct: false,
        prompt: 'Die Schleifenbedingung j <= SPALTEN würde ebenfalls nur gültige Spaltenindizes verwenden.',
        explanation: 'Bei SPALTEN == 3 sind nur die Indizes 0, 1 und 2 gültig; j == 3 wäre außerhalb.',
      },
      {
        correct: true,
        prompt: 'spaltenmaximum initialisiert max mit einem tatsächlich vorhandenen Matrixelement.',
        explanation: 'Als Startwert wird m[0][spalte] verwendet.',
      },
      {
        correct: true,
        prompt: 'spaltenmaximum kann auch dann korrekt arbeiten, wenn alle Werte der Spalte negativ sind.',
        explanation: 'Die Initialisierung mit dem ersten Spaltenwert vermeidet einen ungeeigneten Startwert wie 0.',
      },
      {
        correct: false,
        prompt: 'Wenn matrix[1][2] auf 0 geändert würde, bliebe die Programmausgabe unverändert.',
        explanation: 'Dann wäre die zweite Zeilensumme 6 und das Maximum der dritten Spalte 5.',
      },
      {
        correct: false,
        prompt: 'SPALTEN wird erst zur Laufzeit aus dem Inhalt der Matrix berechnet.',
        explanation: '#define ersetzt SPALTEN bereits vor dem Übersetzen durch den Wert 3.',
      },
    ],
  },
  {
    id: 'exam-snip-005',
    familyId: 'T47-exam-string-replacement',
    title: 'Zeichen in einem String ersetzen',
    code: String.raw`#include <stdio.h>

int ersetze(char s[], char von, char zu) {
    int anzahl = 0;
    for (int i = 0; s[i] != '\0'; i++) {
        if (s[i] == von) {
            s[i] = zu;
            anzahl++;
        }
    }
    return anzahl;
}

int laenge(const char s[]) {
    int n = 0;
    while (s[n] != '\0') {
        n++;
    }
    return n;
}

int main() {
    char text[] = "banana";
    int geaendert = ersetze(text, 'a', 'o');

    printf("%s %d %d\n",
           text, geaendert, laenge(text));
    return 0;
}`,
    statements: [
      {
        correct: true,
        prompt: 'Die Ausgabe des Programms lautet bonono 3 6.',
        explanation: 'Die drei Zeichen a werden durch o ersetzt; die Stringlänge bleibt sechs.',
      },
      {
        correct: true,
        prompt: 'ersetze verändert im gegebenen Aufruf drei Arrayelemente.',
        explanation: 'banana enthält an den Indizes 1, 3 und 5 jeweils ein a.',
      },
      {
        correct: false,
        prompt: 'laenge(text) liefert den Wert 7, weil der Nullterminator mitgezählt wird.',
        explanation: 'Die Schleife endet vor dem Nullterminator und zählt nur die sechs sichtbaren Zeichen.',
      },
      {
        correct: true,
        prompt: 'Die Bedingung s[i] != \'\\0\' verhindert, dass über das Stringende hinaus weitergesucht wird.',
        explanation: 'C-Strings enden mit dem Nullzeichen \\0.',
      },
      {
        correct: true,
        prompt: 'Die Änderungen aus ersetze sind anschließend in text aus main sichtbar.',
        explanation: 'text ist ein veränderbares char-Array und wird über seine Startadresse bearbeitet.',
      },
      {
        correct: false,
        prompt: 'Dasselbe wäre sicher, wenn text als char *text = "banana"; deklariert und anschließend verändert würde.',
        explanation: 'Ein Stringliteral darf nicht verändert werden; ein Schreibzugriff darüber führt zu undefiniertem Verhalten.',
      },
      {
        correct: true,
        prompt: 'sizeof(text) wäre in main gleich 7.',
        explanation: 'Das Array enthält sechs Zeichen und zusätzlich den Nullterminator.',
      },
      {
        correct: false,
        prompt: 'Innerhalb von ersetze könnte sizeof(s) zuverlässig die Größe des ursprünglichen Arrays liefern.',
        explanation: 'Der Arrayparameter s wird als Zeiger behandelt; sizeof(s) wäre dort die Zeigergröße.',
      },
      {
        correct: true,
        prompt: 'Bei ersetze(text, \'a\', \'a\') würde der Rückgabewert ebenfalls 3 sein.',
        explanation: 'Jedes gefundene a wird gezählt, auch wenn der zugewiesene Wert identisch ist.',
      },
      {
        correct: false,
        prompt: 'Die Zuweisung s[i] = zu verändert die Adresse, auf die s zeigt.',
        explanation: 'Sie verändert das Zeichen an Index i, nicht den Zeiger s.',
      },
    ],
  },
  {
    id: 'exam-snip-006',
    familyId: 'T47-exam-struct-ranking',
    title: 'Struct-Array auswerten',
    code: String.raw`#include <stdio.h>

typedef struct {
    char kuerzel;
    int punkte[3];
} Ergebnis;

int gesamt(const Ergebnis *e) {
    int summe = 0;
    for (int i = 0; i < 3; i++) {
        summe += e->punkte[i];
    }
    return summe;
}

int bester_index(const Ergebnis a[], int n) {
    int bester = 0;
    for (int i = 1; i < n; i++) {
        if (gesamt(&a[i]) > gesamt(&a[bester])) {
            bester = i;
        }
    }
    return bester;
}

int main() {
    Ergebnis daten[] = {
        {'A', {7, 8, 6}},
        {'B', {9, 9, 8}},
        {'C', {10, 5, 7}}
    };
    int n = sizeof(daten) / sizeof(daten[0]);
    int k = bester_index(daten, n);

    printf("%c %d\n", daten[k].kuerzel, gesamt(&daten[k]));
    return 0;
}`,
    statements: [
      {
        correct: true,
        prompt: 'Die Ausgabe des Programms lautet B 26.',
        explanation: 'Die Gesamtwerte sind A = 21, B = 26 und C = 22.',
      },
      {
        correct: true,
        prompt: 'bester_index liefert für das angegebene Array den Index 1.',
        explanation: 'Das Element B mit dem höchsten Gesamtwert steht an Index 1.',
      },
      {
        correct: true,
        prompt: 'Der Operator -> wird verwendet, weil e ein Zeiger auf ein Ergebnis ist.',
        explanation: 'e->punkte entspricht (*e).punkte.',
      },
      {
        correct: false,
        prompt: 'bester_index erhält eine vollständige Kopie des Arrays daten.',
        explanation: 'Der Arrayparameter wird als Zeiger auf das erste Struct-Element übergeben.',
      },
      {
        correct: true,
        prompt: 'Bei gleichem Gesamtwert behält die Funktion wegen des strikten > den früheren Eintrag.',
        explanation: 'Bei Gleichheit ist die if-Bedingung falsch und bester wird nicht ersetzt.',
      },
      {
        correct: false,
        prompt: 'Bei n == 0 liefert bester_index sicher den Wert -1.',
        explanation: 'Der Code initialisiert bester mit 0 und prüft den leeren Randfall nicht.',
      },
      {
        correct: true,
        prompt: 'punkte ist ein Array, das direkt innerhalb jedes Struct-Objekts gespeichert ist.',
        explanation: 'Jedes Ergebnis enthält sein eigenes int-Array mit drei Elementen.',
      },
      {
        correct: true,
        prompt: 'const beim Parameter von gesamt verhindert Änderungen am übergebenen Ergebnis über e.',
        explanation: 'e zeigt auf ein konstantes Ergebnis; Schreibzugriffe über e sind nicht zulässig.',
      },
      {
        correct: false,
        prompt: 'Der Gesamtwert von A beträgt 22.',
        explanation: '7 + 8 + 6 ergibt 21.',
      },
      {
        correct: false,
        prompt: 'sizeof(e) innerhalb von gesamt wäre gleich der Größe eines vollständigen Ergebnis-Structs.',
        explanation: 'e ist ein Zeiger; sizeof(e) liefert die Zeigergröße.',
      },
    ],
  },
  {
    id: 'exam-snip-007',
    familyId: 'T47-exam-matrix-search',
    title: 'Erstes Vorkommen in einer Matrix suchen',
    code: String.raw`#include <stdio.h>

#define SPALTEN 4

int finde_erstes(const int m[][SPALTEN],
                 int zeilen, int wert,
                 int *fund_zeile, int *fund_spalte) {
    for (int i = 0; i < zeilen; i++) {
        for (int j = 0; j < SPALTEN; j++) {
            if (m[i][j] == wert) {
                *fund_zeile = i;
                *fund_spalte = j;
                return 1;
            }
        }
    }
    return 0;
}

int main() {
    int matrix[3][SPALTEN] = {
        {2, 4, 7, 1},
        {5, 7, 3, 8},
        {9, 6, 2, 4}
    };
    int zeile = -1;
    int spalte = -1;
    int gefunden = finde_erstes(
        matrix, 3, 7, &zeile, &spalte);

    printf("%d %d %d\n",
           gefunden, zeile, spalte);
    return 0;
}`,
    statements: [
      {
        correct: true,
        prompt: 'Die Ausgabe des Programms lautet 1 0 2.',
        explanation: 'Das erste Vorkommen von 7 wird in Zeile 0, Spalte 2 gefunden.',
      },
      {
        correct: true,
        prompt: 'Die Matrix wird zeilenweise von links nach rechts durchsucht.',
        explanation: 'Die äußere Schleife läuft über die Zeilen, die innere über die Spalten.',
      },
      {
        correct: true,
        prompt: 'fund_zeile und fund_spalte ermöglichen zwei zusätzliche Ergebnisse über Zeigerparameter.',
        explanation: 'Die Funktion schreibt die gefundenen Indizes über die übergebenen Adressen zurück.',
      },
      {
        correct: false,
        prompt: 'Wenn der Wert nicht gefunden wird, liefert die Funktion -1.',
        explanation: 'Der Rückgabewert ist dann 0; die Indexvariablen bleiben in main bei -1.',
      },
      {
        correct: false,
        prompt: 'Ein break in der inneren Schleife würde an derselben Stelle beide Schleifen und die Funktion beenden.',
        explanation: 'break beendet nur die unmittelbar umgebende Schleife; return beendet hier direkt die Funktion.',
      },
      {
        correct: true,
        prompt: 'Beim Suchwert 4 wäre das erste Ergebnis Zeile 0, Spalte 1.',
        explanation: 'Die 4 in der ersten Zeile wird vor der späteren 4 in Zeile 2 gefunden.',
      },
      {
        correct: true,
        prompt: 'Die Spaltenzahl 4 muss für den zweidimensionalen Arrayparameter bekannt sein.',
        explanation: 'Sie wird für die Adressberechnung von m[i][j] benötigt.',
      },
      {
        correct: false,
        prompt: 'Der Aufruf wäre unverändert sicher, wenn für fund_zeile der Nullzeiger NULL übergeben würde.',
        explanation: 'Beim Treffer würde *fund_zeile dann einen ungültigen Schreibzugriff verursachen.',
      },
      {
        correct: true,
        prompt: 'Das zweite Vorkommen der 7 wird wegen return 1 nicht mehr untersucht.',
        explanation: 'Die Funktion endet unmittelbar nach dem ersten Treffer.',
      },
      {
        correct: false,
        prompt: 'zeile und spalte werden als normale int-Kopien an finde_erstes übergeben.',
        explanation: 'Übergeben werden mit &zeile und &spalte ihre Adressen.',
      },
    ],
  },
  {
    id: 'exam-snip-008',
    familyId: 'T47-exam-filter-copy',
    title: 'Positive Werte in ein Zielarray filtern',
    code: String.raw`#include <stdio.h>

int filtere_positiv(const int quelle[], int n,
                    int ziel[]) {
    int k = 0;
    for (int i = 0; i < n; i++) {
        if (quelle[i] <= 0) {
            continue;
        }
        ziel[k++] = quelle[i];
    }
    return k;
}

int summe(const int a[], int n) {
    int ergebnis = 0;
    for (int i = 0; i < n; i++) {
        ergebnis += a[i];
    }
    return ergebnis;
}

int main() {
    int quelle[] = {-2, 0, 5, -1, 7, 3};
    int ziel[6] = {0};
    int n = sizeof(quelle) / sizeof(quelle[0]);
    int k = filtere_positiv(quelle, n, ziel);

    printf("%d %d %d %d\n",
           k, ziel[0], ziel[k - 1],
           summe(ziel, k));
    return 0;
}`,
    statements: [
      {
        correct: true,
        prompt: 'Die Ausgabe des Programms lautet 3 5 3 15.',
        explanation: 'Gefiltert werden die Werte 5, 7 und 3; ihre Summe ist 15.',
      },
      {
        correct: true,
        prompt: 'Der Wert 0 wird nicht in ziel kopiert.',
        explanation: 'Für 0 ist die Bedingung quelle[i] <= 0 wahr und continue überspringt die Zuweisung.',
      },
      {
        correct: true,
        prompt: 'Die Reihenfolge der positiven Werte bleibt im Zielarray erhalten.',
        explanation: 'Die Quelle wird von links nach rechts gelesen und k steigt nach jeder Kopie.',
      },
      {
        correct: false,
        prompt: 'Bei ziel[k++] = quelle[i] wird k vor dem verwendeten Arrayzugriff erhöht.',
        explanation: 'Der Post-Inkrementoperator verwendet zunächst den alten Wert von k und erhöht anschließend.',
      },
      {
        correct: true,
        prompt: 'Die nicht beschriebenen Elemente von ziel sind wegen = {0} zunächst 0.',
        explanation: 'Bei einer teilweisen Arrayinitialisierung werden die übrigen Elemente mit 0 initialisiert.',
      },
      {
        correct: true,
        prompt: 'filtere_positiv kennt die tatsächliche Kapazität von ziel nicht.',
        explanation: 'Die Funktion erhält keinen Größenparameter für das Zielarray; der Aufrufer muss ausreichend Platz bereitstellen.',
      },
      {
        correct: false,
        prompt: 'Die Funktion verändert die Werte im Array quelle.',
        explanation: 'quelle ist als const deklariert und wird nur gelesen.',
      },
      {
        correct: true,
        prompt: 'summe(ziel, 6) würde in diesem konkreten Programm ebenfalls 15 liefern.',
        explanation: 'Die drei übrigen Elemente von ziel sind 0 und verändern die Summe nicht.',
      },
      {
        correct: false,
        prompt: 'continue beendet filtere_positiv sofort und liefert k zurück.',
        explanation: 'continue springt nur zum nächsten Durchlauf der for-Schleife.',
      },
      {
        correct: false,
        prompt: 'Negative Werte werden in ziel kopiert und erst in summe ignoriert.',
        explanation: 'Negative Werte werden bereits in filtere_positiv durch continue übersprungen.',
      },
    ],
  },
];

data.questions = data.questions.filter((q) =>
  q.examSnippetPool !== poolTag && q.qualityTag !== seriesQuestionTag);
const occupiedIds = new Set(data.questions.map((q) => q.id));
let numericId = 1466;
const generated = [];

for (const snippet of snippets) {
  const code = snippet.code.trim();
  const lineCount = code.split('\n').length;
  if (lineCount < 20 || lineCount > 40) {
    throw new Error(`${snippet.id}: Erwartet werden 20 bis 40 Codezeilen, erhalten: ${lineCount}`);
  }
  if (snippet.statements.length !== 10) {
    throw new Error(`${snippet.id}: Ein Klausur-Snippet benötigt exakt zehn Aussagen.`);
  }
  const trueCount = snippet.statements.filter((statement) => statement.correct).length;
  if (trueCount < 4 || trueCount > 6) {
    throw new Error(`${snippet.id}: Richtig/Falsch-Verteilung ist zu einseitig (${trueCount}/10 richtig).`);
  }

  for (const statement of snippet.statements) {
    const id = `Q-${String(numericId).padStart(6, '0')}`;
    numericId += 1;
    if (occupiedIds.has(id)) throw new Error(`Frage-ID bereits vorhanden: ${id}`);
    occupiedIds.add(id);
    generated.push({
      id,
      topicId: 'T-47',
      type: 'true-false',
      difficulty: 'schwer',
      prompt: statement.prompt,
      code,
      options: ['Richtig', 'Falsch'],
      answerIndex: statement.correct ? 0 : 1,
      group: snippet.id,
      groupPrompt: `Klausur-Code-Snippet: ${snippet.title}. Bewerten Sie die zehn Aussagen.`,
      explanation: `${statement.correct ? 'Richtig' : 'Falsch'}: ${statement.explanation}`,
      source: 'Beispielaufgaben Vorbereitung SS25.pdf / klausurnaher Transfer',
      verified: true,
      familyId: snippet.familyId,
      qualityLevel: 2,
      variantAngle: 'exam-analysis',
      examOnly: true,
      examArchetype: currentArchetypes[snippet.id],
      examSeriesRound: seriesRoundByGroup[snippet.id],
      coverageTopics: coverageFor(currentArchetypes[snippet.id]),
      examSnippetPool: poolTag,
    });
  }
}

let legacyIndex = 1;
for (const [groupId, archetype] of Object.entries(legacyArchetypes)) {
  const questions = data.questions.filter((q) => q.group === groupId);
  if (questions.length !== 10) {
    throw new Error(`${groupId}: Erwartet werden zehn bestehende Aussagen.`);
  }
  for (const q of questions) {
    q.examOnly = true;
    q.difficulty = 'schwer';
    q.qualityLevel = 2;
    q.examArchetype = archetype;
    q.examSeriesRound = seriesRoundByGroup[groupId];
    q.coverageTopics = coverageFor(archetype);
    q.familyId = `T47-exam-series-legacy-${String(legacyIndex).padStart(2, '0')}`;
    q.variantAngle = 'exam-analysis';
    q.examSnippetPool = 'exam-snippets-series-legacy-v1';
  }
  legacyIndex += 1;
}

for (const groupId of ['snip-009', 'snip-010']) {
  const questions = data.questions.filter((q) => q.group === groupId);
  questions[9].prompt =
    'Die Parameter a, n und w besitzen jeweils nur innerhalb ihrer Funktion einen lokalen Gültigkeitsbereich.';
  questions[9].answerIndex = 0;
  questions[9].explanation =
    'Richtig: Funktionsparameter sind lokale Bezeichner der jeweiligen Funktion.';
}
for (const groupId of ['snip-017', 'snip-018']) {
  const questions = data.questions.filter((q) => q.group === groupId);
  questions[2].prompt =
    'Der Parameter n und die Variable s besitzen innerhalb von summe_positiv einen lokalen Gültigkeitsbereich.';
  questions[2].answerIndex = 0;
  questions[2].explanation =
    'Richtig: Parameter und innerhalb der Funktion deklarierte Variablen sind dort lokal.';
  questions[3].prompt =
    'Die im Code mehrfach verwendete 0 ist über eine benannte Konstante definiert und daher keine Magic Number.';
  questions[3].answerIndex = 1;
  questions[3].explanation =
    'Falsch: Die 0 steht als direktes Zahlenliteral im Code; eine benannte Konstante wurde nicht angelegt.';
}
const falseRewrites = {
  'snip-001': [1, 'main liest exakt fünf Zahlen ein.', 'Falsch: Die Schleife in main liest genau vier Werte.'],
  'snip-002': [1, 'main liest exakt fünf Zahlen ein.', 'Falsch: Die Schleife in main liest genau vier Werte.'],
  'snip-009': [7, 'Beide Funktionen erhalten jeweils eine vollständige Kopie des Arrays.', 'Falsch: Der Arrayparameter wird als Zeiger auf das erste Element übergeben.'],
  'snip-010': [7, 'Beide Funktionen erhalten jeweils eine vollständige Kopie des Arrays.', 'Falsch: Der Arrayparameter wird als Zeiger auf das erste Element übergeben.'],
  'snip-017': [6, 'Bei n == 0 liefert summe_positiv den Wert 1.', 'Falsch: s bleibt 0 und dieser Wert wird zurückgegeben.'],
  'snip-018': [6, 'Bei n == 0 liefert summe_positiv den Wert 1.', 'Falsch: s bleibt 0 und dieser Wert wird zurückgegeben.'],
  'snip-021': [4, 'Der Rückgabewert liegt bei vier Elementen immer zwischen 1 und 4.', 'Falsch: Arrayindizes beginnen bei 0; möglich sind 0 bis 3.'],
  'snip-022': [4, 'Der Rückgabewert liegt bei fünf Elementen immer zwischen 1 und 5.', 'Falsch: Arrayindizes beginnen bei 0; möglich sind 0 bis 4.'],
  'snip-025': [7, 'Der Parameter c ist ein Zeiger auf char.', 'Falsch: c ist ein einzelner Wert vom Typ char.'],
  'snip-026': [7, 'Der Parameter c ist ein Zeiger auf char.', 'Falsch: c ist ein einzelner Wert vom Typ char.'],
  'snip-029': [7, 'Beide Schleifen laufen jeweils viermal.', 'Falsch: n ist 3; beide Schleifen laufen jeweils dreimal.'],
  'snip-030': [7, 'Beide Schleifen laufen jeweils viermal.', 'Falsch: n ist 3; beide Schleifen laufen jeweils dreimal.'],
};
for (const [groupId, [index, prompt, explanation]] of Object.entries(falseRewrites)) {
  const question = data.questions.filter((q) => q.group === groupId)[index];
  question.prompt = prompt;
  question.answerIndex = 1;
  question.explanation = explanation;
}
for (const groupId of ['snip-017', 'snip-018']) {
  const question = data.questions.filter((q) => q.group === groupId)[9];
  question.prompt = 'Das erste von der Schleife geprüfte Arrayelement ist a[1].';
  question.answerIndex = 1;
  question.explanation = 'Falsch: Die Schleife startet mit i = 0 und prüft zuerst a[0].';
}
for (const groupId of ['snip-021', 'snip-022']) {
  const question = data.questions.filter((q) => q.group === groupId)[7];
  question.prompt = 'Die Schleife startet bei i = 0, obwohl Index 0 bereits der Startkandidat ist.';
  question.answerIndex = 1;
  question.explanation = 'Falsch: Die Schleife startet bei i = 1.';
}

const seriesQuestions = [
  {
    id: 'Q-001546',
    topicId: 'T-11',
    type: 'true-false',
    difficulty: 'schwer',
    prompt: 'Die Umwandlung von -1 in unsigned int ergibt unabhängig von der konkreten Bitbreite den größten darstellbaren Wert dieses unsigned-int-Typs.',
    options: ['Richtig', 'Falsch'],
    answerIndex: 0,
    explanation: 'Richtig: Die Konvertierung erfolgt modulo 2 hoch Bitbreite; -1 wird daher zu UINT_MAX.',
    familyId: 'MASTER-T11-unsigned-boundary',
  },
  {
    id: 'Q-001547',
    topicId: 'T-11',
    type: 'predict-output',
    difficulty: 'schwer',
    prompt: 'Was gibt das Programm aus?',
    code: '#include <stdio.h>\nint main(void) {\n    unsigned int x = 0;\n    printf("%d", x - 1 > x);\n    return 0;\n}',
    options: ['0', '1', 'Compilerfehler', 'Nicht definiert'],
    answerIndex: 1,
    explanation: 'x - 1 wird unsigned berechnet und ergibt UINT_MAX; dieser Wert ist größer als 0.',
    familyId: 'MASTER-T11-unsigned-boundary',
  },
  {
    id: 'Q-001548',
    topicId: 'T-11',
    type: 'mc-multi',
    difficulty: 'schwer',
    prompt: 'Welche Aussagen zu unsigned int sind nach dem C-Standard richtig?',
    options: [
      'Der Wertebereich beginnt bei 0.',
      'Ein arithmetischer Überlauf ist modulo 2 hoch Bitbreite definiert.',
      'Der Typ muss exakt 32 Bit breit sein.',
      'Jeder negative int-Wert wird bei der Konvertierung zwingend zu 0.',
    ],
    answerIndices: [0, 1],
    explanation: 'Bitbreite und Maximalwert sind implementationsabhängig; Konvertierungen erfolgen modulo dem Wertebereich.',
    familyId: 'MASTER-T11-unsigned-boundary',
  },
  {
    id: 'Q-001549',
    topicId: 'T-11',
    type: 'mc-single',
    difficulty: 'schwer',
    prompt: 'unsigned int x = 5; Danach wird x -= 7; ausgeführt. Welche Beschreibung ist portabel richtig?',
    options: [
      'x enthält UINT_MAX - 1.',
      'x enthält -2.',
      'Das Verhalten ist undefiniert.',
      'Der Compiler muss die Anweisung ablehnen.',
    ],
    answerIndex: 0,
    explanation: '5 - 7 entspricht -2; im unsigned-Wertebereich ist das UINT_MAX - 1.',
    familyId: 'MASTER-T11-unsigned-boundary',
  },
  {
    id: 'Q-001550',
    topicId: 'T-44',
    type: 'mc-multi',
    difficulty: 'schwer',
    prompt: 'Gegeben ist typedef struct { int x; } Punkt; Welche Deklarationen erzeugen jeweils ein Objekt dieses Struct-Typs?',
    options: [
      'Punkt a;',
      'struct Punkt b;',
      'Punkt c = { .x = 3 };',
      'typedef Punkt d;',
    ],
    answerIndices: [0, 2],
    explanation: 'Punkt ist der typedef-Name. Ein struct-Tag Punkt wurde nicht deklariert; typedef Punkt d deklariert nur einen weiteren Typnamen.',
    familyId: 'SERIES-T44-typedef-vs-tag',
  },
].map((q) => ({
  ...q,
  source: 'Klausurserien-Qualitätssicherung / klausurnaher Transfer',
  verified: true,
  qualityLevel: 2,
  qualityTag: seriesQuestionTag,
  variantAngle: 'exam-transfer',
}));

for (const q of data.questions) {
  if (q.familyId === 'MASTER-T11-unsigned-boundary') delete q.examFamilyRole;
  if (['Q-000751', 'Q-000755', 'Q-000765', 'Q-000768', 'Q-000779'].includes(q.id)) {
    q.familyId = 'SERIES-T44-typedef-vs-tag';
  }
}
data.questions.push(...generated, ...seriesQuestions);
data.meta.version = '1.6';

const json = JSON.stringify(data, null, 1) + '\n';
fs.writeFileSync(jsonFile, json, 'utf8');
fs.writeFileSync(
  jsFile,
  '\uFEFFwindow.CKT_EMBEDDED_DATA = ' + JSON.stringify(data, null, 1) + ';\r\n',
  'utf8',
);

console.log(
  `${snippets.length + Object.keys(legacyArchetypes).length} klausurexklusive `
  + `Code-Snippets (${generated.length + Object.keys(legacyArchetypes).length * 10} Aussagen) bereitgestellt.`,
);
