/* ============================================================================
   AUTONOM SHOPIFY GUARD — Client-side engine v1.7.3 (FINAL)
   All processing is local. No file contents are transmitted.
   ========================================================================= */

(function () {
  'use strict';

  const LOG = (...a) => console.log('[Autonom SG]', ...a);

  const KNOWN_COLUMNS = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags',
    'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
    'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Grams',
    'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy',
    'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
    'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode', 'Image Src',
    'Image Position', 'Image Alt Text', 'Gift Card', 'SEO Title', 'SEO Description',
    'Google Shopping / Google Product Category', 'Google Shopping / Gender',
    'Google Shopping / Age Group', 'Google Shopping / MPN',
    'Google Shopping / AdWords Grouping', 'Google Shopping / AdWords Labels',
    'Google Shopping / Condition', 'Google Shopping / Custom Product',
    'Google Shopping / Custom Label 0', 'Google Shopping / Custom Label 1',
    'Google Shopping / Custom Label 2', 'Google Shopping / Custom Label 3',
    'Google Shopping / Custom Label 4', 'Variant Image', 'Variant Weight Unit',
    'Variant Tax Code', 'Cost per item', 'Status'
  ];
  const REQUIRED_COLUMNS_NEW = ['Handle', 'Title'];
  const SENSITIVE_COLUMNS = [
    'Variant Price', 'Variant Compare At Price', 'Variant Inventory Qty',
    'Vendor', 'Type', 'Tags', 'Body (HTML)', 'Published', 'Status', 'Product Category'
  ];
  const PRODUCT_LEVEL_COLUMNS = ['Vendor', 'Type', 'Tags', 'Body (HTML)', 'Published', 'Status', 'Product Category', 'Title'];
  const TEXT_COLUMNS_FOR_WHITESPACE = [
    'Handle', 'Title', 'Vendor', 'Type', 'Product Category', 'Tags',
    'Variant SKU', 'Variant Barcode', 'SEO Title', 'SEO Description', 'Status'
  ];
  const BOOLEAN_COLUMNS = ['Published', 'Variant Requires Shipping', 'Variant Taxable', 'Gift Card'];
  const TRUE_VALUES = ['true', 'yes', 'y', '1', 'on'];
  const FALSE_VALUES = ['false', 'no', 'n', '0', 'off'];
  const SHOPIFY_DOC_URL = 'https://help.shopify.com/en/manual/products/import-export/using-csv';
  const FILE_SIZE_WARNING_BYTES = 12 * 1024 * 1024;
  const FILE_SIZE_LIMIT_BYTES = 15 * 1024 * 1024;
  const BLANK_COLUMN_REMOVAL_THRESHOLD = 0.3;

  const CURRENCY_SYMBOLS = /[$€£¥₹₽₩₪₺₴₦₱₡₲₵₸₼₾₿]/;
  const SMART_QUOTE_CHARS = /[\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u2039\u203A\u00AB\u00BB\u2013\u2014\u2026]/;
  const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|avif|svg|bmp|tiff?)(\?|#|$)/i;
  const PRIVATE_CDN_PATTERN = /(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\.|\.local\b|\.internal\b|\.lan\b|\.test\b)/i;
  const VARIANT_OPTION_COLUMNS = ['Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value'];

  const state = {
    file: null, fileName: '', fileSize: 0, fileText: '',
    hasBOM: false, detectedEncoding: 'UTF-8',
    headers: [], rows: [], mode: null,
    detectedMode: null, detectedConfidence: null, detectedReason: '',
    result: null, repairs: null, acceptedRepairs: {},
    correctedCSV: null, changeLog: null, appliedCodes: null,
    showRowContext: {},
    parseFieldMismatches: 0,
    networkStats: { files: 0, bytes: 0, requests: 0 }
  };

  /* ---------------- Utilities ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toHandle(t) {
    return String(t || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[ß]/g, 'ss')
      .replace(/[æ]/g, 'ae')
      .replace(/[ø]/g, 'o')
      .replace(/[đ]/g, 'd')
      .replace(/[ł]/g, 'l')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function isBlank(v) { return v == null || String(v).trim() === ''; }
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  function pcount(n, singular, pluralForm) {
    const p = pluralForm || (singular + 's');
    if (n === 0) return 'No ' + p;
    return n + ' ' + (n === 1 ? singular : p);
  }

  function applied(n, singular, pluralForm) {
    const p = pluralForm || (singular + 's');
    if (n === 0) return 'No ' + p + ' needed';
    return n + ' ' + (n === 1 ? singular : p) + ' applied';
  }

  function v(n, singularVerb, pluralVerb) {
    return n === 1 ? singularVerb : pluralVerb;
  }

  function normalizeBoolean(val) {
    const lower = String(val).trim().toLowerCase();
    if (TRUE_VALUES.indexOf(lower) !== -1) return 'TRUE';
    if (FALSE_VALUES.indexOf(lower) !== -1) return 'FALSE';
    return null;
  }

  function isValidCategoryFormat(val) {
    if (isBlank(val)) return true;
    const s = String(val).trim();
    if (/^gid:\/\/shopify\//i.test(s)) return true;
    if (/[>»›]/.test(s)) return true;
    if (/^[a-z]{2}(-[a-z0-9]+)+$/i.test(s)) return true;
    return false;
  }

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function repairHTML(html) {
    let out = String(html);
    out = out.replace(/<p>([\s\S]*?)<\/div>/gi, '<p>$1</p>');
    out = out.replace(/<p>([\s\S]*?)<\/span>/gi, '<p>$1</p>');
    out = out.replace(/<b>([\s\S]*?)<\/i>/gi, '<b>$1</b>');
    out = out.replace(/<i>([\s\S]*?)<\/b>/gi, '<i>$1</i>');
    out = out.replace(/<strong>([\s\S]*?)<\/em>/gi, '<strong>$1</strong>');
    out = out.replace(/<em>([\s\S]*?)<\/strong>/gi, '<em>$1</em>');
    out = out.replace(/<\/(div|span|p|b|i|strong|em)>(?![^<]*<\1>)/gi, '');
    const stack = [];
    const re = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
    let m;
    while ((m = re.exec(out)) !== null) {
      const full = m[0], tag = m[1].toLowerCase();
      if (/^<\//.test(full)) {
        if (stack.length && stack[stack.length - 1] === tag) stack.pop();
      } else if (!/\/>$/.test(full)) stack.push(tag);
    }
    while (stack.length) out += '</' + stack.pop() + '>';
    return out;
  }

  function smartQuotesToStraight(text) {
    return String(text)
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u00AB\u2039]/g, '"')
      .replace(/[\u00BB\u203A]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2026/g, '...');
  }

  function stripCurrencySymbols(text) {
    return String(text).replace(CURRENCY_SYMBOLS, '').replace(/\s+/g, '').trim();
  }

  function analyzePrice(raw) {
    if (raw == null) return { value: NaN, parseable: false };
    let s = String(raw).trim();
    if (s === '') return { value: NaN, parseable: false, empty: true };
    const hasCurrency = CURRENCY_SYMBOLS.test(s);
    s = stripCurrencySymbols(s);
    let commaDecimal = false;
    if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) { s = s.replace(/\./g, '').replace(',', '.'); commaDecimal = true; }
    else if (/^\d+,\d{1,2}$/.test(s)) { s = s.replace(',', '.'); commaDecimal = true; }
    else if (/^\d+,\d{3}$/.test(s)) { s = s.replace(',', ''); }
    s = s.replace(/\s+/g, '');
    const n = Number(s);
    return { value: n, parseable: !isNaN(n) && isFinite(n), commaDecimal, hasCurrency, normalized: s };
  }

  function makeUniqueSku(base, usedSet) {
    if (!usedSet.has(base)) { usedSet.add(base); return base; }
    let n = 2;
    while (usedSet.has(base + '-' + n)) n++;
    const sku = base + '-' + n;
    usedSet.add(sku);
    return sku;
  }

  /* ---------------- Row classification ---------------- */
  function classifyRows() {
    const byHandle = {};
    state.rows.forEach((row, i) => {
      const h = row['Handle'];
      if (isBlank(h)) return;
      if (!byHandle[h]) byHandle[h] = [];
      byHandle[h].push(i);
    });

    const isImage = new Array(state.rows.length).fill(false);
    const isPrimary = new Array(state.rows.length).fill(false);
    const isVariant = new Array(state.rows.length).fill(false);

    Object.keys(byHandle).forEach(h => {
      const indices = byHandle[h];
      let primarySet = false;

      indices.forEach((idx) => {
        const row = state.rows[idx];
        const hasSku = !isBlank(row['Variant SKU']);
        const hasPrice = !isBlank(row['Variant Price']);
        const hasOpt = !isBlank(row['Option1 Value']);
        const hasTitle = !isBlank(row['Title']);
        const hasImage = !isBlank(row['Image Src']);

        if (hasSku || hasPrice || hasOpt) {
          isVariant[idx] = true;
          if (!primarySet) { isPrimary[idx] = true; primarySet = true; }
        } else if (hasImage && !hasTitle) {
          isImage[idx] = true;
        } else if (hasTitle) {
          if (!primarySet) { isPrimary[idx] = true; primarySet = true; }
          else isVariant[idx] = true;
        } else {
          isVariant[idx] = true;
        }
      });
    });

    return { isImage, isPrimary, isVariant };
  }

  /* ---------------- Image row detection ---------------- */
  function detectImageRows() {
    const byHandle = {};
    state.rows.forEach((row, i) => {
      const h = row['Handle'];
      if (isBlank(h)) return;
      if (!byHandle[h]) byHandle[h] = [];
      byHandle[h].push({ idx: i, row });
    });

    const products = {};

    Object.keys(byHandle).forEach(h => {
      const entries = byHandle[h];
      const variantIdxs = [];
      const imageIdxs = [];

      entries.forEach(e => {
        const r = e.row;
        const hasSku = !isBlank(r['Variant SKU']);
        const hasPrice = !isBlank(r['Variant Price']);
        const hasOptionValue = !isBlank(r['Option1 Value']);
        const hasTitle = !isBlank(r['Title']);
        const hasImage = !isBlank(r['Image Src']);

        if (hasSku || hasPrice || hasOptionValue) {
          variantIdxs.push(e.idx);
        } else if (hasImage && !hasTitle) {
          imageIdxs.push(e.idx);
        }
      });

      if (imageIdxs.length > 0) {
        products[h] = {
          parentIdx: variantIdxs.length > 0 ? variantIdxs[0] : entries[0].idx,
          imageIdxs,
          variantIdxs
        };
      }
    });

    return products;
  }

  function imageRowsWithExtraData() {
    const products = detectImageRows();
    const results = [];
    const cols = ['Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Option1 Name', 'Option1 Value', 'Variant SKU', 'Variant Price', 'Variant Compare At Price', 'Variant Inventory Qty', 'Status'];

    Object.keys(products).forEach(h => {
      products[h].imageIdxs.forEach(idx => {
        const row = state.rows[idx];
        const dirty = [];
        cols.forEach(c => {
          if (state.headers.indexOf(c) !== -1 && !isBlank(row[c])) dirty.push(c);
        });
        if (dirty.length > 0) {
          results.push({ handle: h, row: idx + 2, columns: dirty });
        }
      });
    });

    return results;
  }

  function singleVariantMultipleImages() {
    const products = detectImageRows();
    const results = [];

    Object.keys(products).forEach(h => {
      const p = products[h];
      if (p.variantIdxs.length !== 1) return;
      const parent = state.rows[p.parentIdx];
      if (isBlank(parent['Option1 Name']) && isBlank(parent['Option1 Value'])) {
        results.push({ handle: h, row: p.parentIdx + 2, imageCount: p.imageIdxs.length });
      }
    });

    return results;
  }

  function duplicateImageRows() {
    const byHandle = {};
    state.rows.forEach((row, i) => {
      const h = row['Handle'];
      const img = row['Image Src'];
      if (isBlank(h) || isBlank(img)) return;
      if (!byHandle[h]) byHandle[h] = [];
      byHandle[h].push({ idx: i, img: String(img).trim() });
    });

    const dupes = [];
    Object.keys(byHandle).forEach(h => {
      const entries = byHandle[h];
      const seen = {};
      entries.forEach(e => {
        const row = state.rows[e.idx];
        if (!isBlank(row['Variant SKU']) || !isBlank(row['Variant Price'])) return;
        if (!isBlank(row['Title'])) return;
        if (seen[e.img]) {
          dupes.push({ handle: h, row: e.idx + 2, duplicateOf: seen[e.img] + 2, url: e.img });
        } else {
          seen[e.img] = e.idx;
        }
      });
    });

    return dupes;
  }

  function rowTypes_isImageRow(row) {
    if (isBlank(row['Image Src'])) return false;
    if (!isBlank(row['Title'])) return false;
    if (!isBlank(row['Variant SKU'])) return false;
    if (!isBlank(row['Variant Price'])) return false;
    if (!isBlank(row['Option1 Value'])) return false;
    return true;
  }

  /* ---------------- Fallback parser ---------------- */
  function fallbackParseCSV(text) {
    const lines = [];
    let cur = '', row = [], inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else cur += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); lines.push(row); row = []; cur = ''; }
        else if (c === '\r') { /* skip */ }
        else cur += c;
      }
    }
    if (cur !== '' || row.length) { row.push(cur); lines.push(row); }
    if (!lines.length) return { fields: [], data: [] };
    const fields = lines[0];
    const data = lines.slice(1).filter(r => r.some(c => c !== '')).map(r => {
      const obj = {};
      fields.forEach((f, i) => { obj[f] = r[i] != null ? r[i] : ''; });
      return obj;
    });
    return { fields, data };
  }

  function parseWithPapa(text) {
    if (typeof Papa === 'undefined') return Promise.resolve(fallbackParseCSV(text));
    return new Promise(resolve => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: h => String(h).trim(),
        complete: r => resolve({ fields: r.meta.fields || [], data: r.data || [], errors: r.errors || [] }),
        error: () => resolve(fallbackParseCSV(text))
      });
    });
  }

  /* ---------------- Privacy monitor ---------------- */
  function initPrivacyMonitor() {
    if (!('PerformanceObserver' in window)) return;
    try {
      const obs = new PerformanceObserver(list => {
        list.getEntries().forEach(e => {
          if (['fetch', 'xmlhttprequest', 'beacon'].includes(e.initiatorType)) {
            state.networkStats.requests++;
            state.networkStats.bytes += (e.transferSize || e.encodedBodySize || 0);
            renderPrivacyStats();
          }
        });
      });
      obs.observe({ entryTypes: ['resource'] });
    } catch (e) { LOG('PerfObserver failed', e); }
    renderPrivacyStats();
  }

  function renderPrivacyStats() {
    const f = document.getElementById('asg-stat-files');
    const b = document.getElementById('asg-stat-bytes');
    const r = document.getElementById('asg-stat-requests');
    if (f) f.textContent = state.networkStats.files;
    if (b) b.textContent = formatBytes(state.networkStats.bytes);
    if (r) r.textContent = state.networkStats.requests;
  }

  /* ---------------- Encoding ---------------- */
  function detectEncoding(buf) {
    const bytes = new Uint8Array(buf);
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF)
      return { encoding: 'UTF-8', hasBOM: true };
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE)
      return { encoding: 'UTF-16LE', hasBOM: true };
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF)
      return { encoding: 'UTF-16BE', hasBOM: true };
    const sample = bytes.slice(0, Math.min(4096, bytes.length));
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(sample);
      return { encoding: 'UTF-8', hasBOM: false };
    } catch (e) { return { encoding: 'ISO-8859-1', hasBOM: false }; }
  }

  /* ---------------- Mode auto-detection ---------------- */
  function detectMode(headers, rows) {
    const lower = headers.map(h => h.toLowerCase());
    const has = col => lower.indexOf(col) !== -1;
    const signals = {
      status: has('status'), published: has('published'), imagePosition: has('image position'),
      variantInventoryTracker: has('variant inventory tracker'),
      variantFulfillment: has('variant fulfillment service'),
      seoTitle: has('seo title'), cost: has('cost per item')
    };
    const updateScore = Object.values(signals).filter(Boolean).length;
    const hasHandles = rows.some(r => !isBlank(r['Handle']));
    const hasMissingHandles = rows.some(r => isBlank(r['Handle']));
    const hasPrices = rows.some(r => !isBlank(r['Variant Price']));
    const shortHeaders = headers.length < 10;

    if (updateScore >= 4) return { mode: 'existing_products', confidence: 'high', reason: 'Your file includes ' + updateScore + ' columns typically found in Shopify exports.' };
    if (updateScore >= 2) return { mode: 'existing_products', confidence: 'medium', reason: 'Your file includes some columns typically found in Shopify exports.' };
    if (shortHeaders && hasMissingHandles) return { mode: 'new_products', confidence: 'medium', reason: 'Your file has few columns and some rows are missing handles.' };
    if (shortHeaders && hasHandles && hasPrices) return { mode: 'new_products', confidence: 'medium', reason: 'Your file has the basics for a new product import.' };
    return { mode: null, confidence: 'low', reason: 'Autonom could not confidently determine the mode. Please choose below.' };
  }

  function renderDetectionBanner() {
    const banner = document.getElementById('asg-detect-banner');
    const icon = document.getElementById('asg-detect-icon');
    const line = document.getElementById('asg-detect-line');
    const sub = document.getElementById('asg-detect-sub');
    const grid = document.getElementById('asg-mode-grid');
    banner.classList.remove('is-medium', 'is-low');
    if (state.detectedConfidence === 'medium') banner.classList.add('is-medium');
    if (state.detectedConfidence === 'low') banner.classList.add('is-low');

    if (state.detectedMode && state.detectedConfidence !== 'low') {
      banner.hidden = false;
      grid.classList.add('is-hidden');
      icon.textContent = state.detectedConfidence === 'high' ? '✅' : '🤖';
      line.textContent = 'Detected: ' + (state.detectedMode === 'existing_products' ? 'Updating existing products' : 'Adding new products');
      sub.textContent = state.detectedReason || '';
      state.mode = state.detectedMode;
      $$('.asg-mode-card').forEach(c => c.classList.remove('is-selected'));
      const card = document.querySelector('.asg-mode-card[data-mode="' + state.detectedMode + '"]');
      if (card) card.classList.add('is-selected');
    } else {
      banner.hidden = false;
      grid.classList.remove('is-hidden');
      icon.textContent = '🤔';
      line.textContent = 'Help us choose';
      sub.textContent = state.detectedReason || 'Please select what you are doing with this file.';
    }
    updateActionBar('setup');
  }

  /* ---------------- File handling ---------------- */
  function handleFile(file) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') { alert('Please choose a .csv file.'); return; }
    if (file.size > 50 * 1024 * 1024) { alert('This file is larger than 50MB.'); return; }
    state.file = file;
    state.fileName = file.name;
    state.fileSize = file.size;

    const reader = new FileReader();
    reader.onload = e => {
      const buf = e.target.result;
      const enc = detectEncoding(buf);
      state.hasBOM = enc.hasBOM;
      state.detectedEncoding = enc.encoding;
      let text;
      if (enc.encoding === 'UTF-16LE' || enc.encoding === 'UTF-16BE') text = new TextDecoder(enc.encoding).decode(buf);
      else if (enc.encoding === 'ISO-8859-1') text = new TextDecoder('iso-8859-1').decode(buf);
      else text = new TextDecoder('utf-8').decode(buf);
      if (state.hasBOM && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      state.fileText = text;
      const parsed = fallbackParseCSV(text);
      state.headers = parsed.fields;
      state.rows = parsed.data;
      const detection = detectMode(state.headers, state.rows);
      state.detectedMode = detection.mode;
      state.detectedConfidence = detection.confidence;
      state.detectedReason = detection.reason;
      renderFilePreview();
      renderFileSample();
      renderDetectionBanner();
      showScreen('setup');
    };
    reader.readAsArrayBuffer(file);
  }

  function renderFilePreview() {
    const nameEl = document.getElementById('asg-file-name');
    const metaEl = document.getElementById('asg-file-meta');
    if (nameEl) nameEl.textContent = state.fileName;
    let rowCount = '—';
    try { rowCount = Math.max(0, state.rows.length).toLocaleString(); } catch (e) { /* ignore */ }
    if (metaEl) metaEl.textContent = formatBytes(state.fileSize) + ' · ' + rowCount + ' rows · ' + state.detectedEncoding + (state.hasBOM ? ' · BOM detected' : '');
  }

  function renderFileSample() {
    const wrap = document.getElementById('asg-file-sample');
    const table = document.getElementById('asg-file-sample-table');
    if (!state.headers.length || !state.rows.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    const cols = state.headers.slice(0, 5);
    const rows = state.rows.slice(0, 3);
    let html = '<table><thead><tr>';
    cols.forEach(c => { html += '<th>' + escapeHtml(c) + '</th>'; });
    if (state.headers.length > 5) html += '<th>… +' + (state.headers.length - 5) + ' more</th>';
    html += '</tr></thead><tbody>';
    rows.forEach(r => {
      html += '<tr>';
      cols.forEach(c => {
        const val = r[c] == null ? '' : String(r[c]);
        html += '<td>' + escapeHtml(val.length > 40 ? val.substring(0, 40) + '…' : val) + '</td>';
      });
      if (state.headers.length > 5) html += '<td>…</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    table.innerHTML = html;
  }

  /* ---------------- Validation ---------------- */
  function makeIssue(sev, code, title, extra) {
    return Object.assign({
      severity: sev, code, title,
      what_is_wrong: '', why_it_matters: '', suggested_action: '',
      affected_rows: [], shopify_doc_url: '', auto_fix: 'never'
    }, extra || {});
  }

  function runChecks() {
    const issues = [];
    const passed = [];
    const rowTypes = classifyRows();

    /* File size */
    if (state.fileSize >= FILE_SIZE_WARNING_BYTES && state.fileSize < FILE_SIZE_LIMIT_BYTES) {
      issues.push(makeIssue('info', 'FILE_SIZE_APPROACHING_LIMIT', 'File size is approaching Shopify\'s 15 MB limit', {
        what_is_wrong: 'Your file is ' + formatBytes(state.fileSize) + '. Shopify rejects files over 15 MB.',
        why_it_matters: 'If this file grows, Shopify will reject the import.',
        suggested_action: 'Consider splitting this file into smaller batches before it hits the limit.',
        auto_fix: 'never'
      }));
    } else if (state.fileSize >= FILE_SIZE_LIMIT_BYTES) {
      issues.push(makeIssue('critical', 'FILE_SIZE_OVER_LIMIT', 'File size exceeds Shopify\'s 15 MB limit', {
        what_is_wrong: 'Your file is ' + formatBytes(state.fileSize) + '. Shopify will reject any file over 15 MB.',
        why_it_matters: 'The import will fail before Shopify reads any rows.',
        suggested_action: 'Split this file into multiple smaller files (each under 15 MB) and import them one at a time.',
        shopify_doc_url: SHOPIFY_DOC_URL, auto_fix: 'never'
      }));
    }

    /* Encoding */
    if (state.hasBOM) {
      issues.push(makeIssue('warning', 'ENCODING_BOM_PRESENT', 'File starts with a byte-order mark (BOM)', {
        what_is_wrong: 'This file has a hidden BOM character at the start.',
        why_it_matters: 'Shopify may interpret the first column header incorrectly.',
        suggested_action: 'Autonom can remove the BOM.', auto_fix: 'safe_automatic'
      }));
    } else passed.push('No byte-order mark detected');

    if (state.detectedEncoding !== 'UTF-8') {
      issues.push(makeIssue('warning', 'ENCODING_NOT_UTF8', 'File is not UTF-8 encoded', {
        what_is_wrong: 'This file uses ' + state.detectedEncoding + ' encoding.',
        why_it_matters: 'Special characters may display incorrectly.',
        suggested_action: 'Autonom can convert to UTF-8.', auto_fix: 'safe_automatic'
      }));
    } else passed.push('File encoding is UTF-8');

    /* Smart quotes */
    const smartQuoteRows = [];
    state.rows.forEach((row, i) => {
      for (const key of Object.keys(row)) {
        const val = row[key];
        if (val != null && SMART_QUOTE_CHARS.test(String(val))) {
          smartQuoteRows.push({ row: i + 2, column: key, value: String(val).substring(0, 60) });
          break;
        }
      }
    });
    if (smartQuoteRows.length > 0) {
      const n = smartQuoteRows.length;
      issues.push(makeIssue('warning', 'SMART_QUOTES_DETECTED', 'Smart quotes and typographic characters detected', {
        what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'contains', 'contain') + ' curly quotes ("), dashes (–—), or ellipses (…). These characters come from copy-pasting from Word or Google Docs.',
        why_it_matters: 'Shopify\'s CSV parser expects straight quotes ("). Smart quotes can break parsing or display as garbled characters on your storefront.',
        suggested_action: 'Autonom can convert all smart quotes to straight quotes.',
        affected_rows: smartQuoteRows.slice(0, 10), auto_fix: 'safe_automatic'
      }));
    } else passed.push('No smart quotes detected');

    /* Whitespace */
    const whitespaceRows = [];
    state.rows.forEach((row, i) => {
      for (const col of TEXT_COLUMNS_FOR_WHITESPACE) {
        if (state.headers.indexOf(col) === -1) continue;
        const val = row[col];
        if (val != null && String(val) !== String(val).trim() && String(val).trim() !== '') {
          whitespaceRows.push({ row: i + 2, column: col, value: String(val) });
          break;
        }
      }
    });
    if (whitespaceRows.length > 0) {
      const n = whitespaceRows.length;
      issues.push(makeIssue('warning', 'CELL_WHITESPACE', 'Extra whitespace in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'cell') + ' ' + v(n, 'has', 'have') + ' leading or trailing spaces.',
        why_it_matters: 'Hidden spaces can create duplicate tags, cause SKU matching to fail, and produce broken URLs.',
        suggested_action: 'Autonom can trim whitespace from all text columns.',
        affected_rows: whitespaceRows.slice(0, 10), auto_fix: 'safe_automatic'
      }));
    } else passed.push('No stray whitespace in text cells');

    /* Required headers */
    const headerLower = {};
    state.headers.forEach(h => { headerLower[h.toLowerCase()] = h; });
    if (state.mode === 'new_products') {
      REQUIRED_COLUMNS_NEW.forEach(req => {
        if (!headerLower[req.toLowerCase()]) {
          issues.push(makeIssue('critical', 'HEADER_REQUIRED_MISSING', 'Required column "' + req + '" is missing', {
            what_is_wrong: 'Shopify requires the "' + req + '" column, but it is not present.',
            why_it_matters: 'Shopify will reject the import entirely.',
            suggested_action: 'Add the missing column and re-export.',
            shopify_doc_url: SHOPIFY_DOC_URL
          }));
        } else passed.push('Required column present: ' + req);
      });
    }

    /* Unknown columns */
    const knownLower = KNOWN_COLUMNS.map(c => c.toLowerCase());
    state.headers.forEach(h => {
      if (h && knownLower.indexOf(h.toLowerCase()) === -1 &&
          !/^Metafield:|^mf_|^Google Shopping|^Cost per item|^Variant Inventory/.test(h)) {
        issues.push(makeIssue('warning', 'HEADER_UNKNOWN_COLUMN', 'Unknown column "' + h + '"', {
          what_is_wrong: 'Not part of the standard Shopify product CSV format.',
          why_it_matters: 'Shopify will ignore this column.',
          suggested_action: 'Verify this column is intentional, or remove it.'
        }));
      }
    });

    /* Duplicate headers */
    const hCount = {};
    state.headers.forEach(h => { const k = h.toLowerCase(); hCount[k] = (hCount[k] || 0) + 1; });
    Object.keys(hCount).forEach(k => {
      if (hCount[k] > 1) {
        issues.push(makeIssue('critical', 'HEADER_DUPLICATE', 'Duplicate column "' + k + '"', {
          what_is_wrong: 'The "' + k + '" column appears more than once.',
          why_it_matters: 'Shopify will use only one of the duplicate columns.',
          suggested_action: 'Remove the duplicate column.', auto_fix: 'review_required'
        }));
      }
    });
    if (Object.keys(hCount).length === state.headers.length) passed.push('No duplicate headers');

    /* Title presence */
    const handleFirstTitle = {};
    state.rows.forEach((row, i) => {
      const h = row['Handle']; const t = row['Title'];
      if (isBlank(h)) return;
      if (!(h in handleFirstTitle)) handleFirstTitle[h] = { row: i + 2, title: t || '' };
    });
    const missingTitles = [];
    Object.keys(handleFirstTitle).forEach(h => {
      const entry = handleFirstTitle[h];
      if (isBlank(entry.title)) missingTitles.push({ row: entry.row, handle: h });
    });
    if (missingTitles.length > 0) {
      const n = missingTitles.length;
      issues.push(makeIssue('critical', 'TITLE_MISSING', 'Title missing for ' + pcount(n, 'product'), {
        what_is_wrong: pcount(n, 'product') + ' ' + v(n, 'has', 'have') + ' no Title on the first row.',
        why_it_matters: 'Shopify requires a Title to create or update a product. The row will be rejected and its images may be dropped.',
        suggested_action: 'Add a Title to the first row of each product.',
        affected_rows: missingTitles.slice(0, 10)
      }));
    } else passed.push('All products have a Title');

    /* Handles */
    const handleCounts = {};
    const blankNew = [], blankUpdate = [], invalid = [];
    state.rows.forEach((row, i) => {
      const h = row['Handle'], t = row['Title'], n = i + 2;
      if (isBlank(h)) {
        if (state.mode === 'new_products' && !isBlank(t)) blankNew.push({ row: n, title: t, proposed_handle: toHandle(t) });
        else if (state.mode === 'existing_products') blankUpdate.push({ row: n, title: t || '(no title)' });
      } else {
        handleCounts[h] = (handleCounts[h] || 0) + 1;
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(h)) invalid.push({ row: n, handle: h, proposed: toHandle(h) });
      }
    });
    if (state.mode === 'new_products' && blankNew.length > 0) {
      const n = blankNew.length;
      issues.push(makeIssue('warning', 'HANDLE_MISSING_NEW', 'Handle missing for ' + pcount(n, 'product'), {
        what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'has', 'have') + ' no handle.',
        why_it_matters: 'Shopify requires a handle to create a product.',
        suggested_action: 'Autonom can generate handles from product titles.',
        affected_rows: blankNew.slice(0, 10), auto_fix: 'review_required'
      }));
    }
    if (state.mode === 'existing_products' && blankUpdate.length > 0) {
      const n = blankUpdate.length;
      issues.push(makeIssue('critical', 'HANDLE_MISSING_UPDATE', 'Handle missing for ' + pcount(n, 'row'), {
        what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'has', 'have') + ' no handle.',
        why_it_matters: 'Shopify cannot match these rows to existing products.',
        suggested_action: 'Add the handle column and verify each row.',
        affected_rows: blankUpdate.slice(0, 10)
      }));
    }
    if (invalid.length > 0) {
      const n = invalid.length;
      issues.push(makeIssue('warning', 'HANDLE_FORMAT_INVALID', pcount(n, 'handle') + ' ' + v(n, 'does', 'do') + ' not match Shopify format', {
        what_is_wrong: 'Handles should be lowercase with hyphens (no spaces, underscores, or accents).',
        why_it_matters: 'Non-standard handles may cause URL issues.',
        suggested_action: 'Autonom can normalize these handles.',
        affected_rows: invalid.slice(0, 10), auto_fix: 'safe_automatic'
      }));
    }

    /* Duplicate handles */
    const hTitles = {};
    state.rows.forEach((row, i) => {
      const h = row['Handle'];
      if (isBlank(h)) return;
      if (!hTitles[h]) hTitles[h] = [];
      hTitles[h].push({ row: i + 2, title: row['Title'] || '' });
    });
    Object.keys(hTitles).forEach(h => {
      const entries = hTitles[h];
      if (entries.length > 1) {
        const titleSet = {};
        entries.forEach(e => { titleSet[e.title] = true; });
        const distinctTitles = Object.keys(titleSet).filter(t => t !== '');
        if (distinctTitles.length > 1) {
          const n = entries.length;
          issues.push(makeIssue('critical', 'HANDLE_DUPLICATE_IN_FILE', 'Duplicate handle "' + h + '" found', {
            what_is_wrong: 'The handle "' + h + '" appears on ' + pcount(n, 'row') + ', but titles differ.',
            why_it_matters: 'Shopify may merge these into one product.',
            suggested_action: 'If variants, use same Title. If different products, use unique handles.',
            affected_rows: entries.slice(0, 10)
          }));
        }
      }
    });
    if (!issues.some(i => i.code === 'HANDLE_DUPLICATE_IN_FILE')) passed.push('No conflicting duplicate handles');

    /* SKUs */
    const skuMap = {};
    let whitespaceSKUs = 0;
    state.rows.forEach((row, i) => {
      const sku = row['Variant SKU'];
      if (isBlank(sku)) return;
      const trimmed = String(sku).trim();
      if (trimmed !== sku) whitespaceSKUs++;
      if (!skuMap[trimmed]) skuMap[trimmed] = [];
      skuMap[trimmed].push({ row: i + 2, handle: row['Handle'] || '(no handle)' });
    });
    Object.keys(skuMap).forEach(sku => {
      const entries = skuMap[sku];
      const distinct = {};
      entries.forEach(e => { distinct[e.handle] = true; });
      if (Object.keys(distinct).length > 1) {
        issues.push(makeIssue('critical', 'SKU_DUPLICATE_IN_FILE', 'Duplicate SKU "' + sku + '" found', {
          what_is_wrong: 'The SKU "' + sku + '" appears on rows for different products.',
          why_it_matters: 'Shopify may merge these products, or the import may fail.',
          suggested_action: 'Assign a unique SKU to each product and variant.',
          affected_rows: entries.slice(0, 10), auto_fix: 'review_required'
        }));
      }
    });
    if (whitespaceSKUs > 0) {
      const n = whitespaceSKUs;
      issues.push(makeIssue('warning', 'SKU_WHITESPACE', pcount(n, 'SKU') + ' ' + v(n, 'contains', 'contain') + ' leading or trailing whitespace', {
        what_is_wrong: pcount(n, 'SKU') + ' ' + v(n, 'has', 'have') + ' hidden spaces.',
        why_it_matters: 'May cause matching issues.',
        suggested_action: 'Autonom can trim whitespace from all SKUs.', auto_fix: 'safe_automatic'
      }));
    } else passed.push('No whitespace in SKUs');

    /* Destructive blanks — v1.7.3: skip if file has misaligned rows; only offer column removal if ratio >= 30% */
    if (state.mode === 'existing_products') {
      if (state.parseFieldMismatches > 0) {
        passed.push('Destructive blank check skipped (file has misaligned rows)');
      } else {
        SENSITIVE_COLUMNS.forEach(col => {
          if (state.headers.indexOf(col) === -1) return;
          const isProductLevel = PRODUCT_LEVEL_COLUMNS.indexOf(col) !== -1;
          const blanks = [];
          let consideredCount = 0;
          let allBlank = true;

          state.rows.forEach((row, i) => {
            if (rowTypes.isImage[i]) return;
            if (isProductLevel && !rowTypes.isPrimary[i]) return;
            if (!isProductLevel && !rowTypes.isVariant[i] && !rowTypes.isPrimary[i]) return;
            consideredCount++;
            if (isBlank(row[col])) blanks.push({ row: i + 2, handle: row['Handle'] || '', value: '' });
            else allBlank = false;
          });

          if (consideredCount === 0) return;

          if (allBlank && blanks.length > 0) {
            issues.push(makeIssue('info', 'DESTRUCTIVE_BLANK_ALL_ROWS', 'Entire column "' + col + '" is blank', {
              what_is_wrong: 'The "' + col + '" column is included but contains no values.',
              why_it_matters: 'This column has no effect.',
              suggested_action: 'Autonom can remove this column.', auto_fix: 'safe_automatic'
            }));
          } else if (blanks.length > 0) {
            const n = blanks.length;
            const ratio = n / consideredCount;
            const offerColumnRemoval = ratio >= BLANK_COLUMN_REMOVAL_THRESHOLD;

            issues.push(makeIssue('critical', 'DESTRUCTIVE_BLANK_INCLUDED_COLUMN',
              'Blank values in included column "' + col + '"', {
                what_is_wrong: 'You included the "' + col + '" column, but ' + n + ' of ' + consideredCount + ' relevant cells ' + v(n, 'is', 'are') + ' empty.',
                why_it_matters: 'Shopify treats a blank value in an included column as an intentional overwrite. If these rows match existing products, your live data may be cleared.',
                suggested_action: offerColumnRemoval
                  ? 'Remove the "' + col + '" column entirely, or fill in the blank cells.'
                  : 'Fill in the ' + pcount(n, 'blank cell') + ' in your original file, then re-upload. Removing the whole column would skip the other ' + (consideredCount - n) + ' valid update' + (consideredCount - n === 1 ? '' : 's') + '.',
                affected_rows: blanks.slice(0, 10),
                affected_column: col,
                shopify_doc_url: SHOPIFY_DOC_URL,
                auto_fix: offerColumnRemoval ? 'review_required' : 'never',
                alternative_fix: offerColumnRemoval ? 'strip_column_with_user_approval' : null
              }));
          } else passed.push('No destructive blanks in "' + col + '"');
        });
      }
    }

    /* Orphaned variants + option name consistency */
    const handleOpts = {};
    let orphaned = 0;
    const orphanedRows = [];
    state.rows.forEach((row, i) => {
      const h = row['Handle'], o1n = row['Option1 Name'], o1v = row['Option1 Value'], n = i + 2;
      if (!isBlank(o1n) || !isBlank(o1v)) {
        if (isBlank(h)) {
          orphaned++;
          orphanedRows.push({ row: n, option_name: o1n || '', option_value: o1v || '', sku: row['Variant SKU'] || '' });
        } else {
          if (!handleOpts[h]) handleOpts[h] = {};
          if (!isBlank(o1n)) handleOpts[h][o1n] = true;
        }
      }
    });
    if (orphaned > 0) {
      const n = orphaned;
      issues.push(makeIssue('critical', 'VARIANT_ORPHANED', 'Variant row without a parent product', {
        what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'has', 'have') + ' variant data but no handle.',
        why_it_matters: 'Shopify cannot attach this variant to a product.',
        suggested_action: 'Add the same Handle as the parent product.',
        affected_rows: orphanedRows.slice(0, 10)
      }));
    } else passed.push('No orphaned variant rows');

    Object.keys(handleOpts).forEach(h => {
      const names = Object.keys(handleOpts[h]);
      if (names.length > 1) {
        issues.push(makeIssue('critical', 'VARIANT_OPTION_NAME_INCONSISTENT', 'Inconsistent option names for handle "' + h + '"', {
          what_is_wrong: 'Handle "' + h + '" has different option names: ' + names.join(', ') + '.',
          why_it_matters: 'Shopify cannot resolve variant relationships.',
          suggested_action: 'Use the same option name for all variant rows of the same product.'
        }));
      }
    });

    /* Duplicate option combinations */
    const combosByHandle = {};
    state.rows.forEach((row, i) => {
      const h = row['Handle'];
      if (isBlank(h)) return;
      const o1v = row['Option1 Value'] || '';
      const o2v = row['Option2 Value'] || '';
      const o3v = row['Option3 Value'] || '';
      if (isBlank(o1v) && isBlank(o2v) && isBlank(o3v)) return;
      const key = [o1v, o2v, o3v].join('|');
      if (!combosByHandle[h]) combosByHandle[h] = {};
      if (!combosByHandle[h][key]) combosByHandle[h][key] = [];
      combosByHandle[h][key].push({ row: i + 2, combo: key.replace(/\|/g, ' / ').replace(/\s+\/\s+$/, '').replace(/\s+\/$/, '') });
    });
    const dupComboGroups = [];
    Object.keys(combosByHandle).forEach(h => {
      Object.keys(combosByHandle[h]).forEach(k => {
        const entries = combosByHandle[h][k];
        if (entries.length > 1) dupComboGroups.push({ handle: h, combo: entries[0].combo, rows: entries.map(e => e.row) });
      });
    });
    if (dupComboGroups.length > 0) {
      const n = dupComboGroups.length;
      const flat = [];
      dupComboGroups.slice(0, 10).forEach(d => {
        d.rows.forEach(r => flat.push({ row: r, handle: d.handle, option_combo: d.combo }));
      });
      issues.push(makeIssue('critical', 'VARIANT_DUPLICATE_OPTION_COMBINATION', 'Duplicate option combinations for ' + pcount(n, 'variant'), {
        what_is_wrong: pcount(n, 'option combination') + ' ' + v(n, 'appears', 'appear') + ' on multiple rows of the same product.',
        why_it_matters: 'Shopify treats each option combination (e.g. Size=Small + Color=Blue) as a unique variant. Duplicates cause Shopify to silently drop one variant, even when SKUs differ.',
        suggested_action: 'Remove the duplicate rows, or change their option values so each combination is unique.',
        affected_rows: flat, auto_fix: 'never'
      }));
    } else passed.push('No duplicate variant option combinations');

    /* Partial collapse */
    const partial = [];
    state.rows.forEach((row, i) => {
      for (let n = 1; n <= 3; n++) {
        const nameKey = 'Option' + n + ' Name';
        const valKey = 'Option' + n + ' Value';
        if (state.headers.indexOf(nameKey) === -1 || state.headers.indexOf(valKey) === -1) continue;
        const nv = row[nameKey]; const vv = row[valKey];
        if (isBlank(nv) !== isBlank(vv)) {
          partial.push({ row: i + 2, handle: row['Handle'] || '(no handle)', option: 'Option' + n, name: nv || '(blank)', value: vv || '(blank)' });
          break;
        }
      }
    });
    if (partial.length > 0) {
      const n = partial.length;
      issues.push(makeIssue('critical', 'VARIANT_PARTIAL_COLLAPSE', 'Incomplete option data for ' + pcount(n, 'row'), {
        what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'has', 'have') + ' an option Name without a Value, or a Value without a Name.',
        why_it_matters: 'Shopify needs both to construct a variant. An incomplete option pair can cause the multi-variant product to collapse into a single variant.',
        suggested_action: 'Fill in both the Name and Value for each option used on a row.',
        affected_rows: partial.slice(0, 10)
      }));
    } else passed.push('All option rows have matching Name and Value');

    /* Variant column inconsistency */
    const handleVariantCols = {};
    state.rows.forEach((row, i) => {
      const h = row['Handle'];
      if (isBlank(h)) return;
      if (rowTypes.isImage[i]) return;
      if (!handleVariantCols[h]) handleVariantCols[h] = { rows: [], populated: {} };
      handleVariantCols[h].rows.push(i + 2);
      VARIANT_OPTION_COLUMNS.forEach(col => {
        if (state.headers.indexOf(col) === -1) return;
        if (!isBlank(row[col])) {
          if (!handleVariantCols[h].populated[col]) handleVariantCols[h].populated[col] = 0;
          handleVariantCols[h].populated[col]++;
        }
      });
    });
    const colInconsistencies = [];
    Object.keys(handleVariantCols).forEach(h => {
      const info = handleVariantCols[h];
      const rowCount = info.rows.length;
      if (rowCount < 2) return;
      const colsWithData = Object.keys(info.populated);
      if (!colsWithData.length) return;
      const inconsistentCols = colsWithData.filter(col => info.populated[col] !== rowCount);
      if (inconsistentCols.length > 0) {
        colInconsistencies.push({ handle: h, rows: info.rows, totalRows: rowCount, columns: inconsistentCols.map(c => c + ' (' + info.populated[c] + '/' + rowCount + ')') });
      }
    });
    if (colInconsistencies.length > 0) {
      const n = colInconsistencies.length;
      const flat = [];
      colInconsistencies.slice(0, 10).forEach(c => {
        c.rows.forEach(r => flat.push({ row: r, handle: c.handle, inconsistency: c.columns.join(', ') }));
      });
      issues.push(makeIssue('critical', 'VARIANT_COLUMN_INCONSISTENCY', 'Variant column inconsistency for ' + pcount(n, 'product'), {
        what_is_wrong: pcount(n, 'product') + ' ' + v(n, 'has', 'have') + ' variant rows where some rows fill an option column and others leave it blank.',
        why_it_matters: 'Shopify expects every variant row of a product to fill the same option columns. When columns are partially populated, Shopify may collapse the multi-variant product into a single variant.',
        suggested_action: 'Fill the same option columns on every variant row of each product, or leave them consistently blank.',
        affected_rows: flat, auto_fix: 'never'
      }));
    } else passed.push('Variant option columns consistent across rows');

    /* Image rows with variant data */
    const imageDirty = imageRowsWithExtraData();
    if (imageDirty.length > 0) {
      const n = imageDirty.length;
      issues.push(makeIssue('critical', 'IMAGE_ROW_VARIANT_DATA', 'Image rows contain extra variant data in ' + pcount(n, 'row'), {
        what_is_wrong: pcount(n, 'image row') + ' include data in columns that should be blank (Title, Variant SKU, Variant Price, Option values, etc.).',
        why_it_matters: 'Shopify expects image rows to have ONLY Handle and Image Src filled. Extra data causes Shopify to try creating duplicate variants, which fails with "The variant \'Default Title\' already exists" or silently deletes existing variants.',
        suggested_action: 'Autonom can clear all columns except Handle and Image Src on these rows.',
        affected_rows: imageDirty.slice(0, 10).map(d => ({ row: d.row, handle: d.handle, columns_with_data: d.columns.join(', ') })),
        auto_fix: 'review_required', shopify_doc_url: SHOPIFY_DOC_URL
      }));
    } else passed.push('No image rows with stray variant data');

    /* Single-variant multi-image */
    const svmi = singleVariantMultipleImages();
    if (svmi.length > 0) {
      const n = svmi.length;
      issues.push(makeIssue('critical', 'SINGLE_VARIANT_MULTIPLE_IMAGES', 'Missing Option1 declaration for ' + pcount(n, 'product with multiple images'), {
        what_is_wrong: pcount(n, 'single-variant product') + ' ' + v(n, 'has', 'have') + ' multiple image rows but no Option1 Name/Value on the parent row.',
        why_it_matters: 'When a single-variant product has multiple images, Shopify needs Option1 Name="Title" and Option1 Value="Default Title" on the parent row. Without these, Shopify treats each image row as a duplicate variant, causing "The variant \'Default Title\' already exists" errors.',
        suggested_action: 'Autonom can set Option1 Name="Title" and Option1 Value="Default Title" on the parent row.',
        affected_rows: svmi.slice(0, 10).map(d => ({ row: d.row, handle: d.handle, image_rows: d.imageCount })),
        auto_fix: 'review_required', shopify_doc_url: SHOPIFY_DOC_URL
      }));
    } else passed.push('Single-variant products with images are properly configured');

    /* Duplicate image rows */
    const dupImgs = duplicateImageRows();
    if (dupImgs.length > 0) {
      const n = dupImgs.length;
      issues.push(makeIssue('warning', 'DUPLICATE_IMAGE_ROWS', 'Duplicate image rows in ' + pcount(n, 'location'), {
        what_is_wrong: pcount(n, 'image row') + ' ' + v(n, 'duplicates', 'duplicate') + ' an earlier image URL for the same product.',
        why_it_matters: 'Shopify may attach the same image multiple times, or reject the duplicate rows.',
        suggested_action: 'Autonom can remove the duplicate rows.',
        affected_rows: dupImgs.slice(0, 10).map(d => ({ row: d.row, handle: d.handle, duplicates_row: d.duplicateOf, url: d.url })),
        auto_fix: 'safe_automatic'
      }));
    } else passed.push('No duplicate image rows');

    /* Inventory tracker set but qty blank */
    if (state.headers.indexOf('Variant Inventory Tracker') !== -1 && state.headers.indexOf('Variant Inventory Qty') !== -1) {
      const missingQty = [];
      state.rows.forEach((row, i) => {
        if (rowTypes.isImage[i]) return;
        const tracker = row['Variant Inventory Tracker'];
        const qty = row['Variant Inventory Qty'];
        if (!isBlank(tracker) && isBlank(qty)) missingQty.push({ row: i + 2, handle: row['Handle'] || '(no handle)', tracker });
      });
      if (missingQty.length > 0) {
        const n = missingQty.length;
        issues.push(makeIssue('warning', 'INVENTORY_QTY_MISSING_WITH_TRACKER', 'Inventory quantity missing where tracker is set in ' + pcount(n, 'row'), {
          what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'has', 'have') + ' a "Variant Inventory Tracker" value but no "Variant Inventory Qty".',
          why_it_matters: 'Shopify requires a quantity when a tracker is set. The import may fail or the row may be rejected.',
          suggested_action: 'Autonom can set the missing quantity to 0 (the safest default).',
          affected_rows: missingQty.slice(0, 10), auto_fix: 'review_required'
        }));
      } else passed.push('All rows with inventory tracker have a quantity');
    }

    /* Inventory qty set but tracker blank */
    if (state.headers.indexOf('Variant Inventory Qty') !== -1 && state.headers.indexOf('Variant Inventory Tracker') !== -1) {
      const missingTracker = [];
      state.rows.forEach((row, i) => {
        if (rowTypes.isImage[i]) return;
        const qty = row['Variant Inventory Qty'];
        const tracker = row['Variant Inventory Tracker'];
        if (!isBlank(qty) && isBlank(tracker)) missingTracker.push({ row: i + 2, handle: row['Handle'] || '(no handle)', qty });
      });
      if (missingTracker.length > 0) {
        const n = missingTracker.length;
        issues.push(makeIssue('warning', 'INVENTORY_TRACKER_MISSING', 'Inventory quantity set without a tracker on ' + pcount(n, 'row'), {
          what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'has', 'have') + ' an inventory quantity but no "Variant Inventory Tracker" value.',
          why_it_matters: 'Shopify silently ignores inventory updates when no tracker is specified. The quantity will not be applied to your store.',
          suggested_action: 'Set "Variant Inventory Tracker" to "shopify" on every row that includes inventory.',
          affected_rows: missingTracker.slice(0, 10), auto_fix: 'never'
        }));
      } else passed.push('Inventory tracker set on all rows with quantity');
    }

    /* Boolean format */
    const boolIssues = [];
    BOOLEAN_COLUMNS.forEach(col => {
      if (state.headers.indexOf(col) === -1) return;
      state.rows.forEach((row, i) => {
        if (rowTypes.isImage[i]) return;
        const val = row[col];
        if (isBlank(val)) return;
        const norm = normalizeBoolean(val);
        if (norm === null) boolIssues.push({ row: i + 2, column: col, value: String(val) });
      });
    });
    if (boolIssues.length > 0) {
      const n = boolIssues.length;
      issues.push(makeIssue('warning', 'BOOLEAN_FORMAT', 'Non-standard boolean value on ' + pcount(n, 'row'), {
        what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'uses', 'use') + ' a non-standard value in a boolean column (Published, Variant Requires Shipping, etc.).',
        why_it_matters: 'Shopify expects TRUE or FALSE (uppercase). Values like 1/0/yes/no may be ignored, causing the wrong published status.',
        suggested_action: 'Autonom can convert these to TRUE or FALSE.',
        affected_rows: boolIssues.slice(0, 10), auto_fix: 'safe_automatic'
      }));
    } else if (BOOLEAN_COLUMNS.some(c => state.headers.indexOf(c) !== -1)) passed.push('All boolean columns use TRUE/FALSE');

    /* Product Category format */
    if (state.headers.indexOf('Product Category') !== -1) {
      const badCat = [];
      state.rows.forEach((row, i) => {
        if (rowTypes.isImage[i]) return;
        const val = row['Product Category'];
        if (isBlank(val)) return;
        if (!isValidCategoryFormat(val)) badCat.push({ row: i + 2, value: String(val).substring(0, 80) });
      });
      if (badCat.length > 0) {
        const n = badCat.length;
        issues.push(makeIssue('info', 'PRODUCT_CATEGORY_FORMAT', 'Product Category format may be invalid in ' + pcount(n, 'cell'), {
          what_is_wrong: pcount(n, 'Product Category value') + ' ' + v(n, 'doesn\'t', 'don\'t') + ' match Shopify\'s expected format.',
          why_it_matters: 'Shopify expects the full taxonomy breadcrumb (e.g. "Apparel & Accessories > Clothing > Shirts & Tops") or a category ID. Free-text values like "Shirts" are rejected, and the product may end up uncategorized.',
          suggested_action: 'Use Shopify\'s category picker and export one product to see the exact format, then paste those values here.',
          affected_rows: badCat.slice(0, 10), auto_fix: 'never'
        }));
      } else passed.push('All Product Category values look valid');
    }

    /* Row order warning */
    const handleOrder = [];
    const seenHandles = new Set();
    state.rows.forEach(row => {
      const h = row['Handle'];
      if (isBlank(h)) return;
      if (!seenHandles.has(h)) { seenHandles.add(h); handleOrder.push(h); }
      else if (handleOrder[handleOrder.length - 1] !== h) handleOrder.push('__scattered__');
    });
    if (handleOrder.indexOf('__scattered__') !== -1) {
      issues.push(makeIssue('info', 'ROW_ORDER_WARNING', 'Variant rows for the same product are not grouped together', {
        what_is_wrong: 'Rows sharing a Handle are not adjacent in the file.',
        why_it_matters: 'Shopify can still process the import, but the row order may affect how images and options get attached. Grouping rows by Handle is the recommended approach.',
        suggested_action: 'Sort the file by Handle before import, keeping variant rows of the same product together.',
        auto_fix: 'never'
      }));
    } else passed.push('Variant rows grouped by Handle');

    /* Prices */
    const priceIssuesNonNum = [];
    const priceIssuesComma = [];
    const priceIssuesCurrency = [];
    const priceIssuesNegative = [];
    const PRICE_COLS = ['Variant Price', 'Variant Compare At Price'];
    state.rows.forEach((row, i) => {
      if (rowTypes.isImage[i]) return;
      PRICE_COLS.forEach(col => {
        if (state.headers.indexOf(col) === -1) return;
        const raw = row[col];
        if (isBlank(raw)) return;
        const a = analyzePrice(raw);
        if (a.hasCurrency) priceIssuesCurrency.push({ row: i + 2, column: col, value: String(raw) });
        if (a.commaDecimal) priceIssuesComma.push({ row: i + 2, column: col, value: String(raw), normalized: a.normalized });
        if (!a.parseable) priceIssuesNonNum.push({ row: i + 2, column: col, value: String(raw) });
        else if (a.value < 0) priceIssuesNegative.push({ row: i + 2, column: col, value: String(raw) });
      });
    });

    if (priceIssuesCurrency.length > 0) {
      const n = priceIssuesCurrency.length;
      issues.push(makeIssue('warning', 'PRICE_CURRENCY_SYMBOL', 'Currency symbols in ' + pcount(n, 'price cell'), {
        what_is_wrong: pcount(n, 'price cell') + ' ' + v(n, 'contains', 'contain') + ' currency symbols like $, €, or £.',
        why_it_matters: 'Shopify expects a plain number. Currency symbols cause the row to be rejected or the price to be misread.',
        suggested_action: 'Autonom can strip currency symbols and leave the numeric value.',
        affected_rows: priceIssuesCurrency.slice(0, 10), auto_fix: 'safe_automatic'
      }));
    }

    if (priceIssuesComma.length > 0) {
      const n = priceIssuesComma.length;
      issues.push(makeIssue('warning', 'PRICE_DECIMAL_COMMA', 'Comma-decimal prices detected in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'price') + ' ' + v(n, 'uses', 'use') + ' a comma as the decimal separator (e.g. "19,99").',
        why_it_matters: 'Shopify expects a dot as the decimal separator. Commas are read as thousands separators or rejected.',
        suggested_action: 'Autonom can convert comma decimals to dots. Review the proposed values.',
        affected_rows: priceIssuesComma.slice(0, 10), auto_fix: 'review_required'
      }));
    }

    if (priceIssuesNonNum.length > 0) {
      const n = priceIssuesNonNum.length;
      issues.push(makeIssue('warning', 'PRICE_NON_NUMERIC', 'Non-numeric price value in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'price cell') + ' could not be parsed as a number.',
        why_it_matters: 'Shopify will reject or ignore these rows.',
        suggested_action: 'Enter a plain numeric value (e.g. 19.99).',
        affected_rows: priceIssuesNonNum.slice(0, 10)
      }));
    } else if (state.headers.indexOf('Variant Price') !== -1) passed.push('All prices numeric');

    if (priceIssuesNegative.length > 0) {
      const n = priceIssuesNegative.length;
      issues.push(makeIssue('warning', 'PRICE_NEGATIVE', 'Negative price value in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'price') + ' ' + v(n, 'is', 'are') + ' negative.',
        why_it_matters: 'Shopify may reject these rows or display incorrect pricing.',
        suggested_action: 'Confirm the negative price is intentional, or correct it.',
        affected_rows: priceIssuesNegative.slice(0, 10)
      }));
    }

    /* Compare-at */
    const compareIssues = [];
    if (state.headers.indexOf('Variant Price') !== -1 && state.headers.indexOf('Variant Compare At Price') !== -1) {
      const firstRowByHandle = {};
      state.rows.forEach((row, i) => {
        const h = row['Handle'];
        if (isBlank(h)) return;
        if (h in firstRowByHandle) return;
        firstRowByHandle[h] = i;
      });
      Object.keys(firstRowByHandle).forEach(h => {
        const i = firstRowByHandle[h];
        const row = state.rows[i];
        const pa = analyzePrice(row['Variant Price']);
        const ca = analyzePrice(row['Variant Compare At Price']);
        if (pa.parseable && ca.parseable && ca.value > 0 && ca.value <= pa.value) {
          compareIssues.push({ row: i + 2, handle: h, price: row['Variant Price'], compare_at: row['Variant Compare At Price'] });
        }
      });
    }
    if (compareIssues.length > 0) {
      const n = compareIssues.length;
      issues.push(makeIssue('critical', 'COMPARE_AT_PRICE_LOWER_THAN_PRICE', 'Compare-at price lower than price for ' + pcount(n, 'product'), {
        what_is_wrong: pcount(n, 'product') + ' ' + v(n, 'has', 'have') + ' a compare-at price that is lower than or equal to the actual price.',
        why_it_matters: 'Shopify rejects this combination or displays an incorrect sale badge. The compare-at price must be higher than the current price.',
        suggested_action: 'Set the compare-at price higher than the current price, or clear it.',
        affected_rows: compareIssues.slice(0, 10), auto_fix: 'never'
      }));
    } else passed.push('Compare-at prices are consistent with prices');

    /* Inventory integers */
    const nonInt = [];
    const negInv = [];
    state.rows.forEach((row, i) => {
      if (rowTypes.isImage[i]) return;
      const q = row['Variant Inventory Qty'];
      if (isBlank(q)) return;
      const n = Number(String(q).trim());
      if (isNaN(n) || !Number.isInteger(n)) nonInt.push({ row: i + 2, value: q });
      else if (n < 0) negInv.push({ row: i + 2, value: q });
    });
    if (nonInt.length > 0) {
      const n = nonInt.length;
      issues.push(makeIssue('warning', 'INVENTORY_NON_INTEGER', 'Non-integer inventory value in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'inventory cell') + ' ' + v(n, 'is', 'are') + ' not a whole number.',
        why_it_matters: 'Shopify expects integers.',
        suggested_action: 'Enter a whole number.',
        affected_rows: nonInt.slice(0, 10)
      }));
    } else if (state.headers.indexOf('Variant Inventory Qty') !== -1) passed.push('All inventory values are integers');

    if (negInv.length > 0) {
      const n = negInv.length;
      issues.push(makeIssue('warning', 'INVENTORY_NEGATIVE', 'Negative inventory value in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'inventory cell') + ' ' + v(n, 'is', 'are') + ' negative.',
        why_it_matters: 'Shopify may reject or misinterpret negative inventory.',
        suggested_action: 'Verify the value is intentional (e.g. backorder tracking), or correct it.',
        affected_rows: negInv.slice(0, 10)
      }));
    }

    /* HTML */
    const unclosed = [], dangerous = [];
    state.rows.forEach((row, i) => {
      const html = row['Body (HTML)'];
      if (isBlank(html)) return;
      const text = String(html);
      const dm = text.match(/<(script|iframe|object|embed)\b/i);
      if (dm) dangerous.push({ row: i + 2, match: dm[1] });
      const re = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
      const stack = [];
      let m;
      while ((m = re.exec(text)) !== null) {
        const full = m[0], tag = m[1].toLowerCase();
        if (/^<\//.test(full)) {
          if (stack.length && stack[stack.length - 1] === tag) stack.pop();
        } else if (!/\/>$/.test(full)) stack.push(tag);
      }
      if (stack.length > 0) unclosed.push({ row: i + 2, tag: stack[stack.length - 1] });
    });
    if (unclosed.length > 0) {
      const n = unclosed.length;
      issues.push(makeIssue('warning', 'HTML_UNCLOSED_TAG', 'Unclosed HTML tag in ' + pcount(n, 'description'), {
        what_is_wrong: pcount(n, 'description') + ' ' + v(n, 'has', 'have') + ' unclosed HTML.',
        why_it_matters: 'Unclosed tags may break your storefront layout.',
        suggested_action: 'Autonom can attempt to repair the HTML.',
        affected_rows: unclosed.slice(0, 10), auto_fix: 'review_required'
      }));
    } else if (state.headers.indexOf('Body (HTML)') !== -1) passed.push('No unclosed HTML tags');

    if (dangerous.length > 0) {
      const n = dangerous.length;
      issues.push(makeIssue('warning', 'HTML_DANGEROUS_ATTRIBUTE', 'Potentially unsafe HTML tag in ' + pcount(n, 'description'), {
        what_is_wrong: pcount(n, 'description') + ' ' + v(n, 'contains', 'contain') + ' tags that can execute code.',
        why_it_matters: 'These may be blocked by Shopify or cause security warnings.',
        suggested_action: 'Remove the tag or replace with plain text.',
        affected_rows: dangerous.slice(0, 10)
      }));
    }

    /* Images */
    const httpImgs = [];
    const noExtImgs = [];
    const privateCdnImgs = [];
    const malformedImgs = [];
    state.rows.forEach((row, i) => {
      const url = row['Image Src'];
      if (isBlank(url)) return;
      const s = String(url).trim();
      if (/^http:\/\//i.test(s)) httpImgs.push({ row: i + 2, url: s });
      let parsed = null;
      try { parsed = new URL(s); } catch (e) { malformedImgs.push({ row: i + 2, url: s }); }
      if (parsed) {
        if (PRIVATE_CDN_PATTERN.test(parsed.hostname)) privateCdnImgs.push({ row: i + 2, url: s, host: parsed.hostname });
        if (!IMAGE_EXTENSIONS.test(parsed.pathname)) noExtImgs.push({ row: i + 2, url: s });
      }
    });

    if (httpImgs.length > 0) {
      const n = httpImgs.length;
      issues.push(makeIssue('warning', 'IMAGE_URL_NOT_HTTPS', 'Image URL does not use HTTPS in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'image URL') + ' ' + v(n, 'does', 'do') + ' not use https://.',
        why_it_matters: 'Shopify requires HTTPS for product images.',
        suggested_action: 'Autonom can upgrade http:// to https://.',
        affected_rows: httpImgs.slice(0, 10), auto_fix: 'review_required'
      }));
    } else if (state.headers.indexOf('Image Src') !== -1) passed.push('All image URLs use HTTPS');

    if (noExtImgs.length > 0) {
      const n = noExtImgs.length;
      issues.push(makeIssue('warning', 'IMAGE_URL_NO_EXTENSION', 'Image URL without a file extension in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'image URL') + ' ' + v(n, 'doesn\'t', 'don\'t') + ' end in a recognizable image extension (.jpg, .png, .webp).',
        why_it_matters: 'Shopify may not be able to download and store these images.',
        suggested_action: 'Use direct image URLs that end in .jpg, .png, .webp, or .gif.',
        affected_rows: noExtImgs.slice(0, 10)
      }));
    }

    if (privateCdnImgs.length > 0) {
      const n = privateCdnImgs.length;
      issues.push(makeIssue('warning', 'IMAGE_URL_PRIVATE_CDN', 'Image URL points to a private or local address in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'image URL') + ' ' + v(n, 'points', 'point') + ' to localhost, a private IP, or an internal hostname.',
        why_it_matters: 'Shopify cannot access these URLs. The images will fail to import.',
        suggested_action: 'Host the images on a public CDN or your Shopify Files, then paste the new URL.',
        affected_rows: privateCdnImgs.slice(0, 10)
      }));
    }

    if (malformedImgs.length > 0) {
      const n = malformedImgs.length;
      issues.push(makeIssue('warning', 'IMAGE_URL_MALFORMED', 'Image URL could not be parsed in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'image URL') + ' ' + v(n, 'is', 'are') + ' not a valid URL.',
        why_it_matters: 'Shopify will not be able to download these images.',
        suggested_action: 'Verify the URL is complete (starts with https://).',
        affected_rows: malformedImgs.slice(0, 10)
      }));
    }

    /* Status */
    if (state.headers.indexOf('Status') !== -1) {
      const invalidS = [];
      state.rows.forEach((row, i) => {
        if (rowTypes.isImage[i]) return;
        const s = row['Status'];
        if (isBlank(s)) return;
        if (['active', 'draft', 'archived'].indexOf(String(s).trim().toLowerCase()) === -1)
          invalidS.push({ row: i + 2, value: s });
      });
      if (invalidS.length > 0) {
        const n = invalidS.length;
        issues.push(makeIssue('warning', 'STATUS_INVALID_VALUE', 'Invalid status value in ' + pcount(n, 'cell'), {
          what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'has', 'have') + ' an invalid status.',
          why_it_matters: 'Shopify may reject these rows.',
          suggested_action: 'Use one of: active, draft, archived.',
          affected_rows: invalidS.slice(0, 10)
        }));
      } else passed.push('All status values valid');
    }

    /* Field count */
    if (state.parseFieldMismatches > 0) {
      const n = state.parseFieldMismatches;
      issues.push(makeIssue('info', 'FIELD_COUNT_MISMATCH', 'CSV row field count mismatch in ' + pcount(n, 'row'), {
        what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'has', 'have') + ' a different number of fields than the header row.',
        why_it_matters: 'This usually means unquoted commas in Tags, Body HTML, or other text cells. The affected rows may be missing data or shifted columns.',
        suggested_action: 'Re-export the file from your spreadsheet tool with proper quoting, or check the flagged rows.',
        auto_fix: 'never'
      }));
    }

    return { issues, passed };
  }

  function calculateImpact() {
    const handles = {};
    state.rows.forEach(row => {
      if (isBlank(row['Handle'])) return;
      const h = row['Handle'];
      if (!handles[h]) handles[h] = { prices: {}, inv: {} };
      if (!isBlank(row['Variant Price'])) handles[h].prices[row['Variant Price']] = true;
      if (!isBlank(row['Variant Inventory Qty'])) handles[h].inv[row['Variant Inventory Qty']] = true;
    });
    let changedPrices = 0, changedInv = 0;
    Object.values(handles).forEach(e => {
      if (Object.keys(e.prices).length > 1) changedPrices++;
      if (Object.keys(e.inv).length > 1) changedInv++;
    });
    let blankCount = 0;
    if (state.mode === 'existing_products') {
      SENSITIVE_COLUMNS.forEach(col => {
        if (state.headers.indexOf(col) === -1) return;
        state.rows.forEach(row => { if (isBlank(row[col])) blankCount++; });
      });
    }
    return { matching_handles: Object.keys(handles).length, changed_prices: changedPrices, changed_inventory: changedInv, blank_included_values: blankCount };
  }

  function buildResult(issues, passed) {
    const counts = { critical: 0, warning: 0, info: 0 };
    issues.forEach(i => { counts[i.severity] = (counts[i.severity] || 0) + 1; });
    let status = 'READY_FOR_REVIEW';
    if (counts.critical > 0) status = 'NOT_READY';
    else if (counts.warning > 0) status = 'READY_WITH_WARNINGS';
    return {
      status, tool: 'shopify-guard', tool_version: '1.7.3',
      profile: 'shopify-product-csv', profile_version: '2025-01',
      mode: state.mode, detected_mode: state.detectedMode, detected_confidence: state.detectedConfidence,
      summary: { critical: counts.critical, warnings: counts.warning, info: counts.info, passed: passed.length, rows_scanned: state.rows.length, columns_detected: state.headers.length },
      issues, passed_checks: passed,
      potential_impact: state.mode === 'existing_products' ? calculateImpact() : null,
      technical_metadata: { file_name: state.fileName, byte_size: state.fileSize, encoding: state.detectedEncoding, has_bom: state.hasBOM }
    };
  }

  function planRepairs() {
    const safe = [], review = [], never = [];
    state.result.issues.forEach(i => {
      if (i.auto_fix === 'safe_automatic') safe.push(i);
      else if (i.auto_fix === 'review_required') review.push(i);
      else never.push(i);
    });
    return { safe, review, never };
  }

  function buildCorrectedCSV() {
    const accepted = state.acceptedRepairs || {};
    const rows = state.rows.map(r => Object.assign({}, r));
    const headers = state.headers.slice();
    const changeLog = [];
    const appliedCodes = new Set();

    function hasCol(col) { return headers.indexOf(col) !== -1; }

    /* ---- SAFE AUTOMATIC ---- */

    if (state.hasBOM) {
      changeLog.push({ row: 'all', column: '(file)', before: 'BOM present', after: 'BOM removed', reason: 'Stripped UTF-8 byte-order mark' });
      appliedCodes.add('ENCODING_BOM_PRESENT');
    }
    if (state.detectedEncoding !== 'UTF-8') {
      changeLog.push({ row: 'all', column: '(file)', before: state.detectedEncoding, after: 'UTF-8', reason: 'Converted encoding to UTF-8' });
      appliedCodes.add('ENCODING_NOT_UTF8');
    }

    let smartQuoteTouched = false;
    rows.forEach((row, i) => {
      for (const key of Object.keys(row)) {
        const val = row[key];
        if (val == null) continue;
        const before = String(val);
        if (SMART_QUOTE_CHARS.test(before)) {
          const after = smartQuotesToStraight(before);
          if (after !== before) {
            row[key] = after;
            changeLog.push({ row: i + 2, column: key, before: before.substring(0, 80), after: after.substring(0, 80), reason: 'Replaced smart quotes' });
            smartQuoteTouched = true;
          }
        }
      }
    });
    if (smartQuoteTouched) appliedCodes.add('SMART_QUOTES_DETECTED');

    let whitespaceTouched = false;
    rows.forEach((row, i) => {
      for (const col of TEXT_COLUMNS_FOR_WHITESPACE) {
        if (state.headers.indexOf(col) === -1) continue;
        const val = row[col];
        if (val == null) continue;
        const before = String(val);
        const after = before.trim();
        if (after !== before && after !== '') {
          row[col] = after;
          changeLog.push({ row: i + 2, column: col, before, after, reason: 'Trimmed whitespace' });
          whitespaceTouched = true;
        }
      }
    });
    if (whitespaceTouched) appliedCodes.add('CELL_WHITESPACE');

    let currencyTouched = false;
    rows.forEach((row, i) => {
      ['Variant Price', 'Variant Compare At Price', 'Cost per item'].forEach(col => {
        if (state.headers.indexOf(col) === -1) return;
        const val = row[col];
        if (val == null || val === '') return;
        const before = String(val);
        if (CURRENCY_SYMBOLS.test(before)) {
          const after = stripCurrencySymbols(before);
          row[col] = after;
          changeLog.push({ row: i + 2, column: col, before, after, reason: 'Stripped currency symbol' });
          currencyTouched = true;
        }
      });
    });
    if (currencyTouched) appliedCodes.add('PRICE_CURRENCY_SYMBOL');

    let boolTouched = false;
    BOOLEAN_COLUMNS.forEach(col => {
      if (state.headers.indexOf(col) === -1) return;
      rows.forEach((row, i) => {
        const val = row[col];
        if (isBlank(val)) return;
        const norm = normalizeBoolean(val);
        if (norm !== null && norm !== String(val).trim()) {
          const before = String(val);
          row[col] = norm;
          changeLog.push({ row: i + 2, column: col, before, after: norm, reason: 'Normalized boolean value' });
          boolTouched = true;
        }
      });
    });
    if (boolTouched) appliedCodes.add('BOOLEAN_FORMAT');

    let handleNormTouched = false;
    rows.forEach((row, i) => {
      const h = row['Handle'];
      if (isBlank(h)) return;
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(h)) {
        const before = h;
        const after = toHandle(h);
        if (after && after !== before) {
          row['Handle'] = after;
          changeLog.push({ row: i + 2, column: 'Handle', before, after, reason: 'Normalized handle format' });
          handleNormTouched = true;
        }
      }
    });
    if (handleNormTouched) appliedCodes.add('HANDLE_FORMAT_INVALID');

    const dupImgsToRemove = duplicateImageRows();
    if (dupImgsToRemove.length > 0 && hasCol('Image Src')) {
      const toRemove = new Set(dupImgsToRemove.map(d => d.row - 2));
      const kept = [];
      rows.forEach((r, i) => {
        if (toRemove.has(i)) {
          changeLog.push({ row: i + 2, column: 'Image Src', before: r['Image Src'] || '', after: '(row removed)', reason: 'Removed duplicate image row' });
        } else kept.push(r);
      });
      rows.length = 0;
      kept.forEach(r => rows.push(r));
      appliedCodes.add('DUPLICATE_IMAGE_ROWS');
    }

    state.result.issues.forEach(issue => {
      if (issue.code === 'DESTRUCTIVE_BLANK_ALL_ROWS' && issue.auto_fix === 'safe_automatic') {
        const m = issue.title.match(/"([^"]+)"/);
        if (m) {
          const col = m[1];
          const idx = headers.indexOf(col);
          if (idx !== -1) {
            headers.splice(idx, 1);
            rows.forEach(r => delete r[col]);
            changeLog.push({ row: 'all', column: col, before: '(present)', after: '(removed)', reason: 'Entirely blank column' });
            appliedCodes.add('DESTRUCTIVE_BLANK_ALL_ROWS');
          }
        }
      }
    });

    /* ---- USER-APPROVED COLUMN REMOVALS ---- */
    Object.keys(accepted).forEach(key => {
      if (key.indexOf('REMOVE_COLUMN:') === 0 && accepted[key]) {
        const col = key.substring('REMOVE_COLUMN:'.length);
        const idx = headers.indexOf(col);
        if (idx !== -1) {
          headers.splice(idx, 1);
          rows.forEach(r => delete r[col]);
          changeLog.push({ row: 'all', column: col, before: '(included with blanks)', after: '(removed)', reason: 'Removed to prevent destructive overwrites' });
          appliedCodes.add('REMOVE_COLUMN:' + col);
        }
      }
    });

    /* ---- REVIEW-REQUIRED ---- */

    if (accepted['HANDLE_MISSING_NEW'] && hasCol('Handle') && hasCol('Title')) {
      let touched = false;
      rows.forEach((row, i) => {
        if (isBlank(row['Handle']) && !isBlank(row['Title'])) {
          const before = row['Handle'] || '';
          row['Handle'] = toHandle(row['Title']);
          changeLog.push({ row: i + 2, column: 'Handle', before: before || '(empty)', after: row['Handle'], reason: 'Generated from Title' });
          touched = true;
        }
      });
      if (touched) appliedCodes.add('HANDLE_MISSING_NEW');
    }

    if (accepted['IMAGE_URL_NOT_HTTPS'] && hasCol('Image Src')) {
      let touched = false;
      rows.forEach((row, i) => {
        const url = row['Image Src'];
        if (url != null && /^http:\/\//i.test(url)) {
          const before = url;
          row['Image Src'] = String(url).replace(/^http:\/\//i, 'https://');
          changeLog.push({ row: i + 2, column: 'Image Src', before, after: row['Image Src'], reason: 'Upgraded to HTTPS' });
          touched = true;
        }
      });
      if (touched) appliedCodes.add('IMAGE_URL_NOT_HTTPS');
    }

    if (accepted['HTML_UNCLOSED_TAG'] && hasCol('Body (HTML)')) {
      let touched = false;
      rows.forEach((row, i) => {
        const html = row['Body (HTML)'];
        if (isBlank(html)) return;
        const before = String(html);
        const after = repairHTML(before);
        if (after !== before) {
          row['Body (HTML)'] = after;
          changeLog.push({ row: i + 2, column: 'Body (HTML)', before, after, reason: 'Repaired unclosed HTML tags' });
          touched = true;
        }
      });
      if (touched) appliedCodes.add('HTML_UNCLOSED_TAG');
    }

    if (accepted['PRICE_DECIMAL_COMMA']) {
      let touched = false;
      rows.forEach((row, i) => {
        ['Variant Price', 'Variant Compare At Price'].forEach(col => {
          if (state.headers.indexOf(col) === -1) return;
          if (headers.indexOf(col) === -1) return;
          const val = row[col];
          if (val == null || val === '') return;
          const a = analyzePrice(val);
          if (a.commaDecimal && a.parseable) {
            const before = String(val);
            const after = String(a.value);
            row[col] = after;
            changeLog.push({ row: i + 2, column: col, before, after, reason: 'Converted comma decimal to dot' });
            touched = true;
          }
        });
      });
      if (touched) appliedCodes.add('PRICE_DECIMAL_COMMA');
    }

    if (accepted['IMAGE_ROW_VARIANT_DATA']) {
      let touched = false;
      const byHandle = {};
      rows.forEach((r, i) => {
        const h = r['Handle'];
        if (isBlank(h)) return;
        if (!byHandle[h]) byHandle[h] = [];
        byHandle[h].push({ idx: i, row: r });
      });
      const toClean = [];
      Object.keys(byHandle).forEach(h => {
        const entries = byHandle[h];
        const variantIdxs = [], imageIdxs = [];
        entries.forEach(e => {
          const rr = e.row;
          const hasSku = !isBlank(rr['Variant SKU']);
          const hasPrice = !isBlank(rr['Variant Price']);
          const hasOpt = !isBlank(rr['Option1 Value']);
          const hasTitle = !isBlank(rr['Title']);
          const hasImage = !isBlank(rr['Image Src']);
          if (hasSku || hasPrice || hasOpt) variantIdxs.push(e.idx);
          else if (hasImage && !hasTitle) imageIdxs.push(e.idx);
        });
        if (variantIdxs.length > 0) imageIdxs.forEach(idx => toClean.push(idx));
      });
      const colsToClear = ['Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
        'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
        'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Price',
        'Variant Compare At Price', 'Variant Inventory Qty', 'Status'];
      toClean.forEach(idx => {
        colsToClear.forEach(col => {
          if (state.headers.indexOf(col) === -1) return;
          if (!isBlank(rows[idx][col])) {
            changeLog.push({ row: idx + 2, column: col, before: String(rows[idx][col]).substring(0, 60), after: '(cleared)', reason: 'Cleared stray data from image row' });
            rows[idx][col] = '';
            touched = true;
          }
        });
      });
      if (touched) appliedCodes.add('IMAGE_ROW_VARIANT_DATA');
    }

    if (accepted['SINGLE_VARIANT_MULTIPLE_IMAGES']) {
      let touched = false;
      const byHandle = {};
      rows.forEach((r, i) => {
        const h = r['Handle'];
        if (isBlank(h)) return;
        if (!byHandle[h]) byHandle[h] = [];
        byHandle[h].push({ idx: i, row: r });
      });
      Object.keys(byHandle).forEach(h => {
        const entries = byHandle[h];
        const variantIdxs = [], imageIdxs = [];
        entries.forEach(e => {
          const rr = e.row;
          const hasSku = !isBlank(rr['Variant SKU']);
          const hasPrice = !isBlank(rr['Variant Price']);
          const hasOpt = !isBlank(rr['Option1 Value']);
          const hasTitle = !isBlank(rr['Title']);
          const hasImage = !isBlank(rr['Image Src']);
          if (hasSku || hasPrice || hasOpt) variantIdxs.push(e.idx);
          else if (hasImage && !hasTitle) imageIdxs.push(e.idx);
        });
        if (variantIdxs.length === 1 && imageIdxs.length > 0) {
          const pi = variantIdxs[0];
          const parent = rows[pi];
          if (isBlank(parent['Option1 Name']) && isBlank(parent['Option1 Value'])) {
            if (state.headers.indexOf('Option1 Name') !== -1 && headers.indexOf('Option1 Name') !== -1) {
              parent['Option1 Name'] = 'Title';
              changeLog.push({ row: pi + 2, column: 'Option1 Name', before: '(blank)', after: 'Title', reason: 'Set Title option for single-variant product' });
              touched = true;
            }
            if (state.headers.indexOf('Option1 Value') !== -1 && headers.indexOf('Option1 Value') !== -1) {
              parent['Option1 Value'] = 'Default Title';
              changeLog.push({ row: pi + 2, column: 'Option1 Value', before: '(blank)', after: 'Default Title', reason: 'Set Default Title for single-variant product' });
              touched = true;
            }
          }
        }
      });
      if (touched) appliedCodes.add('SINGLE_VARIANT_MULTIPLE_IMAGES');
    }

    if (accepted['INVENTORY_QTY_MISSING_WITH_TRACKER']) {
      let touched = false;
      if (state.headers.indexOf('Variant Inventory Qty') !== -1 && headers.indexOf('Variant Inventory Qty') !== -1) {
        rows.forEach((row, i) => {
          if (rowTypes_isImageRow(row)) return;
          const tracker = row['Variant Inventory Tracker'];
          const qty = row['Variant Inventory Qty'];
          if (!isBlank(tracker) && isBlank(qty)) {
            row['Variant Inventory Qty'] = '0';
            changeLog.push({ row: i + 2, column: 'Variant Inventory Qty', before: '(blank)', after: '0', reason: 'Set missing quantity to 0' });
            touched = true;
          }
        });
      }
      if (touched) appliedCodes.add('INVENTORY_QTY_MISSING_WITH_TRACKER');
    }

    if (accepted['SKU_DUPLICATE_IN_FILE'] && headers.indexOf('Variant SKU') !== -1) {
      let touched = false;
      const usedSkus = new Set();
      rows.forEach((row, i) => {
        const sku = row['Variant SKU'];
        if (isBlank(sku)) return;
        const before = String(sku).trim();
        const after = makeUniqueSku(before, usedSkus);
        if (after !== before) {
          row['Variant SKU'] = after;
          changeLog.push({ row: i + 2, column: 'Variant SKU', before, after, reason: 'Suffixed to make unique' });
          touched = true;
        }
      });
      if (touched) appliedCodes.add('SKU_DUPLICATE_IN_FILE');
    }

    const csv = (typeof Papa !== 'undefined' && Papa.unparse)
      ? Papa.unparse({ fields: headers, data: rows.map(r => headers.map(h => r[h] == null ? '' : r[h])) }, { quotes: true })
      : buildCSVManually(headers, rows);

    let finalCSV = csv;
    if (finalCSV.charCodeAt(0) === 0xFEFF) finalCSV = finalCSV.slice(1);

    return { csv: finalCSV, changeLog, appliedCodes };
  }

  function buildCSVManually(headers, rows) {
    const escape = val => {
      const s = val == null ? '' : String(val);
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const lines = [headers.map(escape).join(',')];
    rows.forEach(r => lines.push(headers.map(h => escape(r[h])).join(',')));
    return lines.join('\n');
  }

  function buildChangeLogCSV(log) {
    const lines = ['Row,Column,Before,After,Reason'];
    log.forEach(c => {
      const esc = val => '"' + String(val == null ? '' : val).replace(/"/g, '""') + '"';
      lines.push([c.row, c.column, c.before, c.after, c.reason].map(esc).join(','));
    });
    return lines.join('\n');
  }

  function buildReportHTML() {
    const r = state.result;
    let h = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Autonom Shopify Guard — Readiness Report</title>';
    h += '<style>body{font-family:-apple-system,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1a1d23;line-height:1.55;}h1{border-bottom:2px solid #1a1d23;padding-bottom:10px;}h2{margin-top:32px;font-size:18px;}table{width:100%;border-collapse:collapse;margin:12px 0;}th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #e1e4e9;font-size:13px;}th{background:#f7f8fa;}.critical{color:#d92b2b;font-weight:600;}.warning{color:#c47a00;font-weight:600;}.info{color:#4b5b74;}.passed{color:#17864a;}</style></head><body>';
    h += '<h1>Autonom Shopify Guard — Readiness Report</h1>';
    h += '<p><strong>File:</strong> ' + escapeHtml(r.technical_metadata.file_name) + '</p>';
    h += '<p><strong>Mode:</strong> ' + escapeHtml(r.mode) + (r.detected_mode ? ' (detected: ' + escapeHtml(r.detected_mode) + ', confidence: ' + escapeHtml(r.detected_confidence) + ')' : '') + '</p>';
    h += '<p><strong>Scan date:</strong> ' + new Date().toISOString() + '</p>';
    h += '<p><strong>Tool version:</strong> ' + r.tool_version + '</p>';
    h += '<h2>Status: ' + r.status.replace(/_/g, ' ') + '</h2>';
    h += '<p>Critical: <span class="critical">' + r.summary.critical + '</span> · Warnings: <span class="warning">' + r.summary.warnings + '</span> · Info: <span class="info">' + r.summary.info + '</span> · Passed: <span class="passed">' + r.summary.passed + '</span></p>';
    if (r.potential_impact) {
      h += '<h2>Potential Store Impact</h2><ul>';
      h += '<li>Products with matching handles: ' + r.potential_impact.matching_handles + '</li>';
      h += '<li>Products with changed prices: ' + r.potential_impact.changed_prices + '</li>';
      h += '<li>Products with changed inventory: ' + r.potential_impact.changed_inventory + '</li>';
      h += '<li>Products with blank included values: ' + r.potential_impact.blank_included_values + '</li>';
      h += '</ul>';
    }
    if (state.parseFieldMismatches > 0) {
      h += '<div style="background:#fdf6e6;border:1px solid #eedcb4;border-radius:8px;padding:16px;margin:20px 0;">';
      h += '<strong>⚠ Important limitation</strong>';
      h += '<p>This file contains ' + state.parseFieldMismatches + ' row(s) with a different number of columns than the header. Because we cannot reliably tell which column each cell belongs to, Autonom skipped its destructive-blank check.</p>';
      h += '<p>Please re-export the file from your spreadsheet tool with proper quoting, then re-run the scan.</p>';
      h += '</div>';
    }
    if (r.issues.length) {
      h += '<h2>Issues</h2>';
      r.issues.forEach((i, idx) => {
        h += '<h3 class="' + i.severity + '">' + (idx + 1) + '. ' + escapeHtml(i.title) + '</h3>';
        if (i.what_is_wrong) h += '<p><strong>What is wrong:</strong> ' + escapeHtml(i.what_is_wrong) + '</p>';
        if (i.why_it_matters) h += '<p><strong>Why it matters:</strong> ' + escapeHtml(i.why_it_matters) + '</p>';
        if (i.suggested_action) h += '<p><strong>Suggested action:</strong> ' + escapeHtml(i.suggested_action) + '</p>';
      });
    }
    h += '<h2>Checks Performed</h2><ul>';
    r.passed_checks.forEach(c => { h += '<li>' + escapeHtml(c) + '</li>'; });
    h += '</ul>';
    h += '<h2>Limitations</h2><p>Autonom does not know your store\'s current data. Autonom cannot guarantee Shopify will accept this import.</p>';
    h += '<hr><p style="color:#8a94a3;font-size:12px;">Generated locally in your browser.</p>';
    h += '</body></html>';
    return h;
  }

  /* ---------------- Row context ---------------- */
  function buildRowContext(affectedRows, columnName) {
    if (!affectedRows || !affectedRows.length) return null;
    const CONTEXT = 2;
    const MAX_CLUSTERS = 3;
    const MAX_ROWS_PER_CLUSTER = 15;
    const affectedNums = affectedRows.map(r => r.row).sort((a, b) => a - b);
    const clusters = [];
    let current = null;
    affectedNums.forEach(n => {
      if (!current) current = { start: n - CONTEXT, end: n + CONTEXT, targets: [n] };
      else if (n - current.end <= 1) { current.end = n + CONTEXT; current.targets.push(n); }
      else { clusters.push(current); current = { start: n - CONTEXT, end: n + CONTEXT, targets: [n] }; }
    });
    if (current) clusters.push(current);
    const limitedClusters = clusters.slice(0, MAX_CLUSTERS);
    const out = [];
    limitedClusters.forEach(cluster => {
      const start = Math.max(2, cluster.start);
      const end = Math.min(state.rows.length + 1, cluster.end);
      let count = 0;
      let rowNum;
      for (rowNum = start; rowNum <= end && count < MAX_ROWS_PER_CLUSTER; rowNum++) {
        const rowData = state.rows[rowNum - 2];
        if (!rowData) continue;
        const isTarget = cluster.targets.indexOf(rowNum) !== -1;
        out.push({ rowNum, isTarget, data: rowData });
        count++;
      }
      if (rowNum <= end) out.push({ rowNum: null, isTarget: false, truncated: true });
    });
    return { rows: out, hasMore: affectedNums.length > affectedRows.length || clusters.length > MAX_CLUSTERS, column: columnName };
  }

  function renderIssueRowsTable(issue, expanded) {
    if (!issue.affected_rows || !issue.affected_rows.length) return '';
    const columnGuess = issue.affected_column || (issue.title.match(/"([^"]+)"/) ? issue.title.match(/"([^"]+)"/)[1] : null);
    const baseCols = ['Handle', 'Title'];
    const extraCols = [];
    if (columnGuess && state.headers.indexOf(columnGuess) !== -1 && baseCols.indexOf(columnGuess) === -1) extraCols.push(columnGuess);
    const firstRow = issue.affected_rows[0];
    const rowKeys = Object.keys(firstRow).filter(k => !['row', 'proposed', 'proposed_handle'].includes(k));
    rowKeys.forEach(k => {
      if (baseCols.indexOf(k) === -1 && extraCols.indexOf(k) === -1 && state.headers.indexOf(k) !== -1) extraCols.push(k);
    });
    const showCols = baseCols.concat(extraCols).slice(0, 4);
    let html = '<div class="asg-issue-rows">';
    html += '<table><thead><tr><th>Row</th>';
    showCols.forEach(c => { html += '<th>' + escapeHtml(c) + '</th>'; });
    if (issue.affected_rows.some(r => r.proposed_handle || r.proposed)) html += '<th>Proposed</th>';
    html += '</tr></thead><tbody>';

    if (expanded) {
      const ctx = buildRowContext(issue.affected_rows, columnGuess);
      if (ctx) {
        ctx.rows.forEach(r => {
          if (r.truncated) { html += '<tr><td colspan="' + (showCols.length + 2) + '" style="text-align:center;color:#8a94a3;font-size:12px;padding:6px;">… rows omitted …</td></tr>'; return; }
          const cls = r.isTarget ? 'is-target-row' : 'is-context-row';
          html += '<tr class="' + cls + '"><td>' + r.rowNum + '</td>';
          showCols.forEach(c => { const val = r.data[c]; html += '<td>' + escapeHtml(isBlank(val) ? '(blank)' : String(val)) + '</td>'; });
          if (issue.affected_rows.some(x => x.proposed_handle || x.proposed)) {
            const target = issue.affected_rows.find(x => x.row === r.rowNum);
            html += '<td>' + (target && (target.proposed_handle || target.proposed) ? escapeHtml(target.proposed_handle || target.proposed) : '') + '</td>';
          }
          html += '</tr>';
        });
      }
    } else {
      issue.affected_rows.forEach(r => {
        html += '<tr class="is-target-row"><td>' + (r.row || '—') + '</td>';
        showCols.forEach(c => {
          const val = r[c];
          if (val !== undefined) html += '<td>' + escapeHtml(isBlank(val) ? '(blank)' : String(val)) + '</td>';
          else if (r.data && r.data[c] !== undefined) html += '<td>' + escapeHtml(isBlank(r.data[c]) ? '(blank)' : String(r.data[c])) + '</td>';
          else {
            const rowData = state.rows[(r.row || 0) - 2];
            const v2 = rowData ? rowData[c] : '';
            html += '<td>' + escapeHtml(isBlank(v2) ? '(blank)' : String(v2)) + '</td>';
          }
        });
        if (issue.affected_rows.some(x => x.proposed_handle || x.proposed)) html += '<td>' + escapeHtml(r.proposed_handle || r.proposed || '') + '</td>';
        html += '</tr>';
      });
    }
    html += '</tbody></table>';
    const rowCount = issue.affected_rows.length;
    html += '<div class="asg-issue-rows-controls"><span>' + rowCount + ' affected row' + (rowCount > 1 ? 's' : '') + '</span>';
    html += '<button type="button" data-context-toggle="' + escapeHtml(issue.code) + '">';
    html += expanded ? 'Hide context' : 'Show in context';
    html += '</button></div></div>';
    return html;
  }

  /* ---------------- Screen management ---------------- */
  const STEPS = { landing: 1, setup: 2, scanning: 3, report: 4, repair: 5, export: 6 };

  function showScreen(name) {
    LOG('showScreen', name);
    $$('.asg-screen').forEach(el => { el.hidden = el.dataset.screen !== name; });
    const step = STEPS[name] || 1;
    $$('.asg-step').forEach(el => {
      const s = parseInt(el.dataset.step, 10);
      el.classList.remove('is-active', 'is-done');
      if (s === step) el.classList.add('is-active');
      else if (s < step) el.classList.add('is-done');
    });
    const newScanBtn = document.getElementById('asg-new-scan-btn');
    if (newScanBtn) newScanBtn.hidden = (name === 'landing');
    updateActionBar(name);
    const root = document.getElementById('autonom-shopify-guard');
    if (root) {
      const top = root.getBoundingClientRect().top + window.pageYOffset - 80;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }

  function updateActionBar(name) {
    const bar = document.getElementById('asg-actionbar');
    const primary = document.getElementById('asg-actionbar-primary');
    const secondary = document.getElementById('asg-actionbar-secondary');
    const back = document.getElementById('asg-actionbar-back');
    back.hidden = true; secondary.hidden = true; primary.hidden = false; primary.disabled = false;
    primary.className = 'asg-btn asg-btn-primary';
    if (name === 'landing' || name === 'scanning') { bar.hidden = true; return; }
    bar.hidden = false;
    if (name === 'setup') {
      back.hidden = false; back.textContent = '← Start over'; back.onclick = resetToLanding;
      primary.textContent = 'Scan this CSV';
      primary.disabled = !state.mode || !state.file;
      primary.onclick = runScan;
    } else if (name === 'report') {
      back.hidden = false; back.textContent = '← New scan'; back.onclick = resetToLanding;
      secondary.hidden = false; secondary.textContent = 'Download report (free)';
      secondary.onclick = () => { downloadBlob(buildReportHTML(), state.fileName.replace(/\.csv$/i, '') + '_readiness_report.html', 'text/html;charset=utf-8'); };
      primary.textContent = 'Review and repair →';
      primary.onclick = renderRepair;
    } else if (name === 'repair') {
      back.hidden = false; back.textContent = '← Report'; back.onclick = () => showScreen('report');
      secondary.hidden = false; secondary.textContent = 'Skip repairs';
      secondary.onclick = () => { state.acceptedRepairs = {}; doExport(); };
      primary.textContent = 'Generate corrected files';
      primary.onclick = doExport;
    } else if (name === 'export') {
      back.hidden = false; back.textContent = '← Back'; back.onclick = () => showScreen('repair');
      primary.textContent = 'Download ZIP (3 files)';
      primary.onclick = downloadAll;
    }
  }

  function renderReport() {
    const r = state.result;
    const verdict = document.getElementById('asg-verdict');
    const badge = document.getElementById('asg-verdict-badge');
    const title = document.getElementById('asg-verdict-title');
    const sub = document.getElementById('asg-verdict-sub');
    verdict.classList.remove('is-critical', 'is-warning', 'is-passed');
    if (r.status === 'NOT_READY') {
      verdict.classList.add('is-critical'); badge.textContent = 'Not ready';
      title.textContent = 'Not ready for import';
      sub.textContent = pcount(r.summary.critical, 'critical issue') + ' may change existing product data.';
    } else if (r.status === 'READY_WITH_WARNINGS') {
      verdict.classList.add('is-warning'); badge.textContent = 'Ready with warnings';
      title.textContent = 'Ready with warnings';
      sub.textContent = pcount(r.summary.warnings, 'warning') + ' should be reviewed before import.';
    } else {
      verdict.classList.add('is-passed'); badge.textContent = 'Ready for review';
      title.textContent = 'Ready for review';
      sub.textContent = 'No critical issues detected by the checks performed.';
    }
    document.getElementById('asg-count-critical').textContent = r.summary.critical;
    document.getElementById('asg-count-warning').textContent = r.summary.warnings;
    document.getElementById('asg-count-info').textContent = r.summary.info;
    document.getElementById('asg-count-passed').textContent = r.summary.passed;
    if (r.potential_impact) {
      const impactEl = document.getElementById('asg-impact');
      const listEl = document.getElementById('asg-impact-list');
      impactEl.hidden = false;
      listEl.innerHTML = '';
      [
        ['Products with matching handles', r.potential_impact.matching_handles],
        ['Products with changed prices', r.potential_impact.changed_prices],
        ['Products with changed inventory', r.potential_impact.changed_inventory],
        ['Products with blank included values', r.potential_impact.blank_included_values]
      ].forEach(([label, val]) => {
        const li = document.createElement('li');
        li.innerHTML = '<span>' + escapeHtml(label) + '</span><strong>' + val + '</strong>';
        listEl.appendChild(li);
      });
    } else document.getElementById('asg-impact').hidden = true;
    renderIssues(r.issues);
    showScreen('report');
  }

  function renderIssues(issues) {
    const list = document.getElementById('asg-issues-list');
    const noIssues = document.getElementById('asg-no-issues');
    list.innerHTML = '';
    if (!issues.length) { noIssues.hidden = false; return; }
    noIssues.hidden = true;
    issues.forEach(issue => {
      const el = document.createElement('div');
      el.className = 'asg-issue is-' + issue.severity;
      el.dataset.severity = issue.severity;
      el.dataset.code = issue.code;
      const marker = issue.severity === 'critical' ? '!' : (issue.severity === 'warning' ? '!' : 'i');
      let body = '';
      if (issue.what_is_wrong) body += '<div class="asg-issue-section-label">What is wrong</div><p>' + escapeHtml(issue.what_is_wrong) + '</p>';
      if (issue.why_it_matters) body += '<div class="asg-issue-section-label">Why this matters</div><p>' + escapeHtml(issue.why_it_matters) + '</p>';
      if (issue.affected_rows && issue.affected_rows.length) {
        body += '<div class="asg-issue-section-label">Affected rows</div>';
        body += renderIssueRowsTable(issue, !!state.showRowContext[issue.code]);
      }
      if (issue.suggested_action) body += '<div class="asg-issue-section-label">What you can do</div><p>' + escapeHtml(issue.suggested_action) + '</p>';
      let actions = '';
      if (issue.shopify_doc_url) actions += '<a class="asg-btn" href="' + escapeHtml(issue.shopify_doc_url) + '" target="_blank" rel="noopener">Shopify documentation →</a>';
      el.innerHTML = '<div class="asg-issue-head">' +
        '<span class="asg-issue-marker">' + marker + '</span>' +
        '<h4 class="asg-issue-title">' + escapeHtml(issue.title) + '</h4>' +
        '<span class="asg-issue-toggle">▾</span></div>' +
        '<div class="asg-issue-body" hidden>' + body +
        (actions ? '<div class="asg-issue-actions">' + actions + '</div>' : '') + '</div>';
      const head = el.querySelector('.asg-issue-head');
      const bodyEl = el.querySelector('.asg-issue-body');
      head.addEventListener('click', (e) => {
        if (e.target.closest('[data-context-toggle]')) return;
        bodyEl.hidden = !bodyEl.hidden;
        head.classList.toggle('is-open', !bodyEl.hidden);
      });
      const ctxBtn = el.querySelector('[data-context-toggle]');
      if (ctxBtn) {
        ctxBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const code = ctxBtn.getAttribute('data-context-toggle');
          state.showRowContext[code] = !state.showRowContext[code];
          renderIssues(issues);
          const reopened = document.querySelector('.asg-issue[data-code="' + code + '"]');
          if (reopened) {
            const h = reopened.querySelector('.asg-issue-head');
            const b = reopened.querySelector('.asg-issue-body');
            if (h && b) { b.hidden = false; h.classList.add('is-open'); }
          }
        });
      }
      list.appendChild(el);
    });
  }

  function renderRepair() {
    const plan = planRepairs();
    state.repairs = plan;
    document.getElementById('asg-repair-summary').textContent =
      pcount(plan.safe.length, 'automatic fix', 'automatic fixes') + ' can be applied now. ' +
      pcount(plan.review.length, 'fix', 'fixes') + ' need your approval. ' +
      pcount(plan.never.length, 'issue') + ' cannot be fixed automatically.';

    function renderList(container, items, allowAccept) {
      const ul = container.querySelector('.asg-repair-list');
      ul.innerHTML = '';
      if (!items.length) {
        const li = document.createElement('li');
        li.textContent = 'None'; li.style.color = '#8a94a3';
        ul.appendChild(li); return;
      }
      items.forEach(issue => {
        const li = document.createElement('li');
        let detail = '';
        if (issue.affected_rows && issue.affected_rows.length) {
          detail = issue.affected_rows.slice(0, 3).map(r => 'Row ' + r.row + (r.proposed_handle ? ' → ' + r.proposed_handle : (r.proposed ? ' → ' + r.proposed : ''))).join(' · ');
        }
        let controls = '';
        if (allowAccept) controls = '<input type="checkbox" data-accept="' + escapeHtml(issue.code) + '" checked style="margin-top:4px;">';
        let removeColumnControl = '';
        if (issue.code === 'DESTRUCTIVE_BLANK_INCLUDED_COLUMN' && issue.alternative_fix === 'strip_column_with_user_approval') {
          const m = issue.title.match(/"([^"]+)"/);
          const colName = m ? m[1] : '';
          removeColumnControl = '<label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13px;color:#5b6471;cursor:pointer;">' +
            '<input type="checkbox" data-remove-column="' + escapeHtml(colName) + '" checked>' +
            ' Remove the "' + escapeHtml(colName) + '" column from the corrected file</label>';
        }
        li.innerHTML = '<div style="flex:1;"><div>' + escapeHtml(issue.title) + '</div>' +
          (detail ? '<div class="asg-repair-detail">' + escapeHtml(detail) + '</div>' : '') +
          removeColumnControl + '</div>' + controls;
        ul.appendChild(li);
      });
    }

    const safeGroup = document.getElementById('asg-repair-safe');
    const reviewGroup = document.getElementById('asg-repair-review');
    const neverGroup = document.getElementById('asg-repair-never');
    safeGroup.hidden = !plan.safe.length;
    reviewGroup.hidden = !plan.review.length;
    neverGroup.hidden = !plan.never.length;
    if (plan.safe.length) renderList(safeGroup, plan.safe, false);
    if (plan.review.length) renderList(reviewGroup, plan.review, true);
    if (plan.never.length) renderList(neverGroup, plan.never, false);
    showScreen('repair');
  }

  function renderExport() {
    const plan = state.repairs || { safe: [], review: [], never: [] };
    const accepted = state.acceptedRepairs || {};
    const appliedCodes = state.appliedCodes || new Set();
    let approvedApplied = 0;
    Object.keys(accepted).forEach(k => {
      if (!accepted[k]) return;
      if (appliedCodes.has(k)) approvedApplied++;
    });
    let safeApplied = 0;
    plan.safe.forEach(i => { if (appliedCodes.has(i.code)) safeApplied++; });

    const resolvedColumns = new Set();
    Object.keys(accepted).forEach(k => {
      if (k.indexOf('REMOVE_COLUMN:') === 0 && accepted[k]) resolvedColumns.add(k.substring('REMOVE_COLUMN:'.length));
    });

    const remaining = plan.never.filter(issue => {
      if (appliedCodes.has(issue.code)) return false;
      if (issue.code === 'DESTRUCTIVE_BLANK_INCLUDED_COLUMN') {
        const m = issue.title.match(/"([^"]+)"/);
        if (m && resolvedColumns.has(m[1])) return false;
      }
      return true;
    });

    document.getElementById('asg-export-summary').textContent =
      applied(safeApplied, 'safe fix', 'safe fixes') + ' · ' +
      applied(approvedApplied, 'approved fix', 'approved fixes') + ' · ' +
      pcount(remaining.length, 'issue') + ' still in the file';

    const base = state.fileName.replace(/\.csv$/i, '');
    document.getElementById('asg-export-csv-name').textContent = base + '_safe.csv';

    const checkEl = document.getElementById('asg-export-check');
    const titleEl = document.getElementById('asg-export-title');
    if (remaining.length > 0) {
      checkEl.textContent = '⚠'; checkEl.classList.add('is-warning');
      titleEl.textContent = 'Your corrected CSV is ready — with remaining issues';
    } else {
      checkEl.textContent = '✓'; checkEl.classList.remove('is-warning');
      titleEl.textContent = 'Your corrected CSV is ready';
    }

    const heroEl = document.querySelector('.asg-export-hero');
    const oldWarn = heroEl.parentNode.querySelector('.asg-export-warning');
    if (oldWarn) oldWarn.remove();

    if (remaining.length > 0) {
      const warn = document.createElement('div');
      warn.className = 'asg-export-warning';
      let html = '<h3>⚠ This file is not fully clean</h3>';
      html += '<p>Autonom fixed everything it safely could, but <strong>' + pcount(remaining.length, 'issue') + '</strong> remain that require your decision:</p><ul>';
      remaining.forEach(issue => {
        html += '<li><strong>' + escapeHtml(issue.title) + '</strong>';
        if (issue.suggested_action) html += ' — ' + escapeHtml(issue.suggested_action);
        html += '</li>';
      });
      html += '</ul><p><strong>Autonom does not invent data.</strong> These issues need your judgement before importing.</p>';
      warn.innerHTML = html;
      heroEl.parentNode.insertBefore(warn, heroEl.nextSibling);
    } else {
      const warn = document.createElement('div');
      warn.className = 'asg-export-warning';
      warn.style.background = 'var(--asg-passed-bg)';
      warn.style.borderColor = '#b8dfc6';
      warn.innerHTML = '<h3 style="color:var(--asg-passed);">✅ This file is as clean as Autonom can make it</h3>' +
        '<p>All safe fixes were applied and all approved fixes were completed. No remaining issues were detected.</p>' +
        '<p><strong>Reminder:</strong> Autonom does not know your store\'s current data. Always test-import 2–5 products first.</p>';
      heroEl.parentNode.insertBefore(warn, heroEl.nextSibling);
    }

    renderDiffSection();
    showScreen('export');
  }

  function renderDiffSection() {
    const section = document.getElementById('asg-diff-section');
    const listEl = document.getElementById('asg-diff-list');
    const countEl = document.getElementById('asg-diff-count');
    const toggle = document.getElementById('asg-diff-toggle');
    const log = state.changeLog || [];
    if (!log.length) { section.hidden = true; return; }
    section.hidden = false;
    countEl.textContent = log.length + ' change' + (log.length === 1 ? '' : 's');
    let html = '';
    log.forEach(c => {
      html += '<div class="asg-diff-item"><div class="asg-diff-item-head">';
      html += '<span class="asg-diff-item-loc">' + (c.row === 'all' ? 'Entire file' : 'Row ' + c.row) + ' · ' + escapeHtml(c.column) + '</span>';
      html += '<span class="asg-diff-item-reason">' + escapeHtml(c.reason) + '</span></div>';
      html += '<div class="asg-diff-item-body">';
      html += '<div class="asg-diff-before"><span class="asg-diff-label">Before</span><code>' + escapeHtml(String(c.before).substring(0, 200)) + '</code></div>';
      html += '<div class="asg-diff-after"><span class="asg-diff-label">After</span><code>' + escapeHtml(String(c.after).substring(0, 200)) + '</code></div>';
      html += '</div></div>';
    });
    listEl.innerHTML = html;
    const newToggle = toggle.cloneNode(true);
    toggle.parentNode.replaceChild(newToggle, toggle);
    newToggle.addEventListener('click', () => {
      const expanded = newToggle.getAttribute('aria-expanded') === 'true';
      newToggle.setAttribute('aria-expanded', String(!expanded));
      listEl.hidden = expanded;
      const arrow = newToggle.querySelector('.asg-diff-header-arrow');
      if (arrow) arrow.textContent = expanded ? '▸' : '▾';
    });
    newToggle.setAttribute('aria-expanded', 'false');
    listEl.hidden = true;
    const arrowEl = newToggle.querySelector('.asg-diff-header-arrow');
    if (arrowEl) arrowEl.textContent = '▸';
  }

  /* ---------------- Scan ---------------- */
  function setStep(step, cls) {
    const el = document.querySelector('.asg-scan-steps li[data-step="' + step + '"]');
    if (!el) return;
    el.classList.remove('is-running', 'is-done');
    if (cls) el.classList.add(cls);
  }

  async function runScan() {
    if (!state.mode || !state.file) return;
    showScreen('scanning');
    document.getElementById('asg-scan-filename').textContent = state.fileName + ' · ' + formatBytes(state.fileSize);
    setStep('read', 'is-running');
    const parsed = await parseWithPapa(state.fileText);
    state.headers = parsed.fields || [];
    state.rows = parsed.data || [];
    state.parseFieldMismatches = 0;
    if (parsed.errors && parsed.errors.length) {
      parsed.errors.forEach(err => {
        if (err.type === 'FieldMismatch' || /field/i.test(err.code || '')) state.parseFieldMismatches++;
      });
    }
    await delay(180);
    setStep('read', 'is-done');
    const checkResult = runChecks();
    for (const step of ['encoding', 'headers', 'handles', 'variants', 'skus', 'prices', 'blanks', 'html', 'images']) {
      setStep(step, 'is-running');
      await delay(90);
      setStep(step, 'is-done');
    }
    setStep('report', 'is-running');
    await delay(180);
    state.result = buildResult(checkResult.issues, checkResult.passed);
    setStep('report', 'is-done');
    await delay(200);
    renderReport();
  }

  /* ---------------- Export ---------------- */
  function collectAccepted() {
    const accepted = {};
    $$('#asg-repair-review-list input[data-accept]').forEach(input => {
      if (input.checked) accepted[input.dataset.accept] = true;
    });
    $$('#asg-repair-never-list input[data-remove-column]').forEach(input => {
      if (input.checked) accepted['REMOVE_COLUMN:' + input.dataset.removeColumn] = true;
    });
    state.acceptedRepairs = accepted;
  }

  function doExport() {
    collectAccepted();
    const result = buildCorrectedCSV();
    state.correctedCSV = result.csv;
    state.changeLog = result.changeLog;
    state.appliedCodes = result.appliedCodes;
    renderExport();
  }

  async function downloadAll() {
    const base = state.fileName.replace(/\.csv$/i, '');
    const csvName = base + '_safe.csv';
    const logName = 'autonom_change_log.csv';
    const reportName = 'autonom_readiness_report.html';
    const csv = state.correctedCSV || '';
    const log = buildChangeLogCSV(state.changeLog || []);
    const report = buildReportHTML();

    if (typeof JSZip === 'undefined') {
      downloadBlob(csv, csvName, 'text/csv;charset=utf-8');
      setTimeout(() => downloadBlob(log, logName, 'text/csv;charset=utf-8'), 300);
      setTimeout(() => downloadBlob(report, reportName, 'text/html;charset=utf-8'), 600);
      return;
    }

    try {
      const zip = new JSZip();
      const folder = zip.folder(base + '_autonom_safe');
      folder.file(csvName, csv);
      folder.file(logName, log);
      folder.file(reportName, report);
      folder.file('README.txt', [
        'Autonom Shopify Guard — corrected package', '',
        'Files in this archive:',
        '  ' + csvName + '  —  Your corrected CSV, ready to import into Shopify.',
        '  ' + logName + '  —  Every change Autonom made, in plain language.',
        '  ' + reportName + '  —  The full readiness report.', '',
        'Before importing:',
        '  1. Keep a current Shopify export as a backup.',
        '  2. Resolve any critical issues still listed in the report.',
        '  3. Test-import 2–5 products first.',
        '  4. Only then run the full import.', '',
        'Autonom does not know your store\'s current data.',
        'A passing report does not guarantee Shopify will accept the import.', '',
        'Generated locally in your browser — no file contents were transmitted.', ''
      ].join('\n'));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = base + '_autonom_safe.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      downloadBlob(csv, csvName, 'text/csv;charset=utf-8');
      setTimeout(() => downloadBlob(log, logName, 'text/csv;charset=utf-8'), 300);
      setTimeout(() => downloadBlob(report, reportName, 'text/html;charset=utf-8'), 600);
    }
  }

  /* ---------------- Reset ---------------- */
  function resetToLanding() {
    state.file = null; state.fileName = ''; state.fileSize = 0; state.fileText = '';
    state.headers = []; state.rows = []; state.mode = null;
    state.detectedMode = null; state.detectedConfidence = null; state.detectedReason = '';
    state.result = null; state.repairs = null; state.acceptedRepairs = {};
    state.correctedCSV = null; state.changeLog = null; state.appliedCodes = null;
    state.hasBOM = false; state.detectedEncoding = 'UTF-8';
    state.showRowContext = {};
    state.parseFieldMismatches = 0;
    const fi = document.getElementById('asg-file-input');
    if (fi) fi.value = '';
    $$('.asg-mode-card').forEach(c => c.classList.remove('is-selected'));
    $$('.asg-issue').forEach(el => el.hidden = false);
    $$('.asg-filter-btn').forEach(b => b.classList.remove('is-active'));
    const allF = document.querySelector('.asg-filter-btn[data-filter="all"]');
    if (allF) allF.classList.add('is-active');
    $$('.asg-scan-steps li').forEach(el => el.classList.remove('is-running', 'is-done'));
    const oldWarn = document.querySelector('.asg-export-warning');
    if (oldWarn) oldWarn.remove();
    const diffSection = document.getElementById('asg-diff-section');
    if (diffSection) diffSection.hidden = true;
    const diffList = document.getElementById('asg-diff-list');
    if (diffList) { diffList.hidden = true; diffList.innerHTML = ''; }
    const sampleWrap = document.getElementById('asg-file-sample');
    if (sampleWrap) sampleWrap.hidden = true;
    const detectBanner = document.getElementById('asg-detect-banner');
    if (detectBanner) detectBanner.hidden = true;
    const grid = document.getElementById('asg-mode-grid');
    if (grid) grid.classList.remove('is-hidden');
    showScreen('landing');
  }

  function downloadSampleCSV() {
    const sample = [
      'Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Variant SKU,Variant Price,Variant Compare At Price,Variant Inventory Tracker,Variant Inventory Qty,Image Src,Status,Product Category',
      'blue-cotton-tee,Blue Cotton Tee,"<p>Soft cotton tee.</p>",Acme,Shirts,"cotton, blue",TRUE,Size,Small,,,ACM-BLU-S,19.99,24.99,shopify,42,https://cdn.example.com/blue-tee.jpg,active,Apparel & Accessories > Clothing > Shirts & Tops',
      'blue-cotton-tee,Blue Cotton Tee,"<p>Soft cotton tee.</p>",Acme,Shirts,"cotton, blue",TRUE,Size,Medium,,,ACM-BLU-M,19.99,24.99,shopify,38,https://cdn.example.com/blue-tee.jpg,active,Apparel & Accessories > Clothing > Shirts & Tops',
      'blue-cotton-tee,Blue Cotton Tee,"<p>Soft cotton tee.</p>",Acme,Shirts,"cotton, blue",TRUE,Size,Small,,,ACM-BLU-S-DUP,,24.99,shopify,10,https://cdn.example.com/blue-tee.jpg,active,Apparel & Accessories > Clothing > Shirts & Tops',
      'red-cotton-tee,Red Cotton Tee,"<p>Soft cotton tee.</p>", Acme , Shirts ,"cotton, red",TRUE,Size,Small,,,ACM-RED-S,nineteen ninety nine,29.99,shopify,40,http://cdn.example.com/red-tee.jpg,active,Shirts',
      'red-cotton-tee,Red Cotton Tee,"<p>Soft cotton tee.</p>",Acme,Shirts,"cotton, red",TRUE,Size,Medium,,,ACM-RED-M,"19,99",18.99,shopify,3.5,https://cdn.example.com/red-tee,active,Shirts',
      'black-cotton-tee,Black Cotton Tee,"<p>Soft cotton tee</div>",Acme,Shirts,"cotton, black",TRUE,Size,Small,,,ACM-BLK-S,$21.99,24.99,shopify,-5,https://cdn.example.com/black-tee.jpg,active,Shirts',
      'green-cotton-tee,Green Cotton Tee,"<p>\u201CPremium\u201D quality tee with a \u201Cgreat\u201D fit.</p>",Acme,Shirts,"cotton, green",TRUE,Size,Small,,,ACM-BLU-S,19.99,24.99,shopify,30,https://localhost/images/green-tee.jpg,active,Shirts',
      'fancy Tee,Fancy Tee,"<p>Fancy.</p>",Acme,Shirts,"fancy",TRUE,Size,Small,,,ACM-FANCY-1,29.99,34.99,shopify,20,https://cdn.example.com/fancy-tee.jpg,showing,Shirts',
      ',Orphan Variant,"<p>Orphan product.</p>",Acme,Shirts,"orphan",TRUE,Size,Small,,,ORP-001,15.00,19.99,shopify,5,https://cdn.example.com/orphan.jpg,active,Shirts',
      ',Another Orphan,"<p>Orphan product.</p>",Acme,Shirts,"orphan",TRUE,Color,Red,,,ORP-002,nineteen ninety nine,,shopify,3.5,https://cdn.example.com/orphan2.jpg,showing,Shirts',
      'teal-mug,Teal Mug,"<p>Ceramic mug.</p>",Acme,Mugs,"mug, teal",TRUE,,,,,MUG-TEAL-1,12.99,15.99,shopify,50,https://cdn.example.com/teal-mug.jpg,active,Home & Garden > Kitchen & Dining',
      'teal-mug,Teal Mug Large,"<p>Bigger mug.</p>",Acme,Mugs,"mug, teal",TRUE,,,,,MUG-TEAL-2,12.99,15.99,shopify,20,https://cdn.example.com/teal-mug-large.jpg,active,Home & Garden > Kitchen & Dining',
      'no-title-product,,"<p>Missing title.</p>",Acme,Shirts,"weird",TRUE,Size,Small,,,NT-001,9.99,12.99,shopify,5,https://cdn.example.com/nt.jpg,active,Shirts',
      'partial-collapse,Partial Collapse,"<p>Test.</p>",Acme,Shirts,"test",TRUE,Size,,,,SOME-SKU,9.99,12.99,shopify,10,https://cdn.example.com/some.jpg,active,Shirts',
      'malformed-image,Malformed Image,"<p>Test.</p>",Acme,Shirts,"test",TRUE,Size,Small,,,MAL-001,9.99,12.99,shopify,10,not-a-url,active,Shirts',
      'multi-image-tee,Multi Image Tee,"<p>A tee with three images.</p>",Acme,Shirts,"cotton",TRUE,,,,,MIT-001,24.99,29.99,shopify,15,https://cdn.example.com/mit-1.jpg,active,Shirts',
      'multi-image-tee,,,,,,,,,,,,,,,,https://cdn.example.com/mit-2.jpg,,',
      'multi-image-tee,,,,,,,,,,,,,,,,https://cdn.example.com/mit-3.jpg,,',
      'dup-image-tee,Dup Image Tee,"<p>Test.</p>",Acme,Shirts,"test",TRUE,Title,Default Title,,,DIT-001,14.99,19.99,shopify,20,https://cdn.example.com/dit-1.jpg,active,Shirts',
      'dup-image-tee,,,,,,,,,,,,,,,,https://cdn.example.com/dit-1.jpg,,',
      'dup-image-tee,,,,,,,,,,,,,,,,https://cdn.example.com/dit-2.jpg,,',
      'boolean-lowercase,Boolean Lowercase,"<p>Test.</p>",Acme,Shirts,"test",yes,Size,Small,,,BL-001,9.99,12.99,shopify,10,https://cdn.example.com/bl.jpg,active,Shirts',
      'inv-no-qty,Inv No Qty,"<p>Test.</p>",Acme,Shirts,"test",TRUE,Size,Small,,,INQ-001,9.99,12.99,shopify,,https://cdn.example.com/inq.jpg,active,Shirts',
      ''
    ].join('\n');

    const withBOM = '\uFEFF' + sample;
    downloadBlob(withBOM, 'autonom-sample-shopify-products.csv', 'text/csv;charset=utf-8');
  }

  /* ---------------- Wiring ---------------- */
  function wireEvents() {
    const dropzone = document.getElementById('asg-dropzone');
    const fileInput = document.getElementById('asg-file-input');
    const privacyToggle = document.getElementById('asg-privacy-toggle');
    const privacyPanel = document.getElementById('asg-privacy-panel');
    const newScanBtn = document.getElementById('asg-new-scan-btn');
    const sampleBtn = document.getElementById('asg-download-sample-btn');
    const removeFileBtn = document.getElementById('asg-remove-file-btn');
    const detectOverride = document.getElementById('asg-detect-override');
    const toggleSample = document.getElementById('asg-toggle-sample');

    dropzone.addEventListener('click', e => {
      if (e.target.tagName === 'LABEL' || e.target.closest('label')) return;
      fileInput.click();
    });
    dropzone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });
    ['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('is-dragover'); }));
    ['dragleave', 'drop'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('is-dragover'); }));
    dropzone.addEventListener('drop', e => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
    fileInput.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) handleFile(f);
      fileInput.value = '';
    });

    $$('.asg-mode-card').forEach(card => {
      card.addEventListener('click', () => {
        $$('.asg-mode-card').forEach(c => c.classList.remove('is-selected'));
        card.classList.add('is-selected');
        state.mode = card.dataset.mode;
        state.detectedMode = null;
        state.detectedConfidence = null;
        const banner = document.getElementById('asg-detect-banner');
        if (banner) {
          banner.hidden = false;
          banner.classList.remove('is-medium', 'is-low');
          banner.classList.add('is-low');
          document.getElementById('asg-detect-icon').textContent = '✋';
          document.getElementById('asg-detect-line').textContent = 'Mode: ' + (state.mode === 'existing_products' ? 'Updating existing products' : 'Adding new products');
          document.getElementById('asg-detect-sub').textContent = 'You selected this. Autonom will use the corresponding checks.';
        }
        updateActionBar('setup');
      });
    });

    if (detectOverride) {
      detectOverride.addEventListener('click', () => {
        const grid = document.getElementById('asg-mode-grid');
        grid.classList.remove('is-hidden');
        state.detectedMode = null;
        state.detectedConfidence = null;
        document.getElementById('asg-detect-icon').textContent = '🤔';
        document.getElementById('asg-detect-line').textContent = 'Choose a mode';
        document.getElementById('asg-detect-sub').textContent = 'Select what you are doing with this file.';
        updateActionBar('setup');
      });
    }

    if (toggleSample) {
      toggleSample.addEventListener('click', () => {
        const table = document.getElementById('asg-file-sample-table');
        const isHidden = table.style.display === 'none';
        table.style.display = isHidden ? '' : 'none';
        toggleSample.textContent = isHidden ? 'Hide preview' : 'Show preview';
      });
    }

    if (newScanBtn) newScanBtn.addEventListener('click', resetToLanding);
    if (sampleBtn) sampleBtn.addEventListener('click', downloadSampleCSV);
    if (removeFileBtn) removeFileBtn.addEventListener('click', resetToLanding);

    if (privacyToggle && privacyPanel) {
      privacyToggle.addEventListener('click', () => {
        const ex = privacyToggle.getAttribute('aria-expanded') === 'true';
        privacyToggle.setAttribute('aria-expanded', String(!ex));
        privacyPanel.hidden = ex;
      });
    }

    $$('.asg-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
        $$('.asg-filter-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        $$('.asg-issue').forEach(el => {
          el.hidden = !(filter === 'all' || el.dataset.severity === filter);
        });
      });
    });
  }

  /* ---------------- Init ---------------- */
  function init() {
    if (!document.getElementById('autonom-shopify-guard')) return;
    initPrivacyMonitor();
    wireEvents();
    showScreen('landing');
    LOG('Init complete — v1.7.3');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
