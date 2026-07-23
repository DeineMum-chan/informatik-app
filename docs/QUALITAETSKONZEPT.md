# Qualitätsstufe Q2 – Verständnis statt Wiedererkennung

## Ziel

Q2 soll verhindern, dass ein Lernerfolg nur dadurch entsteht, dass eine
bekannte Formulierung, Antwortposition oder Zahlenschablone wiedererkannt wird.
Der abgefragte Stoff bleibt vollständig innerhalb des vorhandenen
Dozentenrahmens. Anspruch entsteht durch Anwendung, Grenzfälle, Kombinationen
und Fehlerdiagnose – nicht durch neue C-Themen.

## Verbindliche Regeln

### 1. Semantische Konzeptfamilien

- Eine Familie steht für genau ein fachliches Prinzip.
- Andere Zahlen, Variablennamen oder eine andere Reihenfolge der
  Antwortoptionen bilden keine neuen Prinzipien.
- Redaktionelle `familyId`-Werte haben Vorrang vor der heuristischen
  Textnormalisierung.

### 2. Variantenqualität

Der normale Q2-Übungspool umfasst die Schwierigkeiten `mittel` und `schwer`.
Für jede darin auswählbare Familie müssen mindestens zwei Varianten vorhanden
sein.

Varianten sollen nach Möglichkeit unterschiedliche Perspektiven besitzen:

- `rule`: Regel oder Begriffsgrenze beurteilen,
- `application`: Code auswerten oder Regel anwenden,
- `diagnosis`: Fehler oder falsche Begründung erkennen,
- `transfer`: mehrere bekannte Teilregeln kombinieren.

Beim Wechsel des Durchlaufs rotiert die Auswahl zuerst zwischen diesen
Perspektiven und danach zwischen Zahlen-/Namensvarianten. Eine konkrete
Aufgabeneinheit darf in zwei aufeinanderfolgenden vollständigen
Q2-Durchläufen nicht identisch sein.

Leichte Grundlagenfragen bleiben freiwillig zuschaltbar. Sie gehören nicht zur
Q2-Garantie und dürfen deshalb einzelne Ein-Varianten-Familien enthalten.

### 3. Q2-Klausursimulation

- Der Aufbau bleibt bei 45 Einheiten und 81 Punkten.
- Innerhalb einer Klausur darf keine Einzelfragen-Familie doppelt vorkommen.
- Die vier Code-Snippets müssen aus unterschiedlichen Archetypen stammen.
- Alle sechs Zahlensystem-Richtungen kommen genau einmal vor.
- Einzelfragen werden aus `mittel` und `schwer` gezogen; `leicht` ist nur ein
  technischer Notfall-Fallback, falls ein redaktioneller Pool später zu klein
  wird.
- Die unmittelbar vorherige konkrete Aufgabenvariante wird vermieden.
- Familien der vorherigen Klausur werden vermieden, solange der jeweilige
  Aufgabentopf genügend andere Familien besitzt. Die sechs verpflichtenden
  Zahlensystem-Familien sind die einzige planmäßige Ausnahme.

### 4. Redaktioneller Anspruch

Neue Q2-Fragen müssen mindestens eines dieser Merkmale erfüllen:

- eine häufige Fehlannahme als Distraktor,
- einen relevanten Grenzfall,
- die Kombination zweier bereits behandelter Regeln,
- die Unterscheidung von Übersetzungsfehler und undefiniertem Verhalten,
- eine Begründung, die trotz zufällig richtigem Ergebnis falsch sein kann.

Reine Synonyme, bloß vertauschte Optionen und ausschließlich geänderte
Zahlenwerte zählen nicht als neue Q2-Perspektive.

## Messbare Abnahmekriterien

Die automatischen Tests müssen nach jeder Pooländerung bestätigen:

1. jedes aktive Thema ist im Q2-Übungspool vertreten;
2. keine Q2-Familie besitzt nur eine auswählbare Variante;
3. zwei aufeinanderfolgende Q2-Durchläufe verwenden pro Familie verschiedene
   konkrete Einheiten;
4. 1.000 simulierte Klausuren besitzen 45 Einheiten, 81 Punkte, keine leichte
   Einzelfrage und keine Familien-Dopplung;
5. zwei direkt aufeinanderfolgende Klausuren wiederholen keine konkrete
   Variante;
6. Familienüberschneidungen zweier aufeinanderfolgender Klausuren beschränken
   sich auf die sechs verpflichtenden Zahlensystem-Richtungen;
7. `questions.json` und die Offline-Kopie `questions.js` sind identisch.

## Datenfelder

- `familyId`: semantische Familie,
- `variantAngle`: `rule`, `application`, `diagnosis` oder `transfer`,
- `qualityLevel`: numerische Qualitätsstufe; neue Verständnisvarianten
  verwenden `2`,
- `qualityTag`: idempotente redaktionelle Erzeugungsrunde.

