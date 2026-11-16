/**
 * Autonom Digest — Shortcode
 * Shortcode: [autonom_digest]
 * v1.2.2 (fix: decimals like 2.1% were cut into two paragraphs; analyst's note no longer carries over between digests; sub-heading inside long fact blocks; v1.2.1: second digest from left-out fixed, remove topics that found nothing, impact-first grouping, focus keyphrase written into the article; v1.2.0: plain reading: sentences up to 20 words, short paragraphs, sub-headings, second digest from left-out stories; v1.1.2: remove unsupported numbers everywhere, tick-gate, allegation-word warning, no invented thresholds or past dates; v1.1.1: direct quotes are never flagged or rewritten as machine phrasing; v1.1.0: daily bulletin of 3 to 4 sections, one draft at a time, pool/plan/split retired, twice-weekly analysis with long-form video outline; v1.0.4: Clean sheet button, waiting sections that fit a thin digest are marked, broader test-line detection, no dangling note placeholder; v1.0.3: Review can add the missing test line and draft a note start; Remove weak keeps the sections in the pool; v1.0.2: Keep strongest: overlapping digests merge down to one; fixes listed under each digest; v1.0.1: quality control: publish-readiness score per digest, Remove weak; v1.0.0: analyst commentary twice a week, spoken script, analyst's note, claim audit, shorter facts; v0.9.11: every section has one status: waiting or in a digest; no duplicates; discard; v0.9.10: one pool, plan digests by relevance, waiting sections; v0.9.9: Not used yet list, follow-ups instead of repeats, duplicate warning; v0.9.8: charts look automatically at Export, watch-item fix, fact rules on mechanisms and repeats; v0.9.7: step guide line, optional earlier sections, thin digests fold, summary cleanup; v0.9.6: weekly digest; v0.9.5: coherence check, fact rules over voice, better topic signals, internal links and signup box; v0.9.4: suggest digests across all sections, reused ones included; v0.9.3: chart beside the facts only, grouping rescue, stricter reads; v0.9.2: think-tank rework: auto sections, split into digests, durable headlines; v0.9.1: new carousel designs; v0.9.0: keeps charts when you look for more, cover images that fit each digest, primary and secondary keywords, article gutters, Social step, start over)
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

if ( ! defined( 'AUTONOM_DGS_VERSION' ) ) {
    define( 'AUTONOM_DGS_VERSION', '1.2.2' );
}

/**
 * Where the CSS/JS files live.
 * - If used as a plugin/theme file: auto-detected via plugin_dir_url(__FILE__)
 * - If pasted into WPCode: define AUTONOM_DGS_ASSETS_URL in wp-config.php
 *   e.g. define( 'AUTONOM_DGS_ASSETS_URL', 'https://autonom.app/wp-content/uploads/autonom/autonom-digest/' );
 */
function autonom_dgs_assets_url() {
    if ( defined( 'AUTONOM_DGS_ASSETS_URL' ) ) return trailingslashit( AUTONOM_DGS_ASSETS_URL );
    return trailingslashit( plugin_dir_url( __FILE__ ) );
}

/**
 * Cache-busting version for an asset file.
 * Uses the file's modification time when the file can be located on disk
 * (uploads folder or plugin folder), otherwise falls back to AUTONOM_DGS_VERSION.
 */
function autonom_dgs_asset_ver( $file ) {
    $base = autonom_dgs_assets_url();
    $up   = wp_get_upload_dir();
    if ( ! empty( $up['baseurl'] ) && strpos( $base, $up['baseurl'] ) === 0 ) {
        $path = $up['basedir'] . substr( $base, strlen( $up['baseurl'] ) ) . $file;
    } else {
        $path = plugin_dir_path( __FILE__ ) . $file;
    }
    if ( is_readable( $path ) ) {
        return (string) filemtime( $path );
    }
    return AUTONOM_DGS_VERSION;
}

/**
 * Register assets. Loaded only when the shortcode is present.
 */
function autonom_dgs_register_assets() {
    $base = autonom_dgs_assets_url();
    wp_register_script( 'autonom-dgs-backend', $base . 'autonom-digest-backend.js', array(), autonom_dgs_asset_ver( 'autonom-digest-backend.js' ), true );
}
add_action( 'wp_enqueue_scripts', 'autonom_dgs_register_assets', 5 );

/* ------------------------------------------------------------------
 * REST endpoint: fetch readable article text for a news URL.
 * GET /wp-json/autonom-dgs/v1/article?url=https://...
 *
 * Hardening:
 *  - wp_safe_remote_get() refuses private/loopback addresses and odd ports
 *  - http/https only, HTML responses only, 1.5 MB body cap, 10s timeout
 *  - per-IP and global rate limits, results cached for 6 hours
 *  - returns plain text only (no HTML is ever passed through)
 * ------------------------------------------------------------------ */





function autonom_dgs_rest_site( WP_REST_Request $req ) {
    $url = esc_url_raw( trim( (string) $req->get_param( 'url' ) ), array( 'http', 'https' ) );
    if ( ! $url || ! wp_http_validate_url( $url ) ) { return new WP_REST_Response( array( 'ok' => false, 'error' => 'bad_url' ), 400 ); }
    $p = wp_parse_url( $url );
    $origin = $p['scheme'] . '://' . $p['host'] . ( ! empty( $p['port'] ) ? ':' . $p['port'] : '' );
    $ck = 'dgs_site_' . md5( $origin );
    $cached = get_transient( $ck );
    if ( is_array( $cached ) ) { return new WP_REST_Response( $cached, 200 ); }
    $ipk = 'dgs_rls_' . md5( autonom_dgs_client_ip() );
    $n   = (int) get_transient( $ipk );
    if ( $n >= 20 ) { return new WP_REST_Response( array( 'ok' => false, 'error' => 'rate_limited' ), 429 ); }
    set_transient( $ipk, $n + 1, 10 * MINUTE_IN_SECONDS );
    $get = function ( $u ) {
        $r = wp_safe_remote_get( $u, array( 'timeout' => 10, 'redirection' => 3, 'limit_response_size' => 1500000,
            'user-agent' => 'Mozilla/5.0 (compatible; AutonomDGS/' . AUTONOM_DGS_VERSION . '; +' . home_url( '/' ) . ')' ) );
        if ( is_wp_error( $r ) || (int) wp_remote_retrieve_response_code( $r ) >= 400 ) { return ''; }
        return (string) wp_remote_retrieve_body( $r );
    };
    $home = $get( $origin . '/' );
    $title = ''; $desc = '';
    if ( $home !== '' ) {
        if ( preg_match( '#<title[^>]*>(.*?)</title>#is', $home, $m ) ) { $title = trim( html_entity_decode( wp_strip_all_tags( $m[1] ), ENT_QUOTES, 'UTF-8' ) ); }
        if ( preg_match( '#<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)["\']#i', $home, $m ) || preg_match( '#<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']description["\']#i', $home, $m ) ) { $desc = trim( html_entity_decode( $m[1], ENT_QUOTES, 'UTF-8' ) ); }
    }
    $items = array();
    foreach ( array( '/feed/', '/feed', '/rss.xml', '/atom.xml' ) as $path ) {
        $xml = $get( $origin . $path );
        if ( $xml !== '' ) { $items = autonom_dgs_parse_feed( $xml ); if ( $items ) { break; } }
    }
    $out = array();
    foreach ( array_slice( $items, 0, 15 ) as $it ) {
        $link = (string) $it['link'];
        if ( wp_parse_url( $link, PHP_URL_HOST ) !== $p['host'] ) { continue; }
        $out[] = array( 'title' => $it['title'], 'link' => $link, 'date' => $it['pubDate'], 'text' => mb_substr( trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( (string) $it['description'] ) ) ), 0, 600 ) );
    }
    if ( $title === '' && ! $out ) { return new WP_REST_Response( array( 'ok' => false, 'error' => 'unreachable' ), 200 ); }
    $res = array( 'ok' => true, 'title' => mb_substr( $title, 0, 120 ), 'description' => mb_substr( $desc, 0, 400 ), 'items' => $out );
    set_transient( $ck, $res, HOUR_IN_SECONDS );
    return new WP_REST_Response( $res, 200 );
}

function autonom_dgs_register_rest() {
    register_rest_route( 'autonom-dgs/v1', '/article', array(
        'methods'             => 'GET',
        'callback'            => 'autonom_dgs_rest_article',
        'permission_callback' => '__return_true',
        'args'                => array(
            'url' => array( 'required' => true, 'type' => 'string' ),
        ),
    ) );
    register_rest_route( 'autonom-dgs/v1', '/feeds', array(
        'methods'             => 'GET',
        'callback'            => 'autonom_dgs_rest_feeds',
        'permission_callback' => '__return_true',
        'args'                => array(
            'q' => array( 'required' => false, 'type' => 'string' ),
        ),
    ) );
    register_rest_route( 'autonom-dgs/v1', '/site', array(
        'methods'             => 'GET',
        'callback'            => 'autonom_dgs_rest_site',
        'permission_callback' => '__return_true',
        'args'                => array( 'url' => array( 'required' => true, 'type' => 'string' ) ),
    ) );
    register_rest_route( 'autonom-dgs/v1', '/llm', array(
        'methods'             => 'POST',
        'callback'            => 'autonom_dgs_rest_llm',
        'permission_callback' => '__return_true',
    ) );
    register_rest_route( 'autonom-dgs/v1', '/news', array(
        'methods'             => 'GET',
        'callback'            => 'autonom_dgs_rest_news',
        'permission_callback' => '__return_true',
        'args'                => array(
            'q' => array( 'required' => true, 'type' => 'string' ),
        ),
    ) );
}
add_action( 'rest_api_init', 'autonom_dgs_register_rest' );


/* ------------------------------------------------------------------
 * LLM relay (fallback when the browser cannot call a provider directly).
 * Forwards one chat-completions request to a fixed allowlist of providers
 * using the key the visitor supplies. The key is never stored or logged.
 * ------------------------------------------------------------------ */
function autonom_dgs_rest_llm( WP_REST_Request $req ) {
    $endpoints = array(
        'groq'       => 'https://api.groq.com/openai/v1/chat/completions',
        'openrouter' => 'https://openrouter.ai/api/v1/chat/completions',
        'nvidia'     => 'https://integrate.api.nvidia.com/v1/chat/completions',
    );
    $d        = $req->get_json_params();
    $provider = isset( $d['provider'] ) ? sanitize_key( (string) $d['provider'] ) : '';
    $key      = isset( $d['key'] ) ? trim( (string) $d['key'] ) : '';
    $payload  = isset( $d['payload'] ) && is_array( $d['payload'] ) ? $d['payload'] : null;
    $models   = isset( $d['action'] ) && $d['action'] === 'models';
    if ( $models ) { $payload = array( 'models' => 1 ); }
    if ( ! isset( $endpoints[ $provider ] ) || $key === '' || ! $payload || strlen( $key ) > 300 || ! preg_match( '/^[A-Za-z0-9_\-\.]+$/', $key ) ) {
        return new WP_REST_Response( array( 'ok' => false, 'error' => 'bad_request' ), 400 );
    }
    $ipk = 'dgs_llm_' . md5( autonom_dgs_client_ip() );
    $n   = (int) get_transient( $ipk );
    if ( $n >= 150 ) { return new WP_REST_Response( array( 'ok' => false, 'error' => 'rate_limited' ), 429 ); }
    set_transient( $ipk, $n + 1, 10 * MINUTE_IN_SECONDS );

    $body = wp_json_encode( $payload );
    if ( ! $body || strlen( $body ) > 120000 ) {
        return new WP_REST_Response( array( 'ok' => false, 'error' => 'too_large' ), 400 );
    }
    $headers = array( 'Content-Type' => 'application/json', 'Authorization' => 'Bearer ' . $key );
    if ( $provider === 'openrouter' ) {
        $headers['HTTP-Referer'] = home_url( '/' );
        $headers['X-Title']      = 'Autonom Digest';
    }
    if ( $models ) {
        $res = wp_remote_get( str_replace( '/chat/completions', '/models', $endpoints[ $provider ] ), array( 'timeout' => 20, 'headers' => array( 'Authorization' => 'Bearer ' . $key ) ) );
        if ( is_wp_error( $res ) ) { return new WP_REST_Response( array( 'ok' => false, 'error' => 'upstream_unreachable' ), 200 ); }
        return new WP_REST_Response( array( 'ok' => true, 'status' => (int) wp_remote_retrieve_response_code( $res ), 'text' => (string) wp_remote_retrieve_body( $res ) ), 200 );
    }
    $res = wp_remote_post( $endpoints[ $provider ], array( 'timeout' => 90, 'headers' => $headers, 'body' => $body ) );
    if ( is_wp_error( $res ) ) {
        return new WP_REST_Response( array( 'ok' => false, 'error' => 'upstream_unreachable' ), 200 );
    }
    return new WP_REST_Response( array(
        'ok'     => true,
        'status' => (int) wp_remote_retrieve_response_code( $res ),
        'text'   => (string) wp_remote_retrieve_body( $res ),
    ), 200 );
}

function autonom_dgs_client_ip() {
    if ( ! empty( $_SERVER['HTTP_CF_CONNECTING_IP'] ) ) {
        return sanitize_text_field( wp_unslash( $_SERVER['HTTP_CF_CONNECTING_IP'] ) );
    }
    return isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'unknown';
}

function autonom_dgs_article_fail( $code, $status = 200 ) {
    return new WP_REST_Response( array( 'ok' => false, 'error' => $code ), $status );
}

/**
 * Resolve a Google News redirect link (news.google.com/rss/articles/ID) to the publisher URL.
 * Google gives each article page a signature + timestamp; the real URL comes from one
 * batchexecute call. This is an undocumented Google endpoint and may change or block
 * server IPs, so failure is expected sometimes and callers must fall back gracefully.
 * Returns the publisher URL or null.
 */
function autonom_dgs_decode_gnews( $url ) {
    $p = wp_parse_url( $url );
    if ( empty( $p['host'] ) || strtolower( $p['host'] ) !== 'news.google.com' || empty( $p['path'] ) ) { return null; }
    $segs = explode( '/', trim( $p['path'], '/' ) );
    $n    = count( $segs );
    if ( $n < 2 || ! in_array( $segs[ $n - 2 ], array( 'articles', 'read' ), true ) || $segs[ $n - 1 ] === '' ) { return null; }
    $id = $segs[ $n - 1 ];

    $ck = 'dgs_gn_' . md5( $id );
    $c  = get_transient( $ck );
    if ( is_string( $c ) && $c !== '' ) { return $c; }

    $page = wp_safe_remote_get(
        'https://news.google.com/rss/articles/' . rawurlencode( $id ) . '?hl=en-US&gl=US&ceid=US%3Aen',
        array( 'timeout' => 10, 'redirection' => 3, 'user-agent' => autonom_dgs_news_ua() )
    );
    if ( is_wp_error( $page ) || (int) wp_remote_retrieve_response_code( $page ) !== 200 ) { return null; }
    $html = (string) wp_remote_retrieve_body( $page );
    if ( ! preg_match( '/data-n-a-sg="([^"]+)"/', $html, $sg ) || ! preg_match( '/data-n-a-ts="([^"]+)"/', $html, $ts ) ) { return null; }

    $ctx   = array(
        array( 'X', 'X', array( 'X', 'X' ), null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1 ),
        'X', 'X', 1, array( 1, 1, 1 ), 1, 1, null, 0, 0, null, 0,
    );
    $inner = array( 'garturlreq', $ctx, $id, ctype_digit( $ts[1] ) ? (int) $ts[1] : $ts[1], $sg[1] );
    $env   = array( 'Fbv4je', wp_json_encode( $inner ), null, '0' );
    $body  = 'f.req=' . rawurlencode( wp_json_encode( array( array( $env ) ) ) );

    $res = wp_safe_remote_post( 'https://news.google.com/_/DotsSplashUi/data/batchexecute', array(
        'timeout'    => 10,
        'user-agent' => autonom_dgs_news_ua(),
        'headers'    => array( 'Content-Type' => 'application/x-www-form-urlencoded;charset=UTF-8' ),
        'body'       => $body,
    ) );
    if ( is_wp_error( $res ) || (int) wp_remote_retrieve_response_code( $res ) !== 200 ) { return null; }

    $real = autonom_dgs_parse_batchexecute( (string) wp_remote_retrieve_body( $res ) );
    if ( ! $real ) { return null; }
    set_transient( $ck, $real, 12 * HOUR_IN_SECONDS );
    return $real;
}

function autonom_dgs_parse_batchexecute( $text ) {
    $pos = strpos( $text, '[' );
    if ( $pos === false ) { return null; }
    $rows = json_decode( substr( $text, $pos ), true );
    if ( ! is_array( $rows ) ) { return null; }
    foreach ( $rows as $row ) {
        if ( ! is_array( $row ) || count( $row ) < 3 || $row[0] !== 'wrb.fr' || $row[1] !== 'Fbv4je' || ! is_string( $row[2] ) ) { continue; }
        $payload = json_decode( $row[2], true );
        if ( is_array( $payload ) && isset( $payload[0], $payload[1] ) && $payload[0] === 'garturlres' && is_string( $payload[1] ) && preg_match( '#^https?://#i', $payload[1] ) ) {
            return $payload[1];
        }
    }
    return null;
}

function autonom_dgs_rest_article( WP_REST_Request $req ) {
    $url = trim( (string) $req->get_param( 'url' ) );
    $url = esc_url_raw( $url, array( 'http', 'https' ) );
    if ( ! $url || ! wp_http_validate_url( $url ) ) {
        return autonom_dgs_article_fail( 'bad_url', 400 );
    }

    // Cached result?
    $ck     = 'dgs_art_' . md5( $url );
    $cached = get_transient( $ck );
    if ( is_array( $cached ) ) {
        return new WP_REST_Response( $cached, 200 );
    }
    $orig = $url;

    // Rate limits: 40 per 10 min per IP, 400 per hour overall.
    $ipk = 'dgs_rl_' . md5( autonom_dgs_client_ip() );
    $n   = (int) get_transient( $ipk );
    if ( $n >= 90 ) { return autonom_dgs_article_fail( 'rate_limited', 429 ); }
    set_transient( $ipk, $n + 1, 10 * MINUTE_IN_SECONDS );

    $gk = 'dgs_rl_global';
    $g  = (int) get_transient( $gk );
    if ( $g >= 400 ) { return autonom_dgs_article_fail( 'rate_limited', 429 ); }
    set_transient( $gk, $g + 1, HOUR_IN_SECONDS );

    // Google News / Bing redirect links: resolve to the publisher URL first.
    $host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
    if ( $host === 'news.google.com' ) {
        $real = autonom_dgs_decode_gnews( $url );
        if ( ! $real || ! wp_http_validate_url( $real ) ) { return autonom_dgs_article_fail( 'decode_failed' ); }
        $url = $real;
    } elseif ( $host === 'www.bing.com' || $host === 'bing.com' ) {
        return autonom_dgs_article_fail( 'redirect_link' );
    }
    // Hard-paywalled publishers: do not waste a request, and never feed a paywall page to the model.
    $host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
    if ( preg_match( '/(^|\.)(wsj\.com|ft\.com|bloomberg\.com|economist\.com|barrons\.com)$/', $host ) ) {
        return autonom_dgs_article_fail( 'paywalled' );
    }

    $fetch = function ( $ua ) use ( $url ) {
        return wp_safe_remote_get( $url, array(
            'timeout'             => 10,
            'redirection'         => 4,
            'limit_response_size' => 1500000,
            'user-agent'          => $ua,
            'headers'             => array(
                'Accept'          => 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language' => 'en-US,en;q=0.9',
            ),
        ) );
    };
    $bot = 'Mozilla/5.0 (compatible; AutonomDGS/' . AUTONOM_DGS_VERSION . '; +' . home_url( '/' ) . ')';
    $res = $fetch( $bot );
    $code = is_wp_error( $res ) ? 0 : (int) wp_remote_retrieve_response_code( $res );
    // Many publishers refuse unknown bots (401/403/429/503). Retry once as a plain browser request.
    if ( is_wp_error( $res ) || in_array( $code, array( 401, 403, 406, 429, 503 ), true ) ) {
        $res2 = $fetch( 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' );
        if ( ! is_wp_error( $res2 ) ) { $res = $res2; $code = (int) wp_remote_retrieve_response_code( $res ); }
    }
    if ( is_wp_error( $res ) ) {
        return autonom_dgs_article_fail( 'fetch_failed' );
    }
    if ( $code < 200 || $code >= 300 ) {
        return autonom_dgs_article_fail( 'http_' . $code );
    }
    $ctype = strtolower( (string) wp_remote_retrieve_header( $res, 'content-type' ) );
    if ( $ctype !== '' && strpos( $ctype, 'html' ) === false ) {
        return autonom_dgs_article_fail( 'not_html' );
    }
    $body = (string) wp_remote_retrieve_body( $res );
    if ( $body === '' ) {
        return autonom_dgs_article_fail( 'empty' );
    }

    $out = autonom_dgs_extract_article( $body );
    if ( ! $out ) {
        return autonom_dgs_article_fail( 'too_short' );
    }
    if ( $out['length'] < 1500 && preg_match( '/(subscribe to (continue|read)|already a subscriber|sign in to (continue|read)|create a free account to (continue|read)|to continue reading)/i', $out['text'] ) ) {
        return autonom_dgs_article_fail( 'paywalled' );
    }
    $out['ok']       = true;
    $out['host']     = wp_parse_url( $url, PHP_URL_HOST );
    $out['finalUrl'] = $url;
    set_transient( 'dgs_art_' . md5( $orig ), $out, 6 * HOUR_IN_SECONDS );
    return new WP_REST_Response( $out, 200 );
}

/**
 * Pull the main readable text out of an HTML page. Returns null if too little text.
 */
function autonom_dgs_extract_article( $html ) {
    if ( ! class_exists( 'DOMDocument' ) ) { return null; }
    libxml_use_internal_errors( true );
    $dom = new DOMDocument();
    $dom->loadHTML( '<?xml encoding="utf-8" ?>' . $html, LIBXML_NOWARNING | LIBXML_NOERROR );
    libxml_clear_errors();
    $xp = new DOMXPath( $dom );

    // Title: og:title, else <title>
    $title = '';
    $og = $xp->query( '//meta[@property="og:title"]/@content' );
    if ( $og && $og->length ) { $title = trim( $og->item( 0 )->nodeValue ); }
    if ( $title === '' ) {
        $t = $xp->query( '//title' );
        if ( $t && $t->length ) { $title = trim( $t->item( 0 )->textContent ); }
    }

    // Structured data first: most news sites embed the full text as JSON-LD articleBody.
    $ld_text = '';
    $lds = $xp->query( '//script[@type="application/ld+json"]' );
    if ( $lds ) {
        $walk = function ( $v ) use ( &$walk, &$ld_text ) {
            if ( ! is_array( $v ) ) { return; }
            if ( isset( $v['articleBody'] ) && is_string( $v['articleBody'] ) && mb_strlen( $v['articleBody'] ) > mb_strlen( $ld_text ) ) {
                $ld_text = $v['articleBody'];
            }
            foreach ( $v as $child ) { if ( is_array( $child ) ) { $walk( $child ); } }
        };
        foreach ( $lds as $n ) {
            $j = json_decode( trim( $n->textContent ), true );
            if ( is_array( $j ) ) { $walk( $j ); }
        }
        $ld_text = trim( preg_replace( '/[ \t]+/u', ' ', wp_strip_all_tags( html_entity_decode( $ld_text, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) ) ) );
    }

    // Remove noise nodes
    foreach ( array( 'script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'form', 'iframe', 'svg', 'figure' ) as $tag ) {
        $nodes = $xp->query( '//' . $tag );
        if ( ! $nodes ) { continue; }
        $kill = array();
        foreach ( $nodes as $n ) { $kill[] = $n; }
        foreach ( $kill as $n ) { if ( $n->parentNode ) { $n->parentNode->removeChild( $n ); } }
    }

    // Prefer the <article> with the most paragraphs, else the whole document
    $root = null;
    $best = 0;
    $arts = $xp->query( '//article' );
    if ( $arts ) {
        foreach ( $arts as $a ) {
            $c = $xp->query( './/p', $a )->length;
            if ( $c > $best ) { $best = $c; $root = $a; }
        }
    }
    $ps = $root ? $xp->query( './/p', $root ) : $xp->query( '//p' );

    $paras = array();
    if ( $ps ) {
        foreach ( $ps as $p ) {
            $txt = trim( preg_replace( '/\s+/u', ' ', $p->textContent ) );
            if ( mb_strlen( $txt ) >= 50 ) { $paras[] = $txt; }
        }
    }
    $text = implode( "\n", $paras );
    // Fallbacks: structured-data body, then any shorter paragraphs of the whole page.
    if ( mb_strlen( $ld_text ) > mb_strlen( $text ) + 200 ) { $text = $ld_text; }
    if ( mb_strlen( $text ) < 300 ) {
        $loose = array();
        $all = $xp->query( '//p | //div[contains(@class,"article") or contains(@class,"story") or contains(@class,"body")]/text()' );
        if ( $all ) {
            foreach ( $all as $p ) {
                $txt = trim( preg_replace( '/\s+/u', ' ', $p->textContent ) );
                if ( mb_strlen( $txt ) >= 30 ) { $loose[] = $txt; }
            }
        }
        $lt = implode( "\n", array_unique( $loose ) );
        if ( mb_strlen( $lt ) > mb_strlen( $text ) ) { $text = $lt; }
    }
    if ( mb_strlen( $text ) < 300 ) { return null; }
    $text = mb_substr( $text, 0, 6000 );

    return array(
        'title'  => wp_strip_all_tags( $title ),
        'text'   => $text,
        'length' => mb_strlen( $text ),
    );
}

/* ------------------------------------------------------------------
 * REST endpoint: search recent news server-side.
 * GET /wp-json/autonom-dgs/v1/news?q=missile OR sanctions
 *
 * Tries GDELT, then Bing News RSS, then Google News RSS. GDELT and Bing
 * return real publisher URLs (so article text can be read); Google News
 * links are redirects and are flagged "redirect": true.
 * Cached 10 minutes per query; 60 requests / 10 min / IP.
 * ------------------------------------------------------------------ */
function autonom_dgs_news_terms( $q, $max = 6 ) {
    $terms = array();
    foreach ( preg_split( '/\s+OR\s+/i', (string) $q ) as $p ) {
        $p = trim( preg_replace( '/\s+/u', ' ', preg_replace( '/[^\p{L}\p{N}\s\-]/u', ' ', $p ) ) );
        if ( mb_strlen( $p ) >= 3 ) { $terms[] = $p; }
    }
    return array_slice( array_values( array_unique( $terms ) ), 0, $max );
}

function autonom_dgs_news_item( $title, $link, $date, $author, $desc = '', $redirect = false ) {
    $ts    = $date ? strtotime( (string) $date ) : false;
    $clean = function ( $s ) {
        return trim( preg_replace( '/\s+/u', ' ', wp_strip_all_tags( html_entity_decode( (string) $s, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) ) ) );
    };
    return array(
        'title'       => $clean( $title ),
        'link'        => (string) $link,
        'pubDate'     => gmdate( 'c', $ts ? $ts : time() ),
        'author'      => $clean( $author ),
        'description' => mb_substr( $clean( $desc ), 0, 300 ),
        'redirect'    => (bool) $redirect,
    );
}

function autonom_dgs_news_ua() {
    return 'Mozilla/5.0 (compatible; AutonomDGS/' . AUTONOM_DGS_VERSION . '; +' . home_url( '/' ) . ')';
}

function autonom_dgs_news_gdelt( $terms ) {
    $parts = array();
    foreach ( $terms as $t ) { $parts[] = preg_match( '/\s/', $t ) ? '"' . $t . '"' : $t; }
    $core = count( $parts ) > 1 ? '(' . implode( ' OR ', $parts ) . ')' : $parts[0];
    $url  = 'https://api.gdeltproject.org/api/v2/doc/doc?' . http_build_query( array(
        'query'      => $core . ' sourcelang:english',
        'mode'       => 'artlist',
        'maxrecords' => 30,
        'format'     => 'json',
        'sort'       => 'hybridrel',
        'timespan'   => '2d',
    ), '', '&', PHP_QUERY_RFC3986 );
    $res = wp_safe_remote_get( $url, array( 'timeout' => 15, 'user-agent' => autonom_dgs_news_ua() ) );
    if ( is_wp_error( $res ) || (int) wp_remote_retrieve_response_code( $res ) !== 200 ) { return array(); }
    $body = trim( (string) wp_remote_retrieve_body( $res ) );
    if ( $body === '' || $body[0] !== '{' ) { return array(); } // GDELT sends plain text for errors/rate limits
    $j = json_decode( $body, true );
    if ( empty( $j['articles'] ) || ! is_array( $j['articles'] ) ) { return array(); }
    $out = array();
    foreach ( $j['articles'] as $a ) {
        if ( empty( $a['title'] ) || empty( $a['url'] ) ) { continue; }
        $date = '';
        if ( ! empty( $a['seendate'] ) ) {
            $d = DateTime::createFromFormat( 'Ymd\THis\Z', $a['seendate'], new DateTimeZone( 'UTC' ) );
            if ( $d ) { $date = $d->format( 'c' ); }
        }
        $out[] = autonom_dgs_news_item( $a['title'], $a['url'], $date, isset( $a['domain'] ) ? $a['domain'] : 'GDELT', '', false );
    }
    return $out;
}

function autonom_dgs_news_rss( $url ) {
    $res = wp_safe_remote_get( $url, array( 'timeout' => 12, 'user-agent' => autonom_dgs_news_ua() ) );
    if ( is_wp_error( $res ) || (int) wp_remote_retrieve_response_code( $res ) !== 200 ) { return null; }
    $xml = (string) wp_remote_retrieve_body( $res );
    if ( $xml === '' ) { return null; }
    libxml_use_internal_errors( true );
    $sx = simplexml_load_string( $xml, 'SimpleXMLElement', LIBXML_NONET | LIBXML_NOCDATA );
    libxml_clear_errors();
    if ( ! $sx || ! isset( $sx->channel->item ) ) { return null; }
    return $sx;
}

function autonom_dgs_news_bing( $terms ) {
    $url = 'https://www.bing.com/news/search?' . http_build_query( array(
        'q' => implode( ' OR ', $terms ), 'format' => 'RSS', 'setlang' => 'en-US',
    ), '', '&', PHP_QUERY_RFC3986 );
    $sx = autonom_dgs_news_rss( $url );
    if ( ! $sx ) { return array(); }
    $out = array();
    foreach ( $sx->channel->item as $it ) {
        $link     = (string) $it->link;
        $pub      = $link;
        $redirect = true;
        $parts    = wp_parse_url( $link );
        if ( ! empty( $parts['query'] ) ) {
            parse_str( $parts['query'], $qs ); // Bing wraps the publisher URL in ?url=
            if ( ! empty( $qs['url'] ) && preg_match( '#^https?://#i', $qs['url'] ) ) { $pub = $qs['url']; $redirect = false; }
        }
        $src = '';
        foreach ( $it->getNamespaces( true ) as $uri ) {
            $c = $it->children( $uri );
            if ( isset( $c->Source ) ) { $src = (string) $c->Source; break; }
        }
        if ( $src === '' ) { $src = (string) wp_parse_url( $pub, PHP_URL_HOST ); }
        $out[] = autonom_dgs_news_item( $it->title, $pub, (string) $it->pubDate, $src, (string) $it->description, $redirect );
    }
    return $out;
}

function autonom_dgs_news_google( $terms ) {
    $url = 'https://news.google.com/rss/search?' . http_build_query( array(
        'q' => implode( ' OR ', $terms ), 'hl' => 'en-US', 'gl' => 'US', 'ceid' => 'US:en',
    ), '', '&', PHP_QUERY_RFC3986 );
    $sx = autonom_dgs_news_rss( $url );
    if ( ! $sx ) { return array(); }
    $out = array();
    foreach ( $sx->channel->item as $it ) {
        $out[] = autonom_dgs_news_item( $it->title, (string) $it->link, (string) $it->pubDate, (string) $it->source, '', true );
    }
    return $out;
}

function autonom_dgs_rest_news( WP_REST_Request $req ) {
    $terms = autonom_dgs_news_terms( (string) $req->get_param( 'q' ) );
    if ( ! $terms ) {
        return new WP_REST_Response( array( 'ok' => false, 'error' => 'no_terms' ), 400 );
    }
    $ck     = 'dgs_news_' . md5( implode( '|', $terms ) );
    $cached = get_transient( $ck );
    if ( is_array( $cached ) ) {
        return new WP_REST_Response( $cached, 200 );
    }

    $ipk = 'dgs_nrl_' . md5( autonom_dgs_client_ip() );
    $n   = (int) get_transient( $ipk );
    if ( $n >= 60 ) { return new WP_REST_Response( array( 'ok' => false, 'error' => 'rate_limited' ), 429 ); }
    set_transient( $ipk, $n + 1, 10 * MINUTE_IN_SECONDS );

    $chain = array(
        'gdelt'  => 'autonom_dgs_news_gdelt',
        'bing'   => 'autonom_dgs_news_bing',
        'google' => 'autonom_dgs_news_google',
    );
    foreach ( $chain as $name => $fn ) {
        $items = call_user_func( $fn, $terms );
        if ( ! empty( $items ) ) {
            $out = array( 'ok' => true, 'source' => $name, 'items' => array_slice( $items, 0, 30 ) );
            set_transient( $ck, $out, 10 * MINUTE_IN_SECONDS );
            return new WP_REST_Response( $out, 200 );
        }
    }
    return new WP_REST_Response( array( 'ok' => false, 'error' => 'no_items' ), 200 );
}

/* ------------------------------------------------------------------
 * PUBLISHER FEEDS
 * Curated RSS feeds fetched by the server (no CORS, real publisher URLs).
 * access: open      = article page is normally readable
 *         metered   = may be readable, may hit a paywall
 *         paywalled = headline + one-line summary only (topic discovery, never a script source)
 * Add or remove feeds with the 'autonom_dgs_feeds' filter or by editing this list.
 * Feed URLs come from public lists and were NOT all verified live: use
 *   /wp-json/autonom-dgs/v1/feeds   (the "stats" block shows which feeds answered)
 * ------------------------------------------------------------------ */
function autonom_dgs_feed_registry() {
    $dj   = 'https://feeds.content.dowjones.io/public/rss/';
    $list = array(
        array( 'id' => 'bbc-world',         'name' => 'BBC News',     'access' => 'open',      'url' => 'https://feeds.bbci.co.uk/news/world/rss.xml' ),
        array( 'id' => 'bbc-business',      'name' => 'BBC News',     'access' => 'open',      'url' => 'https://feeds.bbci.co.uk/news/business/rss.xml' ),
        array( 'id' => 'bbc-tech',          'name' => 'BBC News',     'access' => 'open',      'url' => 'https://feeds.bbci.co.uk/news/technology/rss.xml' ),
        array( 'id' => 'aljazeera',         'name' => 'Al Jazeera',   'access' => 'open',      'url' => 'https://www.aljazeera.com/xml/rss/all.xml' ),
        array( 'id' => 'guardian-world',    'name' => 'The Guardian', 'access' => 'open',      'url' => 'https://www.theguardian.com/world/rss' ),
        array( 'id' => 'guardian-business', 'name' => 'The Guardian', 'access' => 'open',      'url' => 'https://www.theguardian.com/business/rss' ),
        array( 'id' => 'dw',                'name' => 'DW',           'access' => 'open',      'url' => 'https://rss.dw.com/rdf/rss-en-top' ),
        array( 'id' => 'npr-world',         'name' => 'NPR',          'access' => 'open',      'url' => 'https://feeds.npr.org/1004/rss.xml' ),
        array( 'id' => 'sky-world',         'name' => 'Sky News',     'access' => 'open',      'url' => 'https://feeds.skynews.com/feeds/rss/world.xml' ),
        array( 'id' => 'euronews',          'name' => 'Euronews',     'access' => 'open',      'url' => 'https://www.euronews.com/rss' ),
        array( 'id' => 'cbc-world',         'name' => 'CBC News',     'access' => 'open',      'url' => 'https://www.cbc.ca/webfeed/rss/rss-world' ),
        array( 'id' => 'france24',          'name' => 'France 24',    'access' => 'open',      'url' => 'https://www.france24.com/en/rss' ),
        array( 'id' => 'guardian-tech',     'name' => 'The Guardian', 'access' => 'open',      'url' => 'https://www.theguardian.com/technology/rss' ),
        array( 'id' => 'npr-business',      'name' => 'NPR',          'access' => 'open',      'url' => 'https://feeds.npr.org/1006/rss.xml' ),
        array( 'id' => 'pbs-newshour',      'name' => 'PBS NewsHour', 'access' => 'open',      'url' => 'https://www.pbs.org/newshour/feeds/rss/headlines' ),
        array( 'id' => 'abc-intl',          'name' => 'ABC News',     'access' => 'open',      'url' => 'https://abcnews.go.com/abcnews/internationalheadlines' ),
        array( 'id' => 'cbs-world',         'name' => 'CBS News',     'access' => 'open',      'url' => 'https://www.cbsnews.com/latest/rss/world' ),
        array( 'id' => 'cnbc-top',          'name' => 'CNBC',         'access' => 'open',      'url' => 'https://www.cnbc.com/id/100003114/device/rss/rss.html' ),
        array( 'id' => 'cnbc-world',        'name' => 'CNBC',         'access' => 'open',      'url' => 'https://www.cnbc.com/id/100727362/device/rss/rss.html' ),
        array( 'id' => 'cnbc-economy',      'name' => 'CNBC',         'access' => 'open',      'url' => 'https://www.cnbc.com/id/20910258/device/rss/rss.html' ),
        array( 'id' => 'un-news',           'name' => 'UN News',      'access' => 'open',      'url' => 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' ),
        array( 'id' => 'japantimes',        'name' => 'The Japan Times', 'access' => 'open',   'url' => 'https://www.japantimes.co.jp/feed/' ),
        array( 'id' => 'thehill',           'name' => 'The Hill',     'access' => 'open',      'url' => 'https://thehill.com/feed/' ),
        array( 'id' => 'axios',             'name' => 'Axios',        'access' => 'open',      'url' => 'https://api.axios.com/feed/' ),
        array( 'id' => 'techcrunch',        'name' => 'TechCrunch',   'access' => 'open',      'url' => 'https://techcrunch.com/feed/' ),
        array( 'id' => 'arstechnica',       'name' => 'Ars Technica', 'access' => 'open',      'url' => 'https://feeds.arstechnica.com/arstechnica/index' ),
        array( 'id' => 'theverge',          'name' => 'The Verge',    'access' => 'open',      'url' => 'https://www.theverge.com/rss/index.xml' ),
        array( 'id' => 'breakingdefense',   'name' => 'Breaking Defense', 'access' => 'open',  'url' => 'https://breakingdefense.com/feed/' ),
        array( 'id' => 'nyt-world',         'name' => 'The New York Times', 'access' => 'metered', 'url' => 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' ),
        array( 'id' => 'wsj-world',         'name' => 'The Wall Street Journal', 'access' => 'paywalled', 'url' => $dj . 'RSSWorldNews' ),
        array( 'id' => 'wsj-markets',       'name' => 'The Wall Street Journal', 'access' => 'paywalled', 'url' => $dj . 'RSSMarketsMain' ),
        array( 'id' => 'wsj-economy',       'name' => 'The Wall Street Journal', 'access' => 'paywalled', 'url' => $dj . 'socialeconomyfeed' ),
        array( 'id' => 'wsj-business',      'name' => 'The Wall Street Journal', 'access' => 'paywalled', 'url' => $dj . 'WSJcomUSBusiness' ),
        array( 'id' => 'wsj-tech',          'name' => 'The Wall Street Journal', 'access' => 'paywalled', 'url' => $dj . 'RSSWSJD' ),
        array( 'id' => 'wsj-politics',      'name' => 'The Wall Street Journal', 'access' => 'paywalled', 'url' => $dj . 'socialpoliticsfeed' ),
    );
    $list = apply_filters( 'autonom_dgs_feeds', $list );
    return is_array( $list ) ? $list : array();
}

/**
 * Fetch many URLs in parallel (WordPress's bundled Requests library), falling back to one-by-one.
 * Returns [ key => ['code'=>int, 'body'=>string, 'error'=>string?] ]
 */
function autonom_dgs_multi_get( $urls, $timeout = 8 ) {
    $out = array();
    $cls = '';
    if ( class_exists( 'WpOrg\\Requests\\Requests' ) ) { $cls = 'WpOrg\\Requests\\Requests'; }
    elseif ( class_exists( 'Requests' ) ) { $cls = 'Requests'; }

    if ( $cls !== '' ) {
        try {
            $reqs = array();
            foreach ( $urls as $k => $u ) {
                $reqs[ $k ] = array(
                    'url'     => $u,
                    'type'    => 'GET',
                    'headers' => array(
                        'User-Agent' => autonom_dgs_news_ua(),
                        'Accept'     => 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
                    ),
                    'options' => array( 'timeout' => $timeout, 'connect_timeout' => $timeout ),
                );
            }
            $res = call_user_func( array( $cls, 'request_multiple' ), $reqs, array( 'timeout' => $timeout, 'connect_timeout' => $timeout ) );
            foreach ( $res as $k => $r ) {
                if ( is_object( $r ) && isset( $r->status_code ) ) {
                    $out[ $k ] = array( 'code' => (int) $r->status_code, 'body' => (string) $r->body );
                } else {
                    $out[ $k ] = array( 'code' => 0, 'body' => '', 'error' => ( is_object( $r ) && method_exists( $r, 'getMessage' ) ) ? $r->getMessage() : 'request failed' );
                }
            }
            return $out;
        } catch ( \Throwable $e ) {
            $out = array(); // fall through to sequential
        }
    }
    foreach ( $urls as $k => $u ) {
        $r = wp_safe_remote_get( $u, array( 'timeout' => $timeout, 'user-agent' => autonom_dgs_news_ua() ) );
        if ( is_wp_error( $r ) ) {
            $out[ $k ] = array( 'code' => 0, 'body' => '', 'error' => $r->get_error_message() );
        } else {
            $out[ $k ] = array( 'code' => (int) wp_remote_retrieve_response_code( $r ), 'body' => (string) wp_remote_retrieve_body( $r ) );
        }
    }
    return $out;
}

/** Parse RSS 2.0, RSS 1.0 (RDF) or Atom into normalised items. */
function autonom_dgs_parse_feed( $xml ) {
    if ( ! class_exists( 'DOMDocument' ) || $xml === '' || strlen( $xml ) > 3000000 ) { return array(); }
    libxml_use_internal_errors( true );
    $dom = new DOMDocument();
    $ok  = $dom->loadXML( $xml, LIBXML_NONET | LIBXML_NOCDATA | LIBXML_NOWARNING | LIBXML_NOERROR );
    libxml_clear_errors();
    if ( ! $ok ) { return array(); }
    $xp    = new DOMXPath( $dom );
    $nodes = $xp->query( '//*[local-name()="item" or local-name()="entry"]' );
    if ( ! $nodes ) { return array(); }
    $out = array();
    foreach ( $nodes as $n ) {
        $title = ''; $link = ''; $desc = ''; $date = '';
        foreach ( $n->childNodes as $c ) {
            if ( $c->nodeType !== XML_ELEMENT_NODE ) { continue; }
            $ln  = $c->localName;
            $txt = trim( $c->textContent );
            if ( $ln === 'title' && $title === '' ) { $title = $txt; }
            elseif ( $ln === 'link' ) {
                $href = $c->getAttribute( 'href' );
                $rel  = $c->getAttribute( 'rel' );
                if ( $href !== '' && ( $rel === '' || $rel === 'alternate' ) ) { $link = $href; }
                elseif ( $link === '' && $txt !== '' ) { $link = $txt; }
            }
            elseif ( ( $ln === 'description' || $ln === 'summary' ) && $desc === '' ) { $desc = $txt; }
            elseif ( $ln === 'content' && $desc === '' ) { $desc = $txt; }
            elseif ( in_array( $ln, array( 'pubDate', 'date', 'published', 'updated' ), true ) && $date === '' ) { $date = $txt; }
        }
        if ( $title === '' || ! preg_match( '#^https?://#i', $link ) ) { continue; }
        $out[] = autonom_dgs_news_item( $title, $link, $date, '', $desc, false );
        if ( count( $out ) >= 40 ) { break; }
    }
    return $out;
}

/** All registry feeds, each cached 10 min (failures 2 min). Returns [ ['feed'=>meta, 'res'=>['ok','code','items','error']] ... ] */
function autonom_dgs_collect_feeds() {
    $reg  = autonom_dgs_feed_registry();
    $need = array();
    $res  = array();
    foreach ( $reg as $i => $f ) {
        $c = get_transient( 'dgs_feed_' . md5( $f['url'] ) );
        if ( is_array( $c ) ) { $res[ $i ] = $c; } else { $need[ $i ] = $f['url']; }
    }
    if ( $need ) {
        $got = autonom_dgs_multi_get( $need, 8 );
        foreach ( $need as $i => $url ) {
            $r = isset( $got[ $i ] ) ? $got[ $i ] : array( 'code' => 0, 'body' => '' );
            if ( $r['code'] === 200 && $r['body'] !== '' ) {
                $items = autonom_dgs_parse_feed( $r['body'] );
                $c = $items
                    ? array( 'ok' => true, 'code' => 200, 'items' => $items )
                    : array( 'ok' => false, 'code' => 200, 'items' => array(), 'error' => 'unparseable' );
            } else {
                $c = array( 'ok' => false, 'code' => (int) $r['code'], 'items' => array(), 'error' => isset( $r['error'] ) ? $r['error'] : ( 'http_' . $r['code'] ) );
            }
            set_transient( 'dgs_feed_' . md5( $url ), $c, $c['ok'] ? 10 * MINUTE_IN_SECONDS : 2 * MINUTE_IN_SECONDS );
            $res[ $i ] = $c;
        }
    }
    $out = array();
    foreach ( $reg as $i => $f ) { $out[] = array( 'feed' => $f, 'res' => $res[ $i ] ); }
    return $out;
}

function autonom_dgs_term_hits( $text, $terms ) {
    $hits  = 0;
    $lower = mb_strtolower( $text );
    foreach ( $terms as $t ) {
        if ( preg_match( '/(?<![\p{L}\p{N}])' . preg_quote( mb_strtolower( $t ), '/' ) . '(?![\p{L}\p{N}])/u', $lower ) ) { $hits++; }
    }
    return $hits;
}

/**
 * GET /wp-json/autonom-dgs/v1/feeds?q=missile OR sanctions OR tariff
 * Returns publisher-feed stories matching the terms (all recent stories if q is empty),
 * plus per-feed status so you can see which feeds work from this server.
 */
function autonom_dgs_rest_feeds( WP_REST_Request $req ) {
    $terms = autonom_dgs_news_terms( (string) $req->get_param( 'q' ), 24 );

    $ipk = 'dgs_frl_' . md5( autonom_dgs_client_ip() );
    $n   = (int) get_transient( $ipk );
    if ( $n >= 80 ) { return new WP_REST_Response( array( 'ok' => false, 'error' => 'rate_limited' ), 429 ); }
    set_transient( $ipk, $n + 1, 10 * MINUTE_IN_SECONDS );

    $collected = autonom_dgs_collect_feeds();
    $cutoff    = time() - 5 * DAY_IN_SECONDS;
    $items     = array();
    $seen      = array();
    $stats     = array();

    foreach ( $collected as $row ) {
        $f = $row['feed'];
        $r = $row['res'];
        $matched = 0;
        foreach ( $r['items'] as $it ) {
            $ts = strtotime( $it['pubDate'] );
            if ( $ts && $ts < $cutoff ) { continue; }
            $hits = $terms ? autonom_dgs_term_hits( $it['title'] . ' ' . $it['description'], $terms ) : 0;
            if ( $terms && $hits === 0 ) { continue; }
            $key = md5( strtolower( $it['link'] ) );
            if ( isset( $seen[ $key ] ) ) { continue; }
            $seen[ $key ] = true;
            $it['author']   = $f['name'];
            $it['readable'] = $f['access'];
            $it['feed']     = $f['id'];
            $it['hits']     = $hits;
            $items[]        = $it;
            $matched++;
        }
        $stats[] = array(
            'id'      => $f['id'],
            'access'  => $f['access'],
            'ok'      => $r['ok'],
            'code'    => $r['code'],
            'count'   => count( $r['items'] ),
            'matched' => $matched,
            'error'   => isset( $r['error'] ) ? $r['error'] : '',
        );
    }

    usort( $items, function ( $a, $b ) {
        if ( $a['hits'] !== $b['hits'] ) { return $b['hits'] - $a['hits']; }
        return strcmp( $b['pubDate'], $a['pubDate'] );
    } );

    return new WP_REST_Response( array(
        'ok'    => count( $items ) > 0,
        'items' => array_slice( $items, 0, 60 ),
        'stats' => $stats,
    ), 200 );
}

/**
 * Shortcode output. Enqueues assets inline (works with page builders + WPCode).
 */
function autonom_dgs_shortcode( $atts, $content = '', $tag = '' ) {
    static $localized = false;

    wp_enqueue_script( 'autonom-dgs-backend' );

    if ( ! $localized ) {
        wp_localize_script( 'autonom-dgs-backend', 'AUTONOM_DGS', array(
            'version'         => AUTONOM_DGS_VERSION,
            'siteEndpoint'    => esc_url_raw( rest_url( 'autonom-dgs/v1/site' ) ),
            'articleEndpoint' => esc_url_raw( rest_url( 'autonom-dgs/v1/article' ) ),
            'newsEndpoint'    => esc_url_raw( rest_url( 'autonom-dgs/v1/news' ) ),
            'feedsEndpoint'   => esc_url_raw( rest_url( 'autonom-dgs/v1/feeds' ) ),
            'llmEndpoint'     => esc_url_raw( rest_url( 'autonom-dgs/v1/llm' ) ),
            'restNonce'       => wp_create_nonce( 'wp_rest' ),
        ) );
        $localized = true;
    }

    ob_start();
    ?>
<style id="dgs-tool-style">
/* Autonom Digest tool design system. Scoped under .dgs-root.
   Shipped inline by the shortcode, so no separate stylesheet or WPCode snippet is needed. */

.dgs-root {
  --dgs-ink: #0d1424;
  --dgs-ink-2: #172036;
  --dgs-ink-line: rgba(255, 255, 255, .12);
  --dgs-ink-text: #e8ecf5;
  --dgs-ink-dim: #93a0ba;
  --dgs-bg: #ffffff;
  --dgs-bg-soft: #f6f7fa;
  --dgs-bg-muted: #eceff5;
  --dgs-border: #dde1ea;
  --dgs-text: #141a2a;
  --dgs-text-muted: #4f5a6e;
  --dgs-text-dim: #7a869b;
  --dgs-accent: #3157f0;
  --dgs-accent-hover: #2142cc;
  --dgs-accent-soft: #edf1ff;
  --dgs-signal: #f5a524;
  --dgs-signal-soft: #fff4de;
  --dgs-critical: #d12c2c;
  --dgs-warning: #b36b00;
  --dgs-passed: #14804a;
  --dgs-radius: 14px;
  --dgs-radius-sm: 9px;
  --dgs-shadow: 0 1px 2px rgba(13, 20, 36, .05), 0 6px 18px rgba(13, 20, 36, .05);
  --dgs-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --dgs-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

  font-family: var(--dgs-sans);
  color: var(--dgs-text);
  line-height: 1.55;
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 0 100px;
  box-sizing: border-box;
  position: relative;
  isolation: isolate;
  font-feature-settings: "cv11", "ss01";
  -webkit-font-smoothing: antialiased;
}
.dgs-root *, .dgs-root *::before, .dgs-root *::after { box-sizing: border-box; }
.dgs-root [hidden] { display: none !important; }
.dgs-root button { font: inherit; cursor: pointer; }
.dgs-root h1, .dgs-root h2, .dgs-root h3, .dgs-root h4 { font-family: var(--dgs-sans); letter-spacing: -.012em; color: var(--dgs-text); }
.dgs-root p, .dgs-root span, .dgs-root label, .dgs-root li, .dgs-root dt, .dgs-root dd,
.dgs-root input, .dgs-root select, .dgs-root textarea, .dgs-root button { font-family: var(--dgs-sans); }
.dgs-root a { color: var(--dgs-accent); }
.dgs-root a:hover, .dgs-root a:focus { color: var(--dgs-accent-hover); background: transparent; }
.dgs-root input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
.dgs-root select, .dgs-root textarea { color: var(--dgs-text); background-color: var(--dgs-bg); }
.dgs-root ::placeholder { color: var(--dgs-text-dim); opacity: 1; }
.dgs-root :focus-visible { outline: 2px solid var(--dgs-accent); outline-offset: 2px; }

/* ---------- Header: control strip + step rail ---------- */
.dgs-root .dgs-topbar { position: sticky; top: 0; z-index: 30; background: var(--dgs-ink); color: var(--dgs-ink-text); border-radius: var(--dgs-radius) var(--dgs-radius) 0 0; box-shadow: 0 8px 24px rgba(13, 20, 36, .18); }
.dgs-root .dgs-topbar-inner { display: flex; align-items: center; justify-content: space-between; gap: 12px 20px; padding: 12px 20px 10px; flex-wrap: wrap; max-width: none; margin: 0; }
.dgs-root .dgs-brand { font-weight: 650; font-size: 15px; white-space: nowrap; letter-spacing: -.01em; display: inline-flex; align-items: center; }
.dgs-root .dgs-brand::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: var(--dgs-signal); margin-right: 10px; box-shadow: 0 0 0 4px rgba(245, 165, 36, .2); }
.dgs-root .dgs-brand-mark { color: #fff; }
.dgs-root .dgs-brand-sep { color: var(--dgs-ink-dim); margin: 0 5px; }
.dgs-root .dgs-brand-sub { color: var(--dgs-ink-dim); font-weight: 500; }
.dgs-root .dgs-topbar-sep { display: none; }
.dgs-root .dgs-topbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.dgs-root .dgs-keys-group { display: inline-flex; align-items: center; gap: 6px; padding: 3px 4px 3px 12px; border: 1px solid var(--dgs-ink-line); border-radius: 999px; background: rgba(255, 255, 255, .05); }
.dgs-root .dgs-keys-group .dgs-keys-title { font-size: 12px; font-weight: 600; letter-spacing: 0; text-transform: none; color: var(--dgs-ink-dim); }
.dgs-root .dgs-api-status { white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; background: rgba(255, 255, 255, .08); font-size: 12px; color: var(--dgs-ink-text); }
.dgs-root .dgs-api-dot { width: 7px; height: 7px; border-radius: 50%; background: #ff6b6b; }
.dgs-root .dgs-api-status.is-ok .dgs-api-dot { background: #3ddc84; box-shadow: 0 0 0 3px rgba(61, 220, 132, .2); }
.dgs-root .dgs-api-status.is-partial .dgs-api-dot { background: var(--dgs-signal); box-shadow: 0 0 0 3px rgba(245, 165, 36, .22); }

.dgs-root .dgs-btn-pill { display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px; border-radius: 999px; border: 1px solid var(--dgs-ink-line); background: rgba(255, 255, 255, .06); color: var(--dgs-ink-text); font-size: 12.5px; font-weight: 500; white-space: nowrap; line-height: 1.2; }
.dgs-root .dgs-privacy-dot { width: 7px; height: 7px; border-radius: 50%; background: #3ddc84; box-shadow: 0 0 0 3px rgba(61, 220, 132, .2); }

/* Step rail: one segment per step, like story progress bars */
.dgs-root .dgs-rail { padding: 0 20px 14px; }
.dgs-root .dgs-steps { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 6px; flex: none; justify-content: stretch; }
.dgs-root .dgs-step { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: baseline; column-gap: 6px; row-gap: 7px; padding: 0; background: transparent; border: 0; border-radius: 0; font-size: 12.5px; font-weight: 500; color: var(--dgs-ink-dim); text-align: left; min-width: 0; }
.dgs-root .dgs-step::before { content: ""; display: block; width: 100%; height: 4px; border-radius: 999px; background: rgba(255, 255, 255, .14); transition: background .2s; grid-column: 1 / -1; }
.dgs-root .dgs-step > span { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dgs-root .dgs-step em { font-style: normal; font-size: 11.5px; font-variant-numeric: tabular-nums; opacity: .65; }
.dgs-root .dgs-step:disabled { opacity: .85; cursor: not-allowed; }
.dgs-root .dgs-step.is-done { color: var(--dgs-ink-text); }
.dgs-root .dgs-step.is-done::before { background: rgba(91, 124, 250, .75); }
.dgs-root .dgs-step.is-active { color: #fff; font-weight: 650; background: transparent; border: 0; }
.dgs-root .dgs-step.is-active::before { background: #fff; }
.dgs-root .dgs-step:not(:disabled):hover, .dgs-root .dgs-step:not(:disabled):focus-visible { background: transparent; color: #fff; border-color: transparent; }
.dgs-root .dgs-step:not(:disabled):hover::before { background: rgba(255, 255, 255, .5); }
.dgs-root .dgs-step.is-done:not(:disabled):hover::before { background: #8fa6ff; }
.dgs-root .dgs-step.is-active:not(:disabled):hover::before { background: #fff; }
.dgs-root .dgs-step:focus-visible { outline-color: #fff; border-radius: 6px; }

/* Privacy drawer */
.dgs-root .dgs-privacy-drawer { border-top: 1px solid var(--dgs-ink-line); background: var(--dgs-ink-2); color: var(--dgs-ink-text); border-radius: 0; }
.dgs-root .dgs-privacy-drawer-inner { max-width: none; margin: 0; padding: 16px 20px; }
.dgs-root .dgs-privacy-drawer h4 { margin: 0 0 10px; font-size: 13px; font-weight: 650; letter-spacing: 0; text-transform: none; color: var(--dgs-ink-dim); }
.dgs-root .dgs-privacy-list { list-style: none; padding: 0; margin: 0 0 14px; display: grid; gap: 7px; font-size: 13.5px; color: var(--dgs-ink-text); }
.dgs-root .dgs-privacy-list li { display: flex; gap: 8px; align-items: flex-start; color: var(--dgs-ink-text); }
.dgs-root .dgs-check { color: #3ddc84; font-weight: 700; }
.dgs-root .dgs-privacy-stats { display: flex; gap: 24px; padding: 12px 0; border-top: 1px solid var(--dgs-ink-line); border-bottom: 1px solid var(--dgs-ink-line); margin-bottom: 12px; flex-wrap: wrap; }
.dgs-root .dgs-privacy-stats > div { display: flex; flex-direction: column; font-size: 12px; color: var(--dgs-ink-dim); }
.dgs-root .dgs-privacy-stats strong { font-size: 18px; color: #fff; font-variant-numeric: tabular-nums; }
.dgs-root .dgs-privacy-note { font-size: 12.5px; color: var(--dgs-ink-dim); margin: 0; }

/* ---------- Panels ---------- */
.dgs-root .dgs-panel { padding: 30px 22px 40px; background: var(--dgs-bg); border: 1px solid var(--dgs-border); border-top: 0; border-radius: 0 0 var(--dgs-radius) var(--dgs-radius); }
.dgs-root .dgs-panel-head { margin-bottom: 22px; }
.dgs-root .dgs-panel-head h2 { margin: 0 0 6px; font-size: 24px; font-weight: 700; letter-spacing: -.02em; }
.dgs-root .dgs-lead { margin: 0; color: var(--dgs-text-muted); font-size: 15px; max-width: 70ch; }

/* Mode cards */
.dgs-root .dgs-mode-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-bottom: 24px; align-items: stretch; }
.dgs-root .dgs-mode-card { display: block; text-align: left; padding: 20px; border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius); background: var(--dgs-bg); color: var(--dgs-text); transition: border-color .15s, box-shadow .15s, background-color .15s; }
.dgs-root .dgs-mode-card h3 { margin: 0 0 6px; font-size: 15.5px; font-weight: 650; color: inherit; }
.dgs-root .dgs-mode-card p { margin: 0; color: var(--dgs-text-muted); font-size: 13.5px; }
.dgs-root .dgs-mode-card:hover, .dgs-root .dgs-mode-card:focus-visible { border-color: var(--dgs-accent); background: var(--dgs-bg); box-shadow: var(--dgs-shadow); color: var(--dgs-text); }
.dgs-root .dgs-mode-card.is-selected { border-color: var(--dgs-accent); background: var(--dgs-accent-soft); box-shadow: 0 0 0 3px rgba(49, 87, 240, .12); }
.dgs-root .dgs-mode-card.is-selected:hover { background: var(--dgs-accent-soft); }

/* Forms */
.dgs-root .dgs-mode-form { padding: 20px; border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius); background: var(--dgs-bg-soft); display: grid; gap: 14px; }
.dgs-root .dgs-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.dgs-root .dgs-field { display: grid; gap: 6px; }
.dgs-root .dgs-label { font-size: 13px; font-weight: 600; color: var(--dgs-text); }
.dgs-root .dgs-label small { color: var(--dgs-text-dim); font-weight: 400; }
.dgs-root .dgs-field input, .dgs-root .dgs-field select, .dgs-root .dgs-field textarea {
  padding: 10px 12px; border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius-sm);
  background: var(--dgs-bg); font: inherit; color: var(--dgs-text); font-size: 14px; width: 100%;
  transition: border-color .15s, box-shadow .15s;
}
.dgs-root .dgs-field input:focus, .dgs-root .dgs-field select:focus, .dgs-root .dgs-field textarea:focus {
  outline: none; border-color: var(--dgs-accent); box-shadow: 0 0 0 3px rgba(49, 87, 240, .16);
}
.dgs-root .dgs-field input[type="checkbox"], .dgs-root .dgs-field input[type="radio"] { width: auto; flex: none; padding: 0; margin-top: 4px; accent-color: var(--dgs-accent); }
.dgs-root .dgs-hint.dgs-test-res { display: block; min-height: 1.2em; margin-top: 6px; font-weight: 600; }
.dgs-root .dgs-hint.dgs-test-res.is-ok { color: var(--dgs-passed); }
.dgs-root .dgs-hint.dgs-test-res.is-bad { color: var(--dgs-critical); }
.dgs-root .dgs-guide { margin: 10px 0 14px; padding: 9px 14px; border-left: 3px solid var(--dgs-accent, #2563eb); background: var(--dgs-bg-muted); border-radius: 6px; font-size: 14px; color: var(--dgs-text); }
.dgs-root .dgs-guide[hidden] { display: none; }
.dgs-root .dgs-hint { font-size: 12.5px; color: var(--dgs-text-dim); margin: 0; }
.dgs-root .dgs-link { background: none; border: none; color: var(--dgs-accent); padding: 0; text-decoration: underline; font-size: inherit; }
.dgs-root .dgs-link:hover, .dgs-root .dgs-link:focus { background: none; color: var(--dgs-accent-hover); }

/* Buttons */
.dgs-root .dgs-actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
.dgs-root .dgs-btn { padding: 10px 18px; border-radius: var(--dgs-radius-sm); border: 1px solid var(--dgs-border); background: var(--dgs-bg); font-size: 14px; font-weight: 600; color: var(--dgs-text); transition: background-color .15s, border-color .15s, box-shadow .15s; line-height: 1.25; }
.dgs-root .dgs-btn-primary { background: var(--dgs-accent); color: #fff; border-color: var(--dgs-accent); box-shadow: 0 1px 2px rgba(49, 87, 240, .3); }
.dgs-root .dgs-btn-primary:disabled { opacity: .5; cursor: not-allowed; }

/* Story list */
.dgs-root .dgs-story-list { display: grid; gap: 10px; margin-top: 20px; }
.dgs-root .dgs-story { display: grid; grid-template-columns: auto 1fr auto; gap: 14px; padding: 14px; border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius); background: var(--dgs-bg); align-items: start; cursor: pointer; }
.dgs-root .dgs-story.is-selected { border-color: var(--dgs-accent); background: var(--dgs-accent-soft); }
.dgs-root .dgs-story input[type="checkbox"] { margin-top: 4px; width: 16px; height: 16px; accent-color: var(--dgs-accent); }
.dgs-root .dgs-story-title { font-weight: 600; font-size: 14.5px; margin: 0 0 4px; }
.dgs-root .dgs-story-meta { font-size: 12.5px; color: var(--dgs-text-dim); display: flex; gap: 10px; flex-wrap: wrap; }
.dgs-root .dgs-story-score { font-size: 12px; font-weight: 700; color: var(--dgs-accent); white-space: nowrap; }

/* Profile view */
.dgs-root .dgs-profile-editor { margin-top: 24px; padding: 20px; border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius); background: var(--dgs-bg); }
.dgs-root .dgs-editor-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.dgs-root .dgs-editor-head h3 { margin: 0; font-size: 16px; }
.dgs-root .dgs-editor-actions { display: flex; gap: 8px; }
.dgs-root .dgs-profile-view dl { display: grid; grid-template-columns: 160px 1fr; gap: 10px 16px; margin: 0; font-size: 14px; }
.dgs-root .dgs-profile-view dt { color: var(--dgs-text-dim); font-weight: 500; }
.dgs-root .dgs-profile-view dd { margin: 0; }
.dgs-root .dgs-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.dgs-root .dgs-chip { display: inline-block; padding: 3px 10px; border-radius: 999px; background: var(--dgs-accent-soft); color: var(--dgs-accent); font-size: 12px; font-weight: 600; }
.dgs-root .dgs-chip.is-muted { background: var(--dgs-bg-muted); color: var(--dgs-text-muted); }

/* Script cards */
.dgs-root .dgs-script-list { display: grid; gap: 16px; margin-top: 20px; }
.dgs-root .dgs-script-card { padding: 18px; border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius); background: var(--dgs-bg); }
.dgs-root .dgs-script-card h4 { margin: 0 0 4px; font-size: 15px; }
.dgs-root .dgs-script-source { font-size: 12.5px; color: var(--dgs-text-dim); margin: 0 0 14px; }
.dgs-root .dgs-script-section { margin-bottom: 12px; }
.dgs-root .dgs-script-section label { display: block; font-size: 12px; font-weight: 600; color: var(--dgs-text-dim); margin-bottom: 4px; }
.dgs-root .dgs-script-section textarea { width: 100%; min-height: 60px; padding: 10px; border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius-sm); font: inherit; font-size: 13.5px; resize: vertical; background: var(--dgs-bg); color: var(--dgs-text); }
.dgs-root .dgs-script-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.dgs-root .dgs-script-actions { display: flex; gap: 8px; margin-top: 12px; }

/* Export */
.dgs-root .dgs-export-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 24px; }
.dgs-root .dgs-export-card { text-align: left; padding: 18px; border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius); background: var(--dgs-bg); color: var(--dgs-text); transition: border-color .15s, box-shadow .15s; }
.dgs-root .dgs-export-card h3 { margin: 0 0 6px; font-size: 15px; color: inherit; }
.dgs-root .dgs-export-card p { margin: 0; color: var(--dgs-text-muted); font-size: 13.5px; }
.dgs-root .dgs-payload-preview { padding: 16px; border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius); background: var(--dgs-bg-soft); }
.dgs-root .dgs-payload-preview h3 { margin: 0 0 4px; font-size: 14px; }
.dgs-root .dgs-payload-preview pre { max-height: 320px; overflow: auto; padding: 14px; border-radius: var(--dgs-radius-sm); background: var(--dgs-ink); color: #d7e0f2; font-family: var(--dgs-mono); font-size: 12px; line-height: 1.5; margin: 10px 0 0; }

/* Progress */
.dgs-root .dgs-progress { margin: 20px 0; }
.dgs-root .dgs-progress-bar { height: 5px; background: var(--dgs-bg-muted); border-radius: 999px; overflow: hidden; }
.dgs-root .dgs-progress-fill { height: 100%; width: 0; background: var(--dgs-accent); transition: width .3s; border-radius: 999px; }
.dgs-root .dgs-progress-label { font-size: 13px; color: var(--dgs-text-muted); margin: 8px 0 0; }

/* Drawer + toast */
.dgs-root .dgs-drawer { position: fixed; inset: 0; background: rgba(13, 20, 36, .5); z-index: 9999; display: flex; justify-content: flex-end; }
.dgs-root .dgs-drawer-inner { width: min(580px, 100%); background: var(--dgs-bg); height: 100%; overflow: hidden; padding: 0; display: flex; flex-direction: column; box-shadow: -12px 0 40px rgba(13, 20, 36, .25); }
.dgs-root .dgs-drawer-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 20px 24px 12px; }
.dgs-root .dgs-drawer-head .dgs-hint { margin-top: 2px; }
.dgs-root .dgs-drawer-head h3 { margin: 0; font-size: 17px; }
.dgs-root .dgs-btn-close { background: none; border: none; font-size: 24px; line-height: 1; color: var(--dgs-text-muted); padding: 2px 8px; border-radius: 8px; }
.dgs-root .dgs-drawer-actions { margin: 0; padding: 14px 24px; border-top: 1px solid var(--dgs-border); background: var(--dgs-bg); display: flex; align-items: center; gap: 14px; flex-wrap: wrap; box-shadow: 0 -6px 16px rgba(13, 20, 36, .05); }
.dgs-root .dgs-drawer-actions .dgs-btn-primary { padding: 12px 26px; font-size: 15px; }
.dgs-root .dgs-drawer-body { flex: 1; overflow-y: auto; padding: 18px 24px 28px; display: grid; gap: 14px; align-content: start; }
.dgs-root .dgs-set-tabs { display: flex; gap: 4px; padding: 0 24px; border-bottom: 1px solid var(--dgs-border); }
.dgs-root .dgs-set-tab { background: transparent; border: 0; border-bottom: 3px solid transparent; border-radius: 0; padding: 10px 14px; font-size: 14px; font-weight: 600; color: var(--dgs-text-muted); margin-bottom: -1px; }
.dgs-root .dgs-set-tab.is-active { color: var(--dgs-accent); border-bottom-color: var(--dgs-accent); background: transparent; }
.dgs-root .dgs-set-sec { display: grid; gap: 14px; align-content: start; }
.dgs-root .dgs-set-h { margin: 8px 0 -6px; font-size: 15px; font-weight: 700; letter-spacing: -.01em; padding-top: 14px; border-top: 1px solid var(--dgs-border); }
.dgs-root .dgs-set-sec > .dgs-set-h:first-child { border-top: 0; padding-top: 0; margin-top: 0; }
.dgs-root .dgs-lnk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
.dgs-root .dgs-set-sources { display: flex; flex-wrap: wrap; gap: 8px; }
.dgs-root .dgs-src { padding: 5px 12px; border-radius: 999px; border: 1px dashed var(--dgs-border); font-size: 12.5px; color: var(--dgs-text-dim); }
.dgs-root .dgs-src.is-on { border-style: solid; border-color: var(--dgs-accent); background: var(--dgs-accent-soft); color: var(--dgs-accent); font-weight: 600; }
.dgs-root .dgs-pill-k { font-size: 11.5px; font-weight: 600; color: var(--dgs-ink-dim); padding-right: 8px; margin-right: 2px; border-right: 1px solid var(--dgs-ink-line); }
.dgs-root .dgs-pill-name { font-weight: 650; }
/* Toasts are appended to <body>, outside .dgs-root, so they carry their own colours. */
.dgs-toast { position: fixed; bottom: 88px; left: 50%; transform: translateX(-50%) translateY(20px); padding: 12px 20px; border-radius: 9px; background: #0d1424; color: #fff; font: 500 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; opacity: 0; transition: opacity .3s, transform .3s; z-index: 2147483000; max-width: min(560px, 90vw); box-shadow: 0 10px 30px rgba(13, 20, 36, .3); pointer-events: none; }
.dgs-toast.is-on { opacity: 1; transform: translateX(-50%) translateY(0); }
.dgs-toast.is-error { background: #d12c2c; }
.dgs-toast.is-success, .dgs-toast.is-ok { background: #14804a; }
.dgs-toast.dgs-toast-undo { pointer-events: auto; }

/* ---------- Theme-proof hover/focus layer ----------
   WordPress themes style button:hover and button:focus. That rule outranks our single-class
   rules, which is how text ended up unreadable. Every button gets an explicit state below,
   driven by three variables that variants override. */
.dgs-root button { --hbg: var(--dgs-bg-muted); --hfg: var(--dgs-text); --hbd: var(--dgs-text-dim); }
.dgs-root .dgs-btn-primary, .dgs-root .dgs-vid-make, .dgs-root .dgs-seg-btn.is-on { --hbg: var(--dgs-accent-hover); --hfg: #fff; --hbd: var(--dgs-accent-hover); }
.dgs-root .dgs-seg-btn.is-on { --hbg: #000; --hbd: #000; }
.dgs-root .dgs-plan-tg button.is-on { --hbg: #fff; --hfg: var(--dgs-text); --hbd: transparent; }
.dgs-root .dgs-plan-tg button { --hbg: rgba(13, 20, 36, .06); --hfg: var(--dgs-text); --hbd: transparent; }
.dgs-root .dgs-opt.is-on, .dgs-root .dgs-mode-card.is-selected { --hbg: var(--dgs-accent-soft); --hfg: var(--dgs-accent); --hbd: var(--dgs-accent); }
.dgs-root .dgs-mode-card, .dgs-root .dgs-export-card, .dgs-root .dgs-tile { --hbg: var(--dgs-bg); --hfg: var(--dgs-text); --hbd: var(--dgs-accent); }
.dgs-root .dgs-btn-pill { --hbg: rgba(255, 255, 255, .16); --hfg: #fff; --hbd: rgba(255, 255, 255, .4); }
.dgs-root .dgs-step, .dgs-root .dgs-btn-close, .dgs-root .dgs-link, .dgs-root .dgs-set-tab { --hbg: transparent; --hfg: inherit; --hbd: transparent; }
.dgs-root .dgs-btn-close { --hbg: var(--dgs-bg-muted); --hfg: var(--dgs-text); }
.dgs-root .dgs-link { --hfg: var(--dgs-accent-hover); }
.dgs-root button:hover:not(:disabled):not(.dgs-step),
.dgs-root button:focus:not(:disabled):not(.dgs-step),
.dgs-root button:active:not(:disabled):not(.dgs-step) {
  background-color: var(--hbg); color: var(--hfg); border-color: var(--hbd);
  text-shadow: none; text-decoration-color: currentColor;
}
.dgs-root .dgs-btn-primary:hover:not(:disabled), .dgs-root .dgs-btn-primary:focus:not(:disabled) { box-shadow: 0 4px 14px rgba(49, 87, 240, .35); }
.dgs-root button:disabled { opacity: .55; cursor: not-allowed; }

/* Links styled as buttons keep their own colours on hover (themes recolour a:hover) */
.dgs-root a.dgs-btn { display: inline-block; text-decoration: none; }
.dgs-root a.dgs-btn-primary, .dgs-root a.dgs-btn-primary:hover, .dgs-root a.dgs-btn-primary:focus { color: #fff; background: var(--dgs-accent); border-color: var(--dgs-accent); }
.dgs-root a.dgs-btn-primary:hover { background: var(--dgs-accent-hover); }
.dgs-root a.dgs-btn-ghost, .dgs-root a.dgs-btn-ghost:hover, .dgs-root a.dgs-btn-ghost:focus { color: var(--dgs-text); }
.dgs-root a.dgs-btn-ghost:hover { background: var(--dgs-bg-muted); border-color: var(--dgs-text-dim); }

/* ---------- Review window (sits outside .dgs-root, so it carries its own tokens and buttons) ---------- */
.dgs-modal {
  --dgs-ink: #0d1424;
  --dgs-ink-2: #172036;
  --dgs-ink-line: rgba(255, 255, 255, .12);
  --dgs-ink-text: #e8ecf5;
  --dgs-ink-dim: #93a0ba;
  --dgs-bg: #ffffff;
  --dgs-bg-soft: #f6f7fa;
  --dgs-bg-muted: #eceff5;
  --dgs-border: #dde1ea;
  --dgs-text: #141a2a;
  --dgs-text-muted: #4f5a6e;
  --dgs-text-dim: #7a869b;
  --dgs-accent: #3157f0;
  --dgs-accent-hover: #2142cc;
  --dgs-accent-soft: #edf1ff;
  --dgs-signal: #f5a524;
  --dgs-signal-soft: #fff4de;
  --dgs-critical: #d12c2c;
  --dgs-warning: #b36b00;
  --dgs-passed: #14804a;
  --dgs-radius: 14px;
  --dgs-radius-sm: 9px;
  --dgs-shadow: 0 1px 2px rgba(13, 20, 36, .05), 0 6px 18px rgba(13, 20, 36, .05);
  --dgs-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --dgs-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

  font-family: var(--dgs-sans);
  line-height: 1.5;
}
/* Buttons */
.dgs-modal .dgs-actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
.dgs-modal .dgs-btn { padding: 10px 18px; border-radius: var(--dgs-radius-sm); border: 1px solid var(--dgs-border); background: var(--dgs-bg); font-size: 14px; font-weight: 600; color: var(--dgs-text); transition: background-color .15s, border-color .15s, box-shadow .15s; line-height: 1.25; }
.dgs-modal .dgs-btn-primary { background: var(--dgs-accent); color: #fff; border-color: var(--dgs-accent); box-shadow: 0 1px 2px rgba(49, 87, 240, .3); }
.dgs-modal .dgs-btn-primary:disabled { opacity: .5; cursor: not-allowed; }

/* ---------- Theme-proof hover/focus layer ----------
   WordPress themes style button:hover and button:focus. That rule outranks our single-class
   rules, which is how text ended up unreadable. Every button gets an explicit state below,
   driven by three variables that variants override. */
.dgs-modal button { --hbg: var(--dgs-bg-muted); --hfg: var(--dgs-text); --hbd: var(--dgs-text-dim); }
.dgs-modal .dgs-btn-primary, .dgs-modal .dgs-vid-make, .dgs-modal .dgs-seg-btn.is-on { --hbg: var(--dgs-accent-hover); --hfg: #fff; --hbd: var(--dgs-accent-hover); }
.dgs-modal .dgs-seg-btn.is-on { --hbg: #000; --hbd: #000; }
.dgs-modal .dgs-plan-tg button.is-on { --hbg: #fff; --hfg: var(--dgs-text); --hbd: transparent; }
.dgs-modal .dgs-plan-tg button { --hbg: rgba(13, 20, 36, .06); --hfg: var(--dgs-text); --hbd: transparent; }
.dgs-modal .dgs-opt.is-on, .dgs-modal .dgs-mode-card.is-selected { --hbg: var(--dgs-accent-soft); --hfg: var(--dgs-accent); --hbd: var(--dgs-accent); }
.dgs-modal .dgs-mode-card, .dgs-modal .dgs-export-card, .dgs-modal .dgs-tile { --hbg: var(--dgs-bg); --hfg: var(--dgs-text); --hbd: var(--dgs-accent); }
.dgs-modal .dgs-btn-pill { --hbg: rgba(255, 255, 255, .16); --hfg: #fff; --hbd: rgba(255, 255, 255, .4); }
.dgs-modal .dgs-step, .dgs-modal .dgs-btn-close, .dgs-modal .dgs-link, .dgs-modal .dgs-set-tab { --hbg: transparent; --hfg: inherit; --hbd: transparent; }
.dgs-modal .dgs-btn-close { --hbg: var(--dgs-bg-muted); --hfg: var(--dgs-text); }
.dgs-modal .dgs-link { --hfg: var(--dgs-accent-hover); }
.dgs-modal button:hover:not(:disabled),
.dgs-modal button:focus:not(:disabled),
.dgs-modal button:active:not(:disabled) {
  background-color: var(--hbg); color: var(--hfg); border-color: var(--hbd);
  text-shadow: none; text-decoration-color: currentColor;
}
.dgs-modal .dgs-btn-primary:hover:not(:disabled), .dgs-modal .dgs-btn-primary:focus:not(:disabled) { box-shadow: 0 4px 14px rgba(49, 87, 240, .35); }
.dgs-modal button:disabled { opacity: .55; cursor: not-allowed; }

/* Links styled as buttons keep their own colours on hover (themes recolour a:hover) */
.dgs-modal a.dgs-btn { display: inline-block; text-decoration: none; }
.dgs-modal a.dgs-btn-primary, .dgs-modal a.dgs-btn-primary:hover, .dgs-modal a.dgs-btn-primary:focus { color: #fff; background: var(--dgs-accent); border-color: var(--dgs-accent); }
.dgs-modal a.dgs-btn-primary:hover { background: var(--dgs-accent-hover); }
.dgs-modal a.dgs-btn-ghost, .dgs-modal a.dgs-btn-ghost:hover, .dgs-modal a.dgs-btn-ghost:focus { color: var(--dgs-text); }
.dgs-modal a.dgs-btn-ghost:hover { background: var(--dgs-bg-muted); border-color: var(--dgs-text-dim); }


.dgs-modal button { font-family: var(--dgs-sans); cursor: pointer; }
.dgs-modal :focus-visible { outline: 2px solid var(--dgs-accent); outline-offset: 2px; }

/* ---------- Responsive ---------- */
@media (max-width: 760px) {
  .dgs-root .dgs-lnk-grid { grid-template-columns: 1fr; }
  .dgs-root .dgs-set-tab { padding: 10px 9px; font-size: 13px; }
  .dgs-root .dgs-topbar { position: static; border-radius: 12px 12px 0 0; }
  .dgs-root .dgs-rail { overflow-x: auto; padding-bottom: 12px; }
  .dgs-root .dgs-steps { grid-template-columns: repeat(8, minmax(88px, 1fr)); min-width: 760px; }
  .dgs-root .dgs-grid-2 { grid-template-columns: 1fr; }
  .dgs-root .dgs-profile-view dl { grid-template-columns: 1fr; gap: 4px 0; }
  .dgs-root .dgs-profile-view dt { margin-top: 8px; }
  .dgs-root .dgs-panel { padding: 22px 14px 32px; }
  .dgs-root .dgs-keys-group .dgs-keys-title { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .dgs-root *, .dgs-root *::before, .dgs-root *::after { transition: none !important; animation: none !important; }
}

/* ---------- Autonom Digest (mode: digest) ---------- */
.dgs-root[data-mode="digest"] .dgs-steps { grid-template-columns: repeat(8, minmax(0, 1fr)); }
.dgs-root[data-mode="digest"] .dgs-set-tab[data-tab="video"], .dgs-root[data-mode="digest"] .dgs-set-sec[data-tab="video"] { display: none !important; }
.dgs-root .dgs-feed-overview { margin-top: 20px; padding: 18px 20px; border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius); background: var(--dgs-bg-soft); display: grid; gap: 14px; }
.dgs-root .dgs-fo-h { margin: 0; font-size: 16px; font-weight: 700; }
.dgs-root .dgs-fo-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.dgs-root .dgs-fo-stat { background: var(--dgs-bg); border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius-sm); padding: 10px 12px; display: grid; gap: 2px; }
.dgs-root .dgs-fo-stat strong { font-size: 22px; font-weight: 700; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.dgs-root .dgs-fo-stat span { font-size: 12.5px; color: var(--dgs-text-muted); }
.dgs-root .dgs-fo-bars { display: grid; gap: 7px; }
.dgs-root .dgs-fo-bar { display: grid; grid-template-columns: minmax(90px, 200px) 1fr 34px; gap: 10px; align-items: center; font-size: 13px; }
.dgs-root .dgs-fo-bar-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dgs-text); }
.dgs-root .dgs-fo-bar.is-dim .dgs-fo-bar-name { color: var(--dgs-text-dim); }
.dgs-root .dgs-fo-bar-track { display: block; height: 8px; border-radius: 999px; background: var(--dgs-bg-muted); overflow: hidden; }
.dgs-root .dgs-fo-bar-track i { display: block; height: 100%; background: var(--dgs-accent); border-radius: 999px; }
.dgs-root .dgs-fo-bar.is-dim .dgs-fo-bar-track i { background: var(--dgs-text-dim); }
.dgs-root .dgs-fo-bar-n { text-align: right; font-variant-numeric: tabular-nums; color: var(--dgs-text-muted); }
.dgs-root .dgs-fo-hints { background: var(--dgs-signal-soft); border: 1px solid #f0d9a8; border-radius: var(--dgs-radius-sm); padding: 10px 14px; font-size: 13px; color: var(--dgs-text); }
.dgs-root .dgs-fo-hints ul { margin: 6px 0 0; padding-left: 18px; display: grid; gap: 4px; }
.dgs-root .dgs-fo-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.dgs-root .dgs-fo-sel { font-size: 13px; color: var(--dgs-text-muted); margin-left: auto; font-weight: 600; }
.dgs-root .dgs-btn-sm { padding: 5px 11px; font-size: 12.5px; }
.dgs-root .dgs-icon-btn { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--dgs-border); background: var(--dgs-bg); color: var(--dgs-text); line-height: 1; }
.dgs-root .dgs-icon-btn:disabled { opacity: .35; cursor: not-allowed; }
.dgs-root .dgs-icon-btn:not(:disabled):hover { background: var(--dgs-accent-soft); border-color: var(--dgs-accent); }
.dgs-root .dgs-clu-bar { align-items: center; margin-bottom: 4px; }
.dgs-root .dgs-clu-count { display: inline-flex; align-items: center; gap: 8px; }
.dgs-root .dgs-clu-count select, .dgs-root .dgs-clu-move { border: 1px solid var(--dgs-border); border-radius: 8px; padding: 6px 8px; font-size: 13px; background: var(--dgs-bg); max-width: 100%; }
.dgs-root .dgs-clu-prog { margin: 14px 0; }
.dgs-root .dgs-clu-prog-label { font-size: 13px; color: var(--dgs-text-muted); }
.dgs-root .dgs-clu-prog-bar { height: 4px; border-radius: 999px; background: var(--dgs-bg-muted); overflow: hidden; margin-top: 6px; position: relative; }
.dgs-root .dgs-clu-prog-bar i { position: absolute; inset: 0 auto 0 0; width: 30%; background: var(--dgs-accent); border-radius: 999px; animation: dgs-clu-slide 1.2s ease-in-out infinite; }
@keyframes dgs-clu-slide { 0% { left: -30%; } 100% { left: 100%; } }
.dgs-root .dgs-clu, .dgs-root .dgs-out-sec, .dgs-root .dgs-out-card { border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius); background: var(--dgs-bg); padding: 14px 16px; margin-top: 14px; box-shadow: var(--dgs-shadow); }
.dgs-root .dgs-clu.is-left { background: var(--dgs-bg-soft); box-shadow: none; }
.dgs-root .dgs-clu-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dgs-root .dgs-clu-n { flex: none; width: 26px; height: 26px; border-radius: 50%; background: var(--dgs-ink); color: #fff; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.dgs-root .dgs-clu-title { flex: 1 1 220px; min-width: 0; font-size: 16px; font-weight: 650; border: 1px solid transparent; border-radius: 8px; padding: 6px 8px; background: transparent; }
.dgs-root .dgs-clu-title:hover, .dgs-root .dgs-clu-title:focus { border-color: var(--dgs-border); background: var(--dgs-bg); }
.dgs-root .dgs-clu-tools { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.dgs-root .dgs-clu-thread { width: 100%; margin: 8px 0 4px; border: 1px solid transparent; border-radius: 8px; padding: 6px 8px; font-size: 13.5px; color: var(--dgs-text-muted); background: transparent; }
.dgs-root .dgs-clu-thread:hover, .dgs-root .dgs-clu-thread:focus { border-color: var(--dgs-border); background: var(--dgs-bg); }
.dgs-root .dgs-clu-stories { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
.dgs-root .dgs-clu-story { display: flex; gap: 12px; justify-content: space-between; align-items: flex-start; padding: 9px 12px; border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius-sm); background: var(--dgs-bg-soft); }
.dgs-root .dgs-clu-story-main { min-width: 0; display: grid; gap: 3px; font-size: 14px; }
.dgs-root .dgs-clu-story-main a { font-weight: 600; text-decoration: none; }
.dgs-root .dgs-clu-story-main a:hover { text-decoration: underline; }
.dgs-root .dgs-chip.is-ok { background: #e6f5ec; color: var(--dgs-passed); }
.dgs-root .dgs-chip.is-bad { background: #fdecec; color: var(--dgs-critical); }
.dgs-root .dgs-clu-warn { margin: 8px 0 0; font-size: 12.5px; color: var(--dgs-warning); }
.dgs-root .dgs-clu-stale { margin: 12px 0 0; padding: 10px 14px; border-radius: var(--dgs-radius-sm); background: var(--dgs-signal-soft); font-size: 13px; }
.dgs-root .dgs-out-h { margin: 0 0 8px; font-size: 14px; font-weight: 700; }
.dgs-root .dgs-out-radio, .dgs-root .dgs-out-check { display: flex; gap: 10px; align-items: flex-start; padding: 4px 0; font-size: 14px; cursor: pointer; }
.dgs-root .dgs-out-input { width: 100%; margin-top: 6px; border: 1px solid var(--dgs-border); border-radius: 8px; padding: 8px 10px; font-size: 14px; }
.dgs-root .dgs-out-sec.is-off { opacity: .55; }
.dgs-root .dgs-out-lens { display: flex; gap: 10px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
.dgs-root .dgs-out-why { margin: 6px 0 0; font-size: 13px; color: var(--dgs-text-muted); }
.dgs-root .dgs-out-src { margin: 4px 0 0; font-size: 12.5px; color: var(--dgs-text-dim); }
@media (max-width: 640px) {
  .dgs-root .dgs-fo-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dgs-root .dgs-fo-bar { grid-template-columns: 90px 1fr 28px; }
  .dgs-root .dgs-clu-story { flex-direction: column; }
  .dgs-root[data-mode="digest"] .dgs-steps { overflow-x: auto; grid-template-columns: repeat(8, 84px); }
}

.dgs-root .dgs-wr-h { flex: 1 1 200px; font-size: 16px; font-weight: 650; min-width: 0; }
.dgs-root .dgs-wr-text { margin-top: 10px; }
.dgs-root .dgs-wr-ta { line-height: 1.6; font-size: 15px; min-height: 140px; resize: vertical; }
.dgs-root .dgs-wr-bar { display: flex; gap: 10px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
.dgs-root .dgs-wr-flags { display: grid; gap: 4px; margin-top: 6px; }
.dgs-root .dgs-chip.is-warn { background: var(--dgs-signal-soft); color: var(--dgs-warning); }
.dgs-root .dgs-field > .dgs-out-input { margin-top: 4px; }

.dgs-root .dgs-rv-check { list-style: none; margin: 14px 0; padding: 0; display: grid; gap: 6px; }
.dgs-root .dgs-rv-check li { display: flex; gap: 10px; font-size: 14px; align-items: flex-start; }
.dgs-root .dgs-rv-mark { flex: none; width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; }
.dgs-root .dgs-rv-check .is-ok .dgs-rv-mark { background: var(--dgs-passed); }
.dgs-root .dgs-rv-check .is-warn .dgs-rv-mark { background: var(--dgs-warning); }
.dgs-root .dgs-rv-check .is-bad .dgs-rv-mark { background: var(--dgs-critical); }
.dgs-root .dgs-rv-preview { border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius); padding: 24px 28px; margin: 16px 0; background: #fff; color: #141a2a; max-width: 980px; }
.dgs-root .dgs-rv-preview .dgs-pv-title { font-size: 28px; line-height: 1.25; margin: 0 0 14px; }
.dgs-root .dgs-style-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin: 10px 0 14px; }
.dgs-root .dgs-style-card { display: grid; gap: 4px; text-align: left; padding: 10px; border: 1px solid var(--dgs-border); border-radius: 10px; background: transparent; color: inherit; cursor: pointer; }
.dgs-root .dgs-style-card strong { font-size: 14px; }
.dgs-root .dgs-style-card small { font-size: 12px; opacity: .75; line-height: 1.35; }
.dgs-root .dgs-style-card.is-on { border-color: #f5a524; box-shadow: 0 0 0 2px rgba(245, 165, 36, .35); }
.dgs-root .dgs-style-sw { display: flex; height: 22px; border-radius: 6px; overflow: hidden; border: 1px solid rgba(128, 128, 128, .35); }
.dgs-root .dgs-style-sw i { flex: 1; display: block; }
.dgs-root .dgs-ex-prev { margin: 8px 0; }
.dgs-root .dgs-ex-prev summary { cursor: pointer; font-size: 14px; padding: 6px 0; }
.dgs-root .dgs-set-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 6px 0; }
.dgs-root .dgs-out-check.is-nudge { outline: 2px solid #f5a524; outline-offset: 6px; border-radius: 8px; animation: dgs-nudge .6s ease 3; }
@keyframes dgs-nudge { 50% { outline-color: transparent; } }
.dgs-root .dgs-ex-code { font-family: var(--dgs-mono); font-size: 12px; margin-top: 12px; }
.dgs-root .dgs-ex-canvas { width: 100%; max-width: 600px; height: auto; border-radius: 10px; display: block; margin: 10px 0; }
.dgs-root .dgs-ex-count { color: var(--dgs-text-dim); font-weight: 500; }
.dgs-root .dgs-ex-count.is-over { color: var(--dgs-critical); font-weight: 700; }

.dgs-root .dgs-ch-card { border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius); padding: 12px 14px; margin-top: 12px; background: var(--dgs-bg); }
.dgs-root .dgs-ch-card.is-off { opacity: .55; }
.dgs-root .dgs-ch-prev { margin: 10px 0; max-width: 720px; }
.dgs-root .dgs-ch-prev svg { width: 100%; height: auto; display: block; }
.dgs-root .dgs-ex-canvas + .dgs-actions { margin-top: 6px; }

.dgs-root .dgs-ex-canvas + .dgs-actions { margin-top: 6px; }

/* ---------- Feed tools, Topics editor and step navigation (rendered by the script) ---------- */
.dgs-root .dgs-feed-tools { margin: 14px 0 6px; }
.dgs-root .dgs-ft-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 16px; }
.dgs-root .dgs-seg { display: inline-flex; padding: 3px; gap: 2px; border: 1px solid var(--dgs-border); border-radius: 10px; background: var(--dgs-bg-muted); }
.dgs-root .dgs-seg .dgs-seg-btn {
  appearance: none; -webkit-appearance: none; margin: 0; box-shadow: none; text-shadow: none; text-transform: none; letter-spacing: 0;
  padding: 6px 12px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--dgs-text);
  font: 500 13px/1.2 var(--dgs-sans); cursor: pointer; white-space: nowrap;
}
.dgs-root .dgs-seg .dgs-seg-btn.is-on, .dgs-root .dgs-seg .dgs-seg-btn[aria-pressed="true"] {
  background: var(--dgs-bg); color: var(--dgs-text); border-color: var(--dgs-border); font-weight: 650; box-shadow: 0 1px 2px rgba(13, 20, 36, .08);
}
.dgs-root .dgs-seg .dgs-seg-btn { --hbg: rgba(255, 255, 255, .6); --hfg: var(--dgs-text); --hbd: transparent; }
.dgs-root .dgs-seg .dgs-seg-btn.is-on { --hbg: var(--dgs-bg); --hfg: var(--dgs-text); --hbd: var(--dgs-border); }

.dgs-root .dgs-switch { display: inline-flex; align-items: center; gap: 9px; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--dgs-text); margin: 0; padding: 0; }
.dgs-root .dgs-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; pointer-events: none; }
.dgs-root .dgs-switch-ui { position: relative; flex: none; width: 34px; height: 20px; border-radius: 999px; background: #c5cbd8; transition: background-color .15s; }
.dgs-root .dgs-switch-ui::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .25); transition: transform .15s; }
.dgs-root .dgs-switch input:checked + .dgs-switch-ui { background: var(--dgs-accent); }
.dgs-root .dgs-switch input:checked + .dgs-switch-ui::after { transform: translateX(14px); }
.dgs-root .dgs-switch input:focus-visible + .dgs-switch-ui { box-shadow: 0 0 0 3px rgba(49, 87, 240, .22); }

/* Topics editor */
.dgs-root .dgs-topic-rows { display: grid; gap: 8px; margin: 10px 0 4px; }
.dgs-root .dgs-topic-row { display: grid; grid-template-columns: minmax(120px, 1.1fr) 76px minmax(180px, 3fr) 34px; gap: 8px; align-items: center; }
.dgs-root .dgs-topic-head { font-size: 12px; font-weight: 600; color: var(--dgs-text-muted); }
.dgs-root .dgs-topic-head span { padding: 0 2px; }
.dgs-root .dgs-topic-row .dgs-topic-rm {
  appearance: none; -webkit-appearance: none; margin: 0; padding: 0; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius-sm); background: var(--dgs-bg); color: var(--dgs-text-muted);
  font: 500 14px/1 var(--dgs-sans); cursor: pointer; box-shadow: none; text-shadow: none;
  --hbg: #fdecec; --hfg: #b3261e; --hbd: #e8b4b0;
}
@media (max-width: 640px) {
  .dgs-root .dgs-topic-head { display: none; }
  .dgs-root .dgs-topic-row { grid-template-columns: 1fr 70px 34px; }
  .dgs-root .dgs-topic-row > :nth-child(3) { grid-column: 1 / -2; grid-row: 2; }
  .dgs-root .dgs-topic-row > :nth-child(4) { grid-column: 3; grid-row: 1; }
  .dgs-root .dgs-topic-row { padding-bottom: 10px; border-bottom: 1px solid var(--dgs-border); }
}

/* Inputs the script renders (profile editor, feed tools): same look as the rest of the tool, whatever the theme does */
.dgs-root .dgs-profile-edit input:not([type="checkbox"]):not([type="radio"]),
.dgs-root .dgs-profile-edit select,
.dgs-root .dgs-profile-edit textarea,
.dgs-root .dgs-feed-tools select {
  box-sizing: border-box; width: 100%; max-width: 100%; margin: 0; padding: 8px 10px;
  border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius-sm); background: var(--dgs-bg); color: var(--dgs-text);
  font: 500 13.5px/1.4 var(--dgs-sans); box-shadow: none; height: auto; min-height: 0;
}
.dgs-root .dgs-profile-edit textarea { resize: vertical; }
.dgs-root .dgs-profile-edit input:focus, .dgs-root .dgs-profile-edit select:focus, .dgs-root .dgs-profile-edit textarea:focus, .dgs-root .dgs-feed-tools select:focus {
  outline: none; border-color: var(--dgs-accent); box-shadow: 0 0 0 3px rgba(49, 87, 240, .16);
}
.dgs-root .dgs-profile-edit .dgs-actions { margin-top: 12px; }

/* Themes uppercase buttons and inputs; keep the tool's own casing */
.dgs-root button, .dgs-root input, .dgs-root select, .dgs-root textarea { text-transform: none; letter-spacing: normal; }


/* Digest library */
.dgs-root .dgs-open-lib .dgs-pill-name { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom; }
.dgs-root .dgs-lib-item { display: grid; gap: 8px; padding: 14px 16px; border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius); background: var(--dgs-bg); }
.dgs-root .dgs-lib-item.is-cur { border-color: var(--dgs-accent); box-shadow: 0 0 0 3px rgba(49, 87, 240, .1); }
.dgs-root .dgs-lib-title { margin: 0; font-size: 15px; font-weight: 650; line-height: 1.3; color: var(--dgs-text); }
.dgs-root .dgs-lib-meta { margin: 0; font-size: 12.5px; color: var(--dgs-text-muted); display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; }
.dgs-root .dgs-lib-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.dgs-root .dgs-store-list { list-style: none; margin: 6px 0 8px; padding: 0; display: grid; gap: 3px; font-size: 12.5px; }
.dgs-root .dgs-store-list li { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px solid var(--dgs-border); }
.dgs-root .dgs-store { margin-top: 6px; }
.dgs-root .dgs-btn-sm { padding: 6px 12px; font-size: 12.5px; }
.dgs-root .dgs-carry { margin: 0 0 16px; padding: 14px 16px; border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius); background: var(--dgs-bg-muted); }
.dgs-root .dgs-carry > summary { cursor: pointer; font-size: 14px; font-weight: 650; color: var(--dgs-text); }
.dgs-root .dgs-carry-list { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 8px; }
.dgs-root .dgs-carry-item { display: grid; gap: 6px; padding: 10px 12px; background: var(--dgs-bg); border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius-sm); }
.dgs-root .dgs-carry-item b { font-size: 13.5px; font-weight: 650; }
.dgs-root .dgs-carry-item span { font-size: 12.5px; color: var(--dgs-text-muted); }
.dgs-root .dgs-chip.is-used { background: #fff3da; color: #7a4a00; border-color: #f0d08c; }
.dgs-root .dgs-fo-fresh { margin: 12px 0 0; padding: 10px 14px; border-radius: var(--dgs-radius-sm); background: var(--dgs-accent-soft); color: var(--dgs-text); font-size: 13.5px; line-height: 1.5; }
.dgs-root .dgs-rv-edition { margin-top: 10px; }

/* Search and social checks */
.dgs-root .dgs-seo-checks { display: grid; gap: 2px; margin: 0 0 12px; padding: 10px 12px; border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius-sm); background: var(--dgs-bg-muted); }
.dgs-root .dgs-seo-check { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--dgs-text); }
.dgs-root .dgs-seo-check span { display: inline-block; width: 1.2em; font-weight: 700; }
.dgs-root .dgs-seo-check.is-ok span { color: #15803d; } .dgs-root .dgs-seo-check.is-warn span { color: #b45309; } .dgs-root .dgs-seo-check.is-bad span { color: #b3261e; }

.dgs-root .dgs-so-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.dgs-root .dgs-clu-split { border: 1px solid var(--dgs-border); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; display: grid; gap: 8px; justify-items: start; background: var(--dgs-bg-muted); }
.dgs-root .dgs-clu-themes { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
.dgs-root .dgs-so-car { display: grid; gap: 10px; }
.dgs-root .dgs-so-ctl { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dgs-root .dgs-so-sel { width: auto; max-width: 100%; }
.dgs-root .dgs-so-strip { display: flex; gap: 10px; overflow-x: auto; padding: 4px 0 10px; scroll-snap-type: x proximity; }
.dgs-root .dgs-so-strip canvas { height: 260px; width: auto; flex: none; border-radius: 10px; border: 1px solid var(--dgs-border); scroll-snap-align: start; }
.dgs-root .dgs-so-prow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; padding: 8px 0; border-top: 1px solid var(--dgs-border); }
.dgs-root .dgs-so-prow > .dgs-hint { flex: 1 1 220px; margin: 0; }
.dgs-root .dgs-so-pwhen { color: var(--dgs-ink-dim); min-width: 110px; }
.dgs-root .dgs-so-slides { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0; }
.dgs-root .dgs-so-slides canvas { width: 132px; height: 132px; border-radius: 8px; border: 1px solid var(--dgs-border); }
.dgs-root .dgs-so-chart { display: grid; gap: 8px; justify-items: start; margin: 10px 0 4px; }
.dgs-root .dgs-so-img { display: block; width: 100%; max-width: 340px; height: auto; border-radius: 10px; border: 1px solid var(--dgs-border); }
.dgs-root .dgs-so-plan summary { cursor: pointer; }
.dgs-root .dgs-wr-rep { margin-bottom: 14px; }
.dgs-root details.dgs-so-card, .dgs-root details.dgs-so-sub, .dgs-root details.dgs-so-post { display: block; }
.dgs-root details.dgs-so-card { padding: 0; margin-bottom: 10px; }
.dgs-root .dgs-so-sum { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 10px; min-width: 0; }
.dgs-root .dgs-so-sum::-webkit-details-marker { display: none; }
.dgs-root .dgs-so-sum::before { content: "▸"; font-size: 12px; color: var(--dgs-ink-dim); transition: transform .15s; flex: none; }
.dgs-root details[open] > .dgs-so-sum::before { transform: rotate(90deg); }
.dgs-root details.dgs-so-card > .dgs-so-sum { padding: 14px 16px; }
.dgs-root details.dgs-so-card > .dgs-so-body { padding: 0 16px 14px; }
.dgs-root details.dgs-so-sub > .dgs-so-sum { padding: 8px 0; font-weight: 600; }
.dgs-root details.dgs-so-post > .dgs-so-sum { padding: 9px 0; border-top: 1px solid var(--dgs-border); }
.dgs-root details.dgs-so-sub > .dgs-so-body, .dgs-root details.dgs-so-post > .dgs-so-body { padding: 4px 0 12px; display: grid; gap: 8px; }
.dgs-root .dgs-so-title { font-weight: 700; font-size: 15px; }
.dgs-root .dgs-so-lab { font-weight: 600; font-size: 13px; white-space: nowrap; }
.dgs-root .dgs-so-pv { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--dgs-ink-dim); }
.dgs-root .dgs-so-cnt { white-space: nowrap; font-size: 12px; }
.dgs-root .dgs-so-cnt.is-over { color: #f87171; }
.dgs-root .dgs-so-flag[hidden] { display: none; }
.dgs-root .dgs-so-chart { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.dgs-root .dgs-so-chart .dgs-so-img { max-width: 220px; }
.dgs-root .dgs-chip.is-hot { background: #fde8e4; color: #a3321f; border-color: #f3b9ae; }
.dgs-root .dgs-scout { margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--dgs-border); }
.dgs-root .dgs-scout-h { margin: 16px 0 8px; font-size: 13px; letter-spacing: .06em; text-transform: uppercase; color: var(--dgs-ink-dim); }
.dgs-root .dgs-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.dgs-root .dgs-scout-card { padding: 12px 14px; border: 1px solid var(--dgs-border); border-radius: var(--dgs-radius); margin-bottom: 8px; background: var(--dgs-bg); }
.dgs-root .dgs-scout-top { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.dgs-root .dgs-scout-p { margin: 6px 0 0; font-size: 14px; }
.dgs-root .dgs-so-audit { margin: 0; }
.dgs-root .dgs-so-end { margin-top: 8px; }
.dgs-root .dgs-so-post { display: grid; gap: 6px; padding: 12px 0; border-top: 1px solid var(--dgs-border); }
.dgs-root .dgs-so-post:first-of-type { border-top: 0; }
.dgs-root .dgs-so-meta { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }
.dgs-root .dgs-so-meta .is-over { color: #f87171; font-weight: 600; }
.dgs-root .dgs-so-warn { font-size: 12.5px; color: #fbbf24; font-weight: 600; }
.dgs-root .dgs-so-warn-note { color: #fbbf24; }
/* One navigation group per step: Back and Continue on the right, the step's own action on the left */
.dgs-root .dgs-clu-bar .dgs-nav { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
@media (max-width: 640px) { .dgs-root .dgs-clu-bar .dgs-nav { margin-left: 0; width: 100%; justify-content: space-between; } }
</style>

<div class="dgs-root" data-mode="digest">

  <div class="dgs-topbar">
    <div class="dgs-topbar-inner">
      <div class="dgs-brand">
        <span class="dgs-brand-mark">Autonom</span>
        <span class="dgs-brand-sep">·</span>
        <span class="dgs-brand-sub">Digest</span>
      </div>

<div class="dgs-topbar-actions">
  <div class="dgs-keys-group" role="group" aria-label="API keys">
    <span class="dgs-keys-title">API keys</span>
    <span class="dgs-api-status" id="dgs-api-status" title="API keys status">
      <span class="dgs-api-dot"></span>
      <span class="dgs-api-label">Keys</span>
    </span>
    <button class="dgs-btn-pill dgs-open-settings" type="button" title="Switch profile, add or change API keys and provider settings">
      <span class="dgs-pill-k">Profile</span> <span class="dgs-pill-name">Set up profile &amp; keys</span> <span aria-hidden="true">▾</span>
    </button>
  </div>
  <button class="dgs-btn-pill dgs-open-lib" id="dgs-open-lib" type="button" title="Your saved digests: open an earlier one or start a new one">
    <span class="dgs-pill-k">Digests</span> <span class="dgs-pill-name" id="dgs-lib-pill">New</span> <span aria-hidden="true">▾</span>
  </button>
  <button class="dgs-btn-pill dgs-privacy-toggle" type="button">
    <span class="dgs-privacy-dot"></span> Data &amp; privacy
  </button>
</div>

    </div>

    <nav class="dgs-rail" aria-label="Steps">
      <div class="dgs-steps">
        <button class="dgs-step is-active" data-step="channel" type="button"><em>1</em><span>Profile</span></button>
        <button class="dgs-step" data-step="feed" type="button" disabled><em>2</em><span>Feed</span></button>
        <button class="dgs-step" data-step="cluster" type="button" disabled><em>3</em><span>Sections</span></button>
        <button class="dgs-step" data-step="outline" type="button" disabled><em>4</em><span>Outline</span></button>
        <button class="dgs-step" data-step="write" type="button" disabled><em>5</em><span>Write</span></button>
        <button class="dgs-step" data-step="review" type="button" disabled><em>6</em><span>Review</span></button>
        <button class="dgs-step" data-step="export" type="button" disabled><em>7</em><span>Export</span></button>
        <button class="dgs-step" data-step="social" type="button" disabled><em>8</em><span>Social</span></button>
      </div>
    </nav>

    <div class="dgs-privacy-drawer" hidden>
      <div class="dgs-privacy-drawer-inner">
        <h4>Data &amp; privacy</h4>
        <ul class="dgs-privacy-list">
          <li><span class="dgs-check">✓</span> Your profile, sections, outlines and API keys are stored in this browser only (keys are saved unencrypted in local storage)</li>
          <li><span class="dgs-check">✓</span> No Autonom database and no accounts. This site stores nothing about you or your articles</li>
          <li><span class="dgs-check">✓</span> News searches and article pages are fetched by this website's own server and only cached briefly (10 min to 6 hours)</li>
          <li><span class="dgs-check">✓</span> AI and YouTube calls use your own API keys. They are sent from your browser straight to the provider. If a provider refuses calls from a browser (Groq, OpenRouter and NVIDIA sometimes do), the request is forwarded by this website's server for that call only. The server passes your key along and does not store or log it.</li>
        </ul>
        <div class="dgs-privacy-stats">
          <div><span>API calls</span><strong id="dgs-stat-api">0</strong></div>
          <div><span>LLM calls</span><strong id="dgs-stat-llm">0</strong></div>
        </div>
        <p class="dgs-privacy-note">Your server reads publisher RSS feeds (BBC, Al Jazeera, Guardian, DW, NPR, Sky, Euronews, CBC, NYT, WSJ), searches GDELT, Bing News and Google News, and reads the article pages of the stories you select. Your browser calls YouTube (googleapis.com) and Google Gemini, OpenAI or DeepSeek directly; requests to Groq, OpenRouter and NVIDIA may pass through your server. If the server search fails, your browser may fall back to GDELT directly or to public CORS proxies (allorigins.win, codetabs.com, rss2json.com), which then see your search terms.</p>
      </div>
    </div>
  </div>

  <!-- ============ STEP 1 · CHANNEL ============ -->
  <section class="dgs-panel" data-panel="channel">
    <header class="dgs-panel-head">
      <h2>Set up your publication profile</h2>
      <p class="dgs-lead">Autonom learns what your publication covers and how it sounds, then turns today's news into one daily article.</p>
    </header>

    <div class="dgs-mode-grid">
      <button class="dgs-mode-card" data-mode="youtube" type="button">
        <h3>From YouTube</h3>
        <p>Read the last 30 public videos to derive topics, tone, and cadence.</p>
      </button>
      <button class="dgs-mode-card" data-mode="website" type="button">
        <h3>From my website</h3>
        <p>Read your site's recent posts to derive topics and learn your voice. Best for a daily digest.</p>
      </button>
      <button class="dgs-mode-card" data-mode="manual" type="button">
        <h3>Manual setup</h3>
        <p>Define topics, tone, and format yourself. No API keys needed.</p>
      </button>
    </div>

    <div class="dgs-mode-form" data-mode="website" hidden>
      <label class="dgs-field">
        <span class="dgs-label">Website address</span>
        <input type="url" id="dgs-web-input" placeholder="https://blomstrainsights.com">
      </label>
      <div class="dgs-actions"><button class="dgs-btn dgs-btn-primary" id="dgs-web-fetch" type="button">Read my website</button></div>
      <p class="dgs-hint" id="dgs-web-status" role="status">Reads the home page and the site's public feed. With an AI key it also reads your latest posts to describe your voice. A new site with few posts works, but the voice description will be thin until you have published more.</p>
    </div>

    <div class="dgs-mode-form" data-mode="youtube" hidden>
      <label class="dgs-field">
        <span class="dgs-label">YouTube channel handle or URL</span>
        <input type="text" id="dgs-yt-input" placeholder="@BlomstraInsights or channel URL">
      </label>
      <p class="dgs-hint">Requires a YouTube Data API key. Add it under <button type="button" class="dgs-link dgs-open-settings">API keys</button>.</p>
      <div class="dgs-actions">
        <button class="dgs-btn dgs-btn-primary" id="dgs-yt-fetch" type="button">Fetch &amp; derive</button>
      </div>
    </div>

    <div class="dgs-mode-form" data-mode="manual" hidden>
      <label class="dgs-field">
        <span class="dgs-label">Channel name</span>
        <input type="text" id="dgs-manual-name" placeholder="BlomstraInsights">
      </label>
      <label class="dgs-field">
        <span class="dgs-label">One-liner</span>
        <input type="text" id="dgs-manual-oneliner" placeholder="Geopolitics × macroeconomy × tech intersection">
      </label>
      <label class="dgs-field">
        <span class="dgs-label">Starting topics <small>(comma-separated; you can add, remove and tune topics after saving)</small></span>
        <input type="text" id="dgs-manual-topics" placeholder="Geopolitics, Macroeconomy, Tech">
      </label>
      <label class="dgs-field">
        <span class="dgs-label">Signals <small>(keywords the scanner should match — comma-separated, 3+ characters each, optional)</small></span>
        <input type="text" id="dgs-manual-signals" placeholder="missile, sanctions, Federal Reserve, tariff, drone, chip">
      </label>
      <div class="dgs-grid-2">
        <label class="dgs-field">
          <span class="dgs-label">Tone</span>
          <select id="dgs-manual-tone">
            <option value="analytical">Analytical</option>
            <option value="urgent">Urgent</option>
            <option value="neutral">Neutral brief</option>
            <option value="contrarian">Contrarian</option>
          </select>
        </label>
      </div>
      <div class="dgs-actions">
        <button class="dgs-btn dgs-btn-primary" id="dgs-manual-save" type="button">Save profile</button>
      </div>
    </div>

    <div class="dgs-profile-editor" id="dgs-profile-editor" hidden>
      <div class="dgs-editor-head">
        <h3>Topic Profile</h3>
        <div class="dgs-editor-actions">
          <button class="dgs-btn dgs-btn-ghost" id="dgs-edit-toggle" type="button">Edit</button>
          <button class="dgs-btn dgs-btn-primary" id="dgs-continue-feed" type="button">Continue to Feed →</button>
        </div>
      </div>
      <div class="dgs-profile-view" id="dgs-profile-view"></div>
      <div class="dgs-profile-edit" id="dgs-profile-edit" hidden></div>
    </div>
  </section>

  <!-- ============ STEP 2 · FEED ============ -->
  <section class="dgs-panel" data-panel="feed" hidden>
    <header class="dgs-panel-head">
      <h2>Scan live news</h2>
      <p class="dgs-lead">Scan to see everything your profile pulls in. Check the overview: if the topics, outlets or freshness look wrong, change your profile and scan again. Then select the stories the article should draw on.</p>
    </header>

    <div class="dgs-actions">
      <button class="dgs-btn dgs-btn-primary" id="dgs-scan-btn" type="button">Scan feeds</button>
      <button class="dgs-btn dgs-btn-ghost" id="dgs-feed-scout" type="button">Find more topics</button>
      <button class="dgs-btn dgs-btn-ghost" id="dgs-back-channel" type="button">← Back to Channel</button>
    </div>
    <label class="dgs-out-check"><input type="checkbox" id="dgs-scan-breaking" checked><span>Also bring in what is breaking and covered by many outlets, even outside my topics</span></label>

    <div class="dgs-progress" id="dgs-scan-progress" hidden>
      <div class="dgs-progress-bar"><div class="dgs-progress-fill"></div></div>
      <p class="dgs-progress-label">Searching…</p>
    </div>

    <div class="dgs-feed-overview" id="dgs-feed-overview" hidden></div>

    <div class="dgs-feed-tools" id="dgs-feed-tools" hidden></div>

    <div class="dgs-story-list" id="dgs-story-list"></div>

    <div class="dgs-actions" id="dgs-feed-next" hidden>
      <button class="dgs-btn dgs-btn-primary" id="dgs-build-all" type="button">Build the whole draft</button>
      <button class="dgs-btn dgs-btn-ghost" id="dgs-continue-scripts" type="button">Go step by step →</button>
      <span class="dgs-hint">One click groups the stories, plans the outline and writes every section, then stops at Review. Or go step by step to adjust each stage.</span>
    </div>
  </section>

  <!-- ============ DIGEST · SECTIONS ============ -->
  <section class="dgs-panel" data-panel="cluster" hidden>
    <header class="dgs-panel-head">
      <h2>Sections</h2>
      <p class="dgs-lead">The selected stories are grouped into sections. A daily bulletin keeps the 3 or 4 strongest threads and leaves the rest in the Feed for tomorrow. Each section is one part of the bulletin: stories that share a thread. Move, merge or leave out anything before you plan the outline.</p>
    </header>
    <div class="dgs-actions dgs-clu-bar">
      <label class="dgs-clu-count"><span class="dgs-label">Sections</span>
        <select id="dgs-clu-n" aria-label="How many sections">
          <option value="0">Auto (AI decides)</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option><option value="7">7</option><option value="8">8</option>
        </select></label>
      <button class="dgs-btn dgs-btn-primary" id="dgs-clu-run" type="button">Group stories into sections</button>
      <button class="dgs-btn dgs-btn-ghost" id="dgs-clu-stop" type="button" hidden>Stop</button>
      <button class="dgs-btn dgs-btn-ghost" id="dgs-clu-suggest" type="button" hidden>Plan digests from the pool</button>
      <span class="dgs-hint" id="dgs-clu-sum"></span>
      <span class="dgs-nav">
        <button class="dgs-btn dgs-btn-ghost" id="dgs-clu-back" type="button">← Back to Feed</button>
        <button class="dgs-btn dgs-btn-primary" id="dgs-clu-next" type="button" disabled>Continue to Outline →</button>
      </span>
    </div>
    <div class="dgs-clu-prog" id="dgs-clu-prog" hidden><span class="dgs-clu-prog-label"></span><div class="dgs-clu-prog-bar"><i></i></div></div>
    <div id="dgs-clu-list"></div>
  </section>

  <!-- ============ DIGEST · OUTLINE ============ -->
  <section class="dgs-panel" data-panel="outline" hidden>
    <header class="dgs-panel-head">
      <h2>Outline</h2>
      <p class="dgs-lead">Pick the headline, decide how the piece opens, and choose one lens per section. A lens is a way of reading the facts. It never adds facts. Writing the sections comes next.</p>
    </header>
    <div class="dgs-actions dgs-clu-bar">
      <button class="dgs-btn dgs-btn-primary" id="dgs-out-run" type="button">Plan the outline</button>
      <button class="dgs-btn dgs-btn-ghost" id="dgs-out-stop" type="button" hidden>Stop</button>
      <button class="dgs-btn dgs-btn-ghost" id="dgs-out-copy" type="button" disabled>Copy outline</button>
      <span class="dgs-nav">
        <button class="dgs-btn dgs-btn-ghost" id="dgs-out-back" type="button">← Back to Sections</button>
        <button class="dgs-btn dgs-btn-primary" id="dgs-out-next" type="button">Continue to Write →</button>
      </span>
    </div>
    <div class="dgs-clu-prog" id="dgs-out-prog" hidden><span class="dgs-clu-prog-label">Planning the outline…</span><div class="dgs-clu-prog-bar"><i></i></div></div>
    <div id="dgs-out-body"></div>
  </section>

  <!-- ============ DIGEST · WRITE ============ -->
  <section class="dgs-panel" data-panel="write" hidden>
    <header class="dgs-panel-head">
      <h2>Write</h2>
      <p class="dgs-lead">Each section is written from its own source articles, in your voice, through the lens you chose. Then it is checked: numbers and names that are not in the sources, and phrasing that reads as machine-written. Edit anything. Nothing is published.</p>
    </header>
    <div class="dgs-actions dgs-clu-bar">
      <label class="dgs-clu-count"><span class="dgs-label">Section length</span>
        <select id="dgs-wr-len" aria-label="Section length"><option value="short">Short (about 120 words)</option><option value="medium">Medium (about 200 words)</option><option value="long">Long (about 300 words)</option></select>
        <select id="dgs-wr-readlen" aria-label="Length of Our read"><option value="bulletin">Our read: bulletin (110 to 150 words, with a test)</option><option value="full">Our read: commentary (200 to 300 words)</option><option value="short">Our read: brief (up to 60 words)</option></select></label>
      <button class="dgs-btn dgs-btn-primary" id="dgs-wr-run" type="button">Write the article</button>
      <button class="dgs-btn dgs-btn-ghost" id="dgs-wr-stop" type="button" hidden>Stop</button>
      <button class="dgs-btn dgs-btn-ghost" id="dgs-wr-copy" type="button" disabled>Copy as Markdown</button>
      <span class="dgs-hint" id="dgs-wr-count"></span>
      <span class="dgs-nav">
        <button class="dgs-btn dgs-btn-ghost" id="dgs-wr-back" type="button">← Back to Outline</button>
        <button class="dgs-btn dgs-btn-primary" id="dgs-wr-next" type="button">Continue to Review →</button>
      </span>
    </div>
    <div class="dgs-clu-prog" id="dgs-wr-prog" hidden><span class="dgs-clu-prog-label" id="dgs-wr-prog-label">Writing…</span><div class="dgs-clu-prog-bar"><i></i></div></div>
    <div id="dgs-wr-body"></div>
  </section>

  <!-- ============ DIGEST · REVIEW ============ -->
  <section class="dgs-panel" data-panel="review" hidden>
    <header class="dgs-panel-head">
      <h2>Review</h2>
      <p class="dgs-lead">Read it the way a reader will see it. Fix anything flagged, then confirm. The export unlocks once you have confirmed.</p>
    </header>
    <label class="dgs-field"><span class="dgs-label">Headline</span><input type="text" id="dgs-rv-head" class="dgs-out-input"></label>
    <div class="dgs-rv-fixes" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 12px"><button class="dgs-btn dgs-btn-ghost" id="dgs-rv-nums" type="button" hidden title="Deletes every sentence or watch item that contains a number the sources do not contain.">Remove unsupported numbers</button>
    <button class="dgs-btn dgs-btn-ghost" id="dgs-rv-strong" type="button" title="For each written section that gives no test of its own reading, the AI adds one closing line: what would change the read. Checked against the sources.">Add a test to each section</button><span class="dgs-hint">Fixes the "nothing would change our read" warning for you. Read what it adds.</span></div>
    <label class="dgs-field dgs-rv-note"><span class="dgs-label">Your analyst's note (2 to 4 sentences in your own words, shown in the article)</span><textarea id="dgs-rv-note" class="dgs-out-input" rows="4" placeholder="What I take from this, from where I sit. For example: what I have seen in networks and infrastructure that explains why this matters."></textarea></label>
    <p style="margin:-4px 0 12px"><button class="dgs-btn dgs-btn-ghost dgs-btn-sm" id="dgs-rv-note-ai" type="button">Draft a start for me</button> <span class="dgs-hint">Drafts two sentences stating our position. You add your own view.</span></p>
    <label class="dgs-field dgs-rv-edition"><span class="dgs-label">Edition label, shown above the article</span><input type="text" id="dgs-rv-edition" class="dgs-out-input" maxlength="40" placeholder="Empty means Daily digest. For example: Afternoon update"></label>
    <ul class="dgs-rv-check" id="dgs-rv-check"></ul>
    <div class="dgs-actions"><button class="dgs-btn dgs-btn-ghost" id="dgs-rv-fix" type="button">← Edit in Write</button></div>
    <div class="dgs-rv-preview" id="dgs-rv-preview"></div>
    <label class="dgs-out-check"><input type="checkbox" id="dgs-rv-ok"><span>I have read this article, checked the flagged items and the facts that matter, and I stand behind it.</span></label>
    <div class="dgs-actions">
      <button class="dgs-btn dgs-btn-primary" id="dgs-rv-next" type="button">Continue to Export →</button>
      <button class="dgs-btn dgs-btn-ghost" id="dgs-rv-back" type="button">← Back to Write</button>
    </div>
  </section>

  <!-- ============ DIGEST · EXPORT ============ -->
  <section class="dgs-panel" data-panel="export" hidden>
    <header class="dgs-panel-head">
      <h2>Export to WordPress</h2>
      <p class="dgs-lead">Copy the HTML, open a new post in WordPress, switch to the Code editor and paste. Headings and paragraphs arrive as native blocks, and the layout parts (contents, quotes, key figures, charts, what to watch) as HTML blocks. Add the article styles once (see Article styling below). Nothing is posted for you.</p>
    </header>
    <div class="dgs-out-card">
      <h3 class="dgs-out-h">Article <small class="dgs-hint" id="dgs-ex-count"></small></h3>
      <label class="dgs-out-check"><input type="checkbox" id="dgs-ex-nav"><span>Add an "In this article" jump list (when there are 3 or more sections)</span></label>
      <label class="dgs-out-check"><input type="checkbox" id="dgs-ex-pq"><span>Pull out up to two quotes from the text as large quotes (the sentence is repeated word for word)</span></label>
      <label class="dgs-out-check"><input type="checkbox" id="dgs-ex-disc"><span>Add an AI-assistance note at the end</span></label>
      <label class="dgs-out-check"><input type="checkbox" id="dgs-ex-credit"><span>Link "Autonom Digest" in the note to autonom.app, so readers and other publishers can find the tool</span></label>
      <textarea id="dgs-ex-disc-text" class="dgs-out-input" rows="2" aria-label="AI note text"></textarea>
      <details class="dgs-ex-promo" id="dgs-sc-box">
        <summary class="dgs-out-h">Spoken script for YouTube or a podcast</summary>
        <p class="dgs-hint">A 5 minute monologue in your voice, built from this article. Read it yourself or give it to a voice tool. You get a title and description too.</p>
        <div class="dgs-actions"><button class="dgs-btn dgs-btn-ghost" id="dgs-sc-run" type="button">Write the script</button><button class="dgs-btn dgs-btn-ghost" id="dgs-sc-copy" type="button">Copy</button><button class="dgs-btn dgs-btn-ghost" id="dgs-sc-dl" type="button">Download .txt</button></div>
        <p class="dgs-hint" id="dgs-sc-meta" hidden style="white-space:pre-line"></p>
        <textarea id="dgs-sc-text" class="dgs-out-input" rows="18" aria-label="Spoken script" hidden></textarea>
      </details>
      <details class="dgs-ex-promo">
        <summary class="dgs-out-h">Authority and income: related links and a signup box</summary>
        <p class="dgs-hint">Saved with your profile and added to every article. Related links help readers and search engines find your other work; the signup box turns readers into subscribers or members.</p>
        <label class="dgs-field"><span class="dgs-label">Your pages to link to, one per line: Title | https://your-site/page/</span>
          <textarea id="dgs-ex-links" class="dgs-out-input" rows="4" placeholder="Geoeconomic Risk Index | https://blomstrainsights.com/indices/geri/"></textarea></label>
        <label class="dgs-field"><span class="dgs-label">Signup box title</span><input id="dgs-ex-cta-title" class="dgs-out-input" type="text" placeholder="Get the weekly analysis"></label>
        <label class="dgs-field"><span class="dgs-label">One line under it</span><input id="dgs-ex-cta-text" class="dgs-out-input" type="text" placeholder="What it means, not just what happened."></label>
        <label class="dgs-field"><span class="dgs-label">Button text</span><input id="dgs-ex-cta-label" class="dgs-out-input" type="text" placeholder="Subscribe"></label>
        <label class="dgs-field"><span class="dgs-label">Button link (newsletter or membership page)</span><input id="dgs-ex-cta-url" class="dgs-out-input" type="url" placeholder="https://blomstrainsights.com/membership/"></label>
      </details>
      <div class="dgs-actions">
        <button class="dgs-btn dgs-btn-primary" id="dgs-ex-copy-html" type="button">Copy HTML</button>
        <button class="dgs-btn dgs-btn-ghost" id="dgs-ex-dl-html" type="button">Download .html</button>
        <button class="dgs-btn dgs-btn-ghost" id="dgs-ex-copy-md" type="button">Copy Markdown</button>
        <button class="dgs-btn dgs-btn-ghost" id="dgs-ex-copy-title" type="button">Copy title</button>
      </div>
      <textarea id="dgs-ex-html" class="dgs-out-input dgs-ex-code" rows="8" readonly aria-label="Generated HTML"></textarea>
    </div>
    <div class="dgs-out-card">
      <h3 class="dgs-out-h">Search and social fields</h3>
      <p class="dgs-hint">Paste these into your SEO plugin (AIOSEO) and the post settings.</p>
      <div id="dgs-ex-seo-box"></div>
      <div class="dgs-actions"><button class="dgs-btn dgs-btn-ghost" id="dgs-ex-seo" type="button">Write search fields</button></div>
    </div>
    <div class="dgs-out-card">
      <h3 class="dgs-out-h">Charts and key figures</h3>
      <p class="dgs-hint">Drawn from numbers the articles state. A chart is kept only if its numbers appear in a word-for-word quote from the source, which is shown under it. Ticked charts are placed in their section in the HTML as inline SVG, with the source named under each one.</p>
      <div class="dgs-actions"><button class="dgs-btn dgs-btn-ghost" id="dgs-ch-run" type="button">Look for charts</button></div>
      <div class="dgs-clu-prog" id="dgs-ch-prog" hidden><span class="dgs-clu-prog-label">Reading sources…</span><div class="dgs-clu-prog-bar"><i></i></div></div>
      <div id="dgs-ch-box"></div>
    </div>
    <div class="dgs-out-card">
      <h3 class="dgs-out-h">Feature image</h3>
      <p class="dgs-hint">A dot map of the world with the places the article is about, drawn in your browser (1200 by 630). Upload it as the featured image. Check the places before you use it.</p>
      <div class="dgs-set-grid">
        <label class="dgs-field"><span class="dgs-label">Image style</span><select id="dgs-ex-imgstyle" class="dgs-out-input"><option value="auto">Automatic: fits this digest</option><option value="map">World map with places</option><option value="figure">Key figure</option><option value="chart">Chart cover</option><option value="sections">Headline and sections</option><option value="plain">Plain, with soft rings</option></select></label>
        <label class="dgs-field"><span class="dgs-label">Colour</span><select id="dgs-ex-imgcolor" class="dgs-out-input"><option value="auto">Automatic (different for each digest)</option></select></label>
        <label class="dgs-field"><span class="dgs-label">Map view</span><select id="dgs-ex-imgview" class="dgs-out-input"><option value="auto">Zoom in on the places</option><option value="world">Whole world</option></select></label>
        <label class="dgs-field"><span class="dgs-label">Places on the map (comma separated, up to 6)</span><input type="text" id="dgs-ex-places" class="dgs-out-input" placeholder="Israel, Iran, Alaska"></label>
      </div>
      <canvas id="dgs-ex-canvas" class="dgs-ex-canvas" width="1200" height="630"></canvas>
      <div class="dgs-actions"><button class="dgs-btn dgs-btn-ghost" id="dgs-ex-dl-img" type="button">Download PNG</button></div>
      <p class="dgs-hint">Square version for social posts (1080 by 1080):</p>
      <canvas id="dgs-ex-canvas2" class="dgs-ex-canvas" width="1080" height="1080"></canvas>
      <div class="dgs-actions"><button class="dgs-btn dgs-btn-ghost" id="dgs-ex-dl-sq" type="button">Download square PNG</button></div>
      <p class="dgs-hint">No stock photos or AI-generated pictures are added. Photos from news sites are copyrighted, and invented images can mislead in a news piece. Add your own photo in WordPress if you want one.</p>
    </div>
    <div class="dgs-out-card">
      <h3 class="dgs-out-h">Article style</h3>
      <p class="dgs-hint">Pick a look for this article. Your choice is remembered for the next one, and you can use a different style for each article. Every style works from one stylesheet: copy all styles once (Appearance, Customize, Additional CSS, or a WPCode CSS snippet) and each article picks its own look. Or copy only the chosen style.</p>
      <div class="dgs-style-grid" id="dgs-ex-styles"></div>
      <div class="dgs-actions">
        <button class="dgs-btn dgs-btn-primary" id="dgs-ex-copy-css-all" type="button">Copy CSS, all styles</button>
        <button class="dgs-btn dgs-btn-ghost" id="dgs-ex-copy-css" type="button">Copy CSS, this style</button>
        <button class="dgs-btn dgs-btn-ghost" id="dgs-ex-dl-css-all" type="button">Download all styles</button>
        <button class="dgs-btn dgs-btn-ghost" id="dgs-ex-dl-css" type="button">Download this style</button>
     </div>
      <details class="dgs-ex-prev"><summary>Preview this article in the chosen style</summary><div class="dgs-rv-preview" id="dgs-ex-preview"></div></details>
    </div>
    <div class="dgs-actions dgs-so-end">
      <button class="dgs-btn dgs-btn-ghost" id="dgs-ex-back" type="button">← Back to Review</button>
      <button class="dgs-btn dgs-btn-primary" id="dgs-ex-social" type="button">Next: social posts →</button>
      <button class="dgs-btn dgs-btn-ghost" id="dgs-ex-new" type="button">Start a new digest</button>
    </div>
  </section>

  <section class="dgs-panel" data-panel="social" hidden>
    <header class="dgs-panel-head">
      <h2>Social posts</h2>
      <p class="dgs-lead">One click writes a post set for X, LinkedIn, Instagram, Facebook and Telegram, plus image posts built from your charts. Each platform is written on its own, the way that platform works, and only from what the article says. Paste the link to the published article first so it ends up in the posts.</p>
    </header>
    <div class="dgs-out-card">
      <label class="dgs-field"><span class="dgs-label">What the posts are about</span><select id="dgs-so-focus" class="dgs-out-input" aria-label="Focus of the posts"><option value="">The strongest angle (the AI picks)</option></select></label>
      <label class="dgs-field"><span class="dgs-label">Link to the published article</span><input type="text" id="dgs-so-link" class="dgs-out-input" placeholder="https://"></label>
      <div class="dgs-actions">
        <button class="dgs-btn dgs-btn-primary" id="dgs-so-run" type="button">Write the posts</button>
        <button class="dgs-btn dgs-btn-ghost" id="dgs-so-check" type="button">Check against the article</button>
        <button class="dgs-btn dgs-btn-ghost" id="dgs-so-copyall" type="button">Copy all posts</button>
        <span id="dgs-so-fold" hidden><button class="dgs-btn dgs-btn-ghost" id="dgs-so-expand" type="button">Open all</button> <button class="dgs-btn dgs-btn-ghost" id="dgs-so-collapse" type="button">Close all</button></span>
      </div>
      <div class="dgs-clu-prog" id="dgs-so-prog" hidden><span class="dgs-clu-prog-label" id="dgs-so-prog-label">Writing the posts…</span><div class="dgs-clu-prog-bar"><i></i></div></div>
      <p class="dgs-hint dgs-so-warn-note" id="dgs-so-note" hidden>A post marked "Check" has a number that is not in the article. Fix or remove it before you publish.</p>
    </div>
    <details class="dgs-out-card dgs-so-plan" id="dgs-so-plan" hidden open>
      <summary class="dgs-out-h">Your publishing plan</summary>
      <div id="dgs-so-planbody"></div>
      <p class="dgs-hint"><strong>Every time.</strong> Answer every comment in the first hour; the platforms read early replies as a sign the post is worth showing. After four weeks, look at which opening lines brought clicks and write more like those. Treat all of this as a test. Nobody can promise reach, and new accounts grow slowly.</p>
    </details>
    <div id="dgs-so-box"></div>
    <div class="dgs-actions dgs-so-end">
      <button class="dgs-btn dgs-btn-ghost" id="dgs-so-back" type="button">← Back to Export</button>
      <button class="dgs-btn dgs-btn-primary" id="dgs-so-new" type="button">Start a new digest</button>
    </div>
  </section>

  <!-- ============ SETTINGS DRAWER ============ -->
  <aside class="dgs-drawer" id="dgs-lib-drawer" hidden>
    <div class="dgs-drawer-inner" role="dialog" aria-label="Your digests">
      <div class="dgs-drawer-head">
        <div>
          <h3>Your digests</h3>
          <p class="dgs-hint">Every digest you make is saved here with its sections, text, charts and style. Stories already used are marked in the Feed, so a second scan only offers what is new.</p>
        </div>
        <button class="dgs-btn-close" id="dgs-lib-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="dgs-drawer-body"><div id="dgs-lib-list"></div></div>
      <div class="dgs-drawer-actions">
        <button class="dgs-btn dgs-btn-primary" id="dgs-lib-new" type="button">+ New daily bulletin</button>
        <button class="dgs-btn dgs-btn-ghost" id="dgs-lib-weekly" type="button" title="Writes the analyst commentary from your daily digests since the last one. Aim for two a week.">Write the analysis</button>
        <button class="dgs-btn dgs-btn-ghost" id="dgs-lib-clear" type="button" title="Deletes every digest and waiting section so you can start again. Profile and settings stay.">Clean sheet</button>
        <span class="dgs-hint" id="dgs-lib-due"></span> <span class="dgs-hint">The one you are working on is saved first. Your feed stays, so you can pick the new stories.</span>
      </div>
    </div>
  </aside>

  <aside class="dgs-drawer" id="dgs-settings-drawer" hidden>
    <div class="dgs-drawer-inner" role="dialog" aria-label="Profile, API keys and settings">
      <div class="dgs-drawer-head">
        <div>
          <h3>Profile, keys &amp; settings</h3>
          <p class="dgs-hint">Everything here belongs to the active profile and stays in this browser.</p>
        </div>
        <button class="dgs-btn-close" id="dgs-settings-close" type="button" aria-label="Close settings">×</button>
      </div>
      <div class="dgs-set-tabs" role="tablist">
        <button type="button" class="dgs-set-tab is-active" data-tab="profile" role="tab">Profile &amp; sources</button>
        <button type="button" class="dgs-set-tab" data-tab="ai" role="tab">AI writing</button>
      </div>
      <div class="dgs-drawer-body">

        <section class="dgs-set-sec" data-tab="profile">
          <h4 class="dgs-set-h">Profile</h4>
          <p class="dgs-hint">A profile is one channel or brand, with its own topics, voice and keys. Switch or add one here.</p>
      <div id="dgs-set-profiles"></div>

          <h4 class="dgs-set-h">Brand and channel links</h4>
          <p class="dgs-hint">Add the pages this profile publishes on. A website can be read as a page, which helps the voice DNA (the part that makes your articles differ from anyone else's). Facebook, Instagram, X and LinkedIn block automated readers, so those links are saved with the profile but may not be readable.</p>
          <p class="dgs-hint" id="dgs-lnk-hint">Set up a profile in step 1 first. Then these fields unlock.</p>
          <div class="dgs-lnk-grid">
            <label class="dgs-field"><span class="dgs-label">Website</span><input type="url" id="dgs-lnk-website" placeholder="https://"></label>
            <label class="dgs-field"><span class="dgs-label">YouTube</span><input type="url" id="dgs-lnk-youtube" placeholder="https://youtube.com/@"></label>
            <label class="dgs-field"><span class="dgs-label">Facebook</span><input type="url" id="dgs-lnk-facebook" placeholder="https://facebook.com/"></label>
            <label class="dgs-field"><span class="dgs-label">Instagram</span><input type="url" id="dgs-lnk-instagram" placeholder="https://instagram.com/"></label>
            <label class="dgs-field"><span class="dgs-label">TikTok</span><input type="url" id="dgs-lnk-tiktok" placeholder="https://tiktok.com/@"></label>
            <label class="dgs-field"><span class="dgs-label">X</span><input type="url" id="dgs-lnk-x" placeholder="https://x.com/"></label>
            <label class="dgs-field"><span class="dgs-label">LinkedIn</span><input type="url" id="dgs-lnk-linkedin" placeholder="https://linkedin.com/company/"></label>
            <label class="dgs-field"><span class="dgs-label">Telegram</span><input type="url" id="dgs-lnk-telegram" placeholder="https://t.me/"></label>
          </div>
          <div><button type="button" class="dgs-btn dgs-btn-ghost" id="dgs-lnk-learn">Read my pages to improve my voice</button></div>
          <p class="dgs-hint" id="dgs-lnk-status" role="status"></p>

          <h4 class="dgs-set-h">YouTube through its API</h4>
          <p class="dgs-hint">The most complete source. With a key, step 1 reads the channel's recent videos, titles and what performed best.</p>
          <label class="dgs-field">
        <span class="dgs-label">YouTube Data API key</span>
        <input type="password" id="dgs-set-yt" placeholder="AIza...">
        <span class="dgs-hint">From console.cloud.google.com. Restrict to autonom.app and blomstrainsights.com referrers.</span>
      </label>

        </section>

        <section class="dgs-set-sec" data-tab="ai" hidden>
          <h4 class="dgs-set-h">Provider and keys</h4>
      <p class="dgs-hint">Already set up Autonom Newsreel in this browser? <button type="button" class="dgs-link" id="dgs-import-keys">Copy its API keys here</button>. They are only copied into the fields below; press Save settings to keep them. Nothing is sent anywhere.</p>
      <p class="dgs-hint" id="dgs-backup-age" role="status"></p>
      <div class="dgs-store" id="dgs-store" role="status"></div>
      <p class="dgs-hint">Autonom Digest <b id="dgs-ver"></b>. Your profile and keys are saved in this browser for <b id="dgs-origin"></b>. A different address (with or without www, http, a staging copy) or cleared site data starts empty, and so does another browser. <button type="button" class="dgs-link" id="dgs-backup-dl">Download a backup</button> or <button type="button" class="dgs-link" id="dgs-backup-pick">restore from a backup</button>. The backup file contains your keys, so keep it private.</p>
      <input type="file" id="dgs-backup-file" accept="application/json,.json" hidden>
      <label class="dgs-field">
        <span class="dgs-label">Model provider</span>
        <select id="dgs-set-provider">
          <option value="gemini">Google Gemini</option>
          <option value="groq">Groq</option>
          <option value="openrouter">OpenRouter</option>
          <option value="nvidia">NVIDIA NIM</option>
          <option value="openai">OpenAI</option>
          <option value="deepseek">DeepSeek</option>
          <option value="none">None (basic grouping only)</option>
        </select>
      </label>

<label class="dgs-field" data-provider="gemini">
  <span class="dgs-label">Gemini API key</span>
  <input type="password" id="dgs-set-gemini" placeholder="AQ... or AIza...">
  <span class="dgs-hint">From aistudio.google.com. Both AQ. and AIza keys work. Any plan works: Autonom uses whatever models your key can access.</span>
  <button class="dgs-btn dgs-btn-ghost" id="dgs-test-gemini" type="button" style="margin-top:6px;">Test this key</button>
        <span class="dgs-hint dgs-test-res" id="dgs-testres-gemini" role="status" aria-live="polite"></span>
</label>

<label class="dgs-field" data-provider="gemini">
  <span class="dgs-label">Preferred Gemini model</span>
  <input type="text" id="dgs-set-gemini-model" placeholder="leave empty: picked automatically from your key">
  <span class="dgs-hint">Tried first; if it is overloaded or out of quota, Autonom falls through to other models automatically. Model names change: run __dgsListModels() in the browser console to see yours.</span>
</label>

      <label class="dgs-field" data-provider="gemini">
        <span class="dgs-label">Model for writing (optional)</span>
        <input type="text" id="dgs-set-gemini-write-model" placeholder="optional, leave empty to auto-pick">
        <span class="dgs-hint">Used first for grouping, outlines and writing, where judgement and wording quality matter most. Leave empty to use one model for everything. If it is overloaded or out of quota, Autonom falls back automatically.</span>
      </label>

      <label class="dgs-field" data-provider="groq" hidden>
        <span class="dgs-label">Groq API key</span>
        <input type="password" id="dgs-set-groq" placeholder="gsk_...">
        <span class="dgs-hint">From console.groq.com (API Keys). Any plan works.</span>
        <button class="dgs-btn dgs-btn-ghost" id="dgs-test-groq" type="button" style="margin-top:6px;">Test this key</button>
        <span class="dgs-hint dgs-test-res" id="dgs-testres-groq" role="status" aria-live="polite"></span>
      </label>
      <label class="dgs-field" data-provider="groq" hidden>
        <span class="dgs-label">Groq model (optional)</span>
        <input type="text" id="dgs-set-groq-model" placeholder="leave empty to auto-pick">
        <span class="dgs-hint">Used for fact extraction. Leave empty and Autonom asks Groq which models your key can use and picks the strongest. If one is rate-limited it waits as Groq asks, or tries the next model.</span>
      </label>
      <label class="dgs-field" data-provider="groq" hidden>
        <span class="dgs-label">Groq model for writing (optional)</span>
        <input type="text" id="dgs-set-groq-write-model" placeholder="leave empty to auto-pick">
        <span class="dgs-hint">Rate limits are per model. Left empty, writing starts on a different model than the quick checks so the two use separate quotas.</span>
      </label>
      <label class="dgs-field" data-provider="openrouter" hidden>
        <span class="dgs-label">OpenRouter API key</span>
        <input type="password" id="dgs-set-openrouter" placeholder="sk-or-...">
        <span class="dgs-hint">From openrouter.ai (Keys). Left empty, Autonom picks automatically from models that cost nothing per token, so no credits are spent. To use a paid model with your credits, type its exact name in the model field below.</span>
        <button class="dgs-btn dgs-btn-ghost" id="dgs-test-openrouter" type="button" style="margin-top:6px;">Test this key</button>
        <span class="dgs-hint dgs-test-res" id="dgs-testres-openrouter" role="status" aria-live="polite"></span>
      </label>
      <label class="dgs-field" data-provider="openrouter" hidden>
        <span class="dgs-label">OpenRouter model (optional)</span>
        <input type="text" id="dgs-set-openrouter-model" placeholder="leave empty to auto-pick (zero-cost models only)">
      </label>
      <label class="dgs-field" data-provider="openrouter" hidden>
        <span class="dgs-label">OpenRouter model for writing (optional)</span>
        <input type="text" id="dgs-set-openrouter-write-model" placeholder="leave empty to auto-pick">
      </label>

      <label class="dgs-field" data-provider="nvidia" hidden>
        <span class="dgs-label">NVIDIA NIM API key</span>
        <input type="password" id="dgs-set-nvidia" placeholder="nvapi-..." autocomplete="off">
        <span class="dgs-hint">From build.nvidia.com (API keys). It may refuse calls made straight from a browser; if so Autonom retries through this site automatically.</span>
        <button class="dgs-btn dgs-btn-ghost" id="dgs-test-nvidia" type="button" style="margin-top:6px;">Test this key</button>
        <span class="dgs-hint dgs-test-res" id="dgs-testres-nvidia" role="status" aria-live="polite"></span>
      </label>
      <label class="dgs-field" data-provider="nvidia" hidden>
        <span class="dgs-label">NVIDIA NIM model (optional)</span>
        <input type="text" id="dgs-set-nvidia-model" placeholder="leave empty to auto-pick">
      </label>
      <label class="dgs-field" data-provider="nvidia" hidden>
        <span class="dgs-label">NVIDIA NIM model for writing (optional)</span>
        <input type="text" id="dgs-set-nvidia-write-model" placeholder="leave empty to auto-pick">
      </label>
      <label class="dgs-field" data-provider="openai" hidden>
        <span class="dgs-label">OpenAI API key</span>
        <input type="password" id="dgs-set-openai" placeholder="sk-...">
      </label>
      <label class="dgs-field" data-provider="deepseek" hidden>
        <span class="dgs-label">DeepSeek API key</span>
        <input type="password" id="dgs-set-deepseek" placeholder="sk-...">
      </label>


          <h4 class="dgs-set-h">How the AI is used</h4>
      <label class="dgs-field" style="display:flex;gap:8px;align-items:flex-start;">
        <input type="checkbox" id="dgs-set-fallback" style="margin-top:4px;" checked>
        <span><span class="dgs-label">Use my other AI keys as a backup</span>
        <span class="dgs-hint" style="display:block;">If the AI service you picked is overloaded, rate-limited or out of quota, Autonom tries the other services you have saved a key for, instead of giving up with a template. Each AI step says which service answered.</span></span>
      </label>

      <label class="dgs-field">
        <span class="dgs-label">Model strategy</span>
        <select id="dgs-set-strategy">
          <option value="value">Best value (default): a capable mid-size model first</option>
          <option value="cheap">Cheapest first: small models and free-tier providers first</option>
          <option value="quality">Best quality first: the largest models and strongest providers first</option>
        </select>
        <span class="dgs-hint">Applies to every AI service you have a key for. Models are found automatically from each service's own list and ranked by name (size, mini/lite versus pro/large), because most services do not publish prices in that list. With "Use my other AI keys as a backup" off, only the service you picked is used. A model typed in Settings still wins.</span>
      </label>

      <label class="dgs-field" style="display:flex;gap:8px;align-items:flex-start;">
        <input type="checkbox" id="dgs-set-writebest" style="margin-top:4px;" checked>
        <span><span class="dgs-label">Use the strongest model for writing</span>
        <span class="dgs-hint" style="display:block;">The article text is what readers see, so it is written by the most capable model available while the small checking calls stay on the strategy above. If that model is out of quota or unavailable, the next one is used.</span></span>
      </label>

        </section>

      </div>
      <div class="dgs-drawer-actions">
        <button class="dgs-btn dgs-btn-primary" id="dgs-settings-save" type="button">Save settings</button>
        <span class="dgs-hint">Switching tabs keeps what you typed. Save stores all tabs.</span>
      </div>
    </div>
  </aside>

</div>
    <?php
    return ob_get_clean();
}
add_shortcode( 'autonom_digest', 'autonom_dgs_shortcode' );
