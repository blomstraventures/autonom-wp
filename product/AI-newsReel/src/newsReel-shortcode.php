/**
 * Autonom Newsreel — Shortcode
 * Shortcode: [autonom_newsreel]  (the old [autonom_ai_shorts_generator] still works)
 * v1.28.3
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

if ( ! defined( 'AUTONOM_ASG_VERSION' ) ) {
    define( 'AUTONOM_ASG_VERSION', '1.28.3' );
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

/* ------------------------------------------------------------------
 * Publish relay (owner only).
 * The browser sends the finished video and the texts; this hosts the video at a
 * public, unguessable URL (Instagram and others fetch from a URL) and forwards the
 * job to the owner's own automation webhook (Make, n8n, Zapier, ...).
 * Only logged-in users who may upload files can use it, so visitors of the free
 * tool cannot push files to this server or fire the webhook.
 * ------------------------------------------------------------------ */
function autonom_asg_can_publish() {
    return is_user_logged_in() && current_user_can( 'upload_files' );
}

function autonom_asg_publish_dir() {
    $up = wp_get_upload_dir();
    if ( ! empty( $up['error'] ) ) return null;
    $dir = trailingslashit( $up['basedir'] ) . 'autonom-newsreel';
    if ( ! file_exists( $dir ) ) {
        wp_mkdir_p( $dir );
        @file_put_contents( $dir . '/index.html', '' );
    }
    return array( 'dir' => $dir, 'url' => trailingslashit( $up['baseurl'] ) . 'autonom-newsreel' );
}

/** Videos only need to live until the automation has fetched them. */
function autonom_asg_publish_cleanup( $dir, $max_age = 259200 ) {
    foreach ( (array) glob( trailingslashit( $dir ) . '*.{mp4,webm,mov}', GLOB_BRACE ) as $f ) {
        if ( is_file( $f ) && ( time() - filemtime( $f ) ) > $max_age ) @unlink( $f );
    }
}

function autonom_asg_rest_publish( WP_REST_Request $req ) {
    $meta = json_decode( (string) $req->get_param( 'meta' ), true );
    if ( ! is_array( $meta ) ) {
        return new WP_REST_Response( array( 'ok' => false, 'error' => 'bad_request' ), 400 );
    }
    $hook = isset( $meta['webhook'] ) ? esc_url_raw( trim( (string) $meta['webhook'] ) ) : '';
    if ( ! $hook || strpos( $hook, 'https://' ) !== 0 || ! wp_http_validate_url( $hook ) ) {
        return new WP_REST_Response( array( 'ok' => false, 'error' => 'webhook_invalid', 'message' => 'The webhook address must be a public https URL.' ), 400 );
    }
    $event = array(
        'event'        => ! empty( $meta['test'] ) ? 'newsreel.test' : 'newsreel.publish',
        'sent_at'      => gmdate( 'c' ),
        'profile'      => isset( $meta['profile'] ) ? $meta['profile'] : null,
        'platforms'    => isset( $meta['platforms'] ) && is_array( $meta['platforms'] ) ? array_values( $meta['platforms'] ) : array(),
        'scheduled_at' => isset( $meta['scheduled_at'] ) ? (string) $meta['scheduled_at'] : '',
        'scheduled_local' => isset( $meta['scheduled_local'] ) ? (string) $meta['scheduled_local'] : '',
        'timezone'     => isset( $meta['timezone'] ) ? (string) $meta['timezone'] : '',
        'title'        => isset( $meta['title'] ) ? (string) $meta['title'] : '',
        'description'  => isset( $meta['description'] ) ? (string) $meta['description'] : '',
        'tags'         => isset( $meta['tags'] ) && is_array( $meta['tags'] ) ? $meta['tags'] : array(),
        'posts'        => isset( $meta['posts'] ) && is_array( $meta['posts'] ) ? $meta['posts'] : new stdClass(),
        'pinned_comment' => isset( $meta['pinned_comment'] ) ? (string) $meta['pinned_comment'] : '',
        'sources'      => isset( $meta['sources'] ) && is_array( $meta['sources'] ) ? $meta['sources'] : array(),
        'duration_sec' => isset( $meta['duration_sec'] ) ? (int) $meta['duration_sec'] : 0,
        'captions_srt' => isset( $meta['captions_srt'] ) ? (string) $meta['captions_srt'] : '',
        'video_url'    => '',
        'video_mime'   => '',
    );

    $files = $req->get_file_params();
    if ( empty( $event['event'] ) || ( $event['event'] === 'newsreel.publish' && empty( $files['video'] ) ) ) {
        return new WP_REST_Response( array( 'ok' => false, 'error' => 'no_video', 'message' => 'No video file was received.' ), 400 );
    }
    if ( ! empty( $files['video'] ) ) {
        $f = $files['video'];
        if ( ! empty( $f['error'] ) || empty( $f['tmp_name'] ) || ! is_uploaded_file( $f['tmp_name'] ) ) {
            $why = ( isset( $f['error'] ) && (int) $f['error'] === UPLOAD_ERR_INI_SIZE ) ? 'The video is larger than this server allows (upload_max_filesize / post_max_size).' : 'The video upload failed.';
            return new WP_REST_Response( array( 'ok' => false, 'error' => 'upload_failed', 'message' => $why ), 413 );
        }
        $ext = strtolower( pathinfo( (string) $f['name'], PATHINFO_EXTENSION ) );
        if ( ! in_array( $ext, array( 'mp4', 'webm', 'mov' ), true ) ) {
            return new WP_REST_Response( array( 'ok' => false, 'error' => 'bad_type', 'message' => 'Only mp4, webm or mov videos are accepted.' ), 415 );
        }
        $loc = autonom_asg_publish_dir();
        if ( ! $loc ) return new WP_REST_Response( array( 'ok' => false, 'error' => 'no_storage', 'message' => 'The uploads folder is not writable.' ), 500 );
        autonom_asg_publish_cleanup( $loc['dir'] );
        $name = bin2hex( random_bytes( 12 ) ) . '.' . $ext;
        if ( ! @move_uploaded_file( $f['tmp_name'], trailingslashit( $loc['dir'] ) . $name ) ) {
            return new WP_REST_Response( array( 'ok' => false, 'error' => 'no_storage', 'message' => 'Could not store the video.' ), 500 );
        }
        $event['video_url']  = trailingslashit( $loc['url'] ) . $name;
        $event['video_mime'] = $ext === 'mp4' ? 'video/mp4' : ( $ext === 'webm' ? 'video/webm' : 'video/quicktime' );
    }

    $headers = array( 'Content-Type' => 'application/json', 'User-Agent' => 'Autonom-Newsreel/' . AUTONOM_ASG_VERSION );
    if ( ! empty( $meta['secret'] ) ) $headers['X-Newsreel-Secret'] = (string) $meta['secret'];
    $res = wp_safe_remote_post( $hook, array( 'timeout' => 25, 'headers' => $headers, 'body' => wp_json_encode( $event ) ) );
    if ( is_wp_error( $res ) ) {
        return new WP_REST_Response( array( 'ok' => false, 'error' => 'webhook_failed', 'message' => $res->get_error_message(), 'video_url' => $event['video_url'] ), 502 );
    }
    $code = (int) wp_remote_retrieve_response_code( $res );
    return new WP_REST_Response( array(
        'ok'             => $code >= 200 && $code < 300,
        'webhook_status' => $code,
        'webhook_reply'  => substr( (string) wp_remote_retrieve_body( $res ), 0, 300 ),
        'video_url'      => $event['video_url'],
    ), 200 );
}

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
    register_rest_route( 'autonom-asg/v1', '/publish', array(
        'methods'             => 'POST',
        'callback'            => 'autonom_asg_rest_publish',
        'permission_callback' => 'autonom_asg_can_publish',
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
        $headers['X-Title']      = 'Autonom Newsreel';
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
    $bot = 'Mozilla/5.0 (compatible; AutonomASG/' . AUTONOM_ASG_VERSION . '; +' . home_url( '/' ) . ')';
    $res = $fetch( $bot );
    $code = is_wp_error( $res ) ? 0 : (int) wp_remote_retrieve_response_code( $res );
    // Many publishers refuse unknown bots (401/403/429/503). Retry once as a plain browser request.
    if ( is_wp_error( $res ) || in_array( $code, array( 401, 403, 406, 429, 503 ), true ) ) {
        $res2 = $fetch( 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' );
        if ( ! is_wp_error( $res2 ) ) { $res = $res2; $code = (int) wp_remote_retrieve_response_code( $res ); }
    }
    if ( is_wp_error( $res ) ) {
        return autonom_asg_article_fail( 'fetch_failed' );
    }
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
            'publishEndpoint' => esc_url_raw( rest_url( 'autonom-asg/v1/publish' ) ),
            'canPublish'      => autonom_asg_can_publish(),
            'restNonce'       => wp_create_nonce( 'wp_rest' ),
        ) );
        $localized = true;
    }

    ob_start();
    ?>
<style id="asg-tool-style">
/* Autonom Newsreel tool design system. Scoped under .asg-root.
   Shipped inline by the shortcode, so no separate stylesheet or WPCode snippet is needed. */

.asg-root {
  --asg-ink: #0d1424;
  --asg-ink-2: #172036;
  --asg-ink-line: rgba(255, 255, 255, .12);
  --asg-ink-text: #e8ecf5;
  --asg-ink-dim: #93a0ba;
  --asg-bg: #ffffff;
  --asg-bg-soft: #f6f7fa;
  --asg-bg-muted: #eceff5;
  --asg-border: #dde1ea;
  --asg-text: #141a2a;
  --asg-text-muted: #4f5a6e;
  --asg-text-dim: #7a869b;
  --asg-accent: #3157f0;
  --asg-accent-hover: #2142cc;
  --asg-accent-soft: #edf1ff;
  --asg-signal: #f5a524;
  --asg-signal-soft: #fff4de;
  --asg-critical: #d12c2c;
  --asg-warning: #b36b00;
  --asg-passed: #14804a;
  --asg-radius: 14px;
  --asg-radius-sm: 9px;
  --asg-shadow: 0 1px 2px rgba(13, 20, 36, .05), 0 6px 18px rgba(13, 20, 36, .05);
  --asg-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --asg-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

  font-family: var(--asg-sans);
  color: var(--asg-text);
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
.asg-root *, .asg-root *::before, .asg-root *::after { box-sizing: border-box; }
.asg-root [hidden] { display: none !important; }
.asg-root button { font: inherit; cursor: pointer; }
.asg-root h1, .asg-root h2, .asg-root h3, .asg-root h4 { font-family: var(--asg-sans); letter-spacing: -.012em; color: var(--asg-text); }
.asg-root p, .asg-root span, .asg-root label, .asg-root li, .asg-root dt, .asg-root dd,
.asg-root input, .asg-root select, .asg-root textarea, .asg-root button { font-family: var(--asg-sans); }
.asg-root a { color: var(--asg-accent); }
.asg-root a:hover, .asg-root a:focus { color: var(--asg-accent-hover); background: transparent; }
.asg-root input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
.asg-root select, .asg-root textarea { color: var(--asg-text); background-color: var(--asg-bg); }
.asg-root ::placeholder { color: var(--asg-text-dim); opacity: 1; }
.asg-root :focus-visible { outline: 2px solid var(--asg-accent); outline-offset: 2px; }

/* ---------- Header: control strip + step rail ---------- */
.asg-root .asg-topbar { position: sticky; top: 0; z-index: 30; background: var(--asg-ink); color: var(--asg-ink-text); border-radius: var(--asg-radius) var(--asg-radius) 0 0; box-shadow: 0 8px 24px rgba(13, 20, 36, .18); }
.asg-root .asg-topbar-inner { display: flex; align-items: center; justify-content: space-between; gap: 12px 20px; padding: 12px 20px 10px; flex-wrap: wrap; max-width: none; margin: 0; }
.asg-root .asg-brand { font-weight: 650; font-size: 15px; white-space: nowrap; letter-spacing: -.01em; display: inline-flex; align-items: center; }
.asg-root .asg-brand::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: var(--asg-signal); margin-right: 10px; box-shadow: 0 0 0 4px rgba(245, 165, 36, .2); }
.asg-root .asg-brand-mark { color: #fff; }
.asg-root .asg-brand-sep { color: var(--asg-ink-dim); margin: 0 5px; }
.asg-root .asg-brand-sub { color: var(--asg-ink-dim); font-weight: 500; }
.asg-root .asg-topbar-sep { display: none; }
.asg-root .asg-topbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.asg-root .asg-keys-group { display: inline-flex; align-items: center; gap: 6px; padding: 3px 4px 3px 12px; border: 1px solid var(--asg-ink-line); border-radius: 999px; background: rgba(255, 255, 255, .05); }
.asg-root .asg-keys-group .asg-keys-title { font-size: 12px; font-weight: 600; letter-spacing: 0; text-transform: none; color: var(--asg-ink-dim); }
.asg-root .asg-api-status { white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; background: rgba(255, 255, 255, .08); font-size: 12px; color: var(--asg-ink-text); }
.asg-root .asg-api-dot { width: 7px; height: 7px; border-radius: 50%; background: #ff6b6b; }
.asg-root .asg-api-status.is-ok .asg-api-dot { background: #3ddc84; box-shadow: 0 0 0 3px rgba(61, 220, 132, .2); }
.asg-root .asg-api-status.is-partial .asg-api-dot { background: var(--asg-signal); box-shadow: 0 0 0 3px rgba(245, 165, 36, .22); }

.asg-root .asg-btn-pill { display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px; border-radius: 999px; border: 1px solid var(--asg-ink-line); background: rgba(255, 255, 255, .06); color: var(--asg-ink-text); font-size: 12.5px; font-weight: 500; white-space: nowrap; line-height: 1.2; }
.asg-root .asg-privacy-dot { width: 7px; height: 7px; border-radius: 50%; background: #3ddc84; box-shadow: 0 0 0 3px rgba(61, 220, 132, .2); }

/* Step rail: one segment per step, like story progress bars */
.asg-root .asg-rail { padding: 0 20px 14px; }
.asg-root .asg-steps { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 6px; flex: none; justify-content: stretch; }
.asg-root .asg-step { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: baseline; column-gap: 6px; row-gap: 7px; padding: 0; background: transparent; border: 0; border-radius: 0; font-size: 12.5px; font-weight: 500; color: var(--asg-ink-dim); text-align: left; min-width: 0; }
.asg-root .asg-step::before { content: ""; display: block; width: 100%; height: 4px; border-radius: 999px; background: rgba(255, 255, 255, .14); transition: background .2s; grid-column: 1 / -1; }
.asg-root .asg-step > span { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asg-root .asg-step em { font-style: normal; font-size: 11.5px; font-variant-numeric: tabular-nums; opacity: .65; }
.asg-root .asg-step:disabled { opacity: .85; cursor: not-allowed; }
.asg-root .asg-step.is-done { color: var(--asg-ink-text); }
.asg-root .asg-step.is-done::before { background: rgba(91, 124, 250, .75); }
.asg-root .asg-step.is-active { color: #fff; font-weight: 650; background: transparent; border: 0; }
.asg-root .asg-step.is-active::before { background: #fff; }
.asg-root .asg-step:not(:disabled):hover, .asg-root .asg-step:not(:disabled):focus-visible { background: transparent; color: #fff; border-color: transparent; }
.asg-root .asg-step:not(:disabled):hover::before { background: rgba(255, 255, 255, .5); }
.asg-root .asg-step.is-done:not(:disabled):hover::before { background: #8fa6ff; }
.asg-root .asg-step.is-active:not(:disabled):hover::before { background: #fff; }
.asg-root .asg-step:focus-visible { outline-color: #fff; border-radius: 6px; }

/* Privacy drawer */
.asg-root .asg-privacy-drawer { border-top: 1px solid var(--asg-ink-line); background: var(--asg-ink-2); color: var(--asg-ink-text); border-radius: 0; }
.asg-root .asg-privacy-drawer-inner { max-width: none; margin: 0; padding: 16px 20px; }
.asg-root .asg-privacy-drawer h4 { margin: 0 0 10px; font-size: 13px; font-weight: 650; letter-spacing: 0; text-transform: none; color: var(--asg-ink-dim); }
.asg-root .asg-privacy-list { list-style: none; padding: 0; margin: 0 0 14px; display: grid; gap: 7px; font-size: 13.5px; color: var(--asg-ink-text); }
.asg-root .asg-privacy-list li { display: flex; gap: 8px; align-items: flex-start; color: var(--asg-ink-text); }
.asg-root .asg-check { color: #3ddc84; font-weight: 700; }
.asg-root .asg-privacy-stats { display: flex; gap: 24px; padding: 12px 0; border-top: 1px solid var(--asg-ink-line); border-bottom: 1px solid var(--asg-ink-line); margin-bottom: 12px; flex-wrap: wrap; }
.asg-root .asg-privacy-stats > div { display: flex; flex-direction: column; font-size: 12px; color: var(--asg-ink-dim); }
.asg-root .asg-privacy-stats strong { font-size: 18px; color: #fff; font-variant-numeric: tabular-nums; }
.asg-root .asg-privacy-note { font-size: 12.5px; color: var(--asg-ink-dim); margin: 0; }

/* ---------- Panels ---------- */
.asg-root .asg-panel { padding: 30px 22px 40px; background: var(--asg-bg); border: 1px solid var(--asg-border); border-top: 0; border-radius: 0 0 var(--asg-radius) var(--asg-radius); }
.asg-root .asg-panel-head { margin-bottom: 22px; }
.asg-root .asg-panel-head h2 { margin: 0 0 6px; font-size: 24px; font-weight: 700; letter-spacing: -.02em; }
.asg-root .asg-lead { margin: 0; color: var(--asg-text-muted); font-size: 15px; max-width: 70ch; }

/* Mode cards */
.asg-root .asg-mode-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-bottom: 24px; align-items: stretch; }
.asg-root .asg-mode-card { display: block; text-align: left; padding: 20px; border: 1px solid var(--asg-border); border-radius: var(--asg-radius); background: var(--asg-bg); color: var(--asg-text); transition: border-color .15s, box-shadow .15s, background-color .15s; }
.asg-root .asg-mode-card h3 { margin: 0 0 6px; font-size: 15.5px; font-weight: 650; color: inherit; }
.asg-root .asg-mode-card p { margin: 0; color: var(--asg-text-muted); font-size: 13.5px; }
.asg-root .asg-mode-card:hover, .asg-root .asg-mode-card:focus-visible { border-color: var(--asg-accent); background: var(--asg-bg); box-shadow: var(--asg-shadow); color: var(--asg-text); }
.asg-root .asg-mode-card.is-selected { border-color: var(--asg-accent); background: var(--asg-accent-soft); box-shadow: 0 0 0 3px rgba(49, 87, 240, .12); }
.asg-root .asg-mode-card.is-selected:hover { background: var(--asg-accent-soft); }

/* Forms */
.asg-root .asg-mode-form { padding: 20px; border: 1px solid var(--asg-border); border-radius: var(--asg-radius); background: var(--asg-bg-soft); display: grid; gap: 14px; }
.asg-root .asg-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.asg-root .asg-field { display: grid; gap: 6px; }
.asg-root .asg-label { font-size: 13px; font-weight: 600; color: var(--asg-text); }
.asg-root .asg-label small { color: var(--asg-text-dim); font-weight: 400; }
.asg-root .asg-field input, .asg-root .asg-field select, .asg-root .asg-field textarea {
  padding: 10px 12px; border: 1px solid var(--asg-border); border-radius: var(--asg-radius-sm);
  background: var(--asg-bg); font: inherit; color: var(--asg-text); font-size: 14px; width: 100%;
  transition: border-color .15s, box-shadow .15s;
}
.asg-root .asg-field input:focus, .asg-root .asg-field select:focus, .asg-root .asg-field textarea:focus {
  outline: none; border-color: var(--asg-accent); box-shadow: 0 0 0 3px rgba(49, 87, 240, .16);
}
.asg-root .asg-field input[type="checkbox"], .asg-root .asg-field input[type="radio"] { width: auto; flex: none; padding: 0; margin-top: 4px; accent-color: var(--asg-accent); }
.asg-root .asg-hint.asg-test-res { display: block; min-height: 1.2em; margin-top: 6px; font-weight: 600; }
.asg-root .asg-hint.asg-test-res.is-ok { color: var(--asg-passed); }
.asg-root .asg-hint.asg-test-res.is-bad { color: var(--asg-critical); }
.asg-root .asg-hint { font-size: 12.5px; color: var(--asg-text-dim); margin: 0; }
.asg-root .asg-link { background: none; border: none; color: var(--asg-accent); padding: 0; text-decoration: underline; font-size: inherit; }
.asg-root .asg-link:hover, .asg-root .asg-link:focus { background: none; color: var(--asg-accent-hover); }

/* Buttons */
.asg-root .asg-actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
.asg-root .asg-btn { padding: 10px 18px; border-radius: var(--asg-radius-sm); border: 1px solid var(--asg-border); background: var(--asg-bg); font-size: 14px; font-weight: 600; color: var(--asg-text); transition: background-color .15s, border-color .15s, box-shadow .15s; line-height: 1.25; }
.asg-root .asg-btn-primary { background: var(--asg-accent); color: #fff; border-color: var(--asg-accent); box-shadow: 0 1px 2px rgba(49, 87, 240, .3); }
.asg-root .asg-btn-primary:disabled { opacity: .5; cursor: not-allowed; }

/* Story list */
.asg-root .asg-story-list { display: grid; gap: 10px; margin-top: 20px; }
.asg-root .asg-story { display: grid; grid-template-columns: auto 1fr auto; gap: 14px; padding: 14px; border: 1px solid var(--asg-border); border-radius: var(--asg-radius); background: var(--asg-bg); align-items: start; cursor: pointer; }
.asg-root .asg-story.is-selected { border-color: var(--asg-accent); background: var(--asg-accent-soft); }
.asg-root .asg-story input[type="checkbox"] { margin-top: 4px; width: 16px; height: 16px; accent-color: var(--asg-accent); }
.asg-root .asg-story-title { font-weight: 600; font-size: 14.5px; margin: 0 0 4px; }
.asg-root .asg-story-meta { font-size: 12.5px; color: var(--asg-text-dim); display: flex; gap: 10px; flex-wrap: wrap; }
.asg-root .asg-story-score { font-size: 12px; font-weight: 700; color: var(--asg-accent); white-space: nowrap; }

/* Profile view */
.asg-root .asg-profile-editor { margin-top: 24px; padding: 20px; border: 1px solid var(--asg-border); border-radius: var(--asg-radius); background: var(--asg-bg); }
.asg-root .asg-editor-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.asg-root .asg-editor-head h3 { margin: 0; font-size: 16px; }
.asg-root .asg-editor-actions { display: flex; gap: 8px; }
.asg-root .asg-profile-view dl { display: grid; grid-template-columns: 160px 1fr; gap: 10px 16px; margin: 0; font-size: 14px; }
.asg-root .asg-profile-view dt { color: var(--asg-text-dim); font-weight: 500; }
.asg-root .asg-profile-view dd { margin: 0; }
.asg-root .asg-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.asg-root .asg-chip { display: inline-block; padding: 3px 10px; border-radius: 999px; background: var(--asg-accent-soft); color: var(--asg-accent); font-size: 12px; font-weight: 600; }
.asg-root .asg-chip.is-muted { background: var(--asg-bg-muted); color: var(--asg-text-muted); }

/* Script cards */
.asg-root .asg-script-list { display: grid; gap: 16px; margin-top: 20px; }
.asg-root .asg-script-card { padding: 18px; border: 1px solid var(--asg-border); border-radius: var(--asg-radius); background: var(--asg-bg); }
.asg-root .asg-script-card h4 { margin: 0 0 4px; font-size: 15px; }
.asg-root .asg-script-source { font-size: 12.5px; color: var(--asg-text-dim); margin: 0 0 14px; }
.asg-root .asg-script-section { margin-bottom: 12px; }
.asg-root .asg-script-section label { display: block; font-size: 12px; font-weight: 600; color: var(--asg-text-dim); margin-bottom: 4px; }
.asg-root .asg-script-section textarea { width: 100%; min-height: 60px; padding: 10px; border: 1px solid var(--asg-border); border-radius: var(--asg-radius-sm); font: inherit; font-size: 13.5px; resize: vertical; background: var(--asg-bg); color: var(--asg-text); }
.asg-root .asg-script-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.asg-root .asg-script-actions { display: flex; gap: 8px; margin-top: 12px; }

/* Export */
.asg-root .asg-export-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 24px; }
.asg-root .asg-export-card { text-align: left; padding: 18px; border: 1px solid var(--asg-border); border-radius: var(--asg-radius); background: var(--asg-bg); color: var(--asg-text); transition: border-color .15s, box-shadow .15s; }
.asg-root .asg-export-card h3 { margin: 0 0 6px; font-size: 15px; color: inherit; }
.asg-root .asg-export-card p { margin: 0; color: var(--asg-text-muted); font-size: 13.5px; }
.asg-root .asg-payload-preview { padding: 16px; border: 1px solid var(--asg-border); border-radius: var(--asg-radius); background: var(--asg-bg-soft); }
.asg-root .asg-payload-preview h3 { margin: 0 0 4px; font-size: 14px; }
.asg-root .asg-payload-preview pre { max-height: 320px; overflow: auto; padding: 14px; border-radius: var(--asg-radius-sm); background: var(--asg-ink); color: #d7e0f2; font-family: var(--asg-mono); font-size: 12px; line-height: 1.5; margin: 10px 0 0; }

/* Progress */
.asg-root .asg-progress { margin: 20px 0; }
.asg-root .asg-progress-bar { height: 5px; background: var(--asg-bg-muted); border-radius: 999px; overflow: hidden; }
.asg-root .asg-progress-fill { height: 100%; width: 0; background: var(--asg-accent); transition: width .3s; border-radius: 999px; }
.asg-root .asg-progress-label { font-size: 13px; color: var(--asg-text-muted); margin: 8px 0 0; }

/* Drawer + toast */
.asg-root .asg-drawer { position: fixed; inset: 0; background: rgba(13, 20, 36, .5); z-index: 9999; display: flex; justify-content: flex-end; }
.asg-root .asg-drawer-inner { width: min(580px, 100%); background: var(--asg-bg); height: 100%; overflow: hidden; padding: 0; display: flex; flex-direction: column; box-shadow: -12px 0 40px rgba(13, 20, 36, .25); }
.asg-root .asg-drawer-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 20px 24px 12px; }
.asg-root .asg-drawer-head .asg-hint { margin-top: 2px; }
.asg-root .asg-drawer-head h3 { margin: 0; font-size: 17px; }
.asg-root .asg-btn-close { background: none; border: none; font-size: 24px; line-height: 1; color: var(--asg-text-muted); padding: 2px 8px; border-radius: 8px; }
.asg-root .asg-drawer-actions { margin: 0; padding: 14px 24px; border-top: 1px solid var(--asg-border); background: var(--asg-bg); display: flex; align-items: center; gap: 14px; flex-wrap: wrap; box-shadow: 0 -6px 16px rgba(13, 20, 36, .05); }
.asg-root .asg-drawer-actions .asg-btn-primary { padding: 12px 26px; font-size: 15px; }
.asg-root .asg-drawer-body { flex: 1; overflow-y: auto; padding: 18px 24px 28px; display: grid; gap: 14px; align-content: start; }
.asg-root .asg-set-tabs { display: flex; gap: 4px; padding: 0 24px; border-bottom: 1px solid var(--asg-border); }
.asg-root .asg-set-tab { background: transparent; border: 0; border-bottom: 3px solid transparent; border-radius: 0; padding: 10px 14px; font-size: 14px; font-weight: 600; color: var(--asg-text-muted); margin-bottom: -1px; }
.asg-root .asg-set-tab.is-active { color: var(--asg-accent); border-bottom-color: var(--asg-accent); background: transparent; }
.asg-root .asg-set-sec { display: grid; gap: 14px; align-content: start; }
.asg-root .asg-set-h { margin: 8px 0 -6px; font-size: 15px; font-weight: 700; letter-spacing: -.01em; padding-top: 14px; border-top: 1px solid var(--asg-border); }
.asg-root .asg-set-sec > .asg-set-h:first-child { border-top: 0; padding-top: 0; margin-top: 0; }
.asg-root .asg-lnk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
.asg-root .asg-set-sources { display: flex; flex-wrap: wrap; gap: 8px; }
.asg-root .asg-src { padding: 5px 12px; border-radius: 999px; border: 1px dashed var(--asg-border); font-size: 12.5px; color: var(--asg-text-dim); }
.asg-root .asg-src.is-on { border-style: solid; border-color: var(--asg-accent); background: var(--asg-accent-soft); color: var(--asg-accent); font-weight: 600; }
.asg-root .asg-pill-k { font-size: 11.5px; font-weight: 600; color: var(--asg-ink-dim); padding-right: 8px; margin-right: 2px; border-right: 1px solid var(--asg-ink-line); }
.asg-root .asg-pill-name { font-weight: 650; }
/* Toasts are appended to <body>, outside .asg-root, so they carry their own colours. */
.asg-toast { position: fixed; bottom: 88px; left: 50%; transform: translateX(-50%) translateY(20px); padding: 12px 20px; border-radius: 9px; background: #0d1424; color: #fff; font: 500 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; opacity: 0; transition: opacity .3s, transform .3s; z-index: 2147483000; max-width: min(560px, 90vw); box-shadow: 0 10px 30px rgba(13, 20, 36, .3); pointer-events: none; }
.asg-toast.is-on { opacity: 1; transform: translateX(-50%) translateY(0); }
.asg-toast.is-error { background: #d12c2c; }
.asg-toast.is-success, .asg-toast.is-ok { background: #14804a; }
.asg-toast.asg-toast-undo { pointer-events: auto; }

/* ---------- Theme-proof hover/focus layer ----------
   WordPress themes style button:hover and button:focus. That rule outranks our single-class
   rules, which is how text ended up unreadable. Every button gets an explicit state below,
   driven by three variables that variants override. */
.asg-root button { --hbg: var(--asg-bg-muted); --hfg: var(--asg-text); --hbd: var(--asg-text-dim); }
.asg-root .asg-btn-primary, .asg-root .asg-vid-make, .asg-root .asg-seg-btn.is-on { --hbg: var(--asg-accent-hover); --hfg: #fff; --hbd: var(--asg-accent-hover); }
.asg-root .asg-seg-btn.is-on { --hbg: #000; --hbd: #000; }
.asg-root .asg-plan-tg button.is-on { --hbg: #fff; --hfg: var(--asg-text); --hbd: transparent; }
.asg-root .asg-plan-tg button { --hbg: rgba(13, 20, 36, .06); --hfg: var(--asg-text); --hbd: transparent; }
.asg-root .asg-opt.is-on, .asg-root .asg-mode-card.is-selected { --hbg: var(--asg-accent-soft); --hfg: var(--asg-accent); --hbd: var(--asg-accent); }
.asg-root .asg-mode-card, .asg-root .asg-export-card, .asg-root .asg-tile { --hbg: var(--asg-bg); --hfg: var(--asg-text); --hbd: var(--asg-accent); }
.asg-root .asg-btn-pill { --hbg: rgba(255, 255, 255, .16); --hfg: #fff; --hbd: rgba(255, 255, 255, .4); }
.asg-root .asg-step, .asg-root .asg-btn-close, .asg-root .asg-link, .asg-root .asg-set-tab { --hbg: transparent; --hfg: inherit; --hbd: transparent; }
.asg-root .asg-btn-close { --hbg: var(--asg-bg-muted); --hfg: var(--asg-text); }
.asg-root .asg-link { --hfg: var(--asg-accent-hover); }
.asg-root button:hover:not(:disabled):not(.asg-step),
.asg-root button:focus:not(:disabled):not(.asg-step),
.asg-root button:active:not(:disabled):not(.asg-step) {
  background-color: var(--hbg); color: var(--hfg); border-color: var(--hbd);
  text-shadow: none; text-decoration-color: currentColor;
}
.asg-root .asg-btn-primary:hover:not(:disabled), .asg-root .asg-btn-primary:focus:not(:disabled) { box-shadow: 0 4px 14px rgba(49, 87, 240, .35); }
.asg-root button:disabled { opacity: .55; cursor: not-allowed; }

/* Links styled as buttons keep their own colours on hover (themes recolour a:hover) */
.asg-root a.asg-btn { display: inline-block; text-decoration: none; }
.asg-root a.asg-btn-primary, .asg-root a.asg-btn-primary:hover, .asg-root a.asg-btn-primary:focus { color: #fff; background: var(--asg-accent); border-color: var(--asg-accent); }
.asg-root a.asg-btn-primary:hover { background: var(--asg-accent-hover); }
.asg-root a.asg-btn-ghost, .asg-root a.asg-btn-ghost:hover, .asg-root a.asg-btn-ghost:focus { color: var(--asg-text); }
.asg-root a.asg-btn-ghost:hover { background: var(--asg-bg-muted); border-color: var(--asg-text-dim); }

/* ---------- Review window (sits outside .asg-root, so it carries its own tokens and buttons) ---------- */
.asg-modal {
  --asg-ink: #0d1424;
  --asg-ink-2: #172036;
  --asg-ink-line: rgba(255, 255, 255, .12);
  --asg-ink-text: #e8ecf5;
  --asg-ink-dim: #93a0ba;
  --asg-bg: #ffffff;
  --asg-bg-soft: #f6f7fa;
  --asg-bg-muted: #eceff5;
  --asg-border: #dde1ea;
  --asg-text: #141a2a;
  --asg-text-muted: #4f5a6e;
  --asg-text-dim: #7a869b;
  --asg-accent: #3157f0;
  --asg-accent-hover: #2142cc;
  --asg-accent-soft: #edf1ff;
  --asg-signal: #f5a524;
  --asg-signal-soft: #fff4de;
  --asg-critical: #d12c2c;
  --asg-warning: #b36b00;
  --asg-passed: #14804a;
  --asg-radius: 14px;
  --asg-radius-sm: 9px;
  --asg-shadow: 0 1px 2px rgba(13, 20, 36, .05), 0 6px 18px rgba(13, 20, 36, .05);
  --asg-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --asg-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

  font-family: var(--asg-sans);
  line-height: 1.5;
}
/* Buttons */
.asg-modal .asg-actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
.asg-modal .asg-btn { padding: 10px 18px; border-radius: var(--asg-radius-sm); border: 1px solid var(--asg-border); background: var(--asg-bg); font-size: 14px; font-weight: 600; color: var(--asg-text); transition: background-color .15s, border-color .15s, box-shadow .15s; line-height: 1.25; }
.asg-modal .asg-btn-primary { background: var(--asg-accent); color: #fff; border-color: var(--asg-accent); box-shadow: 0 1px 2px rgba(49, 87, 240, .3); }
.asg-modal .asg-btn-primary:disabled { opacity: .5; cursor: not-allowed; }

/* ---------- Theme-proof hover/focus layer ----------
   WordPress themes style button:hover and button:focus. That rule outranks our single-class
   rules, which is how text ended up unreadable. Every button gets an explicit state below,
   driven by three variables that variants override. */
.asg-modal button { --hbg: var(--asg-bg-muted); --hfg: var(--asg-text); --hbd: var(--asg-text-dim); }
.asg-modal .asg-btn-primary, .asg-modal .asg-vid-make, .asg-modal .asg-seg-btn.is-on { --hbg: var(--asg-accent-hover); --hfg: #fff; --hbd: var(--asg-accent-hover); }
.asg-modal .asg-seg-btn.is-on { --hbg: #000; --hbd: #000; }
.asg-modal .asg-plan-tg button.is-on { --hbg: #fff; --hfg: var(--asg-text); --hbd: transparent; }
.asg-modal .asg-plan-tg button { --hbg: rgba(13, 20, 36, .06); --hfg: var(--asg-text); --hbd: transparent; }
.asg-modal .asg-opt.is-on, .asg-modal .asg-mode-card.is-selected { --hbg: var(--asg-accent-soft); --hfg: var(--asg-accent); --hbd: var(--asg-accent); }
.asg-modal .asg-mode-card, .asg-modal .asg-export-card, .asg-modal .asg-tile { --hbg: var(--asg-bg); --hfg: var(--asg-text); --hbd: var(--asg-accent); }
.asg-modal .asg-btn-pill { --hbg: rgba(255, 255, 255, .16); --hfg: #fff; --hbd: rgba(255, 255, 255, .4); }
.asg-modal .asg-step, .asg-modal .asg-btn-close, .asg-modal .asg-link, .asg-modal .asg-set-tab { --hbg: transparent; --hfg: inherit; --hbd: transparent; }
.asg-modal .asg-btn-close { --hbg: var(--asg-bg-muted); --hfg: var(--asg-text); }
.asg-modal .asg-link { --hfg: var(--asg-accent-hover); }
.asg-modal button:hover:not(:disabled),
.asg-modal button:focus:not(:disabled),
.asg-modal button:active:not(:disabled) {
  background-color: var(--hbg); color: var(--hfg); border-color: var(--hbd);
  text-shadow: none; text-decoration-color: currentColor;
}
.asg-modal .asg-btn-primary:hover:not(:disabled), .asg-modal .asg-btn-primary:focus:not(:disabled) { box-shadow: 0 4px 14px rgba(49, 87, 240, .35); }
.asg-modal button:disabled { opacity: .55; cursor: not-allowed; }

/* Links styled as buttons keep their own colours on hover (themes recolour a:hover) */
.asg-modal a.asg-btn { display: inline-block; text-decoration: none; }
.asg-modal a.asg-btn-primary, .asg-modal a.asg-btn-primary:hover, .asg-modal a.asg-btn-primary:focus { color: #fff; background: var(--asg-accent); border-color: var(--asg-accent); }
.asg-modal a.asg-btn-primary:hover { background: var(--asg-accent-hover); }
.asg-modal a.asg-btn-ghost, .asg-modal a.asg-btn-ghost:hover, .asg-modal a.asg-btn-ghost:focus { color: var(--asg-text); }
.asg-modal a.asg-btn-ghost:hover { background: var(--asg-bg-muted); border-color: var(--asg-text-dim); }


.asg-modal button { font-family: var(--asg-sans); cursor: pointer; }
.asg-modal :focus-visible { outline: 2px solid var(--asg-accent); outline-offset: 2px; }

/* ---------- Responsive ---------- */
@media (max-width: 760px) {
  .asg-root .asg-lnk-grid { grid-template-columns: 1fr; }
  .asg-root .asg-set-tab { padding: 10px 9px; font-size: 13px; }
  .asg-root .asg-topbar { position: static; border-radius: 12px 12px 0 0; }
  .asg-root .asg-rail { overflow-x: auto; padding-bottom: 12px; }
  .asg-root .asg-steps { grid-template-columns: repeat(8, minmax(88px, 1fr)); min-width: 760px; }
  .asg-root .asg-grid-2 { grid-template-columns: 1fr; }
  .asg-root .asg-profile-view dl { grid-template-columns: 1fr; gap: 4px 0; }
  .asg-root .asg-profile-view dt { margin-top: 8px; }
  .asg-root .asg-panel { padding: 22px 14px 32px; }
  .asg-root .asg-keys-group .asg-keys-title { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .asg-root *, .asg-root *::before, .asg-root *::after { transition: none !important; animation: none !important; }
}
</style>
<div class="asg-root">

  <div class="asg-topbar">
    <div class="asg-topbar-inner">
      <div class="asg-brand">
        <span class="asg-brand-mark">Autonom</span>
        <span class="asg-brand-sep">·</span>
        <span class="asg-brand-sub">Newsreel</span>
      </div>

<div class="asg-topbar-actions">
  <div class="asg-keys-group" role="group" aria-label="API keys">
    <span class="asg-keys-title">API keys</span>
    <span class="asg-api-status" id="asg-api-status" title="API keys status">
      <span class="asg-api-dot"></span>
      <span class="asg-api-label">Keys</span>
    </span>
    <button class="asg-btn-pill asg-open-settings" type="button" title="Switch profile, add or change API keys and provider settings">
      <span class="asg-pill-k">Profile</span> <span class="asg-pill-name">Set up profile &amp; keys</span> <span aria-hidden="true">▾</span>
    </button>
  </div>
  <button class="asg-btn-pill asg-privacy-toggle" type="button">
    <span class="asg-privacy-dot"></span> Data &amp; privacy
  </button>
</div>

    </div>

    <nav class="asg-rail" aria-label="Steps">
      <div class="asg-steps">
        <button class="asg-step is-active" data-step="channel" type="button"><em>1</em><span>Channel</span></button>
        <button class="asg-step" data-step="feed" type="button" disabled><em>2</em><span>Feed</span></button>
        <button class="asg-step" data-step="consolidate" type="button" disabled><em>3</em><span>Consolidate</span></button>
        <button class="asg-step" data-step="generate" type="button" disabled><em>4</em><span>Generate</span></button>
        <button class="asg-step" data-step="scripts" type="button" disabled><em>5</em><span>Review</span></button>
        <button class="asg-step" data-step="video" type="button" disabled><em>6</em><span>Video</span></button>
        <button class="asg-step" data-step="publish" type="button" disabled><em>7</em><span>Publish</span></button>
        <button class="asg-step" data-step="export" type="button" disabled><em>8</em><span>Export</span></button>
      </div>
    </nav>

    <div class="asg-privacy-drawer" hidden>
      <div class="asg-privacy-drawer-inner">
        <h4>Data &amp; privacy</h4>
        <ul class="asg-privacy-list">
          <li><span class="asg-check">✓</span> Your profile, scripts and API keys are stored in this browser only (keys are saved unencrypted in local storage)</li>
          <li><span class="asg-check">✓</span> No Autonom database and no accounts. The one thing this site can store is a video you hand to the site owner's own automation (Publish step), and it is deleted after 3 days</li>
          <li><span class="asg-check">✓</span> News searches and article pages (the story's own article and, for cross-checking, one or two other outlets' articles on the same event) are fetched by this website's own server and only cached briefly (10 min to 6 hours)</li>
          <li><span class="asg-check">✓</span> AI, YouTube and footage calls use your own API keys. They are sent from your browser straight to the provider. If a provider refuses calls from a browser (Groq, OpenRouter and NVIDIA sometimes do), the request is forwarded by this website's server for that call only. The server passes your key along and does not store or log it. Stock-footage downloads are relayed the same way.</li>
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
      <h2>Set up a profile</h2>
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
            <option value="30">30 seconds</option>
            <option value="45">45 seconds</option>
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

    <div class="asg-feed-tools" id="asg-feed-tools" hidden></div>

    <div class="asg-story-list" id="asg-story-list"></div>

    <div class="asg-actions" id="asg-feed-next" hidden>
      <button class="asg-btn asg-btn-primary" id="asg-continue-scripts" type="button">Continue →</button>
    </div>
  </section>

  <!-- ============ STEP 3 · CONSOLIDATE ============ -->
  <section class="asg-panel" data-panel="consolidate" hidden>
    <header class="asg-panel-head">
      <h2>Consolidate</h2>
      <p class="asg-lead">Stories that cover the same event are grouped here. Consolidating merges what the outlets report into one fact list, each fact checked against its source quote and tagged by outlet, before any script is written.</p>
    </header>

    <div class="asg-cons-prog" id="asg-cons-prog" hidden>
      <span class="asg-cons-prog-label"></span>
      <div class="asg-cons-prog-bar"><i class="asg-cons-prog-fill"></i></div>
    </div>
    <div id="asg-cons-list"></div>

    <div class="asg-actions">
      <button class="asg-btn asg-btn-primary" id="asg-cons-run" type="button">Consolidate all groups</button>
      <button class="asg-btn asg-btn-ghost" id="asg-cons-stop" type="button" hidden>Stop</button>
      <button class="asg-btn asg-btn-primary" id="asg-cons-next" type="button">Continue to Generate →</button>
      <button class="asg-btn asg-btn-ghost" id="asg-cons-back" type="button">← Back to Feed</button>
    </div>
  </section>

  <!-- ============ STEP 4 · GENERATE ============ -->
  <section class="asg-panel" data-panel="generate" hidden>
    <header class="asg-panel-head">
      <h2>Generate scripts</h2>
      <p class="asg-lead">Each script is written only from readable source articles. Facts are extracted with exact quotes and checked against the article. Autonom then looks for a second outlet covering the same event and marks each fact as confirmed by both, single-source, or differing. Numbers, names and wording are checked, then every sentence is audited. Stories without a readable source are skipped, not guessed.</p>
    </header>

    <div id="asg-script-options"></div>

    <div id="asg-generate-summary"></div>

    <div class="asg-actions">
      <button class="asg-btn asg-btn-primary" id="asg-generate-btn" type="button">Generate scripts</button>
      <button class="asg-btn asg-btn-ghost" id="asg-stop-btn" type="button" hidden>Stop</button>
      <button class="asg-btn asg-btn-ghost" id="asg-back-cons" type="button">← Back</button>
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
      <button class="asg-btn asg-btn-ghost" id="asg-continue-export" type="button">Continue to Publish →</button>
    </div>
  </section>

  <!-- ============ STEP 6 · EXPORT ============ -->
  <section class="asg-panel" data-panel="publish" hidden>
    <header class="asg-panel-head">
      <h2>Publish</h2>
      <p class="asg-lead">A caption for each platform, ready to use. Post straight to Telegram or Mastodon, share the video from your phone, or open each platform's uploader with the caption already copied. Site owners can also hand everything to their own automation.</p>
    </header>
    <div id="asg-pub-setup"></div>
    <div id="asg-pub-list"></div>
    <div class="asg-actions">
      <button class="asg-btn asg-btn-ghost" id="asg-pub-skip" type="button">Skip to Export</button>
    </div>
  </section>

  <section class="asg-panel" data-panel="export" hidden>
    <header class="asg-panel-head">
      <h2>Export</h2>
      <p class="asg-lead">Take your scripts, voice-overs, captions and videos anywhere. Autonom only sends something out when you press Send in the Publish step.</p>
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
    <div class="asg-drawer-inner" role="dialog" aria-label="Profile, API keys and settings">
      <div class="asg-drawer-head">
        <div>
          <h3>Profile, keys &amp; settings</h3>
          <p class="asg-hint">Everything here belongs to the active profile and stays in this browser.</p>
        </div>
        <button class="asg-btn-close" id="asg-settings-close" type="button" aria-label="Close settings">×</button>
      </div>
      <div class="asg-set-tabs" role="tablist">
        <button type="button" class="asg-set-tab is-active" data-tab="profile" role="tab">Profile &amp; sources</button>
        <button type="button" class="asg-set-tab" data-tab="ai" role="tab">AI writing</button>
        <button type="button" class="asg-set-tab" data-tab="video" role="tab">Footage &amp; video</button>
      </div>
      <div class="asg-drawer-body">

        <section class="asg-set-sec" data-tab="profile">
          <h4 class="asg-set-h">Profile</h4>
          <p class="asg-hint">A profile is one channel or brand, with its own topics, voice and keys. Switch or add one here.</p>
      <div id="asg-set-profiles"></div>

          <h4 class="asg-set-h">Brand and channel links</h4>
          <p class="asg-hint">Add the pages this profile publishes on. A website can be read as a page, which helps the voice DNA (the part that makes your scripts differ from anyone else's). Facebook, Instagram, X and LinkedIn block automated readers, so those links are saved with the profile but may not be readable.</p>
          <p class="asg-hint" id="asg-lnk-hint">Set up a profile in step 1 first. Then these fields unlock.</p>
          <div class="asg-lnk-grid">
            <label class="asg-field"><span class="asg-label">Website</span><input type="url" id="asg-lnk-website" placeholder="https://"></label>
            <label class="asg-field"><span class="asg-label">YouTube</span><input type="url" id="asg-lnk-youtube" placeholder="https://youtube.com/@"></label>
            <label class="asg-field"><span class="asg-label">Facebook</span><input type="url" id="asg-lnk-facebook" placeholder="https://facebook.com/"></label>
            <label class="asg-field"><span class="asg-label">Instagram</span><input type="url" id="asg-lnk-instagram" placeholder="https://instagram.com/"></label>
            <label class="asg-field"><span class="asg-label">TikTok</span><input type="url" id="asg-lnk-tiktok" placeholder="https://tiktok.com/@"></label>
            <label class="asg-field"><span class="asg-label">X</span><input type="url" id="asg-lnk-x" placeholder="https://x.com/"></label>
            <label class="asg-field"><span class="asg-label">LinkedIn</span><input type="url" id="asg-lnk-linkedin" placeholder="https://linkedin.com/company/"></label>
            <label class="asg-field"><span class="asg-label">Telegram</span><input type="url" id="asg-lnk-telegram" placeholder="https://t.me/"></label>
          </div>
          <div><button type="button" class="asg-btn asg-btn-ghost" id="asg-lnk-learn">Read my pages to improve my voice</button></div>
          <p class="asg-hint" id="asg-lnk-status" role="status"></p>

          <h4 class="asg-set-h">YouTube through its API</h4>
          <p class="asg-hint">The most complete source. With a key, step 1 reads the channel's recent videos, titles and what performed best.</p>
          <label class="asg-field">
        <span class="asg-label">YouTube Data API key</span>
        <input type="password" id="asg-set-yt" placeholder="AIza...">
        <span class="asg-hint">From console.cloud.google.com. Restrict to autonom.app and blomstrainsights.com referrers.</span>
      </label>

        </section>

        <section class="asg-set-sec" data-tab="ai" hidden>
          <h4 class="asg-set-h">Provider and keys</h4>
      <label class="asg-field">
        <span class="asg-label">Model provider</span>
        <select id="asg-set-provider">
          <option value="gemini">Google Gemini</option>
          <option value="groq">Groq</option>
          <option value="openrouter">OpenRouter</option>
          <option value="nvidia">NVIDIA NIM</option>
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
        <span class="asg-hint asg-test-res" id="asg-testres-gemini" role="status" aria-live="polite"></span>
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

      <label class="asg-field" data-provider="groq" hidden>
        <span class="asg-label">Groq API key</span>
        <input type="password" id="asg-set-groq" placeholder="gsk_...">
        <span class="asg-hint">From console.groq.com (API Keys). Any plan works.</span>
        <button class="asg-btn asg-btn-ghost" id="asg-test-groq" type="button" style="margin-top:6px;">Test this key</button>
        <span class="asg-hint asg-test-res" id="asg-testres-groq" role="status" aria-live="polite"></span>
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
        <span class="asg-hint asg-test-res" id="asg-testres-openrouter" role="status" aria-live="polite"></span>
      </label>
      <label class="asg-field" data-provider="openrouter" hidden>
        <span class="asg-label">OpenRouter model (optional)</span>
        <input type="text" id="asg-set-openrouter-model" placeholder="leave empty to auto-pick (zero-cost models only)">
      </label>
      <label class="asg-field" data-provider="openrouter" hidden>
        <span class="asg-label">OpenRouter model for comparison, writing and audit (optional)</span>
        <input type="text" id="asg-set-openrouter-write-model" placeholder="leave empty to auto-pick">
      </label>

      <label class="asg-field" data-provider="nvidia" hidden>
        <span class="asg-label">NVIDIA NIM API key</span>
        <input type="password" id="asg-set-nvidia" placeholder="nvapi-..." autocomplete="off">
        <span class="asg-hint">From build.nvidia.com (API keys). It may refuse calls made straight from a browser; if so Autonom retries through this site automatically.</span>
        <button class="asg-btn asg-btn-ghost" id="asg-test-nvidia" type="button" style="margin-top:6px;">Test this key</button>
        <span class="asg-hint asg-test-res" id="asg-testres-nvidia" role="status" aria-live="polite"></span>
      </label>
      <label class="asg-field" data-provider="nvidia" hidden>
        <span class="asg-label">NVIDIA NIM model (optional)</span>
        <input type="text" id="asg-set-nvidia-model" placeholder="leave empty to auto-pick">
      </label>
      <label class="asg-field" data-provider="nvidia" hidden>
        <span class="asg-label">NVIDIA NIM model for comparison, writing and audit (optional)</span>
        <input type="text" id="asg-set-nvidia-write-model" placeholder="leave empty to auto-pick">
      </label>
      <label class="asg-field" data-provider="openai" hidden>
        <span class="asg-label">OpenAI API key</span>
        <input type="password" id="asg-set-openai" placeholder="sk-...">
      </label>
      <label class="asg-field" data-provider="deepseek" hidden>
        <span class="asg-label">DeepSeek API key</span>
        <input type="password" id="asg-set-deepseek" placeholder="sk-...">
      </label>


          <h4 class="asg-set-h">How scripts are written</h4>
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

      <label class="asg-field">
        <span class="asg-label">Model strategy</span>
        <select id="asg-set-strategy">
          <option value="value">Best value (default): a capable mid-size model first</option>
          <option value="cheap">Cheapest first: small models and free-tier providers first</option>
          <option value="quality">Best quality first: the largest models and strongest providers first</option>
        </select>
        <span class="asg-hint">Applies to every AI service you have a key for. Models are found automatically from each service's own list and ranked by name (size, mini/lite versus pro/large), because most services do not publish prices in that list. With "Use my other AI keys as a backup" off, only the service you picked is used. A model typed in Settings still wins.</span>
      </label>

      <label class="asg-field" style="display:flex;gap:8px;align-items:flex-start;">
        <input type="checkbox" id="asg-set-writebest" style="margin-top:4px;" checked>
        <span><span class="asg-label">Use the strongest model for the final script</span>
        <span class="asg-hint" style="display:block;">The final script and its analysis are the part viewers hear, so they are written by the most capable model available while the many small checking calls stay on the strategy above. If that model is out of quota or unavailable, the next one is used.</span></span>
      </label>

      <label class="asg-field" style="display:flex;gap:8px;align-items:flex-start;">
        <input type="checkbox" id="asg-set-require2" style="margin-top:4px;">
        <span><span class="asg-label">Require a second outlet</span>
        <span class="asg-hint" style="display:block;">When on, a story is skipped unless another open outlet reports the same event and at least one key fact matches. Off by default: stories only one outlet covers are still written, clearly marked as single-source.</span></span>
      </label>

        </section>

        <section class="asg-set-sec" data-tab="video" hidden>
          <h4 class="asg-set-h">Footage library</h4>
      <label class="asg-field">
        <span class="asg-label">Footage library (for videos)</span>
        <select id="asg-set-stock">
          <option value="pixabay">Pixabay</option>
          <option value="pexels">Pexels</option>
        </select>
        <span class="asg-hint">Where background clips come from. Enter the key for the library you pick. Without a key, videos use a plain background with captions.</span>
      </label>
      <label class="asg-field" data-stock="pixabay">
        <span class="asg-label">Pixabay API key</span>
        <input type="password" id="asg-set-pixabay" placeholder="from pixabay.com/api/docs" autocomplete="off">
      </label>
      <label class="asg-field" data-stock="pexels" hidden>
        <span class="asg-label">Pexels API key</span>
        <input type="password" id="asg-set-pexels" placeholder="from pexels.com/api" autocomplete="off">
      </label>


          <h4 class="asg-set-h">Video description</h4>
      <label class="asg-field" style="display:flex;gap:8px;align-items:flex-start;">
        <input type="checkbox" id="asg-set-madewith" style="margin-top:4px;" checked>
        <span><span class="asg-label">Add "Made with Autonom Newsreel" to descriptions</span>
        <span class="asg-hint" style="display:block;">Adds one line with a link to this tool at the end of each video description. Turn it off if you prefer a clean description.</span></span>
      </label>

        </section>

      </div>
      <div class="asg-drawer-actions">
        <button class="asg-btn asg-btn-primary" id="asg-settings-save" type="button">Save settings</button>
        <span class="asg-hint">Switching tabs keeps what you typed. Save stores all tabs.</span>
      </div>
    </div>
  </aside>

</div>
    <?php
    return ob_get_clean();
}
add_shortcode( 'autonom_newsreel', 'autonom_asg_shortcode' );
// Old name, kept so existing pages keep working. Change the page to [autonom_newsreel], then this line can go.
add_shortcode( 'autonom_ai_shorts_generator', 'autonom_asg_shortcode' );
