/**
 * Autonom PDF Private — v3.0
 * Adds: full-page continuity for splits, two-cut section extraction, signature.
 */
(function () {
  'use strict';

  var PDFLIB_URL = 'https://esm.sh/pdf-lib@1.17.1';
  var JSZIP_URL  = 'https://esm.sh/jszip@3.10.1';
  var PDFJS_URL  = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  var _mod = {};

  async function loadPdfLib() {
    if (_mod.pdflib) return _mod.pdflib;
    var m = await import(/* @vite-ignore */ PDFLIB_URL);
    _mod.pdflib = m.default || m;
    return _mod.pdflib;
  }
  async function loadJsZip() {
    if (_mod.jszip) return _mod.jszip;
    var m = await import(/* @vite-ignore */ JSZIP_URL);
    _mod.jszip = m.default || m;
    return _mod.jszip;
  }
  async function loadPdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    if (_mod.pdfjs) return _mod.pdfjs;
    await new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = PDFJS_URL; s.async = true;
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

  /* =====================================================================
     UTILITIES
     ===================================================================== */
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
  function hexToRgb01(hex) {
    if (!hex) return { r: 0, g: 0, b: 0 };
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return {
      r: parseInt(h.substring(0, 2), 16) / 255,
      g: parseInt(h.substring(2, 4), 16) / 255,
      b: parseInt(h.substring(4, 6), 16) / 255
    };
  }
  function shortBase(name, maxLen) {
    maxLen = maxLen || 30;
    var base = String(name || 'document').replace(/\.pdf$/i, '').trim();
    base = base.replace(/\s*\(\d+\)\s*$/, '');
    base = base.replace(/\s+/g, ' ').trim();
    if (base.length <= maxLen) {
      return base.replace(/[-_\s.]+$/, '').trim() || 'document';
    }
    var cut = base.substring(0, maxLen);
    var lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > 15) cut = cut.substring(0, lastSpace);
    return cut.replace(/[-_\s.]+$/, '').trim() || 'document';
  }
  function parseRanges(str, total) {
    if (!str || !String(str).trim()) return [];
    var parts = String(str).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var result = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      var single = part.match(/^(\d+)$/);
      if (single) {
        var n = parseInt(single[1], 10);
        if (n >= 1 && n <= total) result.push(n);
        continue;
      }
      var range = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) {
        var a = parseInt(range[1], 10);
        var b = parseInt(range[2], 10);
        if (a > b) { var t = a; a = b; b = t; }
        for (var j = a; j <= b; j++) if (j >= 1 && j <= total) result.push(j);
        continue;
      }
      if (part.toLowerCase() === 'end' || part.toLowerCase() === 'last') result.push(total);
    }
    return result;
  }

  /* =====================================================================
     OPERATIONS
     ===================================================================== */
  async function opMerge(items, onProgress) {
    var L = await loadPdfLib();
    var PDFDocument = L.PDFDocument;
    var out = await PDFDocument.create();
    var totalPages = 0;
    for (var i = 0; i < items.length; i++) {
      onProgress('Reading ' + (i + 1) + ' of ' + items.length + ' · ' + items[i].name);
      var src = await PDFDocument.load(items[i].bytes.slice(0), { ignoreEncryption: true });
      var indices = src.getPageIndices();
      var copied = await out.copyPages(src, indices);
      copied.forEach(function (p) { out.addPage(p); });
      totalPages += indices.length;
    }
    var outBytes = await out.save();
    return { bytes: outBytes, pageCount: totalPages };
  }

  async function opKeepSelected(bytes_, totalPages, pageNumbers, onProgress) {
    var L = await loadPdfLib();
    var PDFDocument = L.PDFDocument;
    if (!pageNumbers.length) throw new Error('Select at least one page.');
    onProgress('Extracting ' + pageNumbers.length + ' page(s)…');
    var src = await PDFDocument.load(bytes_.slice(0), { ignoreEncryption: true });
    var indices = pageNumbers.map(function (p) { return p - 1; });
    var out = await PDFDocument.create();
    var copied = await out.copyPages(src, indices);
    copied.forEach(function (p) { out.addPage(p); });
    var outBytes = await out.save();
    return { bytes: outBytes, pageCount: pageNumbers.length };
  }

  async function opDeleteSelected(bytes_, totalPages, pageNumbers, onProgress) {
    var L = await loadPdfLib();
    var PDFDocument = L.PDFDocument;
    if (!pageNumbers.length) throw new Error('Select at least one page to delete.');
    if (pageNumbers.length >= totalPages) throw new Error('Cannot delete all pages.');
    onProgress('Removing ' + pageNumbers.length + ' page(s)…');
    var src = await PDFDocument.load(bytes_.slice(0), { ignoreEncryption: true });
    var del = {};
    pageNumbers.forEach(function (p) { del[p] = true; });
    var keep = [];
    for (var i = 1; i <= totalPages; i++) if (!del[i]) keep.push(i);
    var indices = keep.map(function (p) { return p - 1; });
    var out = await PDFDocument.create();
    var copied = await out.copyPages(src, indices);
    copied.forEach(function (p) { out.addPage(p); });
    var outBytes = await out.save();
    return { bytes: outBytes, pageCount: keep.length };
  }

  async function opRotate(bytes_, angle, targetPages, onProgress) {
    var L = await loadPdfLib();
    var PDFDocument = L.PDFDocument;
    var degrees = L.degrees;
    onProgress('Rotating…');
    var src = await PDFDocument.load(bytes_.slice(0), { ignoreEncryption: true });
    var pages_ = src.getPages();
    var target = targetPages || null;
    for (var i = 0; i < pages_.length; i++) {
      var pageNum = i + 1;
      if (target && !target[pageNum]) continue;
      var cur = pages_[i].getRotation().angle || 0;
      var next = ((cur + angle) % 360 + 360) % 360;
      pages_[i].setRotation(degrees(next));
    }
    var outBytes = await src.save();
    return { bytes: outBytes, pageCount: pages_.length };
  }

  async function opWatermark(bytes_, opts, targetPages, onProgress) {
    var L = await loadPdfLib();
    var PDFDocument = L.PDFDocument;
    var rgb = L.rgb, degrees = L.degrees, StandardFonts = L.StandardFonts;
    onProgress('Applying watermark…');
    var src = await PDFDocument.load(bytes_.slice(0), { ignoreEncryption: true });
    var font = await src.embedFont(StandardFonts.HelveticaBold);
    var color = hexToRgb01(opts.color);
    var pages_ = src.getPages();
    var target = targetPages || null;
    for (var i = 0; i < pages_.length; i++) {
      var pageNum = i + 1;
      if (target && !target[pageNum]) continue;
      if (opts.skipFirst && i === 0) continue;
      var page = pages_[i];
      var size = page.getSize();
      var w = size.width, h = size.height;
      var fontSize = opts.fontSize;
      var textWidth = font.widthOfTextAtSize(opts.text, fontSize);
      var textHeight = font.heightAtSize(fontSize);
      var x, y, rotate = 0;
      if (opts.position === 'diagonal') {
        rotate = -45;
        var rad = rotate * Math.PI / 180;
        var cx = w / 2, cy = h / 2;
        x = cx - (textWidth * Math.cos(rad) - textHeight * Math.sin(rad)) / 2;
        y = cy - (textWidth * Math.sin(rad) + textHeight * Math.cos(rad)) / 2;
      } else if (opts.position === 'top') { x = (w - textWidth) / 2; y = h - textHeight - 40; }
      else if (opts.position === 'bottom') { x = (w - textWidth) / 2; y = 40; }
      else { x = (w - textWidth) / 2; y = (h - textHeight) / 2; }
      page.drawText(opts.text, {
        x: x, y: y, size: fontSize, font: font,
        color: rgb(color.r, color.g, color.b),
        opacity: opts.opacity, rotate: degrees(rotate)
      });
    }
    var outBytes = await src.save();
    return { bytes: outBytes, pageCount: pages_.length };
  }

  async function opPageNumbers(bytes_, opts, targetPages, onProgress) {
    var L = await loadPdfLib();
    var PDFDocument = L.PDFDocument;
    var rgb = L.rgb, StandardFonts = L.StandardFonts;
    onProgress('Adding page numbers…');
    var src = await PDFDocument.load(bytes_.slice(0), { ignoreEncryption: true });
    var font = await src.embedFont(StandardFonts.Helvetica);
    var pages_ = src.getPages();
    var color = hexToRgb01(opts.color);
    var target = targetPages || null;
    var docTotal = pages_.length;
    for (var i = 0; i < pages_.length; i++) {
      var pageNum = i + 1;
      if (target && !target[pageNum]) continue;
      if (opts.skipFirst && i === 0) continue;
      var page = pages_[i];
      var size = page.getSize();
      var w = size.width, h = size.height;
      var displayNum = pageNum + opts.start - 1;
      var displayTotal = docTotal + opts.start - 1;
      var label;
      if (opts.format === 'simple') label = String(displayNum);
      else if (opts.format === 'of') label = displayNum + ' / ' + displayTotal;
      else if (opts.format === 'page') label = 'Page ' + displayNum;
      else if (opts.format === 'pageOf') label = 'Page ' + displayNum + ' of ' + displayTotal;
      else label = String(displayNum);
      var fontSize = opts.fontSize;
      var textWidth = font.widthOfTextAtSize(label, fontSize);
      var textHeight = font.heightAtSize(fontSize);
      var margin = 30;
      var x, y;
      var pos = opts.position;
      if (pos === 'bottom-center') { x = (w - textWidth) / 2; y = margin; }
      else if (pos === 'bottom-right') { x = w - textWidth - margin; y = margin; }
      else if (pos === 'bottom-left') { x = margin; y = margin; }
      else if (pos === 'top-center') { x = (w - textWidth) / 2; y = h - textHeight - margin; }
      else if (pos === 'top-right') { x = w - textWidth - margin; y = h - textHeight - margin; }
      else { x = (w - textWidth) / 2; y = margin; }
      page.drawText(label, {
        x: x, y: y, size: fontSize, font: font,
        color: rgb(color.r, color.g, color.b)
      });
    }
    var outBytes = await src.save();
    return { bytes: outBytes, pageCount: pages_.length };
  }

  async function opSignature(bytes_, sigBytes_, sigMime, opts, scope, selection, totalPages, onProgress) {
    var L = await loadPdfLib();
    var PDFDocument = L.PDFDocument;
    if (!sigBytes_) throw new Error('Upload a signature image first.');
    onProgress('Placing signature…');
    var src = await PDFDocument.load(bytes_.slice(0), { ignoreEncryption: true });

    var img;
    if (sigMime === 'image/png') {
      img = await src.embedPng(sigBytes_);
    } else if (sigMime === 'image/jpeg' || sigMime === 'image/jpg') {
      img = await src.embedJpg(sigBytes_);
    } else {
      throw new Error('Signature must be PNG or JPG.');
    }
    var one = img.scale(1);
    var natW = one.width || 200;
    var natH = one.height || 80;
    var aspect = natW / natH;
    var w = opts.width;
    var h = w / aspect;

    var pages_ = src.getPages();
    var margin = 40;

    function shouldApply(pageNum) {
      if (scope === 'all') return true;
      if (scope === 'last') return pageNum === pages_.length;
      if (scope === 'selected') return selection.indexOf(pageNum) !== -1;
      return false;
    }

    for (var i = 0; i < pages_.length; i++) {
      var pageNum = i + 1;
      if (!shouldApply(pageNum)) continue;
      var page = pages_[i];
      var size = page.getSize();
      var pw = size.width, ph = size.height;
      var x, y;
      if (opts.position === 'bottom-left') { x = margin; y = margin; }
      else if (opts.position === 'bottom-center') { x = (pw - w) / 2; y = margin; }
      else if (opts.position === 'bottom-right') { x = pw - w - margin; y = margin; }
      else if (opts.position === 'top-right') { x = pw - w - margin; y = ph - h - margin; }
      else { x = pw - w - margin; y = margin; }

      page.drawImage(img, {
        x: x, y: y, width: w, height: h,
        opacity: opts.opacity
      });
    }
    var outBytes = await src.save();
    return { bytes: outBytes, pageCount: pages_.length };
  }

  /* =====================================================================
     SPLIT — full-page continuity + optional middle-section extraction
     ===================================================================== */
  async function opSplitDocument(bytes_, name, cuts, totalPages, outputMode, onProgress) {
    var L = await loadPdfLib();
    var PDFDocument = L.PDFDocument;

    var splitPages = Object.keys(cuts).map(Number).filter(function (n) {
      return cuts[n] && typeof cuts[n].yTop === 'number';
    }).sort(function (a, b) { return a - b; });
    if (!splitPages.length) throw new Error('Set a cut line on at least one page first.');

    var splitPageNum = splitPages[0];
    var cut = cuts[splitPageNum];
    var cutTop = Math.max(0.02, Math.min(0.98, cut.yTop));
    var cutBot = cut.yBot != null ? Math.max(0.02, Math.min(0.98, cut.yBot)) : null;
    if (cutBot != null && cutBot <= cutTop + 0.02) cutBot = null;
    var hasTwoCuts = cutBot != null;

    onProgress('Loading source…');
    var src = await PDFDocument.load(bytes_.slice(0), { ignoreEncryption: true });
    var srcPages = src.getPages();
    var srcPage = srcPages[splitPageNum - 1];
    var srcSize = srcPage.getSize();
    var srcW = srcSize.width;
    var srcH = srcSize.height;

    async function copyRange(doc, startIdx, endIdx) {
      var indices = [];
      for (var i = startIdx; i <= endIdx; i++) indices.push(i);
      if (!indices.length) return;
      var copied = await doc.copyPages(src, indices);
      copied.forEach(function (p) { doc.addPage(p); });
    }

    /* Add a full-size page containing a vertical slice from the split page.
       fStart and fEnd are fractions from top (0=top of page, 1=bottom of page).
       The slice is drawn at the top of the new page; the remaining space is blank. */
    async function addSlicePage(doc, fStart, fEnd) {
      var bottom = srcH * (1 - fEnd);
      var top = srcH * (1 - fStart);
      var sliceH = top - bottom;
      if (sliceH <= 1) return;
      try {
        var embedded = await doc.embedPage(srcPage, {
          left: 0, bottom: bottom, right: srcW, top: top
        });
        var newPage = doc.addPage([srcW, srcH]);
        newPage.drawPage(embedded, {
          x: 0,
          y: srcH - sliceH,
          width: srcW,
          height: sliceH
        });
      } catch (e) {
        console.error('Slice failed:', e);
        var fallback = await doc.copyPages(src, [splitPageNum - 1]);
        fallback.forEach(function (p) { doc.addPage(p); });
      }
    }

    var baseName = shortBase(name, 25);
    var results = [];

    if (hasTwoCuts) {
      // Three parts: above cutTop, between cuts, below cutBot
      onProgress('Building part 1…');
      var docA = await PDFDocument.create();
      if (splitPageNum > 1) await copyRange(docA, 0, splitPageNum - 2);
      await addSlicePage(docA, 0, cutTop);
      results.push({ name: baseName + '-p1.pdf', bytes: await docA.save(), pages: docA.getPageCount() });

      onProgress('Building part 2 (middle section)…');
      var docB = await PDFDocument.create();
      await addSlicePage(docB, cutTop, cutBot);
      results.push({ name: baseName + '-p2.pdf', bytes: await docB.save(), pages: docB.getPageCount() });

      onProgress('Building part 3…');
      var docC = await PDFDocument.create();
      await addSlicePage(docC, cutBot, 1);
      if (splitPageNum < srcPages.length) await copyRange(docC, splitPageNum, srcPages.length - 1);
      results.push({ name: baseName + '-p3.pdf', bytes: await docC.save(), pages: docC.getPageCount() });
    } else {
      // Two parts: above cutTop, below cutTop
      onProgress('Building part 1…');
      var docA1 = await PDFDocument.create();
      if (splitPageNum > 1) await copyRange(docA1, 0, splitPageNum - 2);
      await addSlicePage(docA1, 0, cutTop);
      results.push({ name: baseName + '-p1.pdf', bytes: await docA1.save(), pages: docA1.getPageCount() });

      onProgress('Building part 2…');
      var docB1 = await PDFDocument.create();
      await addSlicePage(docB1, cutTop, 1);
      if (splitPageNum < srcPages.length) await copyRange(docB1, splitPageNum, srcPages.length - 1);
      results.push({ name: baseName + '-p2.pdf', bytes: await docB1.save(), pages: docB1.getPageCount() });
    }

    if (outputMode === 'single') {
      return {
        blob: new Blob([results[0].bytes], { type: 'application/pdf' }),
        bytes: results[0].bytes,
        pageCount: results[0].pages,
        suggestedName: results[0].name,
        isZip: false
      };
    }

    onProgress('Packaging ZIP…');
    var JSZip = await loadJsZip();
    var zip = new JSZip();
    var totalParts = 0;
    results.forEach(function (r) {
      zip.file(r.name, r.bytes);
      totalParts += r.pages;
    });
    var zipBlob = await zip.generateAsync({ type: 'blob' });
    return {
      blob: zipBlob,
      isZip: true,
      suggestedName: baseName + '-split.zip',
      partCount: results.length,
      partPages: results.map(function (r) { return r.pages; })
    };
  }

  /* =====================================================================
     INIT
     ===================================================================== */
  function init(root) {
    if (!root || root.dataset.ppReady === '1') return;
    root.dataset.ppReady = '1';

    function q(s) { try { return root.querySelector(s); } catch (_) { return null; } }
    function qa(s) { try { return Array.prototype.slice.call(root.querySelectorAll(s)); } catch (_) { return []; } }

    var dropEl       = q('.pp-drop');
    var fileInput    = q('.pp-file');
    var filelistEl   = q('.pp-filelist');
    var filelistBody = q('.pp-filelist-body');
    var fileCountEl  = q('.pp-filelist-head .count');
    var clearAllBtn  = q('.pp-filelist-head .clear-all');
    var fileNote     = q('.pp-file-note');

    var pagesCard    = q('.pp-pages-card');
    var pagesGrid    = q('.pp-pages');
    var pagesFile    = q('.pp-pages-file b');
    var pagesCountEl = q('.pp-pages-count');
    var rangeInput   = q('.pp-pages-range input');
    var rangeAddBtn  = q('.pp-pages-range button');
    var selectAllBtn = q('.pp-pages-select-all');
    var deselectBtn  = q('.pp-pages-deselect-all');
    var invertBtn    = q('.pp-pages-invert');

    var modeButtons = qa('.pp-mode');
    var panels = {
      merge:     q('.pp-settings[data-mode="merge"]'),
      keep:      q('.pp-settings[data-mode="keep"]'),
      delete:    q('.pp-settings[data-mode="delete"]'),
      split:     q('.pp-settings[data-mode="split"]'),
      rotate:    q('.pp-settings[data-mode="rotate"]'),
      watermark: q('.pp-settings[data-mode="watermark"]'),
      numbers:   q('.pp-settings[data-mode="numbers"]'),
      signature: q('.pp-settings[data-mode="signature"]')
    };

    var runBtn       = q('.pp-run');
    var progressEl   = q('.pp-progress');
    var progressText = progressEl ? progressEl.querySelector('.pp-progress-text') : null;

    var workCard     = q('.pp-work-card');
    var historyEl    = q('.pp-history');
    var workNameEl   = q('.pp-work-name');
    var workPagesEl  = q('.pp-work-pages');
    var workSizeEl   = q('.pp-work-size');
    var workNoteEl   = q('.pp-work-note');
    var downloadBtn  = q('.pp-download');
    var resetBtn     = q('.pp-reset');

    /* Signature refs */
    var sigInput     = q('.pp-sig-file');
    var sigPreview   = q('.pp-sig-preview');
    var sigPreviewImg= q('.pp-sig-preview-img');
    var sigClearBtn  = q('.pp-sig-clear');

    var state = {
      mode: 'merge',
      files: [],
      pdfDoc: null,
      selection: new Set(),
      lastAnchor: null,
      cuts: {},               // { pageNum: { yTop, yBot } }
      workingBytes: null,
      workingName: 'document',
      workingPageCount: 0,
      workingPackage: null,
      originalBytes: null,
      originalName: 'document',
      originalPageCount: 0,
      history: [],
      signatureBytes: null,
      signatureMime: null
    };

    function showProgress(show) { if (progressEl) progressEl.hidden = !show; }
    function setProgress(t) { if (progressText) progressText.textContent = t; }

    function updateRunButton() {
      if (!runBtn) return;
      var blocked = !!state.workingPackage;
      runBtn.disabled = state.files.length === 0 || blocked;
    }

    function firstFile() { return state.files[0] || null; }

    /* =====================================================================
       WORKING DOCUMENT PANEL
       ===================================================================== */
    function updateWorkPanel() {
      if (!workCard) return;
      if (!state.workingBytes && !state.workingPackage) {
        workCard.hidden = true;
        return;
      }
      workCard.hidden = false;
      workCard.classList.toggle('is-package', !!state.workingPackage);

      if (state.workingPackage) {
        if (workNameEl) workNameEl.textContent = state.workingPackage.filename;
        if (workPagesEl) workPagesEl.textContent = state.workingPackage.description;
        if (workSizeEl) workSizeEl.textContent = bytes(state.workingPackage.blob.size);
        if (downloadBtn) downloadBtn.textContent = state.workingPackage.isZip ? 'Download ZIP' : 'Download PDF';
        if (workNoteEl) workNoteEl.textContent = 'Split produces a downloadable package. Click Reset to continue editing.';
      } else {
        if (workNameEl) workNameEl.textContent = state.workingName + '.pdf';
        if (workPagesEl) workPagesEl.textContent = state.workingPageCount + ' page' + (state.workingPageCount === 1 ? '' : 's');
        if (workSizeEl) workSizeEl.textContent = bytes(state.workingBytes.length);
        if (downloadBtn) downloadBtn.textContent = 'Download final PDF';
        if (workNoteEl) workNoteEl.textContent = 'Every operation you apply is added to this document. Download when you are done.';
      }

      var countEl = q('.pp-work-count');
      if (countEl) countEl.textContent = String(state.history.length);

      renderHistory();
      if (resetBtn) resetBtn.disabled = state.history.length === 0;
      updateRunButton();
    }

    function renderHistory() {
      if (!historyEl) return;
      if (state.history.length === 0) {
        historyEl.innerHTML = '<span class="pp-history-empty">No operations applied yet — the working document is the original.</span>';
        return;
      }
      var html = '';
      state.history.forEach(function (op, idx) {
        html += '<span class="pp-history-chip"><span class="num">' + (idx + 1) + '</span>' +
                (op.icon ? op.icon + ' ' : '') + op.label + '</span>';
      });
      historyEl.innerHTML = html;
    }

    /* =====================================================================
       FILE HANDLING
       ===================================================================== */
    async function readFileBytes(item) {
      if (item.bytes) return item.bytes;
      try {
        var buf = await item.file.arrayBuffer();
        item.bytes = new Uint8Array(buf);
        return item.bytes;
      } catch (_) { return null; }
    }

    async function loadFileAndBecomeWorking(item) {
      var bytes_ = await readFileBytes(item);
      if (!bytes_) return;
      try {
        var pdfjsLib = await loadPdfJs();
        var pdf = await pdfjsLib.getDocument({ data: bytes_.slice(0) }).promise;
        item.pageCount = pdf.numPages;
        state.pdfDoc = pdf;

        state.workingBytes = bytes_;
        state.workingName = shortBase(item.name, 30);
        state.workingPageCount = pdf.numPages;
        state.workingPackage = null;
        state.originalBytes = bytes_;
        state.originalName = shortBase(item.name, 30);
        state.originalPageCount = pdf.numPages;
        state.history = [];
        state.cuts = {};

        renderFileList();
        renderThumbnails();
        updateWorkPanel();
        updatePagesCardVisibility();
      } catch (_) { item.pageCount = null; }
    }

    async function refreshWorkingThumbs() {
      if (!state.workingBytes) return;
      try {
        var pdfjsLib = await loadPdfJs();
        var pdf = await pdfjsLib.getDocument({ data: state.workingBytes.slice(0) }).promise;
        state.pdfDoc = pdf;
        state.workingPageCount = pdf.numPages;
        renderThumbnails();
        updateWorkPanel();
      } catch (e) {
        console.error('Refresh thumbs failed:', e);
      }
    }

    function addFiles(files) {
      var accepted = [];
      var rejected = [];
      files.forEach(function (f) {
        if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
          rejected.push(f.name + ' (not a PDF)'); return;
        }
        var dup = state.files.some(function (x) { return x.name === f.name && x.size === f.size; });
        if (dup) { rejected.push(f.name + ' (already added)'); return; }
        accepted.push({ file: f, name: f.name, size: f.size, pageCount: null, bytes: null });
      });
      var wasEmpty = state.files.length === 0;
      state.files = state.files.concat(accepted);
      if (rejected.length && window.console && console.warn) {
        console.warn('[PDF Private] Skipped:', rejected);
      }
      renderFileList();
      updateRunButton();
      updatePagesCardVisibility();
      if (wasEmpty && accepted[0]) {
        loadFileAndBecomeWorking(accepted[0]);
      } else {
        accepted.forEach(async function (item) {
          var bytes_ = await readFileBytes(item);
          if (!bytes_) return;
          try {
            var pdfjsLib = await loadPdfJs();
            var pdf = await pdfjsLib.getDocument({ data: bytes_.slice(0) }).promise;
            item.pageCount = pdf.numPages;
            renderFileList();
          } catch (_) {}
        });
      }
    }

    function renderFileList() {
      if (!filelistEl || !filelistBody) return;
      if (state.files.length === 0) {
        filelistEl.hidden = true;
        if (fileNote) fileNote.classList.remove('visible');
        return;
      }
      filelistEl.hidden = false;
      if (fileCountEl) fileCountEl.textContent = state.files.length + ' file' + (state.files.length === 1 ? '' : 's');
      if (fileNote) {
        if (state.mode !== 'merge' && state.files.length > 1) {
          fileNote.textContent = 'Note: only the first file is used in ' + state.mode + ' mode.';
          fileNote.classList.add('visible');
        } else {
          fileNote.classList.remove('visible');
        }
      }
      filelistBody.innerHTML = '';
      state.files.forEach(function (item, idx) {
        var row = document.createElement('div');
        row.className = 'pp-file-item';
        var icon = document.createElement('div');
        icon.className = 'pp-file-icon';
        icon.textContent = '📄';
        row.appendChild(icon);
        var meta = document.createElement('div');
        meta.className = 'pp-file-meta';
        var name = document.createElement('b');
        name.textContent = item.name;
        meta.appendChild(name);
        var sub = document.createElement('span');
        var pageInfo = item.pageCount != null ? (item.pageCount + ' page' + (item.pageCount === 1 ? '' : 's') + ' · ') : '';
        sub.textContent = pageInfo + bytes(item.size);
        meta.appendChild(sub);
        row.appendChild(meta);

        if (state.mode === 'merge') {
          var upBtn = document.createElement('button');
          upBtn.type = 'button';
          upBtn.className = 'pp-file-btn';
          upBtn.title = 'Move up';
          upBtn.textContent = '▲';
          upBtn.disabled = idx === 0;
          upBtn.addEventListener('click', function () {
            if (idx === 0) return;
            var t = state.files[idx - 1];
            state.files[idx - 1] = state.files[idx];
            state.files[idx] = t;
            renderFileList();
          });
          row.appendChild(upBtn);
          var downBtn = document.createElement('button');
          downBtn.type = 'button';
          downBtn.className = 'pp-file-btn';
          downBtn.title = 'Move down';
          downBtn.textContent = '▼';
          downBtn.disabled = idx === state.files.length - 1;
          downBtn.addEventListener('click', function () {
            if (idx === state.files.length - 1) return;
            var t = state.files[idx + 1];
            state.files[idx + 1] = state.files[idx];
            state.files[idx] = t;
            renderFileList();
          });
          row.appendChild(downBtn);
        }

        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'pp-file-btn remove';
        rm.title = 'Remove';
        rm.textContent = '✕';
        rm.addEventListener('click', function () {
          var wasFirst = idx === 0;
          state.files.splice(idx, 1);
          if (wasFirst) {
            state.pdfDoc = null;
            state.selection.clear();
            state.cuts = {};
            state.workingBytes = null;
            state.workingPackage = null;
            state.originalBytes = null;
            state.history = [];
            if (state.files[0]) loadFileAndBecomeWorking(state.files[0]);
            else {
              renderThumbnails();
              updateWorkPanel();
            }
          }
          renderFileList(); updateRunButton(); updatePagesCardVisibility();
        });
        row.appendChild(rm);
        filelistBody.appendChild(row);
      });
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
        if (files.length) addFiles(Array.prototype.slice.call(files));
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
        state.pdfDoc = null;
        state.selection.clear();
        state.cuts = {};
        state.workingBytes = null;
        state.workingPackage = null;
        state.originalBytes = null;
        state.history = [];
        state.lastAnchor = null;
        renderFileList();
        renderThumbnails();
        updateWorkPanel();
        updateRunButton();
        updatePagesCardVisibility();
      });
    }

    /* =====================================================================
       SIGNATURE FILE HANDLING
       ===================================================================== */
    if (sigInput) {
      sigInput.addEventListener('change', async function () {
        if (!sigInput.files || !sigInput.files[0]) return;
        var f = sigInput.files[0];
        if (f.type !== 'image/png' && f.type !== 'image/jpeg') {
          alert('Signature must be PNG or JPG.');
          sigInput.value = '';
          return;
        }
        try {
          var buf = await f.arrayBuffer();
          state.signatureBytes = new Uint8Array(buf);
          state.signatureMime = f.type;
          if (sigPreviewImg) sigPreviewImg.src = URL.createObjectURL(f);
          if (sigPreview) sigPreview.hidden = false;
        } catch (_) { alert('Could not read signature image.'); }
      });
    }
    if (sigClearBtn) {
      sigClearBtn.addEventListener('click', function () {
        state.signatureBytes = null;
        state.signatureMime = null;
        if (sigInput) sigInput.value = '';
        if (sigPreview) sigPreview.hidden = true;
      });
    }

    /* =====================================================================
       THUMBNAILS
       ===================================================================== */
    function updatePagesCardVisibility() {
      if (!pagesCard) return;
      if (state.mode === 'merge' || !state.files.length) {
        pagesCard.hidden = true;
      } else {
        pagesCard.hidden = false;
      }
    }

    function renderThumbnails() {
      if (!pagesGrid) return;
      pagesGrid.innerHTML = '';
      if (!state.pdfDoc) {
        pagesGrid.innerHTML = '<div class="pp-pages-empty">Load a PDF to see its pages here.</div>';
        if (pagesFile) pagesFile.textContent = '—';
        updateSelectionCount(); updatePagesCardVisibility();
        return;
      }
      if (pagesFile && state.files[0]) pagesFile.textContent = state.files[0].name;
      var total = state.pdfDoc.numPages;
      state.selection.clear();
      state.lastAnchor = null;

      for (var i = 1; i <= total; i++) {
        var card = document.createElement('div');
        card.className = 'pp-page';
        card.dataset.page = String(i);
        card.setAttribute('role', 'checkbox');
        card.setAttribute('aria-checked', 'false');
        card.setAttribute('aria-label', 'Page ' + i);
        card.tabIndex = 0;

        var check = document.createElement('div');
        check.className = 'pp-page-check';
        check.textContent = '✓';
        card.appendChild(check);

        var canvasWrap = document.createElement('div');
        canvasWrap.className = 'pp-page-canvas';
        canvasWrap.innerHTML = '<div class="pp-thumb-loading">…</div>';
        card.appendChild(canvasWrap);

        var num = document.createElement('div');
        num.className = 'pp-page-num';
        num.textContent = 'Page ' + i;
        card.appendChild(num);

        var cutEl = document.createElement('div');
        cutEl.className = 'pp-page-cut';
        cutEl.style.display = 'none';
        card.appendChild(cutEl);

        (function (pn, c) {
          c.addEventListener('click', function (e) {
            if (state.mode === 'split') {
              e.preventDefault(); e.stopPropagation();
              openEditor(pn);
              return;
            }
            onPageClick(pn, e);
          });
          c.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (state.mode === 'split') openEditor(pn);
              else onPageClick(pn, { shiftKey: false, ctrlKey: false, metaKey: false });
            }
          });
        })(i, card);

        pagesGrid.appendChild(card);
      }

      updateSelectionCount();
      updateCutMarkers();
      renderAllThumbsSequentially();
    }

    async function renderAllThumbsSequentially() {
      if (!pagesGrid || !state.pdfDoc) return;
      var cards = Array.prototype.slice.call(pagesGrid.querySelectorAll('.pp-page'));
      var pdf = state.pdfDoc;
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (card.dataset.rendered === '1') continue;
        try { await renderOneThumb(card, pdf); } catch (_) {}
        if (i % 3 === 2) await new Promise(function (r) { setTimeout(r, 0); });
      }
    }

    function renderOneThumb(card, pdf) {
      return new Promise(function (resolve, reject) {
        var pageNum = parseInt(card.dataset.page, 10);
        pdf.getPage(pageNum).then(function (page) {
          var viewport = page.getViewport({ scale: 0.5 });
          var canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          var ctx = canvas.getContext('2d');
          page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
            var wrap = card.querySelector('.pp-page-canvas');
            if (wrap) { wrap.innerHTML = ''; wrap.appendChild(canvas); }
            card.dataset.rendered = '1';
            resolve();
          }).catch(reject);
        }).catch(reject);
      });
    }

    function onPageClick(pageNum, event) {
      if (event && event.shiftKey && state.lastAnchor !== null) {
        var a = Math.min(state.lastAnchor, pageNum);
        var b = Math.max(state.lastAnchor, pageNum);
        for (var i = a; i <= b; i++) state.selection.add(i);
      } else if (event && (event.ctrlKey || event.metaKey)) {
        if (state.selection.has(pageNum)) state.selection.delete(pageNum);
        else state.selection.add(pageNum);
        state.lastAnchor = pageNum;
      } else {
        var wasOnlySelected = state.selection.has(pageNum) && state.selection.size === 1;
        state.selection.clear();
        if (!wasOnlySelected) state.selection.add(pageNum);
        state.lastAnchor = pageNum;
      }
      updateSelectionUI();
    }

    function updateSelectionUI() {
      if (!pagesGrid) return;
      var cards = pagesGrid.querySelectorAll('.pp-page');
      Array.prototype.forEach.call(cards, function (card) {
        var pn = parseInt(card.dataset.page, 10);
        var on = state.selection.has(pn);
        card.classList.toggle('is-selected', on);
        card.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      updateSelectionCount();
    }

    function updateSelectionCount() {
      if (!pagesCountEl) return;
      var total = state.pdfDoc ? state.pdfDoc.numPages : 0;
      pagesCountEl.innerHTML = '<b>' + state.selection.size + '</b> of ' + total + ' page' + (total === 1 ? '' : 's') + ' selected';
    }

    function updateCutMarkers() {
      if (!pagesGrid) return;
      var cards = pagesGrid.querySelectorAll('.pp-page');
      Array.prototype.forEach.call(cards, function (card) {
        var pn = parseInt(card.dataset.page, 10);
        var cut = state.cuts[pn];
        var cutEl = card.querySelector('.pp-page-cut');
        if (!cutEl) return;
        if (cut && typeof cut.yTop === 'number') {
          card.classList.add('has-cut');
          cutEl.style.display = 'block';
          cutEl.style.top = (cut.yTop * 100) + '%';
          var existingLabel = card.querySelector('.pp-page-cut-label');
          if (!existingLabel) {
            var label = document.createElement('div');
            label.className = 'pp-page-cut-label';
            label.textContent = cut.yBot != null ? '2 CUTS' : 'CUT';
            card.appendChild(label);
          } else {
            existingLabel.textContent = cut.yBot != null ? '2 CUTS' : 'CUT';
          }
        } else {
          card.classList.remove('has-cut');
          cutEl.style.display = 'none';
          var lbl = card.querySelector('.pp-page-cut-label');
          if (lbl) lbl.remove();
        }
      });
    }

    if (selectAllBtn) selectAllBtn.addEventListener('click', function () {
      if (!state.pdfDoc) return;
      for (var i = 1; i <= state.pdfDoc.numPages; i++) state.selection.add(i);
      updateSelectionUI();
    });
    if (deselectBtn) deselectBtn.addEventListener('click', function () {
      state.selection.clear(); state.lastAnchor = null; updateSelectionUI();
    });
    if (invertBtn) invertBtn.addEventListener('click', function () {
      if (!state.pdfDoc) return;
      var next = new Set();
      for (var i = 1; i <= state.pdfDoc.numPages; i++) {
        if (!state.selection.has(i)) next.add(i);
      }
      state.selection = next;
      updateSelectionUI();
    });
    if (rangeAddBtn && rangeInput) {
      rangeAddBtn.addEventListener('click', function () {
        if (!state.pdfDoc) return;
        var nums = parseRanges(rangeInput.value, state.pdfDoc.numPages);
        if (!nums.length) return;
        nums.forEach(function (n) { state.selection.add(n); });
        rangeInput.value = '';
        updateSelectionUI();
      });
      rangeInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); rangeAddBtn.click(); }
      });
    }

    /* =====================================================================
       EDITOR OVERLAY — supports one or two cuts
       ===================================================================== */
    var editorOverlay = null;
    var editorCanvas = null;
    var editorCutTop = null;
    var editorCutBot = null;
    var editorPageNum = 0;
    var editorCutTopFrac = 0.5;
    var editorCutBotFrac = 0.8;
    var editorTwoCutMode = false;

    function ensureEditor() {
      if (editorOverlay) return;
      editorOverlay = document.createElement('div');
      editorOverlay.className = 'pp-editor-overlay';
      editorOverlay.innerHTML =
        '<div class="pp-editor-panel">' +
          '<div class="pp-editor-head">' +
            '<div>' +
              '<h3 id="pp-editor-title">Set cut line</h3>' +
              '<p>Click anywhere on the page to place the cut. Drag a line to adjust. With one cut you get <strong>part 1</strong> (above) and <strong>part 2</strong> (below). With two cuts you get <strong>part 1</strong>, a <strong>middle section</strong>, and <strong>part 3</strong>.</p>' +
            '</div>' +
            '<button type="button" class="pp-editor-close" aria-label="Close">✕</button>' +
          '</div>' +
          '<div class="pp-editor-stage-wrap">' +
            '<div class="pp-editor-stage">' +
              '<canvas></canvas>' +
              '<div class="pp-editor-cut pp-editor-cut-top" style="top:50%">' +
                '<span class="pp-editor-cut-label">Top cut</span>' +
              '</div>' +
              '<div class="pp-editor-cut pp-editor-cut-bot" style="top:80%">' +
                '<span class="pp-editor-cut-label">Bottom cut</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="pp-editor-actions">' +
            '<button type="button" class="pp-editor-btn pp-editor-toggle-cuts">Add second cut (extract middle section)</button>' +
            '<button type="button" class="pp-editor-btn danger pp-editor-clear">Clear cuts</button>' +
            '<button type="button" class="pp-editor-btn pp-editor-cancel">Cancel</button>' +
            '<button type="button" class="pp-editor-btn primary pp-editor-save">Save</button>' +
          '</div>' +
        '</div>';
      root.appendChild(editorOverlay);

      editorCanvas = editorOverlay.querySelector('canvas');
      editorCutTop = editorOverlay.querySelector('.pp-editor-cut-top');
      editorCutBot = editorOverlay.querySelector('.pp-editor-cut-bot');

      editorOverlay.querySelector('.pp-editor-close').addEventListener('click', closeEditor);
      editorOverlay.querySelector('.pp-editor-cancel').addEventListener('click', closeEditor);
      editorOverlay.querySelector('.pp-editor-save').addEventListener('click', function () {
        state.cuts[editorPageNum] = {
          yTop: editorCutTopFrac,
          yBot: editorTwoCutMode ? editorCutBotFrac : null
        };
        closeEditor();
        updateCutMarkers();
        updateSplitStatus();
      });
      editorOverlay.querySelector('.pp-editor-clear').addEventListener('click', function () {
        delete state.cuts[editorPageNum];
        closeEditor();
        updateCutMarkers();
        updateSplitStatus();
      });
      editorOverlay.querySelector('.pp-editor-toggle-cuts').addEventListener('click', function () {
        editorTwoCutMode = !editorTwoCutMode;
        updateEditorMode();
      });
      editorOverlay.addEventListener('click', function (e) {
        if (e.target === editorOverlay) closeEditor();
      });

      var stage = editorOverlay.querySelector('.pp-editor-stage');
      stage.addEventListener('click', function (e) {
        if (editorCutTop.contains(e.target) || editorCutBot.contains(e.target)) return;
        placeCutAtEvent(e, 'top');
      });

      var dragging = null;
      function onDragStart(which) {
        return function (e) {
          dragging = which;
          e.preventDefault();
          e.stopPropagation();
        };
      }
      function onDragMove(e) {
        if (!dragging) return;
        e.preventDefault();
        var clientY = (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY);
        var rect = editorCanvas.getBoundingClientRect();
        if (rect.height === 0) return;
        var frac = (clientY - rect.top) / rect.height;
        frac = Math.max(0.02, Math.min(0.98, frac));
        if (dragging === 'top') {
          // Keep below the bottom cut if two-cut mode
          var limit = editorTwoCutMode ? editorCutBotFrac - 0.02 : 1;
          editorCutTopFrac = Math.min(frac, limit);
          editorCutTop.style.top = (editorCutTopFrac * 100) + '%';
        } else {
          // Keep above the top cut
          editorCutBotFrac = Math.max(frac, editorCutTopFrac + 0.02);
          editorCutBot.style.top = (editorCutBotFrac * 100) + '%';
        }
      }
      function onDragEnd() { dragging = null; }

      editorCutTop.addEventListener('mousedown', onDragStart('top'));
      editorCutTop.addEventListener('touchstart', onDragStart('top'), { passive: false });
      editorCutBot.addEventListener('mousedown', onDragStart('bot'));
      editorCutBot.addEventListener('touchstart', onDragStart('bot'), { passive: false });
      window.addEventListener('mousemove', onDragMove);
      window.addEventListener('touchmove', onDragMove, { passive: false });
      window.addEventListener('mouseup', onDragEnd);
      window.addEventListener('touchend', onDragEnd);

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && editorOverlay && editorOverlay.classList.contains('is-open')) {
          closeEditor();
        }
      });
    }

    function updateEditorMode() {
      if (!editorOverlay) return;
      editorOverlay.classList.toggle('is-two-cut', editorTwoCutMode);
      var btn = editorOverlay.querySelector('.pp-editor-toggle-cuts');
      if (btn) {
        btn.textContent = editorTwoCutMode ? 'Remove second cut' : 'Add second cut (extract middle section)';
      }
    }

    function placeCutAtEvent(e, which) {
      var clientY = (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY);
      var rect = editorCanvas.getBoundingClientRect();
      if (rect.height === 0) return;
      var frac = (clientY - rect.top) / rect.height;
      frac = Math.max(0.02, Math.min(0.98, frac));
      if (which === 'top') {
        var limit = editorTwoCutMode ? editorCutBotFrac - 0.02 : 1;
        editorCutTopFrac = Math.min(frac, limit);
        editorCutTop.style.top = (editorCutTopFrac * 100) + '%';
      } else {
        editorCutBotFrac = Math.max(frac, editorCutTopFrac + 0.02);
        editorCutBot.style.top = (editorCutBotFrac * 100) + '%';
      }
    }

    async function openEditor(pageNum) {
      if (!state.pdfDoc) return;
      ensureEditor();
      editorPageNum = pageNum;

      var existing = state.cuts[pageNum];
      editorCutTopFrac = existing && typeof existing.yTop === 'number' ? existing.yTop : 0.5;
      editorCutBotFrac = existing && typeof existing.yBot === 'number' ? existing.yBot : 0.8;
      editorTwoCutMode = existing && existing.yBot != null;
      updateEditorMode();
      editorCutTop.style.top = (editorCutTopFrac * 100) + '%';
      editorCutBot.style.top = (editorCutBotFrac * 100) + '%';

      var titleEl = editorOverlay.querySelector('#pp-editor-title');
      if (titleEl) titleEl.textContent = 'Set cut line on page ' + pageNum;

      editorOverlay.classList.add('is-open');

      try {
        var page = await state.pdfDoc.getPage(pageNum);
        var viewport = page.getViewport({ scale: 1.5 });
        editorCanvas.width = viewport.width;
        editorCanvas.height = viewport.height;
        var ctx = editorCanvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      } catch (e) {
        console.error('Editor render failed:', e);
      }
    }

    function closeEditor() {
      if (!editorOverlay) return;
      editorOverlay.classList.remove('is-open');
    }

    function updateSplitStatus() {
      var statusEl = q('.pp-split-status');
      if (!statusEl) return;
      var pages = Object.keys(state.cuts);
      if (!pages.length) {
        statusEl.textContent = 'No cut line set yet. Click a page above to place one.';
        statusEl.style.color = 'var(--pp-muted)';
        return;
      }
      var pageNum = pages[0];
      var cut = state.cuts[pageNum];
      var topPct = Math.round(cut.yTop * 100);
      if (cut.yBot != null) {
        var botPct = Math.round(cut.yBot * 100);
        statusEl.innerHTML = 'Two cuts on <b>page ' + pageNum + '</b> at <b>' + topPct + '%</b> and <b>' + botPct + '%</b>. ' +
          'Produces <b>part 1</b> (above the top cut), a <b>middle section</b> between the cuts, and <b>part 3</b> (below the bottom cut).';
      } else {
        statusEl.innerHTML = 'One cut on <b>page ' + pageNum + '</b> at <b>' + topPct + '%</b> from the top. ' +
          'Everything above becomes <b>part 1</b>; everything below becomes <b>part 2</b>.';
      }
      statusEl.style.color = 'var(--pp-text-2)';
    }

    /* =====================================================================
       MODE SWITCHING
       ===================================================================== */
    function setMode(mode) {
      state.mode = mode;
      modeButtons.forEach(function (b) { b.classList.toggle('is-active', b.dataset.mode === mode); });
      Object.keys(panels).forEach(function (k) {
        if (panels[k]) panels[k].classList.toggle('is-active', k === mode);
      });
      renderFileList();
      updatePagesCardVisibility();
      updateRunButton();
      if (mode === 'split') updateSplitStatus();
    }
    modeButtons.forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.dataset.mode); });
    });

    function bindSeg(container) {
      var buttons = qa(container + ' button');
      buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          buttons.forEach(function (b) { b.classList.toggle('is-active', b === btn); });
        });
      });
    }
    bindSeg('[data-mode="rotate"] .pp-seg-angle');
    bindSeg('[data-mode="rotate"] .pp-seg-scope');
    bindSeg('[data-mode="watermark"] .pp-seg-scope');
    bindSeg('[data-mode="watermark"] .pp-seg-pos');
    bindSeg('[data-mode="numbers"] .pp-seg-scope');
    bindSeg('[data-mode="numbers"] .pp-seg-format');
    bindSeg('[data-mode="numbers"] .pp-seg-numpos');
    bindSeg('[data-mode="split"] .pp-seg-output');
    bindSeg('[data-mode="signature"] .pp-seg-sig-pos');
    bindSeg('[data-mode="signature"] .pp-seg-sig-scope');

    function getSegValue(sel) {
      var el = root.querySelector(sel);
      if (!el) return null;
      var active = el.querySelector('button.is-active');
      return active ? active.dataset.value : null;
    }

    /* =====================================================================
       RUN
       ===================================================================== */
    if (runBtn) runBtn.addEventListener('click', run);

    function selectionAsArray() {
      return Array.from(state.selection).sort(function (a, b) { return a - b; });
    }
    function buildTargetSet(scope) {
      if (scope === 'selected') {
        var arr = selectionAsArray();
        if (!arr.length) throw new Error('No pages selected.');
        var set = {};
        arr.forEach(function (p) { set[p] = true; });
        return set;
      }
      return null;
    }

    var MODE_META = {
      merge:     { icon: '🔗', label: 'Merge' },
      keep:      { icon: '📌', label: 'Keep selected' },
      delete:    { icon: '🗑️', label: 'Delete selected' },
      rotate:    { icon: '🔄', label: 'Rotate' },
      watermark: { icon: '💧', label: 'Watermark' },
      numbers:   { icon: '#', label: 'Page numbers' },
      split:     { icon: '✂️', label: 'Split' },
      signature: { icon: '✍️', label: 'Signature' }
    };

    async function run() {
      if (!state.files.length) return;
      runBtn.disabled = true;
      showProgress(true);
      setProgress('Preparing…');

      try {
        var result = null;

        if (state.mode === 'merge') {
          if (state.files.length === 0) throw new Error('No files to merge.');
          var items = [];
          for (var fi = 0; fi < state.files.length; fi++) {
            var f = state.files[fi];
            var b = await readFileBytes(f);
            if (!b) throw new Error('Could not read ' + f.name);
            items.push({ bytes: b, name: f.name });
          }
          result = await opMerge(items, setProgress);
        } else {
          if (!state.workingBytes) throw new Error('No working document loaded.');
          if (state.workingPageCount == null) throw new Error('Page count not yet loaded.');

          if (state.mode === 'keep') {
            result = await opKeepSelected(state.workingBytes, state.workingPageCount, selectionAsArray(), setProgress);
          } else if (state.mode === 'delete') {
            result = await opDeleteSelected(state.workingBytes, state.workingPageCount, selectionAsArray(), setProgress);
          } else if (state.mode === 'split') {
            var outputMode = getSegValue('[data-mode="split"] .pp-seg-output') || 'zip';
            var splitResult = await opSplitDocument(
              state.workingBytes,
              state.workingName,
              state.cuts,
              state.workingPageCount,
              outputMode,
              setProgress
            );
            // Store as package — do NOT auto-download
            var desc;
            if (splitResult.isZip) {
              desc = splitResult.partCount + ' PDFs · ' + splitResult.partPages.join(' + ') + ' pages';
            } else {
              desc = '1 PDF · ' + splitResult.pageCount + ' pages';
            }
            state.workingPackage = {
              blob: splitResult.blob,
              filename: splitResult.suggestedName,
              isZip: !!splitResult.isZip,
              description: desc
            };
            state.workingBytes = null;
            state.workingPageCount = 0;

            var splitMeta = MODE_META[state.mode] || { icon: '', label: 'Split' };
            state.history.push({ icon: splitMeta.icon, label: splitMeta.label });

            updateWorkPanel();
            if (workCard) {
              try { workCard.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
            }
            return;
          } else if (state.mode === 'rotate') {
            var angle = parseInt(getSegValue('[data-mode="rotate"] .pp-seg-angle') || '90', 10);
            var scope = getSegValue('[data-mode="rotate"] .pp-seg-scope') || 'all';
            result = await opRotate(state.workingBytes, angle, buildTargetSet(scope), setProgress);
          } else if (state.mode === 'watermark') {
            var scopeW = getSegValue('[data-mode="watermark"] .pp-seg-scope') || 'all';
            result = await opWatermark(state.workingBytes, {
              text: (q('.pp-wm-text') || {}).value || 'CONFIDENTIAL',
              position: getSegValue('[data-mode="watermark"] .pp-seg-pos') || 'diagonal',
              fontSize: parseInt((q('.pp-wm-size') || {}).value || '60', 10),
              opacity: parseFloat((q('.pp-wm-opacity') || {}).value || '0.15'),
              color: (q('.pp-wm-color') || {}).value || '#9c2525',
              skipFirst: !!(q('.pp-wm-skip') || {}).checked
            }, buildTargetSet(scopeW), setProgress);
          } else if (state.mode === 'numbers') {
            var scopeN = getSegValue('[data-mode="numbers"] .pp-seg-scope') || 'all';
            result = await opPageNumbers(state.workingBytes, {
              format: getSegValue('[data-mode="numbers"] .pp-seg-format') || 'simple',
              position: getSegValue('[data-mode="numbers"] .pp-seg-numpos') || 'bottom-center',
              start: parseInt((q('.pp-num-start') || {}).value || '1', 10),
              fontSize: parseInt((q('.pp-num-size') || {}).value || '11', 10),
              color: (q('.pp-num-color') || {}).value || '#0d1220',
              skipFirst: !!(q('.pp-num-skip') || {}).checked
            }, buildTargetSet(scopeN), setProgress);
          } else if (state.mode === 'signature') {
            if (!state.signatureBytes) throw new Error('Upload a signature image first.');
            var sigScope = getSegValue('[data-mode="signature"] .pp-seg-sig-scope') || 'last';
            var sigPos = getSegValue('[data-mode="signature"] .pp-seg-sig-pos') || 'bottom-right';
            var sigW = parseInt((q('.pp-sig-width') || {}).value || '120', 10);
            var sigOpacity = parseFloat((q('.pp-sig-opacity') || {}).value || '1');
            result = await opSignature(
              state.workingBytes,
              state.signatureBytes,
              state.signatureMime,
              { width: sigW, position: sigPos, opacity: sigOpacity },
              sigScope,
              selectionAsArray(),
              state.workingPageCount,
              setProgress
            );
          }
        }

        if (!result || !result.bytes) throw new Error('Operation produced no output.');

        state.workingBytes = result.bytes;
        state.workingPageCount = result.pageCount;
        var meta = MODE_META[state.mode] || { icon: '', label: state.mode };
        state.history.push({ icon: meta.icon, label: meta.label });

        await refreshWorkingThumbs();

        if (workCard) {
          try { workCard.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
        }
      } catch (e) {
        console.error(e);
        alert('Something went wrong: ' + (e.message || e));
      } finally {
        showProgress(false);
        updateRunButton();
      }
    }

    /* =====================================================================
       DOWNLOAD / RESET
       ===================================================================== */
    if (downloadBtn) downloadBtn.addEventListener('click', function () {
      if (state.workingPackage) {
        downloadBlob(state.workingPackage.blob, state.workingPackage.filename);
        return;
      }
      if (!state.workingBytes) return;
      var suffix = state.history.length > 0 ? '-edited' : '';
      var name = shortBase(state.workingName, 30) + suffix + '.pdf';
      var blob = new Blob([state.workingBytes], { type: 'application/pdf' });
      downloadBlob(blob, name);
    });

    if (resetBtn) resetBtn.addEventListener('click', function () {
      if (!state.originalBytes) return;
      state.workingBytes = state.originalBytes;
      state.workingPageCount = state.originalPageCount;
      state.workingPackage = null;
      state.history = [];
      state.cuts = {};
      refreshWorkingThumbs();
      updateWorkPanel();
    });

    setMode('merge');
    updateRunButton();
    updatePagesCardVisibility();
    updateWorkPanel();
  }

  function boot() {
    try { document.querySelectorAll('#autonom-pdf-private').forEach(init); }
    catch (e) { console.error('[Autonom PDF Private] Boot failed:', e); }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
