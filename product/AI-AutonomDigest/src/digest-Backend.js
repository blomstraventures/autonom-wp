(function () {
  'use strict';
  var VERSION = '1.2.2';
  var SIMPLE = true;   // v1.1: one draft at a time, daily bulletin of 3 to 4 sections; pool, plan and split are retired
  if (window.__autonomDGSLoaded) return;
  window.__autonomDGSLoaded = true;
  window.__dgsVersion = VERSION;

  var LOG = function () {
    try { console.log.apply(console, ['[Autonom DGS]'].concat([].slice.call(arguments))); } catch (e) {}
  };

  var LS = {
    profile: 'autonom.dgs.profile.v1',
    settings: 'autonom.dgs.settings.v1',
    profiles: 'autonom.dgs.profiles.v1'
  };

  var modelCooldown = {};
  var GONE_KEY = 'dgs_gone_models';
  var modelGone = (function () {
    var out = {};
    try { var o = JSON.parse(localStorage.getItem(GONE_KEY) || '{}'), now = Date.now(); Object.keys(o).forEach(function (k) { if (o[k] > now) out[k] = o[k]; }); } catch (e) {}
    return out;
  })();
  function markGone(k) { modelGone[k] = Date.now() + 6 * 3600 * 1000; try { localStorage.setItem(GONE_KEY, JSON.stringify(modelGone)); } catch (e) {} }
  function isGone(k) { return modelGone[k] > Date.now(); }
  var GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

  var DEFAULT_SIGNALS = {
    'geopolitics': ['missile', 'sanctions', 'border', 'NATO', 'naval', 'airspace', 'conflict', 'treaty'],
    'macroeconomy': ['Federal Reserve', 'ECB', 'inflation', 'tariff', 'yield', 'oil', 'gold', 'trade'],
    'macroeconomics': ['Federal Reserve', 'ECB', 'inflation', 'tariff', 'yield', 'oil', 'gold', 'trade'],
    'tech': ['chip', 'artificial intelligence', 'cyber', 'drone', 'satellite', 'semiconductor', 'export control'],
    'defense tech': ['drone', 'satellite', 'hypersonic', 'radar', 'missile', 'stealth'],
    'military': ['missile', 'tank', 'fighter jet', 'naval', 'troops', 'airspace'],
    'general': ['breaking', 'analysis', 'impact', 'economy', 'conflict']
  };

  var state = {
    step: 'channel',
    profile: null,
    profiles: [],
    feedSort: 'match',
    stories: [],
    selectedStoryIds: {},
    settings: { youtubeKey: '', llmProvider: 'gemini', geminiKey: '', geminiModel: '', geminiWriteModel: '', openaiKey: '', deepseekKey: '', fallbackProviders: true, strategy: 'value', writeBest: true, groqKey: '', groqModel: '', groqWriteModel: '', openrouterKey: '', openrouterModel: '', openrouterWriteModel: '', nvidiaKey: '', nvidiaModel: '', nvidiaWriteModel: '' },
    counters: { apiCalls: 0, llmCalls: 0 },
    feedReadable: true,
    feedFresh: true,
    digest: null
  };
  var DEFAULT_SETTINGS = JSON.parse(JSON.stringify(state.settings));
  function settingsKey(id) { id = id || (state.profile && state.profile.id); return id ? LS.settings + '.' + id : LS.settings; }
  function loadSettingsFor(id) {
    var o = null;
    try { o = JSON.parse(localStorage.getItem(settingsKey(id)) || 'null'); } catch (e) {}
    return Object.assign({}, DEFAULT_SETTINGS, o || {});
  }


  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    if (children) [].concat(children).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function loadState() {
    var pl = null; try { pl = JSON.parse(localStorage.getItem(LS.profiles) || 'null'); } catch (e0) { LOG('profiles parse failed', e0); }
    try {
      if (pl && Array.isArray(pl.list) && pl.list.length) {
        state.profiles = pl.list.filter(function (x) { return x && typeof x === 'object' && x.id; });
        if (state.profiles.length) state.profile = state.profiles.filter(function (x) { return x.id === pl.active; })[0] || state.profiles[0];
      }
      if (!state.profile) {
        var p = JSON.parse(localStorage.getItem(LS.profile) || 'null');
        if (p && typeof p === 'object' && p.id) { state.profile = p; state.profiles = [p]; }
      }
    } catch (e1) { LOG('profile load failed', e1); }
    // Settings are read on their own, so a bad profile entry can never hide saved keys.
    try {
      var raw = (state.profile && localStorage.getItem(settingsKey())) || localStorage.getItem(LS.settings);
      if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object') Object.assign(state.settings, o); }
      if (state.profile && localStorage.getItem(settingsKey()) == null) localStorage.setItem(settingsKey(), JSON.stringify(state.settings));
    } catch (e2) { LOG('settings load failed', e2); }
  }
  // ---- Saving. localStorage is the primary store; an IndexedDB copy is kept beside it. If the browser refuses a write
  // (storage full, blocked, private window) the person is told at once, and the copy restores the profile and keys on the next load.
  var storeBad = false, storeWarnAt = 0, memSettings = {}, idbMemo = null;
  // Caches the tools keep for speed. Safe to drop: they are rebuilt on demand. Dropped automatically when a write is refused.
  var CACHE_KEYS = ['asg_footage_cache', 'asg_viral_cache_v1', 'asg_unusable_v1', 'dgs_unusable_v1', 'asg_model_health', 'dgs_model_health', 'asg_gone_models', 'dgs_gone_models'];
  function freeCaches() {
    var n = 0;
    CACHE_KEYS.forEach(function (k) { try { var v = localStorage.getItem(k); if (v != null) { n += k.length + v.length; localStorage.removeItem(k); } } catch (e) {} });
    return n * 2;
  }
  function lsPut(k, v) {
    function once() { try { localStorage.setItem(k, v); return localStorage.getItem(k) === v; } catch (e) { return false; } }
    if (once()) return true;
    var freed = freeCaches();
    if (freed && once()) { LOG('browser storage was full; freed ' + Math.round(freed / 1024) + ' KB of caches'); return true; }
    LOG('write failed', k); return false;
  }
  function storeWarn() {
    storeBad = true;
    var t = Date.now(); if (t - storeWarnAt < 20000) return; storeWarnAt = t;
    toast('This browser would not save to its small storage (full, blocked or a private window). Your digests and a copy of your profile are kept in the browser\'s larger database instead. Open Settings to see what takes the space.', 'error', 14000);
  }
  function idb() {
    if (idbMemo) return idbMemo;
    idbMemo = new Promise(function (res) {
      try {
        var r = indexedDB.open('autonom-dgs', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
    return idbMemo;
  }
  function idbSet(k, v) { return idb().then(function (db) { return new Promise(function (res) { if (!db) return res(false); try { var tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = function () { res(true); }; tx.onerror = tx.onabort = function () { res(false); }; } catch (e) { res(false); } }); }); }
  function idbGet(k) { return idb().then(function (db) { return new Promise(function (res) { if (!db) return res(null); try { var q = db.transaction('kv', 'readonly').objectStore('kv').get(k); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); }; } catch (e) { res(null); } }); }); }
  function idbDel(k) { return idb().then(function (db) { return new Promise(function (res) { if (!db) return res(false); try { var tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = function () { res(true); }; tx.onerror = tx.onabort = function () { res(false); }; } catch (e) { res(false); } }); }); }
  function mirror() {
    try {
      if (state.profile) memSettings[settingsKey()] = JSON.parse(JSON.stringify(state.settings));
      idbSet('snap', { v: 1, at: Date.now(), profiles: { active: state.profile ? state.profile.id : null, list: state.profiles }, settings: memSettings });
    } catch (e) {}
  }
  function restoreFromMirror() {
    return idbGet('snap').then(function (snap) {
      if (!snap || !snap.profiles || !Array.isArray(snap.profiles.list) || !snap.profiles.list.length) return false;
      var hasKeys = function (o) { return o && Object.keys(o).some(function (k) { return /Key$/.test(k) && o[k]; }); };
      var needProfile = !state.profile;
      var needKeys = !hasKeys(state.settings);
      if (!needProfile && !needKeys) { memSettings = snap.settings || {}; return false; }
      memSettings = snap.settings || {};
      if (needProfile) {
        state.profiles = snap.profiles.list.filter(function (x) { return x && x.id; });
        state.profile = state.profiles.filter(function (x) { return x.id === snap.profiles.active; })[0] || state.profiles[0] || null;
        if (!state.profile) return false;
      }
      var saved = memSettings[settingsKey()];
      if (saved && (needProfile || hasKeys(saved))) state.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
      persistProfileRaw(); persistSettings();
      return true;
    });
  }
  function persistProfile() { persistProfileRaw(); }
  function persistProfileRaw() {
    var ok = true;
    try {
      if (state.profile) {
        var i = -1;
        state.profiles.forEach(function (x, k) { if (x.id === state.profile.id) i = k; });
        if (i < 0) { state.profiles.push(state.profile); state.stories = []; state.selectedStoryIds = {}; persistSettings(); }
        else state.profiles[i] = state.profile;
        ok = lsPut(LS.profile, JSON.stringify(state.profile)) && ok;
      }
      ok = lsPut(LS.profiles, JSON.stringify({ active: state.profile ? state.profile.id : null, list: state.profiles })) && ok;
    } catch (e) { ok = false; }
    if (!ok) storeWarn();
    mirror();
    try { renderProfileBar(); } catch (e2) {}
    return ok;
  }
  function persistSettings() {
    var ok = true;
    try { var j = JSON.stringify(state.settings); ok = lsPut(settingsKey(), j) && lsPut(LS.settings, j); } catch (e) { ok = false; }
    if (!ok) storeWarn();
    mirror();
    return ok;
  }

  function updateCounters() {
    var a = $('#dgs-stat-api'); if (a) a.textContent = state.counters.apiCalls;
    var l = $('#dgs-stat-llm'); if (l) l.textContent = state.counters.llmCalls;
  }
  function updateApiStatus() {
    var node = document.getElementById('dgs-api-status');
    if (!node) return;
    var hasLlm = state.settings.llmProvider !== 'none' && !!currentLlmKey();
    var needYt = !!(state.profile && state.profile.source && state.profile.source.mode === 'youtube');
    var hasYt = !!state.settings.youtubeKey;
    node.classList.remove('is-ok', 'is-partial');
    var label = node.querySelector('.dgs-api-label');
    var parts = [hasLlm ? 'AI ✓' : 'Add AI key'];
    if (needYt) parts.push(hasYt ? 'YouTube ✓' : 'Add YouTube key');
    var ok = hasLlm && (!needYt || hasYt);
    var some = hasLlm || hasYt;
    if (ok) node.classList.add('is-ok'); else if (some) node.classList.add('is-partial');
    if (label) label.textContent = parts.join(' · ');
    node.title = 'API keys. AI provider: ' + (hasLlm ? 'set' : 'missing') + ' · YouTube: ' + (hasYt ? 'set' : needYt ? 'missing' : 'not needed') + '. Open API keys to change them.';
  }
  function toast(msg, kind, ms) {
    var t = el('div', { class: 'dgs-toast' + (kind ? ' is-' + kind : ''), text: msg });
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('is-on'); });
    setTimeout(function () { t.classList.remove('is-on'); setTimeout(function () { t.remove(); }, 320); }, ms || (kind === 'error' ? 9000 : 5000));
  }
  function setStep(step) {
    var order = ['channel', 'feed', 'cluster', 'outline', 'write', 'review', 'export', 'social'];
    if ((step === 'export' || step === 'social') && !dReview().reviewed) { step = 'review'; askConfirm(); }
    state.step = step; try { if (state.profile && state.digest) { state.digest.step = step; digestSave(); } } catch (e5) {}
    $$('.dgs-panel').forEach(function (p) { p.hidden = p.dataset.panel !== step; });
    $$('.dgs-step').forEach(function (s) {
      var idx = order.indexOf(s.dataset.step); var cur = order.indexOf(step);
      s.classList.toggle('is-active', s.dataset.step === step);
      s.classList.toggle('is-done', idx < cur && idx >= 0);
    });
    updateStepAvailability(); try { updateLibPill(); } catch (e6) {}
    if (step === 'cluster') renderCluster();
    if (step === 'outline') renderOutline();
    if (step === 'write') renderWrite();
    if (step === 'review') renderReview();
    if (step === 'export') renderExport();
    if (step === 'social') renderSocial();
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
  }
  function askConfirm() {
    toast('Tick the box under the preview to confirm you have read the article. Then Export opens.', 'error');
    setTimeout(function () { var cb = document.getElementById('dgs-rv-ok'), lab = cb && cb.closest('label'); if (!lab) return; try { lab.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} lab.classList.add('is-nudge'); setTimeout(function () { lab.classList.remove('is-nudge'); }, 2400); }, 120);
  }
  function updateGuide() {
    var root = document.querySelector('.dgs-rail'); if (!root) return;
    var g = document.getElementById('dgs-guide'); if (!g) { g = document.createElement('p'); g.id = 'dgs-guide'; g.className = 'dgs-guide'; root.parentNode.insertBefore(g, root.nextSibling); }
    var d = state.digest, st = state.step, t = '';
    var nsel = Object.keys(state.selectedStoryIds || {}).length;
    if (st === 'channel') t = 'Set up or pick your profile, then continue to the Feed.';
    else if (st === 'feed') t = nsel ? nsel + ' selected. 10 to 25 stories is plenty for a daily bulletin. The tool keeps the 3 or 4 strongest threads and leaves the rest for tomorrow.' : 'Select the day\'s stories. The tool turns them into a bulletin of the 3 or 4 strongest threads.';
    else if (!d) t = '';
    else if (st === 'cluster') {
      var have = {}; (d.clusters || []).forEach(function (c) { c.ids.forEach(function (i) { have[i] = 1; }); }); (d.left || []).forEach(function (i) { have[i] = 1; }); (d.sibIds || []).forEach(function (i) { have[i] = 1; });
      var fresh = Object.keys(state.selectedStoryIds || {}).filter(function (i) { return !have[i]; }).length;
      if (!d.clusters.length) t = 'Press "Group stories into sections". The AI groups your selected stories.';
      else if (fresh) t = fresh + ' of the stories you selected are not in these sections. Press "Group again" to include them.';
      else t = 'Check the sections. Move or remove anything that does not belong, then Continue to Outline.';
    }
    else if (st === 'outline') t = d.outline ? 'Pick a headline, switch off any section that does not fit, then Continue to Write.' : 'Press "Plan the outline". The AI picks a headline and one lens per section.';
    else if (st === 'write') t = 'Press "Write all sections", read the flagged sentences, then Continue to Review.';
    else if (st === 'review') t = 'Read it as a reader would. Fix anything flagged, tick the box, then Continue to Export.';
    else if (st === 'export') t = 'Copy the HTML into WordPress, fill the SEO fields, then make the social posts.';
    else if (st === 'social') t = 'Pick the posts you want and copy them. When done, start over for the next digest.';
    g.textContent = t ? 'Now: ' + t : ''; g.hidden = !t;
  }
  function updateStepAvailability() {
    try { updateGuide(); } catch (eg) {}
    var hasProfile = !!state.profile;
    var hasStories = Object.keys(state.selectedStoryIds).length > 0;
    digestEnsure();
    $$('.dgs-step').forEach(function (s) {
      var st = s.dataset.step;
      if (st === 'channel') s.disabled = false;
      else if (st === 'feed') s.disabled = !hasProfile;
      else if (st === 'cluster') s.disabled = !hasStories && !state.digest.clusters.length;
      else if (st === 'outline') s.disabled = !state.digest.clusters.length;
      else if (st === 'write') s.disabled = !(state.digest.outline && state.digest.clusters.length);
      else if (st === 'review') s.disabled = !reviewStatus().done;
      else if (st === 'export' || st === 'social') s.disabled = !reviewStatus().done;
    });
  }

  var STOPWORDS = ('a an the and or but if then than so of to in on for with without at by from into over under again further once here there when where why how all any both each few more most other some such no nor not only own same too very can will just don should now i you he she it we they them their our your his her its as is are was were be been being have has had do does did doing ' +
    'video videos today new subscribe channel watch like share follow http https www com youtube instagram twitter facebook link links join check out full part live ' +
    'who what which whom whose about after before also would could their this that these those been being says said say year years time one two get got make made back amid news report reports according').split(' ');

  function tokenize(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
      .filter(function (w) { return w.length > 2 && STOPWORDS.indexOf(w) === -1; });
  }
  function titleCase(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function hasWord(textLower, sig) {
    return new RegExp('(^|[^a-z0-9])' + escapeRe(String(sig).toLowerCase()) + '([^a-z0-9]|$)').test(textLower);
  }

  function deriveFromTexts(texts, opts) {
    opts = opts || {};
    var counts = {}; var totalDur = 0, durCount = 0;
    texts.forEach(function (t) {
      if (t.title) tokenize(t.title).forEach(function (w) { counts[w] = (counts[w] || 0) + 2; });
      if (t.description) tokenize(t.description.slice(0, 200)).forEach(function (w) { counts[w] = (counts[w] || 0) + 1; });
      if (typeof t.durationSec === 'number' && t.durationSec > 0) { totalDur += t.durationSec; durCount++; }
    });
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 24);
    var used = {}; var clusters = [];
    top.forEach(function (t) {
      if (used[t]) return;
      var c = { terms: [t], weight: counts[t] };
      top.forEach(function (u) {
        if (u === t || used[u]) return;
        if (u.slice(0, 3) === t.slice(0, 3)) { c.terms.push(u); c.weight += counts[u]; used[u] = true; }
      });
      used[t] = true; clusters.push(c);
    });
    clusters.sort(function (a, b) { return b.weight - a.weight; });
    var topics = clusters.slice(0, 3).map(function (c) {
      return { name: titleCase(c.terms[0]), weight: 0, subtopics: c.terms.slice(1, 4).map(titleCase), signals: c.terms.slice(0, 6) };
    });
    if (!topics.length) topics = [{ name: 'General', weight: 1, subtopics: [], signals: DEFAULT_SIGNALS['general'].slice() }];
    var w = 1 / topics.length;
    topics.forEach(function (t) { t.weight = Math.round(w * 100) / 100; });
    return {
      schemaVersion: '1.0', id: 'tp_' + Date.now().toString(36), name: opts.name || 'Untitled publication',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      source: opts.source || { mode: 'manual' },
      identity: { oneLiner: opts.oneLiner || '', positioning: opts.positioning || '', audienceHint: opts.audienceHint || '', dna: opts.dna || '', samples: opts.samples || null },
      topics: topics,
      tone: { style: opts.tone || 'analytical', energy: 'urgent', formality: 'neutral-brief', pov: 'analyst', avoid: ['clickbait hyperbole', 'partisan framing', 'doom language'] },
      constraints: { bannedTopics: [], bannedWords: [], bannedSources: [], requiredDisclosure: 'AI-assisted analysis.', sourceCitationRequired: true },
      performanceHints: { analyzedVideoCount: texts.length, avgDurationSec: durCount ? Math.round(totalDur / durCount) : null, notes: 'Auto-derived; edit as needed.' },
      meta: { lastSyncedAt: new Date().toISOString(), derivationMethod: opts.method || 'heuristic', confidence: opts.confidence || 0.6 }
    };
  }

  function parseYoutubeInput(raw) {
    raw = String(raw || '').trim();
    if (!raw) return null;
    var m = raw.match(/youtube\.com\/@([\w.-]+)/i); if (m) return { handle: m[1] };
    m = raw.match(/youtube\.com\/channel\/(UC[\w-]+)/i); if (m) return { channelId: m[1] };
    if (raw[0] === '@') return { handle: raw.slice(1) };
    return { handle: raw };
  }
  function ytFetch(path, params) {
    if (!state.settings.youtubeKey) throw new Error('YouTube API key is required. Open Settings.');
    var q = Object.assign({ key: state.settings.youtubeKey }, params);
    var url = 'https://www.googleapis.com/youtube/v3/' + path + '?' + Object.keys(q).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]);
    }).join('&');
    state.counters.apiCalls++; updateCounters();
    return fetch(url).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error((j.error && j.error.message) || ('YouTube API ' + r.status)); });
      return r.json();
    });
  }
  function parseISODuration(d) {
    var m = String(d || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 0;
    return (parseInt(m[1] || 0, 10) * 3600) + (parseInt(m[2] || 0, 10) * 60) + parseInt(m[3] || 0, 10);
  }
  function fetchYouTube(inputRaw) {
    var parsed = parseYoutubeInput(inputRaw);
    if (!parsed) throw new Error('Enter a channel handle or URL.');
    var chPromise = parsed.channelId
      ? ytFetch('channels', { part: 'snippet,contentDetails', id: parsed.channelId })
      : ytFetch('channels', { part: 'snippet,contentDetails', forHandle: '@' + parsed.handle });
    return chPromise.then(function (res) {
      if (!res.items || !res.items.length) throw new Error('Channel not found.');
      var ch = res.items[0];
      var uploads = ch.contentDetails.relatedPlaylists.uploads;
      return ytFetch('playlistItems', { part: 'snippet,contentDetails', playlistId: uploads, maxResults: 30 })
        .then(function (items) {
          var ids = items.items.map(function (i) { return i.contentDetails.videoId; }).filter(Boolean);
          if (!ids.length) throw new Error('No public videos found.');
          return ytFetch('videos', { part: 'snippet,statistics,contentDetails', id: ids.join(',') });
        })
        .then(function (vids) {
          var videos = vids.items.map(function (v) {
            return { title: v.snippet.title, description: v.snippet.description || '', tags: v.snippet.tags || [],
              durationSec: parseISODuration(v.contentDetails.duration), views: parseInt(v.statistics.viewCount || '0', 10), publishedAt: v.snippet.publishedAt };
          });
          return deriveFromTexts(videos, {
            name: ch.snippet.title,
            oneLiner: ch.snippet.description ? ch.snippet.description.split(/[.\n]/)[0].slice(0, 120) : '',
            positioning: ch.snippet.description || '',
            samples: { titles: videos.slice(0, 15).map(function (v) { return v.title; }), top: videos.slice().sort(function (a, b) { return b.views - a.views; }).slice(0, 5).map(function (v) { return v.title; }) },
            source: { mode: 'youtube', channelId: ch.id, channelHandle: '@' + (parsed.handle || ''), language: 'en' },
            method: 'youtube-api + heuristic', confidence: 0.72
          });
        });
    });
  }

  var genRun = null, stopGrace = 0;
  function fetchWithTimeout(url, opts, ms) {
    ms = ms || 8000;
    var controller = new AbortController();
    if (genRun && !genRun.cancelled) genRun.ctrl.signal.addEventListener('abort', function () { controller.abort(); });
    var timer = setTimeout(function () { controller.abort(); }, ms);
    var merged = Object.assign({ signal: controller.signal }, opts || {});
    return fetch(url, merged).then(
      function (r) { clearTimeout(timer); return r; },
      function (e) { clearTimeout(timer); throw e; }
    );
  }

  function gdeltDate(seendate) {
    if (!seendate) return new Date().toISOString();
    var m = String(seendate).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
    if (!m) return new Date().toISOString();
    try { return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])).toISOString(); }
    catch (e) { return new Date().toISOString(); }
  }
  function gdeltSafeQuery(q) {
    var terms = String(q || '').split(/\s+OR\s+/i)
      .map(function (t) { return t.replace(/"/g, '').trim(); })
      .filter(function (t) { return t.length >= 3; })
      .map(function (t) { return /\s/.test(t) ? '"' + t + '"' : t; });
    if (!terms.length) return '';
    var core = terms.length > 1 ? '(' + terms.join(' OR ') + ')' : terms[0];
    return core + ' sourcelang:english';
  }
  function gdeltUrl(query) {
    var safe = gdeltSafeQuery(query);
    if (!safe) return '';
    return 'https://api.gdeltproject.org/api/v2/doc/doc?' +
      'query=' + encodeURIComponent(safe) +
      '&mode=artlist&maxrecords=30&format=json&sort=hybridrel&timespan=2d';
  }
  function tryGdeltOnce(query) {
    var url = gdeltUrl(query);
    if (!url) return Promise.reject(new Error('GDELT: no usable terms (each must be 3+ characters)'));
    state.counters.apiCalls++; updateCounters();
    LOG('GDELT:', url);
    return fetchWithTimeout(url, { mode: 'cors' }, 12000)
      .then(function (r) {
        return r.text().then(function (text) {
          if (!text || !text.trim()) throw new Error('GDELT returned empty body');
          if (text.charAt(0) !== '{' && text.charAt(0) !== '[') {
            var err = new Error('GDELT: ' + text.slice(0, 120).replace(/\s+/g, ' '));
            err.rateLimited = /limit requests|one every|too many|rate/i.test(text);
            throw err;
          }
          try { return JSON.parse(text); } catch (e) { throw new Error('GDELT JSON parse error'); }
        });
      })
      .then(function (j) {
        if (!j || !j.articles || !j.articles.length) throw new Error('GDELT returned no articles');
        var items = j.articles.map(function (a) {
          return { title: a.title || '', description: '', link: a.url || '', pubDate: gdeltDate(a.seendate), author: a.domain || 'GDELT' };
        }).filter(function (it) { return it.title && it.link; });
        if (!items.length) throw new Error('GDELT articles empty after filter');
        LOG('GDELT ok for "' + query + '":', items.length, 'items');
        return { status: 'ok', feed: { title: 'GDELT' }, items: items };
      });
  }
  function tryGdelt(query, attempt) {
    attempt = attempt || 1;
    return tryGdeltOnce(query).catch(function (e) {
      if (e.rateLimited && attempt < 3) {
        LOG('GDELT rate limited (attempt ' + attempt + '), retrying in 5.5s…');
        return sleep(5500).then(function () { return tryGdelt(query, attempt + 1); });
      }
      throw e;
    });
  }

  function parseXmlFeed(xml, feedUrl) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('XML parse error');
    var items = [].slice.call(doc.querySelectorAll('item, entry')).slice(0, 30).map(function (node) {
      function get(tag) { var e = node.querySelector(tag); return e ? (e.textContent || '').trim() : ''; }
      var link = get('link');
      if (!link) { var l = node.querySelector('link'); if (l) link = l.getAttribute('href') || ''; }
      return { title: get('title'), description: get('description') || get('summary') || get('content'),
        link: link, pubDate: get('pubDate') || get('published') || get('updated'),
        author: get('author') || get('dc\\:creator') };
    });
    var feedTitle = '';
    var t = doc.querySelector('channel > title, feed > title');
    if (t) feedTitle = t.textContent.trim();
    return { status: 'ok', feed: { title: feedTitle, link: feedUrl }, items: items };
  }
  function proxyAllOrigins(url) {
    return fetchWithTimeout('https://api.allorigins.win/raw?url=' + encodeURIComponent(url))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (xml) { if (!xml || xml.length < 100) throw new Error('empty response'); return parseXmlFeed(xml, url); });
  }
  function proxyCodeTabs(url) {
    return fetchWithTimeout('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (xml) { return parseXmlFeed(xml, url); });
  }
  function proxyRss2Json(url) {
    return fetchWithTimeout('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(url) + '&count=30')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { if (j && j.status === 'ok' && j.items && j.items.length) return j; throw new Error('no items'); });
  }
  function proxyDirect(url) {
    return fetchWithTimeout(url)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (xml) { return parseXmlFeed(xml, url); });
  }
  function firstSuccess(promises) {
    return new Promise(function (resolve, reject) {
      var left = promises.length, errs = [];
      if (!left) { reject(new Error('no sources')); return; }
      promises.forEach(function (p) {
        p.then(resolve, function (e) { errs.push(e && e.message ? e.message : String(e)); if (--left === 0) reject(new Error('all proxies failed: ' + errs.join(' | '))); });
      });
    });
  }
  function tryFeed(url) {
    var attempts = [
      { name: 'allorigins', fn: function () { return proxyAllOrigins(url); } },
      { name: 'codetabs', fn: function () { return proxyCodeTabs(url); } },
      { name: 'rss2json', fn: function () { return proxyRss2Json(url); } },
      { name: 'direct', fn: function () { return proxyDirect(url); } }
    ];
    return firstSuccess(attempts.map(function (a) {
      return a.fn().then(function (j) { if (j && j.status === 'ok' && j.items && j.items.length) return j; throw new Error(a.name + ': no items'); });
    }));
  }

  // ---------- Multiple profiles (settings drawer) ----------
  // A profile is one publication's workspace: topics and tone, API keys and settings, sections and outline.
  function renderProfileBar() {
    var box = document.getElementById('dgs-set-profiles'); if (!box) return;
    box.innerHTML = '';
    var btn = $('.dgs-open-settings.dgs-btn-pill'); if (btn) { var nm = state.profile && state.profile.name; btn.innerHTML = ''; btn.appendChild(el('span', { class: 'dgs-pill-k', text: 'Profile' })); btn.appendChild(el('span', { class: 'dgs-pill-name', text: nm || 'Set up profile & keys' })); btn.appendChild(el('span', { 'aria-hidden': 'true', text: '▾' })); btn.title = 'Switch profile, add API keys, change settings'; }
    box.appendChild(el('span', { class: 'dgs-label', text: 'Profile' }));
    if (!state.profiles.length) {
      box.appendChild(el('p', { class: 'dgs-hint', text: 'No profile yet. Create one in the Profile step. Each profile keeps its own topics, API keys, sections and outline.' }));
      return;
    }
    var row = el('div', { class: 'dgs-pf-row' });
    var sel = el('select', { 'aria-label': 'Active profile' });
    state.profiles.forEach(function (x) {
      var o = el('option', { value: x.id, text: x.name || 'Untitled profile' });
      if (state.profile && x.id === state.profile.id) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { if (sel.value) switchProfile(sel.value); });
    row.appendChild(sel);
    var add = el('button', { class: 'dgs-btn dgs-btn-ghost', type: 'button', text: '+ New' });
    add.addEventListener('click', function () { closeSettings(); setStep('channel'); toast('Create the new profile below. Your other profiles stay saved.', 'success'); var c = $('.dgs-mode-grid'); if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    row.appendChild(add);
    if (state.profile) {
      var del = el('button', { class: 'dgs-btn dgs-btn-ghost dgs-pf-del', type: 'button', text: 'Delete' });
      del.addEventListener('click', deleteProfile);
      row.appendChild(del);
    }
    box.appendChild(row);
    box.appendChild(el('p', { class: 'dgs-hint', text: 'The keys and settings below belong to this profile. A new profile starts with a copy of the current ones, so change them there if the publication uses different accounts.' }));
  }
  function switchProfile(id) {
    var t = state.profiles.filter(function (x) { return x.id === id; })[0];
    if (!t || (state.profile && state.profile.id === id)) return;
    if (cluBusy || outBusy) { toast('Wait until the AI has finished.', 'error'); renderProfileBar(); return; }
    persistSettings(); try { flushDigests(); } catch (e0) {}
    state.profile = t;
    state.stories = []; state.selectedStoryIds = {}; state.digest = null;
    state.settings = loadSettingsFor(t.id);
    persistProfile();
    renderProfile(); renderStories(); updateStepAvailability(); updateApiStatus();
    var ed = $('#dgs-profile-edit'); if (ed) ed.hidden = true; var vw = $('#dgs-profile-view'); if (vw) vw.hidden = false; var tg = $('#dgs-edit-toggle'); if (tg) tg.textContent = 'Edit';
    var dr = $('#dgs-settings-drawer'); if (dr && !dr.hidden) openSettings();
    setStep('channel');
    toast('Switched to ' + (t.name || 'profile'), 'success');
  }
  function deleteProfile() {
    var cur = state.profile; if (!cur) return;
    if (cluBusy || outBusy) { toast('Wait until the AI has finished.', 'error'); return; }
    if (!confirm('Delete the profile "' + (cur.name || 'Untitled') + '" with its keys, sections and outline? This cannot be undone.')) return;
    libDeleteProfile(cur.id); try { localStorage.removeItem(settingsKey(cur.id)); } catch (e) {}
    state.profiles = state.profiles.filter(function (x) { return x.id !== cur.id; });
    state.stories = []; state.selectedStoryIds = {};
    var next = state.profiles[0] || null;
    if (next) {
      state.profile = next; state.settings = loadSettingsFor(next.id);
    } else { state.profile = null; try { localStorage.removeItem(LS.profile); } catch (e3) {} }
    persistProfile();
    if (next) renderProfile(); else { var pe = $('#dgs-profile-editor'); if (pe) pe.hidden = true; }
    renderStories(); updateStepAvailability(); updateApiStatus(); setStep('channel');
    var dr = $('#dgs-settings-drawer'); if (dr && !dr.hidden) openSettings();
    toast('Profile deleted', 'success');
  }

  function renderProfile() {
    renderProfileBar();
    if (!state.profile) return;
    $('#dgs-profile-editor').hidden = false;
    var view = $('#dgs-profile-view'); view.innerHTML = '';
    var p = state.profile; var dl = el('dl');
    dl.appendChild(el('dt', { text: 'Name' })); dl.appendChild(el('dd', { text: p.name }));
    dl.appendChild(el('dt', { text: 'One-liner' })); dl.appendChild(el('dd', { text: p.identity.oneLiner || '—' }));
    if (p.identity.positioning) { dl.appendChild(el('dt', { text: 'Positioning' })); dl.appendChild(el('dd', { text: p.identity.positioning })); }
    dl.appendChild(el('dt', { text: 'Topics' }));
    var tdd = el('dd'); var chips = el('div', { class: 'dgs-chips' });
    p.topics.forEach(function (t) { chips.appendChild(el('span', { class: 'dgs-chip', text: t.name + ' · ' + Math.round(t.weight * 100) + '%' })); });
    tdd.appendChild(chips); dl.appendChild(tdd);
    var all = [];
    p.topics.forEach(function (t) { (t.signals || []).forEach(function (s) { if (all.indexOf(s) === -1) all.push(s); }); });
    if (all.length) {
      dl.appendChild(el('dt', { text: 'Scan signals' }));
      var sdd = el('dd'); var schips = el('div', { class: 'dgs-chips' });
      all.slice(0, 16).forEach(function (s) { schips.appendChild(el('span', { class: 'dgs-chip is-muted', text: s })); });
      sdd.appendChild(schips); dl.appendChild(sdd);
    }
    dl.appendChild(el('dt', { text: 'Tone' })); dl.appendChild(el('dd', { text: p.tone.style + ' · ' + p.tone.energy }));
    view.appendChild(dl);
    updateApiStatus();
  }
  function textInput(v, on) { var i = el('input', { type: 'text', value: v || '' }); i.addEventListener('input', function () { on(i.value); }); return i; }
  function textarea(v, on) { var t = el('textarea', {}); t.value = v || ''; t.addEventListener('input', function () { on(t.value); }); return t; }
  function selectOpts(opts, v, on) {
    var s = el('select');
    opts.forEach(function (o) { var op = el('option', { value: o, text: o }); if (o === v) op.selected = true; s.appendChild(op); });
    s.addEventListener('change', function () { on(s.value); }); return s;
  }
  function field(label, input) { return el('label', { class: 'dgs-field' }, [el('span', { class: 'dgs-label', text: label }), input]); }

  // The publication's DNA: how it sounds and what stance it takes. Written once per profile, used in every grouping,
  // outline and article, so two publications covering the same story do not publish the same piece.
  var THINK = 'ROLE: The publication is an analyst think tank, not a news outlet. Readers can get the news anywhere; they come for interpretation. Write as a commentator who takes a position, explains the mechanism behind events and what it means over months, not hours.';
  function dnaText(p) {
    var d = p && p.identity && String(p.identity.dna || '').trim();
    if (d) return d;
    return 'Voice: ' + ((p.tone && p.tone.style) || 'analytical') + ', ' + ((p.tone && p.tone.energy) || 'urgent') + '. Positioning: ' + ((p.identity && (p.identity.positioning || p.identity.oneLiner)) || p.name) + '.';
  }
  function suggestDna(p, pages) {
    var smp = (p.identity && p.identity.samples) || {};
    var lines = [
      'Write the "voice DNA" of a daily news analysis publication, so its articles sound like it and nobody else.',
      'PUBLICATION: ' + p.name, 'POSITIONING: ' + (p.identity.positioning || p.identity.oneLiner || ''),
      'TOPICS: ' + (p.topics || []).map(function (t) { return t.name; }).join(', '),
      'TONE: ' + ((p.tone && p.tone.style) || '') + ', ' + ((p.tone && p.tone.energy) || '')
    ];
    if (smp.titles && smp.titles.length) lines.push('RECENT TITLES: ' + smp.titles.join(' | '));
    if (smp.top && smp.top.length) lines.push('BEST PERFORMING TITLES: ' + smp.top.join(' | '));
    if (pages && pages.length) { lines.push('', 'TEXT FROM THE BRAND\'S OWN PAGES (use it for voice, stance and what the brand stands for; ignore menus and boilerplate):'); pages.forEach(function (g) { lines.push('[' + g.k + '] ' + g.text); }); }
    lines.push('', 'Return 4 to 6 short lines, one per label: "Voice:" (how sentences sound: rhythm, register, humour or none), "Stance:" (the angle or worldview this publication brings to news: what it cares about, what it is sceptical of), "Signature:" (1-2 recurring moves, e.g. who pays, what is missing, the historical echo), "Never:" (what it avoids). Base it ONLY on the information above. Do not invent a biography, credentials or facts.',
      'Return STRICT JSON only: {"dna":"Voice: ...\nStance: ...\nSignature: ...\nNever: ..."}');
    return callLLM(lines.join('\n'), 'write').then(function (r) { var j = extractJson(r.text); return String(j.dna || '').trim(); });
  }
  // ---------- Topic scout: adjacent topics and niches, checked against today's headlines ----------
  var scoutLast = null;
  function pulseFromItems(items) {
    var seen = {}, out = [];
    items.forEach(function (it) {
      var t = cleanTitle(it.title), k = t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 50); if (!k || seen[k]) return; seen[k] = 1;
      out.push({ title: t, text: (t + ' ' + String(it.description || '').replace(/<[^>]+>/g, ' ')).toLowerCase(), source: it.author || String(it.title || '').split(' - ').pop() || 'News' });
    });
    return out;
  }
  function getPulse(onProgress) {
    return fetchBroadFeeds().then(function (items) {
      var pulse = pulseFromItems(items); if (pulse.length >= 25) return pulse;
      return scanSequential(['world news today', 'business news today', 'technology news today'], onProgress).then(function (rs) {
        var more = []; rs.forEach(function (r) { if (r.feed && r.feed.items) more = more.concat(r.feed.items.slice(0, 25)); });
        return pulseFromItems(items.concat(more));
      });
    });
  }
  function pulseHeat(signals, pulse) {
    var sigs = (signals || []).map(function (x) { return String(x).trim().toLowerCase(); }).filter(function (x) { return x.length >= 3; }), n = 0, outs = {};
    pulse.forEach(function (h) { if (sigs.some(function (g) { return hasWord(h.text, g); })) { n++; outs[String(h.source).toLowerCase()] = 1; } });
    return { n: n, outlets: Object.keys(outs).length };
  }
  function scoutPrompt(p, pulse) {
    var heads = pulse.slice(0, 120).map(function (h) { return '- ' + dShort(h.title, 120) + ' [' + h.source + ']'; });
    return ['You are an editorial strategist for "' + p.name + '", a publication that writes a daily news analysis digest and wants more readers to find it.', '',
      'POSITIONING: ' + ((p.identity && (p.identity.positioning || p.identity.oneLiner)) || p.name), 'CURRENT TOPICS:'].concat((p.topics || []).map(function (t) { return '- ' + t.name + ' (weight ' + t.weight + '): ' + (t.signals || []).join(', '); }),
      ['', 'A SAMPLE OF TODAY\'S HEADLINES FROM MANY OUTLETS (what is in the news now):'], heads, ['',
      'TASK: propose topics that would let more of this publication\'s digests land on stories readers actively look for, without losing its identity.',
      '- "adjacent": 4 topics next to the current ones: the same readers, a natural extension.',
      '- "niches": 4 narrow niches inside or beside the current topics where a small publisher can become the specialist, because large outlets cover them only in passing.',
      'For each give: "name" (2 to 4 words), "why" (one sentence on why these readers care), "angle" (one sentence: the distinctive analysis a digest could add), "signals" (4 to 6 plain terms of one or two words that a news headline would literally contain, lower case, such as "rare earths", "export ban", "shadow fleet", "undersea cable"; never insider jargon, product codes, numbers or three-word technical phrases, because a signal that no headline uses finds nothing), "builds_on" (the current topic it extends).',
      'Rules: do not repeat a current topic or each other; nothing vague like "business" or "world news"; lean toward subjects the headlines show are active, but include some with steady demand. Do not make claims about search volume or traffic: you have no data on them.',
      'Return STRICT JSON only: {"adjacent":[{"name":"...","why":"...","angle":"...","signals":["..."],"builds_on":"..."}],"niches":[{"name":"...","why":"...","angle":"...","signals":["..."],"builds_on":"..."}]}']).join('\n');
  }
  function scoutPanel(p, addTopic, dropTopics) {
    var box = el('div', { class: 'dgs-scout' }), head = el('div', { class: 'dgs-actions' }), run = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost', id: 'dgs-scout-run', text: 'Find topics in the news' });
    var stat = el('span', { class: 'dgs-hint', text: 'Suggests adjacent topics and niches, then counts how many of today\'s headlines match each.' }); head.appendChild(run); head.appendChild(stat); box.appendChild(head);
    var out = el('div', { class: 'dgs-scout-out' }); box.appendChild(out);
    function paint(res) {
      out.innerHTML = '';
      var mine = el('div', { class: 'dgs-scout-mine' }); mine.appendChild(el('span', { class: 'dgs-label', text: 'Your topics in the news today' }));
      var chips = el('div', { class: 'dgs-chips' }); (p.topics || []).forEach(function (t) { var h = pulseHeat(t.signals, res.pulse); chips.appendChild(el('span', { class: 'dgs-chip ' + (h.n <= 1 ? 'is-warn' : 'is-ok'), text: t.name + ': ' + h.n + (h.n <= 1 ? ' (quiet)' : ''), title: h.n + ' of ' + res.pulse.length + ' headlines from ' + h.outlets + ' outlets mention this topic\'s signals.' })); });
      mine.appendChild(chips);
      var quiet = (p.topics || []).filter(function (t) { return pulseHeat(t.signals, res.pulse).n === 0; });
      if (quiet.length && dropTopics) { var qb = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Remove the ' + quiet.length + ' topics with no headlines today' }); qb.addEventListener('click', function () { if (confirm('Remove these topics from the profile?\n\n' + quiet.map(function (t) { return t.name; }).join('\n') + '\n\nA topic can be quiet today and still matter, so only do this if you will not miss them.')) { dropTopics(quiet); paint(res); } }); mine.appendChild(qb); }
      out.appendChild(mine);
      [['Next to your topics', res.adjacent], ['Niches to own', res.niches]].forEach(function (g) {
        if (!g[1].length) return; out.appendChild(el('h4', { class: 'dgs-scout-h', text: g[0] }));
        g[1].forEach(function (s) {
          var card = el('div', { class: 'dgs-scout-card' }), top = el('div', { class: 'dgs-scout-top' });
          top.appendChild(el('strong', { text: s.name })); top.appendChild(el('span', { class: 'dgs-chip ' + (s.heat.n >= 3 ? 'is-hot' : s.heat.n ? 'is-ok' : 'is-muted'), text: s.heat.n ? s.heat.n + ' headlines today · ' + s.heat.outlets + ' outlets' : 'not in today\'s headlines' }));
          if (s.builds_on) top.appendChild(el('span', { class: 'dgs-hint', text: 'builds on ' + s.builds_on })); card.appendChild(top);
          card.appendChild(el('p', { class: 'dgs-scout-p', text: s.why })); card.appendChild(el('p', { class: 'dgs-scout-p dgs-hint', text: 'Angle: ' + s.angle })); card.appendChild(el('p', { class: 'dgs-scout-p dgs-hint', text: 'Signals: ' + s.signals.join(', ') }));
          var bar = el('div', { class: 'dgs-actions' }), add = el('button', { type: 'button', class: 'dgs-btn dgs-btn-primary dgs-btn-sm', text: 'Add to my topics' });
          var have = (p.topics || []).some(function (t) { return String(t.name).toLowerCase() === s.name.toLowerCase(); }); if (have) { add.disabled = true; add.textContent = 'Already added'; }
          add.addEventListener('click', function () { addTopic(s); add.disabled = true; add.textContent = 'Added'; paint(res); });
          var tr = el('a', { class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', href: 'https://trends.google.com/trends/explore?q=' + encodeURIComponent(s.signals[0] || s.name), target: '_blank', rel: 'noopener noreferrer', text: 'Check search demand' });
          bar.appendChild(add); bar.appendChild(tr); card.appendChild(bar); out.appendChild(card);
        });
      });
      out.appendChild(el('p', { class: 'dgs-hint', text: 'The headline counts are measured from today\'s news. They show what is being reported now, not what people search for. Use "Check search demand" (Google Trends) before you commit to a topic. Added topics start with a low weight; raise it if they prove useful.' }));
    }
    run.addEventListener('click', function () {
      if (!dKey()) { toast('The topic scout needs an AI key. Add one under API keys.', 'error'); return; }
      run.disabled = true; run.textContent = 'Reading the news…'; stat.textContent = '';
      getPulse(function (n, t, q) { stat.textContent = 'Query ' + n + ' of ' + t + ': ' + q; }).then(function (pulse) {
        if (pulse.length < 10) throw new Error('only ' + pulse.length + ' headlines could be fetched');
        run.textContent = 'Thinking about your topics…'; stat.textContent = pulse.length + ' headlines read.';
        return callLLM(scoutPrompt(p, pulse), 'write', { best: true }).then(function (r) {
          var j = extractJson(r.text);
          function norm(a) { return (Array.isArray(a) ? a : []).map(function (s) { var sig = (Array.isArray(s.signals) ? s.signals : String(s.signals || '').split(',')).map(function (x) { return String(x).trim().toLowerCase(); }).filter(function (x) { return x.length >= 3 && x.split(/\s+/).length <= 2 && !/\d/.test(x); }).slice(0, 8); var nm0 = String(s.name || '').trim().toLowerCase(); if (nm0 && sig.indexOf(nm0) === -1 && nm0.split(/\s+/).length <= 3) sig.unshift(nm0); return { name: titleCase(dShort(String(s.name || '').trim(), 40)), why: dShort(String(s.why || ''), 220), angle: dShort(String(s.angle || ''), 220), signals: sig, builds_on: dShort(String(s.builds_on || ''), 40), heat: pulseHeat(sig, pulse) }; }).filter(function (s) { return s.name && s.signals.length >= 2 && !(p.topics || []).some(function (t) { return String(t.name).toLowerCase() === s.name.toLowerCase(); }); }).sort(function (a, b) { return b.heat.n - a.heat.n; }); }
          var res = { pulse: pulse, adjacent: norm(j.adjacent), niches: norm(j.niches) }; if (!res.adjacent.length && !res.niches.length) throw new Error('the AI returned no usable topics');
          scoutLast = res; paint(res); stat.textContent = pulse.length + ' headlines read.';
        });
      }).catch(function (e) { toast('The topic scout failed (' + dShort(e && e.message, 120) + ').', 'error'); stat.textContent = ''; })
        .then(function () { run.disabled = false; run.textContent = 'Find topics again'; });
    });
    if (scoutLast) paint(scoutLast);
    return box;
  }

  function renderProfileEdit() {
    if (!state.profile) return;
    var edit = $('#dgs-profile-edit'); edit.innerHTML = '';
    var p = state.profile;
    edit.appendChild(field('Name', textInput(p.name, function (v) { p.name = v; })));
    edit.appendChild(field('One-liner', textInput(p.identity.oneLiner, function (v) { p.identity.oneLiner = v; })));
    edit.appendChild(field('Positioning', textarea(p.identity.positioning, function (v) { p.identity.positioning = v; })));
    var dnaTa = textarea(p.identity.dna, function (v) { p.identity.dna = v; });
    dnaTa.rows = 5; dnaTa.placeholder = 'Voice: ...\nStance: ...\nSignature: ...\nNever: ...';
    var dnaF = field('Voice and angle (DNA)', dnaTa);
    dnaF.appendChild(el('span', { class: 'dgs-hint', text: 'How this publication sounds and what stance it takes. Every outline and every article is written in it, so your digest differs from anyone else covering the same stories. Edit freely.' }));
    var dnaBtn = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost', text: 'Suggest from my publication', style: 'margin-top:6px;' });
    dnaBtn.addEventListener('click', function () {
      dnaBtn.disabled = true; dnaBtn.textContent = 'Writing…';
      suggestDna(p).then(function (t) { if (t) { dnaTa.value = t; p.identity.dna = t; toast('Voice DNA suggested. Edit it, then save.', 'ok'); } else toast('The model returned nothing. Try again.', 'warn'); })
        .catch(function (e) { toast('Could not suggest a DNA: ' + (e && e.message || 'AI error'), 'error'); })
        .then(function () { dnaBtn.disabled = false; dnaBtn.textContent = 'Suggest from my publication'; });
    });
    dnaF.appendChild(dnaBtn);
    edit.appendChild(dnaF);
    var tb = el('div', { class: 'dgs-field' }, [el('span', { class: 'dgs-label', text: 'Topics' }),
      el('span', { class: 'dgs-hint', text: 'Each topic has a name, a weight (how much of your output it should drive) and scan signals: keywords the news scan searches for.' })]);
    var rows = el('div', { class: 'dgs-topic-rows' });
    function drawRows() {
      rows.innerHTML = '';
      var head = el('div', { class: 'dgs-topic-row dgs-topic-head' }, [el('span', { text: 'Name' }), el('span', { text: 'Weight' }), el('span', { text: 'Signals (comma separated)' }), el('span', { text: '' })]);
      rows.appendChild(head);
      p.topics.forEach(function (t, i) {
        var row = el('div', { class: 'dgs-topic-row' });
        row.appendChild(textInput(t.name, function (v) { t.name = v; }));
        var w = textInput(String(t.weight), function (v) { t.weight = Math.max(0, Math.min(1, parseFloat(v) || 0)); });
        w.setAttribute('inputmode', 'decimal'); row.appendChild(w);
        row.appendChild(textInput((t.signals || []).join(', '), function (v) { t.signals = v.split(',').map(function (x) { return x.trim(); }).filter(Boolean); }));
        var rm = el('button', { class: 'dgs-topic-rm', type: 'button', title: 'Remove topic', 'aria-label': 'Remove topic', text: '✕' });
        rm.addEventListener('click', function () {
          if (p.topics.length <= 1) { toast('Keep at least one topic.', 'error'); return; }
          p.topics.splice(i, 1); drawRows();
        });
        row.appendChild(rm);
        rows.appendChild(row);
      });
    }
    drawRows();
    var addBtn = el('button', { class: 'dgs-btn dgs-btn-ghost', type: 'button', text: '+ Add topic' });
    addBtn.addEventListener('click', function () {
      var n = p.topics.length + 1;
      p.topics.push({ name: 'New topic ' + n, weight: 0.2, subtopics: [], signals: [] });
      drawRows();
      var ins = rows.querySelectorAll('.dgs-topic-row:last-child input'); if (ins[0]) { ins[0].focus(); ins[0].select(); }
    });
    var norm = el('button', { class: 'dgs-btn dgs-btn-ghost', type: 'button', text: 'Balance weights' });
    norm.addEventListener('click', function () {
      var tot = p.topics.reduce(function (a, t) { return a + (t.weight || 0); }, 0) || 1;
      p.topics.forEach(function (t) { t.weight = Math.round(((t.weight || 0) / tot) * 100) / 100; });
      drawRows(); toast('Weights now add up to 100%', 'success');
    });
    tb.appendChild(rows); tb.appendChild(el('div', { class: 'dgs-actions' }, [addBtn, norm]));
    tb.appendChild(scoutPanel(p, function (s) { p.topics.push({ name: s.name, weight: 0.15, subtopics: [], signals: s.signals.slice() }); drawRows(); toast('"' + s.name + '" added with weight 0.15. Save the profile to keep it.', 'success'); }, function (list) { p.topics = p.topics.filter(function (t) { return list.indexOf(t) === -1; }); drawRows(); toast('Removed. Press "Balance weights", then save the profile.', 'success'); }));
    edit.appendChild(tb);
    edit.appendChild(field('Tone style', selectOpts(['analytical', 'urgent', 'neutral', 'contrarian'], p.tone.style, function (v) { p.tone.style = v; })));
    var save = el('button', { class: 'dgs-btn dgs-btn-primary', type: 'button', text: 'Save profile' });
    save.addEventListener('click', function () {
      p.topics.forEach(function (t) {
        if (!t.signals || !t.signals.length) t.signals = (DEFAULT_SIGNALS[String(t.name).toLowerCase()] || (/^New topic \d+$/.test(t.name) ? [] : [t.name])).slice();
      });
      p.updatedAt = new Date().toISOString();
      persistProfile(); renderProfile();
      $('#dgs-profile-edit').hidden = true; $('#dgs-profile-view').hidden = false;
      $('#dgs-edit-toggle').textContent = 'Edit';
      toast('Profile saved', 'success');
    });
    edit.appendChild(el('div', { class: 'dgs-actions' }, [save]));
  }

  function buildQueries(profile) {
    var lists = profile.topics.map(function (t) {
      return (t.signals || []).map(function (s) { return String(s).trim(); }).filter(function (s) {
        return s.length >= 3 && (s.indexOf(' ') !== -1 || STOPWORDS.indexOf(s.toLowerCase()) === -1);
      });
    });
    var seen = {}, ordered = [];
    var maxLen = Math.max.apply(null, lists.map(function (l) { return l.length; }).concat([0]));
    for (var i = 0; i < maxLen; i++) {
      for (var k = 0; k < lists.length; k++) {
        var s = lists[k][i];
        if (!s) continue;
        var key = s.toLowerCase();
        if (seen[key]) continue;
        seen[key] = true; ordered.push(s);
      }
    }
    var queries = [];
    for (var j = 0; j < ordered.length && queries.length < 4; j += 2) {
      queries.push(ordered.slice(j, j + 2).join(' OR '));
    }
    return queries;
  }
  function scoreStory(s, profile) {
    var text = (s.title + ' ' + s.summary).toLowerCase();
    var score = 0; s.matched = [];
    profile.topics.forEach(function (t) {
      var hit = false;
      (t.signals || []).forEach(function (sig) { if (sig && hasWord(text, sig)) { score += t.weight * 10; hit = true; } });
      if (hit) s.matched.push(t.name);
    });
    if (s.publishedAt) {
      var ageH = (Date.now() - new Date(s.publishedAt).getTime()) / 3.6e6;
      if (ageH < 6) score += 4; else if (ageH < 24) score += 2;
    }
    if (s.readable === 'open') score += 3;
    return score;
  }
  function fetchServerNews(q) {
    var cfg = window.AUTONOM_DGS || {};
    if (!cfg.newsEndpoint) return Promise.reject(new Error('no server news endpoint'));
    var ep = cfg.newsEndpoint + (cfg.newsEndpoint.indexOf('?') > -1 ? '&' : '?') + 'q=' + encodeURIComponent(q);
    state.counters.apiCalls++; updateCounters();
    return fetchWithTimeout(ep, { credentials: 'same-origin' }, 45000)
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (j) {
        if (j && j.ok && j.items && j.items.length) {
          LOG('server news ok via ' + j.source + ' for "' + q + '":', j.items.length, 'items');
          return { status: 'ok', feed: { title: j.source }, items: j.items };
        }
        throw new Error('server news: ' + ((j && j.error) || 'no items'));
      });
  }
  function fetchPublisherFeeds(profile) {
    var cfg = window.AUTONOM_DGS || {};
    if (!cfg.feedsEndpoint) return Promise.resolve([]);
    var sigs = [];
    (profile.topics || []).forEach(function (t) {
      (t.signals || []).forEach(function (x) {
        x = String(x).trim();
        if (x.length >= 3 && (x.indexOf(' ') !== -1 || STOPWORDS.indexOf(x.toLowerCase()) === -1) && sigs.indexOf(x) === -1) sigs.push(x);
      });
    });
    var ep = cfg.feedsEndpoint + (cfg.feedsEndpoint.indexOf('?') > -1 ? '&' : '?') + 'q=' + encodeURIComponent(sigs.slice(0, 24).join(' OR '));
    state.counters.apiCalls++; updateCounters();
    return fetchWithTimeout(ep, { credentials: 'same-origin' }, 40000)
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (j) {
        if (!j) throw new Error('no response');
        var st = j.stats || [];
        var up = st.filter(function (f) { return f.ok; }).length;
        var down = st.filter(function (f) { return !f.ok; }).map(function (f) { return f.id + '(' + (f.error || f.code) + ')'; });
        LOG('publisher feeds: ' + up + '/' + st.length + ' answered · ' + (j.items || []).length + ' matching stories' + (down.length ? ' · down: ' + down.join(', ') : ''));
        return j.items || [];
      })
      .catch(function (e) { LOG('publisher feeds failed:', e.message); return []; });
  }
  function googleNewsUrl(q) { return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=en-US&gl=US&ceid=US:en'; }
  function bingNewsUrl(q) { return 'https://www.bing.com/news/search?q=' + encodeURIComponent(q) + '&format=rss'; }
  function scanOneQuery(q) {
    LOG('scanOneQuery:', q);
    return fetchServerNews(q)
      .catch(function (e) { LOG('Server news unavailable (' + e.message + ') → GDELT from browser'); return tryGdelt(q); })
      .catch(function (e) { LOG('GDELT failed for "' + q + '": ' + e.message + ' → Google News via proxies'); return tryFeed(googleNewsUrl(q)); })
      .catch(function (e) { LOG('Google News failed for "' + q + '": ' + e.message + ' → Bing via proxies'); return tryFeed(bingNewsUrl(q)); })
      .then(function (f) { return { q: q, feed: f }; })
      .catch(function (e) { LOG('query "' + q + '" FAILED entirely:', e.message); return { q: q, feed: null }; });
  }
  function scanSequential(queries, onProgress) {
    var results = [];
    var i = 0;
    function step() {
      if (i >= queries.length) return Promise.resolve(results);
      var q = queries[i++];
      if (onProgress) onProgress(i, queries.length, q);
      return scanOneQuery(q).then(function (r) {
        results.push(r);
        if (i < queries.length) return sleep(window.AUTONOM_DGS && window.AUTONOM_DGS.newsEndpoint ? 2000 : 5200).then(step);
        return step();
      });
    }
    return step();
  }
  function mkStory(it, seen) {
    var key = cleanTitle(it.title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60), ukey = cleanUrl(it.link || '');
    if (seen[key] || (ukey && seen[ukey])) return null; seen[key] = true; if (ukey) seen[ukey] = true;
    var summary = String(it.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
    return {
      id: 'st_' + Math.random().toString(36).slice(2, 10),
      title: it.title, summary: summary, url: it.link,
      source: it.author || String(it.title || '').split(' - ').pop() || 'News',
      publishedAt: it.pubDate, score: 0,
      readable: (it.readable === 'open' || it.readable === 'metered') && isThinUrl(it.link) ? 'thin' : (it.readable || 'unknown'), sourceType: it.readable ? 'publisher' : 'aggregator',
      redirect: !!it.redirect || /news\.google\.com|bing\.com\/news/i.test(String(it.link || ''))
    };
  }
  // All recent headlines from the publisher feeds, not filtered by the profile. Used for the breaking lane and the topic scout.
  function fetchBroadFeeds() {
    var cfg = window.AUTONOM_DGS || {}; if (!cfg.feedsEndpoint) return Promise.resolve([]);
    state.counters.apiCalls++; updateCounters();
    return fetchWithTimeout(cfg.feedsEndpoint, { credentials: 'same-origin' }, 40000).then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (j) { var it = (j && j.items) || []; LOG('broad feeds: ' + it.length + ' headlines'); return it; }).catch(function (e) { LOG('broad feeds failed:', e && e.message); return []; });
  }
  // How many different outlets carry (almost) the same story. A real, measured signal of what is big right now.
  function computeCoverage(list) {
    var toks = list.map(function (s) { var o = {}, n = 0; tokenize(cleanTitle(s.title)).forEach(function (w) { if (!o[w]) { o[w] = 1; n++; } }); return { o: o, n: n }; });
    list.forEach(function (s, i) {
      var outs = {}; outs[String(s.source || '').toLowerCase()] = 1; var a = toks[i];
      if (a.n >= 3) list.forEach(function (z, j) {
        if (i === j) return; var b = toks[j]; if (b.n < 3) return; var c = 0; Object.keys(a.o).forEach(function (w) { if (b.o[w]) c++; });
        if (c >= 3 && c / Math.min(a.n, b.n) >= 0.55) outs[String(z.source || '').toLowerCase()] = 1;
      });
      s.coverage = Object.keys(outs).length;
    });
  }
  var scanSeq = 0;
  function scanFeeds() {
    if (!state.profile) return;
    var myScan = ++scanSeq;
    var queries = buildQueries(state.profile);
    if (!queries.length) {
      toast('Your profile has no usable signals (3+ characters). Go back to Profile → Edit and add keywords.', 'error');
      return;
    }
    var list = $('#dgs-story-list'); list.innerHTML = '';
    state.stories = []; state.selectedStoryIds = {}; 
    var pubPromise = fetchPublisherFeeds(state.profile);
    var brk = document.getElementById('dgs-scan-breaking'), breakPromise = (!brk || brk.checked) ? fetchBroadFeeds() : Promise.resolve([]);
    try { localStorage.setItem('dgs_scan_breaking', brk && !brk.checked ? '0' : '1'); } catch (e0) {}
    var prog = $('#dgs-scan-progress'); prog.hidden = false;
    var fill = $('.dgs-progress-fill', prog); var label = $('.dgs-progress-label', prog);
    fill.style.width = '5%';
    label.textContent = 'Searching ' + queries.length + ' queries (sequential, ~5s between each)…';
    scanSequential(queries, function (n, total, q) {
      label.textContent = 'Query ' + n + ' of ' + total + ': ' + q;
      fill.style.width = Math.round(((n - 1) / total) * 80 + 5) + '%';
    }).then(function (results) {
      var successful = results.filter(function (r) { return r.feed && r.feed.items && r.feed.items.length; });
      LOG('scan results:', successful.length + '/' + results.length + ' queries succeeded');
      if (!successful.length) {
        label.textContent = 'Trying last-resort query…';
        var firstSignal = '';
        (state.profile.topics || []).some(function (t) {
          return (t.signals || []).some(function (s) { if (String(s).length >= 3) { firstSignal = s; return true; } return false; });
        });
        return scanOneQuery(firstSignal || 'breaking news').then(function (r) { return r.feed ? [r] : []; });
      }
      return successful;
    }).then(function (results) {
      return pubPromise.then(function (pub) {
        if (pub && pub.length) results = [{ q: 'publishers', feed: { items: pub } }].concat(results);
        return results;
      });
    }).then(function (results) {
      if (myScan !== scanSeq) return;
      fill.style.width = '90%';
      var seen = {};
      results.forEach(function (r) {
        if (!r.feed || !r.feed.items) return;
        r.feed.items.slice(0, r.q === 'publishers' ? 40 : 12).forEach(function (it) {
          var story = mkStory(it, seen); if (!story) return;
          story.score = scoreStory(story, state.profile);
          state.stories.push(story);
        });
      });
      return breakPromise.then(function (broad) {
        var extra = [];
        broad.forEach(function (it) { var st = mkStory(it, seen); if (!st) return; var h = ageHours(st); if (h != null && h > 40) return; st.lane = 'breaking'; st.score = scoreStory(st, state.profile); extra.push(st); });
        var all = state.stories.concat(extra); computeCoverage(all);
        all.forEach(function (x) { x.score += Math.min(x.coverage || 1, 6) * 1.2; });
        state.stories.sort(function (a, b) { return b.score - a.score; });
        var cap = isDigest() ? 48 : 30, top = state.stories.slice(0, cap), ids = {}; top.forEach(function (x) { ids[x.id] = 1; });
        var lift = extra.filter(function (x) { return !ids[x.id] && (x.coverage || 1) >= 3; }).sort(function (a, b) { return (b.coverage || 0) - (a.coverage || 0) || b.score - a.score; }).slice(0, 12);
        state.stories = top.concat(lift).sort(function (a, b) { return b.score - a.score; });
        renderStories();
        fill.style.width = '100%';
        setTimeout(function () { prog.hidden = true; }, 300);
        if (!state.stories.length) toast('No stories found. Try different signals.', 'error');
        else { var tr = state.stories.filter(function (x) { return (x.coverage || 1) >= 3; }).length; toast(state.stories.length + ' stories found' + (tr ? ', ' + tr + ' covered by three or more outlets' : '') + '. Check the overview, then select the stories for the article.', 'success'); }
      });
    }).catch(function (e) {
      prog.hidden = true; LOG('scan crashed:', e);
      toast('Scan failed: ' + e.message, 'error');
    });
  }


  function ageHours(s) { return s.publishedAt ? (Date.now() - new Date(s.publishedAt).getTime()) / 3.6e6 : null; }
  function renderFeedTools() {
    var box = document.getElementById('dgs-feed-tools'); if (!box) return;
    box.innerHTML = '';
    if (!state.stories.length) { box.hidden = true; return; }
    box.hidden = false;
    var row = el('div', { class: 'dgs-ft-row' });
    row.appendChild(el('span', { class: 'dgs-label', text: 'Sort' }));
    var seg = el('div', { class: 'dgs-seg', role: 'group', 'aria-label': 'Sort stories' });
    [['match', 'Best match'], ['covered', 'Most covered'], ['new', 'Newest first'], ['outlet', 'By outlet']].forEach(function (x) {
      var b = el('button', { type: 'button', class: 'dgs-seg-btn' + (state.feedSort === x[0] ? ' is-on' : ''), 'aria-pressed': state.feedSort === x[0] ? 'true' : 'false', text: x[1] });
      b.addEventListener('click', function () { state.feedSort = x[0]; renderStories(); });
      seg.appendChild(b);
    });
    row.appendChild(seg);
    var tg = el('label', { class: 'dgs-switch' });
    var tcb = el('input', { type: 'checkbox' }); tcb.checked = state.feedReadable;
    tcb.addEventListener('change', function () { state.feedReadable = tcb.checked; renderStories(); });
    tg.appendChild(tcb); tg.appendChild(el('span', { class: 'dgs-switch-ui' })); tg.appendChild(el('span', { text: 'Readable only' }));
    row.appendChild(tg);
    var UM2 = (state.profile && state.digest) ? usedMap() : {}, anyUsed = state.stories.some(function (x) { return usedElsewhere(usedBy(x, UM2)); });
    if (anyUsed) {
      var tg2 = el('label', { class: 'dgs-switch' }), ucb = el('input', { type: 'checkbox' }); ucb.checked = state.feedFresh;
      ucb.addEventListener('change', function () { state.feedFresh = ucb.checked; renderStories(); });
      tg2.appendChild(ucb); tg2.appendChild(el('span', { class: 'dgs-switch-ui' })); tg2.appendChild(el('span', { text: 'Hide used' }));
      row.appendChild(tg2);
    }
    box.appendChild(row);
    box.appendChild(el('p', { class: 'dgs-hint', text: 'Match ★ is how well a story fits your topics, plus a freshness boost and a boost when many outlets carry the same story. "Covered by N outlets" is measured in this scan. "Readable" means the article text can be fetched; paywalled and headline-only stories cannot be used in the article.' }));
  }

  // ---- Stories that cannot be used (checked, not guessed) ----
  var UNUS_KEY = 'dgs_unusable_v1';
  function unusMap() {
    try { var o = JSON.parse(localStorage.getItem(UNUS_KEY) || '{}'), n = Date.now(), out = {}; Object.keys(o).forEach(function (k) { if (o[k] && n - o[k].t < 24 * 3600 * 1000) out[k] = o[k]; }); return out; } catch (e) { return {}; }
  }
  function unusKey(s) { return cleanUrl(s.url || '') || String(s.title || ''); }
  function markUnusable(s, why) {
    s.unusable = why || 'The article could not be read.';
    try { var m = unusMap(); m[unusKey(s)] = { t: Date.now(), why: s.unusable }; localStorage.setItem(UNUS_KEY, JSON.stringify(m)); } catch (e) {}
    delete state.selectedStoryIds[s.id];
  }
  function unusableOf(s) {
    if (s.unusable) return s.unusable;
    var m = unusMap()[unusKey(s)];
    if (m) { s.unusable = m.why; return m.why; }
    return '';
  }
  function isReadableStory(x) { return x.readable !== 'paywalled' && x.readable !== 'thin' && !x.redirect && !unusableOf(x); }


  var probeQ = Promise.resolve();
  function probeStory(s, chip) {
    if (s._srcP || s.unusable) return;
    if (chip) { chip.textContent = 'checking the article…'; chip.className = 'dgs-chip is-muted'; }
    s._srcP = probeQ.then(function () { return resolveSource(s); });
    probeQ = s._srcP.catch(function () {});
    s._srcP.then(function (src) {
      if (src) {
        s.verified = true; s.verifiedVia = src.via;
        if (chip && chip.isConnected) { chip.textContent = src.via === 'alternative' ? '✓ readable via ' + src.story.source : '✓ readable (checked)'; chip.className = 'dgs-chip is-ok'; }
        return;
      }
      s._srcP = null;
      var wy = fetchWhy(s.url);
      markUnusable(s, 'Could not read the article' + (wy ? ': ' + wy : '') + ', and no other outlet with the same story was found.');
      toast('"' + (s.title.length > 60 ? s.title.slice(0, 58) + '…' : s.title) + '" can\'t be used: ' + (wy || 'no readable article') + '. It was unchecked.', 'error');
      renderStories(); updateStepAvailability();
    }).catch(function () { s._srcP = null; });
  }

  function renderStories() {
    var list = $('#dgs-story-list'); list.innerHTML = '';
    renderFeedTools(); renderFeedOverview();
    var hiddenN = 0, usedHidden = 0, UM = (state.profile && state.digest) ? usedMap() : {};
    var shown = state.stories.filter(function (x) {
      var ok = !state.feedReadable || isReadableStory(x); if (!ok) { hiddenN++; return false; }
      if (state.feedFresh && usedElsewhere(usedBy(x, UM)) && !state.selectedStoryIds[x.id]) { usedHidden++; return false; }
      return true;
    });
    if (state.feedSort === 'new') shown.sort(function (a, b) { return (new Date(b.publishedAt || 0).getTime() || 0) - (new Date(a.publishedAt || 0).getTime() || 0); });
    else if (state.feedSort === 'covered') shown.sort(function (a, b) { return (b.coverage || 1) - (a.coverage || 1) || b.score - a.score; });
    else if (state.feedSort === 'outlet') shown.sort(function (a, b) { return String(a.source || '').localeCompare(String(b.source || '')) || b.score - a.score; });
    if (hiddenN) list.appendChild(el('p', { class: 'dgs-hint', text: hiddenN + ' stor' + (hiddenN === 1 ? 'y is' : 'ies are') + ' hidden because the article cannot be read (paywall, live page, link only, or a fetch that already failed). Turn off "Readable only" to see them.' }));
    if (usedHidden) list.appendChild(el('p', { class: 'dgs-hint', text: usedHidden + ' stor' + (usedHidden === 1 ? 'y is' : 'ies are') + ' hidden because an earlier digest already used ' + (usedHidden === 1 ? 'it' : 'them') + '. Turn off "Hide used" above to see ' + (usedHidden === 1 ? 'it' : 'them') + '.' }));
    shown.forEach(function (s) {
      var cb = el('input', { type: 'checkbox' });
      cb.checked = !!state.selectedStoryIds[s.id];
      var body = el('div');
      body.appendChild(el('p', { class: 'dgs-story-title', text: s.title }));
      var meta = el('div', { class: 'dgs-story-meta' });
      meta.appendChild(el('span', { text: s.source }));
      var unW = unusableOf(s);
      var rdLabel = unW ? '✕ can\'t use' : s.verified ? '✓ readable (checked)' : s.readable === 'open' ? '✓ likely readable' : s.readable === 'metered' ? '◐ maybe readable' : s.readable === 'paywalled' ? '🔒 paywalled: topic only' : s.readable === 'thin' ? '… headline only' : '? unknown';
      var rdChip = el('span', { class: 'dgs-chip ' + (unW ? 'is-bad' : s.verified ? 'is-ok' : 'is-muted'), text: rdLabel, title: unW || (s.verified ? 'The article text was fetched.' : 'The feed gives open access. The article is fetched and confirmed when you tick the story.') });
      meta.appendChild(rdChip);
      var ub = usedBy(s, UM);
      if (ub) meta.appendChild(el('span', { class: 'dgs-chip is-used', text: ub.cur ? 'In this digest' : (ub.level === 2 ? 'Used: ' : 'In draft: ') + dShort(ub.title, 30), title: 'Section "' + ub.section + '" in "' + ub.title + '"' + (ub.edition ? ' (' + ub.edition + ')' : '') }));
      if ((s.coverage || 1) >= 3) meta.appendChild(el('span', { class: 'dgs-chip is-hot', text: 'Covered by ' + s.coverage + ' outlets', title: 'The same story appears at ' + s.coverage + ' different outlets in this scan. A sign that it is big right now.' }));
      if (s.lane === 'breaking' && !(s.matched || []).length) meta.appendChild(el('span', { class: 'dgs-chip is-muted', text: 'Outside your topics', title: 'Found in the general news flow, not through your topics. Big enough to be worth a section?' }));
      (s.matched || []).slice(0, 3).forEach(function (t) { meta.appendChild(el('span', { class: 'dgs-chip', text: t })); });
      if (s.publishedAt) meta.appendChild(el('span', { text: new Date(s.publishedAt).toLocaleString() }));
      body.appendChild(meta);
      var score = el('div', { class: 'dgs-story-side' });
      score.appendChild(el('span', { class: 'dgs-story-score', title: 'Match: how well this story fits your topics and signals, plus freshness.', text: 'Match ★ ' + s.score.toFixed(1) }));
      var card = el('label', { class: 'dgs-story' + (cb.checked ? ' is-selected' : '') }, [cb, body, score]);
      if (unW) cb.disabled = true;
      cb.addEventListener('change', function () {
        if (cb.checked) { state.selectedStoryIds[s.id] = true; if (!s.verified && s.readable !== 'paywalled' && s.readable !== 'thin') probeStory(s, rdChip); }
        else delete state.selectedStoryIds[s.id];
        card.classList.toggle('is-selected', cb.checked);
        updateStepAvailability();
        refreshFeedNext();
      });
      list.appendChild(card);
    });
    refreshFeedNext();
  }
  function refreshFeedNext() {
    var n = Object.keys(state.selectedStoryIds).length;
    $('#dgs-feed-next').hidden = !n; if (isDigest()) updateFoSel();
    var btn = $('#dgs-continue-scripts');
    if (btn) btn.textContent = n ? 'Continue with ' + n + (n === 1 ? ' story' : ' stories') + ' →' : 'Continue →';
    var fh = document.getElementById('dgs-feed-size');
    if (!fh && btn && btn.parentNode) { fh = el('span', { class: 'dgs-hint', id: 'dgs-feed-size' }); btn.parentNode.appendChild(fh); }
    if (fh) fh.textContent = n ? sizeAdvice(n) : '';
  }

  function fetchArticle(url) {
    var cfg = window.AUTONOM_DGS || {};
    if (!cfg.articleEndpoint || !/^https?:\/\//i.test(String(url || ''))) return Promise.resolve(null);
    if (/bing\.com\/news/i.test(url)) return Promise.resolve(null);
    if (/^https?:\/\/([^\/]*\.)?(wsj|ft|bloomberg|economist|barrons)\.com\//i.test(url)) return Promise.resolve(null);
    var ep = cfg.articleEndpoint + (cfg.articleEndpoint.indexOf('?') > -1 ? '&' : '?') + 'url=' + encodeURIComponent(url);
    return fetchWithTimeout(ep, { credentials: 'same-origin' }, 25000)
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (j) { if (j && j.ok && j.text) { delete fetchErr[url]; return j; } fetchErr[url] = (j && j.error) || 'unreachable'; LOG('article not available:', url, j && j.error); return null; })
      .catch(function (e) { fetchErr[url] = 'network'; LOG('article fetch failed:', e.message); return null; });
  }
  var fetchErr = {};
  function fetchWhy(url) {
    var c = fetchErr[url] || '';
    if (!c) return '';
    if (/^http_(401|403|406)/.test(c)) return 'the publisher blocks automated readers (' + c.slice(5) + ')';
    if (c === 'http_404' || c === 'http_410') return 'the page no longer exists (' + c.slice(5) + ')';
    if (/^http_/.test(c)) return 'the publisher answered ' + c.slice(5);
    if (c === 'paywalled') return 'the article is behind a paywall';
    if (c === 'too_short') return 'the page has no readable article text (live page, video, or text drawn by script)';
    if (c === 'rate_limited') return 'the reader hit its rate limit, try again in a few minutes';
    if (c === 'decode_failed' || c === 'redirect_link') return 'it is an aggregator link that could not be resolved to the publisher';
    if (c === 'not_html') return 'the link is not a web page';
    return 'the page could not be fetched (' + c + ')';
  }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function cleanTitle(t) { return String(t || '').replace(/\s[-–|]\s[^-–|]{2,40}$/, ''); }
  function relatedStories(story, max) {
    var base = uniq(tokenize(cleanTitle(story.title)));
    var out = [];
    state.stories.forEach(function (o) {
      if (o.id === story.id) return;
      var toks = uniq(tokenize(cleanTitle(o.title)));
      var shared = toks.filter(function (w) { return base.indexOf(w) !== -1; }).length;
      var minLen = Math.min(base.length, toks.length) || 1;
      if (shared >= 3 || (shared >= 2 && shared / minLen >= 0.5)) out.push({ s: o, n: shared });
    });
    out.sort(function (a, b) { return b.n - a.n; });
    return out.slice(0, max).map(function (x) { return x.s; });
  }

  function currentLlmKey() {
    var p = state.settings.llmProvider;
    if (p === 'gemini') return state.settings.geminiKey;
    if (p === 'openai') return state.settings.openaiKey;
    if (p === 'deepseek') return state.settings.deepseekKey;
    if (p === 'groq') return state.settings.groqKey;
    if (p === 'openrouter') return state.settings.openrouterKey;
    if (p === 'nvidia') return state.settings.nvidiaKey;
    return '';
  }

  function cleanUrl(u) {
    try {
      var x = new URL(u);
      ['traffic_source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'at_medium', 'at_campaign', 'xrs', 'ocid'].forEach(function (k) { x.searchParams.delete(k); });
      return x.toString();
    } catch (e) { return u; }
  }

  function isThinUrl(u) { return /\/(video|videos|liveblog|live|live-news|live-blog|gallery|podcast|podcasts|watch)\//i.test(String(u || '')); }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; } }
  function rootHost(h) { return String(h || '').split('.').slice(-2).join('.'); }
  function sigTokens(text) { return uniq(tokenize(text).filter(function (w) { return w.length >= 4; })); }
  function fetchFeedItems(terms) {
    var cfg = window.AUTONOM_DGS || {};
    if (!cfg.feedsEndpoint || !terms.length) return Promise.resolve([]);
    var ep = cfg.feedsEndpoint + (cfg.feedsEndpoint.indexOf('?') > -1 ? '&' : '?') + 'q=' + encodeURIComponent(terms.join(' OR '));
    state.counters.apiCalls++; updateCounters();
    return fetchWithTimeout(ep, { credentials: 'same-origin' }, 30000)
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (j) { return (j && j.items) || []; })
      .catch(function (e) { LOG('second-outlet search failed:', e.message); return []; });
  }


  function parseApiError(text) {
    var msg = text;
    try { var j = JSON.parse(text); if (j.error && j.error.message) msg = j.error.message; } catch (e) {}
    return String(msg || '').replace(/\s+/g, ' ').slice(0, 600);
  }

  // ---------- Model health, remembered across page loads ----------
  // A model that failed is skipped with exponential backoff (90 s, 3 min, 6 min, 12 min, 15 min). A model that
  // answers is trusted again at once. This is what stops every call from re-trying the same overloaded models
  // from the top of the list.
  var HEALTH_KEY = 'dgs_model_health';
  var health = (function () {
    var out = {};
    try { var o = JSON.parse(localStorage.getItem(HEALTH_KEY) || '{}'), now = Date.now(); Object.keys(o).forEach(function (k) { if (o[k] && o[k].u > now) out[k] = o[k]; }); } catch (e) {}
    return out;
  })();
  function saveHealth() { try { localStorage.setItem(HEALTH_KEY, JSON.stringify(health)); } catch (e) {} }
  function inBackoff(ck) { return !!(health[ck] && health[ck].u > Date.now()); }
  function markBad(ck, ms) {
    if (stopGrace > Date.now()) return;
    var h = health[ck] || { f: 0, u: 0 };
    h.f = (h.f || 0) + 1;
    h.u = Date.now() + (ms || Math.min(90000 * Math.pow(2, h.f - 1), 15 * 60000));
    health[ck] = h; saveHealth();
  }
  function markGood(ck) { if (health[ck]) { delete health[ck]; saveHealth(); } }
  // Live status line while a call is in flight ("asking gemini-x", "gemini-x is overloaded, trying the next one").
  var llmStatus = null;
  function say(msg) { if (llmStatus) { try { llmStatus(msg); } catch (e) {} } }

  // Gemini says how long to wait in the 429 message ("Please retry in 8.2s") and separates per-minute from per-day quota.
  function gemWait(msg) {
    var m = String(msg || '').match(/retry in\s+([\d.]+)\s*(ms|s)/i);
    var daily = /per ?day|daily|PerDay/i.test(msg);
    if (daily) return 60 * 60000;
    return m ? Math.min(Math.round(parseFloat(m[1]) * (m[2].toLowerCase() === 'ms' ? 1 : 1000)) + 800, 65000) : 60000;
  }

  // Instead of trying models one after another (each failure costing seconds), a tiny request goes to the top
  // candidates AT THE SAME TIME. Whoever answers is the working set for the next 8 minutes.
  var probed = {};
  function probeGemini(key, models) {
    var pr = probed.gemini, now = Date.now();
    if (pr && now - pr.t < 8 * 60000) {
      return Promise.resolve(pr.ok.filter(function (m) { return models.indexOf(m) !== -1 && !inBackoff('gemini:' + m) && !isGone('gemini:' + m); }));
    }
    var cand = models.filter(function (m) { return !isGone('gemini:' + m) && !inBackoff('gemini:' + m); }).slice(0, 5);
    if (!cand.length) return Promise.resolve([]);
    say('checking which Gemini models are available right now');
    LOG('probing', cand.join(', '));
    return Promise.all(cand.map(function (m) {
      return fetchWithTimeout(GEMINI_BASE + m + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the single word: ok' }] }], generationConfig: { maxOutputTokens: 24, temperature: 0 } })
      }, 9000).then(function (r) {
        if (r.ok) { markGood('gemini:' + m); return m; }
        return r.text().then(function (t) {
          var msg = parseApiError(t), st = r.status;
          if (st === 401 || st === 403 || (st === 400 && /api key/i.test(msg))) { var f = new Error('Gemini ' + st + ' (key/permission): ' + msg); f.fatal = true; throw f; }
          if (st === 404 || st === 400) markGone('gemini:' + m);
          else if (st === 429) markBad('gemini:' + m, gemWait(msg));
          else markBad('gemini:' + m);
          LOG('probe: ' + m + ' answered ' + st);
          return null;
        });
      }, function () { markBad('gemini:' + m); LOG('probe: ' + m + ' did not answer within 9 s'); return null; });
    })).then(function (res) {
      var ok = res.filter(Boolean);   // same order as the candidates, i.e. best first
      probed.gemini = ok.length ? { t: Date.now(), ok: ok } : null;
      LOG('probe result: ' + (ok.join(', ') || 'no Gemini model is answering right now'));
      return ok;
    });
  }

  function callGemini(prompt, override, opts) {
    var key = String(state.settings.geminiKey || '').trim();
    var preferred = String(state.settings.geminiModel || '').trim();
    var quick = !!(opts && opts.quick);   // another provider is waiting as a backup: do not spend long here
    return discoverGemini(key).then(function (found) {
      var models = [];
      [override, preferred].concat(orderByStrategy('gemini', found, opts && opts.best)).forEach(function (m) { if (m && models.indexOf(m) === -1) models.push(m); });
      if (!models.length) {
        var ne = new Error('Could not get the list of Gemini models for this key, and no model name is set in Settings. Type a model name there once, or check the key.');
        ne.fatal = true; throw ne;
      }
      function overloaded() {
        var e = new Error('Gemini is overloaded or out of quota on every model right now.');
        e.code = 'ALL_FAILED'; return e;
      }
      function round(n) {
        return probeGemini(key, models).then(function (ok) {
          if (!ok.length) {
            if (quick || n >= 1) throw overloaded();
            LOG('Gemini is not answering on any model, waiting 12 s and checking once more');
            say('Gemini is overloaded, waiting 12 s');
            probed.gemini = null;
            return sleep(12000).then(function () { return round(n + 1); });
          }
          var rest = models.filter(function (m) { return ok.indexOf(m) === -1 && !isGone('gemini:' + m) && !inBackoff('gemini:' + m); }).slice(0, 2);
          return tryList(ok.concat(rest).slice(0, quick ? 3 : 6));
        });
      }
      function tryList(order) {
        var failures = [], i = 0;
        function failAll() {
          var allQuota = failures.length && failures.every(function (f) { return f.status === 429; });
          var err = new Error((allQuota ? 'Gemini quota exhausted on all models' : 'All Gemini models failed') + ' — ' +
            failures.map(function (f) { return f.model + ':' + f.status; }).join(', ') + (failures[0] && failures[0].msg ? ' (' + failures[0].msg.slice(0, 100) + ')' : ''));
          err.code = allQuota ? 'QUOTA' : 'ALL_FAILED';
          throw err;
        }
        function next() {
          if (i >= order.length) return failAll();
          var model = order[i++], ck = 'gemini:' + model;
          say('asking ' + model);
          LOG('Gemini →', model);
          return fetchWithTimeout(GEMINI_BASE + model + ':generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, responseMimeType: 'application/json' } })
          }, 50000).then(function (r) {
            if (r.ok) {
              return r.json().then(function (j) {
                var cand = j.candidates && j.candidates[0];
                var parts = cand && cand.content && cand.content.parts || [];
                var text = parts.filter(function (p) { return p.text && !p.thought; }).map(function (p) { return p.text; }).join('');
                if (!text) {
                  failures.push({ model: model, status: 'empty', msg: 'no text' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : '') });
                  markBad(ck, 60000);
                  return next();
                }
                markGood(ck);
                LOG('✓ Gemini success via', model);
                return { text: text, model: model, provider: 'gemini' };
              });
            }
            return r.text().then(function (t) {
              var msg = parseApiError(t), st = r.status;
              if (st === 401 || st === 403 || (st === 400 && /api key/i.test(msg))) { var fatal = new Error('Gemini ' + st + ' (key/permission): ' + msg); fatal.fatal = true; throw fatal; }
              if (st === 404) markGone(ck);
              else if (st === 429) { markBad(ck, gemWait(msg)); providerDown.gemini = Date.now() + 20000; probed.gemini = null; }
              else { markBad(ck); probed.gemini = null; }
              failures.push({ model: model, status: st, msg: msg });
              say(model + ' answered ' + st + ', trying the next one');
              return next();
            });
          }, function (netErr) {
            markBad(ck); probed.gemini = null;
            failures.push({ model: model, status: 'network', msg: netErr.message });
            say(model + ' did not answer, trying the next one');
            return next();
          });
        }
        return next();
      }
      return round(0);
    });
  }

  function callOpenAICompat(provider, key, prompt) {
    var endpoint = provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://api.deepseek.com/chat/completions';
    return discoverModels(provider, key).then(function (found) {
      var models = found.filter(function (m) { return !isGone(provider + ':' + m); });
      if (!models.length) { var ne = new Error(provider + ': could not find a usable model for this key.'); ne.fatal = true; throw ne; }
      function attempt(i) {
        var model = models[i];
        return fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
          body: JSON.stringify({ model: model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.7 })
        }, 45000).then(function (r) {
          if (!r.ok) return r.text().then(function (t) {
            var msg = parseApiError(t);
            if ((r.status === 404 || (r.status === 400 && /model/i.test(msg))) && i + 1 < models.length) { markGone(provider + ':' + model); return attempt(i + 1); }
            var err = new Error(provider + ' ' + r.status + ': ' + msg);
            if (r.status === 401 || r.status === 403) err.fatal = true;
            if (r.status === 429) err.code = 'QUOTA';
            throw err;
          });
          return r.json().then(function (j) {
            var text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
            if (!text) throw new Error(provider + ' returned no text.');
            return { text: text, model: model, provider: provider };
          });
        });
      }
      return attempt(0);
    });
  }

  var COMPAT = {
    groq: { endpoint: 'https://api.groq.com/openai/v1/chat/completions', keyField: 'groqKey', modelField: 'groqModel', writeField: 'groqWriteModel' },
    openrouter: { endpoint: 'https://openrouter.ai/api/v1/chat/completions', keyField: 'openrouterKey', modelField: 'openrouterModel', writeField: 'openrouterWriteModel' },
    nvidia: { endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions', keyField: 'nvidiaKey', modelField: 'nvidiaModel', writeField: 'nvidiaWriteModel' }
  };
  var COMPAT_IDS = ['groq', 'openrouter', 'nvidia'];
  var relayMode = {};
  var noReasonModel = {};
  var discovered = {};
  var NON_CHAT = /embed|imagen|veo|image|audio|vision|\bvl\b|ocr|whisper|tts|playai|orpheus|speech|transcri|moderat|guard|safeguard|rerank|aqa|robotics|computer-use|learnlm|compound|distil|realtime|dall|sora|search|live|native/i;
  function versionOf(id) { var m = String(id).match(/(\d+(?:[.-]\d+)?)/); return m ? parseFloat(m[1].replace('-', '.')) : 0; }
  function sizeOf(id) { var m = String(id).toLowerCase().match(/(\d+)b(?![a-z])/); return m ? parseInt(m[1], 10) : 0; }
  function listOk(r) {
    if (r.status === 401 || r.status === 403) { var f = new Error('API key rejected (' + r.status + '). Check the key in Settings.'); f.fatal = true; throw f; }
    return r.json();
  }
  // Cost class from the model's own name (no model names are hardcoded): 0 small/cheap, 1 balanced, 2 large/strong.
  function costClass(provider, id) {
    var l = String(id).toLowerCase(), sz = sizeOf(l), tk = l.split(/[-_\/.: ]+/);
    function has(re) { return tk.some(function (t) { return re.test(t); }); }
    if (provider === 'openai') return has(/^nano$/) ? 0 : has(/^mini$/) ? 1 : 2;
    if (has(/^(lite|nano|mini|tiny|small|instant|haiku|air)$/) || (sz && sz <= 12)) return 0;
    if (has(/^(pro|opus|large|ultra|max|reasoner|reasoning|thinking|r1|sonnet|o\d)$/) || sz >= 60) return 2;
    return 1;
  }
  // Re-order a provider's discovered models for the chosen strategy. Stable inside each class.
  function orderByStrategy(provider, ids, best) {
    var strat = state.settings.strategy || 'value';
    if (best && strat === 'value' && state.settings.writeBest !== false) strat = 'quality';   // the final script gets the strongest model; the many small calls stay on the chosen strategy
    if (provider === 'openrouter') return ids;   // only zero-price models are listed there, so cost does not differ
    var rank = strat === 'cheap' ? [0, 1, 2] : strat === 'quality' ? [2, 1, 0] : [1, 0, 2];
    return ids.map(function (id, i) { return { id: id, i: i, r: rank.indexOf(costClass(provider, id)) }; })
      .sort(function (a, b) { return a.r - b.r || a.i - b.i; }).map(function (x) { return x.id; });
  }
  function discoverGemini(key) {
    if (discovered.gemini) return Promise.resolve(discovered.gemini);
    return fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': key } }, 15000)
      .then(function (r) {
        if (r.status === 400 || r.status === 401 || r.status === 403) {
          return r.json().then(function (j) { var f = new Error('Gemini ' + r.status + ' (key/permission): ' + ((j && j.error && j.error.message) || 'rejected')); f.fatal = true; throw f; });
        }
        return r.json();
      })
      .then(function (j) {
        var list = ((j && j.models) || []).filter(function (m) {
          return m && m.name && (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1 && !NON_CHAT.test(m.name) && !/gemma/i.test(m.name);
        }).map(function (m) {
          var id = m.name.replace(/^models\//, ''), l = id.toLowerCase();
          return { id: id, tier: /lite/.test(l) ? 1 : (/flash/.test(l) ? 0 : 2), ver: versionOf(l), pre: /preview|exp/.test(l) ? 1 : 0 };
        });
        list.sort(function (a, b) { return a.tier - b.tier || b.ver - a.ver || a.pre - b.pre || (a.id < b.id ? -1 : 1); });
        var ft = list.filter(function (x) { return x.tier === 0; }), lt = list.filter(function (x) { return x.tier === 1; }), bt = list.filter(function (x) { return x.tier === 2; });
        discovered.gemini = ft.slice(0, 3).concat(lt.slice(0, 2), bt.slice(0, 2), ft.slice(3), lt.slice(2), bt.slice(2)).slice(0, 9).map(function (x) { return x.id; });
        LOG('gemini models available right now (best first):', discovered.gemini.join(', ') || '(none found)');
        return discovered.gemini;
      }, function (e) { if (e && e.fatal) throw e; LOG('gemini model list unavailable:', e && e.message); return []; })
      .catch(function (e) { if (e && e.fatal) throw e; LOG('gemini model list unavailable:', e && e.message); return []; });
  }
  var LIST_URL = { groq: 'https://api.groq.com/openai/v1/models', openrouter: 'https://openrouter.ai/api/v1/models', openai: 'https://api.openai.com/v1/models', deepseek: 'https://api.deepseek.com/models', nvidia: 'https://integrate.api.nvidia.com/v1/models' };
  function discoverModels(provider, key) {
    if (discovered[provider]) return Promise.resolve(discovered[provider]);
    var ep = (window.AUTONOM_DGS || {}).llmEndpoint;
    function listViaRelay() {
      return fetchWithTimeout(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: provider, key: key, action: 'models' }) }, 20000)
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error('relay: ' + ((j && j.error) || 'failed'));
          return { status: j.status, json: function () { try { return Promise.resolve(JSON.parse(j.text)); } catch (e) { return Promise.reject(e); } } };
        });
    }
    var first = relayMode[provider] && ep ? listViaRelay()
      : fetchWithTimeout(LIST_URL[provider], { headers: { 'Authorization': 'Bearer ' + key } }, 15000).catch(function (e) {
          if (!ep || COMPAT_IDS.indexOf(provider) === -1) throw e;
          LOG(provider + ': model list blocked from the browser (' + (e && e.message) + '), asking through the site relay');
          return listViaRelay();
        });
    return first
      .then(listOk)
      .then(function (j) {
        var list = (j && j.data || []).filter(function (m) {
          if (!m || !m.id || m.active === false || NON_CHAT.test(m.id)) return false;
          if (provider === 'openrouter') {
            var pr = m.pricing || {};
            return String(pr.prompt) === '0' && String(pr.completion) === '0' && (m.context_length || 0) >= 16000 && m.id.indexOf('openrouter/') !== 0;
          }
          if (provider === 'openai') return /^(gpt|chatgpt|o\d)/i.test(m.id) && !/instruct|codex|pro$/i.test(m.id);
          if (provider === 'nvidia') return !/embed|rerank|reward|guard|safety|vision|[-_]vl\b|vlm|parse|clip|retriev|translate|code|nemoguard|riva|asr|tts|diffusion|image|audio|speech/i.test(m.id);
          return m.context_window === undefined || (m.context_window || 0) >= 16000;
        }).map(function (m) {
          var l = m.id.toLowerCase();
          var tier = provider === 'openai' ? (/mini|nano/.test(l) ? 0 : 1) : (/reason|think|r1/.test(l) ? 1 : 0);
          return { id: m.id, tier: tier, size: sizeOf(l) || 30, ver: versionOf(l), ctx: m.context_window || m.context_length || 0 };
        });
        list.sort(function (a, b) { return a.tier - b.tier || b.size - a.size || b.ver - a.ver || b.ctx - a.ctx || (a.id < b.id ? -1 : 1); });
        discovered[provider] = list.slice(0, 10).map(function (x) { return x.id; });
        LOG(provider + ' models available right now (best first):', discovered[provider].join(', ') || '(none found)');
        return discovered[provider];
      }).catch(function (e) { if (e && e.fatal) throw e; LOG(provider + ' model list unavailable:', e && e.message); return []; });
  }
  function compatSend(provider, key, body) {
    var cfg = COMPAT[provider], ep = (window.AUTONOM_DGS || {}).llmEndpoint;
    function viaRelay() {
      return fetchWithTimeout(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: provider, key: key, payload: body }) }, 100000)
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error('relay: ' + ((j && j.error) || 'failed'));
          return { status: j.status, text: j.text };
        });
    }
    if (relayMode[provider] && ep) return viaRelay();
    var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };
    if (provider === 'openrouter') headers['X-Title'] = 'Autonom Digest';
    return fetchWithTimeout(cfg.endpoint, { method: 'POST', headers: headers, body: JSON.stringify(body) }, provider === 'openrouter' ? 60000 : 90000).then(function (r) {
      return r.text().then(function (t) { return { status: r.status, text: t }; });
    }, function (e) {
      if (!ep || (e && e.name === 'AbortError')) throw e;
      LOG(provider + ': direct call failed (' + (e && e.message) + '), using the site relay from now on');
      relayMode[provider] = true;
      return viaRelay();
    });
  }
  var waitNotice = null;
  function retryAfterMs(msg) {
    var m = String(msg || '').match(/try again in\s+(?:(\d+)m)?\s*([\d.]+)\s*(ms|s)\b/i);
    if (!m) return 0;
    var v = parseFloat(m[2]) * (m[3].toLowerCase() === 'ms' ? 1 : 1000);
    if (m[1]) v += parseInt(m[1], 10) * 60000;
    return Math.round(v);
  }
  var tpmLimit = {};
  var tpmLog = {};
  function estTokens(t) { return Math.ceil(String(t).length / 3.2); }
  function windowUsed(ck, now) {
    var a = (tpmLog[ck] || []).filter(function (x) { return now - x.t < 60000; });
    tpmLog[ck] = a;
    return a.reduce(function (sum, x) { return sum + x.n; }, 0);
  }
  function paceWait(ck, est) {
    var lim = tpmLimit[ck]; if (!lim) return 0;
    if (est > lim) return -1;
    var now = Date.now(), used = windowUsed(ck, now);
    if (used + est <= lim) return 0;
    var a = tpmLog[ck].slice().sort(function (x, y) { return x.t - y.t; }), need = used + est - lim, freed = 0, i;
    for (i = 0; i < a.length; i++) { freed += a[i].n; if (freed >= need) return Math.max(a[i].t + 60000 - now + 400, 1000); }
    return 60000;
  }

  function callCompat(provider, key, prompt, kind, o0) {
    var cfg = COMPAT[provider], st = state.settings;
    var explicit = String((kind === 'write' && st[cfg.writeField]) || st[cfg.modelField] || '').trim();
    var est = estTokens(prompt) + 1200;
    return discoverModels(provider, key).then(function (found) {
      // Capability-first: always start from the top of the quality-ranked list.
      // The cooldown maps skip models that just failed, so the best available
      // model is tried first on every call. When a cooldown lifts, the best
      // model returns to the front automatically.
      var ordered = orderByStrategy(provider, found.slice(), o0 && o0.best);
      var models = [];
      (explicit ? [explicit] : []).concat(ordered).forEach(function (m) { if (m && models.indexOf(m) === -1) models.push(m); });
      if (explicit && isGone(provider + ':' + explicit)) LOG(provider + ': the model "' + explicit + '" in Settings was refused as unknown and is being skipped. Clear that field to auto-pick.');
      if (!models.length) {
        var ne = new Error(provider + ': no usable model. The provider\'s model list could not be read, and no model name is set in Settings. Clear the model fields to auto-pick, or type a current model name.');
        ne.fatal = true; throw ne;
      }
      var run = { dead: {}, opt: {}, errs: [], lastErr: null, waits: 0 };
      function optsFor(m) { return run.opt[m] || (run.opt[m] = { noJson: false, noReason: false, jr: 0, rl: 0, e5: 0 }); }
      function failAll() {
        var e = run.lastErr || new Error(provider + ': no model answered.');
        if (run.errs.length > 1) { var e2 = new Error(provider + ': every model failed. ' + run.errs.join(' | ')); e2.code = e.code; e2.fatal = e.fatal; throw e2; }
        throw e;
      }
      function attempt() {
        var now = Date.now();
        var cand = models.filter(function (m) { var ck = provider + ':' + m; return !run.dead[m] && !isGone(ck) && !(health[ck] && health[ck].d && health[ck].u > now); });
        if (!cand.length) return failAll();
        var healthy = cand.filter(function (m) { return !inBackoff(provider + ':' + m); });
        if (healthy.length) cand = healthy;
        var ready = cand.filter(function (m) { return !(modelCooldown[provider + ':' + m] > now); });
        if (!ready.length) {
          if (run.waits >= 8) return failAll();
          var soon = Math.min.apply(null, cand.map(function (m) { return modelCooldown[provider + ':' + m]; }));
          var wait = Math.min(Math.max(soon - now + 300, 2000), 65000);
          run.waits++;
          LOG(provider + ': every model is at its per-minute limit, waiting ' + Math.round(wait / 1000) + ' s');
          if (waitNotice) { try { waitNotice(provider, Math.round(wait / 1000)); } catch (e6) {} }
          return sleep(wait).then(attempt);
        }
        return sendOne(ready[0]).then(function (res) { return res || attempt(); });
      }
      function sendOne(model) {
        var ck = provider + ':' + model, o = optsFor(model);
        var pw = paceWait(ck, est);
        if (pw < 0) {
          run.dead[model] = true; run.errs.push(model + ': request (~' + est + ' tokens) is larger than its ' + tpmLimit[ck] + '-token per-minute cap');
          run.lastErr = new Error(provider + ' (' + model + '): request is larger than the per-minute token cap of ' + tpmLimit[ck] + '.');
          LOG(provider + ' ' + model + ': request too large for its per-minute cap, trying another model');
          return Promise.resolve(null);
        }
        if (pw > 0) { modelCooldown[ck] = Date.now() + pw; return Promise.resolve(null); }
        var body = { model: model, messages: [{ role: 'user', content: prompt }], temperature: kind === 'write' ? 0.4 : 0.1 };
        if (!o.noJson) body.response_format = { type: 'json_object' };
        if (provider === 'groq' && !o.noReason && !noReasonModel[ck]) body.reasoning_effort = kind === 'write' ? 'medium' : 'low';
        say('asking ' + model);
        return compatSend(provider, key, body).then(function (r) {
          var raw = String(r.text || '');
          if (r.status >= 200 && r.status < 300) {
            var j; try { j = JSON.parse(raw); } catch (e) { j = null; }
            var text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
            var used = j && j.usage && j.usage.total_tokens;
            (tpmLog[ck] = tpmLog[ck] || []).push({ t: Date.now(), n: used || est });
            var okJson = false;
            if (text && String(text).trim()) { try { extractJson(text); okJson = true; } catch (e3) {} }
            if (okJson) { markGood(ck); LOG('✓ ' + provider + ' success via ' + model); return { text: String(text), model: model, provider: provider }; }
            if (o.jr < 1) { o.jr++; LOG(provider + ' ' + model + ' did not return valid JSON, asking once more'); return null; }
            run.lastErr = new Error(provider + ' (' + model + ') did not return valid JSON.'); run.errs.push(model + ': invalid JSON');
            run.dead[model] = true;
            return null;
          }
          var msg = parseApiError(raw);
          if (r.status === 401 || r.status === 403) { var f = new Error(provider + ' ' + r.status + ': ' + msg.slice(0, 200) + ' (check the API key)'); f.fatal = true; throw f; }
          if (r.status === 400) {
            var fg = ''; try { fg = (JSON.parse(raw).error || {}).failed_generation || ''; } catch (e4) {}
            if (fg) { try { extractJson(fg); LOG(provider + ' ' + model + ': used the repaired text of a failed JSON generation'); return { text: fg, model: model, provider: provider }; } catch (e5) {} }
            if (/reasoning/i.test(msg) && !o.noReason) { noReasonModel[ck] = true; o.noReason = true; return null; }
            if (/response_format|json/i.test(msg) && !o.noJson && !fg) { o.noJson = true; return null; }
            if (fg && o.jr < 1) { o.jr++; return null; }
          }
          if (r.status === 429) {
            run.lastErr = Object.assign(new Error(provider + ' 429 (' + model + '): ' + msg.slice(0, 220)), { code: 'QUOTA' });
            var lm = msg.match(/limit\s+(\d{3,7})/i);
            if (lm && /per minute|TPM/i.test(msg)) tpmLimit[ck] = parseInt(lm[1], 10);
            providerDown[provider] = Date.now() + 20000;
            var daily = /per[- ]day|daily|\bTPD\b|\bRPD\b|credits/i.test(msg);
            if (daily) {
              markBad(ck, 60 * 60000); health[ck].d = true; saveHealth(); run.errs.push(model + ': daily limit');
              LOG(provider + ' ' + model + ' daily limit reached, trying the next model');
              return null;
            }
            o.rl++;
            if (o.rl > 4) { run.dead[model] = true; run.errs.push(model + ': still rate-limited'); return null; }
            var wait = retryAfterMs(msg); wait = wait ? wait + 800 : 20000;
            modelCooldown[ck] = Date.now() + Math.min(wait, 65000);
            LOG(provider + ' ' + model + ' rate-limited for ' + Math.round(wait / 1000) + ' s, using another model meanwhile if there is one');
            say(model + ' is rate-limited, switching models');
            return null;
          }
          if (r.status >= 500 && o.e5 < 2) { o.e5++; modelCooldown[ck] = Date.now() + 3000; return null; }
          run.lastErr = new Error(provider + ' ' + r.status + ' (' + model + '): ' + msg.slice(0, 220)); run.errs.push(model + ': ' + r.status + ' ' + msg.slice(0, 90));
          if (r.status === 404 && /model|not found|does not exist/i.test(msg)) markGone(ck);
          markBad(ck, (r.status === 404 ? 60 : 3) * 60000);
          run.dead[model] = true;
          LOG(provider + ' ' + model + ' failed with ' + r.status + ', trying the next model');
          return null;
        }, function (e) {
          run.lastErr = new Error(provider + ' network error: ' + (e && e.message));
          throw run.lastErr;
        });
      }
      return attempt();
    });
  }

  var providerDown = {};
  var lastGoodProvider = '';
  function keyFor(p) {
    var f = { gemini: 'geminiKey', openai: 'openaiKey', deepseek: 'deepseekKey', groq: 'groqKey', openrouter: 'openrouterKey', nvidia: 'nvidiaKey' }[p];
    return f ? String(state.settings[f] || '').trim() : '';
  }
  function callOne(provider, prompt, kind, o) {
    var key = keyFor(provider);
    if (provider === 'gemini') return callGemini(prompt, kind === 'write' ? String(state.settings.geminiWriteModel || '').trim() : '', o);
    if (COMPAT[provider]) return callCompat(provider, key, prompt, kind, o);
    return callOpenAICompat(provider, key, prompt);
  }
  // Which model did which step, kept per script so the review card can show it.
  var llmTrail = [], trailPhase = '';
  function callLLM(prompt, kind, opts) {
    var primary = state.settings.llmProvider;
    if (primary === 'none') return Promise.reject(Object.assign(new Error('LLM provider is set to None.'), { fatal: true }));
    if (!keyFor(primary)) return Promise.reject(Object.assign(new Error('No API key for ' + primary + '. Open Settings.'), { fatal: true }));
    state.counters.llmCalls++; updateCounters();
    var order = [primary];
    if (state.settings.fallbackProviders !== false && !(opts && opts.noFallback)) {
      ['gemini', 'groq', 'openrouter', 'nvidia', 'openai', 'deepseek'].forEach(function (p) { if (p !== primary && keyFor(p)) order.push(p); });
    }
    var strat = state.settings.strategy || 'value';
    if (strat !== 'value') {
      // Cheapest first: providers with free tiers, then the cheaper paid one. Best quality first: the large-model providers.
      var pref = strat === 'cheap' ? ['groq', 'openrouter', 'nvidia', 'gemini', 'deepseek', 'openai'] : ['openai', 'gemini', 'deepseek', 'nvidia', 'groq', 'openrouter'];
      var allowAll = state.settings.fallbackProviders !== false && !(opts && opts.noFallback);
      var ord2 = pref.filter(function (p) { return keyFor(p) && (p === primary || allowAll); });
      if (ord2.length) order = ord2;
    }
    // Provider-level stickiness: whichever provider answered most recently goes first (unless in cooldown).
    // This spreads load across providers on free tiers; it does NOT prefer the cheap model within a provider.
    if (strat === 'value' && lastGoodProvider && order.indexOf(lastGoodProvider) > 0 && !(providerDown[lastGoodProvider] > Date.now())) {
      order = [lastGoodProvider].concat(order.filter(function (p) { return p !== lastGoodProvider; }));
    }
    var now = Date.now();
    var live = order.filter(function (p) { return !(providerDown[p] > now); });
    if (live.length) order = live;
    var errs = [], firstErr = null;
    function go(i) {
      if (i >= order.length) {
        var e = firstErr || new Error('No AI provider answered.');
        if (errs.length > 1) { var e2 = new Error(errs.join('  ·  ')); e2.code = e.code; e2.fatal = e.fatal; throw e2; }
        throw e;
      }
      var p = order[i];
      if (i > 0) LOG('falling back to ' + p + ' because ' + order[i - 1] + ' did not answer');
      return callOne(p, prompt, kind, { quick: i < order.length - 1, best: !!(opts && opts.best) }).then(function (r) {
        if (!(opts && opts.noSticky)) lastGoodProvider = p;
        llmTrail.push({ ph: trailPhase, p: (r && r.provider) || p, m: (r && r.model) || '' });
        say('');
        return r;
      }).catch(function (e) {
        if (!firstErr) firstErr = e;
        errs.push(p + ': ' + String(e && e.message || e).slice(0, 220));
        providerDown[p] = Date.now() + (e && e.fatal ? 10 * 60000 : 90000);
        return go(i + 1);
      });
    }
    return go(0);
  }

  function repairJson(t) {
    var out = '', inStr = false, esc = false, i, c;
    for (i = 0; i < t.length; i++) {
      c = t.charAt(i);
      if (inStr) {
        if (esc) { out += c; esc = false; }
        else if (c === '\\') { out += c; esc = true; }
        else if (c === '"') { out += c; inStr = false; }
        else if (c === '\n') out += '\\n';
        else if (c === '\r') out += '';
        else if (c === '\t') out += '\\t';
        else out += c;
      } else { if (c === '"') inStr = true; out += c; }
    }
    return out.replace(/,(\s*[}\]])/g, '$1');
  }
  function extractJson(text) {
    var t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(t); } catch (e) {}
    var f = t.indexOf('{'); var l = t.lastIndexOf('}');
    if (f >= 0 && l > f) {
      var core = t.slice(f, l + 1);
      try { return JSON.parse(core); } catch (e) {}
      try { return JSON.parse(repairJson(core)); } catch (e2) {}
    }
    throw new Error('Could not parse JSON from LLM response.');
  }



  function resolveSource(story) {
    function attempt(s, via) {
      return fetchArticle(s.url).then(function (art) {
        if (art && art.text) { if (art.finalUrl) s.url = art.finalUrl; return { art: art, story: s, via: via }; }
        return null;
      });
    }
    var first = (story.readable === 'paywalled' || story.readable === 'thin') ? Promise.resolve(null) : attempt(story, 'direct');
    return first.then(function (r) {
      if (r) return r;
      var alt = relatedStories(story, 8).filter(function (o) { return o.readable === 'open' && !o.redirect; })[0];
      if (alt) return attempt(alt, 'alternative').then(function (r2) { return r2 || searchOpenAlternative(story, attempt); });
      return searchOpenAlternative(story, attempt);
    });
  }
  // Last resort for paywalled / aggregator stories: search the open publisher feeds for the same event by headline,
  // then read the best open match. The script is then written from that outlet's article, never from the paywalled one.
  function searchOpenAlternative(story, attempt) {
    var base = sigTokens(cleanTitle(story.title));
    if (base.length < 3) return Promise.resolve(null);
    var sHost = rootHost(hostOf(story.url)), sName = String(story.source || '').toLowerCase();
    return fetchFeedItems(base.slice(0, 8)).then(function (items) {
      var cands = items.filter(function (it) {
        if (!it.link || it.readable !== 'open' || isThinUrl(it.link)) return false;
        if (rootHost(hostOf(it.link)) === sHost || String(it.author || '').toLowerCase() === sName) return false;
        var tt = sigTokens(cleanTitle(it.title));
        var shared = tt.filter(function (w) { return base.indexOf(w) !== -1; }).length;
        it._n = shared;
        return shared >= 3 || (shared >= 2 && shared / (Math.min(base.length, tt.length) || 1) >= 0.5);
      }).sort(function (a, b) { return b._n - a._n; }).slice(0, 3);
      LOG('open-outlet search for "' + story.title + '":', cands.length, 'candidates');
      var i = 0;
      function next() {
        if (i >= cands.length) return null;
        var c = cands[i++];
        var alt = { id: 'alt_' + i, title: c.title, summary: c.description || '', url: c.link, source: c.author || hostOf(c.link), publishedAt: c.pubDate, readable: 'open' };
        return attempt(alt, 'alternative').then(function (r) { return r || next(); });
      }
      return next();
    }).catch(function (e) { LOG('open-outlet search failed:', e.message); return null; });
  }

  function selectedList() { return state.stories.filter(function (x) { return state.selectedStoryIds[x.id]; }); }




  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {} ta.remove(); return Promise.resolve();
  }

  function openSettings() {
    $('#dgs-settings-drawer').hidden = false;
    var bAge = document.getElementById('dgs-backup-age');
    if (bAge) {
      var t0 = 0; try { t0 = parseInt(localStorage.getItem('autonom.dgs.backup_at') || '0', 10) || 0; } catch (e8) {}
      var days = t0 ? Math.floor((Date.now() - t0) / 86400000) : -1;
      bAge.textContent = days < 0 ? 'No backup downloaded yet. The browser or you can clear this data, so keep a backup file somewhere safe.' : days === 0 ? 'Last backup: today.' : 'Last backup: ' + days + ' day' + (days === 1 ? '' : 's') + ' ago.' + (days >= 7 ? ' Consider downloading a fresh one.' : '');
    }
    renderProfileBar(); showStore();
    $('#dgs-set-yt').value = state.settings.youtubeKey || '';
    $('#dgs-set-provider').value = state.settings.llmProvider || 'gemini';
    $('#dgs-set-gemini').value = state.settings.geminiKey || '';
    var gm = $('#dgs-set-gemini-model'); if (gm) gm.value = state.settings.geminiModel || '';
    var fb = $('#dgs-set-fallback'); if (fb) fb.checked = state.settings.fallbackProviders !== false;
    var stg = $('#dgs-set-strategy'); if (stg) stg.value = state.settings.strategy || 'value';
    var wb = $('#dgs-set-writebest'); if (wb) wb.checked = state.settings.writeBest !== false;
    var wm = $('#dgs-set-gemini-write-model'); if (wm) wm.value = state.settings.geminiWriteModel || '';
    $('#dgs-set-openai').value = state.settings.openaiKey || '';
    $('#dgs-set-deepseek').value = state.settings.deepseekKey || '';
    COMPAT_IDS.forEach(function (pv) {
      var k = $('#dgs-set-' + pv), m = $('#dgs-set-' + pv + '-model'), w = $('#dgs-set-' + pv + '-write-model');
      if (k) k.value = state.settings[pv + 'Key'] || '';
      if (m) m.value = state.settings[pv + 'Model'] || '';
      if (w) w.value = state.settings[pv + 'WriteModel'] || '';
    });
    syncProviderFields(); fillLinks();
  }
  function closeSettings() { $('#dgs-settings-drawer').hidden = true; }
  var LINK_KEYS = ['website', 'youtube', 'facebook', 'instagram', 'tiktok', 'x', 'linkedin', 'telegram'];
  function fillLinks() {
    var l = (state.profile && state.profile.links) || {};
    LINK_KEYS.forEach(function (k) { var i = $('#dgs-lnk-' + k); if (i) { i.value = l[k] || ''; i.disabled = !state.profile; } });
    var lb = $('#dgs-lnk-learn'); if (lb) lb.disabled = !state.profile;
    var h = $('#dgs-lnk-hint'); if (h) h.hidden = !!state.profile;
  }
  function readLinks() {
    if (!state.profile) return;
    var l = state.profile.links = state.profile.links || {};
    LINK_KEYS.forEach(function (k) { var i = $('#dgs-lnk-' + k); if (i) l[k] = i.value.trim(); });
  }
  function learnFromLinks() {
    if (!state.profile) return;
    readLinks(); persistProfile();
    var st = $('#dgs-lnk-status'), btn = $('#dgs-lnk-learn'), l = state.profile.links || {};
    var urls = LINK_KEYS.filter(function (k) { return /^https?:\/\//i.test(l[k] || ''); }).map(function (k) { return { k: k, url: l[k] }; });
    if (!urls.length) { st.textContent = 'Add at least one full link that starts with https://.'; return; }
    btn.disabled = true; btn.textContent = 'Reading…'; st.textContent = '';
    var got = [], bad = [];
    Promise.all(urls.map(function (u) {
      return fetchArticle(u.url).then(function (j) { if (j && String(j.text || '').length > 200) got.push({ k: u.k, text: String(j.text).slice(0, 2500) }); else bad.push(u.k); });
    })).then(function () {
      if (!got.length) { st.textContent = 'None of these pages could be read: ' + bad.join(', ') + '. Facebook, Instagram, X and LinkedIn usually block automated readers; a website or a YouTube channel works best. The links are saved.'; return; }
      return suggestDna(state.profile, got).then(function (t) {
        if (t) { state.profile.identity.dna = t; persistProfile(); renderProfile && renderProfile(); st.textContent = 'Voice DNA updated from ' + got.map(function (g) { return g.k; }).join(', ') + (bad.length ? '. Could not read: ' + bad.join(', ') + '.' : '.') + ' Review it in step 1 under the profile.'; }
        else st.textContent = 'The model returned nothing. Try again.';
      });
    }).catch(function (e) { st.textContent = 'Could not do that: ' + (e && e.message || 'AI error'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Read my pages to improve my voice'; });
  }
  function testNote(pv, text, kind) {
    var n = document.getElementById('dgs-testres-' + pv); if (!n) return;
    n.textContent = text; n.className = 'dgs-hint dgs-test-res' + (kind ? ' is-' + kind : '');
  }
  function testWhy(e) {
    var m = String((e && e.message) || e || 'unknown error');
    if (/401|403|invalid.*key|incorrect.*key|unauthori|api key not valid|permission/i.test(m)) return 'The provider rejected this key. Check that you pasted the whole key and that it is for this provider. (' + m.slice(0, 160) + ')';
    if (/429|quota|rate/i.test(m)) return 'The key may be fine, but the provider is rate-limiting it right now. Wait a minute and test again. (' + m.slice(0, 160) + ')';
    if (/no usable model/i.test(m)) return 'The key was accepted but no usable chat model was found. Type a model name in the model field and test again. (' + m.slice(0, 160) + ')';
    return m.slice(0, 260);
  }
  function syncProviderFields() {
    var p = $('#dgs-set-provider').value;
    $$('.dgs-drawer [data-provider]').forEach(function (f) { f.hidden = f.dataset.provider !== p; });
  }

  window.__dgsDiag = function () {
    console.log('--- DGS diagnostics v' + VERSION + ' ---');
    console.log('Profile:', state.profile);
    console.log('Settings (keys hidden):', {
      youtubeKey: state.settings.youtubeKey ? 'set' : 'missing',
      provider: state.settings.llmProvider,
      geminiKey: state.settings.geminiKey ? 'set' : 'missing',
      geminiModel: state.settings.geminiModel,
      requireSecond: !!state.settings.requireSecond,
      depth: state.settings.depth !== false,
      openaiKey: state.settings.openaiKey ? 'set' : 'missing',
      deepseekKey: state.settings.deepseekKey ? 'set' : 'missing'
    });
    console.log('Article endpoint:', (window.AUTONOM_DGS || {}).articleEndpoint || '(not configured)');
    console.log('Selected stories:', Object.keys(state.selectedStoryIds));
  };
  window.__dgsTestLLM = function () {
    console.log('--- LLM test ---');
    console.log('Provider:', state.settings.llmProvider, '· preferred model:', state.settings.geminiModel);
    callLLM('Return strict JSON: {"ok": true, "msg": "hello"}', 'extract', { noFallback: true, noSticky: true })
      .then(function (r) { console.log('✓ SUCCESS via', r.provider, r.model, '→', r.text); })
      .catch(function (e) { console.error('✗ FAILED:', e.message); });
  };
  window.__dgsTestGdelt = function () {
    console.log('[DGS] Testing GDELT…');
    tryGdelt('war OR defense')
      .then(function (f) { console.log('[DGS] GDELT OK:', f.items.length, 'items'); })
      .catch(function (e) { console.error('[DGS] GDELT failed:', e.message); });
  };
  window.__dgsTestArticle = function (url) {
    if (!url) { console.log('Usage: __dgsTestArticle("https://example.com/some-article")'); return; }
    fetchArticle(url).then(function (r) {
      if (r) console.log('✓ Article OK:', r.title, '·', r.length, 'chars\n', String(r.text).slice(0, 400) + '…');
      else console.error('✗ No article text (check endpoint, paywall, or URL).');
    });
  };
  window.__dgsTestFeeds = function () {
    var cfg = window.AUTONOM_DGS || {};
    if (!cfg.feedsEndpoint) { console.error('No feeds endpoint configured (update the PHP file).'); return; }
    fetch(cfg.feedsEndpoint, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (console.table) console.table(j.stats || []); else console.log(j.stats);
        console.log('stories (last 5 days):', (j.items || []).length);
      })
      .catch(function (e) { console.error('Feeds test failed:', e.message); });
  };
  window.__dgsListModels = function () {
    var key = String(state.settings.geminiKey || '').trim();
    if (!key) { console.error('No Gemini key set.'); return; }
    fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } })
      .then(function (r) { console.log('HTTP', r.status); return r.json(); })
      .then(function (j) {
        if (j.error) { console.error(j.error.message); return; }
        (j.models || []).filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1; })
          .forEach(function (m) { console.log(m.name); });
      })
      .catch(function (e) { console.error('Failed:', e.message); });
  };













  function copyText(t) { try { navigator.clipboard.writeText(t); return true; } catch (e) { return false; } }

  // =====================================================================
  // Autonom Digest: the second mode of this tool. One daily article from many stories.
  // Stage 1: feed overview, grouping stories into sections, section editor, outline.
  // Own profiles, keys and storage; independent of Newsreel.
  // =====================================================================
  function isDigest() { return true; }
  var DIGEST_LS = 'autonom.dgs.digest.v1';
  var DLENS = [
    { id: 'happened', label: 'What happened', hint: 'A plain, vivid account of the facts. Best when the facts themselves are the value.' },
    { id: 'hidden', label: 'The hidden layer', hint: 'What sits under the headline: incentives, infrastructure, dependencies, who really decides.' },
    { id: 'benefits', label: 'Who benefits', hint: 'Who gains, who pays, and why that matters.' },
    { id: 'second', label: 'Second-order effects', hint: 'What this sets in motion next. Reasoned from the facts and labelled as reasoning, never as prediction.' },
    { id: 'contrarian', label: 'The contrarian reading', hint: 'Where the common take may be incomplete, argued only from the facts.' },
    { id: 'parallel', label: 'A pattern from before', hint: 'A well-established earlier case that fits. Used only when it is solid.' },
    { id: 'watch', label: 'What to watch', hint: 'Concrete signals that would confirm or break the reading.' }
  ];
  var SCORE_LENS = { id: 'scorecard', label: 'Our earlier reads', hint: 'How our earlier readings held up against what came after.' };
  function dLens(id) { if (id === 'scorecard') return SCORE_LENS; return DLENS.filter(function (l) { return l.id === id; })[0] || DLENS[0]; }
  // ---------------------------------------------------------------------------------------------
  // Digest library. A profile has many digests: today's morning edition, this afternoon's update, last week's.
  // They live in IndexedDB (no 5 MB limit, separate from the small localStorage that Newsreel also fills) and are
  // all loaded into memory at start, so the rest of the tool stays synchronous.
  // ---------------------------------------------------------------------------------------------
  var LIB = { recs: {}, cur: {}, idb: false };
  function libRecs(pid) { pid = pid || 'none'; return LIB.recs[pid] || (LIB.recs[pid] = {}); }
  function newId() { return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function daypart(t) { var h = new Date(t || Date.now()).getHours(); return h < 11 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'; }
  function sameDay(a, b) { var x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); }
  function digestBlank() {
    var pid = state.profile && state.profile.id, now = Date.now();
    var earlier = Object.keys(libRecs(pid)).map(function (k) { return libRecs(pid)[k]; }).filter(function (r) { return digestHasContent(r) && sameDay(r.created, now); });
    return { id: newId(), created: now, sections: 4, sectionsAuto: true, stories: {}, clusters: [], left: [], outline: null, at: 0, edition: earlier.length ? daypart(now) + ' update' : '' };
  }
  function digestHasContent(d) { return !!(d && ((d.clusters && d.clusters.length) || d.outline)); }
  function digestTitle(d) { return (d.outline && d.outline.headline) || d.themeTitle || (d.clusters && d.clusters[0] && d.clusters[0].title) || 'Untitled digest'; }
  function digestNorm(d) {
    if (!d.id) d.id = newId();
    if (!d.created) d.created = d.at || Date.now();
    d.stories = d.stories || {}; d.left = Array.isArray(d.left) ? d.left : []; d.sections = d.sections || 4; d.clusters = Array.isArray(d.clusters) ? d.clusters : [];
    if (d.sectionsAuto == null) d.sectionsAuto = true;
    if (typeof d.edition !== 'string') d.edition = '';
    return d;
  }
  var curKey = function (pid) { return 'autonom.dgs.cur.v1.' + pid; };
  function recKeyLs(pid, id) { return DIGEST_LS + '.' + pid + '.' + id; }

  function libBoot() {
    return new Promise(function (resolve) {
      var done = false; function fin() { if (!done) { done = true; resolve(); } }
      setTimeout(fin, 2500);
      idb().then(function (db) {
        if (!db) return loadFromLs();
        LIB.idb = true;
        return new Promise(function (res) {
          try {
            var st = db.transaction('kv', 'readonly').objectStore('kv'), q = st.openCursor(window.IDBKeyRange.bound('dg:', 'dg;'));
            q.onsuccess = function () {
              var c = q.result; if (!c) return res();
              var parts = String(c.key).split(':'); if (parts.length >= 3 && c.value && typeof c.value === 'object') libRecs(parts[1])[parts.slice(2).join(':')] = digestNorm(c.value);
              c.continue();
            };
            q.onerror = function () { res(); };
          } catch (e) { res(); }
        }).then(function () { return Promise.all((state.profiles || []).map(function (p) { return idbGet('cur:' + p.id).then(function (v) { if (v) LIB.cur[p.id] = v; }); })); });
      }).then(function () { migrateLegacy(); }).then(fin, fin);
    });
  }
  function loadFromLs() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i); if (!k || k.indexOf(DIGEST_LS + '.') !== 0) continue;
        var rest = k.slice(DIGEST_LS.length + 1), parts = rest.split('.');
        if (parts.length < 2) continue;
        var o = null; try { o = JSON.parse(localStorage.getItem(k)); } catch (e) {}
        if (o && typeof o === 'object' && o.clusters) libRecs(parts[0])[parts.slice(1).join('.')] = digestNorm(o);
      }
    } catch (e2) {}
    (state.profiles || []).forEach(function (p) { try { var v = localStorage.getItem(curKey(p.id)); if (v) LIB.cur[p.id] = v; } catch (e3) {} });
  }
  // Older versions kept one digest per profile under one key. It becomes the first library entry and the old key is freed.
  function migrateLegacy() {
    (state.profiles || []).forEach(function (p) {
      var k = DIGEST_LS + '.' + p.id, raw = null; try { raw = localStorage.getItem(k); } catch (e) {}
      if (!raw) return;
      try {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object' && Array.isArray(o.clusters)) {
          o = digestNorm(o); var rc = libRecs(p.id); if (!rc[o.id]) { rc[o.id] = o; if (!LIB.cur[p.id]) LIB.cur[p.id] = o.id; queueSave(p.id, o); }
          flushDigests().then(function () { try { localStorage.removeItem(k); } catch (e2) {} });
        } else localStorage.removeItem(k);
      } catch (e3) {}
    });
  }
  var digestFor = null;
  function digestEnsure() {
    var id = state.profile && state.profile.id;
    if (digestFor !== id || !state.digest) { digestLoad(); digestFor = id; }
  }
  function digestLoad() {
    var pid = state.profile && state.profile.id, recs = libRecs(pid), id = LIB.cur[pid], d = id && recs[id];
    if (!d) {
      var all = libList(pid);
      d = all.length ? recs[all[0].id] : null;
    }
    if (!d) d = digestBlank();
    digestNorm(d); recs[d.id] = d; LIB.cur[pid] = d.id; state.digest = d;
  }
  function libList(pid) {
    var recs = libRecs(pid || (state.profile && state.profile.id));
    return Object.keys(recs).map(function (k) { return recs[k]; }).filter(digestHasContent).sort(function (a, b) { return (b.created || 0) - (a.created || 0); });
  }
  var dirtyRecs = {}, flushT = null;
  function queueSave(pid, d) { dirtyRecs[pid + ':' + d.id] = [pid, d]; clearTimeout(flushT); flushT = setTimeout(flushDigests, 250); }
  function flushDigests() {
    clearTimeout(flushT); var jobs = [], todo = dirtyRecs; dirtyRecs = {};
    Object.keys(todo).forEach(function (k) {
      var pid = todo[k][0], d = todo[k][1];
      if (LIB.idb) {
        jobs.push(idbSet('dg:' + pid + ':' + d.id, d).then(function (ok) {
          if (!ok) { LIB.idb = false; if (!lsPut(recKeyLs(pid, d.id), JSON.stringify(d))) storeWarn(); }
          return idbSet('cur:' + pid, d.id);
        }));
      } else { if (!lsPut(recKeyLs(pid, d.id), JSON.stringify(d))) storeWarn(); lsPut(curKey(pid), d.id); }
    });
    var pid0 = state.profile && state.profile.id; if (pid0 && state.digest) { LIB.cur[pid0] = state.digest.id; lsPut(curKey(pid0), state.digest.id); jobs.push(idbSet('cur:' + pid0, state.digest.id)); }
    return Promise.all(jobs);
  }
  window.addEventListener('pagehide', function () { try { flushDigests(); } catch (e) {} });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { try { flushDigests(); } catch (e) {} } });
  function invalidateReview() { var rv = state.digest && state.digest.review; if (rv && rv.reviewed) { rv.reviewed = false; var cb = document.getElementById('dgs-rv-ok'); if (cb) cb.checked = false; } }
  function touchDraft() { invalidateReview(); digestSave(); }
  function digestSave() {
    var d = state.digest, pid = state.profile && state.profile.id; if (!d || !pid) return;
    d.at = Date.now(); libRecs(pid)[d.id] = d;
    if (digestHasContent(d)) queueSave(pid, d); else { LIB.cur[pid] = d.id; lsPut(curKey(pid), d.id); }
  }
  function libDeleteProfile(pid) {
    var recs = libRecs(pid); Object.keys(recs).forEach(function (id) { idbDel('dg:' + pid + ':' + id); try { localStorage.removeItem(recKeyLs(pid, id)); } catch (e) {} });
    delete LIB.recs[pid]; delete LIB.cur[pid]; idbDel('cur:' + pid); try { localStorage.removeItem(curKey(pid)); localStorage.removeItem(DIGEST_LS + '.' + pid); } catch (e2) {}
  }
  // ---- Library UI ----
  function aiBusy() { return cluBusy || outBusy || wrBusy; }
  function updateLibPill() {
    var n = document.getElementById('dgs-lib-pill'); if (!n) return;
    var d = state.digest; n.textContent = d && digestHasContent(d) ? dShort(digestTitle(d), 24) : 'New';
  }
  function digestStats(d) {
    var dr = d.draft || { sections: {} }, o = d.outline, inc = o ? o.sections.filter(function (x) { return x.include; }) : [], done = 0;
    inc.forEach(function (x) { var r = dr.sections && dr.sections[x.cid]; if (r && r.status === 'done') done++; });
    var ids = {}; d.clusters.forEach(function (c) { c.ids.forEach(function (i) { ids[i] = 1; }); });
    return { sections: d.clusters.length, planned: inc.length, written: done, stories: Object.keys(ids).length, left: o ? Math.max(0, d.clusters.length - inc.length) : 0 };
  }
  // ---- Quality control: publish-readiness of a digest (deterministic, no AI) ----
  function noteText(d) { return String((d && d.note) || '').replace(/\s*From where I sit:?\s*$/i, '').trim(); }
  var Q_SIGNAL = /\b(would change|change (?:our|my) (?:mind|read|view)|(?:revise|reverse|drop|abandon) (?:this|our) (?:read|view|reading)|(?:this|the|our)(?: \w+)? (?:read|reading|view|thesis|pattern|case)(?: \w+){0,2} (?:fails?|breaks?|weakens?|narrows?|collapses?)|(?:read|reading|view|thesis) (?:would be|is) (?:wrong|weakened|invalidated|contradicted)|we would be wrong|prove(?:s)? us wrong|would (?:contradict|falsify|invalidate|weaken)|invalidat\w+|if (?:\w+ ){0,8}(?:fails?|slips?|rises?|falls?|holds?|breaks?)|watch for|the signal|tripwire)\b/i;
  function qualityOf(d, all) {
    var r = { score: 0, grade: 'none', label: 'Not written', reasons: [], good: [] };
    if (!d || !d.outline) { r.reasons.push('Not planned yet.'); return r; }
    var dr = (d.draft && d.draft.sections) || {}, inc = d.outline.sections.filter(function (s) { return s.include; }).map(function (s) { return { s: s, c: (d.clusters || []).filter(function (x) { return x.id === s.cid; })[0] }; }).filter(function (x) { return x.c; });
    var done = inc.filter(function (x) { var q = dr[x.c.id]; return q && q.status === 'done' && q.paras && q.paras.length; });
    if (!inc.length || !done.length) { r.reasons.push(inc.length ? 'No section written yet.' : 'No section is included.'); return r; }
    var sc = 100, bad = function (n, t) { sc -= n; r.reasons.push(t + ' (−' + n + ')'); };
    var com = d.kind === 'commentary';
    if (done.length < inc.length) bad(Math.min(40, 12 * (inc.length - done.length)), (inc.length - done.length) + ' planned section' + (inc.length - done.length === 1 ? ' is' : 's are') + ' not written');
    if (done.length < (com ? 2 : 3)) bad(15, 'Only ' + done.length + ' section' + (done.length === 1 ? '' : 's') + '. Too thin for a standalone article');
    var thin = 0, nums = 0, tells = 0, stale = 0, words = 0, sig = 0, single = 0, audit = 0, off = 0;
    done.forEach(function (x) {
      var q = dr[x.c.id], txt = q.paras.join(' ');
      if (q.thin) thin++;
      if (q.checks) { nums += (q.checks.numbers || []).length; tells += (q.checks.tells || []).length; }
      if (q.sig !== x.c.ids.join(',') + '|' + x.s.lens + '|' + x.s.heading) stale++;
      words += txt.split(/\s+/).length;
      if (Q_SIGNAL.test(txt)) sig++;
      var outs = {}; (q.sources || []).forEach(function (z) { if (z.source) outs[z.source] = 1; }); if (Object.keys(outs).length < 2) single++;
      audit += (q.audit || []).length;
      if (x.s.off) off++;
    });
    var n = done.length;
    if (thin) bad(Math.min(20, thin * 10), thin + ' thin section' + (thin === 1 ? '' : 's') + ' (little source text)');
    if (single / n > 0.5) bad(15, 'Most sections rest on a single outlet');
    if (nums) bad(Math.min(24, nums * 8), nums + ' number' + (nums === 1 ? '' : 's') + ' not found in the sources');
    if (tells) bad(Math.min(12, tells * 4), tells + ' machine-sounding phrase' + (tells === 1 ? '' : 's'));
    if (words / n < 120) bad(15, 'Sections are very short (' + Math.round(words / n) + ' words on average)');
    if (!com && sig / n < 0.6) bad(12, 'Most sections say nothing that would change our read. Analysis without a test is opinion');
    if (stale) bad(10, stale + ' section' + (stale === 1 ? ' is' : 's are') + ' out of date after changes');
    if (off) bad(Math.min(10, off * 5), off + ' section' + (off === 1 ? '' : 's') + ' flagged "does not fit the argument"');
    if (audit > 3) bad(5, 'The audit removed ' + audit + ' unsupported sentences. Read it closely');
    var fr = d.draft && d.draft.frame, w = fr && fr.watch ? fr.watch.length : 0;
    if (!fr || !fr.summary) bad(10, 'No summary or opening');
    else if (w < 3) bad(6, 'Fewer than 3 "what to watch" items');
    if (!noteText(d)) bad(8, 'No analyst\'s note (your own view is the point)');
    else r.good.push('Analyst\'s note present');
    if (!(d.review && d.review.reviewed)) { sc -= 5; r.reasons.push('Not marked as reviewed (−5)'); }
    if (all && d.id) {
      var mine = {}; d.clusters.forEach(function (c) { c.ids.forEach(function (i) { if (d.stories[i]) storyKeys(d.stories[i]).forEach(function (k) { mine[k] = 1; }); }); });
      var total = Object.keys(mine).length, worst = null;
      all.forEach(function (o) {
        if (o.id === d.id || o.pool || !o.outline || !o.draft) return;
        var oq = o.q; if (!oq || oq.grade === 'none') return;
        var hit = 0, ok = {}; o.clusters.forEach(function (c) { c.ids.forEach(function (i) { if (o.stories[i]) storyKeys(o.stories[i]).forEach(function (k) { ok[k] = 1; }); }); });
        Object.keys(mine).forEach(function (k) { if (ok[k]) hit++; });
        if (total && hit / total >= 0.5 && (oq.score > sc || (oq.score === sc && o.created > d.created) || o.exportedAt)) { if (!worst || o.exportedAt) worst = o; }
      });
      if (worst) { var p = worst.exportedAt ? 30 : 15; bad(p, 'Covers the same stories as "' + dShort(digestTitle(worst), 40) + '"' + (worst.exportedAt ? ', which is already exported' : ', which is stronger') + '. Publish only one'); r.dupOf = worst.id; }
    }
    if (!d.exportedAt && Date.now() - (d.created || 0) > 36 * 3600 * 1000) { sc -= 5; r.reasons.push('Older than 36 hours and still not exported: the news has moved (−5)'); }
    r.score = Math.max(0, Math.min(100, sc));
    r.grade = r.score >= 80 ? 'ready' : r.score >= 60 ? 'fix' : 'weak';
    r.label = r.grade === 'ready' ? 'Ready to publish' : r.grade === 'fix' ? 'Fix first' : 'Weak';
    if (r.grade === 'ready' && !r.reasons.length) r.reasons.push('No issues found.');
    return r;
  }
  function qualityAll(pid) {
    var recs = libRecs(pid), list = Object.keys(recs).map(function (k) { return recs[k]; }).filter(function (d) { return digestHasContent(d) && !d.pool; });
    list.forEach(function (d) { d.q = qualityOf(d); });
    list.forEach(function (d) { d.q = qualityOf(d, list); });
    var out = {}; list.forEach(function (d) { out[d.id] = d.q; delete d.q; }); return out;
  }
  function qualityChip(q) {
    var cls = q.grade === 'ready' ? 'is-ok' : q.grade === 'fix' ? 'is-warn' : q.grade === 'weak' ? 'is-bad' : 'is-muted';
    return el('span', { class: 'dgs-chip ' + cls, text: q.grade === 'none' ? q.label : q.label + ' · ' + q.score, title: q.reasons.join('\n') });
  }
  function libRemoveWeak() {
    var pid = state.profile && state.profile.id; if (!pid) return;
    if (aiBusy()) { toast('Wait until the AI has finished.', 'error'); return; }
    var qa = qualityAll(pid), recs = libRecs(pid), cur = state.digest && state.digest.id;
    var vic = Object.keys(qa).filter(function (id) { var q = qa[id], d = recs[id]; return d && !d.exportedAt && id !== cur && (q.grade === 'weak' || q.grade === 'none'); });
    if (!vic.length) { toast('Nothing to remove. No unexported digest is weak.', 'success'); return; }
    var names = vic.map(function (id) { return '• ' + dShort(digestTitle(recs[id]), 60) + ' (' + qa[id].label + ')'; }).join('\n');
    if (!confirm('Delete these ' + vic.length + ' digest' + (vic.length === 1 ? '' : 's') + '?\n\n' + names + '\n\nTheir sections go back to the Waiting pool, so the stories are not lost. Exported digests and the one open now are kept. This cannot be undone.')) return;
    vic.forEach(function (id) { var dd = recs[id]; try { var keepC = dd.clusters.filter(function (c) { return !c.discarded; }); if (keepC.length) moveToPool(dd, keepC); } catch (e1) {} delete recs[id]; idbDel('dg:' + pid + ':' + id); try { localStorage.removeItem(recKeyLs(pid, id)); } catch (e) {} });
    flushDigests(); renderLib(); toast(vic.length + ' weak digest' + (vic.length === 1 ? '' : 's') + ' removed.', 'success');
  }

  // ---- Keep one: overlapping digests are merged down to the strongest ----
  function digestKeys(d) { var m = {}; (d.clusters || []).forEach(function (c) { c.ids.forEach(function (i) { if (d.stories[i]) storyKeys(d.stories[i]).forEach(function (k) { m[k] = 1; }); }); }); return m; }
  function overlapOf(a, b) { var ka = Object.keys(a), kb = Object.keys(b), n = Math.min(ka.length, kb.length), h = 0; if (!n) return 0; ka.forEach(function (k) { if (b[k]) h++; }); return h / n; }
  function dupPlan(pid) {
    var qa = qualityAll(pid), recs = libRecs(pid);
    var list = Object.keys(qa).map(function (id) { return recs[id]; }).filter(function (d) { return d && d.outline && qa[d.id].grade !== 'none'; });
    var keys = {}; list.forEach(function (d) { keys[d.id] = digestKeys(d); });
    var par = {}; list.forEach(function (d) { par[d.id] = d.id; });
    function find(x) { while (par[x] !== x) x = par[x] = par[par[x]]; return x; }
    for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) if (overlapOf(keys[list[i].id], keys[list[j].id]) >= 0.35) par[find(list[i].id)] = find(list[j].id);
    var groups = {}; list.forEach(function (d) { (groups[find(d.id)] = groups[find(d.id)] || []).push(d); });
    var plan = [];
    Object.keys(groups).forEach(function (g) {
      var m = groups[g]; if (m.length < 2) return;
      m.sort(function (a, b) { return (b.exportedAt ? 1 : 0) - (a.exportedAt ? 1 : 0) || qa[b.id].score - qa[a.id].score || b.created - a.created; });
      var keep = m[0], drop = m.slice(1).filter(function (d) { return !d.exportedAt; });
      if (drop.length) plan.push({ keep: keep, drop: drop, qa: qa, keys: keys });
    });
    return plan;
  }
  function libKeepStrongest() {
    var pid = state.profile && state.profile.id; if (!pid) return;
    if (aiBusy()) { toast('Wait until the AI has finished.', 'error'); return; }
    digestSave(); flushDigests();
    var plan = dupPlan(pid), cur = state.digest && state.digest.id;
    plan.forEach(function (g) { g.drop = g.drop.filter(function (d) { return d.id !== cur; }); }); plan = plan.filter(function (g) { return g.drop.length; });
    if (!plan.length) { toast('No overlapping digests. Every unexported digest covers its own stories.', 'success'); return; }
    var msg = [], moved = 0;
    plan.forEach(function (g) {
      var back = 0; g.drop.forEach(function (d) { d.clusters.forEach(function (c) { var k = {}; c.ids.forEach(function (i) { if (d.stories[i]) storyKeys(d.stories[i]).forEach(function (x) { k[x] = 1; }); }); if (overlapOf(k, g.keys[g.keep.id]) < 0.5) back++; }); });
      moved += back;
      msg.push('KEEP: ' + dShort(digestTitle(g.keep), 60) + ' (' + g.qa[g.keep.id].label + ' · ' + g.qa[g.keep.id].score + ')' + (g.keep.exportedAt ? ' [exported]' : '') + '\n' + g.drop.map(function (d) { return '  remove: ' + dShort(digestTitle(d), 60) + ' (' + g.qa[d.id].score + ')'; }).join('\n'));
    });
    if (!confirm('These digests cover the same stories. Keep the strongest, remove the rest:\n\n' + msg.join('\n\n') + '\n\n' + moved + ' section' + (moved === 1 ? '' : 's') + ' with their own stories go back to the Waiting pool. Exported digests are never removed. This cannot be undone.')) return;
    var recs = libRecs(pid);
    plan.forEach(function (g) {
      g.drop.forEach(function (d) {
        var back = d.clusters.filter(function (c) { var k = {}; c.ids.forEach(function (i) { if (d.stories[i]) storyKeys(d.stories[i]).forEach(function (x) { k[x] = 1; }); }); return overlapOf(k, g.keys[g.keep.id]) < 0.5; });
        if (back.length) moveToPool(d, back);
        delete recs[d.id]; idbDel('dg:' + pid + ':' + d.id); try { localStorage.removeItem(recKeyLs(pid, d.id)); } catch (e) {}
      });
    });
    flushDigests(); renderLib(); updateLibPill();
    toast('Kept the strongest of each group. ' + moved + ' section' + (moved === 1 ? '' : 's') + ' returned to the Waiting pool.', 'success');
  }

  function libClearAll() {
    var pid = state.profile && state.profile.id; if (!pid) return;
    if (aiBusy()) { toast('Wait until the AI has finished.', 'error'); return; }
    var recs = libRecs(pid), ids = Object.keys(recs), real = ids.filter(function (i) { return digestHasContent(recs[i]) && !recs[i].pool; }).length, pool = poolCount();
    if (!ids.length) { toast('Nothing to clear.', ''); return; }
    var unex = ids.filter(function (i) { return !recs[i].pool && digestHasContent(recs[i]) && !recs[i].exportedAt; }).length;
    if (!confirm('Start with a clean sheet?\n\nThis deletes ALL ' + real + ' digest' + (real === 1 ? '' : 's') + ' (' + unex + ' not exported yet) and the ' + pool + ' waiting section' + (pool === 1 ? '' : 's') + ', with their text and charts. Your profile, feed and settings stay.\n\nMake sure everything you want is published or copied out first. This cannot be undone.')) return;
    if (!confirm('Last check: delete everything listed above?')) return;
    ids.forEach(function (id) { delete recs[id]; idbDel('dg:' + pid + ':' + id); try { localStorage.removeItem(recKeyLs(pid, id)); } catch (e) {} });
    delete LIB.cur[pid]; state.digest = null; digestLoad(); flushDigests(); closeLib(); afterDigestSwitch('feed');
    toast('Clean sheet. Stories are no longer marked as used, so the next scan offers everything again.', 'success');
  }
  function openLib() { renderLib(); $('#dgs-lib-drawer').hidden = false; }
  function closeLib() { var x = $('#dgs-lib-drawer'); if (x) x.hidden = true; }
  function renderLib() {
    var box = document.getElementById('dgs-lib-list'); if (!box) return; box.innerHTML = '';
    digestEnsure(); var cur = state.digest && state.digest.id, list = libList().filter(function (x) { return !x.pool; });
    var QA = qualityAll(state.profile && state.profile.id);
    var dueEl = document.getElementById('dgs-lib-due');
    if (dueEl) { var dow = new Date().getDay(), isDay = dow === 2 || dow === 5, lastC = libList().filter(function (r) { return r.kind === 'commentary'; }).sort(function (a, b) { return b.created - a.created; })[0], doneToday = lastC && sameDay(lastC.created, Date.now());
      dueEl.textContent = doneToday ? 'Today\'s analysis is written. Next: ' + (dow === 2 ? 'Friday' : 'Tuesday') + '.' : isDay ? 'Today is an analysis day (Tuesday and Friday). Press "Write the analysis".' : 'Analysis days: Tuesday and Friday. Daily bulletins in between.'; }
    if (state.digest && !digestHasContent(state.digest)) list.unshift(state.digest);
    if (!list.length) { box.appendChild(el('p', { class: 'dgs-hint', text: 'Nothing saved yet. Your first digest appears here as soon as you group stories into sections.' })); return; }
    list.forEach(function (d) {
      var st = digestStats(d), isCur = d.id === cur, empty = !digestHasContent(d);
      var item = el('div', { class: 'dgs-lib-item' + (isCur ? ' is-cur' : '') });
      item.appendChild(el('p', { class: 'dgs-lib-title', text: empty ? 'New digest (empty)' : digestTitle(d) }));
      var when = ''; try { when = new Date(d.created).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) {}
      var meta = el('p', { class: 'dgs-lib-meta' }, [el('span', { text: when })]);
      if (d.edition) meta.appendChild(el('span', { class: 'dgs-chip', text: d.edition }));
      if (!empty) {
        meta.appendChild(el('span', { text: st.sections + ' section' + (st.sections === 1 ? '' : 's') + ' · ' + st.stories + ' stories' }));
        meta.appendChild(el('span', { class: 'dgs-chip ' + (st.planned && st.written === st.planned ? 'is-ok' : 'is-muted'), text: st.planned ? st.written + ' of ' + st.planned + ' written' : 'Not planned yet' }));
        if (st.left) meta.appendChild(el('span', { class: 'dgs-chip is-muted', text: st.left + ' left out', title: 'These sections did not fit the article. They stay available as "Not used yet" in the Sections step of a new digest.' }));
        if (d.exportedAt) meta.appendChild(el('span', { class: 'dgs-chip is-ok', text: 'Exported' }));
      }
      if (!empty && QA[d.id]) meta.insertBefore(qualityChip(QA[d.id]), meta.children[1] || null);
      if (isCur) meta.appendChild(el('span', { class: 'dgs-chip is-used', text: 'Open now' }));
      item.appendChild(meta);
      var qq = !empty && QA[d.id];
      if (qq && qq.grade !== 'none' && qq.grade !== 'ready') item.appendChild(el('p', { class: 'dgs-hint', text: 'To fix: ' + qq.reasons.slice(0, 3).join('; ') }));
      var row = el('div', { class: 'dgs-lib-row' });
      if (!isCur) { var ob = el('button', { class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', type: 'button', text: 'Open' }); ob.addEventListener('click', function () { libOpen(d.id); }); row.appendChild(ob); }
      if (!empty) { var db = el('button', { class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', type: 'button', text: 'Delete' }); db.addEventListener('click', function () { libRemove(d.id); }); row.appendChild(db); }
      item.appendChild(row); box.appendChild(item);
    });
  }
  function afterDigestSwitch(step) {
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (eb) {}
    state.selectedStoryIds = {}; cluBusy = outBusy = wrBusy = false;
    renderStories(); updateStepAvailability(); updateLibPill(); renderLib();
    setStep(step);
  }
  function libNew() {
    if (!state.profile) { toast('Create a profile first.', 'error'); return; }
    if (aiBusy()) { toast('Wait until the AI has finished.', 'error'); return; }
    digestEnsure(); var pid = state.profile.id, cur = state.digest;
    if (!digestHasContent(cur)) { closeLib(); setStep('feed'); toast('You are already on an empty digest. Pick stories in the Feed.', ''); return; }
    var unfinished = SIMPLE && digestHasContent(cur) && !cur.kind && !cur.exportedAt;
    if (unfinished && !confirm('Your open draft "' + dShort(digestTitle(cur), 60) + '" is not exported yet.\n\nOK = keep it in the list and start a new bulletin.\nCancel = stay and finish it first.\n\nOne bulletin at a time keeps repeats off the site. Stories already in the draft are marked used in the Feed.')) return;
    digestSave(); flushDigests();
    var d = digestBlank(); libRecs(pid)[d.id] = d; LIB.cur[pid] = d.id; state.digest = d; digestFor = pid;
    closeLib(); afterDigestSwitch('feed');
    toast('New digest started' + (d.edition ? ' (' + d.edition + ')' : '') + '. Stories used before are marked in the Feed.', 'success');
  }
  function libOpen(id) {
    if (aiBusy()) { toast('Wait until the AI has finished.', 'error'); return; }
    var pid = state.profile && state.profile.id, d = libRecs(pid)[id]; if (!d) return;
    digestSave(); flushDigests();
    state.digest = digestNorm(d); LIB.cur[pid] = d.id; digestFor = pid;
    var st = d.step; if (!st || st === 'channel' || st === 'feed') st = d.clusters.length ? 'cluster' : 'feed';
    closeLib(); afterDigestSwitch(st);
    toast('Opened "' + dShort(digestTitle(d), 50) + '".', 'success');
  }
  function libRemove(id) {
    var pid = state.profile && state.profile.id, recs = libRecs(pid), d = recs[id]; if (!d) return;
    if (aiBusy()) { toast('Wait until the AI has finished.', 'error'); return; }
    if (!confirm('Delete the digest "' + dShort(digestTitle(d), 60) + '"? Its written sections and charts are removed. This cannot be undone.')) return;
    delete recs[id]; idbDel('dg:' + pid + ':' + id); try { localStorage.removeItem(recKeyLs(pid, id)); } catch (e) {}
    if (state.digest && state.digest.id === id) { state.digest = null; delete LIB.cur[pid]; digestLoad(); afterDigestSwitch(state.digest.clusters.length ? 'cluster' : 'feed'); }
    else renderLib();
    flushDigests(); toast('Digest deleted.', 'success');
  }
  // ---- What has already been used ----
  function storyKeys(s) {
    var k = [], u = cleanUrl(s.url || ''), t = cleanTitle(s.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
    if (u) k.push('u:' + u); if (t.length > 12) k.push('t:' + t); return k;
  }
  // level 2 = written into a section, level 1 = grouped into a section but not written yet
  function usedMap() {
    var pid = state.profile && state.profile.id, map = {}, cur = state.digest && state.digest.id, recs = libRecs(pid);
    Object.keys(recs).forEach(function (id) {
      var d = recs[id]; if (!digestHasContent(d)) return; var dr = (d.draft && d.draft.sections) || {};
      d.clusters.forEach(function (c) {
        var r = dr[c.id], level = r && r.status === 'done' && r.paras && r.paras.length ? 2 : 1;
        c.ids.forEach(function (sid) {
          var st = d.stories[sid]; if (!st) return;
          storyKeys(st).forEach(function (k) {
            var o = map[k];
            if (!o || level > o.level || (level === o.level && d.created > o.at)) map[k] = { level: level, id: d.id, title: digestTitle(d), at: d.created, edition: d.edition, section: c.title, cur: d.id === cur };
          });
        });
      });
    });
    return map;
  }
  function usedBy(s, map) { var ks = storyKeys(s); for (var i = 0; i < ks.length; i++) if (map[ks[i]]) return map[ks[i]]; return null; }
  function usedElsewhere(u) { return !!(u && !u.cur && u.level === 2); }
  function suggestSections(n) { return n <= 3 ? 1 : n <= 6 ? 2 : n <= 9 ? 3 : n <= 14 ? 4 : n <= 20 ? 5 : 6; }
  function sizeAdvice(n) {
    if (n <= 0) return '';
    if (n === 1) return 'One story is thin for a digest. Add it to an earlier section instead (Sections step, "Earlier sections you can reuse"), or wait for more.';
    if (n <= 3) return 'Enough for a short update of 1 section.';
    if (n <= 6) return 'Enough for a short digest of about 2 sections.';
    if (n <= 11) return 'Enough for a digest of about ' + suggestSections(n) + ' sections.';
    return 'Enough for a full digest of ' + suggestSections(n) + ' to ' + Math.min(6, suggestSections(n) + 1) + ' sections.';
  }
  // ---- Reusing sections from earlier digests ----
  function pinCarried(o) {
    var d = state.digest; if (!o) return o;
    o.sections.forEach(function (x) {
      var c = d.clusters.filter(function (k) { return k.id === x.cid; })[0];
      if (c && c.carried && c.carried.mode === 'asis' && d.draft && d.draft.sections && d.draft.sections[c.id]) { x.heading = c.carried.heading; x.lens = c.carried.lens; }
    });
    return o;
  }
  function carryTokens(c, from) {
    var txt = [c.title, c.thread].concat(c.ids.map(function (id) { var st = from.stories[id]; return st ? cleanTitle(st.title) : ''; })).join(' ');
    var o = {}; uniq(tokenize(txt)).forEach(function (w) { o[w] = 1; }); return o;
  }
  function freshStories() {
    var UM = usedMap(), d = state.digest, inCur = {};
    d.clusters.forEach(function (c) { c.ids.forEach(function (i) { inCur[i] = 1; }); });
    return state.stories.filter(function (x) { return isReadableStory(x) && !usedElsewhere(usedBy(x, UM)) && !inCur[x.id]; });
  }
  function relatedFresh(c, from, fresh) {
    var base = carryTokens(c, from), out = [];
    fresh.forEach(function (f) {
      var toks = uniq(tokenize(cleanTitle(f.title))), shared = toks.filter(function (w) { return base[w]; }).length, minLen = toks.length || 1;
      if (shared >= 3 || (shared >= 2 && shared / minLen >= 0.5)) out.push(f);
    });
    return out;
  }
  // Every section has one status: in a digest (planned or written), or waiting in the pool. A story is "claimed" by a digest
  // when it sits in a section that digest will use. Sections whose stories are claimed elsewhere are not in the pool.
  function activeIn(R, c) {
    if (R.pool) return false; if (!R.outline) return true;
    var os = R.outline.sections.filter(function (x) { return x.cid === c.id; })[0]; return !!(os && os.include);
  }
  function claimMap(excludeId) {
    var pid = state.profile && state.profile.id, recs = libRecs(pid), map = {};
    Object.keys(recs).forEach(function (id) {
      var R = recs[id]; if (R.id === excludeId || R.pool || !digestHasContent(R)) return; var dr = (R.draft && R.draft.sections) || {};
      R.clusters.forEach(function (c) {
        if (!activeIn(R, c)) return; var r = dr[c.id], w = !!(r && r.status === 'done' && r.paras && r.paras.length);
        c.ids.forEach(function (sid) { var st = R.stories[sid]; if (!st) return; storyKeys(st).forEach(function (k) { var o = map[k]; if (!o || (w && !o.written)) map[k] = { id: R.id, title: digestTitle(R), written: w }; }); });
      });
    });
    return map;
  }
  function carryCandidates() {
    var pid = state.profile && state.profile.id, cur = state.digest, out = [], fresh = freshStories(), have = {}, inCur = {}, claims = claimMap(cur.id), recs = libRecs(pid);
    cur.clusters.forEach(function (c) { if (c.carried) have[c.carried.fromId + ':' + c.carried.cid] = 1; c.ids.forEach(function (i) { inCur[i] = 1; }); });
    var now = Date.now(), seen = {};
    var all = Object.keys(recs).map(function (k) { return recs[k]; }).filter(function (R) { return R.id !== cur.id && digestHasContent(R); }).sort(function (a, b) { return (b.created || 0) - (a.created || 0); });
    all.forEach(function (from) {
      var dr = (from.draft && from.draft.sections) || {};
      from.clusters.forEach(function (c) {
        if (have[from.id + ':' + c.id] || !c.ids.length || c.discarded) return;
        var known = c.ids.filter(function (i) { return from.stories[i]; }); if (!known.length) return;
        if (known.every(function (i) { return inCur[i]; })) return;
        var r = dr[c.id], written = !!(r && r.status === 'done' && r.paras && r.paras.length), owner = null;
        if (activeIn(from, c)) owner = { id: from.id, title: digestTitle(from), written: written };
        else {
          var n = 0, hit = 0;
          known.forEach(function (i) { var ks = storyKeys(from.stories[i]), o = null; ks.forEach(function (k) { if (!o && claims[k] && claims[k].id !== from.id) o = claims[k]; }); n++; if (o) { hit++; owner = owner || o; } });
          if (hit / n < 0.5) owner = null;
        }
        var age = now - (c.at || from.created || 0), rel = relatedFresh(c, from, fresh);
        if (!owner) {
          if (age > 72 * 36e5) return;
          var dupN = 0, ks2 = []; known.forEach(function (i) { storyKeys(from.stories[i]).forEach(function (k) { ks2.push(k); }); });
          known.forEach(function (i) { if (storyKeys(from.stories[i]).some(function (k) { return seen[k]; })) dupN++; });
          if (dupN / known.length >= 0.5) return; ks2.forEach(function (k) { seen[k] = 1; });
        } else if (age > 72 * 36e5 && !rel.length) return;
        out.push({ from: from, c: c, r: r, written: written, already: !!owner, owner: owner, rel: rel });
      });
    });
    out.sort(function (a, b) { return (a.already - b.already) || (b.rel.length - a.rel.length) || (b.from.created - a.from.created); });
    return out.filter(function (x) { return !x.already; }).slice(0, 16).concat(out.filter(function (x) { return x.already; }).slice(0, 14));
  }
  function carrySection(cand, mode) {
    var d = state.digest, from = cand.from, c = cand.c, nid = 'c' + Date.now().toString(36) + 'k' + d.clusters.length, ids = c.ids.slice();
    var oSec = from.outline && from.outline.sections.filter(function (x) { return x.cid === c.id; })[0];
    var added = 0, cl;
    if (mode === 'unused') {
      c.ids.forEach(function (id) { if (from.stories[id]) d.stories[id] = JSON.parse(JSON.stringify(from.stories[id])); });
      cl = { id: nid, title: c.title, thread: c.thread || '', ids: ids, at: c.at || from.created };
      if (from.pool) { from.clusters = from.clusters.filter(function (z) { return z !== c; }); queueSave(state.profile.id, from); }
    } else if (mode === 'followup') {
      ids = []; cand.rel.forEach(function (f) { d.stories[f.id] = dStory(f); ids.push(f.id); added++; });
      cl = { id: nid, title: c.title, thread: c.thread || '', ids: ids };
    } else {
      c.ids.forEach(function (id) { if (from.stories[id]) d.stories[id] = JSON.parse(JSON.stringify(from.stories[id])); });
      var meta = { fromId: from.id, cid: c.id, from: digestTitle(from), edition: from.edition || '', at: from.created, mode: mode, heading: (oSec && oSec.heading) || c.title, lens: (oSec && oSec.lens) || 'happened' };
      if (mode === 'update') cand.rel.forEach(function (f) { d.stories[f.id] = dStory(f); ids.push(f.id); added++; });
      cl = { id: nid, title: c.title, thread: c.thread || '', ids: ids, carried: meta };
      if (mode === 'asis') { var rec = JSON.parse(JSON.stringify(cand.r)); rec.sig = wrSig(cl, { lens: meta.lens, heading: meta.heading }); wrDraft().sections[nid] = rec; }
    }
    d.clusters.push(cl);
    if (d.outline) { d.outline = syncOutline(d.outline); }
    d.left = d.left.filter(function (i) { return ids.indexOf(i) === -1; });
    touchDraft(); renderCluster(); updateStepAvailability();
    toast(mode === 'unused' ? 'Added "' + dShort(c.title, 40) + '" to this digest. It has not been written yet.' : mode === 'followup' ? 'Started a follow-up section from ' + added + ' new stor' + (added === 1 ? 'y' : 'ies') + '.' : mode === 'asis' ? 'Reused "' + dShort(c.title, 40) + '" as it was written.' : 'Added ' + added + ' new stor' + (added === 1 ? 'y' : 'ies') + ' to "' + dShort(c.title, 40) + '". It will be rewritten with all sources.', 'success');
  }
  function carryItem(x, buttons) {
    var li = el('li', { class: 'dgs-carry-item' });
    li.appendChild(el('b', { text: x.c.title })); if (x.fit >= 3) li.appendChild(el('span', { class: 'dgs-chip is-ok', text: 'Fits this digest' }));
    var age = ''; try { age = new Date(x.c.at || x.from.created).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) {}
    var where = x.already ? 'In "' + dShort(x.owner.title, 46) + '" (' + (x.owner.written ? 'written' : 'planned, not written yet') + ')' : x.from.pool ? 'Waiting' : 'Left out of "' + dShort(digestTitle(x.from), 46) + '"';
    li.appendChild(el('span', { text: where + ' · ' + age + ' · ' + x.c.ids.length + ' stories' + (x.rel.length ? ' · ' + x.rel.length + ' new related' : '') }));
    var row = el('div', { class: 'dgs-lib-row' });
    buttons.forEach(function (bt) {
      var b = el('button', { class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', type: 'button', text: bt[0] });
      b.addEventListener('click', function () { if (bt[1] === 'discard') { x.c.discarded = true; queueSave(state.profile.id, x.from); renderCluster(); toast('Discarded "' + dShort(x.c.title, 40) + '" from the pool.', ''); } else carrySection(x, bt[1]); });
      row.appendChild(b);
    });
    li.appendChild(row); return li;
  }
  function renderCarry(box) {
    var list = carryCandidates(); if (!list.length) return;
    var un = list.filter(function (x) { return !x.already; }), done = list.filter(function (x) { return x.already; });
    if (un.length) {
      var d1 = el('details', { class: 'dgs-carry' }); d1.open = true;
      d1.appendChild(el('summary', { text: 'Waiting pool (' + un.length + '): not in any digest yet' }));
      d1.appendChild(el('p', { class: 'dgs-hint', text: 'Kept for 3 days. "Plan digests from the pool" uses these. Once a section is in a digest it moves to the list below. Discard what you do not want.' }));
      var bag = {}, dd = state.digest; if (dd) (dd.clusters || []).forEach(function (c) { tokenize(c.title + ' ' + (c.thread || '')).forEach(function (w) { bag[w] = 1; }); c.ids.forEach(function (i) { if (dd.stories[i]) tokenize(dd.stories[i].title).forEach(function (w) { bag[w] = 1; }); }); });
      un.forEach(function (x) { var seen = {}, n = 0; tokenize(x.c.title + ' ' + (x.c.thread || '') + ' ' + x.c.ids.map(function (i) { return x.from.stories[i] ? x.from.stories[i].title : ''; }).join(' ')).forEach(function (w) { if (bag[w] && !seen[w]) { seen[w] = 1; n++; } }); x.fit = n; });
      var thinNow = dd && dd.clusters.length < 3; if (dd && dd.clusters.length) un.sort(function (a, b) { return (b.fit >= 3 ? 1 : 0) - (a.fit >= 3 ? 1 : 0) || b.fit - a.fit; });
      if (thinNow && un.some(function (x) { return x.fit >= 3; })) d1.appendChild(el('p', { class: 'dgs-clu-warn', text: 'This digest has fewer than 3 sections. Waiting sections marked "Fits this digest" share its subject. Use them to fill it out.' }));
      var u1 = el('ul', { class: 'dgs-carry-list' }); un.forEach(function (x) { u1.appendChild(carryItem(x, [['Use in this digest', 'unused'], ['Discard', 'discard']])); }); d1.appendChild(u1); box.appendChild(d1);
    }
    if (done.length) {
      var d2 = el('details', { class: 'dgs-carry' });
      d2.appendChild(el('summary', { text: 'Already in a digest (' + done.length + ')' }));
      d2.appendChild(el('p', { class: 'dgs-hint', text: 'These sections belong to another digest, so they are not repeated here. Where new related stories exist you can start a follow-up from only the new stories.' }));
      var u2 = el('ul', { class: 'dgs-carry-list' }); done.forEach(function (x) { u2.appendChild(carryItem(x, x.rel.length ? [['Follow-up with ' + x.rel.length + ' new ' + (x.rel.length === 1 ? 'story' : 'stories'), 'followup']] : [])); }); d2.appendChild(u2); box.appendChild(d2);
    }
  }
  function libUsage() {
    var n = 0, bytes = 0; var pid = state.profile && state.profile.id;
    libList(pid).forEach(function (d) { n++; try { bytes += JSON.stringify(d).length; } catch (e) {} });
    return { n: n, bytes: bytes };
  }

  function dStory(s) {
    return { id: s.id, title: s.title, source: s.source, url: s.url, summary: String(s.summary || '').slice(0, 300), publishedAt: s.publishedAt, readable: s.readable, verified: !!s.verified, score: s.score || 0 };
  }
  function dRead(s) {
    var live = state.stories.filter(function (x) { return x.id === s.id; })[0];
    if (live) return isReadableStory(live);
    return s.readable !== 'paywalled' && s.readable !== 'thin';
  }
  function dAge(s) {
    var t = Date.parse(s.publishedAt || ''); if (!t) return '';
    var h = (Date.now() - t) / 3.6e6;
    return h < 1 ? 'under 1 h old' : h < 48 ? Math.round(h) + ' h old' : Math.round(h / 24) + ' days old';
  }
  function dShort(t, n) { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
  function dKey() { return state.settings.llmProvider !== 'none' && !!currentLlmKey(); }
  var cluBusy = false, cluRun = 0, outBusy = false, outRun = 0;

  // ---------- Feed overview ----------
  function renderFeedOverview() {
    var box = document.getElementById('dgs-feed-overview'); if (!box) return;
    if (!isDigest() || !state.stories.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false; box.innerHTML = '';
    var L = state.stories;
    var readable = L.filter(isReadableStory).length;
    var fresh = L.filter(function (s) { var h = ageHours(s); return h != null && !isNaN(h) && h <= 24; }).length;
    var outlets = {};
    L.forEach(function (s) { var k = String(s.source || 'News').trim() || 'News'; outlets[k] = (outlets[k] || 0) + 1; });
    var okeys = Object.keys(outlets).sort(function (a, b) { return outlets[b] - outlets[a]; });
    box.appendChild(el('h3', { class: 'dgs-fo-h', text: 'Your feed at a glance' }));
    var grid = el('div', { class: 'dgs-fo-stats' });
    [[L.length, 'stories'], [okeys.length, 'outlets'], [readable, 'readable'], [fresh, 'from the last 24 h']].forEach(function (x) {
      grid.appendChild(el('div', { class: 'dgs-fo-stat' }, [el('strong', { text: String(x[0]) }), el('span', { text: x[1] })]));
    });
    box.appendChild(grid);
    var UMo = (state.profile && state.digest) ? usedMap() : {}, usedN = L.filter(function (x) { return isReadableStory(x) && usedElsewhere(usedBy(x, UMo)); }).length, freshN = readable - usedN;
    if (usedN || libList().length) {
      box.appendChild(el('p', { class: 'dgs-fo-fresh', text: (usedN ? usedN + ' readable stor' + (usedN === 1 ? 'y is' : 'ies are') + ' already in earlier digests. ' : '') + freshN + ' new readable stor' + (freshN === 1 ? 'y' : 'ies') + '. ' + (sizeAdvice(freshN) || 'Nothing new to write about yet. Scan again later, or open an earlier digest.') }));
    }
    var topics = (state.profile && state.profile.topics) || [];
    var counts = topics.map(function (t) { return { name: t.name, n: L.filter(function (s) { return (s.matched || []).indexOf(t.name) !== -1; }).length }; });
    var unmatched = L.filter(function (s) { return !(s.matched || []).length; }).length;
    var top = counts.reduce(function (m, c) { return Math.max(m, c.n); }, Math.max(unmatched, 1));
    var bars = el('div', { class: 'dgs-fo-bars' });
    counts.concat([{ name: 'No topic matched', n: unmatched, dim: true }]).forEach(function (c) {
      var row = el('div', { class: 'dgs-fo-bar' + (c.dim ? ' is-dim' : '') });
      row.appendChild(el('span', { class: 'dgs-fo-bar-name', text: c.name }));
      var track = el('span', { class: 'dgs-fo-bar-track' }); var fill = el('i'); fill.style.width = Math.round(c.n / top * 100) + '%'; track.appendChild(fill);
      row.appendChild(track); row.appendChild(el('span', { class: 'dgs-fo-bar-n', text: String(c.n) }));
      bars.appendChild(row);
    });
    box.appendChild(bars);
    var chips = el('div', { class: 'dgs-chips dgs-fo-outlets' });
    okeys.slice(0, 10).forEach(function (k) { chips.appendChild(el('span', { class: 'dgs-chip is-muted', text: k + ' · ' + outlets[k] })); });
    box.appendChild(chips);
    var hints = [];
    counts.forEach(function (c) { if (c.n <= 1) hints.push('Only ' + c.n + ' stor' + (c.n === 1 ? 'y' : 'ies') + ' matched "' + c.name + '". Add signals to that topic in your profile, or lower its weight.'); });
    if (L.length && readable / L.length < 0.5) hints.push('Over half of the feed is paywalled or link-only, so those stories cannot be used. Add signals that reach open outlets.');
    if (okeys.length && outlets[okeys[0]] / L.length > 0.4) hints.push('Most stories come from ' + okeys[0] + '. A digest reads better with several outlets; broaden the signals.');
    if (L.length && unmatched / L.length > 0.5) hints.push('Over half the stories matched none of your topics. They came in through search only; tighten or add signals.');
    if (hints.length) {
      var hb = el('div', { class: 'dgs-fo-hints' }); hb.appendChild(el('strong', { text: 'What you could change' }));
      var ul = el('ul'); hints.slice(0, 4).forEach(function (h) { ul.appendChild(el('li', { text: h })); }); hb.appendChild(ul);
      var dead = counts.filter(function (c) { return c.n === 0; }).map(function (c) { return c.name; });
      if (dead.length && state.profile) {
        var rb = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost', text: 'Remove the ' + dead.length + ' topic' + (dead.length === 1 ? '' : 's') + ' that found nothing' });
        rb.addEventListener('click', function () {
          state.profile.topics = (state.profile.topics || []).filter(function (t) { return dead.indexOf(t.name) === -1; });
          persistProfile(); hb.remove(); toast('Removed: ' + dead.join(', ') + '. Scan the feed again. Add signals (specific words) to a topic before adding it back.', 'success');
        });
        hb.appendChild(rb);
      }
      box.appendChild(hb);
    }
    var act = el('div', { class: 'dgs-fo-actions' });
    var b1 = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost', text: 'Edit profile and rescan' });
    b1.addEventListener('click', function () { setStep('channel'); var ed = $('#dgs-profile-edit'); if (ed && ed.hidden) { var tg = $('#dgs-edit-toggle'); if (tg) tg.click(); } toast('Change topics or signals, save, then scan the feed again.', ''); });
    var b2 = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost', text: usedN ? 'Select new readable' : 'Select all readable' });
    b2.addEventListener('click', function () {
      L.forEach(function (s) { if (isReadableStory(s) && !usedElsewhere(usedBy(s, UMo))) state.selectedStoryIds[s.id] = true; });
      renderStories(); updateStepAvailability();
    });
    var b3 = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost', text: 'Clear selection' });
    b3.addEventListener('click', function () { state.selectedStoryIds = {}; renderStories(); updateStepAvailability(); });
    act.appendChild(b1); act.appendChild(b2); act.appendChild(b3);
    act.appendChild(el('span', { class: 'dgs-fo-sel', id: 'dgs-fo-sel' }));
    box.appendChild(act);
    updateFoSel();
  }
  function updateFoSel() {
    var n = Object.keys(state.selectedStoryIds).length, s = document.getElementById('dgs-fo-sel');
    if (s) s.textContent = n ? n + ' selected' : 'None selected yet';
  }

  // ---------- Grouping stories into sections ----------
  function tokSet(s) {
    var o = {};
    tokenize(s.title).forEach(function (w) { o[w] = 2; });
    tokenize(String(s.summary || '').slice(0, 300)).forEach(function (w) { if (!o[w]) o[w] = 1; });
    return o;
  }
  function heuristicClusters(list, n) {
    var groups = list.map(function (s) { return { ids: [s.id], t: tokSet(s) }; });
    function sim(a, b) {
      var inter = 0, ka = Object.keys(a.t), kb = Object.keys(b.t);
      ka.forEach(function (k) { if (b.t[k]) inter += Math.min(a.t[k], b.t[k]); });
      return inter / Math.max(2, Math.min(ka.length, kb.length));
    }
    while (groups.length > Math.max(1, n)) {
      var best = null;
      for (var i = 0; i < groups.length; i++) for (var j = i + 1; j < groups.length; j++) {
        var v = sim(groups[i], groups[j]) - (groups[i].ids.length + groups[j].ids.length) * 0.01;
        if (!best || v > best.v) best = { v: v, i: i, j: j };
      }
      var a = groups[best.i], b = groups[best.j];
      b.ids.forEach(function (id) { a.ids.push(id); });
      Object.keys(b.t).forEach(function (k) { a.t[k] = (a.t[k] || 0) + b.t[k]; });
      groups.splice(best.j, 1);
    }
    var byId = {}; list.forEach(function (s) { byId[s.id] = s; });
    groups.sort(function (a, b) { return b.ids.length - a.ids.length; });
    return {
      sections: groups.map(function (g) {
        var words = Object.keys(g.t).sort(function (a, b) { return g.t[b] - g.t[a]; }).slice(0, 3).map(titleCase);
        return { title: words.join(' · ') || 'Section', thread: '', stories: g.ids };
      }),
      left: []
    };
  }
  function clusterPrompt(list, n) {
    var p = state.profile || {};
    var lines = [
      'You are the editor of "' + (p.name || 'a publication') + '", an analyst think tank. Group today\'s stories into sections' + (n ? ' for ONE digest article (about ' + n + ' sections).' : ', and into one or more digest articles.'),
      '',
      'Stories in a section share a thread: the same event, or related events that explain each other (same actor, same pressure, same market, same policy). Stories that are only slightly different still belong together when one idea connects them for this audience.',
      '',
      'RULES:',
      n ? '- Make about ' + n + ' sections (fewer only if there are fewer real threads). Prefer 2 to 6 stories per section; a strong single story may stand alone.' : '- Choose the number of sections yourself: one per real thread, never padding and never merging unrelated threads. Prefer 2 to 6 stories per section; a strong single story may stand alone.',
      n ? '- Put every section in digest 1.' : '- DIGESTS: a digest is ONE article about ONE theme, with 2 to 4 sections. If the stories span unrelated themes, split them into separate digests (at most 4). Each digest needs a theme a reader could search for months from now, such as "Oil prices and the Iran conflict", not today\'s event. If everything fits one theme, return one digest. Never force unrelated stories into one article. Give each section a "digest" number.',
      '- An event covered by three or more outlets is the day\'s story: it must be a section of its own, never left out. Leave out only stories that fit no thread, or that repeat a story already placed.',
      '- IMPACT FIRST. A digest is for what changed the picture: breaking news and stories with consequences for security, war and diplomacy, energy, trade, money, technology or elections. Soft stories (culture, film, art, sport, awards, celebrity, royals, human interest, local events) and low-consequence items go under "left_out", even when several outlets carry them. When there are more threads than fit, keep the ones with the biggest consequences.',
      '- Each story label appears in at most one section. Put weak duplicates and stories that fit no thread under "left_out".',
      '- Use only the labels shown. Never invent a story.',
      '- "title": a plain working title for the thread, at most 8 words, no clickbait.',
      '- "thread": one sentence on what ties the stories together and why it matters to this audience.',
      '', 'PUBLICATION AND AUDIENCE:'
    ].concat(dnaText(p).split('\n'), ['TOPICS: ' + (p.topics || []).map(function (t) { return t.name; }).join(', '), '', 'STORIES:']);
    list.forEach(function (s, i) {
      lines.push('[S' + (i + 1) + '] ' + dShort(cleanTitle(s.title), 140) + ' (' + dShort(s.source, 30) + (dAge(s) ? ', ' + dAge(s) : '') + ')' + (s.summary ? ' - ' + dShort(s.summary, 200) : ''));
    });
    lines.push('', 'Return STRICT JSON only: {"digests":[{"n":1,"title":"...","angle":"one sentence on the analytical question this digest answers"}],"sections":[{"title":"...","thread":"...","stories":["S1","S4"],"digest":1}],"left_out":["S7"]}');
    return lines.join('\n');
  }
  // The AI sometimes leaves out the day's biggest event. Stories left out that cover the same event become a section of their own.
  function rescueLeft(left, out, themes) {
    if (left.length < 2) return [];
    var toks = left.map(function (s) { var t = {}; tokenize(cleanTitle(s.title)).forEach(function (w) { t[w] = 1; }); return t; }), par = left.map(function (s, i) { return i; });
    function find(i) { while (par[i] !== i) i = par[i]; return i; }
    function sim(a, b) { var ka = Object.keys(a), n = 0; ka.forEach(function (k) { if (b[k]) n++; }); return n / Math.max(3, Math.min(ka.length, Object.keys(b).length)); }
    for (var i = 0; i < left.length; i++) for (var j = i + 1; j < left.length; j++) if (sim(toks[i], toks[j]) >= 0.4) par[find(j)] = find(i);
    var groups = {}; left.forEach(function (s, i) { var r = find(i); (groups[r] = groups[r] || []).push(s); });
    var moved = [];
    Object.keys(groups).forEach(function (k) {
      var g = groups[k], outlets = {}; g.forEach(function (s) { outlets[s.source || s.id] = 1; });
      if (g.length < 2 || Object.keys(outlets).length < 2) return;
      out.unshift({ title: dShort(cleanTitle(g[0].title), 80), thread: 'The same event, reported by ' + Object.keys(outlets).length + ' outlets.', stories: g.map(function (s) { return s.id; }), digest: themes.length ? themes[0].n : 1 });
      g.forEach(function (s) { moved.push(s.id); });
    });
    return moved;
  }
  function clusterWithLlm(list, n, prompt) {
    return callLLM(prompt || clusterPrompt(list, n), 'write', { best: true }).then(function (r) {
      var j = extractJson(r.text), raw = (j && j.sections) || [];
      var map = {}; list.forEach(function (s, i) { map['S' + (i + 1)] = s.id; });
      var used = {}, out = [];
      raw.forEach(function (c) {
        var ids = [];
        (c && c.stories || []).forEach(function (l) { var id = map[String(l).replace(/[^S0-9]/g, '')]; if (id && !used[id]) { used[id] = 1; ids.push(id); } });
        if (ids.length) out.push({ title: dShort(c.title || 'Section', 90), thread: dShort(c.thread || '', 240), stories: ids, digest: n ? 1 : (parseInt(c.digest, 10) || 1) });
      });
      var themes = []; (n ? [] : (Array.isArray(j.digests) ? j.digests : [])).forEach(function (t) { var k = parseInt(t && t.n, 10); if (k && out.some(function (c) { return c.digest === k; }) && !themes.some(function (x) { return x.n === k; })) themes.push({ n: k, title: dShort(plainDashes(String(t.title || '')), 90) || 'Digest ' + k, angle: dShort(plainDashes(String(t.angle || '')), 200) }); });
      out.forEach(function (c) { if (!themes.some(function (x) { return x.n === c.digest; })) { if (themes.length) c.digest = themes[0].n; else themes.push({ n: c.digest, title: '', angle: '' }); } });
      out.sort(function (a, b) { return a.digest - b.digest; });
      if (!out.length) throw new Error('The AI returned no usable sections.');
      var left = list.filter(function (s) { return !used[s.id]; }), rescued = rescueLeft(left, out, themes);
      return { sections: out, left: left.filter(function (s) { return rescued.indexOf(s.id) === -1; }).map(function (s) { return s.id; }), themes: themes };
    });
  }
  var BULLETIN_MAX = 4;
  var SOFT_RX = /\b(festival|documentary|marathon|award|awards|wins best|van gogh|art market|concert|celebrity|prince|princess|royal|oscars?|grammy|football|soccer|olympic|tennis|recipe|fashion)\b/i;
  function runClustering() {
    var list = selectedList().filter(function (s) { return !unusableOf(s); });
    if (!list.length) { toast('Select stories in the Feed first.', 'error'); return Promise.resolve(false); }
    if (cluBusy) return Promise.resolve(false);
    cluBusy = true; var mine = ++cluRun; paintClu();
    var d = state.digest, n = d.sectionsAuto ? 0 : Math.max(1, Math.min(8, parseInt(d.sections, 10) || 4)), nLocal = n || suggestSections(list.length);
    var keep = d.clusters.filter(function (c) { return c.carried; }), keepIds = {}; keep.forEach(function (c) { c.ids.forEach(function (i) { keepIds[i] = 1; }); });
    list = list.filter(function (x) { return !keepIds[x.id]; });
    if (!list.length) { cluBusy = false; paintClu(); toast('Every selected story already sits in a carried section.', 'error'); return Promise.resolve(false); }
    list.forEach(function (s) { d.stories[s.id] = dStory(s); });
    var p = dKey() ? clusterWithLlm(list, n).catch(function (e) {
      LOG('digest grouping: AI failed:', e && e.message);
      toast('The AI could not group the stories (' + dShort(e && e.message, 120) + '). Used a simple word-overlap grouping instead; edit it below.', 'error');
      return null;
    }) : Promise.resolve(null);
    return p.then(function (res) {
      if (mine !== cluRun) return false;
      var how = 'ai';
      if (!res) { res = heuristicClusters(list, nLocal); how = 'local'; }
      cluBusy = false;
      var hadOutline = !!d.outline;
      var keptDraft = {}; keep.forEach(function (c) { var r = d.draft && d.draft.sections && d.draft.sections[c.id]; if (r) keptDraft[c.id] = r; });
      var secs = res.sections.slice(), dropped = [];
      if (SIMPLE && d.sectionsAuto && secs.length > BULLETIN_MAX) {
        var srcOf = {}; list.forEach(function (x) { srcOf[x.id] = x.source || x.id; });
        secs.forEach(function (c) { var o = {}; c.stories.forEach(function (i) { o[srcOf[i] || i] = 1; }); c.rank = Object.keys(o).length * 10 + c.stories.length; var soft = c.stories.every(function (i) { return SOFT_RX.test(list.filter(function (x) { return x.id === i; }).map(function (x) { return x.title; }).join(' ')); }); if (soft) c.rank -= 40; });
        var order = secs.slice().sort(function (a, b) { return b.rank - a.rank; }), top = order.slice(0, BULLETIN_MAX);
        order.slice(BULLETIN_MAX).forEach(function (c) { dropped = dropped.concat(c.stories); });
        secs = secs.filter(function (c) { return top.indexOf(c) !== -1; });
      }
      d.clusters = keep.concat(secs.map(function (c, i) { return { id: 'c' + Date.now().toString(36) + i, title: c.title, thread: c.thread, ids: c.stories.slice(), theme: 1 }; }));
      d.themes = []; d.themeTitle = ''; d.themeAngle = '';
      d.left = (res.left || []).concat(dropped); d.how = how; d.outline = null; d.draft = Object.keys(keptDraft).length ? { sections: keptDraft, frame: null } : null; d.review = null;
      digestSave(); renderCluster(); updateStepAvailability();
      toast((how === 'ai' ? 'Grouped ' : 'Grouped (no AI) ') + list.length + ' stories into ' + d.clusters.length + ' sections.' + (d.left.length && SIMPLE ? ' The strongest ' + d.clusters.length + ' threads made the bulletin; ' + d.left.length + ' stories are kept: press "Make a second digest" under the left-out list.' : '') + (hadOutline ? ' The outline was reset.' : ''), 'success');
      return true;
    });
  }
  function paintClu() {
    var pr = document.getElementById('dgs-clu-prog'); if (pr) { pr.hidden = !cluBusy; var lb = pr.querySelector('.dgs-clu-prog-label'); if (lb) lb.textContent = 'Grouping ' + selectedList().length + ' stories into sections…'; }
    var go = document.getElementById('dgs-clu-run'), st = document.getElementById('dgs-clu-stop');
    if (go) { go.disabled = cluBusy; go.textContent = state.digest.clusters.length ? 'Group again' : 'Group stories into sections'; setLead(go, !state.digest.clusters.length); }
    if (st) st.hidden = !cluBusy;
    var sg = document.getElementById('dgs-clu-suggest'); if (sg) { sg.hidden = SIMPLE || (state.digest.clusters.length < 2 && !poolCount()); sg.disabled = cluBusy || thBusy; sg.textContent = thBusy ? 'Planning…' : 'Plan digests from the pool'; }
  }
  function allClusterIds() {
    var d = state.digest, out = d.left.slice();
    d.clusters.forEach(function (c) { c.ids.forEach(function (id) { out.push(id); }); });
    return out;
  }
  function moveStory(id, to) {
    var d = state.digest;
    d.clusters.forEach(function (c) { c.ids = c.ids.filter(function (x) { return x !== id; }); });
    d.left = d.left.filter(function (x) { return x !== id; });
    if (to === '__left') d.left.push(id);
    else if (to === '__new') d.clusters.push({ id: 'c' + Date.now().toString(36) + d.clusters.length, title: dShort(cleanTitle((d.stories[id] || {}).title), 60) || 'New section', thread: '', ids: [id] });
    else { var c = d.clusters.filter(function (x) { return x.id === to; })[0]; if (c) c.ids.push(id); else d.left.push(id); }
    d.clusters = d.clusters.filter(function (c) { return c.ids.length; });
    d.outline = d.outline ? syncOutline(d.outline) : null;
    touchDraft(); renderCluster(); updateStepAvailability();
  }

  // ---------- Commentary (twice a week): the analyst's own view, not a recap ----------
  var weeklyBusy = false, thBusy = false;
  function dayLabel(t) { try { return new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' }); } catch (e) { return ''; } }
  function dailyMaterial(src) {
    return src.map(function (r, i) {
      var fr = (r.draft && r.draft.frame) || {}, lines = ['DAILY ' + (i + 1) + ' (' + dayLabel(r.created) + '): ' + digestTitle(r), 'Summary: ' + dShort(fr.summary || '', 500)];
      r.outline.sections.filter(function (os) { return os.include; }).forEach(function (os) {
        var rr = r.draft.sections[os.cid]; if (!rr || rr.status !== 'done') return;
        lines.push('- Section: ' + os.heading, '  Reported: ' + dShort((rr.paras || []).join(' '), 260), '  Our read: ' + dShort(rr.reading || '', 760));
      });
      (fr.watch || []).forEach(function (w) { lines.push('  Watch: ' + dShort(w, 200)); });
      return lines.join('\n');
    }).join('\n\n');
  }
  function commentaryPrompt(material, only) {
    var p = state.profile || {};
    var head = ['You are the lead analyst of "' + (p.name || 'a publication') + '", a think tank. You write its COMMENTARY, published twice a week: the publication\'s own view on what the latest daily digests add up to. It is NOT a recap. Readers already have the dailies for the events; do not retell them. The commentary says what they mean together.', THINK, '',
      'VOICE:'].concat(dnaText(p).split('\n'), ['', 'MATERIAL (our own daily digests; the only source of facts):', material, '']);
    var rules = ['RULES:', '- Every fact, number, name and date must come from the MATERIAL. Add no background from memory and no history. Mark reasoning as reasoning ("likely", "points to"). No predictions stated as fact. Never imply motives the material does not report.',
      '- Argue, do not summarise. Each argument connects at least two of the dailies and says something none of them said alone: a pattern, a tension, a dependency, a thing that does not add up.',
      '- Plain, specific sentences. No filler openers, no summary closer. No em dashes.'];
    if (only) return head.concat(rules, ['', 'REWRITE ONLY THIS ARGUMENT: "' + only.heading + '".', 'Current text:', only.text, '', 'Improve it: sharper claim, stronger counterargument, a concrete signal that would change our mind. 220 to 320 words in 3 paragraphs separated by a blank line.', 'Return STRICT JSON only: {"paragraphs":["...","...","..."]}']).join('\n');
    return head.concat(rules, ['',
      'WRITE (strict JSON, no other text):',
      '- "headline": at most 70 characters, the lasting question or thesis, words a reader could search.',
      '- "summary": our verdict, at most 90 words, answer-first, taking a position.',
      kpRule('frame'),
      '- "opening": 1 to 2 sentences that open the piece.',
      '- "arguments": 2 or 3 objects {"heading": at most 8 words, "body": 220 to 320 words in 3 paragraphs separated by a blank line (the claim; the mechanism and the strongest counterargument; what would change our mind, with a concrete signal), "from": [daily numbers used]}.',
      '- "scorecard": up to 5 objects {"daily": number, "read": our earlier read in one plain sentence, "status": "held" or "weakened" or "still open", "why": one sentence}. Judge a read only from what LATER dailies in the material show; if nothing bears on it, "still open". Never call a read held without evidence in the material.',
      '- "watch": 3 concrete signals for the coming days (a data release, a decision, a number to compare).',
      '', 'Return: {"headline":"","summary":"","opening":"","arguments":[],"scorecard":[],"watch":[]}']).join('\n');
  }
  function libCommentary() {
    if (!state.profile) { toast('Create a profile first.', 'error'); return; }
    if (aiBusy() || weeklyBusy) { toast('Wait until the AI has finished.', 'error'); return; }
    if (!dKey()) { toast('Commentary needs an AI key. Add one under API keys.', 'error'); return; }
    digestEnsure(); var pid = state.profile.id, now = Date.now(), all = libList(pid);
    var last = all.filter(function (r) { return r.kind === 'commentary'; }).sort(function (a, b) { return b.created - a.created; })[0];
    var since = Math.max(last ? last.created : 0, now - 5 * 864e5);
    var src = all.filter(function (r) { return !r.kind && !r.pool && r.outline && r.created > since && digestStats(r).written > 0; }).sort(function (a, b) { return a.created - b.created; }).slice(-6);
    if (src.length < 2) { toast('Commentary needs at least 2 written daily digests since the last one. You have ' + src.length + '. Publish about two commentaries a week.', 'error'); return; }
    digestSave(); flushDigests();
    var material = dailyMaterial(src);
    weeklyBusy = true; var wb = document.getElementById('dgs-lib-weekly'); if (wb) { wb.disabled = true; wb.textContent = 'Writing…'; }
    toast('Reading ' + src.length + ' daily digests and writing the commentary. This takes a minute.', '');
    callLLM(commentaryPrompt(material), 'write', { best: true }).then(function (r) {
      weeklyBusy = false; if (wb) { wb.disabled = false; wb.textContent = 'Write the analysis'; }
      var j = extractJson(r.text) || {}, args = (Array.isArray(j.arguments) ? j.arguments : []).filter(function (a) { return a && String(a.body || '').length > 400; }).slice(0, 3);
      if (!args.length) { toast('The AI did not return a usable commentary. Try again.', 'error'); return; }
      var nd = digestBlank(); nd.kind = 'commentary'; nd.edition = 'Analyst commentary'; nd.sectionsAuto = true; nd.cm = { material: dShort(material, 26000), at: now };
      var storyIds = function (i) { var r0 = src[i - 1], out = []; if (!r0) return out; r0.outline.sections.filter(function (os) { return os.include; }).forEach(function (os) { var c0 = r0.clusters.filter(function (z) { return z.id === os.cid; })[0]; if (c0) c0.ids.slice(0, 4).forEach(function (id) { if (r0.stories[id]) { nd.stories[id] = r0.stories[id]; out.push(id); } }); }); return out; };
      var corpus = material + '\n' + src.map(function (r0) { return Object.keys(r0.stories).map(function (k) { return r0.stories[k].title + ' ' + (r0.stories[k].summary || ''); }).join('\n'); }).join('\n');
      var lensOrder = ['hidden', 'second', 'contrarian'], osec = [], dr = { sections: {}, frame: null };
      var mk = function (title, lens, from, paras) {
        var ids = []; from.forEach(function (n) { storyIds(parseInt(n, 10)).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); }); }); ids = ids.slice(0, 14);
        var c = { id: 'c' + Date.now().toString(36) + nd.clusters.length, title: dShort(plainDashes(title), 80), thread: '', ids: ids, theme: 1 }; nd.clusters.push(c);
        var sec = { cid: c.id, heading: c.title, lens: lens, why: '', include: true }; osec.push(sec);
        var seenSrc = {}, srcs = []; ids.forEach(function (id) { var st = nd.stories[id]; if (st && !seenSrc[st.source] && srcs.length < 6) { seenSrc[st.source] = 1; srcs.push({ source: st.source, title: st.title, url: st.url }); } });
        var rec = { sig: wrSig(c, sec), at: Date.now(), status: 'done', paras: paras.map(plainDashes), reading: '', sources: srcs, checks: null, note: '', edited: false, revised: false, thin: false, model: r.model };
        rec.checks = checkText(rec.paras.join('\n\n'), corpus); dr.sections[c.id] = rec;
      };
      args.forEach(function (a, i) { mk(String(a.heading || 'Argument ' + (i + 1)), lensOrder[i % 3], Array.isArray(a.from) && a.from.length ? a.from : src.map(function (x, k) { return k + 1; }), String(a.body).split(/\n{2,}/).map(function (z) { return z.trim(); }).filter(Boolean)); });
      var sc = (Array.isArray(j.scorecard) ? j.scorecard : []).filter(function (x) { return x && x.read && x.daily && src[parseInt(x.daily, 10) - 1]; }).slice(0, 5);
      if (sc.length >= 2) {
        var lab = { held: 'Held', weakened: 'Weakened', 'still open': 'Still open' };
        mk('How our earlier reads held up', 'scorecard', sc.map(function (x) { return x.daily; }), sc.map(function (x) { return dayLabel(src[parseInt(x.daily, 10) - 1].created) + ': ' + String(x.read).trim().replace(/[.\s]+$/, '') + '. ' + (lab[String(x.status).toLowerCase()] || 'Still open') + '. ' + String(x.why || '').trim(); }));
      }
      var watch = (Array.isArray(j.watch) ? j.watch : []).map(function (x) { return plainDashes(cleanFrameText(x, 40)); }).filter(function (x) { return x && x.length > 25; }).slice(0, 4);
      dr.frame = { summary: plainDashes(cleanFrameText(j.summary, 95)), opening: plainDashes(cleanFrameText(j.opening, 60)), watch: watch, at: Date.now() };
      nd.draft = dr; var hl = dShort(plainDashes(String(j.headline || osec[0].heading)), 90);
      nd.outline = { headlines: [hl], headline: hl, opening: dr.frame.opening, summary: true, watch: true, local: false, sections: osec };
      libRecs(pid)[nd.id] = nd; LIB.cur[pid] = nd.id; state.digest = nd; digestFor = pid; digestSave(); flushDigests();
      closeLib(); afterDigestSwitch('write');
      toast('Commentary drafted from ' + src.length + ' daily digests. Read every line: this is your voice. Edit it, add your analyst\'s note in Review, then export.', 'success');
    }).catch(function (e) { weeklyBusy = false; if (wb) { wb.disabled = false; wb.textContent = 'Write the analysis'; } toast('Could not write the commentary (' + dShort(e && e.message, 100) + ').', 'error'); });
  }
  function commentaryWrite(c, s, stop) {
    var d = state.digest, old = d.draft && d.draft.sections && d.draft.sections[c.id], rec = old || { sources: [], paras: [] };
    if (s.lens === 'scorecard' || !d.cm) { rec.status = 'done'; rec.sig = wrSig(c, s); rec.note = s.lens === 'scorecard' ? 'The scorecard is rebuilt when you create a new commentary. Edit it here by hand.' : 'The source material is not saved with this commentary. Edit by hand.'; touchDraft(); paintWrite(); return Promise.resolve(); }
    var prev = rec.paras.join('\n\n'); rec.status = 'writing'; wrDraft().sections[c.id] = rec; paintWrite();
    return callLLM(commentaryPrompt(d.cm.material, { heading: s.heading, text: prev }), 'write', { best: true }).then(function (r) {
      if (stop()) throw new Error('stopped');
      var pp = parseParas(r.text); if (pp.paras.length) { rec.paras = pp.paras.map(plainDashes); rec.edited = false; rec.model = r.model; }
      rec.reading = ''; rec.sig = wrSig(c, s); rec.at = Date.now(); rec.status = 'done'; rec.checks = checkText(rec.paras.join('\n\n'), d.cm.material);
    }).catch(function (e) { if (e && e.message === 'stopped') { rec.status = 'stopped'; return; } rec.status = 'failed'; rec.note = 'The AI could not rewrite this argument: ' + dShort(e && e.message, 140); }).then(function () { touchDraft(); paintWrite(); });
  }

  // ---------- Spoken script (YouTube or podcast) ----------
  function scriptPrompt() {
    var p = state.profile || {}, d = state.digest;
    return ['You write the spoken script for a short YouTube or podcast monologue by the analyst behind "' + pubName() + '". It is built from the finished article below. It must sound like a person thinking out loud, not like an article read aloud.', THINK, '',
      'VOICE:', dnaText(p), '',
      'THE ARTICLE (the only source of facts; paragraphs marked "Our read" are our own analysis):', dShort(draftMarkdown(), 14000), '',
      noteText(d) ? 'THE ANALYST\'S OWN NOTE (keep this point of view in the script): ' + noteText(d) : '', '',
      'RULES:', d.kind === 'commentary' ? '- 1500 to 1900 words, which is about 10 to 12 minutes spoken, for a long-form video or podcast episode.' : '- 650 to 850 words, which is about 5 minutes spoken.',
      '- Open with a hook in the first 10 seconds: the tension or question, never "welcome to". State the thesis within 20 seconds.',
      '- Then three points, each: the claim, the evidence in a sentence or two, what it means. Then what would change our mind. Then the one signal to watch and one closing line. No "like and subscribe".',
      '- Short spoken sentences. Round numbers the way people say them ("about four percent"). Name an outlet at most twice, only when it matters. Never read a list of sources.',
      '- Use only facts from the article. No new facts, no invented quotes, no predictions stated as fact. Mark reasoning as reasoning.',
      '- No stage directions, no bracketed notes, no headings in the script; use blank lines between beats. No em dashes.', '',
      'Also write: "title" (at most 70 characters, a question or a claim a viewer would click) and "description" (2 to 3 sentences plus the line "Read the full analysis: [link]").',
      d.kind === 'commentary' ? 'Also write "chapters": 5 to 7 chapter titles in order, each at most 6 words, matching the beats of the script, and "thumb": at most 5 words of thumbnail text.' : '',
      'Return STRICT JSON only: {"title":"...","description":"...","script":"..."' + (d.kind === 'commentary' ? ',"chapters":["..."],"thumb":"..."' : '') + '}'].join('\n');
  }
  function genScript() {
    var d = state.digest; if (!d || !d.outline) return;
    if (!dKey()) { toast('Add an AI key under API keys first.', 'error'); return; }
    if (wrBusy || scBusy) return; scBusy = true; var b = document.getElementById('dgs-sc-run'); if (b) { b.disabled = true; b.textContent = 'Writing…'; }
    callLLM(scriptPrompt(), 'write', { best: true }).then(function (r) {
      var j = extractJson(r.text) || {}, sc = String(j.script || '').trim(); if (sc.length < 400) throw new Error('The script came back too short. Try again.');
      d.script = { title: plainDashes(String(j.title || '')), description: plainDashes(String(j.description || '')), text: plainDashes(sc), at: Date.now(), chapters: (Array.isArray(j.chapters) ? j.chapters : []).map(function (x) { return plainDashes(String(x)).slice(0, 60); }).slice(0, 8), thumb: plainDashes(String(j.thumb || '')).slice(0, 40) }; digestSave(); paintScript();
    }).catch(function (e) { toast('Could not write the script (' + dShort(e && e.message, 100) + ').', 'error'); }).then(function () { scBusy = false; if (b) { b.disabled = false; b.textContent = 'Write the script again'; } });
  }
  var scBusy = false;
  function paintScript() {
    var t = document.getElementById('dgs-sc-text'), d = state.digest, meta = document.getElementById('dgs-sc-meta'), b = document.getElementById('dgs-sc-run'); if (!t || !d) return;
    var sc = d.script; t.hidden = !sc; if (meta) { meta.hidden = !sc; meta.textContent = sc ? 'Title: ' + sc.title + '\nDescription: ' + sc.description + (sc.chapters && sc.chapters.length ? '\nChapters: ' + sc.chapters.map(function (x, i) { return (i + 1) + '. ' + x; }).join('  ') : '') + (sc.thumb ? '\nThumbnail text: ' + sc.thumb : '') + '\nAbout ' + Math.round((sc.text || '').split(/\s+/).length / 150 * 10) / 10 + ' minutes spoken.' : ''; }
    if (document.activeElement !== t) t.value = sc ? sc.text : ''; if (b && !scBusy) b.textContent = sc ? 'Write the script again' : 'Write the script';
  }
  // A digest must be a real article: at least 2 sections and 5 stories. Thinner groups fold into the biggest digest.
  function foldThin(cs, th) {
    if (!th.length) return th;
    var cnt = function (n) { return cs.filter(function (c) { return (c.theme || 1) === n; }).length; };
    var sto = function (n) { return cs.filter(function (c) { return (c.theme || 1) === n; }).reduce(function (a, c) { return a + c.ids.length; }, 0); };
    if (cs.length <= 3) { th = th.slice(0, 1); cs.forEach(function (c) { c.theme = th[0].n; }); }
    var guard = 0; while (th.length > 1 && guard++ < 6) {
      var small = th.filter(function (t) { return cnt(t.n) < 2 || sto(t.n) < 5; }).sort(function (a, b) { return sto(a.n) - sto(b.n); })[0]; if (!small) break;
      var big = th.filter(function (t) { return t !== small; }).sort(function (a, b) { return sto(b.n) - sto(a.n); })[0];
      cs.forEach(function (c) { if ((c.theme || 1) === small.n) c.theme = big.n; }); th = th.filter(function (t) { return t !== small; });
    }
    var map = {}; th.forEach(function (t, i) { map[t.n] = i + 1; });
    cs.forEach(function (c) { c.theme = map[c.theme || 1] || 1; }); th.forEach(function (t) { t.n = map[t.n]; });
    return th;
  }
  // The pool: every unpublished section (the ones on screen plus leftovers from earlier digests). One plan turns it into digests.
  function poolRec(pid, create) {
    var recs = libRecs(pid), k = Object.keys(recs).filter(function (i) { return recs[i].pool; })[0];
    if (k) return recs[k]; if (!create) return null;
    var r = digestBlank(); r.pool = true; r.themeTitle = 'Waiting sections'; r.created = Date.now(); recs[r.id] = r; return r;
  }
  function moveToPool(d, list) {
    var pid = state.profile && state.profile.id, rec = poolRec(pid, true), ids = [];
    list.forEach(function (c) {
      c.ids.forEach(function (id) { ids.push(id); if (d.stories[id]) rec.stories[id] = JSON.parse(JSON.stringify(d.stories[id])); });
      if (rec.clusters.some(function (x) { return x.ids[0] === c.ids[0]; })) return;
      rec.clusters.push({ id: c.id, title: c.title, thread: c.thread || '', ids: c.ids.slice(), at: c.at || d.created });
    });
    d.sibIds = (d.sibIds || []).concat(ids); queueSave(pid, rec);
  }
  function adoptCand(x, theme) {
    var d = state.digest, from = x.from, c = x.c, nid = 'c' + Date.now().toString(36) + 'p' + d.clusters.length + Math.floor(Math.random() * 99);
    c.ids.forEach(function (id) { if (from.stories[id]) d.stories[id] = JSON.parse(JSON.stringify(from.stories[id])); });
    var cl = { id: nid, title: c.title, thread: c.thread || '', ids: c.ids.slice(), theme: theme, at: c.at || from.created };
    d.clusters.push(cl); d.left = d.left.filter(function (i) { return c.ids.indexOf(i) === -1; });
    if (from.pool) { from.clusters = from.clusters.filter(function (z) { return z !== c; }); queueSave(state.profile.id, from); }
    return cl;
  }
  function poolCount() { try { return carryCandidates().filter(function (x) { return !x.already; }).length; } catch (e) { return 0; } }
  function suggestDigests(quiet) {
    var d = state.digest; if (thBusy) return Promise.resolve(false);
    var pool = []; try { pool = carryCandidates().filter(function (x) { return !x.already; }); } catch (e0) {}
    var cs = d.clusters; if (cs.length + pool.length < 2) { if (!quiet) toast('Nothing to plan yet. Group some stories first.', ''); return Promise.resolve(false); }
    if (!dKey()) { if (!quiet) toast('Add an AI key in Settings to plan digests.', 'error'); return Promise.resolve(false); }
    thBusy = true; paintClu(); var mine = d.id, p = state.profile || {};
    var items = cs.map(function (c) { return { c: c, ids: c.ids, st: d.stories, cur: true }; }).concat(pool.map(function (x) { return { c: x.c, ids: x.c.ids, st: x.from.stories, cand: x }; }));
    var lines = ['You are the editor of "' + (p.name || 'a publication') + '", an analyst think tank. Plan digest articles from the pool of unpublished sections below. A digest is built from sections that answer one lasting question or a few adjacent ones; our analysis connects them.', '',
      'RULES:', '- Group by relevance. A digest takes as many sections as are really related or adjacent: usually 3 to 6, never more than 7. Split into separate digests only when the themes truly diverge (for example energy and bond markets versus military and diplomacy).',
      '- Do not build a catch-all digest to hold unrelated sections. A section that fits no theme, especially one story from one outlet, goes to "waiting"; it stays in the pool for later.',
      '- Every digest needs at least 2 sections. Use each section number at most once. Do not invent sections.',
      '- "title": the lasting theme, at most 10 words. "angle": one sentence on the analytical question the digest answers.', '', 'PUBLICATION: ' + (p.name || '')].concat(dnaText(p).split('\n'), ['', 'SECTIONS IN THE POOL:']);
    items.forEach(function (it, i) { var src = {}; it.ids.forEach(function (id) { var st = it.st[id]; if (st) src[st.source] = 1; }); lines.push((i + 1) + '. ' + it.c.title + (it.c.thread ? ' - ' + dShort(it.c.thread, 200) : '') + ' (' + it.ids.length + ' stories, ' + Object.keys(src).length + ' outlets' + (it.cand ? ', left over from an earlier digest' : '') + ')'); });
    lines.push('', 'Return STRICT JSON only: {"digests":[{"n":1,"title":"...","angle":"...","sections":[1,3,4]}],"waiting":[2,5]}');
    return callLLM(lines.join('\n'), 'write', { best: true }).then(function (r) {
      thBusy = false; if (!state.digest || state.digest.id !== mine) return false;
      var j = extractJson(r.text) || {}, arr = Array.isArray(j.digests) ? j.digests : [], th = [], assign = {};
      arr.forEach(function (t) {
        var secs = ((t && t.sections) || []).map(function (x) { return parseInt(x, 10) - 1; }).filter(function (i) { return items[i] && assign[i] === undefined; }).slice(0, 7);
        var st = secs.reduce(function (a, i) { return a + items[i].ids.length; }, 0);
        if (!(secs.length >= 2 ? st >= 4 : st >= 6)) return;
        var n = th.length + 1; secs.forEach(function (i) { assign[i] = n; });
        th.push({ n: n, title: dShort(plainDashes(String(t.title || '')), 90), angle: dShort(plainDashes(String(t.angle || '')), 220) });
      });
      if (!th.length) { d.themes = []; paintClu(); if (!quiet) toast('No strong theme found in this pool yet. Everything stays together here; remove what does not belong.', ''); return true; }
      var waitCur = [];
      cs.forEach(function (c, i) { if (assign[i] === undefined) waitCur.push(c); else c.theme = assign[i]; });
      items.forEach(function (it, i) { if (it.cand && assign[i] !== undefined) adoptCand(it.cand, assign[i]); });
      if (waitCur.length) { moveToPool(d, waitCur); d.clusters = d.clusters.filter(function (c) { return waitCur.indexOf(c) === -1; }); }
      d.clusters.sort(function (a, b) { return (a.theme || 1) - (b.theme || 1); });
      d.outline = d.outline ? syncOutline(d.outline) : null;
      var nw = items.filter(function (it, i) { return assign[i] === undefined; }).length;
      if (th.length > 1) { d.themes = th; d.themeTitle = ''; } else { d.themes = []; d.themeTitle = th[0].title; d.themeAngle = th[0].angle; }
      digestSave(); flushDigests(); renderCluster(); updateStepAvailability();
      toast(th.length > 1 ? 'Planned ' + th.length + ' digests from the pool. Press Split to save them separately.' : 'One digest: "' + dShort(th[0].title, 50) + '".' , 'success');
      if (nw) toast(nw + (nw === 1 ? ' section waits' : ' sections wait') + ' in the pool for later (kept for 3 days).', '');
      return true;
    }).catch(function (e) { thBusy = false; paintClu(); if (!quiet) toast('Could not plan digests (' + dShort(e && e.message, 100) + ').', 'error'); return false; });
  }
  function splitDigests(silent) {
    var d = state.digest, pid = state.profile && state.profile.id, th = d.themes || [];
    if (!pid || th.length < 2) return; if (aiBusy()) { toast('Wait until the AI has finished.', 'error'); return; }
    var groups = th.map(function (t) { return { t: t, cs: d.clusters.filter(function (c) { return (c.theme || 1) === t.n; }) }; }).filter(function (g) { return g.cs.length; });
    if (groups.length < 2) { d.themes = []; touchDraft(); renderCluster(); return; }
    if (!silent && !confirm('This creates ' + groups.length + ' separate digests. The first stays open here; the others are saved in your digest list, ready to write. Continue?')) return;
    var allSplit = []; groups.forEach(function (g) { g.cs.forEach(function (c) { c.ids.forEach(function (id) { allSplit.push(id); }); }); });
    groups.slice(1).forEach(function (g, i) {
      var nd = digestBlank(); nd.sibIds = allSplit; nd.created = d.created + i + 1; nd.edition = d.edition; nd.themeTitle = g.t.title; nd.themeAngle = g.t.angle; nd.how = d.how;
      g.cs.forEach(function (c) { c.ids.forEach(function (id) { if (d.stories[id]) nd.stories[id] = d.stories[id]; }); nd.clusters.push(Object.assign({}, c, { theme: 1 })); var rr = d.draft && d.draft.sections && d.draft.sections[c.id]; if (rr) { nd.draft = nd.draft || { sections: {}, frame: null }; nd.draft.sections[c.id] = rr; } });
      libRecs(pid)[nd.id] = nd; queueSave(pid, nd);
    });
    d.sibIds = allSplit; d.clusters = groups[0].cs; var keepDr = {}; d.clusters.forEach(function (c) { c.theme = 1; var rr = d.draft && d.draft.sections && d.draft.sections[c.id]; if (rr) keepDr[c.id] = rr; }); d.themes = []; d.themeTitle = groups[0].t.title; d.themeAngle = groups[0].t.angle; d.outline = null; d.draft = Object.keys(keepDr).length ? { sections: keepDr, frame: null } : null; d.review = null;
    touchDraft(); flushDigests(); renderCluster(); updateStepAvailability(); updateLibPill();
    toast('Split into ' + groups.length + ' digests. This one is "' + dShort(groups[0].t.title, 50) + '". Open the others from your digest list.', 'success');
  }
  function mergeClusters(from, into) {
    var d = state.digest, a = d.clusters.filter(function (c) { return c.id === from; })[0], b = d.clusters.filter(function (c) { return c.id === into; })[0];
    if (!a || !b || a === b) return;
    a.ids.forEach(function (id) { b.ids.push(id); });
    d.clusters = d.clusters.filter(function (c) { return c !== a; });
    d.outline = d.outline ? syncOutline(d.outline) : null;
    touchDraft(); renderCluster(); updateStepAvailability();
  }
  function shiftCluster(id, dir) {
    var cs = state.digest.clusters, i = cs.map(function (c) { return c.id; }).indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= cs.length) return;
    var t = cs[i]; cs[i] = cs[j]; cs[j] = t; touchDraft(); renderCluster();
  }
  function dropCluster(id) {
    var d = state.digest, c = d.clusters.filter(function (x) { return x.id === id; })[0]; if (!c) return;
    c.ids.forEach(function (x) { d.left.push(x); });
    d.clusters = d.clusters.filter(function (x) { return x !== c; });
    d.outline = d.outline ? syncOutline(d.outline) : null;
    touchDraft(); renderCluster(); updateStepAvailability();
  }
  function storyRow(sid, ownerId) {
    var d = state.digest, s = d.stories[sid]; if (!s) return null;
    var li = el('li', { class: 'dgs-clu-story' });
    var main = el('div', { class: 'dgs-clu-story-main' });
    var t = s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: dShort(cleanTitle(s.title), 120) }) : el('span', { text: dShort(cleanTitle(s.title), 120) });
    main.appendChild(t);
    var meta = el('div', { class: 'dgs-story-meta' });
    meta.appendChild(el('span', { text: s.source || 'News' }));
    meta.appendChild(el('span', { class: 'dgs-chip ' + (dRead(s) ? 'is-ok' : 'is-bad'), text: dRead(s) ? '✓ readable' : '✕ not readable' }));
    if (dAge(s)) meta.appendChild(el('span', { text: dAge(s) }));
    main.appendChild(meta);
    li.appendChild(main);
    var sel = el('select', { class: 'dgs-clu-move', 'aria-label': 'Move this story' });
    sel.appendChild(el('option', { value: '', text: 'Move…' }));
    d.clusters.forEach(function (c, i) { if (c.id !== ownerId) sel.appendChild(el('option', { value: c.id, text: 'To section ' + (i + 1) + ': ' + dShort(c.title, 28) })); });
    sel.appendChild(el('option', { value: '__new', text: 'To a new section' }));
    if (ownerId !== '__left') sel.appendChild(el('option', { value: '__left', text: 'Leave out' }));
    sel.addEventListener('change', function () { if (sel.value) moveStory(sid, sel.value); });
    li.appendChild(sel);
    return li;
  }
  function renderCluster() {
    var box = document.getElementById('dgs-clu-list'); if (!box) return;
    var d = state.digest; box.innerHTML = '';
    var sel = document.getElementById('dgs-clu-n'); if (sel) sel.value = d.sectionsAuto ? '0' : String(d.sections);
    paintClu();
    var total = allClusterIds().length;
    var sum = document.getElementById('dgs-clu-sum');
    if (sum) sum.textContent = d.clusters.length ? total + ' stories in ' + d.clusters.length + ' section' + (d.clusters.length === 1 ? '' : 's') + (d.left.length ? ' · ' + d.left.length + ' left out' : '') : '';
    var next = document.getElementById('dgs-clu-next'); if (next) next.disabled = !d.clusters.length;
    var curSel = Object.keys(state.selectedStoryIds).sort().join(','), have = allClusterIds().slice().sort().join(',');
    var keepIds = {}; d.clusters.forEach(function (c) { if (c.carried) c.ids.forEach(function (i) { keepIds[i] = 1; }); });
    curSel = Object.keys(state.selectedStoryIds).filter(function (i) { return !keepIds[i]; }).sort().join(','); have = allClusterIds().filter(function (i) { return !keepIds[i]; }).sort().join(',');
    if (!SIMPLE) renderCarry(box);
    if (d.clusters.length && curSel && curSel !== have) {
      box.appendChild(el('p', { class: 'dgs-clu-stale', text: 'The stories selected in the Feed changed since these sections were made. Press "Group again" to use the new selection, or keep editing what is here.' }));
    }
    if (!d.clusters.length) {
      box.appendChild(el('p', { class: 'dgs-hint', text: Object.keys(state.selectedStoryIds).length ? 'Press "Group stories into sections". The AI proposes sections; you can move, merge, split or leave out any story afterwards.' : 'Select stories in the Feed first (or press "Select all readable"), then come back here.' }));
      return;
    }
    if (d.themes && d.themes.length > 1) {
      var bn = el('div', { class: 'dgs-clu-split' }); bn.appendChild(el('p', { class: 'dgs-hint', text: 'These stories make ' + d.themes.length + ' separate digests, one theme each. Shorter, focused articles rank and read better than one long one. You can change the digest of any section below.' }));
      var th0 = el('ul', { class: 'dgs-clu-themes' }); d.themes.forEach(function (t) { th0.appendChild(el('li', {}, [el('strong', { text: 'Digest ' + t.n + ': ' + (t.title || '') }), el('span', { class: 'dgs-hint', text: t.angle ? ' ' + t.angle : '' })])); }); bn.appendChild(th0);
      var sb = el('button', { type: 'button', class: 'dgs-btn dgs-btn-primary dgs-btn-sm', text: 'Split into ' + d.themes.length + ' digests' }); sb.addEventListener('click', function () { splitDigests(false); }); bn.appendChild(sb); box.appendChild(bn);
    }
    if (d.how === 'local') box.appendChild(el('p', { class: 'dgs-hint', text: 'These sections come from a simple word-overlap grouping, not from the AI. Check each one.' }));
    d.clusters.forEach(function (c, i) {
      var card = el('div', { class: 'dgs-clu' });
      var head = el('div', { class: 'dgs-clu-head' });
      head.appendChild(el('span', { class: 'dgs-clu-n', text: String(i + 1) }));
      var ti = el('input', { type: 'text', class: 'dgs-clu-title', value: c.title, 'aria-label': 'Section title' });
      ti.addEventListener('change', function () { c.title = ti.value.trim() || c.title; touchDraft(); if (d.outline) { var os = d.outline.sections.filter(function (x) { return x.cid === c.id; })[0]; if (os && os.heading === '') os.heading = c.title; } });
      head.appendChild(ti);
      if (d.themes && d.themes.length > 1) {
        var ts = el('select', { class: 'dgs-clu-move', 'aria-label': 'Digest for this section' }); d.themes.forEach(function (t) { var o = el('option', { value: String(t.n), text: 'Digest ' + t.n }); if (t.n === c.theme) o.selected = true; ts.appendChild(o); });
        ts.addEventListener('change', function () { c.theme = parseInt(ts.value, 10); d.clusters.sort(function (a, b) { return (a.theme || 1) - (b.theme || 1); }); touchDraft(); renderCluster(); }); head.appendChild(ts);
      }
      if (c.carried) head.appendChild(el('span', { class: 'dgs-chip is-used', text: c.carried.mode === 'asis' ? 'Reused' : 'Updated', title: 'From "' + c.carried.from + '"' }));
      var tools = el('div', { class: 'dgs-clu-tools' });
      var up = el('button', { type: 'button', class: 'dgs-icon-btn', 'aria-label': 'Move section up', title: 'Move up', text: '↑' }); up.disabled = i === 0;
      var dn = el('button', { type: 'button', class: 'dgs-icon-btn', 'aria-label': 'Move section down', title: 'Move down', text: '↓' }); dn.disabled = i === d.clusters.length - 1;
      up.addEventListener('click', function () { shiftCluster(c.id, -1); }); dn.addEventListener('click', function () { shiftCluster(c.id, 1); });
      tools.appendChild(up); tools.appendChild(dn);
      if (d.clusters.length > 1) {
        var mg = el('select', { class: 'dgs-clu-move', 'aria-label': 'Merge this section into another' });
        mg.appendChild(el('option', { value: '', text: 'Merge into…' }));
        d.clusters.forEach(function (o, k) { if (o.id !== c.id) mg.appendChild(el('option', { value: o.id, text: 'Section ' + (k + 1) + ': ' + dShort(o.title, 28) })); });
        mg.addEventListener('change', function () { if (mg.value) mergeClusters(c.id, mg.value); });
        tools.appendChild(mg);
      }
      var rm = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Remove section' });
      rm.addEventListener('click', function () { dropCluster(c.id); });
      tools.appendChild(rm);
      head.appendChild(tools);
      card.appendChild(head);
      var th = el('input', { type: 'text', class: 'dgs-clu-thread', value: c.thread || '', placeholder: 'What ties these stories together, and why it matters', 'aria-label': 'What ties the stories together' });
      th.addEventListener('change', function () { c.thread = th.value.trim(); digestSave(); });
      card.appendChild(th);
      var ul = el('ul', { class: 'dgs-clu-stories' });
      c.ids.forEach(function (sid) { var r = storyRow(sid, c.id); if (r) ul.appendChild(r); });
      card.appendChild(ul);
      var readableN = c.ids.filter(function (sid) { return d.stories[sid] && dRead(d.stories[sid]); }).length;
      var outlets = {}; c.ids.forEach(function (sid) { var s = d.stories[sid]; if (s) outlets[String(s.source || '').toLowerCase()] = 1; });
      var warns = [];
      if (!readableN) warns.push('No readable article in this section, so it cannot be written. Move a readable story in or remove it.');
      else if (Object.keys(outlets).length < 2) warns.push('One outlet only: nothing to cross-check against. Fine for a short section.');
      if (c.ids.length > 8) warns.push('A long section. Consider splitting it.');
      warns.forEach(function (w) { card.appendChild(el('p', { class: 'dgs-clu-warn', text: w })); });
      box.appendChild(card);
    });
    if (d.left.length) {
      var lc = el('div', { class: 'dgs-clu is-left' });
      lc.appendChild(el('div', { class: 'dgs-clu-head' }, [el('strong', { text: 'Left out (' + d.left.length + ')' }), el('span', { class: 'dgs-hint', text: 'Not used in the article. Move any of these into a section.' })]));
      var lu = el('ul', { class: 'dgs-clu-stories' });
      d.left.forEach(function (sid) { var r = storyRow(sid, '__left'); if (r) lu.appendChild(r); });
      lc.appendChild(lu);
      var nb = el('button', { type: 'button', class: 'dgs-btn dgs-btn-primary', text: 'Make a second digest from these ' + d.left.length + ' stories' });
      nb.addEventListener('click', nextFromLeft);
      lc.appendChild(el('p', { class: 'dgs-hint', text: 'These stories did not fit the first digest. A second digest groups them on their own, so each article stays focused and nothing important is lost.' })); lc.appendChild(nb); box.appendChild(lc);
    }
  }

  // ---------- Outline ----------
  function syncOutline(o) {
    var d = state.digest, have = {}; o.sections = o.sections.filter(function (s) { return d.clusters.some(function (c) { return c.id === s.cid; }); });
    o.sections.forEach(function (s) { have[s.cid] = 1; });
    d.clusters.forEach(function (c, i) { if (!have[c.id]) o.sections.push({ cid: c.id, heading: c.title, lens: DLENS[i % DLENS.length].id, why: '', include: true }); });
    return pinCarried(o);
  }
  function localOutline() {
    var d = state.digest, order = ['happened', 'hidden', 'benefits', 'second', 'contrarian', 'parallel'];
    var first = d.clusters[0] ? d.clusters[0].title : 'Today';
    return {
      headlines: [dShort(first, 70)], headline: dShort(first, 70), opening: '', summary: true, watch: true, local: true,
      sections: d.clusters.map(function (c, i) { return { cid: c.id, heading: c.title, lens: order[i % order.length], why: 'Default choice. Add an AI key for a recommendation per section.', include: true }; })
    };
  }
  function outlinePrompt() {
    var d = state.digest, p = state.profile || {};
    var lines = [
      'You are the editor planning a digest article for "' + (p.name || 'a publication') + '". Plan it from the sections below. Each section is a cluster of related stories that will become one part of the article.',
      THINK, d.themeTitle ? 'THEME OF THIS DIGEST: ' + d.themeTitle + (d.themeAngle ? ' (' + d.themeAngle + ')' : '') : '',
      '', 'PUBLICATION VOICE AND AUDIENCE:'
    ].concat(dnaText(p).split('\n'), ['TOPICS: ' + (p.topics || []).map(function (t) { return t.name; }).join(', '), '',
      'LENSES (choose exactly one primary lens per section; vary them across the article when the facts allow; a lens is a way of reading the facts, never a licence to add facts):']);
    DLENS.forEach(function (l) { lines.push('- ' + l.id + ': ' + l.label + '. ' + l.hint); });
    lines.push('', 'SECTIONS:');
    d.clusters.forEach(function (c, i) {
      lines.push('[' + c.id + '] ' + c.title + (c.thread ? ' - ' + c.thread : ''));
      c.ids.slice(0, 6).forEach(function (sid) { var s = d.stories[sid]; if (s) lines.push('   * ' + dShort(cleanTitle(s.title), 120) + ' (' + dShort(s.source, 24) + ')' + (s.summary ? ': ' + dShort(s.summary, 160) : '')); });
    });
    lines.push('', 'RULES:',
      '- "headlines": 3 options, at most 70 characters each. Name the lasting subject or question first, the thing a reader could search for months from now, and keep the day\'s event out or in the second half. Good: "How Iran tensions feed into oil prices and airline costs". Bad: "US strikes Qeshm hours before midterms". Concrete, no clickbait, no hype words.',
      '- "opening": one or two sentences on how the piece should open: an idea or tension that frames the day, not a summary of the sections.',
      '- For each section: "heading" at most 8 words, specific and about the lasting subject, not clickbait; "lens" one of the ids above; "why" one sentence saying why this lens fits these facts.',
      '- "order": all section ids, strongest and most important first, with a flow that links neighbouring sections.',
      '- One argument: the headlines and the opening must make ONE argument that every kept section serves. List in "off_theme" the ids of sections that do not serve it. Be strict: sharing the date, a loose metaphor (a "bunker", a "fracture") or the word "capital" is not a connection. Better a shorter digest that holds together than a long one that does not. Use an empty list when every section fits.',
      'Return STRICT JSON only: {"headlines":["..."],"opening":"...","sections":[{"id":"c1","heading":"...","lens":"hidden","why":"..."}],"order":["c1"],"off_theme":[]}');
    return lines.join('\n');
  }
  function outlineWithLlm() {
    return callLLM(outlinePrompt(), 'write', { best: true }).then(function (r) {
      var j = extractJson(r.text), d = state.digest, by = {};
      (j.sections || []).forEach(function (s) { if (s && s.id) by[String(s.id)] = s; });
      var ids = d.clusters.map(function (c) { return c.id; });
      var order = (j.order || []).map(String).filter(function (x) { return ids.indexOf(x) !== -1; });
      ids.forEach(function (x) { if (order.indexOf(x) === -1) order.push(x); });
      var off = {}; (Array.isArray(j.off_theme) ? j.off_theme : []).forEach(function (x) { off[String(x)] = 1; }); if (Object.keys(off).length >= ids.length) off = {};
      var heads = (j.headlines || []).map(function (h) { return dShort(h, 90); }).filter(Boolean).slice(0, 3);
      if (!heads.length) throw new Error('The AI returned no headlines.');
      return {
        headlines: heads, headline: heads[0], opening: dShort(j.opening || '', 300), summary: true, watch: true, local: false,
        sections: order.map(function (cid, i) {
          var c = d.clusters.filter(function (x) { return x.id === cid; })[0], s = by[cid] || {};
          var lens = DLENS.some(function (l) { return l.id === s.lens; }) ? s.lens : DLENS[i % DLENS.length].id;
          return { cid: cid, heading: dShort(s.heading || c.title, 90), lens: lens, why: dShort(s.why || '', 220), include: !off[cid], off: !!off[cid] };
        })
      };
    });
  }
  function runOutline() {
    var d = state.digest;
    if (!d.clusters.length) { toast('Group the stories into sections first.', 'error'); return Promise.resolve(false); }
    if (outBusy) return Promise.resolve(false);
    outBusy = true; var mine = ++outRun; paintOut();
    var p = dKey() ? outlineWithLlm().catch(function (e) {
      LOG('digest outline: AI failed:', e && e.message);
      toast('The AI could not plan the outline (' + dShort(e && e.message, 120) + '). Made a plain default instead; edit it below.', 'error');
      return null;
    }) : Promise.resolve(null);
    return p.then(function (o) {
      if (mine !== outRun) return false;
      outBusy = false; d.outline = pinCarried(o || localOutline()); digestSave(); renderOutline();
      toast(o ? 'Outline planned. Change anything you like.' : 'Plain outline made. Add an AI key for recommendations.', o ? 'success' : '');
      return true;
    });
  }
  function paintOut() {
    var pr = document.getElementById('dgs-out-prog'); if (pr) pr.hidden = !outBusy;
    var go = document.getElementById('dgs-out-run'), st = document.getElementById('dgs-out-stop');
    if (go) { go.disabled = outBusy; go.textContent = state.digest.outline ? 'Plan again' : 'Plan the outline'; setLead(go, !state.digest.outline); }
    if (st) st.hidden = !outBusy;
  }
  function outlineMarkdown() {
    var d = state.digest, o = d.outline; if (!o) return '';
    var out = ['# ' + (o.headline || 'Untitled'), ''];
    if (o.summary) out.push('Answer-first summary at the top.', '');
    if (o.opening) out.push('Opening: ' + o.opening, '');
    var n = 0;
    o.sections.forEach(function (s) {
      if (!s.include) return; n++;
      var c = d.clusters.filter(function (x) { return x.id === s.cid; })[0]; if (!c) return;
      out.push('## ' + n + '. ' + s.heading + ' (' + dLens(s.lens).label + ')');
      if (c.thread) out.push(c.thread);
      c.ids.forEach(function (sid) { var st = d.stories[sid]; if (st) out.push('- ' + cleanTitle(st.title) + ' (' + (st.source || 'News') + ')' + (st.url ? ' ' + st.url : '')); });
      out.push('');
    });
    if (o.watch) out.push('## What to watch', '');
    return out.join('\n');
  }
  function renderOutline() {
    var box = document.getElementById('dgs-out-body'); if (!box) return;
    var d = state.digest; box.innerHTML = ''; paintOut();
    if (!d.clusters.length) { box.appendChild(el('p', { class: 'dgs-hint', text: 'Group the stories into sections first.' })); return; }
    var o = d.outline;
    var cp = document.getElementById('dgs-out-copy'); if (cp) cp.disabled = !o;
    if (!o) { box.appendChild(el('p', { class: 'dgs-hint', text: 'Press "Plan the outline". The AI proposes a headline, an opening idea, an order, and one lens per section. You decide everything.' })); return; }
    o = d.outline = syncOutline(o);
    if (o.local) box.appendChild(el('p', { class: 'dgs-hint', text: 'Plain outline without AI: the lenses are defaults. Add an AI key and press "Plan again" for recommendations.' }));
    var hs = el('div', { class: 'dgs-out-card' });
    hs.appendChild(el('h3', { class: 'dgs-out-h', text: 'Headline' }));
    o.headlines.forEach(function (h, i) {
      var lab = el('label', { class: 'dgs-out-radio' }); var r = el('input', { type: 'radio', name: 'dgs-out-head' }); r.checked = o.headline === h;
      r.addEventListener('change', function () { o.headline = h; custom.value = ''; touchDraft(); });
      lab.appendChild(r); lab.appendChild(el('span', { text: h })); hs.appendChild(lab);
    });
    var custom = el('input', { type: 'text', class: 'dgs-out-input', placeholder: 'Or write your own headline', 'aria-label': 'Your own headline', value: o.headlines.indexOf(o.headline) === -1 ? o.headline : '' });
    custom.addEventListener('input', function () { if (custom.value.trim()) { o.headline = custom.value.trim(); $$('input[name="dgs-out-head"]', hs).forEach(function (r) { r.checked = false; }); touchDraft(); } });
    hs.appendChild(custom);
    box.appendChild(hs);
    var op = el('div', { class: 'dgs-out-card' });
    op.appendChild(el('h3', { class: 'dgs-out-h', text: 'How it opens' }));
    var ta = el('textarea', { class: 'dgs-out-input', rows: '2', placeholder: 'An idea or tension that frames the day, not a summary', 'aria-label': 'How the article opens' }); ta.value = o.opening || '';
    ta.addEventListener('change', function () { o.opening = ta.value.trim(); digestSave(); });
    op.appendChild(ta);
    var sw = el('label', { class: 'dgs-out-check' }); var c1 = el('input', { type: 'checkbox' }); c1.checked = !!o.summary; c1.addEventListener('change', function () { o.summary = c1.checked; touchDraft(); });
    sw.appendChild(c1); sw.appendChild(el('span', { text: 'Answer-first summary at the top (helps search engines and AI assistants quote the piece)' })); op.appendChild(sw);
    box.appendChild(op);
    var nOff = o.sections.filter(function (x) { return !x.include; }).length;
    if (nOff) box.appendChild(el('p', { class: 'dgs-hint', text: nOff + (nOff === 1 ? ' section does' : ' sections do') + ' not fit this article and will be left out. Nothing is lost: they stay in your digest list and are offered again as "Not used yet" when you start another digest.' }));
    var cards = el('div', { class: 'dgs-out-list' });
    o.sections.forEach(function (s, i) {
      var c = d.clusters.filter(function (x) { return x.id === s.cid; })[0]; if (!c) return;
      var card = el('div', { class: 'dgs-out-sec' + (s.include ? '' : ' is-off') });
      var top = el('div', { class: 'dgs-clu-head' });
      var inc = el('input', { type: 'checkbox', 'aria-label': 'Include this section' }); inc.checked = s.include; inc.addEventListener('change', function () { if (inc.checked) s.off = false; });
      inc.addEventListener('change', function () { s.include = inc.checked; card.classList.toggle('is-off', !s.include); touchDraft(); });
      top.appendChild(inc); top.appendChild(el('span', { class: 'dgs-clu-n', text: String(i + 1) }));
      var hi = el('input', { type: 'text', class: 'dgs-clu-title', value: s.heading, 'aria-label': 'Section heading' }); hi.addEventListener('change', function () { s.heading = hi.value.trim() || c.title; touchDraft(); });
      top.appendChild(hi);
      if (s.off) top.appendChild(el('span', { class: 'dgs-chip is-warn', text: 'Does not fit the argument', title: 'The AI left this out of the article because it does not serve the headline. Tick it to include it anyway, or keep it for another digest.' }));
      var tools = el('div', { class: 'dgs-clu-tools' });
      var up = el('button', { type: 'button', class: 'dgs-icon-btn', 'aria-label': 'Move up', text: '↑' }); up.disabled = i === 0;
      var dn = el('button', { type: 'button', class: 'dgs-icon-btn', 'aria-label': 'Move down', text: '↓' }); dn.disabled = i === o.sections.length - 1;
      function swap(k) { var t = o.sections[i]; o.sections[i] = o.sections[i + k]; o.sections[i + k] = t; digestSave(); renderOutline(); }
      up.addEventListener('click', function () { swap(-1); }); dn.addEventListener('click', function () { swap(1); });
      tools.appendChild(up); tools.appendChild(dn); top.appendChild(tools);
      card.appendChild(top);
      var row = el('div', { class: 'dgs-out-lens' });
      row.appendChild(el('span', { class: 'dgs-label', text: 'Lens' }));
      var ls = el('select', { class: 'dgs-clu-move', 'aria-label': 'Lens for this section' });
      DLENS.forEach(function (l) { var op2 = el('option', { value: l.id, text: l.label }); if (l.id === s.lens) op2.selected = true; ls.appendChild(op2); });
      var hint = el('span', { class: 'dgs-hint', text: dLens(s.lens).hint });
      ls.addEventListener('change', function () { s.lens = ls.value; s.why = 'Chosen by you.'; hint.textContent = dLens(s.lens).hint; why.textContent = s.why; touchDraft(); });
      row.appendChild(ls); card.appendChild(row); card.appendChild(hint);
      var why = el('p', { class: 'dgs-out-why', text: s.why ? 'Why: ' + s.why : '' }); card.appendChild(why);
      var outs = {}; c.ids.forEach(function (sid) { var st = d.stories[sid]; if (st) outs[st.source || 'News'] = 1; });
      card.appendChild(el('p', { class: 'dgs-out-src', text: 'From ' + c.ids.length + ' stor' + (c.ids.length === 1 ? 'y' : 'ies') + ': ' + Object.keys(outs).slice(0, 6).join(', ') }));
      cards.appendChild(card);
    });
    box.appendChild(cards);
    var cl = el('div', { class: 'dgs-out-card' });
    var sw2 = el('label', { class: 'dgs-out-check' }); var c2 = el('input', { type: 'checkbox' }); c2.checked = !!o.watch; c2.addEventListener('change', function () { o.watch = c2.checked; touchDraft(); });
    sw2.appendChild(c2); sw2.appendChild(el('span', { text: 'Close with "What to watch": the signals that would confirm or break the day\'s readings' })); cl.appendChild(sw2);
    box.appendChild(cl);
  }
  function digestBind() {
    var g = function (id, fn) { var n = document.getElementById(id); if (n) n.addEventListener('click', fn); };
    g('dgs-clu-run', runClustering);
    g('dgs-clu-suggest', function () { suggestDigests(false); });
    g('dgs-lib-weekly', libCommentary); g('dgs-lib-weak', libRemoveWeak); g('dgs-lib-keep', libKeepStrongest); g('dgs-lib-clear', libClearAll);
    g('dgs-sc-run', genScript);
    g('dgs-sc-copy', function () { var t = document.getElementById('dgs-sc-text'); if (t && copyText(t.value)) toast('Script copied.', 'success'); });
    g('dgs-sc-dl', function () { var t = document.getElementById('dgs-sc-text'); if (t && t.value) downloadText(t.value, 'script-' + new Date().toISOString().slice(0, 10) + '.txt', 'text/plain'); });
    var sct = document.getElementById('dgs-sc-text'); if (sct) sct.addEventListener('input', function () { if (state.digest.script) { state.digest.script.text = sct.value; digestSave(); } });
    g('dgs-clu-stop', function () { cluRun++; cluBusy = false; paintClu(); toast('Grouping stopped.', ''); });
    g('dgs-clu-back', function () { setStep('feed'); });
    g('dgs-clu-next', function () {
      if (!state.digest.clusters.length) { toast('Group the stories first.', 'error'); return; }
      var have = {}; allClusterIds().forEach(function (i) { have[i] = 1; }); (state.digest.sibIds || []).forEach(function (i) { have[i] = 1; }); var fresh = Object.keys(state.selectedStoryIds).filter(function (i) { return !have[i]; }).length;
      if (fresh && !cluBusy && confirm(fresh + ' ' + (fresh === 1 ? 'story' : 'stories') + ' you selected in the Feed ' + (fresh === 1 ? 'is' : 'are') + ' not in these sections yet.\n\nOK groups them now (the sections are made again).\nCancel continues with the sections as they are.')) { runClustering(); return; }
      var UM = usedMap(), tot = 0, dup = 0, by = '';
      state.digest.clusters.forEach(function (c) { if (c.carried) return; c.ids.forEach(function (i) { var st = state.digest.stories[i]; if (!st) return; tot++; var u = usedBy(st, UM); if (usedElsewhere(u)) { dup++; by = by || u.title; } }); });
      if (tot >= 3 && dup / tot >= 0.5 && !confirm(dup + ' of these ' + tot + ' stories are already in a written digest ("' + dShort(by, 60) + '"). Publishing both would repeat the same material on the site.\n\nOK continues anyway. Cancel lets you change the selection.')) return;
      setStep('outline');
    });
    g('dgs-out-run', runOutline);
    g('dgs-out-stop', function () { outRun++; outBusy = false; paintOut(); toast('Planning stopped.', ''); });
    g('dgs-out-back', function () { setStep('cluster'); });
    g('dgs-out-copy', function () { copyText(outlineMarkdown()); toast('Outline copied.', 'success'); });
    var n = document.getElementById('dgs-clu-n');
    if (n) n.addEventListener('change', function () { var v = parseInt(n.value, 10) || 0; state.digest.sectionsAuto = !v; if (v) state.digest.sections = v; digestSave(); });
  }

  // =====================================================================
  // Stage 2: Write. Each section is drafted from its own source articles, then checked.
  // =====================================================================
  var WLEN = { short: { label: 'Short', words: 120 }, medium: { label: 'Medium', words: 200 }, long: { label: 'Long', words: 300 } };
  var artCache = {};          // story id -> { text, url, source, title }  (memory only)
  var wrBusy = false, wrRun = 0;

  var TELL_WORDS = ['pivotal', 'landscape', 'testament', 'underscore', 'underscores', 'underscoring', 'delve', 'tapestry', 'crucial', 'vital role', 'key role', 'stands as', 'serves as', 'game-changer', 'game changer', 'navigate', 'realm', 'multifaceted', 'nuanced', 'robust', 'seamless', 'leverage', 'ever-evolving', 'rapidly evolving', 'in today\'s', 'it is worth noting', 'it\'s worth noting', 'shed light', 'sheds light', 'paves the way', 'a growing number', 'at the heart of', 'ushers in', 'poised to', 'marks a shift', 'marks a turning point', 'watershed'];
  var TELL_RULES = [
    { id: 'dash', label: 'Em dash', re: /—|\s–\s/g },
    { id: 'notbut', label: '"Not X, but Y" framing', re: /\bnot (?:just |only |merely |simply )?[^.;:!?]{2,60}?[,;]? (?:but|it is|it\'s|rather)\b/gi },
    { id: 'trail', label: 'Trailing "-ing" clause that claims significance', re: /,\s(?:highlighting|underscoring|reflecting|signaling|signalling|showing|illustrating|marking|raising|shaping|reinforcing|emphasizing|emphasising|demonstrating|cementing|solidifying|paving|setting the stage)\b[^.]*\./gi },
    { id: 'closer', label: 'Summary closer', re: /(?:^|[.!?]\s)(?:In conclusion|In summary|Overall|Ultimately|All in all|To sum up|Moving forward)\b/g },
    { id: 'vague', label: 'Vague attribution', re: /\b(?:experts|observers|analysts|critics|industry watchers|many|some) (?:say|argue|believe|suggest|note|fear|warn)\b/gi },
    { id: 'despite', label: '"Despite challenges" formula', re: /\bDespite (?:these |the |its |such )?(?:challenges|setbacks|headwinds|obstacles|difficulties)\b/gi },
    { id: 'bold', label: 'Bold or markdown emphasis', re: /\*\*[^*]+\*\*|__[^_]+__/g },
    { id: 'emoji', label: 'Emoji', re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu },
    { id: 'rule3', label: 'List of three adjectives or nouns (it repeats)', re: /\b[a-z]{4,}, [a-z]{4,},? and [a-z]{4,}\b/g }
  ];

  function wrOptions() { var d = state.digest; d.length = WLEN[d.length] ? d.length : 'medium'; return d.length; }
  function wrSig(c, s) { return c.ids.join(',') + '|' + (s ? s.lens : '') + '|' + (s ? s.heading : ''); }
  function wrDraft() { var d = state.digest; if (!d.draft) d.draft = { sections: {}, frame: null }; if (!d.draft.sections) d.draft.sections = {}; return d.draft; }

  // ---------- Sources ----------
  function gatherSources(c, stop) {
    var d = state.digest, list = c.ids.map(function (id) { return d.stories[id]; }).filter(function (s) { return s && dRead(s); }).slice(0, 6);
    var out = [], i = 0;
    function next() {
      if (stop()) return Promise.resolve(out);
      if (i >= list.length) return Promise.resolve(out);
      var s = list[i++];
      if (artCache[s.id]) { out.push(artCache[s.id]); return next(); }
      return resolveSource({ id: s.id, title: s.title, url: s.url, source: s.source, summary: s.summary, readable: s.readable }).then(function (r) {
        if (r && r.art && r.art.text) {
          var rec = { id: s.id, text: String(r.art.text), url: r.story.url || s.url, source: r.story.source || s.source || 'News', title: cleanTitle(r.story.title || s.title), via: r.via, headline: cleanTitle(s.title) };
          artCache[s.id] = rec; out.push(rec);
        }
        return next();
      }).catch(function () { return next(); });
    }
    return next();
  }
  function sourceBlock(srcs) {
    var per = Math.max(1200, Math.min(3800, Math.floor(13000 / Math.max(1, srcs.length))));
    return srcs.map(function (s, i) {
      return '[A' + (i + 1) + '] ' + s.source + ' - ' + s.title + (s.via === 'alternative' ? ' (same event, other outlet)' : '') + '\n' + dShort(s.text, per);
    }).join('\n\n');
  }
  function sourceCorpus(srcs) { return srcs.map(function (s) { return s.headline + ' ' + s.title + ' ' + s.source + ' ' + s.text; }).join(' \n ').toLowerCase(); }

  // ---------- Prompts ----------
  var STYLE_RULES = [
    'WRITE LIKE A HUMAN EDITOR, NOT A MODEL:',
    '- Plain, specific sentences. Name who did what, with the number or place from the sources. Prefer a concrete detail to a general statement.',
    '- Short sentences. Most are 8 to 16 words, and none is longer than 20 words. One idea per sentence. If a sentence needs a second comma or a "which" clause, make it two sentences. A few very short ones are good. No filler openers and no summary closer at the end of the section.',
    '- Everyday words. Say "use" not "utilise", "start" not "commence", "after" not "subsequently", "show" not "demonstrate". Prefer active verbs ("Moscow rejected the offer", not "the offer was rejected by Moscow").',
    '- Paragraphs are 2 or 3 sentences and never more than 90 words. Join ideas with plain linking words (but, so, because, then, meanwhile, as a result, for example) in about a third of the sentences.',
    '- No em dashes. No "not X, but Y" framing. No lists of three. No trailing "-ing" clause that claims significance (highlighting, underscoring, reflecting, marking, shaping).',
    '- Never use: pivotal, landscape, testament, underscores, crucial, vital role, key role, delve, tapestry, navigate, realm, multifaceted, robust, seamless, leverage, shed light, paves the way, poised to, watershed, "it is worth noting".',
    '- Attribute by outlet name ("Reuters reports", "according to the BBC"), never "experts say" or "observers note".',
    '- No "Despite challenges" paragraph. No bold, no emoji, no headings inside the section.',
    '- Do not praise the topic or call anything "significant", "important" or "notable". Show why through the facts.'
  ];
  function readLenMode() { var r = state.digest && state.digest.readLen; return r === 'short' ? 'short' : r === 'full' ? 'full' : 'bulletin'; }
  function readSpec(thin, lens) {
    var open = ' Vary how it opens: never start with "One reading is" or "This suggests", and never open two reads in this article the same way. Start with the claim itself, or a plain marker such as "That points to", "The likelier explanation is", "What changes here is" or "The catch is".';
    if (thin) return '"reading" is an empty string.';
    if (readLenMode() === 'bulletin') return '"reading" is "Our read": the publication\'s own commentary, the reason people read it instead of the wire. 110 to 150 words in 1 or 2 short paragraphs. Take a position in the first sentence and argue it, in the voice above. Say who gains or loses, and give the strongest alternative explanation in one sentence. End with one sentence that begins "What would change this read:" and names one concrete, checkable signal from the sources (a decision, a release, a number to compare) and which result would prove the reading wrong. Use only numbers, dates, institutions and names that appear in the sources; never invent a threshold, a deadline or an organisation. Today is ' + dateHuman(Date.now()) + ', so never present an earlier date as upcoming. Do not suggest a named living person did something improper unless a source says so, and then attribute it.' + open;
    if (readLenMode() === 'short') return '"reading" is a separate short box, 1 to 3 sentences and at most 60 words, that applies the lens to those facts, written as reasoning, never as fact or prediction.' + open + ' If there is nothing solid to add, set "reading" to an empty string.';
    return '"reading" is "Our read": the publication\'s own commentary, and the reason people read it instead of the wire. 200 to 300 words in 2 or 3 short paragraphs, separated by a blank line. Take a position and argue it, in the voice above. Cover, in this order and without labels: first, what the facts mean and who gains or loses; second, the strongest alternative explanation or counterargument and why it is weaker, or where it could be right; third, the specific evidence that would show this read is wrong. Make it last: work one plain sentence on the lasting mechanism (how this kind of pressure normally works, in a term a reader might search for) into the argument, so it still makes sense in six months. Do not introduce it with a label such as \"The lasting mechanism is\" or \"The mechanism at work is\", and phrase it differently in every section. Every place, organisation, person and number you mention in the reading must also appear in the SOURCES, and do not add descriptions of them that the SOURCES do not support (for example no credit-rating labels, no extra regions or shipping routes). Argue only from the facts in the SOURCES: add no new fact, name, number or quote. Make it plain in the wording that this is analysis (likely, points to, we think), never reported fact; a prediction only as "if X, then Y". The lens for this section is "' + lens.label + '".' + open;
  }

  // The phrase the article is meant to rank for. Chosen before writing so the text really contains it.
  function plannedKeyphrase() {
    var rv = dReview(), f = rv && rv.seo && rv.seo.focus; if (f) return String(f).toLowerCase();
    var h = (state.digest && state.digest.outline && state.digest.outline.headline) || ''; var w = tokenize(h.split(':')[0]);
    return w.slice(-3).join(' ');
  }
  function kpRule(where) {
    var k = plannedKeyphrase(); if (!k) return '';
    return where === 'frame' ? '- The "summary" and the "opening" must each contain the exact words "' + k + '" once, used naturally (this is the phrase the article should be found for).' : '- Search: use the exact words "' + k + '" once in the first paragraph of this section where it reads naturally, and again later only if it fits. Never force it.';
  }
  function bestKeyphrase(cands) {
    var dr = wrDraft(), body = (includedSections().map(function (x) { var r = dr.sections[x.c.id]; return r ? r.paras.join(' ') + ' ' + (r.reading || '') : ''; }).join(' ') + ' ' + ((dr.frame && dr.frame.summary) || '') + ' ' + ((dr.frame && dr.frame.opening) || '')).toLowerCase();
    var best = null, bn = -1; cands.forEach(function (c) { c = String(c || '').toLowerCase().trim(); if (!c) return; var n = body.split(c).length - 1; if (n > bn) { bn = n; best = c; } });
    return { phrase: best, n: bn };
  }
  function sectionPrompt(c, s, srcs, words, thin) {
    var p = state.profile || {}, lens = dLens(s.lens);
    var lines = [
      'You are a writer for "' + (p.name || 'a publication') + '". Write ONE section of a digest article.', THINK, 
      '', 'VOICE (follow it):'
    ].concat(dnaText(p).split('\n'), ['',
      ((p.identity && p.identity.samples && p.identity.samples.posts && p.identity.samples.posts.length) ? 'SAMPLES OF THEIR OWN WRITING (match the rhythm, register and level of detail. Do not copy phrases or facts from them):\n' + p.identity.samples.posts.map(function (t, i) { return '(' + (i + 1) + ') ' + t; }).join('\n') + '\n' : ''),
      'SECTION: ' + s.heading, 'THREAD: ' + (c.thread || '(none)'),
      'LENS: ' + lens.label + '. ' + lens.hint,
      thin ? 'LENGTH: the sources are thin. Write ONE short paragraph of 35 to 70 words with only what they state. Set "reading" to an empty string.' : 'LENGTH: the reported account ("paragraphs") is about ' + (readLenMode() === 'bulletin' ? 100 : Math.min(words, 170)) + ' words in ' + (readLenMode() === 'bulletin' ? '1 or 2' : '2 or 3') + ' paragraphs, only the facts the reading needs. The weight of the section is in "reading".',
      'STRUCTURE: "paragraphs" is the reported account only: facts, numbers and quotes from the sources, each attributed. Put no speculation in it. ' + readSpec(thin, lens),
      kpRule('section'),
      '', 'FACT RULES (strict):',
      '- Every fact, number, name, date and quote must come from the SOURCES below. If it is not there, leave it out.',
      '- Do not add background from memory, except a pattern from before when the lens is "A pattern from before" and the case is well established; then say plainly it is from outside the sources. Use only widely documented history from before 2024, and never state anything about who currently holds office or about recent events that the SOURCES do not report.',
      '- These fact rules override the voice. If the voice says "zero hedging" or to doubt official accounts, still mark reasoning as reasoning, never present a suspicion as fact, and never imply motives (such as capital flight, capture or cover-ups) that the SOURCES do not report; say what the evidence would have to show instead.',
      '- Keep to this section\'s own subject. Do not stretch it into the theme of other sections of the article.' + (function () { try { var hs = includedSections().map(function (x) { return x.s.heading; }).filter(function (h) { return h !== s.heading; }); return hs.length ? ' The other sections are: ' + hs.join('; ') + '. A fact that belongs to one of them stays there; do not repeat it here.' : ''; } catch (e) { return ''; } })(),
      '- Do not describe legal or procedural mechanisms (veto overrides, appropriations, war powers, court procedure, thresholds) unless a source describes them. Do not attribute personal impulses or hidden motives to anyone.',
      '- Paragraphs have at least two sentences. Combine what one outlet reports into one paragraph instead of one line per fact.',
      '- The lens is a way of reading the facts. Reasoning must be marked as reasoning in the wording (for example "likely", "points to", "may mean"), never stated as fact. No predictions stated as fact.',
      '- If sources disagree, say so and name both outlets. If only one outlet reports a point, say "according to <outlet>".',
      '- Write in English unless the voice above says otherwise.',
      ''], STYLE_RULES, ['', 'SOURCES:', sourceBlock(srcs), '',
      'Return STRICT JSON only: {"paragraphs":["..."],"reading":"...","used":["A1","A2"]}  ("used" lists the source tags you drew facts from.)']);
    return lines.join('\n');
  }
  function revisePrompt(text, problems, srcs) {
    return [
      'Rewrite this section so the listed problems are gone. Keep every fact, number and name exactly as in the sources, keep the meaning and the voice, keep the length about the same. Change only what is needed.',
      '', 'PROBLEMS:'].concat(problems.map(function (x) { return '- ' + x; }), ['', 'SECTION TEXT:', text, '', 'SOURCES (for checking facts only):', sourceBlock(srcs), '',
      'Return STRICT JSON only: {"paragraphs":["..."]}']).join('\n');
  }
  function framePrompt(o, secs) {
    var p = state.profile || {};
    var lines = ['You are the editor of "' + (p.name || 'a publication') + '". Below are the written sections of a digest article. Write the framing parts from them.', THINK,  '', 'VOICE:'].concat(dnaText(p).split('\n'), ['', 'HEADLINE: ' + o.headline, 'PLANNED OPENING IDEA: ' + (o.opening || '(none)'), '', 'SECTIONS:']);
    secs.forEach(function (s, i) { lines.push('## ' + s.heading + ' (' + dLens(s.lens).label + ')\n' + s.text); });
    lines.push('', 'WRITE:',
      '- "summary": our verdict, 2 to 3 sentences and at most 90 words and no sentence longer than 20 words. The first sentence names the lasting subject plainly (the words a reader would search) and states what this means. Then the one or two facts that carry it and what to expect over the coming months. Take a position. Do not list every section or every outlet. Keep each number with its own subject (never merge two figures into one claim). This sits at the top of the article, so a search engine or an AI assistant can quote it on its own.',
      '- "opening": 1 to 2 sentences that open the piece with the planned idea, in the voice. Do not repeat the summary.',
      o.watch ? '- "watch": 3 short items, each a concrete signal that would confirm or break a reading in the sections (a data release, a decision, a number to compare). No predictions as fact. Use only numbers, dates and names that appear in the sections above. Never invent a threshold, a deadline or an institution.' : '- "watch": an empty list.',
      '', 'Same style rules as the sections:');
    lines = lines.concat(STYLE_RULES, ['', 'Return STRICT JSON only: {"summary":"...","opening":"...","watch":["..."]}']);
    return lines.join('\n');
  }

  // ---------- Checks ----------
  function numTokens(t) {
    var out = [], m, re = /[$€£]?\d[\d,. ]*\d(?:\s?(?:%|percent|bn|billion|million|m|k))?|[$€£]\d|\d+\s?%/gi;
    while ((m = re.exec(t))) out.push(m[0]);
    return out;
  }
  function numKey(tok) { return String(tok).toLowerCase().replace(/[$€£\s %]|percent|billion|million|bn|[mk]$/g, '').replace(/,/g, '').replace(/\.$/, ''); }
  function checkText(text, corpus) {
    var res = { numbers: [], names: [], tells: [] };
    var corpusNums = {}; numTokens(corpus).forEach(function (t) { corpusNums[numKey(t)] = 1; });
    numTokens(text).forEach(function (t) {
      var k = numKey(t); if (!k || (/^\d$/.test(k) && !/[%$€£]/.test(t)) || k === '10' && !/[%$€£]/.test(t)) return;
      if (!corpusNums[k] && res.numbers.indexOf(t.trim()) === -1) res.numbers.push(t.trim());
    });
    var skip = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|The|This|That|These|Those|It|He|She|They|We|In|On|At|As|But|And|If|When|While|Some|One|Two|Three|According|However|What|Which|Who|Where|Why|How|Meanwhile|Still|Yet|Our|Their|Its|Here|There|Both|Each|After|Before|Since|Then|So|For|With|Without)$/;
    var re = /(?:^|[^.!?]\s)((?:[A-Z][a-zA-Z'’-]{2,})(?:\s[A-Z][a-zA-Z'’-]{2,})*)/g, m;
    while ((m = re.exec(text))) {
      var nm = m[1].replace(/^(?:The|This|That|These|Those|Our|Their|Its)\s+/, ''); if (!nm || skip.test(nm)) continue;
      var toks = nm.replace(/[’']s\b/g, '').split(/[\s-]+/).filter(function (t) { return t.length > 2 && !skip.test(t); });
      if (!toks.length || toks.some(function (t) { return corpus.indexOf(t.toLowerCase()) !== -1; })) continue;
      if (res.names.indexOf(nm) === -1) res.names.push(nm);
    }
    var unquoted = String(text).replace(/["\u201c][^"\u201d]{12,}["\u201d]/g, ' ');   // direct quotes are never machine tells
    TELL_RULES.forEach(function (r) {
      var mm, rx = new RegExp(r.re.source, r.re.flags);
      var found = []; while ((mm = rx.exec(unquoted)) && found.length < 3) { found.push(mm[0].trim()); if (mm.index === rx.lastIndex) rx.lastIndex++; }
      if (r.id === 'rule3' && found.length < 2) found = [];
      found.forEach(function (f) { res.tells.push({ id: r.id, label: r.label, snippet: dShort(f, 70) }); });
    });
    var low = unquoted.toLowerCase();
    TELL_WORDS.forEach(function (w) { if (low.indexOf(w) !== -1) res.tells.push({ id: 'word', label: 'Stock phrase', snippet: w }); });
    return res;
  }
  function problemsOf(ch) {
    var p = [];
    ch.tells.forEach(function (t) { p.push(t.label + ': "' + t.snippet + '"'); });
    if (ch.numbers.length) p.push('These numbers are not in the sources, remove or correct them: ' + ch.numbers.join(', '));
    if (ch.names.length) p.push('These names are not in the sources, remove them unless they are common words: ' + ch.names.slice(0, 8).join(', '));
    return p;
  }
  function plainDashes(t) { return t.replace(/,\s?—\s?/g, ', ').replace(/\s?—\s?/g, ', ').replace(/,\s–\s/g, ', ').replace(/\s–\s/g, ', '); }
  function parseParas(text) {
    var j = null; try { j = extractJson(text); } catch (e) {}
    var ps = j && (j.paragraphs || (j.text ? [j.text] : null));
    if (ps && ps.length) return { paras: ps.map(function (x) { return String(x).trim(); }).filter(Boolean), used: j.used || [], reading: Array.isArray(j.reading) ? j.reading.map(String).join('\n\n').trim() : (typeof j.reading === 'string' ? j.reading.trim() : '') };
    var raw = String(text || '').replace(/```[a-z]*/g, '').trim();
    if (raw.length > 80 && raw.charAt(0) !== '{') return { paras: raw.split(/\n{2,}/).map(function (x) { return x.trim(); }).filter(Boolean), used: [], reading: '' };
    throw new Error('The AI returned no usable text.');
  }

  // ---------- Writing one section ----------
  function auditSection(rec, srcs) {
    var text = rec.paras.join('\n\n'), rd = rec.reading || '';
    var prompt = ['Audit this section against its sources. Find every sentence, in the paragraphs or in the read, that states a fact, number, name, date, precedent, legal or procedural mechanism, or a motive that the SOURCES do not support. Delete each such sentence, or cut it back to exactly what the sources support. Keep everything else word for word. Add nothing new. If every sentence is supported, return the text unchanged and an empty "removed" list.',
      '', 'PARAGRAPHS:', text, '', 'READ:', rd, '', 'SOURCES:', sourceBlock(srcs), '',
      'Return STRICT JSON only: {"paragraphs":["..."],"reading":"...","removed":["short quote of each sentence you removed or cut back"]}'].join('\n');
    return callLLM(prompt, 'write', { best: true }).then(function (r) {
      var j = extractJson(r.text); if (!j || !Array.isArray(j.removed) || !j.removed.length || j.removed.length > 8) return;
      var np = (Array.isArray(j.paragraphs) ? j.paragraphs : []).map(function (x) { return String(x).trim(); }).filter(Boolean), nr = String(j.reading || '').trim();
      if (!np.length || nr.length < rd.length * 0.4 || np.join(' ').length < text.length * 0.5) return;
      rec.paras = np; rec.reading = nr; rec.audit = j.removed.map(function (x) { return dShort(String(x), 140); });
    }).catch(function (e) { LOG('digest audit failed:', e && e.message); });
  }
  function writeSection(c, s, stop) {
    if (state.digest && state.digest.kind === 'commentary') return commentaryWrite(c, s, stop);
    var words = WLEN[wrOptions()].words, rec = { sig: wrSig(c, s), at: Date.now(), status: 'writing', paras: [], sources: [], checks: null, note: '', edited: false, revised: false };
    wrDraft().sections[c.id] = rec; paintWrite();
    return gatherSources(c, stop).then(function (srcs) {
      if (stop()) throw new Error('stopped');
      if (!srcs.length) { rec.status = 'failed'; rec.note = 'No article in this section could be read, so nothing was written. Go back, move a readable story in, or remove the section.'; return; }
      rec.sources = srcs.map(function (x) { return { source: x.source, title: x.title, url: x.url, via: x.via }; });
      var corpus = sourceCorpus(srcs), chars = srcs.reduce(function (n, x) { return n + x.text.length; }, 0), thin = chars < 1100;
      rec.thin = thin; rec.chars = chars;
      return callLLM(sectionPrompt(c, s, srcs, words, thin), 'write', { best: true }).then(function (r) {
        var p = parseParas(r.text); rec.paras = p.paras; rec.reading = thin ? '' : p.reading; rec.model = r.model;
        var ch = checkText(plainDashes(p.paras.concat([rec.reading || '']).join('\n\n')), corpus), probs = problemsOf(ch);
        if (probs.length >= 2 && !stop()) {
          return callLLM(revisePrompt(p.paras.join('\n\n'), probs, srcs), 'write', { best: true }).then(function (r2) {
            var p2 = parseParas(r2.text), ch2 = checkText(plainDashes(p2.paras.join('\n\n')), corpus);
            if (problemsOf(ch2).length <= probs.length) { rec.paras = p2.paras; rec.revised = true; }
          }).catch(function (e) { LOG('digest revise failed:', e && e.message); });
        }
      }).then(function () { return thin || stop() || !rec.reading ? null : auditSection(rec, srcs); }).then(function () {
        rec.paras = rec.paras.map(plainDashes); rec.reading = plainDashes(rec.reading || '');
        rec.checks = checkText(rec.paras.concat([rec.reading]).join('\n\n'), corpus);
        rec.status = 'done';
      });
    }).catch(function (e) {
      if (e && e.message === 'stopped') { rec.status = 'stopped'; return; }
      rec.status = 'failed'; rec.note = 'The AI could not write this section: ' + dShort(e && e.message, 140);
    }).then(function () { touchDraft(); paintWrite(); });
  }
  function recheck(c, rec) {
    var corpus = sourceCorpus(c.ids.map(function (id) { return artCache[id]; }).filter(Boolean));
    if (!corpus.trim()) { toast('Sources are not loaded in this session. Press Rewrite to fetch them again.', 'error'); return; }
    rec.checks = checkText(rec.paras.concat([rec.reading || '']).join('\n\n'), corpus); digestSave(); paintWrite();
  }


  // ---------- Fix machine-sounding phrasing ----------
  function sentencesOf(t) { return String(t).match(/[^.!?]+[.!?]+["”’')\]]*\s*|[^.!?]+$/g) || [String(t)]; }
  function tellsIn(t) { return checkText(t, 'x').tells; }
  function flaggedIn(r) {
    var items = [];
    r.paras.forEach(function (p, pi) { var inQ = false; sentencesOf(p).forEach(function (st, si) { var qn = (st.match(/["\u201c\u201d]/g) || []).length, startsIn = inQ; if (qn % 2) inQ = !inQ; if (startsIn || qn) return; var tl = tellsIn(st); if (tl.length) items.push({ k: 'p', pi: pi, si: si, text: st.trim(), why: tl.map(function (x) { return x.label + ' "' + x.snippet + '"'; }).join('; ') }); }); });
    if (r.reading) sentencesOf(r.reading).forEach(function (st, si) { var tl = tellsIn(st); if (tl.length) items.push({ k: 'r', pi: 0, si: si, text: st.trim(), why: tl.map(function (x) { return x.label + ' "' + x.snippet + '"'; }).join('; ') }); });
    return items.slice(0, 12);
  }
  function numSet(t) { return numTokens(t).map(numKey).filter(Boolean).sort().join('|'); }
  var fixBusy = false;
  function fixTells(c, r) {
    if (fixBusy || wrBusy) return; if (!dKey()) { toast('Fixing needs an AI key.', 'error'); return; }
    var items = flaggedIn(r); if (!items.length) { toast('Nothing flagged to fix in the text.', ''); return; }
    fixBusy = true; paintWrite();
    var prompt = ['Rewrite each numbered sentence so the listed problem is gone. Write it the way a plain-spoken human reporter would. Keep every fact, number, name and quote exactly, keep the meaning and the voice, and keep roughly the same length. Do not merge sentences or add facts. Do not use dashes as pauses.', ''].concat(items.map(function (x, i) { return (i + 1) + '. [' + x.why + '] ' + x.text; }), ['', 'Return STRICT JSON only: {"sentences":["...","..."]} with exactly ' + items.length + ' entries in the same order.']).join('\n');
    callLLM(prompt, 'write', { best: true }).then(function (res) {
      var j = extractJson(res.text), out = Array.isArray(j.sentences) ? j.sentences.map(socTx) : [];
      if (out.length !== items.length) throw new Error('the AI returned ' + out.length + ' sentences for ' + items.length);
      r.undo = { paras: r.paras.slice(), reading: r.reading || '' };
      var paras = r.paras.map(function (p) { return sentencesOf(p); }), rd = sentencesOf(r.reading || ''), done = 0;
      items.forEach(function (it, i) {
        var nw = plainDashes(String(out[i] || '').trim()); if (!nw || numSet(nw) !== numSet(it.text)) return;
        var arr = it.k === 'p' ? paras[it.pi] : rd, trail = (arr[it.si].match(/\s*$/) || [''])[0]; arr[it.si] = nw + trail; done++;
      });
      r.paras = paras.map(function (a) { return a.join('').trim(); }).filter(Boolean); if (r.reading) r.reading = rd.join('').trim();
      r.edited = true; r.fixed = done;
      var corpus = sourceCorpus(c.ids.map(function (id) { return artCache[id]; }).filter(Boolean));
      r.checks = corpus.trim() ? checkText(r.paras.concat([r.reading || '']).join('\n\n'), corpus) : Object.assign({}, r.checks, { tells: checkText(r.paras.concat([r.reading || '']).join('\n\n'), 'x').tells });
      toast(done ? 'Rewrote ' + done + ' flagged sentence' + (done === 1 ? '' : 's') + '. Read them. Undo is under the text.' : 'The AI changed no sentence safely (numbers must stay the same). Edit by hand or press Rewrite.', done ? 'success' : '');
    }).catch(function (e) { toast('Could not fix the phrasing (' + dShort(e && e.message, 100) + ').', 'error'); })
      .then(function () { fixBusy = false; touchDraft(); paintWrite(); });
  }
  function readOpeners() {
    var dr = wrDraft(), by = {}, total = 0;
    includedSections().forEach(function (x) {
      var r = dr.sections[x.c.id]; if (!r || !r.reading) return; total++;
      var k = r.reading.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).slice(0, 3).join(' '); (by[k] = by[k] || []).push(x.c.id);
    });
    var worst = Object.keys(by).sort(function (a, b) { return by[b].length - by[a].length; })[0];
    return worst && by[worst].length >= 3 ? { phrase: worst, n: by[worst].length, total: total, ids: by[worst] } : null;
  }
  function varyReads() {
    if (fixBusy || wrBusy) return; if (!dKey()) { toast('This needs an AI key.', 'error'); return; }
    var dr = wrDraft(), list = includedSections().map(function (x) { return { c: x.c, r: dr.sections[x.c.id], h: x.s.heading }; }).filter(function (x) { return x.r && x.r.reading; });
    if (list.length < 3) return; fixBusy = true; paintWrite();
    var prompt = ['These are the short "Our read" reasoning boxes of one article, one per section. Several open with the same words. Rewrite each so that no two open the same way and the sentence shapes differ. Keep each one\'s meaning, every fact, number and name, its hedging (it is reasoning, not fact), and its length. Start with the claim itself or a plain marker. Never start with "One reading is" or "This suggests". No dashes as pauses.', ''].concat(list.map(function (x, i) { return (i + 1) + '. (' + x.h + ') ' + x.r.reading; }), ['', 'Return STRICT JSON only: {"reads":["..."]} with exactly ' + list.length + ' entries in the same order.']).join('\n');
    callLLM(prompt, 'write', { best: true }).then(function (res) {
      var j = extractJson(res.text), out = Array.isArray(j.reads) ? j.reads.map(socTx) : []; if (out.length !== list.length) throw new Error('the AI returned ' + out.length + ' for ' + list.length);
      var n = 0; list.forEach(function (x, i) { var nw = plainDashes(out[i]); if (nw && numSet(nw) === numSet(x.r.reading)) { x.r.undo = { paras: x.r.paras.slice(), reading: x.r.reading }; x.r.reading = nw; x.r.edited = true; n++; } });
      list.forEach(function (x) { var corpus = sourceCorpus(x.c.ids.map(function (id) { return artCache[id]; }).filter(Boolean)); x.r.checks = corpus.trim() ? checkText(x.r.paras.concat([x.r.reading]).join('\n\n'), corpus) : x.r.checks; });
      toast('Reworded ' + n + ' of ' + list.length + ' reasoning boxes.', n ? 'success' : '');
    }).catch(function (e) { toast('Could not reword them (' + dShort(e && e.message, 100) + ').', 'error'); })
      .then(function () { fixBusy = false; touchDraft(); renderWrite(); });
  }

  // ---------- Whole article ----------
  function includedSections() {
    var d = state.digest, o = d.outline; if (!o) return [];
    return o.sections.filter(function (s) { return s.include; }).map(function (s) { return { s: s, c: d.clusters.filter(function (x) { return x.id === s.cid; })[0] }; }).filter(function (x) { return x.c; });
  }
  function cleanFrameText(t, maxWords) {
    t = String(t || '');
    var cut = t.search(/<\/?tool_call>|<\/?think>|['"]\s*,\s*['"](?:opening|watch|summary)['"]\s*:|\{\s*['"](?:summary|opening)|The user (?:wants|asked|provided)/i);
    if (cut >= 0) t = t.slice(0, cut);
    t = t.replace(/\s+/g, ' ').trim();
    var sent = t.split(/(?<=[.!?])\s+(?=[A-Z"\u201c])/), out = [], w = 0;
    for (var i = 0; i < sent.length; i++) { var n = sent[i].trim().split(/\s+/).length; if (out.length && w + n > maxWords) break; out.push(sent[i].trim()); w += n; }
    return out.join(' ').replace(/['"]\s*,?\s*$/, '').trim();
  }
  function writeFrame(stop) {
    var d = state.digest, o = d.outline, dr = wrDraft();
    var secs = includedSections().map(function (x) { var r = dr.sections[x.c.id]; return r && r.status === 'done' ? { heading: x.s.heading, lens: x.s.lens, text: r.paras.join('\n\n') + (r.reading ? '\n\n(Our read) ' + r.reading : '') } : null; }).filter(Boolean);
    if (!secs.length) return Promise.resolve();
    return callLLM(framePrompt(o, secs), 'write', { best: true }).then(function (r) {
      var j = extractJson(r.text);
      dr.frame = { summary: plainDashes(cleanFrameText(j.summary, 95)), opening: plainDashes(cleanFrameText(j.opening, 60)), watch: (Array.isArray(j.watch) ? j.watch : []).map(function (x) { return plainDashes(cleanFrameText(x, 40)); }).filter(function (x) { return x && x.length > 25 && /^[A-Z]/.test(x); }).slice(0, 4), at: Date.now() };
      invalidateReview();
    }).catch(function (e) { toast('The AI could not write the summary (' + dShort(e && e.message, 100) + '). Press "Write summary" to retry.', 'error'); });
  }
  function runWrite(only) {
    var d = state.digest; if (!d.outline) { toast('Plan the outline first.', 'error'); return Promise.resolve(false); }
    if (!dKey()) { toast('Writing needs an AI key. Add one under API keys.', 'error'); return Promise.resolve(false); }
    if (wrBusy) return Promise.resolve(false);
    var list = includedSections(); if (!list.length) { toast('Switch at least one section on in the outline.', 'error'); return Promise.resolve(false); }
    var dr = wrDraft(); wrBusy = true; var mine = ++wrRun; var stop = function () { return mine !== wrRun; };
    var todo = only ? list.filter(function (x) { return x.c.id === only; }) : list.filter(function (x) { var r = dr.sections[x.c.id]; return !r || r.status !== 'done' || r.sig !== wrSig(x.c, x.s); });
    if (!todo.length) { wrBusy = false; if (only) toast('That section is no longer in the outline.', 'error'); else toast('Every section is already written. Use Rewrite on one to redo it.', ''); return Promise.resolve(!only); }
    paintWrite();
    var i = 0;
    function next() {
      if (stop() || i >= todo.length) return Promise.resolve();
      var x = todo[i++]; var pr = document.getElementById('dgs-wr-prog-label'); if (pr) pr.textContent = 'Writing section ' + i + ' of ' + todo.length + ': ' + dShort(x.s.heading, 50) + '…';
      return writeSection(x.c, x.s, stop).then(function () { return sleep(400); }).then(next);
    }
    return next().then(function () { if (stop()) return; var pr = document.getElementById('dgs-wr-prog-label'); if (pr) pr.textContent = 'Writing the summary…'; return writeFrame(stop); })
      .then(function () { if (!stop()) { wrBusy = false; digestSave(); paintWrite(); renderWrite(); toast('Draft ready. Read it, edit it, check the flags.', 'success'); return true; } return false; });
  }

  // ---------- Markdown ----------
  function draftMarkdown() {
    var d = state.digest, o = d.outline, dr = wrDraft(); if (!o) return '';
    var out = ['# ' + o.headline, ''];
    if (o.summary && dr.frame && dr.frame.summary) out.push(dr.frame.summary, '');
    if (dr.frame && dr.frame.opening) out.push(dr.frame.opening, '');
    includedSections().forEach(function (x) {
      var r = dr.sections[x.c.id]; if (!r || !r.paras.length) return;
      out.push('## ' + x.s.heading, '', r.paras.join('\n\n'), '');
      if (r.reading) out.push('> Our read: ' + r.reading.split(/\n{2,}/).join('\n>\n> '), '');
      var srcs = r.sources.filter(function (z) { return z.url; }).map(function (z) { return '[' + z.source + '](' + z.url + ')'; });
      if (srcs.length) out.push('Sources: ' + srcs.join(', '), '');
    });
    if (o.watch && dr.frame && dr.frame.watch && dr.frame.watch.length) { out.push('## What to watch', ''); dr.frame.watch.forEach(function (w) { out.push('- ' + w); }); out.push(''); }
    return out.join('\n');
  }
  function wordCount() {
    var dr = wrDraft(), n = 0;
    includedSections().forEach(function (x) { var r = dr.sections[x.c.id]; if (r) n += (r.paras.join(' ') + ' ' + (r.reading || '')).split(/\s+/).filter(Boolean).length; });
    if (dr.frame) n += (dr.frame.summary + ' ' + dr.frame.opening + ' ' + (dr.frame.watch || []).join(' ')).split(/\s+/).filter(Boolean).length;
    return n;
  }

  // ---------- UI ----------
  function paintWrite() {
    var pr = document.getElementById('dgs-wr-prog'); if (pr) pr.hidden = !wrBusy;
    var go = document.getElementById('dgs-wr-run'), st = document.getElementById('dgs-wr-stop');
    if (go) { go.disabled = wrBusy; var dr = state.digest.draft; go.textContent = dr && Object.keys(dr.sections || {}).length ? 'Write missing or changed sections' : 'Write the article'; }
    if (st) st.hidden = !wrBusy;
    var cp = document.getElementById('dgs-wr-copy'); if (cp) cp.disabled = !Object.keys((state.digest.draft || {}).sections || {}).length;
    var wc = document.getElementById('dgs-wr-count'); if (wc) { var n = wordCount(); wc.textContent = n ? n + ' words' : ''; }
    $$('.dgs-wr-sec').forEach(function (n) { var sv = n._paint; if (sv) sv(); });
  }
  function chip(txt, cls, title) { return el('span', { class: 'dgs-chip ' + cls, text: txt, title: title || '' }); }
  function renderWrite() {
    var box = document.getElementById('dgs-wr-body'); if (!box) return;
    var d = state.digest; box.innerHTML = '';
    var sel = document.getElementById('dgs-wr-len'); if (sel) sel.value = wrOptions();
    var rls = document.getElementById('dgs-wr-readlen'); if (rls) rls.value = readLenMode();
    if (!d.outline) { box.appendChild(el('p', { class: 'dgs-hint', text: 'Plan the outline first.' })); paintWrite(); return; }
    if (!dKey()) box.appendChild(el('p', { class: 'dgs-clu-warn', text: 'Writing needs an AI key. Open API keys and add one.' }));
    var dr = wrDraft();
    var rep = readOpeners();
    if (rep) {
      var bn = el('div', { class: 'dgs-clu-warn dgs-wr-rep' }); bn.appendChild(document.createTextNode(rep.n + ' of ' + rep.total + ' "Our read" boxes open with "' + rep.phrase + '". Readers spot that at once. '));
      var vb = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Vary the openings' }); vb.addEventListener('click', varyReads); bn.appendChild(vb); box.appendChild(bn);
    }
    includedSections().forEach(function (x, i) {
      var c = x.c, s = x.s;
      var card = el('div', { class: 'dgs-clu dgs-wr-sec' });
      var head = el('div', { class: 'dgs-clu-head' });
      head.appendChild(el('span', { class: 'dgs-clu-n', text: String(i + 1) }));
      head.appendChild(el('strong', { class: 'dgs-wr-h', text: s.heading }));
      head.appendChild(chip(dLens(s.lens).label, 'is-muted'));
      var stat = el('span', { class: 'dgs-chip' }); head.appendChild(stat);
      var tools = el('div', { class: 'dgs-clu-tools' });
      var lensSel = el('select', { class: 'dgs-clu-move', 'aria-label': 'Lens for this rewrite' });
      DLENS.forEach(function (l) { var op = el('option', { value: l.id, text: l.label }); if (l.id === s.lens) op.selected = true; lensSel.appendChild(op); });
      var rw = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Rewrite' });
      rw.addEventListener('click', function () { if (lensSel.value !== s.lens) { s.lens = lensSel.value; s.why = 'Chosen by you.'; digestSave(); } var r0 = dr.sections[c.id]; if (r0 && r0.edited && !confirm('This section has your edits. Rewriting replaces them. Continue?')) return; runWrite(c.id); });
      tools.appendChild(lensSel); tools.appendChild(rw); head.appendChild(tools);
      card.appendChild(head);
      var body = el('div', { class: 'dgs-wr-text' }); card.appendChild(body);
      var flags = el('div', { class: 'dgs-wr-flags' }); card.appendChild(flags);
      var srcs = el('p', { class: 'dgs-out-src' }); card.appendChild(srcs);
      card._paint = function () {
        var r = dr.sections[c.id]; body.innerHTML = ''; flags.innerHTML = ''; srcs.textContent = '';
        stat.className = 'dgs-chip is-muted'; stat.textContent = 'Not written';
        if (!r) { body.appendChild(el('p', { class: 'dgs-hint', text: 'Not written yet.' })); return; }
        if (r.status === 'writing') { stat.textContent = 'Writing…'; body.appendChild(el('p', { class: 'dgs-hint', text: 'Reading the articles and writing…' })); return; }
        if (r.status === 'failed') { stat.className = 'dgs-chip is-bad'; stat.textContent = 'Failed'; body.appendChild(el('p', { class: 'dgs-clu-warn', text: r.note })); return; }
        if (r.status === 'stopped') { stat.textContent = 'Stopped'; return; }
        var stale = r.sig !== wrSig(c, s);
        var ch = r.checks || { numbers: [], names: [], tells: [] };
        var issues = ch.numbers.length + ch.tells.length;
        stat.className = 'dgs-chip ' + (stale ? 'is-warn' : issues ? 'is-warn' : 'is-ok');
        stat.textContent = stale ? 'Out of date' : issues ? issues + ' to check' : '✓ Checks passed';
        var ta = el('textarea', { class: 'dgs-out-input dgs-wr-ta', rows: String(Math.max(6, r.paras.join('\n\n').split('\n').length + 2)), 'aria-label': 'Section text' });
        ta.value = r.paras.join('\n\n');
        ta.addEventListener('change', function () { r.paras = ta.value.split(/\n{2,}/).map(function (z) { return z.trim(); }).filter(Boolean); r.edited = true; touchDraft(); var wc = document.getElementById('dgs-wr-count'); if (wc) wc.textContent = wordCount() + ' words'; });
        body.appendChild(ta);
        var rd = el('textarea', { class: 'dgs-out-input dgs-wr-ta', rows: '9', 'aria-label': 'Our read', placeholder: 'Our read: a short, labelled piece of reasoning. Shown in its own box. Leave empty for none.' });
        rd.value = r.reading || '';
        rd.addEventListener('change', function () { r.reading = rd.value.trim(); r.edited = true; touchDraft(); });
        body.appendChild(el('p', { class: 'dgs-hint', text: 'Our read (reasoning, shown in its own box, kept apart from the reported facts):' })); body.appendChild(rd);
        var bar = el('div', { class: 'dgs-wr-bar' });
        var rc = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Re-run checks' }); rc.addEventListener('click', function () { r.paras = ta.value.split(/\n{2,}/).map(function (z) { return z.trim(); }).filter(Boolean); r.reading = rd.value.trim(); recheck(c, r); });
        bar.appendChild(rc);
        bar.appendChild(el('span', { class: 'dgs-hint', text: (r.revised ? 'Rewritten once to remove flagged phrasing. ' : '') + (r.audit && r.audit.length ? 'Audit removed ' + r.audit.length + ' sentence' + (r.audit.length === 1 ? '' : 's') + ' the sources did not support. ' : '') + (r.thin ? 'Thin source: written short. ' : '') + (r.edited ? 'Edited by you. ' : '') + r.paras.join(' ').split(/\s+/).filter(Boolean).length + ' words' }));
        body.appendChild(bar);
        if (stale) flags.appendChild(el('p', { class: 'dgs-clu-warn', text: 'The stories, heading or lens changed since this was written. Press Rewrite to refresh it.' }));
        if (ch.numbers.length) { flags.appendChild(el('p', { class: 'dgs-clu-warn', text: 'Numbers not found in the sources: ' + ch.numbers.join(', ') + '. Check each against the article, or delete it.' })); var rmb = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Remove the sentences with these numbers' }); rmb.addEventListener('click', removeUnsupported); flags.appendChild(rmb); }
        if (ch.names.length) flags.appendChild(el('p', { class: 'dgs-hint', text: 'Names not found in the sources (may be fine): ' + ch.names.slice(0, 8).join(', ') }));
        if (ch.tells.length) {
          var tl = el('p', { class: 'dgs-clu-warn' }); tl.appendChild(document.createTextNode('Reads like machine writing here: '));
          tl.appendChild(document.createTextNode(ch.tells.map(function (t) { return t.label + ' "' + t.snippet + '"'; }).join(' · ')));
          flags.appendChild(tl);
          var fx = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Fix these sentences' }); fx.disabled = fixBusy || wrBusy; fx.addEventListener('click', function () { fixTells(c, r); }); flags.appendChild(fx);
        }
        if (r.undo) {
          var un = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Undo the fix' });
          un.addEventListener('click', function () { r.paras = r.undo.paras; r.reading = r.undo.reading; delete r.undo; var corpus = sourceCorpus(c.ids.map(function (id) { return artCache[id]; }).filter(Boolean)); if (corpus.trim()) r.checks = checkText(r.paras.concat([r.reading || '']).join('\n\n'), corpus); touchDraft(); paintWrite(); });
          flags.appendChild(un);
        }
        srcs.appendChild(document.createTextNode('Written from: '));
        r.sources.forEach(function (z, k) {
          if (k) srcs.appendChild(document.createTextNode(' · '));
          srcs.appendChild(z.url ? el('a', { href: z.url, target: '_blank', rel: 'noopener noreferrer', text: z.source + (z.via === 'alternative' ? ' (other outlet)' : '') }) : document.createTextNode(z.source));
        });
        if (r.model) srcs.appendChild(document.createTextNode(' · model: ' + r.model));
      };
      box.appendChild(card); card._paint();
    });
    var fr = dr.frame;
    if (fr) {
      var fc = el('div', { class: 'dgs-out-card' });
      fc.appendChild(el('h3', { class: 'dgs-out-h', text: 'Summary, opening and what to watch' }));
      var mk = function (lab, val, set, rows) { var w = el('label', { class: 'dgs-field' }); w.appendChild(el('span', { class: 'dgs-label', text: lab })); var t = el('textarea', { class: 'dgs-out-input', rows: String(rows) }); t.value = val; t.addEventListener('change', function () { set(t.value.trim()); digestSave(); }); w.appendChild(t); fc.appendChild(w); };
      mk('Summary at the top (answer-first)', fr.summary, function (v) { fr.summary = v; }, 3);
      mk('Opening', fr.opening, function (v) { fr.opening = v; }, 2);
      if (d.outline.watch) mk('What to watch (one per line)', (fr.watch || []).join('\n'), function (v) { fr.watch = v.split('\n').map(function (z) { return z.trim(); }).filter(Boolean); }, 4);
      var rf = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Write summary again' });
      rf.addEventListener('click', function () { if (wrBusy) return; wrBusy = true; wrRun++; var mine = wrRun; paintWrite(); writeFrame(function () { return mine !== wrRun; }).then(function () { wrBusy = false; digestSave(); renderWrite(); }); });
      fc.appendChild(rf); box.appendChild(fc);
    }
    paintWrite();
  }
  function writeBind() {
    var g = function (id, fn) { var n = document.getElementById(id); if (n) n.addEventListener('click', fn); };
    g('dgs-wr-run', function () { runWrite(); });
    g('dgs-wr-stop', function () { wrRun++; wrBusy = false; $$('.dgs-wr-sec').forEach(function (n) { }); var dr = wrDraft(); Object.keys(dr.sections).forEach(function (k) { if (dr.sections[k].status === 'writing') dr.sections[k].status = 'stopped'; }); digestSave(); renderWrite(); toast('Writing stopped.', ''); });
    g('dgs-wr-back', function () { setStep('outline'); });
    g('dgs-wr-copy', function () { copyText(draftMarkdown()); toast('Draft copied as Markdown.', 'success'); });
    g('dgs-out-next', function () { if (!state.digest.outline) { toast('Plan the outline first.', 'error'); return; } setStep('write'); });
    var l = document.getElementById('dgs-wr-len'); if (l) l.addEventListener('change', function () { state.digest.length = l.value; digestSave(); });
    var rl = document.getElementById('dgs-wr-readlen'); if (rl) rl.addEventListener('change', function () { state.digest.readLen = rl.value; digestSave(); });
  }

  // =====================================================================
  // Stage 3 + 4: Review (read it as a reader would, fix flags, confirm) and Export (WordPress-ready HTML, SEO fields, feature image).
  // =====================================================================
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }
  function slugify(t, max) {
    var s = String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (max && s.length > max) { s = s.slice(0, max); s = s.replace(/-[^-]*$/, '') || s; }
    return s || 'section';
  }
  function dReview() {
    var d = state.digest; if (!d.review) d.review = { reviewed: false, seo: null, disclose: true, nav: true, disclosure: '', alt: '', style: lastStyle(), credit: true };
    return d.review;
  }
  function pubName() { return (state.profile && state.profile.name) || 'Our digest'; }
  function defaultDisclosure() { return 'Drafted with Autonom Digest from the sources linked in each section, then reviewed and edited by ' + pubName() + '.'; }
  function noteHtml(text, credit) {
    var h = esc(text);
    if (credit) h = h.replace(/Autonom Digest/, '<a href="https://autonom.app/ai/digest/" target="_blank" rel="noopener">Autonom Digest</a>');
    return h;
  }
  var STYLE_LS = 'autonom.dgs.style.v1';
  function lastStyle() { try { return localStorage.getItem(STYLE_LS) || 'studio'; } catch (e) { return 'studio'; } }
  function styleList() {
    var out = [{ id: 'studio', name: 'Studio', desc: 'Clean sans, navy and amber. The default.', sw: ['#ffffff', '#f5a524', '#141a2a'] }], re = /\/\* @style:(\w+) \| ([^|]+)\| ([^|]+)\| ([^*]+)\*\//g, m;
    while ((m = re.exec(DIGEST_CSS))) out.push({ id: m[1], name: m[2].trim(), desc: m[3].trim(), sw: m[4].trim().split(',') });
    return out;
  }
  function cssFor(id) {
    var i0 = DIGEST_CSS.indexOf('/* @style:'), base = i0 < 0 ? DIGEST_CSS : DIGEST_CSS.slice(0, i0);
    if (id === 'all' || i0 < 0) return DIGEST_CSS;
    var mk = DIGEST_CSS.indexOf('/* @style:' + id + ' |'); if (mk < 0) return base;
    var nx = DIGEST_CSS.indexOf('/* @style:', mk + 5); return base + '\n' + DIGEST_CSS.slice(mk, nx < 0 ? DIGEST_CSS.length : nx).trim() + '\n';
  }
  function curStyle() { var id = dReview().style || lastStyle() || 'studio'; return styleList().some(function (x) { return x.id === id; }) ? id : 'studio'; }
  function dateHuman(t) { try { return new Date(t || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } }

  function reviewStatus() {
    var dr = wrDraft(), list = includedSections(), st = { total: list.length, done: 0, stale: 0, numbers: 0, tells: 0, missing: [], thin: 0, frame: !!(dr.frame && dr.frame.summary) };
    list.forEach(function (x) {
      var r = dr.sections[x.c.id];
      if (!r || r.status !== 'done') { st.missing.push(x.s.heading); return; }
      st.done++; if (r.thin) st.thin++;
      if (r.sig !== wrSig(x.c, x.s)) st.stale++;
      if (r.checks) { st.numbers += r.checks.numbers.length; st.tells += r.checks.tells.length; }
    });
    return st;
  }

  /*DGS_CSS_BEGIN*/
  var DIGEST_CSS = "/* Autonom Digest: article styles.\n   Add this once in WordPress (Appearance > Customize > Additional CSS, or a WPCode CSS snippet).\n   Each article is wrapped in <div class=\"digest digest-s-NAME\">. Pick the style per article in the tool.\n   Change the colours in the first block (or in a style block) to match your site. Everything is scoped to .digest. */\n.digest {\n  --d-ink: #141a2a; --d-dim: #4f5a6e; --d-mute: #7a869b; --d-line: #e3e7ef; --d-soft: #f5f7fb;\n  --d-acc: #f5a524; --d-acc-ink: #a86500; --d-blue: #3157f0; --d-blue-soft: #eef2ff; --d-navy: #0d1424;\n  --d-serif: Georgia, \"Times New Roman\", serif; --d-head: inherit; --d-r: 12px;\n  --d-bg: transparent; --d-pad: 0 clamp(1rem, 4vw, 1.75rem);\n  --d-sum-bg: var(--d-soft); --d-sum-bar: var(--d-acc); --d-read-bg: var(--d-blue-soft); --d-read-bar: var(--d-blue); --d-read-ink: var(--d-blue);\n  --d-watch-bg: var(--d-navy); --d-watch-ink: #e7ebf5; --d-watch-head: #fff; --d-watch-dim: #9aa7c2; --d-watch-line: rgba(255, 255, 255, .13); --d-watch-dot: var(--d-acc); --d-watch-dot-ink: var(--d-navy);\n  --d-pull-font: var(--d-serif); --d-link: var(--d-blue);\n  container-type: inline-size; color: var(--d-ink); font-size: 1.0625rem; line-height: 1.72; max-width: 100%;\n  background: var(--d-bg); padding: var(--d-pad); border-radius: var(--d-r);\n}\n.digest * { box-sizing: border-box; }\n.digest p { margin: 0 0 1.05em; }\n.digest a { color: var(--d-link); text-underline-offset: 2px; }\n\n/* Theme-proofing: some themes pad or space .wp-block-group. These rules are a little more specific than the theme's. */\n.digest.wp-block-group { margin-left: 0; margin-right: 0; max-width: 100%; padding: var(--d-pad); border: 0; background: var(--d-bg); border-radius: var(--d-r); }\n.digest .digest-section.wp-block-group { margin-top: 3rem; margin-left: 0; margin-right: 0; max-width: 100%; padding: 1.6rem 0 0; border: 0; border-top: 1px solid var(--d-line); border-radius: 0; background: transparent; }\n.digest .digest-section.is-brief.wp-block-group { padding: 1.2rem 1.4rem; border: 1px solid var(--d-line); border-radius: var(--d-r); background: var(--d-soft); }\n.digest .digest-text, .digest .digest-aside { min-width: 0; max-width: 100%; margin-left: 0; margin-right: 0; }\n.digest .digest-opening { font-size: 1.08em; line-height: 1.66; color: var(--d-dim); margin: 0 0 1.4rem; }\n\n/* Top of the article */\n.digest .digest-meta { font-size: .78rem; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--d-mute); margin: 0 0 1.2rem; }\n.digest .digest-summary { position: relative; background: var(--d-sum-bg); border-left: 4px solid var(--d-sum-bar); border-radius: 0 var(--d-r) var(--d-r) 0; padding: 1.1rem 1.3rem 1.1rem 1.4rem; font-size: 1.14em; line-height: 1.6; font-weight: 500; margin: 0 0 1.6rem; }\n.digest .digest-summary::before { content: \"In short\"; display: block; font-size: .68rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--d-acc-ink); margin-bottom: .45rem; }\n\n/* Contents */\n.digest .digest-toc { margin: 2rem 0 .5rem; padding: 1.1rem 1.3rem; border: 1px solid var(--d-line); border-radius: var(--d-r); }\n.digest .digest-toc-title { font-size: .68rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--d-mute); margin: 0 0 .6rem; }\n.digest .digest-toc ol { list-style: none; counter-reset: dgt; margin: 0; padding: 0; display: grid; gap: .1rem 2rem; }\n.digest .digest-toc li { counter-increment: dgt; margin: 0; padding: .4rem 0; border-top: 1px solid var(--d-line); font-size: .96rem; line-height: 1.4; }\n.digest .digest-toc li::before { content: counter(dgt, decimal-leading-zero); display: inline-block; width: 2.1em; font-weight: 700; color: var(--d-acc-ink); font-variant-numeric: tabular-nums; }\n.digest .digest-toc a { color: var(--d-ink); text-decoration: none; }\n.digest .digest-toc a:hover { color: var(--d-link); text-decoration: underline; }\n\n/* A section */\n.digest .digest-section { margin-top: 3rem; padding-top: 1.6rem; border-top: 1px solid var(--d-line); }\n.digest .digest-kicker { font-size: .7rem; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; color: var(--d-acc-ink); margin: 0 0 .35rem; }\n.digest .digest-section h2 { font-family: var(--d-head); font-size: 1.75em; line-height: 1.2; margin: 0 0 .9rem; letter-spacing: -.01em; color: var(--d-ink); }\n.digest .digest-split { display: block; }\n.digest .digest-aside { margin: 1.4rem 0; }\n.digest .digest-aside > * + * { margin-top: 1rem; }\n.digest .digest-chart { margin: 0; }\n.digest .digest-chart svg { display: block; width: 100%; height: auto; }\n.digest .digest-chart figcaption { font-size: .78rem; color: var(--d-mute); margin-top: .45rem; line-height: 1.4; }\n\n/* Pull quote */\n.digest .digest-pullquote { margin: 1.8rem 0; padding: 1.1rem 0 0; border: 0; border-top: 3px solid var(--d-acc); }\n.digest .digest-pullquote p { font-family: var(--d-pull-font); font-size: 1.4em; line-height: 1.38; font-weight: 600; letter-spacing: -.005em; margin: 0; color: var(--d-ink); }\n\n/* Our read: reasoning, kept apart from reported facts */\n.digest .digest-read { background: var(--d-read-bg); border-left: 4px solid var(--d-read-bar); border-radius: 0 var(--d-r) var(--d-r) 0; padding: .95rem 1.2rem; margin: 1.5rem 0; }\n.digest .digest-read-label { font-size: .68rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--d-read-ink); margin: 0 0 .35rem; }\n.digest .digest-read p:not(.digest-read-label) { font-size: .98em; line-height: 1.6; }\n.digest .digest-read p:last-child { margin: 0; }\n\n/* Short sections */\n.digest .digest-section.is-brief { background: var(--d-soft); border: 1px solid var(--d-line); border-radius: var(--d-r); padding: 1.2rem 1.4rem; }\n.digest .digest-section.is-brief h2 { font-size: 1.25em; margin-bottom: .5rem; }\n.digest .digest-section.is-brief p:last-child { margin-bottom: 0; }\n\n/* Sources */\n.digest .digest-sources { font-size: .8rem; color: var(--d-mute); line-height: 1.5; margin: 1.1rem 0 0; padding-top: .7rem; border-top: 1px dotted var(--d-line); }\n.digest .digest-sources a { color: var(--d-dim); font-weight: 600; text-decoration: none; border-bottom: 1px solid var(--d-line); }\n.digest .digest-sources a:hover { color: var(--d-link); border-color: var(--d-link); }\n\n/* What to watch */\n.digest .digest-watch { margin-top: 3rem; background: var(--d-watch-bg); color: var(--d-watch-ink); border-radius: calc(var(--d-r) + 2px); padding: 1.6rem 1.5rem 1.2rem; }\n.digest .digest-watch h2 { color: var(--d-watch-head); margin: 0 0 .3rem; font-size: 1.5em; line-height: 1.2; font-family: var(--d-head); }\n.digest .digest-watch-sub { color: var(--d-watch-dim); font-size: .85rem; margin: 0 0 1rem; }\n.digest .digest-watch ol { list-style: none; counter-reset: dgw; margin: 0; padding: 0; display: grid; gap: .2rem 1.6rem; }\n.digest .digest-watch li { counter-increment: dgw; display: grid; grid-template-columns: 2rem minmax(0, 1fr); gap: .7rem; padding: .85rem 0; border-top: 1px solid var(--d-watch-line); font-size: .98rem; line-height: 1.55; color: var(--d-watch-ink); }\n.digest .digest-watch li::before { content: counter(dgw); width: 1.7rem; height: 1.7rem; border-radius: 50%; background: var(--d-watch-dot); color: var(--d-watch-dot-ink); font-weight: 800; font-size: .85rem; display: inline-flex; align-items: center; justify-content: center; }\n\n.digest .digest-note { font-size: .82rem; font-style: italic; color: var(--d-mute); margin: 2.2rem 0 0; padding-top: .8rem; border-top: 1px solid var(--d-line); }\n.digest .digest-note a { color: var(--d-dim); font-weight: 600; }\n\n/* Wider containers: two columns */\n@container (min-width: 620px) {\n  .digest .digest-toc ol { grid-template-columns: 1fr 1fr; }\n  .digest .digest-watch ol { grid-template-columns: 1fr 1fr; }\n}\n@container (min-width: 860px) {\n  .digest .digest-split { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 2.4rem; align-items: start; }\n  .digest .digest-split .digest-aside { margin: .3rem 0 0; position: sticky; top: 1.5rem; }\n}\n@media (max-width: 480px) {\n  .digest .digest-summary { font-size: 1.05em; }\n  .digest .digest-section h2 { font-size: 1.5em; }\n  .digest .digest-pullquote p { font-size: 1.22em; }\n}\n\n/* @style:editorial | Editorial | Warm paper, serif headlines, red accent | #fbf8f3,#b3261e,#1b1b1b */\n.digest.digest-s-editorial { --d-ink: #1b1b1b; --d-dim: #4a4540; --d-mute: #857d72; --d-line: #e4dccf; --d-soft: #f3ece0; --d-acc: #b3261e; --d-acc-ink: #b3261e; --d-blue: #8c1d18; --d-link: #8c1d18; --d-blue-soft: #f3ece0; --d-read-bar: #b3261e; --d-read-ink: #b3261e; --d-sum-bg: transparent; --d-sum-bar: #b3261e; --d-head: Georgia, \"Times New Roman\", serif; --d-r: 4px; --d-bg: #fbf8f3; --d-pad: 1.8rem 1.6rem; --d-watch-bg: #1b1b1b; --d-watch-dot: #b3261e; --d-watch-dot-ink: #fff; font-family: Georgia, \"Times New Roman\", serif; }\n.digest.digest-s-editorial .digest-summary { border-left: 0; border-top: 3px double var(--d-ink); border-bottom: 1px solid var(--d-line); border-radius: 0; padding: 1rem 0; font-size: 1.2em; font-weight: 400; font-style: italic; }\n.digest.digest-s-editorial .digest-meta, .digest.digest-s-editorial .digest-kicker, .digest.digest-s-editorial .digest-toc-title, .digest.digest-s-editorial .digest-read-label, .digest.digest-s-editorial .digest-sources { font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif; }\n.digest.digest-s-editorial .digest-section h2 { font-weight: 700; font-size: 1.9em; }\n.digest.digest-s-editorial .digest-read { background: transparent; border: 0; border-top: 1px solid var(--d-ink); border-bottom: 1px solid var(--d-line); border-radius: 0; padding: .9rem 0; }\n.digest.digest-s-editorial .digest-pullquote { border-top: 0; border-left: 4px solid var(--d-acc); padding: 0 0 0 1.2rem; }\n.digest.digest-s-editorial .digest-pullquote p { font-style: italic; font-weight: 400; font-size: 1.5em; }\n.digest.digest-s-editorial .digest-toc { border-radius: 0; border-left: 0; border-right: 0; }\n\n/* @style:midnight | Midnight | Dark reading mode, amber accents | #0b1120,#f5a524,#e8ecf5 */\n.digest.digest-s-midnight { --d-ink: #e8ecf5; --d-dim: #b2bccf; --d-mute: #8392ad; --d-line: #26314a; --d-soft: #141c30; --d-acc: #f5a524; --d-acc-ink: #f5a524; --d-blue: #8fa6ff; --d-link: #8fa6ff; --d-blue-soft: #16224a; --d-bg: #0b1120; --d-pad: 1.8rem 1.6rem; --d-r: 14px; --d-watch-bg: #141c30; --d-watch-line: #26314a; }\n.digest.digest-s-midnight .digest-summary { color: #fff; }\n.digest.digest-s-midnight .digest-section h2, .digest.digest-s-midnight .digest-pullquote p { color: #fff; }\n.digest.digest-s-midnight .digest-watch { border: 1px solid #26314a; }\n\n/* @style:minimal | Minimal | Black and white, hairlines, no boxes | #ffffff,#111111,#777777 */\n.digest.digest-s-minimal { --d-ink: #111; --d-dim: #444; --d-mute: #777; --d-line: #dcdcdc; --d-soft: transparent; --d-acc: #111; --d-acc-ink: #555; --d-blue: #111; --d-link: #111; --d-blue-soft: transparent; --d-read-bar: #111; --d-read-ink: #555; --d-sum-bg: transparent; --d-sum-bar: #111; --d-r: 0px; --d-watch-bg: transparent; --d-watch-ink: #111; --d-watch-head: #111; --d-watch-dim: #777; --d-watch-line: #dcdcdc; --d-watch-dot: #111; --d-watch-dot-ink: #fff; --d-pull-font: inherit; }\n.digest.digest-s-minimal .digest-summary { border-left-width: 2px; font-weight: 600; padding: .2rem 0 .2rem 1.1rem; }\n.digest.digest-s-minimal .digest-toc { border: 0; border-top: 2px solid #111; padding: .8rem 0 0; }\n.digest.digest-s-minimal .digest-section { border-top: 2px solid #111; }\n.digest.digest-s-minimal .digest-section.is-brief { border: 0; border-top: 2px solid #111; padding: 1.6rem 0 0; }\n.digest.digest-s-minimal .digest-read { border-left: 2px solid #111; padding: .2rem 0 .2rem 1.1rem; }\n.digest.digest-s-minimal .digest-watch { border-top: 2px solid #111; border-bottom: 1px solid #dcdcdc; padding: 1.4rem 0 .6rem; }\n.digest.digest-s-minimal .digest-pullquote { border-top: 2px solid #111; }\n.digest.digest-s-minimal .digest-pullquote p { font-weight: 700; }\n\n/* @style:nordic | Nordic | Soft blue-grey, rounded, calm | #f2f6f9,#0e7c86,#16303a */\n.digest.digest-s-nordic { --d-ink: #16303a; --d-dim: #44606b; --d-mute: #7b929b; --d-line: #d9e4ea; --d-soft: #e9f1f5; --d-acc: #0e7c86; --d-acc-ink: #0b6770; --d-blue: #0e7c86; --d-link: #0b6770; --d-blue-soft: #e1f1f2; --d-bg: #f2f6f9; --d-pad: 1.8rem 1.6rem; --d-r: 18px; --d-watch-bg: #16303a; --d-watch-dot: #7fd1d8; --d-watch-dot-ink: #16303a; --d-head: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif; --d-pull-font: inherit; }\n.digest.digest-s-nordic .digest-summary { border-left: 0; border-radius: var(--d-r); background: #fff; box-shadow: 0 1px 0 var(--d-line), 0 8px 24px -16px rgba(22, 48, 58, .35); }\n.digest.digest-s-nordic .digest-read { border-left: 0; border-radius: var(--d-r); }\n.digest.digest-s-nordic .digest-section { border-top: 0; padding-top: 0; }\n.digest.digest-s-nordic .digest-section.is-brief { background: #fff; }\n.digest.digest-s-nordic .digest-pullquote { border-top-color: #0e7c86; }\n.digest.digest-s-nordic .digest-toc { background: #fff; }\n\n/* @style:signal | Signal | Strong colour blocks, sharp edges, for fast scanning | #ffffff,#3157f0,#0d1424 */\n.digest.digest-s-signal { --d-r: 0px; --d-blue: #3157f0; --d-link: #3157f0; --d-acc: #3157f0; --d-acc-ink: #3157f0; --d-sum-bg: #3157f0; --d-sum-bar: #0d1424; --d-watch-dot: #f5a524; --d-pull-font: inherit; --d-head: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif; }\n.digest.digest-s-signal .digest-summary { color: #fff; font-weight: 600; border-radius: 0; }\n.digest.digest-s-signal .digest-summary::before { color: #ffd98a; }\n.digest.digest-s-signal .digest-section { border-top: 4px solid #0d1424; }\n.digest.digest-s-signal .digest-section h2 { font-weight: 800; text-transform: none; }\n.digest.digest-s-signal .digest-kicker { background: #0d1424; color: #fff; display: inline-block; padding: .2rem .5rem; }\n.digest.digest-s-signal .digest-pullquote { border-top: 0; background: #f5a524; padding: 1.2rem 1.4rem; }\n.digest.digest-s-signal .digest-pullquote p { font-weight: 800; color: #0d1424; }\n.digest.digest-s-signal .digest-read { border-left-width: 6px; }\n\n/* Related links and signup box */\n.digest .digest-related { margin: 2.2rem 0 0; padding: 1.1rem 1.3rem; border: 1px solid var(--d-line); border-radius: var(--d-r); background: var(--d-soft); }\n.digest .digest-related-title, .digest .digest-cta-title { margin: 0 0 .5rem; font-size: .72rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--d-acc-ink); }\n.digest .digest-related ul { margin: 0; padding-left: 1.1rem; }\n.digest .digest-related li { margin: .3rem 0; }\n.digest .digest-cta { margin: 1.4rem 0 0; padding: 1.3rem 1.4rem; border: 1px solid var(--d-line); border-left: 4px solid var(--d-acc); border-radius: var(--d-r); background: var(--d-soft); }\n.digest .digest-cta p { margin: 0 0 .8rem; }\n.digest .digest-cta .digest-cta-title { margin-bottom: .45rem; }\n.digest .digest-cta .digest-cta-btn { display: inline-block; padding: .6rem 1.15rem; border-radius: 999px; background: var(--d-ink); color: var(--d-bg, #fff); font-weight: 700; font-size: .95rem; text-decoration: none; }\n.digest.digest-s-midnight .digest-cta .digest-cta-btn { background: var(--d-acc); color: #0b1120; }\n";
  /*DGS_CSS_END*/

  // ---------- HTML builder ----------
  function groupBlk(cls, parts, wp) {
    var inner = '<div class="wp-block-group ' + cls + '">\n' + parts.join('\n\n') + '\n</div>';
    return wp ? '<!-- wp:group ' + JSON.stringify({ className: cls }) + ' -->\n' + inner + '\n<!-- /wp:group -->' : '<div class="' + cls + '">' + parts.join('\n') + '</div>';
  }
  function htmlBlk(inner, wp) { return wp ? '<!-- wp:html -->\n' + inner + '\n<!-- /wp:html -->' : inner; }
  function pullQuoteFor(paras) {
    // a sentence that is mostly a direct quote, repeated word for word
    for (var i = 0; i < paras.length; i++) {
      var sents = paras[i].split(/(?<=[.!?]["”]?)\s+(?=["“A-Z])/);
      for (var j = 0; j < sents.length; j++) {
        var s = sents[j].trim(), m = /["“]([^"”]{40,200})["”]/.exec(s);
        if (!m || s.length < 70 || s.length > 260) continue;
        if (m[1].split(/\s+/).length < 7 || m[1].length < s.length * 0.45) continue;
        return { text: s, para: i };
      }
    }
    return null;
  }
  function linkOk(u) { u = String(u || '').trim(); return /^https?:\/\/\S+$/i.test(u) || /^\/[^\s/]\S*$/.test(u) ? u : ''; }
  function relatedLinks(pr) {
    var lines = String(pr.links || '').split('\n').map(function (x) { var a = x.split('|'); return { t: (a[0] || '').trim(), u: linkOk(a.slice(1).join('|')) }; }).filter(function (x) { return x.t && x.u; });
    if (!lines.length || !state.digest || !state.digest.outline) return [];
    var o = state.digest.outline, dr = wrDraft(), bag = {}; tokenize([o.headline, (dr.frame && dr.frame.summary) || ''].concat(includedSections().map(function (x) { return x.s.heading; })).join(' ')).forEach(function (w) { bag[w] = 1; });
    lines.forEach(function (l) { l.n = tokenize(l.t).filter(function (w) { return bag[w]; }).length; });
    var hit = lines.filter(function (l) { return l.n > 0; }).sort(function (a, b) { return b.n - a.n; });
    return (hit.length ? hit : lines).slice(0, 3);
  }

  // ---------- Plain-reading helpers (Yoast: sentences up to 20 words, short paragraphs) ----------
  // Sentence splitter that never cuts inside 2.1%, U.S., St., Mr., e.g. and similar.
  function sentencesSafe(t) {
    var x = String(t || '').replace(/(\d)\.(\d)/g, '$1\u0001$2').replace(/\b(U)\.(S|K|N)\./g, '$1\u0001$2\u0001').replace(/\b(Mr|Mrs|Ms|Dr|St|No|Gen|Sen|Rep|Sgt|Col|Lt|Inc|Ltd|Co|Corp|vs|etc|e\.g|i\.e)\./g, '$1\u0001').replace(/\b([A-Z])\.\s(?=[A-Z])/g, '$1\u0001 ');
    return sentencesOf(x).map(function (z) { return z.replace(/\u0001/g, '.'); });
  }
  function wc(t) { return String(t || '').split(/\s+/).filter(Boolean).length; }
  function capFirst(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  var SPLITS = [
    { re: /;\s+(?=[a-z])/g, join: '. ' },
    { re: /,\s+but\s+/g, join: '. But ' },
    { re: /,\s+(?:whereas|while)\s+(?=(?!\w+ing\b)\w)/g, join: '. Meanwhile, ' },
    { re: /,\s+and\s+(?=(?:the|it|he|she|they|we|there|this|that|these|those|its|his|her|their)\s)/gi, join: '. ' },
    { re: /,\s+so\s+(?=\w)/g, join: '. So ' },
    { re: /,\s+which\s+(?=(?:means|suggests|shows|is|was)\s)/g, join: '. That ' }
  ];
  function splitSentence(st) {
    var trail = (st.match(/\s*$/) || [''])[0], s = st.replace(/\s+$/, '');
    if (wc(s) <= 20 || /["“”]/.test(s)) return st;
    var best = null, mid = s.length / 2;
    SPLITS.forEach(function (sp) {
      var rx = new RegExp(sp.re.source, sp.re.flags), m;
      while ((m = rx.exec(s))) {
        var l = s.slice(0, m.index), r = s.slice(m.index + m[0].length);
        if (wc(l) >= 6 && wc(r) >= 6 && /[.!?]$/.test(r) !== null) { var d = Math.abs(m.index - mid); if (!best || d < best.d) best = { d: d, l: l, r: r, join: sp.join, idx: m.index }; }
        if (m.index === rx.lastIndex) rx.lastIndex++;
      }
    });
    if (!best) return st;
    var left = best.l.replace(/[,;:\s]+$/, '') + '.', jn = best.join.replace(/^\.\s*/, ''), right = (jn ? jn : '') + best.r;
    return splitSentence(left + ' ') + splitSentence(capFirst(right)) + trail;
  }
  function easy(t) { return sentencesSafe(String(t || '')).map(splitSentence).join('').replace(/\s+/g, ' ').trim(); }
  function easyParas(t) {
    var e = easy(t), ss = sentencesSafe(e);
    if (wc(e) <= 110 || ss.length < 4) return [e];
    var half = wc(e) / 2, acc = 0, cut = 1;
    for (var i = 0; i < ss.length - 1; i++) { acc += wc(ss[i]); cut = i + 1; if (acc >= half) break; }
    return [ss.slice(0, cut).join('').trim(), ss.slice(cut).join('').trim()];
  }
  function outputTexts() {
    var dr = wrDraft(), out = [];
    if (dr.frame && dr.frame.summary) out.push(easy(dr.frame.summary));
    if (dr.frame && dr.frame.opening) out.push(easy(dr.frame.opening));
    includedSections().forEach(function (x) { var r = dr.sections[x.c.id]; if (!r || !r.paras) return; r.paras.forEach(function (t) { easyParas(t).forEach(function (z) { out.push(z); }); }); String(r.reading || '').split(/\n{2,}/).forEach(function (z) { if (z.trim()) easyParas(z.trim()).forEach(function (y) { out.push(y); }); }); });
    return out;
  }
  function readStats() {
    var txt = outputTexts(), n = 0, long = 0, maxP = 0;
    txt.forEach(function (p) { maxP = Math.max(maxP, wc(p)); sentencesOf(p).forEach(function (s) { if (!s.trim()) return; n++; if (wc(s) > 20 && !/["“”]/.test(s)) long++; }); });
    return { n: n, long: long, pct: n ? Math.round(100 * long / n) : 0, maxP: maxP };
  }
  // A second digest from the stories the first one left out.
  function nextFromLeft() {
    if (aiBusy()) { toast('Wait until the AI has finished.', 'error'); return; }
    var d0 = state.digest, ids = (d0.left || []).filter(function (i) { return state.stories.some(function (x) { return x.id === i; }); });
    if (!ids.length) { toast('The Feed no longer holds those stories. Scan the feed again, then pick them.', 'error'); return; }
    digestSave(); flushDigests();
    var pid = state.profile.id, nd = digestBlank(); nd.edition = daypart(Date.now()) + ' update (2)'; nd.fromLeft = d0.id;
    libRecs(pid)[nd.id] = nd; LIB.cur[pid] = nd.id; state.digest = nd; digestFor = pid;
    state.selectedStoryIds = {}; ids.forEach(function (i) { state.selectedStoryIds[i] = true; });
    afterDigestSwitch('cluster');
    state.selectedStoryIds = {}; ids.forEach(function (i) { state.selectedStoryIds[i] = true; });
    renderStories(); updateStepAvailability(); runClustering();
    toast('Started a second digest from ' + ids.length + ' left-out stories. Your first digest is kept in the Digests list.', 'success');
  }
  function articleHtml(opts) {
    opts = opts || {};
    var d = state.digest, o = d.outline, dr = wrDraft(), rv = dReview(), wp = !opts.preview, out = [];
    function blk(name, attrs, inner) {
      var a = attrs ? ' ' + JSON.stringify(attrs) : '';
      return wp ? '<!-- wp:' + name + a + ' -->\n' + inner + '\n<!-- /wp:' + name + ' -->' : inner;
    }
    function para(t, cls) { return blk('paragraph', cls ? { className: cls } : null, '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(t) + '</p>'); }
    var secs = includedSections().filter(function (x) { var r = dr.sections[x.c.id]; return r && r.paras && r.paras.length; });
    var used = {};
    var ids = secs.map(function (x) { var base = slugify(x.s.heading, 40), id = base, n = 2; while (used[id]) id = base + '-' + (n++); used[id] = 1; return id; });
    var mins = Math.max(1, Math.round(wordCount() / 230));
    var srcN = {}; secs.forEach(function (x) { (dr.sections[x.c.id].sources || []).forEach(function (z) { var u = safeUrl(z.url); if (u) srcN[u] = 1; }); }); var nSrc = Object.keys(srcN).length || secs.length;
    out.push(para((d.edition || (d.kind === 'commentary' ? 'Analysis' : 'Daily bulletin')) + '  ·  ' + dateHuman(d.created) + '  ·  ' + nSrc + ' ' + (nSrc === 1 ? 'source' : 'sources') + '  ·  ' + mins + ' min read', 'digest-meta'));
    if (o.summary && dr.frame && dr.frame.summary) out.push(para(easy(dr.frame.summary), 'digest-summary'));
    if (dr.frame && dr.frame.opening) out.push(para(easy(dr.frame.opening), 'digest-opening'));
    if (rv.nav && secs.length >= 3) {
      out.push(htmlBlk('<nav class="digest-toc" aria-label="In this article"><p class="digest-toc-title">In this article</p><ol>' + secs.map(function (x, i) { return '<li><a href="#' + ids[i] + '">' + esc(x.s.heading) + '</a></li>'; }).join('') + '</ol></nav>', wp));
    }
    var pqLeft = rv.pull === false ? 0 : 2;
    secs.forEach(function (x, i) {
      var r = dr.sections[x.c.id], words = r.paras.join(' ').split(/\s+/).length, brief = !!r.thin || (words < 90 && !r.reading);
      var charts = dCharts().filter(function (c) { return c.include && c.cid === x.c.id; });
      var pq = pqLeft > 0 && !brief ? pullQuoteFor(r.paras) : null; if (pq) pqLeft--;
      var parts = [];
      parts.push(para(pad2(i + 1) + '  ·  ' + (brief ? 'Brief' : dLens(x.s.lens).label), 'digest-kicker'));
      parts.push(blk('heading', { level: 2 }, '<h2 class="wp-block-heading" id="' + ids[i] + '">' + esc(x.s.heading) + '</h2>'));
      var factsEl = [], readEl = null, cut = r.paras.length;
      if (charts.length) { var target = 230 * charts.length, acc = 0; for (var q = 0; q < r.paras.length; q++) { acc += r.paras[q].split(/\s+/).length; if (acc >= target) { cut = q + 1; break; } } }
      var totW = r.paras.reduce(function (m, z) { return m + wc(z); }, 0), accW = 0, subDone = false;
      r.paras.forEach(function (t, k) { var items = easyParas(t).map(function (z) { return para(z); });
        if (totW > 230 && !subDone && k > 0 && accW >= totW / 2) { subDone = true; items.unshift(htmlBlk('<h3 class="digest-read-label digest-sub">' + (/\d/.test(r.paras.slice(k).join(' ')) ? 'The numbers' : 'More detail') + '</h3>', wp)); }
        accW += wc(t); if (pq && pq.para === k) items.push(htmlBlk('<blockquote class="digest-pullquote"><p>' + esc(pq.text) + '</p></blockquote>', wp)); factsEl.push(items); });
      if (r.reading) readEl = htmlBlk('<aside class="digest-read"><h3 class="digest-read-label">Our read</h3>' + String(r.reading).split(/\n{2,}/).map(function (z) { return z.trim(); }).filter(Boolean).reduce(function (m, z) { return m.concat(easyParas(z)); }, []).map(function (z) { return '<p>' + esc(z) + '</p>'; }).join('') + '</aside>', wp);
      var flat = function (list) { return list.reduce(function (m, it) { return m.concat(it); }, []); };
      if (charts.length) {
        parts.push(groupBlk('digest-split', [groupBlk('digest-text', flat(factsEl.slice(0, cut)), wp), groupBlk('digest-aside', charts.map(function (c) { return chartFigure(c, wp); }), wp)], wp));
        parts = parts.concat(flat(factsEl.slice(cut))); if (readEl) parts.push(readEl);
      } else { parts = parts.concat(flat(factsEl)); if (readEl) parts.push(readEl); }
      var seen = {}, links = [], cnt = {};
      (r.sources || []).forEach(function (z) { var u = safeUrl(z.url); if (!u || seen[u]) return; seen[u] = 1; var nm = z.source || hostOf(u); cnt[nm] = (cnt[nm] || 0) + 1; links.push({ u: u, nm: nm, n: cnt[nm] }); });
      var multi = {}; links.forEach(function (l) { if (cnt[l.nm] > 1) multi[l.nm] = 1; });
      links = links.map(function (l) { return '<a href="' + esc(l.u) + '" target="_blank" rel="noopener noreferrer">' + esc(l.nm + (multi[l.nm] ? ' ' + l.n : '')) + '</a>'; });
      if (links.length) parts.push(blk('paragraph', { className: 'digest-sources' }, '<p class="digest-sources">Sources: ' + links.join(', ') + '</p>'));
      out.push(groupBlk('digest-section' + (brief ? ' is-brief' : ''), parts, wp));
    });
    if (o.watch && dr.frame && dr.frame.watch && dr.frame.watch.length) {
      out.push(htmlBlk('<section class="digest-watch"><h2 class="wp-block-heading" id="what-to-watch">What to watch</h2><p class="digest-watch-sub">Signals that would confirm or break the readings above.</p><ol>' + dr.frame.watch.map(function (w) { return '<li><span>' + esc(w) + '</span></li>'; }).join('') + '</ol></section>', wp));
    }
    if (noteText(state.digest)) out.push(htmlBlk('<aside class="digest-read"><h3 class="digest-read-label">Analyst\'s note</h3>' + noteText(state.digest).split(/\n{2,}/).map(function (z) { return '<p>' + esc(z.trim()) + '</p>'; }).join('') + '</aside>'));
    var pr = (state.profile && state.profile.promo) || {}, rel = relatedLinks(pr);
    if (rel.length) out.push(htmlBlk('<aside class="digest-related"><p class="digest-related-title">More from ' + esc(pubName()) + '</p><ul>' + rel.map(function (l) { return '<li><a href="' + esc(l.u) + '">' + esc(l.t) + '</a></li>'; }).join('') + '</ul></aside>', wp));
    var cu = linkOk(pr.ctaUrl);
    if (cu && pr.ctaTitle) out.push(htmlBlk('<aside class="digest-cta"><p class="digest-cta-title">' + esc(pr.ctaTitle) + '</p>' + (pr.ctaText ? '<p>' + esc(pr.ctaText) + '</p>' : '') + '<a class="digest-cta-btn" href="' + esc(cu) + '">' + esc(pr.ctaLabel || 'Subscribe') + '</a></aside>', wp));
    if (rv.disclose) out.push(blk('paragraph', { className: 'digest-note' }, '<p class="digest-note">' + noteHtml(rv.disclosure || defaultDisclosure(), rv.credit !== false) + '</p>'));
    var body = out.join(wp ? '\n\n' : '\n');
    var wc = 'digest digest-s-' + curStyle();
    return wp ? '<!-- wp:group ' + JSON.stringify({ className: wc }) + ' -->\n<div class="wp-block-group ' + wc + '">\n' + body + '\n</div>\n<!-- /wp:group -->' : '<div class="' + wc + '">' + body + '</div>';
  }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function ensureDigestCss() { if (document.getElementById('dgs-digest-css')) return; var st = document.createElement('style'); st.id = 'dgs-digest-css'; st.textContent = DIGEST_CSS; document.head.appendChild(st); }

  // ---------- SEO fields ----------
  function seoFallback() {
    var o = state.digest.outline, dr = wrDraft(), head = o.headline || 'Daily bulletin';
    var summ = (dr.frame && dr.frame.summary) || '';
    var meta = dShort(summ || head, 155);
    var words = tokenize(head.split(':')[0]), focus = words.slice(0, 3).join(' ');
    var sec = includedSections().map(function (x) { return dShort(tokenize(x.s.heading).filter(function (w) { return w.length > 3; }).slice(0, 3).join(' '), 40); }).filter(function (t) { return t && t !== focus; }).slice(0, 4);
    return { title: dShort(head, 60), meta: meta, slug: slugify(head, 60), excerpt: dShort(summ || head, 200), tags: [], alt: dShort('Cover image for the digest: ' + head, 120), focus: focus, secondary: sec };
  }
  function seoChecks() {
    var d = state.digest, o = d.outline, dr = wrDraft(), s = dReview().seo; if (!s) return [];
    var kw = String(s.focus || '').toLowerCase().trim(); if (!kw) return [{ ok: false, text: 'No primary keyword yet. Type the phrase you want to rank for.' }];
    var low = function (t) { return String(t || '').toLowerCase(); }, has = function (t) { return low(t).indexOf(kw) !== -1; };
    var secs = includedSections(), body = secs.map(function (x) { var r = dr.sections[x.c.id]; return r ? r.paras.join(' ') : ''; }).join(' ') + ' ' + ((dr.frame && dr.frame.summary) || '');
    var intro = ((dr.frame && dr.frame.summary) || '') + ' ' + ((dr.frame && dr.frame.opening) || '') + ' ' + (secs[0] && dr.sections[secs[0].c.id] ? dr.sections[secs[0].c.id].paras[0] || '' : '');
    var slugWords = kw.split(/\s+/).map(function (w) { return slugify(w, 30); }).filter(Boolean), slugOk = slugWords.every(function (w) { return String(s.slug || '').indexOf(w) !== -1; });
    var n = (low(body).split(kw).length - 1), words = Math.max(1, body.split(/\s+/).length);
    var out = [
      { ok: has(s.title), text: 'Primary keyword in the SEO title' }, { ok: has(s.meta), text: 'Primary keyword in the meta description' }, { ok: slugOk, text: 'Primary keyword in the URL slug' },
      { ok: has(o.headline), text: 'Primary keyword in the headline', warn: true }, { ok: has(intro), text: 'Primary keyword in the opening of the article', warn: true },
      { ok: n >= 1 && n <= Math.max(4, Math.round(words / 120)), text: n === 0 ? 'The primary keyword does not appear in the article text. Use the phrase once or twice in the writing, or pick a phrase that matches what it says.' : n > Math.max(4, Math.round(words / 120)) ? 'The primary keyword appears ' + n + ' times, which can read as stuffing' : 'Primary keyword appears ' + n + ' time' + (n === 1 ? '' : 's') + ' in the article', warn: true }
    ];
    var sec = (s.secondary || []).filter(Boolean), hit = sec.filter(function (k) { return low(body).indexOf(String(k).toLowerCase()) !== -1; });
    if (sec.length) out.push({ ok: hit.length >= Math.ceil(sec.length / 2), text: hit.length + ' of ' + sec.length + ' secondary keywords appear in the article text', warn: true });
    return out;
  }
  function paintSeoChecks() {
    var box = document.getElementById('dgs-seo-checks'); if (!box) return; box.innerHTML = '';
    seoChecks().forEach(function (c) { var li = el('p', { class: 'dgs-seo-check ' + (c.ok ? 'is-ok' : c.warn ? 'is-warn' : 'is-bad') }); li.appendChild(el('span', { text: c.ok ? '✓' : c.warn ? '!' : '✕' })); li.appendChild(document.createTextNode(' ' + c.text)); box.appendChild(li); });
  }
  function metaFit(t) {
    t = String(t || '').replace(/\s+/g, ' ').trim(); if (t.length <= 150) return t;
    var cut = t.slice(0, 150), k = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; ')); if (k > 90) return cut.slice(0, k + 1);
    k = cut.lastIndexOf(' '); return (k > 90 ? cut.slice(0, k) : cut).replace(/[,;:\s]+$/, '') + '…';
  }
  function seoPrompt() {
    var o = state.digest.outline, dr = wrDraft(), p = state.profile || {};
    var lines = ['You write the search and social fields for a daily news analysis article published by "' + pubName() + '".', '',
      'HEADLINE: ' + o.headline, 'SUMMARY: ' + ((dr.frame && dr.frame.summary) || ''), 'SECTION HEADINGS: ' + includedSections().map(function (x) { return x.s.heading; }).join(' | '),
      'TOPICS OF THE PUBLICATION: ' + (p.topics || []).map(function (t) { return t.name; }).join(', '), '',
      'RULES:',
      '- "title": the SEO title, at most 60 characters, specific, with the lasting subject first (not the day\'s event). No clickbait, no hype words, no trailing site name.',
      '- "meta": the meta description, 120 to 155 characters (never more), one or two plain sentences that say what the article covers and that contain the "focus" phrase word for word. No "Discover", "Explore", "Dive into".',
      '- "slug": 3 to 6 lowercase words joined by hyphens, no date.',
      '- "excerpt": at most 200 characters, plain.',
      '- "focus": the ONE primary keyword phrase to try to rank for: 2 to 4 words that a reader would type into a search engine to find this article, specific to this digest (a subject or event, never "news", "daily digest" or the publication name). Choose a lasting subject (for example "iran oil prices"), not a one-day event. Use words that appear in the headline or summary, so it fits naturally in the title, the meta description, the slug and the opening.',
      '- "secondary": 3 to 5 secondary keyword phrases (2 to 4 words each), each something people search for, different from "focus" and from each other, and each made of words that appear in the section headings or summary above so the article text really contains them.',
      '- The "focus" phrase and the SEO title must describe what the WHOLE article is about. If the sections do not share one subject, choose the subject the first sections share rather than a grand label that fits none of them.',
      '- "tags": 3 to 5 short tags (1 to 3 words).',
      '- "alt": alt text for the feature image, at most 110 characters, describing a plain typographic cover for this headline.',
      'Use only what is in the headline, summary and headings. Do not invent facts.',
      'Return STRICT JSON only: {"title":"...","meta":"...","slug":"...","excerpt":"...","focus":"...","secondary":["..."],"tags":["..."],"alt":"..."}'];
    return lines.join('\n');
  }
  var exBusy = false;
  function generateSeo() {
    var rv = dReview(), fb = seoFallback();
    if (!dKey()) { rv.seo = Object.assign({}, fb); digestSave(); renderExport(); toast('No AI key: filled the fields from your headline and summary. Edit them.', ''); return; }
    if (exBusy) return; exBusy = true; paintExport();
    callLLM(seoPrompt(), 'write', { best: true }).then(function (r) {
      var j = extractJson(r.text);
      rv.seo = {
        title: dShort(plainDashes(String(j.title || fb.title)), 70), meta: metaFit(plainDashes(String(j.meta || fb.meta))), slug: slugify(j.slug || fb.slug, 60),
        excerpt: dShort(plainDashes(String(j.excerpt || fb.excerpt)), 220), focus: dShort(String(j.focus || fb.focus || '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim(), 60), secondary: (Array.isArray(j.secondary) ? j.secondary : []).map(function (t) { return dShort(String(t).toLowerCase().replace(/\s+/g, ' ').trim(), 50); }).filter(Boolean).slice(0, 5), tags: (j.tags || []).map(function (t) { return dShort(String(t), 30); }).slice(0, 5), alt: dShort(String(j.alt || fb.alt), 125)
      };
      try {
        var fit = bestKeyphrase([rv.seo.focus, plannedKeyphrase()].concat(tokenize(state.digest.outline.headline.split(':')[0]).length >= 2 ? [tokenize(state.digest.outline.headline.split(':')[0]).slice(-2).join(' ')] : []));
        if (fit.phrase && fit.phrase !== rv.seo.focus && fit.n >= 2) { rv.seo.focus = fit.phrase; rv.seo.meta = metaFit(rv.seo.meta.toLowerCase().indexOf(fit.phrase) === -1 ? fit.phrase.charAt(0).toUpperCase() + fit.phrase.slice(1) + ': ' + rv.seo.meta : rv.seo.meta); }
      } catch (e9) {}
      toast('Search fields written. Edit them.', 'success');
    }).catch(function (e) { rv.seo = Object.assign({}, fb); toast('The AI could not write the search fields (' + dShort(e && e.message, 100) + '). Filled them from your headline instead.', 'error'); })
      .then(function () { exBusy = false; digestSave(); renderExport(); });
  }

  // ---------- Feature image: dot-matrix world map with the places the article is about ----------
  var MAP_ROWS = ["00000000061df0ffffff0000f8000000003c000000000","000000030027c3ffffff8000200000000006000000000","0000000038afc007ffff00000000030007ffc001d8000","0000000e88b7b003fffe000000000c003ffffec000000","80180009fc33fc00fffa00000380041dffffffeffc801","00fffbfe725d8f00fff800001ff000edfffffffffffdf","e0ffffffffff87c1ff8000007ffebffdfffffffffffff","31fffffffffd1f80fc01e000f9ebfffffffffffffffff","00fffffffff8034078000003e7fffffffffffffffffff","01fdffffffe01e0038000007e7ffffffffffffffff2f0","007807ffffe01e4000000007e3ffffffffffffff82200","001001fffff80fe000000182c7fffffffffffffe00f00","0080007fffff9ff8000003820ffffffffffffffc00e00","0000007fffff9ffc000006cfffffffffffffffffc0800","0000003ffffffffc000000dfffffffffffffffff40000","00000017ffffff460000007fffffffffffffffff40000","0000000fffffffc10000007ffffffffffffffffe40000","0000000fffffff600000007f7f97cffffffffffc00000","0000000ffffffe00000007f19f03cffffffffff8c0000","0000000ffffffc00000003c26f7fe7ffffffffe080000","0000000ffffff000000007c02dffe7fffffff84080000","00000007fffff0000000018740ffe7fffffffe6300000","00000003fffff000000001fe022ffffffffffc4f00000","00000001ffffc000000003ff000ffffffffffc1800000","00000000ffff8000000007ffef7ffffffffffe0000000","000000003fc04000000007ffffffdffffffffe0000000","000000005f80400000001fffffefe7fffffffc0000000","000000002f80000000001fffffe7f41ffffffc0000000","000000000780c00000003ffffff7ff07fffff20000000","000000000786100000007ffffffbfe07fcff000000000","0000000003cc020000003ffffff9fe03f07e800000000","0000000000fc000000003ffffff9f801e07f020000000","00000000000f000000007ffffffde001c01f020000000","000000000003000000003ffffffe8001c01f820000000","0000000000010f0000003fffffff3000c013008000000","000000000000aff000001fffffffe000a012000000000","0000000000001ff800000fffffffe0002000008000000","0000000000001fff00000687ffffc000002c180000000","0000000000001fff80000001ffff80000014380000000","0000000000003fff80000001ffff000000187a0000000","0000000000003fffe0000003fffe0000000c781800000","0000000000003ffffc000001fffc00000006762b80000","0000000000007fffff000000fffc000000020101e0000","0000000000003fffff800000fffc00000001c001f0800","0000000000001fffff000000fffc000000000880d0200","0000000000001ffffe0000007ffc00000000000000000","0000000000000ffffe000000fffc20000000001c40000","0000000000000ffffe000000fffc2000000000fc60040","00000000000003fffc000000fff8e000000001fe60000","00000000000001fffc000000fff0e000000001ffe0000","00000000000001fffc0000007ff0c00000000ffff8080","00000000000001fff00000007ff0c00000001ffff8000","00000000000001ffc00000007fe0800000001ffffc000","00000000000001ffc00000003fc0000000001ffffe000","00000000000003ff800000003fc0000000001ffffe000","00000000000003ff800000001f80000000000ffffe000","00000000000003ff000000001f00000000000f07fc000","00000000000003f8000000000000000000000801f8008","00000000000007fc000000000000000000000000f8004","00000000000007e000000000000000000000000000006","00000000000007a00000000000000000000000003000c","00000000000003c000000000000000000000000010018","000000000000078000000000000000000000000000030","000000000000078000000000000000000000000000000","0000000000000f0000000000000000080000000000000","0000000000000e0000000000000000000000000000000"];
  var MAP_TOP = 80, MAP_STEP = 2;
  var GAZ = [
    ['Israel', 'israel|israeli|knesset|jerusalem|tel aviv|netanyahu', 31.5, 34.9],
    ['Gaza', 'gaza|hamas', 31.4, 34.4], ['Iran', 'iran|iranian|tehran', 32.4, 53.7], ['Iraq', 'iraq|iraqi|baghdad', 33, 43.7],
    ['Syria', 'syria|syrian|damascus', 35, 38.5], ['Lebanon', 'lebanon|lebanese|hezbollah|beirut', 33.9, 35.9], ['Yemen', 'yemen|houthi', 15.5, 47.5],
    ['Saudi Arabia', 'saudi', 24, 45], ['Qatar', 'qatar|doha', 25.3, 51.2], ['UAE', 'emirates|\\buae\\b|dubai|abu dhabi', 24.3, 54.4], ['Turkey', 'turkey|turkish|ankara|erdogan', 39, 35],
    ['Egypt', 'egypt|egyptian|cairo', 26.8, 30.8], ['Sudan', 'sudan|khartoum', 15.5, 32.5], ['Libya', 'libya|libyan|tripoli', 27, 17], ['Tunisia', 'tunisia|tunisian|tunis', 34, 9.5],
    ['Algeria', 'algeria|algerian', 28, 2.6], ['Morocco', 'morocco|moroccan|rabat', 31.8, -7], ['Nigeria', 'nigeria|nigerian|lagos|abuja', 9.1, 8.7], ['Ethiopia', 'ethiopia|addis', 9, 39.5],
    ['Kenya', 'kenya|nairobi', 0.2, 37.9], ['Congo', 'congo|kinshasa', -2.9, 23.7], ['South Africa', 'south africa|pretoria|johannesburg', -29, 24.5],
    ['Russia', 'russia|russian|moscow|kremlin|putin', 58, 50], ['Ukraine', 'ukraine|ukrainian|kyiv|kiev|zelensky', 49, 31.5], ['Belarus', 'belarus', 53.7, 28], ['Poland', 'poland|polish|warsaw', 52, 19.4],
    ['Germany', 'germany|german|berlin', 51.1, 10.4], ['France', 'france|french|paris|macron', 46.6, 2.4], ['United Kingdom', 'britain|british|\\buk\\b|united kingdom|england|london|scotland', 54, -2.5],
    ['Spain', 'spain|spanish|madrid', 40.2, -3.7], ['Italy', 'italy|italian|rome|meloni', 42.8, 12.5], ['Netherlands', 'netherlands|dutch|amsterdam', 52.2, 5.3], ['Sweden', 'sweden|swedish|stockholm', 62, 15],
    ['Norway', 'norway|norwegian|oslo', 61, 9], ['Finland', 'finland|finnish|helsinki', 63.5, 26], ['Greece', 'greece|greek|athens', 39, 22], ['Hungary', 'hungary|hungarian|budapest|orban', 47.2, 19.5],
    ['Serbia', 'serbia|serbian|belgrade', 44, 20.8], ['Brussels', 'european union|\\beu\\b|brussels', 50.85, 4.35],
    ['Alaska', 'alaska|anchorage|juneau', 64.2, -149.5], ['United States', 'united states|\\bu\\.s\\.|american|washington|congress|white house|pentagon|trump|biden', 39.5, -98.5],
    ['Canada', 'canada|canadian|ottawa', 56, -106], ['Mexico', 'mexico|mexican', 23.6, -102.5], ['Cuba', 'cuba|cuban|havana', 21.6, -79], ['Venezuela', 'venezuela|venezuelan|caracas|maduro', 7.5, -66],
    ['Colombia', 'colombia|colombian|bogota', 4.6, -74], ['Brazil', 'brazil|brazilian|brasilia|lula', -10, -52], ['Argentina', 'argentina|argentine|buenos aires|milei', -35, -64],
    ['China', 'china|chinese|beijing|xi jinping', 35.5, 103.8], ['Taiwan', 'taiwan|taiwanese|taipei', 23.7, 121], ['Japan', 'japan|japanese|tokyo', 36.2, 138.2], ['South Korea', 'south korea|seoul', 36.5, 127.8],
    ['North Korea', 'north korea|pyongyang', 40.2, 127], ['India', 'india|indian|delhi|modi', 22.5, 79], ['Pakistan', 'pakistan|pakistani|islamabad', 30, 69.5], ['Afghanistan', 'afghanistan|taliban|kabul', 33.9, 66],
    ['Bangladesh', 'bangladesh|dhaka', 23.8, 90.3], ['Myanmar', 'myanmar|burma', 21, 96], ['Vietnam', 'vietnam|hanoi', 15.5, 107.5], ['Thailand', 'thailand|bangkok', 15, 101], ['Indonesia', 'indonesia|jakarta', -2.5, 118],
    ['Philippines', 'philippines|manila', 12.8, 122.5], ['Australia', 'australia|australian|canberra|sydney', -25.5, 134],
    // hubs: where money, energy and technology stories actually happen
    ['Washington', 'federal reserve|\\bfed\\b|white house|treasury|congress|senate|pentagon', 38.9, -77], ['New York', 'new york|wall street|nasdaq|nyse|s&p|dollar|treasuries', 40.7, -74],
    ['Frankfurt', 'frankfurt|\\becb\\b|european central bank|lagarde|bundesbank', 50.1, 8.7], ['London', 'city of london|bank of england|\\bboe\\b|sterling|gilts|ftse', 51.5, -0.1],
    ['Geneva', 'geneva|davos|swiss|switzerland|\\bwto\\b|\\bimf\\b', 46.2, 6.1], ['Vienna', 'opec|vienna', 48.2, 16.4],
    ['Strait of Hormuz', 'hormuz|persian gulf', 26.5, 56.3], ['Red Sea', 'red sea|suez|bab el-mandeb|shipping lanes', 20, 38.5], ['Black Sea', 'black sea|odesa|odessa|crimea', 43.5, 34],
    ['Panama Canal', 'panama', 9.1, -79.7], ['Singapore', 'singapore', 1.35, 103.8], ['Hong Kong', 'hong kong', 22.3, 114.2], ['South China Sea', 'south china sea|spratly|scarborough', 12, 114],
    ['Silicon Valley', 'silicon valley|nvidia|openai|california|semiconductor', 37.4, -122.1], ['Texas', 'texas|permian', 31, -99], ['Kazakhstan', 'kazakhstan|astana', 48, 67], ['Arctic', 'arctic|greenland', 72, -40]
  ];
  var GAZ_RX = GAZ.map(function (g) { return new RegExp('(^|[^a-z])(' + g[1] + ')([^a-z]|$)', 'g'); });
  function mapPlaces(texts, weights) {
    var score = {};
    texts.forEach(function (t, ti) {
      var low = ' ' + String(t || '').toLowerCase().replace(/[’']s\b/g, '').replace(/france 24|al jazeera|bbc news|dw news|sky news/g, ' ') + ' ', w = weights[ti] || 1;
      GAZ.forEach(function (g, i) { var m = low.match(GAZ_RX[i]); if (m) score[g[0]] = (score[g[0]] || 0) + Math.min(m.length, 4) * w; });
    });
    // "Gaza" and "Israel" read as one story when both are named: keep the higher one only if the other is a weak mention
    return Object.keys(score).sort(function (a, b) { return score[b] - score[a]; });
  }
  function gazFind(name) { name = String(name).trim().toLowerCase(); if (!name) return null; return GAZ.filter(function (g) { return g[0].toLowerCase() === name || new RegExp('^(' + g[1] + ')$').test(name); })[0] || null; }
  function articlePlaces() {
    var rv = dReview(), o = state.digest.outline, dr = wrDraft(), secs = includedSections();
    var texts = [o.headline || '', secs.map(function (x) { return x.s.heading; }).join(' . '), (dr.frame && dr.frame.summary) || '', secs.map(function (x) { var r = dr.sections[x.c.id]; return r ? r.paras.join(' ') : ''; }).join(' ')];
    var auto = mapPlaces(texts, [6, 4, 2, 1]);
    var strong = mapPlaces(texts.slice(0, 3), [1, 1, 1]);
    var list = auto.filter(function (n) { return strong.indexOf(n) !== -1; }).slice(0, 3);
    // one place per section first, so a digest about three different things does not collapse onto the one place named most often
    secs.forEach(function (x) {
      var r = dr.sections[x.c.id], top = mapPlaces([x.s.heading, r ? r.paras.join(' ') : ''], [3, 1]).filter(function (n) { return list.indexOf(n) === -1; })[0];
      if (top && list.length < 6) list.push(top);
    });
    auto.forEach(function (n) { if (list.indexOf(n) === -1 && list.length < 6) list.push(n); });
    // a country and its own financial centre are one story: keep the more specific point
    if (list.indexOf('United States') !== -1 && (list.indexOf('Washington') !== -1 || list.indexOf('New York') !== -1 || list.indexOf('Silicon Valley') !== -1 || list.indexOf('Texas') !== -1)) list.splice(list.indexOf('United States'), 1);
    return { auto: list.slice(0, 6), use: (rv.places && rv.places.length ? rv.places : list.slice(0, 6)) };
  }
  function sourceCount() { var seen = {}, dr = wrDraft(); includedSections().forEach(function (x) { var r = dr.sections[x.c.id]; (r && r.sources || []).forEach(function (z) { seen[z.url || z.source] = 1; }); }); return Object.keys(seen).length; }
  function hash32(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function wrapLines(ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur); return lines;
  }
  var IMG_COLORS = [
    { id: 'amber', name: 'Amber', rgb: [245, 165, 36] }, { id: 'teal', name: 'Teal', rgb: [45, 212, 191] }, { id: 'coral', name: 'Coral', rgb: [251, 113, 133] },
    { id: 'sky', name: 'Sky', rgb: [96, 165, 250] }, { id: 'violet', name: 'Violet', rgb: [167, 139, 250] }, { id: 'lime', name: 'Lime', rgb: [163, 230, 53] }
  ];
  function imgSeed() { var d = state.digest, o = d.outline || {}; return hash32((o.headline || '') + '|' + (d.id || '') + '|' + (d.created || 0)); }
  function imgColor() {
    var id = dReview().imgColor, c = IMG_COLORS.filter(function (x) { return x.id === id; })[0];
    return c || IMG_COLORS[imgSeed() % IMG_COLORS.length];
  }
  // ---- Cover types: the picture follows what the digest is about ----
  function includedCharts() { return dCharts().filter(function (c) { return c.include && c.points && c.points.length; }); }
  function leadChart() { return includedCharts().filter(function (c) { return c.type === 'bar' || c.type === 'line'; })[0] || null; }
  function leadFigure() {
    var cs = includedCharts(), st = cs.filter(function (c) { return c.type === 'stat'; })[0];
    if (st) return { raw: String(st.points[0].raw), label: st.title };
    var b = cs.filter(function (c) { return c.type === 'bar'; })[0];
    if (b) { var top = b.points.slice().sort(function (x, y) { return y.value - x.value; })[0]; return { raw: String(top.raw), label: top.label + ': ' + b.title }; }
    var t = (wrDraft().frame && wrDraft().frame.summary) || '', m = t.match(/[$€£]\s?\d[\d,.]*(?:\s?(?:billion|million|trillion))?|\d[\d,.]*\s?(?:%|percent|billion|million|trillion)/i);
    if (m) { var sent = t.split(/[.!?]\s+/).filter(function (x) { return x.indexOf(m[0]) !== -1; })[0] || ''; return { raw: m[0].trim(), label: sent }; }
    return null;
  }
  function imgKinds() {
    var k = ['plain'];
    try { if (articlePlaces().use.filter(function (n) { return gazFind(n); }).length) k.push('map'); } catch (e) {}
    if (leadFigure()) k.push('figure'); if (leadChart()) k.push('chart'); if (includedSections().length >= 3) k.push('sections');
    return k;
  }
  function imgKind() {
    var want = dReview().imgStyle, viable = imgKinds();
    if (want && want !== 'auto' && viable.indexOf(want) !== -1) return want;
    var pool = viable.filter(function (x) { return x !== 'plain'; }); if (!pool.length) return 'plain';
    if (pool.indexOf('map') !== -1) pool.push('map');
    return pool[imgSeed() % pool.length];
  }
  function footLine(sq) {
    var d = state.digest, n = includedSections().length, sc = sourceCount();
    return (sq ? '' : pubName().toUpperCase() + '  ·  ') + (d.edition || (d.kind === 'commentary' ? 'Analysis' : 'Daily bulletin')).toUpperCase() + '  ·  ' + dateHuman(d.created) + (n ? '  ·  ' + n + (n === 1 ? ' story' : ' stories') : '') + (sc ? ', ' + sc + ' sources' : '');
  }
  function fitFont(ctx, text, weight, maxW, start, min, sans) { var sz = start; do { ctx.font = weight + ' ' + sz + 'px ' + sans; sz -= 4; } while (ctx.measureText(text).width > maxW && sz > min); return sz + 4; }
  function drawCover(kind, ctx, W, H, sq, col, seed, sans) {
    var A = col.rgb.join(','), AH = 'rgb(' + A + ')', padX = 64, o = state.digest.outline, head = o.headline || '';
    // quiet seeded texture so two covers of one kind still differ
    for (var r = 1; r <= 6; r++) { ctx.strokeStyle = 'rgba(' + A + ',' + (0.1 - r * 0.012).toFixed(3) + ')'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(W * (0.72 + (seed % 20) / 100), H * (0.25 + ((seed >> 4) % 30) / 100), r * (sq ? 90 : 72), 0, Math.PI * 2); ctx.stroke(); }
    ctx.textBaseline = 'alphabetic';
    function kicker(y, text) { ctx.fillStyle = AH; ctx.fillRect(padX, y - 22, 40, 5); ctx.fillStyle = '#c3cce0'; ctx.font = '700 ' + (sq ? 24 : 20) + 'px ' + sans; ctx.fillText(text, padX + 56, y - 14); }
    function foot() { ctx.fillStyle = '#9aa7c2'; ctx.font = '500 ' + (sq ? 26 : 22) + 'px ' + sans; ctx.fillText(footLine(sq), padX, H - 44); }
    function headBottom(maxL, size0) {
      var size = size0, lines; do { ctx.font = '700 ' + size + 'px ' + sans; lines = wrapLines(ctx, head, W - padX * 2); size -= 3; } while (lines.length > maxL && size > 30);
      var lh = Math.round(size * 1.18), y0 = H - 44 - 44 - (Math.min(lines.length, maxL) - 1) * lh; ctx.fillStyle = '#fff'; lines.slice(0, maxL).forEach(function (l, i) { ctx.fillText(l, padX, y0 + i * lh); }); return y0 - size;
    }
    if (kind === 'figure') {
      var f = leadFigure(); kicker(sq ? 110 : 84, pubName().toUpperCase());
      var sz = fitFont(ctx, f.raw, 800, W - padX * 2, sq ? 300 : 210, 80, sans), by = (sq ? 120 : 84) + sz * 0.95 + 20;
      ctx.fillStyle = AH; ctx.fillText(f.raw, padX, by);
      ctx.fillStyle = '#e8ecf5'; ctx.font = '600 ' + (sq ? 40 : 32) + 'px ' + sans; var ll = wrapLines(ctx, dShort(f.label, 110), W - padX * 2).slice(0, 2); ll.forEach(function (l, i) { ctx.fillText(l, padX, by + 56 + i * (sq ? 50 : 42)); });
      var fade = ctx.createLinearGradient(0, H * 0.55, 0, H); fade.addColorStop(0, 'rgba(11,17,32,0)'); fade.addColorStop(1, 'rgba(11,17,32,0.9)'); ctx.fillStyle = fade; ctx.fillRect(0, H * 0.55, W, H * 0.45);
      headBottom(sq ? 3 : 2, sq ? 52 : 38); foot(); return;
    }
    if (kind === 'chart') {
      var c = leadChart(), pts = c.points.slice(0, 6), topY = sq ? 150 : 100; kicker(sq ? 96 : 70, pubName().toUpperCase());
      ctx.fillStyle = '#fff'; ctx.font = '700 ' + (sq ? 40 : 32) + 'px ' + sans; ctx.fillText(dShort(c.title, 70), padX, topY + 10);
      ctx.fillStyle = '#9aa7c2'; ctx.font = '500 ' + (sq ? 24 : 20) + 'px ' + sans; ctx.fillText((c.unit ? c.unit + '  ·  ' : '') + 'Source: ' + c.source, padX, topY + 44);
      var areaTop = topY + 70, areaBot = H * (sq ? 0.66 : 0.64), cw = W - padX * 2;
      if (c.type === 'bar') {
        var rowH = Math.min(sq ? 74 : 56, (areaBot - areaTop) / pts.length), labW = Math.min(cw * 0.3, 300), mx = Math.max.apply(null, pts.map(function (p) { return Math.abs(p.value); })) || 1;
        pts.forEach(function (p, i) {
          var y = areaTop + i * rowH, bw = Math.max(6, Math.abs(p.value) / mx * (cw - labW - 190));
          ctx.fillStyle = '#c3cce0'; ctx.font = '600 ' + (sq ? 28 : 22) + 'px ' + sans; ctx.fillText(dShort(p.label, 22), padX, y + rowH * 0.62);
          ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(padX + labW, y + 6, cw - labW - 180, rowH - 14);
          ctx.fillStyle = i === 0 ? AH : 'rgba(' + A + ',0.55)'; ctx.fillRect(padX + labW, y + 6, bw, rowH - 14);
          ctx.fillStyle = '#fff'; ctx.font = '700 ' + (sq ? 30 : 24) + 'px ' + sans; ctx.fillText(String(p.raw), padX + labW + bw + 14, y + rowH * 0.64);
        });
      } else {
        var vals = pts.map(function (p) { return p.value; }), lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals); if (lo === hi) { lo -= 1; hi += 1; }
        var xs = function (i) { return padX + 20 + (pts.length === 1 ? 0 : i / (pts.length - 1)) * (cw - 40); }, ys = function (v) { return areaBot - 30 - (v - lo) / (hi - lo) * (areaBot - areaTop - 70); };
        ctx.strokeStyle = AH; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(xs(i), ys(p.value)); else ctx.moveTo(xs(i), ys(p.value)); }); ctx.stroke();
        pts.forEach(function (p, i) { ctx.fillStyle = '#0b1120'; ctx.beginPath(); ctx.arc(xs(i), ys(p.value), 9, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = AH; ctx.lineWidth = 4; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = '700 22px ' + sans; ctx.textAlign = 'center'; ctx.fillText(String(p.raw), xs(i), ys(p.value) - 20); ctx.fillStyle = '#9aa7c2'; ctx.font = '500 18px ' + sans; ctx.fillText(dShort(p.label, 12), xs(i), areaBot + 14); ctx.textAlign = 'left'; });
      }
      var fade2 = ctx.createLinearGradient(0, H * 0.6, 0, H); fade2.addColorStop(0, 'rgba(11,17,32,0)'); fade2.addColorStop(0.5, 'rgba(11,17,32,0.92)'); fade2.addColorStop(1, 'rgba(11,17,32,0.97)'); ctx.fillStyle = fade2; ctx.fillRect(0, H * 0.6, W, H * 0.4);
      headBottom(sq ? 3 : 2, sq ? 52 : 38); foot(); return;
    }
    // sections: the headline, then what is inside
    kicker(sq ? 96 : 70, pubName().toUpperCase());
    var size = sq ? 70 : 50, lines, maxL = sq ? 4 : 3; do { ctx.font = '700 ' + size + 'px ' + sans; lines = wrapLines(ctx, head, W - padX * 2); size -= 3; } while (lines.length > maxL && size > 32);
    var lh = Math.round(size * 1.16), y = (sq ? 150 : 108) + size; ctx.fillStyle = '#fff'; lines.slice(0, maxL).forEach(function (l, i) { ctx.fillText(l, padX, y + i * lh); });
    var list = includedSections().slice(0, 6), ly = y + Math.min(lines.length, maxL) * lh + (sq ? 40 : 22), cols = sq ? 1 : 2, colW = (W - padX * 2) / cols, rowH2 = sq ? 56 : 44;
    list.forEach(function (x, i) {
      var cx = padX + (cols === 2 ? Math.floor(i / 3) * colW : 0), cy = ly + (cols === 2 ? i % 3 : i) * rowH2;
      ctx.fillStyle = AH; ctx.font = '800 ' + (sq ? 28 : 22) + 'px ' + sans; ctx.fillText(('0' + (i + 1)).slice(-2), cx, cy);
      ctx.fillStyle = '#dfe5f2'; ctx.font = '600 ' + (sq ? 32 : 25) + 'px ' + sans; ctx.fillText(dShort(x.s.heading, sq ? 44 : 36), cx + (sq ? 56 : 46), cy);
    });
    foot();
  }
  function drawFeature(canvas, sq) {
    var d = state.digest, o = d.outline, W = sq ? 1080 : 1200, H = sq ? 1080 : 630, ctx = canvas.getContext('2d'); canvas.width = W; canvas.height = H;
    var sans = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', kind = imgKind(), plain = kind === 'plain';
    var seed = imgSeed(), col = imgColor(), A = col.rgb.join(','), AH = 'rgb(' + A + ')';
    var ang = (seed % 7) / 7 * 0.9, g = ctx.createLinearGradient(0, 0, W * Math.cos(ang) + H * 0.2, H * (0.7 + Math.sin(ang) * 0.3)); g.addColorStop(0, '#0b1120'); g.addColorStop(1, ['#17223b', '#152a36', '#2a1b2e', '#16243f', '#1d2236', '#1b2a1f'][IMG_COLORS.indexOf(col)] || '#17223b'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (kind === 'figure' || kind === 'chart' || kind === 'sections') { drawCover(kind, ctx, W, H, sq, col, seed, sans); return; }
    var pitch = W / 180, mapY = sq ? 230 : 34;
    function bx(lon) { return (lon + 180) / 360 * W; }
    function by(lat) { return mapY + (MAP_TOP - lat) / MAP_STEP * pitch; }
    var pl = articlePlaces(), base = [];
    pl.use.forEach(function (n) { var z = gazFind(n); if (z) base.push({ name: z[0], x: bx(z[3]), y: by(z[2]) }); });
    // View: zoom in on the region the article is about, so a digest on Taiwan chips and one on Gulf oil do not share a picture.
    var k = 1, fx = W / 2, fy = H / 2, tx = W * (0.4 + (seed % 21) / 100), ty = (sq ? H * 0.36 : H * 0.34) + ((seed >> 4) % 5 - 2) * 6, viewMode = dReview().imgView || 'auto';
    if (!plain && base.length && viewMode !== 'world') {
      var minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
      base.forEach(function (p) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y); });
      var bw = Math.max(maxx - minx, 1), bh = Math.max(maxy - miny, 1);
      k = Math.max(1, Math.min(3.2, (W * 0.64) / bw, ((sq ? H * 0.34 : H * 0.3)) / bh));
      if (base.length === 1) k = 2.4;
      if (k < 1.18) k = 1; else { fx = (minx + maxx) / 2; fy = (miny + maxy) / 2; }
    }
    function px(x) { return k === 1 ? x : tx + (x - fx) * k; }
    function py(y) { return k === 1 ? y : ty + (y - fy) * k; }
    var pts = base.map(function (p) { return { name: p.name, x: px(p.x), y: py(p.y) }; });
    if (!plain) {
      var rad = pitch * k, jit = (seed % 5) / 100;
      MAP_ROWS.forEach(function (hex, r) {
        var y = py(mapY + (r + 0.5) * pitch); if (y < -rad || y > H + rad) return;
        for (var c = 0; c < 180; c++) {
          if (!(parseInt(hex.charAt(c >> 2), 16) & (8 >> (c & 3)))) continue;
          var x = px((c + 0.5) * pitch); if (x < -rad || x > W + rad) continue;
          var near = 0;
          for (var q = 0; q < pts.length; q++) { var dx = x - pts[q].x, dy = y - pts[q].y, dd = Math.sqrt(dx * dx + dy * dy); near = Math.max(near, Math.max(0, 1 - dd / (W * (k > 1 ? 0.2 : 0.16)))); }
          ctx.fillStyle = near > 0.02 ? 'rgba(' + A + ',' + (0.22 + near * 0.6).toFixed(2) + ')' : 'rgba(147,160,186,' + (0.3 + jit + ((c * 7 + r * 13 + seed) % 5) * 0.012).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(x, y, rad * (0.2 + near * 0.12) * (k > 1 ? 0.9 : 1), 0, Math.PI * 2); ctx.fill();
        }
      });
      ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(' + A + ',0.42)';
      for (var a = 1; a < pts.length; a++) {
        var p0 = pts[(seed >> 3) % 2 && pts.length > 2 ? a - 1 : 0], p1 = pts[a], mx = (p0.x + p1.x) / 2, my = Math.min(p0.y, p1.y) - Math.abs(p1.x - p0.x) * 0.22 - 20;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(mx, my, p1.x, p1.y); ctx.stroke();
      }
      pts.forEach(function (p) {
        var rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 34); rg.addColorStop(0, 'rgba(' + A + ',0.55)'); rg.addColorStop(1, 'rgba(' + A + ',0)');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(p.x, p.y, 34, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = AH; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.font = '700 ' + (sq ? 22 : 20) + 'px ' + sans; ctx.textBaseline = 'middle'; var lab = p.name.toUpperCase(), lw = ctx.measureText(lab).width, left = p.x + 16 + lw > W - 30;
        ctx.fillStyle = 'rgba(11,17,32,0.7)'; ctx.fillRect(left ? p.x - 16 - lw - 8 : p.x + 12, p.y - 15, lw + 8, 30);
        ctx.fillStyle = '#ffffff'; ctx.fillText(lab, left ? p.x - 16 - lw - 4 : p.x + 16, p.y + 1);
      });
    } else {
      var cx = W * (0.55 + (seed % 30) / 100), cy = H * (0.3 + ((seed >> 5) % 30) / 100), step = (sq ? 62 : 52) * (0.8 + ((seed >> 9) % 5) / 10);
      for (var r2 = 1; r2 <= 9; r2++) { ctx.strokeStyle = 'rgba(' + A + ',' + (0.28 - r2 * 0.025).toFixed(3) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, r2 * step, 0, Math.PI * 2); ctx.stroke(); }
    }
    var fy2 = sq ? 0.5 : 0.40, fg = ctx.createLinearGradient(0, H * fy2, 0, H); fg.addColorStop(0, 'rgba(11,17,32,0)'); fg.addColorStop(0.55, 'rgba(11,17,32,0.9)'); fg.addColorStop(1, 'rgba(11,17,32,0.97)'); ctx.fillStyle = fg; ctx.fillRect(0, H * fy2, W, H * (1 - fy2));
    var padX = 64;
    if (sq) { ctx.fillStyle = AH; ctx.beginPath(); ctx.arc(padX + 9, 84, 9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#c3cce0'; ctx.font = '600 28px ' + sans; ctx.textBaseline = 'middle'; ctx.fillText(pubName().toUpperCase(), padX + 30, 86); }
    var size = sq ? 76 : 56, maxL = sq ? 5 : 3, lines;
    do { ctx.font = '700 ' + size + 'px ' + sans; lines = wrapLines(ctx, o.headline || '', W - padX * 2); size -= 3; } while (lines.length > maxL && size > 34);
    var lh = Math.round(size * 1.18), foot = H - 52, blockH = Math.min(lines.length, maxL) * lh, y0 = foot - 44 - blockH + lh * 0.82;
    ctx.fillStyle = AH; ctx.fillRect(padX, y0 - lh * 0.82 - 4, 54, 5);
    ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'alphabetic';
    lines.slice(0, maxL).forEach(function (l, i) { ctx.fillText(l, padX, y0 + 10 + i * lh); });
    ctx.fillStyle = '#9aa7c2'; ctx.font = '500 ' + (sq ? 26 : 22) + 'px ' + sans; ctx.textBaseline = 'alphabetic';
    var n = includedSections().length, sc = sourceCount();
    ctx.fillText((sq ? '' : pubName().toUpperCase() + '  ·  ') + (d.edition || (d.kind === 'commentary' ? 'Analysis' : 'Daily bulletin')).toUpperCase() + '  ·  ' + dateHuman(d.created) + (n ? '  ·  ' + n + ' stories' : '') + (sc ? ', ' + sc + ' sources' : ''), padX, foot);
  }
  function downloadCanvas(canvas, name) {
    canvas.toBlob(function (b) { if (!b) { toast('Could not make the image in this browser.', 'error'); return; } var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }, 'image/png');
  }
  function downloadText(text, name, type) {
    var b = new Blob([text], { type: type || 'text/plain' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- Review UI ----------

  // ---- Review: let the AI do the fixes it can do ----
  var strBusy = false;
  function reviewBusy(on, label) { strBusy = on; var b = document.getElementById('dgs-rv-strong'); if (b) { b.disabled = on; b.textContent = on ? (label || 'Working…') : 'Add a test to each section'; } }
  function strengthenAll() {
    if (strBusy || aiBusy()) return; if (!dKey()) { toast('This needs an AI key.', 'error'); return; }
    var dr = wrDraft(), todo = includedSections().filter(function (x) { var r = dr.sections[x.c.id]; return r && r.status === 'done' && r.paras && r.paras.length && !Q_SIGNAL.test(r.paras.join(' ')) && !r.thin; });
    if (!todo.length) { toast('Every section already says what would change the read.', 'success'); return; }
    var n = 0, i = 0;
    function next() {
      if (i >= todo.length) { reviewBusy(false); digestSave(); paintReview(); paintWrite(); toast(n ? 'Added a "what would change this read" line to ' + n + ' section' + (n === 1 ? '' : 's') + '. Read them.' : 'Could not add anything safely. Add one yourself in the Write step.', n ? 'success' : 'error'); return; }
      var x = todo[i++], r = dr.sections[x.c.id]; reviewBusy(true, 'Section ' + i + ' of ' + todo.length + '…');
      return gatherSources(x.c, function () { return false; }).then(function (srcs) {
        if (!srcs.length) return;
        var prompt = ['Add ONE closing paragraph of 40 to 70 words to this section. It starts with "What would change this read:" and names one concrete, checkable signal (a data release, a decision, a number to compare) that appears in or follows from the sources, and says plainly which result would prove our reading wrong. Use only facts, numbers and names that are in the sources. No predictions stated as fact. No filler.', '', 'SECTION TEXT:', r.paras.join('\n\n'), '', 'SOURCES (for checking facts only):', sourceBlock(srcs), '', 'Return STRICT JSON only: {"paragraphs":["..."]}'].join('\n');
        return callLLM(prompt, 'write', { best: true }).then(function (res) {
          var p = parseParas(res.text).paras, t = p && p[0] ? plainDashes(String(p[0]).trim()) : '';
          if (!t || t.split(/\s+/).length < 15 || t.split(/\s+/).length > 110 || !Q_SIGNAL.test(t)) return;
          var corpus = sourceCorpus(srcs), ch = checkText(t, corpus); if (ch.numbers.length || ch.names.length) return;
          r.paras.push(t); r.checks = checkText(r.paras.concat([r.reading || '']).join('\n\n'), corpus); r.edited = true; n++;
        });
      }).catch(function (e) { LOG('strengthen failed:', e && e.message); }).then(next);
    }
    next();
  }
  function suggestNote() {
    if (strBusy || aiBusy()) return; if (!dKey()) { toast('This needs an AI key.', 'error'); return; }
    var d = state.digest, dr = wrDraft(), fr = dr.frame || {}, secs = includedSections().map(function (x) { var r = dr.sections[x.c.id]; return r && r.paras ? '## ' + x.s.heading + '\n' + r.paras.join(' ').slice(0, 700) : ''; }).filter(Boolean).join('\n\n');
    var nb = document.getElementById('dgs-rv-note-ai'); if (nb) { nb.disabled = true; nb.textContent = 'Drafting…'; }
    var prompt = ['Draft the opening two sentences of a short analyst\'s note for this article, in the first person, as the publisher would say it. State the one position we take and the main reason, and name what would make us wrong. Do not claim any personal experience, meetings, sources or anything not in the text. No hype, no questions.', '', 'ARTICLE SUMMARY: ' + (fr.summary || ''), '', secs, '', 'Return STRICT JSON only: {"note":"two sentences"}'].join('\n');
    callLLM(prompt, 'write', { best: true }).then(function (res) {
      var j = null; try { j = JSON.parse((res.text.match(/\{[\s\S]*\}/) || [''])[0]); } catch (e) {}
      var t = j && j.note ? plainDashes(String(j.note).trim()) : ''; if (!t) { toast('Could not draft a note. Write two sentences yourself.', 'error'); return; }
      var ta = document.getElementById('dgs-rv-note'); d.note = t.slice(0, 1500); if (ta) { ta.value = d.note; ta.focus(); }
      digestSave(); paintReview(); toast('Draft added. Add a sentence of your own view, and change anything that is not yours.', 'success');
    }).catch(function (e) { toast('Could not draft a note: ' + dShort(e && e.message, 100), 'error'); }).then(function () { var b = document.getElementById('dgs-rv-note-ai'); if (b) { b.disabled = false; b.textContent = 'Draft a start for me'; } });
  }

  // ---- Unsupported numbers: find them anywhere in the article and cut the sentences that carry them ----
  function allCorpus() { var d = state.digest, srcs = []; (d.clusters || []).forEach(function (c) { c.ids.forEach(function (id) { if (artCache[id]) srcs.push(artCache[id]); }); }); return sourceCorpus(srcs); }
  function cutSentences(text, bad) {
    var cut = 0, out = sentencesOf(text).filter(function (st) { var hit = bad.some(function (b) { return st.indexOf(b) !== -1; }); if (hit) cut++; return !hit; });
    return { text: out.join('').trim(), cut: cut };
  }
  function removeUnsupported() {
    var d = state.digest, dr = wrDraft(), fr = dr.frame, corpus = allCorpus(), total = 0;
    if (!corpus.trim()) { toast('The source texts are not loaded. Open the Write step and re-run the checks first.', 'error'); return; }
    includedSections().forEach(function (x) {
      var r = dr.sections[x.c.id]; if (!r || r.status !== 'done') return;
      var bad = checkText(r.paras.concat([r.reading || '']).join('\n\n'), sourceCorpus(x.c.ids.map(function (id) { return artCache[id]; }).filter(Boolean)) || corpus).numbers; if (!bad.length) return;
      r.undo = { paras: r.paras.slice(), reading: r.reading || '' };
      var np = [], n = 0; r.paras.forEach(function (p) { var o = cutSentences(p, bad); n += o.cut; if (o.text) np.push(o.text); });
      if (np.length) r.paras = np; var rr = cutSentences(r.reading || '', bad); n += rr.cut; r.reading = rr.text;
      r.edited = true; total += n; recheck(x.c, r);
    });
    if (fr) {
      ['summary', 'opening'].forEach(function (k) { if (!fr[k]) return; var b = checkText(fr[k], corpus).numbers; if (b.length) { var o = cutSentences(fr[k], b); if (o.text) { fr[k] = o.text; total += o.cut; } } });
      if (fr.watch) { var keep = fr.watch.filter(function (w) { return !checkText(w, corpus).numbers.length; }); total += fr.watch.length - keep.length; fr.watch = keep; }
    }
    touchDraft(); digestSave(); paintWrite(); paintReview();
    toast(total ? 'Removed ' + total + ' sentence' + (total === 1 ? '' : 's') + ' or item' + (total === 1 ? '' : 's') + ' with numbers the sources do not contain. Check that each section still has its test line, and add one yourself if not. Undo is in the Write step.' : 'Nothing to remove. Every number is in the sources.', total ? 'success' : '');
  }
  function watchBadCount() { var fr = wrDraft().frame, c = allCorpus(); if (!fr || !fr.watch || !c.trim()) return 0; return fr.watch.filter(function (w) { return checkText(w, c).numbers.length; }).length; }
  var RISK_WORDS = /\b(spy|spies|espionage|corrupt\w*|brib\w+|fraud\w*|misconduct|genocide|war crimes?|criminal\w*|illegal\w*|launder\w*|treason\w*|traitor\w*|collud\w+|blackmail\w*|smuggl\w+)\b/gi;
  function riskWords() {
    var dr = wrDraft(), found = {};
    includedSections().forEach(function (x) { var r = dr.sections[x.c.id]; if (!r || !r.reading) return; var t = r.reading.replace(/["“][^"”]{8,}["”]/g, ' '), m; RISK_WORDS.lastIndex = 0; while ((m = RISK_WORDS.exec(t))) found[m[0].toLowerCase()] = 1; });
    return Object.keys(found);
  }
  function paintReview() {
    var st = reviewStatus(), rv = dReview();
    var box = document.getElementById('dgs-rv-check'); if (!box) return;
    box.innerHTML = '';
    function item(ok, text, warn) { var li = el('li', { class: ok ? 'is-ok' : warn ? 'is-warn' : 'is-bad' }); li.appendChild(el('span', { class: 'dgs-rv-mark', text: ok ? '✓' : warn ? '!' : '✕' })); li.appendChild(el('span', { text: text })); box.appendChild(li); }
    item(st.total > 0 && st.done === st.total, st.done + ' of ' + st.total + ' sections written' + (st.missing.length ? ' (missing: ' + st.missing.slice(0, 3).join(', ') + ')' : ''));
    item(st.frame, st.frame ? 'Summary, opening and what to watch written' : 'No summary yet. Press "Write summary again" in the Write step.');
    if (st.thin) item(false, st.thin + ' section' + (st.thin === 1 ? ' rests' : 's rest') + ' on very little source text and ' + (st.thin === 1 ? 'is' : 'are') + ' shown as a short brief. Consider removing ' + (st.thin === 1 ? 'it' : 'them') + ' or adding sources.', true);
    item(st.stale === 0, st.stale ? st.stale + ' section' + (st.stale === 1 ? ' is' : 's are') + ' out of date after changes. Rewrite them in the Write step.' : 'No section is out of date', st.stale > 0);
    item(!!noteText(state.digest), noteText(state.digest) ? 'Your analyst\'s note is in the article' : 'No analyst\'s note yet. Two to four sentences in your own words are what make this yours.', !(state.digest.note && String(state.digest.note).trim()));
    item(st.numbers === 0, st.numbers ? st.numbers + ' number' + (st.numbers === 1 ? '' : 's') + ' not found in the sources. Check them in the Write step.' : 'Every number appears in the sources', st.numbers > 0);
    item(st.tells === 0, st.tells ? st.tells + ' phrase' + (st.tells === 1 ? '' : 's') + ' that read as machine-written. Fix them or accept them.' : 'No machine-sounding phrases flagged', st.tells > 0);
    var rs = readStats(); item(rs.pct <= 25 && rs.maxP <= 150, 'Plain reading: ' + rs.pct + '% of sentences are over 20 words (aim for 25% or less)' + (rs.maxP > 150 ? '; one paragraph has ' + rs.maxP + ' words' : '') + '. Long sentences are split at the commas when the article is built.', rs.pct > 25 || rs.maxP > 150);
    var wb = watchBadCount(); if (wb) item(false, wb + ' "what to watch" item' + (wb === 1 ? '' : 's') + ' contain numbers that are not in the sources. They were invented by the AI. Press "Remove unsupported numbers".', false);
    var rk = riskWords(); if (rk.length) item(false, 'Our read uses serious-allegation words (' + rk.join(', ') + '). Confirm each is attributed to a source, not our own claim about a named person.', true);
    var rn = document.getElementById('dgs-rv-nums'); if (rn) rn.hidden = !(st.numbers || wb);
    var QA = qualityAll(state.profile && state.profile.id), qd = QA[state.digest.id] || qualityOf(state.digest);
    item(qd.grade === 'ready', 'Publish-readiness: ' + qd.label + (qd.grade === 'none' ? '' : ' (' + qd.score + '/100)') + (qd.reasons.length && qd.grade !== 'ready' ? '. ' + qd.reasons.slice(0, 3).join('; ') : ''), qd.grade === 'fix');
    var cb = document.getElementById('dgs-rv-ok'); if (cb) cb.checked = !!rv.reviewed;
    
    var hd = document.getElementById('dgs-rv-head'); if (hd && document.activeElement !== hd) hd.value = state.digest.outline ? state.digest.outline.headline : '';
    var ed = document.getElementById('dgs-rv-edition'); if (ed && document.activeElement !== ed) ed.value = state.digest.edition || '';
    var nt = document.getElementById('dgs-rv-note'); if (nt && (document.activeElement !== nt || nt.dataset.d !== state.digest.id)) { nt.value = state.digest.note || ''; nt.dataset.d = state.digest.id; }
    ensureDigestCss();
    var pv = document.getElementById('dgs-rv-preview');
    if (pv) pv.innerHTML = '<h1 class="dgs-pv-title">' + esc(state.digest.outline.headline) + '</h1>' + articleHtml({ preview: true });
  }
  function renderReview() {
    var d = state.digest; if (!d.outline) return;
    updateStepAvailability();
    var st = reviewStatus();
    if (!st.done) { var pv = document.getElementById('dgs-rv-preview'); if (pv) pv.innerHTML = '<p class="dgs-hint">Write the article first.</p>'; var ck = document.getElementById('dgs-rv-check'); if (ck) ck.innerHTML = ''; return; }
    paintReview();
  }
  function reviewBind() {
    var g = function (id, fn) { var n = document.getElementById(id); if (n) n.addEventListener('click', fn); };
    g('dgs-rv-back', function () { setStep('write'); });
    g('dgs-rv-fix', function () { setStep('write'); });
    g('dgs-rv-next', function () { if (!dReview().reviewed) { askConfirm(); return; } setStep('export'); });
    g('dgs-wr-next', function () { var st = reviewStatus(); if (!st.done) { toast('Write at least one section first.', 'error'); return; } setStep('review'); });
    var cb = document.getElementById('dgs-rv-ok'); if (cb) cb.addEventListener('change', function () {
      if (cb.checked) { var stt = reviewStatus(), wbb = watchBadCount(); if ((stt.numbers || wbb) && !confirm((stt.numbers + wbb) + ' number' + (stt.numbers + wbb === 1 ? '' : 's') + ' in this article are not in the sources (invented or mistyped). Readers will see them.\n\nOK = confirm anyway.\nCancel = go back and press "Remove unsupported numbers".')) { cb.checked = false; return; } }
      dReview().reviewed = cb.checked; digestSave(); updateStepAvailability(); paintReview(); });
    g('dgs-rv-nums', removeUnsupported);
    g('dgs-rv-strong', strengthenAll); g('dgs-rv-note-ai', suggestNote);
    var nt0 = document.getElementById('dgs-rv-note'); if (nt0) nt0.addEventListener('input', function () { if (nt0.dataset.d && nt0.dataset.d !== state.digest.id) return; state.digest.note = nt0.value.slice(0, 1500); digestSave(); var pv = document.getElementById('dgs-rv-preview'); if (pv && state.digest.outline) pv.innerHTML = '<h1 class="dgs-pv-title">' + esc(state.digest.outline.headline) + '</h1>' + articleHtml({ preview: true }); });
    var ed0 = document.getElementById('dgs-rv-edition'); if (ed0) ed0.addEventListener('input', function () { state.digest.edition = ed0.value.trim().slice(0, 40); touchDraft(); var pv = document.getElementById('dgs-rv-preview'); if (pv) pv.innerHTML = '<h1 class="dgs-pv-title">' + esc(state.digest.outline.headline) + '</h1>' + articleHtml({ preview: true }); });
    var hd = document.getElementById('dgs-rv-head'); if (hd) hd.addEventListener('input', function () { state.digest.outline.headline = hd.value.trim() || state.digest.outline.headline; digestSave(); var pv = document.getElementById('dgs-rv-preview'); if (pv) pv.innerHTML = '<h1 class="dgs-pv-title">' + esc(state.digest.outline.headline) + '</h1>' + articleHtml({ preview: true }); });
    g('dgs-ex-back', function () { setStep('review'); });
    g('dgs-ex-seo', generateSeo);
    g('dgs-ex-copy-html', function () { state.digest.exportedAt = Date.now(); digestSave(); copyText(articleHtml()); toast('HTML copied. Paste it into the WordPress Code editor.', 'success'); });
    g('dgs-ex-dl-html', function () { state.digest.exportedAt = Date.now(); digestSave(); downloadText(articleHtml(), slugify(state.digest.outline.headline, 50) + '.html', 'text/html'); });
    g('dgs-ex-copy-md', function () { copyText(draftMarkdown()); toast('Markdown copied.', 'success'); });
    g('dgs-ex-copy-title', function () { var s = dReview().seo; copyText((s && s.title) || state.digest.outline.headline); toast('Title copied.', 'success'); });
    g('dgs-ex-dl-img', function () { var c = document.getElementById('dgs-ex-canvas'); if (c) downloadCanvas(c, slugify(state.digest.outline.headline, 50) + '-cover.png'); });
    var n1 = document.getElementById('dgs-ex-nav'); if (n1) n1.addEventListener('change', function () { dReview().nav = n1.checked; digestSave(); renderExport(); });
    var np = document.getElementById('dgs-ex-pq'); if (np) np.addEventListener('change', function () { dReview().pull = np.checked; digestSave(); renderExport(); });
    var is = document.getElementById('dgs-ex-imgstyle'); if (is) is.addEventListener('change', function () { dReview().imgStyle = is.value; digestSave(); renderExport(); });
    var ic = document.getElementById('dgs-ex-imgcolor'); if (ic) { ic.innerHTML = ''; ic.appendChild(el('option', { value: 'auto', text: 'Automatic (different for each digest)' })); IMG_COLORS.forEach(function (c) { ic.appendChild(el('option', { value: c.id, text: c.name })); }); ic.addEventListener('change', function () { dReview().imgColor = ic.value === 'auto' ? '' : ic.value; digestSave(); renderExport(); }); }
    var iv = document.getElementById('dgs-ex-imgview'); if (iv) iv.addEventListener('change', function () { dReview().imgView = iv.value; digestSave(); renderExport(); });
    var pl = document.getElementById('dgs-ex-places'); if (pl) pl.addEventListener('change', function () {
      var names = pl.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean), ok = [], bad = [];
      names.forEach(function (n) { var z = gazFind(n); if (z) { if (ok.indexOf(z[0]) === -1) ok.push(z[0]); } else bad.push(n); });
      dReview().places = names.length ? ok.slice(0, 6) : null; digestSave();
      if (bad.length) toast('Not on the map list: ' + bad.join(', ') + '. Try a country name.', 'error');
      renderExport();
    });
    g('dgs-ex-copy-css', function () { copyText(cssFor(curStyle())); toast('Stylesheet for "' + curStyle() + '" copied. Add it under Appearance, Customize, Additional CSS.', 'success'); });
    g('dgs-ex-copy-css-all', function () { copyText(cssFor('all')); toast('Stylesheet with all styles copied. Add it once, then pick a style per article.', 'success'); });
    g('dgs-ex-dl-css', function () { downloadText(cssFor(curStyle()), 'autonom-digest-' + curStyle() + '.css', 'text/css'); });
    g('dgs-ex-dl-css-all', function () { downloadText(cssFor('all'), 'autonom-digest-all-styles.css', 'text/css'); });
    var ncr = document.getElementById('dgs-ex-credit'); if (ncr) ncr.addEventListener('change', function () { dReview().credit = ncr.checked; digestSave(); renderExport(); });
    var n2 = document.getElementById('dgs-ex-disc'); if (n2) n2.addEventListener('change', function () { dReview().disclose = n2.checked; digestSave(); renderExport(); });
    var n3 = document.getElementById('dgs-ex-disc-text'); if (n3) n3.addEventListener('change', function () { dReview().disclosure = n3.value.trim(); digestSave(); renderExport(); });
    [['dgs-ex-links', 'links'], ['dgs-ex-cta-title', 'ctaTitle'], ['dgs-ex-cta-text', 'ctaText'], ['dgs-ex-cta-label', 'ctaLabel'], ['dgs-ex-cta-url', 'ctaUrl']].forEach(function (a) {
      var f = document.getElementById(a[0]); if (f) f.addEventListener('change', function () { if (!state.profile) return; state.profile.promo = state.profile.promo || {}; state.profile.promo[a[1]] = f.value.trim(); persistProfile(); renderExport(); });
    });
  }

  // ---------- Export UI ----------
  function paintExport() {
    var go = document.getElementById('dgs-ex-seo'); if (go) { go.disabled = exBusy; go.textContent = exBusy ? 'Writing…' : (dReview().seo ? 'Write search fields again' : 'Write search fields'); }
  }
  function renderStyles() {
    var box = document.getElementById('dgs-ex-styles'); if (!box) return; box.innerHTML = '';
    var cur = curStyle();
    styleList().forEach(function (st) {
      var b = el('button', { type: 'button', class: 'dgs-style-card' + (st.id === cur ? ' is-on' : ''), 'aria-pressed': String(st.id === cur) });
      var sw = el('span', { class: 'dgs-style-sw' }); st.sw.forEach(function (c) { var i = el('i'); i.style.background = c.trim(); sw.appendChild(i); });
      b.appendChild(sw); b.appendChild(el('strong', { text: st.name })); b.appendChild(el('small', { text: st.desc }));
      b.addEventListener('click', function () { dReview().style = st.id; try { localStorage.setItem(STYLE_LS, st.id); } catch (e) {} digestSave(); renderExport(); });
      box.appendChild(b);
    });
    ensureDigestCss();
    var pv = document.getElementById('dgs-ex-preview'); if (pv) pv.innerHTML = '<h1 class="dgs-pv-title">' + esc(state.digest.outline.headline) + '</h1>' + articleHtml({ preview: true });
  }
  function renderExport() {
    var d = state.digest, rv = dReview(); if (!d.outline) return;
    paintExport();
    setTimeout(autoCharts, 400); paintScript();
    var n1 = document.getElementById('dgs-ex-nav'); if (n1) n1.checked = !!rv.nav;
    var n2 = document.getElementById('dgs-ex-disc'); if (n2) n2.checked = !!rv.disclose;
    var np = document.getElementById('dgs-ex-pq'); if (np) np.checked = rv.pull !== false;
    var ncr = document.getElementById('dgs-ex-credit'); if (ncr) ncr.checked = rv.credit !== false;
    renderStyles();
    var is = document.getElementById('dgs-ex-imgstyle'); if (is) { is.value = rv.imgStyle || 'auto'; var vk = imgKinds(); Array.prototype.forEach.call(is.options, function (op) { op.disabled = op.value !== 'auto' && vk.indexOf(op.value) === -1; }); }
    var ic2 = document.getElementById('dgs-ex-imgcolor'); if (ic2) ic2.value = rv.imgColor || 'auto';
    var iv2 = document.getElementById('dgs-ex-imgview'); if (iv2) iv2.value = rv.imgView === 'world' ? 'world' : 'auto';
    var pl = document.getElementById('dgs-ex-places'); if (pl && document.activeElement !== pl) { try { pl.value = articlePlaces().use.join(', '); } catch (e) {} }
    var n3 = document.getElementById('dgs-ex-disc-text'); if (n3) n3.value = rv.disclosure || defaultDisclosure();
    var pm = (state.profile && state.profile.promo) || {}; [['dgs-ex-links', 'links'], ['dgs-ex-cta-title', 'ctaTitle'], ['dgs-ex-cta-text', 'ctaText'], ['dgs-ex-cta-label', 'ctaLabel'], ['dgs-ex-cta-url', 'ctaUrl']].forEach(function (a) { var f = document.getElementById(a[0]); if (f && document.activeElement !== f) f.value = pm[a[1]] || ''; });
    var sb = document.getElementById('dgs-ex-seo-box'); if (sb) {
      sb.innerHTML = '';
      var s = rv.seo;
      if (!s) { sb.appendChild(el('p', { class: 'dgs-hint', text: 'Press "Write search fields" for a primary keyword, secondary keywords, an SEO title, meta description, slug, excerpt, tags and image alt text. You can edit all of them, and the checks update as you do.' })); }
      else {
        var mk = function (lab, key, max, rows) {
          var w = el('label', { class: 'dgs-field' }); var head = el('span', { class: 'dgs-label' }); head.appendChild(document.createTextNode(lab + ' '));
          var cnt = el('small', { class: 'dgs-ex-count' }); head.appendChild(cnt); w.appendChild(head);
          var inp = rows ? el('textarea', { class: 'dgs-out-input', rows: String(rows) }) : el('input', { type: 'text', class: 'dgs-out-input' });
          var cur = (key === 'tags' || key === 'secondary') ? (s[key] || []).join(', ') : s[key]; inp.value = cur || '';
          var upd = function () { var n = inp.value.length; cnt.textContent = max ? n + ' / ' + max : ''; cnt.className = 'dgs-ex-count' + (max && n > max ? ' is-over' : ''); };
          inp.addEventListener('input', upd); upd();
          inp.addEventListener('change', function () { s[key] = (key === 'tags' || key === 'secondary') ? inp.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : (key === 'focus' ? inp.value.toLowerCase().replace(/\s+/g, ' ').trim() : key === 'slug' ? slugify(inp.value, 80) : inp.value.trim()); if (key === 'slug') inp.value = s.slug; digestSave(); paintSeoChecks(); if (key === 'alt') { /* no redraw */ } });
          w.appendChild(inp); sb.appendChild(w);
        };
        mk('Primary keyword (the phrase to rank for)', 'focus', 0); mk('Secondary keywords (comma separated)', 'secondary', 0);
        var kc = el('div', { class: 'dgs-seo-checks', id: 'dgs-seo-checks' }); sb.appendChild(kc); paintSeoChecks();
        mk('SEO title', 'title', 60); mk('Meta description', 'meta', 155, 2); mk('URL slug', 'slug', 0); mk('Excerpt', 'excerpt', 200, 2); mk('Tags (comma separated)', 'tags', 0); mk('Feature image alt text', 'alt', 125);
      }
    }
    var c = document.getElementById('dgs-ex-canvas'); if (c) { try { drawFeature(c); } catch (e) { LOG('feature image failed', e); } }
    var c2 = document.getElementById('dgs-ex-canvas2'); if (c2) { try { drawFeature(c2, true); } catch (e) { LOG('square image failed', e); } }
    renderCharts();
    var ta = document.getElementById('dgs-ex-html'); if (ta) ta.value = articleHtml();
    var wc = document.getElementById('dgs-ex-count'); if (wc) wc.textContent = wordCount() + ' words';
  }

  function fetchSite(url) {
    var cfg = window.AUTONOM_DGS || {};
    if (!cfg.siteEndpoint) return Promise.reject(new Error('The site reader is not available on this page.'));
    var ep = cfg.siteEndpoint + (cfg.siteEndpoint.indexOf('?') > -1 ? '&' : '?') + 'url=' + encodeURIComponent(url);
    return fetchWithTimeout(ep, { credentials: 'same-origin' }, 40000)
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error(j && j.error === 'rate_limited' ? 'Too many tries. Wait a few minutes.' : 'Could not read that website. Check the address.');
        return j;
      });
  }
  function readSite(input, btn, st) {
    var url = String(input || '').trim();
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (!/^https?:\/\/[^\s.]+\.[^\s]+/i.test(url)) { toast('Enter a website address.', 'error'); return; }
    var orig = btn.textContent; btn.disabled = true; btn.textContent = 'Reading…'; st.textContent = 'Reading the home page and feed…';
    fetchSite(url).then(function (site) {
      var posts = site.items || [];
      var texts = posts.map(function (p) { return { title: p.title, description: p.text }; });
      if (!texts.length && site.title) texts = [{ title: site.title, description: site.description || '' }];
      var name = String(site.title || '').split(/\s[|\u2013\u2014-]\s/)[0].trim() || hostOf(url);
      var p = deriveFromTexts(texts, {
        name: name, oneLiner: String(site.description || '').split(/[.\n]/)[0].slice(0, 120), positioning: site.description || '',
        samples: { titles: posts.slice(0, 15).map(function (x) { return x.title; }), top: [], posts: [] },
        source: { mode: 'website', url: url, language: 'en' }, method: 'website feed + heuristic', confidence: posts.length >= 5 ? 0.7 : 0.45
      });
      p.links = { website: url };
      var old = state.profiles.filter(function (x) { return x.source && x.source.url === url; })[0]; if (old) p.id = old.id;
      state.profile = p; persistProfile(); renderProfile(); updateStepAvailability();
      var note = posts.length ? 'Read ' + posts.length + ' recent posts.' : 'No public feed found, so the topics come from the home page only. Add topics and signals by hand.';
      if (!dKey()) { st.textContent = note + ' Add an AI key to also describe your voice from your posts.'; toast('Profile made from your website.', 'success'); return; }
      var pick = posts.slice(0, 3).filter(function (x) { return x.link; });
      st.textContent = note + ' Reading your latest posts to describe your voice…';
      return Promise.all(pick.map(function (x) { return fetchArticle(x.link).then(function (j) { return j && String(j.text || '').length > 300 ? { k: x.title, text: String(j.text).slice(0, 2200) } : null; }); })).then(function (got) {
        got = got.filter(Boolean);
        if (!got.length) got = posts.slice(0, 5).filter(function (x) { return x.text.length > 120; }).map(function (x) { return { k: x.title, text: x.text }; });
        p.identity.samples.posts = got.slice(0, 2).map(function (g) { return dShort(g.text, 700); });
        if (!got.length) { persistProfile(); st.textContent = note + ' The posts had too little text to learn a voice from.'; return; }
        return suggestDna(p, got).then(function (t) {
          if (t) p.identity.dna = t;
          persistProfile(); renderProfile();
          st.textContent = note + (t ? ' Voice description written from ' + got.length + ' post' + (got.length === 1 ? '' : 's') + '. Open Edit to read and adjust it.' : ' The AI returned no voice description; write one under Edit.');
          toast('Profile and voice made from your website.', 'success');
        });
      });
    }).catch(function (e) { st.textContent = (e && e.message) || 'Could not read that website.'; toast(st.textContent, 'error'); })
      .then(function () { btn.disabled = false; btn.textContent = orig; });
  }

  // =====================================================================
  // Charts and art: grounded in the sources. A chart exists only if its numbers and a quote are found in the articles.
  // =====================================================================
  var CH_COLORS = ['#3157f0', '#f5a524', '#14804a', '#d12c2c', '#7a5af8', '#0e9aa7'];
  var chBusy = false, chRun = 0;
  function dCharts() { var rv = dReview(); if (!rv.charts) rv.charts = []; return rv.charts; }
  function chartKey(c) { return normQ(c.title) + '|' + (c.points || []).map(function (p) { return normQ(p.raw); }).sort().join(','); }
  function normQ(t) { return String(t || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim(); }
  function chartPrompt(s, srcs, have) {
    return [
      'Find ONE chart in the sources below for the article section "' + s.heading + '", or none.',
      (have && have.length) ? 'These charts already exist for this section. Do NOT repeat them or show the same numbers again; look for a different set of numbers, or return null: ' + have.map(function (c) { return '"' + c.title + '" (' + c.points.map(function (p) { return p.raw; }).join(', ') + ')'; }).join('; ') + '.' : '',
      '',
      'A chart is allowed only when the sources themselves state the numbers:',
      '- "bar": 2 to 6 comparable values with the same unit (for example three countries\' inflation rates).',
      '- "line": 3 to 8 values over time with the same unit, in time order.',
      '- "stat": one headline number worth showing large (a rate, a price, a total), with what it measures.',
      '',
      'RULES (strict):',
      '- Use only numbers written in the sources. Never calculate, estimate, convert or round them.',
      '- "raw" is the number exactly as written in the sources, for example "3.5%" or "$91" or "2.1 million".',
      '- "value" is its plain numeric value (3.5, 91, 2.1). "unit" is the short unit ("%", "USD per barrel", "million people").',
      '- "quote" is ONE short passage copied word for word from a source that contains the numbers (under 220 characters).',
      '- "tag" is the source tag, for example "A2". "title" is a plain chart title, at most 70 characters, stating what is measured, not a conclusion.',
      '- If the sources do not give clean, comparable numbers, return {"chart":null}. Returning null is the right answer most of the time.',
      '', 'SOURCES:', sourceBlock(srcs), '',
      'Return STRICT JSON only: {"chart":{"type":"bar","title":"...","unit":"...","points":[{"label":"...","raw":"...","value":0}],"tag":"A1","quote":"..."}} or {"chart":null}'
    ].join('\n');
  }
  function verifyChart(ch, srcs) {
    if (!ch || !ch.points || !ch.type) return null;
    var tagN = parseInt(String(ch.tag || '').replace(/\D/g, ''), 10), src = srcs[tagN - 1];
    if (!src) return null;
    var quote = normQ(ch.quote); if (quote.length < 12) return null;
    var corpus = normQ(src.text);
    if (corpus.indexOf(quote) === -1) return null;
    var qNums = {}; numTokens(ch.quote).forEach(function (t) { qNums[numKey(t)] = 1; });
    var pts = [];
    ch.points.forEach(function (p) {
      var v = parseFloat(String(p.value).replace(/,/g, '')), k = numKey(p.raw);
      if (!isFinite(v) || !k || !p.label) return;
      if (!qNums[k]) return;                       // the number must be inside the quoted passage itself
      if (Math.abs(parseFloat(k) - Math.abs(v)) > 1e-9 && parseFloat(k) !== v) { /* scaled units such as million: allow when raw has a word unit */ if (!/million|billion|bn|k|m|%|percent/i.test(p.raw)) return; }
      pts.push({ label: dShort(String(p.label), 28), raw: String(p.raw).trim(), value: v });
    });
    function unitSig(r) { r = String(r).toLowerCase(); return /%|percent/.test(r) ? '%' : /[$]/.test(r) ? '$' : /€/.test(r) ? 'eur' : /£/.test(r) ? 'gbp' : (r.match(/(million|billion|bn|thousand|k|m)\b/) || ['', ''])[1] + '#'; }
    var type = ch.type === 'line' ? 'line' : ch.type === 'stat' ? 'stat' : 'bar';
    if (type !== 'stat' && pts.length > 1 && pts.some(function (p) { return unitSig(p.raw) !== unitSig(pts[0].raw); })) return null;
    if (type === 'stat') { if (pts.length < 1) return null; pts = pts.slice(0, 1); }
    else if (pts.length < 2 || pts.length < ch.points.length - 1) return null;
    return { type: type, title: dShort(plainDashes(String(ch.title || '')), 80), unit: dShort(String(ch.unit || ''), 30), points: pts.slice(0, 8), source: src.source, url: src.url, quote: dShort(String(ch.quote), 240) };
  }
  var chartsAuto = {};
  function autoCharts() {
    var d = state.digest; if (!d || chartsAuto[d.id] || dCharts().length || !dKey() || chBusy) return;
    chartsAuto[d.id] = 1; try { findCharts(); } catch (e) {}
  }
  function findCharts() {
    var dr = wrDraft();
    if (!dKey()) { toast('Charts need an AI key to read the sources.', 'error'); return; }
    if (chBusy) return; chBusy = true; var mine = ++chRun, stop = function () { return mine !== chRun; };
    var list = includedSections().filter(function (x) { var r = dr.sections[x.c.id]; return r && r.status === 'done' && dCharts().filter(function (c) { return c.cid === x.c.id; }).length < 2; });
    if (!list.length) { chBusy = false; toast('Every section already has two charts. Remove one to look for another.', ''); paintCharts(); return; }
    var found = [], i = 0, rejected = 0, dup = 0; paintCharts('Reading sources…');
    function next() {
      if (stop() || i >= list.length) return Promise.resolve();
      var x = list[i++]; paintCharts('Looking for numbers in "' + dShort(x.s.heading, 40) + '" (' + i + ' of ' + list.length + ')…');
      return gatherSources(x.c, stop).then(function (srcs) {
        if (!srcs.length) return;
        var have = dCharts().concat(found).filter(function (c) { return c.cid === x.c.id; });
        return callLLM(chartPrompt(x.s, srcs, have), 'write', { best: true }).then(function (r) {
          var j = extractJson(r.text), ok = j && j.chart ? verifyChart(j.chart, srcs) : null;
          if (j && j.chart && !ok) rejected++;
          if (ok && have.some(function (c) { return chartKey(c) === chartKey(ok); })) { dup++; ok = null; }
          if (ok) { ok.id = 'ch' + Date.now().toString(36) + i; ok.cid = x.c.id; ok.include = true; found.push(ok); }
        }).catch(function (e) { LOG('chart failed', e && e.message); });
      }).then(function () { return sleep(300); }).then(next);
    }
    next().then(function () {
      if (stop()) return; chBusy = false;
      dReview().charts = dCharts().concat(found); digestSave(); renderExport();
      toast(found.length ? found.length + ' new chart' + (found.length === 1 ? '' : 's') + ' added. Your earlier charts were kept.' + (dup ? ' ' + dup + ' repeat' + (dup === 1 ? '' : 's') + ' skipped.' : '') + (rejected ? ' ' + rejected + ' dropped because the numbers could not be matched to a quote.' : '') : 'No chart-worthy numbers found' + (rejected ? ' (' + rejected + ' proposals dropped: numbers could not be matched to the sources)' : '') + '. That is normal for many days.', found.length ? 'success' : '');
    });
  }
  function svgEsc(s) { return esc(s); }
  function fmtNum(v) { return Math.abs(v) >= 1000 ? v.toLocaleString('en-US') : String(Math.round(v * 100) / 100); }
  function chartSvg(c) {
    var W = 520, sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", pts = c.points, out = [];
    var label = c.title + (c.unit ? ' (' + c.unit + ')' : '') + '. ' + pts.map(function (p) { return p.label + ' ' + p.raw; }).join(', ') + '. Source: ' + c.source + '.';
    function head(H) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + svgEsc(label) + '" style="max-width:' + W + 'px;height:auto;font-family:' + sans + '"><title>' + svgEsc(c.title) + '</title><rect width="' + W + '" height="' + H + '" rx="12" fill="#ffffff" stroke="#dde1ea"/>'; }
    function title(y) { return '<text x="28" y="' + y + '" font-size="18" font-weight="700" fill="#141a2a">' + svgEsc(dShort(c.title, 64)) + '</text>' + (c.unit ? '<text x="28" y="' + (y + 20) + '" font-size="13" fill="#7a869b">' + svgEsc(c.unit) + '</text>' : ''); }
    function foot(H) { return '<text x="28" y="' + (H - 16) + '" font-size="12" fill="#7a869b">Source: ' + svgEsc(c.source) + '</text>'; }
    if (c.type === 'stat') {
      var H1 = 190, p0 = pts[0], rawL = String(p0.raw).toLowerCase(), titleL = String(c.title).toLowerCase();
      var showUnit = c.unit && !/[$€£%]/.test(p0.raw) && !String(c.unit).toLowerCase().split(/\s+/).some(function (w) { return w.length > 2 && rawL.indexOf(w) !== -1; });
      var showLab = p0.label && titleL.indexOf(String(p0.label).toLowerCase()) === -1;
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H1 + '" width="100%" role="img" aria-label="' + svgEsc(label) + '" style="max-width:' + W + 'px;height:auto;font-family:' + sans + '"><title>' + svgEsc(c.title) + '</title><rect width="' + W + '" height="' + H1 + '" rx="12" fill="#0d1424"/><rect x="0" y="0" width="8" height="' + H1 + '" rx="4" fill="#f5a524"/><text x="32" y="42" font-size="16" font-weight="600" fill="#c3cce0">' + svgEsc(dShort(c.title, 70)) + '</text><text x="32" y="' + (showUnit || showLab ? 112 : 124) + '" font-size="60" font-weight="700" fill="#ffffff">' + svgEsc(p0.raw) + '</text>' + (showUnit || showLab ? '<text x="32" y="142" font-size="15" fill="#9aa7c2">' + svgEsc(showLab ? p0.label : c.unit) + '</text>' : '') + '<text x="32" y="' + (H1 - 16) + '" font-size="12" fill="#7f8cab">Source: ' + svgEsc(c.source) + '</text></svg>';
    }
    if (c.type === 'bar') {
      var rowH = 38, top = 72, H2 = top + pts.length * rowH + 40, labW = 140, barX = 28 + labW, maxW = W - barX - 70;
      var vals = pts.map(function (p) { return p.value; }), mx = Math.max.apply(null, vals.concat([0])), mn = Math.min.apply(null, vals.concat([0])), span = (mx - mn) || 1, zero = barX + (-mn / span) * maxW;
      out.push(head(H2), title(34), '<line x1="' + zero + '" y1="' + (top - 8) + '" x2="' + zero + '" y2="' + (H2 - 36) + '" stroke="#dde1ea"/>');
      pts.forEach(function (p, i) {
        var y = top + i * rowH, w = Math.abs(p.value) / span * maxW, x = p.value >= 0 ? zero : zero - w;
        out.push('<text x="28" y="' + (y + 19) + '" font-size="14" fill="#141a2a">' + svgEsc(p.label) + '</text><rect x="' + barX + '" y="' + (y + 4) + '" width="' + maxW + '" height="22" rx="4" fill="#f0f3fa"/><rect x="' + x + '" y="' + (y + 4) + '" width="' + Math.max(2, w) + '" height="22" rx="4" fill="' + CH_COLORS[0] + '"/><text x="' + ((p.value >= 0 ? x + w : x) + (p.value >= 0 ? 8 : -8)) + '" y="' + (y + 20) + '" font-size="14" font-weight="600" fill="#141a2a" text-anchor="' + (p.value >= 0 ? 'start' : 'end') + '">' + svgEsc(p.raw) + '</text>');
      });
      return out.join('') + foot(H2) + '</svg>';
    }
    var H3 = 320, L = 60, R = W - 40, T = 84, B = H3 - 70, v2 = pts.map(function (p) { return p.value; }), lo = Math.min.apply(null, v2), hi = Math.max.apply(null, v2);
    if (lo === hi) { lo -= 1; hi += 1; } var pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
    var xs = function (i) { return L + (pts.length === 1 ? 0 : i / (pts.length - 1)) * (R - L); }, ys = function (v) { return B - (v - lo) / (hi - lo) * (B - T); };
    out.push(head(H3), title(34));
    for (var g = 0; g <= 3; g++) { var gv = lo + (hi - lo) * g / 3, gy = ys(gv); out.push('<line x1="' + L + '" y1="' + gy + '" x2="' + R + '" y2="' + gy + '" stroke="#eceff5"/><text x="' + (L - 8) + '" y="' + (gy + 4) + '" font-size="11" fill="#7a869b" text-anchor="end">' + svgEsc(fmtNum(Math.round(gv * 10) / 10)) + '</text>'); }
    out.push('<polyline fill="none" stroke="' + CH_COLORS[0] + '" stroke-width="3" stroke-linejoin="round" points="' + pts.map(function (p, i) { return xs(i).toFixed(1) + ',' + ys(p.value).toFixed(1); }).join(' ') + '"/>');
    pts.forEach(function (p, i) {
      out.push('<circle cx="' + xs(i).toFixed(1) + '" cy="' + ys(p.value).toFixed(1) + '" r="4.5" fill="#fff" stroke="' + CH_COLORS[0] + '" stroke-width="2.5"/><text x="' + xs(i).toFixed(1) + '" y="' + (ys(p.value) - 12).toFixed(1) + '" font-size="12" font-weight="600" fill="#141a2a" text-anchor="middle">' + svgEsc(p.raw) + '</text><text x="' + xs(i).toFixed(1) + '" y="' + (B + 22) + '" font-size="12" fill="#4f5a6e" text-anchor="middle">' + svgEsc(p.label) + '</text>');
    });
    return out.join('') + foot(H3) + '</svg>';
  }
  function chartFigure(c, wp) {
    var cap = 'Source: ' + (safeUrl(c.url) ? '<a href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer">' + esc(c.source) + '</a>' : esc(c.source)) + '. Numbers as reported by the outlet.';
    var inner = '<figure class="digest-chart">' + chartSvg(c) + '<figcaption>' + cap + '</figcaption></figure>';
    return wp ? '<!-- wp:html -->\n' + inner + '\n<!-- /wp:html -->' : inner;
  }
  function svgToPng(svg, w, h, name) {
    var fixed = String(svg).replace(/width="100%"/, 'width="' + w + '" height="' + h + '"'), img = new Image(), blob = new Blob([fixed], { type: 'image/svg+xml;charset=utf-8' }), url = URL.createObjectURL(blob);
    img.onload = function () {
      var cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h * 2; var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url); downloadCanvas(cv, name);
    };
    img.onerror = function () { URL.revokeObjectURL(url); toast('Could not make a PNG here. Download the SVG instead.', 'error'); };
    img.src = url;
  }
  function paintCharts(msg) {
    var go = document.getElementById('dgs-ch-run'); if (go) { go.disabled = chBusy; go.textContent = chBusy ? 'Looking…' : (dCharts().length ? 'Look for more charts' : 'Look for charts'); }
    var pr = document.getElementById('dgs-ch-prog'); if (pr) { pr.hidden = !chBusy; var l = pr.querySelector('.dgs-clu-prog-label'); if (l && msg) l.textContent = msg; }
  }
  function renderCharts() {
    var box = document.getElementById('dgs-ch-box'); if (!box) return; box.innerHTML = ''; paintCharts();
    var cs = dCharts(), secs = includedSections();
    if (!cs.length) { box.appendChild(el('p', { class: 'dgs-hint', text: 'Press "Look for charts". The AI looks for numbers the sources state clearly (a few comparable values, a time series, or one headline figure). Each chart needs a word-for-word quote from the article that contains its numbers, or it is thrown away. On many days there is nothing worth charting.' })); return; }
    cs.forEach(function (c) {
      var card = el('div', { class: 'dgs-ch-card' + (c.include ? '' : ' is-off') });
      var top = el('div', { class: 'dgs-clu-head' });
      var cb = el('input', { type: 'checkbox', 'aria-label': 'Include this chart' }); cb.checked = c.include;
      cb.addEventListener('change', function () { c.include = cb.checked; digestSave(); renderExport(); });
      top.appendChild(cb);
      var sec = secs.filter(function (x) { return x.c.id === c.cid; })[0];
      top.appendChild(el('strong', { text: c.title })); top.appendChild(el('span', { class: 'dgs-chip is-muted', text: (c.type === 'stat' ? 'Key figure' : c.type === 'line' ? 'Line' : 'Bar') + (sec ? ' · ' + dShort(sec.s.heading, 26) : '') }));
      card.appendChild(top);
      var pv = el('div', { class: 'dgs-ch-prev' }); pv.innerHTML = chartSvg(c); card.appendChild(pv);
      card.appendChild(el('p', { class: 'dgs-out-src', text: 'Quote from ' + c.source + ': "' + c.quote + '"' }));
      var bar = el('div', { class: 'dgs-actions' });
      var b1 = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Download PNG' }); b1.addEventListener('click', function () { var s = chartSvg(c), m = /viewBox="0 0 (\d+) (\d+)"/.exec(s); svgToPng(s, +m[1], +m[2], slugify(c.title, 40) + '.png'); });
      var b2 = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Download SVG' }); b2.addEventListener('click', function () { downloadText(chartSvg(c), slugify(c.title, 40) + '.svg', 'image/svg+xml'); });
      var b3 = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Remove' }); b3.addEventListener('click', function () { dReview().charts = dCharts().filter(function (z) { return z !== c; }); digestSave(); renderExport(); });
      bar.appendChild(b1); bar.appendChild(b2); bar.appendChild(b3); card.appendChild(bar);
      box.appendChild(card);
    });
  }
  function chartBind() {
    var g = function (id, fn) { var n = document.getElementById(id); if (n) n.addEventListener('click', fn); };
    g('dgs-ch-run', findCharts);
    g('dgs-ex-dl-sq', function () { var c = document.getElementById('dgs-ex-canvas2'); if (c) downloadCanvas(c, slugify(state.digest.outline.headline, 50) + '-square.png'); });
  }


  // ---------- Social posts ----------
  var socBusy = false, socN = 0;
  var SOC_GROUP = { chart: 'charts', x: 'x', linkedin: 'linkedin', instagram: 'instagram', facebook: 'fbtg', telegram: 'fbtg' };
  var SOC_USE = {
    charts: 'Each chart is a ready image. Post the image with the text beside it: the X version on X, the LinkedIn version on LinkedIn. Image posts get more attention than plain text.',
    x: 'Post the thread once, on publishing day. Then use one single post per day over the next days. Put the link in a reply, because links inside a post get less reach.',
    linkedin: 'Publish the post, then add the first comment with the link straight away. Attach the carousel PDF from the Instagram card as a document for the best reach.',
    instagram: 'Upload the slide PNGs in order as a swipe post and paste the caption. The same slides work on Facebook (multi-photo post) and LinkedIn (PDF).',
    fbtg: 'Facebook: paste the post and add the carousel PNGs or one chart image. Telegram: paste the channel post as it is.'
  };
  var SOC_LABEL = { charts: 'the chart posts', x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', fbtg: 'Facebook and Telegram' };
  var SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  function dSocial() { var d = state.digest; if (!d.social) d.social = { link: '', posts: [], at: 0, failed: {} }; if (!Array.isArray(d.social.posts)) d.social.posts = []; if (!d.social.failed) d.social.failed = {}; return d.social; }
  function socTx(v) { if (v == null) return ''; if (typeof v === 'string') return v.trim(); if (Array.isArray(v)) return v.map(socTx).filter(Boolean).join('\n'); return socTx(v.text || v.post || v.caption || v.content || v.body || ''); }
  function socCharts() { return includedCharts().slice(0, 4); }
  function socFocusSection() { var f = dSocial().focus; if (!f) return null; return includedSections().filter(function (x) { return x.c.id === f; })[0] || null; }
  function socArticle() {
    var x = socFocusSection(), dr = wrDraft();
    if (x) { var r = dr.sections[x.c.id]; if (r) return '## ' + x.s.heading + '\n\n' + r.paras.join('\n\n') + (r.reading ? '\n\n> Our read: ' + r.reading : ''); }
    return dShort(draftMarkdown(), 14000);
  }
  function socHead(task, shape) {
    var p = state.profile || {}, seo = dReview().seo || {}, tags = (seo.tags || []).concat(seo.focus ? [seo.focus] : []).slice(0, 6).join(', '), x = socFocusSection();
    return ['You write social media posts that bring readers to a daily news analysis article published by "' + pubName() + '". The posts must earn attention on their own; the article is the next step, not the point of the post.', '',
      'VOICE OF THE PUBLICATION:', dnaText(p), '', 'THE ARTICLE (the only source of facts). Plain paragraphs are reported facts. A paragraph that starts "Our read:" is the publication\'s own analysis, not reported fact:', socArticle(), '', 'TAGS AND KEYWORDS (the only source for hashtags): ' + tags, '',
      x ? 'FOCUS: write only about the section "' + x.s.heading + '". Ignore everything else.' : 'FOCUS: pick the one strongest angle for this platform, the sharpest tension or most surprising fact in the article, and build the post around it. Do not try to cover every section unless the task below says so.', '',
      'RULES FOR EVERY POST:',
      '- Use only facts, names, quotes and numbers that appear in the article. A quote must be word for word and attributed to the person the article names. Never add a person, organisation, date or figure that is not there.',
      '- Keep each number attached to exactly the subject the article attaches it to. Never combine figures from different sentences into one claim.',
      '- Keep accusations and outcomes at the strength the article gives them. If someone only claims or alleges something, say who claims it. Do not upgrade "lost his majority" to "lost", "said" to "admitted", or "criticised" to "toppled". Do not use words like fraud, purge, manipulation or steal in the publication\'s own voice.',
      '- The publication\'s analysis may be used, but must read as analysis ("Our read:", "We think", "likely"), never as a reported fact.',
      '- The first line must work alone: a concrete fact or number, a contrast, or a sharp question the article answers. Never open with the publication name, "Breaking", "Thread", "Today", "New", "Here is", "Did you know" or "Why X matters".',
      '- Give one idea fully, so the post is worth reading even if nobody clicks. Do not summarise the whole article. Do not tease without telling.',
      '- Plain, human, specific. No hype words, no emoji (one at most), no dashes used as pauses, no "Not X, but Y", no lists of exactly three adjectives.',
      '- Hashtags: where the task asks for them, write each as one CamelCase token (#USMidterms), specific to a subject in the article and taken from TAGS AND KEYWORDS or the article\'s own subjects. Never generic tags such as #news, #breaking, #trending, #powerplay or #globalstrategy.',
      '- Where the link to the article belongs, write exactly {link}. Never invent a URL.', '', 'PLATFORM AND TASK:'].concat(task, ['', 'Return STRICT JSON only: ' + shape]).join('\n');
  }
  function socGroupPrompt(g) {
    var fx = socFocusSection(), secs = (fx ? [fx] : includedSections()).map(function (x) { return '"' + x.s.heading + '"'; }).join(', ');
    if (g === 'x') return socHead([
      'PLATFORM: X.',
      '- "thread": 4 to 6 posts telling ONE story: the single strongest thread of the article, in a clear order (what happened, the detail that surprises, why it matters, what to watch). It may draw on the related sections but must not be a tour of every section. Post 1 is the hook and must work alone (at most 200 characters, no hashtags, no link). Each next post adds one new fact or turn, at most 270 characters. The last post ends with {link} and then 1 or 2 hashtags. No numbering, no "1/".',
      '- "singles": one standalone post for each of these sections: ' + secs + '. At most 240 characters each, no link, ending with 1 or 2 hashtags, each with a different hook type (a number, a contrast, a question, a word-for-word quote). Return {"heading","text"} in the same order.'
    ], '{"thread":["..."],"singles":[{"heading":"...","text":"..."}]}');
    if (g === 'linkedin') return socHead([
      'PLATFORM: LinkedIn. Readers are professionals who want the implication, not the news.',
      '- "post": 900 to 1300 characters about ONE angle. The first two lines (about 200 characters in all) are all that shows before "see more", so they must hook: a specific fact plus the tension in it. Short paragraphs separated by a blank line. Say what it means for business, markets, policy or risk, and why it matters now, marking your own reasoning as "Our read" or "We think". End with one real question for the reader. No link in the post. At most 3 hashtags on the last line.',
      '- "comment": the first comment, one short line that ends with {link}. Describe the article by what it covers, not by a topic the article does not discuss.'
    ], '{"post":"...","comment":"..."}');
    if (g === 'fbtg') return socHead([
      'PLATFORMS: Facebook and Telegram.',
      '- "facebook": 600 to 900 characters, in 2 or 3 short paragraphs separated by a blank line. The first line is a hook that stands alone. Tell the story in plain, warm language: what happened, the detail that surprises, why it matters to an ordinary reader. Mark your own view as "We think". End with one real question that invites a reply, then {link}, then 2 or 3 hashtags.',
      '- "telegram": 400 to 700 characters for a channel. A short first line that works as a headline, then 2 short paragraphs, then {link}, then a last line of 2 or 3 hashtags.'
    ], '{"facebook":"...","telegram":"..."}');
    if (g === 'instagram') return socHead([
      'PLATFORM: Instagram carousel (swipe images with text) plus caption. The carousel may span the related sections.',
      '- "slides": 6 to 8 strings, each written "HEADLINE | supporting line". The HEADLINE is big type on the image: at most 8 words for slide 1 (the hook, a surprising fact or a sharp question), at most 7 words for the others. When a slide is about a figure, make the figure the headline (for example "$4.2 trillion" or "73%") and say in the supporting line what it measures, at most 16 words. Middle slides give one fact or turn each, in a logical order, so a reader wants to swipe. You may include one slide whose HEADLINE is a word-for-word quote from the article in quotation marks, with the speaker in the supporting line. The last slide is exactly "Read the full analysis | Link in bio".',
      '- "caption": at most 400 characters. The first line hooks. Finish with "Link in bio." and 5 hashtags. No clickable link in the caption.'
    ], '{"slides":["HEADLINE | supporting line"],"caption":"..."}');
    var cs = socCharts();
    return socHead(['PLATFORMS: X and LinkedIn, posts that go with a chart image. The image is shown with the post, so the text says what to look at and the one thing it shows.',
      'CHARTS:'].concat(cs.map(function (c, i) { return 'CHART ' + (i + 1) + ': ' + c.title + (c.unit ? ' (' + c.unit + ')' : '') + '. Data: ' + c.points.map(function (q) { return q.label + ' ' + q.raw; }).join('; ') + '. Source: ' + c.source + '.'; }),
      ['- For each chart: "x" at most 240 characters, no link, starts with the number or contrast the chart shows, ends with 1 or 2 hashtags; "linkedin" at most 500 characters, says what the figures show (not a conclusion the article does not draw), ends with a question, then 2 or 3 hashtags, no link.',
      '- Use only the figures in the chart and the article.']), '{"charts":[{"n":1,"x":"...","linkedin":"..."}]}');
  }
  function socParse(g, j) {
    var out = [], bad = function (m) { throw new Error(m); };
    function add(net, label, text, extra) { text = plainDashes(String(text || '').trim()); if (text) out.push(Object.assign({ net: net, label: label, text: text, kind: 'text' }, extra || {})); }
    if (g === 'x') {
      var th = (Array.isArray(j.thread) ? j.thread : []).map(socTx).filter(Boolean), sg = (Array.isArray(j.singles) ? j.singles : Array.isArray(j.sections) ? j.sections : []);
      if (!th.length) bad('no X thread in the answer');
      th.slice(0, 8).forEach(function (t, i) { add('x', 'Thread, post ' + (i + 1), t); });
      sg.slice(0, 8).forEach(function (t) { add('x', 'Single post: ' + dShort(t && t.heading || '', 40), socTx(t), { reply: true }); });
    } else if (g === 'linkedin') {
      var lp = socTx(j.post || j.linkedin); if (!lp) bad('no LinkedIn post in the answer');
      add('linkedin', 'Post', lp); add('linkedin', 'First comment (post it right after)', socTx(j.comment || j.first_comment) || 'The full analysis, with sources: {link}');
    } else if (g === 'fbtg') {
      var fb = socTx(j.facebook), tg = socTx(j.telegram); if (!fb || !tg) bad('the answer was missing ' + (!fb ? 'Facebook' : 'Telegram'));
      add('facebook', 'Facebook post', fb); add('telegram', 'Telegram channel post', tg);
    } else if (g === 'instagram') {
      var sl = (Array.isArray(j.slides) ? j.slides : []).map(function (x) { if (x && typeof x === 'object') { var hd = socTx(x.headline || x.big || x.title || ''), tx = socTx(x.text || x.body || x.line || ''); return hd ? (tx ? hd + ' | ' + tx : hd) : ''; } return socTx(x); }).filter(Boolean), cp = socTx(j.caption); if (sl.length < 3 || !cp) bad('no carousel or caption in the answer');
      add('instagram', 'Carousel text', sl.slice(0, 9).map(function (x) { return x.replace(/^\d+[.)]\s+/, ''); }).join('\n'), { kind: 'carousel' }); add('instagram', 'Caption', cp);
    } else {
      var cs = socCharts(), arr = Array.isArray(j.charts) ? j.charts : []; if (!arr.length) bad('no chart posts in the answer');
      arr.forEach(function (it) { var c = cs[(+it.n || 0) - 1]; if (!c) return; var k = chartKey(c); add('chart', c.title + ' · X', socTx(it.x), { chart: k, reply: true }); add('chart', c.title + ' · LinkedIn', socTx(it.linkedin), { chart: k }); });
      if (!out.length) bad('the chart posts did not match any chart');
    }
    if (!out.length) bad('the answer had no usable posts');
    return out;
  }
  function socGroupOf(p) { return p.net === 'chart' ? 'charts' : SOC_GROUP[p.net]; }
  function socAudit(list) {
    list = list.filter(function (p) { return p.text; }); if (!list.length) return Promise.resolve(0);
    var prompt = ['You are a strict fact-checker. Below is an ARTICLE and numbered social media posts written from it. For each post, find claims the article does not support:', '- a figure attached to the wrong subject, or figures from different facts combined into one claim', '- a quote that is not word for word in the article, or is attributed to someone who did not say it', '- a person, organisation, place or date that is not in the article', '- an accusation, motive or outcome stated as fact when the article only reports someone\'s claim, or a verb stronger than the article\'s (lost vs lost his majority, said vs admitted, criticised vs toppled)', '- the publication\'s own opinion presented as reported fact', '- hashtags or comment lines about a topic the article does not cover', '',
      'For every post with a problem, return a corrected version: keep the hook, voice, format and length, keep {link} where it is, use only what the article supports, and give claims the attribution and strength the article gives. Posts with no problem get no entry.', '', 'ARTICLE:', dShort(draftMarkdown(), 14000), '', 'POSTS:'].concat(list.map(function (p, i) { return (i + 1) + '. [' + p.net + ' | ' + p.label + ']\n' + p.text; }), ['', 'Return STRICT JSON only: {"issues":[{"n":1,"problem":"one short sentence","fixed":"the corrected post text"}]}  (an empty list if every post is fine)']).join('\n');
    return callLLM(prompt, 'write', { best: true }).then(function (r) {
      var j = extractJson(r.text), arr = Array.isArray(j.issues) ? j.issues : [], n = 0;
      list.forEach(function (p) { p.audit = 'ok'; });
      arr.forEach(function (it) {
        var p = list[(+it.n || 0) - 1], fx = socTx(it.fixed); if (!p || !fx) return;
        p.undo = p.text; p.text = plainDashes(fx); p.audit = 'fixed'; p.note = dShort(String(it.problem || 'a claim the article does not support'), 160); n++;
      });
      return n;
    });
  }
  function runSoc(groups) {
    if (socBusy) return Promise.resolve();
    if (!dKey()) { toast('Social posts need an AI key. Add one under API keys.', 'error'); return Promise.resolve(); }
    var soc = dSocial(), i = 0, ok = 0, bad = [];
    socBusy = true; paintSocial();
    function one(g, attempt) {
      return callLLM(socGroupPrompt(g), 'write', { best: true }).then(function (r) {
        var posts = socParse(g, extractJson(r.text));
        socEnsureTags(posts); posts.forEach(function (p) { p.id = 'p' + (++socN) + Date.now().toString(36); });
        soc.posts = soc.posts.filter(function (p) { return socGroupOf(p) !== g; }).concat(posts); delete soc.failed[g]; ok++;
      }).catch(function (e) {
        if (attempt < 1 && !(e && e.fatal)) return one(g, attempt + 1);
        soc.failed[g] = dShort(e && e.message, 140); bad.push(SOC_LABEL[g]);
      });
    }
    function next() {
      if (i >= groups.length) return Promise.resolve();
      var g = groups[i++], l = document.getElementById('dgs-so-prog-label'); if (l) l.textContent = 'Writing ' + SOC_LABEL[g] + ' (' + i + ' of ' + groups.length + ')…';
      return one(g, 0).then(function () { digestSave(); renderSocial(); }).then(next);
    }
    return next().then(function () {
      var fresh = soc.posts.filter(function (p) { return groups.indexOf(socGroupOf(p)) !== -1; }); if (!fresh.length) return -1;
      var l = document.getElementById('dgs-so-prog-label'); if (l) l.textContent = 'Checking every post against the article…';
      return socAudit(fresh).catch(function (e) { LOG('social audit failed', e && e.message); return -2; });
    }).then(function (fixed) {
      socBusy = false; soc.at = Date.now(); digestSave(); renderSocial();
      if (fixed === -2) toast('The fact-check could not run. Read each post against the article before you publish.', 'error');
      else if (fixed > 0) toast('The fact-check corrected ' + fixed + ' post' + (fixed === 1 ? '' : 's') + '. Each one says what was wrong, and you can undo it.', 'success');
      if (bad.length) toast('Written: ' + ok + ' of ' + groups.length + '. Could not write ' + bad.join(', ') + '. Use "Write again" on those.', 'error');
      else if (!(fixed > 0)) toast('Posts written and checked against the article. Still read them before you publish.', 'success');
    });
  }
  function generateSocial() {
    var soc = dSocial(); if (soc.posts.length && !confirm('This replaces all the posts below, including your edits. Continue?')) return;
    runSoc(['x', 'linkedin', 'instagram', 'fbtg'].concat(socCharts().length ? ['charts'] : []));
  }
  function socFinal(post) { var l = (dSocial().link || '').trim(); return l ? post.text.replace(/\{link\}/g, l) : post.text; }
  function socLimit(post) { return post.net === 'x' || (post.net === 'chart' && /· X$/.test(post.label)) ? 280 : post.net === 'instagram' ? 2200 : post.net === 'linkedin' || post.net === 'chart' ? 3000 : post.net === 'telegram' ? 4096 : 63206; }
  function socLen(post) { var t = socFinal(post); if (socLimit(post) === 280) t = t.replace(/\{link\}/g, 'x'.repeat(23)).replace(/https?:\/\/\S+/g, 'x'.repeat(23)); return t.length; }
  function socLinkGuard(text) { if (/\{link\}/.test(text)) { toast('The link is empty, so the text still contains {link}. Paste the article link at the top first.', 'error'); return false; } return true; }
  function socNums(t) { return (String(t).replace(/\{link\}/g, ' ').replace(/^\s*\d+[.)]\s/gm, '').match(/\d[\d.,]*\d|\d/g) || []).map(function (n) { return n.replace(/[.,]+$/, ''); }); }
  function socBase() { return draftMarkdown() + ' ' + includedCharts().map(function (c) { return c.title + ' ' + c.points.map(function (p) { return p.raw + ' ' + p.value; }).join(' '); }).join(' '); }
  function socCorpus() { return socBase().toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"'); }
  function socIssues(post, base) {
    var out = [], text = String(post.text), flat = String(base).replace(/(\d)[\s ](\d{3})/g, '$1$2'), bad = [];
    socNums(text).forEach(function (n) { if (flat.indexOf(n) === -1 && flat.indexOf(n.replace(/,/g, '')) === -1 && bad.indexOf(n) === -1) bad.push(n); });
    if (bad.length) out.push(bad.slice(0, 4).join(', ') + ' is not in the article');
    var low = socCorpus(), norm = function (t) { return String(t).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9À-ɏ\s]/g, ' ').replace(/\s+/g, ' ').trim(); }, nlow = norm(low), re = /["“]([^"”]{14,})["”]/g, m, qs = [];
    while ((m = re.exec(text))) { if (nlow.indexOf(norm(m[1])) === -1) qs.push(dShort(m[1], 34)); }
    if (qs.length) out.push('quote "' + qs[0] + '" is not word for word in the article');
    var nm = checkText('. ' + text.replace(/#\w+/g, ' ').replace(/\{link\}/g, ' '), low).names.filter(function (x) { return x.length > 3; });
    if (nm.length) out.push('name ' + nm.slice(0, 3).join(', ') + ' is not in the article');
    if (/�/.test(text)) out.push('a broken character, fix the spelling of a name');
    return out;
  }
  function socHost() { var l = (dSocial().link || '').trim(); try { return new URL(l).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  function socRR(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  // ---------- Slide design: carousels, chart cards and image cards ----------
  var LOOKS = [{ id: 'neon', name: 'Neon' }, { id: 'poster', name: 'Poster' }, { id: 'paper', name: 'Paper' }];
  var SERIF = "Georgia,'Times New Roman',serif";
  function socLook() { var l = dSocial().look; return LOOKS.some(function (x) { return x.id === l; }) ? l : 'neon'; }
  function socDims() { return dSocial().format === 'square' ? { w: 1080, h: 1080 } : { w: 1080, h: 1350 }; }
  function rgbCss(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? 1 : a) + ')'; }
  function toHsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2, d = mx - mn;
    if (d) { s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    return [h, s, l];
  }
  function fromHsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; var q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  }
  function tint(c, dh, ds, dl) { var h = toHsl(c); return fromHsl(h[0] + dh, Math.max(0, Math.min(1, h[1] + ds)), Math.max(0, Math.min(1, h[2] + dl))); }
  function lumOf(c) { return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
  function paintBg(ctx, W, H, look, acc, idx, seed) {
    var r1 = ((seed >>> ((idx * 3) % 20)) % 100) / 100, r2 = ((seed >>> ((idx * 5 + 7) % 22)) % 100) / 100;
    function blob(x, y, r, c, a) { var g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgbCss(c, a)); g.addColorStop(1, rgbCss(c, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    if (look === 'poster') {
      var pal = [acc, [13, 20, 36], [246, 241, 228], tint(acc, 160, 0, -.04)], bg = pal[[0, 1, 2, 1, 3, 0, 2, 1][idx % 8]], dark = lumOf(bg) < .5;
      ctx.fillStyle = rgbCss(bg); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = dark ? 'rgba(255,255,255,.08)' : 'rgba(13,20,36,.08)'; ctx.beginPath(); ctx.arc(W * (.65 + .3 * r1), H * (.12 + .15 * r2), 380, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(W * .5, H * .9); ctx.rotate(-.18); ctx.fillStyle = dark ? 'rgba(255,255,255,.07)' : 'rgba(13,20,36,.07)'; ctx.fillRect(-W, 0, W * 2, 120); ctx.restore();
      var onAcc = bg === acc;
      return { ink: dark ? '#ffffff' : '#0d1420', dim: dark ? 'rgba(255,255,255,.78)' : 'rgba(13,20,36,.74)', hi: onAcc ? '#0d1420' : (lumOf(bg) < .3 ? rgbCss(acc) : rgbCss(tint(acc, 0, 0, -.16))), hiRgb: onAcc ? [13, 20, 36] : acc, dark: dark, serif: false, markBg: dark ? rgbCss(acc) : '#0d1420', markFg: dark ? '#0d1420' : rgbCss(acc), solid: bg };
    }
    if (look === 'paper') {
      ctx.fillStyle = '#f6f0e4'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(26,26,26,.04)'; for (var yy = 0; yy < H; yy += 8) ctx.fillRect(0, yy, W, 1);
      ctx.fillStyle = rgbCss(acc); ctx.fillRect(64, 180, 10, H - 360);
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(84, 156, W - 168, 5); ctx.fillRect(84, 168, W - 168, 2);
      var hip = tint(acc, 0, .05, -.24);
      return { ink: '#1a1a1a', dim: '#5b554b', hi: rgbCss(hip), hiRgb: hip, dark: false, serif: true, markBg: '#1a1a1a', markFg: '#f6f0e4', solid: [246, 240, 228] };
    }
    var g = ctx.createLinearGradient(0, 0, W * .6, H); g.addColorStop(0, '#060a17'); g.addColorStop(1, '#111c3d'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    blob(W * (.1 + .8 * r1), H * (.04 + .22 * r2), 600, acc, .40); blob(W * (.95 - .6 * r2), H * (.9 - .2 * r1), 660, tint(acc, 55, 0, 0), .30); blob(W * .5, H * .55, 520, tint(acc, -60, 0, -.05), .12);
    ctx.fillStyle = 'rgba(255,255,255,.07)'; for (var gx = 60; gx < W; gx += 60) for (var gy = 60; gy < H; gy += 60) ctx.fillRect(gx, gy, 3, 3);
    ctx.strokeStyle = rgbCss(acc, .2); ctx.lineWidth = 3; [180, 270, 360].forEach(function (rr) { ctx.beginPath(); ctx.arc(W * .96, H * .1, rr, 0, 7); ctx.stroke(); });
    var hn = tint(acc, 0, 0, .06);
    return { ink: '#ffffff', dim: 'rgba(226,232,247,.8)', hi: rgbCss(hn), hiRgb: hn, dark: true, serif: false, markBg: rgbCss(acc), markFg: '#0a1020', solid: [10, 16, 32] };
  }
  function wrapWords(ctx, words, maxW) { var lines = [], cur = []; words.forEach(function (w) { var t = cur.concat(w).join(' '); if (ctx.measureText(t).width > maxW && cur.length) { lines.push(cur); cur = [w]; } else cur.push(w); }); if (cur.length) lines.push(cur); return lines; }
  function fitRich(ctx, text, maxW, maxH, start, min, weight, lh, fam) {
    var words = String(text).split(/\s+/).filter(Boolean), sz = start, lines = [];
    for (; sz >= min; sz -= 4) { ctx.font = weight + ' ' + sz + 'px ' + fam; lines = wrapWords(ctx, words, maxW); if (lines.length * sz * lh <= maxH) break; }
    if (sz < min) { sz = min; ctx.font = weight + ' ' + sz + 'px ' + fam; lines = wrapWords(ctx, words, maxW); }
    return { sz: sz, lines: lines, lh: lh, weight: weight, fam: fam };
  }
  var richEnd = 0;
  function drawRich(ctx, fit, x, y, ink, hi, allHi) {
    ctx.font = fit.weight + ' ' + fit.sz + 'px ' + fit.fam; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    fit.lines.forEach(function (ws, li) { var cx = x, by = y + fit.sz * .84 + li * fit.sz * fit.lh; ws.forEach(function (w) { ctx.fillStyle = allHi || /\d|%/.test(w) ? hi : ink; ctx.fillText(w, cx, by); cx += ctx.measureText(w + ' ').width; }); });
    richEnd = y + (fit.lines.length - 1) * fit.sz * fit.lh + fit.sz; return richEnd;
  }
  function pill(ctx, x, y, text, th, size) {
    ctx.font = '700 ' + (size || 22) + 'px ' + SANS; try { ctx.letterSpacing = '2px'; } catch (e) {} var w = ctx.measureText(text).width + 40, h = (size || 22) + 22;
    ctx.fillStyle = th.dark ? rgbCss(th.hiRgb, .16) : 'rgba(0,0,0,.08)'; socRR(ctx, x, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = th.hi; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 20, y + h / 2 + 1); ctx.textBaseline = 'alphabetic'; try { ctx.letterSpacing = '0px'; } catch (e2) {} return y + h;
  }
  var chartImgs = {};
  function chartImage(c, cb) {
    var k = chartKey(c), e = chartImgs[k]; if (e) { if (!e.ok && cb) e.cbs.push(cb); return e; }
    var svg = chartSvg(c), m = /viewBox="0 0 (\d+) (\d+)"/.exec(svg); e = chartImgs[k] = { ok: false, cbs: cb ? [cb] : [], sw: m ? +m[1] : 520, sh: m ? +m[2] : 300 };
    var img = new Image(), url = URL.createObjectURL(new Blob([svg.replace(/width="100%"/, 'width="' + e.sw * 2 + '" height="' + e.sh * 2 + '"')], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = function () { e.img = img; e.ok = true; URL.revokeObjectURL(url); e.cbs.splice(0).forEach(function (f) { f(); }); }; img.onerror = function () { URL.revokeObjectURL(url); e.cbs.splice(0).forEach(function (f) { f(); }); }; img.src = url; return e;
  }
  function slideSpecs(post) {
    var lines = String(post.text).split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 10), out = [];
    lines.forEach(function (ln, i) {
      ln = ln.replace(/^\d+[.)]\s+/, ''); var parts = ln.split(/\s*\|\s*/), big = dShort(parts[0] || '', 90), txt = dShort(parts.slice(1).join(' '), 170);
      if (!txt && big.length > 60) { txt = big; big = ''; }
      var cta = i === lines.length - 1 && i > 0 && /bio|full analysis|read the|link/i.test(ln);
      out.push({ type: i === 0 ? 'hook' : cta ? 'cta' : /^["“]/.test(big) ? 'quote' : (/\d/.test(big) && big.length <= 20) ? 'stat' : 'point', big: big, text: txt });
    });
    var cs = dSocial().chartSlide === false ? [] : socCharts();
    if (cs.length && out.length >= 4) { out.splice(Math.min(3, out.length - 1), 0, { type: 'chart', chart: cs[0], big: cs[0].title, text: '' }); if (cs[1] && out.length >= 7) out.splice(6, 0, { type: 'chart', chart: cs[1], big: cs[1].title, text: '' }); }
    var last = out[out.length - 1]; if (last && last.type === 'cta' && socHost()) last.text = socHost();
    return out;
  }
  function drawSpec(cv, spec, idx, total, opts) {
    opts = opts || {}; var W = cv.width, H = cv.height, ctx = cv.getContext('2d'), look = opts.look || socLook(), acc = imgColor().rgb, th = paintBg(ctx, W, H, look, acc, idx, imgSeed()), M = 84, top = 200, bottom = H - 200, cw = W - 2 * M, fam = th.serif ? SERIF : SANS, last = idx === total - 1;
    // header and footer
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = th.markBg; ctx.beginPath(); ctx.arc(M + 24, 96, 24, 0, 7); ctx.fill(); ctx.fillStyle = th.markFg; ctx.font = '800 28px ' + SANS; ctx.textAlign = 'center'; ctx.fillText(String(pubName()).charAt(0).toUpperCase(), M + 24, 106);
    ctx.textAlign = 'left'; ctx.fillStyle = th.ink; ctx.font = '700 24px ' + SANS; try { ctx.letterSpacing = '2px'; } catch (e) {} ctx.fillText(pubName().toUpperCase(), M + 62, 105); try { ctx.letterSpacing = '0px'; } catch (e1) {}
    if (!opts.solo) {
      ctx.textAlign = 'right'; ctx.fillStyle = th.dim; ctx.font = '600 24px ' + SANS; ctx.fillText((idx + 1) + ' / ' + total, W - M, 105); ctx.textAlign = 'left';
      var gap = 8, sw = (cw - gap * (total - 1)) / total; for (var k = 0; k < total; k++) { ctx.fillStyle = k === idx ? th.hi : (k < idx ? (th.dark ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.45)') : (th.dark ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.14)')); socRR(ctx, M + k * (sw + gap), H - 96, sw, 8, 4); ctx.fill(); }
      if (!last) { ctx.textAlign = 'right'; ctx.fillStyle = th.hi; ctx.font = '800 26px ' + SANS; try { ctx.letterSpacing = '3px'; } catch (e2) {} ctx.fillText('SWIPE  →', W - M, H - 130); try { ctx.letterSpacing = '0px'; } catch (e3) {} ctx.textAlign = 'left'; }
    } else { ctx.fillStyle = th.dim; ctx.font = '600 26px ' + SANS; ctx.fillText(socHost() || dateHuman(state.digest.created), M, H - 80); }
    var big = spec.big, txt = spec.text; if (!big && txt) { big = txt; txt = ''; }
    var type = spec.type, y = 0;
    function content(ctx) {
      richEnd = 0; y = 0;
    if (type === 'hook') {
      y = pill(ctx, M, top, 'DAILY DIGEST  ·  ' + dateHuman(state.digest.created).toUpperCase(), th, 22) + 70;
      var f1 = fitRich(ctx, big, cw, bottom - y - (txt ? 230 : 120), 140, 64, '800', 1.05, fam); y = drawRich(ctx, f1, M, y, th.ink, th.hi) + 36;
      ctx.fillStyle = th.hi; socRR(ctx, M, y, 150, 12, 6); ctx.fill(); y += 56;
      if (txt) { var f2 = fitRich(ctx, txt, cw, 200, 46, 30, '500', 1.3, fam); drawRich(ctx, f2, M, y, th.dim, th.ink, false); }
    } else if (type === 'stat') {
      y = pill(ctx, M, top, spec.label || 'THE NUMBER', th, 22) + 50;
      var f3 = fitRich(ctx, big, cw, 340, 340, 110, '800', 1.0, fam); y = drawRich(ctx, f3, M, y, th.hi, th.hi, true) + 30;
      ctx.fillStyle = th.ink; socRR(ctx, M, y, 150, 10, 5); ctx.fill(); y += 50;
      if (txt) { var f4 = fitRich(ctx, txt, cw, bottom - y, 58, 34, '600', 1.25, fam); drawRich(ctx, f4, M, y, th.ink, th.hi, false); }
    } else if (type === 'quote') {
      ctx.fillStyle = th.hi; ctx.font = '800 340px Georgia,serif'; ctx.fillText('“', M - 6, top + 250);
      var qt = big.replace(/^["“]+|["”]+$/g, ''); y = top + 290; var f5 = fitRich(ctx, qt, cw, bottom - y - 150, 76, 44, th.serif ? '700' : '800', 1.18, fam); y = drawRich(ctx, f5, M, y, th.ink, th.hi, false) + 30;
      if (txt) { ctx.fillStyle = th.hi; socRR(ctx, M, y, 90, 8, 4); ctx.fill(); var f6 = fitRich(ctx, txt, cw, 140, 38, 28, '600', 1.25, SANS); drawRich(ctx, f6, M, y + 30, th.dim, th.ink, false); }
    } else if (type === 'cta') {
      y = pill(ctx, M, top + 20, 'NEXT STEP', th, 22) + 60;
      var f7 = fitRich(ctx, big || 'Read the full analysis', cw, 430, 120, 64, '800', 1.05, fam); y = drawRich(ctx, f7, M, y, th.ink, th.hi) + 40;
      var label = txt || 'Link in bio'; ctx.font = '800 40px ' + SANS; var lw = ctx.measureText(label).width + 80; ctx.fillStyle = th.dark ? rgbCss(acc) : th.ink; socRR(ctx, M, y, lw, 92, 46); ctx.fill();
      ctx.fillStyle = th.dark ? '#0a1020' : '#ffffff'; ctx.textBaseline = 'middle'; ctx.fillText(label, M + 40, y + 47); ctx.textBaseline = 'alphabetic'; y += 150;
      ctx.fillStyle = th.dim; ctx.font = '600 34px ' + SANS; ctx.fillText('Follow ' + pubName() + ' for the daily read', M, y);
    } else if (type === 'chart') {
      var f8 = fitRich(ctx, big, cw, 200, 66, 40, '800', 1.1, fam); y = drawRich(ctx, f8, M, top - 10, th.ink, th.hi, false) + 30;
      var e = spec.chart ? chartImage(spec.chart, opts.onload) : null;
      if (e && e.ok) { var s = Math.min(cw / e.sw, (bottom - y) / e.sh), pw = e.sw * s, ph = e.sh * s, px = M + (cw - pw) / 2; ctx.save(); socRR(ctx, px, y, pw, ph, 22); ctx.clip(); ctx.fillStyle = '#ffffff'; ctx.fillRect(px, y, pw, ph); ctx.drawImage(e.img, px, y, pw, ph); ctx.restore(); y += ph; }
    } else {
      ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = th.hi; ctx.font = '800 230px ' + SANS; ctx.globalAlpha = .55; ctx.strokeText(('0' + (idx + 1)).slice(-2), M - 4, top + 200); ctx.restore();
      y = top + 250; var f9 = fitRich(ctx, big, cw, 480, 92, 52, '800', 1.1, fam); y = drawRich(ctx, f9, M, y, th.ink, th.hi) + 30;
      if (txt) { var f10 = fitRich(ctx, txt, cw, bottom - y, 46, 30, '500', 1.32, fam); drawRich(ctx, f10, M, y, th.dim, th.ink, false); }
    }
      return Math.max(richEnd, y);
    }
    var dy = 0;
    { var sc = document.createElement('canvas'); sc.width = W; sc.height = H; var ey = content(sc.getContext('2d')); dy = Math.max(0, Math.min(260, (bottom - ey) * .5 - 20)); }
    ctx.save(); ctx.translate(0, dy); content(ctx); ctx.restore();
  }
  function socCanvasAll(post) {
    var specs = slideSpecs(post), d = socDims(), waits = specs.filter(function (s) { return s.chart; }).map(function (s) { return new Promise(function (res) { var e = chartImage(s.chart, res); if (e.ok) res(); }); });
    return Promise.all(waits).then(function () { return specs.map(function (sp, i) { var cv = document.createElement('canvas'); cv.width = d.w; cv.height = d.h; drawSpec(cv, sp, i, specs.length); return cv; }); });
  }
  function canvasJpeg(cv) { return new Promise(function (res, rej) { cv.toBlob(function (b) { if (!b) { rej(new Error('image')); return; } b.arrayBuffer().then(function (ab) { res(new Uint8Array(ab)); }); }, 'image/jpeg', 0.92); }); }
  function pdfFromJpegs(pages, w, h) {
    var enc = new TextEncoder(), parts = [], offs = [], len = 0, pw = Math.round(w * .75 * 100) / 100, ph = Math.round(h * .75 * 100) / 100, n = pages.length;
    function push(x) { var b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; }
    function obj(i, body) { offs[i] = len; push(i + ' 0 obj\n' + body + '\nendobj\n'); }
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'); var kids = []; for (var i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>'); obj(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>');
    pages.forEach(function (jb, i) {
      var pn = 3 + i * 3, cn = pn + 1, im = pn + 2, content = 'q ' + pw + ' 0 0 ' + ph + ' 0 0 cm /Im0 Do Q';
      obj(pn, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] /Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + cn + ' 0 R >>');
      obj(cn, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
      offs[im] = len; push(im + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jb.length + ' >>\nstream\n'); push(jb); push('\nendstream\nendobj\n');
    });
    var total = 3 + n * 3, xr = len; push('xref\n0 ' + total + '\n0000000000 65535 f \n'); for (var k = 1; k < total; k++) push(('0000000000' + offs[k]).slice(-10) + ' 00000 n \n');
    push('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xr + '\n%%EOF'); return new Blob(parts, { type: 'application/pdf' });
  }
  function downloadBlob(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  function carouselPng(post) { socCanvasAll(post).then(function (cvs) { cvs.forEach(function (cv, i) { setTimeout(function () { downloadCanvas(cv, slugify(state.digest.outline.headline, 40) + '-slide-' + (i + 1) + '.png'); }, i * 450); }); toast(cvs.length + ' slides downloading. Add them to an Instagram or Facebook post in this order.', 'success'); }); }
  function carouselPdf(post) {
    socCanvasAll(post).then(function (cvs) { return Promise.all(cvs.map(canvasJpeg)).then(function (js) { downloadBlob(pdfFromJpegs(js, cvs[0].width, cvs[0].height), slugify(state.digest.outline.headline, 40) + '-carousel.pdf'); toast('PDF ready. On LinkedIn, choose Add a document and upload it.', 'success'); }); })
      .catch(function (e) { toast('Could not make the PDF (' + dShort(e && e.message, 80) + ').', 'error'); });
  }
  function drawChartCard(cv, c) {
    cv.width = 1080; cv.height = 1080; var spec = { type: 'chart', chart: c, big: c.title, text: '' }, redraw = function () { drawSpec(cv, spec, 0, 1, { solo: true, onload: redraw }); }; redraw();
  }
  function socCarouselEl(post, base) {
    var soc = dSocial(), wrap = el('div', { class: 'dgs-so-car' }), note = el('p', { class: 'dgs-hint', text: 'One slide per line, written HEADLINE | supporting line. Slide 1 is the hook, the last is the call to action.' });
    var ctl = el('div', { class: 'dgs-so-ctl' }), strip = el('div', { class: 'dgs-so-strip' });
    function paint() {
      strip.innerHTML = ''; var specs = slideSpecs(post), d = socDims();
      specs.forEach(function (sp, i) { var cv = document.createElement('canvas'); cv.width = d.w; cv.height = d.h; cv.title = 'Slide ' + (i + 1); var go = function () { drawSpec(cv, sp, i, specs.length, { onload: go }); }; go(); strip.appendChild(cv); });
    }
    var lk = el('div', { class: 'dgs-seg', role: 'group', 'aria-label': 'Look' });
    LOOKS.forEach(function (l) { var b = el('button', { type: 'button', class: 'dgs-seg-btn' + (socLook() === l.id ? ' is-on' : ''), text: l.name }); b.addEventListener('click', function () { soc.look = l.id; digestSave(); $$('.dgs-so-car .dgs-seg-btn').forEach(function (x) { x.classList.toggle('is-on', x.textContent === l.name); }); paint(); }); lk.appendChild(b); });
    var cs = el('select', { class: 'dgs-out-input dgs-so-sel', 'aria-label': 'Colour' }); IMG_COLORS.forEach(function (c) { var o = el('option', { value: c.id, text: c.name }); if (imgColor().id === c.id) o.selected = true; cs.appendChild(o); });
    cs.addEventListener('change', function () { dReview().imgColor = cs.value; digestSave(); paint(); });
    var fm = el('select', { class: 'dgs-out-input dgs-so-sel', 'aria-label': 'Format' }); [['portrait', 'Portrait 4:5 (best on Instagram and LinkedIn)'], ['square', 'Square 1:1']].forEach(function (f) { var o = el('option', { value: f[0], text: f[1] }); if ((soc.format || 'portrait') === f[0]) o.selected = true; fm.appendChild(o); });
    fm.addEventListener('change', function () { soc.format = fm.value; digestSave(); paint(); });
    ctl.appendChild(lk); ctl.appendChild(cs); ctl.appendChild(fm);
    if (socCharts().length) { var lb = el('label', { class: 'dgs-out-check' }), cb = el('input', { type: 'checkbox' }); cb.checked = soc.chartSlide !== false; cb.addEventListener('change', function () { soc.chartSlide = cb.checked; digestSave(); paint(); }); lb.appendChild(cb); lb.appendChild(el('span', { text: 'Add my chart as a slide' })); ctl.appendChild(lb); }
    var ta = el('textarea', { class: 'dgs-out-input', rows: String(Math.max(5, post.text.split('\n').length + 1)), 'aria-label': 'Slide text' }); ta.value = post.text;
    var warn = el('span', { class: 'dgs-so-warn' }), t0 = 0;
    function chk() { var bad = socIssues(post, base); warn.textContent = bad.length ? 'Check: ' + bad.slice(0, 3).join(' · ') : ''; warn.hidden = !bad.length; }
    ta.addEventListener('input', function () { post.text = ta.value; digestSave(); chk(); clearTimeout(t0); t0 = setTimeout(paint, 450); });
    var bar = el('div', { class: 'dgs-actions' });
    var b1 = el('button', { type: 'button', class: 'dgs-btn dgs-btn-primary dgs-btn-sm', text: 'Download slides (PNG)' }); b1.addEventListener('click', function () { carouselPng(post); });
    var b2 = el('button', { type: 'button', class: 'dgs-btn dgs-btn-primary dgs-btn-sm', text: 'Download PDF for LinkedIn' }); b2.addEventListener('click', function () { carouselPdf(post); });
    bar.appendChild(b1); bar.appendChild(b2);
    wrap.appendChild(el('p', { class: 'dgs-hint', text: 'Use the same carousel on Instagram (upload the PNGs as a swipe post), Facebook (add the PNGs as a multi-photo post) and LinkedIn (upload the PDF as a document).' }));
    wrap.appendChild(ctl); wrap.appendChild(strip); wrap.appendChild(note); wrap.appendChild(ta); wrap.appendChild(warn); wrap.appendChild(bar); paint(); chk(); return wrap;
  }
  function paintSocial() {
    var go = document.getElementById('dgs-so-run'), pr = document.getElementById('dgs-so-prog'), soc = dSocial();
    if (go) { go.disabled = socBusy; go.textContent = soc.posts.length ? 'Write all again' : 'Write the posts'; }
    var ck = document.getElementById('dgs-so-check'); if (ck) ck.disabled = socBusy || !soc.posts.length;
    if (pr) pr.hidden = !socBusy;
    $$('.dgs-so-again').forEach(function (b) { b.disabled = socBusy; });
  }
  var socOpen = {};
  function socDet(key, cls, defOpen) { var d = document.createElement('details'); d.className = cls; d.dataset.key = key; d.open = socOpen[key] != null ? socOpen[key] : !!defOpen; d.addEventListener('toggle', function () { socOpen[key] = d.open; }); return d; }
  function socPreview(post) { return dShort(socFinal(post).replace(/\{link\}/g, '').replace(/\s+/g, ' ').trim(), 100); }
  function socPostEl(post, base) {
    var soc = dSocial(), det = socDet('p:' + post.id, 'dgs-so-post', false), sum = document.createElement('summary'); sum.className = 'dgs-so-sum';
    var pv = el('span', { class: 'dgs-so-pv', text: '' }), cnt = el('span', { class: 'dgs-so-cnt dgs-hint' }), dot = el('span', { class: 'dgs-chip is-warn dgs-so-flag', text: 'check' });
    sum.appendChild(el('span', { class: 'dgs-so-lab', text: post.label })); sum.appendChild(pv); sum.appendChild(cnt); sum.appendChild(dot); det.appendChild(sum);
    var wrap = el('div', { class: 'dgs-so-body' }); det.appendChild(wrap);
    var note = el('p', { class: 'dgs-hint dgs-so-audit' }); note.textContent = post.audit === 'fixed' ? 'Fact-check fixed: ' + (post.note || 'a claim the article does not support') + '.' : post.audit === 'ok' ? '✓ Checked against the article.' : ''; if (note.textContent) wrap.appendChild(note);
    var ta = el('textarea', { class: 'dgs-out-input', rows: String(Math.max(3, Math.min(14, Math.ceil(post.text.length / 80) + post.text.split('\n').length))), 'aria-label': post.label }); ta.value = post.text; wrap.appendChild(ta);
    var meta = el('div', { class: 'dgs-so-meta' }), cnt2 = el('span', { class: 'dgs-hint' }), warn = el('span', { class: 'dgs-so-warn' });
    function upd() {
      var n = socLen(post), lim = socLimit(post); cnt.textContent = n + '/' + lim; cnt2.textContent = n + ' / ' + lim; cnt2.classList.toggle('is-over', n > lim); cnt.classList.toggle('is-over', n > lim);
      var bad = socIssues(post, base); warn.textContent = bad.length ? 'Check: ' + bad.slice(0, 3).join(' · ') : ''; warn.hidden = !bad.length; dot.hidden = !bad.length; pv.textContent = socPreview(post);
    }
    ta.addEventListener('input', function () { post.text = ta.value; upd(); digestSave(); });
    meta.appendChild(cnt2); meta.appendChild(warn); if (post.net === 'linkedin' && post.label === 'Post') meta.appendChild(el('span', { class: 'dgs-hint', text: 'Only the first 200 characters show before "see more".' }));
    var bar = el('div', { class: 'dgs-actions' });
    var bc = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Copy' }); bc.addEventListener('click', function () { var t = socFinal(post); copyText(t); if (socLinkGuard(t)) toast('Copied.', 'success'); }); bar.appendChild(bc);
    if (post.audit === 'fixed' && post.undo != null) {
      var bu = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Undo the fact-check fix' });
      bu.addEventListener('click', function () { post.text = post.undo; delete post.undo; post.audit = 'undone'; digestSave(); ta.value = post.text; upd(); note.textContent = 'Original restored. Check it yourself.'; if (!note.parentNode) wrap.insertBefore(note, wrap.firstChild); bu.remove(); }); bar.appendChild(bu);
    }
    if (post.reply) { var br = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Copy link reply' }); br.addEventListener('click', function () { copyText('The full analysis, with sources: ' + ((soc.link || '').trim() || '{link}')); toast('Post it as a reply to your post. Links in the post itself get less reach.', 'success'); }); bar.appendChild(br); }
    if (post.net === 'x' || post.net === 'telegram' || (post.net === 'chart' && /· X$/.test(post.label))) {
      var tg = post.net === 'telegram', bo = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: tg ? 'Open in Telegram' : 'Open in X' });
      bo.addEventListener('click', function () { var t = socFinal(post), l = (soc.link || '').trim(); window.open(tg ? 'https://t.me/share/url?url=' + encodeURIComponent(l || 'https://') + '&text=' + encodeURIComponent(l ? t.replace(l, '').trim() : t) : 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(t), '_blank', 'noopener'); }); bar.appendChild(bo);
    }
    if (post.net === 'x' || post.net === 'facebook' || (post.net === 'linkedin' && post.label === 'Post')) {
      var bimg = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Image card' });
      bimg.addEventListener('click', function () { var first = socFinal(post).replace(/\{link\}/g, '').replace(/#\w+/g, '').trim().split(/(?<=[.!?])\s+/)[0] || ''; var cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1080; drawSpec(cv, { type: 'hook', big: dShort(first, 150), text: '' }, 0, 1, { solo: true }); downloadCanvas(cv, slugify(first, 30) + '-card.png'); }); bar.appendChild(bimg);
    }
    wrap.appendChild(meta); wrap.appendChild(bar); upd(); return det;
  }
  function socGroupEl(key, title, posts, base, defOpen) {
    var det = socDet(key, 'dgs-so-sub', defOpen), sum = document.createElement('summary'); sum.className = 'dgs-so-sum'; sum.appendChild(el('span', { class: 'dgs-so-lab', text: title })); sum.appendChild(el('span', { class: 'dgs-hint', text: posts.length + (posts.length === 1 ? ' post' : ' posts') })); det.appendChild(sum);
    var body = el('div', { class: 'dgs-so-body' }); posts.forEach(function (p) { body.appendChild(socPostEl(p, base)); }); det.appendChild(body); return det;
  }
  function socCard(key, title, group, posts, base, parts, extra) {
    var soc = dSocial(), det = socDet('c:' + key, 'dgs-out-card dgs-so-card', false), sum = document.createElement('summary'); sum.className = 'dgs-so-sum';
    var nbad = posts.filter(function (p) { return socIssues(p, base).length; }).length;
    sum.appendChild(el('span', { class: 'dgs-so-title', text: title })); sum.appendChild(el('span', { class: 'dgs-hint', text: posts.length ? posts.length + (posts.length === 1 ? ' post' : ' posts') : 'not written' }));
    if (nbad) sum.appendChild(el('span', { class: 'dgs-chip is-warn', text: nbad + ' to check' })); if (soc.failed[group]) sum.appendChild(el('span', { class: 'dgs-chip is-bad', text: 'failed' }));
    det.appendChild(sum);
    var body = el('div', { class: 'dgs-so-body' }); det.appendChild(body);
    var bar = el('div', { class: 'dgs-actions' });
    var ag = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm dgs-so-again', text: posts.length ? 'Write again' : 'Try again' }); ag.disabled = socBusy;
    ag.addEventListener('click', function () { if (posts.length && !confirm('This replaces these posts, including your edits. Continue?')) return; runSoc([group]); }); bar.appendChild(ag);
    if (posts.length) { var ca = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Copy all ' + title }); ca.addEventListener('click', function () { var t = posts.map(socFinal).join('\n\n'); copyText(t); if (socLinkGuard(t)) toast('Copied.', 'success'); }); bar.appendChild(ca); }
    body.appendChild(bar);
    if (soc.failed[group]) body.appendChild(el('p', { class: 'dgs-clu-warn', text: 'Could not write ' + SOC_LABEL[group] + ': ' + soc.failed[group] }));
    if (extra) extra(body); else if (SOC_USE[group]) body.appendChild(el('p', { class: 'dgs-hint', text: SOC_USE[group] }));
    if (parts) parts.forEach(function (pt) { if (pt.posts.length) body.appendChild(socGroupEl('g:' + key + ':' + pt.title, pt.title, pt.posts, base, false)); });
    else if (!extra) posts.forEach(function (p) { body.appendChild(socPostEl(p, base)); });
    return det;
  }
  function renderSocial() {
    if (!state.digest || !state.digest.outline) return;
    var soc = dSocial(), box = document.getElementById('dgs-so-box'), lk = document.getElementById('dgs-so-link'), base = socBase();
    if (lk && document.activeElement !== lk) lk.value = soc.link || '';
    var fs = document.getElementById('dgs-so-focus');
    if (fs) { fs.innerHTML = ''; fs.appendChild(el('option', { value: '', text: 'The strongest angle (the AI picks)' })); includedSections().forEach(function (x) { fs.appendChild(el('option', { value: x.c.id, text: x.s.heading })); }); fs.value = soc.focus || ''; if (fs.value !== (soc.focus || '')) { fs.value = ''; soc.focus = ''; } }
    var seo = dReview().seo; if (lk && !lk.value && seo && seo.slug) lk.placeholder = 'https://…/' + seo.slug + '/';
    paintSocial(); if (!box) return; var keep = document.activeElement && document.activeElement.tagName === 'TEXTAREA' && box.contains(document.activeElement); if (keep) return; box.innerHTML = '';
    var pl = document.getElementById('dgs-so-plan'); if (pl) { pl.hidden = !soc.posts.length; renderPlan(); }
    var tools = document.getElementById('dgs-so-fold'); if (tools) tools.hidden = !soc.posts.length;
    if (!soc.posts.length && !Object.keys(soc.failed).length) { box.appendChild(el('p', { class: 'dgs-hint', text: 'No posts yet. One click writes a post set for X, LinkedIn, Instagram, Facebook and Telegram, plus image posts from your charts. Each platform is written separately, the way that platform works.' })); return; }
    var nAll = soc.posts.length, nBad = soc.posts.filter(function (p) { return socIssues(p, base).length; }).length;
    box.appendChild(el('p', { class: 'dgs-hint', text: nAll + ' posts' + (nBad ? ' · ' + nBad + ' to check' : ' · no flags') + '. Open a platform to read and edit its posts.' }));
    var charts = socCharts(), cposts = soc.posts.filter(function (p) { return p.net === 'chart'; });
    if (cposts.length || soc.failed.charts) {
      box.appendChild(socCard('charts', 'Chart posts', 'charts', cposts, base, null, function (body) {
        body.appendChild(el('p', { class: 'dgs-hint', text: SOC_USE.charts })); var seen = {};
        cposts.forEach(function (p) {
          if (seen[p.chart]) return; seen[p.chart] = 1; var c = charts.filter(function (z) { return chartKey(z) === p.chart; })[0]; if (!c) return;
          var row = el('div', { class: 'dgs-so-chart' }), cv = document.createElement('canvas'); cv.className = 'dgs-so-img'; drawChartCard(cv, c); row.appendChild(cv);
          var bd = el('button', { type: 'button', class: 'dgs-btn dgs-btn-primary dgs-btn-sm', text: 'Download image' }); bd.addEventListener('click', function () { downloadCanvas(cv, slugify(c.title, 40) + '-card.png'); });
          row.appendChild(el('div', {}, [el('p', { class: 'dgs-hint', text: c.title }), bd]));
          body.appendChild(row);
          cposts.filter(function (z) { return z.chart === p.chart; }).forEach(function (z) { body.appendChild(socPostEl(z, base)); });
        });
      }));
    }
    var xs = soc.posts.filter(function (p) { return p.net === 'x'; });
    if (xs.length || soc.failed.x) box.appendChild(socCard('x', 'X', 'x', xs, base, [{ title: 'Thread', posts: xs.filter(function (p) { return !p.reply; }) }, { title: 'Single posts', posts: xs.filter(function (p) { return p.reply; }) }]));
    [['LinkedIn', 'linkedin', 'linkedin'], ['Instagram', 'instagram', 'instagram']].forEach(function (a) {
      var list = soc.posts.filter(function (p) { return p.net === a[2]; });
      if (list.length || soc.failed[a[1]]) box.appendChild(socCard(a[1], a[0], a[1], list, base, null, function (body) {
        body.appendChild(el('p', { class: 'dgs-hint', text: SOC_USE[a[1]] }));
        list.forEach(function (p) { if (p.kind === 'carousel') { var d = socDet('p:' + p.id, 'dgs-so-post', true), sm = document.createElement('summary'); sm.className = 'dgs-so-sum'; sm.appendChild(el('span', { class: 'dgs-so-lab', text: p.label })); d.appendChild(sm); var bb = el('div', { class: 'dgs-so-body' }); bb.appendChild(socCarouselEl(p, base)); d.appendChild(bb); body.appendChild(d); } else body.appendChild(socPostEl(p, base)); });
      }));
    });
    var fb = soc.posts.filter(function (p) { return p.net === 'facebook' || p.net === 'telegram'; });
    if (fb.length || soc.failed.fbtg) box.appendChild(socCard('fbtg', 'Facebook and Telegram', 'fbtg', fb, base, null, function (body) { body.appendChild(el('p', { class: 'dgs-hint', text: SOC_USE.fbtg })); fb.forEach(function (p) { body.appendChild(socPostEl(p, base)); }); }));
    var hint = document.getElementById('dgs-so-note'); if (hint) hint.hidden = !nBad;
  }
  function renderPlan() {
    var host = document.getElementById('dgs-so-planbody'); if (!host) return; host.innerHTML = '';
    var soc = dSocial(); soc.done = soc.done || {};
    var has = function (f) { return soc.posts.some(f); }, rows = [];
    if (has(function (p) { return p.net === 'linkedin'; })) rows.push(['li', 'Day 1, morning', 'LinkedIn', 'Post it, then add the link as the first comment. Attach the carousel PDF if you have it.', 'c:linkedin']);
    if (has(function (p) { return p.net === 'x' && !p.reply; })) rows.push(['xt', 'Day 1, morning', 'X thread', 'Post the thread. The link is in its last post.', 'c:x']);
    if (has(function (p) { return p.net === 'chart'; })) rows.push(['ch', 'Day 1, lunch', 'Chart post', 'Image plus the short text, on X and LinkedIn.', 'c:charts']);
    if (has(function (p) { return p.net === 'instagram'; })) rows.push(['ig', 'Day 1, evening', 'Instagram carousel', 'Upload the PNGs in order, paste the caption.', 'c:instagram']);
    if (has(function (p) { return p.net === 'facebook' || p.net === 'telegram'; })) rows.push(['fb', 'Day 1, evening', 'Facebook and Telegram', 'Paste the posts. On Facebook add the carousel PNGs.', 'c:fbtg']);
    if (has(function (p) { return p.net === 'x' && p.reply; })) rows.push(['xs', 'Day 2 to 4', 'One X single post a day', 'Different hours. Put the link in a reply.', 'c:x']);
    var done = rows.filter(function (r) { return soc.done[r[0]]; }).length;
    host.appendChild(el('p', { class: 'dgs-hint', text: rows.length ? done + ' of ' + rows.length + ' done. Tick each one when it is posted.' : 'Nothing to plan yet.' }));
    rows.forEach(function (r) {
      var row = el('div', { class: 'dgs-so-prow' }), lb = el('label', { class: 'dgs-out-check' }), cb = el('input', { type: 'checkbox' }); cb.checked = !!soc.done[r[0]];
      cb.addEventListener('change', function () { soc.done[r[0]] = cb.checked; digestSave(); renderPlan(); });
      lb.appendChild(cb); lb.appendChild(el('span', { class: 'dgs-so-pwhen', text: r[1] })); lb.appendChild(el('strong', { text: r[2] })); row.appendChild(lb); row.appendChild(el('span', { class: 'dgs-hint', text: r[3] }));
      var ob = el('button', { type: 'button', class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', text: 'Open' });
      ob.addEventListener('click', function () { socOpen[r[4]] = true; if (r[0] === 'xs') socOpen['g:x:Single posts'] = true; if (r[0] === 'xt') socOpen['g:x:Thread'] = true; renderSocial(); var t = document.querySelector('[data-key="' + r[4] + '"]'); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      row.appendChild(ob); host.appendChild(row);
    });
  }
  function socTagList(n) {
    var seo = dReview().seo || {}, src = [].concat(seo.tags || [], seo.secondary || [], seo.focus ? [seo.focus] : []), out = [];
    if (!src.length) includedSections().forEach(function (x) { src.push(tokenize(x.s.heading).slice(0, 2).join(' ')); });
    src.forEach(function (t) { var h = '#' + String(t).split(/[^A-Za-z0-9]+/).filter(Boolean).map(titleCase).join(''); if (h.length >= 4 && h.length <= 26 && out.indexOf(h) === -1) out.push(h); });
    return out.slice(0, n);
  }
  function socEnsureTags(posts) {
    var lastThread = -1; posts.forEach(function (p, i) { if (p.net === 'x' && !p.reply) lastThread = i; });
    posts.forEach(function (p, i) {
      if (/#\w/.test(p.text)) return;
      var n = p.net === 'x' ? 1 : p.net === 'instagram' ? (p.label === 'Caption' ? 5 : 0) : p.net === 'linkedin' ? (p.label === 'Post' ? 3 : 0) : p.net === 'chart' ? (/· X$/.test(p.label) ? 1 : 2) : 2;
      if (p.net === 'x' && !p.reply && i !== lastThread) n = 0; if (p.kind === 'carousel') n = 0; if (!n) return;
      var tags = socTagList(n).join(' '); if (!tags) return;
      var nt = Object.assign({}, p, { text: p.text + (p.net === 'x' && !p.reply ? ' ' : '\n\n') + tags }); if (p.net === 'x' || p.net === 'chart') nt.text = p.text + ' ' + tags;
      if (socLen(nt) <= socLimit(nt)) p.text = nt.text;
    });
    return posts;
  }
  function socialBind() {
    var g = function (id, fn) { var n = document.getElementById(id); if (n) n.addEventListener('click', fn); };
    g('dgs-so-run', generateSocial);
    g('dgs-so-expand', function () { $$('#dgs-so-box details').forEach(function (d) { d.open = true; }); });
    g('dgs-so-collapse', function () { $$('#dgs-so-box details').forEach(function (d) { d.open = false; }); });
    g('dgs-so-check', function () {
      var soc = dSocial(); if (!soc.posts.length) { toast('Write the posts first.', 'error'); return; } if (socBusy) return; if (!dKey()) { toast('The fact-check needs an AI key.', 'error'); return; }
      socBusy = true; paintSocial(); var l = document.getElementById('dgs-so-prog-label'); if (l) l.textContent = 'Checking every post against the article…';
      socAudit(soc.posts).then(function (n) { toast(n ? 'Corrected ' + n + ' post' + (n === 1 ? '' : 's') + '. Each says what was wrong.' : 'No unsupported claims found. Still read each post.', n ? 'success' : ''); }).catch(function (e) { toast('The fact-check could not run (' + dShort(e && e.message, 100) + ').', 'error'); })
        .then(function () { socBusy = false; digestSave(); renderSocial(); });
    });
    var fsel = document.getElementById('dgs-so-focus'); if (fsel) fsel.addEventListener('change', function () { dSocial().focus = fsel.value; digestSave(); });
    g('dgs-so-back', function () { setStep('export'); });
    g('dgs-so-copyall', function () {
      var soc = dSocial(); if (!soc.posts.length) { toast('Write the posts first.', 'error'); return; }
      var all = soc.posts.map(function (x) { return '## ' + (x.net === 'chart' ? 'Chart' : x.net) + ': ' + x.label + '\n\n' + socFinal(x); }).join('\n\n'); copyText(all); if (socLinkGuard(all)) toast('All posts copied.', 'success');
    });
    g('dgs-so-new', libNew); g('dgs-ex-new', libNew);
    g('dgs-ex-social', function () { setStep('social'); });
    var lk = document.getElementById('dgs-so-link'); if (lk) lk.addEventListener('input', function () { dSocial().link = lk.value.trim(); digestSave(); });
    if (lk) lk.addEventListener('change', function () { renderSocial(); });
  }

  var inBuild = false;
  function buildAll() {
    if (!dKey()) { toast('Building a draft needs an AI key. Add one under API keys.', 'error'); return; }
    var n = Object.keys(state.selectedStoryIds).length; if (!n) { toast('Tick at least one story first.', 'error'); return; }
    digestEnsure();
    var dr = state.digest.draft, has = dr && Object.keys(dr.sections || {}).some(function (k) { return dr.sections[k].status === 'done'; });
    if (has && !confirm('This replaces your current sections, outline and draft. Continue?')) return;
    setStep('cluster'); inBuild = true;
    runClustering().then(function (ok) {
      if (!ok || !state.digest.clusters.length) throw new Error('stop');
      return Promise.resolve();
    }).then(function () {
      setStep('outline'); return runOutline();
    }).then(function (ok) {
      if (!ok || !state.digest.outline) throw new Error('stop');
      setStep('write'); return runWrite();
    }).then(function (ok) {
      if (!ok || !reviewStatus().done) throw new Error('stop');
      setStep('review'); toast('Draft built. Read it, then tick the box to open Export.', 'success');
    }).catch(function (e) { if (!e || e.message !== 'stop') LOG('build failed', e); }).then(function () { inBuild = false; });
  }
  function bind() {
    var ba = document.getElementById('dgs-build-all'); if (ba) ba.addEventListener('click', buildAll);
    $$('.dgs-step').forEach(function (s) { s.addEventListener('click', function () { if (!s.disabled) setStep(s.dataset.step); }); });
    $('.dgs-privacy-toggle').addEventListener('click', function () { var d = $('.dgs-privacy-drawer'); d.hidden = !d.hidden; });
    $$('.dgs-mode-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var mode = card.dataset.mode;
        $$('.dgs-mode-card').forEach(function (c) { c.classList.toggle('is-selected', c === card); });
        $$('.dgs-mode-form').forEach(function (f) { f.hidden = f.dataset.mode !== mode; });
      });
    });
    $('#dgs-yt-fetch').addEventListener('click', function () {
      var input = $('#dgs-yt-input').value.trim();
      if (!input) { toast('Enter a channel handle or URL.', 'error'); return; }
      var btn = this; btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Fetching…';
      fetchYouTube(input).then(function (p) {
        var ex = state.profiles.filter(function (x) { return x.source && p.source && x.source.channelId && x.source.channelId === p.source.channelId; })[0];
        if (ex) p.id = ex.id;
        state.profile = p; persistProfile(); renderProfile(); updateStepAvailability();
        toast('Profile derived', 'success');
      }).catch(function (e) { LOG('YT error', e); toast(e.message, 'error'); })
        .then(function () { btn.disabled = false; btn.textContent = orig; });
    });
    var wf = $('#dgs-web-fetch'); if (wf) wf.addEventListener('click', function () { readSite($('#dgs-web-input').value, wf, $('#dgs-web-status')); });
    $('#dgs-manual-save').addEventListener('click', function () {
      var name = $('#dgs-manual-name').value.trim();
      var oneLiner = $('#dgs-manual-oneliner').value.trim();
      var topicList = $('#dgs-manual-topics').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var userSignals = $('#dgs-manual-signals').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var tone = $('#dgs-manual-tone').value;
      if (!name) { toast('Publication name is required.', 'error'); return; }
      if (!topicList.length) topicList = ['General'];
      var autoFilled = !userSignals.length;
      var topics = topicList.map(function (n) {
        var sig = autoFilled ? (DEFAULT_SIGNALS[n.toLowerCase()] || DEFAULT_SIGNALS['general']).slice() : userSignals.slice();
        return { name: n, weight: Math.round((1 / topicList.length) * 100) / 100, subtopics: [], signals: sig };
      });
      state.profile = {
        schemaVersion: '1.0', id: 'tp_' + Date.now().toString(36), name: name,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        source: { mode: 'manual', language: 'en' },
        identity: { oneLiner: oneLiner, positioning: oneLiner, audienceHint: '', dna: '' },
        topics: topics,
        tone: { style: tone, energy: 'urgent', formality: 'neutral-brief', pov: 'analyst', avoid: ['clickbait hyperbole'] },
        constraints: { bannedTopics: [], bannedWords: [], bannedSources: [], requiredDisclosure: 'AI-assisted analysis.', sourceCitationRequired: true },
        performanceHints: { analyzedVideoCount: 0, notes: 'Manual profile.' },
        meta: { lastSyncedAt: new Date().toISOString(), derivationMethod: 'manual', confidence: 1 }
      };
      persistProfile(); renderProfile(); updateStepAvailability();
      toast(autoFilled ? 'Profile saved · signals auto-filled per topic. Edit to add more topics.' : 'Profile saved. Edit to add more topics.', 'success');
    });
    $('#dgs-edit-toggle').addEventListener('click', function () {
      var edit = $('#dgs-profile-edit'); var view = $('#dgs-profile-view');
      if (edit.hidden) { renderProfileEdit(); edit.hidden = false; view.hidden = true; this.textContent = 'Cancel'; }
      else { edit.hidden = true; view.hidden = false; this.textContent = 'Edit'; }
    });
    $('#dgs-continue-feed').addEventListener('click', function () { setStep('feed'); });
    $('#dgs-back-channel').addEventListener('click', function () { setStep('channel'); });
    $('#dgs-scan-btn').addEventListener('click', scanFeeds);
    var bk = document.getElementById('dgs-scan-breaking'); if (bk) { try { bk.checked = localStorage.getItem('dgs_scan_breaking') !== '0'; } catch (e0) {} }
    var sc = document.getElementById('dgs-feed-scout'); if (sc) sc.addEventListener('click', function () { setStep('channel'); var ed = $('#dgs-profile-edit'); if (ed && ed.hidden) { var tg = $('#dgs-edit-toggle'); if (tg) tg.click(); } setTimeout(function () { var r = document.getElementById('dgs-scout-run'); if (r) { try { r.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e1) {} } }, 250); });
    digestBind(); writeBind(); reviewBind(); chartBind(); socialBind();
    $('#dgs-continue-scripts').addEventListener('click', function () {
      var n = Object.keys(state.selectedStoryIds).length;
      if (!n) { toast('Tick at least one story first.', 'error'); return; }
      setStep('cluster');
    });
    $$('.dgs-open-settings').forEach(function (b) { b.addEventListener('click', openSettings); });
    var lb0 = $('#dgs-open-lib'); if (lb0) lb0.addEventListener('click', function () { if (!state.profile) { toast('Create a profile first (step 1).', 'error'); return; } openLib(); });
    var lc0 = $('#dgs-lib-close'); if (lc0) lc0.addEventListener('click', closeLib);
    var ln0 = $('#dgs-lib-new'); if (ln0) ln0.addEventListener('click', libNew);
    var ld0 = $('#dgs-lib-drawer'); if (ld0) ld0.addEventListener('click', function (e) { if (e.target === ld0) closeLib(); });
    $('#dgs-settings-close').addEventListener('click', closeSettings);
    $$('.dgs-set-tab').forEach(function (tb) {
      tb.addEventListener('click', function () {
        $$('.dgs-set-tab').forEach(function (x) { x.classList.toggle('is-active', x === tb); x.setAttribute('aria-selected', String(x === tb)); });
        $$('.dgs-set-sec').forEach(function (sec) { sec.hidden = sec.dataset.tab !== tb.dataset.tab; });
        var bd = $('.dgs-drawer-body'); if (bd) bd.scrollTop = 0;
      });
    });
    $('#dgs-settings-drawer').addEventListener('click', function (e) { if (e.target === this) closeSettings(); });
    $('#dgs-set-provider').addEventListener('change', syncProviderFields);
    var lb0 = $('#dgs-lnk-learn'); if (lb0) lb0.addEventListener('click', learnFromLinks);
    var testBtn = document.getElementById('dgs-test-gemini');
    if (testBtn) {
      testBtn.addEventListener('click', function () {
        var key = $('#dgs-set-gemini').value.trim();
        if (!key) { toast('Paste a Gemini key first.', 'error'); testNote('gemini', 'Paste the key above first.', 'bad'); return; }
        var savedKey = state.settings.geminiKey, savedModel = state.settings.geminiModel, savedProv = state.settings.llmProvider;
        var gm = $('#dgs-set-gemini-model');
        state.settings.geminiKey = key;
        if (gm && gm.value.trim()) state.settings.geminiModel = gm.value.trim();
        state.settings.llmProvider = 'gemini';
        var btn = this; btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Testing…'; testNote('gemini', 'Testing. This can take up to a minute while models are tried.', '');
        callLLM('Return strict JSON: {"ok": true, "msg": "hello"}', 'extract', { noFallback: true, noSticky: true })
          .then(function (r) { toast('✓ Gemini key works (model: ' + r.model + ')', 'success'); testNote('gemini', '✓ This key works. Answered by ' + r.model + '.', 'ok'); console.log('[DGS] test success:', r.model, r.text); })
          .catch(function (e) { toast('✗ ' + e.message, 'error'); testNote('gemini', '✗ ' + testWhy(e), 'bad'); console.error('[DGS] test fail:', e.message); })
          .then(function () {
            state.settings.geminiKey = savedKey; state.settings.geminiModel = savedModel; state.settings.llmProvider = savedProv;
            btn.disabled = false; btn.textContent = orig;
          });
      });
    }
    COMPAT_IDS.forEach(function (pv) {
      var tb = document.getElementById('dgs-test-' + pv);
      if (!tb) return;
      tb.addEventListener('click', function () {
        var key = $('#dgs-set-' + pv).value.trim();
        if (!key) { toast('Paste a ' + pv + ' key first.', 'error'); testNote(pv, 'Paste the key above first.', 'bad'); return; }
        var saved = { k: state.settings[pv + 'Key'], m: state.settings[pv + 'Model'], p: state.settings.llmProvider };
        state.settings[pv + 'Key'] = key; state.settings[pv + 'Model'] = ($('#dgs-set-' + pv + '-model').value || '').trim(); state.settings.llmProvider = pv;
        var btn = this; btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Testing…'; testNote(pv, 'Testing. This can take up to a minute while models are tried.', '');
        callLLM('Return strict JSON: {"ok": true, "msg": "hello"}', 'extract', { noFallback: true, noSticky: true })
          .then(function (r) { toast('✓ ' + pv + ' key works (model: ' + r.model + ')', 'success'); testNote(pv, '✓ This key works. Answered by ' + r.model + '.', 'ok'); })
          .catch(function (e) { toast('✗ ' + e.message, 'error'); testNote(pv, '✗ ' + testWhy(e), 'bad'); })
          .then(function () { state.settings[pv + 'Key'] = saved.k; state.settings[pv + 'Model'] = saved.m; state.settings.llmProvider = saved.p; btn.disabled = false; btn.textContent = orig; });
      });
    });
    var imp = $('#dgs-import-keys');
    if (imp) imp.addEventListener('click', function () {
      var found = null;
      try {
        Object.keys(localStorage).forEach(function (k) {
          if (found || k.indexOf('autonom.asg.settings.v1') !== 0) return;
          var o = JSON.parse(localStorage.getItem(k) || 'null');
          if (o && (o.geminiKey || o.groqKey || o.openrouterKey || o.nvidiaKey || o.openaiKey || o.deepseekKey || o.youtubeKey)) found = o;
        });
      } catch (e) {}
      if (!found) { toast('No Newsreel keys found in this browser.', 'error'); return; }
      var map = { 'dgs-set-yt': 'youtubeKey', 'dgs-set-gemini': 'geminiKey', 'dgs-set-openai': 'openaiKey', 'dgs-set-deepseek': 'deepseekKey', 'dgs-set-groq': 'groqKey', 'dgs-set-openrouter': 'openrouterKey', 'dgs-set-nvidia': 'nvidiaKey' };
      var n = 0;
      Object.keys(map).forEach(function (id) { var f = document.getElementById(id); if (f && found[map[id]]) { f.value = found[map[id]]; n++; } });
      if (found.llmProvider && $('#dgs-set-provider')) { $('#dgs-set-provider').value = found.llmProvider; syncProviderFields(); }
      toast(n + ' key' + (n === 1 ? '' : 's') + ' copied. Press Save settings to keep them.', 'success');
    });
    var bk = document.getElementById('dgs-backup-dl'); if (bk) bk.addEventListener('click', function () {
      var o = { kind: 'autonom-digest-backup', version: 2, at: new Date().toISOString(), data: {}, digests: {} };
      try { digestSave(); Object.keys(LIB.recs).forEach(function (pid) { var l = libList(pid); if (l.length) { o.digests[pid] = {}; l.forEach(function (d) { o.digests[pid][d.id] = d; }); } }); } catch (e8) {}
      try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('autonom.dgs.settings') === 0 || k === LS.profiles || k === LS.profile) o.data[k] = localStorage.getItem(k); }); } catch (e) {}
      if (!Object.keys(o.data).length && !Object.keys(o.digests).length) { toast('Nothing saved yet to back up.', 'error'); return; }
      downloadText(JSON.stringify(o, null, 1), 'autonom-digest-backup.json', 'application/json'); try { localStorage.setItem('autonom.dgs.backup_at', String(Date.now())); } catch (e7) {}
      toast('Backup downloaded with your profiles, keys and all digests. It contains your API keys, so keep the file private.', 'success');
    });
    var bpk = document.getElementById('dgs-backup-pick'); if (bpk) bpk.addEventListener('click', function () { var f0 = document.getElementById('dgs-backup-file'); if (f0) f0.click(); });
    var bf = document.getElementById('dgs-backup-file'); if (bf) bf.addEventListener('change', function () {
      var f = bf.files && bf.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () {
        try {
          var o = JSON.parse(String(rd.result || '')); if (!o || o.kind !== 'autonom-digest-backup' || !o.data) throw new Error('bad');
          Object.keys(o.data).forEach(function (k) { if ((k.indexOf('autonom.dgs.settings') === 0 || k === LS.profiles || k === LS.profile) && typeof o.data[k] === 'string') localStorage.setItem(k, o.data[k]); });
          Object.keys(o.digests || {}).forEach(function (pid) { Object.keys(o.digests[pid] || {}).forEach(function (id) { var r = o.digests[pid][id]; if (r && typeof r === 'object' && r.clusters) { libRecs(pid)[id] = digestNorm(r); queueSave(pid, r); } }); });
          flushDigests().then(function () { toast('Backup restored. Reloading…', 'success'); setTimeout(function () { location.reload(); }, 600); });
        } catch (e) { toast('That file is not an Autonom Digest backup.', 'error'); }
      };
      rd.readAsText(f); bf.value = '';
    });
    $('#dgs-settings-save').addEventListener('click', function () {
      state.settings.youtubeKey = $('#dgs-set-yt').value.trim();
      state.settings.llmProvider = $('#dgs-set-provider').value;
      state.settings.geminiKey = $('#dgs-set-gemini').value.trim();
      var gm = $('#dgs-set-gemini-model');
      if (gm) state.settings.geminiModel = gm.value.trim();
      var fb2 = $('#dgs-set-fallback'); if (fb2) state.settings.fallbackProviders = !!fb2.checked;
      var stg2 = $('#dgs-set-strategy'); if (stg2) { state.settings.strategy = stg2.value || 'value'; discovered = {}; }
      var wb2 = $('#dgs-set-writebest'); if (wb2) state.settings.writeBest = !!wb2.checked;
      var wm2 = $('#dgs-set-gemini-write-model'); if (wm2) state.settings.geminiWriteModel = wm2.value.trim();
      state.settings.openaiKey = $('#dgs-set-openai').value.trim();
      state.settings.deepseekKey = $('#dgs-set-deepseek').value.trim();
      COMPAT_IDS.forEach(function (pv) {
        var k = $('#dgs-set-' + pv), m = $('#dgs-set-' + pv + '-model'), w = $('#dgs-set-' + pv + '-write-model');
        if (k) state.settings[pv + 'Key'] = k.value.trim();
        if (m) state.settings[pv + 'Model'] = m.value.trim();
        if (w) state.settings[pv + 'WriteModel'] = w.value.trim();
      });
      // A key or model may have changed: forget what was learned about the old one.
      [typeof probed !== 'undefined' && probed, typeof discovered !== 'undefined' && discovered, typeof relayMode !== 'undefined' && relayMode, typeof providerDown !== 'undefined' && providerDown, typeof modelCooldown !== 'undefined' && modelCooldown, typeof tpmLimit !== 'undefined' && tpmLimit, typeof tpmLog !== 'undefined' && tpmLog].forEach(function (m) { if (m) Object.keys(m).forEach(function (k) { delete m[k]; }); });
      lastGoodProvider = '';
      readLinks(); if (state.profile) persistProfile();
      persistSettings(); updateApiStatus(); closeSettings(); toast('Settings saved', 'success');
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (!$('#dgs-settings-drawer').hidden) closeSettings(); var lb1 = $('#dgs-lib-drawer'); if (lb1 && !lb1.hidden) closeLib(); } });
  }
  function resumeStep() {
    try {
      digestEnsure(); var d = state.digest, st = d && d.step;
      if (!st || st === 'channel' || st === 'feed' || !d.clusters.length) return;
      var btn = document.querySelector('.dgs-step[data-step="' + st + '"]'); if (!btn || btn.disabled) return;
      setStep(st); try { window.scrollTo(0, 0); } catch (e) {}
      toast('Welcome back. You are where you left off.', '');
    } catch (e) {}
  }
  // The step's own button is the main action until its work exists; after that, Continue is.
  function setLead(btn, lead) { btn.classList.toggle('dgs-btn-primary', !!lead); btn.classList.toggle('dgs-btn-ghost', !lead); }
  function friendlyKey(k) {
    if (k === 'asg_footage_cache') return 'Newsreel: footage search cache';
    if (k === 'asg_viral_cache_v1') return 'Newsreel: viral cache';
    if (k.indexOf('autonom.asg.scripts') === 0) return 'Newsreel: saved scripts';
    if (k.indexOf('autonom.asg.') === 0) return 'Newsreel: profile and settings';
    if (k.indexOf('autonom.dgs.digest') === 0) return 'Digest: old digest data';
    if (k.indexOf('autonom.dgs.') === 0) return 'Digest: profile and keys';
    return k.length > 34 ? k.slice(0, 33) + '…' : k;
  }
  function showStore() {
    var n = document.getElementById('dgs-store'); if (!n) return;
    var rows = [], bytes = 0;
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i), sz = (k.length + String(localStorage.getItem(k) || '').length) * 2; bytes += sz; rows.push([k, sz]); } } catch (e) {}
    rows.sort(function (a, b) { return b[1] - a[1]; });
    var u = libUsage(), kb = function (x) { return Math.round(x / 1024); };
    n.innerHTML = '';
    n.appendChild(el('p', { class: 'dgs-hint', text: (storeBad ? 'The browser is refusing to save to its small storage. ' : '') + 'Small storage on this site: about ' + kb(bytes) + ' KB of the roughly 5,000 KB the browser allows. Profile and keys live here, with a second copy in the larger browser database.' }));
    if (rows.length) {
      var ul = el('ul', { class: 'dgs-store-list' });
      rows.slice(0, 5).forEach(function (r) { ul.appendChild(el('li', {}, [el('span', { text: friendlyKey(r[0]) }), el('b', { text: kb(r[1]) + ' KB' })])); });
      n.appendChild(ul);
    }
    n.appendChild(el('p', { class: 'dgs-hint', text: 'Digests: ' + u.n + ' saved, about ' + kb(u.bytes) + ' KB, kept in the larger browser database (' + (LIB.idb ? 'working' : 'not available here, using small storage') + ').' }));
    var fb = el('button', { class: 'dgs-btn dgs-btn-ghost dgs-btn-sm', type: 'button', text: 'Free up space (clear caches)' });
    fb.addEventListener('click', function () { var f = freeCaches(); toast(f ? 'Cleared ' + kb(f) + ' KB of caches. Profiles, keys, scripts and digests were not touched.' : 'There were no caches to clear.', f ? 'success' : ''); showStore(); });
    n.appendChild(fb);
  }
  function init() {
    if (!$('.dgs-root')) return;
    loadState();
    libBoot().then(start, start);
  }
  function start() {
    bind(); renderProfileBar(); updateCounters(); updateApiStatus();
    if (state.profile) { renderProfile(); updateStepAvailability(); resumeStep(); try { digestEnsure(); updateLibPill(); } catch (e7) {} }
    restoreFromMirror().then(function (did) {
      if (did) { renderProfileBar(); renderProfile(); updateStepAvailability(); updateApiStatus(); if (state.step === 'channel') resumeStep(); toast('Your profile was restored from the browser\'s backup copy.', 'success'); }
      showStore();
    });
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e6) {}
    var oh = document.getElementById('dgs-origin'); window.__dgsDiag = function () { return { version: VERSION, host: location.host, profile: state.profile && state.profile.name, profiles: state.profiles.length, storeBad: storeBad, keys: Object.keys(localStorage).filter(function (k) { return k.indexOf('autonom.dgs') === 0; }) }; };
     if (oh) oh.textContent = location.host;
    var vh = document.getElementById('dgs-ver'); if (vh) vh.textContent = 'v' + VERSION;
    var pv = window.AUTONOM_DGS && window.AUTONOM_DGS.version;
    if (pv && pv !== VERSION) { var vm = document.getElementById('dgs-ver'); if (vm) vm.textContent = 'v' + VERSION + ' (page expects v' + pv + ', clear your cache)'; setTimeout(function () { toast('The page and the script are different versions (script v' + VERSION + ', page v' + pv + '). Clear the site cache and hard refresh.', 'error', 12000); }, 800); }
    LOG('ready v' + VERSION + (window.AUTONOM_DGS && window.AUTONOM_DGS.articleEndpoint ? ' · article endpoint on' : ' · article endpoint OFF (headline-only)'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
