/**
 * Autonom Shopify Guard — Shortcode v2.0.1
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

function autonom_shopify_guard_shortcode( $atts ) {
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
                    <button type="button" class="asg-btn-pill asg-btn-newscan" id="asg-new-scan-btn" hidden>↻ New scan</button>
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
                        <li><span class="asg-check">✓</span> Your CSVs are read in your browser</li>
                        <li><span class="asg-check">✓</span> No file upload detected</li>
                        <li><span class="asg-check">✓</span> No CSV contents sent to Autonom</li>
                    </ul>
                    <div class="asg-privacy-stats">
                        <div><span>Files uploaded</span><strong id="asg-stat-files">0</strong></div>
                        <div><span>Contents transmitted</span><strong id="asg-stat-bytes">0</strong></div>
                        <div><span>Network requests during processing</span><strong id="asg-stat-requests">0</strong></div>
                    </div>
                    <p class="asg-privacy-note">Other website resources (page assets, Stripe for payments, analytics) may communicate with their own services. Your CSV contents are never transmitted.</p>
                </div>
            </div>
        </div>

        <!-- LANDING -->
        <section class="asg-screen" data-screen="landing" data-step="1">
            <div class="asg-screen-inner">
                <div class="asg-dropzone" id="asg-dropzone" tabindex="0" role="button" aria-label="Choose or drop CSV files">
                    <svg class="asg-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                        <path d="M12 16V4m0 0L7 9m5-5l5 5"/>
                        <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>
                    </svg>
                    <p class="asg-dropzone-title">Drop your CSVs here</p>
                    <p class="asg-dropzone-or">or</p>
                    <label class="asg-btn asg-btn-primary" for="asg-file-input">Choose files</label>
                    <input type="file" id="asg-file-input" accept=".csv,text/csv" multiple hidden>
                    <p class="asg-dropzone-meta">CSV only · Processed locally · Up to 20 files per batch</p>
                </div>
                <p class="asg-trust-line">No account. No upload. No tracking of file contents.</p>
                <p class="asg-sample-line">New here? <button type="button" class="asg-link-btn" id="asg-download-sample-btn">Download a sample CSV with intentional errors →</button></p>

                <div class="asg-mode-choice">
                    <div class="asg-mode-choice-divider"><span>or</span></div>
                    <button type="button" class="asg-mode-choice-card" id="asg-compare-start-btn">
                        <span class="asg-mode-choice-icon">⇄</span>
                        <span class="asg-mode-choice-body">
                            <span class="asg-mode-choice-title">Compare two files</span>
                            <span class="asg-mode-choice-desc">See exactly what an import will change in your store — before you import. Matches by Handle, shows field-by-field differences, and warns you about blank values that would erase existing data.</span>
                        </span>
                        <span class="asg-mode-choice-arrow">→</span>
                    </button>
                </div>
            </div>
        </section>

        <!-- BATCH QUEUE -->
        <section class="asg-screen" data-screen="batch-queue" data-step="2" hidden>
            <div class="asg-screen-inner">
                <h2 class="asg-screen-title">Ready to scan <span id="asg-batch-count-title">0</span> files</h2>
                <p class="asg-screen-sub">All files will use the same mode. Files are scanned one at a time, in your browser.</p>
                <div class="asg-batch-list" id="asg-batch-list"></div>
                <h3 class="asg-batch-mode-title">What are you doing with these files?</h3>
                <div class="asg-mode-grid" id="asg-batch-mode-grid">
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
            </div>
        </section>

        <!-- SETUP -->
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
                    <button type="button" class="asg-btn asg-btn-ghost asg-detect-override" id="asg-detect-override">Change</button>
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
                <div class="asg-delim-banner" id="asg-delim-banner" hidden>
                    <div class="asg-delim-icon">⚠️</div>
                    <div class="asg-delim-body">
                        <div class="asg-delim-line" id="asg-delim-line">—</div>
                        <div class="asg-delim-sub" id="asg-delim-sub">—</div>
                    </div>
                    <button type="button" class="asg-btn asg-btn-primary asg-delim-convert" id="asg-delim-convert">Convert to comma</button>
                </div>
                <div class="asg-file-preview">
                    <div class="asg-file-icon">📄</div>
                    <div class="asg-file-info">
                        <div class="asg-file-name" id="asg-file-name">—</div>
                        <div class="asg-file-meta" id="asg-file-meta">—</div>
                    </div>
                    <button type="button" class="asg-btn asg-btn-ghost asg-file-remove" id="asg-remove-file-btn" aria-label="Remove file">✕</button>
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

        <!-- MAPPING -->
        <section class="asg-screen" data-screen="mapping" data-step="2" hidden>
            <div class="asg-screen-inner">
                <h2 class="asg-screen-title">Map your columns to Shopify</h2>
                <p class="asg-screen-sub" id="asg-mapping-sub">Some of your columns use non-standard names. Autonom can rename them so the scan works correctly.</p>
                <div class="asg-mapping-banner" id="asg-mapping-banner" hidden>
                    <div class="asg-mapping-banner-icon">💡</div>
                    <div class="asg-mapping-banner-body">
                        <div class="asg-mapping-banner-line" id="asg-mapping-banner-line">—</div>
                        <div class="asg-mapping-banner-sub" id="asg-mapping-banner-sub">—</div>
                    </div>
                </div>
                <div class="asg-mapping-list" id="asg-mapping-list"></div>
                <div class="asg-mapping-warning" id="asg-mapping-warning" hidden></div>
            </div>
        </section>

        <!-- COMPARE SETUP -->
        <section class="asg-screen" data-screen="compare-setup" data-step="1" hidden>
            <div class="asg-screen-inner">
                <button type="button" class="asg-back-btn" id="asg-compare-back-btn">← Back to start</button>
                <h2 class="asg-screen-title">Compare your store export against an update file</h2>
                <p class="asg-screen-sub">We'll show you exactly what this import will change in your store — before you import.</p>

                <div class="asg-compare-grid">
                    <div class="asg-compare-slot">
                        <div class="asg-compare-slot-label">1. Your current Shopify export</div>
                        <div class="asg-compare-dropzone" id="asg-compare-store-dropzone" tabindex="0" role="button">
                            <div class="asg-compare-dropzone-icon">📦</div>
                            <div class="asg-compare-dropzone-title">Drop your store export here</div>
                            <div class="asg-compare-dropzone-meta">From Shopify Admin → Products → Export</div>
                        </div>
                        <input type="file" id="asg-compare-store-input" accept=".csv" hidden>
                        <div class="asg-compare-file-info" id="asg-compare-store-info" hidden></div>
                    </div>

                    <div class="asg-compare-slot">
                        <div class="asg-compare-slot-label">2. The file you want to import</div>
                        <div class="asg-compare-dropzone" id="asg-compare-update-dropzone" tabindex="0" role="button">
                            <div class="asg-compare-dropzone-icon">📄</div>
                            <div class="asg-compare-dropzone-title">Drop your update file here</div>
                            <div class="asg-compare-dropzone-meta">Your new prices, inventory, or product changes</div>
                        </div>
                        <input type="file" id="asg-compare-update-input" accept=".csv" hidden>
                        <div class="asg-compare-file-info" id="asg-compare-update-info" hidden></div>
                    </div>
                </div>

                <p class="asg-compare-note">All processing happens in your browser. Nothing is uploaded.</p>
            </div>
        </section>

        <!-- COMPARE REPORT -->
        <section class="asg-screen" data-screen="compare-report" data-step="1" hidden>
            <div class="asg-screen-inner">
                <button type="button" class="asg-back-btn" id="asg-compare-exit-btn">← New comparison</button>
                <div class="asg-verdict" id="asg-compare-verdict">
                    <div class="asg-verdict-badge" id="asg-compare-verdict-badge">—</div>
                    <h2 class="asg-verdict-title" id="asg-compare-verdict-title">—</h2>
                    <p class="asg-verdict-sub" id="asg-compare-verdict-sub">—</p>
                </div>

                <div class="asg-summary" id="asg-compare-summary">
                    <div class="asg-summary-cell">
                        <span class="asg-summary-num" id="asg-compare-matched">0</span>
                        <span class="asg-summary-label">Matched</span>
                    </div>
                    <div class="asg-summary-cell">
                        <span class="asg-summary-num" id="asg-compare-new">0</span>
                        <span class="asg-summary-label">New</span>
                    </div>
                    <div class="asg-summary-cell">
                        <span class="asg-summary-num" id="asg-compare-changed">0</span>
                        <span class="asg-summary-label">Changed</span>
                    </div>
                    <div class="asg-summary-cell">
                        <span class="asg-summary-num" id="asg-compare-unchanged">0</span>
                        <span class="asg-summary-label">Unchanged</span>
                    </div>
                </div>

                <div class="asg-impact" id="asg-compare-impact" hidden>
                    <h3>What this will change</h3>
                    <ul class="asg-impact-list" id="asg-compare-impact-list"></ul>
                    <p class="asg-impact-disclaimer">Based on the export you provided. If your store changed since that export, values may differ.</p>
                </div>

                <div class="asg-export-warning" id="asg-compare-blank-warning" hidden>
                    <h3>⚠️ Blank values will erase data</h3>
                    <p id="asg-compare-blank-intro">—</p>
                    <ul id="asg-compare-blank-list"></ul>
                    <p>Shopify treats an empty cell in an included column as "clear this field." If you don't want to erase these values, remove the column from your update file or fill in the blank cells.</p>
                </div>

                <div class="asg-issues-section">
                    <div class="asg-issues-header">
                        <h3>Field-by-field differences</h3>
                    </div>
                    <div class="asg-issues-list" id="asg-compare-diff-list"></div>
                    <div class="asg-no-issues" id="asg-compare-no-diffs" hidden>
                        <p><strong>No differences detected.</strong></p>
                        <p>The update file will not change any existing product fields.</p>
                    </div>
                </div>
            </div>
        </section>

        <!-- SCANNING -->
        <section class="asg-screen" data-screen="scanning" data-step="3" hidden>
            <div class="asg-screen-inner asg-screen-narrow">
                <h2 class="asg-screen-title">Checking your CSVs</h2>
                <p class="asg-screen-sub" id="asg-scan-filename">—</p>
                <div class="asg-batch-progress" id="asg-batch-progress" hidden>
                    <div class="asg-batch-progress-track">
                        <div class="asg-batch-progress-bar" id="asg-batch-progress-bar"></div>
                    </div>
                    <div class="asg-batch-progress-label" id="asg-batch-progress-label">File 1 of 3</div>
                </div>
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

        <!-- REPORT -->
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
                <div class="asg-batch-files" id="asg-batch-files" hidden></div>
                <div class="asg-impact" id="asg-impact" hidden>
                    <h3>Potential store impact</h3>
                    <p class="asg-impact-note">This is what these CSVs may change, based on the file structure alone.</p>
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
                        <li>Whether Shopify will accept these files</li>
                    </ul>
                </div>
            </div>
        </section>

        <!-- REPAIR -->
        <section class="asg-screen" data-screen="repair" data-step="5" hidden>
            <div class="asg-screen-inner">
                <h2 class="asg-screen-title">What Autonom can fix</h2>
                <p class="asg-screen-sub" id="asg-repair-summary">—</p>
                <div class="asg-repair-group" id="asg-repair-safe" hidden>
                    <h3 class="asg-repair-group-title"><span class="asg-badge asg-badge-safe">Safe</span> Automatic fixes</h3>
                    <p class="asg-repair-group-note">These will be applied automatically to your corrected files.</p>
                    <ul class="asg-repair-list" id="asg-repair-safe-list"></ul>
                </div>
                <div class="asg-repair-group" id="asg-repair-review" hidden>
                    <div class="asg-repair-group-head">
                        <h3 class="asg-repair-group-title"><span class="asg-badge asg-badge-review">Review</span> Fixes that need your approval</h3>
                        <div class="asg-repair-bulk">
                            <button type="button" class="asg-link-btn" id="asg-repair-select-all">Select all</button>
                            <span class="asg-repair-bulk-sep">·</span>
                            <button type="button" class="asg-link-btn" id="asg-repair-deselect-all">Deselect all</button>
                        </div>
                    </div>
                    <p class="asg-repair-group-note">Autonom will not apply these without your confirmation.</p>
                    <ul class="asg-repair-list" id="asg-repair-review-list"></ul>
                </div>
                <div class="asg-repair-group" id="asg-repair-never" hidden>
                    <h3 class="asg-repair-group-title"><span class="asg-badge asg-badge-never">Flagged</span> What Autonom will not change</h3>
                    <p class="asg-repair-group-note">Autonom does not invent data. If a value is missing and we can't determine it safely, we flag it — we don't guess.</p>
                    <ul class="asg-repair-list" id="asg-repair-never-list"></ul>
                </div>
            </div>
        </section>

        <!-- EXPORT -->
        <section class="asg-screen" data-screen="export" data-step="6" hidden>
            <div class="asg-screen-inner">
                <div class="asg-export-hero">
                    <div class="asg-export-check" id="asg-export-check">✓</div>
                    <h2 class="asg-screen-title" id="asg-export-title">Your corrected CSVs are ready</h2>
                    <p class="asg-screen-sub" id="asg-export-summary">—</p>
                </div>
                <div class="asg-diff-section" id="asg-diff-section" hidden>
                    <div class="asg-diff-header" id="asg-diff-toggle" role="button" tabindex="0" aria-expanded="false">
                        <span class="asg-diff-header-label">
                            <span class="asg-diff-header-arrow">▸</span>
                            See exactly what changed
                        </span>
                        <span class="asg-diff-header-count" id="asg-diff-count">0 changes</span>
                    </div>
                    <div class="asg-diff-view-toggle" id="asg-diff-view-toggle" hidden>
                        <button type="button" class="asg-diff-view-btn is-active" data-view="detailed">Detailed</button>
                        <button type="button" class="asg-diff-view-btn" data-view="compact">Compact</button>
                    </div>
                    <div class="asg-diff-list" id="asg-diff-list" hidden></div>
                </div>
                <div class="asg-export-files" id="asg-export-files"></div>
                <div class="asg-export-actions-note">
                    <p><strong>All files come in one ZIP download.</strong> Unzip to find the corrected CSVs, change logs, and the combined report.</p>
                </div>
                <div class="asg-export-advice">
                    <h3>Before you import</h3>
                    <ul class="asg-export-checklist" id="asg-export-checklist"></ul>
                    <p class="asg-export-disclaimer">Autonom does not know your store's current data. A passing report does not guarantee Shopify will accept the import.</p>
                </div>
                <div class="asg-export-end">
                    <p>Done with this scan?</p>
                    <button type="button" class="asg-btn asg-btn-primary" id="asg-export-new-scan-btn">Start a new scan</button>
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

        <div class="asg-tool-footer">
            <div class="asg-tool-footer-inner">
                <span class="asg-tool-footer-mark">Autonom · Shopify Guard</span>
                <span class="asg-tool-footer-note">End of tool · Everything above ran in your browser</span>
            </div>
        </div>

    </div>
    <?php
    return ob_get_clean();
}
add_shortcode( 'autonom_shopify_guard', 'autonom_shopify_guard_shortcode' );
