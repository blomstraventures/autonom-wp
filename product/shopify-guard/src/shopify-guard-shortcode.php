/**
 * Autonom Shopify Guard — Shortcode & Asset Loader
 * Version: 1.6.0
 * Usage: [autonom_shopify_guard]
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'AUTONOM_SHOPIFY_GUARD_VERSION', '1.6.0' );
define( 'AUTONOM_SHOPIFY_GUARD_URL', content_url( '/uploads/autonom/shopify-guard' ) );

function autonom_shopify_guard_register_assets() {
    wp_register_style( 'autonom-shopify-guard', AUTONOM_SHOPIFY_GUARD_URL . '/shopify-guard.css', array(), AUTONOM_SHOPIFY_GUARD_VERSION );
    wp_register_script( 'papaparse', 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js', array(), '5.4.1', true );
    wp_register_script( 'jszip', 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', array(), '3.10.1', true );
    wp_register_script( 'autonom-shopify-guard', AUTONOM_SHOPIFY_GUARD_URL . '/shopify-guard.js', array( 'papaparse', 'jszip' ), AUTONOM_SHOPIFY_GUARD_VERSION, true );
}
add_action( 'wp_enqueue_scripts', 'autonom_shopify_guard_register_assets' );

function autonom_shopify_guard_shortcode( $atts ) {
    if ( is_feed() || is_admin() ) { return ''; }

    wp_enqueue_style( 'autonom-shopify-guard' );
    wp_enqueue_script( 'papaparse' );
    wp_enqueue_script( 'jszip' );
    wp_enqueue_script( 'autonom-shopify-guard' );

    ob_start();
    ?>
    <div id="autonom-shopify-guard" class="asg-root" data-state="idle">

        <div class="asg-topbar">
            <div class="asg-topbar-inner">
                <div class="asg-brand">
                    <span class="asg-brand-mark">Autonom</span>
                    <span class="asg-brand-sep">·</span>
                    <span class="asg-brand-sub">Shopify Guard</span>
                </div>

                <nav class="asg-steps" id="asg-steps" aria-label="Progress">
                    <span class="asg-step" data-step="1"><em>1</em><span>Upload</span></span>
                    <span class="asg-step" data-step="2"><em>2</em><span>Mode</span></span>
                    <span class="asg-step" data-step="3"><em>3</em><span>Scan</span></span>
                    <span class="asg-step" data-step="4"><em>4</em><span>Report</span></span>
                    <span class="asg-step" data-step="5"><em>5</em><span>Repair</span></span>
                    <span class="asg-step" data-step="6"><em>6</em><span>Export</span></span>
                </nav>

                <div class="asg-topbar-actions">
                    <button type="button" class="asg-btn-pill asg-btn-newscan" id="asg-new-scan-btn" hidden>
                        ↻ New scan
                    </button>
                    <button type="button" class="asg-btn-pill asg-btn-privacy" id="asg-privacy-toggle" aria-expanded="false">
                        <span class="asg-privacy-dot" aria-hidden="true"></span>
                        <span>Local processing</span>
                    </button>
                </div>
            </div>

            <div class="asg-privacy-drawer" id="asg-privacy-panel" hidden>
                <div class="asg-privacy-drawer-inner">
                    <h4>Local processing</h4>
                    <ul class="asg-privacy-list">
                        <li><span class="asg-check">✓</span> Your CSV is read in your browser</li>
                        <li><span class="asg-check">✓</span> No file upload detected</li>
                        <li><span class="asg-check">✓</span> No CSV contents sent to Autonom</li>
                    </ul>
                    <div class="asg-privacy-stats">
                        <div><span>Files uploaded</span><strong id="asg-stat-files">0</strong></div>
                        <div><span>Contents transmitted</span><strong id="asg-stat-bytes">0</strong></div>
                        <div><span>Network requests during processing</span><strong id="asg-stat-requests">0</strong></div>
                    </div>
                    <p class="asg-privacy-note">
                        Other website resources (page assets, Stripe for payments, analytics) may communicate with their own services. Your CSV contents are never transmitted.
                    </p>
                </div>
            </div>
        </div>

        <section class="asg-screen" data-screen="landing" data-step="1">
            <div class="asg-screen-inner">
                <div class="asg-hero">
                    <h1>Check your Shopify CSV<br><em>before it changes your store.</em></h1>
                    <p class="asg-hero-sub">
                        A CSV can pass Shopify's syntax check and still wipe your prices, variants, or descriptions.
                        Autonom shows you exactly what would change — before you import.
                    </p>
                </div>

                <div class="asg-dropzone" id="asg-dropzone" tabindex="0" role="button" aria-label="Choose or drop a CSV file">
                    <svg class="asg-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                        <path d="M12 16V4m0 0L7 9m5-5l5 5"/>
                        <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>
                    </svg>
                    <p class="asg-dropzone-title">Drop your CSV here</p>
                    <p class="asg-dropzone-or">or</p>
                    <label class="asg-btn asg-btn-primary" for="asg-file-input">Choose a file</label>
                    <input type="file" id="asg-file-input" accept=".csv,text/csv" hidden>
                    <p class="asg-dropzone-meta">CSV only · Processed locally · No account required</p>
                </div>

                <p class="asg-trust-line">
                    No account. No upload. No tracking of file contents.
                </p>
                <p class="asg-sample-line">
                    New here? <button type="button" class="asg-link-btn" id="asg-download-sample-btn">Download a sample CSV with intentional errors →</button>
                </p>

                <div class="asg-landing-grid">
                    <div class="asg-landing-card">
                        <h3>What this checks</h3>
                        <ul class="asg-checks-list">
                            <li><span class="asg-dot asg-dot-critical"></span> Destructive blanks — blank cells that may overwrite live data</li>
                            <li><span class="asg-dot asg-dot-critical"></span> Duplicate handles and SKUs</li>
                            <li><span class="asg-dot asg-dot-critical"></span> Broken variant relationships</li>
                            <li><span class="asg-dot asg-dot-warning"></span> Malformed HTML descriptions</li>
                            <li><span class="asg-dot asg-dot-warning"></span> Image URL and encoding issues</li>
                            <li><span class="asg-dot asg-dot-warning"></span> Variant column consistency</li>
                            <li><span class="asg-dot asg-dot-warning"></span> Inventory tracker and boolean formats</li>
                        </ul>
                    </div>
                    <div class="asg-landing-card">
                        <h3>What this does not do</h3>
                        <ul class="asg-checks-list asg-checks-neutral">
                            <li>Autonom does not know your store's current data</li>
                            <li>Autonom cannot guarantee Shopify will accept the import</li>
                            <li>Autonom does not connect to your Shopify store</li>
                        </ul>
                        <p class="asg-landing-footnote">We check what we can check. We tell you what we can't.</p>
                    </div>
                </div>
            </div>
        </section>

        <section class="asg-screen" data-screen="setup" data-step="2" hidden>
            <div class="asg-screen-inner">
                <h2 class="asg-screen-title">What are you doing with this CSV?</h2>
                <p class="asg-screen-sub">Autonom detected the mode from your file. You can change it if needed.</p>

                <div class="asg-detect-banner" id="asg-detect-banner" hidden>
                    <div class="asg-detect-icon" id="asg-detect-icon">🤖</div>
                    <div class="asg-detect-body">
                        <div class="asg-detect-line" id="asg-detect-line">—</div>
                        <div class="asg-detect-sub" id="asg-detect-sub">—</div>
                    </div>
                    <button type="button" class="asg-btn asg-btn-ghost asg-detect-override" id="asg-detect-override">
                        Change
                    </button>
                </div>

                <div class="asg-mode-grid" id="asg-mode-grid">
                    <button type="button" class="asg-mode-card" data-mode="new_products">
                        <span class="asg-mode-icon">🆕</span>
                        <span class="asg-mode-title">Adding new products</span>
                        <span class="asg-mode-desc">Importing products that aren't in your store yet.</span>
                    </button>
                    <button type="button" class="asg-mode-card asg-mode-emphasis" data-mode="existing_products">
                        <span class="asg-mode-icon">🔄</span>
                        <span class="asg-mode-title">Updating existing products</span>
                        <span class="asg-mode-desc">Changing products that already exist in your store.</span>
                        <span class="asg-mode-flag">Additional safety checks applied</span>
                    </button>
                </div>

                <div class="asg-file-preview">
                    <div class="asg-file-icon">📄</div>
                    <div class="asg-file-info">
                        <div class="asg-file-name" id="asg-file-name">—</div>
                        <div class="asg-file-meta" id="asg-file-meta">—</div>
                    </div>
                    <button type="button" class="asg-btn asg-btn-ghost asg-file-remove" id="asg-remove-file-btn" aria-label="Remove file">
                        ✕
                    </button>
                </div>

                <div class="asg-file-sample" id="asg-file-sample" hidden>
                    <div class="asg-file-sample-head">
                        <strong>Preview — first rows of your file</strong>
                        <button type="button" class="asg-link-btn" id="asg-toggle-sample">Hide preview</button>
                    </div>
                    <div class="asg-file-sample-table" id="asg-file-sample-table"></div>
                    <p class="asg-file-sample-note">This preview helps confirm you uploaded the right file. Autonom will not modify your original file.</p>
                </div>
            </div>
        </section>

        <section class="asg-screen" data-screen="scanning" data-step="3" hidden>
            <div class="asg-screen-inner asg-screen-narrow">
                <h2 class="asg-screen-title">Checking your CSV</h2>
                <p class="asg-screen-sub" id="asg-scan-filename">—</p>

                <ul class="asg-scan-steps" id="asg-scan-steps">
                    <li data-step="read">Reading CSV structure</li>
                    <li data-step="encoding">Verifying encoding</li>
                    <li data-step="headers">Checking Shopify headers</li>
                    <li data-step="handles">Checking product handles</li>
                    <li data-step="variants">Checking variant relationships</li>
                    <li data-step="skus">Checking SKUs</li>
                    <li data-step="prices">Checking prices and inventory</li>
                    <li data-step="blanks">Checking destructive blanks</li>
                    <li data-step="html">Checking HTML descriptions</li>
                    <li data-step="images">Checking image URLs</li>
                    <li data-step="report">Preparing report</li>
                </ul>
            </div>
        </section>

        <section class="asg-screen" data-screen="report" data-step="4" hidden>
            <div class="asg-screen-inner">
                <div class="asg-verdict" id="asg-verdict">
                    <div class="asg-verdict-badge" id="asg-verdict-badge">—</div>
                    <h2 class="asg-verdict-title" id="asg-verdict-title">—</h2>
                    <p class="asg-verdict-sub" id="asg-verdict-sub">—</p>
                </div>

                <div class="asg-summary" id="asg-summary">
                    <div class="asg-summary-cell asg-cell-critical">
                        <span class="asg-summary-num" id="asg-count-critical">0</span>
                        <span class="asg-summary-label">Critical</span>
                    </div>
                    <div class="asg-summary-cell asg-cell-warning">
                        <span class="asg-summary-num" id="asg-count-warning">0</span>
                        <span class="asg-summary-label">Warnings</span>
                    </div>
                    <div class="asg-summary-cell asg-cell-info">
                        <span class="asg-summary-num" id="asg-count-info">0</span>
                        <span class="asg-summary-label">Info</span>
                    </div>
                    <div class="asg-summary-cell asg-cell-passed">
                        <span class="asg-summary-num" id="asg-count-passed">0</span>
                        <span class="asg-summary-label">Passed</span>
                    </div>
                </div>

                <div class="asg-impact" id="asg-impact" hidden>
                    <h3>Potential store impact</h3>
                    <p class="asg-impact-note">This is what this CSV may change, based on the file structure alone.</p>
                    <ul class="asg-impact-list" id="asg-impact-list"></ul>
                    <p class="asg-impact-disclaimer">Autonom does not know your store's current data. These numbers are based on the file structure.</p>
                </div>

                <div class="asg-issues-section">
                    <div class="asg-issues-header">
                        <h3>Issues found</h3>
                        <div class="asg-issues-filter" id="asg-issues-filter">
                            <button type="button" class="asg-filter-btn is-active" data-filter="all">All</button>
                            <button type="button" class="asg-filter-btn" data-filter="critical">Critical</button>
                            <button type="button" class="asg-filter-btn" data-filter="warning">Warnings</button>
                            <button type="button" class="asg-filter-btn" data-filter="info">Info</button>
                        </div>
                    </div>
                    <div class="asg-issues-list" id="asg-issues-list"></div>
                    <div class="asg-no-issues" id="asg-no-issues" hidden>
                        <p><strong>No issues detected by the checks performed.</strong></p>
                        <p>Download the readiness report below for your records.</p>
                    </div>
                </div>

                <div class="asg-not-checked">
                    <h3>Checks not performed</h3>
                    <ul>
                        <li>Whether your store's current data matches these handles</li>
                        <li>Whether image URLs are live (we verify format, not availability)</li>
                        <li>Whether third-party apps will modify the import</li>
                        <li>Whether Shopify will accept this file</li>
                    </ul>
                </div>
            </div>
        </section>

        <section class="asg-screen" data-screen="repair" data-step="5" hidden>
            <div class="asg-screen-inner">
                <h2 class="asg-screen-title">What Autonom can fix</h2>
                <p class="asg-screen-sub" id="asg-repair-summary">—</p>

                <div class="asg-repair-group" id="asg-repair-safe" hidden>
                    <h3 class="asg-repair-group-title">
                        <span class="asg-badge asg-badge-safe">Safe</span>
                        Automatic fixes
                    </h3>
                    <p class="asg-repair-group-note">These will be applied automatically to your corrected file.</p>
                    <ul class="asg-repair-list" id="asg-repair-safe-list"></ul>
                </div>

                <div class="asg-repair-group" id="asg-repair-review" hidden>
                    <h3 class="asg-repair-group-title">
                        <span class="asg-badge asg-badge-review">Review</span>
                        Fixes that need your approval
                    </h3>
                    <p class="asg-repair-group-note">Autonom will not apply these without your confirmation.</p>
                    <ul class="asg-repair-list" id="asg-repair-review-list"></ul>
                </div>

                <div class="asg-repair-group" id="asg-repair-never" hidden>
                    <h3 class="asg-repair-group-title">
                        <span class="asg-badge asg-badge-never">Flagged</span>
                        What Autonom will not change
                    </h3>
                    <p class="asg-repair-group-note">Autonom does not invent data. If a value is missing and we can't determine it safely, we flag it — we don't guess.</p>
                    <ul class="asg-repair-list" id="asg-repair-never-list"></ul>
                </div>
            </div>
        </section>

        <section class="asg-screen" data-screen="export" data-step="6" hidden>
            <div class="asg-screen-inner">
                <div class="asg-export-hero">
                    <div class="asg-export-check" id="asg-export-check">✓</div>
                    <h2 class="asg-screen-title" id="asg-export-title">Your corrected CSV is ready</h2>
                    <p class="asg-screen-sub" id="asg-export-summary">—</p>
                </div>

                <div class="asg-diff-section" id="asg-diff-section" hidden>
                    <button type="button" class="asg-diff-header" id="asg-diff-toggle" aria-expanded="false">
                        <span class="asg-diff-header-label">
                            <span class="asg-diff-header-arrow">▸</span>
                            See exactly what changed
                        </span>
                        <span class="asg-diff-header-count" id="asg-diff-count">0 changes</span>
                    </button>
                    <div class="asg-diff-list" id="asg-diff-list" hidden></div>
                </div>

                <div class="asg-export-files">
                    <div class="asg-export-file">
                        <div class="asg-export-file-icon">📄</div>
                        <div class="asg-export-file-info">
                            <div class="asg-export-file-name" id="asg-export-csv-name">—</div>
                            <div class="asg-export-file-desc">Your corrected CSV, ready to import.</div>
                        </div>
                    </div>
                    <div class="asg-export-file">
                        <div class="asg-export-file-icon">📋</div>
                        <div class="asg-export-file-info">
                            <div class="asg-export-file-name">autonom_change_log.csv</div>
                            <div class="asg-export-file-desc">Every change Autonom made, in plain language.</div>
                        </div>
                    </div>
                    <div class="asg-export-file">
                        <div class="asg-export-file-icon">📊</div>
                        <div class="asg-export-file-info">
                            <div class="asg-export-file-name">autonom_readiness_report.html</div>
                            <div class="asg-export-file-desc">The full report, saved for your records.</div>
                        </div>
                    </div>
                </div>

                <div class="asg-export-actions-note">
                    <p><strong>All three files come in one ZIP download.</strong> Unzip to find the corrected CSV, the change log, and the report.</p>
                </div>

                <div class="asg-export-advice">
                    <h3>Before you import</h3>
                    <ol>
                        <li>Keep a current Shopify export as a backup.</li>
                        <li>Resolve any critical issues still remaining in the report.</li>
                        <li>Test-import 2–5 products first.</li>
                        <li>Only then run the full import.</li>
                    </ol>
                    <p class="asg-export-disclaimer">
                        Autonom does not know your store's current data. A passing report does not guarantee Shopify will accept the import.
                    </p>
                </div>
            </div>
        </section>

        <div class="asg-actionbar" id="asg-actionbar" hidden>
            <div class="asg-actionbar-inner">
                <button type="button" class="asg-btn asg-btn-ghost" id="asg-actionbar-back" hidden>← Back</button>
                <div class="asg-actionbar-spacer"></div>
                <button type="button" class="asg-btn asg-btn-ghost" id="asg-actionbar-secondary" hidden></button>
                <button type="button" class="asg-btn asg-btn-primary" id="asg-actionbar-primary">Continue</button>
            </div>
        </div>

        <footer class="asg-footer">
            <p>Autonom — Make it Ready.</p>
        </footer>
    </div>
    <?php
    return ob_get_clean();
}
add_shortcode( 'autonom_shopify_guard', 'autonom_shopify_guard_shortcode' );
