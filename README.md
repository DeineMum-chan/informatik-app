# C-Klausurtrainer — Informatik 1 (THM StudiumPlus)

Offline-fähige Web-App (PWA) zum Trainieren der C-Klausur im Stil des Dozenten:
**Üben nach Thema**, **Klausursimulation** (Zeitlimit + Negativ-Marking, mit
geschätzter Note) und **Fehler wiederholen** (einfache Spaced-Repetition).

Zwei Betriebsarten:

- **Lokal/offline** (kein Backend nötig): Fortschritt bleibt im `localStorage`
  des Browsers. Siehe „Starten (lokal)".
- **Online mit Nutzerkonten** (eigener Server, z. B. VPS mit Coolify):
  `server.js` liefert die App aus, Nutzer melden sich mit ihrem Namen an
  (Allowlist in `users.json`) und ihr Fortschritt wird serverseitig
  gespeichert — die Stats folgen ihnen auf jedes Gerät. Siehe
  „Online-Betrieb (VPS/Coolify)".

---

## Starten (lokal)

### Variante A (empfohlen): lokaler Mini-Webserver

```
cd c-klausurtrainer
python -m http.server 8000
```

Dann im Browser **http://localhost:8000** öffnen. Nur so funktioniert der
Service Worker, d. h. die App ist danach **komplett offline** nutzbar und als
PWA installierbar.

Alternativ funktioniert jeder andere statische Server (z. B.
`npx serve`, `php -S localhost:8000`).

### Variante B: Doppelklick auf `index.html`

Funktioniert ebenfalls: Weil Browser `fetch()` auf lokale Dateien blockieren,
lädt die App dann automatisch die eingebettete Pool-Kopie
`data/questions.js` (ein Hinweis erscheint auf der Startseite).
Einschränkung: ohne Webserver gibt es keinen Service Worker und keine
PWA-Installation — zum Lernen am Rechner reicht es aber völlig.

### Als App installieren (PWA)

1. Seite über `http://localhost:8000` (oder vom Handy aus über die lokale
   IP des Rechners, z. B. `http://192.168.x.y:8000`) öffnen.
2. Chrome/Edge: „App installieren" in der Adressleiste · Android: Menü →
   „Zum Startbildschirm hinzufügen" · iOS Safari: Teilen → „Zum Home-Bildschirm".
3. Nach dem ersten Laden cached der Service Worker alle Dateien inklusive
   Fragenpool — die App läuft danach ohne jede Verbindung.

---

## Online-Betrieb (VPS/Coolify) — Login & Stats pro Nutzer

`server.js` ist ein Mini-Backend mit purem Node.js (keine npm-Pakete):
statische Auslieferung + Login per Name + Speichern des Fortschritts pro
Nutzer als JSON-Datei. Lokal testen:

```
cd c-klausurtrainer
node server.js          # läuft auf http://localhost:3000
```

### Deployment mit Coolify (GitHub)

1. Den Ordner `c-klausurtrainer` als **eigenes GitHub-Repo** pushen
   (die `Dockerfile` liegt im Repo-Root).
2. In Coolify: **New Resource → (Private/Public) Repository** → Repo wählen →
   **Build Pack: Dockerfile**. Port ist 3000 (steht im Dockerfile).
3. **Wichtig — persistenter Speicher:** In den App-Einstellungen unter
   *Storages* ein Volume anlegen mit **Destination `/app/data-store`**.
   Ohne dieses Volume sind alle Nutzer-Stände nach jedem Redeploy weg!
4. Unter *Domains* die Subdomain eintragen (z. B. `klausur.deine-domain.de`).
   Beim DNS-Anbieter einen A-Record der Subdomain auf die IP des VPS zeigen
   lassen — Coolify besorgt das HTTPS-Zertifikat automatisch.
5. **Deploy** klicken. Fertig — Health-Check: `https://…/api/health`.

Updates (neuer Fragenpool, neue Nutzer): committen & pushen, Coolify
redeployt (bei aktiviertem Auto-Deploy automatisch).

### Nutzer verwalten

Die erlaubten Login-Namen stehen in [`users.json`](users.json). Neuen Nutzer
hinzufügen = Name ergänzen (klein geschrieben), committen, redeployen.
Entfernte Namen können sich sofort nicht mehr anmelden.

**Hinweis zur Sicherheit:** Der Login besteht bewusst nur aus dem Namen
(keine Passwörter). Jeder, der die URL und einen gültigen Namen kennt, kann
sich als dieser Nutzer anmelden. Für den Zweck (Lerntrainer im Freundeskreis)
ist das okay — sensible Daten liegen keine im System, gespeichert wird nur
der Lernfortschritt.

**Täglicher Login:** Die Anmeldung gilt nur für den Kalendertag (deutsche
Zeit). Ab Mitternacht ist beim nächsten Öffnen wieder der Login-Screen dran —
so sieht jeder täglich den Spenden-Hinweis. Umgesetzt über das Cookie
`name~YYYY-MM-DD` (Login-Tag); ist der Tag nicht mehr heute, zählt man als
abgemeldet (`currentUser` in `server.js`). Der Lernfortschritt bleibt davon
unberührt — er liegt serverseitig pro Nutzer.

### Wie der Sync funktioniert

Der Fortschritt liegt weiterhin als Offline-Cache im `localStorage`
(pro Nutzer getrennt) und wird bei jeder Änderung entprellt an den Server
geschickt (`PUT /api/state`). Beim Login wird verglichen: der neuere Stand
(Zeitstempel) gewinnt. Ist der Server mal nicht erreichbar, läuft die App
offline weiter und schiebt den Stand nach, sobald wieder Netz da ist.
Ohne Backend (statisches Hosting, `python -m http.server`, Doppelklick)
erkennt die App das automatisch und läuft wie bisher im Gastmodus ohne Login.

---

## Die drei Modi

| Modus | Was passiert |
|---|---|
| **Üben nach Thema** | Themen/Schwierigkeit wählen, Sofort-Feedback und Erklärung. Standardmäßig ist **Q2** aktiv (`mittel` + `schwer`): 116 Konzeptfamilien decken alle 47 aktiven Themen ab und besitzen jeweils mindestens zwei Varianten. Pro Durchlauf kommt je Konzept eine Variante; der nächste vollständige Durchlauf wechselt zuerst die Perspektive (Regel, Anwendung, Diagnose, Transfer) und danach Zahlen/Namen. Leichte Grundlagen lassen sich freiwillig zuschalten. Geschaffte Konzepte verschwinden, falsche kommen wieder; Antwortoptionen werden gemischt. |
| **Klausursimulation** | Harte Sechser-Serie: Jede Simulation besitzt 45 Einheiten, 81 Punkte und deckt alle 47 aktiven Themen ab. Teil 1 enthält 5 R/F-, 13 Mehrfachauswahl-, 13 Predict-Output-, alle 6 Zahlensystem-Richtungen und 3 Einfachauswahl-Aufgaben; Teil 2 enthält 4 Code-Snippets mit je 10 Aussagen sowie 1 Fehler-finden-Aufgabe. Der getrennte Pool umfasst 24 klausurexklusive Programme. Innerhalb der sechs Klausuren wiederholt sich weder eine konkrete Einzelfrage noch ein Code-Snippet; zusätzlich schützt ein Inhaltsfingerabdruck vor Dubletten mit anderer ID. Nach Klausur 6 ist ein bewusster Serien-Neustart nötig. Alle Einzelfragen sind verifiziert und mittel/schwer. |
| **Fehler wiederholen** | Falsch beantwortete + gemerkte Fragen. Wer eine Frage **einmal richtig** beantwortet, nimmt sie sofort aus dem Pool — so wiederholen sich dieselben Fragen nicht. Gemerkte Fragen bleiben, bis die Markierung entfernt wird. |

**Notenschätzung** (üblicher Hochschulschlüssel, Bestehensgrenze 50 %):
≥95 % → 1,0 · ≥90 % → 1,3 · ≥85 % → 1,7 · ≥80 % → 2,0 · ≥75 % → 2,3 ·
≥70 % → 2,7 · ≥65 % → 3,0 · ≥60 % → 3,3 · ≥55 % → 3,7 · ≥50 % → 4,0 · sonst 5,0.
(Ohne Gewähr — der echte Schlüssel des Dozenten kann abweichen.)

**Tastatur:** `1`–`9` Option wählen, `Enter` prüfen/weiter.

---

## Projektstruktur

```
c-klausurtrainer/
├── index.html              # Einstieg
├── css/styles.css          # Styling (mobile-first, hell/dunkel)
├── js/app.js               # UI, Navigation, Modi, Login, Rendering
├── js/quiz-engine.js       # Validierung, Fragenauswahl, Klausur-Bau, Bewertung
├── js/storage.js           # Fortschritt in localStorage + Server-Sync
├── data/questions.json     # Fragenpool (Quelle der Wahrheit)
├── data/questions.js       # generierte Kopie für den Start per Doppelklick
├── docs/QUALITAETSKONZEPT.md # verbindliche Q2-Regeln und Abnahmekriterien
├── assets/icons/           # PWA-Icons (192/512 px)
├── assets/fonts/           # Montserrat (lokal eingebettet, kein CDN)
├── manifest.webmanifest    # PWA-Manifest
├── service-worker.js       # Offline-Caching aller Dateien
├── server.js               # Mini-Backend für den Online-Betrieb (Node, ohne npm)
├── scripts/
│   ├── enrich-find-bug.js  # erzeugt strukturierte Fehlerstellen + Offline-Kopie
│   ├── enrich-question-quality.js # Fachkorrekturen, Familien + Detailfragen
│   ├── enrich-exam-snippets.js # 24 exklusive Klausurprogramme à 10 Aussagen
│   ├── test-find-bug.js    # Regressionstest für Fehlersuche und Klausurbau
│   └── test-question-quality.js # Q2-Durchläufe + vollständige Sechser-Serien
├── users.json              # erlaubte Login-Namen (Allowlist)
├── Dockerfile              # Container für Coolify
└── README.md
```

Auf dem Server kommen die Nutzer-Stände nach `data-store/` (bzw. in das in
Coolify gemountete Volume `/app/data-store`) — eine JSON-Datei pro Nutzer.

---

## Fragenpool austauschen / erweitern

1. Neue bzw. erweiterte Datei nach `data/questions.json` kopieren
   (Schema unverändert lassen; fehlerhafte Fragen werden beim Laden
   übersprungen und dezent gezählt, die App stürzt nicht ab).
2. Im Ordner `c-klausurtrainer` die redaktionellen Anreicherungen in dieser
   Reihenfolge ausführen. Beide Skripte sind wiederholbar; das zweite erzeugt
   am Ende auch die aktuelle Doppelklick-Kopie `data/questions.js`:

   ```
   node scripts/enrich-find-bug.js
   node scripts/enrich-question-quality.js
   node scripts/enrich-exam-snippets.js
   ```

3. Beide Regressionstests ausführen:

   ```
   node scripts/test-find-bug.js
   node scripts/test-question-quality.js
   ```

4. In `service-worker.js` die Konstante `VERSION` hochzählen (aktuell
   `ckt-v19`, beim nächsten Update z. B. `ckt-v20`), damit installierte PWAs
   den neuen Pool übernehmen. Beim Laden über den
   Webserver holt sich die App den Pool ohnehin bevorzugt frisch aus dem Netz
   (Network-first für `questions.json`).

### Unterstützte Fragetypen

`mc-single`, `mc-multi`, `predict-output`, `true-false`, `find-bug`,
`short-answer` (Vergleich normalisiert: Groß/Klein, Leerzeichen, `0x`/`0b`,
führende Nullen; `acceptedAnswers` für Alternativen), `code-explain`
(Freitext mit Musterlösung zum Selbstabgleich). Fragen mit gleicher `group`
gehören zu einem Code-Snippet und werden zusammen angezeigt.
Mit `examOnly: true` markierte Gruppen werden ausschließlich für die vier
Codeblöcke der Klausursimulation verwendet. Sie zählen nicht zum normalen
Durchlauf, zum Fehler-Wiederholen oder zum Lernfortschritt.

Mit `familyId` lassen sich Werte-, Namens- oder Codevarianten ausdrücklich
derselben semantischen Konzeptfamilie zuordnen. Fehlt das Feld, verwendet die
Engine weiterhin ihre Textnormalisierung als Rückfall. Übungsdurchläufe und
Klausuren wählen auf Familienebene und danach zufällig eine konkrete Variante.
`variantAngle` unterscheidet Regel, Anwendung, Diagnose und Transfer;
`qualityLevel: 2` kennzeichnet redaktionell geprüfte Q2-Varianten. Die
vollständige Definition steht in
[`docs/QUALITAETSKONZEPT.md`](docs/QUALITAETSKONZEPT.md).

`find-bug` unterstützt zusätzlich `bugTargets`: Jede Fehlerstelle enthält die
ursprüngliche Zeile (`originalLine`), eine kanonische Vollzeilenlösung
(`solution`) und alle akzeptierten vollständigen Korrekturzeilen
(`acceptedCorrectedLines`). Einzelne Zeichen, Operatoren oder Stichwörter
reichen als Antwort nicht. Formatierungsleerzeichen außerhalb von C-String- und
Zeichenliteralen werden ignoriert; Schreibweise und der Inhalt von Literalen
bleiben fachlich relevant. Der Nutzer markiert dadurch Fehler direkt im Code
und muss anschließend immer die komplette korrigierte Zeile eingeben. Für eine
vollständig richtige Antwort müssen alle Fehlerstellen passend korrigiert sein;
zusätzliche Markierungen zählen als falsch. Die bisherigen
`options`/`answerIndices` bleiben als rückwärtskompatible redaktionelle Quelle
erhalten.

Der redaktionelle Pool enthält 30 Fehlersuche-Aufgaben. Davon sind 27 aktiv;
drei Aufgaben mit einer notwendigen Löschoperation bleiben als Quelle erhalten,
werden aber nicht abgefragt. Nach redaktionellen Änderungen erzeugt
`node scripts/enrich-find-bug.js` die strukturierten Vollzeilen-Fehlerstellen
erneut und aktualisiert zugleich `data/questions.js`.

`node scripts/enrich-question-quality.js` korrigiert die fachlich geprüften
Einzelfälle, setzt die expliziten Konzeptfamilien und ergänzt die 28
Dozenten-Detailfragen sowie 56 zusätzliche Q2-Verständnisvarianten.
`node scripts/enrich-exam-snippets.js` stellt anschließend 24
klausurexklusive Programme mit jeweils zehn zusammenhängenden Aussagen nach
dem Aufbau der `Beispielaufgaben Vorbereitung SS25.pdf` bereit und ergänzt
knappe Detailthemen um die für sechs Klausuren nötigen Varianten. Danach
prüfen `node scripts/test-find-bug.js` und
`node scripts/test-question-quality.js` Datenvertrag, Bewertung,
Rückwärtskompatibilität, Familienbildung, Variantenrotation, vollständige
Themenabdeckung und den Wiederholungsschutz über komplette Sechser-Serien.

---

## Fortschritt zurücksetzen

Startseite → „Fortschritt zurücksetzen" (löscht Statistik, Markierungen und
Fehler-Historie aus dem `localStorage` dieses Browsers). Alternativ die
Browserdaten der Seite löschen.
