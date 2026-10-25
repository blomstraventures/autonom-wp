<?php
/**
 * Autonom AI Shorts Generator — Shortcode
 * Shortcode: [autonom_ai_shorts_generator]
 * v1.12.0
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

if ( ! defined( 'AUTONOM_ASG_VERSION' ) ) {
    define( 'AUTONOM_ASG_VERSION', '1.12.0' );
}

/**
 * Where the CSS/JS files live.
 * - If used as a plugin/theme file: auto-detected via plugin_dir_url(__FILE__)
 * - If pasted into WPCode: define AUTONOM_ASG_ASSETS_URL in wp-config.php
 *   e.g. define( 'AUTONOM_ASG_ASSETS_URL', 'https://autonom.app/wp-content/uploads/autonom/ai-shorts-generator/' );
 */
function autonom_asg_assets_url() {
    if ( defined( 'AUTONOM_ASG_ASSETS_URL' ) ) return trailingslashit( AUTONOM_ASG_ASSETS_URL );
    return trailingslashit( plugin_dir_url( __FILE__ ) );
}

/**
 * Cache-busting version for an asset file.
 * Uses the file's modification time when the file can be located on disk
 * (uploads folder or plugin folder), otherwise falls back to AUTONOM_ASG_VERSION.
 */
function autonom_asg_asset_ver( $file ) {
    $base = autonom_asg_assets_url();
    $up   = wp_get_upload_dir();
    if ( ! empty( $up['baseurl'] ) && strpos( $base, $up['baseurl'] ) === 0 ) {
        $path = $up['basedir'] . substr( $base, strlen( $up['baseurl'] ) ) . $file;
    } else {
        $path = plugin_dir_path( __FILE__ ) . $file;
    }
    if ( is_readable( $path ) ) {
        return (string) filemtime( $path );
    }
    return AUTONOM_ASG_VERSION;
}

/**
 * Register assets. Loaded only when the shortcode is present.
 */
function autonom_asg_register_assets() {
    $base = autonom_asg_assets_url();
    wp_register_style( 'autonom-asg-tool', $base . 'ai-shorts-generator-tool-style.css', array(), autonom_asg_asset_ver( 'ai-shorts-generator-tool-style.css' ) );
    wp_register_script( 'autonom-asg-backend', $base . 'ai-shorts-generator-backend.js', array(), autonom_asg_asset_ver( 'ai-shorts-generator-backend.js' ), true );
}
add_action( 'wp_enqueue_scripts', 'autonom_asg_register_assets', 5 );

/* ------------------------------------------------------------------
 * REST endpoint: fetch readable article text for a news URL.
 * GET /wp-json/autonom-asg/v1/article?url=https://...
 *
 * Hardening:
 *  - wp_safe_remote_get() refuses private/loopback addresses and odd ports
 *  - http/https only, HTML responses only, 1.5 MB body cap, 10s timeout
 *  - per-IP and global rate limits, results cached for 6 hours
 *  - returns plain text only (no HTML is ever passed through)
 * ------------------------------------------------------------------ */
function autonom_asg_register_rest() {
    register_rest_route( 'autonom-asg/v1', '/article', array(
        'methods'             => 'GET',
        'callback'            => 'autonom_asg_rest_article',
        'permission_callback' => '__return_true',
        'args'                => array(
            'url' => array( 'required' => true, 'type' => 'string' ),
        ),
    ) );
    register_rest_route( 'autonom-asg/v1', '/feeds', array(
        'methods'             => 'GET',
        'callback'            => 'autonom_asg_rest_feeds',
        'permission_callback' => '__return_true',
        'args'                => array(
            'q' => array( 'required' => false, 'type' => 'string' ),
        ),
    ) );
    register_rest_route( 'autonom-asg/v1', '/llm', array(
        'methods'             => 'POST',
        'callback'            => 'autonom_asg_rest_llm',
        'permission_callback' => '__return_true',
    ) );
    register_rest_route( 'autonom-asg/v1', '/media', array(
        'methods'             => 'GET',
        'callback'            => 'autonom_asg_rest_media',
        'permission_callback' => '__return_true',
        'args'                => array(
            'u' => array( 'required' => true, 'type' => 'string' ),
        ),
    ) );
    register_rest_route( 'autonom-asg/v1', '/news', array(
        'methods'             => 'GET',
        'callback'            => 'autonom_asg_rest_news',
        'permission_callback' => '__return_true',
        'args'                => array(
            'q' => array( 'required' => true, 'type' => 'string' ),
        ),
    ) );
}
add_action( 'rest_api_init', 'autonom_asg_register_rest' );

/* ------------------------------------------------------------------
 * Media relay (fallback only). The browser normally talks to Pexels directly.
 * If a browser blocks that (CORS), the request is forwarded here instead.
 * Hardening: https only, fixed host allowlist (Pexels, Pixabay), GET only, 30 MB cap,
 * JSON/video/image responses only, per-IP rate limit. Keys are never stored.
 * ------------------------------------------------------------------ */
function autonom_asg_rest_media( WP_REST_Request $req ) {
    $u    = esc_url_raw( (string) $req->get_param( 'u' ) );
    $p    = wp_parse_url( $u );
    $host = isset( $p['host'] ) ? strtolower( $p['host'] ) : '';
    $ok   = isset( $p['scheme'] ) && $p['scheme'] === 'https' && in_array( $host, array( 'api.pexels.com', 'videos.pexels.com', 'images.pexels.com', 'pixabay.com', 'cdn.pixabay.com' ), true );
    if ( ! $ok || strlen( $u ) > 1500 ) {
        return new WP_REST_Response( array( 'ok' => false, 'error' => 'bad_request' ), 400 );
    }
    $ipk = 'asg_media_' . md5( autonom_asg_client_ip() );
    $n   = (int) get_transient( $ipk );
    if ( $n >= 300 ) { return new WP_REST_Response( array( 'ok' => false, 'error' => 'rate_limited' ), 429 ); }
    set_transient( $ipk, $n + 1, 10 * MINUTE_IN_SECONDS );

    $headers = array();
    $auth    = (string) $req->get_header( 'x-asg-auth' );
    if ( $host === 'api.pexels.com' && $auth !== '' && preg_match( '/^[A-Za-z0-9_\-\.]{10,200}$/', $auth ) ) {
        $headers['Authorization'] = $auth;
    }
    $cap = 30 * 1024 * 1024;
    $res = wp_safe_remote_get( $u, array( 'timeout' => 45, 'headers' => $headers, 'redirection' => 3, 'limit_response_size' => $cap ) );
    if ( is_wp_error( $res ) ) {
        return new WP_REST_Response( array( 'ok' => false, 'error' => 'upstream_unreachable' ), 502 );
    }
    $ctype = strtolower( (string) wp_remote_retrieve_header( $res, 'content-type' ) );
    $body  = wp_remote_retrieve_body( $res );
    if ( ! preg_match( '#^(application/json|video/|image/)#', $ctype ) ) {
        return new WP_REST_Response( array( 'ok' => false, 'error' => 'unsupported_type' ), 415 );
    }
    if ( strlen( $body ) >= $cap ) {
        return new WP_REST_Response( array( 'ok' => false, 'error' => 'too_large' ), 413 );
    }
    status_header( (int) wp_remote_retrieve_response_code( $res ) );
    header( 'Content-Type: ' . $ctype );
    header( 'Cache-Control: private, max-age=3600' );
    header( 'X-Content-Type-Options: nosniff' );
    echo $body; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- binary or JSON passthrough from an allowlisted host.
    exit;
}

/* ------------------------------------------------------------------
 * LLM relay (fallback when the browser cannot call a provider directly).
 * Forwards one chat-completions request to a fixed allowlist of providers
 * using the key the visitor supplies. The key is never stored or logged.
 * ------------------------------------------------------------------ */
function autonom_asg_rest_llm( WP_REST_Request $req ) {
    $endpoints = array(
        'groq'       => 'https://api.groq.com/openai/v1/chat/completions',
        'openrouter' => 'https://openrouter.ai/api/v1/chat/completions',
    );
    $d        = $req->get_json_params();
    $provider = isset( $d['provider'] ) ? sanitize_key( (string) $d['provider'] ) : '';
    $key      = isset( $d['key'] ) ? trim( (string) $d['key'] ) : '';
    $payload  = isset( $d['payload'] ) && is_array( $d['payload'] ) ? $d['payload'] : null;
    if ( ! isset( $endpoints[ $provider ] ) || $key === '' || ! $payload || strlen( $key ) > 300 || ! preg_match( '/^[A-Za-z0-9_\-\.]+$/', $key ) ) {
        return new WP_REST_Response( array( 'ok' => false, 'error' => 'bad_request' ), 400 );
    }
    $ipk = 'asg_llm_' . md5( autonom_asg_client_ip() );
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
        $headers['X-Title']      = 'Autonom AI Shorts Generator';
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

function autonom_asg_client_ip() {
    if ( ! empty( $_SERVER['HTTP_CF_CONNECTING_IP'] ) ) {
        return sanitize_text_field( wp_unslash( $_SERVER['HTTP_CF_CONNECTING_IP'] ) );
    }
    return isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'unknown';
}

function autonom_asg_article_fail( $code, $status = 200 ) {
    return new WP_REST_Response( array( 'ok' => false, 'error' => $code ), $status );
}

/**
 * Resolve a Google News redirect link (news.google.com/rss/articles/ID) to the publisher URL.
 * Google gives each article page a signature + timestamp; the real URL comes from one
 * batchexecute call. This is an undocumented Google endpoint and may change or block
 * server IPs, so failure is expected sometimes and callers must fall back gracefully.
 * Returns the publisher URL or null.
 */
function autonom_asg_decode_gnews( $url ) {
    $p = wp_parse_url( $url );
    if ( empty( $p['host'] ) || strtolower( $p['host'] ) !== 'news.google.com' || empty( $p['path'] ) ) { return null; }
    $segs = explode( '/', trim( $p['path'], '/' ) );
    $n    = count( $segs );
    if ( $n < 2 || ! in_array( $segs[ $n - 2 ], array( 'articles', 'read' ), true ) || $segs[ $n - 1 ] === '' ) { return null; }
    $id = $segs[ $n - 1 ];

    $ck = 'asg_gn_' . md5( $id );
    $c  = get_transient( $ck );
    if ( is_string( $c ) && $c !== '' ) { return $c; }

    $page = wp_safe_remote_get(
        'https://news.google.com/rss/articles/' . rawurlencode( $id ) . '?hl=en-US&gl=US&ceid=US%3Aen',
        array( 'timeout' => 10, 'redirection' => 3, 'user-agent' => autonom_asg_news_ua() )
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
        'user-agent' => autonom_asg_news_ua(),
        'headers'    => array( 'Content-Type' => 'application/x-www-form-urlencoded;charset=UTF-8' ),
        'body'       => $body,
    ) );
    if ( is_wp_error( $res ) || (int) wp_remote_retrieve_response_code( $res ) !== 200 ) { return null; }

    $real = autonom_asg_parse_batchexecute( (string) wp_remote_retrieve_body( $res ) );
    if ( ! $real ) { return null; }
    set_transient( $ck, $real, 12 * HOUR_IN_SECONDS );
    return $real;
}

function autonom_asg_parse_batchexecute( $text ) {
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

function autonom_asg_rest_article( WP_REST_Request $req ) {
    $url = trim( (string) $req->get_param( 'url' ) );
    $url = esc_url_raw( $url, array( 'http', 'https' ) );
    if ( ! $url || ! wp_http_validate_url( $url ) ) {
        return autonom_asg_article_fail( 'bad_url', 400 );
    }

    // Cached result?
    $ck     = 'asg_art_' . md5( $url );
    $cached = get_transient( $ck );
    if ( is_array( $cached ) ) {
        return new WP_REST_Response( $cached, 200 );
    }
    $orig = $url;

    // Rate limits: 40 per 10 min per IP, 400 per hour overall.
    $ipk = 'asg_rl_' . md5( autonom_asg_client_ip() );
    $n   = (int) get_transient( $ipk );
    if ( $n >= 90 ) { return autonom_asg_article_fail( 'rate_limited', 429 ); }
    set_transient( $ipk, $n + 1, 10 * MINUTE_IN_SECONDS );

    $gk = 'asg_rl_global';
    $g  = (int) get_transient( $gk );
    if ( $g >= 400 ) { return autonom_asg_article_fail( 'rate_limited', 429 ); }
    set_transient( $gk, $g + 1, HOUR_IN_SECONDS );

    // Google News / Bing redirect links: resolve to the publisher URL first.
    $host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
    if ( $host === 'news.google.com' ) {
        $real = autonom_asg_decode_gnews( $url );
        if ( ! $real || ! wp_http_validate_url( $real ) ) { return autonom_asg_article_fail( 'decode_failed' ); }
        $url = $real;
    } elseif ( $host === 'www.bing.com' || $host === 'bing.com' ) {
        return autonom_asg_article_fail( 'redirect_link' );
    }
    // Hard-paywalled publishers: do not waste a request, and never feed a paywall page to the model.
    $host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
    if ( preg_match( '/(^|\.)(wsj\.com|ft\.com|bloomberg\.com|economist\.com|barrons\.com)$/', $host ) ) {
        return autonom_asg_article_fail( 'paywalled' );
    }

    $res = wp_safe_remote_get( $url, array(
        'timeout'             => 10,
        'redirection'         => 4,
        'limit_response_size' => 1500000,
        'user-agent'          => 'Mozilla/5.0 (compatible; AutonomASG/' . AUTONOM_ASG_VERSION . '; +' . home_url( '/' ) . ')',
        'headers'             => array( 'Accept' => 'text/html,application/xhtml+xml' ),
    ) );
    if ( is_wp_error( $res ) ) {
        return autonom_asg_article_fail( 'fetch_failed' );
    }
    $code = (int) wp_remote_retrieve_response_code( $res );
    if ( $code < 200 || $code >= 300 ) {
        return autonom_asg_article_fail( 'http_' . $code );
    }
    $ctype = strtolower( (string) wp_remote_retrieve_header( $res, 'content-type' ) );
    if ( $ctype !== '' && strpos( $ctype, 'html' ) === false ) {
        return autonom_asg_article_fail( 'not_html' );
    }
    $body = (string) wp_remote_retrieve_body( $res );
    if ( $body === '' ) {
        return autonom_asg_article_fail( 'empty' );
    }

    $out = autonom_asg_extract_article( $body );
    if ( ! $out ) {
        return autonom_asg_article_fail( 'too_short' );
    }
    if ( $out['length'] < 1500 && preg_match( '/(subscribe to (continue|read)|already a subscriber|sign in to (continue|read)|create a free account to (continue|read)|to continue reading)/i', $out['text'] ) ) {
        return autonom_asg_article_fail( 'paywalled' );
    }
    $out['ok']       = true;
    $out['host']     = wp_parse_url( $url, PHP_URL_HOST );
    $out['finalUrl'] = $url;
    set_transient( 'asg_art_' . md5( $orig ), $out, 6 * HOUR_IN_SECONDS );
    return new WP_REST_Response( $out, 200 );
}

/**
 * Pull the main readable text out of an HTML page. Returns null if too little text.
 */
function autonom_asg_extract_article( $html ) {
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
 * GET /wp-json/autonom-asg/v1/news?q=missile OR sanctions
 *
 * Tries GDELT, then Bing News RSS, then Google News RSS. GDELT and Bing
 * return real publisher URLs (so article text can be read); Google News
 * links are redirects and are flagged "redirect": true.
 * Cached 10 minutes per query; 60 requests / 10 min / IP.
 * ------------------------------------------------------------------ */
function autonom_asg_news_terms( $q, $max = 6 ) {
    $terms = array();
    foreach ( preg_split( '/\s+OR\s+/i', (string) $q ) as $p ) {
        $p = trim( preg_replace( '/\s+/u', ' ', preg_replace( '/[^\p{L}\p{N}\s\-]/u', ' ', $p ) ) );
        if ( mb_strlen( $p ) >= 3 ) { $terms[] = $p; }
    }
    return array_slice( array_values( array_unique( $terms ) ), 0, $max );
}

function autonom_asg_news_item( $title, $link, $date, $author, $desc = '', $redirect = false ) {
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

function autonom_asg_news_ua() {
    return 'Mozilla/5.0 (compatible; AutonomASG/' . AUTONOM_ASG_VERSION . '; +' . home_url( '/' ) . ')';
}

function autonom_asg_news_gdelt( $terms ) {
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
    $res = wp_safe_remote_get( $url, array( 'timeout' => 15, 'user-agent' => autonom_asg_news_ua() ) );
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
        $out[] = autonom_asg_news_item( $a['title'], $a['url'], $date, isset( $a['domain'] ) ? $a['domain'] : 'GDELT', '', false );
    }
    return $out;
}

function autonom_asg_news_rss( $url ) {
    $res = wp_safe_remote_get( $url, array( 'timeout' => 12, 'user-agent' => autonom_asg_news_ua() ) );
    if ( is_wp_error( $res ) || (int) wp_remote_retrieve_response_code( $res ) !== 200 ) { return null; }
    $xml = (string) wp_remote_retrieve_body( $res );
    if ( $xml === '' ) { return null; }
    libxml_use_internal_errors( true );
    $sx = simplexml_load_string( $xml, 'SimpleXMLElement', LIBXML_NONET | LIBXML_NOCDATA );
    libxml_clear_errors();
    if ( ! $sx || ! isset( $sx->channel->item ) ) { return null; }
    return $sx;
}

function autonom_asg_news_bing( $terms ) {
    $url = 'https://www.bing.com/news/search?' . http_build_query( array(
        'q' => implode( ' OR ', $terms ), 'format' => 'RSS', 'setlang' => 'en-US',
    ), '', '&', PHP_QUERY_RFC3986 );
    $sx = autonom_asg_news_rss( $url );
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
        $out[] = autonom_asg_news_item( $it->title, $pub, (string) $it->pubDate, $src, (string) $it->description, $redirect );
    }
    return $out;
}

function autonom_asg_news_google( $terms ) {
    $url = 'https://news.google.com/rss/search?' . http_build_query( array(
        'q' => implode( ' OR ', $terms ), 'hl' => 'en-US', 'gl' => 'US', 'ceid' => 'US:en',
    ), '', '&', PHP_QUERY_RFC3986 );
    $sx = autonom_asg_news_rss( $url );
    if ( ! $sx ) { return array(); }
    $out = array();
    foreach ( $sx->channel->item as $it ) {
        $out[] = autonom_asg_news_item( $it->title, (string) $it->link, (string) $it->pubDate, (string) $it->source, '', true );
    }
    return $out;
}

function autonom_asg_rest_news( WP_REST_Request $req ) {
    $terms = autonom_asg_news_terms( (string) $req->get_param( 'q' ) );
    if ( ! $terms ) {
        return new WP_REST_Response( array( 'ok' => false, 'error' => 'no_terms' ), 400 );
    }
    $ck     = 'asg_news_' . md5( implode( '|', $terms ) );
    $cached = get_transient( $ck );
    if ( is_array( $cached ) ) {
        return new WP_REST_Response( $cached, 200 );
    }

    $ipk = 'asg_nrl_' . md5( autonom_asg_client_ip() );
    $n   = (int) get_transient( $ipk );
    if ( $n >= 60 ) { return new WP_REST_Response( array( 'ok' => false, 'error' => 'rate_limited' ), 429 ); }
    set_transient( $ipk, $n + 1, 10 * MINUTE_IN_SECONDS );

    $chain = array(
        'gdelt'  => 'autonom_asg_news_gdelt',
        'bing'   => 'autonom_asg_news_bing',
        'google' => 'autonom_asg_news_google',
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
 * Add or remove feeds with the 'autonom_asg_feeds' filter or by editing this list.
 * Feed URLs come from public lists and were NOT all verified live: use
 *   /wp-json/autonom-asg/v1/feeds   (the "stats" block shows which feeds answered)
 * ------------------------------------------------------------------ */
function autonom_asg_feed_registry() {
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
        array( 'id' => 'nyt-world',         'name' => 'The New York Times', 'access' => 'metered', 'url' => 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' ),
        array( 'id' => 'wsj-world',         'name' => 'The Wall Street Journal', 'access' => 'paywalled', 'url' => $dj . 'RSSWorldNews' ),
        array( 'id' => 'wsj-markets',       'name' => 'The Wall Street Journal', 'access' => 'paywalled', 'url' => $dj . 'RSSMarketsMain' ),
        array( 'id' => 'wsj-economy',       'name' => 'The Wall Street Journal', 'access' => 'paywalled', 'url' => $dj . 'socialeconomyfeed' ),
        array( 'id' => 'wsj-business',      'name' => 'The Wall Street Journal', 'access' => 'paywalled', 'url' => $dj . 'WSJcomUSBusiness' ),
        array( 'id' => 'wsj-tech',          'name' => 'The Wall Street Journal', 'access' => 'paywalled', 'url' => $dj . 'RSSWSJD' ),
        array( 'id' => 'wsj-politics',      'name' => 'The Wall Street Journal', 'access' => 'paywalled', 'url' => $dj . 'socialpoliticsfeed' ),
    );
    $list = apply_filters( 'autonom_asg_feeds', $list );
    return is_array( $list ) ? $list : array();
}

/**
 * Fetch many URLs in parallel (WordPress's bundled Requests library), falling back to one-by-one.
 * Returns [ key => ['code'=>int, 'body'=>string, 'error'=>string?] ]
 */
function autonom_asg_multi_get( $urls, $timeout = 8 ) {
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
                        'User-Agent' => autonom_asg_news_ua(),
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
        $r = wp_safe_remote_get( $u, array( 'timeout' => $timeout, 'user-agent' => autonom_asg_news_ua() ) );
        if ( is_wp_error( $r ) ) {
            $out[ $k ] = array( 'code' => 0, 'body' => '', 'error' => $r->get_error_message() );
        } else {
            $out[ $k ] = array( 'code' => (int) wp_remote_retrieve_response_code( $r ), 'body' => (string) wp_remote_retrieve_body( $r ) );
        }
    }
    return $out;
}

/** Parse RSS 2.0, RSS 1.0 (RDF) or Atom into normalised items. */
function autonom_asg_parse_feed( $xml ) {
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
        $out[] = autonom_asg_news_item( $title, $link, $date, '', $desc, false );
        if ( count( $out ) >= 40 ) { break; }
    }
    return $out;
}

/** All registry feeds, each cached 10 min (failures 2 min). Returns [ ['feed'=>meta, 'res'=>['ok','code','items','error']] ... ] */
function autonom_asg_collect_feeds() {
    $reg  = autonom_asg_feed_registry();
    $need = array();
    $res  = array();
    foreach ( $reg as $i => $f ) {
        $c = get_transient( 'asg_feed_' . md5( $f['url'] ) );
        if ( is_array( $c ) ) { $res[ $i ] = $c; } else { $need[ $i ] = $f['url']; }
    }
    if ( $need ) {
        $got = autonom_asg_multi_get( $need, 8 );
        foreach ( $need as $i => $url ) {
            $r = isset( $got[ $i ] ) ? $got[ $i ] : array( 'code' => 0, 'body' => '' );
            if ( $r['code'] === 200 && $r['body'] !== '' ) {
                $items = autonom_asg_parse_feed( $r['body'] );
                $c = $items
                    ? array( 'ok' => true, 'code' => 200, 'items' => $items )
                    : array( 'ok' => false, 'code' => 200, 'items' => array(), 'error' => 'unparseable' );
            } else {
                $c = array( 'ok' => false, 'code' => (int) $r['code'], 'items' => array(), 'error' => isset( $r['error'] ) ? $r['error'] : ( 'http_' . $r['code'] ) );
            }
            set_transient( 'asg_feed_' . md5( $url ), $c, $c['ok'] ? 10 * MINUTE_IN_SECONDS : 2 * MINUTE_IN_SECONDS );
            $res[ $i ] = $c;
        }
    }
    $out = array();
    foreach ( $reg as $i => $f ) { $out[] = array( 'feed' => $f, 'res' => $res[ $i ] ); }
    return $out;
}

function autonom_asg_term_hits( $text, $terms ) {
    $hits  = 0;
    $lower = mb_strtolower( $text );
    foreach ( $terms as $t ) {
        if ( preg_match( '/(?<![\p{L}\p{N}])' . preg_quote( mb_strtolower( $t ), '/' ) . '(?![\p{L}\p{N}])/u', $lower ) ) { $hits++; }
    }
    return $hits;
}

/**
 * GET /wp-json/autonom-asg/v1/feeds?q=missile OR sanctions OR tariff
 * Returns publisher-feed stories matching the terms (all recent stories if q is empty),
 * plus per-feed status so you can see which feeds work from this server.
 */
function autonom_asg_rest_feeds( WP_REST_Request $req ) {
    $terms = autonom_asg_news_terms( (string) $req->get_param( 'q' ), 24 );

    $ipk = 'asg_frl_' . md5( autonom_asg_client_ip() );
    $n   = (int) get_transient( $ipk );
    if ( $n >= 80 ) { return new WP_REST_Response( array( 'ok' => false, 'error' => 'rate_limited' ), 429 ); }
    set_transient( $ipk, $n + 1, 10 * MINUTE_IN_SECONDS );

    $collected = autonom_asg_collect_feeds();
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
            $hits = $terms ? autonom_asg_term_hits( $it['title'] . ' ' . $it['description'], $terms ) : 0;
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
function autonom_asg_shortcode( $atts ) {
    static $localized = false;

    wp_enqueue_style( 'autonom-asg-tool' );
    wp_enqueue_script( 'autonom-asg-backend' );

    if ( ! $localized ) {
        wp_localize_script( 'autonom-asg-backend', 'AUTONOM_ASG', array(
            'version'         => AUTONOM_ASG_VERSION,
            'articleEndpoint' => esc_url_raw( rest_url( 'autonom-asg/v1/article' ) ),
            'newsEndpoint'    => esc_url_raw( rest_url( 'autonom-asg/v1/news' ) ),
            'feedsEndpoint'   => esc_url_raw( rest_url( 'autonom-asg/v1/feeds' ) ),
            'llmEndpoint'     => esc_url_raw( rest_url( 'autonom-asg/v1/llm' ) ),
            'mediaEndpoint'   => esc_url_raw( rest_url( 'autonom-asg/v1/media' ) ),
        ) );
        $localized = true;
    }

    ob_start();
    ?>
<div class="asg-root">

  <div class="asg-topbar">
    <div class="asg-topbar-inner">
      <div class="asg-brand">
        <span class="asg-brand-mark">Autonom</span>
        <span class="asg-brand-sep">·</span>
        <span class="asg-brand-sub">AI Shorts Generator</span>
      </div>
      <div class="asg-steps" role="tablist">
        <button class="asg-step is-active" data-step="channel" type="button"><em>1</em><span>Channel</span></button>
        <button class="asg-step" data-step="feed" type="button" disabled><em>2</em><span>Feed</span></button>
        <button class="asg-step" data-step="generate" type="button" disabled><em>3</em><span>Generate</span></button>
        <button class="asg-step" data-step="scripts" type="button" disabled><em>4</em><span>Review</span></button>
        <button class="asg-step" data-step="video" type="button" disabled><em>5</em><span>Video</span></button>
        <button class="asg-step" data-step="export" type="button" disabled><em>6</em><span>Export</span></button>
      </div>

<span class="asg-topbar-sep" aria-hidden="true"></span>
<div class="asg-topbar-actions">
  <div class="asg-keys-group" role="group" aria-label="API keys">
    <span class="asg-keys-title">API keys</span>
    <span class="asg-api-status" id="asg-api-status" title="API keys status">
      <span class="asg-api-dot"></span>
      <span class="asg-api-label">Keys</span>
    </span>
    <button class="asg-btn-pill asg-open-settings" type="button" title="Add or change your API keys and provider settings">
      ⚙ Manage keys
    </button>
  </div>
  <button class="asg-btn-pill asg-privacy-toggle" type="button">
    <span class="asg-privacy-dot"></span> Data &amp; privacy
  </button>
</div>

    </div>

    <div class="asg-privacy-drawer" hidden>
      <div class="asg-privacy-drawer-inner">
        <h4>Data &amp; privacy</h4>
        <ul class="asg-privacy-list">
          <li><span class="asg-check">✓</span> Your profile, scripts and API keys are stored in this browser only (keys are saved unencrypted in local storage)</li>
          <li><span class="asg-check">✓</span> No Autonom backend or database; nothing is stored on a server</li>
          <li><span class="asg-check">✓</span> News searches and article pages (the story's own article and, for cross-checking, one or two other outlets' articles on the same event) are fetched by this website's own server and only cached briefly (10 min to 6 hours)</li>
          <li><span class="asg-check">✓</span> LLM, YouTube and footage calls use your own API keys. Gemini, OpenAI, DeepSeek and YouTube are called directly from your browser. Groq, OpenRouter and stock-footage downloads are relayed by this website's server, which forwards them and does not store your keys, scripts or media</li>
        </ul>
        <div class="asg-privacy-stats">
          <div><span>API calls</span><strong id="asg-stat-api">0</strong></div>
          <div><span>LLM calls</span><strong id="asg-stat-llm">0</strong></div>
        </div>
        <p class="asg-privacy-note">Your server reads publisher RSS feeds (BBC, Al Jazeera, Guardian, DW, NPR, Sky, Euronews, CBC, NYT, WSJ), searches GDELT, Bing News and Google News, and reads the article pages of the stories you select. Your browser calls YouTube (googleapis.com) and Google Gemini, OpenAI or DeepSeek directly; requests to Groq and OpenRouter, and stock-footage downloads from Pixabay and Pexels, pass through your server, which forwards them without storing them. Only if the server search fails does your browser fall back to GDELT directly or to the public CORS proxies allorigins.win, codetabs.com and rss2json.com, which then see your search terms.</p>
      </div>
    </div>
  </div>

  <!-- ============ STEP 1 · CHANNEL ============ -->
  <section class="asg-panel" data-panel="channel">
    <header class="asg-panel-head">
      <h2>Connect a channel</h2>
      <p class="asg-lead">Autonom learns what your channel publishes, then turns today's breaking news into Shorts scripts.</p>
    </header>

    <div class="asg-mode-grid">
      <button class="asg-mode-card" data-mode="youtube" type="button">
        <h3>From YouTube</h3>
        <p>Read the last 30 public videos to derive topics, tone, and cadence.</p>
      </button>
      <button class="asg-mode-card" data-mode="manual" type="button">
        <h3>Manual setup</h3>
        <p>Define topics, tone, and format yourself. No API keys needed.</p>
      </button>
    </div>

    <div class="asg-mode-form" data-mode="youtube" hidden>
      <label class="asg-field">
        <span class="asg-label">YouTube channel handle or URL</span>
        <input type="text" id="asg-yt-input" placeholder="@BlomstraInsights or channel URL">
      </label>
      <p class="asg-hint">Requires a YouTube Data API key. Add it under <button type="button" class="asg-link asg-open-settings">API keys</button>.</p>
      <div class="asg-actions">
        <button class="asg-btn asg-btn-primary" id="asg-yt-fetch" type="button">Fetch &amp; derive</button>
      </div>
    </div>

    <div class="asg-mode-form" data-mode="manual" hidden>
      <label class="asg-field">
        <span class="asg-label">Channel name</span>
        <input type="text" id="asg-manual-name" placeholder="BlomstraInsights">
      </label>
      <label class="asg-field">
        <span class="asg-label">One-liner</span>
        <input type="text" id="asg-manual-oneliner" placeholder="Geopolitics × macroeconomy × tech intersection">
      </label>
      <label class="asg-field">
        <span class="asg-label">Starting topics <small>(comma-separated; you can add, remove and tune topics after saving)</small></span>
        <input type="text" id="asg-manual-topics" placeholder="Geopolitics, Macroeconomy, Tech">
      </label>
      <label class="asg-field">
        <span class="asg-label">Signals <small>(keywords the scanner should match — comma-separated, 3+ characters each, optional)</small></span>
        <input type="text" id="asg-manual-signals" placeholder="missile, sanctions, Federal Reserve, tariff, drone, chip">
      </label>
      <div class="asg-grid-2">
        <label class="asg-field">
          <span class="asg-label">Tone</span>
          <select id="asg-manual-tone">
            <option value="analytical">Analytical</option>
            <option value="urgent">Urgent</option>
            <option value="neutral">Neutral brief</option>
            <option value="contrarian">Contrarian</option>
          </select>
        </label>
        <label class="asg-field">
          <span class="asg-label">Target duration</span>
          <select id="asg-manual-duration">
            <option value="60" selected>60 seconds (Shorts default)</option>
            <option value="75">75 seconds</option>
            <option value="90">90 seconds (1:30)</option>
            <option value="105">105 seconds (1:45, for bigger topics)</option>
          </select>
        </label>
      </div>
      <div class="asg-actions">
        <button class="asg-btn asg-btn-primary" id="asg-manual-save" type="button">Save profile</button>
      </div>
    </div>

    <div class="asg-profile-editor" id="asg-profile-editor" hidden>
      <div class="asg-editor-head">
        <h3>Topic Profile</h3>
        <div class="asg-editor-actions">
          <button class="asg-btn asg-btn-ghost" id="asg-edit-toggle" type="button">Edit</button>
          <button class="asg-btn asg-btn-primary" id="asg-continue-feed" type="button">Continue to Feed →</button>
        </div>
      </div>
      <div class="asg-profile-view" id="asg-profile-view"></div>
      <div class="asg-profile-edit" id="asg-profile-edit" hidden></div>
    </div>
  </section>

  <!-- ============ STEP 2 · FEED ============ -->
  <section class="asg-panel" data-panel="feed" hidden>
    <header class="asg-panel-head">
      <h2>Scan live news</h2>
      <p class="asg-lead">Autonom reads publisher feeds (BBC, Al Jazeera, Guardian, DW, NPR, Sky, Euronews, CBC, NYT, WSJ) and searches aggregators (GDELT, Bing News, Google News) for stories matching your profile's signals. Stories marked "readable" can be turned into scripts; paywalled and headline-only stories are for topic discovery.</p>
    </header>

    <div class="asg-actions">
      <button class="asg-btn asg-btn-primary" id="asg-scan-btn" type="button">Scan feeds</button>
      <button class="asg-btn asg-btn-ghost" id="asg-back-channel" type="button">← Back to Channel</button>
    </div>

    <div class="asg-progress" id="asg-scan-progress" hidden>
      <div class="asg-progress-bar"><div class="asg-progress-fill"></div></div>
      <p class="asg-progress-label">Searching…</p>
    </div>

    <div class="asg-story-list" id="asg-story-list"></div>

    <div class="asg-actions" id="asg-feed-next" hidden>
      <button class="asg-btn asg-btn-primary" id="asg-continue-scripts" type="button">Continue →</button>
    </div>
  </section>

  <!-- ============ STEP 3 · GENERATE ============ -->
  <section class="asg-panel" data-panel="generate" hidden>
    <header class="asg-panel-head">
      <h2>Generate scripts</h2>
      <p class="asg-lead">Each script is written only from readable source articles. Facts are extracted with exact quotes and checked against the article. Autonom then looks for a second outlet covering the same event and marks each fact as confirmed by both, single-source, or differing. Numbers, names and wording are checked, then every sentence is audited. Stories without a readable source are skipped, not guessed.</p>
    </header>

    <div id="asg-generate-summary"></div>

    <div class="asg-actions">
      <button class="asg-btn asg-btn-primary" id="asg-generate-btn" type="button">Generate scripts</button>
      <button class="asg-btn asg-btn-ghost" id="asg-back-feed" type="button">← Back to Feed</button>
    </div>

    <div class="asg-progress" id="asg-script-progress" hidden>
      <div class="asg-progress-bar"><div class="asg-progress-fill"></div></div>
      <p class="asg-progress-label">Composing…</p>
    </div>
  </section>

  <!-- ============ STEP 4 · REVIEW ============ -->
  <section class="asg-panel" data-panel="scripts" hidden>
    <header class="asg-panel-head">
      <h2>Review and edit</h2>
      <p class="asg-lead">Open a card to read the full script, fix anything, and mark it reviewed. Amber cards have something the checks could not confirm. Template cards were not written by the AI and are not fact-checked.</p>
    </header>

    <div class="asg-script-list" id="asg-script-list"></div>

    <div class="asg-actions" id="asg-scripts-next">
      <button class="asg-btn asg-btn-ghost" id="asg-back-generate" type="button">← Back to Generate</button>
      <button class="asg-btn asg-btn-primary" id="asg-continue-video" type="button" hidden>Continue to Video →</button>
    </div>
  </section>

  <!-- ============ STEP 5 · VIDEO ============ -->
  <section class="asg-panel" data-panel="video" hidden>
    <header class="asg-panel-head">
      <h2>Make videos</h2>
      <p class="asg-lead">Turn each script into a vertical short with a voice, captions and footage. Only the narration is used here. Title, description and tags are kept for the upload.</p>
    </header>

    <div id="asg-video-root"></div>

    <div class="asg-actions">
      <button class="asg-btn asg-btn-ghost" id="asg-back-review" type="button">← Back to Review</button>
      <button class="asg-btn asg-btn-primary" id="asg-make-all" type="button">Make all videos</button>
      <button class="asg-btn asg-btn-ghost" id="asg-continue-export" type="button">Continue to Export →</button>
    </div>
  </section>

  <!-- ============ STEP 6 · EXPORT ============ -->
  <section class="asg-panel" data-panel="export" hidden>
    <header class="asg-panel-head">
      <h2>Export</h2>
      <p class="asg-lead">Take your scripts, voice-overs, captions and videos anywhere. Autonom never uploads on your behalf.</p>
    </header>

    <div class="asg-export-grid">
      <button class="asg-export-card" id="asg-export-zip" type="button">
        <h3>Download everything (ZIP)</h3>
        <p>Every script with its video, voice-over, captions, narration and upload details, in one folder per short.</p>
      </button>
      <button class="asg-export-card" id="asg-export-json" type="button">
        <h3>Download JSON</h3>
        <p>All scripts, narration and metadata, plus where each media file sits in the ZIP.</p>
      </button>
      <button class="asg-export-card" id="asg-export-txt" type="button">
        <h3>Download TXT</h3>
        <p>Human-readable bundle. One script per section.</p>
      </button>
      <button class="asg-export-card" id="asg-export-copy" type="button">
        <h3>Copy all to clipboard</h3>
        <p>Paste straight into your pipeline or notes.</p>
      </button>
    </div>

    <h3 style="margin:18px 0 8px;">Videos, audio and captions</h3>
    <div id="asg-export-media"></div>

    <div class="asg-payload-preview">
      <h3>Handoff payload</h3>
      <p class="asg-hint">This is the exact JSON structure your renderer or webhook will receive. The media entries name the files inside the ZIP.</p>
      <pre id="asg-payload-pre"></pre>
    </div>

    <div class="asg-actions">
      <button class="asg-btn asg-btn-ghost" id="asg-back-video" type="button">← Back to Video</button>
      <button class="asg-btn asg-btn-ghost" id="asg-restart" type="button">Start over</button>
    </div>
  </section>

  <!-- ============ SETTINGS DRAWER ============ -->
  <aside class="asg-drawer" id="asg-settings-drawer" hidden>
    <div class="asg-drawer-inner">
      <div class="asg-drawer-head">
        <h3>API keys &amp; settings</h3>
        <button class="asg-btn-close" id="asg-settings-close" type="button">×</button>
      </div>

      <label class="asg-field">
        <span class="asg-label">YouTube Data API key</span>
        <input type="password" id="asg-set-yt" placeholder="AIza...">
        <span class="asg-hint">From console.cloud.google.com. Restrict to autonom.app and blomstrainsights.com referrers.</span>
      </label>

      <label class="asg-field">
        <span class="asg-label">Model provider</span>
        <select id="asg-set-provider">
          <option value="gemini">Google Gemini</option>
          <option value="groq">Groq</option>
          <option value="openrouter">OpenRouter</option>
          <option value="openai">OpenAI</option>
          <option value="deepseek">DeepSeek</option>
          <option value="none">None — heuristic only</option>
        </select>
      </label>

<label class="asg-field" data-provider="gemini">
  <span class="asg-label">Gemini API key</span>
  <input type="password" id="asg-set-gemini" placeholder="AQ... or AIza...">
  <span class="asg-hint">From aistudio.google.com. Both AQ. and AIza keys work. Any plan works: Autonom uses whatever models your key can access.</span>
  <button class="asg-btn asg-btn-ghost" id="asg-test-gemini" type="button" style="margin-top:6px;">Test this key</button>
</label>

<label class="asg-field" data-provider="gemini">
  <span class="asg-label">Preferred Gemini model</span>
  <input type="text" id="asg-set-gemini-model" placeholder="leave empty: picked automatically from your key">
  <span class="asg-hint">Tried first; if it is overloaded or out of quota, Autonom falls through to other models automatically. Model names change: run __asgListModels() in the browser console to see yours.</span>
</label>

      <label class="asg-field" data-provider="gemini">
        <span class="asg-label">Model for comparison, writing and audit (optional)</span>
        <input type="text" id="asg-set-gemini-write-model" placeholder="optional, leave empty to auto-pick">
        <span class="asg-hint">Used first for the outlet comparison, the script and the sentence audit, where judgement and wording quality matter most. Fact extraction uses the model above. Leave empty to use one model for everything. If it is overloaded or out of quota, Autonom falls back automatically.</span>
      </label>

      <label class="asg-field" style="display:flex;gap:8px;align-items:flex-start;">
        <input type="checkbox" id="asg-set-require2" style="margin-top:4px;">
        <span><span class="asg-label">Require a second outlet</span>
        <span class="asg-hint" style="display:block;">When on, a story is skipped unless another open outlet reports the same event and at least one key fact matches. Off by default: stories only one outlet covers are still written, clearly marked as single-source.</span></span>
      </label>

      <label class="asg-field" style="display:flex;gap:8px;align-items:flex-start;">
        <input type="checkbox" id="asg-set-depth" style="margin-top:4px;" checked>
        <span><span class="asg-label">Add analysis (outside knowledge)</span>
        <span class="asg-hint" style="display:block;">Adds a short, clearly labelled section of general background and explanation that is not in the article, so the short does more than summarise. It may not contain numbers, names or quotes, is checked separately, and is not backed by a source quote, so read it before publishing. Turn off for article facts only.</span></span>
      </label>

      <label class="asg-field" style="display:flex;gap:8px;align-items:flex-start;">
        <input type="checkbox" id="asg-set-fallback" style="margin-top:4px;" checked>
        <span><span class="asg-label">Use my other AI keys as a backup</span>
        <span class="asg-hint" style="display:block;">If the AI service you picked is overloaded, rate-limited or out of quota, Autonom tries the other services you have saved a key for, instead of giving up with a template. Each script says which service wrote it.</span></span>
      </label>

      <label class="asg-field" data-provider="groq" hidden>
        <span class="asg-label">Groq API key</span>
        <input type="password" id="asg-set-groq" placeholder="gsk_...">
        <span class="asg-hint">From console.groq.com (API Keys). Any plan works.</span>
        <button class="asg-btn asg-btn-ghost" id="asg-test-groq" type="button" style="margin-top:6px;">Test this key</button>
      </label>
      <label class="asg-field" data-provider="groq" hidden>
        <span class="asg-label">Groq model (optional)</span>
        <input type="text" id="asg-set-groq-model" placeholder="leave empty to auto-pick">
        <span class="asg-hint">Used for fact extraction. Leave empty and Autonom asks Groq which models your key can use and picks the strongest. If one is rate-limited it waits as Groq asks, or tries the next model.</span>
      </label>
      <label class="asg-field" data-provider="groq" hidden>
        <span class="asg-label">Groq model for comparison, writing and audit (optional)</span>
        <input type="text" id="asg-set-groq-write-model" placeholder="leave empty to auto-pick">
        <span class="asg-hint">Rate limits are per model. Left empty, writing and audit start on a different model than extraction so the two use separate quotas.</span>
      </label>
      <label class="asg-field" data-provider="openrouter" hidden>
        <span class="asg-label">OpenRouter API key</span>
        <input type="password" id="asg-set-openrouter" placeholder="sk-or-...">
        <span class="asg-hint">From openrouter.ai (Keys). Left empty, Autonom picks automatically from models that cost nothing per token, so no credits are spent. To use a paid model with your credits, type its exact name in the model field below.</span>
        <button class="asg-btn asg-btn-ghost" id="asg-test-openrouter" type="button" style="margin-top:6px;">Test this key</button>
      </label>
      <label class="asg-field" data-provider="openrouter" hidden>
        <span class="asg-label">OpenRouter model (optional)</span>
        <input type="text" id="asg-set-openrouter-model" placeholder="leave empty to auto-pick (zero-cost models only)">
      </label>
      <label class="asg-field" data-provider="openrouter" hidden>
        <span class="asg-label">OpenRouter model for comparison, writing and audit (optional)</span>
        <input type="text" id="asg-set-openrouter-write-model" placeholder="leave empty to auto-pick">
      </label>

      <label class="asg-field" data-provider="openai" hidden>
        <span class="asg-label">OpenAI API key</span>
        <input type="password" id="asg-set-openai" placeholder="sk-...">
      </label>
      <label class="asg-field" data-provider="deepseek" hidden>
        <span class="asg-label">DeepSeek API key</span>
        <input type="password" id="asg-set-deepseek" placeholder="sk-...">
      </label>

      <label class="asg-field">
        <span class="asg-label">Footage library (for videos)</span>
        <select id="asg-set-stock">
          <option value="pixabay">Pixabay</option>
          <option value="pexels">Pexels</option>
        </select>
        <span class="asg-hint">Where background clips come from. Without a key, videos use a plain background with captions.</span>
      </label>
      <label class="asg-field">
        <span class="asg-label">Pixabay API key</span>
        <input type="password" id="asg-set-pixabay" placeholder="from pixabay.com/api/docs" autocomplete="off">
      </label>
      <label class="asg-field">
        <span class="asg-label">Pexels API key</span>
        <input type="password" id="asg-set-pexels" placeholder="from pexels.com/api" autocomplete="off">
      </label>

      <div class="asg-drawer-actions">
        <button class="asg-btn asg-btn-primary" id="asg-settings-save" type="button">Save settings</button>
      </div>
    </div>
  </aside>

</div>
    <?php
    return ob_get_clean();
}
add_shortcode( 'autonom_ai_shorts_generator', 'autonom_asg_shortcode' );
