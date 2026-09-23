/**
 * Autonom Context Merge — v1.1.1
 * Defensive fix: guards every selector, reorders init to attach file
 * listeners before any risky code runs. If this version still fails,
 * the console will show exactly which line.
 */
(function () {
  'use strict';

  var PDFJS_VERSION = '3.11.174';
  var PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VERSION + '/';
  var MAX_FILES = 30;

  /* =====================================================================
     PDF.JS LOADER
     ===================================================================== */
  var pdfjsLoading = null;
  function ensurePdfJs() {
    if (window.pdfjsLib) return Promise.resolve();
    if (pdfjsLoading) return pdfjsLoading;
    pdfjsLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = PDFJS_BASE + 'pdf.min.js';
      s.async = true;
      s.onload = function () {
        if (!window.pdfjsLib) return reject(new Error('PDF.js loaded but global not defined.'));
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js';
        resolve();
      };
      s.onerror = function () { reject(new Error('Failed to load PDF.js from CDN.')); };
      document.head.appendChild(s);
    });
    return pdfjsLoading;
  }

  /* =====================================================================
     EXTRACTORS
     ===================================================================== */
  async function extractPdfText(file, onProgress) {
    await ensurePdfJs();
    var buf = await file.arrayBuffer();
    var pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    var pages = [];
    for (var i = 1; i <= pdf.numPages; i++) {
      if (onProgress) onProgress(i, pdf.numPages);
      var page = await pdf.getPage(i);
      var content = await page.getTextContent();
      var items = content.items.map(function (it) {
        return { str: it.str, x: it.transform[4], y: it.transform[5] };
      });
      items.sort(function (a, b) {
        if (Math.abs(a.y - b.y) > 2) return b.y - a.y;
        return a.x - b.x;
      });
      var lines = [];
      var currentLine = [];
      var lastY = null;
      for (var k = 0; k < items.length; k++) {
        var it = items[k];
        if (lastY === null || Math.abs(it.y - lastY) > 3) {
          if (currentLine.length) lines.push(currentLine.join(''));
          currentLine = [it.str];
          lastY = it.y;
        } else {
          currentLine.push(it.str);
        }
      }
      if (currentLine.length) lines.push(currentLine.join(''));
      pages.push(lines.join('\n'));
    }
    return pages.join('\n\n');
  }

  function extractPlainText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('Could not read file.')); };
      reader.readAsText(file);
    });
  }

  function extractHtmlText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var html = String(reader.result || '');
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var kill = doc.querySelectorAll('script, style, noscript');
          for (var i = 0; i < kill.length; i++) kill[i].remove();
          var text = doc.body ? doc.body.innerText : '';
          if (!text) text = doc.body ? doc.body.textContent : '';
          resolve(text || '');
        } catch (e) { reject(e); }
      };
      reader.onerror = function () { reject(new Error('Could not read file.')); };
      reader.readAsText(file);
    });
  }

  function fileKind(file) {
    var n = (file.name || '').toLowerCase();
    if (file.type === 'application/pdf' || /\.pdf$/.test(n)) return 'pdf';
    if (file.type === 'text/html' || /\.(html?|xhtml)$/.test(n)) return 'html';
    if (file.type === 'text/markdown' || /\.(md|markdown)$/.test(n)) return 'md';
    if (file.type === 'text/plain' || /\.(txt|text)$/.test(n)) return 'txt';
    if (file.type === 'text/csv' || /\.csv$/.test(n)) return 'csv';
    if (/^text\//.test(file.type)) return 'txt';
    return null;
  }

  async function extractFile(file, onProgress) {
    var kind = fileKind(file);
    if (!kind) throw new Error('Unsupported file type');
    if (kind === 'pdf') return { text: await extractPdfText(file, onProgress), kind: kind };
    if (kind === 'html') return { text: await extractHtmlText(file), kind: kind };
    return { text: await extractPlainText(file), kind: kind };
  }

  /* =====================================================================
     CONTROL CHARACTER CLEANUP
     ===================================================================== */
  function stripControlChars(text) {
    var out = text;
    out = out.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    out = out.replace(/\u00AD/g, '');
    out = out.replace(/[\u200B-\u200D\uFEFF]/g, '');
    out = out.replace(/\u00A0/g, ' ');
    out = out.replace(/\t/g, ' ');
    out = out.replace(/ {2,}/g, ' ');
    return out;
  }

  /* =====================================================================
     CLEANING ENGINE
     ===================================================================== */
  function isStandalonePageNumber(line) {
    var t = line.trim();
    if (!t) return false;
    if (/^\d{1,4}$/.test(t)) return true;
    if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(t)) return true;
    if (/^sida\s+\d+(\s+av\s+\d+)?$/i.test(t)) return true;
    if (/^seite\s+\d+(\s+von\s+\d+)?$/i.test(t)) return true;
    if (/^\d+\s*\/\s*\d+$/.test(t)) return true;
    if (/^[-–—]\s*\d+\s*[-–—]$/.test(t)) return true;
    if (/^\[\s*\d+\s*\]$/.test(t)) return true;
    return false;
  }

  function isListLike(line) {
    return /^\s*(?:[-*•·–—]\s+|\d+[.)]\s+|[a-z][.)]\s+)/i.test(line);
  }

  function isHeadingLike(line) {
    var t = line.trim();
    if (!t) return false;
    if (t.length > 65) return false;
    if (/[.,;:!?]$/.test(t)) return false;
    if (isListLike(t)) return false;
    if (!/[A-Za-z]/.test(t)) return false;
    if (t.replace(/\s/g, '').length > 50) return false;
    return true;
  }

  function fuzzyShape(line) {
    return line.trim().replace(/\d+/g, '#').replace(/\s+/g, ' ').toLowerCase();
  }

  function isRunningHeaderLike(line) {
    var t = line.trim();
    if (!t) return false;
    if (t.length > 80) return false;
    if (/[.!?]\s*$/.test(t)) return false;
    if ((t.match(/,/g) || []).length > 3) return false;
    if (/\d/.test(t)) return true;
    var letters = (t.match(/[A-Za-z]/g) || []).length;
    var uppers = (t.match(/[A-Z]/g) || []).length;
    if (letters > 0 && uppers / letters > 0.6) return true;
    if (/^[\W_]/.test(t)) return true;
    return false;
  }

  function removeFuzzyRepeatedLines(lines) {
    var shapeCounts = {};
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t || t.length > 80) continue;
      if (!/[a-z]/i.test(t)) continue;
      var shape = fuzzyShape(t);
      shapeCounts[shape] = (shapeCounts[shape] || 0) + 1;
    }
    var out = [];
    for (var j = 0; j < lines.length; j++) {
      var t2 = lines[j].trim();
      if (!t2 || t2.length > 80) { out.push(lines[j]); continue; }
      if (!/[a-z]/i.test(t2)) { out.push(lines[j]); continue; }
      var shape2 = fuzzyShape(t2);
      if (shapeCounts[shape2] >= 3 && isRunningHeaderLike(t2)) continue;
      out.push(lines[j]);
    }
    return out;
  }

  function reflowParagraphs(lines, opts) {
    var out = [];
    var buffer = [];
    function flush() {
      if (buffer.length === 0) return;
      out.push(buffer.join(' '));
      buffer = [];
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();
      if (trimmed === '') { flush(); out.push(''); continue; }
      var isList = opts.preserveLists && isListLike(trimmed);
      var isHeading = opts.preserveHeadings && isHeadingLike(trimmed);
      if (isList || isHeading) { flush(); out.push(trimmed); }
      else buffer.push(trimmed);
    }
    flush();
    return out;
  }

  function rejoinHyphenated(text) {
    return text.replace(/([a-z])-\s*\n\s*([a-z])/g, '$1$2');
  }

  function cleanDocument(raw, opts) {
    var originalChars = raw.length;
    var text = stripControlChars(raw);
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n');
    if (opts.rejoinHyphens) text = rejoinHyphenated(text);
    var lines = text.split('\n');
    var beforeLines = lines.length;
    if (opts.removePageNumbers) {
      lines = lines.filter(function (l) { return !isStandalonePageNumber(l); });
    }
    if (opts.removeHeaders) {
      lines = removeFuzzyRepeatedLines(lines);
    }
    var afterLines = lines.length;
    var linesRemoved = beforeLines - afterLines;
    if (opts.unwrap) {
      lines = reflowParagraphs(lines, {
        preserveLists: opts.preserveLists,
        preserveHeadings: opts.preserveHeadings
      });
    }
    var out = lines.join('\n');
    out = out.replace(/\n{3,}/g, '\n\n');
    out = out.split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).join('\n');
    out = out.replace(/^\n+/, '').replace(/\n+$/, '');
    return {
      text: out,
      linesRemoved: linesRemoved,
      charsRemoved: Math.max(0, originalChars - out.length)
    };
  }

  /* =====================================================================
     CROSS-DOCUMENT DUPLICATE STRIPPING (opt-in)
     ===================================================================== */
  function buildCrossDocLineMap(docTexts) {
    var lineDocs = {};
    var lineOrig = {};
    docTexts.forEach(function (text, idx) {
      var lines = text.split('\n');
      var seenThisDoc = {};
      lines.forEach(function (l) {
        var t = l.trim();
        if (!t || t.length > 100) return;
        if (!/[a-z]/i.test(t)) return;
        var shape = fuzzyShape(t);
        if (seenThisDoc[shape]) return;
        seenThisDoc[shape] = true;
        if (!lineDocs[shape]) lineDocs[shape] = {};
        lineDocs[shape][idx] = true;
        if (!lineOrig[shape]) lineOrig[shape] = t;
      });
    });
    return { lineDocs: lineDocs, lineOrig: lineOrig };
  }

  function stripCrossDocDuplicates(docTexts, map) {
    var stripShapes = {};
    Object.keys(map.lineDocs).forEach(function (shape) {
      var docCount = Object.keys(map.lineDocs[shape]).length;
      if (docCount < 2) return;
      if (!isRunningHeaderLike(map.lineOrig[shape])) return;
      stripShapes[shape] = true;
    });
    var seenGlobal = {};
    var result = [];
    docTexts.forEach(function (text) {
      var lines = text.split('\n');
      var out = [];
      lines.forEach(function (l) {
        var t = l.trim();
        if (!t || t.length > 100) { out.push(l); return; }
        var shape = fuzzyShape(t);
        if (!stripShapes[shape]) { out.push(l); return; }
        if (!seenGlobal[shape]) {
          seenGlobal[shape] = true;
          out.push(l);
        }
      });
      result.push(out.join('\n'));
    });
    return result;
  }

  /* =====================================================================
     FORMAT CONVERSION
     ===================================================================== */
  function toMarkdown(documents) {
    var parts = [];
    documents.forEach(function (doc) {
      var lines = doc.text.split('\n');
      var out = ['# ' + doc.name, ''];
      var paraBuffer = [];
      function flushPara() {
        if (paraBuffer.length === 0) return;
        out.push(paraBuffer.join(' '));
        out.push('');
        paraBuffer = [];
      }
      for (var i = 0; i < lines.length; i++) {
        var t = lines[i].trim();
        if (!t) { flushPara(); continue; }
        if (isHeadingLike(t)) { flushPara(); out.push('## ' + t); out.push(''); }
        else if (isListLike(t)) {
          flushPara();
          out.push('- ' + t.replace(/^\s*(?:[-*•·–—]\s+|\d+[.)]\s+|[a-z][.)]\s+)/i, ''));
        } else paraBuffer.push(t);
      }
      flushPara();
      parts.push(out.join('\n').replace(/\n{3,}/g, '\n\n').trim());
    });
    return parts.join('\n\n---\n\n') + '\n';
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toHtml(documents) {
    var parts = [];
    documents.forEach(function (doc) {
      var blocks = doc.text.split(/\n{2,}/);
      var out = ['<section data-document="' + escapeHtml(doc.name) + '">', '<h1>' + escapeHtml(doc.name) + '</h1>'];
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i].trim();
        if (!b) continue;
        if (b.indexOf('\n') === -1 && isHeadingLike(b)) {
          out.push('<h2>' + escapeHtml(b) + '</h2>');
          continue;
        }
        var bLines = b.split('\n');
        var allList = bLines.every(function (l) { return !l.trim() || isListLike(l); });
        if (allList && bLines.some(function (l) { return isListLike(l); })) {
          out.push('<ul>\n' + bLines.map(function (l) {
            return '  <li>' + escapeHtml(l.replace(/^\s*(?:[-*•·–—]\s+|\d+[.)]\s+|[a-z][.)]\s+)/i, '')) + '</li>';
          }).join('\n') + '\n</ul>');
          continue;
        }
        out.push('<p>' + escapeHtml(b).replace(/\n/g, ' ') + '</p>');
      }
      out.push('</section>');
      parts.push(out.join('\n'));
    });
    return parts.join('\n\n') + '\n';
  }

  function toPlainMerged(documents) {
    var parts = [];
    documents.forEach(function (doc) {
      var divider = new Array(60).join('=');
      parts.push(divider + '\nDOCUMENT: ' + doc.name + '\n' + divider + '\n\n' + doc.text);
    });
    return parts.join('\n\n\n') + '\n';
  }

  /* =====================================================================
     TOKEN / WORD ESTIMATION
     ===================================================================== */
  function estimateTokens(text) {
    if (!text) return 0;
    var chars = text.length;
    var words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return Math.max(1, Math.round(((chars / 4) + (words / 0.75)) / 2));
  }
  function countWords(text) {
    if (!text || !text.trim()) return 0;
    return text.trim().split(/\s+/).length;
  }

  /* =====================================================================
     INIT
     ===================================================================== */
  function init(root) {
    if (!root || root.dataset.cmReady === '1') return;
    root.dataset.cmReady = '1';

    function q(sel) { try { return root.querySelector(sel); } catch (_) { return null; } }
    function qa(sel) {
      try { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
      catch (_) { return []; }
    }

    var tabs = qa('.cm-tab');
    var pastePanel = q('.cm-panel[data-mode="paste"]');
    var filesPanel = q('.cm-panel[data-mode="files"]');
    var inputEl = q('.cm-input');
    var fileInput = q('.cm-file');
    var dropEl = q('.cm-drop');
    var filelistEl = q('.cm-filelist');
    var filelistBody = q('.cm-filelist-body');
    var fileCountEl = q('.cm-filelist-head .count');
    var clearAllBtn = q('.cm-filelist-head .clear-all');

    var toggleInputs = qa('.cm-toggles input');
    var mergeSepBtns = qa('.cm-seg-merge button');
    var runBtn = q('.cm-run');
    var runningEl = q('.cm-running');
    var runningText = runningEl ? runningEl.querySelector('div:last-child') : null;
    var resultEl = q('.cm-result');

    var statDocs = q('[data-stat="docs"]');
    var statWords = q('[data-stat="words"]');
    var statTokens = q('[data-stat="tokens"]');
    var statRemoved = q('[data-stat="removed"]');
    var statRemovedLabel = null;
    var statRemovedCard = null;
    try {
      if (statRemoved) {
        statRemovedCard = statRemoved.closest('.cm-stat');
        statRemovedLabel = statRemovedCard ? statRemovedCard.querySelector('.cm-stat-label') : null;
      }
    } catch (_) {}

    var formatBtns = qa('.cm-format');
    var outputEl = q('.cm-output');
    var copyBtn = q('.cm-copy');
    var downloadBtn = q('.cm-download');

    var state = {
      mode: 'files',
      files: [],
      format: 'text',
      mergeSep: 'heading',
      documents: [],
      stats: null
    };

    /* ---------- CRITICAL: attach file handlers FIRST ---------- */
    if (dropEl && fileInput) {
      dropEl.onclick = function () { try { fileInput.value = ''; fileInput.click(); } catch (_) {} };
      ['dragenter', 'dragover'].forEach(function (evt) {
        dropEl.addEventListener(evt, function (e) {
          e.preventDefault();
          dropEl.classList.add('is-drag');
        });
      });
      ['dragleave', 'drop'].forEach(function (evt) {
        dropEl.addEventListener(evt, function (e) {
          e.preventDefault();
          dropEl.classList.remove('is-drag');
        });
      });
      dropEl.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          addFiles(Array.prototype.slice.call(e.dataTransfer.files));
        }
      });
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files.length) {
          addFiles(Array.prototype.slice.call(fileInput.files));
        }
      });
    }
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', function () {
        state.files = [];
        renderFileList();
        updateRunButton();
      });
    }

    /* ---------- TAB SWITCHING ---------- */
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.toggle('is-active', t === tab); });
        state.mode = tab.dataset.mode;
        if (pastePanel) pastePanel.classList.toggle('is-active', state.mode === 'paste');
        if (filesPanel) filesPanel.classList.toggle('is-active', state.mode === 'files');
        updateRunButton();
      });
    });

    /* ---------- TOGGLES / SEG ---------- */
    toggleInputs.forEach(function (t) {
      t.addEventListener('change', updateRunButton);
    });
    mergeSepBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        mergeSepBtns.forEach(function (b) { b.classList.toggle('is-active', b === btn); });
        state.mergeSep = btn.dataset.value;
      });
    });

    if (inputEl) inputEl.addEventListener('input', updateRunButton);
    if (runBtn) runBtn.addEventListener('click', run);

    formatBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        formatBtns.forEach(function (b) { b.classList.toggle('is-active', b === btn); });
        state.format = btn.dataset.format;
        updateOutput();
      });
    });

    if (copyBtn) copyBtn.addEventListener('click', handleCopy);
    if (downloadBtn) downloadBtn.addEventListener('click', handleDownload);

    /* =====================================================================
       FILE LIST
       ===================================================================== */
    function addFiles(files) {
      var accepted = [];
      var rejected = [];
      files.forEach(function (f) {
        if (state.files.length + accepted.length >= MAX_FILES) { rejected.push(f.name + ' (limit reached)'); return; }
        var kind = fileKind(f);
        if (!kind) { rejected.push(f.name + ' (unsupported type)'); return; }
        var dup = state.files.some(function (x) {
          return x.name === f.name && x.size === f.size;
        });
        if (dup) { rejected.push(f.name + ' (already added)'); return; }
        accepted.push({
          file: f,
          name: f.name,
          size: f.size,
          kind: kind,
          text: '',
          status: 'pending',
          error: null
        });
      });
      state.files = state.files.concat(accepted);
      if (rejected.length && window.console && console.warn) {
        console.warn('[Autonom Context Merge] Files skipped:', rejected);
      }
      renderFileList();
      updateRunButton();
    }

    function renderFileList() {
      if (!filelistEl || !filelistBody) return;
      if (state.files.length === 0) { filelistEl.hidden = true; return; }
      filelistEl.hidden = false;
      if (fileCountEl) fileCountEl.textContent = state.files.length + ' file' + (state.files.length === 1 ? '' : 's');
      filelistBody.innerHTML = '';
      state.files.forEach(function (item, idx) {
        var row = document.createElement('div');
        row.className = 'cm-file-item';

        var icon = document.createElement('div');
        icon.className = 'cm-file-icon';
        icon.textContent = item.kind === 'pdf' ? '📕' : item.kind === 'html' ? '🌐' : item.kind === 'md' ? '📝' : '📄';
        row.appendChild(icon);

        var meta = document.createElement('div');
        meta.className = 'cm-file-meta';
        var name = document.createElement('b');
        name.textContent = item.name;
        meta.appendChild(name);
        var sub = document.createElement('span');
        var kb = (item.size / 1024).toFixed(1) + ' KB';
        if (item.status === 'done') sub.innerHTML = kb + ' · <span class="ok">extracted</span>';
        else if (item.status === 'error') sub.innerHTML = kb + ' · <span class="error">' + (item.error || 'error') + '</span>';
        else if (item.status === 'reading') sub.textContent = kb + ' · reading…';
        else sub.textContent = kb;
        meta.appendChild(sub);
        row.appendChild(meta);

        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'cm-file-remove';
        rm.title = 'Remove';
        rm.setAttribute('aria-label', 'Remove file');
        rm.textContent = '✕';
        rm.addEventListener('click', function () {
          state.files.splice(idx, 1);
          renderFileList();
          updateRunButton();
        });
        row.appendChild(rm);

        filelistBody.appendChild(row);
      });
    }

    /* =====================================================================
       OPTS / RUN BUTTON
       ===================================================================== */
    function getOpts() {
      var opts = {};
      toggleInputs.forEach(function (t) {
        if (t && t.dataset && t.dataset.step) {
          opts[t.dataset.step] = !!t.checked;
        }
      });
      return opts;
    }

    function updateRunButton() {
      if (!runBtn) return;
      var hasSource = false;
      if (state.mode === 'paste') {
        hasSource = !!(inputEl && inputEl.value && inputEl.value.trim().length > 0);
      } else {
        hasSource = state.files.length > 0;
      }
      runBtn.disabled = !hasSource;
    }

    /* =====================================================================
       RUN
       ===================================================================== */
    async function run() {
      if (!runBtn) return;
      runBtn.disabled = true;
      if (runningEl) runningEl.hidden = false;
      if (resultEl) resultEl.classList.remove('is-active');

      try {
        var opts = getOpts();
        var rawDocs = [];

        if (state.mode === 'paste') {
          if (runningText) runningText.textContent = 'Cleaning pasted text…';
          var raw = inputEl ? inputEl.value : '';
          if (!raw.trim()) throw new Error('No text to process.');
          rawDocs.push({ name: 'Pasted text', raw: raw });
        } else {
          var total = state.files.length;
          for (var i = 0; i < state.files.length; i++) {
            var item = state.files[i];
            if (runningText) runningText.textContent = 'Reading ' + (i + 1) + ' of ' + total + ' · ' + item.name;
            item.status = 'reading';
            item.error = null;
            renderFileList();
            try {
              var result = await extractFile(item.file, function (page, pages) {
                if (runningText) runningText.textContent = 'Reading ' + (i + 1) + ' of ' + total + ' · ' + item.name + ' (page ' + page + '/' + pages + ')';
              });
              item.text = result.text || '';
              item.status = 'done';
              rawDocs.push({ name: item.name, raw: item.text });
            } catch (e) {
              item.status = 'error';
              item.error = (e.message || 'extraction failed').slice(0, 60);
            }
            renderFileList();
            await new Promise(function (r) { setTimeout(r, 10); });
          }
          if (rawDocs.length === 0) throw new Error('None of the files could be read.');
        }

        if (runningText) runningText.textContent = 'Cleaning ' + rawDocs.length + ' document' + (rawDocs.length === 1 ? '' : 's') + '…';
        await new Promise(function (r) { setTimeout(r, 20); });

        var cleanedDocs = rawDocs.map(function (rd) {
          var res = cleanDocument(rd.raw, opts);
          return {
            name: rd.name,
            rawText: rd.raw,
            rawTokens: estimateTokens(rd.raw),
            text: res.text,
            cleanTokens: estimateTokens(res.text),
            linesRemoved: res.linesRemoved,
            charsRemoved: res.charsRemoved
          };
        });

        var crossDocRemovedLines = 0;
        if (opts.crossDocDedup && cleanedDocs.length > 1) {
          if (runningText) runningText.textContent = 'Removing content repeated across documents…';
          await new Promise(function (r) { setTimeout(r, 20); });
          var map = buildCrossDocLineMap(cleanedDocs.map(function (d) { return d.text; }));
          var beforeTexts = cleanedDocs.map(function (d) { return d.text; });
          var afterTexts = stripCrossDocDuplicates(beforeTexts, map);
          cleanedDocs.forEach(function (d, i) {
            var before = beforeTexts[i].split('\n').length;
            var after = afterTexts[i].split('\n').length;
            crossDocRemovedLines += Math.max(0, before - after);
            d.text = afterTexts[i];
            d.cleanTokens = estimateTokens(d.text);
          });
        }

        state.documents = cleanedDocs;
        state.stats = computeStats(cleanedDocs, crossDocRemovedLines);
        showResult();
      } catch (e) {
        console.error(e);
        alert('Something went wrong: ' + (e.message || e));
      } finally {
        if (runningEl) runningEl.hidden = true;
        updateRunButton();
      }
    }

    function computeStats(docs, crossDocLinesRemoved) {
      var totalWords = 0;
      var totalTokensBefore = 0;
      var totalTokensAfter = 0;
      var totalChars = 0;
      var totalLinesRemoved = 0;
      docs.forEach(function (d) {
        totalChars += d.text.length;
        totalWords += countWords(d.text);
        totalTokensBefore += d.rawTokens;
        totalTokensAfter += d.cleanTokens;
        totalLinesRemoved += d.linesRemoved;
      });
      totalLinesRemoved += crossDocLinesRemoved;
      var savedTokens = totalTokensBefore - totalTokensAfter;
      var savedPct = totalTokensBefore > 0 ? (savedTokens / totalTokensBefore) * 100 : 0;
      return {
        docs: docs.length,
        chars: totalChars,
        words: totalWords,
        tokensBefore: totalTokensBefore,
        tokensAfter: totalTokensAfter,
        savedTokens: savedTokens,
        savedPct: savedPct,
        linesRemoved: totalLinesRemoved,
        crossDocLinesRemoved: crossDocLinesRemoved
      };
    }

    function fmtNum(n) {
      try { return Number(n).toLocaleString('en-US'); }
      catch (_) { return String(n); }
    }

    function showResult() {
      if (!resultEl || !state.stats) return;
      var s = state.stats;
      try {
        if (statDocs) statDocs.textContent = fmtNum(s.docs);
        if (statWords) statWords.textContent = fmtNum(s.words);
        if (statTokens) statTokens.textContent = fmtNum(s.tokensAfter);
        if (statRemoved) {
          if (s.linesRemoved > 0) {
            var tokenDelta = s.savedTokens > 0 ? '−' + s.savedPct.toFixed(1) + '%' : '0%';
            statRemoved.innerHTML = fmtNum(s.linesRemoved) + '<span class="delta">' + tokenDelta + '</span>';
            if (statRemovedLabel) statRemovedLabel.textContent = 'Lines removed';
            if (statRemovedCard) {
              statRemovedCard.classList.remove('is-flat');
              statRemovedCard.classList.add('is-good');
            }
          } else {
            statRemoved.textContent = '0';
            if (statRemovedLabel) statRemovedLabel.textContent = 'Lines removed';
            if (statRemovedCard) {
              statRemovedCard.classList.remove('is-good');
              statRemovedCard.classList.add('is-flat');
            }
          }
        }
      } catch (_) {}
      updateOutput();
      resultEl.classList.add('is-active');
      try { resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
    }

    /* =====================================================================
       OUTPUT
       ===================================================================== */
    function getOutput() {
      if (!state.documents.length) return '';
      try {
        if (state.format === 'markdown') return toMarkdown(state.documents);
        if (state.format === 'html') return toHtml(state.documents);
        return toPlainMerged(state.documents);
      } catch (e) {
        console.error(e);
        return '';
      }
    }

    function updateOutput() {
      if (!outputEl) return;
      outputEl.value = getOutput();
    }

    function handleCopy() {
      var text = getOutput();
      if (!text) return;
      var original = copyBtn.textContent;
      var done = function () {
        copyBtn.textContent = 'Copied!';
        setTimeout(function () { copyBtn.textContent = original; }, 1600);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
      } else {
        fallback();
      }
      function fallback() {
        outputEl.select();
        try { document.execCommand('copy'); done(); }
        catch (_) {
          copyBtn.textContent = 'Press Ctrl+C';
          setTimeout(function () { copyBtn.textContent = original; }, 2200);
        }
      }
    }

    function handleDownload() {
      var text = getOutput();
      if (!text) return;
      var ext = state.format === 'html' ? 'html' : state.format === 'markdown' ? 'md' : 'txt';
      var mime = state.format === 'html' ? 'text/html' : state.format === 'markdown' ? 'text/markdown' : 'text/plain';
      var base = 'merged-context-' + new Date().toISOString().slice(0, 10);
      var blob = new Blob([text], { type: mime + ';charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = base + '.' + ext;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    updateRunButton();
  }

  function boot() {
    try {
      document.querySelectorAll('#autonom-context-merge').forEach(init);
    } catch (e) {
      console.error('[Autonom Context Merge] Boot failed:', e);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
