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
- Jede einzelne Klausur deckt alle 46 aktiven Themen ab. Zeiger und
  mehrdimensionale Arrays gehören nicht zum freigegebenen Stoffumfang und
  dürfen weder als Aufgabe noch als Distraktor oder Erklärung erscheinen.
- Innerhalb einer Klausur darf keine Einzelfragen-Familie doppelt vorkommen.
- Die vier Code-Snippets müssen aus unterschiedlichen Archetypen stammen.
- Sie werden ausschließlich aus einem getrennten Klausurpool gezogen, bestehen
  aus einem zusammenhängenden Programm und besitzen jeweils exakt zehn Aussagen.
- Klausurexklusive Snippets erscheinen weder im Übungs- noch im
  Fehler-Wiederholen-Modus und vergrößern den normalen Lernfortschritt nicht.
- Alle sechs Zahlensystem-Richtungen kommen genau einmal vor.
- Einzelfragen werden ausschließlich aus verifizierten Fragen der Stufen
  `mittel` und `schwer` gezogen. Es gibt keinen leichten Notfall-Fallback.
- Eine Serie besteht aus genau sechs Klausuren. In dieser Serie darf weder eine
  konkrete Aufgaben-ID noch ein normalisierter Inhaltsfingerabdruck
  wiederkehren.
- Der exklusive Pool besitzt 24 Code-Snippets: vier unverbrauchte Programme pro
  Klausur. Nach Klausur 6 muss der Nutzer die Serie ausdrücklich neu starten.
- Kann eine Bedingung nicht erfüllt werden, bricht der Builder mit einer
  verständlichen Meldung ab, statt eine schwächere Ersatzklausur zu erzeugen.

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
4. simulierte Klausuren besitzen 45 Einheiten, 81 Punkte, 46/46 Themen, keine
   leichte Einzelfrage und keine Familien-Dopplung;
5. in 20 vollständigen Sechser-Serien wiederholt sich weder eine konkrete
   Variante noch ein Inhaltsfingerabdruck;
6. eine siebte Klausur wird bis zum bewussten Serien-Neustart blockiert;
7. `questions.json` und die Offline-Kopie `questions.js` sind identisch.

## Datenfelder

- `familyId`: semantische Familie,
- `variantAngle`: `rule`, `application`, `diagnosis` oder `transfer`,
- `qualityLevel`: numerische Qualitätsstufe; neue Verständnisvarianten
  verwenden `2`,
- `qualityTag`: idempotente redaktionelle Erzeugungsrunde.
