(function () {
  'use strict';
  var VERSION = '1.11.0';
  if (window.__autonomASGLoaded) return;
  window.__autonomASGLoaded = true;
  window.__asgVersion = VERSION;

  var LOG = function () {
    try { console.log.apply(console, ['[Autonom ASG]'].concat([].slice.call(arguments))); } catch (e) {}
  };

  var LS = {
    profile: 'autonom.asg.profile.v1',
    settings: 'autonom.asg.settings.v1',
    scripts: 'autonom.asg.scripts.v1'
  };

  var modelCooldown = {};
  var GONE_KEY = 'asg_gone_models';
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
    stories: [],
    selectedStoryIds: {},
    scripts: [],
    settings: { youtubeKey: '', llmProvider: 'gemini', geminiKey: '', geminiModel: '', openaiKey: '', deepseekKey: '', requireSecond: false, geminiWriteModel: '', depth: true, fallbackProviders: true, pixabayKey: '', pexelsKey: '', stockProvider: 'pixabay', groqKey: '', groqModel: '', groqWriteModel: '', openrouterKey: '', openrouterModel: '', openrouterWriteModel: '' },
    counters: { apiCalls: 0, llmCalls: 0 }
  };

  var LEN = { minSec: 45, maxSec: 105, defaultSec: 60, wps: 2.5 };
  function clampSec(d) { d = parseInt(d, 10); if (!d || d < 0) d = LEN.defaultSec; return Math.max(LEN.minSec, Math.min(LEN.maxSec, d)); }
  function formatFor(sec) {
    sec = clampSec(sec);
    var words = Math.round(sec * LEN.wps);
    var cap = Math.round(LEN.maxSec * LEN.wps);
    return { targetDurationSec: sec, wordCountMin: Math.round(words * 0.85), wordCountMax: Math.min(Math.round(words * 1.1), cap) };
  }
  function splitSentences(text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return [];
    t = t.replace(/(\d)\.(\d)/g, '$1\u0001$2');
    t = t.replace(/\b(?:[A-Z]\.){2,}/g, function (m) { return m.replace(/\./g, '\u0001'); })
         .replace(/\b(Mr|Mrs|Ms|Dr|St|Gen|Col|Lt|Sgt|Capt|Maj|Adm|Sen|Rep|Gov|Pres|No|vs|etc|Inc|Ltd|Co|Jr|Sr)\./g, '$1\u0001')
         .replace(/\b([A-Z])\.(?=\s+[A-Z])/g, '$1\u0001')
         .replace(/\b(e\.g|i\.e|a\.m|p\.m)\./gi, function (m) { return m.replace(/\./g, '\u0001'); });
    var parts = t.match(/[^.!?]+[.!?]+["')\u201d]*|[^.!?]+$/g) || [];
    return parts.map(function (x) { return x.replace(/\u0001/g, '.').trim(); }).filter(Boolean);
  }
  function wordCount(s) { return (String(s || '').trim().match(/\S+/g) || []).length; }
  function scriptWords(sc) { return wordCount(sc.hook) + wordCount(sc.body) + wordCount(sc.analysis) + wordCount(sc.cta); }

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
  function str(v) { return Array.isArray(v) ? v.join(' ') : (v == null ? '' : String(v)); }

  function loadState() {
    try {
      var p = localStorage.getItem(LS.profile); if (p) state.profile = JSON.parse(p);
      var s = localStorage.getItem(LS.settings); if (s) Object.assign(state.settings, JSON.parse(s));
      var sc = localStorage.getItem(LS.scripts); if (sc) state.scripts = JSON.parse(sc);
    } catch (e) { LOG('load failed', e); }
    if (state.profile && state.profile.format && !state.profile.format.lengthV2) {
      var f = formatFor(state.profile.format.targetDurationSec < 75 ? LEN.defaultSec : state.profile.format.targetDurationSec);
      state.profile.format.targetDurationSec = f.targetDurationSec;
      state.profile.format.wordCountMin = f.wordCountMin;
      state.profile.format.wordCountMax = f.wordCountMax;
      state.profile.format.lengthV2 = true;
      persistProfile();
    }
  }
  function persistProfile() { try { localStorage.setItem(LS.profile, JSON.stringify(state.profile)); } catch (e) {} }
  function persistSettings() { try { localStorage.setItem(LS.settings, JSON.stringify(state.settings)); } catch (e) {} }
  function persistScripts() { try { localStorage.setItem(LS.scripts, JSON.stringify(state.scripts)); } catch (e) {} }

  function updateCounters() {
    var a = $('#asg-stat-api'); if (a) a.textContent = state.counters.apiCalls;
    var l = $('#asg-stat-llm'); if (l) l.textContent = state.counters.llmCalls;
  }
  function updateApiStatus() {
    var node = document.getElementById('asg-api-status');
    if (!node) return;
    var hasYt = !!state.settings.youtubeKey;
    var hasLlm = state.settings.llmProvider !== 'none' && !!currentLlmKey();
    node.classList.remove('is-ok', 'is-partial');
    var label = node.querySelector('.asg-api-label');
    if (hasYt && hasLlm) { node.classList.add('is-ok'); if (label) label.textContent = 'Keys ready'; }
    else if (hasYt || hasLlm) { node.classList.add('is-partial'); if (label) label.textContent = hasLlm ? 'LLM ✓ · YT ✗' : 'YT ✓ · LLM ✗'; }
    else { if (label) label.textContent = 'No keys'; }
    node.title = 'YouTube: ' + (hasYt ? 'set' : 'missing') + ' · LLM: ' + (hasLlm ? 'set' : 'missing');
  }
  function toast(msg, kind, ms) {
    var t = el('div', { class: 'asg-toast' + (kind ? ' is-' + kind : ''), text: msg });
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('is-on'); });
    setTimeout(function () { t.classList.remove('is-on'); setTimeout(function () { t.remove(); }, 320); }, ms || (kind === 'error' ? 9000 : 5000));
  }
  function setStep(step) {
    var order = ['channel', 'feed', 'generate', 'scripts', 'video', 'export'];
    state.step = step;
    $$('.asg-panel').forEach(function (p) { p.hidden = p.dataset.panel !== step; });
    $$('.asg-step').forEach(function (s) {
      var idx = order.indexOf(s.dataset.step); var cur = order.indexOf(step);
      s.classList.toggle('is-active', s.dataset.step === step);
      s.classList.toggle('is-done', idx < cur && idx >= 0);
    });
    updateStepAvailability();
    if (step === 'generate') renderGenerateStatus();
    if (step === 'video') renderVideoPanel();
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
  }
  function updateStepAvailability() {
    var hasProfile = !!state.profile;
    var hasStories = Object.keys(state.selectedStoryIds).length > 0;
    var hasScripts = goodScripts().length > 0;
    $$('.asg-step').forEach(function (s) {
      var st = s.dataset.step;
      if (st === 'channel') s.disabled = false;
      else if (st === 'feed') s.disabled = !hasProfile;
      else if (st === 'generate') s.disabled = !hasStories;
      else if (st === 'scripts') s.disabled = !state.scripts.length;
      else if (st === 'video') s.disabled = !hasScripts;
      else if (st === 'export') s.disabled = !hasScripts;
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
    var fmt = formatFor(opts.durationSec || LEN.defaultSec);
    fmt.structure = ['hook', 'what-happened', 'background', 'why-it-matters', 'what-to-watch', 'cta-question'];
    fmt.hookStyle = 'event-first'; fmt.ctaStyle = 'question'; fmt.lengthV2 = true;
    return {
      schemaVersion: '1.0', id: 'tp_' + Date.now().toString(36), name: opts.name || 'Untitled channel',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      source: opts.source || { mode: 'manual' },
      identity: { oneLiner: opts.oneLiner || '', positioning: opts.positioning || '', audienceHint: opts.audienceHint || '' },
      topics: topics,
      tone: { style: opts.tone || 'analytical', energy: 'urgent', formality: 'neutral-brief', pov: 'analyst', avoid: ['clickbait hyperbole', 'partisan framing', 'doom language'] },
      format: fmt,
      cadence: { videosPerDay: 2, preferredTimes: ['09:00', '18:00'], timezone: 'Europe/Stockholm', minGapHours: 4 },
      constraints: { bannedTopics: [], bannedWords: [], bannedSources: [], requiredDisclosure: 'AI-assisted analysis. Sources cited in description.', sourceCitationRequired: true },
      performanceHints: { analyzedVideoCount: texts.length, avgDurationSec: durCount ? Math.round(totalDur / durCount) : null, notes: 'Auto-derived; edit as needed.' },
      promptTemplateId: 'tactical-analysis-v1',
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
            source: { mode: 'youtube', channelId: ch.id, channelHandle: '@' + (parsed.handle || ''), language: 'en' },
            method: 'youtube-api + heuristic', confidence: 0.72
          });
        });
    });
  }

  function fetchWithTimeout(url, opts, ms) {
    ms = ms || 8000;
    var controller = new AbortController();
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
  var FEED_PATHS = ['/feed/', '/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml', '/blog/feed/', '/news/feed/'];
  function discoverFeed(siteUrl, onProgress) {
    var base = String(siteUrl).replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
    var tries = FEED_PATHS.map(function (p) { return base + p; });
    var i = 0;
    function next() {
      if (i >= tries.length) return Promise.reject(new Error('No RSS feed found. Tried: ' + tries.join(', ') + '. Paste the feed URL directly.'));
      var url = tries[i++];
      if (onProgress) onProgress('Trying ' + url + '…');
      return tryFeed(url).catch(next);
    }
    return next();
  }
  function deriveFromFeed(feed, opts) {
    var items = (feed.items || []).slice(0, 30).map(function (it) {
      return { title: it.title, description: String(it.description || '').replace(/<[^>]+>/g, ' ').trim() };
    });
    return deriveFromTexts(items, {
      name: opts.name || (feed.feed && feed.feed.title) || 'Untitled site',
      oneLiner: (feed.feed && feed.feed.description) ? feed.feed.description.slice(0, 120) : '',
      positioning: (feed.feed && feed.feed.description) || '',
      source: { mode: 'site', siteUrl: opts.siteUrl, feedUrls: [opts.feedUrl], language: 'en' },
      method: 'rss + heuristic', confidence: 0.65
    });
  }

  function renderProfile() {
    if (!state.profile) return;
    $('#asg-profile-editor').hidden = false;
    var view = $('#asg-profile-view'); view.innerHTML = '';
    var p = state.profile; var dl = el('dl');
    dl.appendChild(el('dt', { text: 'Name' })); dl.appendChild(el('dd', { text: p.name }));
    dl.appendChild(el('dt', { text: 'One-liner' })); dl.appendChild(el('dd', { text: p.identity.oneLiner || '—' }));
    if (p.identity.positioning) { dl.appendChild(el('dt', { text: 'Positioning' })); dl.appendChild(el('dd', { text: p.identity.positioning })); }
    dl.appendChild(el('dt', { text: 'Topics' }));
    var tdd = el('dd'); var chips = el('div', { class: 'asg-chips' });
    p.topics.forEach(function (t) { chips.appendChild(el('span', { class: 'asg-chip', text: t.name + ' · ' + Math.round(t.weight * 100) + '%' })); });
    tdd.appendChild(chips); dl.appendChild(tdd);
    var all = [];
    p.topics.forEach(function (t) { (t.signals || []).forEach(function (s) { if (all.indexOf(s) === -1) all.push(s); }); });
    if (all.length) {
      dl.appendChild(el('dt', { text: 'Scan signals' }));
      var sdd = el('dd'); var schips = el('div', { class: 'asg-chips' });
      all.slice(0, 16).forEach(function (s) { schips.appendChild(el('span', { class: 'asg-chip is-muted', text: s })); });
      sdd.appendChild(schips); dl.appendChild(sdd);
    }
    dl.appendChild(el('dt', { text: 'Tone' })); dl.appendChild(el('dd', { text: p.tone.style + ' · ' + p.tone.energy }));
    dl.appendChild(el('dt', { text: 'Format' })); dl.appendChild(el('dd', { text: p.format.targetDurationSec + 's · ' + p.format.wordCountMin + '–' + p.format.wordCountMax + ' words' }));
    dl.appendChild(el('dt', { text: 'Cadence' })); dl.appendChild(el('dd', { text: p.cadence.videosPerDay + ' / day · ' + p.cadence.preferredTimes.join(', ') }));
    view.appendChild(dl);
  }
  function textInput(v, on) { var i = el('input', { type: 'text', value: v || '' }); i.addEventListener('input', function () { on(i.value); }); return i; }
  function textarea(v, on) { var t = el('textarea', {}); t.value = v || ''; t.addEventListener('input', function () { on(t.value); }); return t; }
  function selectOpts(opts, v, on) {
    var s = el('select');
    opts.forEach(function (o) { var op = el('option', { value: o, text: o }); if (o === v) op.selected = true; s.appendChild(op); });
    s.addEventListener('change', function () { on(s.value); }); return s;
  }
  function field(label, input) { return el('label', { class: 'asg-field' }, [el('span', { class: 'asg-label', text: label }), input]); }

  function renderProfileEdit() {
    if (!state.profile) return;
    var edit = $('#asg-profile-edit'); edit.innerHTML = '';
    var p = state.profile;
    edit.appendChild(field('Name', textInput(p.name, function (v) { p.name = v; })));
    edit.appendChild(field('One-liner', textInput(p.identity.oneLiner, function (v) { p.identity.oneLiner = v; })));
    edit.appendChild(field('Positioning', textarea(p.identity.positioning, function (v) { p.identity.positioning = v; })));
    var tb = el('div', { class: 'asg-field' }, [el('span', { class: 'asg-label', text: 'Topics (name · weight · signals)' })]);
    var rows = el('div', { style: 'display:grid;gap:10px;' });
    p.topics.forEach(function (t) {
      var row = el('div', { style: 'display:grid;grid-template-columns:1.2fr .6fr 2.2fr;gap:8px;align-items:center;' });
      row.appendChild(textInput(t.name, function (v) { t.name = v; }));
      row.appendChild(textInput(String(t.weight), function (v) { t.weight = parseFloat(v) || 0; }));
      row.appendChild(textInput((t.signals || []).join(', '), function (v) { t.signals = v.split(',').map(function (s) { return s.trim(); }).filter(Boolean); }));
      rows.appendChild(row);
    });
    tb.appendChild(rows); edit.appendChild(tb);
    edit.appendChild(field('Tone style', selectOpts(['analytical', 'urgent', 'neutral', 'contrarian'], p.tone.style, function (v) { p.tone.style = v; })));
    edit.appendChild(field('Target duration (sec, 45 to 105)', textInput(String(p.format.targetDurationSec), function (v) {
      var d = parseInt(v, 10); if (!d) return;
      var f = formatFor(d);
      p.format.targetDurationSec = f.targetDurationSec;
      p.format.wordCountMin = f.wordCountMin;
      p.format.wordCountMax = f.wordCountMax;
      p.format.lengthV2 = true;
    })));
    var save = el('button', { class: 'asg-btn asg-btn-primary', type: 'button', text: 'Save profile' });
    save.addEventListener('click', function () {
      p.updatedAt = new Date().toISOString();
      persistProfile(); renderProfile();
      $('#asg-profile-edit').hidden = true; $('#asg-profile-view').hidden = false;
      $('#asg-edit-toggle').textContent = 'Edit';
      toast('Profile saved', 'success');
    });
    edit.appendChild(el('div', { class: 'asg-actions' }, [save]));
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
    var score = 0;
    profile.topics.forEach(function (t) {
      (t.signals || []).forEach(function (sig) { if (sig && hasWord(text, sig)) score += t.weight * 10; });
    });
    if (s.publishedAt) {
      var ageH = (Date.now() - new Date(s.publishedAt).getTime()) / 3.6e6;
      if (ageH < 6) score += 4; else if (ageH < 24) score += 2;
    }
    if (s.readable === 'open') score += 3;
    return score;
  }
  function fetchServerNews(q) {
    var cfg = window.AUTONOM_ASG || {};
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
    var cfg = window.AUTONOM_ASG || {};
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
        if (i < queries.length) return sleep(window.AUTONOM_ASG && window.AUTONOM_ASG.newsEndpoint ? 2000 : 5200).then(step);
        return step();
      });
    }
    return step();
  }
  function scanFeeds() {
    if (!state.profile) return;
    var queries = buildQueries(state.profile);
    if (!queries.length) {
      toast('Your profile has no usable signals (3+ characters). Go back to Channel → Edit and add keywords.', 'error');
      return;
    }
    var list = $('#asg-story-list'); list.innerHTML = '';
    state.stories = []; state.selectedStoryIds = {};
    var pubPromise = fetchPublisherFeeds(state.profile);
    var prog = $('#asg-scan-progress'); prog.hidden = false;
    var fill = $('.asg-progress-fill', prog); var label = $('.asg-progress-label', prog);
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
      fill.style.width = '90%';
      var seen = {};
      results.forEach(function (r) {
        if (!r.feed || !r.feed.items) return;
        r.feed.items.slice(0, r.q === 'publishers' ? 40 : 12).forEach(function (it) {
          var key = cleanTitle(it.title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
          if (seen[key]) return; seen[key] = true;
          var summary = String(it.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
          var story = {
            id: 'st_' + Math.random().toString(36).slice(2, 10),
            title: it.title, summary: summary, url: it.link,
            source: it.author || String(it.title || '').split(' - ').pop() || 'News',
            publishedAt: it.pubDate, score: 0,
            readable: (it.readable === 'open' || it.readable === 'metered') && isThinUrl(it.link) ? 'thin' : (it.readable || 'unknown'), sourceType: it.readable ? 'publisher' : 'aggregator',
            redirect: !!it.redirect || /news\.google\.com|bing\.com\/news/i.test(String(it.link || ''))
          };
          story.score = scoreStory(story, state.profile);
          state.stories.push(story);
        });
      });
      state.stories.sort(function (a, b) { return b.score - a.score; });
      state.stories = state.stories.slice(0, 30);
      renderStories();
      fill.style.width = '100%';
      setTimeout(function () { prog.hidden = true; }, 300);
      if (!state.stories.length) toast('No stories found. Try different signals.', 'error');
      else toast(state.stories.length + ' stories found · select a few then "Generate scripts →"', 'success');
    }).catch(function (e) {
      prog.hidden = true; LOG('scan crashed:', e);
      toast('Scan failed: ' + e.message, 'error');
    });
  }

  function renderStories() {
    var list = $('#asg-story-list'); list.innerHTML = '';
    state.stories.forEach(function (s) {
      var cb = el('input', { type: 'checkbox' });
      cb.checked = !!state.selectedStoryIds[s.id];
      var body = el('div');
      body.appendChild(el('p', { class: 'asg-story-title', text: s.title }));
      var meta = el('div', { class: 'asg-story-meta' });
      meta.appendChild(el('span', { text: s.source }));
      var rdLabel = s.readable === 'open' ? '✓ readable' : s.readable === 'metered' ? '◐ maybe readable' : s.readable === 'paywalled' ? '🔒 paywalled: topic only' : s.readable === 'thin' ? 'live/video page: topic only' : 'aggregator link';
      meta.appendChild(el('span', { class: 'asg-chip is-muted', text: rdLabel }));
      if (s.publishedAt) meta.appendChild(el('span', { text: new Date(s.publishedAt).toLocaleString() }));
      body.appendChild(meta);
      var score = el('span', { class: 'asg-story-score', text: '★ ' + s.score.toFixed(1) });
      var card = el('label', { class: 'asg-story' + (cb.checked ? ' is-selected' : '') }, [cb, body, score]);
      cb.addEventListener('change', function () {
        if (cb.checked) state.selectedStoryIds[s.id] = true;
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
    $('#asg-feed-next').hidden = !n;
    var btn = $('#asg-continue-scripts');
    if (btn) btn.textContent = n ? 'Continue with ' + n + (n === 1 ? ' story' : ' stories') + ' →' : 'Continue →';
  }

  function fetchArticle(url) {
    var cfg = window.AUTONOM_ASG || {};
    if (!cfg.articleEndpoint || !/^https?:\/\//i.test(String(url || ''))) return Promise.resolve(null);
    if (/bing\.com\/news/i.test(url)) return Promise.resolve(null);
    if (/^https?:\/\/([^\/]*\.)?(wsj|ft|bloomberg|economist|barrons)\.com\//i.test(url)) return Promise.resolve(null);
    var ep = cfg.articleEndpoint + (cfg.articleEndpoint.indexOf('?') > -1 ? '&' : '?') + 'url=' + encodeURIComponent(url);
    return fetchWithTimeout(ep, { credentials: 'same-origin' }, 25000)
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (j) { if (j && j.ok && j.text) return j; LOG('article not available:', url, j && j.error); return null; })
      .catch(function (e) { LOG('article fetch failed:', e.message); return null; });
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
    return '';
  }

  function normText(s) {
    return String(s || '').toLowerCase()
      .replace(/[‘’‛′]/g, "'").replace(/[“”„]/g, '"')
      .replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  }
  function alnum(s) { return ' ' + normText(s).replace(/[^a-z0-9]+/g, ' ').trim() + ' '; }
  function quoteInText(quote, hay) {
    var q = alnum(quote);
    if (q.trim().length < 25) return false;
    if (hay.indexOf(q) !== -1) return true;
    var segs = String(quote).split(/\.\.\.|…/).map(alnum).filter(function (x) { return x.trim().length >= 20; });
    return segs.length > 0 && segs.every(function (x) { return hay.indexOf(x) !== -1; });
  }
  function verifyFacts(facts, articleText) {
    var hay = alnum(articleText);
    var ok = [], bad = [];
    (Array.isArray(facts) ? facts : []).forEach(function (f) {
      if (!f || !f.claim || !f.quote) { bad.push(f); return; }
      var cl = String(f.claim).trim();
      var fragment = /^[a-z]/.test(cl) || ((cl.match(/["“”]/g) || []).length % 2 === 1) || cl.split(/\s+/).length < 4;
      if (fragment) { bad.push(f); return; }
      var sp = cl.match(/^((?:[A-Z][\w'’\-]*\.?\s+){0,4}[A-Z][\w'’\-]*)\s+(?:said|says|stated|states|told|noted|notes|warned|warns|claimed|claims|argued|argues|added|wrote|explained|described|called|suggested|believes|expressed)\b/);
      if (sp && !/^(According|The|A|An|In|On|At|It|This|That|Officials?|Experts?)\b/.test(sp[1])) {
        var nm = alnum(String(f.quote)), toks = sp[1].split(/\s+/).filter(function (w) { return w.length > 2; });
        var hit = toks.some(function (w) { return nm.indexOf(alnum(w)) > -1; });
        if (!hit) { LOG('dropped fact: speaker "' + sp[1] + '" is not named in its quote:', cl.slice(0, 80)); bad.push(f); return; }
      }
      if (quoteInText(f.quote, hay)) ok.push({ claim: cl, quote: String(f.quote).trim() });
      else bad.push(f);
    });
    return { ok: ok, bad: bad };
  }
  var JUDGE_STEMS = ['justif', 'legitim', 'lawful', 'unlawful', 'illegal', 'legal', 'criminal', 'guilty', 'innocen', 'prove', 'proven', 'admit', 'blam', 'responsib', 'deliberat', 'intentional', 'retaliat', 'ineffective', 'useless', 'devastat', 'crippl', 'collaps', 'effectively', 'essentially'];
  function claimStronger(claim, quote) {
    var c = normText(claim), q = normText(quote);
    for (var i = 0; i < JUDGE_STEMS.length; i++) {
      var re = new RegExp('(?:^|[^a-z])' + JUDGE_STEMS[i]);
      if (re.test(c) && !re.test(q)) return JUDGE_STEMS[i];
    }
    return '';
  }
  function fixOverreachClaims(list) {
    return list.map(function (f) {
      var w = claimStronger(f.claim, f.quote);
      if (!w) return f;
      LOG('claim stronger than its quote ("' + w + '"), using the quote instead:', f.claim.slice(0, 80));
      var out = {}; for (var k in f) out[k] = f[k];
      out.claim = String(f.quote).replace(/^["“”\s]+|["“”\s]+$/g, '');
      out.claimReplaced = true;
      return out;
    });
  }
  function numbersIn(text) {
    var out = [];
    (String(text || '').match(/\d[\d,]*(?:\.\d+)?/g) || []).forEach(function (n) {
      n = n.replace(/,/g, '').replace(/\.$/, '');
      if (out.indexOf(n) === -1) out.push(n);
    });
    return out;
  }
  function unsupportedNumbers(scriptText, articleText) {
    var have = numbersIn(articleText);
    return numbersIn(scriptText).filter(function (n) { return !/^[1-5]$/.test(n) && have.indexOf(n) === -1; });
  }
  var COUNTRY_DEMONYM = { poland: 'polish', germany: 'german', france: 'french', spain: 'spanish', finland: 'finnish', sweden: 'swedish', denmark: 'danish', ireland: 'irish', britain: 'british', england: 'english', scotland: 'scottish', turkey: 'turkish', netherlands: 'dutch', greece: 'greek', switzerland: 'swiss', israel: 'israeli', ukraine: 'ukrainian', russia: 'russian', china: 'chinese', japan: 'japanese', lebanon: 'lebanese', iran: 'iranian', iraq: 'iraqi', syria: 'syrian', america: 'american', europe: 'european', cuba: 'cuban', india: 'indian', pakistan: 'pakistani', taiwan: 'taiwanese', vietnam: 'vietnamese', thailand: 'thai', norway: 'norwegian', estonia: 'estonian', latvia: 'latvian', lithuania: 'lithuanian', hungary: 'hungarian', romania: 'romanian', bulgaria: 'bulgarian', serbia: 'serbian', croatia: 'croatian', italy: 'italian', portugal: 'portuguese', belgium: 'belgian', austria: 'austrian', canada: 'canadian', mexico: 'mexican', brazil: 'brazilian', egypt: 'egyptian', yemen: 'yemeni', qatar: 'qatari', kuwait: 'kuwaiti', oman: 'omani', singapore: 'singaporean', azerbaijan: 'azerbaijani', armenia: 'armenian', venezuela: 'venezuelan', korea: 'korean', afghanistan: 'afghan', australia: 'australian', africa: 'african' };
  function demonymInText(base, hay) {
    if (COUNTRY_DEMONYM[base] && hay.indexOf(' ' + COUNTRY_DEMONYM[base] + ' ') !== -1) return true;
    for (var k in COUNTRY_DEMONYM) { if (COUNTRY_DEMONYM[k] === base && hay.indexOf(' ' + k + ' ') !== -1) return true; }
    var stems = [];
    if (/ian$/.test(base)) { stems.push(base.slice(0, -3)); }
    if (/an$/.test(base)) { stems.push(base.slice(0, -2)); }
    if (/ese$/.test(base)) { stems.push(base.slice(0, -3)); }
    if (/ish$/.test(base)) { stems.push(base.slice(0, -3)); }
    if (/i$/.test(base)) { stems.push(base.slice(0, -1)); }
    return stems.some(function (st) { return st.length >= 3 && hay.indexOf(' ' + st) !== -1; });
  }
  var ENTITY_SKIP = ('monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december').split(' ');
  function unsupportedTerms(scriptText, articleText, allowWords) {
    var hay = alnum(articleText);
    var allow = {};
    (allowWords || []).forEach(function (w) { allow[w] = true; });
    var out = [], seen = {};
    String(scriptText || '').split(/[.!?]+\s+|\n+/).forEach(function (sentence) {
      var re = /[A-Za-z][A-Za-z'’\-]*/g, m, first = true;
      while ((m = re.exec(sentence)) !== null) {
        var tok = m[0];
        if (first) { first = false; continue; }
        if (tok.length < 4 || !/^[A-Z]/.test(tok)) continue;
        var before = sentence.slice(0, m.index).trim();
        if (/[:—\-"“(]$/.test(before)) continue;
        var base = tok.toLowerCase().replace(/['’]s$/, '');
        if (ENTITY_SKIP.indexOf(base) !== -1 || allow[base] || seen[base]) continue;
        seen[base] = true;
        if (hay.indexOf(alnum(base)) === -1 && !demonymInText(base, hay)) out.push(tok.replace(/['’]s$/, ''));
      }
    });
    return out;
  }
  function allowWordsFor(story, profile) {
    var words = [];
    function add(s) { normText(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).forEach(function (w) { if (w) words.push(w); }); }
    add(profile.name); add(story.source);
    (profile.topics || []).forEach(function (t) { add(t.name); });
    return words;
  }
  var NUM_WORDS = { two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50', sixty: '60', seventy: '70', eighty: '80', ninety: '90' };
  var QUALIFIERS = ['up to', 'as many as', 'more than', 'at least', 'less than', 'fewer than', 'close to', 'an estimated', 'approximately', 'around', 'about', 'almost', 'nearly', 'roughly', 'over', 'some'];
  function qualifierBefore(lowerText, idx) {
    var before = ' ' + lowerText.slice(Math.max(0, idx - 30), idx).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    for (var i = 0; i < QUALIFIERS.length; i++) {
      if (before.slice(-(QUALIFIERS[i].length + 1)) === ' ' + QUALIFIERS[i]) return QUALIFIERS[i];
    }
    return '';
  }
  function numberOccurrences(text) {
    var out = [], re = /\d[\d,]*(?:\.\d+)?/g, m, low = String(text || '').toLowerCase();
    while ((m = re.exec(low)) !== null) {
      out.push({ n: m[0].replace(/,/g, '').replace(/\.$/, ''), raw: m[0].replace(/\.$/, ''), q: qualifierBefore(low, m.index) });
    }
    var wre = new RegExp('\\b(' + Object.keys(NUM_WORDS).join('|') + ')\\b', 'g');
    while ((m = wre.exec(low)) !== null) {
      out.push({ n: NUM_WORDS[m[1]], raw: m[1], q: qualifierBefore(low, m.index) });
    }
    return out;
  }
  function droppedQualifiers(scriptText, articleText) {
    var art = numberOccurrences(articleText), scr = numberOccurrences(scriptText), issues = [], seen = {};
    scr.forEach(function (s) {
      if (s.q || seen[s.n] || s.n === '1') return;
      var inArt = art.filter(function (a) { return a.n === s.n; });
      if (inArt.length && inArt.every(function (a) { return a.q; })) {
        seen[s.n] = true;
        issues.push('the source says "' + inArt[0].q + ' ' + inArt[0].raw + '" but the script says "' + s.raw + '" without the qualifier');
      }
    });
    return issues;
  }
  var OVERREACH = ['effectively', 'essentially', 'crippl', 'devastat', 'collaps', 'inevitab', 'solely', 'entirely', 'completely', 'totally', 'permanent', 'guarantee', 'undoubtedly', 'certainly', 'proves', 'reveals', 'signals', 'massive', 'unprecedented', 'skyrocket', 'catastroph', 'dramatic', 'forever', 'always', 'never'];
  function overreachWords(scriptText, articleText) {
    var low = normText(scriptText), hay = normText(articleText), out = [];
    OVERREACH.forEach(function (w) {
      var m = low.match(new RegExp('(?:^|[^a-z])(' + w + '[a-z]*)'));
      if (m && !new RegExp('(?:^|[^a-z])' + w).test(hay) && out.indexOf(m[1]) === -1) out.push(m[1]);
    });
    return out;
  }
  function forecastIssues(scriptText, articleText) {
    var low = normText(scriptText), hay = normText(articleText), out = [];
    [
      /\b(?:will|would) (?:likely|probably|almost certainly|surely|certainly) [a-z]+/,
      /\b(?:is|are) (?:likely|bound|certain|set) to [a-z]+/,
      /\bwill (?:surge|rise|fall|collapse|increase|escalate|worsen|trigger|force|lead|result|cause|spike|drop)\b/
    ].forEach(function (re) {
      var m = low.match(re);
      if (m && hay.indexOf(m[0]) === -1) out.push('"' + m[0] + '"');
    });
    return out;
  }
  function analystIssues(scriptText, articleText) {
    var m = normText(scriptText).match(/\b(analysts|experts|observers|commentators|economists)\b/);
    return (m && !new RegExp('\\b' + m[1]).test(normText(articleText))) ? [m[1]] : [];
  }
  function wordingIssues(mainText, allText, articleText) {
    var out = droppedQualifiers(allText, articleText);
    var o = overreachWords(mainText, articleText);
    if (o.length) out.push('wording stronger than the source: ' + o.join(', '));
    var tm = normText(mainText).match(/\b(simultaneously|meanwhile|at the same time|concurrently|in response|in retaliation)\b/);
    if (tm && !new RegExp('\\b' + tm[1]).test(normText(articleText))) out.push('time or cause link "' + tm[1] + '" that the source does not state');
    var f = forecastIssues(mainText, articleText);
    if (f.length) out.push('forecast that the source does not make: ' + f.join(', '));
    var a = analystIssues(mainText, articleText);
    if (a.length) out.push('attributes a view to "' + a[0] + '" but the source mentions none');
    return out;
  }
  function scriptSentences(parsed) {
    var out = [];
    function add(prefix, text) {
      splitSentences(text).forEach(function (p, i) { out.push({ id: prefix + (i + 1), text: p }); });
    }
    add('H', parsed.hook); add('B', parsed.body); add('I', parsed.analysis); add('C', parsed.cta); add('D', parsed.description);
    return out;
  }
  function factTag(f, nameA) {
    if (f.status === 'confirmed') return '[BOTH OUTLETS: ' + nameA + ' and ' + (f.other && f.other.outlet || 'the second outlet') + ']';
    if (f.status === 'conflict') return '[OUTLETS DIFFER]';
    if (f.status === 'possible') return '[POSSIBLE DIFFERENCE]';
    return '[' + (f.outlet || nameA) + ' ONLY]';
  }
  function auditPrompt(story, facts, sentences, corr) {
    var two = corr && (corr.status === 'corroborated' || corr.status === 'partial' || corr.status === 'conflict');
    var lines = [
      'You are a strict fact-checking editor for a news channel. Compare each numbered SENTENCE of a video script with the VERIFIED FACTS (each has the exact source quote).',
      '',
      'The QUOTE is the ground truth. If a fact\'s claim says more than its quote, judge the sentence against the quote, not the claim.',
      '',
      'Flag a sentence if ANY of these is true:',
      '- (about, approximately, around, roughly, nearly are equivalent hedges: do not flag one for another. Do NOT flag a sentence for leaving something out: only for what it adds or changes. Do NOT flag attribution when the sentence already says who said it, e.g. "X stated ...", "according to X". Sentences starting with D are the video description: check them the same way.)',
      '- overstated: wording stronger than the quote ("effectively barred" for "severely restricted", "crippled", "collapse", "solely"), or a number rounded up or stripped of "up to", "around", "almost", "more than", or stripped of its baseline or timeframe ("since ...", "in September")',
      '- causal: it asserts a cause or effect that the quotes do not state',
      '- attribution: it states as fact something the source only reports, claims or attributes to a named person, an unnamed official or a party to a conflict, or it credits a named person with the source\'s own inference, or it merges statements from different people into one',
      '- unsupported: any claim not in the facts, including forecasts with "will" or "likely"',
      '- definition: a definition that does not match how the term is used in this story',
      '- framing: interpretation presented as fact, a hedge dropped ("thought to be", "reportedly"), or a view attributed to "analysts" or "experts" the source does not mention'
    ];
    if (two) {
      lines.push('- outlets: the script says "both", "outlets agree", "confirmed" or "multiple outlets" about something not tagged BOTH OUTLETS; or it states an [OUTLETS DIFFER] fact as settled; or it states a disputed or claimed matter from a single-outlet fact without naming that outlet; or it says the outlets differ or disagree about a [POSSIBLE DIFFERENCE] fact');
    } else {
      lines.push('- single source: this story rests on ONE outlet. Flag a sentence that presents a disputed or claimed matter (a party\'s claim, blame, casualty figures) as settled fact without naming the outlet or the party');
    }
    if (sentences.some(function (x) { return x.id.charAt(0) === 'I'; })) {
      lines.push('- analysis: applies ONLY to sentences whose id starts with I. These are general-background sentences that are allowed to go beyond the facts, but they must be safe. Flag an I sentence if it (a) contains a number, date, year, quote, or a name of a person, organisation, place or event that is not in the verified facts; (b) states what is happening in this story, or what a named actor wants or intends, as fact when the facts do not say so; (c) is wrong, contested, or not widely established general knowledge, or you are not confident it is accurate; (d) is a forecast or says what "will" happen; (e) uses absolutes ("always", "never", "all") for something that is only usually true. Do NOT flag an I sentence merely because it is not in the facts: background and explanation are wanted. If an I sentence cannot be fixed safely, give "fix": "" (empty) and it will be removed.');
    }
    lines.push('', 'Do not flag sentences that are plainly supported. Do NOT flag the closing call-to-action question, or a sentence that starts with "The open question:" or "Worth watching:", as unsupported, as long as it only asks a question or names something to watch and contains no claim or forecast of its own. For every flagged sentence give "fix": a corrected sentence that stays inside the facts and keeps the qualifiers, baselines and attribution, and "severity": "major" if a viewer could be misled about who, what, when, where, how many, or why (a wrong or invented name, number, date or place; a wrong speaker; a claim or cause not in the facts; outlets said to agree when they do not; a contradiction of a quote), or "minor" for wording nuance (a hedge slightly strengthened, attribution present but the chain imperfect, tone).', '', 'VERIFIED FACTS (primary source: ' + story.source + ')');
    facts.forEach(function (f, i) {
      var l = (i + 1) + '. ' + (two ? factTag(f, story.source) + ' ' : '') + f.claim + '\n   QUOTE (' + (f.outlet || story.source) + '): "' + f.quote + '"';
      if (f.other && f.other.quote) l += '\n   QUOTE (' + (f.other.outlet || 'second outlet') + '): "' + f.other.quote + '"' + (f.status === 'conflict' && f.other.note ? '\n   DIFFERENCE: ' + f.other.note : '');
      lines.push(l);
    });
    lines.push('', 'SENTENCES');
    sentences.forEach(function (s) { lines.push(s.id + ': ' + s.text); });
    lines.push('', 'Return STRICT JSON only: {"flags":[{"id":"B2","type":"overstated|causal|attribution|unsupported|definition|framing|outlets|analysis","severity":"major|minor","problem":"short reason","fix":"corrected sentence"}]}. Use {"flags":[]} if every sentence is supported.');
    return lines.join('\n');
  }
  function cleanUrl(u) {
    try {
      var x = new URL(u);
      ['traffic_source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'at_medium', 'at_campaign', 'xrs', 'ocid'].forEach(function (k) { x.searchParams.delete(k); });
      return x.toString();
    } catch (e) { return u; }
  }
  function extractPrompt(story, art) {
    return [
      'You are a careful fact extractor for a news-analysis channel.',
      'Read the ARTICLE below and extract the facts a viewer needs to understand the story, including the background that makes it make sense.',
      '',
      'RULES',
      '- Use ONLY the article text. No outside knowledge, no assumptions.',
      '- Return 8 to 12 facts. Each fact has:',
      '  "claim": one plain sentence in your own words that keeps every qualifier, baseline and attribution from the quote (up to, around, almost, more than, reportedly, "since ...", "X said", "an unnamed official said"),',
      '  "quote": an EXACT excerpt copied character for character from the article that proves the claim (at least 8 words).',
      '- Cover: what happened, who the parties are, numbers and dates, what the article says caused it, what it says it means, and any background the article gives (earlier events, how the process works).',
      '- One statement per fact. Attribute opinions, claims and unnamed-source statements to whoever made them instead of stating them as fact. Keep different people\'s statements as separate facts.',
      '- The claim must not say more than its quote. Add no causes, motives, legal conclusions or stronger words ("not unlawful" must not become "justified"; "around 80% of" must not become "near"). If the article passes a statement through another source ("told Reuters", "according to the Financial Times", "an official said"), keep that chain in the claim.',
      '- Every claim must be directly supported by its quote. If you cannot find a quote that proves it, do not include it.',
      '- If the article does not support a point, leave it out. Fewer facts is fine.',
      '',
      'ARTICLE (' + (art.host || story.source) + ')',
      '"""',
      String(art.text).slice(0, 8000),
      '"""',
      '',
      'Return STRICT JSON only: {"facts":[{"claim":"...","quote":"..."}]}'
    ].join('\n');
  }

  function isThinUrl(u) { return /\/(video|videos|liveblog|live|live-news|live-blog|gallery|podcast|podcasts|watch)\//i.test(String(u || '')); }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; } }
  function rootHost(h) { return String(h || '').split('.').slice(-2).join('.'); }
  function sigTokens(text) { return uniq(tokenize(text).filter(function (w) { return w.length >= 4; })); }
  function sameEventScore(a, b) {
    var at = sigTokens(cleanTitle(a.title)), bt = sigTokens(cleanTitle(b.title));
    var aAll = uniq(at.concat(sigTokens(a.summary || a.description || ''))), bAll = uniq(bt.concat(sigTokens(b.summary || b.description || '')));
    var sTitle = at.filter(function (w) { return bt.indexOf(w) !== -1; }).length;
    var sAll = aAll.filter(function (w) { return bAll.indexOf(w) !== -1; }).length;
    return { title: sTitle, all: sAll, ok: sTitle >= 2 || (sTitle >= 1 && sAll >= 4) || sAll >= 6 };
  }
  function fetchFeedItems(terms) {
    var cfg = window.AUTONOM_ASG || {};
    if (!cfg.feedsEndpoint || !terms.length) return Promise.resolve([]);
    var ep = cfg.feedsEndpoint + (cfg.feedsEndpoint.indexOf('?') > -1 ? '&' : '?') + 'q=' + encodeURIComponent(terms.join(' OR '));
    state.counters.apiCalls++; updateCounters();
    return fetchWithTimeout(ep, { credentials: 'same-origin' }, 30000)
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (j) { return (j && j.items) || []; })
      .catch(function (e) { LOG('second-outlet search failed:', e.message); return []; });
  }
  function corroborationCandidates(src, exclude) {
    var A = src.story, aHost = rootHost(hostOf(A.url)), aName = String(A.source || '').toLowerCase();
    var aTime = Date.parse(A.publishedAt || '') || 0;
    var terms = sigTokens(cleanTitle(A.title)).slice(0, 8);
    return fetchFeedItems(terms).then(function (items) {
      var pool = [];
      state.stories.forEach(function (s) {
        if (s.readable === 'open' && !s.redirect && !isThinUrl(s.url)) pool.push({ title: s.title, link: s.url, summary: s.summary, author: s.source, pubDate: s.publishedAt, readable: s.readable });
      });
      items.forEach(function (it) {
        if (it.readable === 'open' && !isThinUrl(it.link)) pool.push({ title: it.title, link: it.link, summary: it.description, author: it.author, pubDate: it.pubDate, readable: it.readable });
      });
      var seen = {}, out = [];
      pool.forEach(function (c) {
        if (!c.link || seen[c.link]) return; seen[c.link] = true;
        if (rootHost(hostOf(c.link)) === aHost || String(c.author || '').toLowerCase() === aName) return;
        if (exclude && exclude[c.link]) return;
        var t = Date.parse(c.pubDate || '') || 0;
        if (aTime && t && Math.abs(t - aTime) > 3 * 86400000) return;
        var sc = sameEventScore(A, c);
        if (!sc.ok) return;
        c.match = sc; out.push(c);
      });
      out.sort(function (x, y) { return (y.match.title * 3 + y.match.all) - (x.match.title * 3 + x.match.all); });
      var byOutlet = {};
      return out.filter(function (c) { var k = String(c.author).toLowerCase(); if (byOutlet[k]) return false; byOutlet[k] = true; return true; }).slice(0, 3);
    });
  }
  function corroboratePrompt(story, facts, art, outletB) {
    var lines = [
      'You compare how two news outlets cover the same story. OUTLET A (' + story.source + ') facts are numbered below. The ARTICLE from OUTLET B (' + outletB + ') follows.',
      '',
      'Step 1. "same_event": true only if ARTICLE B reports the same specific event or development as the facts. Same country or same topic is not enough.',
      'Step 2. For each numbered fact give a status:',
      '- "confirmed": B states the same thing in EVERY part: same numbers, same people, same actions, same attribution (if A says "X said", B must also report that X said it). Give "quote": an EXACT excerpt from B (at least 8 words).',
      '- "partial": B supports only part of the fact, or only its general topic. Use this whenever you cannot say "every part".',
      '- "conflict": ONLY if B explicitly states something incompatible about the SAME point (a different number for the same thing, a different attribution of the same statement, an opposite account of who did what). Give the exact "quote" from B and a "note" saying in one sentence what is incompatible.',
      '- "not_mentioned": B does not cover it, covers only a different part, a different time, a different ship, person or place, or is simply less complete. That is NOT a conflict. No quote. Do not infer.',
      'Step 3. "extra": up to 4 more important facts that B reports and the list lacks, each with "claim" and an EXACT "quote" from B (at least 8 words). Keep every qualifier and attribution.',
      '',
      'FACTS FROM OUTLET A'
    ];
    facts.forEach(function (f, i) { lines.push((i + 1) + '. ' + f.claim); });
    lines.push('', 'ARTICLE B (' + outletB + ')', '"""', String(art.text).slice(0, 5000), '"""', '',
      'Return STRICT JSON only: {"same_event":true,"checks":[{"fact":1,"status":"confirmed|partial|conflict|not_mentioned","quote":"...","note":"..."}],"extra":[{"claim":"...","quote":"..."}]}');
    return lines.join('\n');
  }
  function wordNumbers(text) {
    var out = [];
    (normText(text).match(/[a-z]+/g) || []).forEach(function (w) { if (NUM_WORDS[w] && out.indexOf(NUM_WORDS[w]) === -1) out.push(NUM_WORDS[w]); });
    return out;
  }
  function numDiff(claim, quote) {
    var need = numbersIn(claim).concat(wordNumbers(claim)).filter(function (n) { return !/^[1-5]$/.test(n); });
    var have = numbersIn(quote).concat(wordNumbers(quote));
    return {
      missing: need.filter(function (n) { return have.indexOf(n) === -1; }),
      others: have.filter(function (n) { return need.indexOf(n) === -1 && !/^[1-5]$/.test(n); })
    };
  }
  function applyCorroboration(factsA, j, artB, nameB, urlB) {
    var hay = alnum(artB.text);
    var res = { outlet: nameB, url: urlB, status: 'none', confirmed: 0, conflicts: [], possible: [], extra: 0, total: factsA.length, reason: '' };
    if (!j || j.same_event !== true) { res.reason = nameB + ' does not report the same event.'; return { facts: factsA, corr: res }; }
    var facts = factsA.map(function (f) { return { claim: f.claim, quote: f.quote, outlet: f.outlet, status: 'single', other: null }; });
    (Array.isArray(j.checks) ? j.checks : []).forEach(function (c) {
      var i = parseInt(c && c.fact, 10) - 1, f = facts[i];
      if (!f || !c) return;
      var qOk = !!c.quote && quoteInText(String(c.quote), hay);
      var st = String(c.status || '');
      var ct = sigTokens(f.claim), qt = sigTokens(c.quote || '');
      var overlap = ct.filter(function (w) { return qt.indexOf(w) !== -1; }).length;
      var minOv = Math.min(ct.length, qt.length);
      var overlapOk = overlap >= 3 || (overlap >= 2 && overlap >= Math.ceil(minOv * 0.4));
      if (st === 'confirmed' && qOk && !overlapOk) { LOG('corroboration match rejected (quote does not match the fact):', f.claim.slice(0, 70)); return; }
      if (st === 'conflict' && qOk && overlap < 1) { LOG('conflict rejected (quote unrelated to the fact):', f.claim.slice(0, 70)); return; }
      if (st === 'confirmed' && qOk) {
        var d = numDiff(f.claim, c.quote);
        if (d.missing.length && d.others.length) {
          f.status = 'conflict';
          f.other = { outlet: nameB, quote: String(c.quote).trim(), note: f.outlet + ' says ' + d.missing.join(', ') + ' where ' + nameB + ' says ' + d.others.join(', ') + '. Check which is right.' };
        } else if (d.missing.length) {
          LOG('corroboration not confirmed (number not in the quoted passage):', f.claim.slice(0, 70));
        } else {
          f.status = 'confirmed'; f.other = { outlet: nameB, quote: String(c.quote).trim() };
        }
      } else if (st === 'conflict' && c.note) {
        var d2 = qOk ? numDiff(f.claim, c.quote) : { missing: [], others: [] };
        if (d2.missing.length && d2.others.length) {
          f.status = 'conflict';
          f.other = { outlet: nameB, quote: String(c.quote).trim(), note: f.outlet + ' says ' + d2.missing.join(', ') + ' where ' + nameB + ' says ' + d2.others.join(', ') + '. Check which is right.' };
        } else {
          f.status = 'possible';
          f.other = { outlet: nameB, quote: qOk ? String(c.quote).trim() : '', note: String(c.note).slice(0, 240), quoteUnverified: !qOk };
        }
      }
    });
    facts.forEach(function (f) {
      if (f.status === 'confirmed') res.confirmed++;
      else if (f.status === 'conflict') res.conflicts.push({ claim: f.claim, outlet: f.outlet, other: f.other });
      else if (f.status === 'possible') res.possible.push({ claim: f.claim, outlet: f.outlet, other: f.other });
    });
    if (res.confirmed + res.conflicts.length === 0) { res.reason = nameB + ' covers a related story but none of the key facts match.'; return { facts: factsA, corr: res }; }
    fixOverreachClaims((Array.isArray(j.extra) ? j.extra : []).slice(0, 4).filter(function (x) {
      return x && x.claim && x.quote && quoteInText(String(x.quote), hay);
    }).map(function (x) { return { claim: String(x.claim).trim(), quote: String(x.quote).trim() }; })).forEach(function (x) {
      facts.push({ claim: x.claim, quote: x.quote, outlet: nameB, status: 'single', other: null });
      res.extra++;
    });
    res.status = res.conflicts.length ? 'conflict' : (res.confirmed >= 2 ? 'corroborated' : 'partial');
    return { facts: facts, corr: res };
  }
  function corroborate(src, factsA, setLabel) {
    var tried = {}, attempts = 0, unreadable = [], noMatch = [];
    function noneResult(reason) {
      return { facts: factsA, corr: { outlet: '', url: '', status: 'none', confirmed: 0, conflicts: [], possible: [], extra: 0, total: factsA.length, reason: reason }, art: null };
    }
    function endReason() {
      if (noMatch.length) return noMatch.join(' and ') + ' did not report the same key facts.' + (unreadable.length ? ' ' + unreadable.join(' and ') + ' could not be read.' : '');
      if (unreadable.length) return 'Other outlets covered it (' + unreadable.join(', ') + ') but their articles could not be read.';
      return 'No other open outlet covering this story was found in the last 3 days of feeds.';
    }
    function next(list) {
      if (!list.length || attempts >= 2) return Promise.resolve(noneResult(endReason()));
      var c = list.shift(); tried[c.link] = true;
      setLabel('Checking ' + c.author + '\'s coverage…');
      return fetchArticle(c.link).then(function (art) {
        if (!art || !art.text || String(art.text).length < 600) { LOG('second outlet not readable:', c.author, c.link); unreadable.push(c.author); return next(list); }
        attempts++;
        var nameB = c.author || art.host || 'second outlet';
        return sleep(700).then(function () { return callLLM(corroboratePrompt(src.story, factsA, art, nameB), 'write'); }).then(function (r) {
          var out = applyCorroboration(factsA, extractJson(r.text), art, nameB, cleanUrl(art.finalUrl || c.link));
          LOG('corroboration with ' + nameB + ': ' + out.corr.status + ' · confirmed ' + out.corr.confirmed + '/' + out.corr.total + ' · conflicts ' + out.corr.conflicts.length + ' · extra ' + out.corr.extra);
          if (out.corr.status === 'none') { noMatch.push(nameB); return next(list); }
          out.art = art; return out;
        }).catch(function (e) {
          if (e.fatal || e.code === 'QUOTA') throw e;
          LOG('corroboration compare failed:', e.message);
          return next(list);
        });
      });
    }
    setLabel('Looking for a second outlet…');
    return corroborationCandidates(src, tried).then(function (list) {
      LOG('second-outlet candidates: ' + (list.length ? list.map(function (c) { return c.author; }).join(', ') : 'none'));
      return next(list);
    });
  }

  function writePrompt(story, profile, facts, feedback, corr) {
    var topics = profile.topics.map(function (t) { return t.name; }).join(', ');
    var f = profile.format;
    var two = corr && (corr.status === 'corroborated' || corr.status === 'partial' || corr.status === 'conflict');
    var nameA = story.source, nameB = two ? corr.outlet : '';
    var depth = state.settings.depth !== false;
    var anaMax = Math.max(40, Math.min(70, Math.round(f.wordCountMax * 0.26)));
    var bodyMax = Math.max(90, f.wordCountMax - 16 - (depth ? anaMax : 0) - 22);
    var lines = [
      'You write explain-and-analyse YouTube Shorts for a faceless channel. By the end the viewer should understand what happened, the background that makes it make sense, who says what, and what is still open. It is not a news brief.',
      '',
      'CHANNEL',
      '- Positioning: ' + (profile.identity.positioning || profile.identity.oneLiner || profile.name),
      '- Topics: ' + topics,
      '- Tone: ' + profile.tone.style + ', ' + profile.tone.energy,
      '- Avoid: ' + (profile.tone.avoid || []).join(', '),
      '- Length: aim for ' + f.wordCountMin + '-' + f.wordCountMax + ' words across hook + body' + (depth ? ' + analysis' : '') + ' + cta (about ' + f.targetDurationSec + ' seconds). The middle of that range is the target. Coming in under it is fine; going over the maximum is a failure and the script will be sent back. Budget: hook 8-16 words, body up to ' + bodyMax + ' words' + (depth ? ', analysis up to ' + anaMax + ' words' : '') + ', cta 10-22 words. Use only what the facts support: never add unrelated events or filler to reach a length, and cut the least important body sentences rather than going over.',
      '',
      'STORY: ' + story.title,
      'Primary source: ' + nameA + (story.publishedAt ? ' (' + String(story.publishedAt).slice(0, 10) + ')' : '') + (two ? '. Second outlet: ' + nameB + '.' : '. Single source: no second outlet could be checked.'),
      ''
    ];
    function list(title, arr) {
      if (!arr.length) return;
      lines.push(title);
      arr.forEach(function (x) {
        var extra = '';
        if (x.status === 'conflict' && x.other) extra = ' || ' + nameB + ' DIFFERS: ' + (x.other.note || x.other.quote);
        if (x.status === 'possible' && x.other && x.other.quote) extra = ' || ' + nameB + ' SAYS: ' + x.other.quote;
        lines.push('- ' + x.claim + extra);
      });
      lines.push('');
    }
    if (two) {
      lines.push('VERIFIED FACTS (the ONLY facts you may state as fact):', '');
      list('CONFIRMED BY BOTH OUTLETS (' + nameA + ' and ' + nameB + ' report the same thing):', facts.filter(function (x) { return x.status === 'confirmed'; }));
      list('ONLY ' + nameA + ' REPORTS (attribute to ' + nameA + '):', facts.filter(function (x) { return x.status === 'single' && x.outlet === nameA; }));
      list('ONLY ' + nameB + ' REPORTS (attribute to ' + nameB + '):', facts.filter(function (x) { return x.status === 'single' && x.outlet !== nameA; }));
      list('OUTLETS DIFFER (give both versions with outlet names, or leave out):', facts.filter(function (x) { return x.status === 'conflict'; }));
      list('POSSIBLE DIFFERENCE (the comparison is unsure the outlets disagree; state each outlet\'s version separately with its name):', facts.filter(function (x) { return x.status === 'possible'; }));
    } else {
      lines.push('VERIFIED FACTS from ' + nameA + ' (the ONLY facts you may state as fact):');
      facts.forEach(function (x, i) { lines.push((i + 1) + '. ' + x.claim); });
      lines.push('');
    }
    lines = lines.concat([
      'STRUCTURE (spoken order)',
      '1. HOOK (under 16 words): the most consequential specific fact' + (two ? ', preferably one both outlets confirm' : '') + '. Keep its hedges ("thought to be", "reportedly", "at least").',
      '2. WHAT HAPPENED: 3-4 sentences built only from the facts.',
      '3. BACKGROUND: 2-3 sentences of context the facts supply (earlier events, who the parties are, how the process works). Optional: ONE plain-language definition of a general concept named in the facts, only if it matches how THIS story uses the term. Put no numbers, names, dates or event claims in the definition.',
      '4. WHO SAYS WHAT: when the story rests on claims by governments, militaries, officials or parties to a conflict' + (two ? ', or when the outlets differ' : '') + ', spend 1-2 sentences saying who claims what (name them; "an unnamed US official" stays unnamed). Skip if nothing is contested.',
      '5. WHY IT MATTERS: 2-3 sentences, only causes and consequences that the facts themselves state.',
      '6. WHAT TO WATCH: 1-2 sentences of open questions or "if X, then Y" possibilities. No forecasts (no "will", no "likely"). Do not attribute views to analysts or experts: write "Worth watching:" or "The open question:".'
    ]);
    if (depth) {
      lines.push('7. ANALYSIS (field "analysis", 2-4 sentences, up to ' + anaMax + ' words, spoken after the body and before the CTA): the channel\'s read on THIS specific story. This is what the article cannot say for itself.');
      lines.push('   What belongs here: read between the lines. Name what is telling about the specifics of this story — the timing of a move, the choice of a target or moment, who is speaking and who is not, what a number or a phrase implies about strategy. Interpret the actors: "X appears to be betting that…", "the choice of timing suggests…", "the move looks aimed less at A than at B". End on the open question: "whether this works depends on…", "the test is whether…". Take a position; an analysis with no point of view is filler.');
      lines.push('   Rules: no digits, years, statistics or quotes; no names of people, organisations, places or operations that are not in the facts; no forecasts ("will", "likely"); no claim about a named actor\'s intent as fact (always frame it: "appears to be", "looks aimed at", "reads less like"); no textbook definitions or general mechanisms that could fit any story (for example "cutting power in winter affects civilians" or "disrupting sea lanes raises prices"); every sentence must depend on a specific that is in THIS story. If the same paragraph would fit another story on the same topic, rewrite it. If nothing specific and safe can be added, return an empty string.');
      lines.push('   Good (for a story about Tehran sharing US inflation headlines): "The interesting move is that Tehran is pitching to American voters through US inflation headlines rather than through diplomacy. That reads less like a military message than a bet that economic pain will split American opinion more than the war unites it."');
      lines.push('   Bad (reject this style): "Disrupting major sea lanes cuts global fuel supplies, forcing central banks to choose between raising borrowing costs to fight inflation or lowering them to encourage economic activity." — this explains a general mechanism, not this story.');
      if (!two) lines.push('   Because this story rests on a single outlet, include one sentence on what that sourcing means: who is saying it, and what the facts do not independently confirm.');
    } else {
      lines.push('7. (no analysis section)');
    }
    lines.push('8. CTA: one specific question that invites viewers to take a side.');
    lines.push('');
    lines.push('HARD RULES');
    lines.push('- Every number, date, name and place must come from the facts above. Never add outside facts, quotes or statistics.');
    lines.push('- Keep every qualifier and baseline from the facts (up to, around, almost, more than, at least, reportedly, could, "since ...", "in September"). Never round a number up, drop "up to", or drop the baseline that makes a percentage meaningful.');
    lines.push('- Use the exact names, titles and spellings from the facts. If the facts name a person, never replace that name with another from your own knowledge.');
    lines.push('- Keep attribution. If a fact is something a person, an unnamed official or a party said, say who. Never merge two people\'s statements into one. Never present the source\'s own inference as a named person\'s statement.');
    lines.push('- No intensifiers or absolutes (effectively, essentially, solely, crippled, collapse, inevitable, permanent) unless a fact uses that word.');
    lines.push('- Do not state a cause the facts do not state. Do not link two facts with "because", "due to", "leading to", "prompting", "triggering" or "as a result" unless a fact does.');
    lines.push('- In hook and body, do not describe places, organisations or people from general knowledge (no "X is a vital sea passage"). General knowledge belongs only in the analysis field' + (depth ? ' and follows its own rules.' : ' and is switched off, so leave it out.'));
    lines.push('- Never turn a figure into a vague phrase: "around 80% of pre-war levels" is not "near pre-war levels". Give the number with its qualifier and baseline, or leave it out.');
    if (two) {
      lines.push('- Say "both ' + nameA + ' and ' + nameB + ' report" only about facts in the CONFIRMED list. That means both outlets report it, not that it is proven: never say "verified" or "proven".');
      lines.push('- Facts in an ONLY list must be attributed to that outlet by name. Never write "both", "outlets agree" or "confirmed" about anything outside the CONFIRMED list.');
      lines.push('- If the outlets differ, say so plainly and name each outlet\'s version, or leave the point out.');
      lines.push('- For POSSIBLE DIFFERENCE facts, state each outlet\'s version separately with its name. Never write that the outlets disagree or differ about them.');
    } else {
      lines.push('- Say "according to ' + nameA + '" at least once, and again for any disputed or claimed point. This is one outlet\'s account: say that in the script ("' + nameA + ' reports"), do not write as if it were settled from several sources.');
    }
    lines.push('- Use only facts that bear on the story\'s main event. Leave out unrelated facts even if they are in the list, and never join unrelated events with "amid", "meanwhile" or "as".');
    lines.push('- No "in this video", no "welcome back", no clickbait, no doom language.');
    if (feedback && feedback.length) {
      lines.push('');
      lines.push('PREVIOUS DRAFT PROBLEMS. Fix them in this version:');
      feedback.forEach(function (p) { lines.push('- ' + p); });
      lines.push('- Remove or rephrase anything not supported by the facts.');
    }
    lines.push('');
    lines.push('Return STRICT JSON only:');
    lines.push('{"hook":"...","body":"WHAT HAPPENED + BACKGROUND + WHO SAYS WHAT + WHY IT MATTERS + WHAT TO WATCH as one flowing narration","analysis":"' + (depth ? '2-4 sentences reading between the lines of this specific story, or empty string' : '') + '","cta":"...","title":"under 70 characters","description":"2-3 lines summarising the story","tags":["5-8 tags"]}');
    return lines.join('\n');
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
  var HEALTH_KEY = 'asg_model_health';
  var health = (function () {
    var out = {};
    try { var o = JSON.parse(localStorage.getItem(HEALTH_KEY) || '{}'), now = Date.now(); Object.keys(o).forEach(function (k) { if (o[k] && o[k].u > now) out[k] = o[k]; }); } catch (e) {}
    return out;
  })();
  function saveHealth() { try { localStorage.setItem(HEALTH_KEY, JSON.stringify(health)); } catch (e) {} }
  function inBackoff(ck) { return !!(health[ck] && health[ck].u > Date.now()); }
  function markBad(ck, ms) {
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
          if (st === 404) markGone('gemini:' + m);
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
      [override, preferred].concat(found).forEach(function (m) { if (m && models.indexOf(m) === -1) models.push(m); });
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
    openrouter: { endpoint: 'https://openrouter.ai/api/v1/chat/completions', keyField: 'openrouterKey', modelField: 'openrouterModel', writeField: 'openrouterWriteModel' }
  };
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
        discovered.gemini = ft.slice(0, 3).concat(lt.slice(0, 2), bt.slice(0, 1), ft.slice(3), lt.slice(2), bt.slice(1)).slice(0, 8).map(function (x) { return x.id; });
        LOG('gemini models available right now (best first):', discovered.gemini.join(', ') || '(none found)');
        return discovered.gemini;
      }, function (e) { if (e && e.fatal) throw e; LOG('gemini model list unavailable:', e && e.message); return []; })
      .catch(function (e) { if (e && e.fatal) throw e; LOG('gemini model list unavailable:', e && e.message); return []; });
  }
  var LIST_URL = { groq: 'https://api.groq.com/openai/v1/models', openrouter: 'https://openrouter.ai/api/v1/models', openai: 'https://api.openai.com/v1/models', deepseek: 'https://api.deepseek.com/models' };
  function discoverModels(provider, key) {
    if (discovered[provider]) return Promise.resolve(discovered[provider]);
    return fetchWithTimeout(LIST_URL[provider], { headers: { 'Authorization': 'Bearer ' + key } }, 15000)
      .then(listOk)
      .then(function (j) {
        var list = (j && j.data || []).filter(function (m) {
          if (!m || !m.id || m.active === false || NON_CHAT.test(m.id)) return false;
          if (provider === 'openrouter') {
            var pr = m.pricing || {};
            return String(pr.prompt) === '0' && String(pr.completion) === '0' && (m.context_length || 0) >= 16000 && m.id.indexOf('openrouter/') !== 0;
          }
          if (provider === 'openai') return /^(gpt|chatgpt|o\d)/i.test(m.id) && !/instruct|codex|pro$/i.test(m.id);
          return m.context_window === undefined || (m.context_window || 0) >= 16000;
        }).map(function (m) {
          var l = m.id.toLowerCase();
          var tier = provider === 'openai' ? (/mini|nano/.test(l) ? 0 : 1) : (/reason|think|r1/.test(l) ? 1 : 0);
          return { id: m.id, tier: tier, size: sizeOf(l) || 30, ver: versionOf(l), ctx: m.context_window || m.context_length || 0 };
        });
        list.sort(function (a, b) { return a.tier - b.tier || b.size - a.size || b.ver - a.ver || b.ctx - a.ctx || (a.id < b.id ? -1 : 1); });
        discovered[provider] = list.slice(0, 6).map(function (x) { return x.id; });
        LOG(provider + ' models available right now (best first):', discovered[provider].join(', ') || '(none found)');
        return discovered[provider];
      }).catch(function (e) { if (e && e.fatal) throw e; LOG(provider + ' model list unavailable:', e && e.message); return []; });
  }
  function compatSend(provider, key, body) {
    var cfg = COMPAT[provider], ep = (window.AUTONOM_ASG || {}).llmEndpoint;
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
    if (provider === 'openrouter') headers['X-Title'] = 'Autonom AI Shorts Generator';
    return fetchWithTimeout(cfg.endpoint, { method: 'POST', headers: headers, body: JSON.stringify(body) }, 90000).then(function (r) {
      return r.text().then(function (t) { return { status: r.status, text: t }; });
    }, function (e) {
      if (!ep) throw e;
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

  function callCompat(provider, key, prompt, kind) {
    var cfg = COMPAT[provider], st = state.settings;
    var explicit = String((kind === 'write' && st[cfg.writeField]) || st[cfg.modelField] || '').trim();
    var est = estTokens(prompt) + 1200;
    return discoverModels(provider, key).then(function (found) {
      // Capability-first: always start from the top of the quality-ranked list.
      // The cooldown maps skip models that just failed, so the best available
      // model is tried first on every call. When a cooldown lifts, the best
      // model returns to the front automatically.
      var ordered = found.slice();
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
    var f = { gemini: 'geminiKey', openai: 'openaiKey', deepseek: 'deepseekKey', groq: 'groqKey', openrouter: 'openrouterKey' }[p];
    return f ? String(state.settings[f] || '').trim() : '';
  }
  function callOne(provider, prompt, kind, o) {
    var key = keyFor(provider);
    if (provider === 'gemini') return callGemini(prompt, kind === 'write' ? String(state.settings.geminiWriteModel || '').trim() : '', o);
    if (COMPAT[provider]) return callCompat(provider, key, prompt, kind);
    return callOpenAICompat(provider, key, prompt);
  }
  function callLLM(prompt, kind, opts) {
    var primary = state.settings.llmProvider;
    if (primary === 'none') return Promise.reject(Object.assign(new Error('LLM provider is set to None.'), { fatal: true }));
    if (!keyFor(primary)) return Promise.reject(Object.assign(new Error('No API key for ' + primary + '. Open Settings.'), { fatal: true }));
    state.counters.llmCalls++; updateCounters();
    var order = [primary];
    if (state.settings.fallbackProviders !== false && !(opts && opts.noFallback)) {
      ['gemini', 'groq', 'openrouter', 'openai', 'deepseek'].forEach(function (p) { if (p !== primary && keyFor(p)) order.push(p); });
    }
    // Provider-level stickiness: whichever provider answered most recently goes first (unless in cooldown).
    // This spreads load across providers on free tiers; it does NOT prefer the cheap model within a provider.
    if (lastGoodProvider && order.indexOf(lastGoodProvider) > 0 && !(providerDown[lastGoodProvider] > Date.now())) {
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
      return callOne(p, prompt, kind, { quick: i < order.length - 1 }).then(function (r) {
        if (!(opts && opts.noSticky)) lastGoodProvider = p;
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

  function buildLocalScript(story, profile, ctx) {
    ctx = ctx || {};
    var topicName = (profile.topics[0] && profile.topics[0].name) || 'the region';
    var otherTopic = (profile.topics[1] && profile.topics[1].name) || 'analysts';
    var signals = (profile.topics[0] && profile.topics[0].signals) || ['this'];
    var basis = (ctx.article && ctx.article.text) || story.summary || '';
    var sentences = String(basis).split(/[.!?]\s/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 20; });
    var first = (sentences[0] || story.title).replace(/[.!?]+$/, '');
    return {
      hook: 'Breaking: ' + story.title.slice(0, 60),
      body: ['Here is the tactical read for ' + topicName + '.', 'First: ' + first + '.', 'Second: watch how ' + signals[0] + ' shifts over the next 48 hours.', 'Third: this is the kind of signal that reshapes ' + otherTopic + ' positioning in the short term.'].join(' '),
      cta: 'What is your read on this? Drop it in the comments.',
      title: story.title.slice(0, 70),
      description: String(story.summary || story.title).slice(0, 200) + '\n\nSource: ' + story.source + '\n' + story.url,
      tags: signals.slice(0, 6), sources: [story.url]
    };
  }

  function goodScripts() { return state.scripts.filter(function (s) { return !s.gated; }); }
  var generating = false;
  function renderGenerateStatus() {
    var box = $('#asg-generate-summary'); if (!box) return;
    box.innerHTML = '';
    var sel = state.stories.filter(function (x) { return state.selectedStoryIds[x.id]; });
    var provider = state.settings.llmProvider;
    var llmReady = provider !== 'none' && !!keyFor(provider);
    var wrap = el('div', { class: 'asg-hint', style: 'margin:0 0 14px;padding:12px;background:#f4f6fa;border:1px solid #dfe4ee;border-radius:8px;color:#1f2a44;' });
    wrap.appendChild(el('strong', { text: sel.length + (sel.length === 1 ? ' story selected' : ' stories selected') }));
    var ul = el('ul', { style: 'margin:8px 0 8px 18px;padding:0;' });
    sel.forEach(function (x) { ul.appendChild(el('li', { text: x.title + ' (' + x.source + ')' })); });
    wrap.appendChild(ul);
    var ai = el('div', { style: 'margin-top:4px;' });
    if (llmReady) {
      var others = ['gemini', 'groq', 'openrouter', 'openai', 'deepseek'].filter(function (p) { return p !== provider && keyFor(p); });
      ai.textContent = 'AI: ' + provider + (others.length && state.settings.fallbackProviders !== false ? ' (backup: ' + others.join(', ') + ')' : '') + '. Generating takes a minute or two per story on free plans.';
    } else {
      ai.style.color = '#8a5b00';
      ai.textContent = provider === 'none' ? 'No AI provider is selected, so only template scripts can be made. Open Settings.' : 'No API key is saved for ' + provider + '. Open Settings, paste the key and click Save settings (the Test button alone does not save it). Without a key only template scripts are made.';
    }
    wrap.appendChild(ai);
    if (state.scripts.length && sel.length) {
      var selIds = sel.map(function (x) { return x.id; });
      var willBeReplaced = state.scripts.filter(function (s) { return selIds.indexOf(s.storyId) !== -1; }).length;
      var willBeKept = state.scripts.length - willBeReplaced;
      var parts = [];
      if (willBeKept) parts.push(willBeKept + ' existing script' + (willBeKept === 1 ? '' : 's') + ' will be kept');
      if (willBeReplaced) parts.push(willBeReplaced + ' will be replaced by this run');
      var prev = el('div', { style: 'margin-top:8px;' + (willBeReplaced ? 'color:#8a1f1f;' : 'color:#17633a;') });
      prev.textContent = parts.join('. ') + '. ';
      var go = el('a', { href: '#', text: 'Go back to those scripts instead' });
      go.addEventListener('click', function (e) { e.preventDefault(); renderScripts(); setStep('scripts'); });
      prev.appendChild(go);
      wrap.appendChild(prev);
    }
    box.appendChild(wrap);
    var btn = $('#asg-generate-btn');
    if (btn) {
      btn.disabled = generating;
      btn.textContent = generating ? 'Generating…' : (state.scripts.length && sel.length ? 'Generate scripts (keep the rest)' : 'Generate scripts');
    }
  }
  function scriptFromParsed(parsed, story, meta) {
    meta = meta || {};
    return {
      id: 'sc_' + Math.random().toString(36).slice(2, 10),
      storyId: story.id, storyTitle: story.title, source: story.source, url: story.url,
      hook: str(parsed.hook), body: str(parsed.body), analysis: str(parsed.analysis), cta: str(parsed.cta),
      title: str(parsed.title) || story.title.slice(0, 70),
      description: str(parsed.description),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(function (t) { return String(t).replace(/^#+/, '').replace(/[^A-Za-z0-9_]/g, ''); }).filter(Boolean) : [],
      sources: Array.isArray(parsed.sources) && parsed.sources.length ? parsed.sources : [story.url],
      isTemplate: !!meta.template, reason: meta.reason || '',
      model: meta.model || '', provider: meta.provider || '', contextLevel: meta.level || 'headline',
      createdAt: new Date().toISOString()
    };
  }
  function gatedScript(story, reason, retryable) {
    return {
      id: 'sc_' + Math.random().toString(36).slice(2, 10),
      gated: true, retryable: !!retryable, storyId: story.id, storyTitle: story.title, source: story.source, url: story.url,
      reason: reason, createdAt: new Date().toISOString()
    };
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
      return alt ? attempt(alt, 'alternative') : null;
    });
  }
  function sourceMeta(src) {
    return { sourceName: src.story.source, sourceUrl: cleanUrl(src.story.url), via: src.via, sources: [cleanUrl(src.story.url)] };
  }
  function outletAllow(corr) {
    var words = [];
    if (corr && corr.outlet) normText(corr.outlet).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).forEach(function (w) { if (w) words.push(w); });
    return words;
  }
  function sanitizeAnalysis(parsed, articleText, allow, facts) {
    var a = str(parsed.analysis).replace(/\s+/g, ' ').trim();
    if (!a) return 0;
    var parts = splitSentences(a);
    var keep = parts.filter(function (x) {
      var low = normText(x);
      return !/\d/.test(x) && !repeatsFact(x, facts) && !unsupportedTerms(x, articleText, allow).length && !/\b(always|never|everyone|nobody|guaranteed)\b/.test(low) && !forecastIssues(x, '').length;
    });
    parsed.analysis = keep.join(' ').trim();
    return parts.length - keep.length;
  }
  function claimCheckPrompt(facts) {
    var lines = [
      'You check extracted facts. For each numbered fact, compare the CLAIM with its QUOTE. The QUOTE is the ground truth.',
      'Mark a fact BAD if the claim: changes who, what, when, where or how many; swaps a word for one with a different meaning (for example "visit" became "test"); adds an event, a cause, a place or a detail that is not in the quote; credits a statement to a person the quote does not name; or says more strongly than the quote does.',
      'A claim that only rephrases the quote, or leaves detail out, is fine.',
      ''
    ];
    facts.forEach(function (f, i) { lines.push((i + 1) + '. CLAIM: ' + f.claim + '\n   QUOTE: "' + f.quote + '"'); });
    lines.push('', 'Return STRICT JSON only: {"bad":[{"fact":3,"problem":"short reason"}]}. Use {"bad":[]} if every claim matches its quote.');
    return lines.join('\n');
  }
  function quoteAsClaim(q) {
    var t = String(q || '').replace(/^["“”\s]+|["“”\s]+$/g, '').trim();
    if (!/^[A-Z0-9]/.test(t) || (t.match(/["“”]/g) || []).length % 2 === 1 || t.split(/\s+/).length < 4) return '';
    return t;
  }
  // Share of the claim's content words (by 5-letter stem) that also appear in its quote. A paraphrase that adds
  // new content scores low and goes to the LLM claim check, even when numbers and qualifiers look fine.
  function claimOverlap(claim, quote) {
    var stop = /^(that|this|with|from|have|were|their|which|about|after|into|been|will|would|could|also|over|more|than|said|says)$/;
    var words = String(claim || '').toLowerCase().match(/[a-z\u00c0-\u024f]{4,}/g) || [];
    words = words.filter(function (w) { return !stop.test(w); });
    if (!words.length) return 1;
    var q = {}; (String(quote || '').toLowerCase().match(/[a-z\u00c0-\u024f]{4,}/g) || []).forEach(function (w) { q[w.slice(0, 5)] = 1; });
    var hit = words.filter(function (w) { return q[w.slice(0, 5)]; }).length;
    return hit / words.length;
  }
  function verifyClaims(facts) {
    if (!facts.length) return Promise.resolve(facts);
    var suspect = facts.filter(function (f) {
      if (claimStronger(f.claim, f.quote)) return true;
      var d = numDiff(f.claim, f.quote);
      if (d.missing.length || d.others.length) return true;
      return claimOverlap(f.claim, f.quote) < 0.6;
    });
    if (!suspect.length) {
      LOG('claim check skipped (code checks found nothing suspicious in ' + facts.length + ' facts)');
      return Promise.resolve(facts);
    }
    LOG('claim check: ' + suspect.length + ' of ' + facts.length + ' facts need an LLM look');
    return callLLM(claimCheckPrompt(suspect), 'write').then(function (res) {
      var j = extractJson(res.text), bad = {};
      (Array.isArray(j.bad) ? j.bad : []).forEach(function (b) { var n = parseInt(b && b.fact, 10); if (n >= 1 && n <= suspect.length) bad[n - 1] = String(b.problem || ''); });
      var out = facts.slice();
      var si = 0;
      suspect.forEach(function (f) {
        var pi = si++;
        if (!(pi in bad)) return;
        var oi = out.indexOf(f);
        if (oi < 0) return;
        var qc = quoteAsClaim(f.quote);
        LOG('claim does not match its quote (' + bad[pi] + '): ' + (qc ? 'using the quote' : 'dropped') + ' — ' + f.claim.slice(0, 80));
        if (qc) { var o = {}; for (var k in f) o[k] = f[k]; o.claim = qc; o.claimReplaced = true; out[oi] = o; }
        else { out.splice(oi, 1); }
      });
      return out;
    }).catch(function (e) {
      LOG('claim check skipped:', e.message);
      return facts;
    });
  }
  function stem5(w) { return w.slice(0, 5); }
  function repeatsFact(sentence, facts) {
    var toks = {}, n = 0;
    String(sentence).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).forEach(function (w) { if (w.length >= 5 && !toks[stem5(w)]) { toks[stem5(w)] = true; n++; } });
    if (n < 4) return false;
    return (facts || []).some(function (f) {
      var hay = {}; String(f.claim).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).forEach(function (w) { if (w.length >= 5) hay[stem5(w)] = true; });
      var hit = 0; Object.keys(toks).forEach(function (t) { if (hay[t]) hit++; });
      return hit / n >= 0.6;
    });
  }
  function checkScript(parsed, articleText, used, extraAllow, facts) {
    var main = [parsed.hook, parsed.body, parsed.analysis, parsed.cta].map(str).join('\n');
    var factual = [parsed.hook, parsed.body, parsed.cta].map(str).join('\n');
    var ana = str(parsed.analysis);
    var all = main + '\n' + str(parsed.title) + '\n' + str(parsed.description);
    var badNums = unsupportedNumbers(all, articleText);
    var allowTerms = allowWordsFor(used, state.profile).concat(extraAllow || []);
    var badTerms = unsupportedTerms(main, articleText, allowTerms);
    var wording = wordingIssues(factual, all, articleText);
    var problems = [];
    if (ana) {
      var dig = ana.match(/\d[\d,.]*/g);
      if (dig) { dig.forEach(function (d) { if (badNums.indexOf(d) === -1) badNums.push(d); }); }
      var rp = splitSentences(ana).filter(function (x) { return repeatsFact(x, facts); });
      if (rp.length) problems.push('The analysis repeats facts already in the script ("' + rp[0].slice(0, 70) + '…"). Write something the facts do not say (a specific reading of THIS story), or return an empty string.');
      var f2 = forecastIssues(ana, '');
      if (f2.length) wording.push('forecast in the analysis: ' + f2.join(', '));
      var ab = normText(ana).match(/\b(always|never|everyone|nobody|guaranteed)\b/);
      if (ab) wording.push('absolute in the analysis: "' + ab[1] + '"');
    }
    if (badNums.length) problems.push('These numbers do not appear in the source: ' + badNums.join(', '));
    if (badTerms.length) problems.push('These names or terms do not appear in the source: ' + badTerms.join(', '));
    wording.forEach(function (w) { problems.push('Wording: ' + w); });
    var words = wordCount(main), max = (state.profile.format && state.profile.format.wordCountMax) || Math.round(LEN.defaultSec * LEN.wps * 1.1);
    var lengthProblem = words > max + 12 ? 'The script is ' + words + ' words. The maximum is ' + max + ' (about ' + Math.round(max / LEN.wps) + ' seconds). Cut the least important sentences.' : '';
    return { badNums: badNums, badTerms: badTerms, wording: wording, problems: problems, words: words, lengthProblem: lengthProblem };
  }
  function majorCount(flags) { return (flags || []).filter(function (f) { return f.severity !== 'minor'; }).length; }
  function patchScript(parsed, flags) {
    var out = {}; for (var k in parsed) out[k] = parsed[k];
    var map = { H: 'hook', B: 'body', C: 'cta', D: 'description' }, n = 0;
    Object.keys(map).forEach(function (pre) {
      var fl = flags.filter(function (f) { return f.id.charAt(0) === pre && f.severity !== 'minor' && f.fix; });
      if (!fl.length) return;
      var sents = splitSentences(parsed[map[pre]]);
      fl.forEach(function (f) { var i = parseInt(f.id.slice(1), 10) - 1; if (sents[i] !== undefined && sents[i] === f.sentence) { sents[i] = f.fix.trim(); n++; } });
      out[map[pre]] = sents.join(' ');
    });
    return { parsed: out, n: n };
  }
  function auditScript(parsed, facts, used, corr) {
    var sentences = scriptSentences(parsed);
    return callLLM(auditPrompt(used, facts, sentences, corr), 'write').then(function (res) {
      var j = extractJson(res.text);
      var flags = (Array.isArray(j.flags) ? j.flags : []).map(function (f) {
        var s = f && sentences.filter(function (x) { return x.id === String(f.id); })[0];
        var same = s && String(f.fix || '').replace(/[^a-z0-9]/gi, '').toLowerCase() === s.text.replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (same) return null;
        if (!(s && f.problem)) return null;
        var type = String(f.type || 'issue');
        var sev = String(f.severity || 'major').toLowerCase() === 'minor' ? 'minor' : 'major';
        if (/(^|\|)(causal|unsupported|outlets|analysis|overstated)(\||$)/i.test(type)) sev = 'major';
        return { id: s.id, type: type, severity: sev, sentence: s.text, problem: String(f.problem), fix: String(f.fix || '') };
      }).filter(Boolean);
      return { ran: true, flags: flags };
    }).catch(function (e) {
      LOG('audit failed:', e.message);
      return { ran: false, flags: [], error: e.message };
    });
  }
  function writeAndCheck(story, src, verified, extractedCount, feedback, attempt, setLabel) {
    var corr = verified.corr || { status: 'none', conflicts: [] };
    setLabel('Writing script' + (attempt ? ' (revision)' : '') + '…');
    return callLLM(writePrompt(src.story, state.profile, verified.ok, feedback, corr), 'write').then(function (res) {
      var parsed = extractJson(res.text);
      var dropped = 0;
      if (state.settings.depth === false) parsed.analysis = '';
      else if (attempt >= 1) dropped += sanitizeAnalysis(parsed, src.allText || src.art.text, allowWordsFor(src.story, state.profile).concat(outletAllow(corr)), verified.ok);
      if (attempt >= 1 && parsed.analysis) {
        var capW = (state.profile.format && state.profile.format.wordCountMax) || Math.round(LEN.defaultSec * LEN.wps * 1.1);
        var asents = splitSentences(parsed.analysis);
        while (asents.length > 1 && wordCount([parsed.hook, parsed.body, asents.join(' '), parsed.cta].map(str).join(' ')) > capW + 12) { asents.pop(); dropped++; }
        parsed.analysis = asents.join(' ');
      }
      var det = checkScript(parsed, src.allText || src.art.text, src.story, outletAllow(corr), verified.ok);
      var revise = det.problems.concat(det.lengthProblem ? [det.lengthProblem] : []);
      if (revise.length && attempt < 1) {
        LOG('code checks failed, revising:', revise.join(' | '));
        return writeAndCheck(story, src, verified, extractedCount, revise, attempt + 1, setLabel);
      }
      setLabel('Auditing every sentence against the source…');
      return sleep(700).then(function () { return auditScript(parsed, verified.ok, src.story, corr); }).then(function (audit) {
        if (audit.flags.length && attempt < 1) {
          var fb = revise.concat(audit.flags.map(function (f) {
            return f.id + ' "' + f.sentence + '" (' + f.type + '): ' + f.problem + (f.fix ? ' Suggested: ' + f.fix : '');
          }));
          LOG('audit flagged ' + audit.flags.length + ' sentence(s), revising');
          return writeAndCheck(story, src, verified, extractedCount, fb, attempt + 1, setLabel);
        }
        var fixedN = 0;
        function finalize(audit) {
          var aFlags = audit.flags.filter(function (f) { return f.id.charAt(0) === 'I'; });
          if (aFlags.length) {
            var bad = {}; aFlags.forEach(function (f) { bad[f.sentence] = true; });
            parsed.analysis = splitSentences(parsed.analysis).filter(function (x) { return !bad[x]; }).join(' ').trim();
            dropped += aFlags.length;
            audit.flags = audit.flags.filter(function (f) { return f.id.charAt(0) !== 'I'; });
          }
          var url = cleanUrl(src.story.url);
          var sc = scriptFromParsed(parsed, src.story, { model: res.model, provider: res.provider, level: 'article' });
          sc.storyId = story.id; sc.storyTitle = story.title;
          var desc = str(parsed.description).trim();
          sc.description = (desc ? desc + '\n\n' : '') + 'Source: ' + src.story.source + ' — ' + url;
          if (corr.url && corr.status !== 'none') sc.description += '\nSecond source: ' + corr.outlet + ' — ' + corr.url;
          sc.analysis = str(parsed.analysis).trim();
          sc.analysisDropped = dropped;
          sc.facts = verified.ok;
          sc.corroboration = { status: corr.status, outlet: corr.outlet || '', url: corr.url || '', confirmed: corr.confirmed || 0, total: corr.total || 0, extra: corr.extra || 0, conflicts: corr.conflicts || [], possible: corr.possible || [], reason: corr.reason || '' };
          sc.checks = {
            factsVerified: verified.ok.length, factsExtracted: extractedCount,
            badNums: det.badNums, badTerms: det.badTerms, wording: det.wording,
            auditRan: audit.ran, auditFlags: audit.flags, auditError: audit.error || '',
            words: wordCount([parsed.hook, parsed.body, parsed.analysis, parsed.cta].map(str).join(' ')), lengthOver: !!det.lengthProblem, analysisDropped: dropped,
            autoFixed: fixedN,
            status: (!det.problems.length && !det.lengthProblem && audit.ran && !majorCount(audit.flags) && corr.status !== 'conflict' && !(corr.possible && corr.possible.length)) ? 'checked' : 'review',
            revised: attempt > 0
          };
          Object.assign(sc, sourceMeta(src));
          if (corr.url && corr.status !== 'none') sc.sources.push(corr.url);
          return sc;
        }
        var fixable = audit.ran && attempt >= 1 && audit.flags.some(function (f) { return f.severity !== 'minor' && f.id.charAt(0) !== 'I' && f.fix; });
        if (fixable) {
          var pt = patchScript(parsed, audit.flags);
          if (pt.n === 1) {
            // No second LLM audit, but the code checks (numbers, names, wording, length) still run on the patched text.
            var det1 = checkScript(pt.parsed, src.allText || src.art.text, src.story, outletAllow(corr), verified.ok);
            if (det1.problems.length <= det.problems.length && !(det1.lengthProblem && !det.lengthProblem)) {
              LOG('applied 1 audit correction (code checks re-run, no second audit)');
              parsed = pt.parsed; det = det1; fixedN = 1;
            } else { LOG('audit correction rejected: it introduced new code-check problems'); }
            return finalize(audit);
          }
          if (pt.n > 1) {
            setLabel('Applying the audit corrections and re-checking…');
            var det2 = checkScript(pt.parsed, src.allText || src.art.text, src.story, outletAllow(corr), verified.ok);
            return sleep(700).then(function () { return auditScript(pt.parsed, verified.ok, src.story, corr); }).then(function (a2) {
              if (a2.ran && det2.problems.length <= det.problems.length && majorCount(a2.flags) < majorCount(audit.flags)) {
                LOG('applied ' + pt.n + ' audit correction(s): major flags ' + majorCount(audit.flags) + ' -> ' + majorCount(a2.flags));
                parsed = pt.parsed; det = det2; fixedN = pt.n; return finalize(a2);
              }
              return finalize(audit);
            });
          }
        }
        return finalize(audit);
      });
    });
  }
  function runLlmPipeline(story, src, setLabel) {
    setLabel('Extracting facts…');
    // An answer with no facts at all means the model failed, not that the article is thin (a thin article still
    // yields a few facts). Ask once more, with a reminder of the format, before giving up.
    function getFacts(attempt) {
      var prompt = extractPrompt(src.story, src.art) + (attempt ? '\n\nYour previous answer contained no facts. Return JSON of the form {"facts":[{"claim":"...","quote":"exact words from the article"}]} with 6 to 12 facts.' : '');
      return callLLM(prompt).then(function (r) {
        var j = extractJson(r.text);
        var arr = Array.isArray(j) ? j : (Array.isArray(j.facts) ? j.facts : []);
        if (!arr.length && attempt < 1) { LOG('extraction returned no facts (' + r.provider + ' ' + r.model + '), asking once more'); setLabel('The model returned no facts, asking again…'); return getFacts(attempt + 1); }
        return { r: r, facts: arr };
      });
    }
    return getFacts(0).then(function (got) {
      var r1 = got.r, j1 = { facts: got.facts };
      var v = verifyFacts(j1.facts, src.art.text);
      var total = Array.isArray(j1.facts) ? j1.facts.length : 0;
      if (!total) {
        var e0 = new Error('The AI (' + (r1.provider || '?') + ' ' + (r1.model || '') + ') returned no facts for this article twice. That is a model problem, not a thin article. Use "Retry with AI" to try again.');
        e0.gate = true; e0.retryable = true; throw e0;
      }
      LOG('facts verified: ' + v.ok.length + '/' + total + ' for "' + src.story.title + '"');
      return sleep(700).then(function () { setLabel('Checking each fact against its quote…'); return verifyClaims(v.ok); }).then(function (okFacts) {
        v = { ok: okFacts, bad: v.bad };
        if (v.ok.length < 3) {
          var e = new Error('The source article is too thin or the model could not support enough facts with exact quotes (' + v.ok.length + ' of ' + total + ' verified). No script written.');
          e.gate = true; throw e;
        }
        var factsA = fixOverreachClaims(v.ok).map(function (f) { return { claim: f.claim, quote: f.quote, outlet: src.story.source, status: 'single', other: null }; });
        return sleep(900).then(function () { return corroborate(src, factsA, setLabel); }).then(function (c) {
          if (state.settings.requireSecond && !c.art) {
            var e2 = new Error('Settings require a second outlet, but none could be read and matched. ' + (c.corr.reason || ''));
            e2.gate = true; throw e2;
          }
          src.allText = src.art.text + (c.art ? '\n' + c.art.text : '');
          return sleep(900).then(function () { return writeAndCheck(story, src, { ok: c.facts, corr: c.corr }, total, null, 0, setLabel); });
        });
      });
    });
  }
  function generateScripts(onlyIds) {
    if (generating) { toast('Already generating. Wait for it to finish.', 'error'); return; }
    var retryMode = Array.isArray(onlyIds);
    var stories = state.stories.filter(function (s) { return retryMode ? onlyIds.indexOf(s.id) !== -1 : state.selectedStoryIds[s.id]; });
    if (!stories.length) { toast('No stories selected. Go to the Feed step and tick the stories first.', 'error'); return; }
    var llmReady = state.settings.llmProvider !== 'none' && !!currentLlmKey();
    LOG('generateScripts start', { stories: stories.length, llmReady: llmReady, provider: state.settings.llmProvider });
    var list = $('#asg-script-list'); list.innerHTML = '';
    // Keep every script whose story is NOT being regenerated. Only the stories
    // selected this run have their old scripts replaced; everything else stays.
    var regenIds = stories.map(function (s) { return s.id; });
    var keptScripts = state.scripts.filter(function (x) { return regenIds.indexOf(x.storyId) === -1; });
    state.scripts = keptScripts.slice();
    generating = true; renderGenerateStatus();
    var prog = $('#asg-script-progress'); prog.hidden = false;
    var fill = $('.asg-progress-fill', prog); var label = $('.asg-progress-label', prog);
    var counts = { verified: 0, review: 0, template: 0, gated: 0, two: 0 };
    var usedUrls = {};
    keptScripts.forEach(function (x) { if (x.url && !x.gated) usedUrls[x.url] = true; });
    var failStreak = 0;
    var firstError = '';
    var stop = { reason: '' };
    var i = 0;
    function pushTemplate(story, src, reason, isError) {
      var sc = scriptFromParsed(buildLocalScript(src.story, state.profile, { article: src.art }), src.story, { template: true, reason: reason, level: 'article' });
      sc.storyId = story.id; sc.storyTitle = story.title;
      Object.assign(sc, sourceMeta(src));
      state.scripts.push(sc);
      counts.template++;
      if (isError && !firstError) firstError = reason;
    }
    function finish() {
      fill.style.width = '100%';
      label.textContent = 'Done.';
      setTimeout(function () { prog.hidden = true; }, 600);
      generating = false; waitNotice = null; llmStatus = null;
      persistScripts(); renderScripts(); updateStepAvailability();
      $('#asg-continue-video').hidden = goodScripts().length === 0;
      renderGenerateStatus();
      setStep('scripts');
      var parts = [];
      if (counts.verified) parts.push(counts.verified + ' passed all checks');
      if (counts.two) parts.push(counts.two + ' with two outlets');
      if (counts.review) parts.push(counts.review + ' need review');
      if (counts.template) parts.push(counts.template + ' template');
      if (counts.gated) parts.push(counts.gated + ' skipped');
      var msg = (parts.join(', ') || 'No scripts');
      if (firstError) msg += ' — AI problem: ' + firstError.slice(0, 160);
      toast(msg, (firstError || counts.gated) ? 'error' : 'success');
    }
    function next() {
      if (i >= stories.length) { finish(); return; }
      var story = stories[i++];
      var n = i;
      // The label says what the pipeline is doing (phase) and, after a dot, what the AI layer is doing right now
      // (which model is being asked, which one was overloaded, how long it is waiting).
      var phase = '', detail = '';
      function paint() { label.textContent = 'Story ' + n + ' of ' + stories.length + ': ' + phase + (detail ? ' · ' + detail : ''); }
      function setLabel(t) { phase = t; detail = ''; paint(); }
      llmStatus = function (d) { detail = d || ''; paint(); };
      waitNotice = function (pv, sec) { detail = 'waiting ' + sec + ' s for ' + pv + ' limits'; paint(); };
      fill.style.width = Math.round((n - 1) / stories.length * 100) + '%';
      setLabel('finding a readable source…');
      resolveSource(story).then(function (src) {
        if (!src) {
          var why = story.readable === 'paywalled'
            ? 'Paywalled source (' + story.source + '). Its text cannot be read, and no open outlet covering the same story was found in this scan.'
            : story.readable === 'thin'
            ? 'Live blog or video page (' + story.source + '): there is no article text to read, and no open outlet with a full article on the same story was found in this scan.'
            : 'No readable source article could be fetched (aggregator link, blocked page, or paywall), and no open outlet covering the same story was found in this scan.';
          state.scripts.push(gatedScript(story, why)); counts.gated++;
          return;
        }
        if (usedUrls[src.story.url]) {
          state.scripts.push(gatedScript(story, 'Same event as another selected story that already has a script from ' + src.story.source + '. Skipped to avoid a duplicate.')); counts.gated++;
          return;
        }
        usedUrls[src.story.url] = true;
        if (!llmReady) { pushTemplate(story, src, state.settings.llmProvider === 'none' ? 'The AI provider is set to None in Settings.' : 'No API key is saved for the selected AI provider (' + state.settings.llmProvider + '). Open Settings, paste the key and click Save settings (the Test button alone does not save it).', true); return; }
        if (stop.reason) { pushTemplate(story, src, 'AI skipped: ' + stop.reason, true); return; }
        return runLlmPipeline(story, src, setLabel).then(function (sc) {
          state.scripts.push(sc);
          failStreak = 0;
          if (sc.checks.status === 'checked') counts.verified++; else counts.review++;
          if (sc.corroboration && (sc.corroboration.status === 'corroborated' || sc.corroboration.status === 'partial')) counts.two++;
          return sleep(1200);
        }).catch(function (e) {
          LOG('pipeline error for "' + story.title + '":', e.message);
          if (e.gate) { state.scripts.push(gatedScript(story, e.message, e.retryable)); counts.gated++; return; }
          failStreak++;
          if (e.fatal || failStreak >= 2) stop.reason = e.message;
          pushTemplate(story, src, e.message, true);
        });
      }).catch(function (e) {
        LOG('unexpected error for "' + story.title + '":', e && e.message);
        state.scripts.push(gatedScript(story, 'Unexpected error: ' + (e && e.message || e))); counts.gated++;
      }).then(next);
    }
    next();
  }

  function scriptSection(label, value, onChange, multiline) {
    var wrap = el('div', { class: 'asg-script-section' }, [el('label', { text: label })]);
    var ta = el('textarea', {}); if (!multiline) ta.style.minHeight = '44px';
    ta.value = value || ''; ta.addEventListener('input', function () { onChange(ta.value); });
    wrap.appendChild(ta); return wrap;
  }
  function cleanTag(t) { return String(t).replace(/^#+/, '').replace(/[^A-Za-z0-9_]/g, ''); }
  function factLabel(f, sc) {
    if (f.status === 'confirmed') return 'both outlets';
    if (f.status === 'conflict') return 'outlets differ';
    if (f.status === 'possible') return 'possible difference';
    return (f.outlet || (sc && (sc.sourceName || sc.source)) || 'one outlet') + ' only';
  }

  var pendingDelete = null;
  function deleteScript(sc) {
    var idx = state.scripts.indexOf(sc);
    if (idx < 0) return;
    if (pendingDelete) {
      clearTimeout(pendingDelete.timer);
      pendingDelete.toast.remove();
      pendingDelete = null;
    }
    state.scripts.splice(idx, 1);
    persistScripts();
    renderScripts();
    ensureModalStyle();
    var t = el('div', { class: 'asg-toast is-on asg-toast-undo' });
    t.appendChild(el('span', { text: 'Script deleted.' }));
    var undo = el('button', { class: 'asg-btn asg-btn-ghost', type: 'button', text: 'Undo' });
    t.appendChild(undo);
    document.body.appendChild(t);
    pendingDelete = { sc: sc, idx: idx, toast: t, timer: null };
    undo.addEventListener('click', function () {
      clearTimeout(pendingDelete.timer);
      state.scripts.splice(pendingDelete.idx, 0, pendingDelete.sc);
      persistScripts();
      renderScripts();
      t.remove();
      pendingDelete = null;
      toast('Restored', 'success');
    });
    pendingDelete.timer = setTimeout(function () {
      t.remove();
      pendingDelete = null;
    }, 8000);
  }

  function renderScripts() {
    var list = $('#asg-script-list'); list.innerHTML = '';
    if (!state.scripts.length) { return; }
    var tpl = state.scripts.filter(function (x) { return (x.isTemplate && !x.gated) || (x.gated && x.retryable); });
    if (tpl.length) {
      ensureModalStyle();
      var bar = el('div', { class: 'asg-bar' });
      bar.appendChild(el('span', { text: tpl.length + (tpl.length === 1 ? ' script' : ' scripts') + ' without an AI answer, so ' + (tpl.length === 1 ? 'it was' : 'they were') + ' not fact-checked. Retry, or open one to see why.' }));
      var rb = el('button', { class: 'asg-btn asg-btn-primary', type: 'button', text: 'Retry ' + (tpl.length === 1 ? 'it' : 'them') + ' with AI' });
      rb.addEventListener('click', function () {
        var ids = tpl.map(function (x) { return x.storyId; });
        setStep('generate'); generateScripts(ids);
      });
      bar.appendChild(rb);
      list.appendChild(bar);
    }
    state.scripts.forEach(function (sc, idx) {
      var card = el('div', { class: 'asg-script-card' });
      if (sc.gated) {
        ensureModalStyle();
        card = el('div', { class: 'asg-skip' });
        var txt = el('div');
        txt.appendChild(el('h4', { text: '⛔ ' + (idx + 1) + '. ' + sc.storyTitle + ' (skipped)' }));
        txt.appendChild(el('p', { text: (sc.source ? sc.source + ' · ' : '') + (sc.reason || '') }));
        if (sc.url && /^https?:\/\//i.test(sc.url)) {
          var open = el('a', { href: sc.url, target: '_blank', rel: 'noopener noreferrer', text: 'Open the story ↗' });
          txt.appendChild(el('p', {}, [open]));
        }
        card.appendChild(txt);
        card.appendChild(makeDeleteBtn(sc));
        list.appendChild(card);
        return;
      }
      card.appendChild(el('h4', { text: (idx + 1) + '. ' + sc.title }));
      card.appendChild(el('p', { class: 'asg-script-source', text: sc.source + ' — ' + sc.storyTitle }));
      if (sc.isTemplate) {
        card.appendChild(el('div', { class: 'asg-hint', style: 'margin:8px 0;padding:10px;background:#fff5e6;border:1px solid #ffe0a8;border-radius:8px;color:#8a5b00;', text: '⚠ Template script built from the article text, not fact-checked.' + (sc.reason ? ' Reason: ' + sc.reason : '') }));
      } else if (sc.checks) {
        var c = sc.checks;
        var notes = [];
        if (c.badNums && c.badNums.length) notes.push('numbers not in source: ' + c.badNums.join(', '));
        if (c.badTerms && c.badTerms.length) notes.push('names/terms not in source: ' + c.badTerms.join(', '));
        (c.wording || []).forEach(function (w) { notes.push(w); });
        var nMaj = majorCount(c.auditFlags), nMin = (c.auditFlags || []).length - nMaj;
        if (nMaj) notes.push(nMaj + ' sentence' + (nMaj === 1 ? '' : 's') + ' flagged by the AI audit as a real problem (listed below)');
        if (sc.corroboration && sc.corroboration.possible && sc.corroboration.possible.length) notes.push(sc.corroboration.possible.length + ' possible difference(s) between the outlets, listed below');
        if (sc.corroboration && sc.corroboration.status === 'conflict') notes.push('the two outlets differ on ' + sc.corroboration.conflicts.length + ' point(s), listed below');
        if (c.lengthOver) notes.push('longer than the target length (' + c.words + ' words)');
        if (c.auditRan === false) notes.push('the AI wording audit could not run' + (c.auditError ? ' (' + String(c.auditError).slice(0, 90) + ')' : ''));
        if (c.status === 'checked') {
          card.appendChild(el('div', { class: 'asg-hint', style: 'margin:8px 0;padding:10px;background:#e8f7ee;border:1px solid #b6e3c4;border-radius:8px;color:#17633a;', text: '✓ Passed the automated checks: ' + c.factsVerified + ' facts with exact source quotes; numbers, names and qualifiers match the article; the AI audit found no real problem' + (nMin ? ' (' + nMin + ' minor wording note' + (nMin === 1 ? '' : 's') + ' below)' : '') + (c.revised ? ' (revised once)' : '') + (c.autoFixed ? ' (' + c.autoFixed + ' sentence' + (c.autoFixed === 1 ? '' : 's') + ' corrected automatically from the audit)' : '') + '. This is not proof the source is right. Read it before publishing.' }));
        } else if (c.status === 'verified') {
          card.appendChild(el('div', { class: 'asg-hint', style: 'margin:8px 0;padding:10px;background:#fff5e6;border:1px solid #ffe0a8;border-radius:8px;color:#8a5b00;', text: '⚠ Checked with an older version that did not audit wording (qualifiers, overstatement, attribution). Generate again for the stricter check.' }));
        } else {
          card.appendChild(el('div', { class: 'asg-hint', style: 'margin:8px 0;padding:10px;background:#fff5e6;border:1px solid #ffe0a8;border-radius:8px;color:#8a5b00;', text: '⚠ Needs review before publishing: ' + (notes.join('; ') || 'checks incomplete') + '. Edit these or verify them against the source.' }));
        }
        if (c.status === 'checked' && c.lengthOver) {
          card.appendChild(el('p', { class: 'asg-hint', text: 'Note: this script runs ' + c.words + ' words (about ' + Math.round(c.words / LEN.wps) + ' s), over your target. Trim it if you want a shorter Short.' }));
        }
        if (c.auditFlags && c.auditFlags.length) {
          var adet = el('details', { style: 'margin:6px 0 10px;', open: 'open' });
          adet.appendChild(el('summary', { text: 'Audit notes (' + c.auditFlags.length + ')' }));
          var aul = el('ul', { style: 'margin:8px 0 0 18px;padding:0;' });
          c.auditFlags.forEach(function (f) {
            var li = el('li', { style: 'margin-bottom:8px;' });
            li.appendChild(el('strong', { text: f.id + ' · ' + (f.severity === 'minor' ? 'minor ' : '') + f.type + ': ' }));
            li.appendChild(document.createTextNode('“' + f.sentence + '”. ' + f.problem));
            if (f.fix) { li.appendChild(el('br')); li.appendChild(el('em', { text: 'Suggested: ' + f.fix })); }
            aul.appendChild(li);
          });
          adet.appendChild(aul);
          card.appendChild(adet);
        }
        if (sc.via === 'alternative') {
          card.appendChild(el('p', { class: 'asg-hint', text: 'The original story had no readable source, so this was written from ' + sc.sourceName + '\'s coverage of the same event.' }));
        }
      }
      if (!sc.isTemplate && sc.corroboration) {
        var cr = sc.corroboration, crBox = null;
        var crStyle = function (bg, bd, fg) { return 'margin:8px 0;padding:10px;background:' + bg + ';border:1px solid ' + bd + ';border-radius:8px;color:' + fg + ';'; };
        if (cr.status === 'conflict') {
          crBox = el('div', { class: 'asg-hint', style: crStyle('#fff5e6', '#ffe0a8', '#8a5b00') });
          crBox.appendChild(el('strong', { text: '⚠ The two outlets differ on ' + cr.conflicts.length + ' point' + (cr.conflicts.length === 1 ? '' : 's') + '. ' }));
          crBox.appendChild(document.createTextNode('Compared ' + (sc.sourceName || 'source') + ' with ' + cr.outlet + '. The script should name both versions; check it against both articles:'));
          var cul = el('ul', { style: 'margin:6px 0 0 18px;padding:0;' });
          cr.conflicts.forEach(function (x) { cul.appendChild(el('li', { text: x.claim + (x.other && x.other.note ? ' — ' + x.other.note : '') })); });
          crBox.appendChild(cul);
        } else if (cr.status === 'corroborated' || cr.status === 'partial') {
          crBox = el('div', { class: 'asg-hint', style: crStyle('#e8f7ee', '#b6e3c4', '#17633a') });
          crBox.appendChild(document.createTextNode('✓ Two outlets: ' + cr.confirmed + ' of ' + cr.total + ' key facts from ' + (sc.sourceName || 'the source') + ' are also reported by ' + cr.outlet + (cr.extra ? ', plus ' + cr.extra + ' extra fact' + (cr.extra === 1 ? '' : 's') + ' from ' + cr.outlet : '') + '. That means both report it, not that it is proven.' + (cr.status === 'partial' ? ' Only one fact matched, so treat the rest as single-source.' : '')));
        } else {
          crBox = el('div', { class: 'asg-hint', style: crStyle('#eef2fd', '#c9d6f7', '#1e3eb8') });
          crBox.appendChild(document.createTextNode('ℹ Single source: this script rests on ' + (sc.sourceName || sc.source || 'one outlet') + '. ' + (cr.reason || 'No second outlet was checked.') + ' The script says "according to ' + (sc.sourceName || 'the outlet') + '" for its key claims. For contested topics, read a second outlet yourself before publishing.'));
        }
        card.appendChild(crBox);
        if (cr.possible && cr.possible.length) {
          var pBox = el('div', { class: 'asg-hint', style: crStyle('#fff5e6', '#ffe0a8', '#8a5b00') });
          pBox.appendChild(el('strong', { text: '⚠ Possible difference on ' + cr.possible.length + ' point' + (cr.possible.length === 1 ? '' : 's') + '. ' }));
          pBox.appendChild(document.createTextNode('The comparison is not sure the outlets actually disagree. The script gives each outlet\'s version separately and does not claim a disagreement. Check both articles:'));
          var pul = el('ul', { style: 'margin:6px 0 0 18px;padding:0;' });
          cr.possible.forEach(function (x) { pul.appendChild(el('li', { text: x.claim + (x.other && x.other.note ? ' — ' + x.other.note : '') })); });
          pBox.appendChild(pul);
          card.appendChild(pBox);
        }
      }
      var srcLine = el('p', { class: 'asg-hint' });
      srcLine.appendChild(document.createTextNode('AI · ' + (sc.model || sc.provider || 'LLM') + ' · source: '));
      if (sc.sourceUrl && /^https?:\/\//i.test(sc.sourceUrl)) {
        srcLine.appendChild(el('a', { href: sc.sourceUrl, target: '_blank', rel: 'noopener noreferrer', text: (sc.sourceName || 'article') + ' ↗' }));
      } else {
        srcLine.appendChild(document.createTextNode(sc.sourceName || sc.source || 'unknown'));
      }
      if (sc.corroboration && sc.corroboration.url && /^https?:\/\//i.test(sc.corroboration.url) && sc.corroboration.status !== 'none') {
        srcLine.appendChild(document.createTextNode(' · compared with: '));
        srcLine.appendChild(el('a', { href: sc.corroboration.url, target: '_blank', rel: 'noopener noreferrer', text: sc.corroboration.outlet + ' ↗' }));
      }
      if (sc.checks && sc.checks.words) {
        srcLine.appendChild(document.createTextNode(' · ' + sc.checks.words + ' words ≈ ' + Math.round(sc.checks.words / LEN.wps) + ' s'));
      }
      card.appendChild(srcLine);
      if (sc.facts && sc.facts.length) {
        var det = el('details', { style: 'margin:6px 0 10px;' });
        det.appendChild(el('summary', { text: 'Facts used (' + sc.facts.length + ') with source quotes' + (sc.corroboration && sc.corroboration.status !== 'none' ? ', tagged by outlet' : '') }));
        var ul = el('ul', { style: 'margin:8px 0 0 18px;padding:0;' });
        sc.facts.forEach(function (f) {
          var li = el('li', { style: 'margin-bottom:10px;' });
          li.appendChild(el('span', { class: 'asg-chip ' + (f.status === 'confirmed' ? '' : 'is-muted'), text: factLabel(f, sc), style: 'margin-right:6px;' + (f.status === 'confirmed' ? 'background:#e8f7ee;color:#17633a;' : (f.status === 'conflict' || f.status === 'possible') ? 'background:#fff5e6;color:#8a5b00;' : '') }));
          li.appendChild(el('strong', { text: f.claim }));
          li.appendChild(el('br'));
          li.appendChild(el('em', { text: (f.outlet || sc.sourceName || '') + ': “' + f.quote + '”' }));
          if (f.other && f.other.quote) { li.appendChild(el('br')); li.appendChild(el('em', { text: f.other.outlet + ': “' + f.other.quote + '”' })); }
          if ((f.status === 'conflict' || f.status === 'possible') && f.other && f.other.note) { li.appendChild(el('br')); li.appendChild(el('span', { style: 'color:#8a5b00;', text: (f.status === 'possible' ? 'Possible difference (unverified): ' : 'Difference: ') + f.other.note })); }
          ul.appendChild(li);
        });
        det.appendChild(ul);
        card.appendChild(det);
      }
      card.appendChild(scriptSection('Hook', sc.hook, function (v) { sc.hook = v; persistScripts(); }));
      card.appendChild(scriptSection('Body', sc.body, function (v) { sc.body = v; persistScripts(); }, true));
      if (sc.analysis || (sc.checks && sc.checks.analysisDropped)) {
        var aw = el('div', { class: 'asg-hint', style: 'margin:10px 0 4px;padding:8px 10px;border-radius:8px;background:#eef3ff;border:1px solid #cddafc;color:#243b7a;' });
        aw.appendChild(el('strong', { text: 'Analysis: the channel\'s own read of this story. ' }));
        aw.appendChild(document.createTextNode('Not from the article and not backed by a quote. It may not contain numbers, names or quotes, and it was checked separately' + (sc.checks && sc.checks.analysisDropped ? ' (' + sc.checks.analysisDropped + ' sentence' + (sc.checks.analysisDropped === 1 ? '' : 's') + ' removed by the checks)' : '') + '. Read it once before publishing.'));
        card.appendChild(aw);
      }
      if (sc.analysis) card.appendChild(scriptSection('Analysis', sc.analysis, function (v) { sc.analysis = v; persistScripts(); }, true));
      card.appendChild(scriptSection('CTA', sc.cta, function (v) { sc.cta = v; persistScripts(); }));
      card.appendChild(scriptSection('YouTube Title', sc.title, function (v) { sc.title = v; persistScripts(); }));
      card.appendChild(scriptSection('Description', sc.description, function (v) { sc.description = v; persistScripts(); }, true));
      var meta = el('div', { class: 'asg-script-meta' });
      (sc.tags || []).map(cleanTag).filter(Boolean).forEach(function (t) { meta.appendChild(el('span', { class: 'asg-chip is-muted', text: '#' + t })); });
      card.appendChild(meta);
      var actions = el('div', { class: 'asg-script-actions' });
      var copyBtn = el('button', { class: 'asg-btn asg-btn-ghost', type: 'button', text: 'Copy' });
      copyBtn.addEventListener('click', function () { copyText(scriptToText(sc)); toast('Copied', 'success'); });
      actions.appendChild(copyBtn); card.appendChild(actions);
      list.appendChild(makeTile(sc, idx, card));
    });
    renderReviewSummary();
  }
  function ensureModalStyle() {
    if (document.getElementById('asg-modal-style')) return;
    var st = document.createElement('style'); st.id = 'asg-modal-style';
    st.textContent = [
      '#asg-script-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;align-items:stretch;}',
      '#asg-script-list>.asg-script-card{grid-column:1/-1;}',
      '.asg-tile{position:relative;display:flex;flex-direction:column;gap:8px;text-align:left;padding:14px;border:1px solid #d9dee7;border-radius:12px;background:#fff;color:#1b2430;cursor:pointer;font:inherit;transition:box-shadow .15s,border-color .15s;}',
      '.asg-tile:hover,.asg-tile:focus-visible{border-color:#5b7cfa;box-shadow:0 4px 16px rgba(30,50,120,.14);outline:none;}',
      '.asg-tile h4{margin:0;font-size:16px;line-height:1.3;}',
      '.asg-tile-hook{margin:0;font-size:13px;line-height:1.45;color:#4a5568;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}',
      '.asg-tile-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;color:#5b6676;}',
      '.asg-pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;}',
      '.asg-pill-ok{background:#e8f7ee;color:#17633a;}.asg-pill-warn{background:#fff5e6;color:#8a5b00;}.asg-pill-tpl{background:#eef0f4;color:#4a5568;}.asg-pill-rev{background:#e6efff;color:#1d4ed8;}',
      '.asg-tile-open{font-size:13px;font-weight:600;color:#3956d6;}',
      '.asg-tile-foot{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:10px;border-top:1px solid #eef1f6;}',
      '.asg-tile-del{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:#7a8596;font:inherit;font-size:12px;font-weight:600;cursor:pointer;transition:background .15s,color .15s,border-color .15s;}',
      '.asg-tile-del svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}',
      '.asg-tile-del:hover,.asg-tile-del:focus-visible{background:#fdecec;color:#c62828;border-color:#f5c2c2;outline:none;}',
      '.asg-skip{grid-column:1/-1;display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;padding:12px 14px;border:1px solid #f3b9b9;border-left:4px solid #d92b2b;border-radius:10px;background:#fff7f7;color:#8a1f1f;}',
      '.asg-skip h4{margin:0 0 4px;font-size:15px;color:#5a1414;}',
      '.asg-skip p{margin:0;font-size:13px;line-height:1.45;}',
      '.asg-bar{grid-column:1/-1;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px 14px;border:1px solid #ffe0a8;border-left:4px solid #f0a020;border-radius:10px;background:#fff9ee;color:#7a5200;font-size:13px;line-height:1.45;}',
      '.asg-toast-undo{display:flex;gap:14px;align-items:center;max-width:min(560px,90vw);}',
      '.asg-toast-undo button{padding:4px 12px;border:1px solid #fff;border-radius:8px;background:transparent;color:#fff;font:inherit;font-weight:600;cursor:pointer;}',
      '.asg-modal{position:fixed;inset:0;z-index:100000;background:rgba(15,20,35,.62);display:flex;align-items:flex-start;justify-content:center;padding:3vh 12px;overflow-y:auto;}',
      '.asg-modal-panel{background:#fff;color:#1b2430;border-radius:14px;width:100%;max-width:980px;box-shadow:0 20px 60px rgba(0,0,0,.35);display:flex;flex-direction:column;max-height:94vh;}',
      '.asg-modal-head{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e3e7ee;}',
      '.asg-modal-head h3{margin:0;font-size:17px;line-height:1.3;}',
      '.asg-modal-body{padding:14px 18px;overflow-y:auto;flex:1;}',
      '.asg-modal-body .asg-script-card{border:0;box-shadow:none;padding:0;margin:0;}',
      '.asg-modal-body .asg-script-card>h4{display:none;}',
      '.asg-modal-body .asg-script-section label{display:block;font-weight:600;margin:12px 0 4px;}',
      '.asg-modal-body textarea{width:100%;box-sizing:border-box;min-height:110px;font:inherit;line-height:1.5;padding:8px 10px;border:1px solid #cbd3df;border-radius:8px;resize:vertical;}',
      '.asg-modal-foot{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;align-items:center;padding:12px 18px;border-top:1px solid #e3e7ee;background:#f7f9fc;border-radius:0 0 14px 14px;}',
      '.asg-modal-foot .asg-hint{margin:0 auto 0 0;}',
      '.asg-review-sum{grid-column:1/-1;margin:0;font-size:13px;color:#4a5568;}'
    ].join('\n');
    document.head.appendChild(st);
  }
  function scriptStatus(sc) {
    if (sc.isTemplate) return { cls: 'asg-pill-tpl', text: 'Template, not fact-checked' };
    if (sc.checks && sc.checks.status === 'checked') return { cls: 'asg-pill-ok', text: '✓ Checked' };
    return { cls: 'asg-pill-warn', text: '⚠ Needs review' };
  }
  function makeTile(sc, idx, card) {
    ensureModalStyle();
    if (sc.gated) { card.style.gridColumn = '1 / -1'; return card; }
    var st = scriptStatus(sc);
    var tile = el('button', { class: 'asg-tile', type: 'button', 'aria-label': 'Review and edit: ' + sc.title });
    tile.appendChild(el('h4', { text: (idx + 1) + '. ' + (sc.title || sc.storyTitle) }));
    var meta = el('div', { class: 'asg-tile-meta' });
    meta.appendChild(el('span', { class: 'asg-pill ' + st.cls, text: st.text }));
    if (sc.reviewed) meta.appendChild(el('span', { class: 'asg-pill asg-pill-rev', text: 'Reviewed ✓' }));
    var words = scriptWords(sc);
    meta.appendChild(el('span', { text: words + ' words · ~' + Math.round(words / LEN.wps) + ' s' }));
    meta.appendChild(el('span', { text: (sc.sourceName || sc.source || '') + (sc.corroboration && sc.corroboration.status !== 'none' && sc.corroboration.outlet ? ' + ' + sc.corroboration.outlet : '') }));
    tile.appendChild(meta);
    tile.appendChild(el('p', { class: 'asg-tile-hook', text: sc.hook || '' }));
    if (sc.isTemplate && sc.reason) tile.appendChild(el('p', { class: 'asg-tile-hook', style: 'color:#8a5b00;', text: 'Why a template: ' + sc.reason }));
    var foot = el('div', { class: 'asg-tile-foot' });
    foot.appendChild(el('span', { class: 'asg-tile-open', text: 'Review and edit →' }));
    foot.appendChild(makeDeleteBtn(sc));
    tile.appendChild(foot);
    tile.addEventListener('click', function () { openScriptModal(sc, idx, card); });
    return tile;
  }
  var TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/></svg>';
  function makeDeleteBtn(sc) {
    var del = el('span', { class: 'asg-tile-del', role: 'button', tabindex: '0', 'aria-label': 'Delete this script', title: 'Delete (you can undo)' });
    del.innerHTML = TRASH + '<span>Delete</span>';
    var go = function (e) { e.stopPropagation(); e.preventDefault(); deleteScript(sc); };
    del.addEventListener('click', go);
    del.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') go(e); });
    return del;
  }
  var modalState = null;
  function closeScriptModal(save) {
    if (!modalState) return;
    var m = modalState; modalState = null;
    if (save) { m.sc.reviewed = true; }
    persistScripts();
    document.removeEventListener('keydown', m.onKey, true);
    document.body.style.overflow = m.prevOverflow;
    m.overlay.remove();
    renderScripts();
    try { var t = $$('#asg-script-list .asg-tile')[m.tileIndex]; if (t) t.focus(); } catch (e) {}
    if (save) toast('Saved. Marked as reviewed.', 'success');
  }
  function openScriptModal(sc, idx, card) {
    if (modalState) return;
    var overlay = el('div', { class: 'asg-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Review and edit script' });
    var panel = el('div', { class: 'asg-modal-panel' });
    var head = el('div', { class: 'asg-modal-head' });
    var st = scriptStatus(sc);
    head.appendChild(el('h3', { text: (idx + 1) + '. ' + (sc.title || sc.storyTitle) }));
    var right = el('div', { style: 'display:flex;gap:8px;align-items:center;' });
    right.appendChild(el('span', { class: 'asg-pill ' + st.cls, text: st.text }));
    var x = el('button', { class: 'asg-btn asg-btn-ghost', type: 'button', text: '✕', 'aria-label': 'Close without marking as reviewed' });
    right.appendChild(x); head.appendChild(right);
    var body = el('div', { class: 'asg-modal-body' }); body.appendChild(card);
    var foot = el('div', { class: 'asg-modal-foot' });
    foot.appendChild(el('span', { class: 'asg-hint', text: 'Edits are kept as you type. Save marks the script as reviewed.' }));
    var cancel = el('button', { class: 'asg-btn asg-btn-ghost', type: 'button', text: 'Close' });
    var save = el('button', { class: 'asg-btn asg-btn-primary', type: 'button', text: 'Save and mark as reviewed' });
    foot.appendChild(cancel); foot.appendChild(save);
    panel.appendChild(head); panel.appendChild(body); panel.appendChild(foot); overlay.appendChild(panel);
    var onKey = function (e) { if (e.key === 'Escape') { e.stopPropagation(); closeScriptModal(false); } };
    modalState = { sc: sc, overlay: overlay, onKey: onKey, prevOverflow: document.body.style.overflow, tileIndex: state.scripts.filter(function (x2, i2) { return i2 < idx && !x2.gated; }).length };
    document.addEventListener('keydown', onKey, true);
    document.body.style.overflow = 'hidden';
    x.addEventListener('click', function () { closeScriptModal(false); });
    cancel.addEventListener('click', function () { closeScriptModal(false); });
    save.addEventListener('click', function () { closeScriptModal(true); });
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeScriptModal(false); });
    document.body.appendChild(overlay);
    save.focus();
  }
  function renderReviewSummary() {
    var list = $('#asg-script-list'); if (!list) return;
    var good = goodScripts(); if (!good.length) return;
    var rev = good.filter(function (x) { return x.reviewed; }).length;
    var p = el('p', { class: 'asg-review-sum', text: good.length + ' script' + (good.length === 1 ? '' : 's') + ' · ' + rev + ' reviewed. Click a script to read the full text, check the sources and edit it. Delete removes a script (undo for 8 seconds). Export includes every script, reviewed or not.' });
    list.insertBefore(p, list.firstChild);
  }
  function scriptToText(sc) {
    var lines = ['# ' + sc.title, ''].concat(sc.isTemplate ? ['*** TEMPLATE, NOT FACT-CHECKED. The AI did not write this. Reason: ' + (sc.reason || 'unknown') + ' ***', ''] : []).concat(['HOOK: ' + sc.hook, '', 'BODY: ' + sc.body, '', (sc.analysis ? 'ANALYSIS (the channel\'s own read, not from the sources): ' + sc.analysis + '\n\n' : '') + 'CTA: ' + sc.cta, '',
      'DESCRIPTION:', sc.description, '', 'TAGS: ' + (sc.tags || []).map(cleanTag).filter(Boolean).map(function (t) { return '#' + t; }).join(' '), '',
      'SOURCES:', (sc.sources || []).join('\n')]);
    if (sc.checks) lines.push('', 'CHECKS: ' + sc.checks.status + ' · ' + sc.checks.factsVerified + ' facts verified' + (sc.checks.words ? ' · ' + sc.checks.words + ' words (~' + Math.round(sc.checks.words / LEN.wps) + ' s)' : ''));
    if (sc.corroboration) {
      var cr = sc.corroboration;
      lines.push('CORROBORATION: ' + (cr.status === 'none' ? 'single source (' + (sc.sourceName || sc.source) + '). ' + cr.reason : cr.status + ' with ' + cr.outlet + ' · ' + cr.confirmed + ' of ' + cr.total + ' key facts confirmed' + (cr.conflicts.length ? ' · ' + cr.conflicts.length + ' difference(s): ' + cr.conflicts.map(function (x) { return x.claim + ' [' + (x.other && x.other.note || '') + ']'; }).join(' | ') : '')));
    }
    if (sc.corroboration && sc.corroboration.possible && sc.corroboration.possible.length) {
      lines.push('POSSIBLE DIFFERENCES (verify): ' + sc.corroboration.possible.map(function (x) { return x.claim + ' [' + (x.other && x.other.note || '') + ']'; }).join(' | '));
    }
    if (sc.checks) {
      var rn = [];
      (sc.checks.badNums || []).forEach(function (n) { rn.push('number not in source: ' + n); });
      (sc.checks.badTerms || []).forEach(function (n) { rn.push('name/term not in source: ' + n); });
      (sc.checks.wording || []).forEach(function (w) { rn.push('wording: ' + w); });
      (sc.checks.auditFlags || []).forEach(function (f) { rn.push(f.id + ' ' + (f.severity === 'minor' ? 'minor ' : '') + f.type + ': "' + f.sentence + '" — ' + f.problem + (f.fix ? ' | suggested: ' + f.fix : '')); });
      if (rn.length) { lines.push('', 'REVIEW NOTES:'); rn.forEach(function (x) { lines.push('- ' + x); }); }
    }
    if (sc.facts && sc.facts.length) {
      lines.push('', 'FACTS USED:');
      sc.facts.forEach(function (f, i) {
        lines.push((i + 1) + '. [' + factLabel(f, sc) + '] ' + f.claim + '\n   "' + f.quote + '"' + (f.other && f.other.quote ? '\n   (' + f.other.outlet + ') "' + f.other.quote + '"' : ''));
      });
    }
    return lines.join('\n');
  }
  function buildPayload(idx) {
    return {
      schemaVersion: '1.2', generatedAt: new Date().toISOString(), profile: state.profile,
      scripts: goodScripts().map(function (sc, i) {
        var o = Object.assign({}, sc, { narration: narrationOf(sc) });
        delete o.vplan; delete o.mediaId;
        o.media = mediaPaths(sc, i, idx && sc.mediaId ? idx[sc.mediaId] : null);
        return o;
      })
    };
  }
  function download(name, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob); var a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {} ta.remove(); return Promise.resolve();
  }
  function renderExport() {
    var pre = $('#asg-payload-pre');
    return mediaIndex().then(function (idx) { if (pre) pre.textContent = JSON.stringify(buildPayload(idx), null, 2); return renderExportMedia(); });
  }

  function openSettings() {
    $('#asg-settings-drawer').hidden = false;
    $('#asg-set-yt').value = state.settings.youtubeKey || '';
    $('#asg-set-provider').value = state.settings.llmProvider || 'gemini';
    $('#asg-set-gemini').value = state.settings.geminiKey || '';
    var gm = $('#asg-set-gemini-model'); if (gm) gm.value = state.settings.geminiModel || '';
    var rq = $('#asg-set-require2'); if (rq) rq.checked = !!state.settings.requireSecond;
    var dp = $('#asg-set-depth'); if (dp) dp.checked = state.settings.depth !== false;
    var fb = $('#asg-set-fallback'); if (fb) fb.checked = state.settings.fallbackProviders !== false;
    var wm = $('#asg-set-gemini-write-model'); if (wm) wm.value = state.settings.geminiWriteModel || '';
    $('#asg-set-openai').value = state.settings.openaiKey || '';
    $('#asg-set-deepseek').value = state.settings.deepseekKey || '';
    vopt();
    var sp = $('#asg-set-stock'); if (sp) sp.value = stockProvider();
    var pxk = $('#asg-set-pixabay'); if (pxk) pxk.value = state.settings.pixabayKey || '';
    var pek = $('#asg-set-pexels'); if (pek) pek.value = state.settings.pexelsKey || '';
    ['groq', 'openrouter'].forEach(function (pv) {
      var k = $('#asg-set-' + pv), m = $('#asg-set-' + pv + '-model'), w = $('#asg-set-' + pv + '-write-model');
      if (k) k.value = state.settings[pv + 'Key'] || '';
      if (m) m.value = state.settings[pv + 'Model'] || '';
      if (w) w.value = state.settings[pv + 'WriteModel'] || '';
    });
    syncProviderFields();
  }
  function closeSettings() { $('#asg-settings-drawer').hidden = true; }
  function syncProviderFields() {
    var p = $('#asg-set-provider').value;
    $$('.asg-drawer [data-provider]').forEach(function (f) { f.hidden = f.dataset.provider !== p; });
  }

  window.__asgDiag = function () {
    console.log('--- ASG diagnostics v' + VERSION + ' ---');
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
    console.log('Article endpoint:', (window.AUTONOM_ASG || {}).articleEndpoint || '(not configured)');
    console.log('Selected stories:', Object.keys(state.selectedStoryIds));
    console.log('Scripts generated:', state.scripts.length);
  };
  window.__asgTestLLM = function () {
    console.log('--- LLM test ---');
    console.log('Provider:', state.settings.llmProvider, '· preferred model:', state.settings.geminiModel);
    callLLM('Return strict JSON: {"ok": true, "msg": "hello"}', 'extract', { noFallback: true, noSticky: true })
      .then(function (r) { console.log('✓ SUCCESS via', r.provider, r.model, '→', r.text); })
      .catch(function (e) { console.error('✗ FAILED:', e.message); });
  };
  window.__asgTestGdelt = function () {
    console.log('[ASG] Testing GDELT…');
    tryGdelt('war OR defense')
      .then(function (f) { console.log('[ASG] GDELT OK:', f.items.length, 'items'); })
      .catch(function (e) { console.error('[ASG] GDELT failed:', e.message); });
  };
  window.__asgTestArticle = function (url) {
    if (!url) { console.log('Usage: __asgTestArticle("https://example.com/some-article")'); return; }
    fetchArticle(url).then(function (r) {
      if (r) console.log('✓ Article OK:', r.title, '·', r.length, 'chars\n', String(r.text).slice(0, 400) + '…');
      else console.error('✗ No article text (check endpoint, paywall, or URL).');
    });
  };
  window.__asgTestFeeds = function () {
    var cfg = window.AUTONOM_ASG || {};
    if (!cfg.feedsEndpoint) { console.error('No feeds endpoint configured (update the PHP file).'); return; }
    fetch(cfg.feedsEndpoint, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (console.table) console.table(j.stats || []); else console.log(j.stats);
        console.log('stories (last 5 days):', (j.items || []).length);
      })
      .catch(function (e) { console.error('Feeds test failed:', e.message); });
  };
  window.__asgListModels = function () {
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

  /* =====================================================================
   * VIDEO STUDIO
   * narration (spoken text only) -> one voice clip per sentence (exact timings)
   * -> captions timed inside each sentence -> stock footage per scene
   * -> real-time canvas + audio recording to MP4/WebM, all in the browser.
   * Finished media is stored in this browser (IndexedDB) next to the scripts.
   * ===================================================================== */
  var VID_DEFAULTS = { voice: 'am_echo', speed: 1, res: '720', footage: true, engine: 'wasm', tag: true };
  var BUILTIN_VOICES = [['am_echo', 'Echo · en-us · Male'], ['am_liam', 'Liam · en-us · Male'], ['af_heart', 'Heart · en-us · Female']];
  var STOCK = { pixabay: { name: 'Pixabay', keyField: 'pixabayKey' }, pexels: { name: 'Pexels', keyField: 'pexelsKey' } };
  function vopt() {
    var v = state.settings.video || {};
    // earlier versions kept the footage key inside the video options: move it to the settings
    if (v.pixabayKey && !state.settings.pixabayKey) state.settings.pixabayKey = v.pixabayKey;
    if (v.pexelsKey && !state.settings.pexelsKey) state.settings.pexelsKey = v.pexelsKey;
    if (v.provider && !state.settings.stockProvider) state.settings.stockProvider = v.provider;
    delete v.pixabayKey; delete v.pexelsKey; delete v.provider;
    state.settings.video = Object.assign({}, VID_DEFAULTS, v);
    return state.settings.video;
  }
  function stockProvider() { return STOCK[state.settings.stockProvider] ? state.settings.stockProvider : 'pixabay'; }
  function stockKey() { return String(state.settings[STOCK[stockProvider()].keyField] || '').trim(); }
  function vhooks() { return window.__ASG_VIDEO_HOOKS || {}; }
  function hashStr(s) { var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function mid(sc) { if (!sc.mediaId) { sc.mediaId = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); persistScripts(); } return sc.mediaId; }

  /* ---------- narration ---------- */
  var ACRONYMS = { US: 'U S', UK: 'U K', UN: 'U N', EU: 'E U', AI: 'A I', UAE: 'U A E', GDP: 'G D P', CEO: 'C E O', IMF: 'I M F', WHO: 'W H O' };
  function speechClean(t) {
    t = String(t || '');
    t = t.replace(/https?:\/\/\S+/g, ' ').replace(/(^|\s)#\w+/g, ' ').replace(/[*_`~]+/g, '');
    t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ');
    var UNITS = { bn: 'billion', b: 'billion', m: 'million', mn: 'million', k: 'thousand', tn: 'trillion' };
    t = t.replace(/([$€£])\s?(\d[\d,]*(?:\.\d+)?)\s?(trillion|billion|million|thousand|bn|mn|tn|m|b|k)?\b/gi, function (m, sym, n, u) {
      var name = sym === '$' ? 'dollars' : (sym === '€' ? 'euros' : 'pounds');
      var unit = u ? (UNITS[u.toLowerCase()] || u.toLowerCase()) : '';
      return n + (unit ? ' ' + unit : '') + ' ' + name;
    });
    t = t.replace(/(\d)\s?%/g, '$1 percent').replace(/&/g, ' and ').replace(/°\s?C\b/g, ' degrees Celsius').replace(/°\s?F\b/g, ' degrees Fahrenheit');
    t = t.replace(/\b(US|UK|UN|EU|AI|UAE|GDP|CEO|IMF|WHO)\b/g, function (m) { return ACRONYMS[m] || m; });
    t = t.replace(/\s[—–]\s/g, ', ').replace(/[—–]/g, ', ').replace(/[()\[\]]/g, ' ');
    return t.replace(/\s+/g, ' ').trim();
  }
  // Captions show the normal spelling, not the spaced-out letters used to make the voice say them correctly.
  function captionFix(t) { return String(t).replace(/\b(U S|U K|U N|E U|A I|U A E|G D P|C E O|I M F|W H O)\b/g, function (m) { return m.replace(/ /g, ''); }); }
  function endPunct(s) { s = String(s || '').trim(); return s && !/[.!?]["')”]*$/.test(s) ? s + '.' : s; }
  function buildNarration(sc) {
    return [sc.hook, sc.body, sc.analysis, sc.cta].map(function (x) { return endPunct(speechClean(x)); }).filter(Boolean).join(' ');
  }
  function narrationOf(sc) { return (typeof sc.narration === 'string' && sc.narration.trim()) ? sc.narration.trim() : buildNarration(sc); }
  function breakLong(s) {
    if (s.length <= 200) return [s];
    var parts = s.split(/(?<=[,;:])\s+/), out = [], cur = '';
    parts.forEach(function (p) {
      if (cur && (cur + ' ' + p).length > 170) { out.push(cur); cur = p; } else { cur = cur ? cur + ' ' + p : p; }
    });
    if (cur) out.push(cur);
    return out;
  }
  function narrationSentences(text) {
    var out = [];
    splitSentences(text).forEach(function (s) { breakLong(s).forEach(function (x) { if (/[A-Za-z0-9]/.test(x)) out.push(x.trim()); }); });
    return out;
  }

  /* ---------- storage (IndexedDB, with an in-memory fallback) ---------- */
  var idbP = null, memStore = { media: {}, parts: {} };
  function idb() {
    if (idbP) return idbP;
    idbP = new Promise(function (res, rej) {
      try {
        var r = indexedDB.open('asg-media', 1);
        r.onupgradeneeded = function () { var d = r.result; ['media', 'parts'].forEach(function (n) { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); }); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      } catch (e) { rej(e); }
    });
    return idbP;
  }
  function idbDo(store, mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(store, mode), rq = fn(tx.objectStore(store));
        tx.oncomplete = function () { res(rq && rq.result); };
        tx.onerror = tx.onabort = function () { rej(tx.error); };
      });
    });
  }
  function dbPut(store, rec) { memStore[store][rec.id] = rec; return idbDo(store, 'readwrite', function (s) { return s.put(rec); }).catch(function (e) { LOG('not saved to browser storage (kept for this visit only): ' + (e && e.message)); return null; }); }
  function dbGet(store, id) { return idbDo(store, 'readonly', function (s) { return s.get(id); }).then(function (r) { return r || memStore[store][id] || null; }).catch(function () { return memStore[store][id] || null; }); }
  function dbDel(store, id) { delete memStore[store][id]; return idbDo(store, 'readwrite', function (s) { return s.delete(id); }).catch(function () { return null; }); }
  function dbAll(store) { return idbDo(store, 'readonly', function (s) { return s.getAll(); }).then(function (r) { return (r && r.length) ? r : Object.keys(memStore[store]).map(function (k) { return memStore[store][k]; }); }).catch(function () { return Object.keys(memStore[store]).map(function (k) { return memStore[store][k]; }); }); }
  function dbClear(store) { memStore[store] = {}; return idbDo(store, 'readwrite', function (s) { return s.clear(); }).catch(function () { return null; }); }

  /* ---------- audio, captions, zip ---------- */
  function timelineSamples(tl) {
    var out = new Float32Array(Math.ceil(tl.total * tl.rate) + 1);
    tl.items.forEach(function (it) { var off = Math.round(it.start * tl.rate), n = Math.min(it.samples.length, out.length - off); for (var i = 0; i < n; i++) out[off + i] = it.samples[i]; });
    return out;
  }
  function wavBlob(samples, rate) {
    var n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function w(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) { var x = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
    return new Blob([buf], { type: 'audio/wav' });
  }
  function srtTime(t) {
    var ms = Math.max(0, Math.round(t * 1000)), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, x = ms % 1000;
    function p(n, l) { n = String(n); while (n.length < l) n = '0' + n; return n; }
    return p(h, 2) + ':' + p(m, 2) + ':' + p(s, 2) + ',' + p(x, 3);
  }
  function buildSrt(tl) {
    return tl.chunks.map(function (c, i) { return (i + 1) + '\n' + srtTime(c.start) + ' --> ' + srtTime(c.end) + '\n' + c.words.map(function (w) { return w.w; }).join(' ') + '\n'; }).join('\n');
  }
  var CRC_T = null;
  function crc32(u8) {
    if (!CRC_T) { CRC_T = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) crc = CRC_T[(crc ^ u8[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  // Minimal ZIP writer (stored, no compression: videos are already compressed).
  function zipFiles(files) {
    var enc = new TextEncoder(), d = new Date();
    var dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
    var dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true);
      h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(h.buffer, name, f.data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true);
      c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(c.buffer, name);
      offset += 30 + name.length + f.data.length;
    });
    var csize = 0; central.forEach(function (x) { csize += x.byteLength !== undefined ? x.byteLength : x.length; });
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [e.buffer]), { type: 'application/zip' });
  }
  function blobBytes(b) { return b.arrayBuffer().then(function (x) { return new Uint8Array(x); }); }

  /* ---------- voice (runs in a worker so the page stays responsive) ---------- */
  var KOKORO_URL = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm', KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
  var TTS_WORKER_SRC = [
    'let tts=null;',
    'self.onmessage=async(e)=>{const m=e.data;try{',
    "if(m.type==='init'){const mod=await import(m.url);tts=await mod.KokoroTTS.from_pretrained(m.model,{dtype:m.dtype,device:m.device,progress_callback:(p)=>{if(p&&p.status==='progress'&&p.total)self.postMessage({type:'progress',file:p.file,loaded:p.loaded,total:p.total});}});self.postMessage({type:'ready',voices:JSON.parse(JSON.stringify(tts.voices||{}))});}",
    "else if(m.type==='gen'){const a=await tts.generate(m.text,{voice:m.voice,speed:m.speed});const s=a.audio;self.postMessage({type:'audio',id:m.id,samples:s,rate:a.sampling_rate},[s.buffer]);}",
    "}catch(err){self.postMessage({type:'error',id:m.id,message:String((err&&err.message)||err)});}};"
  ].join('\n');
  var ttsPromise = null, ttsEngine = '', ttsOnStatus = null, ttsWhere = '';
  function ttsProgress(files, file, loaded, total) {
    files[file] = [loaded, total];
    var l = 0, t = 0; for (var k in files) { l += files[k][0]; t += files[k][1]; }
    if (ttsOnStatus) ttsOnStatus('Downloading the voice (first time only): ' + Math.round(l / 1e6) + ' of ' + Math.round(t / 1e6) + ' MB');
  }
  function dtypeFor(engine) { return engine === 'webgpu' ? 'fp32' : 'q8'; }
  function startWorkerTts(engine) {
    return new Promise(function (resolve, reject) {
      var w;
      try { w = new Worker(URL.createObjectURL(new Blob([TTS_WORKER_SRC], { type: 'text/javascript' })), { type: 'module' }); } catch (e) { return reject(e); }
      var files = {}, pending = {}, nid = 1, ready = false;
      w.onerror = function (e) {
        var err = new Error((e && e.message) || 'voice worker failed');
        if (!ready) { try { w.terminate(); } catch (x) {} return reject(err); }
        Object.keys(pending).forEach(function (k) { pending[k].reject(err); }); pending = {};
      };
      w.onmessage = function (e) {
        var m = e.data;
        if (m.type === 'progress') ttsProgress(files, m.file, m.loaded, m.total);
        else if (m.type === 'ready') {
          ready = true; ttsWhere = 'worker';
          resolve({ voices: m.voices || {}, generate: function (text, voice, speed) { return new Promise(function (res, rej) { var id = nid++; pending[id] = { resolve: res, reject: rej }; w.postMessage({ type: 'gen', id: id, text: text, voice: voice, speed: speed }); }); } });
        } else if (m.type === 'audio') { var p = pending[m.id]; if (p) { delete pending[m.id]; p.resolve({ samples: m.samples, rate: m.rate }); } }
        else if (m.type === 'error') {
          if (!ready) { try { w.terminate(); } catch (x) {} reject(new Error(m.message)); }
          else if (pending[m.id]) { pending[m.id].reject(new Error(m.message)); delete pending[m.id]; }
        }
      };
      w.postMessage({ type: 'init', url: KOKORO_URL, model: KOKORO_MODEL, dtype: dtypeFor(engine), device: engine === 'webgpu' ? 'webgpu' : 'wasm' });
    });
  }
  function startMainTts() {
    var files = {};
    return import(KOKORO_URL).then(function (mod) {
      return mod.KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: 'q8', device: 'wasm', progress_callback: function (p) { if (p && p.status === 'progress' && p.total) ttsProgress(files, p.file, p.loaded, p.total); } });
    }).then(function (tts) {
      ttsWhere = 'page';
      return { voices: tts.voices || {}, generate: function (text, voice, speed) { return tts.generate(text, { voice: voice, speed: speed }).then(function (a) { return { samples: a.audio, rate: a.sampling_rate }; }); } };
    });
  }
  function getTts(onStatus) {
    var h = vhooks();
    if (h.tts) return Promise.resolve({ voices: h.voices || {}, generate: h.tts });
    ttsOnStatus = onStatus || null;
    var o = vopt();
    if (ttsPromise && ttsEngine === o.engine) return ttsPromise;
    ttsEngine = o.engine;
    var tryWorker = function (engine) { return startWorkerTts(engine); };
    ttsPromise = tryWorker(o.engine).catch(function (e) {
      if (o.engine === 'webgpu') { LOG('fast voice engine unavailable (' + (e && e.message) + '), trying the standard engine'); return tryWorker('wasm'); }
      throw e;
    }).catch(function (e) {
      LOG('voice worker unavailable (' + (e && e.message) + '), running the voice on the page instead');
      return startMainTts();
    }).catch(function (e) { ttsPromise = null; throw e; });
    return ttsPromise;
  }
  function trimSilence(s, rate) {
    var th = 0.004, a = 0, b = s.length - 1;
    while (a < b && Math.abs(s[a]) < th) a++;
    while (b > a && Math.abs(s[b]) < th) b--;
    var pad = Math.round(rate * 0.04);
    a = Math.max(0, a - pad); b = Math.min(s.length - 1, b + pad);
    return s.slice(a, b + 1);
  }
  function synthesize(sentences, voice, speed, onProgress, onStatus, run) {
    return getTts(onStatus).then(function (tts) {
      var parts = [], i = 0;
      return (function next() {
        if (run && run.cancelled) throw cancelError();
        if (i >= sentences.length) return parts;
        var idx = i++;
        if (onProgress) onProgress(idx, sentences.length);
        return tts.generate(sentences[idx], voice, speed).then(function (r) {
          if (!r || !r.samples || !r.samples.length) throw new Error('The voice returned no audio for: "' + sentences[idx].slice(0, 60) + '"');
          parts.push({ text: sentences[idx], samples: trimSilence(r.samples, r.rate), rate: r.rate });
          return next();
        });
      })();
    });
  }
  function cancelError() { return Object.assign(new Error('Cancelled'), { cancelled: true }); }

  /* ---------- timeline: sentences, scenes, caption chunks ---------- */
  function buildTimeline(parts) {
    var rate = parts[0].rate, GAP = 0.2, LEAD = 0.35, TAIL = 0.9, t = LEAD, items = [];
    parts.forEach(function (p) {
      var dur = p.samples.length / p.rate;
      items.push({ text: p.text, start: t, end: t + dur, samples: p.samples });
      t += dur + GAP;
    });
    var total = t - GAP + TAIL;
    var scenes = [], cur = null;
    items.forEach(function (it) {
      if (!cur || (cur.items[cur.items.length - 1].end - cur.items[0].start) >= 3) { cur = { items: [], start: scenes.length ? it.start - GAP / 2 : 0 }; scenes.push(cur); }
      cur.items.push(it);
    });
    scenes.forEach(function (s, i) { s.end = i + 1 < scenes.length ? scenes[i + 1].start : total; s.text = s.items.map(function (x) { return x.text; }).join(' '); s.video = null; });
    var chunks = [];
    items.forEach(function (it) {
      var words = captionFix(it.text).split(/\s+/).filter(Boolean);
      var wts = words.map(function (w) { return w.length + 2 + (/[,;:]$/.test(w) ? 3 : 0) + (/[.!?]["')”]*$/.test(w) ? 5 : 0); });
      var sum = wts.reduce(function (a, b) { return a + b; }, 0), tt = it.start, ws = [];
      words.forEach(function (w, i) { var d = (it.end - it.start) * wts[i] / sum; ws.push({ w: w, s: tt, e: tt + d }); tt += d; });
      var group = [];
      ws.forEach(function (w, i) {
        group.push(w);
        if (group.length >= 4 || /[,;:.!?]["')”]*$/.test(w.w) || i === ws.length - 1) { chunks.push({ words: group, start: group[0].s, end: group[group.length - 1].e }); group = []; }
      });
    });
    chunks.forEach(function (c, i) { c.end = i + 1 < chunks.length ? Math.max(c.end, Math.min(chunks[i + 1].start, c.end + 0.35)) : c.end + 0.2; });
    return { rate: rate, items: items, scenes: scenes, chunks: chunks, total: total };
  }
  function timelineBuffer(actx, tl) {
    var buf = actx.createBuffer(1, Math.ceil(tl.total * tl.rate) + 1, tl.rate);
    buf.getChannelData(0).set(timelineSamples(tl));
    return buf;
  }

  /* ---------- footage: planning and search ---------- */
  function mediaFetch(url, opts) {
    var h = vhooks();
    if (h.fetch) return h.fetch(url, opts);
    return fetch(url, opts).catch(function (e) {
      var ep = window.AUTONOM_ASG && window.AUTONOM_ASG.mediaEndpoint;
      if (!ep) throw e;
      var headers = {};
      if (opts && opts.headers && opts.headers.Authorization) headers['X-Asg-Auth'] = opts.headers.Authorization;
      return fetch(ep + (ep.indexOf('?') > -1 ? '&' : '?') + 'u=' + encodeURIComponent(url), { headers: headers });
    });
  }
  function fallbackQuery(text, title) {
    var counts = {}, order = [];
    tokenize(text).concat(tokenize(title)).forEach(function (w) { if (!counts[w]) { counts[w] = 0; order.push(w); } counts[w]++; });
    order.sort(function (a, b) { return counts[b] - counts[a]; });
    return order.slice(0, 2).join(' ');
  }
  function sceneHash(scenes) { return hashStr(scenes.map(function (s) { return s.text; }).join('|')); }
  // Ask the AI which scenes need footage and what to search for. Abstract scenes (opinions, statistics, the closing
  // question) get a plain caption card instead of footage that only decorates.
  function planScenes(scenes, title) {
    var list = scenes.map(function (s, i) { return (i + 1) + '. ' + s.text; }).join('\n');
    var prompt = 'You plan stock footage for a vertical news short titled "' + title + '".\n' +
      'Below are numbered scenes, each is what the voice says over that scene. For every scene decide:\n' +
      '- "kind": "footage" if a camera could film something concrete that clearly fits the sentence (a place, a machine, weather, a crowd, an object). Use "card" when the sentence is abstract (an opinion, a statistic, a question to the viewer, an analysis) and footage would be mere decoration. Use "card" for the closing call-to-action scene.\n' +
      '- "query": a stock-library search of 2 to 4 words describing exactly what should be on screen.\n' +
      '- "alt": a different, more generic 2 to 3 word search that is still a safe fit.\n' +
      'Rules: no names of people or organisations, no brands, no abstract words (conflict, tension, crisis, strategy). Prefer neutral establishing shots to dramatic ones, so the footage cannot be mistaken for real footage of the event. Do not repeat the same query.\n\nScenes:\n' + list +
      '\n\nReply with JSON only: {"scenes":[{"kind":"footage","query":"...","alt":"..."}]} with exactly ' + scenes.length + ' items.';
    return callLLM(prompt, 'write').then(function (r) {
      var j = extractJson(r.text), arr = Array.isArray(j) ? j : (j && (j.scenes || j.queries));
      if (!Array.isArray(arr)) throw new Error('no plan');
      return scenes.map(function (s, i) {
        var x = arr[i], o = (x && typeof x === 'object') ? x : { query: x };
        var clean = function (v) { v = String(v || '').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim(); return v && v.length <= 50 ? v : ''; };
        var q = clean(o.query) || fallbackQuery(s.text, title);
        return { query: q, alt: clean(o.alt), kind: (o.kind === 'card' && i > 0) ? 'card' : 'footage' };
      });
    }).catch(function (e) {
      LOG('footage plan: using keyword fallback (' + (e && e.message) + ')');
      return scenes.map(function (s) { return { query: fallbackQuery(s.text, title), alt: '', kind: 'footage' }; });
    });
  }
  // Search results are cached for 24 hours (Pixabay requires it, and it saves requests).
  var FCACHE = 'asg_footage_cache';
  function cacheGet(k) { try { var c = JSON.parse(localStorage.getItem(FCACHE) || '{}'), e = c[k]; return e && Date.now() - e.t < 864e5 ? e.v : null; } catch (e) { return null; } }
  function cacheSet(k, v) {
    try {
      var c = JSON.parse(localStorage.getItem(FCACHE) || '{}'), keys = Object.keys(c);
      if (keys.length > 60) keys.sort(function (a, b) { return c[a].t - c[b].t; }).slice(0, 20).forEach(function (x) { delete c[x]; });
      c[k] = { t: Date.now(), v: v }; localStorage.setItem(FCACHE, JSON.stringify(c));
    } catch (e) {}
  }
  function pickFile(v, target) {
    var f = (v.video_files || []).filter(function (x) { return x.link && /mp4/.test(x.file_type || '') && x.width && x.height; });
    var portrait = f.filter(function (x) { return x.height >= x.width; });
    if (portrait.length) f = portrait;
    f.sort(function (a, b) { return Math.abs(a.width - target) - Math.abs(b.width - target); });
    return f[0] || null;
  }
  function normPixabay(j) {
    return ((j && j.hits) || []).map(function (h) {
      var f = h.videos && (h.videos.medium && h.videos.medium.url ? h.videos.medium : (h.videos.small && h.videos.small.url ? h.videos.small : null));
      return f ? { id: 'px' + h.id, duration: h.duration, user: h.user || '', page: h.pageURL || '', tags: h.tags || '', file: { link: f.url, width: f.width, height: f.height } } : null;
    }).filter(Boolean);
  }
  function normPexels(j, target) {
    return ((j && j.videos) || []).map(function (v) {
      var f = pickFile(v, target), slug = String(v.url || '').replace(/\/+$/, '').split('/').pop().replace(/-\d+$/, '').replace(/-/g, ' ');
      return f ? { id: 'pe' + v.id, duration: v.duration, user: (v.user && v.user.name) || '', page: v.url || '', tags: slug, file: { link: f.link, width: f.width, height: f.height } } : null;
    }).filter(Boolean);
  }
  function stockSearch(provider, q, key, target) {
    var ck = provider + '|' + q, hit = cacheGet(ck);
    if (hit) return Promise.resolve(hit);
    var url, opts;
    if (provider === 'pexels') { url = 'https://api.pexels.com/videos/search?orientation=portrait&size=medium&per_page=15&query=' + encodeURIComponent(q); opts = { headers: { Authorization: key } }; }
    else { url = 'https://pixabay.com/api/videos/?safesearch=true&per_page=20&key=' + encodeURIComponent(key) + '&q=' + encodeURIComponent(q.slice(0, 100)); opts = {}; }
    var label = STOCK[provider].name;
    return mediaFetch(url, opts).then(function (r) {
      if (r.status === 401 || r.status === 403 || r.status === 400) throw Object.assign(new Error(label + ' rejected the key. Check it in Settings.'), { fatal: true });
      if (r.status === 429) throw Object.assign(new Error(label + ' says too many requests. Wait a minute and try again.'), { fatal: true });
      if (!r.ok) throw new Error(label + ' answered ' + r.status);
      return r.json();
    }).then(function (j) { var out = provider === 'pexels' ? normPexels(j, target) : normPixabay(j); cacheSet(ck, out); return out; });
  }
  function tagSet(s) { var o = {}; String(s || '').toLowerCase().split(/[^a-z0-9]+/).forEach(function (w) { if (w.length > 2) o[w.slice(0, 4)] = 1; }); return o; }
  // Pick the clip whose tags best match the search words, not just the first result.
  function bestClip(vids, q, dur, used) {
    var qs = Object.keys(tagSet(q)), fresh = vids.filter(function (v) { return !used[v.id] && v.duration >= 2; });
    var scored = fresh.map(function (v, i) {
      var tg = tagSet(v.tags), s = 0; qs.forEach(function (w) { if (tg[w]) s += 2; });
      if (v.duration >= dur) s += 1;
      return { v: v, s: s, i: i };
    });
    scored.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    return scored.length ? scored[0].v : null;
  }
  function loadClip(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.setAttribute('playsinline', '');
      var done = false, to = setTimeout(function () { if (!done) { done = true; reject(new Error('clip timeout')); } }, timeoutMs || 20000);
      v.addEventListener('loadeddata', function () { if (!done) { done = true; clearTimeout(to); resolve(v); } });
      v.addEventListener('error', function () { if (!done) { done = true; clearTimeout(to); reject(new Error('clip could not be decoded')); } });
      v.src = url;
    });
  }
  function fetchSceneClip(scene, plan, provider, key, used, target, title) {
    var tries = [plan.query, plan.alt], words = String(plan.query || '').split(' ');
    if (words.length > 2) tries.push(words.slice(0, 2).join(' '));
    tries.push(fallbackQuery(scene.text, title) || 'city street');
    tries.push('city skyline');
    var seen = {};
    tries = tries.filter(function (q) { if (!q || seen[q]) return false; seen[q] = 1; return true; });
    var dur = scene.end - scene.start, ti = 0;
    return (function nextTry() {
      if (ti >= tries.length) return null;
      var q = tries[ti++];
      return stockSearch(provider, q, key, target).then(function (vids) {
        var pick = bestClip(vids, q, dur, used);
        if (!pick) return nextTry();
        used[pick.id] = 1;
        return mediaFetch(pick.file.link).then(function (r) {
          if (!r.ok) throw new Error('clip download ' + r.status);
          return r.blob();
        }).then(function (blob) {
          if (blob.size > 45e6) throw new Error('clip too large');
          return loadClip(URL.createObjectURL(blob));
        }).then(function (video) {
          return { video: video, query: q, credit: pick.user || '', page: pick.page || '' };
        }).catch(function (e) { if (e && e.fatal) throw e; LOG('clip skipped (' + q + '): ' + (e && e.message)); return nextTry(); });
      });
    })();
  }
  function attachFootage(tl, plan, title, provider, key, target, onProgress, run) {
    var used = {}, credits = {}, plain = 0, fatal = null, i = 0;
    return (function next() {
      if (run && run.cancelled) throw cancelError();
      if (i >= tl.scenes.length) return null;
      var idx = i++, p = plan[idx];
      if (onProgress) onProgress(idx, tl.scenes.length, p.query);
      if (p.kind === 'card' || fatal) { plain++; return next(); }
      return fetchSceneClip(tl.scenes[idx], p, provider, key, used, target, title).then(function (r) {
        if (r) { tl.scenes[idx].video = r.video; tl.scenes[idx].usedQuery = r.query; if (r.credit) credits[r.credit] = 1; } else { plain++; }
        return next();
      }).catch(function (e) { if (e && (e.fatal)) fatal = e; if (e && e.cancelled) throw e; plain++; return next(); });
    })().then(function () { return { plain: plain, credits: Object.keys(credits), error: fatal }; });
  }

  /* ---------- rendering ---------- */
  // Formats to try, best first. Encoders differ per browser and computer (a codec level that is too low rejects 720x1280),
  // so the recorder tries each in turn until one works.
  function pickMimes() {
    if (typeof MediaRecorder === 'undefined') return null;
    var c = ['video/mp4;codecs=avc1.640033,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4', ''];
    return c.filter(function (m) { if (!m) return true; try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } });
  }
  function coverDraw(ctx, v, W, H) {
    var vw = v.videoWidth || W, vh = v.videoHeight || H, s = Math.max(W / vw, H / vh), w = vw * s, h = vh * s;
    ctx.drawImage(v, (W - w) / 2, (H - h) / 2, w, h);
  }
  function drawPlain(ctx, W, H, now, idx) {
    var hue = [222, 262, 200, 340, 160][idx % 5];
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'hsl(' + hue + ',55%,13%)'); g.addColorStop(1, 'hsl(' + ((hue + 40) % 360) + ',60%,6%)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var cx = W * (0.5 + 0.25 * Math.sin(now * 0.35 + idx)), cy = H * (0.35 + 0.1 * Math.cos(now * 0.28 + idx));
    var r = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.9);
    r.addColorStop(0, 'hsla(' + hue + ',80%,55%,.28)'); r.addColorStop(1, 'hsla(' + hue + ',80%,55%,0)');
    ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
  }
  function drawCaption(ctx, W, H, chunk, now) {
    var size = Math.round(W * 0.078), maxW = W * 0.86, gap = size * 0.28;
    ctx.font = '800 ' + size + 'px system-ui,"Segoe UI",Roboto,Arial,sans-serif';
    ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    var lines = [], line = [], lw = 0;
    chunk.words.forEach(function (w) {
      var ww = ctx.measureText(w.w).width;
      if (line.length && lw + gap + ww > maxW) { lines.push({ ws: line, w: lw }); line = []; lw = 0; }
      lw += (line.length ? gap : 0) + ww; line.push({ w: w, ww: ww });
    });
    if (line.length) lines.push({ ws: line, w: lw });
    var lh = size * 1.25, y0 = H * 0.64 - (lines.length * lh) / 2 + lh / 2;
    lines.forEach(function (ln, li) {
      var x = (W - ln.w) / 2, y = y0 + li * lh;
      ln.ws.forEach(function (it) {
        var active = now >= it.w.s && now < it.w.e;
        ctx.lineWidth = size * 0.2; ctx.strokeStyle = 'rgba(0,0,0,.92)'; ctx.strokeText(it.w.w, x, y);
        ctx.fillStyle = active ? '#ffd400' : '#ffffff'; ctx.fillText(it.w.w, x, y);
        x += it.ww + gap;
      });
    });
  }
  function renderVideo(tl, opts, onProgress, canvasHost, run) {
    var mimes = pickMimes();
    if (!mimes) return Promise.reject(new Error('This browser cannot record video. Use a current Chrome, Edge or Safari.'));
    var i = 0, lastErr = null;
    return (function attempt() {
      if (i >= mimes.length) return Promise.reject(lastErr || new Error('No supported video format found in this browser.'));
      var m = mimes[i++];
      return renderAttempt(tl, opts, onProgress, canvasHost, m, run).catch(function (e) {
        lastErr = e;
        if (e && e.encoder && i < mimes.length) { LOG('recording format failed (' + (m || 'default') + '): ' + e.message + '. Trying the next format.'); return attempt(); }
        throw e;
      });
    })();
  }
  function renderAttempt(tl, opts, onProgress, canvasHost, mime, run) {
    return new Promise(function (resolve, reject) {
      var W = opts.w, H = opts.h;
      var canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; canvas.className = 'asg-vid-canvas';
      if (canvasHost) { canvasHost.innerHTML = ''; canvasHost.appendChild(canvas); }
      var ctx = canvas.getContext('2d');
      var AC = window.AudioContext || window.webkitAudioContext, actx = new AC(); // default rate: some encoders reject unusual rates; the buffer is resampled automatically
      var buf = timelineBuffer(actx, tl), src = actx.createBufferSource(), dest = actx.createMediaStreamDestination();
      src.buffer = buf; src.connect(dest);
      var vstream = canvas.captureStream(30);
      var stream = new MediaStream(vstream.getVideoTracks().concat(dest.stream.getAudioTracks()));
      var rec, chunks = [], finished = false, cur = -1, t0 = 0, stopped = false;
      var onVis = function () { if (document.hidden && !stopped) toast('Keep this tab visible while the video records. Switching away freezes the picture.', 'error'); };
      var cleanup = function () {
        try { document.removeEventListener('visibilitychange', onVis); } catch (e) {}
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        try { actx.close(); } catch (e) {}
        tl.scenes.forEach(function (s) { if (s.video) { try { s.video.pause(); } catch (e) {} } });
      };
      try { rec = new MediaRecorder(stream, Object.assign({ videoBitsPerSecond: W >= 1000 ? 7e6 : 4e6, audioBitsPerSecond: 128000 }, mime ? { mimeType: mime } : {})); }
      catch (e) { cleanup(); return reject(Object.assign(new Error('Recording is not supported here: ' + e.message), { encoder: true })); }
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onerror = function (e) { if (finished) return; finished = true; stopped = true; cleanup(); reject(Object.assign(new Error('Recording failed: ' + ((e && e.error && e.error.message) || 'unknown')), { encoder: true })); };
      rec.onstop = function () {
        if (finished) return; finished = true; cleanup();
        var type = rec.mimeType || mime || 'video/webm';
        var blob = new Blob(chunks, { type: type });
        if (!blob.size) return reject(new Error('The recording came out empty.'));
        resolve({ blob: blob, mime: type, ext: /mp4/.test(type) ? 'mp4' : 'webm', duration: tl.total, w: W, h: H });
      };
      if (run) run.abort = function () { if (finished) return; finished = true; stopped = true; try { rec.stop(); } catch (e) {} cleanup(); reject(cancelError()); };
      function sceneAt(now) { for (var i = tl.scenes.length - 1; i >= 0; i--) if (now >= tl.scenes[i].start) return i; return 0; }
      function chunkAt(now) { for (var i = 0; i < tl.chunks.length; i++) if (now >= tl.chunks[i].start && now < tl.chunks[i].end) return tl.chunks[i]; return null; }
      function playClip(s) { if (s && s.video && s.video.paused) { try { var p = s.video.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} } }
      function frame() {
        if (stopped) return;
        var now = actx.currentTime - t0;
        if (now >= tl.total) { stopped = true; try { rec.stop(); } catch (e) { rec.onstop(); } return; }
        if (now < 0) now = 0;
        var si = sceneAt(now), sc = tl.scenes[si];
        if (si !== cur) { if (cur >= 0 && tl.scenes[cur].video) { var old = tl.scenes[cur].video; setTimeout(function () { try { old.pause(); } catch (e) {} }, 400); } cur = si; }
        playClip(sc);
        var nx = tl.scenes[si + 1]; if (nx && now >= nx.start - 0.4) playClip(nx);
        var usedVideo = sc.video && sc.video.readyState >= 2;
        if (usedVideo) coverDraw(ctx, sc.video, W, H); else drawPlain(ctx, W, H, now, si);
        var g = ctx.createLinearGradient(0, H * 0.35, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.62)');
        ctx.fillStyle = g; ctx.fillRect(0, H * 0.35, W, H * 0.65);
        var g2 = ctx.createLinearGradient(0, 0, 0, H * 0.18); g2.addColorStop(0, 'rgba(0,0,0,.4)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H * 0.18);
        var ch = chunkAt(now); if (ch) drawCaption(ctx, W, H, ch, now);
        if (usedVideo && opts.tag) {
          ctx.font = '600 ' + Math.round(W * 0.028) + 'px system-ui,Arial,sans-serif'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(255,255,255,.85)';
          ctx.fillText('Illustrative footage', W * 0.045, H * 0.03);
        }
        ctx.fillStyle = '#ffd400'; ctx.fillRect(0, H - Math.max(6, H * 0.004), W * Math.min(1, now / tl.total), Math.max(6, H * 0.004));
        if (onProgress) onProgress(now / tl.total, tl.total);
        requestAnimationFrame(frame);
      }
      var go = function () {
        document.addEventListener('visibilitychange', onVis);
        t0 = actx.currentTime + 0.15;
        try { src.start(t0); } catch (e) { cleanup(); return reject(e); }
        try { rec.start(250); } catch (e) { finished = true; stopped = true; cleanup(); return reject(Object.assign(new Error('Recording could not start: ' + e.message), { encoder: true })); }
        playClip(tl.scenes[0]);
        requestAnimationFrame(frame);
        setTimeout(function () { if (!stopped) { stopped = true; try { rec.stop(); } catch (e) { rec.onstop(); } } }, (tl.total + 25) * 1000);
      };
      if (actx.state === 'suspended') actx.resume().then(go, go); else go();
    });
  }

  /* ---------- upload details (title, description, tags) ---------- */
  function uploadMeta(sc, credits, provider) {
    var title = String(sc.title || sc.storyTitle || '').slice(0, 100);
    var disc = state.profile && state.profile.constraints && state.profile.constraints.requiredDisclosure;
    var desc = String(sc.description || '').trim();
    if (disc && desc.toLowerCase().indexOf(String(disc).toLowerCase()) < 0) desc += '\n\n' + disc;
    if (credits && credits.length) desc += '\n\nStock footage: ' + (provider || 'Pixabay') + ' (' + credits.join(', ') + ')';
    if (!/#shorts/i.test(desc)) desc += '\n\n#Shorts';
    var tags = (sc.tags || []).map(cleanTag).filter(Boolean);
    if (tags.map(function (t) { return t.toLowerCase(); }).indexOf('shorts') < 0) tags.push('Shorts');
    return { title: title, description: desc, tags: tags };
  }
  function uploadText(m) { return 'TITLE\n' + m.title + '\n\nDESCRIPTION\n' + m.description + '\n\nTAGS\n' + m.tags.join(', ') + '\n'; }
  function slugOf(sc, i) {
    var s = String(sc.title || sc.storyTitle || 'short').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'short';
    return (i + 1 < 10 ? '0' : '') + (i + 1) + '-' + s;
  }

  /* ---------- UI ---------- */
  var vidBusy = false, vidRun = null, vidTimer = null, origTitle = '';
  function ensureVideoStyle() {
    if (document.getElementById('asg-video-style')) return;
    var st = document.createElement('style'); st.id = 'asg-video-style';
    st.textContent = [
      '.asg-vid-box{border:1px solid #d9dee7;border-radius:12px;background:#fff;color:#1b2430;padding:14px 16px;margin:0 0 14px;}',
      '.asg-vid-box h3,.asg-vid-box h4{margin:0 0 6px;line-height:1.3;}',
      '.asg-vid-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-top:10px;}',
      '.asg-vid-box label{display:block;font-size:13px;font-weight:600;margin:0 0 4px;}',
      '.asg-vid-box input[type=text],.asg-vid-box input[type=password],.asg-vid-box input[type=number],.asg-vid-box select,.asg-vid-box textarea{width:100%;box-sizing:border-box;font:inherit;padding:7px 9px;border:1px solid #cbd3df;border-radius:8px;background:#fff;color:#1b2430;}',
      '.asg-vid-box textarea{min-height:120px;line-height:1.5;resize:vertical;}',
      '.asg-vid-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:10px;}',
      '.asg-vid-note{font-size:13px;color:#5b6676;margin:6px 0 0;}',
      '.asg-vid-status{font-size:14px;color:#1b2430;margin:10px 0 0;min-height:18px;}',
      '.asg-vid-status.is-err{color:#b3261e;}.asg-vid-status.is-ok{color:#17633a;}',
      '.asg-vid-stages{display:none;gap:8px;flex-wrap:wrap;margin-top:12px;}',
      '.asg-vid-stages.is-on{display:flex;}',
      '.asg-vid-stage{display:inline-flex;gap:6px;align-items:center;padding:4px 10px;border-radius:999px;border:1px solid #d9dee7;font-size:13px;font-weight:600;color:#7a8596;}',
      '.asg-vid-stage.is-active{border-color:#3956d6;color:#3956d6;background:#eef2ff;}',
      '.asg-vid-stage.is-done{border-color:#b6e3c4;color:#17633a;background:#e8f7ee;}',
      '.asg-vid-stage.is-active::before{content:"";width:10px;height:10px;border-radius:50%;border:2px solid #3956d6;border-top-color:transparent;animation:asgspin .8s linear infinite;}',
      '.asg-vid-stage.is-done::before{content:"✓";}',
      '@keyframes asgspin{to{transform:rotate(360deg);}}',
      '.asg-vid-bar{height:8px;border-radius:4px;background:#e6e9f0;overflow:hidden;margin-top:10px;display:none;}',
      '.asg-vid-bar i{display:block;height:100%;width:0;background:#3956d6;transition:width .25s;}',
      '.asg-vid-meta{display:none;justify-content:space-between;gap:8px;font-size:12px;color:#5b6676;margin-top:6px;}',
      '.asg-vid-preview{margin-top:12px;display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;}',
      '.asg-vid-canvas,.asg-vid-player{width:225px;max-width:100%;aspect-ratio:9/16;border-radius:10px;background:#000;display:block;}',
      '.asg-vid-side{flex:1;min-width:260px;}',
      '.asg-vid-field{margin:0 0 10px;}',
      '.asg-vid-copy{margin-top:4px;padding:4px 10px;font-size:12px;}',
      '.asg-vid-plan{margin-top:12px;border-top:1px solid #eef1f6;padding-top:10px;}',
      '.asg-vid-plan summary{cursor:pointer;font-weight:600;font-size:14px;}',
      '.asg-vid-scene{display:grid;grid-template-columns:44px 1fr;gap:4px 10px;margin:10px 0;font-size:13px;}',
      '.asg-vid-scene p{margin:0;color:#4a5568;}',
      '.asg-vid-scene .asg-vid-edit{display:grid;grid-template-columns:1fr 130px;gap:8px;grid-column:2;}',
      '.asg-exp-media{display:grid;gap:10px;margin:0 0 16px;}',
      '.asg-exp-item{border:1px solid #d9dee7;border-radius:12px;background:#fff;color:#1b2430;padding:12px 14px;}',
      '.asg-exp-item h4{margin:0 0 8px;font-size:15px;line-height:1.3;}',
      '.asg-exp-links{display:flex;flex-wrap:wrap;gap:8px;}',
      '.asg-exp-links a,.asg-exp-links span{padding:5px 10px;border-radius:8px;border:1px solid #cbd3df;font-size:13px;font-weight:600;text-decoration:none;color:#3956d6;background:#fff;}',
      '.asg-exp-links span{color:#9aa4b2;border-style:dashed;font-weight:500;}'
    ].join('\n');
    document.head.appendChild(st);
  }
  function fmtTime(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function fmtMB(b) { return (b / 1e6).toFixed(1) + ' MB'; }
  function vidSettingsBox() {
    var o = vopt();
    var box = el('div', { class: 'asg-vid-box' });
    box.appendChild(el('h3', { text: 'Video settings' }));
    box.appendChild(el('p', { class: 'asg-vid-note', text: 'The voice runs on your computer and the video is recorded as it plays, so a 40 second short takes about a minute or two. You can keep using other tabs only if this one stays open and visible.' }));
    var grid = el('div', { class: 'asg-vid-grid' });
    var voiceSel = el('select', { id: 'asg-vid-voice' });
    var fill = function (extra) {
      var cur = vopt().voice; voiceSel.innerHTML = '';
      var seen = {};
      BUILTIN_VOICES.forEach(function (v) { seen[v[0]] = 1; voiceSel.appendChild(el('option', { value: v[0], text: v[1] })); });
      Object.keys(extra || {}).forEach(function (id) {
        if (seen[id]) return; var v = extra[id] || {};
        voiceSel.appendChild(el('option', { value: id, text: (v.name || id) + ' · ' + (v.language || '') + (v.gender ? ' · ' + v.gender : '') }));
      });
      if (!seen[cur] && !(extra && extra[cur])) voiceSel.appendChild(el('option', { value: cur, text: cur }));
      voiceSel.value = cur;
    };
    fill();
    grid.appendChild(el('div', {}, [el('label', { text: 'Voice' }), voiceSel]));
    grid.appendChild(el('div', {}, [el('label', { text: 'Speed' }), el('input', { type: 'number', id: 'asg-vid-speed', min: '0.7', max: '1.3', step: '0.05', value: String(o.speed) })]));
    var res = el('select', { id: 'asg-vid-res' }); [['720', '720 × 1280 (faster)'], ['1080', '1080 × 1920 (sharper)']].forEach(function (x) { res.appendChild(el('option', { value: x[0], text: x[1] })); });
    res.value = o.res; grid.appendChild(el('div', {}, [el('label', { text: 'Quality' }), res]));
    var eng = el('select', { id: 'asg-vid-engine' }); [['wasm', 'Standard (works everywhere)'], ['webgpu', 'Fast (recent Chrome or Edge)']].forEach(function (x) { eng.appendChild(el('option', { value: x[0], text: x[1] })); });
    eng.value = o.engine; grid.appendChild(el('div', {}, [el('label', { text: 'Voice engine' }), eng]));
    box.appendChild(grid);
    var fr = el('div', { class: 'asg-vid-row' });
    var fc = el('input', { type: 'checkbox', id: 'asg-vid-footage' }); fc.checked = !!o.footage;
    fr.appendChild(el('label', { style: 'display:flex;gap:8px;align-items:center;margin:0;font-weight:600;' }, [fc, 'Use stock footage']));
    var tc = el('input', { type: 'checkbox', id: 'asg-vid-tag' }); tc.checked = !!o.tag;
    fr.appendChild(el('label', { style: 'display:flex;gap:8px;align-items:center;margin:0;font-weight:600;' }, [tc, 'Show an "Illustrative footage" label']));
    box.appendChild(fr);
    var keyNote = el('p', { class: 'asg-vid-note' });
    var syncKey = function () {
      var p = STOCK[stockProvider()];
      keyNote.textContent = stockKey()
        ? 'Footage library: ' + p.name + ' (key saved). Stock footage is generic, not footage of the event, so keep the label on.'
        : 'No ' + p.name + ' key saved, so videos use a clean dark background with big captions. Add a key under Settings > Footage library.';
    };
    syncKey(); box.appendChild(keyNote);
    var br = el('div', { class: 'asg-vid-row' });
    var lb = el('button', { class: 'asg-btn asg-btn-ghost', type: 'button', text: 'Load the full voice list' });
    var openSet = el('button', { class: 'asg-btn asg-btn-ghost', type: 'button', text: 'Open Settings' });
    var lst = el('span', { class: 'asg-vid-note', style: 'margin:0;' });
    br.appendChild(lb); br.appendChild(openSet); br.appendChild(lst); box.appendChild(br);
    var save = function () {
      var v = vopt();
      v.voice = voiceSel.value || v.voice; v.speed = Math.min(1.3, Math.max(0.7, parseFloat($('#asg-vid-speed').value) || 1));
      v.res = res.value; v.engine = eng.value; v.footage = fc.checked; v.tag = tc.checked;
      persistSettings();
    };
    box.addEventListener('change', save);
    openSet.addEventListener('click', openSettings);
    lb.addEventListener('click', function () {
      save(); lb.disabled = true; lst.textContent = 'Loading…';
      getTts(function (t) { lst.textContent = t; }).then(function (tts) { fill(tts.voices); save(); lst.textContent = 'Voice list loaded.'; })
        .catch(function (e) { lst.textContent = 'Could not load the voice: ' + (e && e.message ? e.message : e); }).then(function () { lb.disabled = false; });
    });
    return box;
  }
  function field(label, value, rows) {
    var f = el('div', { class: 'asg-vid-field' });
    f.appendChild(el('label', { text: label }));
    var inp = rows ? el('textarea', { readonly: 'readonly', style: 'min-height:' + rows + 'px;' }) : el('input', { type: 'text', readonly: 'readonly' });
    inp.value = value; f.appendChild(inp);
    var b = el('button', { class: 'asg-btn asg-btn-ghost asg-vid-copy', type: 'button', text: 'Copy' });
    b.addEventListener('click', function () { copyText(value).then(function () { toast(label + ' copied', 'success'); }); });
    f.appendChild(b); return f;
  }
  function planEditor(sc, card, rec) {
    var scenes = rec.scenes || [];
    if (!scenes.length) return null;
    var d = el('details', { class: 'asg-vid-plan' });
    d.appendChild(el('summary', { text: 'Footage plan: change what shows in each scene' }));
    d.appendChild(el('p', { class: 'asg-vid-note', text: 'Edit the search words or switch a scene to a plain caption card, then press "Re-record with this plan". The voice is reused, so this is quicker than starting over.' }));
    var edits = scenes.map(function (s) { return { query: s.query || '', alt: s.alt || '', kind: s.kind || 'footage' }; });
    scenes.forEach(function (s, i) {
      var row = el('div', { class: 'asg-vid-scene' });
      row.appendChild(el('strong', { text: fmtTime(s.start) }));
      row.appendChild(el('p', { text: s.text + (s.usedQuery && s.kind !== 'card' ? ' (showing: ' + s.usedQuery + ')' : '') }));
      var ed = el('div', { class: 'asg-vid-edit' });
      var q = el('input', { type: 'text', value: edits[i].query, 'aria-label': 'Search words for scene ' + (i + 1) });
      var k = el('select', { 'aria-label': 'Scene type ' + (i + 1) }); [['footage', 'Footage'], ['card', 'Caption card']].forEach(function (x) { k.appendChild(el('option', { value: x[0], text: x[1] })); });
      k.value = edits[i].kind;
      q.addEventListener('input', function () { edits[i].query = q.value; }); k.addEventListener('change', function () { edits[i].kind = k.value; });
      ed.appendChild(q); ed.appendChild(k); row.appendChild(ed); d.appendChild(row);
    });
    var go = el('button', { class: 'asg-btn asg-btn-primary', type: 'button', text: 'Re-record with this plan' });
    go.addEventListener('click', function () {
      sc.vplan = { hash: rec.sceneHash, scenes: edits.map(function (e, i) { return { query: String(e.query || '').trim() || fallbackQuery(scenes[i].text, sc.title || ''), alt: edits[i].alt || '', kind: e.kind }; }) };
      persistScripts(); makeVideo(sc, card, { keepPlan: true });
    });
    d.appendChild(go);
    return d;
  }
  function showVideoResult(sc, card, rec) {
    var host = $('.asg-vid-out', card); host.innerHTML = '';
    var url = URL.createObjectURL(rec.video);
    var player = el('video', { class: 'asg-vid-player', controls: 'controls', playsinline: '', src: url });
    var side = el('div', { class: 'asg-vid-side' });
    var base = String(sc.title || 'short').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'short';
    var links = el('div', { class: 'asg-vid-row', style: 'margin:0 0 10px;' });
    links.appendChild(el('a', { class: 'asg-btn asg-btn-primary', href: url, download: base + '.' + rec.ext, text: 'Download ' + rec.ext.toUpperCase() + ' (' + fmtMB(rec.video.size) + ')' }));
    if (rec.audio) links.appendChild(el('a', { class: 'asg-btn asg-btn-ghost', href: URL.createObjectURL(rec.audio), download: base + '.wav', text: 'Audio (WAV)' }));
    if (rec.srt) links.appendChild(el('a', { class: 'asg-btn asg-btn-ghost', href: URL.createObjectURL(new Blob([rec.srt], { type: 'text/plain' })), download: base + '.srt', text: 'Captions (SRT)' }));
    links.appendChild(el('a', { class: 'asg-btn asg-btn-ghost', href: 'https://studio.youtube.com', target: '_blank', rel: 'noopener noreferrer', text: 'Open YouTube Studio ↗' }));
    side.appendChild(links);
    var notes = [Math.round(rec.duration) + ' s · ' + rec.w + '×' + rec.h, 'saved in this browser'];
    if (rec.footage === 'plain') notes.push('plain background (no footage)');
    else if (rec.plain) notes.push(rec.plain + ' scene' + (rec.plain === 1 ? '' : 's') + ' without footage');
    side.appendChild(el('p', { class: 'asg-vid-note', style: 'margin:0 0 10px;', text: notes.join(' · ') }));
    var m = uploadMeta(sc, rec.credits, rec.provider);
    side.appendChild(field('Title', m.title)); side.appendChild(field('Description', m.description, 150)); side.appendChild(field('Tags', m.tags.join(', ')));
    var del = el('button', { class: 'asg-btn asg-btn-ghost', type: 'button', text: 'Delete this video' });
    del.addEventListener('click', function () { dbDel('media', rec.id).then(function () { host.innerHTML = ''; setStatus(card, 'Video deleted.', ''); refreshStorageNote(); }); });
    side.appendChild(del);
    host.appendChild(el('div', { class: 'asg-vid-preview' }, [player, side]));
    var pe = planEditor(sc, card, rec); if (pe) host.appendChild(pe);
  }
  function setStatus(card, t, cls) { var s = $('.asg-vid-status', card); if (s) { s.textContent = t; s.className = 'asg-vid-status' + (cls ? ' ' + cls : ''); } }
  function refreshStorageNote() {
    var n = $('#asg-vid-storage'); if (!n) return;
    dbAll('media').then(function (all) {
      var bytes = 0; all.forEach(function (r) { bytes += (r.video ? r.video.size : 0) + (r.audio ? r.audio.size : 0); });
      n.textContent = all.length ? 'Saved in this browser: ' + all.length + ' video' + (all.length === 1 ? '' : 's') + ' (' + fmtMB(bytes) + ').' : 'No videos saved yet.';
    });
  }
  function busyOn(card) {
    vidBusy = true; origTitle = document.title;
    $$('.asg-vid-make').forEach(function (b) { b.disabled = true; });
    window.onbeforeunload = function (e) { e.preventDefault(); e.returnValue = ''; return ''; };
    var t0 = Date.now(), el2 = $('.asg-vid-elapsed', card);
    vidTimer = setInterval(function () { if (el2) el2.textContent = 'Elapsed ' + fmtTime((Date.now() - t0) / 1000); }, 1000);
  }
  function busyOff() {
    vidBusy = false; vidRun = null; clearInterval(vidTimer); window.onbeforeunload = null;
    if (origTitle) document.title = origTitle;
    $$('.asg-vid-make').forEach(function (b) { b.disabled = false; });
  }
  function makeVideo(sc, card, opts) {
    opts = opts || {};
    if (vidBusy) { toast('One video at a time. Wait for the current one to finish.', 'error'); return Promise.resolve(); }
    var o = vopt(), run = { cancelled: false, abort: null }, stages = $$('.asg-vid-stage', card), stageBox = $('.asg-vid-stages', card);
    var bar = $('.asg-vid-bar', card), barI = $('i', bar), meta = $('.asg-vid-meta', card), pctEl = $('.asg-vid-pct', card), cancelBtn = $('.asg-vid-cancel', card);
    var setStage = function (name) {
      var order = ['voice', 'footage', 'record'], at = order.indexOf(name);
      stages.forEach(function (s) { var i = order.indexOf(s.dataset.st); s.className = 'asg-vid-stage' + (i < at ? ' is-done' : (i === at ? ' is-active' : '')); });
    };
    var setBar = function (p) {
      bar.style.display = p == null ? 'none' : 'block'; meta.style.display = p == null ? 'none' : 'flex';
      var pc = Math.round((p || 0) * 100); barI.style.width = pc + '%'; if (pctEl) pctEl.textContent = pc + '%';
      if (p != null) document.title = '⏳ ' + pc + '% · making video';
    };
    busyOn(card); vidRun = run; stageBox.classList.add('is-on'); cancelBtn.hidden = false;
    $('.asg-vid-out', card).innerHTML = ''; $('.asg-vid-live', card).innerHTML = '';
    var narr = $('.asg-vid-narr', card).value.trim(); sc.narration = narr; persistScripts();
    var sentences = narrationSentences(narr), id = mid(sc);
    var finish = function () { stageBox.classList.remove('is-on'); cancelBtn.hidden = true; setBar(null); busyOff(); };
    if (!sentences.length) { setStatus(card, 'The narration is empty.', 'is-err'); finish(); return Promise.resolve(); }
    cancelBtn.onclick = function () { run.cancelled = true; if (run.abort) run.abort(); setStatus(card, 'Cancelling…'); };
    var W = o.res === '1080' ? 1080 : 720, H = o.res === '1080' ? 1920 : 1280, provider = stockProvider();
    var useFootage = !!(o.footage && stockKey()), info = { footage: useFootage ? 'stock' : 'plain', plain: 0, credits: [], provider: STOCK[provider].name }, tl, plan = null, partsKey = hashStr(narr + '|' + o.voice + '|' + o.speed);
    setStage('voice'); setBar(0.02); setStatus(card, 'Preparing the voice…');
    return dbGet('parts', id).then(function (cached) {
      if (cached && cached.key === partsKey) { setStatus(card, 'Reusing the voice from last time.'); return cached.parts; }
      return synthesize(sentences, o.voice, o.speed, function (i, n) { setStatus(card, 'Speaking sentence ' + (i + 1) + ' of ' + n + '…'); setBar(0.05 + 0.4 * i / n); }, function (t) { setStatus(card, t); }, run)
        .then(function (parts) { return dbPut('parts', { id: id, key: partsKey, parts: parts }).then(function () { return parts; }); });
    }).then(function (parts) {
      if (run.cancelled) throw cancelError();
      tl = buildTimeline(parts);
      var hash = sceneHash(tl.scenes);
      setStage('footage'); setBar(0.5);
      var havePlan = opts.keepPlan && sc.vplan && sc.vplan.hash === hash && sc.vplan.scenes.length === tl.scenes.length;
      if (!useFootage) { plan = tl.scenes.map(function () { return { query: '', alt: '', kind: 'card' }; }); return null; }
      var planP = havePlan ? Promise.resolve(sc.vplan.scenes) : (setStatus(card, 'Planning the footage…'), planScenes(tl.scenes, sc.title || sc.storyTitle || ''));
      return planP.then(function (p) {
        plan = p; sc.vplan = { hash: hash, scenes: p }; persistScripts();
        return attachFootage(tl, plan, sc.title || sc.storyTitle || '', provider, stockKey(), W, function (i, n, q) { setStatus(card, 'Footage for scene ' + (i + 1) + ' of ' + n + (q ? ': "' + q + '"' : '')); setBar(0.5 + 0.3 * i / n); }, run);
      }).then(function (r) {
        info.plain = r.plain; info.credits = r.credits;
        if (r.error) toast(r.error.message, 'error');
        if (r.plain === tl.scenes.length) info.footage = 'plain';
      });
    }).then(function () {
      if (run.cancelled) throw cancelError();
      setStage('record'); setBar(0.8); setStatus(card, 'Recording the video (' + Math.round(tl.total) + ' s). Keep this tab open and visible.');
      return renderVideo(tl, { w: W, h: H, tag: !!o.tag && info.footage !== 'plain' }, function (p) { setBar(0.8 + 0.2 * p); }, $('.asg-vid-live', card), run);
    }).then(function (res) {
      $('.asg-vid-live', card).innerHTML = '';
      var rec = {
        id: id, title: sc.title || '', video: res.blob, ext: res.ext, mime: res.mime, duration: res.duration, w: res.w, h: res.h,
        audio: wavBlob(timelineSamples(tl), tl.rate), srt: buildSrt(tl), credits: info.credits, provider: info.provider, footage: info.footage, plain: info.plain,
        madeAt: new Date().toISOString(), sceneHash: sceneHash(tl.scenes),
        scenes: tl.scenes.map(function (s, i) { return { text: s.text, start: s.start, usedQuery: s.usedQuery || '', query: (plan[i] && plan[i].query) || '', alt: (plan[i] && plan[i].alt) || '', kind: (plan[i] && plan[i].kind) || 'card' }; })
      };
      return dbPut('media', rec).then(function () { showVideoResult(sc, card, rec); setStatus(card, 'Done. Saved in this browser.', 'is-ok'); refreshStorageNote(); });
    }).catch(function (e) {
      $('.asg-vid-live', card).innerHTML = '';
      if (e && e.cancelled) { setStatus(card, 'Cancelled.', ''); return; }
      LOG('video failed', e);
      setStatus(card, 'Could not make the video: ' + (e && e.message ? e.message : e), 'is-err');
    }).then(finish);
  }
  function renderVideoPanel() {
    ensureVideoStyle();
    var root = $('#asg-video-root'); if (!root) return;
    root.innerHTML = '';
    var scripts = goodScripts();
    if (!scripts.length) { root.appendChild(el('p', { class: 'asg-hint', text: 'No scripts yet. Generate and review scripts first.' })); return; }
    root.appendChild(vidSettingsBox());
    var storage = el('div', { class: 'asg-vid-row', style: 'margin:0 0 12px;' });
    storage.appendChild(el('span', { class: 'asg-vid-note', id: 'asg-vid-storage', style: 'margin:0;' }));
    var clr = el('button', { class: 'asg-btn asg-btn-ghost', type: 'button', text: 'Delete all saved videos' });
    clr.addEventListener('click', function () {
      if (vidBusy) return;
      if (!confirm('Delete every video saved in this browser? Your scripts stay.')) return;
      Promise.all([dbClear('media'), dbClear('parts')]).then(function () { renderVideoPanel(); });
    });
    storage.appendChild(clr); root.appendChild(storage); refreshStorageNote();
    var cards = [];
    scripts.forEach(function (sc, i) {
      var card = el('div', { class: 'asg-vid-box' });
      var st = scriptStatus(sc);
      card.appendChild(el('h4', { text: (i + 1) + '. ' + (sc.title || sc.storyTitle) }));
      var meta = el('div', { class: 'asg-vid-row', style: 'margin:0 0 8px;' });
      meta.appendChild(el('span', { class: 'asg-pill ' + st.cls, text: st.text }));
      meta.appendChild(el('span', { class: 'asg-pill ' + (sc.reviewed ? 'asg-pill-rev' : 'asg-pill-tpl'), text: sc.reviewed ? 'Reviewed ✓' : 'Not reviewed yet' }));
      card.appendChild(meta);
      card.appendChild(el('label', { text: 'Narration: only the words that will be spoken. No links, tags or sources. Letters like "U S" are spelled out on purpose so the voice says them right; captions show the normal spelling.' }));
      var ta = el('textarea', { class: 'asg-vid-narr' }); ta.value = narrationOf(sc);
      var cnt = el('p', { class: 'asg-vid-note' });
      var upd = function () { var w = wordCount(ta.value); cnt.textContent = w + ' words · about ' + Math.round(w / LEN.wps) + ' s spoken'; };
      ta.addEventListener('input', function () { sc.narration = ta.value; persistScripts(); upd(); });
      upd(); card.appendChild(ta); card.appendChild(cnt);
      var row = el('div', { class: 'asg-vid-row' });
      var mk = el('button', { class: 'asg-btn asg-btn-primary asg-vid-make', type: 'button', text: 'Make video' });
      mk.addEventListener('click', function () { makeVideo(sc, card); });
      var reset = el('button', { class: 'asg-btn asg-btn-ghost', type: 'button', text: 'Reset narration' });
      reset.addEventListener('click', function () { delete sc.narration; ta.value = buildNarration(sc); persistScripts(); upd(); });
      var cancel = el('button', { class: 'asg-btn asg-btn-ghost asg-vid-cancel', type: 'button', text: 'Cancel', hidden: 'hidden' });
      row.appendChild(mk); row.appendChild(reset); row.appendChild(cancel); card.appendChild(row);
      var stg = el('div', { class: 'asg-vid-stages' });
      [['voice', 'Voice'], ['footage', 'Footage'], ['record', 'Recording']].forEach(function (s, n) { stg.appendChild(el('span', { class: 'asg-vid-stage', 'data-st': s[0], text: (n + 1) + '. ' + s[1] })); });
      card.appendChild(stg);
      card.appendChild(el('div', { class: 'asg-vid-status' }));
      card.appendChild(el('div', { class: 'asg-vid-bar' }, [el('i')]));
      card.appendChild(el('div', { class: 'asg-vid-meta' }, [el('span', { class: 'asg-vid-elapsed', text: 'Elapsed 0:00' }), el('span', { class: 'asg-vid-pct', text: '0%' })]));
      card.appendChild(el('div', { class: 'asg-vid-live', style: 'margin-top:10px;' }));
      card.appendChild(el('div', { class: 'asg-vid-out' }));
      cards.push({ sc: sc, card: card });
      root.appendChild(card);
      dbGet('media', mid(sc)).then(function (rec) { if (rec && rec.video && !$('.asg-vid-out video', card) && !vidBusy) showVideoResult(sc, card, rec); });
    });
    var all = $('#asg-make-all');
    if (all) all.onclick = function () {
      if (vidBusy) { toast('A video is already being made.', 'error'); return; }
      var q = cards.slice(), next = function () { var c = q.shift(); if (!c) return; makeVideo(c.sc, c.card).then(function () { if (!(vidRun && vidRun.cancelled)) next(); }); };
      next();
    };
  }

  /* ---------- export: everything in one place ---------- */
  function mediaIndex() {
    return dbAll('media').then(function (all) { var m = {}; all.forEach(function (r) { m[r.id] = r; }); return m; });
  }
  function mediaPaths(sc, i, rec) {
    if (!rec) return null;
    var dir = slugOf(sc, i);
    return { video: dir + '/video.' + rec.ext, audio: dir + '/voiceover.wav', captions: dir + '/captions.srt', upload: dir + '/upload.txt', durationSec: Math.round(rec.duration), resolution: rec.w + 'x' + rec.h, footageLibrary: rec.footage === 'plain' ? null : rec.provider, madeAt: rec.madeAt };
  }
  function renderExportMedia() {
    var host = $('#asg-export-media'); if (!host) return Promise.resolve();
    ensureVideoStyle();
    return mediaIndex().then(function (idx) {
      host.innerHTML = '';
      var scripts = goodScripts(), have = 0;
      var list = el('div', { class: 'asg-exp-media' });
      scripts.forEach(function (sc, i) {
        var rec = idx[sc.mediaId || ''], item = el('div', { class: 'asg-exp-item' });
        item.appendChild(el('h4', { text: (i + 1) + '. ' + (sc.title || sc.storyTitle) }));
        var links = el('div', { class: 'asg-exp-links' });
        var base = slugOf(sc, i);
        var add = function (label, blob, name) { if (blob) links.appendChild(el('a', { href: URL.createObjectURL(blob), download: name, text: label })); else links.appendChild(el('span', { text: label + ': not made yet' })); };
        if (rec) have++;
        add('Video' + (rec ? ' (' + rec.ext.toUpperCase() + ', ' + fmtMB(rec.video.size) + ')' : ''), rec && rec.video, base + '.' + (rec ? rec.ext : 'mp4'));
        add('Audio (WAV)', rec && rec.audio, base + '.wav');
        add('Captions (SRT)', rec && rec.srt ? new Blob([rec.srt], { type: 'text/plain' }) : null, base + '.srt');
        var um = uploadMeta(sc, rec && rec.credits, rec && rec.provider);
        links.appendChild(el('a', { href: URL.createObjectURL(new Blob([uploadText(um)], { type: 'text/plain' })), download: base + '-upload.txt', text: 'Upload details (TXT)' }));
        item.appendChild(links); list.appendChild(item);
      });
      host.appendChild(list);
      if (!have) host.appendChild(el('p', { class: 'asg-hint', text: 'No videos made yet. Use the Video step, then come back: videos stay saved in this browser.' }));
    });
  }
  function downloadEverything() {
    toast('Building the ZIP…', 'success', 2500);
    return mediaIndex().then(function (idx) {
      var scripts = goodScripts(), files = [], enc = new TextEncoder(), jobs = [];
      var addText = function (name, text) { files.push({ name: name, data: enc.encode(text) }); };
      var payload = buildPayload(idx);
      addText('manifest.json', JSON.stringify(payload, null, 2));
      addText('all-scripts.txt', scripts.map(function (sc, i) { return '=== Script ' + (i + 1) + ' ===\n' + scriptToText(sc); }).join('\n\n'));
      scripts.forEach(function (sc, i) {
        var dir = slugOf(sc, i), rec = idx[sc.mediaId || ''];
        addText(dir + '/script.txt', scriptToText(sc));
        addText(dir + '/narration.txt', narrationOf(sc) + '\n');
        addText(dir + '/upload.txt', uploadText(uploadMeta(sc, rec && rec.credits, rec && rec.provider)));
        if (rec) {
          if (rec.srt) addText(dir + '/captions.srt', rec.srt);
          if (rec.video) jobs.push(blobBytes(rec.video).then(function (b) { files.push({ name: dir + '/video.' + rec.ext, data: b }); }));
          if (rec.audio) jobs.push(blobBytes(rec.audio).then(function (b) { files.push({ name: dir + '/voiceover.wav', data: b }); }));
        }
      });
      return Promise.all(jobs).then(function () {
        var blob = zipFiles(files), url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = 'autonom-shorts-' + new Date().toISOString().slice(0, 10) + '.zip'; document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
        toast('ZIP downloaded (' + fmtMB(blob.size) + ')', 'success');
      });
    }).catch(function (e) { LOG('zip failed', e); toast('Could not build the ZIP: ' + (e && e.message ? e.message : e), 'error'); });
  }

  function bind() {
    $$('.asg-step').forEach(function (s) { s.addEventListener('click', function () { if (!s.disabled) setStep(s.dataset.step); }); });
    $('.asg-privacy-toggle').addEventListener('click', function () { var d = $('.asg-privacy-drawer'); d.hidden = !d.hidden; });
    $$('.asg-mode-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var mode = card.dataset.mode;
        $$('.asg-mode-card').forEach(function (c) { c.classList.toggle('is-selected', c === card); });
        $$('.asg-mode-form').forEach(function (f) { f.hidden = f.dataset.mode !== mode; });
      });
    });
    $('#asg-yt-fetch').addEventListener('click', function () {
      var input = $('#asg-yt-input').value.trim();
      if (!input) { toast('Enter a channel handle or URL.', 'error'); return; }
      var btn = this; btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Fetching…';
      fetchYouTube(input).then(function (p) {
        state.profile = p; persistProfile(); renderProfile(); updateStepAvailability();
        toast('Profile derived', 'success');
      }).catch(function (e) { LOG('YT error', e); toast(e.message, 'error'); })
        .then(function () { btn.disabled = false; btn.textContent = orig; });
    });
    $('#asg-site-fetch').addEventListener('click', function () {
      var site = $('#asg-site-input').value.trim(); var feed = $('#asg-site-feed').value.trim();
      if (!site && !feed) { toast('Enter a site or feed URL.', 'error'); return; }
      var btn = this; btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Fetching…';
      var prog = $('#asg-site-progress'); prog.hidden = false; prog.textContent = 'Starting…';
      var p = feed ? tryFeed(feed) : discoverFeed(site, function (msg) { prog.textContent = msg; });
      p.then(function (f) {
        if (!f.items || !f.items.length) throw new Error('Feed returned zero items.');
        prog.textContent = 'Parsing ' + f.items.length + ' items…';
        state.profile = deriveFromFeed(f, { siteUrl: site, feedUrl: feed || (f.feed && f.feed.resolvedUrl) || site, name: (f.feed && f.feed.title) || site });
        persistProfile(); renderProfile(); updateStepAvailability();
        toast('Profile derived from ' + f.items.length + ' items', 'success'); prog.hidden = true;
      }).catch(function (e) { LOG('Site error', e); toast('Site mode: ' + e.message, 'error'); prog.hidden = true; })
        .then(function () { btn.disabled = false; btn.textContent = orig; });
    });
    $('#asg-manual-save').addEventListener('click', function () {
      var name = $('#asg-manual-name').value.trim();
      var oneLiner = $('#asg-manual-oneliner').value.trim();
      var topicList = $('#asg-manual-topics').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var userSignals = $('#asg-manual-signals').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var tone = $('#asg-manual-tone').value;
      var dur = clampSec($('#asg-manual-duration').value);
      if (!name) { toast('Channel name is required.', 'error'); return; }
      if (!topicList.length) topicList = ['General'];
      var autoFilled = !userSignals.length;
      var topics = topicList.map(function (n) {
        var sig = autoFilled ? (DEFAULT_SIGNALS[n.toLowerCase()] || DEFAULT_SIGNALS['general']).slice() : userSignals.slice();
        return { name: n, weight: Math.round((1 / topicList.length) * 100) / 100, subtopics: [], signals: sig };
      });
      var mfmt = formatFor(dur);
      mfmt.structure = ['hook', 'what-happened', 'background', 'why-it-matters', 'what-to-watch', 'cta-question'];
      mfmt.hookStyle = 'event-first'; mfmt.ctaStyle = 'question'; mfmt.lengthV2 = true;
      state.profile = {
        schemaVersion: '1.0', id: 'tp_' + Date.now().toString(36), name: name,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        source: { mode: 'manual', language: 'en' },
        identity: { oneLiner: oneLiner, positioning: oneLiner, audienceHint: '' },
        topics: topics,
        tone: { style: tone, energy: 'urgent', formality: 'neutral-brief', pov: 'analyst', avoid: ['clickbait hyperbole'] },
        format: mfmt,
        cadence: { videosPerDay: 2, preferredTimes: ['09:00', '18:00'], timezone: 'Europe/Stockholm', minGapHours: 4 },
        constraints: { bannedTopics: [], bannedWords: [], bannedSources: [], requiredDisclosure: 'AI-assisted analysis.', sourceCitationRequired: true },
        performanceHints: { analyzedVideoCount: 0, notes: 'Manual profile.' },
        promptTemplateId: 'tactical-analysis-v1',
        meta: { lastSyncedAt: new Date().toISOString(), derivationMethod: 'manual', confidence: 1 }
      };
      persistProfile(); renderProfile(); updateStepAvailability();
      toast(autoFilled ? 'Profile saved · signals auto-filled per topic' : 'Profile saved', 'success');
    });
    $('#asg-edit-toggle').addEventListener('click', function () {
      var edit = $('#asg-profile-edit'); var view = $('#asg-profile-view');
      if (edit.hidden) { renderProfileEdit(); edit.hidden = false; view.hidden = true; this.textContent = 'Cancel'; }
      else { edit.hidden = true; view.hidden = false; this.textContent = 'Edit'; }
    });
    $('#asg-continue-feed').addEventListener('click', function () { setStep('feed'); });
    $('#asg-back-channel').addEventListener('click', function () { setStep('channel'); });
    $('#asg-scan-btn').addEventListener('click', scanFeeds);
    $('#asg-continue-scripts').addEventListener('click', function () {
      var n = Object.keys(state.selectedStoryIds).length;
      if (!n) { toast('Tick at least one story first.', 'error'); return; }
      setStep('generate');
    });
    $('#asg-generate-btn').addEventListener('click', function () { generateScripts(); });
    $('#asg-back-feed').addEventListener('click', function () { setStep('feed'); });
    $('#asg-back-generate').addEventListener('click', function () { setStep('generate'); });
    $('#asg-continue-video').addEventListener('click', function () { setStep('video'); });
    $('#asg-back-review').addEventListener('click', function () { setStep('scripts'); });
    $('#asg-continue-export').addEventListener('click', function () { renderExport(); setStep('export'); });
    $('#asg-back-video').addEventListener('click', function () { setStep('video'); });
    $('#asg-export-json').addEventListener('click', function () {
      mediaIndex().then(function (idx) { download('autonom-ai-shorts.json', JSON.stringify(buildPayload(idx), null, 2), 'application/json'); toast('JSON downloaded', 'success'); });
    });
    $('#asg-export-txt').addEventListener('click', function () {
      var txt = goodScripts().map(function (sc, i) { return '=== Script ' + (i + 1) + ' ===\n' + scriptToText(sc); }).join('\n\n');
      download('autonom-ai-shorts.txt', txt, 'text/plain'); toast('TXT downloaded', 'success');
    });
    $('#asg-export-zip').addEventListener('click', function () { downloadEverything(); });
    $('#asg-export-copy').addEventListener('click', function () {
      var txt = goodScripts().map(function (sc, i) { return '=== Script ' + (i + 1) + ' ===\n' + scriptToText(sc); }).join('\n\n');
      copyText(txt).then(function () { toast('Copied all', 'success'); });
    });
    $('#asg-restart').addEventListener('click', function () {
      if (!confirm('Clear current scripts and start over?')) return;
      state.scripts = []; state.stories = []; state.selectedStoryIds = {};
      persistScripts(); setStep('channel');
    });
    $$('.asg-open-settings').forEach(function (b) { b.addEventListener('click', openSettings); });
    $('#asg-settings-close').addEventListener('click', closeSettings);
    $('#asg-settings-drawer').addEventListener('click', function (e) { if (e.target === this) closeSettings(); });
    $('#asg-set-provider').addEventListener('change', syncProviderFields);
    var testBtn = document.getElementById('asg-test-gemini');
    if (testBtn) {
      testBtn.addEventListener('click', function () {
        var key = $('#asg-set-gemini').value.trim();
        if (!key) { toast('Paste a Gemini key first.', 'error'); return; }
        var savedKey = state.settings.geminiKey, savedModel = state.settings.geminiModel, savedProv = state.settings.llmProvider;
        var gm = $('#asg-set-gemini-model');
        state.settings.geminiKey = key;
        if (gm && gm.value.trim()) state.settings.geminiModel = gm.value.trim();
        state.settings.llmProvider = 'gemini';
        var btn = this; btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Testing…';
        callLLM('Return strict JSON: {"ok": true, "msg": "hello"}', 'extract', { noFallback: true, noSticky: true })
          .then(function (r) { toast('✓ Gemini key works (model: ' + r.model + ')', 'success'); console.log('[ASG] test success:', r.model, r.text); })
          .catch(function (e) { toast('✗ ' + e.message, 'error'); console.error('[ASG] test fail:', e.message); })
          .then(function () {
            state.settings.geminiKey = savedKey; state.settings.geminiModel = savedModel; state.settings.llmProvider = savedProv;
            btn.disabled = false; btn.textContent = orig;
          });
      });
    }
    ['groq', 'openrouter'].forEach(function (pv) {
      var tb = document.getElementById('asg-test-' + pv);
      if (!tb) return;
      tb.addEventListener('click', function () {
        var key = $('#asg-set-' + pv).value.trim();
        if (!key) { toast('Paste a ' + pv + ' key first.', 'error'); return; }
        var saved = { k: state.settings[pv + 'Key'], m: state.settings[pv + 'Model'], p: state.settings.llmProvider };
        state.settings[pv + 'Key'] = key; state.settings[pv + 'Model'] = ($('#asg-set-' + pv + '-model').value || '').trim(); state.settings.llmProvider = pv;
        var btn = this; btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Testing…';
        callLLM('Return strict JSON: {"ok": true, "msg": "hello"}', 'extract', { noFallback: true, noSticky: true })
          .then(function (r) { toast('✓ ' + pv + ' key works (model: ' + r.model + ')', 'success'); })
          .catch(function (e) { toast('✗ ' + e.message, 'error'); })
          .then(function () { state.settings[pv + 'Key'] = saved.k; state.settings[pv + 'Model'] = saved.m; state.settings.llmProvider = saved.p; btn.disabled = false; btn.textContent = orig; });
      });
    });
    $('#asg-settings-save').addEventListener('click', function () {
      state.settings.youtubeKey = $('#asg-set-yt').value.trim();
      state.settings.llmProvider = $('#asg-set-provider').value;
      state.settings.geminiKey = $('#asg-set-gemini').value.trim();
      var gm = $('#asg-set-gemini-model');
      if (gm) state.settings.geminiModel = gm.value.trim();
      var rq2 = $('#asg-set-require2'); if (rq2) state.settings.requireSecond = !!rq2.checked;
      var dp2 = $('#asg-set-depth'); if (dp2) state.settings.depth = !!dp2.checked;
      var fb2 = $('#asg-set-fallback'); if (fb2) state.settings.fallbackProviders = !!fb2.checked;
      var wm2 = $('#asg-set-gemini-write-model'); if (wm2) state.settings.geminiWriteModel = wm2.value.trim();
      state.settings.openaiKey = $('#asg-set-openai').value.trim();
      state.settings.deepseekKey = $('#asg-set-deepseek').value.trim();
      var sp2 = $('#asg-set-stock'); if (sp2) state.settings.stockProvider = sp2.value;
      var pxk2 = $('#asg-set-pixabay'); if (pxk2) state.settings.pixabayKey = pxk2.value.trim();
      var pek2 = $('#asg-set-pexels'); if (pek2) state.settings.pexelsKey = pek2.value.trim();
      ['groq', 'openrouter'].forEach(function (pv) {
        var k = $('#asg-set-' + pv), m = $('#asg-set-' + pv + '-model'), w = $('#asg-set-' + pv + '-write-model');
        if (k) state.settings[pv + 'Key'] = k.value.trim();
        if (m) state.settings[pv + 'Model'] = m.value.trim();
        if (w) state.settings[pv + 'WriteModel'] = w.value.trim();
      });
      persistSettings(); updateApiStatus(); closeSettings(); toast('Settings saved', 'success');
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#asg-settings-drawer').hidden) closeSettings(); });
  }
  function init() {
    if (!$('.asg-root')) return;
    loadState(); bind(); updateCounters(); updateApiStatus();
    if (state.profile) {
      renderProfile(); updateStepAvailability();
      if (state.scripts.length) renderScripts();
    }
    LOG('ready v' + VERSION + (window.AUTONOM_ASG && window.AUTONOM_ASG.articleEndpoint ? ' · article endpoint on' : ' · article endpoint OFF (headline-only)'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
