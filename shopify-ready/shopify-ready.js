/**
 * Autonom Shopify Ready — v1.0
 * Local-first Shopify CSV validator with safe auto-fixes.
 * No file content ever leaves the browser.
 */
(function () {
  'use strict';

  var PAPAPARSE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js';
  var MAX_ROWS_SOFT = 50000; // show a warning past this

  /* ---------- FIX GUIDES ---------- */
  var FIXES = {
    'price_format':       "Shopify requires plain numbers in the Variant Price column. Symbols like $, €, and thousand separators (1,299.00) will cause the import to fail. We stripped them for you.",
    'empty_handle':       "Every product needs a URL-safe handle. We generated one from the Title (lowercase, hyphens, no special characters).",
    'handle_format':      "Handles must be lowercase and contain only letters, numbers, and hyphens. Fix the flagged rows before importing.",
    'duplicate_sku':      "Duplicate SKUs cause Shopify to merge variants into the wrong product. Review each flagged row and make SKUs unique.",
    'duplicate_handle':   "The same Handle appears multiple times with different Titles. Shopify uses the first Title and silently ignores the rest — this will overwrite data if the product already exists in your store.",
    'blank_destructive':  "This file has blank cells in optional columns (e.g., Variant Price, Variant SKU). When Shopify imports a blank cell over an existing value, it will overwrite that value with blank.",
    'image_url':          "Image Src must be a full HTTPS URL. Relative paths and HTTP URLs will fail silently and leave products without images.",
    'published_value':    "The Published column must be TRUE or FALSE (uppercase, no quotes). Other values are ignored.",
    'inventory_value':    "Variant Inventory Qty must be a whole number. Text like '10 pcs' or decimals will break inventory tracking.",
    'html_body':          "The Body (HTML) column contains what looks like unclosed tags or malformed HTML. This can break your storefront theme.",
    'option_names':       "Variant rows belonging to the same product must share the same Option1/2/3 Name. Different names across rows will create separate products.",
    'whitespace':         "Leading or trailing spaces were trimmed from all cells. Hidden whitespace is a common cause of failed imports.",
    'bom':                "This file starts with a UTF-8 byte-order mark (BOM). Excel often adds one silently. We stripped it, but verify your source does not re-add it on export."
  };

  /* ---------- STATE ---------- */
  var state = {
    file: null,
    rawRows: [],
    cleanedRows: [],
    headers: [],
    issues: [],
    changesByRow: {},     // { rowIndex: { columnName: true } } for preview highlighting
    meta: {}
  };

  /* ---------- PDF.JS-style lazy loader for PapaParse ---------- */
  function loadPapaParse(cb) {
    if (window.Papa) return cb();
    var script = document.createElement('script');
    script.src = PAPAPARSE_URL;
    script.async = true;
    script.onload = function () {
      if (!window.Papa) return cb(new Error('PapaParse failed to initialize.'));
      cb();
    };
    script.onerror = function () { cb(new Error('Could not load CSV parser. Check your connection or CSP settings.')); };
    document.head.appendChild(script);
  }

  /* ---------- HELPERS ---------- */
  function bytes(n) {
    var u = ['B', 'KB', 'MB', 'GB'], i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(i ? 1 : 0) + ' ' + u[i];
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function slugify(s) {
    return String(s).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .substring(0, 255);
  }
  function isBlank(v) {
    return v === undefined || v === null || String(v).trim() === '';
  }

  /* ---------- INIT ---------- */
  function init() {
    var root = document.getElementById('autonom-shopify-ready');
    if (!root) return;
    var $ = function (id) { return root.querySelector('#' + id) || document.getElementById(id); };

    var dropEl        = $('asr-drop');
    var fileInput     = $('asr-file');
    var chooseBtn     = $('asr-choose');
    var fileCard      = $('asr-filecard');
    var fnameEl       = $('asr-fname');
    var fsubEl        = $('asr-fsub');
    var resetBtn      = $('asr-reset');
    var scanBtn       = $('asr-scan');
    var downloadBtn   = $('asr-download');
    var progressSec   = $('asr-progress');
    var resultsSec    = $('asr-results');
    var titleEl       = $('asr-title');
    var scoreEl       = $('asr-score');
    var subEl         = $('asr-sub');
    var statsEl       = $('asr-stats');
    var issuesList    = $('asr-issues-list');
    var previewWrap   = $('asr-preview');
    var previewHead   = $('asr-preview-thead');
    var previewBody   = $('asr-preview-tbody');
    var previewNote   = $('asr-preview-note');
    var checklistEl   = $('asr-checklist');

    if (!dropEl || !fileInput) return;

    function selectFile(f) {
      if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') {
        alert('Please choose a CSV file.');
        return;
      }
      state.file = f;
      state.rawRows = [];
      state.cleanedRows = [];
      state.issues = [];
      state.changesByRow = {};

      fnameEl.textContent = f.name;
      fsubEl.textContent = bytes(f.size) + ' · modified ' + new Date(f.lastModified).toLocaleDateString();

      dropEl.classList.add('asr-hidden');
      fileCard.classList.remove('asr-hidden');
      progressSec.classList.add('asr-hidden');
      resultsSec.classList.add('asr-hidden');
      scanBtn.disabled = false;
      scanBtn.textContent = 'Scan for Shopify Errors';
    }

    function resetAll() {
      state.file = null;
      state.rawRows = [];
      state.cleanedRows = [];
      state.issues = [];
      state.changesByRow = {};
      fileInput.value = '';
      dropEl.classList.remove('asr-hidden');
      fileCard.classList.add('asr-hidden');
      progressSec.classList.add('asr-hidden');
      resultsSec.classList.add('asr-hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    chooseBtn.addEventListener('click', function () { fileInput.value = ''; fileInput.click(); });
    fileInput.addEventListener('change', function () {
      if (fileInput.files[0]) selectFile(fileInput.files[0]);
    });
    resetBtn.addEventListener('click', resetAll);

    ['dragenter', 'dragover'].forEach(function (evt) {
      dropEl.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        dropEl.classList.add('drag');
      });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      dropEl.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        dropEl.classList.remove('drag');
      });
    });
    dropEl.addEventListener('drop', function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      for (var i = 0; i < files.length; i++) {
        if (/\.csv$/i.test(files[i].name) || files[i].type === 'text/csv') {
          selectFile(files[i]);
          break;
        }
      }
    });

    /* ---------- SCAN ---------- */
    scanBtn.addEventListener('click', function () {
      if (!state.file) return;
      scanBtn.disabled = true;
      scanBtn.textContent = 'Scanning…';
      progressSec.classList.remove('asr-hidden');
      resultsSec.classList.add('asr-hidden');
      progressSec.scrollIntoView({ behavior: 'smooth', block: 'center' });

      loadPapaParse(function (err) {
        if (err) {
          progressSec.classList.add('asr-hidden');
          scanBtn.disabled = false;
          scanBtn.textContent = 'Scan for Shopify Errors';
          alert('Could not load CSV parser: ' + err.message);
          return;
        }

        // Read as text first so we can detect BOM and count raw lines
        var reader = new FileReader();
        reader.onload = function (e) {
          var text = String(e.target.result || '');
          var hadBOM = text.charCodeAt(0) === 0xFEFF;
          if (hadBOM) text = text.substring(1);

          window.Papa.parse(text, {
            header: true,
            skipEmptyLines: 'greedy',
            transformHeader: function (h) { return h.trim(); },
            complete: function (results) {
              progressSec.classList.add('asr-hidden');
              if (!results.data || !results.data.length) {
                alert('The CSV appears to be empty or unreadable.');
                scanBtn.disabled = false;
                scanBtn.textContent = 'Scan for Shopify Errors';
                return;
              }

              try {
                analyzeCSV(results.data, results.meta.fields || [], results.meta, { hadBOM: hadBOM });
                renderResults();
                scanBtn.textContent = 'Scan Complete';
              } catch (analysisErr) {
                console.error(analysisErr);
                alert('Error analyzing CSV: ' + analysisErr.message);
                scanBtn.disabled = false;
                scanBtn.textContent = 'Scan for Shopify Errors';
              }
            },
            error: function (parseErr) {
              progressSec.classList.add('asr-hidden');
              alert('Error parsing CSV: ' + parseErr.message);
              scanBtn.disabled = false;
              scanBtn.textContent = 'Scan for Shopify Errors';
            }
          });
        };
        reader.readAsText(state.file);
      });
    });

    /* ---------- DOWNLOAD ---------- */
    downloadBtn.addEventListener('click', function () {
      if (!state.cleanedRows.length || !window.Papa) return;
      var csv = window.Papa.unparse({ fields: state.headers, data: state.cleanedRows });
      var base = (state.file && state.file.name || 'shopify').replace(/\.csv$/i, '');
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = base + '-shopify-ready.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });

    /* =====================================================================
       ANALYSIS ENGINE
       ===================================================================== */
    function analyzeCSV(rows, fields, meta, flags) {
      state.rawRows = rows;
      state.headers = fields.slice();
      state.cleanedRows = JSON.parse(JSON.stringify(rows)); // deep copy
      state.issues = [];
      state.changesByRow = {};
      state.meta = meta || {};

      var issueIndex = {}; // id -> issue object for dedup

      function addIssue(type, id, name, detail, rowsRef, fix) {
        var existing = issueIndex[id];
        if (existing) {
          // Merge row references
          if (rowsRef && rowsRef.length) {
            existing.rows = existing.rows.concat(rowsRef);
          }
          return existing;
        }
        var issue = { type: type, id: id, name: name, detail: detail, rows: rowsRef || [], fix: fix || FIXES[id] || null };
        state.issues.push(issue);
        issueIndex[id] = issue;
        return issue;
      }

      function markChanged(rowIdx, colName) {
        if (!state.changesByRow[rowIdx]) state.changesByRow[rowIdx] = {};
        state.changesByRow[rowIdx][colName] = true;
      }

      /* ---------- 1. BOM warning ---------- */
      if (flags.hadBOM) {
        addIssue('warn', 'bom', 'UTF-8 BOM detected',
          'The file started with a byte-order mark. We stripped it, but Excel may re-add it on save.',
          [], FIXES.bom);
      }

      /* ---------- 2. Header normalization ---------- */
      // Build a lookup so we can find columns case-insensitively
      var headerMap = {};
      state.headers.forEach(function (h) {
        headerMap[h.toLowerCase()] = h;
      });
      function findCol(name) {
        return headerMap[name.toLowerCase()] || null;
      }

      var colHandle   = findCol('Handle');
      var colTitle    = findCol('Title');
      var colBody     = findCol('Body (HTML)') || findCol('Body');
      var colVendor   = findCol('Vendor');
      var colType     = findCol('Type');
      var colTags     = findCol('Tags');
      var colPublished= findCol('Published');
      var colSku      = findCol('Variant SKU');
      var colPrice    = findCol('Variant Price');
      var colCompare  = findCol('Variant Compare At Price');
      var colInvQty   = findCol('Variant Inventory Qty');
      var colImgSrc   = findCol('Image Src');
      var colOpt1Name = findCol('Option1 Name');
      var colOpt1Val  = findCol('Option1 Value');

      /* ---------- 3. Required columns ---------- */
      if (!colHandle) {
        addIssue('danger', 'missing_required', 'Missing required column: Handle',
          'Shopify cannot import a CSV without a Handle column.',
          [], 'Add a "Handle" column. Every product and its variant rows must share the same handle.');
      }
      if (!colTitle) {
        addIssue('danger', 'missing_required', 'Missing required column: Title',
          'Shopify cannot import products without a Title column.',
          [], 'Add a "Title" column. The title is shown on the product page and in search results.');
      }

      if (!colSku && !colPrice) {
        addIssue('warn', 'missing_required', 'Missing recommended columns',
          'Neither "Variant SKU" nor "Variant Price" columns were found.',
          [], 'Add "Variant SKU" (for inventory tracking) and "Variant Price" (for checkout).');
      }

      /* ---------- 4. Row-level checks ---------- */
      var skuToRows = {};         // sku -> [rowNums]
      var handleToRows = {};      // handle -> [{ rowNum, title }]
      var handleToOptions = {};   // handle -> { opt1Name: Set }
      var blankCellsByCol = {};   // colName -> count

      for (var i = 0; i < state.cleanedRows.length; i++) {
        var row = state.cleanedRows[i];
        var rawRow = state.rawRows[i];
        var rowNum = i + 2; // header is row 1

        /* 4a. Whitespace trim (auto-fix) */
        var changedInRow = false;
        for (var key in row) {
          if (typeof row[key] === 'string') {
            var trimmed = row[key].trim();
            if (trimmed !== row[key]) {
              row[key] = trimmed;
              markChanged(i, key);
              changedInRow = true;
            }
          }
        }

        /* 4b. Price format (auto-fix) */
        if (colPrice && row[colPrice]) {
          var origPrice = String(row[colPrice]);
          // Strip currency symbols, commas, spaces. Keep digits and dot.
          var cleanPrice = origPrice.replace(/[^\d.]/g, '');
          // Handle European format "1299,00" -> "1299.00"
          if (/^\d+,\d{2}$/.test(origPrice.replace(/[^\d,]/g, ''))) {
            cleanPrice = origPrice.replace(/[^\d]/g, '').replace(/(\d+)(\d{2})$/, '$1.$2');
          }
          if (cleanPrice && cleanPrice !== origPrice) {
            row[colPrice] = cleanPrice;
            markChanged(i, colPrice);
            changedInRow = true;
            addIssue('warn', 'price_format', 'Currency symbols in price',
              'Found symbols like $, €, or thousand separators in the Variant Price column.',
              [rowNum]);
          }
        }

        /* 4c. Compare-at price format (auto-fix) */
        if (colCompare && row[colCompare]) {
          var origCompare = String(row[colCompare]);
          var cleanCompare = origCompare.replace(/[^\d.]/g, '');
          if (cleanCompare && cleanCompare !== origCompare) {
            row[colCompare] = cleanCompare;
            markChanged(i, colCompare);
            changedInRow = true;
          }
        }

        /* 4d. Handle generation (auto-fix) */
        if (colHandle && colTitle && isBlank(row[colHandle]) && !isBlank(row[colTitle])) {
          row[colHandle] = slugify(row[colTitle]);
          markChanged(i, colHandle);
          changedInRow = true;
          addIssue('warn', 'empty_handle', 'Missing product handles',
            'One or more rows had an empty Handle column. We generated handles from the Title.',
            [rowNum]);
        }

        /* 4e. Handle format (warning, no auto-fix) */
        if (colHandle && !isBlank(row[colHandle])) {
          var handleVal = String(row[colHandle]);
          if (!/^[a-z0-9-]+$/.test(handleVal)) {
            addIssue('warn', 'handle_format', 'Handles contain invalid characters',
              'Handles must be lowercase and contain only letters, numbers, and hyphens.',
              [rowNum]);
          }
        }

        /* 4f. Track SKU duplicates */
        if (colSku && !isBlank(row[colSku])) {
          var sku = String(row[colSku]).trim();
          (skuToRows[sku] = skuToRows[sku] || []).push(rowNum);
        }

        /* 4g. Track handle duplicates (destructive overwrite) */
        if (colHandle && !isBlank(row[colHandle])) {
          var handleVal2 = String(row[colHandle]).trim();
          var titleVal = colTitle ? String(row[colTitle] || '').trim() : '';
          (handleToRows[handleVal2] = handleToRows[handleVal2] || []).push({ rowNum: rowNum, title: titleVal });

          if (colOpt1Name && !isBlank(row[colOpt1Name])) {
            var optName = String(row[colOpt1Name]).trim();
            handleToOptions[handleVal2] = handleToOptions[handleVal2] || {};
            handleToOptions[handleVal2][optName] = (handleToOptions[handleVal2][optName] || 0) + 1;
          }
        }

        /* 4h. Image URL format */
        if (colImgSrc && !isBlank(row[colImgSrc])) {
          var imgVal = String(row[colImgSrc]).trim();
          if (!/^https:\/\/[^\s]+$/i.test(imgVal)) {
            addIssue('warn', 'image_url', 'Image URLs must be absolute HTTPS',
              'Relative paths and HTTP URLs will fail silently. Products will import without images.',
              [rowNum]);
          }
        }

        /* 4i. Published value */
        if (colPublished && !isBlank(row[colPublished])) {
          var pub = String(row[colPublished]).trim().toUpperCase();
          if (pub !== 'TRUE' && pub !== 'FALSE') {
            addIssue('warn', 'published_value', 'Invalid Published value',
              'The Published column must be TRUE or FALSE (uppercase). Other values are ignored.',
              [rowNum]);
          }
        }

        /* 4j. Inventory quantity */
        if (colInvQty && !isBlank(row[colInvQty])) {
          var inv = String(row[colInvQty]).trim();
          if (!/^-?\d+$/.test(inv)) {
            addIssue('warn', 'inventory_value', 'Invalid inventory value',
              'Variant Inventory Qty must be a whole number. Text like "10 pcs" will break inventory.',
              [rowNum]);
          }
        }

        /* 4k. HTML body sanity (crude but useful) */
        if (colBody && !isBlank(row[colBody])) {
          var body = String(row[colBody]);
          var openCount  = (body.match(/<[a-z][^>]*>/gi) || []).length;
          var closeCount = (body.match(/<\/[a-z][^>]*>/gi) || []).length;
          var selfClosed = (body.match(/<[^>]+\/>/g) || []).length;
          if (openCount > closeCount + selfClosed + 2) {
            addIssue('warn', 'html_body', 'Suspected unclosed HTML tags',
              'The Body (HTML) column contains more opening tags than closing tags. Malformed HTML can break your storefront theme.',
              [rowNum]);
          }
        }

        /* 4l. Track blank cells in optional columns */
        ['Variant SKU', 'Variant Price', 'Variant Inventory Qty', 'Image Src', 'Published'].forEach(function (colName) {
          var actualCol = findCol(colName);
          if (actualCol && isBlank(row[actualCol])) {
            blankCellsByCol[actualCol] = (blankCellsByCol[actualCol] || 0) + 1;
          }
        });

        if (changedInRow) {
          // Recompute marks per row for later stats
        }
      }

      /* ---------- 5. Cross-row issue: duplicate SKU ---------- */
      var dupSkus = Object.keys(skuToRows).filter(function (s) { return skuToRows[s].length > 1; });
      if (dupSkus.length) {
        var allDupRows = [];
        dupSkus.forEach(function (s) { allDupRows = allDupRows.concat(skuToRows[s]); });
        allDupRows.sort(function (a, b) { return a - b; });
        addIssue('danger', 'duplicate_sku', 'Duplicate Variant SKUs',
          dupSkus.length + ' SKU' + (dupSkus.length === 1 ? '' : 's') + ' appear' + (dupSkus.length === 1 ? 's' : '') + ' in multiple rows. Shopify will merge these variants into the wrong product and break inventory tracking.',
          allDupRows.slice(0, 30));
      }

      /* ---------- 6. Cross-row issue: destructive handle overwrite ---------- */
      var destructiveHandles = [];
      Object.keys(handleToRows).forEach(function (h) {
        var entries = handleToRows[h];
        if (entries.length < 2) return; // single-row handle is fine

        var distinctTitles = {};
        entries.forEach(function (e) { if (e.title) distinctTitles[e.title] = true; });
        if (Object.keys(distinctTitles).length > 1) {
          destructiveHandles.push({ handle: h, rows: entries.map(function (e) { return e.rowNum; }) });
        }
      });
      if (destructiveHandles.length) {
        var destructiveRows = [];
        destructiveHandles.forEach(function (d) { destructiveRows = destructiveRows.concat(d.rows); });
        destructiveRows.sort(function (a, b) { return a - b; });
        addIssue('danger', 'duplicate_handle', 'Destructive handle overwrite',
          destructiveHandles.length + ' handle' + (destructiveHandles.length === 1 ? '' : 's') + ' appear' + (destructiveHandles.length === 1 ? 's' : '') + ' in multiple rows with different Titles. Shopify will keep the first Title and silently ignore the rest. If the product already exists in your store, this will overwrite live data.',
          destructiveRows.slice(0, 30));
      }

      /* ---------- 7. Cross-row issue: option name inconsistency ---------- */
      var inconsistentOptions = [];
      Object.keys(handleToOptions).forEach(function (h) {
        var optNames = Object.keys(handleToOptions[h]);
        if (optNames.length > 1) inconsistentOptions.push(h);
      });
      if (inconsistentOptions.length) {
        addIssue('danger', 'option_names', 'Inconsistent option names',
          inconsistentOptions.length + ' product' + (inconsistentOptions.length === 1 ? '' : 's') + ' have variant rows with different Option1 Name values. This will create separate products instead of one product with variants.',
          [], 'For each product handle, all variant rows must share the same Option1 Name (e.g., "Size"). Only the Option1 Value differs between rows.');
      }

      /* ---------- 8. Blank destructive warnings ---------- */
      var totalRows = state.cleanedRows.length;
      Object.keys(blankCellsByCol).forEach(function (col) {
        var count = blankCellsByCol[col];
        var pct = count / totalRows;
        if (pct > 0.3 && count > 3) {
          addIssue('warn', 'blank_destructive', 'Blank cells in "' + col + '"',
            count + ' of ' + totalRows + ' rows have an empty "' + col + '" cell. When Shopify imports over an existing product, blank cells will overwrite existing values with blank.',
            [], FIXES.blank_destructive);
        }
      });

      /* ---------- 9. Rows affected ---------- */
      state.rowsWithFixes = Object.keys(state.changesByRow).length;
    }

    /* =====================================================================
       RENDER
       ===================================================================== */
    function renderResults() {
      var totalRows = state.cleanedRows.length;
      var dangerCount = 0, warnCount = 0, infoCount = 0;
      state.issues.forEach(function (iss) {
        if (iss.type === 'danger') dangerCount++;
        else if (iss.type === 'warn') warnCount++;
        else infoCount++;
      });

      var verdict, verdictText, scoreRingClass, scorePct;
      if (dangerCount > 0) {
        verdict = 'danger';
        verdictText = 'DO NOT IMPORT YET';
        scoreRingClass = 'danger';
        scorePct = 0;
      } else if (warnCount > 0) {
        verdict = 'risky';
        verdictText = 'READY WITH FIXES';
        scoreRingClass = 'risky';
        scorePct = 70;
      } else {
        verdict = 'safe';
        verdictText = 'READY TO IMPORT';
        scoreRingClass = 'safe';
        scorePct = 100;
      }

      titleEl.textContent = verdictText;
      titleEl.className = 'asr-verdict ' + verdict;
      scoreEl.textContent = scorePct + '%';
      scoreEl.className = 'asr-score-ring ' + scoreRingClass;
      subEl.textContent = state.file.name + ' · ' + totalRows + ' row' + (totalRows === 1 ? '' : 's') + ' scanned · ' + (state.headers.length) + ' columns';

      var fixed = state.rowsWithFixes || 0;
      statsEl.innerHTML = [
        ['safe', totalRows, 'Rows scanned'],
        ['safe', fixed, 'Rows auto-fixed'],
        ['warn', warnCount, 'Warnings'],
        ['danger', dangerCount, 'Critical errors']
      ].map(function (row) {
        return '<div class="asr-stat ' + row[0] + '"><b>' + row[1] + '</b><span>' + row[2] + '</span></div>';
      }).join('');

      /* Issue list */
      if (state.issues.length === 0) {
        issuesList.innerHTML = '<div class="asr-empty">✅ No issues found. Your CSV is ready to import into Shopify.</div>';
      } else {
        // Sort: dangers first, then warns, then infos
        var order = { danger: 0, warn: 1, info: 2 };
        var sorted = state.issues.slice().sort(function (a, b) { return order[a.type] - order[b.type]; });

        issuesList.innerHTML = '<div class="asr-issues-title">Issues detected</div>' + sorted.map(function (iss) {
          var fixBox = iss.fix ? '<div class="asr-fix-box"><b>Fix</b>' + esc(iss.fix) + '</div>' : '';
          var rowChips = '';
          if (iss.rows && iss.rows.length) {
            var shown = iss.rows.slice(0, 12);
            rowChips = '<div class="asr-rows">' +
              shown.map(function (n) { return '<span class="asr-row-chip">Row ' + n + '</span>'; }).join('') +
              (iss.rows.length > 12 ? '<span class="asr-row-chip">+' + (iss.rows.length - 12) + ' more</span>' : '') +
              '</div>';
          }
          return '<div class="asr-issue">' +
            '<div class="asr-issue-body">' +
              '<div class="asr-issue-name">' + esc(iss.name) + '</div>' +
              '<div class="asr-issue-detail">' + esc(iss.detail) + '</div>' +
              rowChips +
              fixBox +
            '</div>' +
            '<span class="asr-badge ' + iss.type + '">' + iss.type + '</span>' +
          '</div>';
        }).join('');
      }

      /* Before/After preview */
      renderPreview();

      /* Import checklist */
      renderChecklist(verdict, dangerCount, warnCount, fixed);

      /* Show download button if no critical errors */
      if (dangerCount === 0) {
        downloadBtn.classList.remove('asr-hidden');
      } else {
        downloadBtn.classList.add('asr-hidden');
      }

      resultsSec.classList.remove('asr-hidden');
      resultsSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderPreview() {
      var rowsToShow = Math.min(6, state.cleanedRows.length);
      if (!rowsToShow) {
        previewWrap.classList.add('asr-hidden');
        return;
      }
      previewWrap.classList.remove('asr-hidden');

      // Pick a compact set of columns to show
      var compactCols = [];
      ['Handle', 'Title', 'Variant SKU', 'Variant Price', 'Image Src', 'Published'].forEach(function (name) {
        var found = state.headers.find(function (h) { return h.toLowerCase() === name.toLowerCase(); });
        if (found) compactCols.push(found);
      });
      if (!compactCols.length) compactCols = state.headers.slice(0, 6);

      previewHead.innerHTML = '<tr><th></th>' + compactCols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr>';

      var bodyHtml = '';
      for (var i = 0; i < rowsToShow; i++) {
        var row = state.cleanedRows[i];
        var changed = state.changesByRow[i] || {};
        bodyHtml += '<tr>' +
          '<td class="asr-row-num">' + (i + 2) + '</td>' +
          compactCols.map(function (c) {
            var val = row[c];
            var cls = '';
            if (changed[c]) cls = 'asr-changed';
            else if (isBlank(val)) cls = 'asr-blank';
            var display = isBlank(val) ? '(blank)' : String(val);
            if (display.length > 60) display = display.substring(0, 57) + '…';
            return '<td class="' + cls + '">' + esc(display) + '</td>';
          }).join('') +
        '</tr>';
      }
      previewBody.innerHTML = bodyHtml;

      var hiddenCount = state.cleanedRows.length - rowsToShow;
      previewNote.textContent = hiddenCount > 0
        ? 'Showing first ' + rowsToShow + ' of ' + state.cleanedRows.length + ' rows. Highlighted cells were auto-fixed.'
        : 'Highlighted cells were auto-fixed.';
    }

    function renderChecklist(verdict, dangerCount, warnCount, fixed) {
      var items = [];
      if (dangerCount === 0 && warnCount === 0 && fixed === 0) {
        items.push('Download the CSV below and import it via Shopify Admin → Products → Import.');
      } else {
        if (dangerCount > 0) {
          items.push('Fix all <strong>CRITICAL</strong> errors above before downloading. Critical errors will break your import.');
        }
        if (warnCount > 0) {
          items.push('Review the warnings above. Many can be ignored if you know the destination tolerates them.');
        }
        if (fixed > 0) {
          items.push('Download the cleaned CSV below — ' + fixed + ' row' + (fixed === 1 ? '' : 's') + ' were auto-fixed (whitespace, prices, handles).');
        }
        items.push('Before importing, <strong>export a backup</strong> of your current Shopify products.');
        items.push('This tool cannot check whether your handles already exist in your live store. If a handle matches an existing product, Shopify will <strong>overwrite</strong> that product.');
        items.push('After import, review the affected products in Shopify Admin before publishing.');
      }

      checklistEl.innerHTML = '<h4>Before you import</h4><ul>' +
        items.map(function (i) { return '<li>' + i + '</li>'; }).join('') +
        '</ul>';
    }
  }

  /* ---------- BOOTSTRAP ---------- */
  function boot() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
  boot();
})();
