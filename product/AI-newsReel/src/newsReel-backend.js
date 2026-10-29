(function () {
  'use strict';
  var VERSION = '1.28.3';
  if (window.__autonomASGLoaded) return;
  window.__autonomASGLoaded = true;
  window.__asgVersion = VERSION;

  var LOG = function () {
    try { console.log.apply(console, ['[Autonom ASG]'].concat([].slice.call(arguments))); } catch (e) {}
  };

  var LS = {
    profile: 'autonom.asg.profile.v1',
    settings: 'autonom.asg.settings.v1',
    scripts: 'autonom.asg.scripts.v1',
    profiles: 'autonom.asg.profiles.v1'
  };
  var APP_URL = 'https://autonom.app/ai/newsreel/';
  function scriptsKey(id) { id = id || (state.profile && state.profile.id); return id ? LS.scripts + '.' + id : LS.scripts; }

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
    profiles: [],
    feedSort: 'match',
    stories: [],
    selectedStoryIds: {},
    scripts: [],
    settings: { youtubeKey: '', llmProvider: 'gemini', geminiKey: '', geminiModel: '', openaiKey: '', deepseekKey: '', requireSecond: false, geminiWriteModel: '', depth: true, madeWith: true, autoLen: true, publishWebhook: '', publishSecret: '', publishPlatforms: ['youtube', 'instagram', 'facebook', 'tiktok', 'x', 'linkedin', 'telegram'], autoLens: true, autoHook: true, strategy: 'value', writeBest: true, lens: 'between', hook: 'event', fallbackProviders: true, pixabayKey: '', pexelsKey: '', stockProvider: 'pixabay', groqKey: '', groqModel: '', groqWriteModel: '', openrouterKey: '', openrouterModel: '', openrouterWriteModel: '' },
    counters: { apiCalls: 0, llmCalls: 0 },
    feedReadable: true,
    feedHideUsed: true,
    consGroups: null,
    consRes: {}
  };
  var DEFAULT_SETTINGS = JSON.parse(JSON.stringify(state.settings));
  function settingsKey(id) { id = id || (state.profile && state.profile.id); return id ? LS.settings + '.' + id : LS.settings; }
  function loadSettingsFor(id) {
    var o = null;
    try { o = JSON.parse(localStorage.getItem(settingsKey(id)) || 'null'); } catch (e) {}
    return Object.assign({}, DEFAULT_SETTINGS, o || {});
  }

  var LEN = { minSec: 30, maxSec: 105, defaultSec: 60, wps: 2.5 };
  var LEN_CHOICES = [30, 45, 60, 90, 105];
  function clampSec(d) { d = parseInt(d, 10); if (!d || d < 0) d = LEN.defaultSec; return Math.max(LEN.minSec, Math.min(LEN.maxSec, d)); }
  function formatFor(sec) {
    sec = clampSec(sec);
    var words = Math.round(sec * LEN.wps);
    var cap = Math.round(LEN.maxSec * LEN.wps);
    return { targetDurationSec: sec, wordCountMin: Math.round(words * 0.85), wordCountMax: Math.min(Math.round(words * 1.1), cap) };
  }
  var LENSES = {
    between: { label: 'Read between the lines', desc: 'What the timing, wording and choices suggest. The default.', rule: 'What belongs here: read between the lines. Name what is telling about the specifics of this story — the timing of a move, the choice of a target or moment, who is speaking and who is not, what a number or a phrase implies about strategy. Interpret the actors: "X appears to be betting that…", "the choice of timing suggests…", "the move looks aimed less at A than at B". End on the open question: "whether this works depends on…", "the test is whether…". Take a position; an analysis with no point of view is filler.' },
    contrarian: { label: 'Contrarian', desc: 'Tests the obvious reading against the same facts.', rule: 'What belongs here: a contrarian read. State the obvious reading of this story in one short clause, then say what the facts leave out or what else they would fit: "The easy reading is X. But the facts also fit Y." Challenge the framing, never the facts. Pick the strongest alternative the facts allow, not the most provocative one.' },
    simple: { label: 'Explain it simply', desc: 'A plain-language read for someone new to the story.', rule: 'What belongs here: a plain-language explanation for someone who has not followed this story. Say in everyday words what is really going on and why the main actors are doing what they are doing, using only the story\'s own facts. Short sentences, no jargon, no analogies that add new facts.' },
    winners: { label: 'Who gains, who loses', desc: 'Maps the winners and losers the facts point to.', rule: 'What belongs here: who gains and who loses from this development, as far as the facts show. Name the groups the facts name, and frame every judgement as "appears to benefit" or "looks exposed". If the facts show no winner or loser, say who is not mentioned.' },
    skeptic: { label: 'Skeptic\'s check', desc: 'What is claimed, by whom, and what is still unconfirmed.', rule: 'What belongs here: a source check. Separate what is claimed from what is confirmed, say who makes each claim, and name what the facts do not yet show (without inventing what it might be). The tone is careful, not cynical.' },
    watch: { label: 'What to watch next', desc: 'The signposts that would change the picture.', rule: 'What belongs here: the signposts. Name two things that would change how this story reads, as conditions ("if the next statement from X changes tone, that would suggest..."), using only actors and events in the facts. No forecasts.' }
  };
  var runOver = null;   // per-story recommendation applied while a script is being written
  function baseLens() { return LENSES[state.settings.lens] ? state.settings.lens : 'between'; }
  function currentLens() { return runOver && LENSES[runOver.lens] ? runOver.lens : baseLens(); }
  var HOOKS = {
    event: { label: 'Lead with the event', desc: 'The most consequential fact, first.', rule: '' },
    question: { label: 'Open with a question', desc: 'A sharp question the facts answer.', rule: '   Hook style: phrase the hook as a question that the facts below answer, and make it name the specific subject. No clickbait, no "you won\'t believe".' },
    contrast: { label: 'Open with a contrast', desc: '"X says A, but B." Attributed.', rule: '   Hook style: set up the contrast the story turns on, using only the facts and naming who says what ("X says A, but B"). The contrast must be in the facts, not your own.' }
  };
  function baseHook() { return HOOKS[state.settings.hook] ? state.settings.hook : 'event'; }
  function currentHook() { return runOver && HOOKS[runOver.hook] ? runOver.hook : baseHook(); }
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
      var pl = null; try { pl = JSON.parse(localStorage.getItem(LS.profiles) || 'null'); } catch (e0) {}
      if (pl && pl.list && pl.list.length) {
        state.profiles = pl.list;
        state.profile = pl.list.filter(function (x) { return x.id === pl.active; })[0] || pl.list[0];
      } else {
        var p = localStorage.getItem(LS.profile); if (p) { state.profile = JSON.parse(p); state.profiles = [state.profile]; }
      }
      var s = (state.profile && localStorage.getItem(settingsKey())) || localStorage.getItem(LS.settings); if (s) Object.assign(state.settings, JSON.parse(s));
      if (state.profile && localStorage.getItem(settingsKey()) == null) localStorage.setItem(settingsKey(), JSON.stringify(state.settings));
      var sc = localStorage.getItem(scriptsKey());
      if (sc == null && state.profiles.length <= 1) sc = localStorage.getItem(LS.scripts);
      if (sc) state.scripts = JSON.parse(sc);
      if (state.profile && localStorage.getItem(scriptsKey()) == null) localStorage.setItem(scriptsKey(), JSON.stringify(state.scripts));
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
  function persistProfile() {
    var tmpFmt = null;
    if (genRun && genRun.origFmt && state.profile && state.profile.format) { tmpFmt = Object.assign({}, state.profile.format); Object.assign(state.profile.format, genRun.origFmt); }
    try { persistProfileRaw(); } finally { if (tmpFmt) Object.assign(state.profile.format, tmpFmt); }
  }
  function persistProfileRaw() {
    try {
      if (state.profile) {
        var i = -1;
        state.profiles.forEach(function (x, k) { if (x.id === state.profile.id) i = k; });
        if (i < 0) { state.profiles.push(state.profile); state.scripts = []; state.stories = []; state.selectedStoryIds = {}; persistScripts(); persistSettings(); }
        else state.profiles[i] = state.profile;
        localStorage.setItem(LS.profile, JSON.stringify(state.profile));
      }
      localStorage.setItem(LS.profiles, JSON.stringify({ active: state.profile ? state.profile.id : null, list: state.profiles }));
    } catch (e) {}
    try { renderProfileBar(); } catch (e2) {}
  }
  function persistSettings() { try { var j = JSON.stringify(state.settings); localStorage.setItem(settingsKey(), j); localStorage.setItem(LS.settings, j); } catch (e) {} }
  function persistScripts() { try { var j = JSON.stringify(state.scripts); localStorage.setItem(scriptsKey(), j); localStorage.setItem(LS.scripts, j); } catch (e) {} }

  function updateCounters() {
    var a = $('#asg-stat-api'); if (a) a.textContent = state.counters.apiCalls;
    var l = $('#asg-stat-llm'); if (l) l.textContent = state.counters.llmCalls;
  }
  function updateApiStatus() {
    var node = document.getElementById('asg-api-status');
    if (!node) return;
    var hasLlm = state.settings.llmProvider !== 'none' && !!currentLlmKey();
    var needYt = !!(state.profile && state.profile.source && state.profile.source.mode === 'youtube');
    var hasYt = !!state.settings.youtubeKey;
    var hasStock = !!(typeof stockKey === 'function' && stockKey());
    node.classList.remove('is-ok', 'is-partial');
    var label = node.querySelector('.asg-api-label');
    var parts = [hasLlm ? 'AI ✓' : 'Add AI key'];
    if (needYt) parts.push(hasYt ? 'YouTube ✓' : 'Add YouTube key');
    parts.push(hasStock ? 'Footage ✓' : 'Add footage key');
    var ok = hasLlm && (!needYt || hasYt) && hasStock;
    var some = hasLlm || hasYt || hasStock;
    if (ok) node.classList.add('is-ok'); else if (some) node.classList.add('is-partial');
    if (label) label.textContent = parts.join(' · ');
    node.title = 'API keys. AI provider: ' + (hasLlm ? 'set' : 'missing') + ' · YouTube: ' + (hasYt ? 'set' : needYt ? 'missing' : 'not needed') + ' · Footage library: ' + (hasStock ? 'set' : 'missing') + '. Open API keys to change them.';
  }
  function toast(msg, kind, ms) {
    var t = el('div', { class: 'asg-toast' + (kind ? ' is-' + kind : ''), text: msg });
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('is-on'); });
    setTimeout(function () { t.classList.remove('is-on'); setTimeout(function () { t.remove(); }, 320); }, ms || (kind === 'error' ? 9000 : 5000));
  }
  function setStep(step) {
    var order = ['channel', 'feed', 'consolidate', 'generate', 'scripts', 'video', 'publish', 'export'];
    state.step = step;
    $$('.asg-panel').forEach(function (p) { p.hidden = p.dataset.panel !== step; });
    $$('.asg-step').forEach(function (s) {
      var idx = order.indexOf(s.dataset.step); var cur = order.indexOf(step);
      s.classList.toggle('is-active', s.dataset.step === step);
      s.classList.toggle('is-done', idx < cur && idx >= 0);
    });
    updateStepAvailability();
    if (step === 'consolidate') renderConsolidate();
    if (step === 'generate') renderGenerateStatus();
    if (step === 'video') renderVideoPanel();
    if (step === 'publish') renderPublish();
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
      else if (st === 'consolidate') s.disabled = !hasStories;
      else if (st === 'generate') s.disabled = !hasStories;
      else if (st === 'scripts') s.disabled = !state.scripts.length;
      else if (st === 'video') s.disabled = !hasScripts;
      else if (st === 'publish') s.disabled = !hasScripts;
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
      identity: { oneLiner: opts.oneLiner || '', positioning: opts.positioning || '', audienceHint: opts.audienceHint || '', dna: opts.dna || '', samples: opts.samples || null },
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

  // ---------- Multiple profiles (settings drawer) ----------
  // A profile is one channel's workspace: topics and tone, API keys and settings, scripts and videos.
  function renderProfileBar() {
    var box = document.getElementById('asg-set-profiles'); if (!box) return;
    box.innerHTML = '';
    var btn = $('.asg-open-settings.asg-btn-pill'); if (btn) { var nm = state.profile && state.profile.name; btn.innerHTML = ''; btn.appendChild(el('span', { class: 'asg-pill-k', text: 'Profile' })); btn.appendChild(el('span', { class: 'asg-pill-name', text: nm || 'Set up profile & keys' })); btn.appendChild(el('span', { 'aria-hidden': 'true', text: '▾' })); btn.title = 'Switch profile, add API keys, change settings'; }
    box.appendChild(el('span', { class: 'asg-label', text: 'Profile' }));
    if (!state.profiles.length) {
      box.appendChild(el('p', { class: 'asg-hint', text: 'No profile yet. Create one in the Channel step. Each profile keeps its own topics, API keys, scripts and videos.' }));
      return;
    }
    var row = el('div', { class: 'asg-pf-row' });
    var sel = el('select', { 'aria-label': 'Active profile' });
    state.profiles.forEach(function (x) {
      var o = el('option', { value: x.id, text: x.name || 'Untitled profile' });
      if (state.profile && x.id === state.profile.id) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { if (sel.value) switchProfile(sel.value); });
    row.appendChild(sel);
    var add = el('button', { class: 'asg-btn asg-btn-ghost', type: 'button', text: '+ New' });
    add.addEventListener('click', function () { closeSettings(); setStep('channel'); toast('Create the new profile below. Your other profiles stay saved.', 'success'); var c = $('.asg-mode-grid'); if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    row.appendChild(add);
    if (state.profile) {
      var del = el('button', { class: 'asg-btn asg-btn-ghost asg-pf-del', type: 'button', text: 'Delete' });
      del.addEventListener('click', deleteProfile);
      row.appendChild(del);
    }
    box.appendChild(row);
    box.appendChild(el('p', { class: 'asg-hint', text: 'The keys and settings below belong to this profile. A new profile starts with a copy of the current ones, so change them there if the channel uses different accounts.' }));
  }
  function switchProfile(id) {
    var t = state.profiles.filter(function (x) { return x.id === id; })[0];
    if (!t || (state.profile && state.profile.id === id)) return;
    if (generating) { toast('Stop the script run first.', 'error'); renderProfileBar(); return; }
    if (typeof vidBusy !== 'undefined' && vidBusy) { toast('A video is being made. Wait until it finishes.', 'error'); renderProfileBar(); return; }
    persistScripts(); persistSettings();
    state.profile = t;
    var sc = null; try { sc = JSON.parse(localStorage.getItem(scriptsKey(t.id)) || 'null'); } catch (e) {}
    state.scripts = sc || []; state.stories = []; state.selectedStoryIds = {};
    state.settings = loadSettingsFor(t.id);
    persistProfile();
    renderProfile(); renderStories(); renderScripts(); updateStepAvailability(); updateApiStatus();
    var ed = $('#asg-profile-edit'); if (ed) ed.hidden = true; var vw = $('#asg-profile-view'); if (vw) vw.hidden = false; var tg = $('#asg-edit-toggle'); if (tg) tg.textContent = 'Edit';
    var dr = $('#asg-settings-drawer'); if (dr && !dr.hidden) openSettings();
    setStep('channel');
    toast('Switched to ' + (t.name || 'profile'), 'success');
  }
  function deleteProfile() {
    var cur = state.profile; if (!cur) return;
    if (generating) { toast('Stop the script run first.', 'error'); return; }
    if (typeof vidBusy !== 'undefined' && vidBusy) { toast('A video is being made. Wait until it finishes.', 'error'); return; }
    var n = goodScripts().length;
    if (!confirm('Delete the profile "' + (cur.name || 'Untitled') + '" with its keys' + (n ? ', ' + n + ' script' + (n === 1 ? '' : 's') + ' and saved videos' : '') + '? This cannot be undone.')) return;
    var ids = state.scripts.map(function (x) { return x.mediaId || x.id; }).filter(Boolean);
    Promise.all(ids.map(function (i) { return Promise.all([dbDel('media', i), dbDel('parts', i)]); })).catch(function () {});
    try { localStorage.removeItem(scriptsKey(cur.id)); localStorage.removeItem(settingsKey(cur.id)); } catch (e) {}
    state.profiles = state.profiles.filter(function (x) { return x.id !== cur.id; });
    state.stories = []; state.selectedStoryIds = {};
    var next = state.profiles[0] || null;
    if (next) {
      state.profile = next; var sc = null; try { sc = JSON.parse(localStorage.getItem(scriptsKey(next.id)) || 'null'); } catch (e2) {}
      state.scripts = sc || []; state.settings = loadSettingsFor(next.id);
    } else { state.profile = null; state.scripts = []; try { localStorage.removeItem(LS.profile); localStorage.removeItem(LS.scripts); } catch (e3) {} }
    persistProfile();
    if (next) renderProfile(); else { var pe = $('#asg-profile-editor'); if (pe) pe.hidden = true; }
    renderStories(); renderScripts(); updateStepAvailability(); updateApiStatus(); setStep('channel');
    var dr = $('#asg-settings-drawer'); if (dr && !dr.hidden) openSettings();
    toast('Profile deleted', 'success');
  }

  function renderProfile() {
    renderProfileBar();
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
    updateApiStatus();
  }
  function textInput(v, on) { var i = el('input', { type: 'text', value: v || '' }); i.addEventListener('input', function () { on(i.value); }); return i; }
  function textarea(v, on) { var t = el('textarea', {}); t.value = v || ''; t.addEventListener('input', function () { on(t.value); }); return t; }
  function selectOpts(opts, v, on) {
    var s = el('select');
    opts.forEach(function (o) { var op = el('option', { value: o, text: o }); if (o === v) op.selected = true; s.appendChild(op); });
    s.addEventListener('change', function () { on(s.value); }); return s;
  }
  function field(label, input) { return el('label', { class: 'asg-field' }, [el('span', { class: 'asg-label', text: label }), input]); }

  // The channel's DNA: how it sounds and what stance it takes. Written once per profile, used in every script and
  // every analysis, so two channels covering the same story do not publish the same reel.
  function dnaText(p) {
    var d = p && p.identity && String(p.identity.dna || '').trim();
    if (d) return d;
    return 'Voice: ' + ((p.tone && p.tone.style) || 'analytical') + ', ' + ((p.tone && p.tone.energy) || 'urgent') + '. Positioning: ' + ((p.identity && (p.identity.positioning || p.identity.oneLiner)) || p.name) + '.';
  }
  function suggestDna(p, pages) {
    var smp = (p.identity && p.identity.samples) || {};
    var lines = [
      'Write the "voice DNA" of a faceless news-explainer channel, so its scripts sound like it and nobody else.',
      'CHANNEL: ' + p.name, 'POSITIONING: ' + (p.identity.positioning || p.identity.oneLiner || ''),
      'TOPICS: ' + (p.topics || []).map(function (t) { return t.name; }).join(', '),
      'TONE: ' + ((p.tone && p.tone.style) || '') + ', ' + ((p.tone && p.tone.energy) || '')
    ];
    if (smp.titles && smp.titles.length) lines.push('RECENT TITLES: ' + smp.titles.join(' | '));
    if (smp.top && smp.top.length) lines.push('BEST PERFORMING TITLES: ' + smp.top.join(' | '));
    if (pages && pages.length) { lines.push('', 'TEXT FROM THE BRAND\'S OWN PAGES (use it for voice, stance and what the brand stands for; ignore menus and boilerplate):'); pages.forEach(function (g) { lines.push('[' + g.k + '] ' + g.text); }); }
    lines.push('', 'Return 4 to 6 short lines, one per label: "Voice:" (how sentences sound: rhythm, register, humour or none), "Stance:" (the angle or worldview this channel brings to news: what it cares about, what it is sceptical of), "Signature:" (1-2 recurring moves, e.g. who pays, what is missing, the historical echo), "Never:" (what it avoids). Base it ONLY on the information above. Do not invent a biography, credentials or facts.',
      'Return STRICT JSON only: {"dna":"Voice: ...\nStance: ...\nSignature: ...\nNever: ..."}');
    return callLLM(lines.join('\n'), 'write').then(function (r) { var j = extractJson(r.text); return String(j.dna || '').trim(); });
  }
  function renderProfileEdit() {
    if (!state.profile) return;
    var edit = $('#asg-profile-edit'); edit.innerHTML = '';
    var p = state.profile;
    edit.appendChild(field('Name', textInput(p.name, function (v) { p.name = v; })));
    edit.appendChild(field('One-liner', textInput(p.identity.oneLiner, function (v) { p.identity.oneLiner = v; })));
    edit.appendChild(field('Positioning', textarea(p.identity.positioning, function (v) { p.identity.positioning = v; })));
    var dnaTa = textarea(p.identity.dna, function (v) { p.identity.dna = v; });
    dnaTa.rows = 5; dnaTa.placeholder = 'Voice: ...\nStance: ...\nSignature: ...\nNever: ...';
    var dnaF = field('Voice and angle (DNA)', dnaTa);
    dnaF.appendChild(el('span', { class: 'asg-hint', text: 'How this channel sounds and what stance it takes. Every script and every analysis is written in it, so your reels differ from anyone else covering the same story. Edit freely.' }));
    var dnaBtn = el('button', { type: 'button', class: 'asg-btn asg-btn-ghost', text: 'Suggest from my channel', style: 'margin-top:6px;' });
    dnaBtn.addEventListener('click', function () {
      dnaBtn.disabled = true; dnaBtn.textContent = 'Writing…';
      suggestDna(p).then(function (t) { if (t) { dnaTa.value = t; p.identity.dna = t; toast('Voice DNA suggested. Edit it, then save.', 'ok'); } else toast('The model returned nothing. Try again.', 'warn'); })
        .catch(function (e) { toast('Could not suggest a DNA: ' + (e && e.message || 'AI error'), 'error'); })
        .then(function () { dnaBtn.disabled = false; dnaBtn.textContent = 'Suggest from my channel'; });
    });
    dnaF.appendChild(dnaBtn);
    edit.appendChild(dnaF);
    var tb = el('div', { class: 'asg-field' }, [el('span', { class: 'asg-label', text: 'Topics' }),
      el('span', { class: 'asg-hint', text: 'Each topic has a name, a weight (how much of your output it should drive) and scan signals: keywords the news scan searches for.' })]);
    var rows = el('div', { class: 'asg-topic-rows' });
    function drawRows() {
      rows.innerHTML = '';
      var head = el('div', { class: 'asg-topic-row asg-topic-head' }, [el('span', { text: 'Name' }), el('span', { text: 'Weight' }), el('span', { text: 'Signals (comma separated)' }), el('span', { text: '' })]);
      rows.appendChild(head);
      p.topics.forEach(function (t, i) {
        var row = el('div', { class: 'asg-topic-row' });
        row.appendChild(textInput(t.name, function (v) { t.name = v; }));
        var w = textInput(String(t.weight), function (v) { t.weight = Math.max(0, Math.min(1, parseFloat(v) || 0)); });
        w.setAttribute('inputmode', 'decimal'); row.appendChild(w);
        row.appendChild(textInput((t.signals || []).join(', '), function (v) { t.signals = v.split(',').map(function (x) { return x.trim(); }).filter(Boolean); }));
        var rm = el('button', { class: 'asg-topic-rm', type: 'button', title: 'Remove topic', 'aria-label': 'Remove topic', text: '✕' });
        rm.addEventListener('click', function () {
          if (p.topics.length <= 1) { toast('Keep at least one topic.', 'error'); return; }
          p.topics.splice(i, 1); drawRows();
        });
        row.appendChild(rm);
        rows.appendChild(row);
      });
    }
    drawRows();
    var addBtn = el('button', { class: 'asg-btn asg-btn-ghost', type: 'button', text: '+ Add topic' });
    addBtn.addEventListener('click', function () {
      var n = p.topics.length + 1;
      p.topics.push({ name: 'New topic ' + n, weight: 0.2, subtopics: [], signals: [] });
      drawRows();
      var ins = rows.querySelectorAll('.asg-topic-row:last-child input'); if (ins[0]) { ins[0].focus(); ins[0].select(); }
    });
    var norm = el('button', { class: 'asg-btn asg-btn-ghost', type: 'button', text: 'Balance weights' });
    norm.addEventListener('click', function () {
      var tot = p.topics.reduce(function (a, t) { return a + (t.weight || 0); }, 0) || 1;
      p.topics.forEach(function (t) { t.weight = Math.round(((t.weight || 0) / tot) * 100) / 100; });
      drawRows(); toast('Weights now add up to 100%', 'success');
    });
    tb.appendChild(rows); tb.appendChild(el('div', { class: 'asg-actions' }, [addBtn, norm])); edit.appendChild(tb);
    edit.appendChild(field('Tone style', selectOpts(['analytical', 'urgent', 'neutral', 'contrarian'], p.tone.style, function (v) { p.tone.style = v; })));
    edit.appendChild(field('Target duration (sec, 30 to 105)', textInput(String(p.format.targetDurationSec), function (v) {
      var d = parseInt(v, 10); if (!d) return;
      var f = formatFor(d);
      p.format.targetDurationSec = f.targetDurationSec;
      p.format.wordCountMin = f.wordCountMin;
      p.format.wordCountMax = f.wordCountMax;
      p.format.lengthV2 = true;
    })));
    var save = el('button', { class: 'asg-btn asg-btn-primary', type: 'button', text: 'Save profile' });
    save.addEventListener('click', function () {
      p.topics.forEach(function (t) {
        if (!t.signals || !t.signals.length) t.signals = (DEFAULT_SIGNALS[String(t.name).toLowerCase()] || (/^New topic \d+$/.test(t.name) ? [] : [t.name])).slice();
      });
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
        if (i < queries.length) return sleep(window.AUTONOM_ASG && window.AUTONOM_ASG.newsEndpoint ? 2000 : 5200).then(step);
        return step();
      });
    }
    return step();
  }
  var scanSeq = 0;
  function scanFeeds() {
    if (!state.profile) return;
    var myScan = ++scanSeq;
    var queries = buildQueries(state.profile);
    if (!queries.length) {
      toast('Your profile has no usable signals (3+ characters). Go back to Channel → Edit and add keywords.', 'error');
      return;
    }
    var list = $('#asg-story-list'); list.innerHTML = '';
    state.stories = []; state.selectedStoryIds = {}; state.consGroups = null; state.consRes = {};
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
      if (myScan !== scanSeq) return;
      fill.style.width = '90%';
      var seen = {};
      results.forEach(function (r) {
        if (!r.feed || !r.feed.items) return;
        r.feed.items.slice(0, r.q === 'publishers' ? 40 : 12).forEach(function (it) {
          var key = cleanTitle(it.title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60), ukey = cleanUrl(it.link || '');
          if (seen[key] || (ukey && seen[ukey])) return; seen[key] = true; if (ukey) seen[ukey] = true;
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


  // ---------- Virality estimate ----------
  // Real signal: views of similar short videos from the last 30 days (YouTube Data API, needs your key).
  // Without a key the score is an estimate from coverage, freshness and channel fit. It is not a prediction.
  var VIRAL_KEY = 'asg_viral_cache_v1';
  var viralCache = (function () { try { return JSON.parse(localStorage.getItem(VIRAL_KEY) || '{}'); } catch (e) { return {}; } })();
  function viralSave() { try { localStorage.setItem(VIRAL_KEY, JSON.stringify(viralCache)); } catch (e) {} }
  function clampN(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function storyQuery(s) { return sigTokens(cleanTitle(s.title)).slice(0, 4).join(' '); }
  function ageHours(s) { return s.publishedAt ? (Date.now() - new Date(s.publishedAt).getTime()) / 3.6e6 : null; }
  function freshScore(s) { var h = ageHours(s); if (h == null || isNaN(h)) return 40; return h < 3 ? 100 : h < 6 ? 90 : h < 12 ? 75 : h < 24 ? 60 : h < 48 ? 35 : 15; }
  function coverageScore(n) { return n >= 5 ? 100 : n === 4 ? 85 : n === 3 ? 70 : n === 2 ? 50 : 25; }
  function demandScore(d) {
    if (!d || !d.n) return 0;
    var sc = clampN((Math.log10(Math.max(d.median, 1)) - 2.5) / 3 * 100, 0, 100);
    if (d.n < 3) sc *= d.n / 3;
    return Math.round(sc);
  }
  function cachedDemand(s) {
    var c = viralCache[storyQuery(s)];
    return c && Date.now() - c.t < 12 * 3600 * 1000 ? Object.assign({ ok: true }, c.d) : null;
  }
  // Reach: stories with no major power, market or supply angle in the headline rarely find a wide audience.
  function stakesOf(s) {
    var t = String(s.title || '') + ' ' + String(s.summary || ''), l = t.toLowerCase();
    var big = /\b(US|U\.S\.|UK|EU|UN)\b/.test(t) || /\b(united states|america\w*|china|chinese|russia\w*|iran\w*|israel\w*|nato|european union|trump|putin|xi jinping|biden|federal reserve|ukrain\w*|taiwan|opec|north korea|kim jong|white house|pentagon|kremlin|beijing|moscow|washington)\b/.test(l);
    var glob = /\b(oil|gas|energy|trade|tariffs?|sanctions?|chips?|semiconductors?|shipping|hormuz|suez|nuclear|inflation|prices?|markets?|dollar|war|strikes?|missiles?|ceasefire|talks|summit|election\w*|midterms?|economy|currency|supply)\b/.test(l);
    // Shorts viewers swipe past procedure and stay for conflict, hidden layers and tangible stakes (from the channel's own Studio data).
    var unseen = /\b(secret\w*|covert|hidden|deepfakes?|bots?|surveillance|spies|spy|leak\w*|shadow|undercover|drones?|cyber\w*|hack\w*|sabotage)\b/.test(l);
    var proc = !big && /\b(prosecutors?|probe|investigat\w*|court|hearing|polls open|ballots?|commission|parliament\w*)\b/.test(l);
    var conseq = /\b(blackouts?|outages?|shortages?|prices?|fuel|oil|flights?|evacuat\w*|shut ?downs?|blockade|layoffs?|jobs|recession|bans?|banned|killed|dead|collapse\w*|sanctions?|tariffs?)\b/.test(l);
    return { score: (big ? 1 : 0) + (glob ? 1 : 0), big: big, glob: glob, unseen: unseen, proc: proc, conseq: conseq };
  }
  function viralOf(s) {
    var maxScore = Math.max.apply(null, state.stories.map(function (x) { return x.score; }).concat([1]));
    var fit = Math.round(clampN(s.score / maxScore * 100, 0, 100)), fresh = freshScore(s);
    var cn = 1 + relatedStories(s, 20).length, cov = coverageScore(cn);
    var d = (s.demand && s.demand.ok) ? s.demand : cachedDemand(s);
    var dem = d ? demandScore(d) : null;
    var score = d ? 0.45 * dem + 0.2 * cov + 0.15 * fresh + 0.2 * fit : 0.4 * cov + 0.3 * fresh + 0.3 * fit;
    var stk = stakesOf(s);
    score = stk.score === 0 ? score * 0.78 : stk.score === 2 ? Math.min(100, score * 1.05) : score;
    // Hook angle: what Shorts viewers stay for (a hidden layer, a tangible consequence) and what they swipe past (procedure).
    var ang = (stk.unseen ? 6 : 0) + (stk.conseq ? 5 : 0) - (stk.proc ? 8 : 0);
    score = clampN(score + ang, 0, 100);
    var angLabel = [stk.unseen ? 'hidden layer' : '', stk.conseq ? 'tangible consequence' : '', stk.proc ? 'procedural story' : ''].filter(Boolean).join(' + ');
    return { score: Math.round(score), fit: fit, fresh: fresh, cn: cn, dem: dem, d: d, real: !!d, stakes: stk.score, ang: ang, angLabel: angLabel };
  }
  function viralLevel(n) { return n >= 70 ? 'high' : n >= 45 ? 'mid' : 'low'; }
  function fmtViews(n) { return n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n); }
  function fetchDemand(s) {
    var q = storyQuery(s);
    var c = cachedDemand(s); if (c) return Promise.resolve(c);
    if (!q) return Promise.resolve({ ok: true, n: 0, median: 0, top: [] });
    var since = new Date(Date.now() - 30 * 864e5).toISOString();
    var p0; try { p0 = ytFetch('search', { part: 'snippet', q: q, type: 'video', videoDuration: 'short', order: 'viewCount', publishedAfter: since, maxResults: 10, relevanceLanguage: 'en' }); } catch (e) { return Promise.reject(e); }
    return p0.then(function (r) {
      var ids = (r.items || []).map(function (i) { return i.id && i.id.videoId; }).filter(Boolean);
      if (!ids.length) return { n: 0, median: 0, top: [] };
      return ytFetch('videos', { part: 'statistics,snippet', id: ids.join(',') }).then(function (v) {
        var vids = (v.items || []).map(function (x) { return { id: x.id, title: x.snippet.title, channel: x.snippet.channelTitle, views: parseInt((x.statistics || {}).viewCount || '0', 10) }; })
          .sort(function (a, b) { return b.views - a.views; });
        var arr = vids.map(function (x) { return x.views; }).sort(function (a, b) { return a - b; });
        var med = arr.length ? (arr.length % 2 ? arr[(arr.length - 1) / 2] : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2) : 0;
        return { n: vids.length, median: Math.round(med), top: vids.slice(0, 3) };
      });
    }).then(function (d) { viralCache[q] = { t: Date.now(), d: d }; viralSave(); return Object.assign({ ok: true }, d); });
  }
  function scoreVirality(btn) {
    if (!state.settings.youtubeKey) { toast('Add a YouTube key under API keys to get real demand data. Showing the estimate until then.', 'error'); return; }
    var list = state.stories.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, 10), i = 0;
    btn.disabled = true;
    function next() {
      if (i >= list.length) return Promise.resolve();
      var s = list[i++]; btn.textContent = 'Scoring ' + i + ' of ' + list.length + '…';
      return fetchDemand(s).then(function (d) { s.demand = d; }).catch(function (e) { if (/quota|exceeded|forbidden|key/i.test(e.message)) throw e; s.demand = null; })
        .then(function () { renderStories(); return sleep(120).then(next); });
    }
    next().then(function () { state.feedSort = 'viral'; toast('Virality scored from similar Shorts. Sorted by virality.', 'success'); })
      .catch(function (e) { toast('YouTube said: ' + e.message, 'error'); })
      .then(function () { btn.disabled = false; renderStories(); });
  }
  function renderFeedTools() {
    var box = document.getElementById('asg-feed-tools'); if (!box) return;
    box.innerHTML = '';
    if (!state.stories.length) { box.hidden = true; return; }
    box.hidden = false;
    var row = el('div', { class: 'asg-ft-row' });
    row.appendChild(el('span', { class: 'asg-label', text: 'Sort' }));
    var seg = el('div', { class: 'asg-seg', role: 'group', 'aria-label': 'Sort stories' });
    [['match', 'Best match'], ['viral', 'Highest virality'], ['new', 'Newest first']].forEach(function (x) {
      var b = el('button', { type: 'button', class: 'asg-seg-btn' + (state.feedSort === x[0] ? ' is-on' : ''), 'aria-pressed': state.feedSort === x[0] ? 'true' : 'false', text: x[1] });
      b.addEventListener('click', function () { state.feedSort = x[0]; renderStories(); });
      seg.appendChild(b);
    });
    row.appendChild(seg);
    var tg = el('label', { class: 'asg-switch' });
    var tcb = el('input', { type: 'checkbox' }); tcb.checked = state.feedReadable;
    tcb.addEventListener('change', function () { state.feedReadable = tcb.checked; renderStories(); });
    tg.appendChild(tcb); tg.appendChild(el('span', { class: 'asg-switch-ui' })); tg.appendChild(el('span', { text: 'Readable only' }));
    row.appendChild(tg);
    var ug = el('label', { class: 'asg-switch' });
    var ucb = el('input', { type: 'checkbox' }); ucb.checked = state.feedHideUsed;
    ucb.addEventListener('change', function () { state.feedHideUsed = ucb.checked; renderStories(); });
    ug.appendChild(ucb); ug.appendChild(el('span', { class: 'asg-switch-ui' })); ug.appendChild(el('span', { text: 'Hide used' }));
    row.appendChild(ug);
    var any = state.stories.some(function (s) { return viralOf(s).real; });
    var sb = el('button', { type: 'button', class: 'asg-btn asg-btn-ghost', text: any ? 'Re-score virality' : 'Score virality with YouTube' });
    sb.addEventListener('click', function () { scoreVirality(sb); });
    row.appendChild(sb);
    box.appendChild(row);
    box.appendChild(el('p', { class: 'asg-hint', text: 'Match ★ is how well a story fits your channel topics, plus a freshness boost. Virality estimates how much audience the topic already has: coverage, freshness and fit, and with a YouTube key, the views of similar Shorts from the last 30 days (about 100 quota units per story, top 10 stories). It is a guide, not a promise.' }));
  }

  // ---- Stories that cannot be used (checked, not guessed) ----
  var UNUS_KEY = 'asg_unusable_v1';
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

  // ---- Stories that already have a script ----
  function usedOf(s) {
    var base = sigTokens(cleanTitle(s.title)), cu = cleanUrl(s.url || ''), res = null;
    state.scripts.forEach(function (sc) {
      if (sc.gated || res === 'script') return;
      var u1 = cleanUrl(sc.url || ''), u2 = cleanUrl(sc.sourceUrl || '');
      var extra = (sc.sources || []).concat([sc.corroboration && sc.corroboration.url], (sc.corroboration && sc.corroboration.urls) || [], (sc.mergedStories || []).map(function (m) { return m.url; })).filter(Boolean).map(cleanUrl);
      if (sc.storyId === s.id || (cu && (u1 === cu || u2 === cu || extra.indexOf(cu) !== -1))) { res = 'script'; return; }
      var tt = sigTokens(cleanTitle((sc.storyTitle || '') + ' ' + (sc.title || '') + ' ' + (sc.mergedStories || []).map(function (m) { return m.title; }).join(' ')));
      var shared = tt.filter(function (w) { return base.indexOf(w) !== -1; }).length;
      if (shared >= 3 || (shared >= 2 && shared / (Math.min(base.length, tt.length) || 1) >= 0.5) || sameEventScore(s, { title: (sc.storyTitle || '') + ' ' + (sc.title || ''), summary: sc.description || '' }).ok && shared >= 1) res = res || 'same';
    });
    return res;
  }

  // ---- Recommended options per story ----
  // Rules of thumb from Shorts retention data: shorter holds viewers better; a question that the facts answer
  // opens well when the outcome is still open; analysis should fit what the story actually is.
  function recommendFor(s) {
    var ttl = String(s.title || '').toLowerCase();
    var h = ageHours(s), cn = viralOf(s).cn || 1;
    var fwd = /\b(will|could|would|may|might|ready|plans?|planning|set to|expected|expects?|ahead of|talks?|deadline|threat\w*|warns?|weighs?|considers?|eyes|next|vote|summit|election|negotiat\w*|ceasefire|strikes?)\b|\?/.test(ttl);
    var contrast = /\b(despite|even as|denies|denied|rejects?|disputes?|contradicts?|but|yet|however|although)\b/.test(ttl);
    var done = /\b(dies|died|killed|kills|wins|won|signs|signed|approves?|approved|announces?|announced|falls?|fell|rises?|rose|hits|surges?|drops?|jumps?|tops?|reaches|passes)\b/.test(ttl);
    var hook = fwd ? 'question' : contrast ? 'contrast' : done ? 'event' : 'question';
    var lens = /\b(claims?|alleg\w*|accus\w*|reportedly|unconfirmed|rumou?rs?|denies|denied|disputed?)\b/.test(ttl) ? 'skeptic'
      : /\b(sanctions?|tariffs?|deal|merger|acquir\w*|ban|subsid\w*|prices?|market|stocks?|oil|rates?|trade|budget|donations?|funding|hunger|aid|billion|million)\b/.test(ttl) ? 'winners'
      : fwd ? 'watch'
      : /\b(ai|chips?|algorithm|quantum|crypto|cyber\w*|vaccine|inflation|bond|regulation|protocol|satellite)\b/.test(ttl) ? 'simple'
      : cn >= 4 ? 'contrarian' : 'between';
    var breaking = h != null && !isNaN(h) && h < 6 && cn <= 2;
    var complex = cn >= 5 || String(s.summary || '').length > 220;
    var sec = complex && !breaking ? 60 : 45;
    var why = [];
    why.push(hook === 'question' ? 'the outcome is still open, so a question opens well' : hook === 'contrast' ? 'the headline turns on a contrast' : 'it is a finished event, so lead with it');
    why.push(sec === 45 ? (breaking ? 'fresh and thinly covered: keep it short' : 'shorter shorts hold viewers better') : 'several outlets or a lot of detail: room for 60 s');
    return { sec: sec, lens: lens, hook: hook, breaking: breaking, why: why.join('; ') };
  }
  function recLabel(s) {
    var st = state.settings, r = recommendFor(s), parts = [];
    if (st.autoLen !== false) parts.push('length from the article');
    if (st.autoHook !== false) parts.push(HOOKS[r.hook].label.replace(/^(Lead with the event)$/, 'Event first').replace(/^Open with a /, '') );
    if (st.autoLens !== false && st.depth !== false) parts.push(LENSES[r.lens].label);
    return parts.join(' · ');
  }
  // Stories ticked together that are the same event are merged into one script. The outlet that can be read first is
  // the primary; the others are cross-checked against it and marked used. No new facts are invented by merging.
  function sameStory(a, b) {
    var ta = Date.parse(a.publishedAt || '') || 0, tb = Date.parse(b.publishedAt || '') || 0;
    if (ta && tb && Math.abs(ta - tb) > 2 * 86400000) return false;
    return sameEventScore(a, b).ok;
  }
  function clusterStories(list) {
    var ordered = list.slice().sort(function (a, b) { return (b.verified ? 1 : 0) - (a.verified ? 1 : 0) || (b.score || 0) - (a.score || 0); });
    var groups = [];
    ordered.forEach(function (s) {
      var g = groups.filter(function (g0) { return sameStory(g0[0], s) && rootHost(hostOf(g0[0].url)) !== rootHost(hostOf(s.url)); })[0];
      if (g) g.push(s); else groups.push([s]);
    });
    return groups;
  }
  var probeQ = Promise.resolve();
  function probeStory(s, chip) {
    if (s._srcP || s.unusable) return;
    if (chip) { chip.textContent = 'checking the article…'; chip.className = 'asg-chip is-muted'; }
    s._srcP = probeQ.then(function () { return resolveSource(s); });
    probeQ = s._srcP.catch(function () {});
    s._srcP.then(function (src) {
      if (src) {
        s.verified = true; s.verifiedVia = src.via;
        if (chip && chip.isConnected) { chip.textContent = src.via === 'alternative' ? '✓ readable via ' + src.story.source : '✓ readable (checked)'; chip.className = 'asg-chip is-ok'; }
        return;
      }
      s._srcP = null;
      var wy = fetchWhy(s.url);
      markUnusable(s, 'Could not read the article' + (wy ? ': ' + wy : '') + ', and no other outlet with the same story was found.');
      toast('"' + (s.title.length > 60 ? s.title.slice(0, 58) + '…' : s.title) + '" can\'t be used for a video: ' + (wy || 'no readable article') + '. It was unchecked.', 'error');
      renderStories(); updateStepAvailability();
    }).catch(function () { s._srcP = null; });
  }

  function renderStories() {
    var list = $('#asg-story-list'); list.innerHTML = '';
    renderFeedTools();
    var hiddenN = 0, usedN = 0;
    var shown = state.stories.filter(function (x) {
      var ok = !state.feedReadable || isReadableStory(x); if (!ok) { hiddenN++; return false; }
      if (state.feedHideUsed && !state.selectedStoryIds[x.id] && usedOf(x)) { usedN++; return false; }
      return true;
    });
    if (state.feedSort === 'viral') shown.sort(function (a, b) { return viralOf(b).score - viralOf(a).score; });
    else if (state.feedSort === 'new') shown.sort(function (a, b) { return (new Date(b.publishedAt || 0).getTime() || 0) - (new Date(a.publishedAt || 0).getTime() || 0); });
    if (usedN) list.appendChild(el('p', { class: 'asg-hint', text: usedN + ' stor' + (usedN === 1 ? 'y is' : 'ies are') + ' hidden because a script already exists for the same story. Turn off "Hide used" to see them.' }));
    if (hiddenN) list.appendChild(el('p', { class: 'asg-hint', text: hiddenN + ' stor' + (hiddenN === 1 ? 'y is' : 'ies are') + ' hidden because the article cannot be read (paywall, live page, link only, or a fetch that already failed). Turn off "Readable only" to see them. Newsreel only writes from readable sources.' }));
    shown.forEach(function (s) {
      var cb = el('input', { type: 'checkbox' });
      cb.checked = !!state.selectedStoryIds[s.id];
      var body = el('div');
      body.appendChild(el('p', { class: 'asg-story-title', text: s.title }));
      var meta = el('div', { class: 'asg-story-meta' });
      meta.appendChild(el('span', { text: s.source }));
      var unW = unusableOf(s);
      var rdLabel = unW ? '✕ can\'t use for video' : s.verified ? '✓ readable (checked)' : s.readable === 'open' ? '✓ likely readable' : s.readable === 'metered' ? '◐ maybe readable' : s.readable === 'paywalled' ? '🔒 paywalled: topic only' : s.readable === 'thin' ? 'live/video page: topic only' : 'aggregator link';
      var rdChip = el('span', { class: 'asg-chip ' + (unW ? 'is-bad' : s.verified ? 'is-ok' : 'is-muted'), text: rdLabel, title: unW || (s.verified ? 'The article text was fetched.' : 'The feed gives open access. The article is fetched and confirmed when you tick the story.') });
      meta.appendChild(rdChip);
      if (viralOf(s).stakes === 0) meta.appendChild(el('span', { class: 'asg-chip is-muted', text: 'Narrow audience', title: 'No major power, market or supply angle in the headline. Regional stories rarely reach a wide audience unless the facts tie them to a global stake.' }));
      var uk = usedOf(s);
      if (uk) meta.appendChild(el('span', { class: 'asg-chip is-warn', text: uk === 'script' ? 'Used · script made' : 'Same story already used', title: 'A script for this story exists. Delete that script to free it.' }));
      if (s.publishedAt) meta.appendChild(el('span', { text: new Date(s.publishedAt).toLocaleString() }));
      body.appendChild(meta);
      var v = viralOf(s);
      var parts = [];
      if (v.real) parts.push('Demand ' + v.dem + ' (median ' + fmtViews(v.d.median) + ' views across ' + v.d.n + ' similar Shorts, 30 days)');
      parts.push('Coverage ' + v.cn + (v.cn === 1 ? ' outlet' : ' outlets'));
      var h = ageHours(s); if (h != null && !isNaN(h)) parts.push(h < 1 ? 'under 1 h old' : h < 48 ? Math.round(h) + ' h old' : Math.round(h / 24) + ' days old');
      parts.push('Fit ' + v.fit);
      if (v.angLabel) parts.push('Hook angle: ' + v.angLabel + ' (' + (v.ang > 0 ? '+' : '') + v.ang + ')');
      body.appendChild(el('div', { class: 'asg-viral-detail', text: parts.join(' · ') }));
      if (v.real && v.d.top && v.d.top.length) {
        var sim = el('div', { class: 'asg-viral-sim' }); sim.appendChild(document.createTextNode('Similar Shorts: '));
        v.d.top.slice(0, 2).forEach(function (x, k) {
          if (k) sim.appendChild(document.createTextNode(' · '));
          sim.appendChild(el('a', { href: 'https://www.youtube.com/watch?v=' + encodeURIComponent(x.id), target: '_blank', rel: 'noopener noreferrer', text: (x.title.length > 48 ? x.title.slice(0, 46) + '…' : x.title) + ' (' + fmtViews(x.views) + ')' }));
        });
        body.appendChild(sim);
      }
      var score = el('div', { class: 'asg-story-side' });
      score.appendChild(el('span', { class: 'asg-viral is-' + viralLevel(v.score), title: v.real ? 'Virality from similar Shorts plus coverage, freshness and fit.' : 'Estimate from coverage, freshness and fit. Add a YouTube key and press Score virality for real demand data.', text: 'Virality ' + v.score + (v.real ? '' : ' est.') }));
      score.appendChild(el('span', { class: 'asg-story-score', title: 'Match: how well this story fits your channel topics and signals, plus freshness.', text: 'Match ★ ' + s.score.toFixed(1) }));
      var card = el('label', { class: 'asg-story' + (cb.checked ? ' is-selected' : '') }, [cb, body, score]);
      if (unW) cb.disabled = true;
      cb.addEventListener('change', function () {
        if (cb.checked) { state.selectedStoryIds[s.id] = true; if (!s.verified && s.readable !== 'paywalled' && s.readable !== 'thin') probeStory(s, rdChip); if (uk) toast('This story already has a script. Generating again makes a duplicate.', 'error'); }
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
    add(profile.name); add(story.source); add(story.title);
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
    if (f.status === 'confirmed') return '[BOTH OUTLETS: ' + [nameA].concat(f.confirmedBy && f.confirmedBy.length ? f.confirmedBy : [f.other && f.other.outlet || 'the second outlet']).join(' and ') + ']';
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
        var mate = (src.mates || []).some(function (m) { return cleanUrl(m.url) === cleanUrl(c.link); });
        if (!sc.ok && !mate) return;
        c.match = sc; c.mate = mate; out.push(c);
      });
      out.sort(function (x, y) { return (y.mate ? 1 : 0) - (x.mate ? 1 : 0) || (y.match.title * 3 + y.match.all) - (x.match.title * 3 + x.match.all); });
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
    var nameA = story.source, nameB = two ? corr.outlet : '', multi = !!(two && corr.outlets && corr.outlets.length > 1);
    var depth = state.settings.depth !== false;
    var lens = currentLens(), hookKind = currentHook(), shortForm = f.targetDurationSec <= 40;
    var anaMax = Math.max(24, Math.min(80, Math.round(f.wordCountMax * 0.3)));
    var bodyMax = Math.max(Math.round(f.wordCountMax * 0.4), f.wordCountMax - 16 - (depth ? anaMax : 0) - 22);
    var lines = [
      'You write explain-and-analyse YouTube Shorts for a faceless channel. By the end the viewer should understand what happened, the background that makes it make sense, who says what, and what is still open. It is not a news brief.',
      '',
      'CHANNEL',
      '- Positioning: ' + (profile.identity.positioning || profile.identity.oneLiner || profile.name),
      '- Topics: ' + topics,
      '- Tone: ' + profile.tone.style + ', ' + profile.tone.energy,
      '- Voice DNA (write in this voice; hold this stance):\n' + dnaText(profile).split('\n').map(function (x) { return '    ' + x; }).join('\n'),
      '- Avoid: ' + (profile.tone.avoid || []).join(', '),
      '- Length: aim for ' + f.wordCountMin + '-' + f.wordCountMax + ' words across hook + body' + (depth ? ' + analysis' : '') + ' + cta (about ' + f.targetDurationSec + ' seconds). The middle of that range is the target. Coming in under it is fine; going over the maximum is a failure and the script will be sent back. Budget: hook 8-16 words, body up to ' + bodyMax + ' words' + (depth ? ', analysis up to ' + anaMax + ' words' : '') + ', cta 10-22 words. Use only what the facts support: never add unrelated events or filler to reach a length, and cut the least important body sentences rather than going over.',
      '',
      'STORY: ' + story.title,
      'Primary source: ' + nameA + (story.publishedAt ? ' (' + String(story.publishedAt).slice(0, 10) + ')' : '') + (two ? (multi ? '. Other outlets: ' + nameB + '.' : '. Second outlet: ' + nameB + '.') : '. Single source: no second outlet could be checked.'),
      ''
    ];
    function list(title, arr) {
      if (!arr.length) return;
      lines.push(title);
      arr.forEach(function (x) {
        var extra = '';
        var oB = (x.other && x.other.outlet) || nameB;
        if (x.status === 'conflict' && x.other) extra = ' || ' + oB + ' DIFFERS: ' + (x.other.note || x.other.quote);
        if (x.status === 'possible' && x.other && x.other.quote) extra = ' || ' + oB + ' SAYS: ' + x.other.quote;
        if (x.status === 'confirmed' && multi) extra = ' [reported by ' + [x.outlet].concat(x.confirmedBy && x.confirmedBy.length ? x.confirmedBy : [x.other && x.other.outlet]).filter(Boolean).join(', ') + ']';
        lines.push('- ' + x.claim + extra);
      });
      lines.push('');
    }
    if (two) {
      lines.push('VERIFIED FACTS (the ONLY facts you may state as fact):', '');
      list(multi ? 'CONFIRMED BY MORE THAN ONE OUTLET (each fact says which outlets report it):' : 'CONFIRMED BY BOTH OUTLETS (' + nameA + ' and ' + nameB + ' report the same thing):', facts.filter(function (x) { return x.status === 'confirmed'; }));
      list('ONLY ' + nameA + ' REPORTS (attribute to ' + nameA + '):', facts.filter(function (x) { return x.status === 'single' && x.outlet === nameA; }));
      uniq(facts.filter(function (x) { return x.status === 'single' && x.outlet !== nameA; }).map(function (x) { return x.outlet; })).forEach(function (o) {
        list('ONLY ' + o + ' REPORTS (attribute to ' + o + '):', facts.filter(function (x) { return x.status === 'single' && x.outlet === o; }));
      });
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
      (depth ? '6. (No "worth watching" or "the open question" lines in the body. The analysis, written in a separate step, ends on those.)' :       '6. WHAT TO WATCH: 1-2 sentences of open questions or "if X, then Y" possibilities. No forecasts (no "will", no "likely"). Do not attribute views to analysts or experts: write "Worth watching:" or "The open question:".')
    ]);
    if (HOOKS[hookKind].rule) lines.push(HOOKS[hookKind].rule);
    lines.push('');
    lines.push('HOOK CRAFT (the first 2 seconds decide whether anyone stays)');
    lines.push('- The hook is the first frame: no greeting, no setup, no outlet. Someone who has never heard of the story must understand who did what and why they should care, in under 13 words.');
    lines.push('- Pick the strongest formula the facts allow: (a) the consequence first ("Tehran just closed the door on talks."), (b) a question the facts answer ("Why would Iran offer to reopen Hormuz now?"), (c) a hidden layer or contrast ("Everyone is watching the front line. The real move is somewhere else."). Leave an open loop that the body pays off.');
    lines.push('- "alt_hooks": also give two OTHER opening lines in the two formulas you did not use for "hook", each under 14 words, built only from the facts, no outlet names, each one a real alternative a viewer might stop for.');
    lines.push('');
    lines.push('VOICE AND PACING (this decides whether people keep watching)');
    lines.push('- Pace: short spoken sentences, mostly 6 to 14 words, none above 20. One idea per sentence. A new beat (a turn, a name, a number, a contrast) at least every two sentences. No filler (basically, essentially, in fact).');
    lines.push('- Speak as the channel: plain, confident, human. A person explaining what they found, not a wire report. Short sentences, spoken rhythm.');
    lines.push('- State every fact ONCE. Do not repeat a number, name or claim in the body, the analysis or the CTA, and do not circle back with a recap.');
    lines.push('- The headline fact (or the question) comes in the first sentence of the hook. Nothing before it. Never start the hook with an outlet name or "according to": open with the event and why it matters to someone who has never heard of the story.');
    lines.push('- For policy and economic stories, say in the first or second sentence what changes for ordinary people (prices, jobs, travel, energy, borders), but only when the facts say so. Never invent an impact.');
    lines.push('- Name the source once and briefly, at the point it matters. Do not repeat the outlet name in every sentence.');
    lines.push('- Where a figure is the point of the story, say it plainly and let it land; do not bury it mid-sentence.');
    lines.push('- The CTA is one short question about the story itself and repeats no fact.');
    lines.push('');
    lines.push('HUMAN VOICE (it must not sound like a machine wrote it)');
    lines.push('- Write the way a sharp friend would explain the news out loud: contractions, active verbs, plain words, a mix of short and medium sentences.');
    lines.push('- Never talk about the script, the sources, or how the story was put together. Forbidden: "from one outlet", "single source", "this story", "this report", "the article", "it is worth noting", "in conclusion", "in summary", "delve", "landscape", "moreover", "furthermore".');
    lines.push('- Name the outlet naturally and once ("CBS says...", "per CBS...", "officials told CBS..."). Do not write how many outlets there are. Whether it is one outlet or several is the reviewer\'s job to note, never the viewer\'s.');
    lines.push('- Bad: "CBS News reports from one outlet; Iran says warships are not allowed." Good: "Iran just told the US its warships are not welcome in the Gulf, under any circumstance. That is CBS\'s reporting, and Washington has not answered yet." (only if the facts say Washington has not answered).');
    lines.push('');
    if (shortForm) lines.push('SHORT FORM (about ' + f.targetDurationSec + ' seconds): keep it tight. WHAT HAPPENED 1-2 sentences, skip BACKGROUND and WHO SAYS WHAT unless the story cannot be understood without them, WHY IT MATTERS 1 sentence, WHAT TO WATCH 1 sentence or fold it into the analysis. Analysis ' + (depth ? '1-2 sentences' : 'is off') + '.');
    if (depth) {
      lines.push('7. ANALYSIS: leave the "analysis" field as an empty string. It is written in a separate step by an analyst.');
    } else {
      lines.push('7. (no analysis section)');
    }
    lines.push('8. CTA: one specific question that invites viewers to take a side AND echoes the key word or idea of your hook, so the ending flows straight back into the opening (viewers who replay it count as extra views). Never a goodbye: no "thanks for watching", "follow for more", "see you", "like and subscribe".');
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
      lines.push(multi ? '- Say "several outlets report" or name the outlets only about facts in the CONFIRMED list. That means more than one outlet reports it, not that it is proven: never say "verified" or "proven".' : '- Say "both ' + nameA + ' and ' + nameB + ' report" only about facts in the CONFIRMED list. That means both outlets report it, not that it is proven: never say "verified" or "proven".');
      lines.push('- Facts in an ONLY list must be attributed to that outlet by name. Never write "both", "outlets agree" or "confirmed" about anything outside the CONFIRMED list.');
      lines.push('- If the outlets differ, say so plainly and name each outlet\'s version, or leave the point out.');
      lines.push('- For POSSIBLE DIFFERENCE facts, state each outlet\'s version separately with its name. Never write that the outlets disagree or differ about them.');
    } else {
      lines.push('- Name ' + nameA + ' ONCE, naturally, where it matters ("' + nameA + ' reports...", "per ' + nameA + '"), and again only for a disputed or claimed point. Do not write as if several outlets had confirmed it, and do not write anything about the number or kind of sources.');
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
    lines.push('PINNED COMMENT (field "pinned_comment"): one or two sentences the channel posts and pins under the video: a different, specific question that makes viewers pick a side or say what they think about THIS story. No new facts, no numbers that are not in the facts, no hashtags, under 220 characters.');
    lines.push('CALLOUTS (field "callouts", 0 to 3 items): the key figure, date or name viewers should see on screen at the moment it is spoken. "text": at most 4 words copied from the facts (for example "50% tariffs" or "Oct 30"). "at": 3 to 6 consecutive words copied exactly, in order, from your hook or body at the point it is spoken. Only for figures or names that are in the facts. Use an empty list if nothing fits.');
    lines.push('');
    lines.push('HEADLINE BANNER (field "banner"): the story\'s core tension or question in 4 to 9 plain words, shown in large text over the first three seconds for viewers watching on mute. Built only from the facts, no outlet name.');
    lines.push('TAG RULES: tags name this story\'s own subject: the people, places, institutions and topic (for example Trump, Economy, Inflation, Midterms). Never reuse the channel\'s usual tags unless the story is about that topic. No generic filler such as geopolitics or global strategy on a story that is not about it.');
    lines.push('TITLE RULES: the title must make sense to a stranger who sees nothing else: name the main actor and the event in plain words, with no unexplained product names, jargon or metaphors (avoid words like stalemate, chess, tightrope). If the story is regional, put the wider stake in the title only when the facts state it. Every number, name and place in a title must come from the facts. No all caps, no emoji, no "shocking", no promise the video does not keep. Prefer a specific named subject plus the open question or the tension. "alt_titles" are two different options, not rewordings of one another.');
    lines.push('');
    lines.push('Return STRICT JSON only:');
    lines.push('{"hook":"...","alt_hooks":[{"style":"consequence|question|hidden","text":"..."},{"style":"consequence|question|hidden","text":"..."}],"body":"WHAT HAPPENED + BACKGROUND + WHO SAYS WHAT + WHY IT MATTERS + WHAT TO WATCH as one flowing narration","analysis":"","cta":"...","title":"the best title: specific and catchy, under 60 characters, built only from the facts. A question works when the outcome is open (for example Is [Entity] Ready For [Event]?)","banner":"...","pinned_comment":"...","callouts":[{"text":"...","at":"..."}],"alt_titles":[{"style":"match","text":"plain, factual, in the channel tone"},{"style":"engaging","text":"the most curiosity-driving framing that the facts still fully support: a question or a tension between two facts"}],"description":"2-3 lines summarising the story","tags":["5-8 tags"]}');
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
    var ep = (window.AUTONOM_ASG || {}).llmEndpoint;
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
    if (provider === 'openrouter') headers['X-Title'] = 'Autonom Newsreel';
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
  function trailStep(ph) {
    ph = String(ph || '');
    return /extract/i.test(ph) ? 'Facts' : /checking each fact/i.test(ph) ? 'Fact check' : /compar|second outlet|looking for|reading/i.test(ph) ? 'Cross-check'
      : /analysis/i.test(ph) ? 'Analysis' : /audit|applying/i.test(ph) ? 'Audit' : /writing script|revision/i.test(ph) ? 'Script' : 'Other';
  }
  function trailSummary() {
    var seen = {}, out = [];
    llmTrail.forEach(function (x) { var step = trailStep(x.ph), k = step + '|' + x.p + '|' + x.m; if (!seen[k]) { seen[k] = 1; out.push({ step: step, provider: x.p, model: x.m }); } });
    return out;
  }
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

  var LENS_EX = { between: 'The timing suggests the move is aimed less at A than at B.', contrarian: 'The easy reading is X. But the facts also fit Y.', simple: 'In plain words: here is what is actually going on.', winners: 'A appears to benefit. B looks exposed.', skeptic: 'Claimed by X. Not yet confirmed: the rest.', watch: 'If the next statement changes tone, that would suggest a shift.' };
  var HOOK_EX = { event: '[Who] did [what], [specific detail].', question: 'Why did [who] do this now?', contrast: '[A] says one thing, but [B].' };
  function budgetFor(f, depth) {
    var mid = Math.round((f.wordCountMin + f.wordCountMax) / 2);
    var ana = depth ? Math.max(24, Math.min(80, Math.round(f.wordCountMax * 0.3))) : 0;
    var hook = 13, cta = 13, body = Math.max(12, mid - hook - cta - ana);
    return { hook: hook, body: body, analysis: ana, cta: cta, total: hook + body + ana + cta };
  }
  function optRow(label, content, note) {
    var r = el('div', { class: 'asg-o-row' });
    r.appendChild(el('span', { class: 'asg-o-label', text: label }));
    var c = el('div', { class: 'asg-o-body' }); [].concat(content).forEach(function (n) { c.appendChild(n); });
    if (note) c.appendChild(el('p', { class: 'asg-o-note', html: note }));
    r.appendChild(c); return r;
  }
  function renderScriptOptions() {
    var box = $('#asg-script-options'); if (!box) return;
    box.innerHTML = '';
    var p = state.profile; if (!p || !p.format) return;
    var depthOn = state.settings.depth !== false;
    var card = el('div', { class: 'asg-opts' });

    // Length: a simple timeline
    var cur = p.format.targetDurationSec, ci = 0, best = 1e9;
    LEN_CHOICES.forEach(function (sec, k) { if (Math.abs(sec - cur) < best) { best = Math.abs(sec - cur); ci = k; } });
    var autoLen = state.settings.autoLen !== false, autoLens = state.settings.autoLens !== false, autoHook = state.settings.autoHook !== false;
    var dial = el('div', { class: 'asg-dial' + (autoLen ? ' is-auto' : ''), role: 'group', 'aria-label': 'Video length' });
    function autoBtn(on, field, label) {
      var b = el('button', { type: 'button', class: 'asg-opt asg-opt-auto' + (on ? ' is-on' : ''), 'aria-pressed': on ? 'true' : 'false', text: label || 'Auto · recommended' });
      b.addEventListener('click', function () { state.settings[field] = true; persistSettings(); renderScriptOptions(); renderGenerateStatus(); });
      return b;
    }
    dial.appendChild(el('div', { class: 'asg-dial-track' }, [el('div', { class: 'asg-dial-fill', style: 'width:' + (ci / (LEN_CHOICES.length - 1) * 100) + '%' })]));
    var stops = el('div', { class: 'asg-dial-stops' });
    LEN_CHOICES.forEach(function (sec, k) {
      var f = formatFor(sec), on = !autoLen && cur === sec;
      var b = el('button', { type: 'button', class: 'asg-dial-stop' + (on ? ' is-on' : '') + (k < ci ? ' is-passed' : ''), 'aria-pressed': on ? 'true' : 'false' }, [el('span', { class: 'asg-dot' }), el('strong', { text: sec + ' s' })]);
      b.addEventListener('click', function () {
        p.format.targetDurationSec = f.targetDurationSec; p.format.wordCountMin = f.wordCountMin; p.format.wordCountMax = f.wordCountMax; p.format.lengthV2 = true;
        state.settings.autoLen = false; persistSettings();
        persistProfile(); renderProfile(); renderScriptOptions(); renderGenerateStatus();
      });
      stops.appendChild(b);
    });
    dial.appendChild(stops);
    var bd = budgetFor(p.format, depthOn);
    var anat = el('div', { class: 'asg-anat' });
    [['hook', bd.hook], ['body', bd.body], ['analysis', bd.analysis], ['cta', bd.cta]].forEach(function (x) { if (x[1]) anat.appendChild(el('i', { class: 'is-' + x[0], style: 'flex-grow:' + x[1] + ';' })); });
    var lenNote = 'About ' + bd.total + ' words: hook ' + bd.hook + ', story ' + bd.body + (bd.analysis ? ', analysis ' + bd.analysis : '') + ', question ' + bd.cta + '.';
    card.appendChild(optRow('Length', [autoBtn(autoLen, 'autoLen'), dial, anat], autoLen ? 'Chosen per story: 45 s for most, 60 s when several outlets cover it or there is a lot of detail. Shorter shorts hold viewers better. Pick a length to override.' : lenNote));

    // Lens: one line of choices, one line of explanation
    var lensKeys = Object.keys(LENSES);
    var chips = el('div', { class: 'asg-chipset', role: 'group', 'aria-label': 'Analysis lens' });
    chips.appendChild(autoBtn(autoLens, 'autoLens'));
    lensKeys.forEach(function (k) {
      var on = !autoLens && baseLens() === k;
      var b = el('button', { type: 'button', class: 'asg-opt' + (on ? ' is-on' : ''), 'aria-pressed': on ? 'true' : 'false', text: LENSES[k].label });
      b.disabled = !depthOn;
      b.addEventListener('click', function () { state.settings.lens = k; state.settings.autoLens = false; persistSettings(); renderScriptOptions(); renderGenerateStatus(); });
      chips.appendChild(b);
    });
    var tog = el('label', { class: 'asg-switch' });
    var cb = el('input', { type: 'checkbox' }); cb.checked = depthOn;
    cb.addEventListener('change', function () { state.settings.depth = cb.checked; persistSettings(); renderScriptOptions(); });
    tog.appendChild(cb); tog.appendChild(el('span', { class: 'asg-switch-ui' })); tog.appendChild(el('span', { text: 'Include analysis' }));
    var lensNote = !depthOn ? 'Analysis is off. The script is a plain explainer.' : autoLens ? 'Picked per story from its headline: claims, money, what comes next, technical topics. Pick an angle to override.' : LENSES[baseLens()].desc + ' <em>' + LENS_EX[baseLens()] + '</em>';
    card.appendChild(optRow('Angle', [chips, tog], lensNote));

    // Hook
    var hc = el('div', { class: 'asg-chipset', role: 'group', 'aria-label': 'Hook style' });
    hc.appendChild(autoBtn(autoHook, 'autoHook'));
    Object.keys(HOOKS).forEach(function (k) {
      var on = !autoHook && baseHook() === k;
      var b = el('button', { type: 'button', class: 'asg-opt' + (on ? ' is-on' : ''), 'aria-pressed': on ? 'true' : 'false', text: HOOKS[k].label });
      b.addEventListener('click', function () { state.settings.hook = k; state.settings.autoHook = false; persistSettings(); renderScriptOptions(); renderGenerateStatus(); });
      hc.appendChild(b);
    });
    card.appendChild(optRow('Opening', hc, autoHook ? 'A question when the outcome is open, a contrast when the headline turns on one, the event when it is finished. Pick one to override.' : '<em>' + HOOK_EX[baseHook()] + '</em>'));
    box.appendChild(card);
  }
  var generating = false;
  function renderGenerateStatus() {
    renderScriptOptions();
    var box = $('#asg-generate-summary'); if (!box) return;
    box.innerHTML = '';
    var sel = state.stories.filter(function (x) { return state.selectedStoryIds[x.id]; });
    var provider = state.settings.llmProvider;
    var llmReady = provider !== 'none' && !!keyFor(provider);
    var wrap = el('div', { class: 'asg-hint', style: 'margin:0 0 14px;padding:12px;background:#f4f6fa;border:1px solid #dfe4ee;border-radius:8px;color:#1f2a44;' });
    wrap.appendChild(el('strong', { text: sel.length + (sel.length === 1 ? ' story selected' : ' stories selected') }));
    var ul = el('ul', { style: 'margin:8px 0 8px 18px;padding:0;' });
    sel.forEach(function (x) { var rl = recLabel(x); var li = el('li', { text: x.title + ' (' + x.source + ')' }); if (rl) li.appendChild(el('span', { class: 'asg-rec', text: ' → ' + rl, title: recommendFor(x).why })); ul.appendChild(li); });
    wrap.appendChild(ul);
    if (sel.length > 1) {
      var cg = groupsFor(sel).filter(function (g) { return g.length > 1; });
      if (cg.length) wrap.appendChild(el('p', { class: 'asg-hint', style: 'margin:0 0 8px;', text: cg.map(function (g) { return g.length + ' of these cover the same story (' + g.map(function (x) { return x.source; }).join(', ') + '): one script will be written from ' + (consFor(g) ? 'the consolidated facts' : 'the main story, cross-checked against another outlet') + ', and all are marked used.'; }).join(' ') }));
    }
    if (sel.length > 1) {
      var nVid = groupsFor(sel).length;
      if (nVid >= 3) wrap.appendChild(el('p', { class: 'asg-hint', style: 'margin:0 0 8px;', text: nVid + ' separate videos will be made. Shorts channels tend to do better publishing one or two polished videos a day than four to six, because new uploads compete with the ones before them. Consider publishing the strongest one or two now and spacing out the rest.' }));
    }
    var ai = el('div', { style: 'margin-top:4px;' });
    if (llmReady) {
      var others = ['gemini', 'groq', 'openrouter', 'nvidia', 'openai', 'deepseek'].filter(function (p) { return p !== provider && keyFor(p); });
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
      var sb = $('#asg-stop-btn'); if (sb) sb.hidden = !generating;
    }
  }
  // Rubric for an opening line, from Shorts retention guidance: short, specific, real stakes, a curiosity gap, never the outlet first.
  function hookScore(h) {
    var t = String(h || '').trim(), w = wordCount(t), pts = 50, why = [];
    if (w <= 9) { pts += 14; why.push('short'); } else if (w <= 13) { pts += 8; why.push('tight'); } else if (w > 16) { pts -= 12; why.push('long'); }
    if (/\d/.test(t)) { pts += 6; why.push('a number'); }
    if (/\s[A-Z][a-z]{2,}/.test(t)) { pts += 6; why.push('names who'); }
    if (/\?\s*$/.test(t)) { pts += 8; why.push('open question'); }
    if (/\b(secret\w*|hidden|covert|quietly|no one|nobody|without warning|first time|just|suddenly|but|despite|only|behind|really)\b/i.test(t)) { pts += 7; why.push('curiosity gap'); }
    if (/\b(blackouts?|oil|prices?|war|strikes?|killed|dead|ban|cuts?|shut\w*|collapse\w*|threat\w*|blockade|sanctions?|attack\w*|risk|crisis|warns?|talks)\b/i.test(t)) { pts += 8; why.push('real stakes'); }
    if (/^\W*(according to|per |in this|today|breaking|hey|welcome)/i.test(t) || /\b(reports?|reported|says)\b/i.test(t.slice(0, 25))) { pts -= 18; why.push('opens with the source'); }
    if (/\b(basically|essentially|actually|very|really)\b/i.test(t)) pts -= 6;
    return { score: Math.max(0, Math.min(100, pts)), why: why };
  }
  function cleanAltHooks(arr, mainHook, articleText, extraAllow, used) {
    var out = [], seen = {}; seen[normText(mainHook)] = 1;
    (Array.isArray(arr) ? arr : []).forEach(function (a) {
      var t = String((a && (a.text || a.hook)) || (typeof a === 'string' ? a : '')).trim();
      if (!t || out.length >= 2) return;
      var w = wordCount(t), k = normText(t);
      if (w < 4 || w > 16 || seen[k]) return;
      if (unsupportedNumbers(t, articleText).length) return;
      if (unsupportedTerms(t, articleText, allowWordsFor(used, state.profile).concat(extraAllow || [])).length) return;
      if (/^\W*(according to|per )/i.test(t) || /\b(thanks for watching|follow for more|subscribe)\b/i.test(t)) return;
      seen[k] = 1;
      var hs = hookScore(t);
      out.push({ style: String((a && a.style) || '').slice(0, 20), text: t, score: hs.score, why: hs.why });
    });
    return out;
  }
  function useHook(sc, alt) {
    var story = { source: sc.sourceName || '', title: sc.storyTitle || sc.title || '' };
    return auditScript({ hook: alt.text, body: '', analysis: '', cta: '' }, sc.facts || [], story, sc.corroboration || { status: 'none' }).then(function (a) {
      var major = (a.flags || []).filter(function (f) { return f.severity !== 'minor'; });
      if (a.ran && major.length) return { ok: false, problem: major[0].problem || 'The audit found a problem with this hook.' };
      var old = { style: 'previous', text: sc.hook, score: hookScore(sc.hook).score, why: hookScore(sc.hook).why };
      sc.hookAlts = (sc.hookAlts || []).filter(function (x) { return x !== alt; }).concat([old]);
      sc.hook = alt.text; sc.hookScore = hookScore(sc.hook);
      persistScripts();
      return { ok: true, audited: !!a.ran };
    });
  }
  function cleanAltTitles(arr, mainTitle, articleText) {
    var hay = ' ' + normText(articleText || '') + ' ', out = [], seen = {};
    var STOP = { the: 1, this: 1, that: 1, what: 1, why: 1, how: 1, who: 1, can: 1, will: 1, could: 1 };
    function okTitle(t) {
      if (!t || t.length < 12 || t.length > 80) return false;
      if (t === t.toUpperCase() || /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(t)) return false;
      if (unsupportedNumbers(t, articleText || '').length) return false;
      var caps = (t.match(/[A-Z][A-Za-z'\u2019-]{2,}/g) || []).slice(1);
      for (var i = 0; i < caps.length; i++) {
        var w = normText(caps[i]);
        if (STOP[w] || /^[a-z]{1,3}$/.test(w)) continue;
        if (hay.indexOf(w) === -1 && hay.indexOf(w.replace(/s$/, '')) === -1) return false;
      }
      return true;
    }
    (Array.isArray(arr) ? arr : []).forEach(function (a) {
      var t = str(a && (a.text || a.title || a)).replace(/^["'\u201c]+|["'\u201d]+$/g, '').replace(/\s+/g, ' ').trim();
      var k = t.toLowerCase();
      if (!okTitle(t) || seen[k] || k === String(mainTitle || '').toLowerCase()) return;
      seen[k] = 1; out.push({ style: a && a.style === 'engaging' ? 'engaging' : 'match', text: t });
    });
    return out.slice(0, 3);
  }
  function capsSupported(t, articleText) {
    var hay = ' ' + normText(articleText || '') + ' ';
    var STOP = { the: 1, this: 1, that: 1, what: 1, why: 1, how: 1, who: 1, can: 1, will: 1, could: 1 };
    var caps = [], m, re = /[A-Z][A-Za-z'\u2019-]{2,}/g;
    while ((m = re.exec(t))) { if (m.index === 0 || /[.?!]\s+$/.test(t.slice(0, m.index))) continue; caps.push(m[0]); }
    for (var i = 0; i < caps.length; i++) {
      var w = normText(caps[i]);
      if (STOP[w] || /^[a-z]{1,3}$/.test(w)) continue;
      if (hay.indexOf(w) === -1 && hay.indexOf(w.replace(/s$/, '')) === -1) return false;
    }
    return true;
  }
  function plainWords(t) { return String(t || '').toLowerCase().replace(/(\d)[,.](\d)/g, '$1$2').replace(/[^a-z0-9%$ ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function cleanCallouts(arr, narration, articleText) {
    var nt = ' ' + plainWords(narration) + ' ', out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (c) {
      var t = str(c && c.text).replace(/\s+/g, ' ').trim(), at = plainWords(c && c.at);
      if (!t || t.length > 28 || t.split(' ').length > 5 || !at) return;
      if (unsupportedNumbers(t, articleText || '').length || !capsSupported(t, articleText)) return;
      if (nt.indexOf(' ' + at + ' ') === -1) return;
      out.push({ text: t, at: str(c.at).trim() });
    });
    return out.slice(0, 3);
  }
  function cleanBanner(t, articleText) {
    t = str(t).replace(/\s+/g, ' ').trim();
    if (t.length < 12 || t.length > 70 || /#/.test(t)) return '';
    if (unsupportedNumbers(t, articleText || '').length || !capsSupported(t, articleText)) return '';
    return t;
  }
  function cleanPinned(t, articleText) {
    t = str(t).replace(/\s+/g, ' ').trim();
    if (t.length < 10 || t.length > 240 || /#/.test(t)) return '';
    if (unsupportedNumbers(t, articleText || '').length || !capsSupported(t, articleText)) return '';
    return t;
  }
  // Tags must name this story. The model sometimes copies the channel's usual tags (for example #militaryanalysis on an
  // economy story), so a tag is kept only when the script or title actually talks about it.
  function storyTags(tags, text) {
    var flat = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
    var seen = {}, out = [];
    function add(t) { t = cleanTag(t); var k = t.toLowerCase(); if (t.length > 1 && !seen[k]) { seen[k] = 1; out.push(t); } }
    tags.forEach(function (t) {
      var c = cleanTag(t).toLowerCase(); if (c.length < 2) return;
      var stem = c.slice(0, Math.min(c.length, 5));
      if (flat.replace(/ /g, '').indexOf(c) > -1 || (c.length <= 9 && (' ' + flat).indexOf(' ' + stem) > -1)) add(t);
    });
    if (out.length < 3) {
      var skip = { the: 1, and: 1, for: 1, with: 1, that: 1, this: 1, from: 1, will: 1, what: 1, how: 1, why: 1, who: 1, does: 1, are: 1, new: 1, say: 1, says: 1, after: 1, over: 1, into: 1 };
      (String(text || '').match(/(?:^|[^A-Za-z\u00C0-\u017F])([A-Z][A-Za-z\u00C0-\u017F]{3,})(?![A-Za-z\u00C0-\u017F])/g) || []).forEach(function (w) { w = w.replace(/^[^A-Z]+/, ''); if (out.length < 5 && !skip[w.toLowerCase()]) add(w); });
    }
    return out.slice(0, 8);
  }
  function scriptFromParsed(parsed, story, meta) {
    meta = meta || {};
    return {
      id: 'sc_' + Math.random().toString(36).slice(2, 10),
      storyId: story.id, storyTitle: story.title, source: story.source, url: story.url,
      hook: str(parsed.hook), body: str(parsed.body), analysis: str(parsed.analysis), cta: str(parsed.cta),
      title: str(parsed.title) || story.title.slice(0, 70),
      description: str(parsed.description),
      tags: storyTags(Array.isArray(parsed.tags) ? parsed.tags : [], [story.title, parsed.title, parsed.hook, parsed.body, parsed.description, parsed.analysis].join(' ')),
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
  function sourceMeta(src) {
    return { sourceName: src.story.source, sourceUrl: cleanUrl(src.story.url), via: src.via, sources: [cleanUrl(src.story.url)], lens: currentLens(), hookStyle: currentHook(), targetSec: state.profile && state.profile.format ? state.profile.format.targetDurationSec : LEN.defaultSec, analysisOn: state.settings.depth !== false };
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
      return !unsupportedNumbers(x, articleText).length && !repeatsFact(x, facts, 0.85) && !/\b(everyone|nobody|guaranteed)\b/.test(low) && !forecastIssues(x, '').length;
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
  function repeatsFact(sentence, facts, thr) {
    var toks = {}, n = 0;
    String(sentence).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).forEach(function (w) { if (w.length >= 5 && !toks[stem5(w)]) { toks[stem5(w)] = true; n++; } });
    if (n < 4) return false;
    return (facts || []).some(function (f) {
      var hay = {}; String(f.claim).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).forEach(function (w) { if (w.length >= 5) hay[stem5(w)] = true; });
      var hit = 0; Object.keys(toks).forEach(function (t) { if (hay[t]) hit++; });
      return hit / n >= (thr || 0.6);
    });
  }
  function checkScript(parsed, articleText, used, extraAllow, facts) {
    var main = [parsed.hook, parsed.body, parsed.analysis, parsed.cta].map(str).join('\n');
    var factual = [parsed.hook, parsed.body, parsed.cta].map(str).join('\n');
    var ana = str(parsed.analysis);
    var all = main + '\n' + str(parsed.title) + '\n' + str(parsed.description);
    var badNums = unsupportedNumbers(all, articleText);
    var allowTerms = allowWordsFor(used, state.profile).concat(extraAllow || []);
    var badTerms = unsupportedTerms(factual, articleText, allowTerms);
    var wording = wordingIssues(factual, all, articleText);
    var problems = [];
    if (ana) {
      var rp = splitSentences(ana).filter(function (x) { return repeatsFact(x, facts, 0.85); });
      if (rp.length) problems.push('The analysis repeats facts already in the script ("' + rp[0].slice(0, 70) + '…"). Write something the facts do not say (a specific reading of THIS story), or return an empty string.');
      var f2 = forecastIssues(ana, '');
      if (f2.length) wording.push('forecast in the analysis: ' + f2.join(', '));
      var ab = normText(ana).match(/\b(everyone|nobody|guaranteed)\b/);
      if (ab) wording.push('absolute in the analysis: "' + ab[1] + '"');
    }
    var hk = str(parsed.hook).trim(), srcN = String((used && used.source) || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim(), hn = normText(hk);
    if (/^(according to|per )/i.test(hk) || (srcN.length >= 3 && hn.indexOf(srcN) === 0 && /\b(reports?|says?|said|writes|according)\b/.test(hn.slice(0, srcN.length + 14)))) {
      problems.push('The hook starts with the outlet. Open with the event and why it matters to someone who has never heard of the story. Name the source later, once, briefly.');
    }
    var robo = (main + '\n' + str(parsed.title)).match(/\b(from one outlet|single[- ]source|one outlet|this (script|video|short|report|story)|the (article|report) (states|says|notes|mentions)|both [^.,;]{2,50} (?:and [^.,;]{2,40} )?report|it is worth noting|it(?:'s| is) important to note|in conclusion|in summary|delve|tapestry|landscape of|moreover|furthermore)\b/i);
    var bye = str(parsed.cta).match(/\b(thanks for watching|thank you for watching|follow for more|see you|like and subscribe|subscribe for|smash)\b/i);
    if (bye) problems.push('The closing line is a goodbye ("' + bye[0] + '"). End on the question that echoes the hook instead, so the video loops.');
    var longS = splitSentences([parsed.hook, parsed.body, parsed.analysis].map(str).join(' ')).filter(function (x) { return wordCount(x) > 28; });
    if (longS.length) problems.push('A sentence is too long for a Short (' + wordCount(longS[0]) + ' words: "' + longS[0].slice(0, 60) + '…"). Split it into short spoken sentences.');
    if (robo) problems.push('Robotic phrasing: "' + robo[0] + '". Rewrite that sentence the way a person would say it out loud. Never talk about the script, the sources or how many outlets there are.');
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
  // When the checks strip the analysis (numbers, names outside the article, repeated facts), ask once more for the
  // analysis alone, with the reasons, and run it through the same filters and the audit before accepting it.
  function repairAnalysis(sc, src, verified, corr, setLabel) {
    var depth = state.settings.depth !== false;
    if (!depth || !sc || sc.isTemplate || sc.gated || wordCount(sc.analysis || '') >= 25) return Promise.resolve(sc);
    setLabel('Writing the analysis…');
    var lens = currentLens(), f = state.profile.format, capW = (f && f.wordCountMax) || 150;
    var room = Math.max(24, Math.min(80, Math.round(capW * 0.3)));
    var lines = [
      'You are the analyst of a faceless news channel. The short is written. Your job is the analysis that comes after the story and before the closing question. It is the part that makes this channel worth following instead of just reading the news, so it must say something the news does not.',
      '', 'CHANNEL VOICE AND STANCE (stay inside it):'
    ].concat(dnaText(state.profile).split('\n'), ['', 'STORY: ' + sc.storyTitle, 'HOOK: ' + sc.hook, 'BODY: ' + sc.body, '', 'FACTS:']);
    verified.ok.forEach(function (x) { lines.push('- ' + x.claim); });
    lines.push('', 'ANGLE: ' + LENSES[lens].rule, '',
      'Write 3 or 4 spoken sentences, at most ' + room + ' words, with a clear point of view.',
      '- Say what the story does not say: what the move is really for, who gains and who pays, what the timing or wording gives away, what is conspicuously missing, how situations like this have usually played out. Use what an informed person knows about these actors and this kind of situation.',
      '- Frame readings as readings ("looks like", "reads as", "suggests", "the simplest reading is"), never as proven intent. No forecasts stated as certain.',
      '- No invented numbers, dates, statistics or quotes. Do not repeat what the body already says.',
      '- It must be about THIS story. If the paragraph would fit any story on the topic, rewrite it.',
      '- Plain spoken words, contractions, a human voice. Never mention sources, outlets, the script or the word analysis.',
      '- End on the sharpest open question or the thing that settles it ("The test is whether...").',
      'Good: "The interesting part is who the message is for. Tehran is not really talking to Washington here, it is talking to hardliners at home, and that makes a quiet climb-down much harder. The tell is that no one is offering a way out, only a price."',
      'Bad: "This situation could have significant consequences for the region and global markets." (generic, fits any story)',
      '', 'Return STRICT JSON only: {"analysis":"..."}');
    var prompt = lines.join('\n');
    var allow = allowWordsFor(src.story, state.profile).concat(outletAllow(corr)).concat(sigTokens(sc.hook + ' ' + sc.body));
    function ask(note) {
      return callLLM(prompt + (note ? '\n\n' + note : ''), 'write', { best: true }).then(function (r) {
        var j = extractJson(r.text), tmp = { analysis: str(j.analysis) };
        sanitizeAnalysis(tmp, src.allText || src.art.text, allow, verified.ok);
        function again(why) {
          if (note) return sc;
          LOG('analysis step: ' + why + ', asking once more');
          return sleep(600).then(function () { return ask('Your previous analysis was rejected (' + why + '). Write a different one: a real point of view in plain words, built on this story. No digits unless they are in the facts, no restating facts, no certain forecasts.'); });
        }
        if (!tmp.analysis) return again('nothing usable survived the checks');
        return sleep(500).then(function () { return auditScript({ hook: sc.hook, body: sc.body, analysis: tmp.analysis, cta: sc.cta }, verified.ok, src.story, corr); }).then(function (a) {
          var bad = {}; a.flags.filter(function (x) { return x.id.charAt(0) === 'I' && x.severity !== 'minor'; }).forEach(function (x) { bad[x.sentence] = true; });
          var sents = splitSentences(tmp.analysis).filter(function (x) { return !bad[x]; }).slice(0, 4);
          if (!sents.length) return again('the audit flagged every sentence');
          sc.analysis = sents.join(' ');
          if (sc.checks) { sc.checks.analysisRepaired = true; sc.checks.words = wordCount([sc.hook, sc.body, sc.analysis, sc.cta].map(str).join(' ')); }
          return sc;
        });
      });
    }
    return ask('').catch(function (e) { LOG('analysis step failed:', e && e.message); return sc; });
  }
  function rewriteAnalysis(sc) {
    var txt = (sc.facts || []).map(function (f) { return f.claim + ' ' + f.quote; }).join('\n');
    var src = { story: { title: sc.storyTitle || sc.title, source: sc.sourceName || '' }, art: { text: txt }, allText: txt };
    return repairAnalysis(sc, src, { ok: sc.facts || [] }, sc.corroboration || { status: 'none' }, function () {});
  }
  function writeAndCheck(story, src, verified, extractedCount, feedback, attempt, setLabel) {
    return writeAndCheckCore(story, src, verified, extractedCount, feedback, attempt, setLabel).then(function (sc) { return repairAnalysis(sc, src, verified, verified.corr || { status: 'none' }, setLabel); });
  }
  function writeAndCheckCore(story, src, verified, extractedCount, feedback, attempt, setLabel) {
    var corr = verified.corr || { status: 'none', conflicts: [] };
    setLabel('Writing script' + (attempt ? ' (revision)' : '') + '…');
    return callLLM(writePrompt(src.story, state.profile, verified.ok, feedback, corr), 'write', { best: true }).then(function (res) {
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
        return writeAndCheckCore(story, src, verified, extractedCount, revise, attempt + 1, setLabel);
      }
      setLabel('Auditing every sentence against the source…');
      return sleep(700).then(function () { return auditScript(parsed, verified.ok, src.story, corr); }).then(function (audit) {
        if (audit.flags.length && attempt < 1) {
          var fb = revise.concat(audit.flags.map(function (f) {
            return f.id + ' "' + f.sentence + '" (' + f.type + '): ' + f.problem + (f.fix ? ' Suggested: ' + f.fix : '');
          }));
          LOG('audit flagged ' + audit.flags.length + ' sentence(s), revising');
          return writeAndCheckCore(story, src, verified, extractedCount, fb, attempt + 1, setLabel);
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
          sc.altTitles = cleanAltTitles(parsed.alt_titles, sc.title, src.allText || src.art.text);
          sc.hookAlts = cleanAltHooks(parsed.alt_hooks, parsed.hook, src.allText || src.art.text, outletAllow(corr), src.story);
          sc.hookScore = hookScore(parsed.hook);
          sc.pinned = cleanPinned(parsed.pinned_comment, src.allText || src.art.text);
          sc.banner = cleanBanner(parsed.banner, src.allText || src.art.text);
          sc.callouts = cleanCallouts(parsed.callouts, [parsed.hook, parsed.body, parsed.analysis].map(str).join(' '), src.allText || src.art.text);
          var desc = str(parsed.description).trim();
          sc.description = (desc ? desc + '\n\n' : '') + 'Source: ' + src.story.source + ' — ' + url;
          if (corr.status !== 'none') { (corr.urls && corr.urls.length ? corr.urls : [corr.url]).forEach(function (u, k) { if (u) sc.description += '\n' + (corr.urls && corr.urls.length > 1 ? 'Also: ' : 'Second source: ') + ((corr.outlets && corr.outlets[k]) || corr.outlet) + ' — ' + u; }); }
          sc.analysis = str(parsed.analysis).trim();
          sc.analysisDropped = dropped;
          sc.facts = verified.ok;
          sc.corroboration = { status: corr.status, outlet: corr.outlet || '', outlets: corr.outlets || [], urls: corr.urls || [], url: corr.url || '', confirmed: corr.confirmed || 0, total: corr.total || 0, extra: corr.extra || 0, conflicts: corr.conflicts || [], possible: corr.possible || [], reason: corr.reason || '' };
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
          if (corr.status !== 'none') (corr.urls && corr.urls.length ? corr.urls : [corr.url]).forEach(function (u) { if (u) sc.sources.push(u); });
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
  function extractFactsFor(story, art, setLabel) {
    setLabel('Extracting facts from ' + (story.source || 'the article') + '…');
    // An answer with no facts at all means the model failed, not that the article is thin (a thin article still
    // yields a few facts). Ask once more, with a reminder of the format, before giving up.
    function getFacts(attempt) {
      var prompt = extractPrompt(story, art) + (attempt ? '\n\nYour previous answer contained no facts. Return JSON of the form {"facts":[{"claim":"...","quote":"exact words from the article"}]} with 6 to 12 facts.' : '');
      return callLLM(prompt).then(function (r) {
        var j = extractJson(r.text);
        var arr = Array.isArray(j) ? j : (Array.isArray(j.facts) ? j.facts : []);
        if (!arr.length && attempt < 1) { LOG('extraction returned no facts (' + r.provider + ' ' + r.model + '), asking once more'); setLabel('The model returned no facts, asking again…'); return getFacts(attempt + 1); }
        return { r: r, facts: arr };
      });
    }
    return getFacts(0).then(function (got) {
      var r1 = got.r, v = verifyFacts(got.facts, art.text), total = got.facts.length;
      if (!total) {
        var e0 = new Error('The AI (' + (r1.provider || '?') + ' ' + (r1.model || '') + ') returned no facts for this article twice. That is a model problem, not a thin article. Use "Retry with AI" to try again.');
        e0.gate = true; e0.retryable = true; throw e0;
      }
      LOG('facts verified: ' + v.ok.length + '/' + total + ' for "' + story.title + '"');
      return sleep(700).then(function () { setLabel('Checking each fact against its quote…'); return verifyClaims(v.ok); }).then(function (okFacts) {
        if (okFacts.length < 3) {
          var e = new Error('The source article is too thin or the model could not support enough facts with exact quotes (' + okFacts.length + ' of ' + total + ' verified). No script written.');
          e.gate = true; throw e;
        }
        var factsA = fixOverreachClaims(okFacts).map(function (f) { return { claim: f.claim, quote: f.quote, outlet: story.source, status: 'single', other: null }; });
        return { facts: factsA, total: total };
      });
    });
  }
  // Length follows the material: how many quote-checked facts there are, how much article text there is, and how
  // many outlets. A thin story gets a short short; a rich, multi-outlet story gets room. Never more than the
  // articles can honestly fill.
  function autoSecFor(facts, textWords, outlets, rec) {
    var byFacts = 20 + 4 * facts.length + (outlets > 1 ? 4 : 0);
    var byText = 0.55 * textWords / LEN.wps;
    var sec = Math.min(byFacts, byText, rec && rec.breaking ? 60 : 90);   // Studio data: 35-60 s holds viewers best; 105 s only by manual choice
    var best = LEN_CHOICES[0];
    LEN_CHOICES.forEach(function (c) { if (Math.abs(c - sec) < Math.abs(best - sec)) best = c; });
    return best;
  }
  function factBudget(sec) {
    var words = Math.round(sec * LEN.wps);
    return Math.max(4, Math.round((words * 0.74 - 26) / 16));
  }
  // The writer gets only as many facts as the video has room for: differences between outlets first, then facts
  // several outlets confirm, then the rest in the order of importance the extractor gave them.
  function fitFacts(facts, sec) {
    var n = factBudget(sec);
    if (facts.length <= n) return facts;
    var rank = function (f) { return f.status === 'conflict' || f.status === 'possible' ? 0 : f.status === 'confirmed' ? 1 : 2; };
    var order = facts.map(function (f, i) { return { i: i, r: rank(f) }; }).sort(function (a, b) { return a.r - b.r || a.i - b.i; });
    var chosen = order.slice(0, n).map(function (x) { return x.i; }).sort(function (a, b) { return a - b; });
    LOG('fact budget: using ' + chosen.length + ' of ' + facts.length + ' facts for ' + sec + ' s');
    return chosen.map(function (i) { return facts[i]; });
  }
  function planLength(story, facts, textWords, outlets) {
    var f = state.profile && state.profile.format;
    if (!f) return facts;
    if (state.settings.autoLen !== false) {
      var sec = autoSecFor(facts, textWords, outlets, recommendFor(story));
      Object.assign(f, formatFor(sec));
      story._autoSec = sec;
      LOG('length chosen from the material: ' + sec + ' s (' + facts.length + ' facts, ' + textWords + ' words of article, ' + outlets + ' outlet(s))');
    }
    return fitFacts(facts, f.targetDurationSec);
  }
  function runLlmPipeline(story, src, setLabel) {
    var c0 = story._cons;
    if (c0 && c0.facts && c0.facts.length) {
      // The Consolidate step already read every outlet and merged the quote-checked facts.
      src.allText = c0.texts.join('\n');
      var fs0 = planLength(story, c0.facts, wordCount(src.allText), (c0.outlets && c0.outlets.length) || 1);
      return sleep(400).then(function () { return writeAndCheck(story, src, { ok: fs0, corr: c0.corr }, c0.total, null, 0, setLabel); });
    }
    return extractFactsFor(src.story, src.art, setLabel).then(function (ex) {
      return sleep(900).then(function () { return corroborate(src, ex.facts, setLabel); }).then(function (c) {
        if (state.settings.requireSecond && !c.art) {
          var e2 = new Error('Settings require a second outlet, but none could be read and matched. ' + (c.corr.reason || ''));
          e2.gate = true; throw e2;
        }
        src.allText = src.art.text + (c.art ? '\n' + c.art.text : '');
        var fs1 = planLength(story, c.facts, wordCount(src.allText), c.art ? 2 : 1);
        return sleep(900).then(function () { return writeAndCheck(story, src, { ok: fs1, corr: c.corr }, ex.total, null, 0, setLabel); });
      });
    });
  }

  // ---------- Consolidate: several outlets on one event become one quote-checked, outlet-tagged fact list ----------
  function mergeCorroborations(factsA, results) {
    var none = { facts: factsA, corr: { outlet: '', outlets: [], url: '', urls: [], status: 'none', confirmed: 0, conflicts: [], possible: [], extra: 0, total: factsA.length, reason: 'None of the other outlets reported the same key facts.' } };
    if (!results.length) return none;
    if (results.length === 1) { var o = results[0].out; o.corr.outlets = [o.corr.outlet]; o.corr.urls = [o.corr.url]; return o; }
    var merged = factsA.map(function (f) { return { claim: f.claim, quote: f.quote, outlet: f.outlet, status: 'single', other: null, confirmedBy: [] }; });
    results.forEach(function (r) {
      r.out.facts.forEach(function (f, i) {
        if (i >= factsA.length) return;
        var m = merged[i];
        if (f.status === 'confirmed') { m.confirmedBy.push(f.other.outlet); if (!m.other) m.other = f.other; if (m.status !== 'conflict') m.status = 'confirmed'; }
        else if (f.status === 'conflict') { m.status = 'conflict'; m.other = f.other; }
        else if (f.status === 'possible' && m.status === 'single') { m.status = 'possible'; m.other = f.other; }
      });
    });
    var extra = 0;
    results.forEach(function (r) {
      r.out.facts.slice(factsA.length).forEach(function (x) {
        var xt = sigTokens(x.claim);
        var dup = merged.some(function (m) { var mt = sigTokens(m.claim), sh = xt.filter(function (w) { return mt.indexOf(w) !== -1; }).length; return sh >= Math.ceil(Math.min(xt.length, mt.length) * 0.6); });
        if (dup) return;
        merged.push({ claim: x.claim, quote: x.quote, outlet: x.outlet, status: 'single', other: null, confirmedBy: [] }); extra++;
      });
    });
    var names = results.map(function (r) { return r.out.corr.outlet; }), urls = results.map(function (r) { return r.out.corr.url; });
    var corr = { outlet: names.join(' and '), outlets: names, url: urls[0], urls: urls, status: 'none', confirmed: 0, conflicts: [], possible: [], extra: extra, total: factsA.length, reason: '' };
    merged.forEach(function (f) {
      if (f.status === 'confirmed') corr.confirmed++;
      else if (f.status === 'conflict') corr.conflicts.push({ claim: f.claim, outlet: f.outlet, other: f.other });
      else if (f.status === 'possible') corr.possible.push({ claim: f.claim, outlet: f.outlet, other: f.other });
    });
    corr.status = corr.conflicts.length ? 'conflict' : corr.confirmed >= 2 ? 'corroborated' : corr.confirmed ? 'partial' : 'none';
    if (corr.status === 'none') return none;
    return { facts: merged, corr: corr };
  }
  function consolidateGroup(g, say) {
    var primary = g[0], mates = g.slice(1, 3);
    say('Reading ' + primary.source + '…');
    var pP = primary._srcP || (primary._srcP = resolveSource(primary));
    return pP.then(function (srcA) {
      if (!srcA) { primary._srcP = null; throw new Error('The main article (' + primary.source + ') could not be read.'); }
      return extractFactsFor(srcA.story, srcA.art, say).then(function (ex) {
        var results = [], texts = [srcA.art.text], urls = [cleanUrl(srcA.story.url)], skipped = [], noMatch = [], i = 0;
        function nextMate() {
          if (i >= mates.length) return Promise.resolve();
          var m = mates[i++];
          say('Reading ' + m.source + '…');
          return (m._srcP || (m._srcP = resolveSource(m))).then(function (srcB) {
            if (!srcB || !srcB.art || String(srcB.art.text || '').length < 600) { m._srcP = null; skipped.push(m.source); return null; }
            var nameB = srcB.story.source || m.source;
            if (rootHost(hostOf(srcB.story.url)) === rootHost(hostOf(srcA.story.url))) { skipped.push(nameB + ' (same outlet)'); return null; }
            say('Comparing ' + nameB + ' with ' + primary.source + '…');
            return sleep(700).then(function () { return callLLM(corroboratePrompt(srcA.story, ex.facts, srcB.art, nameB), 'write'); }).then(function (r) {
              var out = applyCorroboration(ex.facts, extractJson(r.text), srcB.art, nameB, cleanUrl(srcB.art.finalUrl || srcB.story.url));
              LOG('consolidation with ' + nameB + ': ' + out.corr.status + ' · confirmed ' + out.corr.confirmed + '/' + out.corr.total + ' · extra ' + out.corr.extra);
              if (out.corr.status === 'none') { noMatch.push(nameB); return null; }
              results.push({ out: out }); texts.push(srcB.art.text); urls.push(cleanUrl(srcB.art.finalUrl || srcB.story.url));
            }).catch(function (e) { if (e.fatal || e.code === 'QUOTA') throw e; LOG('consolidation compare failed:', e.message); skipped.push(nameB); });
          }).then(nextMate);
        }
        return nextMate().then(function () {
          var mg = mergeCorroborations(ex.facts, results);
          return { sig: g.map(function (x) { return x.id; }).join(','), facts: mg.facts, corr: mg.corr, texts: texts, urls: urls, total: ex.total, outlets: [primary.source].concat(mg.corr.outlets || []), skipped: skipped, noMatch: noMatch, at: Date.now() };
        });
      });
    });
  }
  // Groups: stories ticked together that cover the same event (at most three outlets per group). The user can move a
  // story to another group or let it stand alone.
  function sigOf(g) { return g.map(function (x) { return x.id; }).join(','); }
  function groupsFor(list) {
    var ids = list.map(function (x) { return x.id; }), byId = {};
    list.forEach(function (x) { byId[x.id] = x; });
    var out = [], placed = {};
    (state.consGroups || []).forEach(function (gi) {
      var g = gi.filter(function (id) { return byId[id]; }).map(function (id) { return byId[id]; });
      g.forEach(function (x) { placed[x.id] = true; });
      if (g.length) out.push(g);
    });
    var rest = list.filter(function (x) { return !placed[x.id]; });
    if (rest.length) {
      if (!out.length) clusterStories(rest).forEach(function (g) { out.push(g.slice(0, 3)); g.slice(3).forEach(function (x) { out.push([x]); }); });
      else rest.forEach(function (x) {
        var g = out.filter(function (g0) { return g0.length < 3 && sameStory(g0[0], x) && rootHost(hostOf(g0[0].url)) !== rootHost(hostOf(x.url)); })[0];
        if (g) g.push(x); else out.push([x]);
      });
    }
    state.consGroups = out.map(function (g) { return g.map(function (x) { return x.id; }); });
    return out;
  }
  function consFor(g) { var r = (state.consRes || {})[g[0].id]; return r && r.sig === sigOf(g) ? r : null; }
  function selectedList() { return state.stories.filter(function (x) { return state.selectedStoryIds[x.id]; }); }
  var consBusy = false, consStop = false, consThen = false, consProg = { done: 0, total: 0, label: '' };
  function paintConsProg() {
    var on = consBusy, txt = on ? 'Consolidating ' + Math.min(consProg.done + 1, consProg.total) + ' of ' + consProg.total + (consProg.label ? ' · ' + consProg.label : '') : '';
    var bar = $('#asg-cons-prog'); if (bar) { bar.hidden = !on; var f = $('.asg-cons-prog-fill', bar), l = $('.asg-cons-prog-label', bar); if (f) f.style.width = (consProg.total ? Math.round(100 * consProg.done / consProg.total) : 0) + '%'; if (l) l.textContent = txt + (consThen ? ' · will continue to Generate when done' : ''); }
    var chip = $('#asg-bg-chip'); 
    if (!chip) { var acts = $('.asg-topbar-actions'); if (acts) { chip = el('button', { type: 'button', class: 'asg-btn-pill', id: 'asg-bg-chip' }); chip.addEventListener('click', function () { setStep('consolidate'); }); acts.insertBefore(chip, acts.firstChild); } }
    if (chip) { chip.hidden = !on; chip.textContent = '⟳ ' + txt; chip.title = 'Consolidation runs in the background. Click to open it.'; }
  }
  function renderConsolidate() {
    var box = $('#asg-cons-list'); if (!box) return;
    box.innerHTML = '';
    var groups = groupsFor(selectedList());
    var multi = groups.filter(function (g) { return g.length > 1; }).length;
    var runBtn = $('#asg-cons-run'); if (runBtn) { runBtn.hidden = !multi || consBusy; runBtn.disabled = consBusy; }
    var stopBtn = $('#asg-cons-stop'); if (stopBtn) stopBtn.hidden = !consBusy;
    paintConsProg();
    box.appendChild(el('p', { class: 'asg-hint', text: multi
      ? multi + (multi === 1 ? ' group of stories covers' : ' groups of stories cover') + ' the same event. Consolidating reads each outlet, extracts quote-checked facts and merges them into one fact list tagged by outlet. It changes nothing in the stories. The script writer then decides how to use the facts.'
      : 'Every selected story stands alone, so there is nothing to merge. Continue to Generate.' }));
    groups.forEach(function (g, gi) {
      var card = el('div', { class: 'asg-cons-card' });
      var res = consFor(g);
      var head = el('div', { class: 'asg-cons-head' });
      head.appendChild(el('strong', { text: g.length > 1 ? 'One story · ' + g.length + ' outlets' : 'One outlet' }));
      if (g.length === 1) {
        var twin = groups.filter(function (g0) { return g0 !== g && g0.length > 1 && sameStory(g0[0], g[0]); })[0];
        if (twin) head.appendChild(el('span', { class: 'asg-chip is-bad', text: 'Looks like the same story as "' + twin[0].title.slice(0, 40) + (twin[0].title.length > 40 ? '…' : '') + '"' + (twin.length >= 3 ? ', which already has 3 outlets' : '') + '. Remove it to avoid a second script.' }));
      }
      if (res) head.appendChild(el('span', { class: 'asg-chip is-ok', text: 'Consolidated · ' + res.facts.length + ' facts' + (res.corr.confirmed ? ' · ' + res.corr.confirmed + ' confirmed by 2+' : '') + (res.corr.conflicts && res.corr.conflicts.length ? ' · ' + res.corr.conflicts.length + ' conflict' : '') }));
      card.appendChild(head);
      g.forEach(function (x, xi) {
        var row = el('div', { class: 'asg-cons-row' });
        var t = el('div', { class: 'asg-cons-title' });
        t.appendChild(el('span', { text: x.title }));
        t.appendChild(el('span', { class: 'asg-cons-src', text: ' · ' + x.source + (xi === 0 && g.length > 1 ? ' · main' : '') }));
        row.appendChild(t);
        var rm = el('button', { type: 'button', class: 'asg-btn asg-btn-ghost asg-cons-rm', text: 'Remove', title: 'Take this article out of this run. It is unticked in the Feed.' });
        rm.addEventListener('click', function () { delete state.selectedStoryIds[x.id]; updateStepAvailability(); renderStories(); renderConsolidate(); toast('Removed. It is unticked in the Feed.', 'success'); });
        rm.disabled = consBusy;
        if (groups.length > 1 || g.length > 1) {
          var sel = el('select', { class: 'asg-cons-move', 'aria-label': 'Move this story' });
          sel.appendChild(el('option', { value: '', text: 'Move…' }));
          if (g.length > 1) sel.appendChild(el('option', { value: 'own', text: 'Stand alone' }));
          groups.forEach(function (g2, gj) { if (gj !== gi && g2.length < 3) sel.appendChild(el('option', { value: String(gj), text: 'Group with: ' + g2[0].title.slice(0, 44) + (g2[0].title.length > 44 ? '…' : '') })); });
          sel.addEventListener('change', function () {
            if (!sel.value) return;
            var ids = state.consGroups.map(function (a) { return a.slice(); });
            ids[gi] = ids[gi].filter(function (id) { return id !== x.id; });
            if (sel.value === 'own') ids.push([x.id]); else ids[parseInt(sel.value, 10)].push(x.id);
            state.consGroups = ids.filter(function (a) { return a.length; });
            renderConsolidate();
          });
          if (sel.options.length > 1) { sel.disabled = consBusy; row.appendChild(sel); }
        }
        row.appendChild(rm);
        card.appendChild(row);
      });
      var st = el('p', { class: 'asg-hint asg-cons-status', style: 'margin:8px 0 0;' });
      if (g.length > 1) {
        var b = el('button', { type: 'button', class: 'asg-btn asg-btn-ghost', text: res ? 'Consolidate again' : 'Consolidate this group' });
        b.disabled = consBusy;
        b.addEventListener('click', function () { runConsolidation([g]); });
        card.appendChild(b);
        card.appendChild(st);
        st.textContent = res ? (res.outlets.length + ' outlets merged' + (res.skipped.length ? ' · could not read: ' + res.skipped.join(', ') : '') + (res.noMatch.length ? ' · did not match: ' + res.noMatch.join(', ') : '')) : 'Not consolidated yet. If you skip this, the script is still written from the main story and one cross-checked outlet.';
        g._st = st;
      }
      if (res) {
        var det = el('details', { style: 'margin:8px 0 0;' });
        det.appendChild(el('summary', { text: 'See the consolidated facts' }));
        var ul = el('ul', { style: 'margin:8px 0 0 18px;padding:0;' });
        res.facts.forEach(function (f) {
          var tag = f.status === 'confirmed' ? 'confirmed by ' + (1 + (f.confirmedBy && f.confirmedBy.length ? f.confirmedBy.length : 1)) + ' outlets' : f.status === 'conflict' ? 'outlets differ' : f.status === 'possible' ? 'possible difference' : (f.outlet || '') + ' only';
          var li = el('li', { style: 'margin-bottom:6px;' });
          li.appendChild(el('span', { class: 'asg-chip ' + (f.status === 'confirmed' ? 'is-ok' : 'is-muted'), text: tag, style: 'margin-right:6px;' }));
          li.appendChild(document.createTextNode(f.claim));
          ul.appendChild(li);
        });
        det.appendChild(ul); card.appendChild(det);
      }
      box.appendChild(card);
    });
    var nb = $('#asg-cons-next'); if (nb) nb.textContent = consBusy ? 'Continue to Generate when finished →' : 'Continue to Generate →';
  }
  function runConsolidation(groups) {
    if (consBusy) return;
    consBusy = true; consStop = false; state.consRes = state.consRes || {};
    var todo = groups.filter(function (g) { return g.length > 1; }), i = 0;
    consProg = { done: 0, total: todo.length, label: '' };
    renderConsolidate();
    function finish(msg) {
      consBusy = false; var go = consThen && !consStop; consThen = false; consProg.label = ''; renderConsolidate(); paintConsProg();
      toast(msg, consStop ? '' : 'success'); if (go) setStep('generate');
    }
    function paint(g, t) { var els = $$('.asg-cons-status'); els.forEach(function (e) { if (e.dataset.sig === sigOf(g)) e.textContent = t; }); }
    function next() {
      if (consStop) { finish('Stopped. Groups already done are kept.'); return Promise.resolve(); }
      if (i >= todo.length) { finish('Consolidation finished.'); return Promise.resolve(); }
      var g = todo[i++]; consProg.label = g[0].title.slice(0, 40); paintConsProg();
      var cards = $$('.asg-cons-card'), my = null;
      groupsFor(selectedList()).forEach(function (g2, k) { if (sigOf(g2) === sigOf(g) && cards[k]) my = cards[k].querySelector('.asg-cons-status'); });
      function say(t) { if (my && my.isConnected) my.textContent = t; else { var c2 = $$('.asg-cons-card'); var k2 = groupsFor(selectedList()).map(sigOf).indexOf(sigOf(g)); if (k2 > -1 && c2[k2]) { my = c2[k2].querySelector('.asg-cons-status'); if (my) my.textContent = t; } } consProg.label = t; paintConsProg(); }
      return consolidateGroup(g, say).then(function (r) { state.consRes[g[0].id] = r; }).catch(function (e) {
        LOG('consolidation failed:', e && e.message);
        toast('Could not consolidate "' + g[0].title.slice(0, 50) + '": ' + (e && e.message || e), 'error');
        if (e && e.fatal) throw e;
      }).then(function () { consProg.done++; return next(); }, function (e) { consBusy = false; consThen = false; renderConsolidate(); paintConsProg(); });
    }
    return next();
  }

    function generateScripts(onlyIds) {
    if (generating) { toast('Already generating. Wait for it to finish.', 'error'); return; }
    var retryMode = Array.isArray(onlyIds);
    var stories = state.stories.filter(function (s) { return retryMode ? onlyIds.indexOf(s.id) !== -1 : state.selectedStoryIds[s.id]; });
    if (!stories.length) { toast('No stories selected. Go to the Feed step and tick the stories first.', 'error'); return; }
    var llmReady = state.settings.llmProvider !== 'none' && !!currentLlmKey();
    var mergedCount = 0;
    if (stories.length > 1) {
      var groups = groupsFor(stories);
      stories = groups.map(function (g) { g[0]._mates = g.slice(1); g[0]._cons = consFor(g); mergedCount += g.length - 1; return g[0]; });
    } else stories.forEach(function (s) { s._mates = []; s._cons = null; });
    LOG('generateScripts start', { stories: stories.length, llmReady: llmReady, provider: state.settings.llmProvider });
    var list = $('#asg-script-list'); list.innerHTML = '';
    // Keep every script whose story is NOT being regenerated. Only the stories
    // selected this run have their old scripts replaced; everything else stays.
    var regenIds = stories.map(function (s) { return s.id; }).concat([].concat.apply([], stories.map(function (s) { return (s._mates || []).map(function (m) { return m.id; }); })));
    var keptScripts = state.scripts.filter(function (x) { return regenIds.indexOf(x.storyId) === -1; });
    state.scripts = keptScripts.slice();
    generating = true; renderGenerateStatus();
    var prog = $('#asg-script-progress'); prog.hidden = false;
    var fill = $('.asg-progress-fill', prog); var label = $('.asg-progress-label', prog);
    var counts = { verified: 0, review: 0, template: 0, gated: 0, two: 0 };
    var usedUrls = {};
    keptScripts.forEach(function (x) { if (x.url && !x.gated) usedUrls[x.url] = true; });
    var run = { cancelled: false, ctrl: new AbortController() };
    genRun = run;
    run.cancelP = new Promise(function (res) { run.release = res; });
    function add(x) { if (!run.cancelled) state.scripts.push(x); }
    var failStreak = 0;
    var firstError = '';
    var stop = { reason: '' };
    var i = 0;
    function pushTemplate(story, src, reason, isError) {
      var sc = scriptFromParsed(buildLocalScript(src.story, state.profile, { article: src.art }), src.story, { template: true, reason: reason, level: 'article' });
      sc.storyId = story.id; sc.storyTitle = story.title;
      Object.assign(sc, sourceMeta(src));
      add(sc);
      counts.template++;
      if (isError && !firstError) firstError = reason;
    }
    function endRun() {
      if (run.origFmt && state.profile && state.profile.format) { Object.assign(state.profile.format, run.origFmt); run.origFmt = null; }
      runOver = null;
    }
    function finish() {
      if (run.cancelled) return;
      endRun();
      genRun = null;
      fill.style.width = '100%';
      label.textContent = 'Done.';
      setTimeout(function () { prog.hidden = true; }, 600);
      generating = false; waitNotice = null; llmStatus = null;
      persistScripts(); renderScripts(); updateStepAvailability();
      $('#asg-continue-video').hidden = goodScripts().length === 0;
      renderGenerateStatus();
      if (state.stories.length) { try { renderStories(); } catch (eR) {} }
      setStep('scripts');
      var parts = [];
      if (counts.verified) parts.push(counts.verified + ' passed all checks');
      if (counts.two) parts.push(counts.two + ' with two outlets');
      if (counts.review) parts.push(counts.review + ' need review');
      if (counts.template) parts.push(counts.template + ' template');
      if (counts.gated) parts.push(counts.gated + ' skipped');
      if (mergedCount) parts.push(mergedCount + ' similar stor' + (mergedCount === 1 ? 'y' : 'ies') + ' merged and marked used');
      var msg = (parts.join(', ') || 'No scripts');
      if (firstError) msg += ' — AI problem: ' + firstError.slice(0, 160);
      toast(msg, (firstError || counts.gated) ? 'error' : 'success');
    }
    run.stop = function () {
      if (run.cancelled) return;
      run.cancelled = true; stopGrace = Date.now() + 15000;
      endRun();
      try { run.ctrl.abort(); } catch (e) {}
      run.release();
      genRun = null; generating = false; waitNotice = null; llmStatus = null;
      prog.hidden = true;
      persistScripts(); renderScripts(); updateStepAvailability();
      $('#asg-continue-video').hidden = goodScripts().length === 0;
      renderGenerateStatus();
      toast('Stopped. ' + (goodScripts().length ? goodScripts().length + ' finished script' + (goodScripts().length === 1 ? ' is' : 's are') + ' kept. The story in progress was dropped.' : 'Nothing was kept. Change the options and press Generate again.'), 'success');
    };
    function next() {
      if (run.cancelled) return;
      if (i >= stories.length) { finish(); return; }
      var story = stories[i++];
      var n = i;
      // The label says what the pipeline is doing (phase) and, after a dot, what the AI layer is doing right now
      // (which model is being asked, which one was overloaded, how long it is waiting).
      var phase = '', detail = '';
      function paint() { label.textContent = 'Story ' + n + ' of ' + stories.length + ': ' + phase + (detail ? ' · ' + detail : ''); }
      function setLabel(t) { phase = t; trailPhase = t; detail = ''; paint(); }
      llmStatus = function (d) { detail = d || ''; paint(); };
      waitNotice = function (pv, sec) { detail = 'waiting ' + sec + ' s for ' + pv + ' limits'; paint(); };
      fill.style.width = Math.round((n - 1) / stories.length * 100) + '%';
      setLabel('finding a readable source…');
      var st0 = state.settings, rec0 = recommendFor(story);
      runOver = { lens: st0.autoLens !== false ? rec0.lens : null, hook: st0.autoHook !== false ? rec0.hook : null };
      if (state.profile && state.profile.format) {
        if (!run.origFmt) run.origFmt = Object.assign({}, state.profile.format);
        Object.assign(state.profile.format, st0.autoLen !== false ? formatFor(rec0.sec) : run.origFmt);
      }
      var work = (story._srcP || resolveSource(story)).then(function (src) {
        if (!src) {
          story._srcP = null;
          var why = story.readable === 'paywalled'
            ? 'Paywalled source (' + story.source + '). Its text cannot be read, and no open outlet covering the same story was found (searched this scan and the publisher feeds by headline). Nothing was written, because a script without a readable source would be guesswork.'
            : story.readable === 'thin'
            ? 'Live blog or video page (' + story.source + '): there is no article text to read, and no open outlet with a full article on the same story was found in this scan.'
            : 'The article could not be read' + (fetchWhy(story.url) ? ': ' + fetchWhy(story.url) : ' (aggregator link, blocked page, or paywall)') + ', and no open outlet covering the same story was found (searched this scan and the publisher feeds by headline). Nothing was written, because a script without a readable source would be guesswork.';
          var gs = gatedScript(story, why); gs.srcFail = true;
          add(gs); counts.gated++;
          markUnusable(story, why);
          return;
        }
        if (usedUrls[src.story.url]) {
          add(gatedScript(story, 'Same event as another selected story that already has a script from ' + src.story.source + '. Skipped to avoid a duplicate.')); counts.gated++;
          return;
        }
        usedUrls[src.story.url] = true;
        if (!llmReady) { pushTemplate(story, src, state.settings.llmProvider === 'none' ? 'The AI provider is set to None in Settings.' : 'No API key is saved for the selected AI provider (' + state.settings.llmProvider + '). Open Settings, paste the key and click Save settings (the Test button alone does not save it).', true); return; }
        if (stop.reason) { pushTemplate(story, src, 'AI skipped: ' + stop.reason, true); return; }
        if (story._mates && story._mates.length) src.mates = story._mates;
        llmTrail = [];
        return runLlmPipeline(story, src, setLabel).then(function (sc) {
          sc.models = trailSummary();
          if (story._mates && story._mates.length) sc.mergedStories = story._mates.map(function (m) { return { title: m.title, url: cleanUrl(m.url), source: m.source }; });
          add(sc);
          failStreak = 0;
          if (sc.checks.status === 'checked') counts.verified++; else counts.review++;
          if (sc.corroboration && (sc.corroboration.status === 'corroborated' || sc.corroboration.status === 'partial')) counts.two++;
          return sleep(1200);
        }).catch(function (e) {
          LOG('pipeline error for "' + story.title + '":', e.message);
          if (e.gate) { add(gatedScript(story, e.message, e.retryable)); counts.gated++; return; }
          failStreak++;
          if (e.fatal || failStreak >= 2) stop.reason = e.message;
          pushTemplate(story, src, e.message, true);
        });
      }).catch(function (e) {
        LOG('unexpected error for "' + story.title + '":', e && e.message);
        add(gatedScript(story, 'Unexpected error: ' + (e && e.message || e))); counts.gated++;
      });
      Promise.race([work, run.cancelP]).then(function () { if (!run.cancelled) next(); });
    }
    next();
  }

  function scriptSection(label, value, onChange, multiline) {
    var wrap = el('div', { class: 'asg-script-section' }, [el('label', { text: label })]);
    var ta = el('textarea', {}); if (!multiline) ta.style.minHeight = '44px';
    ta.value = value || ''; ta.addEventListener('input', function () { onChange(ta.value); });
    wrap.appendChild(ta); return wrap;
  }
  function cleanTag(t) {
    var x = String(t).replace(/^#+/, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/ø/g, 'o').replace(/Ø/g, 'O').replace(/æ/g, 'ae').replace(/Æ/g, 'AE').replace(/ß/g, 'ss');
    try { x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
    return x.replace(/[^A-Za-z0-9_]/g, '');
  }
  function factLabel(f, sc) {
    if (f.status === 'confirmed') return f.confirmedBy && f.confirmedBy.length > 1 ? 'confirmed by ' + (1 + f.confirmedBy.length) + ' outlets' : 'both outlets';
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
    var fs = state.stories.filter(function (x) { return x.id === sc.storyId; })[0];
    delete state.selectedStoryIds[sc.storyId];
    if (fs && sc.gated && (sc.srcFail || /No readable source|Paywalled source|Live blog or video page|could not be read/i.test(sc.reason || ''))) markUnusable(fs, sc.reason);
    if (state.stories.length) { renderStories(); updateStepAvailability(); }
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
      if (sc.lens && LENSES[sc.lens] && sc.analysisOn !== false) srcLine.appendChild(document.createTextNode(' · lens: ' + LENSES[sc.lens].label));
      card.appendChild(srcLine);
      if (sc.models && sc.models.length) {
        var md = el('details', { class: 'asg-hint', style: 'margin:2px 0 8px;' });
        md.appendChild(el('summary', { text: 'Models used (' + sc.models.length + ')' }));
        var ml = el('ul', { style: 'margin:6px 0 0 18px;padding:0;' });
        sc.models.forEach(function (m) { ml.appendChild(el('li', { text: m.step + ': ' + (m.provider ? m.provider + ' · ' : '') + m.model })); });
        md.appendChild(ml); card.appendChild(md);
      }
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
      card.appendChild(scriptSection('Hook', sc.hook, function (v) { sc.hook = v; sc.hookScore = hookScore(v); persistScripts(); }));
      { var hsx = sc.hookScore || hookScore(sc.hook);
        var hrow = el('div', { class: 'asg-hint', style: 'margin:-2px 0 8px;' });
        hrow.appendChild(el('span', { class: 'asg-chip ' + (hsx.score >= 70 ? 'is-ok' : 'is-muted'), text: 'Hook strength ' + hsx.score, title: 'Rubric from Shorts retention guidance: short, specific, real stakes, curiosity gap, not opening with the outlet.' }));
        hrow.appendChild(document.createTextNode(' ' + (hsx.why || []).join(' · ')));
        card.appendChild(hrow);
        if (sc.hookAlts && sc.hookAlts.length) {
          var hal = el('div', { class: 'asg-alt-titles' });
          hal.appendChild(el('span', { text: 'Other hooks:' }));
          sc.hookAlts.forEach(function (alt) {
            var hb = el('button', { type: 'button', class: 'asg-opt', text: alt.score + ' · ' + alt.text, title: 'Use this hook. It is fact-checked first.' });
            hb.addEventListener('click', function () {
              hb.disabled = true; var old = hb.textContent; hb.textContent = 'Checking…';
              useHook(sc, alt).then(function (r) {
                if (r.ok) { toast(r.audited ? 'Hook swapped. It passed the fact check.' : 'Hook swapped. The fact check could not run, so read it against the source.', r.audited ? 'ok' : 'warn'); renderScripts(); }
                else { hb.disabled = false; hb.textContent = old; toast('Not swapped: ' + r.problem, 'warn', 7000); }
              }).catch(function (e) { hb.disabled = false; hb.textContent = old; toast('Could not check the hook: ' + (e && e.message || e), 'error'); });
            });
            hal.appendChild(hb);
          });
          card.appendChild(hal);
        } }
      card.appendChild(scriptSection('Body', sc.body, function (v) { sc.body = v; persistScripts(); }, true));
      if (sc.analysis || (sc.checks && sc.checks.analysisDropped)) {
        var aw = el('div', { class: 'asg-hint', style: 'margin:10px 0 4px;padding:8px 10px;border-radius:8px;background:#eef3ff;border:1px solid #cddafc;color:#243b7a;' });
        aw.appendChild(el('strong', { text: 'Analysis: the channel\'s own read of this story. ' }));
        aw.appendChild(document.createTextNode('Not from the article and not backed by a quote. It is checked for invented figures and risky claims, separately from the story' + (sc.checks && sc.checks.analysisDropped ? ' (' + sc.checks.analysisDropped + ' sentence' + (sc.checks.analysisDropped === 1 ? '' : 's') + ' removed by the checks)' : '') + '. Read it once before publishing.'));
        card.appendChild(aw);
      }
      if (sc.analysis) card.appendChild(scriptSection('Analysis', sc.analysis, function (v) { sc.analysis = v; persistScripts(); }, true));
      if (!sc.analysis && state.settings.depth !== false && !sc.isTemplate && !sc.gated && sc.facts && sc.facts.length) {
        var nb = el('div', { class: 'asg-hint', style: 'margin:10px 0 4px;padding:8px 10px;border-radius:8px;background:#fff5e6;border:1px solid #f0d9ad;color:#6b4a00;' });
        nb.appendChild(el('strong', { text: 'No analysis was kept. ' }));
        nb.appendChild(document.createTextNode('The checks removed it, or the model did not return one (a busy or rate-limited model can do that). '));
        var rb = el('button', { type: 'button', class: 'asg-btn asg-btn-ghost', text: 'Write the analysis again', style: 'margin-top:6px;' });
        rb.addEventListener('click', function () {
          rb.disabled = true; rb.textContent = 'Writing…';
          rewriteAnalysis(sc).then(function (r) {
            persistScripts();
            if (r && r.analysis) { toast('Analysis added.', 'ok'); renderScripts(); }
            else { rb.disabled = false; rb.textContent = 'Write the analysis again'; toast('No analysis passed the checks this time. Try again in a minute, or pick a stronger model in Settings.', 'warn', 6000); }
          });
        });
        nb.appendChild(rb);
        card.appendChild(nb);
      }
      card.appendChild(scriptSection('CTA', sc.cta, function (v) { sc.cta = v; persistScripts(); }));
      card.appendChild(scriptSection('YouTube Title', sc.title, function (v) { sc.title = v; persistScripts(); }));
      if (sc.altTitles && sc.altTitles.length) {
        var alts = el('div', { class: 'asg-alt-titles' });
        alts.appendChild(el('span', { text: 'Other titles:' }));
        sc.altTitles.forEach(function (a) {
          var ab = el('button', { type: 'button', class: 'asg-opt', text: (a.style === 'engaging' ? 'Most engaging · ' : 'Matches your style · ') + a.text, title: 'Use this title' });
          ab.addEventListener('click', function () {
            var old = sc.title; sc.title = a.text;
            sc.altTitles = sc.altTitles.filter(function (x) { return x !== a; }).concat([{ style: 'match', text: old }]);
            persistScripts(); renderScripts();
          });
          alts.appendChild(ab);
        });
        card.appendChild(alts);
      }
      card.appendChild(scriptSection('Description', sc.description, function (v) { sc.description = v; persistScripts(); }, true));
      card.appendChild(scriptSection('On-screen headline (first seconds of the video)', sc.banner || ((sc.title || '').length <= 60 ? sc.title : ''), function (v) { sc.banner = v; persistScripts(); }));
      card.appendChild(scriptSection('Pinned comment (post it under the video and pin it)', sc.pinned || sc.cta, function (v) { sc.pinned = v; persistScripts(); }));
      if (sc.callouts && sc.callouts.length) {
        var co = el('div', { class: 'asg-alt-titles' });
        co.appendChild(el('span', { text: 'On-screen callouts:' }));
        sc.callouts.forEach(function (c) {
          var cb2 = el('button', { type: 'button', class: 'asg-opt', text: c.text + ' ✕', title: 'Shown when "' + c.at + '" is spoken. Click to remove.' });
          cb2.addEventListener('click', function () { sc.callouts = sc.callouts.filter(function (x) { return x !== c; }); persistScripts(); renderScripts(); });
          co.appendChild(cb2);
        });
        card.appendChild(co);
      }
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
      '.asg-seg{display:flex;flex-wrap:wrap;gap:6px;}',
      '.asg-seg-btn{padding:6px 14px;border:1px solid var(--asg-border,#e1e4e9);border-radius:999px;background:var(--asg-bg,#fff);color:var(--asg-text,#1a1d23);font:inherit;font-size:13.5px;cursor:pointer;}',
      '.asg-seg-btn:hover{border-color:var(--asg-text-dim,#8a94a3);}',
      '.asg-seg-btn.is-on{background:var(--asg-text,#1a1d23);border-color:var(--asg-text,#1a1d23);color:#fff;}',
      '.asg-opts{margin:0 0 20px;padding:4px 0;border-top:1px solid var(--asg-border,#e1e4e9);border-bottom:1px solid var(--asg-border,#e1e4e9);}',
      '.asg-o-row{display:grid;grid-template-columns:96px 1fr;gap:16px;padding:18px 0;}',
      '.asg-o-row+.asg-o-row{border-top:1px solid var(--asg-border,#e1e4e9);}',
      '.asg-o-label{font-size:13px;color:var(--asg-text-dim,#8a94a3);padding-top:6px;}',
      '.asg-o-body{display:grid;gap:10px;min-width:0;}',
      '.asg-o-note{margin:0;font-size:13px;color:var(--asg-text-muted,#5b6471);line-height:1.5;}',
      '.asg-o-note em{color:var(--asg-text-dim,#8a94a3);}',
      '.asg-dial{position:relative;}',
      '.asg-dial-track{position:absolute;left:10%;right:10%;top:11px;height:2px;background:var(--asg-border,#e1e4e9);}',
      '.asg-dial-fill{height:100%;background:var(--asg-text,#1a1d23);transition:width .3s ease;}',
      '.asg-dial-stops{position:relative;display:grid;grid-template-columns:repeat(5,1fr);}',
      '.asg-dial-stop{display:grid;justify-items:center;gap:6px;padding:0;border:0;background:transparent;font:inherit;font-size:13px;color:var(--asg-text-muted,#5b6471);cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent;}',
      '.asg-dot{width:12px;height:12px;margin:5px 0 0;border-radius:50%;background:var(--asg-bg,#fff);border:2px solid var(--asg-border,#e1e4e9);transition:all .2s;}',
      '.asg-dial-stop.is-passed .asg-dot{border-color:var(--asg-text,#1a1d23);background:var(--asg-text,#1a1d23);}',
      '.asg-dial-stop.is-on .asg-dot{width:16px;height:16px;margin:3px 0 0;border-color:var(--asg-text,#1a1d23);background:var(--asg-text,#1a1d23);box-shadow:0 0 0 4px var(--asg-bg-muted,#eef1f6);}',
      '.asg-dial-stop.is-on{color:var(--asg-text,#1a1d23);font-weight:600;}',
      '.asg-dial-stop:hover .asg-dot{border-color:var(--asg-text,#1a1d23);}',
      '.asg-dial-stop:focus-visible .asg-dot{box-shadow:0 0 0 3px var(--asg-accent-soft,#eef2fd),0 0 0 4px var(--asg-accent,#2a4fd6);}',
      '.asg-anat{display:flex;gap:2px;height:4px;margin-top:4px;}',
      '.asg-anat i{display:block;border-radius:2px;transition:flex-grow .35s ease;}',
      '.asg-anat .is-hook{background:#1a1d23;}.asg-anat .is-body{background:#8a94a3;}.asg-anat .is-analysis{background:var(--asg-accent,#2a4fd6);}.asg-anat .is-cta{background:#c8ced8;}',
      '.asg-chipset{display:flex;flex-wrap:wrap;gap:6px;}',
      '.asg-opt{padding:6px 13px;border:1px solid var(--asg-border,#e1e4e9);border-radius:999px;background:var(--asg-bg,#fff);color:var(--asg-text-muted,#5b6471);font:inherit;font-size:13.5px;cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent;transition:border-color .15s,color .15s;}',
      '.asg-opt:hover:not(:disabled){border-color:var(--asg-text-dim,#8a94a3);color:var(--asg-text,#1a1d23);}',
      '.asg-opt.is-on{background:var(--asg-accent-soft,#eef2fd);border-color:var(--asg-accent,#2a4fd6);color:var(--asg-accent,#2a4fd6);font-weight:600;}',
      '.asg-opt:disabled{opacity:.45;cursor:not-allowed;}',
      '.asg-opt:focus-visible{box-shadow:0 0 0 3px var(--asg-accent-soft,#eef2fd);}',
      '.asg-switch{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--asg-text-muted,#5b6471);cursor:pointer;justify-self:start;}',
      '.asg-switch input{position:absolute;opacity:0;pointer-events:none;}',
      '.asg-switch-ui{width:30px;height:18px;border-radius:999px;background:var(--asg-border,#e1e4e9);position:relative;transition:background .2s;}',
      '.asg-switch-ui::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .2s;}',
      '.asg-switch input:checked+.asg-switch-ui{background:var(--asg-text,#1a1d23);}',
      '.asg-switch input:checked+.asg-switch-ui::after{transform:translateX(12px);}',
      '.asg-switch input:focus-visible+.asg-switch-ui{outline:2px solid var(--asg-accent,#2a4fd6);outline-offset:2px;}',
      '@media (max-width:560px){.asg-o-row{grid-template-columns:1fr;gap:8px;}.asg-o-label{padding-top:0;}}',
      '@media (prefers-reduced-motion:reduce){.asg-opts *{transition:none!important;}}',
      '.asg-pf-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}',
      '.asg-pf-row select{flex:1;min-width:160px;}',
      '.asg-pf-del:hover{color:var(--asg-critical,#d92b2b);border-color:var(--asg-critical,#d92b2b);}',
      '#asg-set-profiles{margin:0 0 18px;padding:0 0 16px;border-bottom:1px solid var(--asg-border,#e1e4e9);}',
      '.asg-story-side{display:grid;gap:6px;justify-items:end;align-content:start;}',
      '.asg-chip.is-ok{background:var(--asg-ok-soft,#e8f7ee);color:var(--asg-ok,#17864a);border-color:transparent;}',
      '.asg-chip.is-bad{background:#fdecec;color:var(--asg-critical,#d92b2b);border-color:transparent;}',
      '.asg-chip.is-warn{background:var(--asg-warn-soft,#fff5e6);color:var(--asg-warn,#c47a00);border-color:transparent;}',
      '.asg-story:has(input:disabled){opacity:.6;}',
      '.asg-opt-auto{border-style:dashed;}',
      '.asg-cons-card{border:1px solid var(--asg-border,#e1e4e9);border-radius:12px;padding:14px 16px;margin:0 0 12px;background:var(--asg-bg,#fff);}',
      '.asg-cons-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 8px;}',
      '.asg-cons-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:6px 0;border-top:1px solid var(--asg-border,#e1e4e9);}',
      '.asg-cons-row:first-of-type{border-top:0;}',
      '.asg-cons-title{flex:1 1 280px;font-size:14px;line-height:1.4;}',
      '.asg-cons-src{color:var(--asg-text-dim,#8a94a3);font-size:12.5px;}',
      '.asg-cons-move{font-size:12.5px;padding:4px 8px;max-width:220px;}',
      '.asg-cons-rm{padding:4px 10px;font-size:12.5px;}',
      '.asg-cons-prog{margin:0 0 14px;padding:12px 14px;border:1px solid var(--asg-border,#dde1ea);border-radius:12px;background:var(--asg-accent-soft,#edf1ff);}',
      '.asg-cons-prog-bar{height:5px;border-radius:999px;background:rgba(49,87,240,.15);overflow:hidden;margin-top:8px;}',
      '.asg-cons-prog-fill{display:block;height:100%;width:0;background:var(--asg-accent,#3157f0);transition:width .4s;}',
      '.asg-cons-prog-label{font-size:13.5px;font-weight:600;color:var(--asg-text,#141a2a);}',
      '.asg-opt-auto.is-on{border-style:solid;}',
      '.asg-dial.is-auto{opacity:.5;}',
      '.asg-rec{color:var(--asg-accent,#2a4fd6);font-size:12.5px;}',
      '.asg-alt-titles{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:2px 0 10px;font-size:12.5px;color:var(--asg-text-muted,#5b6471);}',
      '.asg-alt-titles button{max-width:100%;text-align:left;}',
      '.asg-viral{padding:3px 10px;border-radius:999px;font-size:12.5px;font-weight:700;white-space:nowrap;}',
      '.asg-viral.is-high{background:var(--asg-text,#1a1d23);color:#fff;}.asg-viral.is-mid{background:var(--asg-bg-muted,#eef1f6);color:var(--asg-text,#1a1d23);}.asg-viral.is-low{background:var(--asg-bg-muted,#eef1f6);color:var(--asg-text-muted,#5b6471);}',
      '.asg-viral-detail{margin-top:6px;font-size:12px;color:var(--asg-text-muted,#5b6471);}',
      '.asg-viral-sim{margin-top:3px;font-size:12px;color:var(--asg-text-dim,#8a94a3);}.asg-viral-sim a{color:var(--asg-accent,#2a4fd6);}',
      '.asg-feed-tools{margin:16px 0 0;padding:14px 16px;border:1px solid var(--asg-border,#e1e4e9);border-radius:12px;background:var(--asg-bg-soft,#f7f8fa);display:grid;gap:8px;}',
      '.asg-ft-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}',
      '.asg-topic-rows{display:grid;gap:8px;margin:8px 0;}',
      '.asg-topic-row{display:grid;grid-template-columns:1.2fr .5fr 2.2fr 34px;gap:8px;align-items:center;}',
      '.asg-topic-head{font-size:12px;font-weight:600;color:var(--asg-text-dim,#8a94a3);}',
      '.asg-topic-rm{border:1px solid var(--asg-border,#e1e4e9);background:var(--asg-bg,#fff);color:var(--asg-text-muted,#5b6471);border-radius:8px;height:34px;cursor:pointer;}',
      '.asg-topic-rm:hover{color:var(--asg-critical,#d92b2b);border-color:var(--asg-critical,#d92b2b);}',
      '@media (max-width:640px){.asg-topic-row{grid-template-columns:1fr 70px 34px;}.asg-topic-row input:nth-child(3){grid-column:1/-1;grid-row:2;}.asg-topic-head{display:none;}}',
      '.asg-keys-group{display:inline-flex;align-items:center;gap:6px;padding:3px 4px 3px 10px;border:1px dashed var(--asg-border,#e1e4e9);border-radius:999px;background:var(--asg-bg-soft,#f7f8fa);}',
      '.asg-keys-group .asg-keys-title{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--asg-text-dim,#8a94a3);}',
      '.asg-topbar-sep{width:1px;align-self:stretch;background:var(--asg-border,#e1e4e9);margin:4px 2px;}',
      '#asg-script-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;align-items:stretch;}',
      '#asg-script-list>.asg-script-card{grid-column:1/-1;}',
      '.asg-tile{position:relative;display:flex;flex-direction:column;gap:8px;text-align:left;padding:14px;border:1px solid var(--asg-border,#dde1ea);border-radius:12px;background:#fff;color:var(--asg-text,#141a2a);cursor:pointer;font:inherit;transition:box-shadow .15s,border-color .15s;}',
      '.asg-tile:hover,.asg-tile:focus-visible{border-color:#5b7cfa;box-shadow:0 4px 16px rgba(30,50,120,.14);outline:none;}',
      '.asg-tile h4{margin:0;font-size:16px;line-height:1.3;}',
      '.asg-tile-hook{margin:0;font-size:13px;line-height:1.45;color:#4a5568;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}',
      '.asg-tile-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;color:#5b6676;}',
      '.asg-pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;}',
      '.asg-pill-ok{background:#e8f7ee;color:#17633a;}.asg-pill-warn{background:#fff5e6;color:#8a5b00;}.asg-pill-tpl{background:#eef0f4;color:#4a5568;}.asg-pill-rev{background:#e6efff;color:#1d4ed8;}',
      '.asg-tile-open{font-size:13px;font-weight:600;color:var(--asg-accent,#3157f0);}',
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
      '.asg-modal-panel{background:#fff;color:var(--asg-text,#141a2a);border-radius:14px;width:100%;max-width:980px;box-shadow:0 20px 60px rgba(0,0,0,.35);display:flex;flex-direction:column;max-height:94vh;}',
      '.asg-modal-head{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e3e7ee;}',
      '.asg-modal-head h3{margin:0;font-size:17px;line-height:1.3;}',
      '.asg-modal-body{padding:14px 18px;overflow-y:auto;flex:1;}',
      '.asg-modal-body .asg-script-card{border:0;box-shadow:none;padding:0;margin:0;}',
      '.asg-modal-body .asg-script-card>h4{display:none;}',
      '.asg-modal-body .asg-script-section label{display:block;font-weight:600;margin:12px 0 4px;}',
      '.asg-modal-body textarea{width:100%;box-sizing:border-box;min-height:110px;font:inherit;line-height:1.5;padding:8px 10px;border:1px solid #cbd3df;border-radius:8px;resize:vertical;}',
      '.asg-modal-foot{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;align-items:center;padding:12px 18px;border-top:1px solid #e3e7ee;background:#f7f9fc;border-radius:0 0 14px 14px;}',
      '.asg-modal-foot .asg-hint{margin:0 auto 0 0;}',
      '.asg-modal-foot{position:sticky;bottom:0;background:#fff;box-shadow:0 -6px 16px rgba(13,20,36,.06);}',
      '.asg-modal-foot .asg-btn-primary{padding:12px 24px;font-size:15px;box-shadow:0 2px 8px rgba(49,87,240,.35);}',
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
    var save = el('button', { class: 'asg-btn asg-btn-primary', type: 'button', text: '✓ Save and mark as reviewed' });
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
    renderProfileBar();
    $('#asg-set-yt').value = state.settings.youtubeKey || '';
    $('#asg-set-provider').value = state.settings.llmProvider || 'gemini';
    $('#asg-set-gemini').value = state.settings.geminiKey || '';
    var gm = $('#asg-set-gemini-model'); if (gm) gm.value = state.settings.geminiModel || '';
    var rq = $('#asg-set-require2'); if (rq) rq.checked = !!state.settings.requireSecond;
    var dp = $('#asg-set-depth'); if (dp) dp.checked = state.settings.depth !== false;
    var mw = $('#asg-set-madewith'); if (mw) mw.checked = state.settings.madeWith !== false;
    var fb = $('#asg-set-fallback'); if (fb) fb.checked = state.settings.fallbackProviders !== false;
    var stg = $('#asg-set-strategy'); if (stg) stg.value = state.settings.strategy || 'value';
    var wb = $('#asg-set-writebest'); if (wb) wb.checked = state.settings.writeBest !== false;
    var wm = $('#asg-set-gemini-write-model'); if (wm) wm.value = state.settings.geminiWriteModel || '';
    $('#asg-set-openai').value = state.settings.openaiKey || '';
    $('#asg-set-deepseek').value = state.settings.deepseekKey || '';
    vopt();
    var sp = $('#asg-set-stock'); if (sp) sp.value = stockProvider();
    var pxk = $('#asg-set-pixabay'); if (pxk) pxk.value = state.settings.pixabayKey || '';
    var pek = $('#asg-set-pexels'); if (pek) pek.value = state.settings.pexelsKey || '';
    COMPAT_IDS.forEach(function (pv) {
      var k = $('#asg-set-' + pv), m = $('#asg-set-' + pv + '-model'), w = $('#asg-set-' + pv + '-write-model');
      if (k) k.value = state.settings[pv + 'Key'] || '';
      if (m) m.value = state.settings[pv + 'Model'] || '';
      if (w) w.value = state.settings[pv + 'WriteModel'] || '';
    });
    syncProviderFields(); syncStock(); fillLinks();
  }
  function closeSettings() { $('#asg-settings-drawer').hidden = true; }
  var LINK_KEYS = ['website', 'youtube', 'facebook', 'instagram', 'tiktok', 'x', 'linkedin', 'telegram'];
  function fillLinks() {
    var l = (state.profile && state.profile.links) || {};
    LINK_KEYS.forEach(function (k) { var i = $('#asg-lnk-' + k); if (i) { i.value = l[k] || ''; i.disabled = !state.profile; } });
    var lb = $('#asg-lnk-learn'); if (lb) lb.disabled = !state.profile;
    var h = $('#asg-lnk-hint'); if (h) h.hidden = !!state.profile;
  }
  function readLinks() {
    if (!state.profile) return;
    var l = state.profile.links = state.profile.links || {};
    LINK_KEYS.forEach(function (k) { var i = $('#asg-lnk-' + k); if (i) l[k] = i.value.trim(); });
  }
  function learnFromLinks() {
    if (!state.profile) return;
    readLinks(); persistProfile();
    var st = $('#asg-lnk-status'), btn = $('#asg-lnk-learn'), l = state.profile.links || {};
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
    var n = document.getElementById('asg-testres-' + pv); if (!n) return;
    n.textContent = text; n.className = 'asg-hint asg-test-res' + (kind ? ' is-' + kind : '');
  }
  function testWhy(e) {
    var m = String((e && e.message) || e || 'unknown error');
    if (/401|403|invalid.*key|incorrect.*key|unauthori|api key not valid|permission/i.test(m)) return 'The provider rejected this key. Check that you pasted the whole key and that it is for this provider. (' + m.slice(0, 160) + ')';
    if (/429|quota|rate/i.test(m)) return 'The key may be fine, but the provider is rate-limiting it right now. Wait a minute and test again. (' + m.slice(0, 160) + ')';
    if (/no usable model/i.test(m)) return 'The key was accepted but no usable chat model was found. Type a model name in the model field and test again. (' + m.slice(0, 160) + ')';
    return m.slice(0, 260);
  }
  function syncStock() {
    var v = ($('#asg-set-stock') || {}).value || 'pixabay';
    $$('.asg-drawer [data-stock]').forEach(function (f) { f.hidden = f.dataset.stock !== v; });
  }
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
  var VID_DEFAULTS = { voice: 'am_echo', speed: 1, res: '720', footage: true, engine: 'wasm', tag: true, callouts: true, endcard: true, banner: true, motion: true };
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
    var rate = parts[0].rate, GAP = 0.15, LEAD = 0.3, TAIL = 0.9, t = LEAD, items = [];
    // Trim the near-silent lead-in and tail the voice adds to every sentence: it is what sounds like dead air.
    function trimSilence(a, r) {
      if (!a || !a.subarray) return a;
      var th = 0.012, keep = Math.round(r * 0.05), st = 0, en = a.length;
      while (st < en && Math.abs(a[st]) < th) st++;
      while (en > st && Math.abs(a[en - 1]) < th) en--;
      st = Math.max(0, st - keep); en = Math.min(a.length, en + keep);
      return en - st > r * 0.25 ? a.subarray(st, en) : a;
    }
    parts.forEach(function (p) {
      var smp = trimSilence(p.samples, p.rate), dur = smp.length / p.rate;
      items.push({ text: p.text, start: t, end: t + dur, samples: smp });
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
  // On-screen key-fact callouts: shown when the phrase they are tied to is spoken. A callout whose phrase is not found
  // (the narration was edited) is simply left out.
  function bannerText(sc, o) {
    if (o.banner === false) return '';
    var t = String(sc.banner || '').trim() || (String(sc.title || '').length <= 60 ? String(sc.title || '').replace(/\s*#\w+/g, '').trim() : '');
    return t.slice(0, 80);
  }
  function drawBanner(ctx, W, H, text, now) {
    var end = 3.2, t = now;
    if (!text || t > end) return;
    var a = Math.max(0, Math.min(1, t / 0.2, (end - t) / 0.35)), fs = Math.round(W * 0.07), family = 'system-ui,"Segoe UI",Roboto,Arial,sans-serif';
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 ' + fs + 'px ' + family;
    var maxW = W * 0.84, words = text.split(' '), lines = [], cur = '';
    words.forEach(function (w) { var tt = cur ? cur + ' ' + w : w; if (cur && ctx.measureText(tt).width > maxW) { lines.push(cur); cur = w; } else cur = tt; });
    if (cur) lines.push(cur);
    lines = lines.slice(0, 3);
    var lh = fs * 1.2, bh = lines.length * lh + fs * 0.8, bw = Math.min(W * 0.92, Math.max.apply(null, lines.map(function (l) { return ctx.measureText(l).width; })) + fs * 1.1), cy = H * 0.24;
    rrect(ctx, W / 2 - bw / 2, cy - bh / 2, bw, bh, fs * 0.35); ctx.fillStyle = 'rgba(0,0,0,.58)'; ctx.fill();
    lines.forEach(function (l, i) { var y = cy - bh / 2 + fs * 0.4 + lh * (i + 0.5); ctx.fillStyle = '#fff'; ctx.fillText(l, W / 2, y); });
    ctx.restore();
  }
  function calloutTimes(tl, list, minStart) {
    var out = [];
    if (!Array.isArray(list) || !list.length) return out;
    var words = [];
    function nw(x) { return String(x).toLowerCase().replace(/[^a-z0-9%$]/g, ''); }
    tl.chunks.forEach(function (c) { c.words.forEach(function (w) { words.push({ n: nw(w.w), s: w.s }); }); });
    var last = -9;
    list.slice(0, 3).forEach(function (c) {
      var at = plainWords(c.at).split(' ').map(nw).filter(Boolean), at0 = -1, i, j;
      if (!c.text || !at.length) return;
      for (i = 0; i <= words.length - at.length && at0 < 0; i++) { var ok = true; for (j = 0; j < at.length; j++) { if (words[i + j].n !== at[j]) { ok = false; break; } } if (ok) at0 = i; }
      if (at0 < 0) { var key = at.filter(function (x) { return x.length >= 4 || /\d/.test(x); })[0]; if (key) for (i = 0; i < words.length; i++) if (words[i].n === key) { at0 = i; break; } }
      if (at0 < 0) return;
      var st = Math.max(minStart || 0.5, words[at0].s - 0.15);
      if (st - last < 3.2) st = last + 3.2;
      if (st + 1.2 > tl.total - 4.2) return;
      out.push({ text: String(c.text), s: st, e: st + 2.8 }); last = st;
    });
    return out;
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawCallout(ctx, W, H, c, now) {
    var t = now - c.s, d = c.e - c.s;
    if (t < 0 || t > d) return;
    var a = Math.max(0, Math.min(1, t / 0.25, (d - t) / 0.3)), k = 0.92 + 0.08 * Math.min(1, t / 0.25);
    var fs = Math.round(W * 0.085), padX = fs * 0.55, family = 'system-ui,"Segoe UI",Roboto,Arial,sans-serif', tw;
    ctx.save(); ctx.globalAlpha = a; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.font = '900 ' + fs + 'px ' + family; tw = ctx.measureText(c.text).width;
    while (tw > W * 0.88 - padX * 2 && fs > W * 0.04) { fs -= 2; ctx.font = '900 ' + fs + 'px ' + family; tw = ctx.measureText(c.text).width; }
    var bw = tw + padX * 2, bh = fs * 1.7;
    ctx.translate(W / 2, H * 0.27); ctx.scale(k, k);
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = fs * 0.3;
    rrect(ctx, -bw / 2, -bh / 2, bw, bh, bh * 0.22); ctx.fillStyle = '#ffd400'; ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#111'; ctx.fillText(c.text, 0, 2);
    ctx.restore();
  }
  function drawEndcard(ctx, W, H, tl, now) {
    var lastIt = tl.items[tl.items.length - 1], start = Math.max((lastIt ? lastIt.start : tl.total) - 0.2, tl.total - 4.2), t = now - start;
    if (t < 0 || now > tl.total - 0.05) return;
    var a = Math.min(1, t / 0.3), fs = Math.round(W * 0.042), family = 'system-ui,"Segoe UI",Roboto,Arial,sans-serif';
    var labels = [['Like', '#ffffff', '#111'], ['Comment', '#ffffff', '#111'], ['Subscribe', '#ff1a3c', '#fff']];
    ctx.save(); ctx.globalAlpha = a; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.font = '800 ' + fs + 'px ' + family;
    var gap = fs * 0.5, padX = fs * 0.8, ws = labels.map(function (l) { return ctx.measureText(l[0]).width + padX * 2; });
    var total = ws.reduce(function (x, y) { return x + y; }, 0) + gap * (labels.length - 1), x = (W - total) / 2, y = H * 0.82, bh = fs * 1.9;
    labels.forEach(function (l, i) {
      ctx.save(); var cx = x + ws[i] / 2; ctx.translate(cx, y);
      if (i === 2) { var k = 1 + 0.045 * Math.sin(t * 6); ctx.scale(k, k); }
      rrect(ctx, -ws[i] / 2, -bh / 2, ws[i], bh, bh / 2); ctx.fillStyle = l[1]; ctx.fill();
      ctx.fillStyle = l[2]; ctx.fillText(l[0], 0, 2); ctx.restore();
      x += ws[i] + gap;
    });
    ctx.restore();
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
        ctx.save();
        if (opts.motion !== false) {
          // A visual change every ~2.4 s without a new clip: a quick punch-in that settles, alternating with a slow push.
          var tt = Math.max(0, now - (sc.start || 0)), bi = Math.floor(tt / 2.4), bt = tt - bi * 2.4;
          var z = 1 + (bi % 2 ? 0.05 : 0) + (bt < 0.35 ? 0.07 * (1 - bt / 0.35) : 0) + 0.025 * (bt / 2.4);
          ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
        }
        if (usedVideo) coverDraw(ctx, sc.video, W, H); else drawPlain(ctx, W, H, now, si);
        ctx.restore();
        var g = ctx.createLinearGradient(0, H * 0.35, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.62)');
        ctx.fillStyle = g; ctx.fillRect(0, H * 0.35, W, H * 0.65);
        var g2 = ctx.createLinearGradient(0, 0, 0, H * 0.18); g2.addColorStop(0, 'rgba(0,0,0,.4)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H * 0.18);
        var ch = chunkAt(now); if (ch) drawCaption(ctx, W, H, ch, now);
        if (opts.banner) drawBanner(ctx, W, H, opts.banner, now);
        (opts.callouts || []).forEach(function (c) { drawCallout(ctx, W, H, c, now); });
        if (opts.endcard) drawEndcard(ctx, W, H, tl, now);
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
    if (state.settings.madeWith !== false) desc += '\n\nMade with Autonom Newsreel: ' + APP_URL;
    if (credits && credits.length) desc += '\n\nStock footage: ' + (provider || 'Pixabay') + ' (' + credits.join(', ') + ')';
    if (!/#shorts/i.test(desc)) desc += '\n\n#Shorts';
    var tags = (sc.tags || []).map(cleanTag).filter(Boolean);
    if (tags.map(function (t) { return t.toLowerCase(); }).indexOf('shorts') < 0) tags.push('Shorts');
    return { title: title, description: desc, tags: tags, pinned: String(sc.pinned || sc.cta || '').trim() };
  }
  function uploadText(m) { return 'TITLE\n' + m.title + '\n\nDESCRIPTION\n' + m.description + '\n\nTAGS\n' + m.tags.join(', ') + (m.pinned ? '\n\nPINNED COMMENT (post and pin it after upload)\n' + m.pinned : '') + '\n'; }
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
      '.asg-vid-box{border:1px solid var(--asg-border,#dde1ea);border-radius:12px;background:#fff;color:var(--asg-text,#141a2a);padding:14px 16px;margin:0 0 14px;}',
      '.asg-vid-box h3,.asg-vid-box h4{margin:0 0 6px;line-height:1.3;}',
      '.asg-vid-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-top:10px;}',
      '.asg-vid-box label{display:block;font-size:13px;font-weight:600;margin:0 0 4px;}',
      '.asg-vid-box input[type=text],.asg-vid-box input[type=password],.asg-vid-box input[type=number],.asg-vid-box select,.asg-vid-box textarea{width:100%;box-sizing:border-box;font:inherit;padding:7px 9px;border:1px solid #cbd3df;border-radius:8px;background:#fff;color:var(--asg-text,#141a2a);}',
      '.asg-vid-box textarea{min-height:120px;line-height:1.5;resize:vertical;}',
      '.asg-vid-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:10px;}',
      '.asg-vid-note{font-size:13px;color:#5b6676;margin:6px 0 0;}',
      '.asg-vid-status{font-size:14px;color:var(--asg-text,#141a2a);margin:10px 0 0;min-height:18px;}',
      '.asg-vid-status.is-err{color:#b3261e;}.asg-vid-status.is-ok{color:#17633a;}',
      '.asg-vid-stages{display:none;gap:8px;flex-wrap:wrap;margin-top:12px;}',
      '.asg-vid-stages.is-on{display:flex;}',
      '.asg-vid-stage{display:inline-flex;gap:6px;align-items:center;padding:4px 10px;border-radius:999px;border:1px solid var(--asg-border,#dde1ea);font-size:13px;font-weight:600;color:#7a8596;}',
      '.asg-vid-stage.is-active{border-color:var(--asg-accent,#3157f0);color:var(--asg-accent,#3157f0);background:var(--asg-accent-soft,#edf1ff);}',
      '.asg-vid-stage.is-done{border-color:#b6e3c4;color:#17633a;background:#e8f7ee;}',
      '.asg-vid-stage.is-active::before{content:"";width:10px;height:10px;border-radius:50%;border:2px solid var(--asg-accent,#3157f0);border-top-color:transparent;animation:asgspin .8s linear infinite;}',
      '.asg-vid-stage.is-done::before{content:"✓";}',
      '@keyframes asgspin{to{transform:rotate(360deg);}}',
      '.asg-vid-bar{height:8px;border-radius:4px;background:#e6e9f0;overflow:hidden;margin-top:10px;display:none;}',
      '.asg-vid-bar i{display:block;height:100%;width:0;background:var(--asg-accent,#3157f0);transition:width .25s;}',
      '.asg-vid-meta{display:none;justify-content:space-between;gap:8px;font-size:12px;color:#5b6676;margin-top:6px;}',
      '.asg-vid-preview{margin-top:12px;display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;}',
      '.asg-vid-canvas,.asg-vid-player{width:225px;max-width:100%;aspect-ratio:9/16;border-radius:10px;background:#000;display:block;}',
      '.asg-vid-side{flex:1;min-width:260px;}',
      '.asg-vid-field{margin:0 0 10px;}',
      '.asg-vid-copy{margin-top:4px;padding:4px 10px;font-size:12px;}',
      '.asg-plan{margin-top:18px;padding:18px;border:1px solid var(--asg-border,#dde1ea);border-radius:14px;background:var(--asg-bg-soft,#f6f7fa);transition:box-shadow .3s,border-color .3s;}',
      '.asg-plan.is-flash{border-color:var(--asg-accent,#3157f0);box-shadow:0 0 0 4px rgba(49,87,240,.15);}',
      '.asg-plan-head{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:flex-start;justify-content:space-between;margin-bottom:14px;}',
      '.asg-plan-head h4{margin:0 0 4px;font-size:17px;font-weight:700;letter-spacing:-.01em;}',
      '.asg-plan-head p{margin:0;max-width:60ch;font-size:13.5px;color:var(--asg-text-muted,#4f5a6e);}',
      '.asg-plan-list{list-style:none;margin:0;padding:0;display:grid;gap:8px;}',
      '.asg-plan-scene{display:grid;grid-template-columns:46px 1fr;gap:12px;padding:12px 14px;border:1px solid var(--asg-border,#dde1ea);border-left:3px solid transparent;border-radius:10px;background:var(--asg-bg,#fff);}',
      '.asg-plan-scene.is-edited{border-left-color:var(--asg-signal,#f5a524);}',
      '.asg-plan-time{font-variant-numeric:tabular-nums;font-size:12.5px;font-weight:700;color:var(--asg-text-muted,#4f5a6e);padding-top:2px;}',
      '.asg-plan-text{margin:0 0 8px;font-size:14px;line-height:1.45;color:var(--asg-text,#141a2a);}',
      '.asg-plan-ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}',
      '.asg-plan-tg{display:inline-flex;padding:2px;border-radius:9px;background:var(--asg-bg-muted,#eceff5);}',
      '.asg-plan-tg button{border:0;background:transparent;color:var(--asg-text-muted,#4f5a6e);padding:5px 12px;border-radius:7px;font-size:12.5px;font-weight:600;cursor:pointer;}',
      '.asg-plan-tg button.is-on{background:var(--asg-bg,#fff);color:var(--asg-text,#141a2a);box-shadow:0 1px 2px rgba(13,20,36,.12);}',
      '.asg-plan-ctl input{flex:1 1 220px;min-width:0;padding:7px 10px;border:1px solid var(--asg-border,#dde1ea);border-radius:8px;font:inherit;font-size:13.5px;background:var(--asg-bg,#fff);color:var(--asg-text,#141a2a);}',
      '.asg-plan-ctl input:disabled{opacity:.5;background:var(--asg-bg-soft,#f6f7fa);}',
      '.asg-plan-scene.is-card .asg-plan-text{font-weight:600;}',
      '.asg-plan-foot{display:flex;justify-content:flex-end;margin-top:14px;}',
      '.asg-plan-used{margin:6px 0 0;font-size:12px;color:var(--asg-text-dim,#7a869b);}',
      '.asg-exp-media{display:grid;gap:10px;margin:0 0 16px;}',
      '.asg-exp-item{border:1px solid var(--asg-border,#dde1ea);border-radius:12px;background:#fff;color:var(--asg-text,#141a2a);padding:12px 14px;}',
      '.asg-exp-item h4{margin:0 0 8px;font-size:15px;line-height:1.3;}',
      '.asg-exp-links{display:flex;flex-wrap:wrap;gap:8px;}',
      '.asg-exp-links a,.asg-exp-links span{padding:5px 10px;border-radius:8px;border:1px solid #cbd3df;font-size:13px;font-weight:600;text-decoration:none;color:var(--asg-accent,#3157f0);background:#fff;}',
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
    var fr2 = el('div', { class: 'asg-vid-row' });
    var cc = el('input', { type: 'checkbox', id: 'asg-vid-callouts' }); cc.checked = o.callouts !== false;
    fr2.appendChild(el('label', { style: 'display:flex;gap:8px;align-items:center;margin:0;font-weight:600;' }, [cc, 'Key-fact callouts on screen']));
    var ec = el('input', { type: 'checkbox', id: 'asg-vid-endcard' }); ec.checked = o.endcard !== false;
    fr2.appendChild(el('label', { style: 'display:flex;gap:8px;align-items:center;margin:0;font-weight:600;' }, [ec, 'Like · Comment · Subscribe at the end']));
    var bc = el('input', { type: 'checkbox', id: 'asg-vid-banner' }); bc.checked = o.banner !== false;
    fr2.appendChild(el('label', { style: 'display:flex;gap:8px;align-items:center;margin:0;font-weight:600;' }, [bc, 'Headline banner in the first seconds']));
    var mc = el('input', { type: 'checkbox', id: 'asg-vid-motion' }); mc.checked = o.motion !== false;
    fr2.appendChild(el('label', { style: 'display:flex;gap:8px;align-items:center;margin:0;font-weight:600;' }, [mc, 'Zoom beat every 2.4 s (keeps the picture moving)']));
    box.appendChild(fr2);
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
      v.res = res.value; v.engine = eng.value; v.footage = fc.checked; v.tag = tc.checked; v.callouts = cc.checked; v.endcard = ec.checked; v.banner = bc.checked; v.motion = mc.checked;
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
  function vidField(label, value, rows) {
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
    var wrap = el('section', { class: 'asg-plan', id: 'asg-plan-' + (rec.id || '') });
    var head = el('div', { class: 'asg-plan-head' });
    var ht = el('div', {});
    ht.appendChild(el('h4', { text: 'Edit scenes' }));
    ht.appendChild(el('p', { text: 'Each line of the script is a scene. Change the footage search or turn a scene into a plain caption card, then re-record. The voice is reused, so this takes less time than starting over.' }));
    head.appendChild(ht);
    var go = el('button', { class: 'asg-btn asg-btn-primary asg-plan-go', type: 'button' });
    var go2 = el('button', { class: 'asg-btn asg-btn-primary asg-plan-go', type: 'button' });
    head.appendChild(go);
    wrap.appendChild(head);
    var edits = scenes.map(function (s) { return { query: s.query || '', alt: s.alt || '', kind: s.kind || 'footage' }; });
    var orig = edits.map(function (e) { return { query: e.query, kind: e.kind }; });
    var changed = 0;
    function count() {
      changed = edits.filter(function (e, i) { return e.query !== orig[i].query || e.kind !== orig[i].kind; }).length;
      go.textContent = go2.textContent = changed ? 'Re-record with ' + changed + ' change' + (changed === 1 ? '' : 's') : 'Re-record scenes';
    }
    var list = el('ol', { class: 'asg-plan-list' });
    scenes.forEach(function (s, i) {
      var row = el('li', { class: 'asg-plan-scene' });
      row.appendChild(el('span', { class: 'asg-plan-time', text: fmtTime(s.start) }));
      var body = el('div', { class: 'asg-plan-body' });
      body.appendChild(el('p', { class: 'asg-plan-text', text: s.text }));
      var ctl = el('div', { class: 'asg-plan-ctl' });
      var tg = el('div', { class: 'asg-plan-tg', role: 'group', 'aria-label': 'Scene ' + (i + 1) + ' shows' });
      var bF = el('button', { type: 'button', text: 'Footage' }), bC = el('button', { type: 'button', text: 'Caption card' });
      tg.appendChild(bF); tg.appendChild(bC);
      var q = el('input', { type: 'text', value: edits[i].query, placeholder: 'Search words, for example crowd outside parliament', 'aria-label': 'Footage search words for scene ' + (i + 1) });
      function paint() {
        var isCard = edits[i].kind === 'card';
        bF.className = isCard ? '' : 'is-on'; bC.className = isCard ? 'is-on' : '';
        bF.setAttribute('aria-pressed', String(!isCard)); bC.setAttribute('aria-pressed', String(isCard));
        q.disabled = isCard; row.classList.toggle('is-card', isCard);
        row.classList.toggle('is-edited', edits[i].query !== orig[i].query || edits[i].kind !== orig[i].kind);
        count();
      }
      bF.addEventListener('click', function () { edits[i].kind = 'footage'; paint(); });
      bC.addEventListener('click', function () { edits[i].kind = 'card'; paint(); });
      q.addEventListener('input', function () { edits[i].query = q.value; paint(); });
      ctl.appendChild(tg); ctl.appendChild(q); body.appendChild(ctl);
      if (s.usedQuery && s.kind !== 'card' && s.usedQuery !== edits[i].query) body.appendChild(el('p', { class: 'asg-plan-used', text: 'Showing footage for: ' + s.usedQuery }));
      row.appendChild(body); list.appendChild(row); paint();
    });
    wrap.appendChild(list);
    var foot = el('div', { class: 'asg-plan-foot' }); foot.appendChild(go2); wrap.appendChild(foot);
    function rerec() {
      sc.vplan = { hash: rec.sceneHash, scenes: edits.map(function (e, i) { return { query: String(e.query || '').trim() || fallbackQuery(scenes[i].text, sc.title || ''), alt: edits[i].alt || '', kind: e.kind }; }) };
      persistScripts(); makeVideo(sc, card, { keepPlan: true });
    }
    go.addEventListener('click', rerec); go2.addEventListener('click', rerec);
    count();
    return wrap;
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
    side.appendChild(vidField('Title', m.title)); side.appendChild(vidField('Description', m.description, 150)); side.appendChild(vidField('Tags', m.tags.join(', '))); if (m.pinned) side.appendChild(vidField('Pinned comment (post and pin it)', m.pinned));
    var ed = el('button', { class: 'asg-btn asg-btn-ghost asg-vid-editscenes', type: 'button', text: 'Edit scenes' });
    ed.title = 'Change the footage or turn a scene into a caption card';
    ed.addEventListener('click', function () { var pl = $('.asg-plan', card); if (pl) { pl.scrollIntoView({ behavior: 'smooth', block: 'start' }); pl.classList.add('is-flash'); setTimeout(function () { pl.classList.remove('is-flash'); }, 1400); } });
    links.appendChild(ed);
    var del = el('button', { class: 'asg-btn asg-btn-ghost asg-vid-del', type: 'button', text: '🗑 Delete this video' });
    del.addEventListener('click', function () {
      if (vidBusy) return;
      if (!confirm('Delete this video from this browser? The script stays.')) return;
      Promise.all([dbDel('media', rec.id), dbDel('parts', rec.id)]).then(function () { host.innerHTML = ''; setStatus(card, 'Video deleted. The script is kept, so you can make it again.', ''); refreshStorageNote(); });
    });
    links.appendChild(del);
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
      return renderVideo(tl, { w: W, h: H, tag: !!o.tag && info.footage !== 'plain', callouts: o.callouts !== false ? calloutTimes(tl, sc.callouts, bannerText(sc, o) ? 3.4 : 0.5) : [], endcard: o.endcard !== false, motion: o.motion !== false, banner: bannerText(sc, o) }, function (p) { setBar(0.8 + 0.2 * p); }, $('.asg-vid-live', card), run);
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


  /* ---------- Publish: a caption per platform, then hand-off to the owner's own automation ---------- */
  var PLATFORMS = [
    { id: 'youtube', label: 'YouTube Shorts', limit: 5000, tags: 3, style: '' },
    { id: 'instagram', label: 'Instagram Reels', limit: 2000, tags: 6, style: 'A first line that stops the scroll, 2-3 short lines, then a question to the viewer, then the hashtags.' },
    { id: 'facebook', label: 'Facebook Reels', limit: 600, tags: 3, style: '2-3 plain sentences and a question. Few hashtags.' },
    { id: 'tiktok', label: 'TikTok', limit: 150, tags: 4, style: 'One curiosity-led line, under 150 characters including the hashtags.' },
    { id: 'x', label: 'X', limit: 270, tags: 2, style: 'One sharp take under 270 characters. No link. At most two hashtags.' },
    { id: 'linkedin', label: 'LinkedIn', limit: 1100, tags: 3, style: 'Professional, 3-5 short lines leading with the analytical point, ending on a question. Three hashtags.' },
    { id: 'threads', label: 'Threads', limit: 480, tags: 1, style: 'Conversational, like a thought you had out loud.' },
    { id: 'bluesky', label: 'Bluesky', limit: 290, tags: 1, style: 'One clear sentence or two, under 290 characters.' },
    { id: 'telegram', label: 'Telegram', limit: 900, tags: 3, style: '3-4 sentences, plain text, a question at the end.' },
    { id: 'rumble', label: 'Rumble', limit: 1000, tags: 3, style: 'A short description: what happened and the angle.' },
    { id: 'mastodon', label: 'Mastodon', limit: 480, tags: 2, style: 'Plain, conversational, under 480 characters, hashtags at the end.' }
  ];
  function platOf(id) { return PLATFORMS.filter(function (x) { return x.id === id; })[0]; }
  function pubPlatforms() {
    var sel = Array.isArray(state.settings.publishPlatforms) ? state.settings.publishPlatforms : [];
    return PLATFORMS.filter(function (x) { return sel.indexOf(x.id) !== -1; });
  }
  function hashtagLine(tags, n) {
    return (tags || []).filter(function (t) { return String(t).toLowerCase() !== 'shorts'; }).slice(0, n).map(function (t) { return '#' + cleanTag(t); }).join(' ');
  }
  function fitPost(text, pl, tagsLine) {
    var t = String(text || '').replace(/[ \t]+\n/g, '\n').trim();
    var tagLen = tagsLine && t.indexOf(tagsLine) === -1 ? tagsLine.length + 2 : 0;
    var room = pl.limit - tagLen;
    if (t.length > room) {
      var cut = t.slice(0, room), k = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
      t = (k > room * 0.5 ? cut.slice(0, k + 1) : cut.replace(/\s+\S*$/, '') + '…').trim();
    }
    if (tagLen) t += '\n\n' + tagsLine;
    return t;
  }
  function defaultPost(pl, sc, meta) {
    var tagsLine = hashtagLine(meta.tags, pl.tags);
    var parts = [sc.title || sc.storyTitle, sc.hook && sc.hook !== sc.title ? sc.hook : '', sc.cta].filter(Boolean);
    function wset(t) { var o = {}; String(t).toLowerCase().replace(/https?:\/\/\S+|#\S+/g, '').split(/[^a-z0-9]+/).filter(function (w) { return w.length > 2; }).forEach(function (w) { o[w] = 1; }); return o; }
    function near(a, b) { var A = wset(a), B = wset(b), i = 0, u = 0, k; for (k in A) { u++; if (B[k]) i++; } for (k in B) if (!A[k]) u++; return u ? i / u >= 0.55 : false; }
    parts = parts.filter(function (t, i) { for (var j = 0; j < i; j++) if (near(t, parts[j])) return false; return true; });
    if (pl.id === 'x' || pl.id === 'tiktok' || pl.id === 'bluesky') parts = parts.slice(0, 1);
    return fitPost(parts.join('\n\n'), pl, tagsLine);
  }
  function postsOf(sc) { return sc.posts && typeof sc.posts === 'object' ? sc.posts : (sc.posts = {}); }
  function scriptSourceText(sc) {
    return [sc.hook, sc.body, sc.analysis, sc.cta, sc.title, sc.description].concat((sc.facts || []).map(function (f) { return f.claim + ' ' + f.quote; })).join('\n');
  }
  function writePosts(sc, meta, pls) {
    var want = pls.filter(function (p) { return p.id !== 'youtube'; });
    var out = {};
    if (!want.length) return Promise.resolve(out);
    var lines = [
      'You write the social captions that go with a finished news-explainer short. Same story, one caption per platform, each in the native style of that platform.',
      '', 'CHANNEL VOICE:'
    ].concat(dnaText(state.profile).split('\n'), ['', 'TITLE: ' + (sc.title || sc.storyTitle), 'HOOK: ' + sc.hook, 'BODY: ' + sc.body, 'ANALYSIS: ' + (sc.analysis || ''), 'CTA: ' + sc.cta, '', 'PLATFORMS:']);
    want.forEach(function (p) { lines.push('- "' + p.id + '" (' + p.label + '): max ' + p.limit + ' characters including hashtags. ' + p.style + (p.tags ? ' Up to ' + p.tags + ' relevant hashtags.' : '')); });
    lines.push('', 'RULES: use only facts that are in the script above; never add numbers, names, quotes or claims. Do not mention other platforms. No emojis unless they clearly fit the voice. Write like a person, not a brand. Do not put links in the caption.',
      'Return STRICT JSON only: {"posts":{' + want.map(function (p) { return '"' + p.id + '":"..."'; }).join(',') + '}}');
    var src = scriptSourceText(sc);
    return callLLM(lines.join('\n'), 'write').then(function (r) {
      var j = extractJson(r.text), po = (j && j.posts) || j || {};
      want.forEach(function (p) {
        var t = String(po[p.id] || '').trim();
        if (!t || unsupportedNumbers(t, src).length) return;
        out[p.id] = fitPost(t, p, '');
      });
      return out;
    }).catch(function (e) { LOG('captions: AI unavailable, using plain captions:', e && e.message); return out; });
  }
  function pubStyle() {
    if (document.getElementById('asg-pub-style')) return;
    var st = document.createElement('style'); st.id = 'asg-pub-style';
    st.textContent = '.asg-pub-plats{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}.asg-pub-plats label{display:flex;gap:6px;align-items:center;border:1px solid var(--asg-border,#e1e4e9);border-radius:999px;padding:5px 12px;font-size:14px;cursor:pointer}' +
      '.asg-pub-plats input:checked+span{font-weight:600}.asg-pub-row{margin:8px 0;border:1px solid var(--asg-border,#dde1ea);border-radius:10px;background:var(--asg-bg,#fff)}.asg-pub-row>summary{list-style:none;cursor:pointer;padding:10px 14px;border-radius:10px}.asg-pub-row>summary::-webkit-details-marker{display:none}.asg-pub-row>summary strong::before{content:"▸";display:inline-block;width:16px;color:var(--asg-text-dim,#7a869b);transition:transform .15s}.asg-pub-row[open]>summary strong::before{transform:rotate(90deg)}.asg-pub-row[open]>summary{border-bottom:1px solid var(--asg-border,#dde1ea);border-radius:10px 10px 0 0}.asg-root .asg-pub-row>*:not(summary){margin-left:14px;margin-right:14px}.asg-root .asg-pub-row>*:last-child{margin-bottom:12px}.asg-root .asg-pub-row .asg-hint{margin-top:8px}.asg-pub-row textarea{width:100%;min-height:78px;box-sizing:border-box}.asg-pub-row .asg-pub-h{display:flex;justify-content:space-between;align-items:center;font-size:14px}.asg-pub-row textarea{margin-top:10px}' +
      '.asg-pub-in{width:100%;box-sizing:border-box;margin:4px 0 10px;padding:9px 12px;border:1px solid var(--asg-border,#dde1ea);border-radius:9px;background:var(--asg-bg,#fff);color:var(--asg-text,#141a2a);font:inherit;font-size:14px}.asg-pub-in:focus{outline:none;border-color:var(--asg-accent,#3157f0);box-shadow:0 0 0 3px rgba(49,87,240,.16)}.asg-pub-status{margin:8px 0 0}' +
      '.asg-pub-spread,.asg-pub-when{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin:10px 0}.asg-pub-spread .asg-pub-in,.asg-pub-when .asg-pub-in{width:auto;margin:0}.asg-pub-when{padding:12px 14px;border:1px solid var(--asg-border,#dde1ea);border-left:3px solid var(--asg-signal,#f5a524);border-radius:10px;background:var(--asg-signal-soft,#fff4de)}.asg-pub-when .asg-label{margin:0}';
    document.head.appendChild(st);
  }
  var PUB_SAMPLE = { event: 'newsreel.publish', sent_at: '2026-10-25T05:00:00+00:00', profile: { id: '...', name: 'Blomstra Insights' }, platforms: ['youtube', 'instagram', 'x'], scheduled_at: '2026-10-27T16:30:00.000Z', scheduled_local: '2026-10-27T18:30', timezone: 'Europe/Stockholm', title: '...', description: '...', tags: ['Iran', 'geopolitics'], posts: { instagram: '...', x: '...' }, pinned_comment: '...', sources: ['https://...'], duration_sec: 59, captions_srt: '...', video_url: 'https://your-site/wp-content/uploads/autonom-newsreel/abc123.mp4', video_mime: 'video/mp4' };
  function toLocalInput(d) { function z(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()); }
  function pubSend(sc, rec, test, schedule, local) {
    var cfg = window.AUTONOM_ASG || {}, st = state.settings;
    var um = rec ? uploadMeta(sc, rec.credits, rec.provider) : { title: 'Test from Newsreel', description: 'Test event. Nothing was published.', tags: ['test'], pinned: '' };
    var posts = {}; var mine = sc ? postsOf(sc) : {};
    pubPlatforms().forEach(function (p) { if (p.id !== 'youtube') posts[p.id] = sc ? (mine[p.id] || defaultPost(p, sc, um)) : 'Test caption for ' + p.label; });
    var meta = {
      test: !!test, webhook: String(st.publishWebhook || '').trim(), secret: String(st.publishSecret || '').trim(),
      profile: { id: state.profile && state.profile.id, name: state.profile && state.profile.name },
      platforms: pubPlatforms().map(function (p) { return p.id; }), scheduled_at: schedule || '', scheduled_local: local || '', timezone: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } })(),
      title: um.title, description: um.description, tags: um.tags, posts: posts, pinned_comment: um.pinned,
      sources: (sc && sc.sources) || [], duration_sec: rec ? Math.round(rec.duration || 0) : 0, captions_srt: rec && rec.srt ? rec.srt : ''
    };
    var fd = new FormData();
    fd.append('meta', JSON.stringify(meta));
    if (!test && rec && rec.video) fd.append('video', rec.video, slugOf(sc, 0) + '.' + (rec.ext || 'mp4'));
    return fetchWithTimeout(cfg.publishEndpoint, { method: 'POST', body: fd, headers: { 'X-WP-Nonce': cfg.restNonce || '' }, credentials: 'same-origin' }, 240000).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j = j || {}; j.httpStatus = r.status; return j; });
    });
  }
  function pubExplain(j) {
    if (j.httpStatus === 401 || j.httpStatus === 403 || j.code === 'rest_forbidden') return 'Not allowed: log in to WordPress as an editor or admin and reload this page. (If the page is cached, the login check can be stale.)';
    if (j.message) return j.message;
    if (j.ok === false && j.webhook_status) return 'Your automation answered ' + j.webhook_status + (j.webhook_reply ? ': ' + String(j.webhook_reply).slice(0, 120) : '') + '.';
    return j.error ? 'Failed: ' + j.error : 'No answer from the site relay (status ' + (j.httpStatus || '?') + ').';
  }
  var PUB_OPEN = {
    youtube: function () { return 'https://www.youtube.com/upload'; },
    instagram: function () { return 'https://www.instagram.com/'; },
    facebook: function () { return 'https://www.facebook.com/reels/create'; },
    tiktok: function () { return 'https://www.tiktok.com/tiktokstudio/upload'; },
    x: function (t) { return 'https://x.com/intent/post?text=' + encodeURIComponent(t); },
    linkedin: function (t) { return 'https://www.linkedin.com/feed/?shareActive=true&text=' + encodeURIComponent(t); },
    threads: function () { return 'https://www.threads.net/'; },
    bluesky: function (t) { return 'https://bsky.app/intent/compose?text=' + encodeURIComponent(t); },
    telegram: function () { return 'https://web.telegram.org/'; },
    rumble: function () { return 'https://rumble.com/upload.php'; },
    mastodon: null
  };
  function copyText(t) { try { navigator.clipboard.writeText(t); return true; } catch (e) { return false; } }
  function tgPost(rec, text, name) {
    var st = state.settings, fd = new FormData();
    fd.append('chat_id', String(st.telegramChat || '').trim());
    fd.append('caption', String(text).slice(0, 1024));
    fd.append('supports_streaming', 'true');
    fd.append('video', rec.video, name);
    return fetchWithTimeout('https://api.telegram.org/bot' + String(st.telegramToken || '').trim() + '/sendVideo', { method: 'POST', body: fd }, 240000)
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) { if (!j.ok) throw new Error(j.description || 'Telegram refused the video'); return 'Posted to Telegram.'; });
  }
  function mastoBase() { var h = String(state.settings.mastodonInstance || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''); return h ? 'https://' + h : ''; }
  function mastoPost(rec, text, name) {
    var st = state.settings, base = mastoBase(), auth = { 'Authorization': 'Bearer ' + String(st.mastodonToken || '').trim() };
    var fd = new FormData(); fd.append('file', rec.video, name);
    return fetchWithTimeout(base + '/api/v2/media', { method: 'POST', body: fd, headers: auth }, 240000).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!(r.status === 200 || r.status === 202) || !j.id) throw new Error(j.error || 'Mastodon refused the video (' + r.status + ')');
        function wait(n) {
          if (r.status === 200 || n > 40) return Promise.resolve();
          return sleep(1500).then(function () { return fetchWithTimeout(base + '/api/v1/media/' + j.id, { headers: auth }, 15000); }).then(function (g) { return g.status === 200 ? null : wait(n + 1); });
        }
        return wait(0).then(function () { return j.id; });
      });
    }).then(function (id) {
      return fetchWithTimeout(base + '/api/v1/statuses', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth), body: JSON.stringify({ status: text, media_ids: [id], visibility: 'public' }) }, 30000);
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!j.id) throw new Error(j.error || 'Mastodon did not accept the post'); return 'Posted to Mastodon.'; }); });
  }
  function renderPublish() {
    pubStyle();
    var cfg = window.AUTONOM_ASG || {}, st = state.settings, owner = !!cfg.canPublish;
    var setup = $('#asg-pub-setup'), list = $('#asg-pub-list'); if (!setup || !list) return Promise.resolve();
    var myTok = (renderPublish._tok = (renderPublish._tok || 0) + 1);
    setup.innerHTML = ''; list.innerHTML = '';
    var box = el('div', { class: 'asg-cons-card' });
    box.appendChild(el('strong', { text: 'Where to publish' }));
    var pl = el('div', { class: 'asg-pub-plats' });
    PLATFORMS.forEach(function (p) {
      var cb = el('input', { type: 'checkbox' }); cb.checked = (st.publishPlatforms || []).indexOf(p.id) !== -1;
      cb.addEventListener('change', function () {
        var cur = (st.publishPlatforms || []).filter(function (x) { return x !== p.id; });
        if (cb.checked) cur.push(p.id);
        st.publishPlatforms = cur; persistSettings(); renderPublish();
      });
      pl.appendChild(el('label', {}, [cb, el('span', { text: p.label })]));
    });
    box.appendChild(pl);
    function field2(parent, label, key, ph) {
      var inp = el('input', { type: 'text', class: 'asg-pub-in', placeholder: ph || '', autocomplete: 'off', spellcheck: 'false' });
      inp.value = st[key] || '';
      inp.addEventListener('change', function () { st[key] = inp.value.trim(); persistSettings(); renderPublish(); });
      inp.id = 'asg-pub-' + key;
      parent.appendChild(el('label', { class: 'asg-label', for: inp.id, text: label })); parent.appendChild(inp);
    }
    var direct = el('details', { style: 'margin-top:6px;' });
    direct.appendChild(el('summary', { text: 'Post directly: Telegram and Mastodon (no extra service)' }));
    direct.open = !!(st.telegramToken || st.mastodonToken);
    direct.appendChild(el('p', { class: 'asg-hint', text: 'Telegram: create a bot with @BotFather, add it as an admin of your channel, paste its token and the channel name (like @mychannel). Mastodon: Preferences, Development, new application with write:media and write:statuses, paste the access token. Keys stay in this browser, like your AI keys.' }));
    field2(direct, 'Telegram bot token', 'telegramToken', '123456:ABC…'); field2(direct, 'Telegram channel or chat', 'telegramChat', '@mychannel');
    field2(direct, 'Mastodon server', 'mastodonInstance', 'mastodon.social'); field2(direct, 'Mastodon access token', 'mastodonToken', '');
    box.appendChild(direct);
    var hookOn = owner && /^https:\/\//.test(st.publishWebhook || '');
    if (owner) {
      var own = el('details', { style: 'margin-top:6px;' });
      own.open = !!st.publishWebhook;
      own.appendChild(el('summary', { text: 'Automation hand-off (site owner): Make, n8n, Zapier' }));
      own.appendChild(el('p', { class: 'asg-hint', text: 'Sends the video and all captions to your own webhook through this site, which hosts the video at a temporary public link. Only you can use it because it needs your WordPress login.' }));
      var wh = el('input', { type: 'url', class: 'asg-pub-in', placeholder: 'https://hook.eu1.make.com/…', autocomplete: 'off', spellcheck: 'false' });
      wh.value = st.publishWebhook || '';
      wh.addEventListener('change', function () { st.publishWebhook = wh.value.trim(); persistSettings(); renderPublish(); });
      own.appendChild(el('label', { class: 'asg-label', text: 'Webhook address (https)' })); own.appendChild(wh);
      field2(own, 'Shared secret (optional)', 'publishSecret', 'sent as the X-Newsreel-Secret header');
      var sp = el('div', { class: 'asg-pub-spread' });
      var spFirst = el('input', { type: 'datetime-local', class: 'asg-pub-in', id: 'asg-pub-first', style: 'max-width:230px;' });
      spFirst.value = st.publishFirst || ''; spFirst.addEventListener('change', function () { st.publishFirst = spFirst.value; persistSettings(); });
      var spGap = el('select', { class: 'asg-pub-in', id: 'asg-pub-gap', style: 'max-width:150px;' });
      [[2, 'every 2 hours'], [4, 'every 4 hours'], [6, 'every 6 hours'], [12, 'every 12 hours'], [24, 'once a day']].forEach(function (g) { spGap.appendChild(el('option', { value: String(g[0]), text: g[1] })); });
      spGap.value = String(st.publishGap || 6);
      var spBtn = el('button', { type: 'button', class: 'asg-btn asg-btn-ghost', text: 'Space my videos out' });
      spBtn.addEventListener('click', function () {
        if (!spFirst.value) { toast('Pick a time for the first video.', 'error'); return; }
        st.publishFirst = spFirst.value; var t0 = new Date(spFirst.value).getTime(), gap = parseFloat(spGap.value) * 3600000; st.publishGap = parseFloat(spGap.value); persistSettings();
        var n = 0; goodScripts().forEach(function (sc2) { sc2.schedule = toLocalInput(new Date(t0 + n * gap)); n++; });
        persistScripts(); renderPublish();
      });
      sp.appendChild(el('label', { class: 'asg-label', for: 'asg-pub-first', text: 'Schedule all: first video at' })); sp.appendChild(spFirst); sp.appendChild(spGap); sp.appendChild(spBtn);
      own.appendChild(sp);
      own.appendChild(el('p', { class: 'asg-hint', text: 'Each video also has its own time on its card below. Times use this browser\'s time zone, and your automation receives the exact UTC time.' }));
      var tb = el('button', { type: 'button', class: 'asg-btn asg-btn-ghost', text: 'Send a test event' }), tstat = el('p', { class: 'asg-hint asg-pub-status' });
      tb.disabled = !hookOn;
      tb.addEventListener('click', function () {
        tb.disabled = true; tstat.textContent = 'Sending…';
        pubSend(null, null, true, '').then(function (j) { tstat.textContent = j.ok ? 'Your automation accepted the test (' + j.webhook_status + '). Nothing was published.' : pubExplain(j); })
          .catch(function (e) { tstat.textContent = 'Could not reach the site relay: ' + (e && e.message || e); }).then(function () { tb.disabled = false; });
      });
      own.appendChild(tb); own.appendChild(tstat);
      var ex = el('details', { style: 'margin-top:8px;' });
      ex.appendChild(el('summary', { text: 'What your automation receives' }));
      ex.appendChild(el('pre', { style: 'white-space:pre-wrap;font-size:12px;overflow:auto;', text: JSON.stringify(PUB_SAMPLE, null, 2) + '\n\nPOST, JSON. Route by "platforms". "video_url" is public for 3 days, then deleted.' }));
      own.appendChild(ex);
      box.appendChild(own);
    }
    setup.appendChild(box);

    return mediaIndex().then(function (idx) {
      if (myTok !== renderPublish._tok) return;
      var scripts = goodScripts(), pls = pubPlatforms(), have = 0;
      scripts.forEach(function (sc, i) {
        var rec = idx[sc.mediaId || ''];
        var card = el('div', { class: 'asg-cons-card' });
        card.appendChild(el('strong', { text: (i + 1) + '. ' + (sc.title || sc.storyTitle) }));
        if (!rec || !rec.video) { card.appendChild(el('p', { class: 'asg-hint', text: 'No video yet. Make it in the Video step first.' })); list.appendChild(card); return; }
        have++;
        var fname = slugOf(sc, i) + '.' + (rec.ext || 'mp4');
        var um = uploadMeta(sc, rec.credits, rec.provider), posts = postsOf(sc), areas = {};
        var meta = el('p', { class: 'asg-hint' });
        meta.appendChild(document.createTextNode((rec.ext || 'mp4').toUpperCase() + ' · ' + fmtMB(rec.video.size) + ' · ' + Math.round(rec.duration || 0) + ' s' + (sc.published ? ' · sent ' + new Date(sc.published.at).toLocaleString() + (sc.published.scheduled_for ? ' for ' + new Date(sc.published.scheduled_for).toLocaleString() : '') + ' to ' + sc.published.platforms.join(', ') : '') + ' · '));
        meta.appendChild(el('a', { href: URL.createObjectURL(rec.video), download: fname, text: 'Download video' }));
        card.appendChild(meta);
        if ((rec.ext || '') !== 'mp4') card.appendChild(el('p', { class: 'asg-hint', style: 'color:#8a5b00;', text: 'This is a WebM file. Instagram, Facebook and TikTok often refuse WebM. Make the video in Chrome or Edge to get MP4.' }));
        var file = null, canShare = false;
        try { file = new File([rec.video], fname, { type: rec.video.type || (rec.ext === 'mp4' ? 'video/mp4' : 'video/webm') }); canShare = !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) {}
        var status = el('p', { class: 'asg-hint asg-pub-status' });
        var wb = el('button', { type: 'button', class: 'asg-btn asg-btn-ghost', text: 'Write captions for ' + pls.filter(function (p) { return p.id !== 'youtube'; }).length + ' platforms' });
        function fillAreas() { pls.forEach(function (p) { if (areas[p.id]) { areas[p.id].value = posts[p.id] || defaultPost(p, sc, um); areas[p.id].dispatchEvent(new Event('input')); } }); }
        wb.addEventListener('click', function () {
          wb.disabled = true; wb.textContent = 'Writing…';
          writePosts(sc, um, pls).then(function (po) { pls.forEach(function (p) { if (po[p.id]) posts[p.id] = po[p.id]; }); persistScripts(); fillAreas(); status.textContent = 'Captions written. Edit them if you like.'; })
            .then(function () { wb.disabled = false; wb.textContent = 'Write captions again'; });
        });
        var tgl = el('button', { type: 'button', class: 'asg-btn asg-btn-ghost', text: 'Expand all', style: 'margin-left:8px;' });
        tgl.addEventListener('click', function () { var rows = $$('.asg-pub-row', card), anyClosed = rows.some(function (r) { return !r.open; }); rows.forEach(function (r) { r.open = anyClosed; }); tgl.textContent = anyClosed ? 'Collapse all' : 'Expand all'; });
        card.appendChild(wb); card.appendChild(tgl);
        pls.forEach(function (p) {
          var row = el('details', { class: 'asg-pub-row' }); if (p.id === 'youtube') row.open = true;
          var h = el('summary', { class: 'asg-pub-h' }); h.appendChild(el('strong', { text: p.label }));
          var cnt = el('span', { class: 'asg-hint' }); h.appendChild(cnt); row.appendChild(h);
          var btns = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;' }), rs = el('span', { class: 'asg-hint' });
          function btn(label, fn) { var b = el('button', { type: 'button', class: 'asg-btn asg-btn-ghost', text: label }); b.addEventListener('click', function () { fn(b); }); btns.appendChild(b); return b; }
          if (p.id === 'youtube') {
            row.appendChild(el('p', { class: 'asg-hint', text: um.title }));
            btn('Copy title', function () { copyText(um.title); toast('Title copied.', 'ok', 1500); });
            btn('Copy description + tags', function () { copyText(um.description + '\n\n' + um.tags.map(function (t) { return '#' + cleanTag(t); }).join(' ')); toast('Copied.', 'ok', 1500); });
            btn('Open YouTube upload', function () { window.open(PUB_OPEN.youtube(), '_blank', 'noopener'); });
          } else {
            var ta = el('textarea', {}); ta.value = posts[p.id] || defaultPost(p, sc, um);
            var count = function () { cnt.textContent = ta.value.length + ' / ' + p.limit; cnt.style.color = ta.value.length > p.limit ? '#b3261e' : ''; };
            ta.addEventListener('input', function () { posts[p.id] = ta.value; persistScripts(); count(); });
            count(); areas[p.id] = ta; row.appendChild(ta);
            btn('Copy', function () { copyText(ta.value); toast('Copied.', 'ok', 1500); });
            if (PUB_OPEN[p.id] && !(p.id === 'telegram' && st.telegramToken && st.telegramChat)) btn('Copy and open ' + p.label, function () { copyText(ta.value); window.open(PUB_OPEN[p.id](ta.value), '_blank', 'noopener'); });
            if (canShare) btn('Share…', function () { navigator.share({ files: [file], text: ta.value, title: um.title }).catch(function () {}); });
            if (p.id === 'telegram' && st.telegramToken && st.telegramChat) btn('Post to Telegram', function (b) {
              if (!window.confirm('Post this video to ' + st.telegramChat + ' on Telegram now?')) return;
              b.disabled = true; rs.textContent = 'Uploading…';
              tgPost(rec, ta.value, fname).then(function (m) { rs.textContent = m; }).catch(function (e) { rs.textContent = 'Failed: ' + (e && e.message || e); }).then(function () { b.disabled = false; });
            });
            if (p.id === 'mastodon' && mastoBase() && st.mastodonToken) btn('Post to Mastodon', function (b) {
              if (!window.confirm('Post this video publicly on ' + mastoBase().replace('https://', '') + ' now?')) return;
              b.disabled = true; rs.textContent = 'Uploading…';
              mastoPost(rec, ta.value, fname).then(function (m) { rs.textContent = m; }).catch(function (e) { rs.textContent = 'Failed: ' + (e && e.message || e); }).then(function () { b.disabled = false; });
            });
          }
          row.appendChild(btns); row.appendChild(rs); card.appendChild(row);
        });
        if (owner) {
          var wrap = el('div', { class: 'asg-pub-when' });
          var when = el('input', { type: 'datetime-local', class: 'asg-pub-in', id: 'asg-when-' + i, style: 'max-width:230px;' });
          when.value = sc.schedule || '';
          when.addEventListener('change', function () { sc.schedule = when.value; persistScripts(); setLabel(); });
          wrap.appendChild(el('label', { class: 'asg-label', for: 'asg-when-' + i, text: 'Publish at' })); wrap.appendChild(when);
          wrap.appendChild(el('span', { class: 'asg-hint', text: 'Leave empty to publish as soon as your automation runs.' }));
          card.appendChild(wrap);
          var sb = el('button', { type: 'button', class: 'asg-btn asg-btn-primary', style: 'margin-top:10px;' });
          function setLabel() { sb.textContent = when.value ? 'Send and schedule for ' + new Date(when.value).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Send to my automation now'; }
          setLabel();
          sb.disabled = !hookOn || !pls.length;
          sb.addEventListener('click', function () {
            var names = pls.map(function (p) { return p.label; }).join(', ');
            if (!window.confirm('Send "' + (sc.title || sc.storyTitle) + '" to your automation for: ' + names + '?\n\nDepending on how you built it, your automation may publish this publicly.')) return;
            sb.disabled = true; status.textContent = 'Uploading ' + fmtMB(rec.video.size) + ' and sending…';
            var iso = when.value ? new Date(when.value).toISOString() : '';
            if (when.value && new Date(when.value).getTime() < Date.now() - 60000) { sb.disabled = false; status.textContent = 'That time is in the past. Pick a later time or clear it.'; return; }
            pubSend(sc, rec, false, iso, when.value).then(function (j) {
              if (j.ok) { sc.published = { at: new Date().toISOString(), platforms: pls.map(function (p) { return p.id; }), scheduled_for: iso }; persistScripts(); status.textContent = 'Sent. Your automation accepted it (' + j.webhook_status + '). Check there that each platform published.'; }
              else status.textContent = pubExplain(j);
            }).catch(function (e) { status.textContent = 'Could not reach the site relay: ' + (e && e.message || e); }).then(function () { sb.disabled = !hookOn || !pls.length; });
          });
          card.appendChild(sb);
        }
        card.appendChild(status);
        list.appendChild(card);
      });
      if (!have) list.appendChild(el('p', { class: 'asg-hint', text: 'No videos yet. Make them in the Video step; they stay saved in this browser.' }));
    });
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
        var ex = state.profiles.filter(function (x) { return x.source && p.source && x.source.channelId && x.source.channelId === p.source.channelId; })[0];
        if (ex) p.id = ex.id;
        state.profile = p; persistProfile(); renderProfile(); updateStepAvailability();
        toast('Profile derived', 'success');
      }).catch(function (e) { LOG('YT error', e); toast(e.message, 'error'); })
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
        identity: { oneLiner: oneLiner, positioning: oneLiner, audienceHint: '', dna: '' },
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
      toast(autoFilled ? 'Profile saved · signals auto-filled per topic. Edit to add more topics.' : 'Profile saved. Edit to add more topics.', 'success');
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
      setStep(n > 1 ? 'consolidate' : 'generate');
    });
    var cn = $('#asg-cons-next'); if (cn) cn.addEventListener('click', function () { if (consBusy) { consThen = true; paintConsProg(); toast('Still consolidating. Generate opens when it is done.', ''); return; } setStep('generate'); });
    var cs = $('#asg-cons-stop'); if (cs) cs.addEventListener('click', function () { consStop = true; consThen = false; cs.disabled = true; setTimeout(function () { cs.disabled = false; }, 1500); toast('Stopping after the current group…', ''); });
    var cb0 = $('#asg-cons-back'); if (cb0) cb0.addEventListener('click', function () { setStep('feed'); });
    var cr = $('#asg-cons-run'); if (cr) cr.addEventListener('click', function () { runConsolidation(groupsFor(selectedList())); });
    var bc = $('#asg-back-cons'); if (bc) bc.addEventListener('click', function () { setStep(Object.keys(state.selectedStoryIds).length > 1 ? 'consolidate' : 'feed'); });
    $('#asg-generate-btn').addEventListener('click', function () { generateScripts(); });
    var stopB = $('#asg-stop-btn'); if (stopB) stopB.addEventListener('click', function () { if (genRun) genRun.stop(); });
    $('#asg-back-feed').addEventListener('click', function () { setStep('feed'); });
    $('#asg-back-generate').addEventListener('click', function () { setStep('generate'); });
    $('#asg-continue-video').addEventListener('click', function () { setStep('video'); });
    $('#asg-back-review').addEventListener('click', function () { setStep('scripts'); });
    $('#asg-continue-export').addEventListener('click', function () { setStep('publish'); });
    $('#asg-pub-skip').addEventListener('click', function () { renderExport(); setStep('export'); });
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
      if (!confirm('Start over?\n\nThis clears the current stories and scripts so you can begin a new run. Your profile and API keys stay. Videos you already made stay saved in this browser.')) return;
      state.scripts = []; state.stories = []; state.selectedStoryIds = {}; state.consGroups = []; state.consRes = {};
      persistScripts(); setStep('channel');
    });
    $$('.asg-open-settings').forEach(function (b) { b.addEventListener('click', openSettings); });
    $('#asg-settings-close').addEventListener('click', closeSettings);
    $$('.asg-set-tab').forEach(function (tb) {
      tb.addEventListener('click', function () {
        $$('.asg-set-tab').forEach(function (x) { x.classList.toggle('is-active', x === tb); x.setAttribute('aria-selected', String(x === tb)); });
        $$('.asg-set-sec').forEach(function (sec) { sec.hidden = sec.dataset.tab !== tb.dataset.tab; });
        var bd = $('.asg-drawer-body'); if (bd) bd.scrollTop = 0;
      });
    });
    $('#asg-settings-drawer').addEventListener('click', function (e) { if (e.target === this) closeSettings(); });
    $('#asg-set-provider').addEventListener('change', syncProviderFields);
    var stk = $('#asg-set-stock'); if (stk) stk.addEventListener('change', syncStock);
    var lb0 = $('#asg-lnk-learn'); if (lb0) lb0.addEventListener('click', learnFromLinks);
    var testBtn = document.getElementById('asg-test-gemini');
    if (testBtn) {
      testBtn.addEventListener('click', function () {
        var key = $('#asg-set-gemini').value.trim();
        if (!key) { toast('Paste a Gemini key first.', 'error'); testNote('gemini', 'Paste the key above first.', 'bad'); return; }
        var savedKey = state.settings.geminiKey, savedModel = state.settings.geminiModel, savedProv = state.settings.llmProvider;
        var gm = $('#asg-set-gemini-model');
        state.settings.geminiKey = key;
        if (gm && gm.value.trim()) state.settings.geminiModel = gm.value.trim();
        state.settings.llmProvider = 'gemini';
        var btn = this; btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Testing…'; testNote('gemini', 'Testing. This can take up to a minute while models are tried.', '');
        callLLM('Return strict JSON: {"ok": true, "msg": "hello"}', 'extract', { noFallback: true, noSticky: true })
          .then(function (r) { toast('✓ Gemini key works (model: ' + r.model + ')', 'success'); testNote('gemini', '✓ This key works. Answered by ' + r.model + '.', 'ok'); console.log('[ASG] test success:', r.model, r.text); })
          .catch(function (e) { toast('✗ ' + e.message, 'error'); testNote('gemini', '✗ ' + testWhy(e), 'bad'); console.error('[ASG] test fail:', e.message); })
          .then(function () {
            state.settings.geminiKey = savedKey; state.settings.geminiModel = savedModel; state.settings.llmProvider = savedProv;
            btn.disabled = false; btn.textContent = orig;
          });
      });
    }
    COMPAT_IDS.forEach(function (pv) {
      var tb = document.getElementById('asg-test-' + pv);
      if (!tb) return;
      tb.addEventListener('click', function () {
        var key = $('#asg-set-' + pv).value.trim();
        if (!key) { toast('Paste a ' + pv + ' key first.', 'error'); testNote(pv, 'Paste the key above first.', 'bad'); return; }
        var saved = { k: state.settings[pv + 'Key'], m: state.settings[pv + 'Model'], p: state.settings.llmProvider };
        state.settings[pv + 'Key'] = key; state.settings[pv + 'Model'] = ($('#asg-set-' + pv + '-model').value || '').trim(); state.settings.llmProvider = pv;
        var btn = this; btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Testing…'; testNote(pv, 'Testing. This can take up to a minute while models are tried.', '');
        callLLM('Return strict JSON: {"ok": true, "msg": "hello"}', 'extract', { noFallback: true, noSticky: true })
          .then(function (r) { toast('✓ ' + pv + ' key works (model: ' + r.model + ')', 'success'); testNote(pv, '✓ This key works. Answered by ' + r.model + '.', 'ok'); })
          .catch(function (e) { toast('✗ ' + e.message, 'error'); testNote(pv, '✗ ' + testWhy(e), 'bad'); })
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
      var mw2 = $('#asg-set-madewith'); if (mw2) state.settings.madeWith = !!mw2.checked;
      var fb2 = $('#asg-set-fallback'); if (fb2) state.settings.fallbackProviders = !!fb2.checked;
      var stg2 = $('#asg-set-strategy'); if (stg2) { state.settings.strategy = stg2.value || 'value'; discovered = {}; }
      var wb2 = $('#asg-set-writebest'); if (wb2) state.settings.writeBest = !!wb2.checked;
      var wm2 = $('#asg-set-gemini-write-model'); if (wm2) state.settings.geminiWriteModel = wm2.value.trim();
      state.settings.openaiKey = $('#asg-set-openai').value.trim();
      state.settings.deepseekKey = $('#asg-set-deepseek').value.trim();
      var sp2 = $('#asg-set-stock'); if (sp2) state.settings.stockProvider = sp2.value;
      var pxk2 = $('#asg-set-pixabay'); if (pxk2) state.settings.pixabayKey = pxk2.value.trim();
      var pek2 = $('#asg-set-pexels'); if (pek2) state.settings.pexelsKey = pek2.value.trim();
      COMPAT_IDS.forEach(function (pv) {
        var k = $('#asg-set-' + pv), m = $('#asg-set-' + pv + '-model'), w = $('#asg-set-' + pv + '-write-model');
        if (k) state.settings[pv + 'Key'] = k.value.trim();
        if (m) state.settings[pv + 'Model'] = m.value.trim();
        if (w) state.settings[pv + 'WriteModel'] = w.value.trim();
      });
      readLinks(); if (state.profile) persistProfile();
      persistSettings(); updateApiStatus(); closeSettings(); toast('Settings saved', 'success');
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#asg-settings-drawer').hidden) closeSettings(); });
  }
  function init() {
    if (!$('.asg-root')) return;
    loadState(); ensureModalStyle(); bind(); renderProfileBar(); updateCounters(); updateApiStatus();
    if (state.profile) {
      renderProfile(); updateStepAvailability();
      if (state.scripts.length) renderScripts();
    }
    LOG('ready v' + VERSION + (window.AUTONOM_ASG && window.AUTONOM_ASG.articleEndpoint ? ' · article endpoint on' : ' · article endpoint OFF (headline-only)'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
