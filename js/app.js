/*
 * app.js — UI, Navigation, Modi & Rendering des C-Klausurtrainers.
 *
 * Es wird nie HTML aus Pool-Daten zusammengesetzt (nur textContent),
 * kein eval, kein Code-Ausführen — alle Lösungen stehen im Fragenpool.
 */

(function () {
  'use strict';

  const appEl = document.getElementById('app');
  const footerEl = document.getElementById('footerNote');
  const topInfoEl = document.getElementById('topbarInfo');

  const TYPE_LABELS = {
    'mc-single': 'Einfachauswahl',
    'mc-multi': 'Mehrfachauswahl',
    'predict-output': 'Predict Output',
    'true-false': 'Richtig / Falsch',
    'find-bug': 'Fehler finden',
    'short-answer': 'Kurzantwort',
    'code-explain': 'Code erklären',
  };

  // Zentraler App-Zustand
  const S = {
    data: null,          // aufbereiteter Pool (CKT.engine.prepare)
    usedEmbedded: false, // Pool kam aus data/questions.js (file://-Fallback)
    practiceFilters: null,
    practice: null,
    review: null,
    exam: null,
    examResult: null,
    keyHandler: null,    // Tastatur-Handler der aktiven Ansicht
  };

  // ===========================================================================
  // Kleine Helfer
  // ===========================================================================

  /** DOM-Baukasten: el('div', {className:'x', onclick:fn}, child, 'text', …) */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        if (value == null) continue;
        if (key === 'className') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else node.setAttribute(key, value);
      }
    }
    for (const child of children) {
      if (child == null) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  // Hinweis: setView lässt S.keyHandler unangetastet — die Frage-Renderer
  // setzen ihren Handler beim Aufbau, Views ohne Tastatursteuerung setzen ihn
  // am Anfang ihrer render-Funktion explizit auf null.
  function setView(node, info) {
    appEl.replaceChildren(node);
    topInfoEl.textContent = info || '';
    window.scrollTo(0, 0);
  }

  function fmtPercent(x) {
    return (Math.round(x * 10) / 10).toLocaleString('de-DE') + ' %';
  }

  function fmtRelative(ts) {
    if (!ts) return '–';
    const days = Math.floor((Date.now() - ts) / 86400000);
    if (days <= 0) return 'heute';
    if (days === 1) return 'gestern';
    return `vor ${days} Tagen`;
  }

  function fmtClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function topicOf(q) {
    return S.data.topicById[q.topicId] || { name: q.topicId, area: '' };
  }

  // ===========================================================================
  // Farbschema
  // ===========================================================================

  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.dataset.theme = theme;
    } else {
      delete document.documentElement.dataset.theme;
    }
    const dark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0a0a0c' : '#f5f5f7');
  }

  function toggleTheme() {
    const dark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    CKT.storage.setTheme(next);
    applyTheme(next);
  }

  // ===========================================================================
  // C-Syntax-Highlighting (eigener Mini-Tokenizer, rein lokal)
  // ===========================================================================

  const C_KEYWORDS = new Set([
    'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
    'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'int',
    'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static',
    'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile',
    'while', 'bool', 'true', 'false', 'NULL',
  ]);

  const C_TOKEN_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*")|('(?:\\.|[^'\\\n])*')|(^[ \t]*#[ \t]*\w+)|(\b0[xX][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFuUlL]*\b)|([A-Za-z_]\w*)/gm;

  /**
   * Zerlegt C-Code in klassifizierte Tokens: [{cls|null, text}, …].
   * Bewusst simpel — reicht für die kurzen Klausur-Snippets völlig aus.
   */
  function tokenizeC(code) {
    const tokens = [];
    let last = 0;
    let m;
    C_TOKEN_RE.lastIndex = 0;
    while ((m = C_TOKEN_RE.exec(code)) !== null) {
      if (m.index > last) tokens.push({ cls: null, text: code.slice(last, m.index) });
      let cls = null;
      if (m[1]) cls = 'tk-com';
      else if (m[2]) cls = 'tk-str';
      else if (m[3]) cls = 'tk-str';
      else if (m[4]) cls = 'tk-pp';
      else if (m[5]) cls = 'tk-num';
      else if (m[6]) {
        if (C_KEYWORDS.has(m[6])) cls = 'tk-kw';
        else {
          // Funktionsaufruf/-definition: Bezeichner direkt vor "("
          const rest = code.slice(m.index + m[0].length);
          if (/^\s*\(/.test(rest)) cls = 'tk-fn';
        }
      }
      tokens.push({ cls, text: m[0] });
      last = m.index + m[0].length;
    }
    if (last < code.length) tokens.push({ cls: null, text: code.slice(last) });
    return tokens;
  }

  /** Baut den Code-Block als DOM (Zeilennummern ab 2 Zeilen). */
  function renderCode(code) {
    const tokens = tokenizeC(code.replace(/\r\n/g, '\n').replace(/\s+$/, ''));
    // Tokens auf Zeilen verteilen (mehrzeilige Tokens, z. B. /* … */, sauber teilen)
    const lines = [[]];
    for (const t of tokens) {
      const parts = t.text.split('\n');
      parts.forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part.length > 0) lines[lines.length - 1].push({ cls: t.cls, text: part });
      });
    }

    const multi = lines.length > 1;
    const inner = el('div', { className: 'code-inner' });
    lines.forEach((lineTokens, i) => {
      const line = el('div', { className: 'cl' });
      if (multi) line.appendChild(el('span', { className: 'ln', text: String(i + 1) }));
      const content = el('span');
      for (const t of lineTokens) {
        content.appendChild(t.cls
          ? el('span', { className: t.cls, text: t.text })
          : document.createTextNode(t.text));
      }
      if (lineTokens.length === 0) content.appendChild(document.createTextNode(' '));
      line.appendChild(content);
      inner.appendChild(line);
    });

    return el('div', { className: 'codeblock' + (multi ? '' : ' inline-expr') }, inner);
  }

  /** Syntaxhervorgehobener Inhalt einer einzelnen, bereits getrennten Codezeile. */
  function renderCodeLineContent(line) {
    const content = el('span', { className: 'bug-line-code' });
    const tokens = tokenizeC(line);
    for (const token of tokens) {
      content.appendChild(token.cls
        ? el('span', { className: token.cls, text: token.text })
        : document.createTextNode(token.text));
    }
    if (line.length === 0) {
      content.appendChild(el('span', { className: 'bug-empty-line', text: 'Hier Code oder Zeichen ergänzen' }));
    }
    return content;
  }

  // ===========================================================================
  // Antwort-Widgets
  // ===========================================================================

  /**
   * Anzeige-Reihenfolge der Optionen: gemischt, damit man sich nicht "es war
   * die dritte" merken kann. Richtig/Falsch bleibt in fester Reihenfolge.
   * Liefert ein Array von Original-Indizes in Anzeige-Reihenfolge.
   */
  function makeOptionOrder(q) {
    const identity = q.options.map((_, i) => i);
    if (q.type === 'true-false') return identity;
    return CKT.engine.shuffle(identity);
  }

  /**
   * Optionsliste (Radio-Verhalten bei single, Checkbox-Verhalten bei multi).
   * Anzeige gemischt (opts.order überschreibbar, z. B. stabil pro Klausur);
   * Auswahl/Antworten laufen IMMER im Original-Indexraum der Frage.
   * Rückgabe: { root, order, getAnswer, setEnabled, reveal, selectKey }
   */
  function createOptionList(q, opts) {
    const multi = q.type === 'mc-multi' || q.type === 'find-bug';
    const onChange = opts && opts.onChange;
    const order = (opts && opts.order) || makeOptionOrder(q);
    let selection = new Set(opts && opts.initial != null
      ? (multi ? opts.initial : [opts.initial]) : []);
    let enabled = true;

    // buttons[d] zeigt die Original-Option order[d]
    const buttons = order.map((oi, d) => {
      const btn = el('button', {
        type: 'button',
        className: 'option',
        onclick: () => {
          if (!enabled) return;
          if (multi) {
            if (selection.has(oi)) selection.delete(oi); else selection.add(oi);
          } else {
            selection = new Set([oi]);
          }
          sync();
          if (onChange) onChange(getAnswer());
        },
      },
        el('span', { className: 'option-key', text: String(d + 1) }),
        el('span', { className: 'option-text', text: q.options[oi] })
      );
      return btn;
    });

    function sync() {
      buttons.forEach((b, d) => b.classList.toggle('selected', selection.has(order[d])));
    }
    sync();

    function getAnswer() {
      if (multi) return selection.size > 0 ? [...selection].sort((a, b) => a - b) : null;
      return selection.size > 0 ? [...selection][0] : null;
    }

    return {
      root: el('div', { className: 'options' }, ...buttons),
      order,
      getAnswer,
      setEnabled(v) { enabled = v; buttons.forEach((b) => { b.disabled = !v; }); },
      selectKey(i) { if (enabled && i < buttons.length) buttons[i].click(); },
      reveal() {
        const correct = new Set(multi ? q.answerIndices : [q.answerIndex]);
        buttons.forEach((b, d) => {
          const oi = order[d];
          if (correct.has(oi)) b.classList.add('reveal-correct');
          else if (selection.has(oi)) b.classList.add('reveal-wrong');
        });
      },
    };
  }

  /** Kurzantwort-Eingabe. onSubmit wird bei Enter ausgelöst. */
  function createShortAnswer(q, opts) {
    const input = el('input', {
      className: 'answer-input',
      type: 'text',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      placeholder: 'Antwort eingeben …',
      value: (opts && opts.initial) || '',
      onkeydown: (e) => {
        if (e.key === 'Enter' && opts && opts.onSubmit) {
          // stopPropagation: sonst behandelt der Dokument-Handler dasselbe
          // Enter noch einmal und blättert direkt zur nächsten Frage weiter.
          e.preventDefault();
          e.stopPropagation();
          opts.onSubmit();
        }
      },
      oninput: () => { if (opts && opts.onChange) opts.onChange(input.value); },
    });
    return {
      root: el('div', { className: 'answer-line' }, input),
      getAnswer: () => input.value,
      setEnabled(v) { input.disabled = !v; },
      focus() { input.focus(); },
      reveal() { /* Musterlösung zeigt der Feedback-Block */ },
    };
  }

  /**
   * Fehlersuche direkt im Code: Zeile markieren und die vollständig
   * korrigierte Codezeile eintragen.
   * Die Bewertung arbeitet mit bugTargets aus dem Fragenpool; es wird kein
   * Fragen-Code ausgeführt.
   */
  function createBugEditor(q, opts) {
    const initialMarks = opts && opts.initial && Array.isArray(opts.initial.marks)
      ? opts.initial.marks : [];
    const selected = new Map(initialMarks.map((mark) => [
      Number(mark.line), String(mark.correction || ''),
    ]));
    let enabled = true;

    const codeLines = String(q.code || '').replace(/\r\n/g, '\n').replace(/\s+$/, '').split('\n');
    const targetLines = q.bugTargets.flatMap((target) =>
      Array.isArray(target.acceptedLines) ? target.acceptedLines : [target.line]);
    const maxLine = Math.max(codeLines.length, ...targetLines);
    while (codeLines.length < maxLine) codeLines.push('');

    const rows = new Map();
    const root = el('div', { className: 'bug-editor' },
      el('div', { className: 'bug-instructions' },
        el('strong', { text: 'So geht’s:' }),
        ' Tippen Sie auf jede fehlerhafte Zeile und geben Sie darunter immer die vollständig korrigierte Codezeile ein. Auch bei einem fehlenden Zeichen muss die ganze Zeile eingetragen werden.'));

    function getAnswer() {
      if (selected.size === 0) return null;
      return {
        marks: [...selected.entries()]
          .map(([line, correction]) => ({ line, correction }))
          .sort((a, b) => a.line - b.line),
      };
    }

    function notifyChange() {
      if (opts && opts.onChange) opts.onChange(getAnswer());
    }

    codeLines.forEach((lineText, index) => {
      const line = index + 1;
      const marker = el('span', { className: 'bug-line-marker', text: '○' });
      const input = el('input', {
        className: 'bug-correction-input',
        type: 'text',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        placeholder: 'Vollständig korrigierte Codezeile …',
        value: selected.get(line) || '',
        'aria-label': `Vollständig korrigierte Codezeile ${line}`,
        oninput: () => {
          if (selected.has(line)) {
            selected.set(line, input.value);
            notifyChange();
          }
        },
      });
      const correction = el('div', { className: 'bug-correction' },
        el('span', { className: 'bug-correction-arrow', text: '↳' }),
        input);
      const lineButton = el('button', {
        type: 'button',
        className: 'bug-code-line',
        'aria-pressed': selected.has(line) ? 'true' : 'false',
        onclick: () => {
          if (!enabled) return;
          if (selected.has(line)) {
            selected.delete(line);
          } else {
            selected.set(line, input.value);
          }
          syncRow();
          notifyChange();
          if (selected.has(line)) window.setTimeout(() => input.focus(), 0);
        },
      },
        marker,
        el('span', { className: 'bug-line-number', text: String(line) }),
        renderCodeLineContent(lineText));
      const row = el('div', { className: 'bug-line-row' }, lineButton, correction);

      function syncRow() {
        const isSelected = selected.has(line);
        row.classList.toggle('selected', isSelected);
        lineButton.setAttribute('aria-pressed', String(isSelected));
        marker.textContent = isSelected ? '●' : '○';
        correction.hidden = !isSelected;
      }

      rows.set(line, { row, lineButton, input, marker, syncRow });
      syncRow();
      root.appendChild(row);
    });

    return {
      root,
      getAnswer,
      setEnabled(value) {
        enabled = value;
        for (const ref of rows.values()) {
          ref.lineButton.disabled = !value;
          ref.input.disabled = !value;
        }
      },
      reveal(details) {
        const matched = new Set((details && details.matchedTargets) || []);
        for (const [line, ref] of rows) {
          const mark = selected.has(line) ? { line, correction: selected.get(line) } : null;
          const possibleTargets = q.bugTargets.filter((target) => {
            const acceptedLines = Array.isArray(target.acceptedLines) ? target.acceptedLines : [target.line];
            return acceptedLines.includes(line);
          });
          if (mark) {
            if (possibleTargets.some((target) =>
              CKT.engine.bugCorrectionMatches(target, mark.correction, line))) {
              ref.row.classList.add('result-correct');
            } else if (possibleTargets.length > 0) {
              ref.row.classList.add('result-partial');
            } else {
              ref.row.classList.add('result-wrong');
            }
          }
        }
        for (const target of q.bugTargets) {
          if (!matched.has(target.id)) {
            const ref = rows.get(target.line);
            if (ref) ref.row.classList.add('result-missing');
          }
        }
      },
    };
  }

  // ===========================================================================
  // Fragekarte (Einzelfrage) — genutzt in Üben, Fehler wiederholen & Klausur
  // ===========================================================================

  function metaRow(q, opts) {
    const t = topicOf(q);
    const row = el('div', { className: 'qmeta' },
      el('span', { className: 'tag', text: t.area ? `${t.area} · ${t.name}` : t.name }),
      el('span', { className: `tag diff-${q.difficulty}`, text: q.difficulty || '–' }),
      el('span', { className: 'tag', text: TYPE_LABELS[q.type] || q.type })
    );
    if (opts && opts.mark) {
      const btn = el('button', {
        type: 'button',
        className: 'mark-btn' + (CKT.storage.isMarked(q.id) ? ' marked' : ''),
        onclick: () => {
          const marked = CKT.storage.toggleMark(q.id);
          btn.classList.toggle('marked', marked);
          btn.textContent = marked ? '★ gemerkt' : '☆ merken';
        },
      }, CKT.storage.isMarked(q.id) ? '★ gemerkt' : '☆ merken');
      row.appendChild(btn);
    }
    return row;
  }

  /**
   * Nummerierte Pro-Option-Erklärungen ("1. ✓ …") an die gemischte
   * Anzeige-Reihenfolge anpassen. Prosa-Erklärungen bleiben unverändert.
   */
  function displayExplanation(q, order) {
    const text = q.explanation || '';
    if (!order || !q.options) return text;
    const lines = text.split('\n');
    if (lines.length !== q.options.length) return text;
    if (!lines.every((l, i) => l.startsWith((i + 1) + '. '))) return text;
    return order.map((oi, d) => (d + 1) + '. ' + lines[oi].replace(/^\d+\. /, '')).join('\n');
  }

  function explanationBox(q, order) {
    if (CKT.engine.isStructuredFindBug(q)) return null;
    if (!q.explanation) return null;
    return el('div', { className: 'explanation' },
      el('span', { className: 'exp-label', text: 'Erklärung' }),
      displayExplanation(q, order));
  }

  function feedbackBanner(correct, extraText) {
    return el('div', { className: 'feedback ' + (correct ? 'ok' : 'bad'), text: (correct ? '✔ Richtig!' : '✘ Falsch.') + (extraText ? ' ' + extraText : '') });
  }

  /**
   * Text der Musterlösung für den Feedback-/Review-Block.
   * order (falls übergeben): Nummern beziehen sich auf die ANGEZEIGTE
   * (gemischte) Reihenfolge, damit sie zum Bildschirm passen.
   */
  function correctAnswerText(q, order) {
    const num = (i) => (order ? order.indexOf(i) : i) + 1;
    if (CKT.engine.isStructuredFindBug(q)) {
      return q.bugTargets.map((target) =>
        `Zeile ${target.line}: ${target.solution}\n${target.description}`).join('\n\n');
    }
    switch (q.type) {
      case 'mc-single': case 'predict-output': case 'true-false':
        return q.options[q.answerIndex];
      case 'mc-multi': case 'find-bug':
        return q.answerIndices
          .slice()
          .sort((a, b) => num(a) - num(b))
          .map((i) => `${num(i)}. ${q.options[i]}`).join('\n');
      case 'short-answer': case 'code-explain':
        return q.answer;
      default: return '';
    }
  }

  function userAnswerText(q, answer) {
    if (!CKT.engine.isAnswered(q, answer)) return '— (nicht beantwortet)';
    if (CKT.engine.isStructuredFindBug(q)) {
      return answer.marks
        .slice()
        .sort((a, b) => a.line - b.line)
        .map((mark) => `Zeile ${mark.line}: ${mark.correction || '— keine Korrektur eingetragen'}`)
        .join('\n');
    }
    switch (q.type) {
      case 'mc-single': case 'predict-output': case 'true-false':
        return q.options[answer];
      case 'mc-multi': case 'find-bug':
        return answer.map((i) => `${i + 1}. ${q.options[i]}`).join('\n');
      case 'short-answer':
        return String(answer);
      case 'code-explain':
        return answer.self ? 'Selbsteinschätzung: gewusst' : 'Selbsteinschätzung: nicht gewusst';
      default: return '';
    }
  }

  /**
   * Interaktive Einzelfrage mit Sofort-Feedback (Üben/Fehler wiederholen).
   * onDone(correct) wird nach der Bewertung aufgerufen; onNext beim Weiterklicken.
   */
  function renderImmediateQuestion(q, { onDone, onNext, showCode = true }) {
    const card = el('div', { className: 'card qcard' });
    card.appendChild(metaRow(q, { mark: true }));
    if (q.group && q.groupPrompt) card.appendChild(el('p', { className: 'group-prompt', text: q.groupPrompt }));
    card.appendChild(el('p', { className: 'qprompt', text: q.prompt }));
    if (showCode && q.code && !CKT.engine.isStructuredFindBug(q)) card.appendChild(renderCode(q.code));

    const feedbackSlot = el('div');
    const actionBtn = el('button', { className: 'btn btn-primary', type: 'button', text: 'Antwort prüfen' });
    let phase = 'answer'; // 'answer' → 'feedback'
    let widget = null;

    // Widget nach Fragetyp
    if (CKT.engine.isStructuredFindBug(q)) {
      widget = createBugEditor(q, {});
    } else if (q.type === 'short-answer') {
      widget = createShortAnswer(q, { onSubmit: () => actionBtn.click() });
    } else if (q.type === 'code-explain') {
      const textarea = el('textarea', { className: 'answer-textarea', placeholder: 'Eigene Erklärung notieren (optional) …' });
      widget = {
        root: textarea,
        getAnswer: () => null, // Bewertung erfolgt per Selbsteinschätzung
        setEnabled(v) { textarea.disabled = !v; },
        reveal() {},
      };
    } else {
      widget = createOptionList(q, {});
    }
    card.appendChild(widget.root);
    card.appendChild(feedbackSlot);

    function finish(correct, extraText) {
      onDone(correct);
      feedbackSlot.appendChild(feedbackBanner(correct, extraText));
      if (q.type === 'short-answer' || CKT.engine.isStructuredFindBug(q) || !correct) {
        feedbackSlot.appendChild(el('div', { className: 'explanation' },
          el('span', { className: 'exp-label', text: 'Musterlösung' }),
          correctAnswerText(q, widget.order)));
      }
      const exp = explanationBox(q, widget.order);
      if (exp) feedbackSlot.appendChild(exp);
      if (!correct) card.classList.add('shake');
      actionBtn.textContent = 'Weiter →';
      phase = 'feedback';
    }

    actionBtn.addEventListener('click', () => {
      if (phase === 'feedback') { onNext(); return; }
      if (phase === 'selfcheck') return; // Selbstabgleich läuft, Buttons entscheiden

      if (q.type === 'code-explain') {
        // Musterlösung zeigen, dann Selbstabgleich
        widget.setEnabled(false);
        actionBtn.style.display = 'none';
        feedbackSlot.appendChild(el('div', { className: 'explanation' },
          el('span', { className: 'exp-label', text: 'Musterlösung' }), q.answer));
        const exp = explanationBox(q);
        if (exp) feedbackSlot.appendChild(exp);
        feedbackSlot.appendChild(el('div', { className: 'btn-row' },
          el('button', {
            className: 'btn', type: 'button', text: '✔ Wusste ich', onclick: () => { onDone(true); onNext(); },
          }),
          el('button', {
            className: 'btn', type: 'button', text: '✘ Wusste ich nicht', onclick: () => { onDone(false); onNext(); },
          })
        ));
        phase = 'selfcheck';
        return;
      }

      const answer = widget.getAnswer();
      if (!CKT.engine.isAnswered(q, answer)) return; // noch nichts gewählt/eingegeben
      const res = CKT.engine.gradeSingle(q, answer);
      widget.setEnabled(false);
      widget.reveal(res);
      const detail = CKT.engine.isStructuredFindBug(q)
        ? `${res.locationHits} von ${res.total} Fehlerstellen erkannt, ${res.correctionHits} vollständige Korrekturzeilen richtig.`
        : '';
      finish(res.correct, detail);
    });

    card.appendChild(el('div', { className: 'btn-row' }, actionBtn));
    if (CKT.engine.isStructuredFindBug(q)) {
      card.appendChild(el('p', { className: 'kbd-hint' },
        'Codezeile anklicken · ', el('kbd', { text: 'Enter' }), ' prüfen/weiter'));
    } else {
      card.appendChild(el('p', { className: 'kbd-hint' },
        el('kbd', { text: '1' }), '–', el('kbd', { text: '9' }), ' Option wählen · ',
        el('kbd', { text: 'Enter' }), ' prüfen/weiter'));
    }

    // Tastatur der aktiven Frage
    S.keyHandler = (e) => {
      const inInput = /^(INPUT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName);
      if (e.key === 'Enter' && !inInput) { e.preventDefault(); actionBtn.click(); return; }
      if (phase === 'answer' && !inInput && widget.selectKey && /^[1-9]$/.test(e.key)) {
        widget.selectKey(Number(e.key) - 1);
      }
    };

    if (widget.focus) setTimeout(() => widget.focus(), 50);
    return card;
  }

  /**
   * Snippet-Gruppe mit Sofort-Feedback (Übungsmodus): Code oben,
   * darunter alle Aussagen der Gruppe als R/F-Entscheidungen.
   */
  function renderImmediateGroup(group, { onDone, onNext }) {
    const card = el('div', { className: 'card qcard' });
    const t = S.data.topicById[group.topicId];
    card.appendChild(el('div', { className: 'qmeta' },
      el('span', { className: 'tag', text: t ? `${t.area} · ${t.name}` : group.topicId }),
      el('span', { className: 'tag', text: `Snippet · ${group.questions.length} Aussagen` })
    ));
    card.appendChild(el('p', { className: 'qprompt', text: group.groupPrompt || 'Sie haben folgenden Code. Bewerten Sie die Aussagen.' }));
    if (group.code) card.appendChild(renderCode(group.code));

    const answers = {};
    const rows = [];
    const statements = el('div');

    group.questions.forEach((q, idx) => {
      const segButtons = q.options.map((label, i) => el('button', {
        type: 'button', className: 'seg-btn', text: label,
        onclick: () => {
          if (row.locked) return;
          answers[q.id] = i;
          segButtons.forEach((b, j) => b.classList.toggle('selected', j === i));
          updateSubmit();
        },
      }));
      const resultSlot = el('div', { className: 'statement-result' });
      const markBtn = el('button', {
        type: 'button',
        className: 'mark-btn' + (CKT.storage.isMarked(q.id) ? ' marked' : ''),
        title: 'Frage merken',
        onclick: () => {
          const m = CKT.storage.toggleMark(q.id);
          markBtn.classList.toggle('marked', m);
          markBtn.textContent = m ? '★' : '☆';
        },
      }, CKT.storage.isMarked(q.id) ? '★' : '☆');
      const row = {
        q, segButtons, resultSlot, locked: false,
        root: el('div', { className: 'statement-row' },
          el('span', { className: 'statement-num', text: String(idx + 1) + '.' }),
          el('span', { className: 'statement-text', text: q.prompt }),
          el('span', { className: 'seg' }, ...segButtons),
          markBtn,
          resultSlot),
      };
      rows.push(row);
      statements.appendChild(row.root);
    });
    card.appendChild(statements);

    const actionBtn = el('button', { className: 'btn btn-primary', type: 'button', text: 'Alle prüfen', disabled: true });
    let phase = 'answer';

    function updateSubmit() {
      const missing = group.questions.filter((q) => answers[q.id] == null).length;
      actionBtn.disabled = missing > 0;
      actionBtn.textContent = missing > 0 ? `Alle prüfen (${missing} offen)` : 'Alle prüfen';
    }
    updateSubmit();

    actionBtn.addEventListener('click', () => {
      if (phase === 'feedback') { onNext(); return; }
      let correctCount = 0;
      for (const row of rows) {
        row.locked = true;
        const res = CKT.engine.gradeSingle(row.q, answers[row.q.id]);
        if (res.correct) correctCount += 1;
        onDone(row.q, res.correct);
        row.segButtons.forEach((b, i) => {
          b.disabled = true;
          if (i === row.q.answerIndex) b.classList.add('reveal-correct');
          else if (answers[row.q.id] === i) b.classList.add('reveal-wrong');
        });
        const icon = el('span', { className: 'statement-icon ' + (res.correct ? 'ok' : 'bad'), text: res.correct ? ' ✔' : ' ✘' });
        row.root.insertBefore(icon, row.resultSlot);
        if (!res.correct && row.q.explanation) {
          row.resultSlot.appendChild(explanationBox(row.q));
        }
      }
      card.insertBefore(
        feedbackBanner(correctCount === rows.length, `${correctCount} von ${rows.length} Aussagen richtig.`),
        actionBtn.parentNode);
      actionBtn.textContent = 'Weiter →';
      phase = 'feedback';
    });

    card.appendChild(el('div', { className: 'btn-row' }, actionBtn));

    S.keyHandler = (e) => {
      if (e.key === 'Enter' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName)) {
        e.preventDefault();
        if (!actionBtn.disabled) actionBtn.click();
      }
    };
    return card;
  }

  // ===========================================================================
  // Startseite
  // ===========================================================================

  function renderHome() {
    S.keyHandler = null;
    const data = S.data;
    const stats = CKT.storage.globalStats();
    const reviewCount = CKT.engine.buildReviewPool(data).length;
    const overall = CKT.engine.overallProgress(data);
    const runAll = overall.families;   // Durchlauf zählt in Konzepten
    const seenQ = overall.questions;   // Gesamtstand zählt in Einzelfragen
    const practiceSnippetCount = data.groupOrder.filter((id) => !data.groups[id].examOnly).length;
    const examSnippetCount = data.groupOrder.filter((id) => data.groups[id].examOnly).length;
    const view = el('div', { className: 'view' });

    // Hero + Kennzahlen
    view.appendChild(el('div', { className: 'hero' },
      el('h1', {}, 'Bereit für die ', el('span', { className: 'accent', text: 'C-Klausur' }), '?'),
      el('p', {
        text: `${data.questions.length} verifizierte Fragen · `
          + `${practiceSnippetCount} Übungs- und ${examSnippetCount} exklusive Klausur-Snippets · `
          + 'Informatik 1 (THM StudiumPlus)',
      })
    ));

    view.appendChild(el('div', { className: 'stat-row' },
      el('div', { className: 'stat-tile' },
        el('div', { className: 'stat-value', text: stats.rate == null ? '–' : fmtPercent(stats.rate * 100) }),
        el('div', { className: 'stat-label', text: 'Gesamtquote' })),
      el('div', { className: 'stat-tile' },
        el('div', { className: 'stat-value', text: String(stats.streak) }),
        el('div', { className: 'stat-label', text: 'Serie (Best: ' + stats.bestStreak + ')' })),
      el('div', { className: 'stat-tile' },
        el('div', { className: 'stat-value', text: fmtRelative(stats.lastPracticed) }),
        el('div', { className: 'stat-label', text: 'Zuletzt geübt' }))
    ));

    // Gesamt-Lernstand: Wie weit bin ich durch den Pool?
    const runFill = el('div', { className: 'bar-fill' });
    runFill.style.width = runAll.total > 0 ? Math.round((runAll.done / runAll.total) * 100) + '%' : '0%';
    const seenFill = el('div', { className: 'bar-fill' });
    seenFill.style.width = seenQ.total > 0 ? Math.round((seenQ.answered / seenQ.total) * 100) + '%' : '0%';

    view.appendChild(el('div', { className: 'card progress-card' },
      el('div', { className: 'progress-row' },
        el('span', { className: 'progress-label', text: 'Aktueller Durchlauf (Konzepte)' }),
        el('span', { className: 'progress-value', text: `${runAll.done} / ${runAll.total}` })),
      el('div', { className: 'bar' }, runFill),
      el('p', { className: 'progress-sub', text: runAll.open > 0
        ? `Noch ${runAll.open} Konzepte offen. Varianten derselben Vorlage zählen als ein Konzept — pro Durchlauf siehst du je eine davon.`
        : 'Durchlauf komplett — beim nächsten Üben startet ein neuer mit anderen Varianten.' }),
      el('div', { className: 'progress-row', style: 'margin-top:1rem' },
        el('span', { className: 'progress-label', text: 'Schon mal beantwortet (Fragen)' }),
        el('span', { className: 'progress-value', text: `${seenQ.answered} / ${seenQ.total}` })),
      el('div', { className: 'bar' }, seenFill),
      el('p', { className: 'progress-sub', text: seenQ.total - seenQ.answered > 0
        ? `${seenQ.total - seenQ.answered} Einzelfragen hast du noch nie gesehen. Diese Zahl bleibt auch nach einem Durchlauf-Reset erhalten.`
        : 'Du hast jede Frage aus dem Pool mindestens einmal gesehen.' })));

    // Modus-Karten
    const lastExam = CKT.storage.examHistory()[0];
    const examSeries = CKT.storage.getExamSeries();
    view.appendChild(el('div', { className: 'mode-grid' },
      el('button', { className: 'mode-card', type: 'button', onclick: renderPracticeSetup },
        el('span', { className: 'mode-icon', text: '▤' }),
        el('h3', { text: 'Üben nach Thema' }),
        el('p', { text: 'Jedes Konzept einmal richtig — geschaffte verschwinden, bis der Durchlauf komplett ist.' }),
        el('span', { className: 'mode-meta', text: runAll.open > 0 ? `${runAll.open} von ${runAll.total} Konzepten offen` : 'alle geschafft 🎉' })),
      el('button', { className: 'mode-card', type: 'button', onclick: () => renderExamSetup() },
        el('span', { className: 'mode-icon', text: '⏱' }),
        el('h3', { text: 'Klausursimulation' }),
        el('p', { text: `${data.topics.length}/${data.topics.length} Themen, Q2-Anspruch und keine konkrete Wiederholung innerhalb von sechs Klausuren.` }),
        el('span', { className: 'mode-meta', text: examSeries.generatedCount >= 6
          ? 'Serie 6/6 · bereit für Neustart'
          : `Serie ${examSeries.generatedCount}/6${lastExam ? ` · Letzte: ${lastExam.grade}` : ''}` })),
      el('button', { className: 'mode-card', type: 'button', onclick: renderReview },
        el('span', { className: 'mode-icon', text: '↻' }),
        el('h3', { text: 'Fehler wiederholen' }),
        el('p', { text: 'Falsch beantwortete und gemerkte Fragen gezielt trainieren, bis sie sitzen.' }),
        el('span', { className: 'mode-meta', text: reviewCount > 0 ? `${reviewCount} Fragen fällig` : 'nichts fällig 🎉' }))
    ));

    if (S.usedEmbedded) {
      view.appendChild(el('div', { className: 'notice', text: 'Hinweis: Pool aus lokaler Offline-Kopie (data/questions.js) geladen, weil der Browser fetch() für file:// blockiert. Für PWA/Offline-Modus per „python -m http.server" starten (siehe README).' }));
    }
    if (data.skipped > 0) {
      view.appendChild(el('div', { className: 'notice', text: `${data.skipped} fehlerhafte Frage(n) im Pool wurden übersprungen.` }));
    }
    if (data.disabledCount > 0) {
      view.appendChild(el('div', { className: 'notice', text: `${data.disabledCount} Frage(n) außerhalb des freigegebenen Stoffumfangs sind deaktiviert und werden nicht abgefragt.` }));
    }

    // Themen-Statistik
    view.appendChild(el('div', { className: 'section-title', text: 'Fortschritt nach Thema' }));
    const tStats = CKT.storage.topicStats(
      data.questions.filter((q) => q.examOnly !== true),
    );
    for (const area of data.areas) {
      let seenSum = 0, totalSum = 0;
      for (const t of area.topics) {
        const st = tStats[t.id];
        if (st) { seenSum += st.seen; totalSum += st.total; }
      }
      const details = el('details', { className: 'area-details' },
        el('summary', {},
          el('span', { text: area.name }),
          el('span', { className: 'area-summary-meta', text: `${seenSum}/${totalSum} gesehen` }))
      );
      for (const t of area.topics) {
        const st = tStats[t.id] || { total: 0, seen: 0, answers: 0, correct: 0 };
        const rate = st.answers > 0 ? st.correct / st.answers : null;
        const fill = el('div', { className: 'bar-fill' });
        fill.style.width = rate == null ? '0%' : Math.round(rate * 100) + '%';
        if (rate != null && rate < 0.5) fill.classList.add('low');
        else if (rate != null && rate < 0.75) fill.classList.add('mid');
        details.appendChild(el('div', { className: 'topic-row' },
          el('span', { className: 'topic-name', text: t.name }),
          el('span', { className: 'topic-nums', text: `${st.seen}/${st.total} · ${rate == null ? '–' : Math.round(rate * 100) + ' %'}` }),
          el('div', { className: 'bar' }, fill)));
      }
      view.appendChild(details);
    }

    // Letzte Klausuren
    const history = CKT.storage.examHistory();
    if (history.length > 0) {
      view.appendChild(el('div', { className: 'section-title', text: 'Letzte Klausuren' }));
      const card = el('div', { className: 'card' });
      for (const ex of history) {
        card.appendChild(el('div', { className: 'topic-row' },
          el('span', { className: 'topic-name', text: `Note ${ex.grade} · ${ex.points}/${ex.max} Punkte (${Math.round(ex.percent)} %)` }),
          el('span', { className: 'topic-nums', text: new Date(ex.ts).toLocaleDateString('de-DE') + (ex.negative ? ' · Negativ-Marking' : '') })));
      }
      view.appendChild(card);
    }

    // Fußbereich
    view.appendChild(el('div', { className: 'btn-row' },
      el('button', {
        className: 'btn btn-danger btn-small', type: 'button', text: 'Fortschritt zurücksetzen',
        onclick: () => {
          if (window.confirm('Wirklich den kompletten Fortschritt (Statistik, Markierungen, Fehler-Historie) löschen?')) {
            CKT.storage.resetAll();
            renderHome();
          }
        },
      })
    ));

    setView(view, '');

    // Neuerungen einmalig zeigen. Bewusst hier und nicht nur direkt nach dem
    // Login: Wer eingeloggt bleibt (Cookie, 180 Tage), sieht den Login-Screen
    // sonst nie wieder und würde den Hinweis nie bekommen.
    maybeShowNews();
  }

  // ===========================================================================
  // Üben nach Thema — Setup & Session
  // ===========================================================================

  function renderPracticeSetup() {
    S.keyHandler = null;
    const data = S.data;
    const f = S.practiceFilters || {
      topicIds: new Set(data.topics.map((t) => t.id)),
      // Q2-Standard: Verständnisfragen statt leichter Wiedererkennung.
      // "leicht" bleibt für gezieltes Grundlagentraining zuschaltbar.
      difficulties: new Set(['mittel', 'schwer']),
    };
    S.practiceFilters = f;

    const view = el('div', { className: 'view' });
    view.appendChild(el('div', { className: 'view-header' },
      el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: '← Zurück', onclick: renderHome }),
      el('h1', { text: 'Üben nach Thema' })));

    // Schwierigkeit
    view.appendChild(el('div', { className: 'section-title', text: 'Schwierigkeit' }));
    const chipRow = el('div', { className: 'chip-row' });
    for (const d of CKT.engine.DIFFICULTIES) {
      const chip = el('button', {
        className: 'chip' + (f.difficulties.has(d) ? ' selected' : ''), type: 'button', text: d,
        onclick: () => {
          if (f.difficulties.has(d)) f.difficulties.delete(d); else f.difficulties.add(d);
          chip.classList.toggle('selected', f.difficulties.has(d));
          updateCount();
        },
      });
      chipRow.appendChild(chip);
    }
    view.appendChild(chipRow);
    const qualityNote = el('div', { className: 'notice' });
    view.appendChild(qualityNote);

    // Themen nach Bereich
    view.appendChild(el('div', { className: 'section-title', text: 'Themen' }));
    view.appendChild(el('div', { className: 'btn-row', style: 'margin:0 0 0.6rem' },
      el('button', {
        className: 'btn btn-ghost btn-small', type: 'button', text: 'Alle auswählen',
        onclick: () => { data.topics.forEach((t) => f.topicIds.add(t.id)); syncChecks(); updateCount(); },
      }),
      el('button', {
        className: 'btn btn-ghost btn-small', type: 'button', text: 'Keine',
        onclick: () => { f.topicIds.clear(); syncChecks(); updateCount(); },
      })));

    const checkboxes = [];
    const topicCounts = {};
    for (const q of data.questions) {
      if (q.examOnly === true) continue;
      topicCounts[q.topicId] = (topicCounts[q.topicId] || 0) + 1;
    }

    for (const area of data.areas) {
      const details = el('details', { className: 'area-details', open: '' });
      const areaChecked = () => area.topics.every((t) => f.topicIds.has(t.id));
      const areaBox = el('input', {
        type: 'checkbox',
        onclick: (e) => {
          e.stopPropagation();
          const on = areaBox.checked;
          area.topics.forEach((t) => { if (on) f.topicIds.add(t.id); else f.topicIds.delete(t.id); });
          syncChecks(); updateCount();
        },
      });
      const summary = el('summary', {},
        el('span', { style: 'display:flex;align-items:center;gap:0.55rem' }, areaBox, area.name),
        el('span', { className: 'area-summary-meta', text: `${area.topics.length} Themen` }));
      details.appendChild(summary);

      for (const t of area.topics) {
        const box = el('input', {
          type: 'checkbox',
          onchange: () => {
            if (box.checked) f.topicIds.add(t.id); else f.topicIds.delete(t.id);
            syncChecks(); updateCount();
          },
        });
        checkboxes.push({ box, topic: t, areaBox, area });
        details.appendChild(el('label', { className: 'checkbox-row' },
          box,
          el('span', { text: t.name }),
          el('span', { className: 'count', text: String(topicCounts[t.id] || 0) })));
      }
      details.dataset.area = area.name;
      view.appendChild(details);

      // Bereichs-Checkbox initial setzen
      areaBox.checked = areaChecked();
    }

    function syncChecks() {
      for (const c of checkboxes) {
        c.box.checked = f.topicIds.has(c.topic.id);
        c.areaBox.checked = c.area.topics.every((t) => f.topicIds.has(t.id));
      }
    }
    syncChecks();

    // Start-Leiste
    const countEl = el('span', { className: 'pool-count' });
    const startBtn = el('button', {
      className: 'btn btn-primary', type: 'button', text: 'Los geht’s →',
      onclick: () => startPractice(),
    });
    view.appendChild(el('div', { className: 'setup-sticky' }, countEl, startBtn));

    function updateCount() {
      const session = CKT.engine.createPracticeSession(data, f);
      const st = session.stats();
      countEl.textContent = st.total === 0
        ? 'Keine Fragen ausgewählt'
        : `${st.open} von ${st.total} Konzepten offen`;
      qualityNote.textContent = st.total === 0
        ? 'Wählen Sie mindestens ein Thema und eine Schwierigkeit.'
        : st.singleVariant === 0
          ? 'Q2 aktiv: Jede ausgewählte Konzeptfamilie besitzt mindestens zwei Varianten; der nächste vollständige Durchlauf wechselt die konkrete Aufgabe.'
          : `${st.singleVariant} ausgewählte Konzeptfamilie(n) besitzen nur eine Variante. Diese Basisfragen können in einem späteren Durchlauf wortgleich wiederkehren.`;
      startBtn.disabled = st.total === 0;
    }
    updateCount();

    setView(view, 'Üben');
  }

  function startPractice() {
    S.practice = {
      session: CKT.engine.createPracticeSession(S.data, S.practiceFilters),
      answered: 0,
      correct: 0,
    };
    renderPracticeQuestion();
  }

  function renderPracticeQuestion() {
    const p = S.practice;
    const unit = p.session.next();
    if (!unit) { renderPracticeDone(); return; }

    const view = el('div', { className: 'view' });

    // Durchlauf-Fortschritt: „x von y geschafft" + Balken
    const label = el('span');
    const fill = el('div', { className: 'bar-fill' });
    const head = el('div', { className: 'session-head' },
      label,
      el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Beenden', onclick: renderHome }));
    const bar = el('div', { className: 'bar run-bar' }, fill);

    const refreshProgress = () => {
      const st = p.session.stats();
      label.textContent = `${st.done} von ${st.total} Konzepten geschafft · noch ${st.open} offen`;
      fill.style.width = st.total > 0 ? Math.round((st.done / st.total) * 100) + '%' : '0%';
    };
    refreshProgress();

    view.appendChild(head);
    view.appendChild(bar);

    const onDoneSingle = (correct) => {
      CKT.storage.recordAnswer(unit.q.id, correct);
      p.answered += 1; if (correct) p.correct += 1;
      refreshProgress();
    };
    const onDoneGroupStatement = (q, correct) => {
      CKT.storage.recordAnswer(q.id, correct);
      p.answered += 1; if (correct) p.correct += 1;
      refreshProgress();
    };

    if (unit.kind === 'group') {
      view.appendChild(renderImmediateGroup(unit.group, {
        onDone: onDoneGroupStatement,
        onNext: renderPracticeQuestion,
      }));
    } else {
      view.appendChild(renderImmediateQuestion(unit.q, {
        onDone: onDoneSingle,
        onNext: renderPracticeQuestion,
      }));
    }

    setView(view, 'Üben');
  }

  /**
   * Durchlauf komplett: alle Fragen der Auswahl mindestens einmal richtig.
   * Hier wird der Stand zurückgesetzt, damit der nächste Durchlauf wieder
   * bei null startet (Fahrschul-Prinzip).
   */
  function renderPracticeDone() {
    S.keyHandler = null;
    const p = S.practice;
    const total = p.session.stats().total;

    // Stand zurücksetzen — Statistik, Markierungen und Fehler-Pool bleiben.
    CKT.storage.resetRun(p.session.eligibleIds());

    const view = el('div', { className: 'view' });
    view.appendChild(el('div', { className: 'card result-hero' },
      el('div', { className: 'big', style: 'font-size:3rem', text: '🎉' }),
      el('h1', { className: 'login-title', text: 'Durchlauf geschafft!' }),
      el('p', { className: 'result-points', text: total === 1
        ? 'Das Konzept hast du richtig beantwortet.'
        : `Alle ${total} Konzepte mindestens einmal richtig beantwortet.` }),
      el('p', { className: 'result-sub', text: 'Der Stand wurde zurückgesetzt — der nächste Durchlauf wechselt pro Konzept zuerst die Aufgabenperspektive und danach Zahlen oder Namen. Deine Statistik bleibt erhalten.' }),
      el('div', { className: 'btn-row', style: 'justify-content:center' },
        el('button', { className: 'btn btn-primary', type: 'button', text: 'Neuer Durchlauf', onclick: startPractice }),
        el('button', { className: 'btn', type: 'button', text: 'Themen ändern', onclick: renderPracticeSetup }),
        el('button', { className: 'btn btn-ghost', type: 'button', text: 'Startseite', onclick: renderHome }))));

    setView(view, 'Üben');
  }

  // ===========================================================================
  // Fehler wiederholen
  // ===========================================================================

  function renderReview(lastId) {
    S.keyHandler = null;
    const q = CKT.engine.drawReviewQuestion(S.data, typeof lastId === 'string' ? lastId : null);
    const view = el('div', { className: 'view' });
    view.appendChild(el('div', { className: 'view-header' },
      el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: '← Zurück', onclick: renderHome }),
      el('h1', { text: 'Fehler wiederholen' })));

    if (!q) {
      view.appendChild(el('div', { className: 'empty-state' },
        el('div', { className: 'big', text: '🎉' }),
        el('p', { text: 'Nichts fällig! Es gibt aktuell keine falsch beantworteten oder gemerkten Fragen.' }),
        el('button', { className: 'btn btn-primary', type: 'button', text: 'Zum Üben →', onclick: renderPracticeSetup })));
      setView(view, 'Wiederholen');
      return;
    }

    const pool = CKT.engine.buildReviewPool(S.data);
    const r = CKT.storage.getRecord(q.id);
    view.appendChild(el('div', { className: 'session-head' },
      el('span', { text: `Noch ${pool.length} im Fehler-Pool · richtig beantwortet = raus${r && r.m ? ' · ★ gemerkt' : ''}` })));

    view.appendChild(renderImmediateQuestion(q, {
      onDone: (correct) => {
        CKT.storage.recordAnswer(q.id, correct);
        // Im Wiederholen-Modus zählt: richtig = ganz raus. Eine falsche Antwort
        // hat rv gesetzt (→ recordAnswer räumt sie bei richtig wieder ab); eine
        // ★-Markierung muss hier zusätzlich entfernt werden, sonst bliebe die
        // Frage trotz richtiger Antwort im Fehler-Pool hängen.
        if (correct) CKT.storage.clearMark(q.id);
      },
      onNext: () => renderReview(q.id),
    }));

    setView(view, 'Wiederholen');
  }

  // ===========================================================================
  // Klausursimulation
  // ===========================================================================

  function renderExamSetup(buildError) {
    S.keyHandler = null;
    const series = CKT.storage.getExamSeries();
    const seriesComplete = series.generatedCount >= 6;
    const view = el('div', { className: 'view' });
    view.appendChild(el('div', { className: 'view-header' },
      el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: '← Zurück', onclick: renderHome }),
      el('h1', { text: 'Klausursimulation' })));

    if (buildError) {
      view.appendChild(el('div', { className: 'card notice notice-warn' },
        el('strong', { text: 'Klausur konnte nicht regelkonform erzeugt werden.' }),
        el('p', { text: buildError })));
    }

    const card = el('div', { className: 'card' });
    card.appendChild(el('h2', {
      text: seriesComplete
        ? 'Sechser-Serie abgeschlossen'
        : `Klausur ${series.generatedCount + 1} von 6`,
    }));
    card.appendChild(el('p', {
      text: `Jede Klausur deckt alle ${S.data.topics.length} aktiven Themen ab. Innerhalb der Serie werden weder eine konkrete Einzelfrage noch ein Code-Snippet wiederholt. Der Builder erzeugt keine vereinfachte Ersatzklausur.`,
    }));
    card.appendChild(el('p', { text: 'Aufbau wie beim Dozenten: Teil 1 mit 5 Richtig/Falsch-, 13 Mehrfachauswahl-, 13 Predict-Output-, 6 Umrechnungs- und 3 Einfachauswahl-Aufgaben. Teil 2 enthält 4 Code-Snippets mit je 10 Aussagen und eine Fehler-finden-Aufgabe. Jede Aussage zählt 1 Punkt.' }));

    if (seriesComplete) {
      card.appendChild(el('div', { className: 'btn-row' },
        el('button', {
          className: 'btn btn-primary btn-block',
          type: 'button',
          text: 'Neue Sechser-Serie starten',
          onclick: () => {
            CKT.storage.resetExamSeries();
            renderExamSetup();
          },
        })));
      view.appendChild(card);
      setView(view, 'Klausurserie 6/6');
      return;
    }

    const timedBox = el('input', { type: 'checkbox' }); timedBox.checked = true;
    const minutesInput = el('input', { type: 'number', min: '10', max: '240', step: '5', value: '90' });
    const negBox = el('input', { type: 'checkbox' }); negBox.checked = true;

    card.appendChild(el('label', { className: 'opt-line' },
      timedBox,
      el('span', { className: 'opt-text' }, 'Zeitlimit', el('small', { text: 'Countdown läuft, am Ende wird automatisch abgegeben.' })),
      minutesInput,
      el('span', { text: 'min' })));
    card.appendChild(el('label', { className: 'opt-line' },
      negBox,
      el('span', { className: 'opt-text' }, 'Negativ-Marking', el('small', { text: '„Leere Zeilen führen zum Punktabzug!" — unbeantwortet = −0,5 Punkte (wie beim Dozenten).' }))));

    card.appendChild(el('div', { className: 'btn-row' },
      el('button', {
        className: 'btn btn-primary btn-block', type: 'button',
        text: `Klausur ${series.generatedCount + 1} starten`,
        onclick: () => {
          const minutes = Math.min(240, Math.max(10, parseInt(minutesInput.value, 10) || 90));
          startExam({ timed: timedBox.checked, minutes, negative: negBox.checked });
        },
      })));

    view.appendChild(card);
    setView(view, `Klausurserie ${series.generatedCount}/6`);
  }

  function startExam(options) {
    let exam;
    try {
      exam = CKT.engine.buildExam(S.data, {
        ...options,
        seriesSelection: CKT.storage.getExamSeries(),
      });
    } catch (error) {
      renderExamSetup(error && error.message
        ? error.message
        : 'Die Qualitätsbedingungen konnten nicht erfüllt werden.');
      return;
    }
    const selection = CKT.engine.examSelectionSummary(S.data, exam);
    CKT.storage.rememberExamSeriesSelection(selection);
    CKT.storage.rememberExamSelection(selection);
    S.exam = {
      exam,
      answers: {},
      perms: {}, // stabile Options-Mischung pro Frage (bleibt beim Blättern gleich)
      idx: 0,
      deadline: options.timed ? Date.now() + options.minutes * 60000 : null,
      timerId: null,
      finished: false,
    };
    window.addEventListener('beforeunload', examUnloadGuard);
    if (options.timed) {
      S.exam.timerId = window.setInterval(() => {
        const left = S.exam.deadline - Date.now();
        const timerEl = document.getElementById('examTimer');
        if (timerEl) {
          timerEl.textContent = '⏱ ' + fmtClock(left);
          timerEl.classList.toggle('warn', left < 5 * 60000);
        }
        if (left <= 0) submitExam(true);
      }, 500);
    }
    renderExamUnit();
  }

  function examUnloadGuard(e) {
    e.preventDefault();
    e.returnValue = '';
  }

  function stopExamTimer() {
    if (S.exam && S.exam.timerId) { window.clearInterval(S.exam.timerId); S.exam.timerId = null; }
    window.removeEventListener('beforeunload', examUnloadGuard);
  }

  function examAnsweredCount() {
    const ex = S.exam;
    let n = 0;
    for (const unit of ex.exam.units) {
      for (const q of CKT.engine.unitQuestions(unit)) {
        if (CKT.engine.isAnswered(q, ex.answers[q.id])) n += 1;
      }
    }
    return n;
  }

  function unitAnswered(unit) {
    return CKT.engine.unitQuestions(unit).every((q) => CKT.engine.isAnswered(q, S.exam.answers[q.id]));
  }

  /** Ein Klausur-Item (Einzelfrage oder Snippet-Gruppe) ohne Feedback rendern. */
  function renderExamUnit() {
    const ex = S.exam;
    const unit = ex.exam.units[ex.idx];
    const total = ex.exam.units.length;
    const part2Start = ex.exam.units.findIndex((u) => u.kind === 'group');
    const inPart2 = part2Start >= 0 && ex.idx >= part2Start;

    const view = el('div', { className: 'view' });

    // Sticky-Leiste: Timer, Fortschritt, Abgabe
    const bar = el('div', { className: 'exam-bar' });
    if (ex.deadline) bar.appendChild(el('span', { className: 'timer', id: 'examTimer', text: '⏱ ' + fmtClock(ex.deadline - Date.now()) }));
    const progressEl = el('span', { className: 'exam-progress', text: `Aufgabe ${ex.idx + 1}/${total} · ${examAnsweredCount()}/${ex.exam.maxPoints} beantwortet` });
    bar.appendChild(progressEl);
    bar.appendChild(el('button', {
      className: 'btn btn-small', type: 'button', text: 'Abgeben',
      onclick: () => {
        const missing = ex.exam.maxPoints - examAnsweredCount();
        const warning = missing > 0
          ? `Noch ${missing} Frage(n)/Aussage(n) unbeantwortet` + (ex.exam.options.negative ? ' (Punktabzug!)' : '') + '. Trotzdem abgeben?'
          : 'Klausur abgeben und auswerten?';
        if (window.confirm(warning)) submitExam(false);
      },
    }));
    view.appendChild(bar);

    view.appendChild(el('div', { className: 'part-banner', text: inPart2 ? 'Teil 2 · Code-Verständnis' : 'Teil 1 · Ankreuz- & Umrechnungsaufgaben' }));

    // Navigations-Chips
    const chips = el('div', { className: 'exam-chips' });
    const chipRefs = [];
    ex.exam.units.forEach((u, i) => {
      const chip = el('button', {
        type: 'button',
        className: 'echip' + (unitAnswered(u) ? ' answered' : '') + (i === ex.idx ? ' current' : ''),
        text: u.kind === 'group' ? 'S' + (i + 1) : String(i + 1),
        title: u.kind === 'group' ? 'Code-Snippet' : TYPE_LABELS[u.q.type],
        onclick: () => { ex.idx = i; renderExamUnit(); },
      });
      chipRefs.push({ chip, u });
      chips.appendChild(chip);
    });
    view.appendChild(chips);

    // Fortschritt & Chips beim Beantworten sofort nachziehen
    const refreshProgress = () => {
      progressEl.textContent = `Aufgabe ${ex.idx + 1}/${total} · ${examAnsweredCount()}/${ex.exam.maxPoints} beantwortet`;
      for (const ref of chipRefs) ref.chip.classList.toggle('answered', unitAnswered(ref.u));
    };

    // Frage / Gruppe
    if (unit.kind === 'group') {
      view.appendChild(renderExamGroup(unit.group, refreshProgress));
    } else {
      view.appendChild(renderExamSingle(unit.q, refreshProgress));
    }

    // Navigation
    view.appendChild(el('div', { className: 'exam-nav' },
      el('button', {
        className: 'btn', type: 'button', text: '← Zurück', disabled: ex.idx === 0 ? '' : null,
        onclick: () => { if (ex.idx > 0) { ex.idx -= 1; renderExamUnit(); } },
      }),
      el('span', { className: 'spacer' }),
      el('button', {
        className: 'btn btn-primary', type: 'button', text: ex.idx === total - 1 ? 'Zur Abgabe ↑' : 'Weiter →',
        onclick: () => {
          if (ex.idx < total - 1) { ex.idx += 1; renderExamUnit(); }
          else window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      })));

    S.keyHandler = (e) => {
      const inInput = /^(INPUT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName);
      if (e.key === 'Enter' && !inInput) {
        e.preventDefault();
        if (ex.idx < total - 1) { ex.idx += 1; renderExamUnit(); }
      }
    };

    setView(view, ex.deadline ? 'Klausur läuft' : 'Klausur');
    // setView scrollt nach oben — beim Blättern gewollt.
  }

  function renderExamSingle(q, onAnswerChange) {
    const ex = S.exam;
    const card = el('div', { className: 'card qcard' });
    card.appendChild(metaRow(q));
    card.appendChild(el('p', { className: 'qprompt', text: q.prompt }));
    if (q.code && !CKT.engine.isStructuredFindBug(q)) card.appendChild(renderCode(q.code));

    let widget;
    if (CKT.engine.isStructuredFindBug(q)) {
      widget = createBugEditor(q, {
        initial: ex.answers[q.id],
        onChange: (answer) => {
          if (answer) ex.answers[q.id] = answer;
          else delete ex.answers[q.id];
          onAnswerChange();
        },
      });
    } else if (q.type === 'short-answer') {
      widget = createShortAnswer(q, {
        initial: typeof ex.answers[q.id] === 'string' ? ex.answers[q.id] : '',
        onChange: (v) => { ex.answers[q.id] = v; onAnswerChange(); },
        onSubmit: () => {},
      });
    } else {
      widget = createOptionList(q, {
        initial: ex.answers[q.id],
        onChange: (a) => { ex.answers[q.id] = a; onAnswerChange(); },
        order: ex.perms[q.id] || (ex.perms[q.id] = makeOptionOrder(q)),
      });
    }
    card.appendChild(widget.root);
    if (q.type === 'mc-multi' || (q.type === 'find-bug' && !CKT.engine.isStructuredFindBug(q))) {
      card.appendChild(el('p', { className: 'kbd-hint', text: 'Mehrfachauswahl: alle zutreffenden Aussagen ankreuzen.' }));
    } else if (CKT.engine.isStructuredFindBug(q)) {
      card.appendChild(el('p', { className: 'kbd-hint', text: 'Die Aufgabe gilt als vollständig richtig, wenn alle Fehlerstellen markiert und passend korrigiert wurden.' }));
    }
    return card;
  }

  function renderExamGroup(group, onAnswerChange) {
    const ex = S.exam;
    const card = el('div', { className: 'card qcard' });
    card.appendChild(el('p', { className: 'qprompt', text: group.groupPrompt || 'Sie haben folgenden Code. Bewerten Sie die Aussagen.' }));
    if (group.code) card.appendChild(renderCode(group.code));

    group.questions.forEach((q, idx) => {
      const segButtons = q.options.map((label, i) => el('button', {
        type: 'button',
        className: 'seg-btn' + (ex.answers[q.id] === i ? ' selected' : ''),
        text: label,
        onclick: () => {
          ex.answers[q.id] = i;
          segButtons.forEach((b, j) => b.classList.toggle('selected', j === i));
          onAnswerChange();
        },
      }));
      card.appendChild(el('div', { className: 'statement-row' },
        el('span', { className: 'statement-num', text: String(idx + 1) + '.' }),
        el('span', { className: 'statement-text', text: q.prompt }),
        el('span', { className: 'seg' }, ...segButtons)));
    });
    return card;
  }

  function submitExam(timeUp) {
    const ex = S.exam;
    if (!ex || ex.finished) return;
    ex.finished = true;
    stopExamTimer();

    const result = CKT.engine.gradeExam(S.data, ex.exam, ex.answers);
    // Ergebnisse in die Lern-Statistik übernehmen (ohne Serien-Zählung)
    for (const pq of result.perQuestion) {
      CKT.storage.recordAnswer(pq.q.id, pq.correct, { streak: false });
    }
    CKT.storage.addExamResult({
      ts: Date.now(),
      points: result.points,
      max: result.maxPoints,
      percent: result.percent,
      grade: result.grade,
      negative: ex.exam.options.negative,
      timed: ex.exam.options.timed,
    });

    S.examResult = { result, timeUp: !!timeUp, options: ex.exam.options, startedAt: ex.exam.startedAt };
    S.exam = null;
    renderExamResult();
  }

  function renderExamResult() {
    S.keyHandler = null;
    const { result, timeUp, options, startedAt } = S.examResult;
    const view = el('div', { className: 'view' });

    view.appendChild(el('div', { className: 'view-header' },
      el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: '← Startseite', onclick: renderHome }),
      el('h1', { text: 'Auswertung' })));

    // Ergebnis-Karte
    const hero = el('div', { className: 'card result-hero' });
    if (timeUp) hero.appendChild(el('p', { className: 'result-sub', text: '⏱ Zeit abgelaufen — automatisch abgegeben.' }));
    hero.appendChild(el('div', { className: 'grade-badge' + (result.passed ? '' : ' failed') },
      el('span', { className: 'grade-num', text: result.grade }),
      el('span', { className: 'grade-label', text: result.passed ? 'geschätzte Note' : 'nicht bestanden' })));
    hero.appendChild(el('p', { className: 'result-points', text: `${result.points.toLocaleString('de-DE')} von ${result.maxPoints} Punkten · ${fmtPercent(result.percent)}` }));
    const usedMin = Math.round((Date.now() - startedAt) / 60000);
    hero.appendChild(el('p', {
      className: 'result-sub',
      text: `${result.unansweredCount} unbeantwortet` +
        (result.negativePenalty ? ` (je −${String(result.negativePenalty).replace('.', ',')} P.)` : '') +
        (options.timed ? ` · Bearbeitungszeit ca. ${usedMin} min` : ''),
    }));
    hero.appendChild(el('div', { className: 'btn-row', style: 'justify-content:center' },
      el('button', { className: 'btn btn-primary', type: 'button', text: 'Neue Klausur', onclick: () => renderExamSetup() }),
      el('button', { className: 'btn', type: 'button', text: 'Fehler wiederholen ↻', onclick: renderReview })));
    view.appendChild(hero);

    // Themen-Schwächen
    const weak = result.weakTopics.filter((w) => w.total >= 2 && w.rate < 1);
    if (weak.length > 0) {
      view.appendChild(el('div', { className: 'section-title', text: 'Themen-Schwächen' }));
      const card = el('div', { className: 'card' });
      for (const w of weak.slice(0, 8)) {
        const fill = el('div', { className: 'bar-fill' + (w.rate < 0.5 ? ' low' : w.rate < 0.75 ? ' mid' : '') });
        fill.style.width = Math.round(w.rate * 100) + '%';
        card.appendChild(el('div', { className: 'topic-row' },
          el('span', { className: 'topic-name', text: w.topic ? w.topic.name : w.topicId }),
          el('span', { className: 'topic-nums', text: `${w.correct}/${w.total} richtig` }),
          el('div', { className: 'bar' }, fill)));
      }
      view.appendChild(card);
    }

    // Detail-Durchsicht
    view.appendChild(el('div', { className: 'section-title', text: 'Alle Aufgaben im Detail' }));
    const reviewCard = el('div', { className: 'card' });
    let lastUnit = null;
    let statementNo = 0;
    for (const pq of result.perQuestion) {
      const item = el('div', { className: 'review-item' });
      if (pq.unit !== lastUnit) {
        lastUnit = pq.unit;
        statementNo = 0;
        if (pq.unit.kind === 'group') {
          item.appendChild(el('p', { className: 'part-banner', text: 'Code-Snippet' }));
          if (pq.unit.group.code) {
            const det = el('details', {},
              el('summary', { text: 'Code anzeigen' }),
              renderCode(pq.unit.group.code));
            item.appendChild(det);
          }
        }
      }
      statementNo += 1;

      const status = pq.correct
        ? el('span', { className: 'review-status ok', text: '✔ +1 P.' })
        : pq.answered
          ? el('span', { className: 'review-status bad', text: '✘ 0 P.' })
          : el('span', { className: 'review-status blank', text: `— unbeantwortet ${pq.points < 0 ? '(' + pq.points.toLocaleString('de-DE') + ' P.)' : '(0 P.)'}` });

      item.appendChild(el('p', { className: 'qprompt', style: 'margin-bottom:0.3rem;font-size:0.95rem' },
        (pq.unit.kind === 'group' ? statementNo + '. ' : '') + pq.q.prompt));
      if (pq.unit.kind !== 'group' && pq.q.code) item.appendChild(renderCode(pq.q.code));
      item.appendChild(status);
      if (!pq.correct) {
        item.appendChild(el('p', { className: 'review-answer' },
          el('span', { className: 'lbl', text: 'Deine Antwort: ' }), userAnswerText(pq.q, pq.answer)));
        item.appendChild(el('p', { className: 'review-answer' },
          el('span', { className: 'lbl', text: 'Richtig: ' }), correctAnswerText(pq.q)));
        const exp = explanationBox(pq.q);
        if (exp) item.appendChild(exp);
      }
      reviewCard.appendChild(item);
    }
    view.appendChild(reviewCard);

    setView(view, 'Auswertung');
  }

  // ===========================================================================
  // Datenladen & Start
  // ===========================================================================

  function renderLoadError(detail) {
    S.keyHandler = null;
    const view = el('div', { className: 'view load-error' });
    view.appendChild(el('div', { className: 'card' },
      el('h2', { text: 'Fragenpool konnte nicht geladen werden' }),
      el('p', { text: 'Die Datei data/questions.json war nicht erreichbar oder enthält kein gültiges JSON.' }),
      el('p', { text: 'Am zuverlässigsten startet die App über einen kleinen lokalen Webserver:' }),
      el('code', { text: 'cd c-klausurtrainer\npython -m http.server 8000' }),
      el('p', { text: 'Danach im Browser http://localhost:8000 öffnen. Details siehe README.md.' }),
      detail ? el('p', { className: 'result-sub', text: 'Technische Ursache: ' + detail }) : null,
      el('div', { className: 'btn-row' },
        el('button', { className: 'btn btn-primary', type: 'button', text: 'Erneut versuchen', onclick: () => window.location.reload() }))));
    setView(view, '');
  }

  /** Fragenpool laden. true = App kann rendern, false = Fehlerseite steht. */
  async function loadData() {
    if (S.data) return true;
    let raw = null;
    let detail = '';
    try {
      const res = await fetch('data/questions.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      raw = await res.json();
    } catch (err) {
      detail = err && err.message ? err.message : String(err);
      // file://-Fallback: eingebettete Kopie aus data/questions.js
      if (window.CKT_EMBEDDED_DATA) {
        raw = window.CKT_EMBEDDED_DATA;
        S.usedEmbedded = true;
      }
    }
    if (!raw) { renderLoadError(detail); return false; }

    const data = CKT.engine.prepare(raw);
    if (data.questions.length === 0) { renderLoadError('JSON geladen, aber keine gültige Frage gefunden.'); return false; }
    S.data = data;

    footerEl.textContent =
      `${data.questions.length} Fragen · Pool v${data.meta.version || '?'} · ` +
      `${(data.meta.course || 'Informatik 1')} · Fortschritt bleibt privat` +
      (data.skipped > 0 ? ` · ${data.skipped} übersprungen` : '');

    return true;
  }

  // ===========================================================================
  // Anmeldung (Online-Betrieb über server.js) — mit Fallback auf Gastmodus
  // ===========================================================================

  // mode: 'online'  = am Server angemeldet, Stats werden synchronisiert
  //       'offline' = Server gerade nicht erreichbar, lokaler Cache des Nutzers
  //       'login'   = Server da, aber nicht angemeldet → Login-Screen
  //       'local'   = kein Backend (python -m http.server / Doppelklick)
  const AUTH = { mode: 'local', name: null };

  async function checkAuth() {
    try {
      const res = await fetch('api/me', { cache: 'no-store' });
      if (res.ok) { const j = await res.json(); return { mode: 'online', name: j.name }; }
      if (res.status === 401) return { mode: 'login', name: null };
      return { mode: 'local', name: null }; // 404 o. Ä. → statischer Server ohne Backend
    } catch (err) {
      // Netzwerkfehler: als zuletzt bekannter Nutzer offline weiterlernen
      const cached = CKT.storage.lastKnownUser();
      return cached ? { mode: 'offline', name: cached } : { mode: 'local', name: null };
    }
  }

  /** Server-Stand mit lokalem Cache abgleichen — der neuere gewinnt. */
  async function syncFromServer() {
    try {
      const res = await fetch('api/state', { cache: 'no-store' });
      if (!res.ok) return;
      const j = await res.json();
      const localAt = CKT.storage.getSavedAt();
      if (j.state && (j.savedAt || 0) > localAt) {
        CKT.storage.adoptState(j.state);
      } else if (CKT.storage.hasProgress() && localAt > (j.savedAt || 0)) {
        CKT.storage.pushNow();
      }
    } catch (err) { /* offline — lokaler Stand gilt, Sync kommt später */ }
  }

  function updateUserChip() {
    const chip = document.getElementById('userChip');
    const logoutBtn = document.getElementById('logoutBtn');
    if (AUTH.name) {
      chip.textContent = AUTH.name + (AUTH.mode === 'offline' ? ' (offline)' : '');
      chip.hidden = false;
      logoutBtn.hidden = false;
    } else {
      chip.hidden = true;
      logoutBtn.hidden = true;
    }
  }

  function renderLogin(prefillError) {
    S.keyHandler = null;
    const view = el('div', { className: 'view login-view' });

    const errEl = el('p', { className: 'login-error', text: prefillError || '' });
    if (!prefillError) errEl.hidden = true;

    const input = el('input', {
      className: 'answer-input',
      type: 'text',
      autocomplete: 'username',
      autocapitalize: 'off',
      spellcheck: 'false',
      placeholder: 'dein name',
      'aria-label': 'Login-Name',
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } },
    });
    const btn = el('button', { className: 'btn btn-primary btn-block', type: 'button', text: 'Anmelden', onclick: () => submit() });

    async function submit() {
      const name = input.value.trim().toLowerCase();
      if (!name) return;
      btn.disabled = true;
      errEl.hidden = true;
      try {
        const res = await fetch('api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (res.ok) {
          const j = await res.json();
          AUTH.mode = 'online';
          AUTH.name = j.name;
          CKT.storage.setUser(j.name, { sync: true });
          await syncFromServer();
          updateUserChip();
          renderHome();
          return;
        }
        errEl.textContent = res.status === 403
          ? 'Unbekannter Name. Genau so eingeben, wie du ihn bekommen hast (z. B. „ben").'
          : 'Anmeldung fehlgeschlagen (' + res.status + '). Bitte erneut versuchen.';
      } catch (err) {
        errEl.textContent = 'Server nicht erreichbar. Internetverbindung prüfen und erneut versuchen.';
      }
      errEl.hidden = false;
      btn.disabled = false;
      input.focus();
    }

    view.appendChild(el('div', { className: 'card login-card' },
      el('div', { className: 'login-logo' },
        el('span', { className: 'brand-brace', text: '{' }), ' C ',
        el('span', { className: 'brand-brace', text: '}' })),
      el('h1', { className: 'login-title', text: 'C-Klausurtrainer' }),
      el('p', { className: 'login-sub', text: 'Melde dich mit deinem Namen an — dein Lernfortschritt wird gespeichert und ist auf jedem Gerät verfügbar.' }),
      el('label', { className: 'login-label', text: 'login:' }),
      input,
      errEl,
      el('div', { className: 'btn-row' }, btn)));

    view.appendChild(buildSupportCard());

    setView(view, '');
    setTimeout(() => input.focus(), 50);
  }

  // ===========================================================================
  // "Was ist neu?" — einmalig pro Nutzer
  // ===========================================================================

  /*
   * NEWS_VERSION hochzählen und NEWS_ITEMS austauschen, wenn es wieder etwas
   * zu verkünden gibt — dann sieht jeder Nutzer den Hinweis erneut genau einmal.
   * Der Bestätigungs-Stand liegt im synchronisierten Fortschritt (storage),
   * damit der Dialog nicht auf jedem Gerät neu aufpoppt.
   */
  const NEWS_VERSION = 9;

  const NEWS_ITEMS = [
    {
      icon: '✓',
      title: 'Stoffumfang korrigiert',
      text: 'Zeiger und mehrdimensionale Arrays wurden vollständig aus Übung und Klausur entfernt. Die Ersatzaufgaben verwenden ausschließlich behandelte C-Grundlagen.',
    },
    {
      icon: '🔄',
      title: 'Perspektive statt Zahlenkosmetik',
      text: '56 neue Q2-Varianten wechseln zwischen Regel, Anwendung, Diagnose und Transfer. Der nächste vollständige Durchlauf zeigt pro Konzept eine andere konkrete Aufgabe.',
    },
    {
      icon: '🧩',
      title: 'Harte Sechser-Klausurserie',
      text: 'Jede Klausur deckt alle aktiven Themen ab. Über sechs Simulationen wiederholt sich weder eine konkrete Frage noch ein Code-Snippet; danach ist ein bewusster Serien-Neustart nötig.',
    },
    {
      icon: '⌨',
      title: 'Fehlersuche mit vollständigen Codezeilen',
      text: 'Nach dem Markieren einer Fehlerstelle muss jetzt immer die vollständig korrigierte Codezeile eingegeben werden. Einzelne Zeichen oder Stichwörter reichen nicht mehr.',
    },
    {
      icon: '▣',
      title: '24 exklusive Klausur-Code-Snippets',
      text: 'Der getrennte Klausurpool umfasst jetzt 24 Programme mit jeweils zehn zusammenhängenden Aussagen — exakt vier unverbrauchte Programme für jede der sechs Simulationen.',
    },
  ];

  function dismissNews(overlay) {
    CKT.storage.setNewsSeen(NEWS_VERSION);
    overlay.classList.add('closing');
    window.setTimeout(() => overlay.remove(), 200);
    document.removeEventListener('keydown', overlay._esc, true);
  }

  /** Zeigt den Hinweis, falls dieser Nutzer die aktuelle Version noch nicht bestätigt hat. */
  function maybeShowNews() {
    if (CKT.storage.getNewsSeen() >= NEWS_VERSION) return;
    if (document.getElementById('newsModal')) return; // läuft bereits

    const list = el('ul', { className: 'news-list' });
    for (const item of NEWS_ITEMS) {
      list.appendChild(el('li', { className: 'news-item' },
        el('span', { className: 'news-icon', text: item.icon }),
        el('div', {},
          el('strong', { className: 'news-title', text: item.title }),
          el('p', { className: 'news-text', text: item.text }))));
    }

    const okBtn = el('button', { className: 'btn btn-primary btn-block', type: 'button', text: 'Alles klar, los geht’s' });
    const card = el('div', { className: 'modal-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'newsTitle' },
      el('span', { className: 'modal-badge', text: 'Neu' }),
      el('h2', { className: 'modal-title', id: 'newsTitle', text: 'Was ist neu?' }),
      el('p', { className: 'modal-sub', text: 'Die App prüft jetzt gezielter Verständnis statt Wiedererkennung:' }),
      list,
      el('div', { className: 'btn-row' }, okBtn));

    const overlay = el('div', { className: 'modal-overlay', id: 'newsModal' }, card);
    okBtn.addEventListener('click', () => dismissNews(overlay));

    // Nur der Button (oder Escape) schließt — kein Klick daneben, damit der
    // Hinweis nicht versehentlich weggeklickt und nie wieder gezeigt wird.
    overlay._esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); dismissNews(overlay); } };
    document.addEventListener('keydown', overlay._esc, true);

    document.body.appendChild(overlay);
    setTimeout(() => okBtn.focus(), 60);
  }

  // ---- Freiwillige Unterstützung (Kaffeekasse) ------------------------------

  const SUPPORT_EMAIL = 'john-tahir.ahmed@web.de';
  // PayPal lässt sich mit reiner E-Mail nicht zuverlässig vorbefüllen; der
  // Button öffnet daher die PayPal-Sendeseite und legt die Adresse in die
  // Zwischenablage, sodass man sie dort nur noch einfügen muss.
  const PAYPAL_SEND_URL = 'https://www.paypal.com/myaccount/transfer/homepage/pay';

  function copyEmailToClipboard(toastEl) {
    const showToast = () => {
      if (!toastEl) return;
      toastEl.textContent = '✓ E-Mail kopiert – in PayPal einfügen';
      toastEl.hidden = false;
      window.clearTimeout(copyEmailToClipboard._t);
      copyEmailToClipboard._t = window.setTimeout(() => { toastEl.hidden = true; }, 3000);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(SUPPORT_EMAIL).then(showToast, showToast);
      } else {
        showToast();
      }
    } catch (err) { showToast(); }
  }

  function buildSupportCard() {
    const toast = el('p', { className: 'support-toast', hidden: '' });

    const qrWrap = el('div', { className: 'support-qr-wrap' },
      el('img', {
        className: 'support-qr',
        src: 'assets/qrcode.png',
        alt: 'PayPal-QR-Code zum Senden eines Beitrags',
        width: '168', height: '168',
      }));

    const emailBtn = el('button', {
      type: 'button',
      className: 'support-email',
      title: 'E-Mail-Adresse kopieren',
      onclick: () => copyEmailToClipboard(toast),
    }, SUPPORT_EMAIL);

    const payBtn = el('button', {
      type: 'button',
      className: 'btn btn-primary btn-block',
      onclick: () => { copyEmailToClipboard(toast); window.open(PAYPAL_SEND_URL, '_blank', 'noopener'); },
    }, 'Mit PayPal senden');

    return el('div', { className: 'card support-card' },
      el('h2', { className: 'support-title', text: '☕ Kaffeekasse – ganz freiwillig' }),
      el('p', { className: 'support-text', text: 'Die App ist und bleibt kostenlos. Wer sie feiert und mich ein bisschen unterstützen mag, darf gern was dalassen – überhaupt kein Muss, freut mich aber.' }),
      qrWrap,
      el('p', { className: 'support-hint', text: 'Am Laptop? Einfach mit dem Handy scannen.' }),
      el('p', { className: 'support-or', text: 'oder per PayPal an:' }),
      emailBtn,
      el('div', { className: 'btn-row', style: 'margin-top:0.8rem' }, payBtn),
      toast);
  }

  async function doLogout() {
    if (S.exam && !S.exam.finished) {
      if (!window.confirm('Laufende Klausur abbrechen und abmelden?')) return;
      stopExamTimer();
      S.exam = null;
    }
    CKT.storage.flushSync(true); // letzten Stand noch mitnehmen (Cookie noch gültig)
    try { await fetch('api/logout', { method: 'POST' }); } catch (err) { /* egal */ }
    CKT.storage.clearLastUser();
    CKT.storage.setUser(null, { sync: false });
    AUTH.mode = 'login';
    AUTH.name = null;
    updateUserChip();
    renderLogin();
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(window.location.protocol)) return; // file:// → kein SW möglich

    // Der Service Worker liefert "Cache-first" — ohne die folgende Automatik
    // würden Nutzer nach einem Update beliebig lange auf altem Code sitzen
    // bleiben (sie müssten zufällig zweimal neu laden). Sobald eine neue
    // Version die Kontrolle übernimmt, laden wir die Seite deshalb einmalig neu.
    const hatteController = !!navigator.serviceWorker.controller;
    let laedtNeu = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hatteController || laedtNeu) return; // Erstinstallation: kein Reload nötig
      laedtNeu = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('service-worker.js')
      .then((reg) => {
        reg.update(); // aktiv nach einer neuen Version fragen (nicht erst irgendwann)
        // Bei längeren Sitzungen stündlich erneut prüfen.
        window.setInterval(() => reg.update(), 60 * 60 * 1000);
      })
      .catch(() => {
        /* Offline-Cache nicht verfügbar (z. B. http ohne localhost) — App läuft trotzdem. */
      });
  }

  // ---- Bootstrap ------------------------------------------------------------

  async function boot() {
    const auth = await checkAuth();
    AUTH.mode = auth.mode;
    AUTH.name = auth.name;

    if (auth.mode === 'online') {
      CKT.storage.setUser(auth.name, { sync: true });
      await syncFromServer();
    } else if (auth.mode === 'offline') {
      // Sync bleibt aktiv — sobald wieder Netz da ist, wird nachgeschoben
      CKT.storage.setUser(auth.name, { sync: true });
    }
    updateUserChip();

    if (!(await loadData())) return; // Fehlerseite steht bereits

    if (auth.mode === 'login') renderLogin();
    else renderHome();
  }

  applyTheme(CKT.storage.getTheme());
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('logoutBtn').addEventListener('click', doLogout);
  document.getElementById('brandHome').addEventListener('click', () => {
    if (S.exam && !S.exam.finished) {
      if (!window.confirm('Laufende Klausur abbrechen? Der Stand geht verloren.')) return;
      stopExamTimer();
      S.exam = null;
    }
    if (S.data) {
      if (AUTH.mode === 'login') renderLogin();
      else renderHome();
    }
  });
  document.addEventListener('keydown', (e) => { if (S.keyHandler) S.keyHandler(e); });

  registerServiceWorker();
  boot();
})();
