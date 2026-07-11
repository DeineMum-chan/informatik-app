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
| **Üben nach Thema** | Themen/Schwierigkeit wählen, endloser Fragenstrom mit Sofort-Feedback und Erklärung. Kürzlich gezeigte Fragen werden zurückgestellt. „☆ merken" markiert schwierige Fragen. |
| **Klausursimulation** | Realistischer Mix: Teil 1 (~40 Fragen: R/F-Aussagen, „Was trifft zu?", Predict-Output, Zahlensysteme, Einfachauswahl) + Teil 2 (4 Code-Snippets à ~10 Aussagen + 1 Fehler-finden). Optionen: Zeitlimit (Standard 90 min) und Negativ-Marking (unbeantwortet = −0,5 P., wie beim Dozenten). Am Ende: Punkte, Prozent, geschätzte Note, Themen-Schwächen und komplette Durchsicht. |
| **Fehler wiederholen** | Falsch beantwortete + gemerkte Fragen. Leitner-Prinzip: falsch → Stufe 0 (kommt oft), richtig → Stufe hoch; ab Stufe 4 gilt die Frage als gelernt. |

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
├── assets/icons/           # PWA-Icons (192/512 px)
├── assets/fonts/           # Montserrat (lokal eingebettet, kein CDN)
├── manifest.webmanifest    # PWA-Manifest
├── service-worker.js       # Offline-Caching aller Dateien
├── server.js               # Mini-Backend für den Online-Betrieb (Node, ohne npm)
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
2. Die Doppelklick-Kopie neu erzeugen — PowerShell im Ordner `c-klausurtrainer`:

   ```powershell
   "window.CKT_EMBEDDED_DATA = " + (Get-Content -Raw data/questions.json) + ";" |
     Set-Content -Encoding utf8 data/questions.js
   ```

   oder mit Python:

   ```
   python -c "open('data/questions.js','w',encoding='utf-8').write('window.CKT_EMBEDDED_DATA = '+open('data/questions.json',encoding='utf-8').read()+';')"
   ```

3. In `service-worker.js` die Konstante `VERSION` hochzählen (z. B. `ckt-v2`),
   damit installierte PWAs den neuen Pool übernehmen. Beim Laden über den
   Webserver holt sich die App den Pool ohnehin bevorzugt frisch aus dem Netz
   (Network-first für `questions.json`).

### Unterstützte Fragetypen

`mc-single`, `mc-multi`, `predict-output`, `true-false`, `find-bug`,
`short-answer` (Vergleich normalisiert: Groß/Klein, Leerzeichen, `0x`/`0b`,
führende Nullen; `acceptedAnswers` für Alternativen), `code-explain`
(Freitext mit Musterlösung zum Selbstabgleich). Fragen mit gleicher `group`
gehören zu einem Code-Snippet und werden zusammen angezeigt.

---

## Fortschritt zurücksetzen

Startseite → „Fortschritt zurücksetzen" (löscht Statistik, Markierungen und
Fehler-Historie aus dem `localStorage` dieses Browsers). Alternativ die
Browserdaten der Seite löschen.
