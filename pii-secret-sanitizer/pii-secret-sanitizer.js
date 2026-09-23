/**
 * Autonom AI Prompt PII & Secret Sanitizer Pro
 * Single-pane input (paste OR drag-drop upload) · Local-First
 */
(function () {
  'use strict';

  var PREVIEW_MAX_LINES = 10000;
  var PREVIEW_MAX_CHARS = 500000;
  var LARGE_FILE_BYTES  = 10 * 1024 * 1024; // 10 MB — shows a processing note

  function initAutonomPiiPro() {
    var root = document.getElementById('autonom-pii-app');
    if (!root) return;

    /* ---------- DOM REFS ---------- */
    var inputEl        = root.querySelector('#apii-input');
    var outputEl       = root.querySelector('#apii-output');
    var copyBtn        = root.querySelector('#apii-copy-btn');
    var copyText       = root.querySelector('#apii-copy-text');
    var downloadBtn    = root.querySelector('#apii-download-btn');
    var clearBtn       = root.querySelector('#apii-clear-btn');
    var uploadBtn      = root.querySelector('#apii-upload-btn');
    var fileInput      = root.querySelector('#apii-file-input');
    var fileBanner     = root.querySelector('#apii-file-banner');
    var fileNameEl     = root.querySelector('#apii-file-name');
    var fileInfoEl     = root.querySelector('#apii-file-info');
    var fileRemoveBtn  = root.querySelector('#apii-file-remove');
    var inputCard      = root.querySelector('#apii-input-card');
    var countTotal     = root.querySelector('#apii-count-total');
    var breakdownEl    = root.querySelector('#apii-breakdown');
    var customTermsEl  = root.querySelector('#apii-custom-terms');

    var toggleKeys      = root.querySelector('#apii-toggle-keys');
    var toggleDb        = root.querySelector('#apii-toggle-db');
    var toggleEmails    = root.querySelector('#apii-toggle-emails');
    var toggleFinancial = root.querySelector('#apii-toggle-financial');
    var toggleSsn       = root.querySelector('#apii-toggle-ssn');
    var toggleIps       = root.querySelector('#apii-toggle-ips');
    var toggleUrls      = root.querySelector('#apii-toggle-urls');

    /* ---------- STATE ---------- */
    var fileRaw       = '';   // full original file content
    var fileSanitized = '';   // full sanitized file content
    var fileName      = '';

    /* ---------- HELPERS ---------- */
    function luhnOk(numStr) {
      var digits = numStr.replace(/\D/g, '');
      if (digits.length < 13 || digits.length > 19) return false;
      var sum = 0, alt = false;
      for (var i = digits.length - 1; i >= 0; i--) {
        var d = parseInt(digits.charAt(i), 10);
        if (alt) { d *= 2; if (d > 9) d -= 9; }
        sum += d; alt = !alt;
      }
      return sum % 10 === 0;
    }
    function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function formatBytes(b) {
      if (b < 1024) return b + ' B';
      if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
      return (b / 1048576).toFixed(1) + ' MB';
    }
    function downloadBlob(content, filename) {
      var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      var url = URL.createObjectURL(blob);
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    function copyToClipboard(text) {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
      }
      return new Promise(function (resolve, reject) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); resolve(); }
        catch (err) { reject(err); }
        finally { document.body.removeChild(ta); }
      });
    }
    function buildPreview(text) {
      var lines = text.split('\n');
      var totalLines = lines.length;
      var truncated = false;
      if (totalLines > PREVIEW_MAX_LINES) {
        lines = lines.slice(0, PREVIEW_MAX_LINES);
        truncated = true;
      }
      var preview = lines.join('\n');
      if (preview.length > PREVIEW_MAX_CHARS) {
        preview = preview.slice(0, PREVIEW_MAX_CHARS);
        truncated = true;
      }
      return { preview: preview, totalLines: totalLines, truncated: truncated };
    }

    /* ---------- RULES ---------- */
    var RULES = {
      awsKeys:     { regex: /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g, tag: '[AWS_KEY_REDACTED]' },
      openAiKeys:  { regex: /sk-(?:proj-|admin-)?[a-zA-Z0-9_-]{20,}/g, tag: '[OPENAI_KEY_REDACTED]' },
      githubKeys:  { regex: /gh[pousr]_[a-zA-Z0-9]{36,}/g, tag: '[GITHUB_TOKEN_REDACTED]' },
      stripeKeys:  { regex: /sk_(live|test)_[0-9a-zA-Z]{24,}/g, tag: '[STRIPE_KEY_REDACTED]' },
      gcpKeys:     { regex: /AIzaSy[a-zA-Z0-9_-]{33}/g, tag: '[GCP_KEY_REDACTED]' },
      slackHooks:  { regex: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/g, tag: '[SLACK_WEBHOOK_REDACTED]' },
      privateKeys: { regex: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g, tag: '[PRIVATE_KEY_REDACTED]' },
      jwtTokens:   { regex: /eyJ[a-zA-Z0-9_-]{8,}\.eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}/g, tag: '[JWT_REDACTED]' },
      bearer:      { regex: /\bBearer\s+[A-Za-z0-9._\-]{8,}/g, tag: 'Bearer [BEARER_TOKEN_REDACTED]' },
      genericSecrets: {
        regex: /(api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd)\s*[:=]\s*["']?([A-Za-z0-9_\-\.!@#$%^&*]{6,})["']?/gi,
        replaceFunc: function (m, p1, p2) { return m.replace(p2, '[SECRET_REDACTED]'); }
      },
      dbUris:           { regex: /(postgres|postgresql|mysql|mongodb|mongodb\+srv|redis|rediss|mssql):\/\/[^\s"']+/gi, tag: '[DATABASE_URL_REDACTED]' },
      azureConnStrings: { regex: /DefaultEndpointsProtocol=[^\s"']+/gi, tag: '[AZURE_CONNECTION_REDACTED]' },
      basicAuth:        { regex: /Basic\s+[A-Za-z0-9+/=]{16,}/g, tag: 'Basic [BASIC_AUTH_REDACTED]' },
      emails:           { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, tag: '[EMAIL_REDACTED]' },
      creditCards: {
        regex: /\b(?:\d[ -]?){12,18}\d\b/g,
        tag: '[CARD_NUMBER_REDACTED]',
        validate: function (m) { return luhnOk(m); }
      },
      ssnUs: {
        regex: /(?:SSN[:\s#]*)?\b(?!000|666|9\d{2})\d{3}[-\s](?!00)\d{2}[-\s](?!0000)\d{4}\b/gi,
        tag: '[US_SSN_REDACTED]'
      },
      personnummerEu: {
        regex: /\b(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[-\+]\d{4}\b/g,
        tag: '[PERSONAL_ID_REDACTED]'
      },
      ipAddresses:  { regex: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g, tag: '[IP_REDACTED]' },
      ipv6:         { regex: /(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}/g, tag: '[IPV6_REDACTED]' },
      phoneNumbers: { regex: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)[\s.-]?|\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g, tag: '[PHONE_REDACTED]' },
      urlTokens: {
        regex: /([?&](?:token|access_token|id_token|refresh_token|key|apikey|api_key|auth|secret|password|sig|signature)=)[^&\s"']+/gi
      }
    };

    /* ---------- CORE ENGINE ---------- */
    function sanitizeText(rawText) {
      if (!rawText) return { text: '', total: 0, counts: {} };
      var text = rawText;
      var totalRedactions = 0;
      var counts = { keys: 0, db: 0, emails: 0, financial: 0, ssn: 0, ips: 0, urls: 0, custom: 0 };

      if (toggleUrls && toggleUrls.checked) {
        text = text.replace(RULES.urlTokens.regex, function (m, prefix) {
          counts.urls++; totalRedactions++;
          return prefix + '[URL_PARAM_REDACTED]';
        });
      }
      if (toggleKeys && toggleKeys.checked) {
        ['awsKeys','openAiKeys','githubKeys','stripeKeys','gcpKeys','slackHooks','privateKeys','jwtTokens','bearer'].forEach(function (k) {
          text = text.replace(RULES[k].regex, function () { counts.keys++; totalRedactions++; return RULES[k].tag; });
        });
        text = text.replace(RULES.genericSecrets.regex, function (match, p1, p2) {
          counts.keys++; totalRedactions++;
          return RULES.genericSecrets.replaceFunc(match, p1, p2);
        });
      }
      if (toggleDb && toggleDb.checked) {
        ['dbUris','azureConnStrings','basicAuth'].forEach(function (k) {
          text = text.replace(RULES[k].regex, function () { counts.db++; totalRedactions++; return RULES[k].tag; });
        });
      }
      if (toggleEmails && toggleEmails.checked) {
        text = text.replace(RULES.emails.regex, function () { counts.emails++; totalRedactions++; return RULES.emails.tag; });
      }
      if (toggleFinancial && toggleFinancial.checked) {
        text = text.replace(RULES.creditCards.regex, function (m) {
          if (!RULES.creditCards.validate(m)) return m;
          counts.financial++; totalRedactions++;
          return RULES.creditCards.tag;
        });
      }
      if (toggleSsn && toggleSsn.checked) {
        ['ssnUs','personnummerEu'].forEach(function (k) {
          text = text.replace(RULES[k].regex, function () { counts.ssn++; totalRedactions++; return RULES[k].tag; });
        });
      }
      if (toggleIps && toggleIps.checked) {
        ['ipAddresses','ipv6','phoneNumbers'].forEach(function (k) {
          text = text.replace(RULES[k].regex, function () { counts.ips++; totalRedactions++; return RULES[k].tag; });
        });
      }
      if (customTermsEl && customTermsEl.value.trim() !== '') {
        var terms = customTermsEl.value.split(',').map(function (t) { return t.trim(); }).filter(function (t) { return t.length >= 2; });
        terms.forEach(function (term) {
          var esc = escapeRegExp(term);
          var re = new RegExp('(^|[^A-Za-z0-9_])(' + esc + ')(?=$|[^A-Za-z0-9_])', 'gi');
          text = text.replace(re, function (m, prefix) {
            counts.custom++; totalRedactions++;
            return prefix + '[CUSTOM_TERM_REDACTED]';
          });
        });
      }
      return { text: text, total: totalRedactions, counts: counts };
    }

    /* ---------- UI BREAKDOWN ---------- */
    function updateUIBreakdown(total, counts, suffix) {
      if (countTotal) countTotal.innerText = total;
      if (!breakdownEl) return;
      if (total > 0) {
        var parts = [];
        if (counts.keys)      parts.push(counts.keys + ' API Key(s)');
        if (counts.db)        parts.push(counts.db + ' DB String(s)');
        if (counts.emails)    parts.push(counts.emails + ' Email(s)');
        if (counts.financial) parts.push(counts.financial + ' Card(s)');
        if (counts.ssn)       parts.push(counts.ssn + ' National ID(s)');
        if (counts.ips)       parts.push(counts.ips + ' IP/Phone(s)');
        if (counts.urls)      parts.push(counts.urls + ' URL Token(s)');
        if (counts.custom)    parts.push(counts.custom + ' Custom Term(s)');
        breakdownEl.innerText = 'Redacted: ' + parts.join(', ') + (suffix ? ' ' + suffix : '');
      } else {
        breakdownEl.innerText = 'Clean text. No sensitive data detected.' + (suffix ? ' ' + suffix : '');
      }
    }

    /* ---------- PASTE MODE ---------- */
    var debounceTimer = null;
    function processInputText() {
      if (fileRaw) return; // file mode handles its own processing
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        if (!inputEl || !outputEl) return;
        var res = sanitizeText(inputEl.value);
        outputEl.value = res.text;
        updateUIBreakdown(res.total, res.counts);
      }, 150);
    }

    /* ---------- FILE MODE ---------- */
    function processFile() {
      if (!fileRaw) return;
      var previewData = buildPreview(fileRaw);

      // For very large files, show a processing note first
      var isBig = fileRaw.length > LARGE_FILE_BYTES;
      if (isBig && fileInfoEl) {
        fileInfoEl.innerText = 'Processing large file\u2026';
      }

      // Sanitize the full file (blocks briefly on huge files, acceptable tradeoff)
      var res = sanitizeText(fileRaw);
      fileSanitized = res.text;

      // Sanitized preview = first N chars of the sanitized output
      var sanitizedPreview = buildPreview(fileSanitized).preview;

      inputEl.value  = previewData.preview;
      outputEl.value = sanitizedPreview;

      if (fileInfoEl) {
        var info = formatBytes(fileRaw.length) + ' \u00B7 ' +
                   previewData.totalLines.toLocaleString() + ' lines';
        if (previewData.truncated) {
          info += ' \u00B7 previewing first ' + PREVIEW_MAX_LINES.toLocaleString() + ' lines';
        }
        fileInfoEl.innerText = info;
      }

      var suffix = previewData.truncated ? '(counts reflect full file)' : '';
      updateUIBreakdown(res.total, res.counts, suffix);
    }

    function handleSelectedFile(file) {
      fileName = file.name;
      if (fileNameEl) fileNameEl.innerText = file.name;
      if (fileBanner) fileBanner.style.display = 'flex';
      if (fileInfoEl) fileInfoEl.innerText = 'Reading\u2026';

      inputEl.setAttribute('readonly', '');
      inputEl.value = 'Reading file\u2026';

      var reader = new FileReader();
      reader.onload = function (e) {
        fileRaw = e.target.result || '';
        // Defer processing so the banner paints first
        setTimeout(processFile, 30);
      };
      reader.onerror = function () {
        if (fileInfoEl) fileInfoEl.innerText = 'Error reading file.';
        inputEl.value = '';
      };
      reader.readAsText(file);
    }

    function clearFile() {
      fileRaw = '';
      fileSanitized = '';
      fileName = '';
      if (fileBanner) fileBanner.style.display = 'none';
      if (fileInput) fileInput.value = '';
      inputEl.removeAttribute('readonly');
      inputEl.value = '';
      outputEl.value = '';
      updateUIBreakdown(0, {});
    }

    /* ---------- EVENT BINDINGS ---------- */
    ['input', 'keyup', 'change', 'paste'].forEach(function (evt) {
      if (inputEl) inputEl.addEventListener(evt, function () {
        if (fileRaw) return; // locked when file is loaded
        processInputText();
      });
    });
    if (customTermsEl) {
      customTermsEl.addEventListener('input', function () {
        if (fileRaw) processFile();
        else processInputText();
      });
    }
    [toggleKeys, toggleDb, toggleEmails, toggleFinancial, toggleSsn, toggleIps, toggleUrls].forEach(function (chk) {
      if (chk) chk.addEventListener('change', function () {
        if (fileRaw) processFile();
        else processInputText();
      });
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (fileRaw) { clearFile(); return; }
        if (inputEl) inputEl.value = '';
        if (outputEl) outputEl.value = '';
        updateUIBreakdown(0, {});
      });
    }
    if (fileRemoveBtn) fileRemoveBtn.addEventListener('click', clearFile);

    if (copyBtn && outputEl) {
      copyBtn.addEventListener('click', function () {
        if (!outputEl.value) return;
        copyToClipboard(outputEl.value).then(function () {
          if (copyText) copyText.innerText = 'Copied!';
          setTimeout(function () { if (copyText) copyText.innerText = 'Copy Clean Text'; }, 2000);
        }).catch(function () {
          if (copyText) copyText.innerText = 'Press Ctrl+C';
          setTimeout(function () { if (copyText) copyText.innerText = 'Copy Clean Text'; }, 2500);
        });
      });
    }
    if (downloadBtn) {
      downloadBtn.addEventListener('click', function () {
        if (fileRaw && fileSanitized) {
          downloadBlob(fileSanitized, 'sanitized-' + fileName);
          return;
        }
        if (!outputEl || !outputEl.value) return;
        downloadBlob(outputEl.value, 'sanitized-prompt.txt');
      });
    }

    /* ---------- UPLOAD ---------- */
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function (e) {
        if (e.target.files.length > 0) handleSelectedFile(e.target.files[0]);
      });
    }

    /* ---------- DRAG-DROP on input card ---------- */
    if (inputCard) {
      var dragDepth = 0;
      ['dragenter', 'dragover'].forEach(function (evt) {
        inputCard.addEventListener(evt, function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (evt === 'dragenter') dragDepth++;
          inputCard.classList.add('dragover');
        });
      });
      ['dragleave', 'drop'].forEach(function (evt) {
        inputCard.addEventListener(evt, function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (evt === 'dragleave') {
            dragDepth--;
            if (dragDepth > 0) return;
          } else {
            dragDepth = 0;
          }
          inputCard.classList.remove('dragover');
        });
      });
      inputCard.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
          handleSelectedFile(e.dataTransfer.files[0]);
        }
      });
    }

    /* ---------- INITIAL ---------- */
    processInputText();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutonomPiiPro);
  } else {
    initAutonomPiiPro();
  }
})();
