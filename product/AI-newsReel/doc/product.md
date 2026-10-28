# Autonom Newsreel — Product Documentation

**File:** `product/newsreel/doc/product.md`
**Version documented:** v1.28.2
**Audience:** creators, newsletters, publishers, researchers, agencies, support.

---

## 1. Overview

Autonom Newsreel turns the day's news into finished, fact-checked short videos. You give it a topic — a channel profile with a voice and a set of signals — and it scans open publisher feeds and news aggregators for stories that match, reads the full articles behind them, extracts every fact with an exact quote, cross-checks a second outlet when one exists, and writes a 30–105 second script only from the facts that survived the checks. Then it synthesises the voice on your own computer, plans stock footage scene by scene, renders a vertical video with burned-in captions, and prepares a caption for every platform you publish to.

The differentiator in one sentence: **every fact in every script is tied to an exact quote from a source article, checked in code against that article, and audited sentence by sentence before you ever see the script.** No model is trusted to verify itself. The pipeline around the model is what makes the output publishable.

Newsreel is a browser tool. Your profile, scripts, API keys, and videos live in your browser; the only thing that touches a server is the article fetching and (optionally, for the site owner) the publish hand-off.

---

## 2. Who it's for

Four types of users get real value out of Newsreel, and the product is shaped around them.

**Solo commentary channels.** One person running a faceless news Shorts channel on YouTube, Instagram, or TikTok. They publish one to three videos a day and want to keep that cadence without a team. They have strong opinions about the news and no interest in building a video pipeline. What they need is a tool that turns their editorial instinct into a script they can trust, a voice, and a video — in minutes, not hours, and without taking chances with a number they cannot verify.

**Newsletters and publishers.** A small editorial team with a daily or weekly newsletter that already has an audience and needs to extend into video without hiring a video team. Their brand is the credibility; a wrong fact costs more than a missed post. They use Newsreel for the fact-check pipeline as much as for the video — the source-quoted facts and the audit trail are the point, and the video is what they make from a script they already trust.

**Researchers and analysts.** People who read the news professionally — policy analysts, journalists between beats, consultants, academics — and occasionally want to publish a take in video form without committing to the whole production cycle. They already know how to verify a fact; what they want is a tool that does not get in the way of that verification and does the assembly around it.

**Agencies producing a few videos a day.** Small creative or comms agencies running channels for clients. They need repeatability: the same voice, the same standards, the same fact-check on every script, across multiple channels with different profiles. The per-profile storage, the fact-tags, and the audit trail are what make it possible to hand the tool to a junior producer without the client's brand paying for their learning curve.

What Newsreel is not for: a channel that wants a hundred auto-generated videos a day with no editing, a creator who wants to record their own face and voice (the tool is built for faceless channels with synthesized voice), or anyone publishing in a language other than English today.

---

## 3. What problem it solves

Three failure modes show up in almost every AI news video tool. Newsreel is designed around the opposite of all three.

**Invented facts.** A model asked to write a news script will produce one, and in the process it will sometimes add a detail that was not in the source. Usually it is a small thing — a number rounded to a cleaner figure, a date shifted to the nearest week, a quote paraphrased into something the speaker did not say. The script reads fine because the invented detail is plausible, and it is wrong. The tool that produces this kind of error has no way for the user to know which sentences are supported and which are not.

Newsreel does not let the model write until the facts have been extracted, quoted, and checked. Each fact is a claim plus an exact quote from the article. If the quote is not in the article, the fact is dropped. If the claim says more than the quote (a rounded number, a dropped hedge, a name in the wrong place), the fact is rewritten to the quote's wording or dropped. The model never sees a fact it could not have quoted. The script is built from those facts, not from a paraphrase of the article.

**Sameness at volume.** A tool built on a single template produces a hundred videos that all sound the same. Same opening rhythm, same transitions, same call-to-action phrasing. The first three videos look like a channel; the next fifty look like a template with different names filled in. YouTube's algorithm and its viewers both notice, and the channel stops growing without anything specific to point to as the cause.

Newsreel writes each script from the story's own facts and the channel's own voice, not from a template. The opening line is chosen by the shape of the story (consequence, question, or hidden layer); the analysis section is written from the story's specifics, not from a bank of generic "what this means" phrases; the call-to-action is a question about this story, not about "the future of the region". The result is that two consecutive videos about the same topic still sound like two different stories, because they are.

**Hours of assembly.** Some tools get the accuracy right and the workflow wrong. The script is good, the fact-check is real, and then the user spends two hours per video stitching the voice, the footage, the captions, and the eleven platform uploads together by hand. The output is publishable, but the cost per video makes the channel uneconomical.

Newsreel does the assembly in the same session as the script. The voice runs on the user's computer (no upload, no per-character cost). The footage is planned per scene before the search, so most scenes get a clip on the first try. The captions are generated from the exact sentence timings the voice produced, so they sync on the first render. The platform captions are written in one call, in each platform's voice. The result is that the time between "this story is worth making" and "the video is on every platform" is minutes, not hours.

---

## 4. The eight-step workflow

Newsreel runs as a linear pipeline with eight steps. Each step has a specific job, and each one leaves the tool in a state the next step can use. You can jump back and forth, but you cannot skip a step and get a publishable video out of the end.

| # | Step | What it does | What you see |
|---|---|---|---|
| 1 | **Channel** | Define the profile: topics, voice, tone, format, duration. Optionally derive it from a YouTube channel's recent videos. | A form or a YouTube fetch, then a profile card with topics and signals you can edit. |
| 2 | **Feed** | Scan open publisher feeds and news aggregators for stories matching your signals. | A list of stories with source, age, readability tag, and a virality estimate. |
| 3 | **Consolidate** | Group stories that cover the same event; merge their facts into one tagged list. | Per-group cards showing outlets, merged facts, and the confidence tags. |
| 4 | **Generate** | Write each script from the tagged facts, with per-story options for length, angle, and opening. | A progress bar with the pipeline phases, then a script per story. |
| 5 | **Review** | Read and edit every script, then mark it reviewed. | Script cards with the full text, hooks, alternatives, and audit notes. |
| 6 | **Video** | Synthesise the voice, plan footage, render the video. | A per-script panel with narration, voice settings, a progress bar, and a finished MP4 or WebM. |
| 7 | **Publish** | Write the caption for each platform; post to Telegram and Mastodon directly; copy or share the rest. | A per-script panel with a caption per platform, a schedule field, and download/share buttons. |
| 8 | **Export** | Package everything for use outside the tool. | A ZIP with the scripts, videos, audio, captions, and upload details, plus a JSON manifest. |

### Channel

The Channel step is where the tool learns what kind of channel this is. You enter a name, a one-liner, a set of topics, a tone, and a target duration — or you give it a YouTube channel URL and it derives all of that from the channel's recent videos. The profile is stored per-browser, so you can have as many channels as you like and switch between them.

The step also lets you write (or have the tool suggest) the channel's "voice DNA" — a short paragraph describing how the channel sounds and what stance it takes. This paragraph is what makes two channels covering the same story not produce the same script. If you skip it, the tool writes in a generic news voice; if you fill it in, every script is written in yours.

### Feed

The Feed step is the only step that touches the outside world in bulk. It searches for stories that match your topic signals, using both open publisher feeds (BBC, Guardian, Al Jazeera, DW, NPR, Sky, Euronews, CBC, NYT, WSJ, and about thirty more) and news aggregators (GDELT, Bing News, Google News). Each story comes back with a source, an age, a readability tag (open, metered, paywalled, thin), and an estimate of how much demand similar Shorts have had on YouTube. The list is sortable by match quality, virality, or freshness.

The readability tag is the most important column. A paywalled story can be a topic signal, but it cannot be a source — the tool will not write a script from an article it cannot read. If you try, it will search for an open outlet covering the same event; if it finds one, it will write from that instead; if it does not, the story is skipped. It is not a failure; it is the tool refusing to guess.

### Consolidate

The Consolidate step is what most tools skip, and what makes the script on the other side trustworthy. Stories that cover the same event are grouped, and each outlet's article is read, its facts extracted with quotes, and then those facts are merged into one list. Each fact is tagged with which outlet reported it, which outlets confirmed it, and which outlets differ. The user can move a story between groups, or let it stand alone, before consolidating.

The output of this step is not a script. It is a fact list, and it is the foundation the next step writes from. A fact both outlets report is stronger than a fact only one does, and the script will reflect that — it can state a confirmed fact plainly, has to attribute a single-source fact to its outlet, and has to name both versions of a disputed fact or leave it out. That is what "consolidate" means in practice: turn four articles into one honest fact set.

### Generate

The Generate step is where the model earns its keep. Given the tagged facts, the channel's voice, and the story's shape, the model writes a script — hook, body, optional analysis, call-to-action — that the pipeline then checks, revises, and audits. The step shows you progress at every phase: extracting facts, verifying quotes, comparing outlets, writing, auditing.

The step also exposes the options that change the shape of the script: length (chosen automatically from the article's material, or fixed by hand), angle (analysis of the situation, contrarian read, plain-language explainer, winners-and-losers, skeptic's check, what-to-watch), opening style (event-first, question, contrast), and whether to include the analysis section at all. These are not cosmetic choices; they change the sentence that gets written, and they are the difference between a script that sounds like the channel and a script that sounds like a wire reporter.

### Review

The Review step is the one that most tools hide and the one that decides whether you can publish the script with your name on it. Every script card shows the full text, the facts it was built from with their quotes, the two alternative hooks, the audit flags (if any), the source-quoted corroboration status, and the model that wrote it. You can edit every field. When you are done, you mark the script reviewed.

The pipeline catches what a machine can catch: an invented quote, a number that is not in the source, a dropped hedge, a forecast the source did not make. It cannot catch a source that is wrong, an angle you disagree with, or a framing that is technically supported and still misleading. That is why the Review step exists and why it is not skippable. The tool shortens the read; it does not remove it.

### Video

The Video step is what most users came for. Pick a voice and a speed; the voice synthesises each sentence on your computer, concatenates with a fixed pause, and returns exact caption timings. The scene planner decides for each sentence whether it needs footage or a plain card, writes a search query for the ones that need footage, and searches your stock library (Pixabay or Pexels) for a clip. The renderer composes the canvas in real time, records it with audio, and hands back a finished file — MP4 in Chrome or Edge, WebM elsewhere.

The whole step runs in your browser. Nothing is uploaded, no video is stored on a server, no per-render cost. A 45-second video takes roughly 45 seconds to record (plus a few seconds for voice synthesis and footage search); a 60-second video takes about 60 seconds. That is the real-time render caveat stated plainly: the tool does not use ffmpeg, so it cannot render faster than real time. The trade is that it does not need a server to render, which is why the tool stays free.

### Publish

The Publish step is where the video meets the platforms. For each platform you publish to — YouTube, Instagram, Facebook, TikTok, X, LinkedIn, Threads, Bluesky, Telegram, Rumble, Mastodon — the tool writes a caption in that platform's voice, within its character limit, with the right number of hashtags. Telegram and Mastodon can be posted to directly (both have open APIs that accept a video upload from a user's own token). The others need a copy-paste or a phone share: the tool gives you the caption, the download link, and (where the platform supports it) a share URL that opens the app with the caption already filled in.

Each video also has a schedule field. When you set a time, the tool stores it with the script and shows it on the card. Scheduling is per-video, not per-platform; if you want to post on Tuesday at 9am on YouTube and 2pm on Instagram, that is a manual decision each time, and the tool does not pretend otherwise. The native schedulers on each platform are usually better than a third-party tool for this, and the tool's job is to give you the caption; the timing is yours.

### Export

The Export step is what makes the tool useful even after you stop using it. Download everything (ZIP): one folder per short with the script, narration text, voice WAV, captions SRT, video file, and upload details (title, description, tags, pinned comment). Download JSON: the exact manifest the tool would send to an external renderer or webhook. Download TXT: a human-readable bundle. Copy all: everything to the clipboard.

The point of this step is not to be a fallback for the browser version. It is to make the tool honest about its output: the videos are yours, in standard formats, in a folder you control. Nothing about the tool is designed to lock you in.

---

## 5. How facts are kept honest

The fact-check pipeline has eight steps, and every script that reaches the Review step has passed through all eight. The steps are not independent; each one is designed to catch a specific class of error, and skipping any of them would let that class through.

**Step 1 — Extract with a quote.** The model is given the article text and asked to return 8–12 facts. Each fact is two things: a plain-sentence claim, and an exact quote from the article that proves it. If the quote is missing, or under about eight words, the fact is dropped before any other step runs. The model cannot contribute a fact it could not quote.

**Step 2 — Verify the quote against the article.** The article text is normalised (whitespace collapsed, curly quotes straightened, dashes converted), and the quote is searched for inside it as a plain substring. This is code, not a model judgement. If the quote does not appear, the fact is dropped. A model that hallucinated a quote cannot survive this step, because the article is the referee.

**Step 3 — Verify the claim against the quote.** A quote can be real and still be misused. The claim's numbers have to appear in the quote (a number in the claim that is not in the quote is a straight mismatch). The claim's wording cannot be stronger than the quote's — a small dictionary of words (`justified`, `unlawful`, `criminal`, `proven`, `responsible`, `deliberate`, `crippled`, `collapse`, `effectively`, `solely`) is checked for that specific overreach. A named speaker at the start of the claim has to appear in the quote. Any fact whose claim says more than the quote is rewritten to the quote's wording or dropped.

**Step 4 — Corroborate with a second outlet.** The tool searches open publisher feeds for another outlet reporting the same event, reads that article, and asks a model to compare it fact by fact against the first. Then it runs the same mechanical checks against the second outlet's quotes before it trusts the comparison. Each fact comes out tagged: *confirmed by both*, *only outlet A reports this*, *they differ*, or *possible difference* when the model is not sure the two are saying incompatible things. A conflict is not resolved by the tool; it is surfaced so the script can respect it, either by naming both versions or by leaving the point out.

**Step 5 — Write the script.** Only now does the model write. It sees the tagged facts, and it sees what each tag means: which facts it can state plainly, which it has to attribute to a named outlet, and which it has to leave out. It writes in the channel's voice, in the opening formula the story's shape calls for, at the length the article's material supports. The model is a writer at this step; the facts are already decided.

**Step 6 — Code checks against the article.** Every number in the script has to appear in the source. Every capitalized name has to appear in the source. Qualifiers ("up to", "around", "reportedly") have to be preserved. Forecasts the source did not make ("will", "likely") are flagged. Attribution to "analysts" the source never mentioned is flagged. Sentences over twenty-eight words are flagged as too long for a Short. A script that fails any of these is sent back for revision.

**Step 7 — Audit every sentence.** A second model reads the script sentence by sentence against the quotes and flags what it finds: a sentence that says more than the quote, a cause the source did not state, an inference presented as fact, a hedge that went missing, an outlet's inference credited to a named person. Each flag comes with a suggested fix. If more than one sentence is flagged, the script is rewritten once, re-checked, and re-audited. If the second pass still fails, the user sees the flags and decides.

**Step 8 — Repair what can be repaired.** If the analysis section (the part written from the model's own knowledge, not the source) gets flagged for numbers, names, or repeated facts, it is rewritten once with the flags as feedback, re-audited, and either accepted or removed. This is the step that catches the small class of errors the audit found but the rewrite alone did not fix.

### What the pipeline will not do

The pipeline is honest about what it cannot do, and the list is not short. It cannot verify the article itself — if a publisher reports a number that later turns out to be wrong, the script repeats it, accurately attributed, with a quote that proves where it came from. It cannot resolve a conflict between outlets — it surfaces the conflict and lets the user decide. It cannot catch framing — a script that passes every check and still misleads because of which facts were selected and which were left out is a script that passed every check. It cannot rescue a thin source — an article that only supports two facts will not produce a publishable script, and the tool will say so rather than pad. It cannot hear the story in the room — no pipeline reading an article can know what the people close to the event are saying, and no tool replaces reading what you publish.

The pipeline shortens the review; it does not remove it.

---

## 6. The video studio

The video studio is where the script becomes a video. It runs entirely in the browser, in real time, with three features that matter.

**Voice.** The tool ships with the Kokoro-82M open voice model, running locally. Three voices are built in (`am_echo` for a lower-pitched neutral register, `am_liam` for a warmer higher register, `af_heart` for a slower female voice), and around fifty more can be loaded from the model's full voice set with one click. Speed is adjustable from 0.7 to 1.3. The voice synthesises one sentence at a time and concatenates with a fixed 150-millisecond gap, which is what makes it sound like a person reading instead of a TTS engine running a block of text. Because each sentence is synthesised separately, the captions land on the exact syllable the voice is speaking — this is the difference between a video that feels professionally edited and one that feels AI-generated.

**Footage.** The scene planner reads the script with the story's title and the channel's voice, and for each sentence decides: footage or card. A concrete sentence (an event, a place, a machine, a crowd, an object) gets footage. An abstract sentence (an opinion, a statistic, a question, the closing call-to-action) gets a plain caption card. For footage scenes, the planner writes a verb-noun search query (not a topic), plus an alternate query, and the tool searches Pixabay or Pexels for a clip. The planner avoids names and abstract words because stock libraries do not have footage of specific events — a clip of a missile launch is not footage of the missile that hit the hospital, and the tool is honest about that. Every scene that has footage carries an illustrative-footage label by default, which says on every frame that this is not footage of the event.

**Render.** The renderer composes the canvas in real time: the clip (or the plain background), the burned-in captions, the headline banner in the first three seconds, the key-fact callouts at the moment their phrase is spoken, the end card, the illustrative label when footage is on. It captures the canvas with `captureStream(30)`, captures the audio from a Web Audio destination, and records both with `MediaRecorder`. The format is MP4 in Chrome and Edge, WebM elsewhere, chosen by trying codecs in order of encoder support. The render is real-time: a 45-second Short takes about 45 seconds to record, plus a few seconds for voice and footage. That is a limit, not a feature; the tool does not use ffmpeg, which is why it stays free and serverless.

### What you get out

For each video: an MP4 or WebM file, a WAV of the voice track, an SRT of the captions, and a text file with the title, description, tags, and pinned comment ready for the upload form. The files are stored in the browser (IndexedDB), so you can close the tab and come back; they stay until you delete them or clear browser data. The Export step bundles them into a ZIP folder per short.

### What you can edit before and after

The narration text is editable in the video panel before rendering — if the script has a phrase that will read badly aloud, you can fix it there without going back to the script card. The scene plan is editable after the video is made — change a search query, turn a footage scene into a card, re-record the video (the voice is cached, so it does not need to be re-synthesised). The upload details are editable in the result panel — change the title, the description, the tags, the pinned comment, and re-download.

---

## 7. Publishing reality

Newsreel writes a caption for every platform you select: YouTube, Instagram, Facebook, TikTok, X, LinkedIn, Threads, Bluesky, Telegram, Rumble, Mastodon. Each caption is written in that platform's length, hashtag convention, and tone — a TikTok caption is a second hook, an Instagram caption is a companion read after the video, a LinkedIn caption is a professional framing, an X caption is the whole post. The tool does this in one call, from the same story facts, so the same story reaches all eleven platforms in eleven different sentences.

**Two platforms can be posted to directly.** Telegram and Mastodon both have open APIs that accept a video upload from a user's own token. If you set up a Telegram bot token and a channel name, or a Mastodon instance and an access token, the tool can send the finished video and its caption straight to the channel. No download, no copy-paste, no separate uploader.

**The other nine need a copy-paste or a phone share.** YouTube, Instagram, Facebook, TikTok, X, LinkedIn, Threads, Bluesky, and Rumble do not accept video uploads from a browser session without an approved developer app. The tool gives you the caption, the download link, and (where the platform supports it) a share URL that opens the app with the caption already filled in. On a phone, the browser share sheet can send the finished MP4 straight to Instagram, TikTok, or YouTube, with the caption pre-filled by the platform's own share intent.

**Native schedulers, not a scheduler.** Each platform has its own scheduling, and it is usually better than a third-party scheduler for that platform's own algorithm: YouTube Studio for YouTube, Meta Business Suite for Facebook and Instagram, TikTok Studio for TikTok, the composer for LinkedIn, the web composer for X. The tool does not replace these; it gives you the caption and the video, and you schedule on the platform. The publishing step stores a schedule per video, but that schedule is a note for you, not an automated post.

### Owner-only hand-off (not part of the public browser release)

The site owner can optionally forward a finished video and its captions to their own automation (Make, n8n, Zapier) through a capability-gated relay on this site. It requires a WordPress login with upload rights, so it is not reachable from the free tool. It has not yet been verified in production. Treat it as an internal tool, not a feature of the public browser release. The video it hosts is deleted after three days, and the relay is the only thing on the Autonom server that ever stores a user's video.

---

## 8. Privacy and data

The browser tool is designed to keep as much as possible on your computer, and to be honest about the parts that do not.

**What stays in your browser.** Your profile, scripts, videos, API keys, and settings are stored in browser storage (localStorage for text, IndexedDB for videos). Keys are saved unencrypted in localStorage. No Autonom account, no Autonom database, no Autonom login.

**What the site server sees.** Article fetching happens server-side (publisher RSS feeds, article text, GDELT, Bing News, Google News), because the browser cannot read most publisher pages directly. The server caches articles for up to 6 hours, feeds for 10 minutes, and news search results for 10 minutes. Nothing about you is logged; the server only knows which article URLs it was asked to fetch, and the rate limits are per IP.

**What third parties see.** AI calls go from your browser directly to the provider you picked (Google, OpenAI, DeepSeek, Groq, OpenRouter, or NVIDIA), using your own API key. Some providers (Groq, OpenRouter, NVIDIA) sometimes refuse browser calls; when that happens, the request is forwarded through the site server for that call only, and the server passes your key along without storing or logging it. Stock footage downloads are relayed the same way. The Gemini API key is sent directly from the browser to Google.

**What is stored on the server.** Only one thing, and only if the site owner uses the owner-only hand-off: the finished video, at a public unguessable URL, deleted after three days. Users of the free browser tool cannot reach this endpoint.

**What you can verify.** Open DevTools, watch the network tab, and check every outbound call. The privacy drawer on the tool page lists every endpoint the tool talks to; the DevTools check is the proof. There is no Autonom telemetry, no analytics pixel on the tool page, and no tracking of what you generate.

---

## 9. What you need to start

The minimum is one AI API key. Everything else is optional and makes the tool better.

**Required: one AI provider key.** Gemini (from aistudio.google.com), Groq (from console.groq.com), OpenRouter (from openrouter.ai — free-tier models only unless you add credits), NVIDIA NIM (from build.nvidia.com), OpenAI (from platform.openai.com), or DeepSeek (from platform.deepseek.com). All six have free tiers that are sufficient for a handful of videos a day. You do not need to pay Autonom anything.

**Optional: a YouTube Data API key.** Unlocks two things: deriving a channel profile from recent videos (name, topics, cadence, and best-performing titles), and scoring story demand using real view counts of similar Shorts from the last thirty days. Without a key, the tool uses an estimate from coverage and freshness instead.

**Optional: a stock footage key.** Pixabay (from pixabay.com/api/docs) or Pexels (from pexels.com/api), both free. Without one, videos render with a plain dark background and big captions — a perfectly usable style, just less visual.

**Optional: Telegram and/or Mastodon tokens.** For direct posting. Without them, you download the video and copy the caption like the other platforms.

**Costs.** Your API usage, not Autonom's. On a free Gemini or Groq tier, a day of five or ten videos costs nothing. On a paid tier, the cost of ten short scripts, extractions, audits, and cross-checks is roughly a few cents per video. The voice is free (it runs locally). The stock library is free. The only recurring cost is the AI provider, and it is yours to control.

---

## 10. Comparison table

Here is how Newsreel compares to the tools it gets compared to. The comparison is honest about the trade — none of these alternatives is bad at what it does; they are bad at what Newsreel does.

*Note: the exact 8-row table on the live tool page is the canonical version of this section. The rows below reflect the same comparison categories; when the live table is available, this section should be replaced with it, row for row.*

| Compared to | How it is different | What it gives up |
|---|---|---|
| **AI script generators** (ChatGPT, Claude, Gemini, prompted directly) | Newsreel is a pipeline around the model, not the model itself. The model writes only from facts it could quote; the checks are code, not the model verifying itself. | The freedom of open prompting. Newsreel does not write essays, poems, or non-news content. |
| **News summarizers** (article-to-bullet tools) | Newsreel reads the full article, extracts facts with quotes, and cross-checks a second outlet. A summarizer compresses; Newsreel verifies. | Speed. A summarizer returns in seconds; Newsreel takes a minute or two per story. |
| **Video template tools** (CapCut templates, Canva video, Pictory) | Newsreel is built for news, not for generic templates. The scene plan decides per sentence what should be on screen; a template decides once for the whole video. | Design flexibility. A template tool gives you a beautiful layout; Newsreel gives you a news-shaped one. |
| **Manual workflows** (a scriptwriter, a voice actor, a video editor) | Newsreel does the same steps in one session for zero marginal cost. | Human judgement at every step. A writer catches framing a pipeline cannot; a voice actor interprets a line a TTS voice reads. |
| **Hire a freelancer** (per-video cost) | Newsreel is free per video after your API keys. | The freelancer's editorial judgement, their reliability, their willingness to take responsibility for a wrong fact. |
| **Fully autonomous agents** (auto-post with no review) | Newsreel does not post without a human review of every script. It prepares, it flags, it does not decide. | The speed of a fully autonomous loop. Every video goes through Review. |
| **TTS services** (ElevenLabs, PlayHT, Google TTS) | Newsreel's voice runs on your computer, not on their servers. No upload, no per-character cost, no third party in the audio path. | Voice quality. A paid TTS service has voices Newsreel does not; Newsreel's voice is good enough for news and free. |
| **Third-party schedulers** (Buffer, Later, Hootsuite) | Newsreel writes the caption per platform; the scheduler posts it. | The scheduler's cross-platform queuing. Newsreel does not replace a scheduler; it feeds one. |

The pattern across the table is that Newsreel is not trying to be the best at any one step. It is trying to be the only tool that does all eight steps in one session, honestly, without charging for the parts it does not do.

---

## 11. Fit and YouTube policy

Newsreel fits a channel that wants to publish a small number of well-made videos per day, without a team, without sacrificing the credibility that makes a news channel worth following. It does not fit a channel that wants to publish a hundred videos a day with no editing, because the tool is designed to make that pattern impossible on purpose.

Staying on the right side of YouTube's inauthentic-content rules is mostly a matter of four habits, and Newsreel is shaped around them.

**Edit every script.** Not "read it" — edit it, even if the edit is small. The Review step exists because the pipeline cannot catch a source that is wrong or a framing that is unfair, and because a published script that has been touched by a human is a script the channel is responsible for. The tool's job is to make that edit short; your job is to make it happen.

**Publish fewer, better videos.** The channels that get hit hardest by YouTube's <a href="https://support.google.com/youtube/answer/1311392">inauthentic content policy</a> are the ones that treat volume as the strategy. One to three edited Shorts a day will do more for the channel than ten mediocre ones, and will not draw the policy's eye. Newsreel makes the "fewer" part easy by making each video take minutes instead of hours; it does not make the "better" part automatic, because better is your job.

**Add your own angle.** A story that anyone could have written is a story that reads as mass-produced, no matter who wrote it. A story with a specific read on it — a why, a who-benefits, a what-is-missing — is a story that reads as a channel. The analysis section of the script is where that angle lives; it is written from the model's knowledge but checked against the article's facts, and it is editable before you render.

**Use the AI disclosure setting where it applies.** YouTube asks creators to disclose realistic synthetic content. An AI voice reading a news script is not what the policy is about, but a re-created event or an AI-generated face is. Disclosing is not a penalty; failing to disclose when you should have is.

The policy is not the enemy. It is a description of the failure mode the tool is designed around. A channel that edits every script, publishes fewer videos, and adds a specific angle is a channel the policy has nothing to say about.

---

## 12. FAQ

These 15 questions are the live tool page's FAQ, reproduced verbatim so users see the same answers here as on the site. If the tool page's FAQ changes, this section must be updated to match.

**1. What is Autonom Newsreel?**
Autonom Newsreel is a browser-based tool that turns live news into YouTube Shorts. It scans publisher feeds against your channel profile, reads the full article, writes an analytical script where every fact is tied to a quote from the source, and renders a captioned video with an in-browser voice and stock footage. You review everything before anything is posted.

**2. How does Autonom Newsreel turn news into a Short?**
It works in eight steps: Channel, Feed, Consolidate, Generate, Review, Video, Publish and Export. It learns your channel, scans news, groups stories about the same event, writes and fact-checks a script from the full article, lets you edit it, builds the captioned video in your browser, prepares captions for each platform and exports a ZIP.

**3. Is Autonom Newsreel free?**
The tool is free to use, needs no account and adds no watermark. You bring your own API keys, so any cost comes from your plans with AI and footage providers, not from Autonom. Check each provider's current terms and limits.

**4. Does it make up facts?**
It is built not to. Each fact is extracted with a quote from the article, compared against that quote, and checked for numbers and names missing from the source. If there is no readable article, the story is skipped. It cannot tell you whether the article itself is correct, so read each script before you publish.

**5. Which AI providers does it work with?**
Google Gemini, Groq, OpenRouter, NVIDIA NIM, OpenAI and DeepSeek. You use your own key. Autonom discovers the models available to that key instead of hardcoding names, and falls back to another model when one is rate limited. *(Note: the live tool page currently shows "Google Google Gemini" in this answer — a duplicated word. Fix the visible page and its JSON-LD FAQPage block together, since Google's validator expects schema text to match visible text.)*

**6. Do I need an account or to install anything?**
No. Autonom Newsreel runs in a modern desktop browser with no sign-up and no install. Your profile, scripts, finished videos and keys are stored in your own browser. Use recent Chrome or Edge on a desktop for video.

**7. Is my data and are my API keys private?**
Your profile, scripts, videos and keys are stored in your browser only, unencrypted, so use it on your own device. Some requests, such as news search, article fetching and a few provider or footage calls, pass through this website's server, which forwards them and keeps only a short cache of public articles. Your scripts and keys are not saved on it.

**8. Can it post or schedule videos for me?**
It can post to Telegram channels and Mastodon directly from your browser with your own tokens, and it writes a tailored caption for 11 platforms. Instagram, Facebook, TikTok, X and LinkedIn require approved apps or paid posting services, so for those you download the package or use an automation tool. Direct YouTube upload is not supported today.

**9. Will YouTube demonetize AI-made Shorts?**
YouTube's policy targets repetitive, mass-produced content with no original input, not AI assistance as such. Channels that add their own angle, edit every script and publish at a human pace are the opposite of that. Policies change, so read YouTube's current rules and use the AI disclosure setting where it applies.

**10. How is it different from other AI Shorts generators?**
Most topic-to-script generators write from a headline or the model's memory and verify nothing. Autonom Newsreel requires a readable source, ties each fact to a quote, skips stories it cannot read, groups the same event from several outlets into one script, and keeps your data in your browser. It checks that a script matches its article, not that the article is true.

**11. Why was my story skipped?**
Usually because the article is paywalled, blocked or only an aggregator link. Autonom first searches open outlets for the same event and writes from that article, and says so on the card. If none is found, it skips the story rather than writing from the headline.

**12. Is the voice good enough for YouTube?**
The built-in neural voices are clear and natural enough for short news explainers, with several voices and speeds. They are not a human recording. If you prefer your own voice, export the script and SRT captions and record it yourself.

**13. Where does the footage come from, and can I use it?**
From Pixabay or Pexels, through your own key. Both licenses generally allow free use in videos, with their own conditions, so check each provider's terms. Credits are included in the export. Where footage would mislead, the tool uses a clean text card instead.

**14. How long does a video take, and what format is it?**
Video is recorded in real time, so a 60 second Short takes about a minute to render. In recent Chrome the file is MP4. Other browsers may produce WebM, which several platforms refuse, so use Chrome or Edge on a desktop.

**15. Does it work on my phone, or in languages other than English?**
You can review scripts on a phone, but the video studio downloads a voice model and renders in real time, so use desktop Chrome or Edge for video. Scripts and voices are tuned for English today. Other languages are not supported yet.

---

## 13. Limitations

The list below is the honest version. Every limit is stated; none is hedged.

- **Cannot verify the article itself.** If the source reports a wrong number, the script repeats it, with a quote that proves where it came from.
- **Cannot resolve a conflict between outlets.** It tags the conflict, shows both versions, and leaves the decision to you.
- **Cannot catch framing.** A script that passes every check can still mislead because of which facts were selected and which were left out.
- **English only today.** The voice, the feeds, the prompts, and the platform conventions are all English.
- **Real-time render.** A 45-second Short takes about 45 seconds to record; a 60-second Short takes about 60. No ffmpeg, no server render, no speed-up.
- **Phone is review-only.** Video rendering is designed for a desktop browser. The render on a phone is slow and sometimes WebM.
- **Free API tiers rate-limit.** Gemini, Groq, OpenRouter, and NVIDIA all rate-limit on free tiers. The tool handles it with backoff and fallbacks, but on a busy hour it can take longer per video than on a quiet one.
- **Some AI providers need the site relay.** Groq, OpenRouter, and NVIDIA sometimes refuse browser calls; when they do, the request goes through the Autonom server, which passes the key along without storing it. This is a routing fallback, not a bug.
- **No automatic posting to YouTube, Instagram, TikTok, X, LinkedIn.** Those platforms require an approved developer app to accept a browser upload. Telegram and Mastodon post directly; the rest need a copy-paste or a phone share.
- **Stock footage is illustrative, not event footage.** A clip of a missile launch is not footage of the missile that hit the hospital. Every scene with footage carries an illustrative label by default, and the label is the honest version.

---

## 14. Roadmap (not yet built)

No public roadmap. Features ship when they're verified.
