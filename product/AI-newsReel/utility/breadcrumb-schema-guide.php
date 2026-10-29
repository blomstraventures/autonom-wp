/**
 * Autonom · Newsreel — Schema markup
 * One array key per guide page URL. Add a new block when you add a new guide page.
 * The FAQ entries below match the visible FAQ section on each page exactly.
 * URL keys are exact paths, no trailing slash. When you rename a page, rename its key.
 *
 * Paste this whole file into a WPCode snippet of type "PHP Snippet", set to site-wide header.
 * Requires WordPress (for wp_json_encode) and the permalinks structure that serves
 * /guide/ai-news-to-shorts/ and its spokes as WordPress pages.
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_head', 'autonom_newsreel_schema', 20 );

function autonom_newsreel_faq_item( $q, $a ) {
    return array(
        '@type'          => 'Question',
        'name'           => $q,
        'acceptedAnswer' => array(
            '@type' => 'Answer',
            'text'  => $a,
        ),
    );
}

function autonom_newsreel_article( $headline, $description, $path ) {
    $url = 'https://autonom.app' . $path . '/';
    return array(
        '@context'         => 'https://schema.org',
        '@type'            => 'Article',
        'headline'         => $headline,
        'description'      => $description,
        'author'           => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app/' ),
        'publisher'        => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app' ),
        'mainEntityOfPage' => $url,
    );
}

function autonom_newsreel_schema() {
    if ( is_admin() || is_feed() ) {
        return;
    }

    $path = rtrim( parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH ), '/' );

    $schemas = array(

        /* ============================================================
         * Pillar
         * ============================================================ */
        '/guide/ai-news-to-shorts' => array(
            autonom_newsreel_article(
                'AI News to Shorts: The Complete Guide to Fact-Checked News Videos',
                'Learn how to turn live news into fact-checked YouTube Shorts. Source-quoted scripts, built-in voiceover, matched footage, multi-platform publishing.',
                '/guide/ai-news-to-shorts'
            ),
            array(
                '@context'   => 'https://schema.org',
                '@type'      => 'FAQPage',
                'mainEntity' => array(
                    autonom_newsreel_faq_item(
                        'What is the best AI news to shorts tool?',
                        'There is no single best tool, because the tools do different things. The question is what you want from the tool: a script you can trust (which requires a real fact-check pipeline), a video assembled without hours of work (which requires a voice and footage pipeline), or a caption for every platform (which requires a publishing step). A tool that does all three is what this guide is about. A tool that does one of them well and the others badly is a tool that costs you more time than it saves.'
                    ),
                    autonom_newsreel_faq_item(
                        'Can I turn news into YouTube Shorts without showing my face?',
                        'Yes, and this is what most news channels do. A faceless news channel is one where the voice carries the channel and the video is composed of footage, captions, and callouts rather than a person on camera. The workflow this guide describes is built for that case. The voice is the channel\'s identity, the footage is illustrative, and the script is what the channel is actually publishing.'
                    ),
                    autonom_newsreel_faq_item(
                        'Is AI-generated news content allowed on YouTube?',
                        'Yes, with caveats. YouTube\'s inauthentic content policy targets mass-produced, repetitive content, content that misleads viewers about what is being shown, and undisclosed impersonation — not the use of AI in general. A fact-checked news Short with an AI voice, edited by a human, published at a normal pace, is allowed. A thousand Shorts published in a day, none of them edited, is not. The rule is not about the tool; it is about the editing and the volume.'
                    ),
                    autonom_newsreel_faq_item(
                        'How do I fact-check a news script for a Short?',
                        'Start with the quote. For every fact in the script, ask for the exact sentence from the article that proves it. If the tool cannot show you the quote, it has no proof — it has a summary. Then check the quote against the article (the string comparison is mechanical, and you can do it in a text editor in seconds). Then check the claim against the quote: numbers, qualifiers, wording, and any named speaker. If a claim says more than the quote, the claim is wrong, regardless of whether the article "basically" says it.'
                    ),
                    autonom_newsreel_faq_item(
                        'How long should a news Short be?',
                        'Thirty to sixty seconds is the range that works for most stories, with 45 seconds as a default. Under 30 and the story cannot be told; over 60 and the audience drops. The right length depends on the story: a single fact fits in 30 seconds, a multi-outlet story with a background needs 60, and a 105-second Short is a format that works only for a very few stories that genuinely need it. The script\'s word count is the constraint — at about 2.5 words per second, a 45-second Short is about 110 words of narration.'
                    ),
                    autonom_newsreel_faq_item(
                        'Do I need a stock footage subscription for news Shorts?',
                        'No. Pixabay and Pexels both have free tiers that are sufficient for the generic establishing shots a news Short needs, and both allow commercial use without attribution for most clips. Search for a shot, not a topic. A clip of a missile launch is not footage of the strike, even if it looks dramatic. An establishing shot of a warship underway, labelled as illustrative, is the right choice for a story about a warship.'
                    ),
                    autonom_newsreel_faq_item(
                        'What is the difference between an AI news video generator and a fact-checked news pipeline?',
                        'A generator produces a video. A pipeline produces a video you can defend. The generator takes a headline and returns a video file; the pipeline takes a headline, reads the article, extracts the facts with quotes, verifies the quotes against the article, cross-checks a second outlet, writes the script from the tagged facts, audits the script sentence by sentence, and only then assembles the video. The output looks similar at first glance. The difference is what happens when the source is wrong, the model hallucinates, or the two outlets disagree — the generator ships the error, the pipeline flags it.'
                    ),
                    autonom_newsreel_faq_item(
                        'How many Shorts should I publish per day?',
                        'One to three, edited, is the range that most channels do best with. The temptation is to publish more, because the tool makes it easy and because the algorithm rewards volume in the short term. The problem is that volume without editing produces the exact content pattern YouTube\'s inauthentic content policy targets, and the algorithm\'s short-term reward is followed by a long-term collapse in reach. A channel that publishes one edited Short a day for a year will outperform a channel that publishes ten unedited Shorts a day for three months.'
                    ),
                    autonom_newsreel_faq_item(
                        'Can I use the same voice and footage for every video?',
                        'Yes, and you should — for the voice. The voice is the channel\'s identity; changing it per video reads as inconsistent. For the footage, you want a consistent visual style but not the same clip twice. Autonom keeps the voice consistent by default (one voice setting per channel) and avoids repeating footage by tracking which clips have been used in a session. What you should not keep the same is the script template — the same opening rhythm, the same transitions, the same call-to-action phrasing.'
                    ),
                ),
            ),
        ),

        /* ============================================================
         * Spoke 1 — Fact-checked scripts
         * ============================================================ */
        '/guide/ai-news-to-shorts/fact-checked-scripts' => array(
            autonom_newsreel_article(
                'Fact-Checked AI Scripts: How to Write News Shorts Without Inventing Facts',
                'AI writes fluently and verifies nothing. Learn how fact-checked AI scripts tie every claim to a source quote.',
                '/guide/ai-news-to-shorts/fact-checked-scripts'
            ),
            array(
                '@context'   => 'https://schema.org',
                '@type'      => 'FAQPage',
                'mainEntity' => array(
                    autonom_newsreel_faq_item(
                        'Can AI write a news script without inventing facts?',
                        'Not on its own. A model asked to write a news script will sometimes add a plausible-sounding detail that was not in the source. What makes a script safe is the process around the model: extract with quotes, verify the quotes against the article, verify the claims against the quotes, and rewrite anything that fails. The model is a writer; the checks are what make the writing trustworthy.'
                    ),
                    autonom_newsreel_faq_item(
                        'What does "fact-checked" actually mean in an AI script tool?',
                        'It should mean at least three things: every claim in the script is tied to an exact quote in a source, the quote was checked against the article (not just taken on the model\'s word), and the claim says no more than the quote. If a tool uses the phrase and cannot show you the quote, the phrase is marketing. Ask the tool to show its work — the quotes, the tags, and the sentences the audit removed.'
                    ),
                    autonom_newsreel_faq_item(
                        'Do I still need to review an AI script before publishing?',
                        'Yes. The pipeline catches what a machine can catch: an invented quote, a number that is not in the source, a hedge that went missing, a forecast the source did not make. It cannot catch a source that is wrong, an angle you disagree with, or a framing that is technically supported and still misleading. Read every script once before you publish. The tool shortens that read; it does not remove it.'
                    ),
                    autonom_newsreel_faq_item(
                        'What happens when the source article is wrong?',
                        'The script will repeat the error, accurately attributed. This is a limit worth stating plainly: no fact-checking pipeline can verify the article itself. If a publisher reports a number that later turns out to be wrong, the script is wrong in the same place, with a quote that proves where it came from. That is why the tool shows you the source, why a second outlet matters, and why the human read is still on you.'
                    ),
                    autonom_newsreel_faq_item(
                        'How long does fact-checking a script take?',
                        'Longer than writing one without checks, which is the point. On a free API tier, plan on one to two minutes per story. Most of that is the model writing the script and the audit reading it back. The code checks (quotes, numbers, names, qualifiers) are instant. If you are publishing a handful of videos a day, the time is well spent: a script you have to rewrite costs more than a script you waited for.'
                    ),
                    autonom_newsreel_faq_item(
                        'Does fact-checking work for non-English sources?',
                        'Today, Autonom Newsreel is English-only. The pipeline is language-agnostic in principle — the quote check is string comparison, the claim check is a model reading in whatever language it was given — but the prompts, the feeds, and the voice are all English. If you are working in another language, check whether the tool you are using supports it; do not assume the same checks apply.'
                    ),
                ),
            ),
        ),

        /* ============================================================
         * Spoke 2 — Source quote verification
         * ============================================================ */
        '/guide/ai-news-to-shorts/source-quote-verification' => array(
            autonom_newsreel_article(
                'Source Quote Verification: How to Check Every AI Fact Against Its Article',
                'Every fact needs an exact quote from the article it came from. Learn how source quote verification works and why it matters.',
                '/guide/ai-news-to-shorts/source-quote-verification'
            ),
            array(
                '@context'   => 'https://schema.org',
                '@type'      => 'FAQPage',
                'mainEntity' => array(
                    autonom_newsreel_faq_item(
                        'What is source quote verification in an AI news tool?',
                        'It is the step where every claim in the script is compared against an exact sentence from the article it came from. The tool extracts a claim and a quote together, checks in code that the quote really appears in the article, checks that the claim\'s numbers and wording do not exceed the quote, and checks that any named speaker is actually named in the quote. A fact that fails any of those checks is dropped or rewritten.'
                    ),
                    autonom_newsreel_faq_item(
                        'Why not just trust the AI model to verify itself?',
                        'Because a model\'s judgement about its own output is still a judgement. If a model writes a claim and is then asked "is this claim supported by the article?", it will usually say yes — including when the claim is wrong, because the same fluency that produced the claim produces the confirmation. Mechanical checks are different: string comparison against the article either finds the quote or does not, and no amount of fluency can change that.'
                    ),
                    autonom_newsreel_faq_item(
                        'What does "quote in article" actually check?',
                        'The tool normalises both the quote and the article text — collapsing whitespace, straightening curly quotes, converting dashes — and then searches for the quote inside the article as a plain substring. If the quote appears, the fact passes that check. If it does not, the fact is dropped. This is not a semantic check; it is a literal one. That is the point.'
                    ),
                    autonom_newsreel_faq_item(
                        'Can a quote be real and still be misused?',
                        'Yes, and that is what the second and third checks are for. "Up to 45%" is real; "45%" is not what it says. "The minister said he was considering" is real; "the minister announced" is not what it says. "Polish Prime Minister Donald Tusk said" is real; attributing it to a different Polish official is not. The number check, the wording check, and the speaker check catch those specific misuses. The final audit catches the ones the dictionary of words does not name.'
                    ),
                    autonom_newsreel_faq_item(
                        'What happens when the second outlet disagrees?',
                        'The tool does not pick a winner. It tags the fact as they differ, shows both versions to the script writer, and instructs it to either name both versions in the sentence or leave the point out. In the review step, the conflict is surfaced with the two quotes side by side, so you can decide. A fact that both outlets confirm is marked as such and can be stated plainly; a fact only one outlet reports has to be attributed by name.'
                    ),
                    autonom_newsreel_faq_item(
                        'Does quote verification replace a human review?',
                        'No. It removes a specific, mechanical class of error — invented quotes, rounded numbers, dropped hedges, misattributed speakers — that a human is bad at catching on a read-through and a machine is good at catching. What remains is the editorial judgement: is the source right, is the framing fair, is the angle worth publishing. That stays with you, and the tool is designed to make that read shorter, not to remove it.'
                    ),
                ),
            ),
        ),

        /* ============================================================
         * Spoke 3 — YouTube Shorts hooks
         * ============================================================ */
        '/guide/ai-news-to-shorts/youtube-shorts-hooks' => array(
            autonom_newsreel_article(
                'YouTube Shorts Hooks: The First Two Seconds Decide Everything',
                'The first two seconds decide whether anyone watches a news Short. Learn the three hook formulas that work, with examples.',
                '/guide/ai-news-to-shorts/youtube-shorts-hooks'
            ),
            array(
                '@context'   => 'https://schema.org',
                '@type'      => 'FAQPage',
                'mainEntity' => array(
                    autonom_newsreel_faq_item(
                        'How long should a YouTube Shorts hook be?',
                        'Under 13 words is the target. Under 9 is stronger if the story allows it, because every word is attention the viewer has to spend before they decide to stay. A hook that runs over 16 words is almost always a summary that has been mislabelled as an opening. The number is not a hard limit; it is a proxy for "does the sentence deliver the reason to watch before the viewer\'s thumb finishes the swipe?"'
                    ),
                    autonom_newsreel_faq_item(
                        'What is the best hook formula for news Shorts?',
                        'There is no single best formula, because the formula follows the story. A finished event — a decision made, a strike confirmed, a tariff set — is a consequence-first hook. An open outcome — talks underway, an election coming, an investigation ongoing — is a question. A headline that hides the point — the coverage focused on the wrong thing, the interesting part barely mentioned — is a hidden layer. Write one candidate in each of the three formulas before you pick.'
                    ),
                    autonom_newsreel_faq_item(
                        'Is "According to Reuters" ever a good opening?',
                        'Almost never as the first sentence. The outlet name is a reason to trust the video, not a reason to watch it. A viewer mid-swipe has not yet decided whether to care about the story, so they are not yet in the market for a source. Put the outlet name once, naturally, at the point in the body where the story has already started to hold attention.'
                    ),
                    autonom_newsreel_faq_item(
                        'Can I test a hook without publishing?',
                        'Yes, by writing at least three candidates and swapping them into the same script. Read the whole script with each one — not just the opening line, because the hook is the first sentence of a story, not a standalone. The best hook alone can still be the wrong hook if it throws off the pacing of the body or the flow into the closing question. Autonom does the same swap in the review step, with a fact-check on the new hook before it is accepted.'
                    ),
                    autonom_newsreel_faq_item(
                        'What does a hook score of 80 out of 100 mean?',
                        'It means the hook hits most of the rubric: short, specific, real stakes, a curiosity gap, opens with who and not the outlet, no weak fillers. It does not mean the hook is good — that is still a judgement about the story. A hook that scores 80 can be boring; a hook that scores 60 can be great because it does something the rubric does not name. The score is a floor, not a ceiling.'
                    ),
                    autonom_newsreel_faq_item(
                        'Do hooks work the same way on TikTok and Instagram Reels?',
                        'The core principle is the same: the first two seconds decide whether the viewer stays. The shape of the hook changes slightly because the audience behaviour does. TikTok viewers tend to swipe faster than YouTube Shorts viewers and to reward surprise more; Instagram Reels viewers respond more to a first line that feels relatable. The three formulas still apply, but the same story might lean question-first on TikTok and consequence-first on YouTube.'
                    ),
                ),
            ),
        ),

        /* ============================================================
         * Spoke 4 — Publishing everywhere
         * ============================================================ */
        '/guide/ai-news-to-shorts/publish-shorts-everywhere' => array(
            autonom_newsreel_article(
                'Publishing Shorts Everywhere: A Platform-by-Platform Guide',
                'Every platform wants a different caption. Learn how to cross-post a news Short without rewriting everything by hand.',
                '/guide/ai-news-to-shorts/publish-shorts-everywhere'
            ),
            array(
                '@context'   => 'https://schema.org',
                '@type'      => 'FAQPage',
                'mainEntity' => array(
                    autonom_newsreel_faq_item(
                        'How do I post a YouTube Short to Instagram?',
                        'Two ways. The easy way, if you are on a phone: open the finished MP4 in your browser or camera roll, tap Share, and choose Instagram. The Instagram app will open with the video already attached. The longer way: download the MP4, open Instagram, tap Create, upload the video as a Reel, and paste the Instagram-specific caption. The caption matters more than the path: a caption written for YouTube, pasted into Instagram, reads like a YouTube caption pasted into Instagram.'
                    ),
                    autonom_newsreel_faq_item(
                        'Why can\'t I post directly to YouTube, Instagram, and TikTok from the browser?',
                        'Because none of those platforms allow a browser session to upload a video to them without an approved developer app behind it. Telegram and Mastodon have open APIs that accept a video upload from a user\'s own token; the others do not, or require an approved application and an OAuth flow that is not part of a free browser tool. Copy-paste and the phone share sheet are the honest paths, and they work everywhere.'
                    ),
                    autonom_newsreel_faq_item(
                        'What is the best time to publish a Short?',
                        'When your own audience is watching, which is a per-channel question and not a universal answer. The industry default — weekday mornings, local time — is a starting point, not a result. Check your YouTube Studio analytics for "when your viewers are on YouTube" and use that window. On Instagram, TikTok, and LinkedIn, the native analytics tell you the same thing per platform. The mistake is picking one time and using it for all of them.'
                    ),
                    autonom_newsreel_faq_item(
                        'Should I use a third-party scheduler like Buffer or Later?',
                        'For a solo creator publishing a handful of Shorts a week, the native schedulers are usually better — they post through the platform\'s own API, which the algorithm treats as a normal publish event, and they don\'t have a paid tier between you and your own content. For an agency publishing dozens of videos a week across many accounts, a third-party scheduler saves enough time to justify the cost. The decision is volume, not preference.'
                    ),
                    autonom_newsreel_faq_item(
                        'Does the same video need a different caption on every platform?',
                        'The same video needs the same story told in the platform\'s voice, which means a different sentence for each one. It does not mean a different angle — the angle is the video\'s job. The caption\'s job is to translate the video\'s opening line into the platform\'s length, hashtag convention, and tone, so a viewer who sees it in their feed recognises the same story they would see if they had found the video on any other platform.'
                    ),
                    autonom_newsreel_faq_item(
                        'What happens if I don\'t have time to write eleven captions?',
                        'Write three and copy-paste the rest with the length and hashtags adjusted for each. Three is the minimum that covers the platforms with the biggest convention gaps: one for video-first platforms (YouTube, Rumble), one for scroll-first platforms (Instagram, TikTok, Threads, Bluesky), and one for text-first platforms (X, LinkedIn, Mastodon, Telegram).'
                    ),
                ),
            ),
        ),

        /* ============================================================
         * Spoke 5 — Stock footage for scenes
         * ============================================================ */
        '/guide/ai-news-to-shorts/stock-footage-scenes' => array(
            autonom_newsreel_article(
                'Stock Footage for News Shorts: Matching Every Scene Without Misleading',
                'Stock footage should match the sentence, not just decorate it. Learn how to choose footage scene by scene.',
                '/guide/ai-news-to-shorts/stock-footage-scenes'
            ),
            array(
                '@context'   => 'https://schema.org',
                '@type'      => 'FAQPage',
                'mainEntity' => array(
                    autonom_newsreel_faq_item(
                        'What kind of stock footage should I use in a news Short?',
                        'Establishing shots and verb-noun shots, not action shots and not topic shots. An establishing shot — a wide view of a city, a building, a coastline — suggests a place without claiming a specific event. A verb-noun shot — missile launch, protest crowd, oil tanker — shows what the sentence is about without implying that it is the specific instance the sentence is describing. A topic shot returns a generic, dramatic clip that overclaims.'
                    ),
                    autonom_newsreel_faq_item(
                        'Why is my stock footage misleading?',
                        'Because the clip is being read as footage of the event, when it is footage of a version of the event somewhere else. That is not a defect of the clip; it is a defect of the pairing. A clip of a missile launch under a sentence about a specific strike reads as the strike, even when the label is on. The fix is not to find a more dramatic clip — it is to find a less specific one, an establishing shot that suggests the place without claiming the event.'
                    ),
                    autonom_newsreel_faq_item(
                        'When should I use a text card instead of footage?',
                        'Whenever the sentence is abstract: an opinion, a claim, a statistic, a question to the viewer, the closing call-to-action. There is no stock clip that illustrates "whether this holds depends on two things" without implying a claim the sentence is not making. A plain caption card — big text on a dark background, no footage — keeps the visual track honest and stops the video from pretending to illustrate something that is not visual.'
                    ),
                    autonom_newsreel_faq_item(
                        'Do I need an illustrative-footage label?',
                        'Yes, in almost every case where a viewer could misread a stock clip as footage of the event the script is about. That covers most news videos, because most news videos are about specific events at specific places at specific times. The label is on by default in Autonom Newsreel\'s video studio, and the default is the right choice.'
                    ),
                    autonom_newsreel_faq_item(
                        'Can I edit the footage plan before the video is recorded?',
                        'Yes, in the video step. Every scene in the script has a footage plan — footage or card, with a search query and an alternate — and the plan is shown as an editable list. You can change a search query, turn a footage scene into a card, or turn a card back into footage, and re-record the video without re-rendering the voice, because the voice is cached from the first run.'
                    ),
                    autonom_newsreel_faq_item(
                        'Which stock library should I use?',
                        'Either. Pixabay and Pexels both have generous free tiers, both allow commercial use without attribution for most clips, and both have good enough coverage of the generic shots a news video needs. Pexels has a slight edge in portrait-orientation clips for Shorts; Pixabay has a slight edge in breadth of ordinary daily-life footage. The bigger decision is not which library — it is whether you configure a library at all.'
                    ),
                ),
            ),
        ),

        /* ============================================================
         * Spoke 6 — AI voiceover for news
         * ============================================================ */
        '/guide/ai-news-to-shorts/ai-voiceover-news' => array(
            autonom_newsreel_article(
                'AI Voiceover for News Videos: What Works and What Sounds Robotic',
                'AI voices are good enough for news explainers now — if you pick the right one and the right speed. Learn what makes a news voice sound right.',
                '/guide/ai-news-to-shorts/ai-voiceover-news'
            ),
            array(
                '@context'   => 'https://schema.org',
                '@type'      => 'FAQPage',
                'mainEntity' => array(
                    autonom_newsreel_faq_item(
                        'What is the best AI voice for news videos?',
                        'There is no single best voice, because register and pace matter more than the model. The right voice is the one whose default register is closest to a news anchor — calm, neutral, not enthusiastic, not commercial — and then it is tuned by speed and by the script. Autonom ships three built-in voices (am_echo, am_liam, af_heart) and lets you load around fifty more, but the biggest factor in how a video sounds is the sentence the voice is reading, not which voice was picked.'
                    ),
                    autonom_newsreel_faq_item(
                        'Why does AI voiceover sound robotic?',
                        'Four reasons, in order of impact: no pause between sentences (the biggest tell), the wrong speed, over-enunciated consonants on hard words, and the wrong register for the story. The first two are configuration problems that a good tool solves with per-sentence synthesis and adjustable speed; the last two are script problems that a good writer solves by rewriting the sentence.'
                    ),
                    autonom_newsreel_faq_item(
                        'What speed should I set an AI news voice to?',
                        'Start at 1.0 and adjust by ear. A lower-pitched voice usually reads better slightly faster (1.05); a higher-pitched voice often reads better slightly slower (0.95). A serious story (a death toll, a war report) benefits from a slower pace than a light one. The single best test is to read your own script aloud at the speed you have chosen, and if you cannot read it comfortably, no viewer can listen to it comfortably either.'
                    ),
                    autonom_newsreel_faq_item(
                        'Is AI voiceover allowed on YouTube?',
                        'Yes, with caveats. YouTube\'s inauthentic content policy targets mass-produced, repetitive videos that mislead viewers about what they are, not the use of AI voices. A fact-checked news Short with an AI voice is not what that policy is about. What it is about is: uploaded at scale, unedited, no original angle, no human check. As long as you are editing every script, publishing fewer better videos, and adding your own angle to the story, an AI voice is allowed.'
                    ),
                    autonom_newsreel_faq_item(
                        'Can AI voiceover for news be free?',
                        'Yes, if the model runs on your own hardware. Autonom Newsreel uses an open-source voice model (Kokoro-82M) that runs entirely in your browser, so there is no per-character cost to speak a script. You pay nothing for the voice; you pay for the API keys that write and fact-check the script. The trade is that the model downloads once (about 80 MB) and runs on your machine rather than a server.'
                    ),
                    autonom_newsreel_faq_item(
                        'Do I need a voice actor for a news channel?',
                        'Not for a faceless news channel, and not if your scripts are written to be spoken rather than read. A voice actor adds things an AI voice cannot yet: judgement about which word to stress, the small imperfections that make a line land, the ability to sound like a person who has an opinion about the news. If your channel is about the story and the voice is the delivery vehicle, an AI voice with a well-written script is not a compromise — it is the right choice.'
                    ),
                ),
            ),
        ),

    );

    if ( isset( $schemas[ $path ] ) ) {
        foreach ( $schemas[ $path ] as $schema ) {
            echo '<script type="application/ld+json">'
                . wp_json_encode( $schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
                . '</script>' . "\n";
        }
    }
}
