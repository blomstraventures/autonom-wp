# AUTONOM — PRODUCT DEVELOPMENT DOCUMENT

Product: Shopify Guard\
Version: 1.8.2.1\
Status: Stable\
Purpose: Complete specification. Enough detail for a fresh developer (or an AI coding assistant) to rebuild the tool from scratch.

***


## HOW TO USE THIS DOCUMENT

If you are a developer picking up this project:

1. Read Parts 1–4 to understand what the tool does and why.

2. Read Parts 5–8 to understand the exact data model and validation logic.

3. Read Parts 9–12 to understand the UI, copy, and CSS conventions.

4. Reference the existing code in `product/shopify-guard/src/` as you go — but this document is the source of truth for _what_ to build. The code is the source of truth for _how_ it currently works.

5. Do not deviate from the rules catalog in Part 6 without updating this document.

***


## PART 1 — PROJECT OVERVIEW

### 1.1 What Shopify Guard is

A browser-based preflight checker for Shopify product CSVs. A merchant drops a CSV; the tool scans it for issues that would break the import or silently overwrite live store data; it produces a corrected CSV, a change log, and a readiness report as a single ZIP download.

Everything runs client-side. The file never leaves the browser.


### 1.2 The one-line thesis

> A CSV can pass Shopify's syntax check and still wipe your prices, variants, or descriptions.


### 1.3 Core philosophy

Principle 1 — Autonom does not invent data. If a value is missing or ambiguous, we flag it. We never guess.

Principle 2 — Three classes of fixes, never two. Every issue falls into exactly one of: safe automatic, review required, or never automatic.

Principle 3 — Honesty over polish. Every report names its own limitations. If we can't check something, we say so.


### 1.4 Target user

Shopify merchants with 50–2,000 SKUs who import supplier CSVs at least monthly. Secondary: e-commerce agencies managing multiple stores.


### 1.5 Non-goals

- We do not connect to Shopify.

- We do not upload files.

- We do not modify the merchant's store.

- We do not guarantee Shopify will accept the file.

***


## PART 2 — FILE STRUCTURE & STACK

### 2.1 Repository layout

text

    product/shopify-guard/src/
    ├── shopify-guard-shortcode.php    # WordPress shortcode + asset enqueue
    ├── shopify-guard-tool.js          # Client-side engine
    ├── shopify-guard-tool-style.css   # Tool styles (scoped .asg-)
    ├── frontend-website.html          # Product page content
    └── frontend-style.css             # Page styles (scoped .autonom-)


### 2.2 Asset hosting

Files are hosted at:

text

    /wp-content/uploads/autonom/shopify-guard/

Path is referenced by `AUTONOM_SHOPIFY_GUARD_URL` in the PHP file. Adjust if moving.


### 2.3 Stack

| Layer          | Technology                                 |
| :------------- | :----------------------------------------- |
| Hosting        | WordPress (shortcode-embedded)             |
| Tool styles    | Vanilla CSS, scoped under `.asg-root`      |
| Page styles    | Vanilla CSS, scoped under `.autonom-page`  |
| Logic          | Vanilla JavaScript (ES2018+)               |
| CSV parsing    | PapaParse (lazy-loaded from jsDelivr)      |
| ZIP generation | JSZip (lazy-loaded from jsDelivr)          |
| Build step     | None. Edit-and-reload is the entire cycle. |


### 2.4 Load order

1. WordPress page renders → Custom HTML block outputs page content → the shortcode `[autonom_shopify_guard]` is called

2. The shortcode enqueues `shopify-guard-tool-style.css` and `shopify-guard-tool.js`

3. On first scan, `shopify-guard-tool.js` fetches PapaParse dynamically

4. On first download, it fetches JSZip dynamically

5. The `frontend-style.css` is enqueued separately (only on the `shopify-guard` page)

***


## PART 3 — THE STATE MACHINE

The tool has exactly six states. Each is a screen.

text

    LANDING ──► SETUP ──► SCANNING ──► REPORT ──► REPAIR ──► EXPORT
       │          │          │           │          │          │
       │          │          │           │          │          │
       └──────────┴──────────┴───────────┴──────────┴──────────┘
                  (any screen can return to LANDING via "New scan")


### 3.1 Transition rules

| From     | To       | Trigger                                 |
| :------- | :------- | :-------------------------------------- |
| LANDING  | SETUP    | File dropped or chosen                  |
| SETUP    | SCANNING | "Scan this CSV" clicked                 |
| SCANNING | REPORT   | Scan completes (auto)                   |
| REPORT   | REPAIR   | "Review and repair →" clicked           |
| REPAIR   | EXPORT   | "Generate corrected files" clicked      |
| EXPORT   | REPAIR   | "← Back" clicked                        |
| Any      | LANDING  | "↻ New scan" clicked (resets all state) |
| REPORT   | LANDING  | "← New scan" clicked                    |
| SETUP    | LANDING  | "← Start over" clicked                  |


### 3.2 Screen visibility

Only one `<section class="asg-screen">` is visible at a time. The `hidden` attribute controls visibility. A universal CSS rule `[hidden] { display: none !important; }` enforces this even if other rules set `display: flex`.

***


## PART 4 — DATA MODEL

### 4.1 The `state` object

javascript

    const state = {
      file: null,                    // File object
      fileName: '',                  // string
      fileSize: 0,                   // bytes
      fileText: '',                  // decoded file contents
      hasBOM: false,                 // boolean
      detectedEncoding: 'UTF-8',     // string
      detectedDelimiter: ',',        // ',' | ';' | '\t' | '|'
      headers: [],                   // array of column names
      rows: [],                      // array of row objects {Header: value}
      mode: null,                    // 'new_products' | 'existing_products' | null
      detectedMode: null,            // what we auto-detected
      detectedConfidence: null,      // 'high' | 'medium' | 'low'
      detectedReason: '',            // human-readable explanation
      result: null,                  // the JSON result object
      repairs: null,                 // { safe: [], review: [], never: [] }
      acceptedRepairs: {},           // { CODE: true }
      correctedCSV: null,            // string
      changeLog: null,               // array of change entries
      appliedCodes: null,            // Set of codes that actually applied
      splitParts: null,              // array of { name, csv, rowCount } or null
      showRowContext: {},            // { CODE: true/false }
      diffViewMode: 'detailed',      // 'detailed' | 'compact'
      parseFieldMismatches: 0,       // count
      networkStats: { files: 0, bytes: 0, requests: 0 }
    };


### 4.2 The result object

Every scan produces:

javascript

    {
      status: 'READY_FOR_REVIEW' | 'READY_WITH_WARNINGS' | 'NOT_READY',
      tool: 'shopify-guard',
      tool_version: '1.8.2.1',
      profile: 'shopify-product-csv',
      profile_version: '2025-01',
      mode: 'new_products' | 'existing_products',
      detected_mode: '...',
      detected_confidence: 'high' | 'medium' | 'low',
      summary: {
        critical: 0,
        warnings: 0,
        info: 0,
        passed: 0,
        rows_scanned: 0,
        columns_detected: 0
      },
      issues: [ /* issue objects */ ],
      passed_checks: [ /* strings */ ],
      potential_impact: {
        matching_handles: 0,
        changed_prices: 0,
        changed_inventory: 0,
        blank_included_values: 0
      } | null,
      technical_metadata: {
        file_name: '...',
        byte_size: 0,
        encoding: 'UTF-8',
        has_bom: false
      }
    }


### 4.3 The issue object

javascript

    {
      severity: 'critical' | 'warning' | 'info',
      code: 'DESTRUCTIVE_BLANK_INCLUDED_COLUMN',  // SCREAMING_SNAKE_CASE
      title: 'Blank values in included column "Variant Price"',  // user-facing
      what_is_wrong: '...',
      why_it_matters: '...',
      suggested_action: '...',
      affected_rows: [ { row: 4, handle: 'blue-tee' } ],
      affected_column: 'Variant Price',  // optional
      shopify_doc_url: '...',            // optional
      auto_fix: 'safe_automatic' | 'review_required' | 'never',
      alternative_fix: 'strip_column_with_user_approval'  // optional
    }


### 4.4 The change log entry

javascript

    {
      row: 'all' | 4,           // 'all' for file-level or column-level changes
      column: 'Variant Price',  // or '(file)' for file-level
      before: '$21.99',         // string
      after: '21.99',           // string
      reason: 'Stripped currency symbol'
    }

***


## PART 5 — SCREEN SPECIFICATIONS

### 5.1 Screen 1: LANDING

Purpose: Get the user to drop a file.

DOM:

text

    <section data-screen="landing">
      <div class="asg-dropzone">...</div>
      <p class="asg-trust-line">No account. No upload. No tracking of file contents.</p>
      <p class="asg-sample-line">New here? <button id="asg-download-sample-btn">...</button></p>
    </section>

Interactive elements:

- `#asg-dropzone` — click, keyboard (Enter/Space), drag-and-drop

- `#asg-file-input` — hidden file input

- `#asg-download-sample-btn` — generates and downloads a sample CSV


### 5.2 Screen 2: SETUP

Purpose: Confirm mode before scanning.

DOM:

text

    <section data-screen="setup">
      <h2>What are you doing with this CSV?</h2>
      <div id="asg-detect-banner">...</div>     <!-- hidden if low confidence -->
      <div id="asg-mode-grid">...</div>          <!-- 2 cards -->
      <div id="asg-delim-banner">...</div>       <!-- hidden if delimiter is comma -->
      <div class="asg-file-preview">...</div>
      <div id="asg-file-sample">...</div>        <!-- 3-row preview -->
    </section>

Mode cards: `data-mode="new_products"` and `data-mode="existing_products"`. Selecting one sets `state.mode`.

Auto-detection: Runs on file load. If confident (high/medium), pre-selects the mode and hides the grid behind a banner. If low confidence, shows both cards and asks.


### 5.3 Screen 3: SCANNING

Purpose: Make the scan feel like work is being done.

DOM:

text

    <section data-screen="scanning">
      <h2>Checking your CSV</h2>
      <p id="asg-scan-filename">—</p>
      <ul id="asg-scan-steps">
        <li data-step="read">Reading CSV structure</li>
        <li data-step="encoding">Verifying encoding</li>
        ... 11 total
      </ul>
    </section>

Animation: Each `<li>` transitions from empty → running (`◐`) → done (`✓`). Delays are staggered at \~90ms per step for visual pacing. The actual scan logic runs synchronously; the delays are purely for readability.


### 5.4 Screen 4: REPORT

Purpose: Present findings with clarity.

DOM (order matters):

text

    <section data-screen="report">
      <div id="asg-verdict">...</div>       <!-- color-coded verdict -->
      <div id="asg-summary">...</div>       <!-- 4-cell grid -->
      <div id="asg-impact">...</div>        <!-- only in update mode -->
      <div class="asg-issues-section">
        <div id="asg-issues-filter">...</div>
        <div id="asg-issues-list">...</div>
        <div id="asg-no-issues">...</div>
      </div>
      <div class="asg-not-checked">...</div>  <!-- limitations -->
    </section>

Issue cards are collapsible. Each contains:

- Head: marker dot + title + toggle arrow

- Body (hidden by default): What is wrong, Why this matters, Affected rows table, What you can do

Row context view: Clicking "Show in context" in the affected-rows table expands to include 2 rows of surrounding context, with target rows highlighted.


### 5.5 Screen 5: REPAIR

Purpose: Let the user decide what to fix.

DOM:

text

    <section data-screen="repair">
      <h2>What Autonom can fix</h2>
      <p id="asg-repair-summary">—</p>
      <div id="asg-repair-safe">...</div>     <!-- no checkboxes -->
      <div id="asg-repair-review">...</div>   <!-- checkboxes; Select all / Deselect all -->
      <div id="asg-repair-never">...</div>    <!-- column-removal checkboxes only -->
    </section>

Checkbox data attributes:

- `data-accept="CODE"` — standard fix acceptance

- `data-remove-column="Column Name"` — for destructive blank column removal


### 5.6 Screen 6: EXPORT

Purpose: Deliver the corrected file with full transparency.

DOM:

text

    <section data-screen="export">
      <div class="asg-export-hero">
        <div id="asg-export-check">✓</div>
        <h2 id="asg-export-title">Your corrected CSV is ready</h2>
        <p id="asg-export-summary">—</p>
      </div>
      <!-- Split panel inserted here if splitParts -->
      <!-- Warning panel inserted here if remaining issues -->
      <div class="asg-diff-section">
        <div id="asg-diff-toggle">See exactly what changed</div>
        <div id="asg-diff-view-toggle">Detailed / Compact</div>
        <div id="asg-diff-list">...</div>
      </div>
      <div class="asg-export-files">...</div>
      <div class="asg-export-actions-note">...</div>
      <div class="asg-export-advice">
        <ul id="asg-export-checklist">...</ul>  <!-- dynamic -->
      </div>
    </section>

***


## PART 6 — VALIDATION RULES CATALOG

This is the source of truth. Every rule with its exact code, severity, auto-fix class, and detection logic.


### 6.1 Critical rules

| Code                                   | Detection                                                     | Fix class                                  |
| :------------------------------------- | :------------------------------------------------------------ | :----------------------------------------- |
| `TITLE_MISSING`                        | Per-handle: first row has no Title                            | never                                      |
| `HANDLE_MISSING_UPDATE`                | Row has no Handle (update mode)                               | never                                      |
| `HANDLE_DUPLICATE_IN_FILE`             | Same Handle across rows with different Titles                 | never                                      |
| `SKU_DUPLICATE_IN_FILE`                | Same SKU across different Handles                             | review\_required                           |
| `DESTRUCTIVE_BLANK_INCLUDED_COLUMN`    | Blank cells in sensitive included columns (see 6.3)           | review\_required if 30%+ blank, else never |
| `VARIANT_ORPHANED`                     | Row has Option1 Name/Value but no Handle                      | never                                      |
| `VARIANT_OPTION_NAME_INCONSISTENT`     | Same Handle, different Option1 Name values                    | never                                      |
| `VARIANT_DUPLICATE_OPTION_COMBINATION` | Same Handle, same Option1+2+3 Value combo on 2+ rows          | never                                      |
| `VARIANT_PARTIAL_COLLAPSE`             | Row has Option{N} Name XOR Option{N} Value                    | never                                      |
| `VARIANT_COLUMN_INCONSISTENCY`         | Some rows of a Handle fill Option{X} and others don't         | never                                      |
| `IMAGE_ROW_VARIANT_DATA`               | Image row has data outside Handle + Image Src                 | review\_required                           |
| `SINGLE_VARIANT_MULTIPLE_IMAGES`       | Handle has 1 variant row + 1+ image rows, no Option1 declared | review\_required                           |
| `COMPARE_AT_PRICE_LOWER_THAN_PRICE`    | Per-handle first row: CompareAt ≤ Price                       | never                                      |
| `HEADER_REQUIRED_MISSING`              | Required column not present (new-product mode)                | never                                      |
| `HEADER_DUPLICATE`                     | Same header appears twice                                     | review\_required                           |
| `DELIMITER_NOT_COMMA`                  | File uses `;`, `\t`, or `\|`                                  | review\_required                           |


### 6.2 Warning rules

| Code                                 | Detection                                                                                                    | Fix class        |
| :----------------------------------- | :----------------------------------------------------------------------------------------------------------- | :--------------- |
| `ENCODING_BOM_PRESENT`               | First bytes = EF BB BF                                                                                       | safe\_automatic  |
| `ENCODING_NOT_UTF8`                  | Non-UTF-8 decode                                                                                             | safe\_automatic  |
| `SMART_QUOTES_DETECTED`              | Cell contains `[\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u2039\u203A\u00AB\u00BB\u2013\u2014\u2026]` | safe\_automatic  |
| `CELL_WHITESPACE`                    | Cell has leading/trailing spaces in text columns                                                             | safe\_automatic  |
| `SKU_WHITESPACE`                     | SKU has leading/trailing spaces                                                                              | safe\_automatic  |
| `HANDLE_FORMAT_INVALID`              | Handle fails `/^[a-z0-9]+(-[a-z0-9]+)*$/`                                                                    | safe\_automatic  |
| `HANDLE_MISSING_NEW`                 | No Handle (new-product mode)                                                                                 | review\_required |
| `DUPLICATE_IMAGE_ROWS`               | Same Handle + same Image Src on 2+ image rows                                                                | safe\_automatic  |
| `DUPLICATE_IDENTICAL_ROWS`           | Two rows with identical concatenated values                                                                  | review\_required |
| `INVENTORY_QTY_MISSING_WITH_TRACKER` | Tracker set, Qty blank                                                                                       | review\_required |
| `INVENTORY_TRACKER_MISSING`          | Qty set, Tracker blank                                                                                       | never            |
| `BOOLEAN_FORMAT`                     | Published/Variant Requires Shipping/etc. has non-TRUE/FALSE value                                            | safe\_automatic  |
| `PRICE_CURRENCY_SYMBOL`              | Price contains `$€£¥₹...`                                                                                    | safe\_automatic  |
| `PRICE_DECIMAL_COMMA`                | Price matches `\d+,\d{1,2}`                                                                                  | review\_required |
| `PRICE_NON_NUMERIC`                  | Price unparseable                                                                                            | never            |
| `PRICE_NEGATIVE`                     | Price < 0                                                                                                    | never            |
| `INVENTORY_NON_INTEGER`              | Qty not integer                                                                                              | never            |
| `INVENTORY_NEGATIVE`                 | Qty < 0                                                                                                      | never            |
| `HTML_UNCLOSED_TAG`                  | Unbalanced tag stack                                                                                         | review\_required |
| `HTML_DANGEROUS_ATTRIBUTE`           | Contains `<script>`, `<iframe>`, `<object>`, `<embed>`                                                       | never            |
| `IMAGE_URL_NOT_HTTPS`                | URL starts with `http://`                                                                                    | review\_required |
| `IMAGE_URL_NO_EXTENSION`             | URL path doesn't end with image extension                                                                    | never            |
| `IMAGE_URL_PRIVATE_CDN`              | Host matches localhost/private IP pattern                                                                    | never            |
| `IMAGE_URL_MALFORMED`                | `new URL()` throws                                                                                           | never            |
| `STATUS_INVALID_VALUE`               | Status not in `active`, `draft`, `archived`                                                                  | never            |


### 6.3 Sensitive columns (destructive blank check)

text

    Variant Price
    Variant Compare At Price
    Variant Inventory Qty
    Vendor
    Type
    Tags
    Body (HTML)
    Published
    Status
    Product Category


### 6.4 Product-level columns (checked only on primary rows)

text

    Vendor, Type, Tags, Body (HTML), Published, Status, Product Category, Title


### 6.5 Info rules

| Code                          | Detection                                                               |
| :---------------------------- | :---------------------------------------------------------------------- |
| `FILE_SIZE_APPROACHING_LIMIT` | 12 MB ≤ size < 15 MB                                                    |
| `FILE_SIZE_OVER_LIMIT`        | size ≥ 15 MB                                                            |
| `PRODUCT_CATEGORY_FORMAT`     | Not matching `gid://shopify/...`, `>`-containing, or short code pattern |
| `ROW_ORDER_WARNING`           | Handle appears, disappears, then reappears                              |
| `FIELD_COUNT_MISMATCH`        | PapaParse reported FieldMismatch                                        |
| `DESTRUCTIVE_BLANK_ALL_ROWS`  | Entire column is blank                                                  |


### 6.6 Severity decision tree

When adding a new rule:

1. Will it cause the import to fail? → Critical

2. Could it silently change existing store data? → Critical

3. Is it a quality/consistency issue? → Warning

4. Is it just context? → Info

***


## PART 7 — REPAIR SYSTEM

### 7.1 The three classes

Safe automatic — Deterministic. Applied without asking. No checkbox. Reason: no scenario where the fix makes things worse.

Review required — Applied only with explicit user approval. Checkbox, checked by default. Reason: might collide with user's conventions.

Never automatic — Flagged, never changed. Reason: would require inventing data or knowing store state.


### 7.2 The threshold rule for destructive blanks

When an included column has blanks:

text

    ratio = blank_cells / relevant_cells

    if ratio >= 0.30:  auto_fix = 'review_required'
                        (offer to remove the whole column)
    else:              auto_fix = 'never'
                        (flag only; tell user to fix in source)

Relevant cells = rows that would actually be updated by the column (see 8.2).

Reason for the threshold: removing a column with only 1 blank of 17 means losing 16 valid updates. Better to flag and let the user fix the source.


### 7.3 Repair plan structure

javascript

    planRepairs() returns {
      safe: [ /* issue objects */ ],
      review: [ /* issue objects */ ],
      never: [ /* issue objects */ ]
    }

Each group has distinct UI:

- safe → informational list, no checkboxes

- review → list with checkboxes

- never → list; may include column-removal checkboxes for `DESTRUCTIVE_BLANK_INCLUDED_COLUMN` when ratio ≥ 30%

***


## PART 8 — CORE ALGORITHMS

### 8.1 Encoding detection

javascript

    function detectEncoding(buf) {
      const bytes = new Uint8Array(buf);
      if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF)
        return { encoding: 'UTF-8', hasBOM: true };
      if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE)
        return { encoding: 'UTF-16LE', hasBOM: true };
      if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF)
        return { encoding: 'UTF-16BE', hasBOM: true };
      const sample = bytes.slice(0, Math.min(4096, bytes.length));
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(sample);
        return { encoding: 'UTF-8', hasBOM: false };
      } catch (e) {
        return { encoding: 'ISO-8859-1', hasBOM: false };
      }
    }


### 8.2 Row classification

Before destructive-blank checks run, every row is classified as image / primary / variant / unknown.

javascript

    function classifyRows() {
      // Group row indices by Handle
      // For each handle:
      //   primarySet = false
      //   for each row:
      //     if has SKU or Price or Option1Value:
      //       isVariant[row] = true
      //       if !primarySet: isPrimary[row] = true; primarySet = true
      //     else if has ImageSrc and !has Title:
      //       isImage[row] = true
      //     else if has Title:
      //       if !primarySet: isPrimary[row] = true; primarySet = true
      //       else: isVariant[row] = true
      //     else: isVariant[row] = true
      return { isImage, isPrimary, isVariant };
    }

Why it matters: image rows are legitimately blank in most columns. Without classification, every image row would trigger a false destructive-blank warning.


### 8.3 Destructive blank check

javascript

    if mode === 'existing_products':
      if parseFieldMismatches > 0:
        // File is misaligned. Cannot reliably classify rows.
        // Skip the check entirely and tell the user.
        passed.push('Destructive blank check skipped (file has misaligned rows)')
      else:
        for each sensitive column:
          isProductLevel = PRODUCT_LEVEL_COLUMNS.includes(column)
          blanks = []
          consideredCount = 0
          allBlank = true
          for each row:
            if isImage[row]: skip
            if isProductLevel and !isPrimary[row]: skip
            if !isProductLevel and !isVariant[row] and !isPrimary[row]: skip
            consideredCount++
            if blank(row[column]): blanks.push(row)
            else: allBlank = false
          if consideredCount === 0: skip
          if allBlank: emit DESTRUCTIVE_BLANK_ALL_ROWS (info, safe fix)
          else if blanks.length > 0:
            ratio = blanks.length / consideredCount
            if ratio >= 0.30: emit with auto_fix='review_required'
            else: emit with auto_fix='never'


### 8.4 Image row detection

A row is an image row when ALL of these are true:

- Has Image Src value

- Has no Title

- Has no Variant SKU

- Has no Variant Price

- Has no Option1 Value


### 8.5 Delimiter detection

javascript

    function detectDelimiter(text) {
      const sample = text.split(/\r?\n/).slice(0, 5).join('\n');
      const counts = {
        ',': (sample.match(/,/g) || []).length,
        ';': (sample.match(/;/g) || []).length,
        '\t': (sample.match(/\t/g) || []).length,
        '|': (sample.match(/\|/g) || []).length
      };
      let best = ',', max = 0;
      Object.keys(counts).forEach(d => {
        if (counts[d] > max) { max = counts[d]; best = d; }
      });
      return best;
    }


### 8.6 Delimiter conversion

Re-parses the whole file with quote awareness, then re-serializes with the target delimiter. Preserves quoted fields.


### 8.7 Price analysis

javascript

    function analyzePrice(raw) {
      // Returns { value, parseable, commaDecimal, hasCurrency, normalized }
      // Handles:
      //   19.99         → 19.99
      //   19,99         → 19.99 (commaDecimal: true)
      //   1.234,56      → 1234.56 (commaDecimal: true)
      //   1,234         → 1234 (thousands separator, US style)
      //   $21.99        → 21.99 (hasCurrency: true)
      //   not-a-number  → parseable: false
    }


### 8.8 Handle normalization

javascript

    function toHandle(t) {
      return String(t || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // strip diacritics
        .replace(/[ß]/g, 'ss')
        .replace(/[æ]/g, 'ae')
        .replace(/[ø]/g, 'o')
        .replace(/[đ]/g, 'd')
        .replace(/[ł]/g, 'l')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    }


### 8.9 HTML repair

Sequence of repairs, in order:

1. `<p>...</div>` → `<p>...</p>`

2. `<p>...</span>` → `<p>...</p>`

3. `<b>...</i>` → `<b>...</b>`

4. `<i>...</b>` → `<i>...</i>`

5. `<strong>...</em>` → `<strong>...</strong>`

6. `<em>...</strong>` → `<em>...</em>`

7. Remove orphan closing tags

8. Balance remaining unclosed tags at the end


### 8.10 Duplicate SKU suffixing

javascript

    function makeUniqueSku(base, usedSet) {
      if (!usedSet.has(base)) { usedSet.add(base); return base; }
      let n = 2;
      while (usedSet.has(base + '-' + n)) n++;
      const sku = base + '-' + n;
      usedSet.add(sku);
      return sku;
    }


### 8.11 File splitting

text

    1. Group row indices by Handle
    2. Estimate header byte size (Blob size of header line)
    3. For each group, calculate group CSV size - header size
    4. Greedily pack groups into chunks until chunk would exceed SPLIT_TARGET_BYTES (14 MB)
    5. When a group would overflow, start a new chunk
    6. If a single group exceeds SPLIT_TARGET_BYTES - headerBytes, that product cannot fit; return null and warn
    7. Return null if only one chunk produced (no split needed)
    8. Name chunks: basename_part1ofN.csv, basename_part2ofN.csv, etc.

Products are never split across chunks. If a product's rows don't fit in one chunk, we bail out.


### 8.12 Duplicate identical row detection

javascript

    // Build a signature string from all cell values
    const sig = headers.map(h => String(row[h] || '').trim()).join('\u0001');
    // Track which rows share each signature
    // The first occurrence is the original; subsequent are duplicates


### 8.13 CSV serialization (final export)

Uses PapaParse's `unparse()` with `quotes: true` if PapaParse is loaded. Falls back to a manual serializer if not.

BOM is always stripped from the output (if present). Shopify rejects BOM-prefixed files.

***


## PART 9 — UI COMPONENTS & CSS CONVENTIONS

### 9.1 The variable system

All colors, spacing, and radii are defined as CSS variables on `.asg-root` (tool) and `.autonom-page` (page). Never hardcode a color.

Tool variables:

css

    --asg-bg, --asg-bg-soft, --asg-bg-muted
    --asg-border, --asg-border-strong
    --asg-text, --asg-text-muted, --asg-text-dim
    --asg-accent, --asg-accent-hover
    --asg-critical, --asg-warning, --asg-info, --asg-passed
    --asg-radius, --asg-radius-sm
    --asg-mono, --asg-sans

Page variables: same names with `--autonom-` prefix.


### 9.2 Class naming

Tool classes: prefix `.asg-`\
Page classes: prefix `.autonom-`

Never mix. Every class must be prefixed.


### 9.3 Component patterns

| Component      | Class                                                 | Notes                                                                 |
| :------------- | :---------------------------------------------------- | :-------------------------------------------------------------------- |
| Button         | `.asg-btn`                                            | Modifiers: `.asg-btn-primary`, `.asg-btn-ghost`, `.asg-btn-lg`        |
| Pill button    | `.asg-btn-pill`                                       | For topbar actions                                                    |
| Badge          | `.asg-badge`                                          | Modifiers: `.asg-badge-safe`, `.asg-badge-review`, `.asg-badge-never` |
| Card           | `.asg-issue`, `.asg-repair-group`, `.asg-export-file` | Border + radius                                                       |
| Screen         | `.asg-screen`                                         | One visible at a time                                                 |
| Step indicator | `.asg-step`                                           | `.is-active`, `.is-done`                                              |


### 9.4 The `[hidden]` rule

Every element with the `hidden` HTML attribute must be hidden, regardless of what `display` value other CSS rules set. Enforce with:

css

    .asg-root [hidden] { display: none !important; }
    .autonom-page [hidden] { display: none !important; }

This is why we don't need per-element `[hidden]` overrides.


### 9.5 Responsive breakpoints

| Breakpoint | Changes                                                                                               |
| :--------- | :---------------------------------------------------------------------------------------------------- |
| `≤ 860px`  | Hero title 56px → 40px; section padding reduced; 3-column grids become 2-column                       |
| `≤ 720px`  | Tool hero shrinks; landing grid becomes 1-column                                                      |
| `≤ 640px`  | All 2-column and 3-column grids become 1-column; step indicator hidden; nav hidden; pro teaser stacks |
| `≤ 560px`  | Report summary grid becomes 2×2                                                                       |

***


## PART 10 — COPY DECK

Every user-facing string. Change here, change everywhere.


### 10.1 Button labels

| Element           | Copy                                              |
| :---------------- | :------------------------------------------------ |
| New scan          | `↻ New scan`                                      |
| Privacy toggle    | `Local processing`                                |
| Dropzone CTA      | `Choose a file`                                   |
| Sample download   | `Download a sample CSV with intentional errors →` |
| Mode: new         | `Adding new products`                             |
| Mode: update      | `Updating existing products`                      |
| Scan              | `Scan this CSV`                                   |
| Repair            | `Review and repair →`                             |
| Generate          | `Generate corrected files`                        |
| Download          | `Download ZIP`                                    |
| Back              | `← Back`                                          |
| Skip repairs      | `Skip repairs`                                    |
| Select all        | `Select all`                                      |
| Deselect all      | `Deselect all`                                    |
| Convert delimiter | `Convert to comma`                                |
| Diff toggle       | `See exactly what changed`                        |
| Diff view         | `Detailed` / `Compact`                            |
| Pro teaser        | `Pro Access — Coming Soon`                        |


### 10.2 Verdict text

| Status                | Badge                 | Title                  | Sub                                                     |
| :-------------------- | :-------------------- | :--------------------- | :------------------------------------------------------ |
| NOT\_READY            | `Not ready`           | `Not ready for import` | `{N} critical issues may change existing product data.` |
| READY\_WITH\_WARNINGS | `Ready with warnings` | `Ready with warnings`  | `{N} warnings should be reviewed before import.`        |
| READY\_FOR\_REVIEW    | `Ready for review`    | `Ready for review`     | `No critical issues detected by the checks performed.`  |


### 10.3 Pluralization rules

- `pcount(n, singular, plural?)` — "1 row" / "2 rows" / "No rows"

- `applied(n, singular, plural?)` — "1 safe fix applied" / "5 safe fixes applied" / "No safe fixes needed"

- `v(n, singularVerb, pluralVerb)` — "1 row has" / "2 rows have"

Never write `(s)`.


### 10.4 Limitations copy (never changes)

These lines appear in the report and on the page. Do not weaken them.

> Autonom does not know your store's current data.\
> Autonom cannot guarantee Shopify will accept this import.\
> Autonom does not connect to your Shopify store.\
> Autonom does not invent data. If a value is missing and we can't determine it safely, we flag it — we don't guess.

***


## PART 11 — PRIVACY MODEL

### 11.1 The claim

Your file is read in your browser. It is not uploaded for processing.


### 11.2 What we do not claim

- Not "zero telemetry" (page analytics exist)

- Not "0 KB network" (page assets load)

- Not "impossible to track"


### 11.3 The privacy monitor

A `PerformanceObserver` watches for `fetch`, `xmlhttprequest`, and `beacon` resource entries. Counters increment when those fire. Displayed in the privacy drawer:

text

    Files uploaded: 0
    Contents transmitted: 0 B
    Network requests during processing: 0

Caveat we state in the drawer: other page resources (Stripe for payments, analytics, fonts) may communicate with their own services. Your CSV contents are not transmitted.


### 11.4 Verification

The site must be verifiable by opening DevTools → Network tab during a scan. Zero outbound requests for the file contents.

***


## PART 12 — WORDPRESS INTEGRATION

### 12.1 Shortcode registration

The PHP file registers a shortcode `[autonom_shopify_guard]`. When rendered, it:

1. Enqueues `shopify-guard-tool-style.css`

2. Enqueues `shopify-guard-tool.js`

3. Outputs the tool's full HTML markup


### 12.2 Page setup

1. Create a WordPress page with slug `shopify-guard`

2. Use a full-width or blank page template

3. Paste the `frontend-website.html` content into a Custom HTML block

4. The shortcode `[autonom_shopify_guard]` is included in that HTML

5. Enqueue `frontend-style.css` for pages with that slug


### 12.3 Enqueue example

php

    add_action( 'wp_enqueue_scripts', function () {
        if ( is_page( 'shopify-guard' ) ) {
            wp_enqueue_style(
                'autonom-frontend-style',
                get_stylesheet_directory_uri() . '/frontend-style.css',
                array(),
                '1.0.0'
            );
        }
    } );


### 12.4 Theme integration

The tool and page do not include their own header or footer. The WordPress theme handles those. The tool and page content assume they're rendered inside the theme's main content area.

***


## PART 13 — TEST FIXTURES

The tool ships with a built-in sample CSV (`downloadSampleCSV()`). This fixture includes every testable issue. Use it for verification after any change.


### 13.1 What the fixture tests

| Row | Handle              | Issue triggered                                            |
| :-- | :------------------ | :--------------------------------------------------------- |
| 1   | `blue-cotton-tee`   | (clean baseline)                                           |
| 2   | `blue-cotton-tee`   | (clean variant)                                            |
| 3   | `blue-cotton-tee`   | Destructive blank in Variant Price                         |
| 4   | `red-cotton-tee`    | Whitespace, non-numeric price, HTTP URL                    |
| 5   | `red-cotton-tee`    | Comma-decimal price, compare-at lower than price           |
| 6   | `black-cotton-tee`  | Unclosed HTML, currency symbol, negative inventory         |
| 7   | `green-cotton-tee`  | Smart quotes, duplicate SKU, private CDN URL               |
| 8   | `fancy Tee`         | Handle format invalid, invalid status                      |
| 9   | (none)              | Orphaned variant                                           |
| 10  | (none)              | Orphaned variant, non-numeric price, non-integer inventory |
| 11  | `teal-mug`          | (clean)                                                    |
| 12  | `teal-mug`          | Duplicate handle with different title                      |
| 13  | `no-title-product`  | Title missing                                              |
| 14  | `partial-collapse`  | Incomplete option data                                     |
| 15  | `malformed-image`   | Malformed URL                                              |
| 16  | `multi-image-tee`   | Single-variant multi-image                                 |
| 17  | `multi-image-tee`   | (image row)                                                |
| 18  | `multi-image-tee`   | Image row with extra variant data                          |
| 19  | `dup-image-tee`     | (clean with images)                                        |
| 20  | `dup-image-tee`     | (duplicate image row)                                      |
| 21  | `boolean-lowercase` | Non-standard boolean value                                 |
| 22  | `inv-no-qty`        | Inventory tracker without quantity                         |


### 13.2 After any code change

1. Reload the page

2. Click "Download a sample CSV with intentional errors →"

3. Upload it in "Updating existing products" mode

4. Verify: 10 critical, 16 warnings, 1 info, \~20 passed

5. Review and repair → Generate corrected files → Download ZIP

6. Verify: 14 change log entries, correct output CSV

If any count differs, either the code is wrong or the fixture changed. Decide which and correct.

***


## PART 14 — DESIGN DECISIONS LOG

Recorded so future developers understand _why_ certain choices were made.

| Decision                                             | Rationale                                                                                                                     |
| :--------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| No universal checkboxes                              | Safe fixes are deterministic. A checkbox adds friction and enables accidental disable. Review-required fixes have checkboxes. |
| Three-tier model, not two                            | Two tiers forces safe fixes into "approve or skip" which is hostile to non-technical users.                                   |
| 30% threshold for column removal                     | Removing a column with a few blanks loses valid updates. Only offer it when the column is mostly empty.                       |
| Products never split across chunks                   | Shopify would treat a split product as two products. Must keep all variant rows together.                                     |
| Skip destructive-blank check when file is misaligned | If we can't tell which column a cell belongs to, we can't check it safely.                                                    |
| Lazy-load PapaParse and JSZip                        | Faster initial page load. Parser isn't needed until the user scans. ZIP isn't needed until they download.                     |
| BOM stripped from output, always                     | Shopify rejects BOM-prefixed CSVs. Even if the input had one.                                                                 |
| No accounts, no login                                | Adds friction. The tool doesn't need identity.                                                                                |
| Free forever, Pro teaser only                        | Build audience first. Monetize later with batch features for large merchants.                                                 |
| Marketing copy on the page, not in the shortcode     | Edit marketing without touching code. Reuse the tool anywhere.                                                                |
| `[hidden] { display: none !important; }`             | One rule to rule them all. Prevents per-element display overrides.                                                            |

***


## PART 15 — ADDING A NEW RULE

When adding a new validation rule:

1. Add an entry to `ISSUE_GUIDES` in `shopify-guard-tool.js` with the code, `what`, `why`, and `action` strings.

2. Add the detection logic to `runChecks()`. Determine the correct severity and fix class per Section 6.6.

3. If the fix needs a repair handler, add it to `buildCorrectedCSV()`.

4. If it's review-required, ensure it appears in the right repair group and gets a checkbox.

5. If the fix is auto-applied, ensure the change log entry is pushed and the code is added to `appliedCodes`.

6. If the fix touches a specific column, guard with `if (hasCol(col))` to avoid running on removed columns.

7. Update Section 6 of this document with the new rule.

8. Update the sample CSV if the rule isn't already covered.

9. Bump the version in three places: header comment, `tool_version` in `buildResult()`, and the `LOG()` call in `init()`.

***


## PART 16 — VERSION HISTORY

| Version | Key changes                                                                                                                             |
| :------ | :-------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0.0   | Initial release                                                                                                                         |
| 1.4.0   | Mode auto-detection, row context view, file preview                                                                                     |
| 1.5.0   | Smart quotes, whitespace, currency, comma-decimal, category checks                                                                      |
| 1.6.0   | ZIP download, before/after diff preview, variant column inconsistency                                                                   |
| 1.7.0   | Image row cleanup, single-variant multi-image, boolean format, inventory tracker, extended handle normalization                         |
| 1.7.1   | Row classification; fixes stopped running on removed columns                                                                            |
| 1.7.2   | Skip destructive-blank check when file is misaligned; sample CSV fix                                                                    |
| 1.7.3   | 30% threshold for column removal; only flag sparse blanks                                                                               |
| 1.8.0   | Centralized `ISSUE_GUIDES`, lazy-loaded PapaParse + JSZip, compact/detailed diff view, dynamic export checklist, Pro teaser             |
| 1.8.1   | Visibility fixes for Pro teaser and diff toggle                                                                                         |
| 1.8.2   | File splitting for oversized CSVs, delimiter detection + conversion, duplicate identical row detection, bulk select/deselect on repairs |
| 1.8.2.1 | Universal `[hidden]` rule fixes delimiter banner display bug                                                                            |

***


## PART 17 — FUTURE WORK (NOT YET BUILT)

Recorded so they're not lost. Do not build these until validated.

- Batch mode — Process multiple files in one session (Pro candidate)

- Supplier column mapping — Map arbitrary columns to Shopify columns (Pro candidate)

- CSV history log — Remember past scans and diff between them (Pro candidate)

- Shopify store comparison mode — Compare CSV against a downloaded store export to predict exact changes

- Compare-at price correction suggestions — We can currently flag but not suggest

- Extended HTML sanitization — Currently we repair basic mismatches only

- Metafield column support — Shopify metafields use a specific format we don't validate

- Multi-language category mapping — For non-English Shopify stores

***


## PART 18 — CONTACT & REPO

Repo: <https://github.com/blomstraventures/autonom-wp>\
Product folder: `product/shopify-guard/`\
License: (add)\
Maintainer: (add)

When in doubt, read the code. When code and this document disagree, this document is right and the code has a bug.

***

End of Product Development Document — v1.0
