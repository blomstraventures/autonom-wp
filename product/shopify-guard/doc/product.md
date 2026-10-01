# Shopify Guard — Product Documentation

> **Check your Shopify CSV before it changes your store.**

A privacy-first, browser-based preflight tool that scans Shopify product CSVs for destructive import issues, repairs what it safely can, and reports exactly what changed — without ever uploading a byte.

**Version:** 1.7.3
**Status:** Stable
**License:** (add your license)

---

## Table of Contents

1. [What Is Shopify Guard](#1-what-is-shopify-guard)
2. [Core Philosophy](#2-core-philosophy)
3. [Target User](#3-target-user)
4. [The Problem It Solves](#4-the-problem-it-solves)
5. [Feature Overview](#5-feature-overview)
6. [Complete Rule Catalog](#6-complete-rule-catalog)
7. [The Three Repair Classes](#7-the-three-repair-classes)
8. [UI/UX System](#8-uiux-system)
9. [The Six Screens](#9-the-six-screens)
10. [Core Algorithms](#10-core-algorithms)
11. [Data Flow](#11-data-flow)
12. [Privacy Model](#12-privacy-model)
13. [Output Package](#13-output-package)
14. [Technical Architecture](#14-technical-architecture)
15. [File Structure](#15-file-structure)
16. [Limitations & Non-Goals](#16-limitations--non-goals)
17. [Reference: Design Tokens](#17-reference-design-tokens)
18. [Glossary](#18-glossary)

---

## 1. What Is Shopify Guard

Shopify Guard is a free, privacy-first **preflight checker** for Shopify product CSVs. A merchant drops a supplier or exported CSV file, and within seconds sees:

- Every issue that could break the import
- Every issue that could silently overwrite live store data
- Every fix Autonom can safely apply
- Every issue that requires the merchant's own decision

The tool produces a corrected CSV plus a change log and a readiness report — delivered as a single ZIP download. It runs entirely in the browser. No account. No server. No upload.

---

## 2. Core Philosophy

### 2.1 The one-line thesis

> **A CSV can pass Shopify's syntax check and still wipe your prices, variants, or descriptions.**

Standard validators confirm format. Shopify Guard predicts **consequence**.

### 2.2 Three principles that shape every decision

**Principle 1 — Autonom does not invent data.**
If a value is missing, ambiguous, or requires knowledge of the merchant's live store, we **flag it** — we do not guess. We never fill in a price, a SKU, a handle, or a status we cannot verify.

**Principle 2 — Three classes of fixes, never two.**
Every issue falls into exactly one of: **safe automatic**, **review required**, or **never**. There is no fourth category and no blurring between them.

**Principle 3 — Honesty over polish.**
If a file has misaligned rows, we skip checks that would otherwise lie. If 15 out of 16 updates would be lost by removing a column, we say so instead of removing it anyway. Every report names its own limitations.

---

## 3. Target User

**Primary:** Shopify merchants running 50–2,000 SKUs who import supplier CSVs at least monthly.

**Secondary:** E-commerce agencies managing multiple client stores.

**Anti-persona:** Enterprise merchants with dedicated data teams, or anyone who has never done a CSV import.

### What they care about

- Not breaking their live catalog
- Not spending hours fixing a broken import
- Trusting that the tool didn't send their data anywhere
- Understanding exactly what changed

---

## 4. The Problem It Solves

Shopify's CSV importer is designed to **update** existing products. That's what makes it useful. It's also what makes it dangerous.

Three specific failure modes drive the entire product:

### 4.1 Destructive blanks

If a column is included in the CSV, a **blank cell** is treated by Shopify as an intentional overwrite. A supplier CSV that includes a `Variant Price` column but leaves 40% of its cells empty will **clear prices** on matching products.

### 4.2 Silent variant collapse

If a single-variant product has multiple image rows but lacks the `Option1 Name` / `Option1 Value` declaration, Shopify tries to create duplicate "Default Title" variants and **silently drops** the extras — or rejects the whole file.

### 4.3 Handle collisions

Two different products with the same `Handle` cause Shopify to **merge** them — usually by overwriting one with the other. The merchant only discovers the loss days later.

None of these are caught by a syntax validator. All three are caught by Shopify Guard.

---

## 5. Feature Overview

### 5.1 Detection

- **30+ validation rules** across 8 categories
- **Three severity levels** (critical, warning, info)
- **Row-level detail** with a "show in context" view
- **File-level metadata** (encoding, BOM, size, row count)

### 5.2 Repair

- **5 safe automatic fixes** applied without asking
- **6 review-required fixes** behind opt-in checkboxes
- **Full diff preview** showing before/after for every change
- **Change log** in plain-language CSV

### 5.3 Automation

- **Mode auto-detection** (new products vs. existing products)
- **Row classification** (image row vs. variant row vs. primary row)
- **Two-tier column-removal threshold** (only offer it when 30%+ of cells are blank)

### 5.4 Packaging

- **Single ZIP download** containing corrected CSV, change log, readiness report, and README
- **HTML readiness report** suitable for sharing or archiving

### 5.5 Privacy

- **Zero network uploads** during processing
- **Live network monitor** using PerformanceObserver
- **No account, no cookies, no tracking of file contents**

---

## 6. Complete Rule Catalog

### 6.1 Critical rules

These issues will break the import or cause silent data loss.

| Code | Title | Detect | Fix class |
|---|---|---|---|
| `TITLE_MISSING` | Title missing on first row of a product | Per-handle check | Never |
| `HANDLE_MISSING_UPDATE` | Row has no handle in existing-product mode | Per-row | Never |
| `HANDLE_DUPLICATE_IN_FILE` | Same handle with different titles | Per-handle group | Never |
| `SKU_DUPLICATE_IN_FILE` | Same SKU across different products | Global SKU map | Review |
| `DESTRUCTIVE_BLANK_INCLUDED_COLUMN` | Blank cells in sensitive included columns | Row-classified | Review* |
| `VARIANT_ORPHANED` | Variant row without a parent handle | Per-row | Never |
| `VARIANT_OPTION_NAME_INCONSISTENT` | Same handle, different option names across rows | Per-handle group | Never |
| `VARIANT_DUPLICATE_OPTION_COMBINATION` | Two rows share the same option values | Per-handle group | Never |
| `VARIANT_PARTIAL_COLLAPSE` | Option name without value (or vice versa) | Per-row | Never |
| `VARIANT_COLUMN_INCONSISTENCY` | Some variant rows fill an option column, others don't | Per-handle group | Never |
| `IMAGE_ROW_VARIANT_DATA` | Image row contains data that should be blank | Row-classified | Review |
| `SINGLE_VARIANT_MULTIPLE_IMAGES` | Single-variant product with images but no `Option1` | Per-handle group | Review |
| `COMPARE_AT_PRICE_LOWER_THAN_PRICE` | `Variant Compare At Price` ≤ `Variant Price` | Per-handle first row | Never |
| `HEADER_REQUIRED_MISSING` | Required column missing (new-product mode only) | Header scan | Never |
| `HEADER_DUPLICATE` | Same column header appears twice | Header scan | Review |

*Only offered as a repair when 30%+ of relevant cells are blank. Otherwise flagged as critical but not fixed.

### 6.2 Warning rules

These issues degrade quality or consistency.

| Code | Title | Detect | Fix class |
|---|---|---|---|
| `ENCODING_BOM_PRESENT` | File starts with UTF-8 BOM | Byte scan | Safe |
| `ENCODING_NOT_UTF8` | File is not UTF-8 | Byte scan | Safe |
| `SMART_QUOTES_DETECTED` | Curly quotes, dashes, ellipses present | Cell scan | Safe |
| `CELL_WHITESPACE` | Leading/trailing spaces in text cells | Cell scan | Safe |
| `SKU_WHITESPACE` | SKUs contain hidden spaces | Cell scan | Safe |
| `HANDLE_FORMAT_INVALID` | Handle has uppercase, spaces, underscores, accents | Regex | Safe |
| `HANDLE_MISSING_NEW` | Blank handle in new-product mode | Per-row | Review |
| `PRICE_CURRENCY_SYMBOL` | Price cell contains `$`, `€`, etc. | Cell scan | Safe |
| `PRICE_DECIMAL_COMMA` | Price uses `19,99` European format | Cell scan | Review |
| `PRICE_NON_NUMERIC` | Price cannot be parsed | Cell scan | Never |
| `PRICE_NEGATIVE` | Price is negative | Cell scan | Never |
| `INVENTORY_NON_INTEGER` | Inventory is not a whole number | Cell scan | Never |
| `INVENTORY_NEGATIVE` | Inventory is negative | Cell scan | Never |
| `INVENTORY_TRACKER_MISSING` | Qty set but tracker blank | Per-row | Never |
| `INVENTORY_QTY_MISSING_WITH_TRACKER` | Tracker set but qty blank | Per-row | Review |
| `BOOLEAN_FORMAT` | `yes`/`no`/`1`/`0` instead of `TRUE`/`FALSE` | Cell scan | Safe |
| `HTML_UNCLOSED_TAG` | Unbalanced HTML in description | Tag stack | Review |
| `HTML_DANGEROUS_ATTRIBUTE` | `<script>` etc. in description | Regex | Never |
| `IMAGE_URL_NOT_HTTPS` | Image URL uses `http://` | Regex | Review |
| `IMAGE_URL_NO_EXTENSION` | URL path lacks image extension | URL parse | Never |
| `IMAGE_URL_PRIVATE_CDN` | URL points to localhost/private IP | URL parse | Never |
| `IMAGE_URL_MALFORMED` | URL cannot be parsed | URL parse | Never |
| `STATUS_INVALID_VALUE` | Status is not `active`/`draft`/`archived` | Cell scan | Never |
| `DUPLICATE_IMAGE_ROWS` | Same image URL on multiple image-only rows | Per-handle group | Safe |

### 6.3 Info rules

Contextual observations that don't block the import.

| Code | Title | Detect |
|---|---|---|
| `FILE_SIZE_APPROACHING_LIMIT` | File is 12–15 MB | Byte size |
| `FILE_SIZE_OVER_LIMIT` | File exceeds 15 MB | Byte size |
| `PRODUCT_CATEGORY_FORMAT` | Category doesn't match Shopify taxonomy format | Regex |
| `ROW_ORDER_WARNING` | Variant rows are scattered rather than grouped | Handle order scan |
| `FIELD_COUNT_MISMATCH` | Row has different field count than header | Parser errors |
| `DESTRUCTIVE_BLANK_ALL_ROWS` | Entire column is blank | Row classification |

### 6.4 Severity decision rule

When adding a new rule, classify by asking:

1. **Will this cause the import to fail?** → Critical
2. **Could this change existing store data unexpectedly?** → Critical
3. **Is this a quality/consistency issue?** → Warning
4. **Is this just useful context?** → Info

---

## 7. The Three Repair Classes

Every fixable issue falls into exactly one class. This is not a preference — it is a rule.

### 7.1 Safe automatic

Applied without asking. Deterministic. No knowledge of the merchant's store required.

**Rules:** BOM removal, encoding conversion, smart-quote replacement, whitespace trim, currency symbol strip, boolean normalization, extended handle normalization, duplicate image row removal.

**Why no checkbox:** These are objective corrections. A checkbox adds clicks and enables accidental disable. The diff preview on the export screen is the transparency layer.

### 7.2 Review required

Applied only with explicit opt-in. Shown with a checkbox, checked by default.

**Rules:** Handle generation from Title, HTTPS upgrade, HTML tag repair, comma-decimal conversion, image row cleanup, single-variant Option1 declaration, inventory qty default to 0, duplicate SKU suffixing.

**Why a checkbox:** The merchant may have context we don't. A handle generation might collide with their naming convention. HTTPS upgrade might break a legacy server.

### 7.3 Never automatic

Flagged as critical but never changed. The merchant must fix it in their source file.

**Rules:** Missing Title, missing handle, missing SKU, invalid price, negative inventory, private CDN image URLs, dangerous HTML, duplicate option combinations, compare-at price logic, orphaned variants.

**Why:** We do not invent data. We do not guess intent. We do not silently delete or modify anything we cannot verify.

### 7.4 The threshold rule for destructive blanks

When an included column has blanks, we compute:
