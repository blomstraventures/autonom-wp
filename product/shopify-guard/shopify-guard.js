/* ============================================================================
   AUTONOM SHOPIFY GUARD — Client-side engine v1.3.0
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
  const SHOPIFY_DOC_URL = 'https://help.shopify.com/en/manual/products/import-export/using-csv';

  const state = {
    file: null, fileName: '', fileSize: 0, fileText: '',
    hasBOM: false, detectedEncoding: 'UTF-8',
    headers: [], rows: [], mode: null,
    result: null, repairs: null, acceptedRepairs: {},
    correctedCSV: null, changeLog: null,
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
    return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-').replace(/^-|-$/g, '');
  }
  function isBlank(v) { return v == null || String(v).trim() === ''; }
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

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
    // Fix mismatched paragraph closers
    out = out.replace(/<p>([\s\S]*?)<\/div>/gi, '<p>$1</p>');
    out = out.replace(/<p>([\s\S]*?)<\/span>/gi, '<p>$1</p>');
    // Fix bold/italic mismatches
    out = out.replace(/<b>([\s\S]*?)<\/i>/gi, '<b>$1</b>');
    out = out.replace(/<i>([\s\S]*?)<\/b>/gi, '<i>$1</i>');
    out = out.replace(/<strong>([\s\S]*?)<\/em>/gi, '<strong>$1</strong>');
    out = out.replace(/<em>([\s\S]*?)<\/strong>/gi, '<em>$1</em>');
    // Remove orphan closing tags
    out = out.replace(/<\/(div|span|p|b|i|strong|em)>(?![^<]*<\1>)/gi, '');
    // Balance remaining unclosed tags
    const stack = [];
    const re = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
    let m;
    while ((m = re.exec(out)) !== null) {
      const full = m[0], tag = m[1].toLowerCase();
      if (/^<\//.test(full)) {
        if (stack.length && stack[stack.length - 1] === tag) stack.pop();
      } else if (!/\/>$/.test(full)) {
        stack.push(tag);
      }
    }
    while (stack.length) out += '</' + stack.pop() + '>';
    return out;
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
        complete: r => resolve({
          fields: r.meta.fields || [],
          data: r.data || [],
          errors: r.errors || []
        }),
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

  /* ---------------- File handling ---------------- */
  function handleFile(file) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
      alert('Please choose a .csv file.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      alert('This file is larger than 50MB.');
      return;
    }
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
      if (enc.encoding === 'UTF-16LE' || enc.encoding === 'UTF-16BE')
        text = new TextDecoder(enc.encoding).decode(buf);
      else if (enc.encoding === 'ISO-8859-1')
        text = new TextDecoder('iso-8859-1').decode(buf);
      else
        text = new TextDecoder('utf-8').decode(buf);

      if (state.hasBOM && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      state.fileText = text;

      renderFilePreview();
      showScreen('setup');
    };
    reader.readAsArrayBuffer(file);
  }

  function renderFilePreview() {
    const nameEl = document.getElementById('asg-file-name');
    const metaEl = document.getElementById('asg-file-meta');
    if (nameEl) nameEl.textContent = state.fileName;

    let rowCount = '—';
    try {
      const parsed = fallbackParseCSV(state.fileText);
      rowCount = Math.max(0, parsed.data.length).toLocaleString();
    } catch (e) { /* ignore */ }

    if (metaEl) {
      metaEl.textContent = formatBytes(state.fileSize) + ' · ' + rowCount + ' rows · ' +
        state.detectedEncoding + (state.hasBOM ? ' · BOM detected' : '');
    }
    updateActionBar('setup');
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

    if (state.hasBOM) {
      issues.push(makeIssue('warning', 'ENCODING_BOM_PRESENT', 'File starts with a byte-order mark (BOM)', {
        what_is_wrong: 'This file has a hidden BOM character at the start.',
        why_it_matters: 'Shopify may interpret the first column header incorrectly.',
        suggested_action: 'Autonom can remove the BOM.',
        auto_fix: 'safe_automatic'
      }));
    } else passed.push('No byte-order mark detected');

    if (state.detectedEncoding !== 'UTF-8') {
      issues.push(makeIssue('warning', 'ENCODING_NOT_UTF8', 'File is not UTF-8 encoded', {
        what_is_wrong: 'This file uses ' + state.detectedEncoding + ' encoding.',
        why_it_matters: 'Special characters may display incorrectly.',
        suggested_action: 'Autonom can convert to UTF-8.',
        auto_fix: 'safe_automatic'
      }));
    } else passed.push('File encoding is UTF-8');

    const headerLower = {};
    state.headers.forEach(h => { headerLower[h.toLowerCase()] = h; });
    if (state.mode === 'new_products') {
      REQUIRED_COLUMNS_NEW.forEach(req => {
        if (!headerLower[req.toLowerCase()]) {
          issues.push(makeIssue('critical', 'HEADER_REQUIRED_MISSING',
            'Required column "' + req + '" is missing', {
              what_is_wrong: 'Shopify requires the "' + req + '" column, but it is not present.',
              why_it_matters: 'Shopify will reject the import entirely.',
              suggested_action: 'Add the missing column and re-export.',
              shopify_doc_url: SHOPIFY_DOC_URL
            }));
        } else passed.push('Required column present: ' + req);
      });
    }

    const knownLower = KNOWN_COLUMNS.map(c => c.toLowerCase());
    state.headers.forEach(h => {
      if (h && knownLower.indexOf(h.toLowerCase()) === -1) {
        issues.push(makeIssue('warning', 'HEADER_UNKNOWN_COLUMN', 'Unknown column "' + h + '"', {
          what_is_wrong: 'Not part of the standard Shopify product CSV format.',
          why_it_matters: 'Shopify will ignore this column.',
          suggested_action: 'Verify this column is intentional, or remove it.'
        }));
      }
    });

    const hCount = {};
    state.headers.forEach(h => { const k = h.toLowerCase(); hCount[k] = (hCount[k] || 0) + 1; });
    Object.keys(hCount).forEach(k => {
      if (hCount[k] > 1) {
        issues.push(makeIssue('critical', 'HEADER_DUPLICATE', 'Duplicate column "' + k + '"', {
          what_is_wrong: 'The "' + k + '" column appears more than once.',
          why_it_matters: 'Shopify will use only one of the duplicate columns.',
          suggested_action: 'Remove the duplicate column.',
          auto_fix: 'review_required'
        }));
      }
    });
    if (Object.keys(hCount).length === state.headers.length) passed.push('No duplicate headers');

    const handleCounts = {};
    const blankNew = [], blankUpdate = [], invalid = [];
    state.rows.forEach((row, i) => {
      const h = row['Handle'], t = row['Title'], n = i + 2;
      if (isBlank(h)) {
        if (state.mode === 'new_products' && !isBlank(t))
          blankNew.push({ row: n, title: t, proposed_handle: toHandle(t) });
        else if (state.mode === 'existing_products')
          blankUpdate.push({ row: n, title: t || '(no title)' });
      } else {
        handleCounts[h] = (handleCounts[h] || 0) + 1;
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(h))
          invalid.push({ row: n, handle: h, proposed: toHandle(h) });
      }
    });

    if (state.mode === 'new_products' && blankNew.length > 0) {
      issues.push(makeIssue('warning', 'HANDLE_MISSING_NEW',
        'Handle missing for ' + blankNew.length + ' product(s)', {
          what_is_wrong: blankNew.length + ' rows have no handle.',
          why_it_matters: 'Shopify requires a handle to create a product.',
          suggested_action: 'Autonom can generate handles from product titles.',
          affected_rows: blankNew.slice(0, 10),
          auto_fix: 'review_required'
        }));
    }
    if (state.mode === 'existing_products' && blankUpdate.length > 0) {
      issues.push(makeIssue('critical', 'HANDLE_MISSING_UPDATE',
        'Handle missing for ' + blankUpdate.length + ' row(s)', {
          what_is_wrong: blankUpdate.length + ' rows have no handle.',
          why_it_matters: 'Shopify cannot match these rows to existing products.',
          suggested_action: 'Add the handle column and verify each row.',
          affected_rows: blankUpdate.slice(0, 10)
        }));
    }
    if (invalid.length > 0) {
      issues.push(makeIssue('warning', 'HANDLE_FORMAT_INVALID',
        invalid.length + ' handle(s) do not match Shopify format', {
          what_is_wrong: 'Handles should be lowercase with hyphens.',
          why_it_matters: 'Non-standard handles may cause URL issues.',
          suggested_action: 'Autonom can normalize these handles.',
          affected_rows: invalid.slice(0, 10),
          auto_fix: 'review_required'
        }));
    }

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
        const titles = {};
        entries.forEach(e => { titles[e.title] = true; });
        if (Object.keys(titles).length > 1) {
          issues.push(makeIssue('critical', 'HANDLE_DUPLICATE_IN_FILE',
            'Duplicate handle "' + h + '" found', {
              what_is_wrong: 'The handle "' + h + '" appears on ' + entries.length + ' rows, but titles differ.',
              why_it_matters: 'Shopify may merge these into one product.',
              suggested_action: 'If variants, use same Title. If different products, use unique handles.',
              affected_rows: entries.slice(0, 10)
            }));
        }
      }
    });
    if (!issues.some(i => i.code === 'HANDLE_DUPLICATE_IN_FILE')) passed.push('No conflicting duplicate handles');

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
        issues.push(makeIssue('critical', 'SKU_DUPLICATE_IN_FILE',
          'Duplicate SKU "' + sku + '" found', {
            what_is_wrong: 'The SKU "' + sku + '" appears on rows for different products.',
            why_it_matters: 'Shopify may merge these products, or the import may fail.',
            suggested_action: 'Assign a unique SKU to each product and variant.',
            affected_rows: entries.slice(0, 10)
          }));
      }
    });
    if (whitespaceSKUs > 0) {
      issues.push(makeIssue('warning', 'SKU_WHITESPACE',
        whitespaceSKUs + ' SKU(s) contain leading or trailing whitespace', {
          what_is_wrong: whitespaceSKUs + ' SKUs have hidden spaces.',
          why_it_matters: 'May cause matching issues.',
          suggested_action: 'Autonom can trim whitespace from all SKUs.',
          auto_fix: 'safe_automatic'
        }));
    } else passed.push('No whitespace in SKUs');

    if (state.mode === 'existing_products') {
      SENSITIVE_COLUMNS.forEach(col => {
        if (state.headers.indexOf(col) === -1) return;
        const blanks = [];
        let allBlank = true;
        state.rows.forEach((row, i) => {
          if (isBlank(row[col])) blanks.push({ row: i + 2, handle: row['Handle'] || '', column_value: '' });
          else allBlank = false;
        });
        if (allBlank && blanks.length > 0) {
          issues.push(makeIssue('info', 'DESTRUCTIVE_BLANK_ALL_ROWS',
            'Entire column "' + col + '" is blank', {
              what_is_wrong: 'The "' + col + '" column is included but contains no values.',
              why_it_matters: 'This column has no effect.',
              suggested_action: 'Autonom can remove this column.',
              auto_fix: 'safe_automatic'
            }));
        } else if (blanks.length > 0) {
          issues.push(makeIssue('critical', 'DESTRUCTIVE_BLANK_INCLUDED_COLUMN',
            'Blank values in included column "' + col + '"', {
              what_is_wrong: 'You included the "' + col + '" column, but ' + blanks.length + ' of ' + state.rows.length + ' cells are empty.',
              why_it_matters: 'Shopify treats a blank value in an included column as an intentional overwrite. If these rows match existing products, your live data may be cleared.',
              suggested_action: 'Remove the "' + col + '" column entirely, or fill in the blank cells.',
              affected_rows: blanks.slice(0, 10),
              shopify_doc_url: SHOPIFY_DOC_URL,
              alternative_fix: 'strip_column_with_user_approval'
            }));
        } else passed.push('No destructive blanks in "' + col + '"');
      });
    }

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
      issues.push(makeIssue('critical', 'VARIANT_ORPHANED',
        'Variant row without a parent product', {
          what_is_wrong: orphaned + ' row(s) have variant data but no handle.',
          why_it_matters: 'Shopify cannot attach this variant to a product.',
          suggested_action: 'Add the same Handle as the parent product.',
          affected_rows: orphanedRows.slice(0, 10)
        }));
    } else passed.push('No orphaned variant rows');

    Object.keys(handleOpts).forEach(h => {
      const names = Object.keys(handleOpts[h]);
      if (names.length > 1) {
        issues.push(makeIssue('critical', 'VARIANT_OPTION_NAME_INCONSISTENT',
          'Inconsistent option names for handle "' + h + '"', {
            what_is_wrong: 'Handle "' + h + '" has different option names: ' + names.join(', ') + '.',
            why_it_matters: 'Shopify cannot resolve variant relationships.',
            suggested_action: 'Use the same option name for all variant rows of the same product.'
          }));
      }
    });

    const nonNumPrices = [];
    state.rows.forEach((row, i) => {
      const p = row['Variant Price'];
      if (isBlank(p)) return;
      if (isNaN(Number(p))) nonNumPrices.push({ row: i + 2, value: p });
    });
    if (nonNumPrices.length > 0) {
      issues.push(makeIssue('warning', 'PRICE_NON_NUMERIC',
        'Non-numeric price value', {
          what_is_wrong: nonNumPrices.length + ' row(s) have a non-numeric price.',
          why_it_matters: 'Shopify will reject or ignore these rows.',
          suggested_action: 'Enter a numeric value (e.g., 19.99).',
          affected_rows: nonNumPrices.slice(0, 10)
        }));
    } else if (state.headers.indexOf('Variant Price') !== -1) passed.push('All prices numeric');

    const nonInt = [];
    state.rows.forEach((row, i) => {
      const q = row['Variant Inventory Qty'];
      if (isBlank(q)) return;
      const n = Number(q);
      if (isNaN(n) || !Number.isInteger(n)) nonInt.push({ row: i + 2, value: q });
    });
    if (nonInt.length > 0) {
      issues.push(makeIssue('warning', 'INVENTORY_NON_INTEGER',
        'Non-integer inventory value', {
          what_is_wrong: nonInt.length + ' row(s) have non-integer inventory.',
          why_it_matters: 'Shopify expects integers.',
          suggested_action: 'Enter a whole number.',
          affected_rows: nonInt.slice(0, 10)
        }));
    } else if (state.headers.indexOf('Variant Inventory Qty') !== -1) passed.push('All inventory values are integers');

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
      issues.push(makeIssue('warning', 'HTML_UNCLOSED_TAG',
        'Unclosed HTML tag in description', {
          what_is_wrong: unclosed.length + ' description(s) have unclosed HTML.',
          why_it_matters: 'Unclosed tags may break your storefront layout.',
          suggested_action: 'Autonom can attempt to repair the HTML.',
          affected_rows: unclosed.slice(0, 10),
          auto_fix: 'review_required'
        }));
    } else if (state.headers.indexOf('Body (HTML)') !== -1) passed.push('No unclosed HTML tags');
    if (dangerous.length > 0) {
      issues.push(makeIssue('warning', 'HTML_DANGEROUS_ATTRIBUTE',
        'Potentially unsafe HTML tag detected', {
          what_is_wrong: dangerous.length + ' description(s) contain unsafe tags.',
          why_it_matters: 'May be blocked by Shopify.',
          suggested_action: 'Remove the tag or replace with plain text.',
          affected_rows: dangerous.slice(0, 10)
        }));
    }

    const httpImgs = [];
    state.rows.forEach((row, i) => {
      const url = row['Image Src'];
      if (isBlank(url)) return;
      if (/^http:\/\//i.test(String(url).trim()))
        httpImgs.push({ row: i + 2, url: String(url).trim() });
    });
    if (httpImgs.length > 0) {
      issues.push(makeIssue('warning', 'IMAGE_URL_NOT_HTTPS',
        'Image URL does not use HTTPS', {
          what_is_wrong: httpImgs.length + ' image URL(s) do not use https://.',
          why_it_matters: 'Shopify requires HTTPS for product images.',
          suggested_action: 'Autonom can upgrade http:// to https://.',
          affected_rows: httpImgs.slice(0, 10),
          auto_fix: 'review_required'
        }));
    } else if (state.headers.indexOf('Image Src') !== -1) passed.push('All image URLs use HTTPS');

    if (state.headers.indexOf('Status') !== -1) {
      const invalidS = [];
      state.rows.forEach((row, i) => {
        const s = row['Status'];
        if (isBlank(s)) return;
        if (['active', 'draft', 'archived'].indexOf(String(s).trim().toLowerCase()) === -1)
          invalidS.push({ row: i + 2, value: s });
      });
      if (invalidS.length > 0) {
        issues.push(makeIssue('warning', 'STATUS_INVALID_VALUE',
          'Invalid status value', {
            what_is_wrong: invalidS.length + ' row(s) have invalid status.',
            why_it_matters: 'Shopify may reject this row.',
            suggested_action: 'Use one of: active, draft, archived.',
            affected_rows: invalidS.slice(0, 10)
          }));
      } else passed.push('All status values valid');
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
    return {
      matching_handles: Object.keys(handles).length,
      changed_prices: changedPrices,
      changed_inventory: changedInv,
      blank_included_values: blankCount
    };
  }

  function buildResult(issues, passed) {
    const counts = { critical: 0, warning: 0, info: 0 };
    issues.forEach(i => { counts[i.severity] = (counts[i.severity] || 0) + 1; });
    let status = 'READY_FOR_REVIEW';
    if (counts.critical > 0) status = 'NOT_READY';
    else if (counts.warning > 0) status = 'READY_WITH_WARNINGS';
    return {
      status, tool: 'shopify-guard', tool_version: '1.3.0',
      profile: 'shopify-product-csv', profile_version: '2025-01',
      mode: state.mode,
      summary: {
        critical: counts.critical, warnings: counts.warning, info: counts.info,
        passed: passed.length, rows_scanned: state.rows.length,
        columns_detected: state.headers.length
      },
      issues, passed_checks: passed,
      potential_impact: state.mode === 'existing_products' ? calculateImpact() : null,
      technical_metadata: {
        file_name: state.fileName, byte_size: state.fileSize,
        encoding: state.detectedEncoding, has_bom: state.hasBOM
      }
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

    // Safe: trim SKUs
    rows.forEach((row, i) => {
      const sku = row['Variant SKU'];
      if (sku && String(sku) !== String(sku).trim()) {
        const before = sku;
        row['Variant SKU'] = String(sku).trim();
        changeLog.push({ row: i + 2, column: 'Variant SKU', before, after: row['Variant SKU'], reason: 'Trimmed whitespace' });
      }
    });

    // Safe: strip entirely blank columns
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
          }
        }
      }
    });

    // User-approved column removals (from "Remove column" checkbox)
    Object.keys(accepted).forEach(key => {
      if (key.indexOf('REMOVE_COLUMN:') === 0 && accepted[key]) {
        const col = key.substring('REMOVE_COLUMN:'.length);
        const idx = headers.indexOf(col);
        if (idx !== -1) {
          headers.splice(idx, 1);
          rows.forEach(r => delete r[col]);
          changeLog.push({ row: 'all', column: col, before: '(included with blanks)', after: '(removed)', reason: 'Removed to prevent destructive overwrites' });
        }
      }
    });

    // Review: generate handles
    if (accepted['HANDLE_MISSING_NEW']) {
      rows.forEach((row, i) => {
        if (isBlank(row['Handle']) && !isBlank(row['Title'])) {
          const before = row['Handle'] || '';
          row['Handle'] = toHandle(row['Title']);
          changeLog.push({ row: i + 2, column: 'Handle', before: before || '(empty)', after: row['Handle'], reason: 'Generated from Title' });
        }
      });
    }

    // Review: normalize handles
    if (accepted['HANDLE_FORMAT_INVALID']) {
      rows.forEach((row, i) => {
        if (!isBlank(row['Handle']) && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row['Handle'])) {
          const before = row['Handle'];
          row['Handle'] = toHandle(row['Handle']);
          changeLog.push({ row: i + 2, column: 'Handle', before, after: row['Handle'], reason: 'Normalized handle format' });
        }
      });
    }

    // Review: HTTPS upgrade
    if (accepted['IMAGE_URL_NOT_HTTPS']) {
      rows.forEach((row, i) => {
        const url = row['Image Src'];
        if (!isBlank(url) && /^http:\/\//i.test(url)) {
          const before = url;
          row['Image Src'] = url.replace(/^http:\/\//i, 'https://');
          changeLog.push({ row: i + 2, column: 'Image Src', before, after: row['Image Src'], reason: 'Upgraded to HTTPS' });
        }
      });
    }

    // Review: repair unclosed HTML
    if (accepted['HTML_UNCLOSED_TAG']) {
      rows.forEach((row, i) => {
        const html = row['Body (HTML)'];
        if (isBlank(html)) return;
        const before = String(html);
        const after = repairHTML(before);
        if (after !== before) {
          row['Body (HTML)'] = after;
          changeLog.push({ row: i + 2, column: 'Body (HTML)', before, after, reason: 'Repaired unclosed HTML tags' });
        }
      });
    }

    const csv = (typeof Papa !== 'undefined' && Papa.unparse)
      ? Papa.unparse({ fields: headers, data: rows.map(r => headers.map(h => r[h] == null ? '' : r[h])) }, { quotes: true })
      : buildCSVManually(headers, rows);

    return { csv, changeLog };
  }

  function buildCSVManually(headers, rows) {
    const escape = v => {
      const s = v == null ? '' : String(v);
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
      const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
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
    h += '<p><strong>Mode:</strong> ' + escapeHtml(r.mode) + '</p>';
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

    back.hidden = true;
    secondary.hidden = true;
    primary.hidden = false;
    primary.disabled = false;
    primary.className = 'asg-btn asg-btn-primary';

    if (name === 'landing' || name === 'scanning') {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;

    if (name === 'setup') {
      back.hidden = false;
      back.textContent = '← Start over';
      back.onclick = resetToLanding;
      primary.textContent = 'Scan this CSV';
      primary.disabled = !state.mode || !state.file;
      primary.onclick = runScan;
    } else if (name === 'report') {
      back.hidden = false;
      back.textContent = '← New scan';
      back.onclick = resetToLanding;
      secondary.hidden = false;
      secondary.textContent = 'Download report (free)';
      secondary.onclick = () => {
        downloadBlob(buildReportHTML(), state.fileName.replace(/\.csv$/i, '') + '_readiness_report.html', 'text/html;charset=utf-8');
      };
      primary.textContent = 'Review and repair →';
      primary.onclick = renderRepair;
    } else if (name === 'repair') {
      back.hidden = false;
      back.textContent = '← Report';
      back.onclick = () => showScreen('report');
      secondary.hidden = false;
      secondary.textContent = 'Skip repairs';
      secondary.onclick = () => { state.acceptedRepairs = {}; doExport(); };
      primary.textContent = 'Generate corrected CSV';
      primary.onclick = doExport;
    } else if (name === 'export') {
      back.hidden = false;
      back.textContent = '← Back';
      back.onclick = () => showScreen('repair');
      primary.textContent = 'Download all three files';
      primary.onclick = downloadAll;
    }
  }

  /* ---------------- Report rendering ---------------- */
  function renderReport() {
    const r = state.result;
    const verdict = document.getElementById('asg-verdict');
    const badge = document.getElementById('asg-verdict-badge');
    const title = document.getElementById('asg-verdict-title');
    const sub = document.getElementById('asg-verdict-sub');
    verdict.classList.remove('is-critical', 'is-warning', 'is-passed');

    if (r.status === 'NOT_READY') {
      verdict.classList.add('is-critical');
      badge.textContent = 'Not ready';
      title.textContent = 'Not ready for import';
      sub.textContent = r.summary.critical + ' critical issue(s) may change existing product data.';
    } else if (r.status === 'READY_WITH_WARNINGS') {
      verdict.classList.add('is-warning');
      badge.textContent = 'Ready with warnings';
      title.textContent = 'Ready with warnings';
      sub.textContent = r.summary.warnings + ' warning(s) should be reviewed before import.';
    } else {
      verdict.classList.add('is-passed');
      badge.textContent = 'Ready for review';
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
    } else {
      document.getElementById('asg-impact').hidden = true;
    }

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
      const marker = issue.severity === 'critical' ? '!' : (issue.severity === 'warning' ? '!' : 'i');

      let body = '';
      if (issue.what_is_wrong) body += '<div class="asg-issue-section-label">What is wrong</div><p>' + escapeHtml(issue.what_is_wrong) + '</p>';
      if (issue.why_it_matters) body += '<div class="asg-issue-section-label">Why this matters</div><p>' + escapeHtml(issue.why_it_matters) + '</p>';

      if (issue.affected_rows && issue.affected_rows.length) {
        body += '<div class="asg-issue-section-label">Affected rows</div>';
        body += '<div class="asg-issue-rows"><table><thead><tr>';
        const keys = Object.keys(issue.affected_rows[0]);
        keys.forEach(k => { body += '<th>' + escapeHtml(k.replace(/_/g, ' ')) + '</th>'; });
        body += '</tr></thead><tbody>';
        issue.affected_rows.forEach(r => {
          body += '<tr>';
          keys.forEach(k => {
            const v = r[k];
            body += '<td>' + escapeHtml(v === '' ? '(blank)' : v) + '</td>';
          });
          body += '</tr>';
        });
        body += '</tbody></table></div>';
      }
      if (issue.suggested_action) body += '<div class="asg-issue-section-label">What you can do</div><p>' + escapeHtml(issue.suggested_action) + '</p>';

      let actions = '';
      if (issue.shopify_doc_url) {
        actions += '<a class="asg-btn" href="' + escapeHtml(issue.shopify_doc_url) + '" target="_blank" rel="noopener">Shopify documentation →</a>';
      }

      el.innerHTML =
        '<div class="asg-issue-head">' +
          '<span class="asg-issue-marker">' + marker + '</span>' +
          '<h4 class="asg-issue-title">' + escapeHtml(issue.title) + '</h4>' +
          '<span class="asg-issue-toggle">▾</span>' +
        '</div>' +
        '<div class="asg-issue-body" hidden>' + body +
          (actions ? '<div class="asg-issue-actions">' + actions + '</div>' : '') +
        '</div>';

      const head = el.querySelector('.asg-issue-head');
      const bodyEl = el.querySelector('.asg-issue-body');
      head.addEventListener('click', () => {
        bodyEl.hidden = !bodyEl.hidden;
        head.classList.toggle('is-open', !bodyEl.hidden);
      });

      list.appendChild(el);
    });
  }

  function renderRepair() {
    const plan = planRepairs();
    state.repairs = plan;
    document.getElementById('asg-repair-summary').textContent =
      'Autonom can safely fix ' + plan.safe.length + ' issue(s). ' +
      plan.review.length + ' need your approval. ' +
      plan.never.length + ' cannot be fixed automatically.';

    function renderList(container, items, allowAccept) {
      const ul = container.querySelector('.asg-repair-list');
      ul.innerHTML = '';
      if (!items.length) {
        const li = document.createElement('li');
        li.textContent = 'None';
        li.style.color = '#8a94a3';
        ul.appendChild(li);
        return;
      }
      items.forEach(issue => {
        const li = document.createElement('li');
        let detail = '';
        if (issue.affected_rows && issue.affected_rows.length) {
          detail = issue.affected_rows.slice(0, 3).map(r => {
            return 'Row ' + r.row + (r.proposed_handle ? ' → ' + r.proposed_handle : (r.proposed ? ' → ' + r.proposed : ''));
          }).join(' · ');
        }

        let controls = '';
        if (allowAccept) {
          controls = '<input type="checkbox" data-accept="' + escapeHtml(issue.code) + '" checked style="margin-top:4px;">';
        }

        // Destructive blanks get a "remove column" checkbox
        let removeColumnControl = '';
        if (issue.code === 'DESTRUCTIVE_BLANK_INCLUDED_COLUMN') {
          const m = issue.title.match(/"([^"]+)"/);
          const colName = m ? m[1] : '';
          removeColumnControl =
            '<label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13px;color:#5b6471;cursor:pointer;">' +
              '<input type="checkbox" data-remove-column="' + escapeHtml(colName) + '" checked>' +
              ' Remove the "' + escapeHtml(colName) + '" column from the corrected file' +
            '</label>';
        }

        li.innerHTML =
          '<div style="flex:1;">' +
            '<div>' + escapeHtml(issue.title) + '</div>' +
            (detail ? '<div class="asg-repair-detail">' + escapeHtml(detail) + '</div>' : '') +
            removeColumnControl +
          '</div>' +
          controls;
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
    const acceptedCount = Object.keys(state.acceptedRepairs || {}).filter(k => state.acceptedRepairs[k] && k.indexOf('REMOVE_COLUMN:') !== 0).length;
    const remaining = plan.never.length;

    document.getElementById('asg-export-summary').textContent =
      plan.safe.length + ' safe fixes applied · ' +
      acceptedCount + ' approved fixes applied · ' +
      remaining + ' issue(s) still in the file';

    const base = state.fileName.replace(/\.csv$/i, '');
    document.getElementById('asg-export-csv-name').textContent = base + '_safe.csv';

    // Update hero based on whether the file is clean
    const checkEl = document.getElementById('asg-export-check');
    const titleEl = document.getElementById('asg-export-title');
    if (remaining > 0) {
      checkEl.textContent = '⚠';
      checkEl.classList.add('is-warning');
      titleEl.textContent = 'Your corrected CSV is ready — with remaining issues';
    } else {
      checkEl.textContent = '✓';
      checkEl.classList.remove('is-warning');
      titleEl.textContent = 'Your corrected CSV is ready';
    }

    // Insert warning panel if issues remain
    const heroEl = document.querySelector('.asg-export-hero');
    const oldWarn = heroEl.parentNode.querySelector('.asg-export-warning');
    if (oldWarn) oldWarn.remove();

    if (remaining > 0) {
      const warn = document.createElement('div');
      warn.className = 'asg-export-warning';
      let html = '<h3>⚠ This file is not fully clean</h3>';
      html += '<p>Autonom fixed everything it safely could, but <strong>' + remaining + ' issue(s) remain</strong> that require your decision:</p>';
      html += '<ul>';
      plan.never.forEach(issue => {
        html += '<li><strong>' + escapeHtml(issue.title) + '</strong>';
        if (issue.suggested_action) html += ' — ' + escapeHtml(issue.suggested_action);
        html += '</li>';
      });
      html += '</ul>';
      html += '<p><strong>Autonom does not invent data.</strong> These issues need your judgement before importing.</p>';
      warn.innerHTML = html;
      heroEl.parentNode.insertBefore(warn, heroEl.nextSibling);
    }

    showScreen('export');
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
      if (input.checked) {
        accepted['REMOVE_COLUMN:' + input.dataset.removeColumn] = true;
      }
    });
    state.acceptedRepairs = accepted;
  }

  function doExport() {
    collectAccepted();
    const result = buildCorrectedCSV();
    state.correctedCSV = result.csv;
    state.changeLog = result.changeLog;
    renderExport();
  }

  function downloadAll() {
    const base = state.fileName.replace(/\.csv$/i, '');
    downloadBlob(state.correctedCSV || '', base + '_safe.csv', 'text/csv;charset=utf-8');
    setTimeout(() => downloadBlob(buildChangeLogCSV(state.changeLog || []), 'autonom_change_log.csv', 'text/csv;charset=utf-8'), 300);
    setTimeout(() => downloadBlob(buildReportHTML(), 'autonom_readiness_report.html', 'text/html;charset=utf-8'), 600);
  }

  /* ---------------- Reset ---------------- */
  function resetToLanding() {
    LOG('resetToLanding');
    state.file = null; state.fileName = ''; state.fileSize = 0; state.fileText = '';
    state.headers = []; state.rows = []; state.mode = null;
    state.result = null; state.repairs = null; state.acceptedRepairs = {};
    state.correctedCSV = null; state.changeLog = null;
    state.hasBOM = false; state.detectedEncoding = 'UTF-8';

    const fi = document.getElementById('asg-file-input');
    if (fi) fi.value = '';

    $$('.asg-mode-card').forEach(c => c.classList.remove('is-selected'));
    $$('.asg-issue').forEach(el => el.hidden = false);
    $$('.asg-filter-btn').forEach(b => b.classList.remove('is-active'));
    const allF = document.querySelector('.asg-filter-btn[data-filter="all"]');
    if (allF) allF.classList.add('is-active');
    $$('.asg-scan-steps li').forEach(el => el.classList.remove('is-running', 'is-done'));

    // Remove any lingering export warning
    const oldWarn = document.querySelector('.asg-export-warning');
    if (oldWarn) oldWarn.remove();

    showScreen('landing');
  }

  function downloadSampleCSV() {
    const sample = [
      'Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Variant SKU,Variant Price,Variant Inventory Qty,Image Src,Status',
      'blue-cotton-tee,Blue Cotton Tee,"<p>Soft cotton tee.</p>",Acme,Shirts,"cotton, blue",TRUE,Size,Small,ACM-BLU-S,19.99,42,https://cdn.example.com/blue-tee.jpg,active',
      'blue-cotton-tee,Blue Cotton Tee,"<p>Soft cotton tee.</p>",Acme,Shirts,"cotton, blue",TRUE,Size,Medium,ACM-BLU-M,19.99,38,https://cdn.example.com/blue-tee.jpg,active',
      'red-cotton-tee,Red Cotton Tee,"<p>Soft cotton tee.</p>",Acme,Shirts,"cotton, red",TRUE,Size,Small,ACM-RED-S,,40,https://cdn.example.com/red-tee.jpg,active',
      'red-cotton-tee,Red Cotton Tee,"<p>Soft cotton tee.</p>",Acme,Shirts,"cotton, red",TRUE,Size,Medium,ACM-RED-M,21.99,36,http://cdn.example.com/red-tee.jpg,active',
      'black-cotton-tee,Black Cotton Tee,"<p>Soft cotton tee</div>",Acme,Shirts,"cotton, black",TRUE,Size,Small,ACM-BLK-S,,55,https://cdn.example.com/black-tee.jpg,active',
      'green-cotton-tee,Green Cotton Tee,"<p>Soft cotton tee.</p>",Acme,Shirts,"cotton, green",TRUE,Size,Small,ACM-BLU-S,19.99,30,https://cdn.example.com/green-tee.jpg,active',
      ',Orphan Variant,"<p>Orphan product.</p>",Acme,Shirts,"orphan",TRUE,Size,Small,ORP-001,15.00,5,https://cdn.example.com/orphan.jpg,active',
      ',Another Orphan,"<p>Orphan product.</p>",Acme,Shirts,"orphan",TRUE,Color,Red,ORP-002,nineteen ninety nine,3.5,https://cdn.example.com/orphan2.jpg,showing',
      ''
    ].join('\n');
    downloadBlob(sample, 'autonom-sample-shopify-products.csv', 'text/csv;charset=utf-8');
  }

  /* ---------------- Wiring ---------------- */
  function wireEvents() {
    LOG('Wiring events');
    const dropzone = document.getElementById('asg-dropzone');
    const fileInput = document.getElementById('asg-file-input');
    const privacyToggle = document.getElementById('asg-privacy-toggle');
    const privacyPanel = document.getElementById('asg-privacy-panel');
    const newScanBtn = document.getElementById('asg-new-scan-btn');
    const sampleBtn = document.getElementById('asg-download-sample-btn');
    const removeFileBtn = document.getElementById('asg-remove-file-btn');

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
        updateActionBar('setup');
      });
    });

    if (newScanBtn) newScanBtn.addEventListener('click', resetToLanding);
    if (sampleBtn) sampleBtn.addEventListener('click', downloadSampleCSV);
    if (removeFileBtn) removeFileBtn.addEventListener('click', () => {
      state.file = null; state.fileName = ''; state.fileSize = 0; state.fileText = '';
      showScreen('landing');
    });

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
    LOG('Events wired');
  }

  /* ---------------- Init ---------------- */
  function init() {
    if (!document.getElementById('autonom-shopify-guard')) return;
    initPrivacyMonitor();
    wireEvents();
    showScreen('landing');
    LOG('Init complete — v1.3.0');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
