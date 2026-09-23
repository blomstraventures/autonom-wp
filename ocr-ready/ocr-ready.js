/**
 * Autonom Scan Ready — v4.0
 * Per-row adaptive threshold: smallest-gap × 2.
 * Everything else unchanged from v3.9.
 */
(function () {
  'use strict';

  var DOCX_URL       = 'https://esm.sh/docx@8.5.0';
  var PDFLIB_URL     = 'https://esm.sh/pdf-lib@1.17.1';
  var PDFJS_URL      = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_WORKER   = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var TESS_URL       = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  var TESS_LANG_PATH = 'https://tessdata.projectnaptha.com/4.0.0';
  var TESS_LANG      = 'swe+eng';

  var _mod = {};
  var _scripts = {};

  function loadScriptOnce(url) {
    if (_scripts[url]) return _scripts[url];
    _scripts[url] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Failed to load ' + url)); };
      document.head.appendChild(s);
    });
    return _scripts[url];
  }

  async function loadDocx() {
    if (_mod.docx) return _mod.docx;
    var m = await import(/* @vite-ignore */ DOCX_URL);
    _mod.docx = m.default || m;
    return _mod.docx;
  }
  async function loadPdfLib() {
    if (_mod.pdflib) return _mod.pdflib;
    var m = await import(/* @vite-ignore */ PDFLIB_URL);
    _mod.pdflib = m.default || m;
    return _mod.pdflib;
  }
  async function loadPdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    if (_mod.pdfjs) return _mod.pdfjs;
    await new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = PDFJS_URL;
      s.onload = function () {
        try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; } catch (_) {}
        resolve();
      };
      s.onerror = function () { reject(new Error('PDF.js failed to load')); };
      document.head.appendChild(s);
    });
    _mod.pdfjs = window.pdfjsLib;
    return _mod.pdfjs;
  }
  async function loadTesseract() {
    if (window.Tesseract) return window.Tesseract;
    await loadScriptOnce(TESS_URL);
    if (!window.Tesseract) throw new Error('Tesseract failed to load');
    return window.Tesseract;
  }

  var OCR_CORRECTIONS = {
    'Pca': 'Price',
    'Morigae': 'Mortgage',
    'Mortgae': 'Mortgage',
    'Mortgate': 'Mortgage',
    'Mortgagc': 'Mortgage',
    'Morigae-ränta': 'Mortgage interest',
    'Morigae Interest': 'Mortgage Interest',
    'Mortgae Interest': 'Mortgage Interest',
    'Jdakim': 'Joakim',
    'Hotéll': 'Hotell',
    'Hotll': 'Hotell',
    'Sllén': 'Silén',
    'SiIén': 'Silén',
    'UthyrningsavtaI': 'Uthyrningsavtal',
    'Månadsinkomst': 'Monthly Income',
    'Månadskostnad': 'Monthly Cost',
    'Månatlig bolåneränta': 'Monthly Mortgage Interest',
    'Månatlig återbetalning av bolån': 'Monthly Mortgage Payback',
    'Bolåneränta': 'Mortgage Interest',
    'Eget kapital': 'Owner Equity',
    'Ägarkapital': 'Owner Equity',
    'Bolåneåterbetalning': 'Mortgage Payback',
    'Återbetalning av bolån': 'Mortgage Payback',
    'Inteckning': 'Mortgage',
    'Bolån': 'Mortgage',
    'Rumsnummer': 'Room Number',
    'Inkomst Ränta': 'Income Interest',
    'Netto': 'Net',
    'Totalt netto': 'Total Net'
  };

  function fixLineText(text) {
    if (!text) return text;
    text = text.replace(/[$S]\s{0,2}(\d{1,2})\b/g, '§$1');
    for (var k in OCR_CORRECTIONS) {
      if (Object.prototype.hasOwnProperty.call(OCR_CORRECTIONS, k)) {
        var esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        text = text.replace(new RegExp('\\b' + esc + '\\b', 'g'), OCR_CORRECTIONS[k]);
      }
    }
    return text;
  }

  async function pdfHasTextLayer(buffer) {
    try {
      var pdfjsLib = await loadPdfJs();
      var pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
      var pagesToCheck = Math.min(5, pdf.numPages);
      var totalChars = 0;
      for (var i = 1; i <= pagesToCheck; i++) {
        var page = await pdf.getPage(i);
        var tc = await page.getTextContent();
        (tc.items || []).forEach(function (it) { totalChars += (it.str || '').length; });
      }
      return (totalChars / pagesToCheck) > 100;
    } catch (_) { return false; }
  }

  function groupWordsIntoLines(words, tolerance) {
    if (!words.length) return [];
    var tol = tolerance || 8;
    var sorted = words.slice().sort(function (a, b) { return a.yCenter - b.yCenter; });
    var lines = [];
    var current = [sorted[0]];
    var currentY = sorted[0].yCenter;
    for (var i = 1; i < sorted.length; i++) {
      var w = sorted[i];
      if (Math.abs(w.yCenter - currentY) <= tol) {
        current.push(w);
        currentY = (currentY * (current.length - 1) + w.yCenter) / current.length;
      } else {
        current.sort(function (a, b) { return a.x0 - b.x0; });
        lines.push({ y: currentY, words: current });
        current = [w];
        currentY = w.yCenter;
      }
    }
    if (current.length) {
      current.sort(function (a, b) { return a.x0 - b.x0; });
      lines.push({ y: currentY, words: current });
    }
    return lines;
  }

  function applyLineCorrections(lines) {
    lines.forEach(function (line) {
      if (!line.words || !line.words.length) return;
      var joined = line.words.map(function (w) { return w.text; }).join(' ');
      var fixed = fixLineText(joined);
      if (fixed !== joined) {
        var first = line.words[0];
        var last = line.words[line.words.length - 1];
        line.words = [{
          text: fixed,
          x0: first.x0,
          x1: last.x1,
          y0: first.y0,
          y1: first.y1,
          yCenter: first.yCenter
        }];
      }
    });
    return lines;
  }

  async function extractFromTextLayer(buffer, progress) {
    var pdfjsLib = await loadPdfJs();
    var pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
    var pages = [];

    for (var i = 1; i <= pdf.numPages; i++) {
      if (i === 1 || i % 5 === 0) progress('Reading page ' + i + ' of ' + pdf.numPages, 0.1 + 0.5 * i / pdf.numPages);
      var page = await pdf.getPage(i);
      var vp = page.getViewport({ scale: 1 });
      var tc = await page.getTextContent();

      var items = (tc.items || []).filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
        var x0 = it.transform[4];
        var y0Top = vp.height - it.transform[5] - (it.height || 10);
        var w = it.width || 0;
        var h = it.height || 10;
        return {
          text: it.str,
          x0: x0,
          x1: x0 + w,
          y0: y0Top,
          y1: y0Top + h,
          yCenter: y0Top + h / 2
        };
      });

      var lines = groupWordsIntoLines(items, 3);
      lines = applyLineCorrections(lines);
      pages.push({ width: vp.width, height: vp.height, lines: lines });
    }
    return pages;
  }

  async function extractFromOcr(buffer, progress) {
    var pdfjsLib = await loadPdfJs();
    var Tesseract = await loadTesseract();

    var pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
    var total = pdf.numPages;

    progress('Starting OCR engine…', 0.08);
    var worker = await Tesseract.createWorker(TESS_LANG, 1, { langPath: TESS_LANG_PATH });

    var pages = [];
    var pageWords = [];

    for (var i = 1; i <= total; i++) {
      var base = 0.12 + (0.55 * (i - 1) / total);
      var span = 0.55 / total;
      progress('Recognising page ' + i + ' of ' + total + '…', base);

      var page = await pdf.getPage(i);
      var viewport = page.getViewport({ scale: 3 });
      var canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      var ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;

      var result = await worker.recognize(canvas);
      var data = result.data || {};

      var words = [];
      (data.words || []).forEach(function (w) {
        if (!w.text || !w.text.trim() || !w.bbox) return;
        var t = w.text.trim();
        if (!t) return;
        words.push({
          text: t,
          x0: w.bbox.x0,
          x1: w.bbox.x1,
          y0: w.bbox.y0,
          y1: w.bbox.y1,
          yCenter: (w.bbox.y0 + w.bbox.y1) / 2
        });
      });

      var lines = groupWordsIntoLines(words, 15);
      lines = applyLineCorrections(lines);

      pages.push({ width: viewport.width, height: viewport.height, lines: lines });

      var pdfItems = words.map(function (w) {
        return { str: w.text + ' ', x: w.x0, y: w.y0, height: w.y1 - w.y0 };
      });
      pageWords.push({ width: viewport.width, height: viewport.height, items: pdfItems });

      progress('Page ' + i + ' of ' + total + ' done', base + span);
    }

    try { await worker.terminate(); } catch (_) {}

    return { pages: pages, pageWords: pageWords };
  }

  /* =====================================================================
     v4.0 — ADAPTIVE THRESHOLD
     Threshold = smallest non-zero gap in the row × 2.
     Small-word gaps merge; larger column gaps split.
     ===================================================================== */
  function computeRowGapThreshold(words) {
    if (words.length < 2) return 15;
    var sorted = words.slice().sort(function (a, b) { return a.x0 - b.x0; });
    var minGap = Infinity;
    for (var i = 1; i < sorted.length; i++) {
      var g = sorted[i].x0 - sorted[i - 1].x1;
      if (g > 0 && g < minGap) minGap = g;
    }
    if (!isFinite(minGap) || minGap <= 0) return 15;
    var threshold = minGap * 2.5;
    if (threshold < 8) threshold = 8;
    if (threshold > 50) threshold = 50;
    return threshold;
  }

  function isTableRowCandidate(line) {
    if (!line || !line.words || line.words.length < 4) return false;
    var sorted = line.words.slice().sort(function (a, b) { return a.x0 - b.x0; });
    var gaps = [];
    for (var i = 1; i < sorted.length; i++) {
      var g = sorted[i].x0 - sorted[i - 1].x1;
      if (g > 0) gaps.push(g);
    }
    if (gaps.length < 3) return false;
    gaps.sort(function (a, b) { return a - b; });

    var minGap = gaps[0];
    if (minGap <= 0) minGap = 1;
    var threshold = Math.max(minGap * 2.5, minGap + 6);
    if (threshold < 8) threshold = 8;
    if (threshold > 50) threshold = 50;

    var bigGaps = 0;
    for (var j = 0; j < gaps.length; j++) {
      if (gaps[j] > threshold) bigGaps++;
    }
    return bigGaps >= 3;
  }

  function clusterWordsIntoCells(words) {
    if (!words.length) return [];
    var sorted = words.slice().sort(function (a, b) { return a.x0 - b.x0; });
    var gapThreshold = computeRowGapThreshold(sorted);

    var cells = [];
    var current = [sorted[0]];
    for (var i = 1; i < sorted.length; i++) {
      var gap = sorted[i].x0 - sorted[i - 1].x1;
      if (gap > gapThreshold) {
        cells.push(makeCell(current));
        current = [sorted[i]];
      } else {
        current.push(sorted[i]);
      }
    }
    if (current.length) cells.push(makeCell(current));
    return cells;
  }

  function makeCell(words) {
    var text = words.map(function (w) { return w.text; }).join(' ').replace(/\s+/g, ' ').trim();
    return {
      text: text,
      x0: words[0].x0,
      x1: words[words.length - 1].x1
    };
  }

  function buildTable(regionCells) {
    var allStarts = [];
    regionCells.forEach(function (cells) {
      cells.forEach(function (c) { allStarts.push(c.x0); });
    });
    if (!allStarts.length) return null;
    allStarts.sort(function (a, b) { return a - b; });

    var clusterTolerance = 25;
    var clusters = [];
    var current = [allStarts[0]];
    for (var i = 1; i < allStarts.length; i++) {
      if (allStarts[i] - current[current.length - 1] <= clusterTolerance) {
        current.push(allStarts[i]);
      } else {
        clusters.push(avg(current));
        current = [allStarts[i]];
      }
    }
    if (current.length) clusters.push(avg(current));

    if (clusters.length < 3) return null;

    var rows = regionCells.map(function (cells) {
      var row = new Array(clusters.length).fill('');
      cells.forEach(function (c) {
        var nearestIdx = 0;
        var nearestDist = Math.abs(c.x0 - clusters[0]);
        for (var k = 1; k < clusters.length; k++) {
          var d = Math.abs(c.x0 - clusters[k]);
          if (d < nearestDist) { nearestDist = d; nearestIdx = k; }
        }
        if (row[nearestIdx]) row[nearestIdx] += ' ' + c.text;
        else row[nearestIdx] = c.text;
      });
      return row;
    });

    return { rows: rows, columnCount: clusters.length };
  }

  function avg(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function detectTablesInPage(page) {
    var lines = page.lines;
    if (lines.length < 2) return [];

    var isTableRow = lines.map(function (line) { return isTableRowCandidate(line); });

    var tables = [];
    var i = 0;
    while (i < lines.length) {
      if (isTableRow[i]) {
        var j = i;
        while (j < lines.length && isTableRow[j]) j++;
        var runLength = j - i;
        if (runLength >= 2) {
          var regionCells = lines.slice(i, j).map(function (line) {
            return clusterWordsIntoCells(line.words);
          });
          var table = buildTable(regionCells);
          if (table && table.rows.length >= 2 && table.columnCount >= 3) {
            tables.push({
              lineStart: i,
              lineEnd: j - 1,
              rows: table.rows,
              columnCount: table.columnCount
            });
          }
        }
        i = j;
      } else {
        i++;
      }
    }
    return tables;
  }

  function isStandalonePageNumber(line) {
    var t = line.trim();
    if (!t) return false;
    if (/^\d{1,4}$/.test(t)) return true;
    if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(t)) return true;
    if (/^sida\s+\d+(\s+av\s+\d+)?$/i.test(t)) return true;
    if (/^\d+\s*\/\s*\d+$/.test(t)) return true;
    if (/^[-–—]\s*\d+\s*[-–—]$/.test(t)) return true;
    if (/^\[\s*\d+\s*\]$/.test(t)) return true;
    return false;
  }

  function isListLike(line) {
    return /^\s*(?:[-*•·–—]\s+|\d+[.)]\s+|[a-z][.)]\s+)/i.test(line);
  }

  function isHeadingCandidate(line) {
    var t = line.trim();
    if (!t) return false;
    if (t.length > 90) return false;
    if (/^§\s*\d+/.test(t)) return true;
    if (/^\d+(\.\d+){0,3}[.)]?\s+[A-ZÅÄÖ]/.test(t) && t.length < 80) return true;
    if (/^(article|artikel|kapitel|chapter|section|avsnitt|sektion|bilaga|annex|appendix|exhibit|schedule|table|tabell)\s+[\dIVX]+/i.test(t)) return true;
    if (/^[IVX]+\.\s+[A-ZÅÄÖ]/.test(t) && t.length < 80) return true;
    var letters = t.replace(/[^A-Za-zÅÄÖåäö]/g, '');
    var uppers  = t.replace(/[^A-ZÅÄÖ]/g, '');
    if (letters.length > 4 && t.length < 70 && (uppers.length / letters.length) > 0.8) return true;
    if (t.length < 60 && !/[.,;:!?]$/.test(t) && /^[A-ZÅÄÖ]/.test(t)) return true;
    return false;
  }

  function lineToText(line) {
    return line.words.map(function (w) { return w.text; }).join(' ').replace(/\s+/g, ' ').trim();
  }

  function groupIntoBlocks(pages) {
    var blocks = [];
    var totalWords = 0;
    var headingCount = 0;
    var tableCount = 0;

    pages.forEach(function (page, pageIdx) {
      var tables = detectTablesInPage(page);
      var tableRanges = tables.map(function (t) {
        return { start: t.lineStart, end: t.lineEnd, rows: t.rows };
      });

      var li = 0;
      var paraBuffer = [];

      function flushPara() {
        if (!paraBuffer.length) return;
        var text = paraBuffer.join(' ').replace(/\s+/g, ' ').trim();
        if (text) {
          blocks.push({ type: 'p', text: text });
          totalWords += (text.match(/\S+/g) || []).length;
        }
        paraBuffer = [];
      }

      while (li < page.lines.length) {
        var tableRange = null;
        for (var ti = 0; ti < tableRanges.length; ti++) {
          if (tableRanges[ti].start === li) { tableRange = tableRanges[ti]; break; }
        }
        if (tableRange) {
          flushPara();
          blocks.push({ type: 'table', rows: tableRange.rows });
          tableCount++;
          tableRange.rows.forEach(function (row) {
            row.forEach(function (cell) {
              totalWords += (cell.match(/\S+/g) || []).length;
            });
          });
          li = tableRange.end + 1;
          continue;
        }

        var lineText = lineToText(page.lines[li]);
        if (!lineText) { li++; continue; }

        if (isStandalonePageNumber(lineText)) { flushPara(); li++; continue; }

        if (isHeadingCandidate(lineText)) {
          flushPara();
          var level = 2;
          if (/^§\s*\d+/.test(lineText) || /^\d+[.)]?\s+[A-ZÅÄÖ]/.test(lineText)) level = 1;
          else if (/^\d+\.\d+/.test(lineText)) level = 2;
          else if (/^\d+\.\d+\.\d+/.test(lineText)) level = 3;
          blocks.push({ type: 'h', level: level, text: lineText });
          totalWords += (lineText.match(/\S+/g) || []).length;
          headingCount++;
          li++;
          continue;
        }

        if (isListLike(lineText)) {
          flushPara();
          var listItems = [stripListMarker(lineText)];
          li++;
          while (li < page.lines.length) {
            var nextText = lineToText(page.lines[li]);
            if (!isListLike(nextText)) break;
            listItems.push(stripListMarker(nextText));
            li++;
          }
          blocks.push({ type: 'ul', items: listItems });
          listItems.forEach(function (it) {
            totalWords += (it.match(/\S+/g) || []).length;
          });
          continue;
        }

        paraBuffer.push(lineText);
        var endsSentence = /[.!?:;]$/.test(lineText);
        var next = li + 1 < page.lines.length ? lineToText(page.lines[li + 1]) : '';
        var nextIsFresh = next && /^[A-ZÅÄÖ]/.test(next);
        if (endsSentence && nextIsFresh) flushPara();
        else if (endsSentence && !next) flushPara();
        li++;
      }
      flushPara();

      if (pageIdx < pages.length - 1) blocks.push({ type: 'pagebreak' });
    });

    return {
      blocks: blocks,
      wordCount: totalWords,
      headingCount: headingCount,
      tableCount: tableCount
    };
  }

  function stripListMarker(line) {
    return line.replace(/^\s*[-*•·–—]\s+/, '').replace(/^\s*\d+[.)]\s+/, '').replace(/^\s*[a-z][.)]\s+/i, '');
  }

  async function buildDocx(blocks, opts) {
    var D = await loadDocx();
    var P = D.Paragraph, T = D.TextRun, H = D.HeadingLevel;
    var A = D.AlignmentType, Doc = D.Document, Pack = D.Packer;
    var PageBreak = D.PageBreak;
    var Table = D.Table, TableRow = D.TableRow, TableCell = D.TableCell;
    var WidthType = D.WidthType, BorderStyle = D.BorderStyle;

    if (!Doc || !Pack) throw new Error('docx library missing Document or Packer');
    if (!Table || !TableRow || !TableCell) throw new Error('docx library missing Table components');

    var children = [];

    if (opts.title) {
      children.push(new P({
        heading: H.TITLE,
        alignment: A.CENTER,
        children: [new T({ text: opts.title, bold: true })]
      }));
      children.push(new P({ children: [new T({ text: '' })] }));
    }

    function isHeaderRow(row) {
      var nonEmpty = row.filter(function (c) { return c && c.trim(); });
      if (nonEmpty.length < 2) return false;
      var nonNumeric = nonEmpty.filter(function (c) { return !/^[\d\s.,%]+$/.test(c.trim()); });
      return nonNumeric.length / nonEmpty.length >= 0.5;
    }

    blocks.forEach(function (b) {
      if (b.type === 'pagebreak') {
        if (PageBreak) children.push(new P({ children: [new PageBreak()] }));
        return;
      }
      if (b.type === 'h') {
        var lvl = b.level === 1 ? H.HEADING_1 : b.level === 2 ? H.HEADING_2 : H.HEADING_3;
        children.push(new P({ heading: lvl, children: [new T({ text: b.text })] }));
        return;
      }
      if (b.type === 'p') {
        children.push(new P({ children: [new T({ text: b.text })] }));
        return;
      }
      if (b.type === 'ul') {
        b.items.forEach(function (it) {
          children.push(new P({ bullet: { level: 0 }, children: [new T({ text: it })] }));
        });
        return;
      }
      if (b.type === 'table') {
        var rows = b.rows;
        var columnCount = rows.length ? rows[0].length : 0;
        if (!columnCount) return;

        var headerIdx = isHeaderRow(rows[0]) ? 0 : -1;

        var tableRows = rows.map(function (row, rowIdx) {
          var isHeader = rowIdx === headerIdx;
          var cells = [];
          for (var ci = 0; ci < columnCount; ci++) {
            var text = row[ci] || '';
            cells.push(new TableCell({
              children: [new P({ children: [new T({ text: text, bold: isHeader })] })],
              width: { size: Math.floor(9000 / columnCount), type: WidthType.DXA }
            }));
          }
          return new TableRow({ tableHeader: isHeader, children: cells });
        });

        children.push(new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top:    { style: BorderStyle.SINGLE, size: 4, color: '999999' },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
            left:   { style: BorderStyle.SINGLE, size: 4, color: '999999' },
            right:  { style: BorderStyle.SINGLE, size: 4, color: '999999' },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'cccccc' },
            insideVertical:   { style: BorderStyle.SINGLE, size: 4, color: 'cccccc' }
          }
        }));
        children.push(new P({ children: [new T({ text: '' })] }));
        return;
      }
    });

    var doc = new Doc({
      creator: 'Autonom Scan Ready',
      title: opts.title || 'Scanned document',
      description: 'Converted from scanned PDF.',
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
        children: children
      }]
    });

    if (typeof Pack.toBlob === 'function') return await Pack.toBlob(doc);
    if (typeof Pack.toBuffer === 'function') {
      var buf = await Pack.toBuffer(doc);
      return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    }
    if (typeof Pack.toBase64String === 'function') {
      var b64 = await Pack.toBase64String(doc);
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    }
    throw new Error('No usable Packer method');
  }

  async function buildSearchablePdf(originalBuffer, pageTextItems) {
    var L = await loadPdfLib();
    var pdfDoc = await L.PDFDocument.load(originalBuffer);
    var font;
    try { font = await pdfDoc.embedFont(L.StandardFonts.Helvetica); } catch (_) { return null; }
    var pages = pdfDoc.getPages();
    pageTextItems.forEach(function (tp, idx) {
      if (idx >= pages.length) return;
      var page = pages[idx];
      var pdfW = page.getWidth(), pdfH = page.getHeight();
      var sx = pdfW / tp.width, sy = pdfH / tp.height;
      (tp.items || []).forEach(function (item) {
        if (!item.str || !item.str.trim()) return;
        var x = item.x * sx;
        var yTop = item.y * sy;
        var size = Math.max(4, (item.height || 10) * sy * 0.9);
        var y = pdfH - yTop - size;
        try { page.drawText(item.str, { x: x, y: y, size: size, font: font, color: L.rgb(0,0,0), opacity: 0 }); } catch (_) {}
      });
    });
    var out = await pdfDoc.save();
    return new Blob([out], { type: 'application/pdf' });
  }

  function bytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }
  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  function escapeXml(s) {
    return String(s).replace(/[<>&"']/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c];
    });
  }

  function init(root) {
    if (!root || root.dataset.srReady === '1') return;
    root.dataset.srReady = '1';
    function q(s) { try { return root.querySelector(s); } catch (_) { return null; } }

    var dropEl       = q('.or-drop');
    var fileInput    = q('.or-file');
    var sourceEl     = q('.or-source');
    var sourceName   = q('.or-source-name');
    var sourceSize   = q('.or-source-size');
    var sourceChange = q('.or-source-change');
    var titleInput   = q('.or-title');
    var runBtn       = q('.or-run');
    var progressWrap = q('.or-progress');
    var progressFill = q('.or-progress-fill');
    var progressLeft = q('.or-progress-text .left');
    var progressPct  = q('.or-progress-text .pct');
    var resultEl     = q('.or-result');
    var statPages    = q('[data-stat="pages"]');
    var statWords    = q('[data-stat="words"]');
    var statTables   = q('[data-stat="tables"]');
    var statTime     = q('[data-stat="time"]');
    var dlDocx       = q('.or-dl-docx');
    var dlPdf        = q('.or-dl-pdf');
    var previewEl    = q('.or-preview');

    var state = {
      file: null, arrayBuffer: null,
      blocks: [], docxBlob: null, pdfBlob: null,
      started: 0,
      stats: { pages: 0, words: 0, headings: 0, tables: 0 }
    };

    function showProgress(show) { if (progressWrap) progressWrap.hidden = !show; }
    function setProgress(text, pct) {
      if (progressLeft) progressLeft.textContent = text;
      if (progressFill) progressFill.style.width = Math.round(Math.min(1, Math.max(0, pct)) * 100) + '%';
      if (progressPct) progressPct.textContent = Math.round(Math.min(1, Math.max(0, pct)) * 100) + '%';
    }
    function updateRunButton() { if (runBtn) runBtn.disabled = !state.file || !state.arrayBuffer; }

    async function loadFile(f) {
      try {
        if (!f) return;
        if (!/pdf$/i.test(f.name) && f.type !== 'application/pdf') {
          alert('Please choose a PDF file.'); return;
        }
        state.file = f;
        state.blocks = []; state.docxBlob = null; state.pdfBlob = null;
        state.stats = { pages: 0, words: 0, headings: 0, tables: 0 };
        if (sourceEl) sourceEl.hidden = false;
        if (sourceName) sourceName.textContent = f.name;
        if (sourceSize) sourceSize.textContent = bytes(f.size);
        if (resultEl) resultEl.classList.remove('is-active');
        if (dlDocx) dlDocx.disabled = true;
        if (dlPdf) dlPdf.disabled = true;
        state.arrayBuffer = await f.arrayBuffer();
        updateRunButton();
      } catch (e) {
        console.error('[Scan Ready] loadFile failed:', e);
        state.arrayBuffer = null;
        alert('Could not read the file: ' + (e.message || e));
      }
    }

    if (dropEl && fileInput) {
      dropEl.addEventListener('click', function (e) {
        if (e.target === fileInput) return;
        try { fileInput.value = ''; fileInput.click(); } catch (_) {}
      });
      dropEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          try { fileInput.value = ''; fileInput.click(); } catch (_) {}
        }
      });
      ['dragenter', 'dragover'].forEach(function (evt) {
        dropEl.addEventListener(evt, function (e) {
          e.preventDefault(); e.stopPropagation();
          if (e.dataTransfer) { try { e.dataTransfer.dropEffect = 'copy'; } catch (_) {} }
          dropEl.classList.add('is-drag');
        });
      });
      ['dragleave', 'dragend'].forEach(function (evt) {
        dropEl.addEventListener(evt, function (e) {
          e.preventDefault(); e.stopPropagation();
          dropEl.classList.remove('is-drag');
        });
      });
      dropEl.addEventListener('drop', function (e) {
        e.preventDefault(); e.stopPropagation();
        dropEl.classList.remove('is-drag');
        var files = (e.dataTransfer && e.dataTransfer.files) || [];
        if (!files.length) return;
        var picked = null;
        for (var i = 0; i < files.length; i++) {
          if (/pdf$/i.test(files[i].name) || files[i].type === 'application/pdf') { picked = files[i]; break; }
        }
        if (!picked) picked = files[0];
        loadFile(picked);
      });
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files.length) loadFile(fileInput.files[0]);
      });
    }
    if (sourceChange) {
      sourceChange.addEventListener('click', function () {
        try { fileInput.value = ''; fileInput.click(); } catch (_) {}
      });
    }

    window.addEventListener('dragover', function (e) {
      if (e.dataTransfer && e.dataTransfer.types &&
          Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1) {
        e.preventDefault();
      }
    }, false);
    window.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.types &&
          Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1) {
        if (!dropEl || !dropEl.contains(e.target)) e.preventDefault();
      }
    }, false);

    if (runBtn) runBtn.addEventListener('click', run);

    async function run() {
      if (!state.file || !state.arrayBuffer) return;
      state.started = Date.now();
      runBtn.disabled = true;
      showProgress(true);
      if (resultEl) resultEl.classList.remove('is-active');
      if (dlDocx) dlDocx.disabled = true;
      if (dlPdf) dlPdf.disabled = true;

      try {
        setProgress('Checking document…', 0.03);
        var hasText = await pdfHasTextLayer(state.arrayBuffer);

        var pages;
        var pageWords = null;

        if (hasText) {
          pages = await extractFromTextLayer(state.arrayBuffer, setProgress);
        } else {
          var ocr = await extractFromOcr(state.arrayBuffer, setProgress);
          pages = ocr.pages;
          pageWords = ocr.pageWords;
        }

        setProgress('Detecting structure and tables…', 0.72);
        var grouped = groupIntoBlocks(pages);
        state.blocks = grouped.blocks;
        state.stats.pages = pages.length;
        state.stats.words = grouped.wordCount;
        state.stats.headings = grouped.headingCount;
        state.stats.tables = grouped.tableCount;

        setProgress('Building Word document…', 0.84);
        try {
          state.docxBlob = await buildDocx(state.blocks, {
            title: (titleInput && titleInput.value.trim()) || state.file.name.replace(/\.pdf$/i, '')
          });
        } catch (e) {
          console.error('DOCX build failed:', e);
          state.docxBlob = null;
        }

        setProgress('Building searchable PDF…', 0.93);
        try {
          if (pageWords) {
            state.pdfBlob = await buildSearchablePdf(state.arrayBuffer, pageWords);
          } else {
            state.pdfBlob = null;
          }
        } catch (e) {
          console.error('Searchable PDF failed:', e);
          state.pdfBlob = null;
        }

        setProgress('Done.', 1);
        showResult();
      } catch (e) {
        console.error(e);
        alert('Conversion failed: ' + (e.message || e));
      } finally {
        showProgress(false);
        updateRunButton();
      }
    }

    function showResult() {
      if (!resultEl) return;
      var elapsed = Math.round((Date.now() - state.started) / 1000);
      if (statPages) statPages.textContent = state.stats.pages || '—';
      if (statWords) statWords.textContent = (state.stats.words || 0).toLocaleString('en-US');
      if (statTables) statTables.textContent = state.stats.tables || 0;
      if (statTime) statTime.textContent = elapsed + 's';
      if (dlDocx) dlDocx.disabled = !state.docxBlob;
      if (dlPdf) dlPdf.disabled = !state.pdfBlob;
      if (previewEl) previewEl.innerHTML = renderPreview(state.blocks);
      resultEl.classList.add('is-active');
      try { resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
    }

    function renderPreview(blocks) {
      var out = '';
      var limit = 60;
      for (var i = 0; i < blocks.length && i < limit; i++) {
        var b = blocks[i];
        if (b.type === 'pagebreak') { out += '\n— page break —\n\n'; continue; }
        if (b.type === 'h') {
          var lvl = Math.min(b.level, 3);
          out += '<h' + lvl + '>' + escapeXml(b.text) + '</h' + lvl + '>\n';
        } else if (b.type === 'p') {
          out += escapeXml(b.text) + '\n\n';
        } else if (b.type === 'ul') {
          out += b.items.map(function (it) { return '• ' + escapeXml(it); }).join('\n') + '\n\n';
        } else if (b.type === 'table') {
          out += '<table>';
          b.rows.forEach(function (row, ri) {
            out += '<tr>';
            row.forEach(function (cell) {
              out += (ri === 0 ? '<th>' : '<td>') + escapeXml(cell) + (ri === 0 ? '</th>' : '</td>');
            });
            out += '</tr>';
          });
          out += '</table>\n\n';
        }
      }
      if (blocks.length > limit) out += '\n… (' + (blocks.length - limit) + ' more blocks)';
      return out;
    }

    if (dlDocx) dlDocx.addEventListener('click', function () {
      if (!state.docxBlob) return;
      var base = (state.file.name || 'document').replace(/\.pdf$/i, '');
      downloadBlob(state.docxBlob, base + '-scan-ready.docx');
    });
    if (dlPdf) dlPdf.addEventListener('click', function () {
      if (!state.pdfBlob) return;
      var base = (state.file.name || 'document').replace(/\.pdf$/i, '');
      downloadBlob(state.pdfBlob, base + '-searchable.pdf');
    });

    updateRunButton();
  }

  function boot() {
    try { document.querySelectorAll('#autonom-ocr-ready').forEach(init); }
    catch (e) { console.error('[Autonom Scan Ready] Boot failed:', e); }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
