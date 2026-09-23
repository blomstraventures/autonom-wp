/**
 * Autonom Brand Kit Pro v2.1 — Local-first brand asset generation.
 * Changes in 2.1: no nested scroll in asset picker; grouped previews by category.
 */
(function () {
  'use strict';

  var LS_KEY = 'autonom-brand-kit-pro-v2';
  var JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

  var PRESETS = [
    { id: 'favicon-16',    name: 'Favicon 16',             w: 16,   h: 16,   group: 'Favicons', cls: 'icon',   formats: ['png'] },
    { id: 'favicon-32',    name: 'Favicon 32',             w: 32,   h: 32,   group: 'Favicons', cls: 'icon',   formats: ['png'] },
    { id: 'favicon-48',    name: 'Favicon 48',             w: 48,   h: 48,   group: 'Favicons', cls: 'icon',   formats: ['png'] },
    { id: 'favicon-ico',   name: 'favicon.ico (16/32/48)', w: 48,   h: 48,   group: 'Favicons', cls: 'icon',   formats: ['ico'], icoSizes: [16, 32, 48] },
    { id: 'apple-touch',   name: 'Apple touch icon',       w: 180,  h: 180,  group: 'Favicons', cls: 'icon',   formats: ['png'] },
    { id: 'android-192',   name: 'Android Chrome 192',     w: 192,  h: 192,  group: 'Favicons', cls: 'icon',   formats: ['png'] },
    { id: 'android-512',   name: 'Android Chrome 512',     w: 512,  h: 512,  group: 'Favicons', cls: 'icon',   formats: ['png'] },

    { id: 'web-logo',        name: 'Web logo',          w: 800,  h: 400,  group: 'Web', cls: 'web',    formats: ['png', 'webp'] },
    { id: 'email-signature', name: 'Email signature',   w: 400,  h: 100,  group: 'Web', cls: 'web',    formats: ['png'] },
    { id: 'og-image',        name: 'Open Graph image',  w: 1200, h: 630,  group: 'Web', cls: 'banner', formats: ['png', 'jpg'] },
    { id: 'twitter-card',    name: 'Twitter/X card',    w: 1200, h: 675,  group: 'Web', cls: 'banner', formats: ['png', 'jpg'] },

    { id: 'linkedin-logo',     name: 'LinkedIn logo',       w: 300,  h: 300,  group: 'Social', cls: 'avatar', formats: ['png'] },
    { id: 'x-avatar',          name: 'X avatar',            w: 400,  h: 400,  group: 'Social', cls: 'avatar', formats: ['png'] },
    { id: 'youtube-avatar',    name: 'YouTube avatar',      w: 800,  h: 800,  group: 'Social', cls: 'avatar', formats: ['png'] },
    { id: 'instagram-profile', name: 'Instagram profile',   w: 320,  h: 320,  group: 'Social', cls: 'avatar', formats: ['png'] },
    { id: 'github-avatar',     name: 'GitHub avatar',       w: 460,  h: 460,  group: 'Social', cls: 'avatar', formats: ['png'] },
    { id: 'facebook-profile',  name: 'Facebook profile',    w: 180,  h: 180,  group: 'Social', cls: 'avatar', formats: ['png'] },

    { id: 'linkedin-cover',  name: 'LinkedIn cover',   w: 1584, h: 396,  group: 'Social', cls: 'banner', formats: ['png', 'jpg'] },
    { id: 'x-header',        name: 'X header',         w: 1500, h: 500,  group: 'Social', cls: 'banner', formats: ['png', 'jpg'] },
    { id: 'youtube-banner',  name: 'YouTube banner',   w: 2560, h: 1440, group: 'Social', cls: 'banner', formats: ['png', 'jpg'] },
    { id: 'facebook-cover',  name: 'Facebook cover',   w: 820,  h: 312,  group: 'Social', cls: 'banner', formats: ['png', 'jpg'] },

    { id: 'ios-icon',       name: 'iOS app icon',      w: 1024, h: 1024, group: 'App', cls: 'icon', formats: ['png'] },
    { id: 'android-icon',   name: 'Android app icon',  w: 512,  h: 512,  group: 'App', cls: 'icon', formats: ['png'] },
    { id: 'pwa-192',        name: 'PWA icon 192',      w: 192,  h: 192,  group: 'App', cls: 'icon', formats: ['png'] },
    { id: 'pwa-512',        name: 'PWA icon 512',      w: 512,  h: 512,  group: 'App', cls: 'icon', formats: ['png'] }
  ];

  var GROUP_ORDER = ['Favicons', 'Web', 'Social', 'App', 'Custom'];

  /* Preview grouping — label + predicate, order matters */
  var PREVIEW_GROUPS = [
    { label: 'Favicons',         match: function (p) { return p.group === 'Favicons'; } },
    { label: 'App icons',        match: function (p) { return p.group === 'App'; } },
    { label: 'Avatars',          match: function (p) { return p.cls === 'avatar'; } },
    { label: 'Banners & covers', match: function (p) { return p.cls === 'banner'; } },
    { label: 'Web assets',       match: function (p) { return p.cls === 'web'; } },
    { label: 'Custom sizes',     match: function (p) { return p.group === 'Custom'; } }
  ];

  var PALETTE_FIXED = [
    { name: 'Transparent', value: null },
    { name: 'White',       value: '#ffffff' },
    { name: 'Black',       value: '#111827' },
    { name: 'Navy',        value: '#101a31' },
    { name: 'Mint',        value: '#79f2c0' },
    { name: 'Blue',        value: '#8ca7ff' }
  ];

  var DEFAULT_SELECTED = [
    'favicon-32', 'favicon-ico', 'apple-touch', 'android-192', 'android-512',
    'web-logo', 'og-image', 'linkedin-cover', 'youtube-banner', 'x-header'
  ];

  /* ---------- UTILITIES ---------- */
  function loadJsZip(cb) {
    if (window.JSZip) return cb();
    var s = document.createElement('script');
    s.src = JSZIP_URL;
    s.onload = function () { cb(); };
    s.onerror = function () { cb(new Error('JSZip failed to load')); };
    document.head.appendChild(s);
  }
  function bytes(n) {
    var u = ['B', 'KB', 'MB'], i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(i ? 1 : 0) + ' ' + u[i];
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function hexToRgb(hex) {
    if (!hex || hex[0] !== '#') return { r: 16, g: 26, b: 49 };
    var h = hex.slice(1);
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }
  function luminance(hex) {
    var c = hexToRgb(hex);
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    r = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    g = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    b = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function mixHex(a, b, t) {
    var ca = hexToRgb(a), cb = hexToRgb(b);
    return '#' +
      Math.round(ca.r + (cb.r - ca.r) * t).toString(16).padStart(2, '0') +
      Math.round(ca.g + (cb.g - ca.g) * t).toString(16).padStart(2, '0') +
      Math.round(ca.b + (cb.b - ca.b) * t).toString(16).padStart(2, '0');
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }
  function extractPalette(img, count) {
    var c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 64, 64);
    var data;
    try { data = ctx.getImageData(0, 0, 64, 64).data; } catch (_) { return []; }
    var buckets = {};
    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      var r = data[i] & 0xf0, g = data[i + 1] & 0xf0, b = data[i + 2] & 0xf0;
      if (r >= 240 && g >= 240 && b >= 240) continue;
      if (r <= 16 && g <= 16 && b <= 16) continue;
      var key = r + ',' + g + ',' + b;
      buckets[key] = (buckets[key] || 0) + 1;
    }
    return Object.keys(buckets)
      .sort(function (a, b) { return buckets[b] - buckets[a]; })
      .slice(0, count)
      .map(function (k) {
        return '#' + k.split(',').map(function (x) {
          var v = parseInt(x, 10).toString(16);
          return v.length < 2 ? '0' + v : v;
        }).join('');
      });
  }
  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
      resolve();
    });
  }
  function downloadBlob(blob, filename) {
    if (!blob) return;
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function webpSupported() {
    var c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    try { return c.toDataURL('image/webp').indexOf('data:image/webp') === 0; }
    catch (_) { return false; }
  }
  function mimeFor(fmt) {
    if (fmt === 'jpg' || fmt === 'jpeg') return 'image/jpeg';
    if (fmt === 'webp') return 'image/webp';
    return 'image/png';
  }
  function extFor(fmt) { return fmt === 'jpeg' ? 'jpg' : fmt; }

  /* ---------- INIT ---------- */
  function init(root) {
    if (root.dataset.abkReady === '1') return;
    root.dataset.abkReady = '1';

    var $  = function (s) { return root.querySelector(s); };

    var dropEl       = $('.abk-drop');
    var fileInput    = $('.abk-file');
    var sourceEl     = $('.abk-source');
    var thumbEl      = $('.abk-thumb');
    var fileNameEl   = $('.abk-filename');
    var dimsEl       = $('.abk-dimensions');
    var bgSegWrap    = $('.abk-seg-bg');
    var bgColor1In   = $('.abk-bg-color1');
    var bgColor2In   = $('.abk-bg-color2');
    var swapBtn      = $('.abk-swap-btn');
    var bgColor2Wrap = $('.abk-bg-color2-wrap');
    var paletteWrap  = $('.abk-palette');
    var padXInput    = $('.abk-pad-x');
    var padYInput    = $('.abk-pad-y');
    var padXLabel    = $('.abk-pad-x-label');
    var padYLabel    = $('.abk-pad-y-label');
    var fitSelect    = $('.abk-fit');
    var maskSelect   = $('.abk-mask');
    var templateSel  = $('.abk-template');
    var wordmarkChk  = $('.abk-wordmark');
    var brandNameIn  = $('.abk-brand-name');
    var taglineIn    = $('.abk-tagline');
    var websiteIn    = $('.abk-website');
    var emailIn      = $('.abk-email');
    var checksEl     = $('.abk-checks');
    var previewsEl   = $('.abk-previews');
    var countEl      = $('.abk-count');
    var downloadBtn  = $('.abk-download');
    var resetBtn     = $('.abk-reset');
    var selectAllBtn = $('.abk-select-all');
    var clearAllBtn  = $('.abk-clear-all');
    var snippetPre   = $('.abk-snippet-pre');
    var snippetCopy  = $('.abk-snippet-copy');
    var circleChk    = $('.abk-circle-safe');
    var addNameIn    = $('.abk-add-name');
    var addWIn       = $('.abk-add-w');
    var addHIn       = $('.abk-add-h');
    var addBtn       = $('.abk-add-btn');

    var state = {
      img: null,
      file: null,
      bgMode: 'transparent',
      bgColor1: '#101a31',
      bgColor2: '#79f2c0',
      padX: 12,
      padY: 12,
      fit: 'contain',
      mask: 'none',
      template: 'minimal',
      wordmark: false,
      circleSafe: false,
      brandName: '',
      tagline: '',
      website: '',
      contactEmail: '',
      selected: new Set(DEFAULT_SELECTED),
      custom: [],
      palette: [],
      groupsOpen: { Favicons: true, Web: true, Social: false, App: false, Custom: true }
    };

    /* ---------- PERSISTENCE ---------- */
    function loadSettings() {
      try {
        var raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        var s = JSON.parse(raw);
        if (!s || typeof s !== 'object') return;
        ['bgMode','bgColor1','bgColor2','fit','mask','template','brandName','tagline','website','contactEmail'].forEach(function (k) {
          if (typeof s[k] === 'string') state[k] = s[k];
        });
        ['padX','padY'].forEach(function (k) {
          if (typeof s[k] === 'number') state[k] = s[k];
        });
        ['wordmark','circleSafe'].forEach(function (k) {
          if (typeof s[k] === 'boolean') state[k] = s[k];
        });
        if (Array.isArray(s.selected)) state.selected = new Set(s.selected);
        if (Array.isArray(s.custom)) state.custom = s.custom;
        if (s.groupsOpen && typeof s.groupsOpen === 'object') {
          Object.keys(s.groupsOpen).forEach(function (k) { state.groupsOpen[k] = !!s.groupsOpen[k]; });
        }
      } catch (_) {}
    }
    function saveSettings() {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({
          bgMode: state.bgMode,
          bgColor1: state.bgColor1,
          bgColor2: state.bgColor2,
          padX: state.padX, padY: state.padY,
          fit: state.fit, mask: state.mask, template: state.template,
          wordmark: state.wordmark, circleSafe: state.circleSafe,
          brandName: state.brandName, tagline: state.tagline,
          website: state.website, contactEmail: state.contactEmail,
          selected: Array.from(state.selected),
          custom: state.custom,
          groupsOpen: state.groupsOpen
        }));
      } catch (_) {}
    }

    function allPresets() {
      return PRESETS.concat(state.custom.map(function (c) {
        return { id: c.id, name: c.name, w: c.w, h: c.h, group: 'Custom', cls: 'icon', formats: ['png'] };
      }));
    }

    /* ---------- SYNC CONTROLS FROM STATE ---------- */
    function applyControlsFromState() {
      root.querySelectorAll('.abk-seg-bg button').forEach(function (b) {
        b.classList.toggle('is-active', b.dataset.mode === state.bgMode);
      });
      bgColor1In.value = state.bgColor1;
      bgColor2In.value = state.bgColor2;
      bgColor2Wrap.style.display = state.bgMode === 'gradient' ? '' : 'none';
      swapBtn.style.display = state.bgMode === 'gradient' ? '' : 'none';

      padXInput.value = state.padX;
      padYInput.value = state.padY;
      padXLabel.textContent = state.padX + '%';
      padYLabel.textContent = state.padY + '%';

      fitSelect.value = state.fit;
      maskSelect.value = state.mask;
      templateSel.value = state.template;

      wordmarkChk.checked = state.wordmark;
      brandNameIn.value = state.brandName;
      taglineIn.value = state.tagline;
      websiteIn.value = state.website;
      emailIn.value = state.contactEmail;
      circleChk.checked = state.circleSafe;
    }

    /* ---------- PALETTE ---------- */
    function renderPalette() {
      paletteWrap.innerHTML = '';
      if (!state.palette.length) return;
      state.palette.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'abk-palette-swatch';
        b.title = 'Use ' + c;
        b.style.background = c;
        b.onclick = function () {
          state.bgColor1 = c;
          if (state.bgMode === 'transparent') state.bgMode = 'solid';
          saveSettings();
          applyControlsFromState();
          render();
        };
        paletteWrap.appendChild(b);
      });
    }

    /* ---------- COLLAPSIBLE ASSET GROUPS ---------- */
    function buildChecks() {
      checksEl.innerHTML = '';
      var presets = allPresets();

      GROUP_ORDER.forEach(function (group) {
        var inGroup = presets.filter(function (p) { return p.group === group; });
        if (!inGroup.length) return;

        var details = document.createElement('details');
        details.className = 'abk-group';
        details.dataset.group = group;
        if (state.groupsOpen[group] !== false) details.open = true;

        details.addEventListener('toggle', function () {
          state.groupsOpen[group] = details.open;
          saveSettings();
        });

        var summary = document.createElement('summary');
        var sumLabel = document.createElement('span');
        sumLabel.textContent = group;
        summary.appendChild(sumLabel);

        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'abk-group-toggle';
        toggle.textContent = 'Toggle all';
        toggle.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          var anyUnselected = inGroup.some(function (p) { return !state.selected.has(p.id); });
          inGroup.forEach(function (p) {
            if (anyUnselected) state.selected.add(p.id);
            else state.selected.delete(p.id);
          });
          saveSettings();
          buildChecks();
          render();
        };
        summary.appendChild(toggle);
        details.appendChild(summary);

        var body = document.createElement('div');
        body.className = 'abk-group-body';

        inGroup.forEach(function (p) {
          var label = document.createElement('label');
          label.className = 'abk-check';

          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = state.selected.has(p.id);
          cb.onchange = function () {
            if (cb.checked) state.selected.add(p.id);
            else state.selected.delete(p.id);
            saveSettings();
            render();
          };
          label.appendChild(cb);

          var bodyEl = document.createElement('div');
          bodyEl.className = 'abk-check-body';
          bodyEl.innerHTML = '<b>' + escapeHtml(p.name) + '</b><small>' +
            p.w + ' × ' + p.h + ' · ' +
            p.formats.map(function (f) { return f.toUpperCase(); }).join(', ') +
            '</small>';
          label.appendChild(bodyEl);
          body.appendChild(label);
        });

        details.appendChild(body);
        checksEl.appendChild(details);
      });
    }

    /* ---------- CUSTOM PRESET ---------- */
    addBtn.onclick = function () {
      var name = addNameIn.value.trim();
      var w = parseInt(addWIn.value, 10);
      var h = parseInt(addHIn.value, 10);
      if (!name) { alert('Please name the custom size.'); return; }
      if (!w || !h || w < 4 || h < 4 || w > 4096 || h > 4096) {
        alert('Width and height must be between 4 and 4096 pixels.');
        return;
      }
      var id = 'custom-' + Date.now();
      state.custom.push({ id: id, name: name, w: w, h: h });
      state.selected.add(id);
      state.groupsOpen.Custom = true;
      addNameIn.value = ''; addWIn.value = ''; addHIn.value = '';
      saveSettings();
      buildChecks();
      render();
    };

    /* ---------- SELECT / CLEAR / RESET ---------- */
    selectAllBtn.onclick = function () {
      allPresets().forEach(function (p) { state.selected.add(p.id); });
      saveSettings(); buildChecks(); render();
    };
    clearAllBtn.onclick = function () {
      state.selected.clear();
      saveSettings(); buildChecks(); render();
    };
    resetBtn.onclick = function () {
      if (!confirm('Reset all settings, background, and selections?')) return;
      state.bgMode = 'transparent';
      state.bgColor1 = '#101a31';
      state.bgColor2 = '#79f2c0';
      state.padX = 12; state.padY = 12;
      state.fit = 'contain'; state.mask = 'none';
      state.template = 'minimal'; state.wordmark = false;
      state.circleSafe = false;
      state.brandName = ''; state.tagline = '';
      state.website = ''; state.contactEmail = '';
      state.selected = new Set(DEFAULT_SELECTED);
      state.custom = [];
      state.groupsOpen = { Favicons: true, Web: true, Social: false, App: false, Custom: true };
      try { localStorage.removeItem(LS_KEY); } catch (_) {}
      applyControlsFromState();
      buildChecks();
      render();
    };

    /* ---------- SETTINGS EVENT WIRING ---------- */
    bgSegWrap.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      state.bgMode = btn.dataset.mode;
      saveSettings();
      applyControlsFromState();
      render();
    });
    bgColor1In.addEventListener('input', function () { state.bgColor1 = bgColor1In.value; saveSettings(); render(); });
    bgColor2In.addEventListener('input', function () { state.bgColor2 = bgColor2In.value; saveSettings(); render(); });
    swapBtn.addEventListener('click', function () {
      var t = state.bgColor1; state.bgColor1 = state.bgColor2; state.bgColor2 = t;
      saveSettings(); applyControlsFromState(); render();
    });
    padXInput.addEventListener('input', function () {
      state.padX = +padXInput.value; padXLabel.textContent = state.padX + '%';
      saveSettings(); render();
    });
    padYInput.addEventListener('input', function () {
      state.padY = +padYInput.value; padYLabel.textContent = state.padY + '%';
      saveSettings(); render();
    });
    fitSelect.addEventListener('change', function () { state.fit = fitSelect.value; saveSettings(); render(); });
    maskSelect.addEventListener('change', function () { state.mask = maskSelect.value; saveSettings(); render(); });
    templateSel.addEventListener('change', function () { state.template = templateSel.value; saveSettings(); render(); });
    wordmarkChk.addEventListener('change', function () { state.wordmark = wordmarkChk.checked; saveSettings(); render(); });
    circleChk.addEventListener('change', function () { state.circleSafe = circleChk.checked; saveSettings(); render(); });
    [brandNameIn, taglineIn, websiteIn, emailIn].forEach(function (el) {
      el.addEventListener('input', function () {
        state.brandName = brandNameIn.value;
        state.tagline = taglineIn.value;
        state.website = websiteIn.value;
        state.contactEmail = emailIn.value;
        saveSettings();
        render();
      });
    });

    /* ---------- FILE LOAD ---------- */
    dropEl.onclick = function () { fileInput.click(); };
    ['dragenter', 'dragover'].forEach(function (e) {
      dropEl.addEventListener(e, function (x) { x.preventDefault(); dropEl.classList.add('is-drag'); });
    });
    ['dragleave', 'drop'].forEach(function (e) {
      dropEl.addEventListener(e, function (x) { x.preventDefault(); dropEl.classList.remove('is-drag'); });
    });
    dropEl.addEventListener('drop', function (e) {
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(f);
    });
    fileInput.onchange = function () { if (fileInput.files[0]) loadFile(fileInput.files[0]); };

    function loadFile(f) {
      if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)
          && !/\.(png|jpe?g|webp|svg)$/i.test(f.name)) {
        alert('Please choose a PNG, JPG, WebP or SVG image.');
        return;
      }
      state.file = f;
      var url = URL.createObjectURL(f);
      var im = new Image();
      im.onload = function () {
        state.img = im;
        sourceEl.hidden = false;
        thumbEl.src = url;
        fileNameEl.textContent = f.name;
        dimsEl.textContent = im.naturalWidth + ' × ' + im.naturalHeight + ' · ' + bytes(f.size);
        downloadBtn.disabled = false;
        try { state.palette = extractPalette(im, 6); } catch (_) { state.palette = []; }
        if (state.palette.length >= 2 && state.bgMode === 'transparent') {
          state.bgColor2 = state.palette[1];
        }
        renderPalette();
        render();
      };
      im.onerror = function () { alert('This image could not be read by the browser.'); };
      im.src = url;
    }

    /* ---------- DRAW HELPERS ---------- */
    function contrastText(bgHex) {
      return luminance(bgHex) < 0.45 ? '#ffffff' : '#111827';
    }
    function bannerBackgroundHex() {
      if (state.bgMode === 'transparent') return state.palette[0] || '#101a31';
      if (state.bgMode === 'solid') return state.bgColor1;
      return mixHex(state.bgColor1, state.bgColor2, 0.5);
    }
    function drawBackground(ctx, w, h, forceFill) {
      if (state.bgMode === 'transparent') {
        if (forceFill) {
          ctx.fillStyle = state.palette[0] || '#101a31';
          ctx.fillRect(0, 0, w, h);
        }
        return;
      }
      if (state.bgMode === 'solid') {
        ctx.fillStyle = state.bgColor1;
        ctx.fillRect(0, 0, w, h);
        return;
      }
      var angle = 135 * Math.PI / 180;
      var cx = w / 2, cy = h / 2, len = Math.max(w, h);
      var x1 = cx - Math.cos(angle) * len / 2, y1 = cy - Math.sin(angle) * len / 2;
      var x2 = cx + Math.cos(angle) * len / 2, y2 = cy + Math.sin(angle) * len / 2;
      var g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, state.bgColor1);
      g.addColorStop(1, state.bgColor2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    function drawLogoInBox(ctx, x, y, boxW, boxH) {
      if (!state.img || boxW < 1 || boxH < 1) return;
      var iw = state.img.naturalWidth, ih = state.img.naturalHeight;
      var fitScale = state.fit === 'cover'
        ? Math.max(boxW / iw, boxH / ih)
        : Math.min(boxW / iw, boxH / ih);
      var drawW = iw * fitScale, drawH = ih * fitScale;
      var drawX = x + (boxW - drawW) / 2;
      var drawY = y + (boxH - drawH) / 2;
      if (state.fit === 'cover') {
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, boxW, boxH); ctx.clip();
        ctx.drawImage(state.img, drawX, drawY, drawW, drawH);
        ctx.restore();
      } else {
        ctx.drawImage(state.img, drawX, drawY, drawW, drawH);
      }
    }
    function drawText(ctx, text, x, y, opts) {
      if (!text) return;
      opts = opts || {};
      var weight = opts.weight || 600;
      var size = opts.size || 16;
      var family = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = opts.color || '#ffffff';
      ctx.globalAlpha = opts.opacity || 1;
      ctx.textAlign = opts.align || 'left';
      ctx.textBaseline = opts.baseline || 'alphabetic';
      ctx.font = weight + ' ' + size + 'px ' + family;
      var measured = ctx.measureText(text);
      if (opts.maxWidth && measured.width > opts.maxWidth) {
        var ratio = opts.maxWidth / measured.width;
        var newSize = Math.max(9, Math.floor(size * ratio));
        ctx.font = weight + ' ' + newSize + 'px ' + family;
        if (ctx.measureText(text).width > opts.maxWidth) {
          var t = text;
          while (t.length > 1 && ctx.measureText(t + '…').width > opts.maxWidth) t = t.slice(0, -1);
          text = t + '…';
        }
      }
      ctx.fillText(text, x, y);
      ctx.globalAlpha = 1;
    }

    function drawIconLike(ctx, w, h) {
      var applyMask = state.mask === 'circle' || state.mask === 'rounded';
      if (applyMask) {
        ctx.save();
        ctx.beginPath();
        if (state.mask === 'circle') ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
        else roundRect(ctx, 0, 0, w, h, Math.min(w, h) * 0.15);
        ctx.clip();
      }
      drawBackground(ctx, w, h, false);
      var padX = state.padX / 100, padY = state.padY / 100;
      var availW = Math.max(1, w * (1 - 2 * padX));
      var availH = Math.max(1, h * (1 - 2 * padY));
      drawLogoInBox(ctx, (w - availW) / 2, (h - availH) / 2, availW, availH);
      if (applyMask) ctx.restore();
    }
    function drawWeb(ctx, w, h) {
      drawBackground(ctx, w, h, false);
      var hasText = state.wordmark && (state.brandName || state.tagline);
      var textColor = state.bgMode === 'transparent' ? '#111827' : contrastText(bannerBackgroundHex());
      if (!hasText) {
        var pad = state.padX / 100;
        var avail = Math.min(w * (1 - 2 * pad), h * (1 - 2 * pad));
        drawLogoInBox(ctx, (w - avail) / 2, (h - avail) / 2, avail, avail);
        return;
      }
      var p = Math.min(w, h) * 0.08;
      var textAreaW = w * 0.55;
      var logoAreaW = w - p * 2 - textAreaW - p * 0.5;
      var logoAreaH = h - p * 2;
      drawLogoInBox(ctx, p, p, logoAreaW, logoAreaH);
      var tLeft = p + logoAreaW + p * 0.8;
      var tWidth = w - p - tLeft;
      var fs = h * 0.20;
      var hasName = !!state.brandName, hasTag = !!state.tagline;
      if (hasName && hasTag) {
        drawText(ctx, state.brandName, tLeft, h / 2 - fs * 0.1, { size: fs, weight: 700, color: textColor, maxWidth: tWidth });
        drawText(ctx, state.tagline, tLeft, h / 2 + fs * 1.0, { size: fs * 0.55, weight: 500, color: textColor, opacity: 0.8, maxWidth: tWidth });
      } else if (hasName) {
        drawText(ctx, state.brandName, tLeft, h / 2 + fs * 0.35, { size: fs, weight: 700, color: textColor, maxWidth: tWidth });
      } else {
        drawText(ctx, state.tagline, tLeft, h / 2 + fs * 0.35, { size: fs, weight: 600, color: textColor, maxWidth: tWidth });
      }
    }

    var TEMPLATES = {
      minimal: function (ctx, w, h) {
        var padX = w * 0.06, padY = h * 0.14;
        var logoSize = Math.min(h * 0.42, w * 0.18);
        drawLogoInBox(ctx, padX, padY, logoSize, logoSize);
        var fg = contrastText(bannerBackgroundHex());
        var fs = Math.max(11, h * 0.075);
        var line1 = state.tagline || state.brandName;
        var line2 = state.website;
        var y1 = h - padY - (line2 ? fs * 1.35 : 0);
        if (line1) drawText(ctx, line1, padX, y1, { size: fs, weight: 700, color: fg, maxWidth: w - padX * 2 });
        if (line2) drawText(ctx, line2, padX, h - padY, { size: fs * 0.7, weight: 500, color: fg, opacity: 0.75, maxWidth: w - padX * 2 });
      },
      centered: function (ctx, w, h) {
        var logoSize = Math.min(h * 0.32, w * 0.15);
        var logoY = h * 0.18;
        drawLogoInBox(ctx, (w - logoSize) / 2, logoY, logoSize, logoSize);
        var fg = contrastText(bannerBackgroundHex());
        var fs = Math.max(11, h * 0.08);
        if (state.brandName) drawText(ctx, state.brandName, w / 2, logoY + logoSize + fs * 1.7, { size: fs, weight: 700, color: fg, align: 'center', maxWidth: w * 0.85 });
        if (state.tagline) drawText(ctx, state.tagline, w / 2, logoY + logoSize + fs * 3.1, { size: fs * 0.6, weight: 500, color: fg, align: 'center', opacity: 0.8, maxWidth: w * 0.85 });
      },
      split: function (ctx, w, h) {
        var pad = Math.min(w, h) * 0.1;
        var logoSize = Math.min(h - pad * 2, w * 0.3);
        var logoY = (h - logoSize) / 2;
        drawLogoInBox(ctx, pad, logoY, logoSize, logoSize);
        var tLeft = pad + logoSize + pad * 0.8;
        var tWidth = w - pad - tLeft;
        var fg = contrastText(bannerBackgroundHex());
        var fs = Math.max(11, h * 0.09);
        if (state.brandName) drawText(ctx, state.brandName, tLeft, h / 2 - fs * 0.15, { size: fs, weight: 700, color: fg, maxWidth: tWidth });
        if (state.tagline) drawText(ctx, state.tagline, tLeft, h / 2 + fs * 1.05, { size: fs * 0.55, weight: 500, color: fg, opacity: 0.8, maxWidth: tWidth });
      },
      frame: function (ctx, w, h) {
        var pad = Math.min(w, h) * 0.07;
        var logoSize = Math.min(h * 0.22, w * 0.1);
        drawLogoInBox(ctx, pad, pad, logoSize, logoSize);
        var fg = contrastText(bannerBackgroundHex());
        var fs = Math.max(11, h * 0.12);
        if (state.tagline) drawText(ctx, state.tagline, w / 2, h / 2 + fs * 0.4, { size: fs, weight: 700, color: fg, align: 'center', maxWidth: w * 0.8 });
        if (state.website) drawText(ctx, state.website, w / 2, h / 2 + fs * 1.8, { size: fs * 0.5, weight: 500, color: fg, align: 'center', opacity: 0.75, maxWidth: w * 0.8 });
      }
    };

    function drawBanner(ctx, w, h) {
      drawBackground(ctx, w, h, true);
      var tpl = TEMPLATES[state.template] || TEMPLATES.minimal;
      tpl(ctx, w, h);
    }
    function drawCircleOverlay(ctx, w, h) {
      ctx.save();
      var r = Math.min(w, h) / 2;
      ctx.fillStyle = 'rgba(7, 20, 20, 0.45)';
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2, true);
      ctx.fill();
      ctx.strokeStyle = 'rgba(121, 242, 192, 0.9)';
      ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.008);
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r - ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    function drawAsset(canvas, preset, opts) {
      opts = opts || {};
      var w = preset.w, h = preset.h;
      if (opts.maxDim) {
        var scale = Math.min(1, opts.maxDim / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
      }
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);

      switch (preset.cls) {
        case 'banner': drawBanner(ctx, w, h); break;
        case 'web':    drawWeb(ctx, w, h); break;
        default:       drawIconLike(ctx, w, h); break;
      }
      if (opts.circleSafe && preset.cls === 'avatar') drawCircleOverlay(ctx, w, h);
    }

    /* ---------- PREVIEW CARD BUILDER ---------- */
    function buildPreviewCard(preset) {
      var card = document.createElement('article');
      card.className = 'abk-preview';

      var headRow = document.createElement('div');
      headRow.className = 'abk-preview-head-row';

      var title = document.createElement('h4');
      title.textContent = preset.name;
      headRow.appendChild(title);

      var dlBtn = document.createElement('button');
      dlBtn.type = 'button';
      dlBtn.className = 'abk-preview-dl';
      dlBtn.textContent = 'Download';
      dlBtn.onclick = function () { downloadSingle(preset); };
      headRow.appendChild(dlBtn);

      card.appendChild(headRow);

      var canvasWrap = document.createElement('div');
      canvasWrap.className = 'abk-canvas-wrap';
      var canvas = document.createElement('canvas');
      canvasWrap.appendChild(canvas);
      card.appendChild(canvasWrap);

      var meta = document.createElement('div');
      meta.className = 'abk-preview-meta';
      meta.textContent = preset.w + ' × ' + preset.h + ' · ' +
        preset.formats.map(function (f) { return f.toUpperCase(); }).join(', ');
      card.appendChild(meta);

      // draw asynchronously so all cards paint before heavy work
      drawAsset(canvas, preset, { maxDim: 340, circleSafe: state.circleSafe });

      return card;
    }

    /* ---------- RENDER (grouped previews) ---------- */
    function render() {
      var presets = allPresets();
      var chosen = presets.filter(function (p) { return state.selected.has(p.id); });

      countEl.textContent = chosen.length + ' asset' + (chosen.length === 1 ? '' : 's') + ' selected';

      if (!state.img) {
        previewsEl.className = 'abk-previews is-empty';
        previewsEl.textContent = 'Upload a logo to preview your brand kit.';
        downloadBtn.disabled = true;
        updateSnippet([]);
        return;
      }
      downloadBtn.disabled = chosen.length === 0;

      if (!chosen.length) {
        previewsEl.className = 'abk-previews is-empty';
        previewsEl.textContent = 'Select at least one asset from the list.';
        updateSnippet([]);
        return;
      }

      previewsEl.className = 'abk-previews';
      previewsEl.innerHTML = '';

      PREVIEW_GROUPS.forEach(function (grp) {
        var inGroup = chosen.filter(grp.match);
        if (!inGroup.length) return;

        var section = document.createElement('section');
        section.className = 'abk-preview-section';

        var head = document.createElement('div');
        head.className = 'abk-preview-section-head';
        head.innerHTML = '<span>' + escapeHtml(grp.label) + '</span><span class="count">' +
          inGroup.length + ' asset' + (inGroup.length === 1 ? '' : 's') + '</span>';
        section.appendChild(head);

        var grid = document.createElement('div');
        grid.className = 'abk-preview-grid';
        inGroup.forEach(function (p) { grid.appendChild(buildPreviewCard(p)); });
        section.appendChild(grid);

        previewsEl.appendChild(section);
      });

      updateSnippet(chosen);
    }

    /* ---------- SNIPPET ---------- */
    function updateSnippet(chosen) {
      if (!snippetPre) return;
      var hasFavicons = chosen.some(function (p) { return p.group === 'Favicons'; });
      if (!hasFavicons) {
        snippetPre.textContent = 'Select favicon assets to generate a <head> snippet.';
        return;
      }
      snippetPre.textContent = [
        '<link rel="icon" type="image/png" sizes="32x32" href="/favicons/favicon-32x32.png">',
        '<link rel="icon" type="image/png" sizes="16x16" href="/favicons/favicon-16x16.png">',
        '<link rel="shortcut icon" href="/favicons/favicon.ico">',
        '<link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon-180x180.png">',
        '<link rel="icon" type="image/png" sizes="192x192" href="/favicons/android-chrome-192x192.png">',
        '<link rel="icon" type="image/png" sizes="512x512" href="/favicons/android-chrome-512x512.png">',
        '<link rel="manifest" href="/site.webmanifest">'
      ].join('\n');
    }
    snippetCopy.onclick = function () {
      copyToClipboard(snippetPre.textContent || '').then(function () {
        var orig = snippetCopy.textContent;
        snippetCopy.textContent = 'Copied!';
        setTimeout(function () { snippetCopy.textContent = orig; }, 1600);
      });
    };

    /* ---------- CANVAS → BLOB ---------- */
    function canvasToBlob(canvas, mime) {
      return new Promise(function (resolve) {
        try { canvas.toBlob(function (b) { resolve(b); }, mime, 0.92); }
        catch (_) { resolve(null); }
      });
    }
    async function buildIco(sizes) {
      var pngs = [];
      for (var i = 0; i < sizes.length; i++) {
        var size = sizes[i];
        var c = document.createElement('canvas');
        drawAsset(c, { w: size, h: size, cls: 'icon' }, {});
        var blob = await canvasToBlob(c, 'image/png');
        if (!blob) continue;
        var buf = await blob.arrayBuffer();
        pngs.push({ size: size, data: buf });
      }
      if (!pngs.length) return null;
      var count = pngs.length;
      var headerSize = 6 + count * 16;
      var total = headerSize;
      for (var j = 0; j < pngs.length; j++) total += pngs[j].data.byteLength;
      var out = new Uint8Array(total);
      var dv = new DataView(out.buffer);
      dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, count, true);
      var offset = headerSize;
      for (var k = 0; k < count; k++) {
        var entryOff = 6 + k * 16;
        var p = pngs[k];
        dv.setUint8(entryOff + 0, p.size >= 256 ? 0 : p.size);
        dv.setUint8(entryOff + 1, p.size >= 256 ? 0 : p.size);
        dv.setUint8(entryOff + 2, 0); dv.setUint8(entryOff + 3, 0);
        dv.setUint16(entryOff + 4, 1, true); dv.setUint16(entryOff + 6, 32, true);
        dv.setUint32(entryOff + 8, p.data.byteLength, true);
        dv.setUint32(entryOff + 12, offset, true);
        out.set(new Uint8Array(p.data), offset);
        offset += p.data.byteLength;
      }
      return new Blob([out], { type: 'image/x-icon' });
    }

    /* ---------- SINGLE DOWNLOAD ---------- */
    async function downloadSingle(preset) {
      if (!state.img) return;
      var baseName = (state.file.name || 'logo').replace(/\.[^.]+$/, '');
      var supportsWebp = webpSupported();
      for (var i = 0; i < preset.formats.length; i++) {
        var fmt = preset.formats[i];
        if (fmt === 'webp' && !supportsWebp) continue;
        if (fmt === 'ico') {
          var icoBlob = await buildIco(preset.icoSizes || [16, 32, 48]);
          downloadBlob(icoBlob, baseName + '-favicon.ico');
          return;
        }
        var c = document.createElement('canvas');
        drawAsset(c, preset, {});
        var blob = await canvasToBlob(c, mimeFor(fmt));
        downloadBlob(blob, baseName + '-' + preset.id + '-' + preset.w + 'x' + preset.h + '.' + extFor(fmt));
        return;
      }
    }

    /* ---------- ZIP EXPORT ---------- */
    downloadBtn.onclick = function () {
      if (!state.img) return;
      var presets = allPresets().filter(function (p) { return state.selected.has(p.id); });
      if (!presets.length) return;
      downloadBtn.disabled = true;
      var originalLabel = downloadBtn.textContent;
      downloadBtn.textContent = 'Preparing…';

      loadJsZip(function (err) {
        if (err || !window.JSZip) {
          alert('ZIP library could not be loaded. Check your connection and try again.');
          downloadBtn.disabled = false;
          downloadBtn.textContent = originalLabel;
          return;
        }
        runZip();
      });

      async function runZip() {
        try {
          var zip = new window.JSZip();
          var baseName = (state.file.name || 'logo').replace(/\.[^.]+$/, '');
          var supportsWebp = webpSupported();
          var rows = [['file', 'asset', 'class', 'width', 'height', 'format']];
          var folderMap = { Favicons: 'favicons', Web: 'web', Social: 'social', App: 'app', Custom: 'custom' };
          var faviconAssets = {};

          for (var i = 0; i < presets.length; i++) {
            var p = presets[i];
            var folder = folderMap[p.group] || 'other';
            for (var j = 0; j < p.formats.length; j++) {
              var fmt = p.formats[j];
              if (fmt === 'webp' && !supportsWebp) continue;

              if (fmt === 'ico') {
                var icoBlob = await buildIco(p.icoSizes || [16, 32, 48]);
                if (icoBlob) {
                  var icoPath = folder + '/favicon.ico';
                  zip.file(icoPath, icoBlob);
                  rows.push([icoPath, p.name, p.cls, p.w, p.h, 'ICO']);
                  faviconAssets.ico = icoPath;
                }
                continue;
              }

              var c = document.createElement('canvas');
              drawAsset(c, p, {});
              var blob = await canvasToBlob(c, mimeFor(fmt));
              if (!blob) continue;
              var filename = p.id + '-' + p.w + 'x' + p.h + '.' + extFor(fmt);
              var path = folder + '/' + filename;
              zip.file(path, blob);
              rows.push([path, p.name, p.cls, p.w, p.h, extFor(fmt).toUpperCase()]);
              if (folder === 'favicons') faviconAssets[p.id] = path;
            }
          }

          var csv = rows.map(function (r) {
            return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
          }).join('\n');
          zip.file('manifest.csv', csv);

          if (faviconAssets.ico || faviconAssets['favicon-32']) {
            var snippet = [];
            if (faviconAssets['favicon-32']) snippet.push('<link rel="icon" type="image/png" sizes="32x32" href="/favicons/favicon-32x32.png">');
            if (faviconAssets['favicon-16']) snippet.push('<link rel="icon" type="image/png" sizes="16x16" href="/favicons/favicon-16x16.png">');
            if (faviconAssets.ico) snippet.push('<link rel="shortcut icon" href="/favicons/favicon.ico">');
            if (faviconAssets['apple-touch']) snippet.push('<link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon-180x180.png">');
            if (faviconAssets['android-192']) snippet.push('<link rel="icon" type="image/png" sizes="192x192" href="/favicons/android-chrome-192x192.png">');
            if (faviconAssets['android-512']) snippet.push('<link rel="icon" type="image/png" sizes="512x512" href="/favicons/android-chrome-512x512.png">');
            snippet.push('<link rel="manifest" href="/site.webmanifest">');
            zip.file('favicon-head.html', snippet.join('\n') + '\n');
          }

          var voiceLines = [
            'Brand voice settings',
            '  Brand name:    ' + (state.brandName || '(not set)'),
            '  Tagline:       ' + (state.tagline || '(not set)'),
            '  Website:       ' + (state.website || '(not set)'),
            '  Contact email: ' + (state.contactEmail || '(not set)'),
            '  Banner layout: ' + state.template
          ];

          var readme = [
            'Autonom Brand Kit Pro — export',
            'Generated: ' + new Date().toISOString(),
            'Source image: ' + state.file.name,
            'Background mode: ' + state.bgMode,
            'Background color 1: ' + state.bgColor1,
            (state.bgMode === 'gradient' ? 'Background color 2: ' + state.bgColor2 : null),
            'Padding X / Y: ' + state.padX + '% / ' + state.padY + '%',
            'Fit mode: ' + state.fit,
            'Mask: ' + state.mask,
            'Assets: ' + presets.length,
            '',
            'Folder layout',
            '  favicons/ — browser icons, Apple touch icon, Android/PWA icons, favicon.ico',
            '  web/      — web logo, email signature, Open Graph, Twitter card',
            '  social/   — LinkedIn, X, YouTube, Instagram, GitHub, Facebook avatars & covers',
            '  app/      — iOS, Android, PWA icons',
            '  custom/   — user-defined sizes',
            '',
            'Files',
            '  manifest.csv       — index of every asset with dimensions and class',
            '  favicon-head.html  — snippet to paste into <head>',
            '  brand-voice.txt    — the brand voice settings used for banner rendering',
            '',
            'All processing happened locally in the browser.'
          ].filter(function (x) { return x !== null; }).join('\n');
          zip.file('README.txt', readme);
          zip.file('brand-voice.txt', voiceLines.join('\n'));

          var blob = await zip.generateAsync({ type: 'blob' });
          var now = new Date();
          var stamp = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0');
          downloadBlob(blob, baseName + '-brand-kit-' + stamp + '.zip');
        } catch (e) {
          console.error(e);
          alert('Export failed: ' + (e.message || e));
        } finally {
          downloadBtn.disabled = false;
          downloadBtn.textContent = originalLabel;
        }
      }
    };

    /* ---------- BOOT ---------- */
    loadSettings();
    applyControlsFromState();
    renderPalette();
    buildChecks();
    render();
  }

  function boot() {
    document.querySelectorAll('#autonom-brand-kit-pro').forEach(init);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
