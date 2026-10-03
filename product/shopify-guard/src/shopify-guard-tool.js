/* ============================================================================
   AUTONOM SHOPIFY GUARD — Client-side engine v2.0.1
   Batch Mode + Column Mapping + Comparison Mode
   All processing is local. No file contents are transmitted.
   ========================================================================= */

(function () {
  'use strict';

  const LOG = (...a) => console.log('[Autonom SG]', ...a);

  const KNOWN_COLUMNS = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags',
    'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
    'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Grams',
    'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy',
    'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
    'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode', 'Image Src',
    'Image Position', 'Image Alt Text', 'Gift Card', 'SEO Title', 'SEO Description',
    'Google Shopping / Google Product Category', 'Google Shopping / Gender',
    'Google Shopping / Age Group', 'Google Shopping / MPN',
    'Google Shopping / AdWords Grouping', 'Google Shopping / AdWords Labels',
    'Google Shopping / Condition', 'Google Shopping / Custom Product',
    'Google Shopping / Custom Label 0', 'Google Shopping / Custom Label 1',
    'Google Shopping / Custom Label 2', 'Google Shopping / Custom Label 3',
    'Google Shopping / Custom Label 4', 'Variant Image', 'Variant Weight Unit',
    'Variant Tax Code', 'Cost per item', 'Status'
  ];
  const REQUIRED_COLUMNS_NEW = ['Handle', 'Title'];
  const SENSITIVE_COLUMNS = [
    'Variant Price', 'Variant Compare At Price', 'Variant Inventory Qty',
    'Vendor', 'Type', 'Tags', 'Body (HTML)', 'Published', 'Status', 'Product Category'
  ];
  const PRODUCT_LEVEL_COLUMNS = ['Vendor', 'Type', 'Tags', 'Body (HTML)', 'Published', 'Status', 'Product Category', 'Title'];
  const TEXT_COLUMNS_FOR_WHITESPACE = [
    'Handle', 'Title', 'Vendor', 'Type', 'Product Category', 'Tags',
    'Variant SKU', 'Variant Barcode', 'SEO Title', 'SEO Description', 'Status'
  ];
  const BOOLEAN_COLUMNS = ['Published', 'Variant Requires Shipping', 'Variant Taxable', 'Gift Card'];
  const TRUE_VALUES = ['true', 'yes', 'y', '1', 'on'];
  const FALSE_VALUES = ['false', 'no', 'n', '0', 'off'];
  const SHOPIFY_DOC_URL = 'https://help.shopify.com/en/manual/products/import-export/using-csv';
  const FILE_SIZE_WARNING_BYTES = 12 * 1024 * 1024;
  const FILE_SIZE_LIMIT_BYTES = 15 * 1024 * 1024;
  const SPLIT_TARGET_BYTES = 14 * 1024 * 1024;
  const BLANK_COLUMN_REMOVAL_THRESHOLD = 0.3;

  const CURRENCY_SYMBOLS = /[$€£¥₹₽₩₪₺₴₦₱₡₲₵₸₼₾₿]/;
  const SMART_QUOTE_CHARS = /[\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u2039\u203A\u00AB\u00BB\u2013\u2014\u2026]/;
  const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|avif|svg|bmp|tiff?)(\?|#|$)/i;
  const PRIVATE_CDN_PATTERN = /(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\.|\.local\b|\.internal\b|\.lan\b|\.test\b)/i;
  const VARIANT_OPTION_COLUMNS = ['Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value'];

  const MAPPING_TARGETS = [
    { value: '', label: '(ignore this column)' },
    { value: 'Handle', label: 'Handle' },
    { value: 'Title', label: 'Title' },
    { value: 'Body (HTML)', label: 'Body (HTML)' },
    { value: 'Vendor', label: 'Vendor' },
    { value: 'Product Category', label: 'Product Category' },
    { value: 'Type', label: 'Type' },
    { value: 'Tags', label: 'Tags' },
    { value: 'Published', label: 'Published' },
    { value: 'Option1 Name', label: 'Option1 Name' },
    { value: 'Option1 Value', label: 'Option1 Value' },
    { value: 'Option2 Name', label: 'Option2 Name' },
    { value: 'Option2 Value', label: 'Option2 Value' },
    { value: 'Option3 Name', label: 'Option3 Name' },
    { value: 'Option3 Value', label: 'Option3 Value' },
    { value: 'Variant SKU', label: 'Variant SKU' },
    { value: 'Variant Grams', label: 'Variant Grams' },
    { value: 'Variant Inventory Tracker', label: 'Variant Inventory Tracker' },
    { value: 'Variant Inventory Qty', label: 'Variant Inventory Qty' },
    { value: 'Variant Inventory Policy', label: 'Variant Inventory Policy' },
    { value: 'Variant Fulfillment Service', label: 'Variant Fulfillment Service' },
    { value: 'Variant Price', label: 'Variant Price' },
    { value: 'Variant Compare At Price', label: 'Variant Compare At Price' },
    { value: 'Variant Requires Shipping', label: 'Variant Requires Shipping' },
    { value: 'Variant Taxable', label: 'Variant Taxable' },
    { value: 'Variant Barcode', label: 'Variant Barcode' },
    { value: 'Image Src', label: 'Image Src' },
    { value: 'Image Position', label: 'Image Position' },
    { value: 'Image Alt Text', label: 'Image Alt Text' },
    { value: 'Gift Card', label: 'Gift Card' },
    { value: 'SEO Title', label: 'SEO Title' },
    { value: 'SEO Description', label: 'SEO Description' },
    { value: 'Status', label: 'Status' }
  ];

  const COLUMN_MAPPING_DICTIONARY = {
    'handle': 'Handle', 'url handle': 'Handle', 'slug': 'Handle', 'url slug': 'Handle', 'url': 'Handle',
    'item name': 'Title', 'product name': 'Title', 'product title': 'Title', 'name': 'Title', 'item title': 'Title',
    'body': 'Body (HTML)', 'body html': 'Body (HTML)', 'description html': 'Body (HTML)', 'html description': 'Body (HTML)',
    'long description': 'Body (HTML)', 'product description': 'Body (HTML)',
    'vendor': 'Vendor', 'brand': 'Vendor', 'manufacturer': 'Vendor', 'supplier': 'Vendor', 'brand name': 'Vendor',
    'type': 'Type', 'product type': 'Type',
    'category': 'Product Category', 'product category': 'Product Category',
    'tags': 'Tags', 'keywords': 'Tags', 'labels': 'Tags',
    'published': 'Published', 'status': 'Status',
    'option1 name': 'Option1 Name', 'option1 value': 'Option1 Value',
    'option2 name': 'Option2 Name', 'option2 value': 'Option2 Value',
    'option3 name': 'Option3 Name', 'option3 value': 'Option3 Value',
    'sku': 'Variant SKU', 'sku code': 'Variant SKU', 'item code': 'Variant SKU', 'item number': 'Variant SKU',
    'product code': 'Variant SKU', 'product number': 'Variant SKU', 'article number': 'Variant SKU',
    'article code': 'Variant SKU', 'variant sku': 'Variant SKU',
    'weight': 'Variant Grams', 'grams': 'Variant Grams', 'weight in grams': 'Variant Grams',
    'inventory tracker': 'Variant Inventory Tracker', 'tracker': 'Variant Inventory Tracker',
    'qty': 'Variant Inventory Qty', 'quantity': 'Variant Inventory Qty', 'stock': 'Variant Inventory Qty',
    'on hand': 'Variant Inventory Qty', 'available': 'Variant Inventory Qty', 'inventory': 'Variant Inventory Qty',
    'inventory qty': 'Variant Inventory Qty', 'inventory quantity': 'Variant Inventory Qty',
    'stock quantity': 'Variant Inventory Qty', 'stock level': 'Variant Inventory Qty',
    'quantity available': 'Variant Inventory Qty',
    'inventory policy': 'Variant Inventory Policy', 'fulfillment service': 'Variant Fulfillment Service',
    'price': 'Variant Price', 'cost': 'Variant Price', 'item price': 'Variant Price', 'retail price': 'Variant Price',
    'unit price': 'Variant Price', 'sale price': 'Variant Price', 'selling price': 'Variant Price',
    'regular price': 'Variant Price', 'product price': 'Variant Price',
    'compare at price': 'Variant Compare At Price', 'compare price': 'Variant Compare At Price',
    'compare-at price': 'Variant Compare At Price', 'msrp': 'Variant Compare At Price',
    'list price': 'Variant Compare At Price', 'was price': 'Variant Compare At Price',
    'original price': 'Variant Compare At Price',
    'barcode': 'Variant Barcode', 'ean': 'Variant Barcode', 'upc': 'Variant Barcode',
    'gtin': 'Variant Barcode', 'isbn': 'Variant Barcode',
    'image': 'Image Src', 'image url': 'Image Src', 'image src': 'Image Src', 'photo': 'Image Src',
    'photo url': 'Image Src', 'picture': 'Image Src', 'picture url': 'Image Src', 'image link': 'Image Src',
    'main image': 'Image Src', 'product image': 'Image Src',
    'seo title': 'SEO Title', 'seo description': 'SEO Description',
    'meta title': 'SEO Title', 'meta description': 'SEO Description', 'page title': 'SEO Title'
  };

  const COMPARE_FIELD_CATEGORIES = {
    'Variant Price': { cat: 'price', label: 'price' },
    'Variant Compare At Price': { cat: 'price', label: 'compare-at price' },
    'Cost per item': { cat: 'price', label: 'cost' },
    'Variant Inventory Qty': { cat: 'inventory', label: 'inventory' },
    'Title': { cat: 'identity', label: 'title' },
    'Handle': { cat: 'identity', label: 'handle' },
    'Variant SKU': { cat: 'identity', label: 'SKU' },
    'Body (HTML)': { cat: 'content', label: 'description' },
    'SEO Title': { cat: 'content', label: 'SEO title' },
    'SEO Description': { cat: 'content', label: 'SEO description' },
    'Image Src': { cat: 'content', label: 'image' },
    'Vendor': { cat: 'metadata', label: 'vendor' },
    'Type': { cat: 'metadata', label: 'type' },
    'Tags': { cat: 'metadata', label: 'tags' },
    'Published': { cat: 'metadata', label: 'published status' },
    'Status': { cat: 'metadata', label: 'status' },
    'Product Category': { cat: 'metadata', label: 'category' }
  };

  const ISSUE_GUIDES = {
    TITLE_MISSING: { what: 'A product row has no Title.', why: 'Shopify requires a Title to create or update a product. Without it, the row is rejected.', action: 'Add a Title to the first row of each product.' },
    HANDLE_MISSING_UPDATE: { what: 'Rows have no handle, so Shopify cannot match them to existing products.', why: 'Shopify matches rows by Handle in update mode. Without one, the row may create a new product.', action: 'Add the handle column and verify each row.' },
    HANDLE_DUPLICATE_IN_FILE: { what: 'The same handle appears on multiple rows with different titles.', why: 'Shopify may merge these into one product, overwriting fields unpredictably.', action: 'If they are variants, use the same Title. If different products, use unique handles.' },
    SKU_DUPLICATE_IN_FILE: { what: 'The same SKU appears on rows for different products.', why: 'Shopify may merge the products, or the import may fail.', action: 'Assign a unique SKU to each product and variant.' },
    VARIANT_ORPHANED: { what: 'A row has variant data but no Handle.', why: 'Shopify cannot attach this variant to a product.', action: 'Copy the parent product\'s Handle into the missing cells.' },
    VARIANT_OPTION_NAME_INCONSISTENT: { what: 'Variant rows for the same product use different option names.', why: 'Shopify cannot resolve variant relationships.', action: 'Use the same option name for every variant row of the same product.' },
    VARIANT_DUPLICATE_OPTION_COMBINATION: { what: 'The same option combination appears on multiple rows of the same product.', why: 'Shopify treats each combination as a unique variant. Duplicates cause it to silently drop one.', action: 'Remove the duplicate row, or change its option values so each combination is unique.' },
    VARIANT_PARTIAL_COLLAPSE: { what: 'A row has an option name without a value, or a value without a name.', why: 'Shopify needs both. An incomplete option pair can collapse the product.', action: 'Fill in both the Name and Value.' },
    VARIANT_COLUMN_INCONSISTENCY: { what: 'Some variant rows fill an option column while others leave it blank.', why: 'Shopify expects every variant row of a product to fill the same option columns.', action: 'Fill the same option columns on every variant row.' },
    IMAGE_ROW_VARIANT_DATA: { what: 'Image-only rows contain variant data.', why: 'Shopify expects image rows to have only Handle and Image Src.', action: 'Autonom can clear all columns except Handle and Image Src on these rows.' },
    SINGLE_VARIANT_MULTIPLE_IMAGES: { what: 'A single-variant product has multiple images but no Option1 declaration.', why: 'Shopify needs Option1 Name="Title" and Option1 Value="Default Title" on the parent row.', action: 'Autonom can set the Title option on the parent row.' },
    COMPARE_AT_PRICE_LOWER_THAN_PRICE: { what: 'A product\'s Compare At Price is lower than or equal to its Price.', why: 'Shopify rejects this or shows an incorrect sale badge.', action: 'Set the Compare At Price higher than the Price, or clear it.' },
    DESTRUCTIVE_BLANK_INCLUDED_COLUMN: { what: 'An included column has blank cells.', why: 'Shopify treats blank cells in included columns as intentional overwrites.', action: 'Either remove the column, or fill in the blank cells.' },
    DESTRUCTIVE_BLANK_ALL_ROWS: { what: 'An included column is entirely blank.', why: 'This column has no effect.', action: 'Autonom can remove this column.' },
    HANDLE_FORMAT_INVALID: { what: 'A handle uses characters Shopify doesn\'t accept.', why: 'Non-standard handles may cause URL issues.', action: 'Autonom can normalize the handle.' },
    HANDLE_MISSING_NEW: { what: 'New-product rows have no handle.', why: 'Shopify needs a handle to create the product URL.', action: 'Autonom can generate handles from the product titles.' },
    DUPLICATE_IMAGE_ROWS: { what: 'An image row repeats an image URL already used for the same product.', why: 'Shopify may attach the image multiple times, or reject the row.', action: 'Autonom can remove the duplicate rows.' },
    INVENTORY_QTY_MISSING_WITH_TRACKER: { what: 'A row has an inventory tracker but no quantity.', why: 'Shopify requires a quantity when a tracker is set.', action: 'Autonom can set the missing quantity to 0.' },
    INVENTORY_TRACKER_MISSING: { what: 'A row has an inventory quantity but no tracker.', why: 'Shopify silently ignores inventory updates when no tracker is specified.', action: 'Set Variant Inventory Tracker to "shopify".' },
    BOOLEAN_FORMAT: { what: 'Boolean columns use non-standard values.', why: 'Shopify expects exactly TRUE or FALSE.', action: 'Autonom can normalize these to TRUE or FALSE.' },
    PRODUCT_CATEGORY_FORMAT: { what: 'Product Category values don\'t match Shopify\'s taxonomy format.', why: 'Shopify expects a full breadcrumb or a category ID.', action: 'Use Shopify\'s category picker and export one product to see the format.' },
    PRICE_CURRENCY_SYMBOL: { what: 'Price cells contain currency symbols.', why: 'Shopify expects a plain number.', action: 'Autonom can strip currency symbols.' },
    PRICE_DECIMAL_COMMA: { what: 'Prices use a comma as the decimal separator.', why: 'Shopify expects a dot.', action: 'Autonom can convert comma decimals to dots.' },
    PRICE_NON_NUMERIC: { what: 'Price cells could not be parsed as numbers.', why: 'Shopify rejects or ignores rows with unparseable prices.', action: 'Enter a plain numeric value (e.g. 19.99).' },
    PRICE_NEGATIVE: { what: 'Price cells are negative.', why: 'Shopify may reject the row.', action: 'Confirm the value is intentional, or correct it.' },
    INVENTORY_NON_INTEGER: { what: 'Inventory values are not whole numbers.', why: 'Shopify expects integers.', action: 'Enter a whole number.' },
    INVENTORY_NEGATIVE: { what: 'Inventory values are negative.', why: 'Shopify may reject or misinterpret them.', action: 'Confirm the value is intentional, or correct it.' },
    HTML_UNCLOSED_TAG: { what: 'Descriptions contain unclosed HTML tags.', why: 'Unclosed tags may break the storefront layout.', action: 'Autonom can attempt to repair the tags.' },
    HTML_DANGEROUS_ATTRIBUTE: { what: 'Descriptions contain tags that can execute code.', why: 'Shopify may block the row.', action: 'Remove the tag.' },
    IMAGE_URL_NOT_HTTPS: { what: 'Image URLs use http://.', why: 'Shopify requires HTTPS for product images.', action: 'Autonom can upgrade to https://.' },
    IMAGE_URL_NO_EXTENSION: { what: 'Image URLs don\'t end in an image extension.', why: 'Shopify may not be able to download the image.', action: 'Use direct URLs ending in .jpg, .png, .webp, or .gif.' },
    IMAGE_URL_PRIVATE_CDN: { what: 'Image URLs point to localhost or a private IP.', why: 'Shopify can\'t reach these URLs from its servers.', action: 'Host the images on a public CDN.' },
    IMAGE_URL_MALFORMED: { what: 'Image URLs could not be parsed.', why: 'Shopify can\'t download malformed URLs.', action: 'Verify the URL starts with https:// and is complete.' },
    STATUS_INVALID_VALUE: { what: 'Status values are not "active", "draft", or "archived".', why: 'Shopify may reject the row.', action: 'Use one of the three valid status values.' },
    ENCODING_BOM_PRESENT: { what: 'The file starts with a hidden byte-order mark.', why: 'Shopify may read the first column header incorrectly.', action: 'Autonom can strip the BOM.' },
    ENCODING_NOT_UTF8: { what: 'The file uses a non-UTF-8 encoding.', why: 'Special characters may display incorrectly.', action: 'Autonom can convert the file to UTF-8.' },
    SMART_QUOTES_DETECTED: { what: 'The file contains curly quotes, en-dashes, or ellipses.', why: 'Shopify expects straight quotes.', action: 'Autonom can convert them to straight quotes.' },
    CELL_WHITESPACE: { what: 'Text cells have leading or trailing spaces.', why: 'Hidden spaces create duplicate tags and broken URLs.', action: 'Autonom can trim whitespace.' },
    SKU_WHITESPACE: { what: 'SKUs contain hidden spaces.', why: 'Whitespace breaks matching against existing records.', action: 'Autonom can trim SKUs.' },
    HEADER_REQUIRED_MISSING: { what: 'A column Shopify requires is missing.', why: 'Shopify will reject the import entirely.', action: 'Add the missing column and re-export.' },
    HEADER_DUPLICATE: { what: 'The same column header appears more than once.', why: 'Shopify uses only one of the duplicates.', action: 'Remove the duplicate column.' },
    HEADER_UNKNOWN_COLUMN: { what: 'The file has a column outside Shopify\'s schema.', why: 'Shopify will ignore the column.', action: 'Verify the column is intentional, or remove it.' },
    FILE_SIZE_APPROACHING_LIMIT: { what: 'The file is approaching Shopify\'s 15 MB limit.', why: 'Files over 15 MB are rejected.', action: 'Consider splitting the file.' },
    FILE_SIZE_OVER_LIMIT: { what: 'The file exceeds Shopify\'s 15 MB limit.', why: 'The import will fail before Shopify reads any rows.', action: 'Autonom can split the file into multiple parts.' },
    ROW_ORDER_WARNING: { what: 'Variant rows for the same product are scattered.', why: 'Image and option association may be affected.', action: 'Sort the file by Handle before importing.' },
    FIELD_COUNT_MISMATCH: { what: 'Some rows have a different number of columns than the header.', why: 'Unquoted commas in Tags or Body HTML may have shifted data.', action: 'Re-export the file with proper quoting.' },
    DELIMITER_NOT_COMMA: { what: 'The file uses a delimiter other than comma.', why: 'Shopify expects comma-separated values.', action: 'Autonom can convert the file to comma-delimited.' },
    DUPLICATE_IDENTICAL_ROWS: { what: 'Two or more rows are identical.', why: 'This usually indicates an accidental duplicate paste.', action: 'Autonom can remove the duplicate rows.' }
  };

  const state = {
    files: [],
    currentFileIndex: 0,
    batchMode: null,
    batchDetectedMode: null,
    batchDetectedConfidence: null,
    batchDetectedReason: '',

    pendingMappingIndices: [],
    currentMappingIndex: 0,
    mappingDraft: {},

    compareMode: false,
    compareStoreFile: null,
    compareUpdateFile: null,
    compareResult: null,

    file: null, fileName: '', fileSize: 0, fileText: '',
    hasBOM: false, detectedEncoding: 'UTF-8',
    detectedDelimiter: ',',
    headers: [], rows: [], mode: null,
    detectedMode: null, detectedConfidence: null, detectedReason: '',
    result: null, repairs: null, acceptedRepairs: {},
    correctedCSV: null, changeLog: null, appliedCodes: null,
    splitParts: null,
    showRowContext: {},
    diffViewMode: 'detailed',
    parseFieldMismatches: 0,
    networkStats: { files: 0, bytes: 0, requests: 0 }
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toHandle(t) {
    return String(t || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[ß]/g, 'ss').replace(/[æ]/g, 'ae').replace(/[ø]/g, 'o')
      .replace(/[đ]/g, 'd').replace(/[ł]/g, 'l')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function isBlank(v) { return v == null || String(v).trim() === ''; }
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  function pcount(n, singular, pluralForm) {
    const p = pluralForm || (singular + 's');
    if (n === 0) return 'No ' + p;
    return n + ' ' + (n === 1 ? singular : p);
  }

  function applied(n, singular, pluralForm) {
    const p = pluralForm || (singular + 's');
    if (n === 0) return 'No ' + p + ' needed';
    return n + ' ' + (n === 1 ? singular : p) + ' applied';
  }

  function v(n, singularVerb, pluralVerb) {
    return n === 1 ? singularVerb : pluralVerb;
  }

  function normalizeBoolean(val) {
    const lower = String(val).trim().toLowerCase();
    if (TRUE_VALUES.indexOf(lower) !== -1) return 'TRUE';
    if (FALSE_VALUES.indexOf(lower) !== -1) return 'FALSE';
    return null;
  }

  function isValidCategoryFormat(val) {
    if (isBlank(val)) return true;
    const s = String(val).trim();
    if (/^gid:\/\/shopify\//i.test(s)) return true;
    if (/[>»›]/.test(s)) return true;
    if (/^[a-z]{2}(-[a-z0-9]+)+$/i.test(s)) return true;
    return false;
  }

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function repairHTML(html) {
    let out = String(html);
    out = out.replace(/<p>([\s\S]*?)<\/div>/gi, '<p>$1</p>');
    out = out.replace(/<p>([\s\S]*?)<\/span>/gi, '<p>$1</p>');
    out = out.replace(/<b>([\s\S]*?)<\/i>/gi, '<b>$1</b>');
    out = out.replace(/<i>([\s\S]*?)<\/b>/gi, '<i>$1</i>');
    out = out.replace(/<strong>([\s\S]*?)<\/em>/gi, '<strong>$1</strong>');
    out = out.replace(/<em>([\s\S]*?)<\/strong>/gi, '<em>$1</em>');
    out = out.replace(/<\/(div|span|p|b|i|strong|em)>(?![^<]*<\1>)/gi, '');
    const stack = [];
    const re = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
    let m;
    while ((m = re.exec(out)) !== null) {
      const full = m[0], tag = m[1].toLowerCase();
      if (/^<\//.test(full)) {
        if (stack.length && stack[stack.length - 1] === tag) stack.pop();
      } else if (!/\/>$/.test(full)) stack.push(tag);
    }
    while (stack.length) out += '</' + stack.pop() + '>';
    return out;
  }

  function smartQuotesToStraight(text) {
    return String(text)
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u00AB\u2039]/g, '"')
      .replace(/[\u00BB\u203A]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2026/g, '...');
  }

  function stripCurrencySymbols(text) {
    return String(text).replace(CURRENCY_SYMBOLS, '').replace(/\s+/g, '').trim();
  }

  function analyzePrice(raw) {
    if (raw == null) return { value: NaN, parseable: false };
    let s = String(raw).trim();
    if (s === '') return { value: NaN, parseable: false, empty: true };
    const hasCurrency = CURRENCY_SYMBOLS.test(s);
    s = stripCurrencySymbols(s);
    let commaDecimal = false;
    if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) { s = s.replace(/\./g, '').replace(',', '.'); commaDecimal = true; }
    else if (/^\d+,\d{1,2}$/.test(s)) { s = s.replace(',', '.'); commaDecimal = true; }
    else if (/^\d+,\d{3}$/.test(s)) { s = s.replace(',', ''); }
    s = s.replace(/\s+/g, '');
    const n = Number(s);
    return { value: n, parseable: !isNaN(n) && isFinite(n), commaDecimal, hasCurrency, normalized: s };
  }

  function makeUniqueSku(base, usedSet) {
    if (!usedSet.has(base)) { usedSet.add(base); return base; }
    let n = 2;
    while (usedSet.has(base + '-' + n)) n++;
    const sku = base + '-' + n;
    usedSet.add(sku);
    return sku;
  }

  function hashHeaders(headers) {
    return headers.map(h => String(h == null ? '' : h).trim().toLowerCase()).sort().join('|');
  }

  function loadSavedMapping(headers) {
    try {
      const key = 'autonom_mapping_v1_' + hashHeaders(headers);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (e) { return null; }
  }

  function saveMapping(headers, mapping) {
    try {
      const key = 'autonom_mapping_v1_' + hashHeaders(headers);
      localStorage.setItem(key, JSON.stringify(mapping));
    } catch (e) { LOG('Could not save mapping', e); }
  }

  function suggestMapping(headers) {
    const suggestions = {};
    headers.forEach(h => {
      const key = String(h == null ? '' : h).trim().toLowerCase();
      if (COLUMN_MAPPING_DICTIONARY[key]) {
        suggestions[h] = COLUMN_MAPPING_DICTIONARY[key];
      }
    });
    return suggestions;
  }

  function needsMappingForFile(fileIdx) {
    const f = state.files[fileIdx];
    if (!f) return false;
    if (f.mapped) return false;
    const lower = f.headers.map(h => String(h == null ? '' : h).trim().toLowerCase());
    const required = f.mode === 'new_products' ? REQUIRED_COLUMNS_NEW : ['Handle'];
    const missingRequired = required.some(req => lower.indexOf(req.toLowerCase()) === -1);
    const knownLower = KNOWN_COLUMNS.map(c => c.toLowerCase());
    let unknownCount = 0;
    f.headers.forEach(h => {
      const hl = String(h == null ? '' : h).trim().toLowerCase();
      if (!hl) return;
      if (knownLower.indexOf(hl) === -1 && !/^Metafield:|^mf_|^Google Shopping|^Cost per item|^Variant Inventory/.test(h)) {
        unknownCount++;
      }
    });
    return missingRequired || unknownCount >= 3;
  }

  function applyMappingToFile(fileIdx, mapping) {
    const f = state.files[fileIdx];
    if (!f) return;
    applyMappingToFileData(f, mapping);
  }

  function applyMappingToFileData(f, mapping) {
    if (!f) return;
    const oldHeaders = f.headers.slice();
    const newHeaders = [];
    const headerMap = {};
    oldHeaders.forEach(h => {
      if (Object.prototype.hasOwnProperty.call(mapping, h) && mapping[h] === '') {
        headerMap[h] = null;
      } else {
        const target = mapping[h] || h;
        newHeaders.push(target);
        headerMap[h] = target;
      }
    });
    const newRows = f.rows.map(row => {
      const newRow = {};
      oldHeaders.forEach(h => {
        if (headerMap[h] === null) return;
        newRow[headerMap[h]] = row[h];
      });
      return newRow;
    });
    f.headers = newHeaders;
    f.rows = newRows;
    f.mapped = true;
    f.mapping = Object.assign({}, mapping);
  }

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

  function convertDelimiter(text, from, to) {
    const rows = [];
    let cur = '', row = [], inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else cur += c;
      } else {
        if (c === '"') { inQuotes = true; cur += c; }
        else if (c === from) { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else if (c === '\r') { /* skip */ }
        else cur += c;
      }
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    const escape = val => {
      const s = val == null ? '' : String(val);
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    return rows.map(r => r.map(escape).join(to)).join('\n');
  }

  function classifyRows() {
    const byHandle = {};
    state.rows.forEach((row, i) => {
      const h = row['Handle'];
      if (isBlank(h)) return;
      if (!byHandle[h]) byHandle[h] = [];
      byHandle[h].push(i);
    });

    const isImage = new Array(state.rows.length).fill(false);
    const isPrimary = new Array(state.rows.length).fill(false);
    const isVariant = new Array(state.rows.length).fill(false);

    Object.keys(byHandle).forEach(h => {
      const indices = byHandle[h];
      let primarySet = false;
      indices.forEach(idx => {
        const row = state.rows[idx];
        const hasSku = !isBlank(row['Variant SKU']);
        const hasPrice = !isBlank(row['Variant Price']);
        const hasOpt = !isBlank(row['Option1 Value']);
        const hasTitle = !isBlank(row['Title']);
        const hasImage = !isBlank(row['Image Src']);

        if (hasSku || hasPrice || hasOpt) {
          isVariant[idx] = true;
          if (!primarySet) { isPrimary[idx] = true; primarySet = true; }
        } else if (hasImage && !hasTitle) {
          isImage[idx] = true;
        } else if (hasTitle) {
          if (!primarySet) { isPrimary[idx] = true; primarySet = true; }
          else isVariant[idx] = true;
        } else {
          isVariant[idx] = true;
        }
      });
    });

    return { isImage, isPrimary, isVariant };
  }

  function detectImageRows() {
    const byHandle = {};
    state.rows.forEach((row, i) => {
      const h = row['Handle'];
      if (isBlank(h)) return;
      if (!byHandle[h]) byHandle[h] = [];
      byHandle[h].push({ idx: i, row });
    });

    const products = {};
    Object.keys(byHandle).forEach(h => {
      const entries = byHandle[h];
      const variantIdxs = [];
      const imageIdxs = [];

      entries.forEach(e => {
        const r = e.row;
        const hasSku = !isBlank(r['Variant SKU']);
        const hasPrice = !isBlank(r['Variant Price']);
        const hasOptionValue = !isBlank(r['Option1 Value']);
        const hasTitle = !isBlank(r['Title']);
        const hasImage = !isBlank(r['Image Src']);

        if (hasSku || hasPrice || hasOptionValue) variantIdxs.push(e.idx);
        else if (hasImage && !hasTitle) imageIdxs.push(e.idx);
      });

      if (imageIdxs.length > 0) {
        products[h] = {
          parentIdx: variantIdxs.length > 0 ? variantIdxs[0] : entries[0].idx,
          imageIdxs,
          variantIdxs
        };
      }
    });
    return products;
  }

  function imageRowsWithExtraData() {
    const products = detectImageRows();
    const results = [];
    const cols = ['Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Option1 Name', 'Option1 Value', 'Variant SKU', 'Variant Price', 'Variant Compare At Price', 'Variant Inventory Qty', 'Status'];

    Object.keys(products).forEach(h => {
      products[h].imageIdxs.forEach(idx => {
        const row = state.rows[idx];
        const dirty = [];
        cols.forEach(c => {
          if (state.headers.indexOf(c) !== -1 && !isBlank(row[c])) dirty.push(c);
        });
        if (dirty.length > 0) results.push({ handle: h, row: idx + 2, columns: dirty });
      });
    });
    return results;
  }

  function singleVariantMultipleImages() {
    const products = detectImageRows();
    const results = [];
    Object.keys(products).forEach(h => {
      const p = products[h];
      if (p.variantIdxs.length !== 1) return;
      const parent = state.rows[p.parentIdx];
      if (isBlank(parent['Option1 Name']) && isBlank(parent['Option1 Value'])) {
        results.push({ handle: h, row: p.parentIdx + 2, imageCount: p.imageIdxs.length });
      }
    });
    return results;
  }

  function duplicateImageRows() {
    const byHandle = {};
    state.rows.forEach((row, i) => {
      const h = row['Handle'];
      const img = row['Image Src'];
      if (isBlank(h) || isBlank(img)) return;
      if (!byHandle[h]) byHandle[h] = [];
      byHandle[h].push({ idx: i, img: String(img).trim() });
    });

    const dupes = [];
    Object.keys(byHandle).forEach(h => {
      const entries = byHandle[h];
      const seen = {};
      entries.forEach(e => {
        const row = state.rows[e.idx];
        if (!isBlank(row['Variant SKU']) || !isBlank(row['Variant Price'])) return;
        if (!isBlank(row['Title'])) return;
        if (seen[e.img]) dupes.push({ handle: h, row: e.idx + 2, duplicateOf: seen[e.img] + 2, url: e.img });
        else seen[e.img] = e.idx;
      });
    });
    return dupes;
  }

  function duplicateIdenticalRows() {
    const sigs = {};
    const results = [];
    state.rows.forEach((row, i) => {
      const parts = state.headers.map(h => String(row[h] == null ? '' : row[h]).trim()).join('\u0001');
      if (parts.replace(/\u0001/g, '') === '') return;
      if (!sigs[parts]) sigs[parts] = [];
      sigs[parts].push(i);
    });
    Object.keys(sigs).forEach(sig => {
      const idxs = sigs[sig];
      if (idxs.length > 1) {
        for (let k = 1; k < idxs.length; k++) {
          const row = state.rows[idxs[k]];
          results.push({
            row: idxs[k] + 2,
            handle: row['Handle'] || '(no handle)',
            title: row['Title'] || '(no title)',
            originalRow: idxs[0] + 2
          });
        }
      }
    });
    return results;
  }

  function rowTypes_isImageRow(row) {
    if (isBlank(row['Image Src'])) return false;
    if (!isBlank(row['Title'])) return false;
    if (!isBlank(row['Variant SKU'])) return false;
    if (!isBlank(row['Variant Price'])) return false;
    if (!isBlank(row['Option1 Value'])) return false;
    return true;
  }

  function splitRowsIntoChunks(rows, headers, targetBytes, baseName) {
    const TARGET = targetBytes || SPLIT_TARGET_BYTES;

    function renderChunk(subset) {
      if (typeof Papa !== 'undefined' && Papa.unparse) {
        return Papa.unparse({
          fields: headers,
          data: subset.map(r => headers.map(h => r[h] == null ? '' : r[h]))
        }, { quotes: true });
      }
      const escape = val => {
        const s = val == null ? '' : String(val);
        if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      };
      const lines = [headers.map(escape).join(',')];
      subset.forEach(r => lines.push(headers.map(h => escape(r[h])).join(',')));
      return lines.join('\n');
    }

    const groups = [];
    const handleGroups = new Map();
    rows.forEach((row, idx) => {
      const h = row['Handle'];
      if (isBlank(h)) { groups.push([idx]); return; }
      if (!handleGroups.has(h)) {
        const group = [];
        handleGroups.set(h, group);
        groups.push(group);
      }
      handleGroups.get(h).push(idx);
    });

    const headerLine = renderChunk([]);
    const headerBytes = new Blob([headerLine]).size;

    const chunks = [];
    let currentIndices = [];
    let currentBytes = headerBytes;

    groups.forEach(group => {
      const groupRows = group.map(idx => rows[idx]);
      const groupCsv = renderChunk(groupRows);
      const groupBytes = new Blob([groupCsv]).size - headerBytes;

      if (currentBytes + groupBytes > TARGET && currentIndices.length > 0) {
        chunks.push(currentIndices);
        currentIndices = [];
        currentBytes = headerBytes;
      }

      currentIndices.push(...group);
      currentBytes += groupBytes;
    });

    if (currentIndices.length > 0) chunks.push(currentIndices);
    if (chunks.length <= 1) return null;

    const total = chunks.length;
    return chunks.map((indices, i) => ({
      name: baseName + '_part' + (i + 1) + 'of' + total + '.csv',
      csv: renderChunk(indices.map(idx => rows[idx])),
      rowCount: indices.length
    }));
  }

  function fallbackParseCSV(text) {
    const lines = [];
    let cur = '', row = [], inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else cur += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); lines.push(row); row = []; cur = ''; }
        else if (c === '\r') { /* skip */ }
        else cur += c;
      }
    }
    if (cur !== '' || row.length) { row.push(cur); lines.push(row); }
    if (!lines.length) return { fields: [], data: [] };
    const fields = lines[0];
    const data = lines.slice(1).filter(r => r.some(c => c !== '')).map(r => {
      const obj = {};
      fields.forEach((f, i) => { obj[f] = r[i] != null ? r[i] : ''; });
      return obj;
    });
    return { fields, data };
  }

  function loadPapaParse() {
    return new Promise((resolve, reject) => {
      if (typeof window.Papa !== 'undefined') return resolve();
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load CSV parser.'));
      document.head.appendChild(script);
    });
  }

  function loadJSZip() {
    return new Promise((resolve, reject) => {
      if (typeof window.JSZip !== 'undefined') return resolve();
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load ZIP library.'));
      document.head.appendChild(script);
    });
  }

  function parseWithPapa(text) {
    if (typeof Papa === 'undefined') return Promise.resolve(fallbackParseCSV(text));
    return new Promise(resolve => {
      Papa.parse(text, {
        header: true, skipEmptyLines: 'greedy',
        transformHeader: h => String(h).trim(),
        complete: r => resolve({ fields: r.meta.fields || [], data: r.data || [], errors: r.errors || [] }),
        error: () => resolve(fallbackParseCSV(text))
      });
    });
  }

  function initPrivacyMonitor() {
    if (!('PerformanceObserver' in window)) return;
    try {
      const obs = new PerformanceObserver(list => {
        list.getEntries().forEach(e => {
          if (['fetch', 'xmlhttprequest', 'beacon'].includes(e.initiatorType)) {
            state.networkStats.requests++;
            state.networkStats.bytes += (e.transferSize || e.encodedBodySize || 0);
            renderPrivacyStats();
          }
        });
      });
      obs.observe({ entryTypes: ['resource'] });
    } catch (e) { LOG('PerfObserver failed', e); }
    renderPrivacyStats();
  }

  function renderPrivacyStats() {
    const f = document.getElementById('asg-stat-files');
    const b = document.getElementById('asg-stat-bytes');
    const r = document.getElementById('asg-stat-requests');
    if (f) f.textContent = state.networkStats.files;
    if (b) b.textContent = formatBytes(state.networkStats.bytes);
    if (r) r.textContent = state.networkStats.requests;
  }

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
    } catch (e) { return { encoding: 'ISO-8859-1', hasBOM: false }; }
  }

  function detectMode(headers, rows) {
    const lower = headers.map(h => h.toLowerCase());
    const has = col => lower.indexOf(col) !== -1;
    const signals = {
      status: has('status'), published: has('published'), imagePosition: has('image position'),
      variantInventoryTracker: has('variant inventory tracker'),
      variantFulfillment: has('variant fulfillment service'),
      seoTitle: has('seo title'), cost: has('cost per item')
    };
    const updateScore = Object.values(signals).filter(Boolean).length;
    const hasHandles = rows.some(r => !isBlank(r['Handle']));
    const hasMissingHandles = rows.some(r => isBlank(r['Handle']));
    const hasPrices = rows.some(r => !isBlank(r['Variant Price']));
    const shortHeaders = headers.length < 10;

    if (updateScore >= 4) return { mode: 'existing_products', confidence: 'high', reason: 'Your file includes ' + updateScore + ' columns typically found in Shopify exports.' };
    if (updateScore >= 2) return { mode: 'existing_products', confidence: 'medium', reason: 'Your file includes some columns typically found in Shopify exports.' };
    if (shortHeaders && hasMissingHandles) return { mode: 'new_products', confidence: 'medium', reason: 'Your file has few columns and some rows are missing handles.' };
    if (shortHeaders && hasHandles && hasPrices) return { mode: 'new_products', confidence: 'medium', reason: 'Your file has the basics for a new product import.' };
    return { mode: null, confidence: 'low', reason: 'Autonom could not confidently determine the mode. Please choose below.' };
  }

  function renderDetectionBanner() {
    const banner = document.getElementById('asg-detect-banner');
    const icon = document.getElementById('asg-detect-icon');
    const line = document.getElementById('asg-detect-line');
    const sub = document.getElementById('asg-detect-sub');
    const grid = document.getElementById('asg-mode-grid');
    banner.classList.remove('is-medium', 'is-low');
    if (state.detectedConfidence === 'medium') banner.classList.add('is-medium');
    if (state.detectedConfidence === 'low') banner.classList.add('is-low');

    if (state.detectedMode && state.detectedConfidence !== 'low') {
      banner.hidden = false;
      grid.classList.add('is-hidden');
      icon.textContent = state.detectedConfidence === 'high' ? '✅' : '🤖';
      line.textContent = 'Detected: ' + (state.detectedMode === 'existing_products' ? 'Updating existing products' : 'Adding new products');
      sub.textContent = state.detectedReason || '';
      state.mode = state.detectedMode;
      $$('.asg-mode-card').forEach(c => c.classList.remove('is-selected'));
      const card = document.querySelector('#asg-mode-grid .asg-mode-card[data-mode="' + state.detectedMode + '"]');
      if (card) card.classList.add('is-selected');
    } else {
      banner.hidden = false;
      grid.classList.remove('is-hidden');
      icon.textContent = '🤔';
      line.textContent = 'Help us choose';
      sub.textContent = state.detectedReason || 'Please select what you are doing with this file.';
    }
    updateActionBar('setup');
  }

  function renderDelimiterBanner() {
    const banner = document.getElementById('asg-delim-banner');
    if (!banner) return;
    if (state.detectedDelimiter !== ',') {
      const names = { ';': 'semicolon', '\t': 'tab', '|': 'pipe' };
      banner.hidden = false;
      document.getElementById('asg-delim-line').textContent = 'This file uses ' + (names[state.detectedDelimiter] || state.detectedDelimiter) + '-separated values';
      document.getElementById('asg-delim-sub').textContent = 'Shopify requires commas. Autonom can convert the file before scanning.';
    } else {
      banner.hidden = true;
    }
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = (e) => reject(e);
      reader.onload = (e) => {
        const buf = e.target.result;
        const enc = detectEncoding(buf);
        let text;
        if (enc.encoding === 'UTF-16LE' || enc.encoding === 'UTF-16BE') text = new TextDecoder(enc.encoding).decode(buf);
        else if (enc.encoding === 'ISO-8859-1') text = new TextDecoder('iso-8859-1').decode(buf);
        else text = new TextDecoder('utf-8').decode(buf);
        if (enc.hasBOM && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        resolve({ text, hasBOM: enc.hasBOM, encoding: enc.encoding });
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function handleFile(file) {
    handleFiles([file]);
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => f);
    if (!files.length) return;

    if (state.files.length + files.length > 20) {
      alert('Maximum 20 files per batch. Please split into smaller batches.');
      return;
    }

    for (const file of files) {
      if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
        alert('Skipped ' + file.name + ': not a CSV file.');
        continue;
      }
      if (file.size > 50 * 1024 * 1024) {
        alert('Skipped ' + file.name + ': larger than 50MB.');
        continue;
      }

      try {
        const { text, hasBOM, encoding } = await readFileAsText(file);
        const delimiter = detectDelimiter(text);

        let parseText = text;
        if (delimiter !== ',') parseText = convertDelimiter(text, delimiter, ',');
        const parsed = fallbackParseCSV(parseText);

        const detection = detectMode(parsed.fields, parsed.data);

        state.files.push({
          file: file,
          fileName: file.name,
          fileSize: file.size,
          fileText: text,
          hasBOM: hasBOM,
          detectedEncoding: encoding,
          detectedDelimiter: delimiter,
          headers: parsed.fields,
          rows: parsed.data,
          mode: null,
          detectedMode: detection.mode,
          detectedConfidence: detection.confidence,
          detectedReason: detection.reason,
          result: null,
          repairs: null,
          acceptedRepairs: {},
          correctedCSV: null,
          changeLog: null,
          appliedCodes: null,
          splitParts: null,
          parseFieldMismatches: 0,
          status: 'ready',
          mapped: false,
          mapping: null
        });
      } catch (err) {
        LOG('Could not read file', file.name, err);
        alert('Could not read ' + file.name);
      }
    }

    if (!state.files.length) {
      resetToLanding();
      return;
    }

    state.files.forEach((f, i) => {
      const saved = loadSavedMapping(f.headers);
      if (saved) {
        applyMappingToFileData(f, saved);
        const det = detectMode(f.headers, f.rows);
        f.detectedMode = det.mode;
        f.detectedConfidence = det.confidence;
        f.detectedReason = det.reason;
      }
    });

    const needsMapping = [];
    state.files.forEach((f, i) => {
      const savedMode = f.mode;
      if (!f.mode) f.mode = f.detectedMode || 'existing_products';
      if (needsMappingForFile(i)) needsMapping.push(i);
      f.mode = savedMode;
    });

    if (needsMapping.length > 0) {
      state.pendingMappingIndices = needsMapping.slice();
      state.currentMappingIndex = 0;
      renderMappingScreen();
      showScreen('mapping');
      return;
    }

    if (state.files.length === 1) {
      loadFileIntoWorking(0);
      renderFilePreview();
      renderFileSample();
      renderDetectionBanner();
      renderDelimiterBanner();
      showScreen('setup');
    } else {
      const first = state.files[0];
      state.batchMode = first.detectedMode;
      state.batchDetectedMode = first.detectedMode;
      state.batchDetectedConfidence = first.detectedConfidence;
      state.batchDetectedReason = first.detectedReason;
      renderBatchQueue();
      showScreen('batch-queue');
    }
  }

  function loadFileIntoWorking(index) {
    const entry = state.files[index];
    if (!entry) return;
    state.currentFileIndex = index;
    state.file = entry.file;
    state.fileName = entry.fileName;
    state.fileSize = entry.fileSize;
    state.fileText = entry.fileText;
    state.hasBOM = entry.hasBOM;
    state.detectedEncoding = entry.detectedEncoding;
    state.detectedDelimiter = entry.detectedDelimiter;
    state.headers = entry.headers;
    state.rows = entry.rows;
    state.mode = entry.mode;
    state.detectedMode = entry.detectedMode;
    state.detectedConfidence = entry.detectedConfidence;
    state.detectedReason = entry.detectedReason;
    state.result = entry.result;
    state.repairs = entry.repairs;
    state.acceptedRepairs = entry.acceptedRepairs || {};
    state.correctedCSV = entry.correctedCSV;
    state.changeLog = entry.changeLog;
    state.appliedCodes = entry.appliedCodes;
    state.splitParts = entry.splitParts;
    state.parseFieldMismatches = entry.parseFieldMismatches;
  }

  function saveWorkingToFile(index) {
    const entry = state.files[index];
    if (!entry) return;
    entry.mode = state.mode;
    entry.result = state.result;
    entry.repairs = state.repairs;
    entry.acceptedRepairs = state.acceptedRepairs;
    entry.correctedCSV = state.correctedCSV;
    entry.changeLog = state.changeLog;
    entry.appliedCodes = state.appliedCodes;
    entry.splitParts = state.splitParts;
    entry.parseFieldMismatches = state.parseFieldMismatches;
  }

  function renderFilePreview() {
    const nameEl = document.getElementById('asg-file-name');
    const metaEl = document.getElementById('asg-file-meta');
    if (nameEl) nameEl.textContent = state.fileName;
    let rowCount = '—';
    try { rowCount = Math.max(0, state.rows.length).toLocaleString(); } catch (e) { /* ignore */ }
    if (metaEl) metaEl.textContent = formatBytes(state.fileSize) + ' · ' + rowCount + ' rows · ' + state.detectedEncoding + (state.hasBOM ? ' · BOM detected' : '');
  }

  function renderFileSample() {
    const wrap = document.getElementById('asg-file-sample');
    const table = document.getElementById('asg-file-sample-table');
    if (!state.headers.length || !state.rows.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    const cols = state.headers.slice(0, 5);
    const rows = state.rows.slice(0, 3);
    let html = '<table><thead><tr>';
    cols.forEach(c => { html += '<th>' + escapeHtml(c) + '</th>'; });
    if (state.headers.length > 5) html += '<th>… +' + (state.headers.length - 5) + ' more</th>';
    html += '</tr></thead><tbody>';
    rows.forEach(r => {
      html += '<tr>';
      cols.forEach(c => {
        const val = r[c] == null ? '' : String(r[c]);
        html += '<td>' + escapeHtml(val.length > 40 ? val.substring(0, 40) + '…' : val) + '</td>';
      });
      if (state.headers.length > 5) html += '<td>…</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    table.innerHTML = html;
  }

  function renderBatchQueue() {
    const titleCount = document.getElementById('asg-batch-count-title');
    if (titleCount) titleCount.textContent = state.files.length;

    const list = document.getElementById('asg-batch-list');
    if (list) {
      list.innerHTML = '';
      state.files.forEach((entry, i) => {
        const el = document.createElement('div');
        el.className = 'asg-batch-file';
        let rowCount = '—';
        try { rowCount = Math.max(0, entry.rows.length).toLocaleString(); } catch (e) {}
        el.innerHTML =
          '<span class="asg-batch-file-icon">📄</span>' +
          '<div class="asg-batch-file-info">' +
            '<div class="asg-batch-file-name">' + escapeHtml(entry.fileName) + '</div>' +
            '<div class="asg-batch-file-meta">' + formatBytes(entry.fileSize) + ' · ' + rowCount + ' rows · ' + entry.detectedEncoding + (entry.hasBOM ? ' · BOM' : '') + (entry.detectedDelimiter !== ',' ? ' · ' + entry.detectedDelimiter + '-delimited' : '') + (entry.mapped ? ' · Mapped' : '') + '</div>' +
          '</div>' +
          '<button type="button" class="asg-btn asg-btn-ghost asg-batch-file-remove" data-index="' + i + '" aria-label="Remove file">✕</button>';
        list.appendChild(el);
      });
      list.querySelectorAll('.asg-batch-file-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          state.files.splice(idx, 1);
          if (!state.files.length) { resetToLanding(); return; }
          if (state.files.length === 1) {
            loadFileIntoWorking(0);
            renderFilePreview();
            renderFileSample();
            renderDetectionBanner();
            renderDelimiterBanner();
            showScreen('setup');
            return;
          }
          renderBatchQueue();
        });
      });
    }

    if (state.batchMode) {
      document.querySelectorAll('#asg-batch-mode-grid .asg-mode-card').forEach(c => {
        c.classList.toggle('is-selected', c.dataset.mode === state.batchMode);
      });
    }
    updateActionBar('batch-queue');
  }

  function renderMappingScreen() {
    const fileIdx = state.pendingMappingIndices[state.currentMappingIndex];
    if (fileIdx == null) return;
    const f = state.files[fileIdx];
    if (!f) return;

    const draft = {};
    const suggestions = suggestMapping(f.headers);
    const saved = loadSavedMapping(f.headers);
    const knownLower = KNOWN_COLUMNS.map(c => c.toLowerCase());

    f.headers.forEach(h => {
      const hl = String(h == null ? '' : h).trim().toLowerCase();
      if (saved && Object.prototype.hasOwnProperty.call(saved, h)) {
        draft[h] = { target: saved[h] || '', source: 'saved' };
      } else if (knownLower.indexOf(hl) !== -1) {
        draft[h] = { target: '', source: 'identity' };
      } else if (suggestions[h]) {
        draft[h] = { target: suggestions[h], source: 'suggested' };
      } else {
        draft[h] = { target: '', source: 'unmapped' };
      }
    });
    state.mappingDraft = draft;

    const sub = document.getElementById('asg-mapping-sub');
    if (sub) {
      sub.textContent = 'File ' + (state.currentMappingIndex + 1) + ' of ' + state.pendingMappingIndices.length + ': ' + f.fileName;
    }

    const banner = document.getElementById('asg-mapping-banner');
    const bannerLine = document.getElementById('asg-mapping-banner-line');
    const bannerSub = document.getElementById('asg-mapping-banner-sub');
    if (banner && bannerLine && bannerSub) {
      const unknownCount = f.headers.filter(h => {
        const hl = String(h == null ? '' : h).trim().toLowerCase();
        return knownLower.indexOf(hl) === -1;
      }).length;
      const suggestedCount = Object.keys(draft).filter(h => draft[h].source === 'suggested').length;
      const savedCount = Object.keys(draft).filter(h => draft[h].source === 'saved').length;
      if (savedCount > 0) {
        banner.hidden = false;
        bannerLine.textContent = 'Using saved mapping';
        bannerSub.textContent = savedCount + ' column' + (savedCount === 1 ? '' : 's') + ' mapped from a previous scan. Review and confirm.';
      } else if (suggestedCount > 0) {
        banner.hidden = false;
        bannerLine.textContent = 'Autonom suggested ' + suggestedCount + ' mapping' + (suggestedCount === 1 ? '' : 's');
        bannerSub.textContent = unknownCount + ' unknown column' + (unknownCount === 1 ? '' : 's') + ' detected. Review and adjust before applying.';
      } else if (unknownCount > 0) {
        banner.hidden = false;
        bannerLine.textContent = unknownCount + ' column' + (unknownCount === 1 ? '' : 's') + ' need mapping';
        bannerSub.textContent = 'Pick a Shopify target for each column, or leave empty to skip.';
      } else {
        banner.hidden = true;
      }
    }

    const list = document.getElementById('asg-mapping-list');
    if (!list) return;
    list.innerHTML = '';

    f.headers.forEach(h => {
      const entry = draft[h];
      const row = document.createElement('div');
      let cls = 'asg-mapping-row';
      if (entry.source === 'suggested') cls += ' is-suggested';
      else if (entry.source === 'unmapped') cls += ' is-unmapped';
      row.className = cls;
      row.dataset.sourceHeader = h;

      let badge = '';
      if (entry.source === 'suggested') badge = '<span class="asg-mapping-source-badge is-suggested">Suggested</span>';
      else if (entry.source === 'saved') badge = '<span class="asg-mapping-source-badge is-saved">Saved</span>';

      let selectHtml;
      if (entry.source === 'identity') {
        selectHtml = '<select class="asg-mapping-select" data-source="' + escapeHtml(h) + '" disabled><option value="">(already a Shopify column)</option></select>';
      } else {
        selectHtml = '<select class="asg-mapping-select" data-source="' + escapeHtml(h) + '">';
        MAPPING_TARGETS.forEach(t => {
          const selected = t.value === entry.target ? ' selected' : '';
          selectHtml += '<option value="' + escapeHtml(t.value) + '"' + selected + '>' + escapeHtml(t.label) + '</option>';
        });
        selectHtml += '</select>';
      }

      row.innerHTML =
        '<div class="asg-mapping-source">' +
          '<div class="asg-mapping-source-name">' + escapeHtml(h || '(empty header)') + badge + '</div>' +
        '</div>' +
        '<div class="asg-mapping-arrow">→</div>' +
        '<div class="asg-mapping-target">' + selectHtml + '</div>';

      list.appendChild(row);
    });

    list.querySelectorAll('.asg-mapping-select').forEach(sel => {
      sel.addEventListener('change', updateMappingWarning);
    });

    updateMappingWarning();
    updateActionBar('mapping');
  }

  function collectMappingFromScreen() {
    const mapping = {};
    document.querySelectorAll('#asg-mapping-list .asg-mapping-select').forEach(sel => {
      if (sel.disabled) return;
      const src = sel.getAttribute('data-source');
      const target = sel.value;
      mapping[src] = target || '';
    });
    return mapping;
  }

  function updateMappingWarning() {
    const warning = document.getElementById('asg-mapping-warning');
    if (!warning) return;
    const mapping = collectMappingFromScreen();
    const used = {};
    const conflicts = [];
    Object.keys(mapping).forEach(src => {
      const tgt = mapping[src];
      if (!tgt) return;
      if (used[tgt]) conflicts.push(tgt);
      else used[tgt] = src;
    });
    if (conflicts.length > 0) {
      warning.hidden = false;
      warning.innerHTML = '<strong>Conflict:</strong> ' + conflicts.map(c => '"' + escapeHtml(c) + '"').join(', ') + ' ' +
        (conflicts.length === 1 ? 'is assigned to two columns' : 'are each assigned to two columns') +
        '. Each Shopify column can only receive one source.';
    } else {
      warning.hidden = true;
    }
  }

  function applyMappingAndContinue() {
    const mapping = collectMappingFromScreen();
    const used = {};
    let hasConflict = false;
    Object.keys(mapping).forEach(src => {
      const tgt = mapping[src];
      if (!tgt) return;
      if (used[tgt]) { hasConflict = true; return; }
      used[tgt] = src;
    });
    if (hasConflict) {
      updateMappingWarning();
      return;
    }

    const fileIdx = state.pendingMappingIndices[state.currentMappingIndex];
    const f = state.files[fileIdx];
    if (f) {
      const originalHeaders = f.headers.slice();
      applyMappingToFile(fileIdx, mapping);
      if (Object.keys(mapping).length > 0) {
        saveMapping(originalHeaders, mapping);
      }
      const det = detectMode(f.headers, f.rows);
      f.detectedMode = det.mode;
      f.detectedConfidence = det.confidence;
      f.detectedReason = det.reason;
    }

    state.currentMappingIndex++;
    if (state.currentMappingIndex >= state.pendingMappingIndices.length) {
      state.pendingMappingIndices = [];
      state.currentMappingIndex = 0;
      continueAfterMapping();
    } else {
      renderMappingScreen();
    }
  }

  function skipMappingAndContinue() {
    state.currentMappingIndex++;
    if (state.currentMappingIndex >= state.pendingMappingIndices.length) {
      state.pendingMappingIndices = [];
      state.currentMappingIndex = 0;
      continueAfterMapping();
    } else {
      renderMappingScreen();
    }
  }

  function continueAfterMapping() {
    if (state.files.length === 1) {
      loadFileIntoWorking(0);
      renderFilePreview();
      renderFileSample();
      renderDetectionBanner();
      renderDelimiterBanner();
      showScreen('setup');
    } else {
      const first = state.files[0];
      state.batchMode = first.detectedMode;
      state.batchDetectedMode = first.detectedMode;
      state.batchDetectedConfidence = first.detectedConfidence;
      state.batchDetectedReason = first.detectedReason;
      renderBatchQueue();
      showScreen('batch-queue');
    }
  }

  function makeIssue(sev, code, title, extra) {
    const issue = Object.assign({
      severity: sev, code, title,
      what_is_wrong: '', why_it_matters: '', suggested_action: '',
      affected_rows: [], shopify_doc_url: '', auto_fix: 'never'
    }, extra || {});
    const guide = ISSUE_GUIDES[code];
    if (guide) {
      if (!issue.what_is_wrong) issue.what_is_wrong = guide.what;
      if (!issue.why_it_matters) issue.why_it_matters = guide.why;
      if (!issue.suggested_action) issue.suggested_action = guide.action;
    }
    return issue;
  }

  function runChecks() {
    const issues = [];
    const passed = [];
    const rowTypes = classifyRows();

    if (state.detectedDelimiter !== ',') {
      const names = { ';': 'semicolon', '\t': 'tab', '|': 'pipe' };
      issues.push(makeIssue('critical', 'DELIMITER_NOT_COMMA',
        'File uses ' + (names[state.detectedDelimiter] || state.detectedDelimiter) + ' delimiter instead of comma', {
          what_is_wrong: 'Your file uses ' + (names[state.detectedDelimiter] || state.detectedDelimiter) + '-separated values.',
          why_it_matters: 'Shopify expects comma-separated values. The file would import as a single column or fail entirely.',
          suggested_action: 'Autonom can convert the file to comma-delimited before export.',
          auto_fix: 'review_required',
          alternative_fix: 'convert_delimiter'
        }));
    } else passed.push('File uses comma delimiter');

    if (state.fileSize >= FILE_SIZE_WARNING_BYTES && state.fileSize < FILE_SIZE_LIMIT_BYTES) {
      issues.push(makeIssue('info', 'FILE_SIZE_APPROACHING_LIMIT', 'File size is approaching Shopify\'s 15 MB limit', {
        what_is_wrong: 'Your file is ' + formatBytes(state.fileSize) + '. Shopify rejects files over 15 MB.',
        why_it_matters: 'If this file grows, Shopify will reject the import.',
        suggested_action: 'Consider splitting this file before it hits the limit.',
        auto_fix: 'never'
      }));
    } else if (state.fileSize >= FILE_SIZE_LIMIT_BYTES) {
      issues.push(makeIssue('critical', 'FILE_SIZE_OVER_LIMIT', 'File size exceeds Shopify\'s 15 MB limit', {
        what_is_wrong: 'Your file is ' + formatBytes(state.fileSize) + '. Shopify will reject any file over 15 MB.',
        why_it_matters: 'The import will fail before Shopify reads any rows.',
        suggested_action: 'Autonom can split the file into multiple parts, each under the limit. Products stay whole.',
        shopify_doc_url: SHOPIFY_DOC_URL,
        auto_fix: 'review_required',
        alternative_fix: 'split_file_into_parts'
      }));
    }

    if (state.hasBOM) {
      issues.push(makeIssue('warning', 'ENCODING_BOM_PRESENT', 'File starts with a byte-order mark (BOM)', {
        what_is_wrong: 'This file has a hidden BOM character at the start.',
        why_it_matters: 'Shopify may interpret the first column header incorrectly.',
        suggested_action: 'Autonom can remove the BOM.', auto_fix: 'safe_automatic'
      }));
    } else passed.push('No byte-order mark detected');

    if (state.detectedEncoding !== 'UTF-8') {
      issues.push(makeIssue('warning', 'ENCODING_NOT_UTF8', 'File is not UTF-8 encoded', {
        what_is_wrong: 'This file uses ' + state.detectedEncoding + ' encoding.',
        why_it_matters: 'Special characters may display incorrectly.',
        suggested_action: 'Autonom can convert to UTF-8.', auto_fix: 'safe_automatic'
      }));
    } else passed.push('File encoding is UTF-8');

    const smartQuoteRows = [];
    state.rows.forEach((row, i) => {
      for (const key of Object.keys(row)) {
        const val = row[key];
        if (val != null && SMART_QUOTE_CHARS.test(String(val))) {
          smartQuoteRows.push({ row: i + 2, column: key, value: String(val).substring(0, 60) });
          break;
        }
      }
    });
    if (smartQuoteRows.length > 0) {
      const n = smartQuoteRows.length;
      issues.push(makeIssue('warning', 'SMART_QUOTES_DETECTED', 'Smart quotes and typographic characters detected', {
        what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'contains', 'contain') + ' curly quotes, dashes, or ellipses.',
        why_it_matters: 'Shopify\'s CSV parser expects straight quotes.',
        suggested_action: 'Autonom can convert all smart quotes to straight quotes.',
        affected_rows: smartQuoteRows.slice(0, 10), auto_fix: 'safe_automatic'
      }));
    } else passed.push('No smart quotes detected');

    const whitespaceRows = [];
    state.rows.forEach((row, i) => {
      for (const col of TEXT_COLUMNS_FOR_WHITESPACE) {
        if (state.headers.indexOf(col) === -1) continue;
        const val = row[col];
        if (val != null && String(val) !== String(val).trim() && String(val).trim() !== '') {
          whitespaceRows.push({ row: i + 2, column: col, value: String(val) });
          break;
        }
      }
    });
    if (whitespaceRows.length > 0) {
      const n = whitespaceRows.length;
      issues.push(makeIssue('warning', 'CELL_WHITESPACE', 'Extra whitespace in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'cell') + ' ' + v(n, 'has', 'have') + ' leading or trailing spaces.',
        why_it_matters: 'Hidden spaces can create duplicate tags and broken URLs.',
        suggested_action: 'Autonom can trim whitespace from all text columns.',
        affected_rows: whitespaceRows.slice(0, 10), auto_fix: 'safe_automatic'
      }));
    } else passed.push('No stray whitespace in text cells');

    const headerLower = {};
    state.headers.forEach(h => { headerLower[h.toLowerCase()] = h; });
    if (state.mode === 'new_products') {
      REQUIRED_COLUMNS_NEW.forEach(req => {
        if (headerLower[req.toLowerCase()]) {
          passed.push('Required column present: ' + req);
          return;
        }
        if (req === 'Handle' && headerLower['title']) {
          return;
        }
        issues.push(makeIssue('critical', 'HEADER_REQUIRED_MISSING', 'Required column "' + req + '" is missing', {
          what_is_wrong: 'Shopify requires the "' + req + '" column, but it is not present.',
          why_it_matters: 'Shopify will reject the import entirely.',
          suggested_action: 'Add the missing column and re-export.',
          shopify_doc_url: SHOPIFY_DOC_URL
        }));
      });
    }

    const knownLower = KNOWN_COLUMNS.map(c => c.toLowerCase());
    state.headers.forEach(h => {
      if (h && knownLower.indexOf(h.toLowerCase()) === -1 &&
          !/^Metafield:|^mf_|^Google Shopping|^Cost per item|^Variant Inventory/.test(h)) {
        issues.push(makeIssue('warning', 'HEADER_UNKNOWN_COLUMN', 'Unknown column "' + h + '"', {
          what_is_wrong: 'Not part of the standard Shopify product CSV format.',
          why_it_matters: 'Shopify will ignore this column.',
          suggested_action: 'Verify this column is intentional, or remove it.'
        }));
      }
    });

    const hCount = {};
    state.headers.forEach(h => { const k = h.toLowerCase(); hCount[k] = (hCount[k] || 0) + 1; });
    Object.keys(hCount).forEach(k => {
      if (hCount[k] > 1) {
        issues.push(makeIssue('critical', 'HEADER_DUPLICATE', 'Duplicate column "' + k + '"', {
          what_is_wrong: 'The "' + k + '" column appears more than once.',
          why_it_matters: 'Shopify uses only one of the duplicates.',
          suggested_action: 'Remove the duplicate column.', auto_fix: 'review_required'
        }));
      }
    });
    if (Object.keys(hCount).length === state.headers.length) passed.push('No duplicate headers');

    const handleFirstTitle = {};
    state.rows.forEach((row, i) => {
      const h = row['Handle']; const t = row['Title'];
      if (isBlank(h)) return;
      if (!(h in handleFirstTitle)) handleFirstTitle[h] = { row: i + 2, title: t || '' };
    });
    const missingTitles = [];
    Object.keys(handleFirstTitle).forEach(h => {
      const entry = handleFirstTitle[h];
      if (isBlank(entry.title)) missingTitles.push({ row: entry.row, handle: h });
    });
    if (missingTitles.length > 0) {
      const n = missingTitles.length;
      issues.push(makeIssue('critical', 'TITLE_MISSING', 'Title missing for ' + pcount(n, 'product'), {
        what_is_wrong: pcount(n, 'product') + ' ' + v(n, 'has', 'have') + ' no Title on the first row.',
        why_it_matters: 'Shopify requires a Title to create or update a product.',
        suggested_action: 'Add a Title to the first row of each product.',
        affected_rows: missingTitles.slice(0, 10)
      }));
    } else passed.push('All products have a Title');

    const handleCounts = {};
    const blankNew = [], blankUpdate = [], invalid = [];
    state.rows.forEach((row, i) => {
      const h = row['Handle'], t = row['Title'], n = i + 2;
      if (isBlank(h)) {
        if (state.mode === 'new_products' && !isBlank(t)) blankNew.push({ row: n, title: t, proposed_handle: toHandle(t) });
        else if (state.mode === 'existing_products') blankUpdate.push({ row: n, title: t || '(no title)' });
      } else {
        handleCounts[h] = (handleCounts[h] || 0) + 1;
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(h)) invalid.push({ row: n, handle: h, proposed: toHandle(h) });
      }
    });
    if (state.mode === 'new_products' && blankNew.length > 0) {
      const n = blankNew.length;
      issues.push(makeIssue('warning', 'HANDLE_MISSING_NEW', 'Handle missing for ' + pcount(n, 'product'), {
        what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'has', 'have') + ' no handle.',
        why_it_matters: 'Shopify requires a handle to create a product.',
        suggested_action: 'Autonom can generate handles from product titles.',
        affected_rows: blankNew.slice(0, 10), auto_fix: 'review_required'
      }));
    }
    if (state.mode === 'existing_products' && blankUpdate.length > 0) {
      const n = blankUpdate.length;
      issues.push(makeIssue('critical', 'HANDLE_MISSING_UPDATE', 'Handle missing for ' + pcount(n, 'row'), {
        what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'has', 'have') + ' no handle.',
        why_it_matters: 'Shopify cannot match these rows to existing products.',
        suggested_action: 'Add the handle column and verify each row.',
        affected_rows: blankUpdate.slice(0, 10)
      }));
    }
    if (invalid.length > 0) {
      const n = invalid.length;
      issues.push(makeIssue('warning', 'HANDLE_FORMAT_INVALID', pcount(n, 'handle') + ' ' + v(n, 'does', 'do') + ' not match Shopify format', {
        what_is_wrong: 'Handles should be lowercase with hyphens.',
        why_it_matters: 'Non-standard handles may cause URL issues.',
        suggested_action: 'Autonom can normalize these handles.',
        affected_rows: invalid.slice(0, 10), auto_fix: 'safe_automatic'
      }));
    }

    const hTitles = {};
    state.rows.forEach((row, i) => {
      const h = row['Handle'];
      if (isBlank(h)) return;
      if (!hTitles[h]) hTitles[h] = [];
      hTitles[h].push({ row: i + 2, title: row['Title'] || '' });
    });
    Object.keys(hTitles).forEach(h => {
      const entries = hTitles[h];
      if (entries.length > 1) {
        const titleSet = {};
        entries.forEach(e => { titleSet[e.title] = true; });
        const distinctTitles = Object.keys(titleSet).filter(t => t !== '');
        if (distinctTitles.length > 1) {
          const n = entries.length;
          issues.push(makeIssue('critical', 'HANDLE_DUPLICATE_IN_FILE', 'Duplicate handle "' + h + '" found', {
            what_is_wrong: 'The handle "' + h + '" appears on ' + pcount(n, 'row') + ', but titles differ.',
            why_it_matters: 'Shopify may merge these into one product.',
            suggested_action: 'If variants, use same Title. If different products, use unique handles.',
            affected_rows: entries.slice(0, 10)
          }));
        }
      }
    });
    if (!issues.some(i => i.code === 'HANDLE_DUPLICATE_IN_FILE')) passed.push('No conflicting duplicate handles');

    const skuMap = {};
    let whitespaceSKUs = 0;
    state.rows.forEach((row, i) => {
      const sku = row['Variant SKU'];
      if (isBlank(sku)) return;
      const trimmed = String(sku).trim();
      if (trimmed !== sku) whitespaceSKUs++;
      if (!skuMap[trimmed]) skuMap[trimmed] = [];
      skuMap[trimmed].push({ row: i + 2, handle: row['Handle'] || '(no handle)' });
    });
    Object.keys(skuMap).forEach(sku => {
      const entries = skuMap[sku];
      const distinct = {};
      entries.forEach(e => { distinct[e.handle] = true; });
      if (Object.keys(distinct).length > 1) {
        issues.push(makeIssue('critical', 'SKU_DUPLICATE_IN_FILE', 'Duplicate SKU "' + sku + '" found', {
          what_is_wrong: 'The SKU "' + sku + '" appears on rows for different products.',
          why_it_matters: 'Shopify may merge these products, or the import may fail.',
          suggested_action: 'Assign a unique SKU to each product and variant.',
          affected_rows: entries.slice(0, 10), auto_fix: 'review_required'
        }));
      }
    });
    if (whitespaceSKUs > 0) {
      const n = whitespaceSKUs;
      issues.push(makeIssue('warning', 'SKU_WHITESPACE', pcount(n, 'SKU') + ' ' + v(n, 'contains', 'contain') + ' whitespace', {
        what_is_wrong: pcount(n, 'SKU') + ' ' + v(n, 'has', 'have') + ' hidden spaces.',
        why_it_matters: 'May cause matching issues.',
        suggested_action: 'Autonom can trim whitespace from all SKUs.', auto_fix: 'safe_automatic'
      }));
    } else passed.push('No whitespace in SKUs');

    const dupIdentical = duplicateIdenticalRows();
    if (dupIdentical.length > 0) {
      const n = dupIdentical.length;
      issues.push(makeIssue('warning', 'DUPLICATE_IDENTICAL_ROWS', 'Identical duplicate ' + pcount(n, 'row'), {
        what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'is', 'are') + ' an exact duplicate of an earlier row.',
        why_it_matters: 'This usually indicates an accidental duplicate paste. Shopify may reject the file or create duplicate variants.',
        suggested_action: 'Autonom can remove the duplicate rows.',
        affected_rows: dupIdentical.slice(0, 10).map(r => ({ row: r.row, handle: r.handle, title: r.title, duplicates_row: r.originalRow })),
        auto_fix: 'review_required'
      }));
    } else passed.push('No identical duplicate rows');

    if (state.mode === 'existing_products') {
      if (state.parseFieldMismatches > 0) {
        passed.push('Destructive blank check skipped (file has misaligned rows)');
      } else {
        SENSITIVE_COLUMNS.forEach(col => {
          if (state.headers.indexOf(col) === -1) return;
          const isProductLevel = PRODUCT_LEVEL_COLUMNS.indexOf(col) !== -1;
          const blanks = [];
          let consideredCount = 0;
          let allBlank = true;

          state.rows.forEach((row, i) => {
            if (rowTypes.isImage[i]) return;
            if (isProductLevel && !rowTypes.isPrimary[i]) return;
            if (!isProductLevel && !rowTypes.isVariant[i] && !rowTypes.isPrimary[i]) return;
            consideredCount++;
            if (isBlank(row[col])) blanks.push({ row: i + 2, handle: row['Handle'] || '', value: '' });
            else allBlank = false;
          });

          if (consideredCount === 0) return;

          if (allBlank && blanks.length > 0) {
            issues.push(makeIssue('info', 'DESTRUCTIVE_BLANK_ALL_ROWS', 'Entire column "' + col + '" is blank', {
              what_is_wrong: 'The "' + col + '" column is included but contains no values.',
              why_it_matters: 'This column has no effect.',
              suggested_action: 'Autonom can remove this column.', auto_fix: 'safe_automatic'
            }));
          } else if (blanks.length > 0) {
            const n = blanks.length;
            const ratio = n / consideredCount;
            const offerColumnRemoval = ratio >= BLANK_COLUMN_REMOVAL_THRESHOLD;
            issues.push(makeIssue('critical', 'DESTRUCTIVE_BLANK_INCLUDED_COLUMN',
              'Blank values in included column "' + col + '"', {
                what_is_wrong: 'You included the "' + col + '" column, but ' + n + ' of ' + consideredCount + ' relevant cells ' + v(n, 'is', 'are') + ' empty.',
                why_it_matters: 'Shopify treats a blank value in an included column as an intentional overwrite.',
                suggested_action: offerColumnRemoval
                  ? 'Remove the "' + col + '" column entirely, or fill in the blank cells.'
                  : 'Fill in the ' + pcount(n, 'blank cell') + ' in your original file, then re-upload.',
                affected_rows: blanks.slice(0, 10),
                affected_column: col,
                shopify_doc_url: SHOPIFY_DOC_URL,
                auto_fix: offerColumnRemoval ? 'review_required' : 'never',
                alternative_fix: offerColumnRemoval ? 'strip_column_with_user_approval' : null
              }));
          } else passed.push('No destructive blanks in "' + col + '"');
        });
      }
    }

    const handleOpts = {};
    let orphaned = 0;
    const orphanedRows = [];
    state.rows.forEach((row, i) => {
      const h = row['Handle'], o1n = row['Option1 Name'], o1v = row['Option1 Value'], n = i + 2;
      if (!isBlank(o1n) || !isBlank(o1v)) {
        if (isBlank(h)) {
          orphaned++;
          orphanedRows.push({ row: n, option_name: o1n || '', option_value: o1v || '', sku: row['Variant SKU'] || '' });
        } else {
          if (!handleOpts[h]) handleOpts[h] = {};
          if (!isBlank(o1n)) handleOpts[h][o1n] = true;
        }
      }
    });
    if (orphaned > 0) {
      const n = orphaned;
      issues.push(makeIssue('critical', 'VARIANT_ORPHANED', 'Variant row without a parent product', {
        what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'has', 'have') + ' variant data but no handle.',
        why_it_matters: 'Shopify cannot attach this variant to a product.',
        suggested_action: 'Add the same Handle as the parent product.',
        affected_rows: orphanedRows.slice(0, 10)
      }));
    } else passed.push('No orphaned variant rows');

    Object.keys(handleOpts).forEach(h => {
      const names = Object.keys(handleOpts[h]);
      if (names.length > 1) {
        issues.push(makeIssue('critical', 'VARIANT_OPTION_NAME_INCONSISTENT', 'Inconsistent option names for handle "' + h + '"', {
          what_is_wrong: 'Handle "' + h + '" has different option names.',
          why_it_matters: 'Shopify cannot resolve variant relationships.',
          suggested_action: 'Use the same option name for all variant rows.'
        }));
      }
    });

    const combosByHandle = {};
    state.rows.forEach((row, i) => {
      const h = row['Handle'];
      if (isBlank(h)) return;
      const o1v = row['Option1 Value'] || '';
      const o2v = row['Option2 Value'] || '';
      const o3v = row['Option3 Value'] || '';
      if (isBlank(o1v) && isBlank(o2v) && isBlank(o3v)) return;
      const key = [o1v, o2v, o3v].join('|');
      if (!combosByHandle[h]) combosByHandle[h] = {};
      if (!combosByHandle[h][key]) combosByHandle[h][key] = [];
      combosByHandle[h][key].push({ row: i + 2, combo: key.replace(/\|/g, ' / ').replace(/\s+\/\s+$/, '').replace(/\s+\/$/, '') });
    });
    const dupComboGroups = [];
    Object.keys(combosByHandle).forEach(h => {
      Object.keys(combosByHandle[h]).forEach(k => {
        const entries = combosByHandle[h][k];
        if (entries.length > 1) dupComboGroups.push({ handle: h, combo: entries[0].combo, rows: entries.map(e => e.row) });
      });
    });
    if (dupComboGroups.length > 0) {
      const n = dupComboGroups.length;
      const flat = [];
      dupComboGroups.slice(0, 10).forEach(d => {
        d.rows.forEach(r => flat.push({ row: r, handle: d.handle, option_combo: d.combo }));
      });
      issues.push(makeIssue('critical', 'VARIANT_DUPLICATE_OPTION_COMBINATION', 'Duplicate option combinations for ' + pcount(n, 'variant'), {
        what_is_wrong: pcount(n, 'option combination') + ' ' + v(n, 'appears', 'appear') + ' on multiple rows.',
        why_it_matters: 'Shopify silently drops one variant.',
        suggested_action: 'Remove the duplicate rows, or change their option values.',
        affected_rows: flat, auto_fix: 'never'
      }));
    } else passed.push('No duplicate variant option combinations');

    const partial = [];
    state.rows.forEach((row, i) => {
      for (let n = 1; n <= 3; n++) {
        const nameKey = 'Option' + n + ' Name';
        const valKey = 'Option' + n + ' Value';
        if (state.headers.indexOf(nameKey) === -1 || state.headers.indexOf(valKey) === -1) continue;
        const nv = row[nameKey]; const vv = row[valKey];
        if (isBlank(nv) !== isBlank(vv)) {
          partial.push({ row: i + 2, handle: row['Handle'] || '(no handle)', option: 'Option' + n, name: nv || '(blank)', value: vv || '(blank)' });
          break;
        }
      }
    });
    if (partial.length > 0) {
      const n = partial.length;
      issues.push(makeIssue('critical', 'VARIANT_PARTIAL_COLLAPSE', 'Incomplete option data for ' + pcount(n, 'row'), {
        what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'has', 'have') + ' an option Name without a Value, or vice versa.',
        why_it_matters: 'An incomplete option pair can collapse the product.',
        suggested_action: 'Fill in both the Name and Value.',
        affected_rows: partial.slice(0, 10)
      }));
    } else passed.push('All option rows have matching Name and Value');

    const handleVariantCols = {};
    state.rows.forEach((row, i) => {
      const h = row['Handle'];
      if (isBlank(h)) return;
      if (rowTypes.isImage[i]) return;
      if (!handleVariantCols[h]) handleVariantCols[h] = { rows: [], populated: {} };
      handleVariantCols[h].rows.push(i + 2);
      VARIANT_OPTION_COLUMNS.forEach(col => {
        if (state.headers.indexOf(col) === -1) return;
        if (!isBlank(row[col])) {
          if (!handleVariantCols[h].populated[col]) handleVariantCols[h].populated[col] = 0;
          handleVariantCols[h].populated[col]++;
        }
      });
    });
    const colInconsistencies = [];
    Object.keys(handleVariantCols).forEach(h => {
      const info = handleVariantCols[h];
      const rowCount = info.rows.length;
      if (rowCount < 2) return;
      const colsWithData = Object.keys(info.populated);
      if (!colsWithData.length) return;
      const inconsistentCols = colsWithData.filter(col => info.populated[col] !== rowCount);
      if (inconsistentCols.length > 0) {
        colInconsistencies.push({ handle: h, rows: info.rows, totalRows: rowCount, columns: inconsistentCols.map(c => c + ' (' + info.populated[c] + '/' + rowCount + ')') });
      }
    });
    if (colInconsistencies.length > 0) {
      const n = colInconsistencies.length;
      const flat = [];
      colInconsistencies.slice(0, 10).forEach(c => {
        c.rows.forEach(r => flat.push({ row: r, handle: c.handle, inconsistency: c.columns.join(', ') }));
      });
      issues.push(makeIssue('critical', 'VARIANT_COLUMN_INCONSISTENCY', 'Variant column inconsistency for ' + pcount(n, 'product'), {
        what_is_wrong: pcount(n, 'product') + ' ' + v(n, 'has', 'have') + ' variant rows with partial option fills.',
        why_it_matters: 'Shopify may collapse the product.',
        suggested_action: 'Fill the same option columns on every variant row.',
        affected_rows: flat, auto_fix: 'never'
      }));
    } else passed.push('Variant option columns consistent across rows');

    const imageDirty = imageRowsWithExtraData();
    if (imageDirty.length > 0) {
      const n = imageDirty.length;
      issues.push(makeIssue('critical', 'IMAGE_ROW_VARIANT_DATA', 'Image rows contain extra variant data in ' + pcount(n, 'row'), {
        what_is_wrong: pcount(n, 'image row') + ' contain data in columns that should be blank.',
        why_it_matters: 'Shopify tries creating duplicate variants or silently deletes them.',
        suggested_action: 'Autonom can clear all columns except Handle and Image Src.',
        affected_rows: imageDirty.slice(0, 10).map(d => ({ row: d.row, handle: d.handle, columns_with_data: d.columns.join(', ') })),
        auto_fix: 'review_required', shopify_doc_url: SHOPIFY_DOC_URL
      }));
    } else passed.push('No image rows with stray variant data');

    const svmi = singleVariantMultipleImages();
    if (svmi.length > 0) {
      const n = svmi.length;
      issues.push(makeIssue('critical', 'SINGLE_VARIANT_MULTIPLE_IMAGES', 'Missing Option1 declaration for ' + pcount(n, 'product with multiple images'), {
        what_is_wrong: pcount(n, 'single-variant product') + ' ' + v(n, 'has', 'have') + ' multiple image rows but no Option1 declaration.',
        why_it_matters: 'Shopify treats each image row as a duplicate variant.',
        suggested_action: 'Autonom can set Option1 Name="Title" and Option1 Value="Default Title".',
        affected_rows: svmi.slice(0, 10).map(d => ({ row: d.row, handle: d.handle, image_rows: d.imageCount })),
        auto_fix: 'review_required', shopify_doc_url: SHOPIFY_DOC_URL
      }));
    } else passed.push('Single-variant products with images are properly configured');

    const dupImgs = duplicateImageRows();
    if (dupImgs.length > 0) {
      const n = dupImgs.length;
      issues.push(makeIssue('warning', 'DUPLICATE_IMAGE_ROWS', 'Duplicate image rows in ' + pcount(n, 'location'), {
        what_is_wrong: pcount(n, 'image row') + ' ' + v(n, 'duplicates', 'duplicate') + ' an earlier image URL.',
        why_it_matters: 'Shopify may attach the same image multiple times.',
        suggested_action: 'Autonom can remove the duplicate rows.',
        affected_rows: dupImgs.slice(0, 10).map(d => ({ row: d.row, handle: d.handle, duplicates_row: d.duplicateOf, url: d.url })),
        auto_fix: 'safe_automatic'
      }));
    } else passed.push('No duplicate image rows');

    if (state.headers.indexOf('Variant Inventory Tracker') !== -1 && state.headers.indexOf('Variant Inventory Qty') !== -1) {
      const missingQty = [];
      state.rows.forEach((row, i) => {
        if (rowTypes.isImage[i]) return;
        const tracker = row['Variant Inventory Tracker'];
        const qty = row['Variant Inventory Qty'];
        if (!isBlank(tracker) && isBlank(qty)) missingQty.push({ row: i + 2, handle: row['Handle'] || '(no handle)', tracker });
      });
      if (missingQty.length > 0) {
        const n = missingQty.length;
        issues.push(makeIssue('warning', 'INVENTORY_QTY_MISSING_WITH_TRACKER', 'Inventory quantity missing where tracker is set in ' + pcount(n, 'row'), {
          what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'has', 'have') + ' a tracker but no quantity.',
          why_it_matters: 'Shopify requires a quantity when a tracker is set.',
          suggested_action: 'Autonom can set the missing quantity to 0.',
          affected_rows: missingQty.slice(0, 10), auto_fix: 'review_required'
        }));
      } else passed.push('All rows with inventory tracker have a quantity');
    }

    if (state.headers.indexOf('Variant Inventory Qty') !== -1 && state.headers.indexOf('Variant Inventory Tracker') !== -1) {
      const missingTracker = [];
      state.rows.forEach((row, i) => {
        if (rowTypes.isImage[i]) return;
        const qty = row['Variant Inventory Qty'];
        const tracker = row['Variant Inventory Tracker'];
        if (!isBlank(qty) && isBlank(tracker)) missingTracker.push({ row: i + 2, handle: row['Handle'] || '(no handle)', qty });
      });
      if (missingTracker.length > 0) {
        const n = missingTracker.length;
        issues.push(makeIssue('warning', 'INVENTORY_TRACKER_MISSING', 'Inventory quantity set without a tracker on ' + pcount(n, 'row'), {
          what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'has', 'have') + ' a quantity but no tracker.',
          why_it_matters: 'Shopify silently ignores inventory updates without a tracker.',
          suggested_action: 'Set Variant Inventory Tracker to "shopify".',
          affected_rows: missingTracker.slice(0, 10), auto_fix: 'never'
        }));
      } else passed.push('Inventory tracker set on all rows with quantity');
    }

    const boolIssues = [];
    BOOLEAN_COLUMNS.forEach(col => {
      if (state.headers.indexOf(col) === -1) return;
      state.rows.forEach((row, i) => {
        if (rowTypes.isImage[i]) return;
        const val = row[col];
        if (isBlank(val)) return;
        const norm = normalizeBoolean(val);
        if (norm === null) boolIssues.push({ row: i + 2, column: col, value: String(val) });
      });
    });
    if (boolIssues.length > 0) {
      const n = boolIssues.length;
      issues.push(makeIssue('warning', 'BOOLEAN_FORMAT', 'Non-standard boolean value on ' + pcount(n, 'row'), {
        what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'uses', 'use') + ' a non-standard boolean.',
        why_it_matters: 'Shopify expects TRUE or FALSE.',
        suggested_action: 'Autonom can normalize these.',
        affected_rows: boolIssues.slice(0, 10), auto_fix: 'safe_automatic'
      }));
    } else if (BOOLEAN_COLUMNS.some(c => state.headers.indexOf(c) !== -1)) passed.push('All boolean columns use TRUE/FALSE');

    if (state.headers.indexOf('Product Category') !== -1) {
      const badCat = [];
      state.rows.forEach((row, i) => {
        if (rowTypes.isImage[i]) return;
        const val = row['Product Category'];
        if (isBlank(val)) return;
        if (!isValidCategoryFormat(val)) badCat.push({ row: i + 2, value: String(val).substring(0, 80) });
      });
      if (badCat.length > 0) {
        const n = badCat.length;
        issues.push(makeIssue('info', 'PRODUCT_CATEGORY_FORMAT', 'Product Category format may be invalid in ' + pcount(n, 'cell'), {
          what_is_wrong: pcount(n, 'Product Category value') + ' ' + v(n, 'doesn\'t', 'don\'t') + ' match Shopify\'s expected format.',
          why_it_matters: 'Shopify expects a breadcrumb or category ID.',
          suggested_action: 'Use Shopify\'s category picker.',
          affected_rows: badCat.slice(0, 10), auto_fix: 'never'
        }));
      } else passed.push('All Product Category values look valid');
    }

    const handleOrder = [];
    const seenHandles = new Set();
    state.rows.forEach(row => {
      const h = row['Handle'];
      if (isBlank(h)) return;
      if (!seenHandles.has(h)) { seenHandles.add(h); handleOrder.push(h); }
      else if (handleOrder[handleOrder.length - 1] !== h) handleOrder.push('__scattered__');
    });
    if (handleOrder.indexOf('__scattered__') !== -1) {
      issues.push(makeIssue('info', 'ROW_ORDER_WARNING', 'Variant rows for the same product are not grouped together', {
        what_is_wrong: 'Rows sharing a Handle are not adjacent.',
        why_it_matters: 'Image and option association may be affected.',
        suggested_action: 'Sort the file by Handle before importing.',
        auto_fix: 'never'
      }));
    } else passed.push('Variant rows grouped by Handle');

    const priceIssuesNonNum = [], priceIssuesComma = [], priceIssuesCurrency = [], priceIssuesNegative = [];
    const PRICE_COLS = ['Variant Price', 'Variant Compare At Price'];
    state.rows.forEach((row, i) => {
      if (rowTypes.isImage[i]) return;
      PRICE_COLS.forEach(col => {
        if (state.headers.indexOf(col) === -1) return;
        const raw = row[col];
        if (isBlank(raw)) return;
        const a = analyzePrice(raw);
        if (a.hasCurrency) priceIssuesCurrency.push({ row: i + 2, column: col, value: String(raw) });
        if (a.commaDecimal) priceIssuesComma.push({ row: i + 2, column: col, value: String(raw), normalized: a.normalized });
        if (!a.parseable) priceIssuesNonNum.push({ row: i + 2, column: col, value: String(raw) });
        else if (a.value < 0) priceIssuesNegative.push({ row: i + 2, column: col, value: String(raw) });
      });
    });

    if (priceIssuesCurrency.length > 0) {
      const n = priceIssuesCurrency.length;
      issues.push(makeIssue('warning', 'PRICE_CURRENCY_SYMBOL', 'Currency symbols in ' + pcount(n, 'price cell'), {
        what_is_wrong: pcount(n, 'price cell') + ' ' + v(n, 'contains', 'contain') + ' currency symbols.',
        why_it_matters: 'Shopify expects a plain number.',
        suggested_action: 'Autonom can strip currency symbols.',
        affected_rows: priceIssuesCurrency.slice(0, 10), auto_fix: 'safe_automatic'
      }));
    }

    if (priceIssuesComma.length > 0) {
      const n = priceIssuesComma.length;
      issues.push(makeIssue('warning', 'PRICE_DECIMAL_COMMA', 'Comma-decimal prices detected in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'price') + ' ' + v(n, 'uses', 'use') + ' a comma as the decimal separator.',
        why_it_matters: 'Shopify expects a dot.',
        suggested_action: 'Autonom can convert comma decimals to dots.',
        affected_rows: priceIssuesComma.slice(0, 10), auto_fix: 'review_required'
      }));
    }

    if (priceIssuesNonNum.length > 0) {
      const n = priceIssuesNonNum.length;
      issues.push(makeIssue('warning', 'PRICE_NON_NUMERIC', 'Non-numeric price value in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'price cell') + ' could not be parsed as a number.',
        why_it_matters: 'Shopify will reject or ignore these rows.',
        suggested_action: 'Enter a plain numeric value.',
        affected_rows: priceIssuesNonNum.slice(0, 10)
      }));
    } else if (state.headers.indexOf('Variant Price') !== -1) passed.push('All prices numeric');

    if (priceIssuesNegative.length > 0) {
      const n = priceIssuesNegative.length;
      issues.push(makeIssue('warning', 'PRICE_NEGATIVE', 'Negative price value in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'price') + ' ' + v(n, 'is', 'are') + ' negative.',
        why_it_matters: 'Shopify may reject these rows.',
        suggested_action: 'Confirm the value is intentional, or correct it.',
        affected_rows: priceIssuesNegative.slice(0, 10)
      }));
    }

    const compareIssues = [];
    if (state.headers.indexOf('Variant Price') !== -1 && state.headers.indexOf('Variant Compare At Price') !== -1) {
      const firstRowByHandle = {};
      state.rows.forEach((row, i) => {
        const h = row['Handle'];
        if (isBlank(h)) return;
        if (h in firstRowByHandle) return;
        firstRowByHandle[h] = i;
      });
      Object.keys(firstRowByHandle).forEach(h => {
        const i = firstRowByHandle[h];
        const row = state.rows[i];
        const pa = analyzePrice(row['Variant Price']);
        const ca = analyzePrice(row['Variant Compare At Price']);
        if (pa.parseable && ca.parseable && ca.value > 0 && ca.value <= pa.value) {
          compareIssues.push({ row: i + 2, handle: h, price: row['Variant Price'], compare_at: row['Variant Compare At Price'] });
        }
      });
    }
    if (compareIssues.length > 0) {
      const n = compareIssues.length;
      issues.push(makeIssue('critical', 'COMPARE_AT_PRICE_LOWER_THAN_PRICE', 'Compare-at price lower than price for ' + pcount(n, 'product'), {
        what_is_wrong: pcount(n, 'product') + ' ' + v(n, 'has', 'have') + ' a compare-at price ≤ price.',
        why_it_matters: 'Shopify rejects this or shows an incorrect sale badge.',
        suggested_action: 'Set Compare At higher than Price, or clear it.',
        affected_rows: compareIssues.slice(0, 10), auto_fix: 'never'
      }));
    } else passed.push('Compare-at prices are consistent with prices');

    const nonInt = [], negInv = [];
    state.rows.forEach((row, i) => {
      if (rowTypes.isImage[i]) return;
      const q = row['Variant Inventory Qty'];
      if (isBlank(q)) return;
      const n = Number(String(q).trim());
      if (isNaN(n) || !Number.isInteger(n)) nonInt.push({ row: i + 2, value: q });
      else if (n < 0) negInv.push({ row: i + 2, value: q });
    });
    if (nonInt.length > 0) {
      const n = nonInt.length;
      issues.push(makeIssue('warning', 'INVENTORY_NON_INTEGER', 'Non-integer inventory value in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'inventory cell') + ' ' + v(n, 'is', 'are') + ' not a whole number.',
        why_it_matters: 'Shopify expects integers.',
        suggested_action: 'Enter a whole number.',
        affected_rows: nonInt.slice(0, 10)
      }));
    } else if (state.headers.indexOf('Variant Inventory Qty') !== -1) passed.push('All inventory values are integers');

    if (negInv.length > 0) {
      const n = negInv.length;
      issues.push(makeIssue('warning', 'INVENTORY_NEGATIVE', 'Negative inventory value in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'inventory cell') + ' ' + v(n, 'is', 'are') + ' negative.',
        why_it_matters: 'Shopify may reject these.',
        suggested_action: 'Verify or correct.',
        affected_rows: negInv.slice(0, 10)
      }));
    }

    const unclosed = [], dangerous = [];
    state.rows.forEach((row, i) => {
      const html = row['Body (HTML)'];
      if (isBlank(html)) return;
      const text = String(html);
      const dm = text.match(/<(script|iframe|object|embed)\b/i);
      if (dm) dangerous.push({ row: i + 2, match: dm[1] });
      const re = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
      const stack = [];
      let m;
      while ((m = re.exec(text)) !== null) {
        const full = m[0], tag = m[1].toLowerCase();
        if (/^<\//.test(full)) {
          if (stack.length && stack[stack.length - 1] === tag) stack.pop();
        } else if (!/\/>$/.test(full)) stack.push(tag);
      }
      if (stack.length > 0) unclosed.push({ row: i + 2, tag: stack[stack.length - 1] });
    });
    if (unclosed.length > 0) {
      const n = unclosed.length;
      issues.push(makeIssue('warning', 'HTML_UNCLOSED_TAG', 'Unclosed HTML tag in ' + pcount(n, 'description'), {
        what_is_wrong: pcount(n, 'description') + ' ' + v(n, 'has', 'have') + ' unclosed HTML.',
        why_it_matters: 'Unclosed tags may break your storefront.',
        suggested_action: 'Autonom can attempt to repair.',
        affected_rows: unclosed.slice(0, 10), auto_fix: 'review_required'
      }));
    } else if (state.headers.indexOf('Body (HTML)') !== -1) passed.push('No unclosed HTML tags');

    if (dangerous.length > 0) {
      const n = dangerous.length;
      issues.push(makeIssue('warning', 'HTML_DANGEROUS_ATTRIBUTE', 'Potentially unsafe HTML tag in ' + pcount(n, 'description'), {
        what_is_wrong: pcount(n, 'description') + ' ' + v(n, 'contains', 'contain') + ' unsafe tags.',
        why_it_matters: 'May be blocked by Shopify.',
        suggested_action: 'Remove the tag.',
        affected_rows: dangerous.slice(0, 10)
      }));
    }

    const httpImgs = [], noExtImgs = [], privateCdnImgs = [], malformedImgs = [];
    state.rows.forEach((row, i) => {
      const url = row['Image Src'];
      if (isBlank(url)) return;
      const s = String(url).trim();
      if (/^http:\/\//i.test(s)) httpImgs.push({ row: i + 2, url: s });
      let parsed = null;
      try { parsed = new URL(s); } catch (e) { malformedImgs.push({ row: i + 2, url: s }); }
      if (parsed) {
        if (PRIVATE_CDN_PATTERN.test(parsed.hostname)) privateCdnImgs.push({ row: i + 2, url: s, host: parsed.hostname });
        if (!IMAGE_EXTENSIONS.test(parsed.pathname)) noExtImgs.push({ row: i + 2, url: s });
      }
    });

    if (httpImgs.length > 0) {
      const n = httpImgs.length;
      issues.push(makeIssue('warning', 'IMAGE_URL_NOT_HTTPS', 'Image URL does not use HTTPS in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'image URL') + ' ' + v(n, 'does', 'do') + ' not use https://.',
        why_it_matters: 'Shopify requires HTTPS.',
        suggested_action: 'Autonom can upgrade to HTTPS.',
        affected_rows: httpImgs.slice(0, 10), auto_fix: 'review_required'
      }));
    } else if (state.headers.indexOf('Image Src') !== -1) passed.push('All image URLs use HTTPS');

    if (noExtImgs.length > 0) {
      const n = noExtImgs.length;
      issues.push(makeIssue('warning', 'IMAGE_URL_NO_EXTENSION', 'Image URL without a file extension in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'image URL') + ' ' + v(n, 'doesn\'t', 'don\'t') + ' end in a recognizable extension.',
        why_it_matters: 'Shopify may not be able to download it.',
        suggested_action: 'Use direct URLs ending in .jpg, .png, .webp, or .gif.',
        affected_rows: noExtImgs.slice(0, 10)
      }));
    }

    if (privateCdnImgs.length > 0) {
      const n = privateCdnImgs.length;
      issues.push(makeIssue('warning', 'IMAGE_URL_PRIVATE_CDN', 'Image URL points to a private or local address in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'image URL') + ' ' + v(n, 'points', 'point') + ' to a private address.',
        why_it_matters: 'Shopify cannot access these URLs.',
        suggested_action: 'Host the images on a public CDN.',
        affected_rows: privateCdnImgs.slice(0, 10)
      }));
    }

    if (malformedImgs.length > 0) {
      const n = malformedImgs.length;
      issues.push(makeIssue('warning', 'IMAGE_URL_MALFORMED', 'Image URL could not be parsed in ' + pcount(n, 'cell'), {
        what_is_wrong: pcount(n, 'image URL') + ' ' + v(n, 'is', 'are') + ' not a valid URL.',
        why_it_matters: 'Shopify cannot download these images.',
        suggested_action: 'Verify the URL is complete.',
        affected_rows: malformedImgs.slice(0, 10)
      }));
    }

    if (state.headers.indexOf('Status') !== -1) {
      const invalidS = [];
      state.rows.forEach((row, i) => {
        if (rowTypes.isImage[i]) return;
        const s = row['Status'];
        if (isBlank(s)) return;
        if (['active', 'draft', 'archived'].indexOf(String(s).trim().toLowerCase()) === -1)
          invalidS.push({ row: i + 2, value: s });
      });
      if (invalidS.length > 0) {
        const n = invalidS.length;
        issues.push(makeIssue('warning', 'STATUS_INVALID_VALUE', 'Invalid status value in ' + pcount(n, 'cell'), {
          what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'has', 'have') + ' an invalid status.',
          why_it_matters: 'Shopify may reject these rows.',
          suggested_action: 'Use one of: active, draft, archived.',
          affected_rows: invalidS.slice(0, 10)
        }));
      } else passed.push('All status values valid');
    }

    if (state.parseFieldMismatches > 0) {
      const n = state.parseFieldMismatches;
      issues.push(makeIssue('info', 'FIELD_COUNT_MISMATCH', 'CSV row field count mismatch in ' + pcount(n, 'row'), {
        what_is_wrong: pcount(n, 'row') + ' ' + v(n, 'has', 'have') + ' a different number of columns than the header.',
        why_it_matters: 'Unquoted commas in text fields may have shifted data.',
        suggested_action: 'Re-export the file with proper quoting.',
        auto_fix: 'never'
      }));
    }

    return { issues, passed };
  }

  function calculateImpact() {
    const handles = {};
    state.rows.forEach(row => {
      if (isBlank(row['Handle'])) return;
      const h = row['Handle'];
      if (!handles[h]) handles[h] = { prices: {}, inv: {} };
      if (!isBlank(row['Variant Price'])) handles[h].prices[row['Variant Price']] = true;
      if (!isBlank(row['Variant Inventory Qty'])) handles[h].inv[row['Variant Inventory Qty']] = true;
    });
    let changedPrices = 0, changedInv = 0;
    Object.values(handles).forEach(e => {
      if (Object.keys(e.prices).length > 1) changedPrices++;
      if (Object.keys(e.inv).length > 1) changedInv++;
    });
    let blankCount = 0;
    if (state.mode === 'existing_products') {
      SENSITIVE_COLUMNS.forEach(col => {
        if (state.headers.indexOf(col) === -1) return;
        state.rows.forEach(row => { if (isBlank(row[col])) blankCount++; });
      });
    }
    return { matching_handles: Object.keys(handles).length, changed_prices: changedPrices, changed_inventory: changedInv, blank_included_values: blankCount };
  }

  function buildResult(issues, passed) {
    const counts = { critical: 0, warning: 0, info: 0 };
    issues.forEach(i => { counts[i.severity] = (counts[i.severity] || 0) + 1; });
    let status = 'READY_FOR_REVIEW';
    if (counts.critical > 0) status = 'NOT_READY';
    else if (counts.warning > 0) status = 'READY_WITH_WARNINGS';
    return {
      status, tool: 'shopify-guard', tool_version: '2.0.1',
      profile: 'shopify-product-csv', profile_version: '2025-01',
      mode: state.mode, detected_mode: state.detectedMode, detected_confidence: state.detectedConfidence,
      summary: { critical: counts.critical, warnings: counts.warning, info: counts.info, passed: passed.length, rows_scanned: state.rows.length, columns_detected: state.headers.length },
      issues, passed_checks: passed,
      potential_impact: state.mode === 'existing_products' ? calculateImpact() : null,
      technical_metadata: { file_name: state.fileName, byte_size: state.fileSize, encoding: state.detectedEncoding, has_bom: state.hasBOM }
    };
  }

  function buildCorrectedCSV() {
    const accepted = state.acceptedRepairs || {};
    const rows = state.rows.map(r => Object.assign({}, r));
    const headers = state.headers.slice();
    const changeLog = [];
    const appliedCodes = new Set();

    function hasCol(col) { return headers.indexOf(col) !== -1; }

    if (state.hasBOM) {
      changeLog.push({ row: 'all', column: '(file)', before: 'BOM present', after: 'BOM removed', reason: 'Stripped UTF-8 byte-order mark' });
      appliedCodes.add('ENCODING_BOM_PRESENT');
    }
    if (state.detectedEncoding !== 'UTF-8') {
      changeLog.push({ row: 'all', column: '(file)', before: state.detectedEncoding, after: 'UTF-8', reason: 'Converted encoding to UTF-8' });
      appliedCodes.add('ENCODING_NOT_UTF8');
    }

    let smartQuoteTouched = false;
    rows.forEach((row, i) => {
      for (const key of Object.keys(row)) {
        const val = row[key];
        if (val == null) continue;
        const before = String(val);
        if (SMART_QUOTE_CHARS.test(before)) {
          const after = smartQuotesToStraight(before);
          if (after !== before) {
            row[key] = after;
            changeLog.push({ row: i + 2, column: key, before: before.substring(0, 80), after: after.substring(0, 80), reason: 'Replaced smart quotes' });
            smartQuoteTouched = true;
          }
        }
      }
    });
    if (smartQuoteTouched) appliedCodes.add('SMART_QUOTES_DETECTED');

    let whitespaceTouched = false;
    rows.forEach((row, i) => {
      for (const col of TEXT_COLUMNS_FOR_WHITESPACE) {
        if (state.headers.indexOf(col) === -1) continue;
        const val = row[col];
        if (val == null) continue;
        const before = String(val);
        const after = before.trim();
        if (after !== before && after !== '') {
          row[col] = after;
          changeLog.push({ row: i + 2, column: col, before, after, reason: 'Trimmed whitespace' });
          whitespaceTouched = true;
        }
      }
    });
    if (whitespaceTouched) appliedCodes.add('CELL_WHITESPACE');

    let currencyTouched = false;
    rows.forEach((row, i) => {
      ['Variant Price', 'Variant Compare At Price', 'Cost per item'].forEach(col => {
        if (state.headers.indexOf(col) === -1) return;
        const val = row[col];
        if (val == null || val === '') return;
        const before = String(val);
        if (CURRENCY_SYMBOLS.test(before)) {
          const after = stripCurrencySymbols(before);
          row[col] = after;
          changeLog.push({ row: i + 2, column: col, before, after, reason: 'Stripped currency symbol' });
          currencyTouched = true;
        }
      });
    });
    if (currencyTouched) appliedCodes.add('PRICE_CURRENCY_SYMBOL');

    let boolTouched = false;
    BOOLEAN_COLUMNS.forEach(col => {
      if (state.headers.indexOf(col) === -1) return;
      rows.forEach((row, i) => {
        const val = row[col];
        if (isBlank(val)) return;
        const norm = normalizeBoolean(val);
        if (norm !== null && norm !== String(val).trim()) {
          const before = String(val);
          row[col] = norm;
          changeLog.push({ row: i + 2, column: col, before, after: norm, reason: 'Normalized boolean value' });
          boolTouched = true;
        }
      });
    });
    if (boolTouched) appliedCodes.add('BOOLEAN_FORMAT');

    let handleNormTouched = false;
    rows.forEach((row, i) => {
      const h = row['Handle'];
      if (isBlank(h)) return;
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(h)) {
        const before = h;
        const after = toHandle(h);
        if (after && after !== before) {
          row['Handle'] = after;
          changeLog.push({ row: i + 2, column: 'Handle', before, after, reason: 'Normalized handle format' });
          handleNormTouched = true;
        }
      }
    });
    if (handleNormTouched) appliedCodes.add('HANDLE_FORMAT_INVALID');

    const dupImgsToRemove = duplicateImageRows();
    if (dupImgsToRemove.length > 0 && hasCol('Image Src')) {
      const toRemove = new Set(dupImgsToRemove.map(d => d.row - 2));
      const kept = [];
      rows.forEach((r, i) => {
        if (toRemove.has(i)) {
          changeLog.push({ row: i + 2, column: 'Image Src', before: r['Image Src'] || '', after: '(row removed)', reason: 'Removed duplicate image row' });
        } else kept.push(r);
      });
      rows.length = 0;
      kept.forEach(r => rows.push(r));
      appliedCodes.add('DUPLICATE_IMAGE_ROWS');
    }

    state.result.issues.forEach(issue => {
      if (issue.code === 'DESTRUCTIVE_BLANK_ALL_ROWS' && issue.auto_fix === 'safe_automatic') {
        const m = issue.title.match(/"([^"]+)"/);
        if (m) {
          const col = m[1];
          const idx = headers.indexOf(col);
          if (idx !== -1) {
            headers.splice(idx, 1);
            rows.forEach(r => delete r[col]);
            changeLog.push({ row: 'all', column: col, before: '(present)', after: '(removed)', reason: 'Entirely blank column' });
            appliedCodes.add('DESTRUCTIVE_BLANK_ALL_ROWS');
          }
        }
      }
    });

    Object.keys(accepted).forEach(key => {
      if (key.indexOf('REMOVE_COLUMN:') === 0 && accepted[key]) {
        const col = key.substring('REMOVE_COLUMN:'.length);
        const idx = headers.indexOf(col);
        if (idx !== -1) {
          headers.splice(idx, 1);
          rows.forEach(r => delete r[col]);
          changeLog.push({ row: 'all', column: col, before: '(included with blanks)', after: '(removed)', reason: 'Removed to prevent destructive overwrites' });
          appliedCodes.add('REMOVE_COLUMN:' + col);
        }
      }
    });

    if (accepted['HANDLE_MISSING_NEW'] && hasCol('Title')) {
      let touched = false;
      if (!hasCol('Handle')) {
        const titleIdx = headers.indexOf('Title');
        if (titleIdx !== -1) headers.splice(titleIdx + 1, 0, 'Handle');
        else headers.push('Handle');
        changeLog.push({ row: 'all', column: '(file)', before: '(no Handle column)', after: 'Handle column added', reason: 'Added Handle column so rows can be matched by Shopify' });
        appliedCodes.add('HANDLE_MISSING_NEW');
        touched = true;
      }
      rows.forEach((row, i) => {
        if (isBlank(row['Handle']) && !isBlank(row['Title'])) {
          const before = row['Handle'] || '';
          row['Handle'] = toHandle(row['Title']);
          changeLog.push({ row: i + 2, column: 'Handle', before: before || '(empty)', after: row['Handle'], reason: 'Generated from Title' });
          touched = true;
        }
      });
      if (touched) appliedCodes.add('HANDLE_MISSING_NEW');
    }

    if (accepted['IMAGE_URL_NOT_HTTPS'] && hasCol('Image Src')) {
      let touched = false;
      rows.forEach((row, i) => {
        const url = row['Image Src'];
        if (url != null && /^http:\/\//i.test(url)) {
          const before = url;
          row['Image Src'] = String(url).replace(/^http:\/\//i, 'https://');
          changeLog.push({ row: i + 2, column: 'Image Src', before, after: row['Image Src'], reason: 'Upgraded to HTTPS' });
          touched = true;
        }
      });
      if (touched) appliedCodes.add('IMAGE_URL_NOT_HTTPS');
    }

    if (accepted['HTML_UNCLOSED_TAG'] && hasCol('Body (HTML)')) {
      let touched = false;
      rows.forEach((row, i) => {
        const html = row['Body (HTML)'];
        if (isBlank(html)) return;
        const before = String(html);
        const after = repairHTML(before);
        if (after !== before) {
          row['Body (HTML)'] = after;
          changeLog.push({ row: i + 2, column: 'Body (HTML)', before, after, reason: 'Repaired unclosed HTML tags' });
          touched = true;
        }
      });
      if (touched) appliedCodes.add('HTML_UNCLOSED_TAG');
    }

    if (accepted['PRICE_DECIMAL_COMMA']) {
      let touched = false;
      rows.forEach((row, i) => {
        ['Variant Price', 'Variant Compare At Price'].forEach(col => {
          if (state.headers.indexOf(col) === -1) return;
          if (headers.indexOf(col) === -1) return;
          const val = row[col];
          if (val == null || val === '') return;
          const a = analyzePrice(val);
          if (a.commaDecimal && a.parseable) {
            const before = String(val);
            const after = String(a.value);
            row[col] = after;
            changeLog.push({ row: i + 2, column: col, before, after, reason: 'Converted comma decimal to dot' });
            touched = true;
          }
        });
      });
      if (touched) appliedCodes.add('PRICE_DECIMAL_COMMA');
    }

    if (accepted['IMAGE_ROW_VARIANT_DATA']) {
      let touched = false;
      const byHandle = {};
      rows.forEach((r, i) => {
        const h = r['Handle'];
        if (isBlank(h)) return;
        if (!byHandle[h]) byHandle[h] = [];
        byHandle[h].push({ idx: i, row: r });
      });
      const toClean = [];
      Object.keys(byHandle).forEach(h => {
        const entries = byHandle[h];
        const variantIdxs = [], imageIdxs = [];
        entries.forEach(e => {
          const rr = e.row;
          const hasSku = !isBlank(rr['Variant SKU']);
          const hasPrice = !isBlank(rr['Variant Price']);
          const hasOpt = !isBlank(rr['Option1 Value']);
          const hasTitle = !isBlank(rr['Title']);
          const hasImage = !isBlank(rr['Image Src']);
          if (hasSku || hasPrice || hasOpt) variantIdxs.push(e.idx);
          else if (hasImage && !hasTitle) imageIdxs.push(e.idx);
        });
        if (variantIdxs.length > 0) imageIdxs.forEach(idx => toClean.push(idx));
      });
      const colsToClear = ['Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
        'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
        'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Price',
        'Variant Compare At Price', 'Variant Inventory Qty', 'Status'];
      toClean.forEach(idx => {
        colsToClear.forEach(col => {
          if (state.headers.indexOf(col) === -1) return;
          if (!isBlank(rows[idx][col])) {
            changeLog.push({ row: idx + 2, column: col, before: String(rows[idx][col]).substring(0, 60), after: '(cleared)', reason: 'Cleared stray data from image row' });
            rows[idx][col] = '';
            touched = true;
          }
        });
      });
      if (touched) appliedCodes.add('IMAGE_ROW_VARIANT_DATA');
    }

    if (accepted['SINGLE_VARIANT_MULTIPLE_IMAGES']) {
      let touched = false;
      const byHandle = {};
      rows.forEach((r, i) => {
        const h = r['Handle'];
        if (isBlank(h)) return;
        if (!byHandle[h]) byHandle[h] = [];
        byHandle[h].push({ idx: i, row: r });
      });
      Object.keys(byHandle).forEach(h => {
        const entries = byHandle[h];
        const variantIdxs = [], imageIdxs = [];
        entries.forEach(e => {
          const rr = e.row;
          const hasSku = !isBlank(rr['Variant SKU']);
          const hasPrice = !isBlank(rr['Variant Price']);
          const hasOpt = !isBlank(rr['Option1 Value']);
          const hasTitle = !isBlank(rr['Title']);
          const hasImage = !isBlank(rr['Image Src']);
          if (hasSku || hasPrice || hasOpt) variantIdxs.push(e.idx);
          else if (hasImage && !hasTitle) imageIdxs.push(e.idx);
        });
        if (variantIdxs.length === 1 && imageIdxs.length > 0) {
          const pi = variantIdxs[0];
          const parent = rows[pi];
          if (isBlank(parent['Option1 Name']) && isBlank(parent['Option1 Value'])) {
            if (state.headers.indexOf('Option1 Name') !== -1 && headers.indexOf('Option1 Name') !== -1) {
              parent['Option1 Name'] = 'Title';
              changeLog.push({ row: pi + 2, column: 'Option1 Name', before: '(blank)', after: 'Title', reason: 'Set Title option for single-variant product' });
              touched = true;
            }
            if (state.headers.indexOf('Option1 Value') !== -1 && headers.indexOf('Option1 Value') !== -1) {
              parent['Option1 Value'] = 'Default Title';
              changeLog.push({ row: pi + 2, column: 'Option1 Value', before: '(blank)', after: 'Default Title', reason: 'Set Default Title for single-variant product' });
              touched = true;
            }
          }
        }
      });
      if (touched) appliedCodes.add('SINGLE_VARIANT_MULTIPLE_IMAGES');
    }

    if (accepted['INVENTORY_QTY_MISSING_WITH_TRACKER']) {
      let touched = false;
      if (state.headers.indexOf('Variant Inventory Qty') !== -1 && headers.indexOf('Variant Inventory Qty') !== -1) {
        rows.forEach((row, i) => {
          if (rowTypes_isImageRow(row)) return;
          const tracker = row['Variant Inventory Tracker'];
          const qty = row['Variant Inventory Qty'];
          if (!isBlank(tracker) && isBlank(qty)) {
            row['Variant Inventory Qty'] = '0';
            changeLog.push({ row: i + 2, column: 'Variant Inventory Qty', before: '(blank)', after: '0', reason: 'Set missing quantity to 0' });
            touched = true;
          }
        });
      }
      if (touched) appliedCodes.add('INVENTORY_QTY_MISSING_WITH_TRACKER');
    }

    if (accepted['SKU_DUPLICATE_IN_FILE'] && headers.indexOf('Variant SKU') !== -1) {
      let touched = false;
      const usedSkus = new Set();
      rows.forEach((row, i) => {
        const sku = row['Variant SKU'];
        if (isBlank(sku)) return;
        const before = String(sku).trim();
        const after = makeUniqueSku(before, usedSkus);
        if (after !== before) {
          row['Variant SKU'] = after;
          changeLog.push({ row: i + 2, column: 'Variant SKU', before, after, reason: 'Suffixed to make unique' });
          touched = true;
        }
      });
      if (touched) appliedCodes.add('SKU_DUPLICATE_IN_FILE');
    }

    if (accepted['DUPLICATE_IDENTICAL_ROWS']) {
      let touched = false;
      const sigs = {};
      const toRemove = new Set();
      rows.forEach((row, i) => {
        const sig = headers.map(h => String(row[h] == null ? '' : row[h]).trim()).join('\u0001');
        if (sig.replace(/\u0001/g, '') === '') return;
        if (sigs[sig]) toRemove.add(i);
        else sigs[sig] = i;
      });
      if (toRemove.size > 0) {
        const kept = [];
        rows.forEach((r, i) => {
          if (toRemove.has(i)) {
            changeLog.push({ row: i + 2, column: '(row)', before: r['Handle'] || '(no handle)', after: '(row removed)', reason: 'Removed identical duplicate row' });
            touched = true;
          } else kept.push(r);
        });
        rows.length = 0;
        kept.forEach(r => rows.push(r));
      }
      if (touched) appliedCodes.add('DUPLICATE_IDENTICAL_ROWS');
    }

    const csv = (typeof Papa !== 'undefined' && Papa.unparse)
      ? Papa.unparse({ fields: headers, data: rows.map(r => headers.map(h => r[h] == null ? '' : r[h])) }, { quotes: true })
      : buildCSVManually(headers, rows);

    let finalCSV = csv;
    if (finalCSV.charCodeAt(0) === 0xFEFF) finalCSV = finalCSV.slice(1);

    if (accepted['DELIMITER_NOT_COMMA'] && state.detectedDelimiter !== ',') {
      changeLog.push({ row: 'all', column: '(file)', before: state.detectedDelimiter + '-separated', after: 'comma-separated', reason: 'Converted delimiter to comma' });
      appliedCodes.add('DELIMITER_NOT_COMMA');
    }

    let splitParts = null;
    if (accepted['FILE_SIZE_OVER_LIMIT_SPLIT']) {
      const finalBytes = new Blob([finalCSV]).size;
      if (finalBytes >= FILE_SIZE_LIMIT_BYTES) {
        const baseName = state.fileName.replace(/\.csv$/i, '');
        splitParts = splitRowsIntoChunks(rows, headers, SPLIT_TARGET_BYTES, baseName);
        if (splitParts) {
          appliedCodes.add('FILE_SIZE_OVER_LIMIT_SPLIT');
          changeLog.push({
            row: 'all', column: '(file)',
            before: formatBytes(finalBytes) + ' (over limit)',
            after: splitParts.length + ' parts, each under 15 MB',
            reason: 'Split into ' + splitParts.length + ' parts, products kept whole'
          });
        } else {
          changeLog.push({
            row: 'all', column: '(file)',
            before: formatBytes(finalBytes),
            after: '(could not split safely)',
            reason: 'A single product is too large to fit under the 15 MB limit'
          });
        }
      } else {
        changeLog.push({
          row: 'all', column: '(file)',
          before: formatBytes(state.fileSize),
          after: formatBytes(finalBytes),
          reason: 'File now fits under 15 MB after other fixes'
        });
      }
    }

    return { csv: finalCSV, changeLog, appliedCodes, splitParts };
  }

  function buildCSVManually(headers, rows) {
    const escape = val => {
      const s = val == null ? '' : String(val);
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const lines = [headers.map(escape).join(',')];
    rows.forEach(r => lines.push(headers.map(h => escape(r[h])).join(',')));
    return lines.join('\n');
  }

  function buildChangeLogCSV(log) {
    const lines = ['Row,Column,Before,After,Reason'];
    log.forEach(c => {
      const esc = val => '"' + String(val == null ? '' : val).replace(/"/g, '""') + '"';
      lines.push([c.row, c.column, c.before, c.after, c.reason].map(esc).join(','));
    });
    return lines.join('\n');
  }

  function buildReportHTML() {
    const r = state.result;
    let h = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Autonom Shopify Guard — Readiness Report</title>';
    h += '<style>body{font-family:-apple-system,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1a1d23;line-height:1.55;}h1{border-bottom:2px solid #1a1d23;padding-bottom:10px;}h2{margin-top:32px;font-size:18px;}table{width:100%;border-collapse:collapse;margin:12px 0;}th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #e1e4e9;font-size:13px;}th{background:#f7f8fa;}.critical{color:#d92b2b;font-weight:600;}.warning{color:#c47a00;font-weight:600;}.info{color:#4b5b74;}.passed{color:#17864a;}</style></head><body>';
    h += '<h1>Autonom Shopify Guard — Readiness Report</h1>';
    h += '<p><strong>File:</strong> ' + escapeHtml(r.technical_metadata.file_name) + '</p>';
    h += '<p><strong>Mode:</strong> ' + escapeHtml(r.mode) + (r.detected_mode ? ' (detected: ' + escapeHtml(r.detected_mode) + ', confidence: ' + escapeHtml(r.detected_confidence) + ')' : '') + '</p>';
    h += '<p><strong>Scan date:</strong> ' + new Date().toISOString() + '</p>';
    h += '<p><strong>Tool version:</strong> ' + r.tool_version + '</p>';
    h += '<h2>Status: ' + r.status.replace(/_/g, ' ') + '</h2>';
    h += '<p>Critical: <span class="critical">' + r.summary.critical + '</span> · Warnings: <span class="warning">' + r.summary.warnings + '</span> · Info: <span class="info">' + r.summary.info + '</span> · Passed: <span class="passed">' + r.summary.passed + '</span></p>';
    if (r.potential_impact) {
      h += '<h2>Potential Store Impact</h2><ul>';
      h += '<li>Products with matching handles: ' + r.potential_impact.matching_handles + '</li>';
      h += '<li>Products with changed prices: ' + r.potential_impact.changed_prices + '</li>';
      h += '<li>Products with changed inventory: ' + r.potential_impact.changed_inventory + '</li>';
      h += '<li>Products with blank included values: ' + r.potential_impact.blank_included_values + '</li>';
      h += '</ul>';
    }
    if (state.parseFieldMismatches > 0) {
      h += '<div style="background:#fdf6e6;border:1px solid #eedcb4;border-radius:8px;padding:16px;margin:20px 0;">';
      h += '<strong>⚠ Important limitation</strong>';
      h += '<p>This file contains ' + state.parseFieldMismatches + ' row(s) with a different number of columns than the header. Autonom skipped its destructive-blank check.</p>';
      h += '<p>Please re-export the file with proper quoting, then re-run the scan.</p>';
      h += '</div>';
    }
    if (r.issues.length) {
      h += '<h2>Issues</h2>';
      r.issues.forEach((i, idx) => {
        h += '<h3 class="' + i.severity + '">' + (idx + 1) + '. ' + escapeHtml(i.title) + '</h3>';
        if (i.what_is_wrong) h += '<p><strong>What is wrong:</strong> ' + escapeHtml(i.what_is_wrong) + '</p>';
        if (i.why_it_matters) h += '<p><strong>Why it matters:</strong> ' + escapeHtml(i.why_it_matters) + '</p>';
        if (i.suggested_action) h += '<p><strong>Suggested action:</strong> ' + escapeHtml(i.suggested_action) + '</p>';
      });
    }
    h += '<h2>Checks Performed</h2><ul>';
    r.passed_checks.forEach(c => { h += '<li>' + escapeHtml(c) + '</li>'; });
    h += '</ul>';
    h += '<h2>Limitations</h2><p>Autonom does not know your store\'s current data. Autonom cannot guarantee Shopify will accept this import.</p>';
    h += '<hr><p style="color:#8a94a3;font-size:12px;">Generated locally in your browser.</p>';
    h += '</body></html>';
    return h;
  }

  function buildBatchReportHTML() {
    let h = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Autonom Shopify Guard — Batch Readiness Report</title>';
    h += '<style>body{font-family:-apple-system,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#1a1d23;line-height:1.55;}h1{border-bottom:2px solid #1a1d23;padding-bottom:10px;}h2{margin-top:32px;font-size:18px;}h3{margin-top:24px;}.critical{color:#d92b2b;font-weight:600;}.warning{color:#c47a00;font-weight:600;}.info{color:#4b5b74;}.passed{color:#17864a;}.file-block{background:#f7f8fa;border-radius:8px;padding:16px 20px;margin:16px 0;}</style></head><body>';
    h += '<h1>Autonom Shopify Guard — Batch Report</h1>';
    h += '<p><strong>Files scanned:</strong> ' + state.files.length + '</p>';
    h += '<p><strong>Scan date:</strong> ' + new Date().toISOString() + '</p>';
    h += '<p><strong>Tool version:</strong> 2.0.1</p>';

    let agg = { critical: 0, warning: 0, info: 0, passed: 0 };
    state.files.forEach(f => {
      if (!f.result) return;
      agg.critical += f.result.summary.critical || 0;
      agg.warning += f.result.summary.warnings || 0;
      agg.info += f.result.summary.info || 0;
      agg.passed += f.result.summary.passed || 0;
    });
    h += '<h2>Combined summary</h2>';
    h += '<p>Critical: <span class="critical">' + agg.critical + '</span> · Warnings: <span class="warning">' + agg.warning + '</span> · Info: <span class="info">' + agg.info + '</span> · Passed: <span class="passed">' + agg.passed + '</span></p>';

    h += '<h2>Per-file details</h2>';
    state.files.forEach(f => {
      if (!f.result) return;
      const s = f.result.summary;
      h += '<div class="file-block">';
      h += '<h3>' + escapeHtml(f.fileName) + '</h3>';
      h += '<p>Mode: ' + escapeHtml(f.mode || '—') + ' · Rows: ' + s.rows_scanned + ' · Columns: ' + s.columns_detected + '</p>';
      h += '<p>Critical: <span class="critical">' + s.critical + '</span> · Warnings: <span class="warning">' + s.warnings + '</span> · Info: <span class="info">' + s.info + '</span> · Passed: <span class="passed">' + s.passed + '</span></p>';
      if (f.result.issues.length) {
        h += '<ul>';
        f.result.issues.forEach(i => {
          h += '<li><strong>' + escapeHtml(i.title) + '</strong> — ' + escapeHtml(i.what_is_wrong) + '</li>';
        });
        h += '</ul>';
      } else {
        h += '<p>No issues detected.</p>';
      }
      h += '</div>';
    });

    h += '<h2>Limitations</h2><p>Autonom does not know your store\'s current data. Autonom cannot guarantee Shopify will accept any import.</p>';
    h += '<hr><p style="color:#8a94a3;font-size:12px;">Generated locally in your browser.</p>';
    h += '</body></html>';
    return h;
  }

  function buildRowContext(affectedRows, columnName) {
    if (!affectedRows || !affectedRows.length) return null;
    const CONTEXT = 2, MAX_CLUSTERS = 3, MAX_ROWS_PER_CLUSTER = 15;
    const affectedNums = affectedRows.map(r => r.row).sort((a, b) => a - b);
    const clusters = [];
    let current = null;
    affectedNums.forEach(n => {
      if (!current) current = { start: n - CONTEXT, end: n + CONTEXT, targets: [n] };
      else if (n - current.end <= 1) { current.end = n + CONTEXT; current.targets.push(n); }
      else { clusters.push(current); current = { start: n - CONTEXT, end: n + CONTEXT, targets: [n] }; }
    });
    if (current) clusters.push(current);
    const limitedClusters = clusters.slice(0, MAX_CLUSTERS);
    const out = [];
    limitedClusters.forEach(cluster => {
      const start = Math.max(2, cluster.start);
      const end = Math.min(state.rows.length + 1, cluster.end);
      let count = 0;
      let rowNum;
      for (rowNum = start; rowNum <= end && count < MAX_ROWS_PER_CLUSTER; rowNum++) {
        const rowData = state.rows[rowNum - 2];
        if (!rowData) continue;
        out.push({ rowNum, isTarget: cluster.targets.indexOf(rowNum) !== -1, data: rowData });
        count++;
      }
      if (rowNum <= end) out.push({ rowNum: null, isTarget: false, truncated: true });
    });
    return { rows: out, hasMore: affectedNums.length > affectedRows.length || clusters.length > MAX_CLUSTERS, column: columnName };
  }

  function renderIssueRowsTable(issue, expanded) {
    if (!issue.affected_rows || !issue.affected_rows.length) return '';
    const columnGuess = issue.affected_column || (issue.title.match(/"([^"]+)"/) ? issue.title.match(/"([^"]+)"/)[1] : null);
    const baseCols = ['Handle', 'Title'];
    const extraCols = [];
    if (columnGuess && state.headers.indexOf(columnGuess) !== -1 && baseCols.indexOf(columnGuess) === -1) extraCols.push(columnGuess);
    const firstRow = issue.affected_rows[0];
    const rowKeys = Object.keys(firstRow).filter(k => !['row', 'proposed', 'proposed_handle'].includes(k));
    rowKeys.forEach(k => {
      if (baseCols.indexOf(k) === -1 && extraCols.indexOf(k) === -1 && state.headers.indexOf(k) !== -1) extraCols.push(k);
    });
    const showCols = baseCols.concat(extraCols).slice(0, 4);
    let html = '<div class="asg-issue-rows"><table><thead><tr><th>Row</th>';
    showCols.forEach(c => { html += '<th>' + escapeHtml(c) + '</th>'; });
    if (issue.affected_rows.some(r => r.proposed_handle || r.proposed)) html += '<th>Proposed</th>';
    html += '</tr></thead><tbody>';

    if (expanded) {
      const ctx = buildRowContext(issue.affected_rows, columnGuess);
      if (ctx) {
        ctx.rows.forEach(r => {
          if (r.truncated) { html += '<tr><td colspan="' + (showCols.length + 2) + '" style="text-align:center;color:#8a94a3;font-size:12px;padding:6px;">… rows omitted …</td></tr>'; return; }
          const cls = r.isTarget ? 'is-target-row' : 'is-context-row';
          html += '<tr class="' + cls + '"><td>' + r.rowNum + '</td>';
          showCols.forEach(c => { const val = r.data[c]; html += '<td>' + escapeHtml(isBlank(val) ? '(blank)' : String(val)) + '</td>'; });
          if (issue.affected_rows.some(x => x.proposed_handle || x.proposed)) {
            const target = issue.affected_rows.find(x => x.row === r.rowNum);
            html += '<td>' + (target && (target.proposed_handle || target.proposed) ? escapeHtml(target.proposed_handle || target.proposed) : '') + '</td>';
          }
          html += '</tr>';
        });
      }
    } else {
      issue.affected_rows.forEach(r => {
        html += '<tr class="is-target-row"><td>' + (r.row || '—') + '</td>';
        showCols.forEach(c => {
          const val = r[c];
          if (val !== undefined) html += '<td>' + escapeHtml(isBlank(val) ? '(blank)' : String(val)) + '</td>';
          else if (r.data && r.data[c] !== undefined) html += '<td>' + escapeHtml(isBlank(r.data[c]) ? '(blank)' : String(r.data[c])) + '</td>';
          else {
            const rowData = state.rows[(r.row || 0) - 2];
            const v2 = rowData ? rowData[c] : '';
            html += '<td>' + escapeHtml(isBlank(v2) ? '(blank)' : String(v2)) + '</td>';
          }
        });
        if (issue.affected_rows.some(x => x.proposed_handle || x.proposed)) html += '<td>' + escapeHtml(r.proposed_handle || r.proposed || '') + '</td>';
        html += '</tr>';
      });
    }
    html += '</tbody></table>';
    const rowCount = issue.affected_rows.length;
    html += '<div class="asg-issue-rows-controls"><span>' + rowCount + ' affected row' + (rowCount > 1 ? 's' : '') + '</span>';
    html += '<button type="button" data-context-toggle="' + escapeHtml(issue.code) + '">';
    html += expanded ? 'Hide context' : 'Show in context';
    html += '</button></div></div>';
    return html;
  }

  const STEPS = { landing: 1, 'batch-queue': 2, setup: 2, mapping: 2, 'compare-setup': 1, 'compare-report': 1, scanning: 3, report: 4, repair: 5, export: 6 };

  function showScreen(name) {
    document.querySelectorAll('.asg-screen').forEach(el => { el.hidden = el.dataset.screen !== name; });
    const step = STEPS[name] || 1;
    document.querySelectorAll('.asg-step').forEach(el => {
      const s = parseInt(el.dataset.step, 10);
      el.classList.remove('is-active', 'is-done');
      if (s === step) el.classList.add('is-active');
      else if (s < step) el.classList.add('is-done');
    });
    const newScanBtn = document.getElementById('asg-new-scan-btn');
    if (newScanBtn) newScanBtn.hidden = (name === 'landing');
    updateActionBar(name);
    const root = document.getElementById('autonom-shopify-guard');
    if (root) {
      const top = root.getBoundingClientRect().top + window.pageYOffset - 80;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }

  function updateActionBar(name) {
    const bar = document.getElementById('asg-actionbar');
    const primary = document.getElementById('asg-actionbar-primary');
    const secondary = document.getElementById('asg-actionbar-secondary');
    const back = document.getElementById('asg-actionbar-back');
    back.hidden = true; secondary.hidden = true; primary.hidden = false; primary.disabled = false;
    primary.className = 'asg-btn asg-btn-primary';
    if (name === 'landing' || name === 'scanning' || name === 'compare-setup') { bar.hidden = true; return; }
    bar.hidden = false;

    if (name === 'batch-queue') {
      back.hidden = false; back.textContent = '← Start over'; back.onclick = resetToLanding;
      primary.textContent = 'Scan all ' + state.files.length + ' files';
      primary.disabled = !state.batchMode;
      primary.onclick = runBatchScan;
    } else if (name === 'setup') {
      back.hidden = false; back.textContent = '← Start over'; back.onclick = resetToLanding;
      primary.textContent = 'Scan this CSV';
      primary.disabled = !state.mode || !state.file;
      primary.onclick = runScan;
    } else if (name === 'mapping') {
      back.hidden = false; back.textContent = '← Start over'; back.onclick = resetToLanding;
      secondary.hidden = false; secondary.textContent = 'Skip mapping';
      secondary.onclick = skipMappingAndContinue;
      primary.textContent = 'Apply and continue';
      primary.onclick = applyMappingAndContinue;
    } else if (name === 'compare-report') {
      secondary.hidden = false; secondary.textContent = 'Download comparison report';
      secondary.onclick = downloadCompareReport;
      primary.textContent = 'New comparison';
      primary.onclick = resetToLanding;
    } else if (name === 'report') {
      back.hidden = false; back.textContent = '← New scan'; back.onclick = resetToLanding;
      secondary.hidden = false; secondary.textContent = 'Download report (free)';
      secondary.onclick = () => {
        const isBatch = state.files.length > 1;
        const html = isBatch ? buildBatchReportHTML() : buildReportHTML();
        const fileName = isBatch ? 'autonom_batch_report.html' : state.fileName.replace(/\.csv$/i, '') + '_readiness_report.html';
        downloadBlob(html, fileName, 'text/html;charset=utf-8');
      };
      primary.textContent = 'Review and repair →';
      primary.onclick = renderRepair;
    } else if (name === 'repair') {
      back.hidden = false; back.textContent = '← Report'; back.onclick = () => {
        if (state.files.length > 1) renderBatchReport();
        else renderReport();
      };
      secondary.hidden = false; secondary.textContent = 'Skip repairs';
      secondary.onclick = () => {
        state.files.forEach(f => { f.acceptedRepairs = {}; });
        doExport();
      };
      primary.textContent = 'Generate corrected files';
      primary.onclick = doExport;
    } else if (name === 'export') {
      back.hidden = false; back.textContent = '← Back'; back.onclick = () => showScreen('repair');
      secondary.hidden = false; secondary.textContent = '↻ New scan';
      secondary.onclick = resetToLanding;
      primary.textContent = state.files.length > 1
        ? 'Download ZIP (' + state.files.length + ' files)'
        : 'Download ZIP';
      primary.onclick = downloadAll;
    }
  }

  function renderReport() {
    const r = state.result;
    const verdict = document.getElementById('asg-verdict');
    const badge = document.getElementById('asg-verdict-badge');
    const title = document.getElementById('asg-verdict-title');
    const sub = document.getElementById('asg-verdict-sub');
    verdict.classList.remove('is-critical', 'is-warning', 'is-passed');
    if (r.status === 'NOT_READY') {
      verdict.classList.add('is-critical'); badge.textContent = 'Not ready';
      title.textContent = 'Not ready for import';
      sub.textContent = pcount(r.summary.critical, 'critical issue') + ' may change existing product data.';
    } else if (r.status === 'READY_WITH_WARNINGS') {
      verdict.classList.add('is-warning'); badge.textContent = 'Ready with warnings';
      title.textContent = 'Ready with warnings';
      sub.textContent = pcount(r.summary.warnings, 'warning') + ' should be reviewed before import.';
    } else {
      verdict.classList.add('is-passed'); badge.textContent = 'Ready for review';
      title.textContent = 'Ready for review';
      sub.textContent = 'No critical issues detected by the checks performed.';
    }
    document.getElementById('asg-count-critical').textContent = r.summary.critical;
    document.getElementById('asg-count-warning').textContent = r.summary.warnings;
    document.getElementById('asg-count-info').textContent = r.summary.info;
    document.getElementById('asg-count-passed').textContent = r.summary.passed;
    if (r.potential_impact) {
      const impactEl = document.getElementById('asg-impact');
      const listEl = document.getElementById('asg-impact-list');
      impactEl.hidden = false;
      listEl.innerHTML = '';
      [
        ['Products with matching handles', r.potential_impact.matching_handles],
        ['Products with changed prices', r.potential_impact.changed_prices],
        ['Products with changed inventory', r.potential_impact.changed_inventory],
        ['Products with blank included values', r.potential_impact.blank_included_values]
      ].forEach(([label, val]) => {
        const li = document.createElement('li');
        li.innerHTML = '<span>' + escapeHtml(label) + '</span><strong>' + val + '</strong>';
        listEl.appendChild(li);
      });
    } else document.getElementById('asg-impact').hidden = true;
    renderIssues(r.issues, {});
    showScreen('report');
  }

  function renderBatchReport() {
    const agg = { critical: 0, warning: 0, info: 0, passed: 0 };
    state.files.forEach(f => {
      if (!f.result) return;
      agg.critical += f.result.summary.critical || 0;
      agg.warning += f.result.summary.warnings || 0;
      agg.info += f.result.summary.info || 0;
      agg.passed += f.result.summary.passed || 0;
    });

    let status = 'READY_FOR_REVIEW';
    if (agg.critical > 0) status = 'NOT_READY';
    else if (agg.warning > 0) status = 'READY_WITH_WARNINGS';

    const verdict = document.getElementById('asg-verdict');
    const badge = document.getElementById('asg-verdict-badge');
    const title = document.getElementById('asg-verdict-title');
    const sub = document.getElementById('asg-verdict-sub');
    verdict.classList.remove('is-critical', 'is-warning', 'is-passed');
    if (status === 'NOT_READY') {
      verdict.classList.add('is-critical'); badge.textContent = 'Not ready';
      title.textContent = 'Not ready for import';
      sub.textContent = pcount(agg.critical, 'critical issue') + ' across ' + state.files.length + ' files.';
    } else if (status === 'READY_WITH_WARNINGS') {
      verdict.classList.add('is-warning'); badge.textContent = 'Ready with warnings';
      title.textContent = 'Ready with warnings';
      sub.textContent = pcount(agg.warning, 'warning') + ' should be reviewed.';
    } else {
      verdict.classList.add('is-passed'); badge.textContent = 'Ready for review';
      title.textContent = 'Ready for review';
      sub.textContent = 'No critical issues detected.';
    }

    document.getElementById('asg-count-critical').textContent = agg.critical;
    document.getElementById('asg-count-warning').textContent = agg.warning;
    document.getElementById('asg-count-info').textContent = agg.info;
    document.getElementById('asg-count-passed').textContent = agg.passed;

    document.getElementById('asg-impact').hidden = true;

    const filesWrap = document.getElementById('asg-batch-files');
    if (filesWrap) {
      filesWrap.hidden = false;
      filesWrap.innerHTML = '';
      state.files.forEach((f, idx) => {
        const card = document.createElement('div');
        card.className = 'asg-batch-file-card';
        card.dataset.index = idx;
        const s = f.result && f.result.summary ? f.result.summary : { critical: 0, warnings: 0, info: 0, passed: 0, rows_scanned: 0 };
        card.innerHTML =
          '<span class="asg-batch-file-card-icon">📄</span>' +
          '<div class="asg-batch-file-card-body">' +
            '<div class="asg-batch-file-card-name">' + escapeHtml(f.fileName) + '</div>' +
            '<div class="asg-batch-file-card-counts">' +
              '<span class="is-critical">' + s.critical + ' critical</span> · ' +
              '<span class="is-warning">' + s.warnings + ' warnings</span> · ' +
              '<span class="is-passed">' + s.passed + ' passed</span> · ' +
              s.rows_scanned + ' rows' +
            '</div>' +
          '</div>';
        filesWrap.appendChild(card);
      });
    }

    const merged = [];
    state.files.forEach(f => {
      if (!f.result) return;
      f.result.issues.forEach(issue => {
        merged.push(Object.assign({}, issue, { _file: f.fileName }));
      });
    });

    renderIssues(merged, { showFileBadge: true });
    showScreen('report');
  }

  function renderIssues(issues, options) {
    options = options || {};
    const list = document.getElementById('asg-issues-list');
    const noIssues = document.getElementById('asg-no-issues');
    list.innerHTML = '';
    if (!issues.length) { noIssues.hidden = false; return; }
    noIssues.hidden = true;
    issues.forEach(issue => {
      const el = document.createElement('div');
      el.className = 'asg-issue is-' + issue.severity;
      el.dataset.severity = issue.severity;
      el.dataset.code = issue.code;
      if (issue._file) el.dataset.file = issue._file;
      const marker = issue.severity === 'critical' ? '!' : (issue.severity === 'warning' ? '!' : 'i');
      const fileBadge = options.showFileBadge && issue._file
        ? '<span class="asg-issue-file-badge">' + escapeHtml(issue._file) + '</span>'
        : '';
      let body = '';
      if (issue.what_is_wrong) body += '<div class="asg-issue-section-label">What is wrong</div><p>' + escapeHtml(issue.what_is_wrong) + '</p>';
      if (issue.why_it_matters) body += '<div class="asg-issue-section-label">Why this matters</div><p>' + escapeHtml(issue.why_it_matters) + '</p>';
      if (issue.affected_rows && issue.affected_rows.length) {
        body += '<div class="asg-issue-section-label">Affected rows</div>';
        body += renderIssueRowsTable(issue, !!state.showRowContext[issue.code]);
      }
      if (issue.suggested_action) body += '<div class="asg-issue-section-label">What you can do</div><p>' + escapeHtml(issue.suggested_action) + '</p>';
      let actions = '';
      if (issue.shopify_doc_url) actions += '<a class="asg-btn" href="' + escapeHtml(issue.shopify_doc_url) + '" target="_blank" rel="noopener">Shopify documentation →</a>';
      el.innerHTML = '<div class="asg-issue-head">' + fileBadge +
        '<span class="asg-issue-marker">' + marker + '</span>' +
        '<h4 class="asg-issue-title">' + escapeHtml(issue.title) + '</h4>' +
        '<span class="asg-issue-toggle">▾</span></div>' +
        '<div class="asg-issue-body" hidden>' + body +
        (actions ? '<div class="asg-issue-actions">' + actions + '</div>' : '') + '</div>';
      const head = el.querySelector('.asg-issue-head');
      const bodyEl = el.querySelector('.asg-issue-body');
      head.addEventListener('click', (e) => {
        if (e.target.closest('[data-context-toggle]')) return;
        bodyEl.hidden = !bodyEl.hidden;
        head.classList.toggle('is-open', !bodyEl.hidden);
      });
      const ctxBtn = el.querySelector('[data-context-toggle]');
      if (ctxBtn) {
        ctxBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const code = ctxBtn.getAttribute('data-context-toggle');
          state.showRowContext[code] = !state.showRowContext[code];
          renderIssues(issues, options);
          const reopened = document.querySelector('.asg-issue[data-code="' + code + '"]');
          if (reopened) {
            const h = reopened.querySelector('.asg-issue-head');
            const b = reopened.querySelector('.asg-issue-body');
            if (h && b) { b.hidden = false; h.classList.add('is-open'); }
          }
        });
      }
      list.appendChild(el);
    });
  }

  function renderRepair() {
    state.files.forEach((f, i) => {
      if (!f.result) return;
      const safe = [], review = [], never = [];
      f.result.issues.forEach(issue => {
        if (issue.auto_fix === 'safe_automatic') safe.push(issue);
        else if (issue.auto_fix === 'review_required') review.push(issue);
        else never.push(issue);
      });
      f.repairs = { safe, review, never };
    });

    const totalSafe = state.files.reduce((sum, f) => sum + ((f.repairs && f.repairs.safe.length) || 0), 0);
    const totalReview = state.files.reduce((sum, f) => sum + ((f.repairs && f.repairs.review.length) || 0), 0);
    const totalNever = state.files.reduce((sum, f) => sum + ((f.repairs && f.repairs.never.length) || 0), 0);

    let summaryParts = [];
    if (totalSafe > 0) summaryParts.push(pcount(totalSafe, 'automatic fix', 'automatic fixes') + ' across all files');
    else summaryParts.push('No automatic fixes needed');
    if (totalReview > 0) summaryParts.push(pcount(totalReview, 'fix', 'fixes') + (totalReview === 1 ? ' needs' : ' need') + ' your approval');
    else summaryParts.push('no fixes need your approval');
    if (totalNever > 0) summaryParts.push(pcount(totalNever, 'issue') + ' will be flagged');
    else summaryParts.push('nothing will be flagged');

    document.getElementById('asg-repair-summary').textContent = summaryParts.join('. ') + '.';

    const showFileBadge = state.files.length > 1;

    function renderList(container, items, allowAccept) {
      const ul = container.querySelector('.asg-repair-list');
      ul.innerHTML = '';
      if (!items.length) {
        const li = document.createElement('li');
        li.textContent = 'None'; li.style.color = '#8a94a3';
        ul.appendChild(li); return;
      }
      items.forEach(entry => {
        const issue = entry.issue;
        const fileIdx = entry.fileIdx;
        const li = document.createElement('li');
        let detail = '';
        if (issue.affected_rows && issue.affected_rows.length) {
          detail = issue.affected_rows.slice(0, 3).map(r => 'Row ' + r.row + (r.proposed_handle ? ' → ' + r.proposed_handle : (r.proposed ? ' → ' + r.proposed : ''))).join(' · ');
        }
        const fileBadge = showFileBadge
          ? '<span class="asg-issue-file-badge">' + escapeHtml(state.files[fileIdx].fileName) + '</span> '
          : '';
        let controls = '';
        if (allowAccept) {
          controls = '<input type="checkbox" data-accept="' + fileIdx + ':' + escapeHtml(issue.code) + '" checked style="margin-top:4px;">';
        }
        let removeColumnControl = '';
        if (issue.code === 'DESTRUCTIVE_BLANK_INCLUDED_COLUMN' && issue.alternative_fix === 'strip_column_with_user_approval') {
          const m = issue.title.match(/"([^"]+)"/);
          const colName = m ? m[1] : '';
          removeColumnControl = '<label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13px;color:#5b6471;cursor:pointer;"><input type="checkbox" data-remove-column="' + fileIdx + ':' + escapeHtml(colName) + '" checked> Remove the "' + escapeHtml(colName) + '" column from the corrected file</label>';
        }
        li.innerHTML = '<div style="flex:1;"><div>' + fileBadge + escapeHtml(issue.title) + '</div>' + (detail ? '<div class="asg-repair-detail">' + escapeHtml(detail) + '</div>' : '') + removeColumnControl + '</div>' + controls;
        ul.appendChild(li);
      });
    }

    const safeFlat = [];
    const reviewFlat = [];
    const neverFlat = [];
    state.files.forEach((f, i) => {
      if (!f.repairs) return;
      f.repairs.safe.forEach(issue => safeFlat.push({ fileIdx: i, issue }));
      f.repairs.review.forEach(issue => reviewFlat.push({ fileIdx: i, issue }));
      f.repairs.never.forEach(issue => neverFlat.push({ fileIdx: i, issue }));
    });

    const safeGroup = document.getElementById('asg-repair-safe');
    const reviewGroup = document.getElementById('asg-repair-review');
    const neverGroup = document.getElementById('asg-repair-never');
    safeGroup.hidden = !safeFlat.length;
    reviewGroup.hidden = !reviewFlat.length;
    neverGroup.hidden = !neverFlat.length;
    if (safeFlat.length) renderList(safeGroup, safeFlat, false);
    if (reviewFlat.length) renderList(reviewGroup, reviewFlat, true);
    if (neverFlat.length) renderList(neverGroup, neverFlat, false);
    showScreen('repair');
  }

  function renderExport() {
    let totalSafe = 0;
    let totalApproved = 0;
    let totalRemaining = 0;
    let totalSplitParts = 0;
    const allChangeEntries = [];

    state.files.forEach(f => {
      const appliedCodes = f.appliedCodes || new Set();
      const accepted = f.acceptedRepairs || {};
      const repairs = f.repairs || { safe: [], review: [], never: [] };

      repairs.safe.forEach(i => { if (appliedCodes.has(i.code)) totalSafe++; });
      Object.keys(accepted).forEach(k => {
        if (!accepted[k]) return;
        if (appliedCodes.has(k)) totalApproved++;
      });

      const resolvedColumns = new Set();
      Object.keys(accepted).forEach(k => {
        if (k.indexOf('REMOVE_COLUMN:') === 0 && accepted[k]) resolvedColumns.add(k.substring('REMOVE_COLUMN:'.length));
      });

      const remaining = repairs.never.filter(issue => {
        if (appliedCodes.has(issue.code)) return false;
        if (issue.code === 'DESTRUCTIVE_BLANK_INCLUDED_COLUMN') {
          const m = issue.title.match(/"([^"]+)"/);
          if (m && resolvedColumns.has(m[1])) return false;
        }
        return true;
      });
      totalRemaining += remaining.length;

      if (f.splitParts && f.splitParts.length > 0) totalSplitParts += f.splitParts.length;

      (f.changeLog || []).forEach(c => {
        allChangeEntries.push(Object.assign({}, c, { _file: f.fileName }));
      });
    });

    document.getElementById('asg-export-summary').textContent =
      applied(totalSafe, 'safe fix', 'safe fixes') + ' · ' +
      applied(totalApproved, 'approved fix', 'approved fixes') + ' · ' +
      pcount(totalRemaining, 'issue') + ' still in the files';

    const checkEl = document.getElementById('asg-export-check');
    const titleEl = document.getElementById('asg-export-title');
    if (totalRemaining > 0) {
      checkEl.textContent = '⚠'; checkEl.classList.add('is-warning');
      titleEl.textContent = 'Your corrected CSVs are ready — with remaining issues';
    } else {
      checkEl.textContent = '✓'; checkEl.classList.remove('is-warning');
      titleEl.textContent = 'Your corrected CSVs are ready';
    }

    const heroEl = document.querySelector('.asg-export-hero');
    const oldSplit = heroEl.parentNode.querySelector('.asg-export-split');
    if (oldSplit) oldSplit.remove();
    const oldWarn = heroEl.parentNode.querySelector('.asg-export-warning');
    if (oldWarn) oldWarn.remove();

    if (totalRemaining > 0) {
      const warn = document.createElement('div');
      warn.className = 'asg-export-warning';
      warn.innerHTML = '<h3>⚠ Some files are not fully clean</h3><p>Autonom fixed everything it safely could. <strong>' + pcount(totalRemaining, 'issue') + '</strong> remain across your files.</p>';
      heroEl.parentNode.insertBefore(warn, heroEl.nextSibling);
    } else {
      const warn = document.createElement('div');
      warn.className = 'asg-export-warning';
      warn.style.background = 'var(--asg-passed-bg)';
      warn.style.borderColor = '#b8dfc6';
      warn.innerHTML = '<h3 style="color:var(--asg-passed);">✅ All files are as clean as Autonom can make them</h3><p>Safe fixes were applied and approved fixes were completed.</p>';
      heroEl.parentNode.insertBefore(warn, heroEl.nextSibling);
    }

    const filesWrap = document.getElementById('asg-export-files');
    if (filesWrap) {
      filesWrap.innerHTML = '';
      const baseFolder = state.files.length === 1
        ? state.files[0].fileName.replace(/\.csv$/i, '') + '_autonom_safe'
        : 'autonom_batch_' + state.files.length + '_files';

      const header = document.createElement('div');
      header.className = 'asg-batch-export-header';
      header.innerHTML = '<span class="asg-batch-export-header-icon">📦</span><span class="asg-batch-export-header-name">' + escapeHtml(baseFolder) + '.zip</span>';
      filesWrap.appendChild(header);

      const group = document.createElement('div');
      group.className = 'asg-batch-export-group';
      state.files.forEach(f => {
        if (f.splitParts && f.splitParts.length > 0) {
          f.splitParts.forEach(part => {
            const item = document.createElement('div');
            item.className = 'asg-batch-export-item';
            item.innerHTML = '<span class="asg-batch-export-item-icon">📄</span><div class="asg-batch-export-item-info"><div class="asg-batch-export-item-name">' + escapeHtml(part.name) + '</div><div class="asg-batch-export-item-desc">' + part.rowCount + ' rows (part of ' + escapeHtml(f.fileName) + ')</div></div>';
            group.appendChild(item);
          });
        } else {
          const safeName = f.fileName.replace(/\.csv$/i, '') + '_safe.csv';
          const item = document.createElement('div');
          item.className = 'asg-batch-export-item';
          item.innerHTML = '<span class="asg-batch-export-item-icon">📄</span><div class="asg-batch-export-item-info"><div class="asg-batch-export-item-name">' + escapeHtml(safeName) + '</div><div class="asg-batch-export-item-desc">Corrected CSV, ready to import</div></div>';
          group.appendChild(item);
        }
        const logName = f.fileName.replace(/\.csv$/i, '') + '_change_log.csv';
        const logItem = document.createElement('div');
        logItem.className = 'asg-batch-export-item';
        logItem.innerHTML = '<span class="asg-batch-export-item-icon">📋</span><div class="asg-batch-export-item-info"><div class="asg-batch-export-item-name">' + escapeHtml(logName) + '</div><div class="asg-batch-export-item-desc">Every change for this file, in plain language</div></div>';
        group.appendChild(logItem);
      });

      const reportName = state.files.length === 1 ? 'autonom_readiness_report.html' : 'autonom_batch_report.html';
      const reportItem = document.createElement('div');
      reportItem.className = 'asg-batch-export-item';
      reportItem.innerHTML = '<span class="asg-batch-export-item-icon">📊</span><div class="asg-batch-export-item-info"><div class="asg-batch-export-item-name">' + reportName + '</div><div class="asg-batch-export-item-desc">' + (state.files.length === 1 ? 'The full readiness report' : 'Combined report across all files') + '</div></div>';
      group.appendChild(reportItem);

      const readmeItem = document.createElement('div');
      readmeItem.className = 'asg-batch-export-item';
      readmeItem.innerHTML = '<span class="asg-batch-export-item-icon">📖</span><div class="asg-batch-export-item-info"><div class="asg-batch-export-item-name">README.txt</div><div class="asg-batch-export-item-desc">Import checklist and package guide</div></div>';
      group.appendChild(readmeItem);

      filesWrap.appendChild(group);
    }

    const checklist = document.getElementById('asg-export-checklist');
    if (checklist) {
      const items = [];
      if (totalRemaining > 0) items.push({ cls: 'is-critical', text: '<strong>Resolve the remaining critical issues</strong> before importing.' });
      if (totalSafe > 0 || totalApproved > 0) {
        const totalFixes = totalSafe + totalApproved;
        items.push({ cls: 'is-done', text: '<strong>' + totalFixes + ' fix' + (totalFixes === 1 ? '' : 'es') + ' applied.</strong> Review the diff above.' });
      }
      if (totalSplitParts > 0) items.push({ cls: '', text: '<strong>Some files were split into parts.</strong> Import each part separately, in numerical order.' });
      items.push({ cls: '', text: '<strong>Export a backup</strong> of your current Shopify products before importing.' });
      items.push({ cls: '', text: '<strong>Test-import 2–5 products first.</strong>' });
      items.push({ cls: '', text: 'Only then run the full import.' });
      checklist.innerHTML = items.map(i => '<li class="' + i.cls + '">' + i.text + '</li>').join('');
    }

    state.changeLog = allChangeEntries;
    renderDiffSection();
    showScreen('export');
  }

  function renderDiffSection() {
    const section = document.getElementById('asg-diff-section');
    const listEl = document.getElementById('asg-diff-list');
    const countEl = document.getElementById('asg-diff-count');
    const toggle = document.getElementById('asg-diff-toggle');
    const viewToggle = document.getElementById('asg-diff-view-toggle');
    const log = state.changeLog || [];
    if (!log.length) { section.hidden = true; return; }
    section.hidden = false;
    countEl.textContent = log.length + ' change' + (log.length === 1 ? '' : 's');

    if (!state.diffViewMode) state.diffViewMode = 'detailed';
    const showFileBadge = state.files.length > 1;

    function renderList() {
      let html = '';
      if (state.diffViewMode === 'compact') {
        html += '<table class="asg-diff-compact"><thead><tr>' +
          (showFileBadge ? '<th>File</th>' : '') +
          '<th>Row</th><th>Column</th><th>Before</th><th>After</th><th>Reason</th></tr></thead><tbody>';
        log.forEach(c => {
          html += '<tr>' +
            (showFileBadge ? '<td>' + escapeHtml(c._file || '') + '</td>' : '') +
            '<td>' + (c.row === 'all' ? 'file' : c.row) + '</td>' +
            '<td>' + escapeHtml(c.column) + '</td>' +
            '<td class="asg-diff-cell-before">' + escapeHtml(String(c.before).substring(0, 80)) + '</td>' +
            '<td class="asg-diff-cell-after">' + escapeHtml(String(c.after).substring(0, 80)) + '</td>' +
            '<td class="asg-diff-cell-reason">' + escapeHtml(c.reason) + '</td></tr>';
        });
        html += '</tbody></table>';
      } else {
        log.forEach(c => {
          const fileBadge = showFileBadge && c._file
            ? '<span class="asg-issue-file-badge">' + escapeHtml(c._file) + '</span> '
            : '';
          html += '<div class="asg-diff-item"><div class="asg-diff-item-head">' +
            '<span class="asg-diff-item-loc">' + fileBadge + (c.row === 'all' ? 'Entire file' : 'Row ' + c.row) + ' · ' + escapeHtml(c.column) + '</span>' +
            '<span class="asg-diff-item-reason">' + escapeHtml(c.reason) + '</span></div>' +
            '<div class="asg-diff-item-body">' +
            '<div class="asg-diff-before"><span class="asg-diff-label">Before</span><code>' + escapeHtml(String(c.before).substring(0, 200)) + '</code></div>' +
            '<div class="asg-diff-after"><span class="asg-diff-label">After</span><code>' + escapeHtml(String(c.after).substring(0, 200)) + '</code></div>' +
            '</div></div>';
        });
      }
      listEl.innerHTML = html;
    }

    if (viewToggle) {
      const newViewToggle = viewToggle.cloneNode(true);
      viewToggle.parentNode.replaceChild(newViewToggle, viewToggle);
      newViewToggle.hidden = false;
      newViewToggle.querySelectorAll('.asg-diff-view-btn').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.view === state.diffViewMode);
        btn.addEventListener('click', () => {
          state.diffViewMode = btn.dataset.view;
          renderDiffSection();
        });
      });
    }

    const newToggle = toggle.cloneNode(true);
    toggle.parentNode.replaceChild(newToggle, toggle);
    const wasExpanded = newToggle.getAttribute('aria-expanded') === 'true';
    listEl.hidden = !wasExpanded;
    const arrowEl = newToggle.querySelector('.asg-diff-header-arrow');
    if (arrowEl) arrowEl.textContent = wasExpanded ? '▾' : '▸';
    newToggle.addEventListener('click', () => {
      const isExpanded = newToggle.getAttribute('aria-expanded') === 'true';
      newToggle.setAttribute('aria-expanded', String(!isExpanded));
      listEl.hidden = isExpanded;
      const arrow = newToggle.querySelector('.asg-diff-header-arrow');
      if (arrow) arrow.textContent = isExpanded ? '▸' : '▾';
    });

    renderList();
  }

  function setStep(step, cls) {
    const el = document.querySelector('.asg-scan-steps li[data-step="' + step + '"]');
    if (!el) return;
    el.classList.remove('is-running', 'is-done');
    if (cls) el.classList.add(cls);
  }

  async function runScan() {
    if (!state.mode || !state.file) return;
    showScreen('scanning');
    document.getElementById('asg-scan-filename').textContent = state.fileName + ' · ' + formatBytes(state.fileSize);
    const progressWrap = document.getElementById('asg-batch-progress');
    if (progressWrap) progressWrap.hidden = true;

    setStep('read', 'is-running');
    try { await loadPapaParse(); } catch (err) { LOG('PapaParse load failed', err); }

    const entry = state.files[state.currentFileIndex];
    if (entry && entry.mapped) {
      state.headers = entry.headers.slice();
      state.rows = entry.rows.slice();
      state.parseFieldMismatches = 0;
      await delay(180);
      setStep('read', 'is-done');
    } else {
      let text = state.fileText;
      if (state.detectedDelimiter !== ',') text = convertDelimiter(text, state.detectedDelimiter, ',');

      const parsed = await parseWithPapa(text);
      state.headers = parsed.fields || [];
      state.rows = parsed.data || [];
      state.parseFieldMismatches = 0;
      if (parsed.errors && parsed.errors.length) {
        parsed.errors.forEach(err => {
          if (err.type === 'FieldMismatch' || /field/i.test(err.code || '')) state.parseFieldMismatches++;
        });
      }
      await delay(180);
      setStep('read', 'is-done');
    }

    const checkResult = runChecks();
    for (const step of ['encoding', 'headers', 'handles', 'variants', 'skus', 'prices', 'blanks', 'html', 'images']) {
      setStep(step, 'is-running');
      await delay(90);
      setStep(step, 'is-done');
    }
    setStep('report', 'is-running');
    await delay(180);
    state.result = buildResult(checkResult.issues, checkResult.passed);
    setStep('report', 'is-done');
    await delay(200);
    saveWorkingToFile(0);
    renderReport();
  }

  async function runBatchScan() {
    if (!state.files.length) return;
    if (!state.batchMode) return;

    state.files.forEach(f => { f.mode = state.batchMode; });

    showScreen('scanning');
    const progressWrap = document.getElementById('asg-batch-progress');
    const progressBar = document.getElementById('asg-batch-progress-bar');
    const progressLabel = document.getElementById('asg-batch-progress-label');
    const batchHeader = document.getElementById('asg-scan-filename');

    if (state.files.length > 1) {
      if (progressWrap) progressWrap.hidden = false;
      if (progressLabel) progressLabel.textContent = 'Starting…';
    } else {
      if (progressWrap) progressWrap.hidden = true;
    }

    try { await loadPapaParse(); } catch (err) { LOG('PapaParse load failed', err); }

    for (let i = 0; i < state.files.length; i++) {
      if (batchHeader) {
        batchHeader.textContent = state.files.length === 1
          ? state.files[i].fileName + ' · ' + formatBytes(state.files[i].fileSize)
          : 'File ' + (i + 1) + ' of ' + state.files.length + ': ' + state.files[i].fileName;
      }
      if (progressLabel) progressLabel.textContent = 'File ' + (i + 1) + ' of ' + state.files.length;
      if (progressBar) progressBar.style.width = Math.round((i / state.files.length) * 100) + '%';

      document.querySelectorAll('#asg-scan-steps li').forEach(li => li.classList.remove('is-running', 'is-done'));

      loadFileIntoWorking(i);
      state.files[i].status = 'scanning';
      state.acceptedRepairs = {};

      if (state.files[i].mapped) {
        state.headers = state.files[i].headers.slice();
        state.rows = state.files[i].rows.slice();
        state.parseFieldMismatches = 0;
        setStep('read', 'is-running');
        await delay(120);
        setStep('read', 'is-done');
      } else {
        let text = state.fileText;
        if (state.detectedDelimiter !== ',') text = convertDelimiter(text, state.detectedDelimiter, ',');

        setStep('read', 'is-running');
        const parsed = await parseWithPapa(text);
        state.headers = parsed.fields || [];
        state.rows = parsed.data || [];
        state.parseFieldMismatches = 0;
        if (parsed.errors && parsed.errors.length) {
          parsed.errors.forEach(err => {
            if (err.type === 'FieldMismatch' || /field/i.test(err.code || '')) state.parseFieldMismatches++;
          });
        }
        await delay(120);
        setStep('read', 'is-done');
      }

      const checkResult = runChecks();
      for (const step of ['encoding', 'headers', 'handles', 'variants', 'skus', 'prices', 'blanks', 'html', 'images']) {
        setStep(step, 'is-running');
        await delay(60);
        setStep(step, 'is-done');
      }
      setStep('report', 'is-running');
      await delay(80);
      state.result = buildResult(checkResult.issues, checkResult.passed);
      setStep('report', 'is-done');

      saveWorkingToFile(i);
      state.files[i].status = 'scanned';

      if (progressBar) progressBar.style.width = Math.round(((i + 1) / state.files.length) * 100) + '%';
      await delay(120);
    }

    await delay(200);
    renderBatchReport();
  }

  function collectAccepted() {
    state.files.forEach(f => { f.acceptedRepairs = {}; });

    document.querySelectorAll('#asg-repair-review-list input[data-accept]').forEach(input => {
      if (!input.checked) return;
      const val = input.dataset.accept || '';
      const sep = val.indexOf(':');
      if (sep === -1) return;
      const fileIdx = parseInt(val.substring(0, sep), 10);
      const code = val.substring(sep + 1);
      if (!state.files[fileIdx]) return;
      state.files[fileIdx].acceptedRepairs[code] = true;
    });

    document.querySelectorAll('#asg-repair-never-list input[data-remove-column]').forEach(input => {
      if (!input.checked) return;
      const val = input.dataset.removeColumn || '';
      const sep = val.indexOf(':');
      if (sep === -1) return;
      const fileIdx = parseInt(val.substring(0, sep), 10);
      const col = val.substring(sep + 1);
      if (!state.files[fileIdx]) return;
      state.files[fileIdx].acceptedRepairs['REMOVE_COLUMN:' + col] = true;
    });
  }

  function doExport() {
    collectAccepted();

    state.files.forEach((entry, i) => {
      loadFileIntoWorking(i);
      const result = buildCorrectedCSV();
      state.correctedCSV = result.csv;
      state.changeLog = result.changeLog;
      state.appliedCodes = result.appliedCodes;
      state.splitParts = result.splitParts || null;
      saveWorkingToFile(i);
    });

    renderExport();
  }

  async function downloadAll() {
    try { await loadJSZip(); } catch (err) { LOG('JSZip load failed', err); }

    const baseFolder = state.files.length === 1
      ? state.files[0].fileName.replace(/\.csv$/i, '') + '_autonom_safe'
      : 'autonom_batch_' + state.files.length + '_files';

    if (typeof JSZip === 'undefined') {
      state.files.forEach((f, i) => {
        if (f.splitParts && f.splitParts.length > 0) {
          f.splitParts.forEach((part, k) => {
            setTimeout(() => downloadBlob(part.csv, part.name, 'text/csv;charset=utf-8'), (i * 5 + k) * 300);
          });
        } else {
          const safeName = f.fileName.replace(/\.csv$/i, '') + '_safe.csv';
          setTimeout(() => downloadBlob(f.correctedCSV || '', safeName, 'text/csv;charset=utf-8'), i * 600);
        }
      });
      return;
    }

    try {
      const zip = new JSZip();
      const folder = zip.folder(baseFolder);

      state.files.forEach(f => {
        if (f.splitParts && f.splitParts.length > 0) {
          f.splitParts.forEach(part => folder.file(part.name, part.csv));
        } else {
          const safeName = f.fileName.replace(/\.csv$/i, '') + '_safe.csv';
          folder.file(safeName, f.correctedCSV || '');
        }
        const logName = f.fileName.replace(/\.csv$/i, '') + '_change_log.csv';
        folder.file(logName, buildChangeLogCSV(f.changeLog || []));
      });

      const reportName = state.files.length === 1 ? 'autonom_readiness_report.html' : 'autonom_batch_report.html';
      const reportHtml = state.files.length === 1 ? buildReportHTML() : buildBatchReportHTML();
      folder.file(reportName, reportHtml);

      const fileListLines = [];
      state.files.forEach(f => {
        if (f.splitParts && f.splitParts.length > 0) {
          f.splitParts.forEach(p => fileListLines.push('  ' + p.name + '  —  ' + p.rowCount + ' rows (part of ' + f.fileName + ')'));
        } else {
          fileListLines.push('  ' + f.fileName.replace(/\.csv$/i, '') + '_safe.csv  —  Corrected CSV');
        }
        fileListLines.push('  ' + f.fileName.replace(/\.csv$/i, '') + '_change_log.csv  —  Changes made to ' + f.fileName);
      });
      fileListLines.push('  ' + reportName + '  —  ' + (state.files.length === 1 ? 'The full readiness report' : 'Combined report across all files'));

      folder.file('README.txt', [
        'Autonom Shopify Guard — corrected package', '',
        'Files in this archive:',
        ...fileListLines, '',
        'Before importing:',
        '  1. Keep a current Shopify export as a backup.',
        '  2. Resolve any critical issues still listed in the report.',
        '  3. Test-import 2–5 products first.',
        '  4. Only then run the full import.', '',
        'Autonom does not know your store\'s current data.',
        'A passing report does not guarantee Shopify will accept the import.', '',
        'Generated locally in your browser — no file contents were transmitted.', ''
      ].join('\n'));

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = baseFolder + '.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      LOG('ZIP generation failed', err);
      state.files.forEach((f, i) => {
        const safeName = f.fileName.replace(/\.csv$/i, '') + '_safe.csv';
        setTimeout(() => downloadBlob(f.correctedCSV || '', safeName, 'text/csv;charset=utf-8'), i * 400);
      });
    }
  }

  /* ---------- COMPARISON MODE ---------- */

  function startCompareMode() {
    state.compareMode = true;
    state.compareStoreFile = null;
    state.compareUpdateFile = null;
    state.compareResult = null;
    renderCompareSetup();
    showScreen('compare-setup');
  }

  function renderCompareSetup() {
    updateCompareSlot('store', state.compareStoreFile);
    updateCompareSlot('update', state.compareUpdateFile);
  }

  function updateCompareSlot(slot, entry) {
    const dropzone = document.getElementById('asg-compare-' + slot + '-dropzone');
    const info = document.getElementById('asg-compare-' + slot + '-info');
    if (!dropzone || !info) return;
    if (entry) {
      dropzone.classList.add('has-file');
      info.hidden = false;
      let rowCount = '—';
      try { rowCount = Math.max(0, entry.rows.length).toLocaleString(); } catch (e) {}
      info.innerHTML =
        '<span class="asg-compare-file-info-icon">' + (slot === 'store' ? '📦' : '📄') + '</span>' +
        '<div class="asg-compare-file-info-body">' +
          '<div class="asg-compare-file-info-name">' + escapeHtml(entry.fileName) + '</div>' +
          '<div class="asg-compare-file-info-meta">' + formatBytes(entry.fileSize) + ' · ' + rowCount + ' rows · ' + entry.detectedEncoding + '</div>' +
        '</div>' +
        '<button type="button" class="asg-compare-file-remove" data-slot="' + slot + '" aria-label="Remove">✕</button>';
      info.querySelector('.asg-compare-file-remove').addEventListener('click', () => {
        if (slot === 'store') state.compareStoreFile = null;
        else state.compareUpdateFile = null;
        renderCompareSetup();
      });
    } else {
      dropzone.classList.remove('has-file');
      info.hidden = true;
      info.innerHTML = '';
    }
  }

  async function handleCompareFile(slot, file) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
      alert('Please drop a CSV file.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      alert('File is larger than 50MB.');
      return;
    }

    let entry = null;

    try {
      const { text, hasBOM, encoding } = await readFileAsText(file);
      const delimiter = detectDelimiter(text);
      let parseText = text;
      if (delimiter !== ',') parseText = convertDelimiter(text, delimiter, ',');
      const parsed = fallbackParseCSV(parseText);
      const detection = detectMode(parsed.fields, parsed.data);

      entry = {
        file: file,
        fileName: file.name,
        fileSize: file.size,
        fileText: text,
        hasBOM: hasBOM,
        detectedEncoding: encoding,
        detectedDelimiter: delimiter,
        headers: parsed.fields,
        rows: parsed.data,
        mapped: false,
        mapping: null,
        detectedMode: detection.mode,
        detectedConfidence: detection.confidence,
        detectedReason: detection.reason
      };
    } catch (err) {
      LOG('Could not read comparison file', err);
      alert('Could not read ' + file.name + ': ' + (err && err.message ? err.message : err));
      return;
    }

    if (slot === 'store') state.compareStoreFile = entry;
    else state.compareUpdateFile = entry;

    renderCompareSetup();

    if (state.compareStoreFile && state.compareUpdateFile) {
      try {
        runComparison();
      } catch (err) {
        LOG('Comparison failed', err);
        console.error('[Autonom SG] Comparison error details:', err);
        alert('Comparison failed: ' + (err && err.message ? err.message : err));
      }
    }
  }

  function normalizeHandle(h) {
    return String(h == null ? '' : h).trim().toLowerCase();
  }

  function runComparison() {
    const store = state.compareStoreFile;
    const update = state.compareUpdateFile;
    if (!store || !update) return;

    const commonFields = [];
    const seen = {};
    update.headers.forEach(h => {
      if (store.headers.indexOf(h) !== -1 && !seen[h]) {
        commonFields.push(h);
        seen[h] = true;
      }
    });

    const storeByHandle = {};
    store.rows.forEach(row => {
      const h = normalizeHandle(row['Handle']);
      if (!h) return;
      if (!storeByHandle[h]) storeByHandle[h] = row;
    });

    const updateByHandle = {};
    update.rows.forEach(row => {
      const h = normalizeHandle(row['Handle']);
      if (!h) return;
      if (!updateByHandle[h]) updateByHandle[h] = row;
    });

    const result = {
      storeFileName: store.fileName,
      updateFileName: update.fileName,
      commonFields: commonFields,
      matched: [],
      newProducts: [],
      unchanged: [],
      fieldChanges: {},
      blankOverwrites: []
    };

    Object.keys(updateByHandle).forEach(h => {
      const updateRow = updateByHandle[h];
      const storeRow = storeByHandle[h];
      const updateTitle = updateRow['Title'] || updateRow['Variant SKU'] || h;

      if (!storeRow) {
        result.newProducts.push({ handle: h, title: updateTitle });
        return;
      }

      const diffs = [];
      commonFields.forEach(field => {
        const before = storeRow[field] == null ? '' : String(storeRow[field]).trim();
        const after = updateRow[field] == null ? '' : String(updateRow[field]).trim();
        if (before === after) return;
        const isBlankOverwrite = before !== '' && after === '';
        diffs.push({ field, before, after, isBlankOverwrite });
        if (!result.fieldChanges[field]) result.fieldChanges[field] = 0;
        result.fieldChanges[field]++;
        if (isBlankOverwrite) {
          result.blankOverwrites.push({ handle: h, title: updateTitle, field, before });
        }
      });

      if (diffs.length > 0) {
        result.matched.push({ handle: h, title: updateTitle, diffs, storeRow, updateRow });
      } else {
        result.unchanged.push({ handle: h, title: updateTitle });
      }
    });

    state.compareResult = result;
    renderCompareReport();
    showScreen('compare-report');
  }

  function renderCompareReport() {
    const r = state.compareResult;
    if (!r) return;

    const totalChanged = r.matched.length;
    const totalNew = r.newProducts.length;
    const totalUnchanged = r.unchanged.length;
    const totalMatched = totalChanged + totalUnchanged;

    document.getElementById('asg-compare-matched').textContent = totalMatched;
    document.getElementById('asg-compare-new').textContent = totalNew;
    document.getElementById('asg-compare-changed').textContent = totalChanged;
    document.getElementById('asg-compare-unchanged').textContent = totalUnchanged;

    const verdict = document.getElementById('asg-compare-verdict');
    const badge = document.getElementById('asg-compare-verdict-badge');
    const title = document.getElementById('asg-compare-verdict-title');
    const sub = document.getElementById('asg-compare-verdict-sub');
    verdict.classList.remove('is-critical', 'is-warning', 'is-passed');

    if (r.blankOverwrites.length > 0) {
      verdict.classList.add('is-critical');
      badge.textContent = 'Review required';
      title.textContent = 'This import will erase existing data';
      sub.textContent = r.blankOverwrites.length + ' field' + (r.blankOverwrites.length === 1 ? '' : 's') + ' would be cleared in your store.';
    } else if (totalChanged > 0) {
      verdict.classList.add('is-warning');
      badge.textContent = 'Changes detected';
      title.textContent = 'This import will change ' + totalChanged + ' product' + (totalChanged === 1 ? '' : 's');
      sub.textContent = totalNew > 0
        ? 'Plus ' + totalNew + ' new product' + (totalNew === 1 ? '' : 's') + '.'
        : 'No new products. ' + totalUnchanged + ' product' + (totalUnchanged === 1 ? '' : 's') + ' unchanged.';
    } else {
      verdict.classList.add('is-passed');
      badge.textContent = 'No changes';
      title.textContent = 'This import will not change anything';
      sub.textContent = totalNew > 0
        ? 'But ' + totalNew + ' new product' + (totalNew === 1 ? '' : 's') + ' will be created.'
        : 'All matched products already match.';
    }

    const impactEl = document.getElementById('asg-compare-impact');
    const impactList = document.getElementById('asg-compare-impact-list');
    const impactFields = Object.keys(r.fieldChanges).sort((a, b) => r.fieldChanges[b] - r.fieldChanges[a]);
    if (impactFields.length > 0) {
      impactEl.hidden = false;
      impactList.innerHTML = '';
      impactFields.forEach(field => {
        const cat = COMPARE_FIELD_CATEGORIES[field];
        const label = cat ? cat.label : field;
        const count = r.fieldChanges[field];
        const li = document.createElement('li');
        li.innerHTML = '<span>Changes to <strong>' + escapeHtml(label) + '</strong></span><strong>' + count + '</strong>';
        impactList.appendChild(li);
      });
    } else {
      impactEl.hidden = true;
    }

    const blankWarn = document.getElementById('asg-compare-blank-warning');
    const blankIntro = document.getElementById('asg-compare-blank-intro');
    const blankList = document.getElementById('asg-compare-blank-list');
    if (r.blankOverwrites.length > 0) {
      blankWarn.hidden = false;
      blankIntro.textContent = 'These fields are currently set in your store but the update file leaves them blank. Shopify will clear them.';
      blankList.innerHTML = '';
      r.blankOverwrites.slice(0, 20).forEach(b => {
        const cat = COMPARE_FIELD_CATEGORIES[b.field];
        const label = cat ? cat.label : b.field;
        const li = document.createElement('li');
        li.innerHTML = '<strong>' + escapeHtml(b.title) + '</strong> (' + escapeHtml(b.handle) + ') — <em>' + escapeHtml(label) + '</em> would be cleared. Current value: <code>' + escapeHtml(String(b.before).substring(0, 80)) + '</code>';
        blankList.appendChild(li);
      });
      if (r.blankOverwrites.length > 20) {
        const li = document.createElement('li');
        li.textContent = '… and ' + (r.blankOverwrites.length - 20) + ' more.';
        blankList.appendChild(li);
      }
    } else {
      blankWarn.hidden = true;
    }

    const diffList = document.getElementById('asg-compare-diff-list');
    const noDiffs = document.getElementById('asg-compare-no-diffs');
    diffList.innerHTML = '';

    if (r.matched.length === 0 && r.newProducts.length === 0) {
      noDiffs.hidden = false;
    } else {
      noDiffs.hidden = true;

      r.newProducts.forEach(p => {
        const el = document.createElement('div');
        el.className = 'asg-issue is-info';
        el.innerHTML = '<div class="asg-issue-head"><span class="asg-issue-marker">+</span><h4 class="asg-issue-title">NEW: ' + escapeHtml(p.title) + '</h4><span class="asg-issue-toggle">▾</span></div>' +
          '<div class="asg-issue-body" hidden><p>Handle: <code>' + escapeHtml(p.handle) + '</code></p><p>This product will be created.</p></div>';
        const head = el.querySelector('.asg-issue-head');
        const body = el.querySelector('.asg-issue-body');
        head.addEventListener('click', () => {
          body.hidden = !body.hidden;
          head.classList.toggle('is-open', !body.hidden);
        });
        diffList.appendChild(el);
      });

      r.matched.forEach(m => {
        const el = document.createElement('div');
        el.className = 'asg-issue is-warning';
        const rowsHtml = m.diffs.map(d => {
          const cat = COMPARE_FIELD_CATEGORIES[d.field];
          const label = cat ? cat.label : d.field;
          const warn = d.isBlankOverwrite ? ' <strong style="color:#d92b2b;">⚠ will erase</strong>' : '';
          return '<tr><td>' + escapeHtml(label) + warn + '</td>' +
            '<td class="asg-diff-cell-before">' + escapeHtml(d.before || '(blank)') + '</td>' +
            '<td class="asg-diff-cell-after">' + escapeHtml(d.after || '(blank)') + '</td></tr>';
        }).join('');
        el.innerHTML = '<div class="asg-issue-head"><span class="asg-issue-marker">!</span><h4 class="asg-issue-title">' + escapeHtml(m.title) + ' <span style="font-family:var(--asg-mono);font-size:12px;color:var(--asg-text-muted);font-weight:400;">(' + escapeHtml(m.handle) + ')</span></h4><span class="asg-issue-toggle">▾</span></div>' +
          '<div class="asg-issue-body" hidden>' +
          '<table class="asg-diff-compact" style="width:100%;"><thead><tr><th>Field</th><th>In your store</th><th>After import</th></tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
          '</div>';
        const head = el.querySelector('.asg-issue-head');
        const body = el.querySelector('.asg-issue-body');
        head.addEventListener('click', () => {
          body.hidden = !body.hidden;
          head.classList.toggle('is-open', !body.hidden);
        });
        diffList.appendChild(el);
      });
    }
  }

  function buildCompareReportHTML() {
    const r = state.compareResult;
    if (!r) return '';
    let h = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Autonom Shopify Guard — Comparison Report</title>';
    h += '<style>body{font-family:-apple-system,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#1a1d23;line-height:1.55;}h1{border-bottom:2px solid #1a1d23;padding-bottom:10px;}h2{margin-top:32px;font-size:18px;}table{width:100%;border-collapse:collapse;margin:12px 0;}th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #e1e4e9;font-size:13px;}th{background:#f7f8fa;}.critical{color:#d92b2b;font-weight:600;}.warning{color:#c47a00;font-weight:600;}.passed{color:#17864a;}.new-badge{color:#17864a;font-weight:700;}.erase{color:#d92b2b;font-weight:600;}</style></head><body>';
    h += '<h1>Autonom Shopify Guard — Comparison Report</h1>';
    h += '<p><strong>Store export:</strong> ' + escapeHtml(r.storeFileName) + '</p>';
    h += '<p><strong>Update file:</strong> ' + escapeHtml(r.updateFileName) + '</p>';
    h += '<p><strong>Generated:</strong> ' + new Date().toISOString() + '</p>';
    h += '<p><strong>Tool version:</strong> 2.0.1</p>';

    h += '<h2>Summary</h2><ul>';
    h += '<li>Matched products: ' + (r.matched.length + r.unchanged.length) + '</li>';
    h += '<li>Products with changes: ' + r.matched.length + '</li>';
    h += '<li>New products: ' + r.newProducts.length + '</li>';
    h += '<li>Unchanged: ' + r.unchanged.length + '</li>';
    if (r.blankOverwrites.length > 0) {
      h += '<li class="erase">Fields that will be erased: ' + r.blankOverwrites.length + '</li>';
    }
    h += '</ul>';

    const impactFields = Object.keys(r.fieldChanges).sort((a, b) => r.fieldChanges[b] - r.fieldChanges[a]);
    if (impactFields.length > 0) {
      h += '<h2>What changes</h2><ul>';
      impactFields.forEach(field => {
        const cat = COMPARE_FIELD_CATEGORIES[field];
        const label = cat ? cat.label : field;
        h += '<li>' + escapeHtml(label) + ': <strong>' + r.fieldChanges[field] + '</strong></li>';
      });
      h += '</ul>';
    }

    if (r.blankOverwrites.length > 0) {
      h += '<h2 class="critical">⚠ Fields that will be erased</h2>';
      h += '<p>These fields are currently set in your store, but the update file leaves them blank. Shopify will clear them.</p><ul>';
      r.blankOverwrites.forEach(b => {
        const cat = COMPARE_FIELD_CATEGORIES[b.field];
        const label = cat ? cat.label : b.field;
        h += '<li><strong>' + escapeHtml(b.title) + '</strong> (' + escapeHtml(b.handle) + ') — ' + escapeHtml(label) + ' would be cleared. Current: <code>' + escapeHtml(String(b.before).substring(0, 80)) + '</code></li>';
      });
      h += '</ul>';
    }

    if (r.newProducts.length > 0) {
      h += '<h2>New products (' + r.newProducts.length + ')</h2><ul>';
      r.newProducts.forEach(p => {
        h += '<li><span class="new-badge">NEW</span> ' + escapeHtml(p.title) + ' <code>' + escapeHtml(p.handle) + '</code></li>';
      });
      h += '</ul>';
    }

    if (r.matched.length > 0) {
      h += '<h2>Field-by-field changes</h2>';
      r.matched.forEach(m => {
        h += '<h3>' + escapeHtml(m.title) + ' <code>' + escapeHtml(m.handle) + '</code></h3>';
        h += '<table><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>';
        m.diffs.forEach(d => {
          const cat = COMPARE_FIELD_CATEGORIES[d.field];
          const label = cat ? cat.label : d.field;
          const warn = d.isBlankOverwrite ? ' <span class="erase">⚠</span>' : '';
          h += '<tr><td>' + escapeHtml(label) + warn + '</td><td>' + escapeHtml(d.before || '(blank)') + '</td><td>' + escapeHtml(d.after || '(blank)') + '</td></tr>';
        });
        h += '</tbody></table>';
      });
    }

    h += '<h2>Limitations</h2>';
    h += '<p>This comparison is against the store export you provided. If your store changed since that export, values may differ. Autonom does not connect to your store and cannot verify current values.</p>';
    h += '<hr><p style="color:#8a94a3;font-size:12px;">Generated locally in your browser.</p>';
    h += '</body></html>';
    return h;
  }

  function buildCompareDiffCSV() {
    const r = state.compareResult;
    if (!r) return '';
    const lines = ['Handle,Title,Change,Field,Before,After'];
    const esc = val => '"' + String(val == null ? '' : val).replace(/"/g, '""') + '"';
    r.newProducts.forEach(p => {
      lines.push([p.handle, p.title, 'NEW', '', '', ''].map(esc).join(','));
    });
    r.matched.forEach(m => {
      m.diffs.forEach(d => {
        lines.push([m.handle, m.title, 'CHANGE', d.field, d.before, d.after].map(esc).join(','));
      });
    });
    return lines.join('\n');
  }

  function downloadCompareReport() {
    const r = state.compareResult;
    if (!r) return;
    const html = buildCompareReportHTML();
    const csv = buildCompareDiffCSV();
    const baseName = r.updateFileName.replace(/\.csv$/i, '') + '_comparison';

    if (typeof JSZip !== 'undefined') {
      const zip = new JSZip();
      const folder = zip.folder(baseName);
      folder.file('comparison_report.html', html);
      folder.file('comparison_diff.csv', csv);
      folder.file('README.txt', [
        'Autonom Shopify Guard — comparison package', '',
        'Files:',
        '  comparison_report.html  —  Full side-by-side comparison',
        '  comparison_diff.csv     —  Machine-readable list of changes', '',
        'Store export: ' + r.storeFileName,
        'Update file:  ' + r.updateFileName, '',
        'This comparison was generated locally in your browser.',
        'Autonom does not know your store\'s current data. If your store changed since the export, values may differ.', ''
      ].join('\n'));
      zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = baseName + '.zip';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      });
    } else {
      downloadBlob(html, baseName + '_report.html', 'text/html;charset=utf-8');
      setTimeout(() => downloadBlob(csv, baseName + '_diff.csv', 'text/csv;charset=utf-8'), 400);
    }
  }

  function resetToLanding() {
    state.files = [];
    state.currentFileIndex = 0;
    state.batchMode = null;
    state.batchDetectedMode = null;
    state.batchDetectedConfidence = null;
    state.batchDetectedReason = '';
    state.pendingMappingIndices = [];
    state.currentMappingIndex = 0;
    state.mappingDraft = {};
    state.compareMode = false;
    state.compareStoreFile = null;
    state.compareUpdateFile = null;
    state.compareResult = null;
    state.file = null; state.fileName = ''; state.fileSize = 0; state.fileText = '';
    state.headers = []; state.rows = []; state.mode = null;
    state.detectedMode = null; state.detectedConfidence = null; state.detectedReason = '';
    state.detectedDelimiter = ',';
    state.result = null; state.repairs = null; state.acceptedRepairs = {};
    state.correctedCSV = null; state.changeLog = null; state.appliedCodes = null;
    state.splitParts = null;
    state.hasBOM = false; state.detectedEncoding = 'UTF-8';
    state.showRowContext = {};
    state.diffViewMode = 'detailed';
    state.parseFieldMismatches = 0;

    const fi = document.getElementById('asg-file-input');
    if (fi) fi.value = '';
    document.querySelectorAll('.asg-mode-card').forEach(c => c.classList.remove('is-selected'));
    document.querySelectorAll('.asg-issue').forEach(el => el.hidden = false);
    document.querySelectorAll('.asg-filter-btn').forEach(b => b.classList.remove('is-active'));
    const allF = document.querySelector('.asg-filter-btn[data-filter="all"]');
    if (allF) allF.classList.add('is-active');
    document.querySelectorAll('.asg-scan-steps li').forEach(el => el.classList.remove('is-running', 'is-done'));

    const oldWarn = document.querySelector('.asg-export-warning');
    if (oldWarn) oldWarn.remove();
    const oldSplit = document.querySelector('.asg-export-split');
    if (oldSplit) oldSplit.remove();
    const diffSection = document.getElementById('asg-diff-section');
    if (diffSection) diffSection.hidden = true;
    const diffList = document.getElementById('asg-diff-list');
    if (diffList) { diffList.hidden = true; diffList.innerHTML = ''; }
    const viewToggle = document.getElementById('asg-diff-view-toggle');
    if (viewToggle) viewToggle.hidden = true;
    const checklist = document.getElementById('asg-export-checklist');
    if (checklist) checklist.innerHTML = '';
    const sampleWrap = document.getElementById('asg-file-sample');
    if (sampleWrap) sampleWrap.hidden = true;
    const detectBanner = document.getElementById('asg-detect-banner');
    if (detectBanner) detectBanner.hidden = true;
    const delimBanner = document.getElementById('asg-delim-banner');
    if (delimBanner) delimBanner.hidden = true;
    const grid = document.getElementById('asg-mode-grid');
    if (grid) grid.classList.remove('is-hidden');
    const batchFiles = document.getElementById('asg-batch-files');
    if (batchFiles) { batchFiles.hidden = true; batchFiles.innerHTML = ''; }
    const batchList = document.getElementById('asg-batch-list');
    if (batchList) batchList.innerHTML = '';
    const exportFiles = document.getElementById('asg-export-files');
    if (exportFiles) exportFiles.innerHTML = '';
    const mappingList = document.getElementById('asg-mapping-list');
    if (mappingList) mappingList.innerHTML = '';
    const mappingBanner = document.getElementById('asg-mapping-banner');
    if (mappingBanner) mappingBanner.hidden = true;
    const mappingWarning = document.getElementById('asg-mapping-warning');
    if (mappingWarning) mappingWarning.hidden = true;

    const compareStoreInfo = document.getElementById('asg-compare-store-info');
    if (compareStoreInfo) { compareStoreInfo.hidden = true; compareStoreInfo.innerHTML = ''; }
    const compareUpdateInfo = document.getElementById('asg-compare-update-info');
    if (compareUpdateInfo) { compareUpdateInfo.hidden = true; compareUpdateInfo.innerHTML = ''; }
    const compareStoreDz = document.getElementById('asg-compare-store-dropzone');
    if (compareStoreDz) compareStoreDz.classList.remove('has-file');
    const compareUpdateDz = document.getElementById('asg-compare-update-dropzone');
    if (compareUpdateDz) compareUpdateDz.classList.remove('has-file');
    const compareDiffList = document.getElementById('asg-compare-diff-list');
    if (compareDiffList) compareDiffList.innerHTML = '';
    const compareBlankWarn = document.getElementById('asg-compare-blank-warning');
    if (compareBlankWarn) compareBlankWarn.hidden = true;
    const compareImpact = document.getElementById('asg-compare-impact');
    if (compareImpact) compareImpact.hidden = true;

    showScreen('landing');
  }

  function downloadSampleCSV() {
    const sample = [
      'Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Variant SKU,Variant Price,Variant Compare At Price,Variant Inventory Tracker,Variant Inventory Qty,Image Src,Status,Product Category',
      'blue-cotton-tee,Blue Cotton Tee,"<p>Soft cotton tee.</p>",Acme,Shirts,"cotton, blue",TRUE,Size,Small,,,ACM-BLU-S,19.99,24.99,shopify,42,https://cdn.example.com/blue-tee.jpg,active,Apparel & Accessories > Clothing > Shirts & Tops',
      'blue-cotton-tee,Blue Cotton Tee,"<p>Soft cotton tee.</p>",Acme,Shirts,"cotton, blue",TRUE,Size,Medium,,,ACM-BLU-M,19.99,24.99,shopify,38,https://cdn.example.com/blue-tee.jpg,active,Apparel & Accessories > Clothing > Shirts & Tops',
      'blue-cotton-tee,Blue Cotton Tee,"<p>Soft cotton tee.</p>",Acme,Shirts,"cotton, blue",TRUE,Size,Small,,,ACM-BLU-S-DUP,,24.99,shopify,10,https://cdn.example.com/blue-tee.jpg,active,Apparel & Accessories > Clothing > Shirts & Tops',
      'red-cotton-tee,Red Cotton Tee,"<p>Soft cotton tee.</p>", Acme , Shirts ,"cotton, red",TRUE,Size,Small,,,ACM-RED-S,nineteen ninety nine,29.99,shopify,40,http://cdn.example.com/red-tee.jpg,active,Shirts',
      'red-cotton-tee,Red Cotton Tee,"<p>Soft cotton tee.</p>",Acme,Shirts,"cotton, red",TRUE,Size,Medium,,,ACM-RED-M,"19,99",18.99,shopify,3.5,https://cdn.example.com/red-tee,active,Shirts',
      'black-cotton-tee,Black Cotton Tee,"<p>Soft cotton tee</div>",Acme,Shirts,"cotton, black",TRUE,Size,Small,,,ACM-BLK-S,$21.99,24.99,shopify,-5,https://cdn.example.com/black-tee.jpg,active,Shirts',
      'green-cotton-tee,Green Cotton Tee,"<p>\u201CPremium\u201D quality tee with a \u201Cgreat\u201D fit.</p>",Acme,Shirts,"cotton, green",TRUE,Size,Small,,,ACM-BLU-S,19.99,24.99,shopify,30,https://localhost/images/green-tee.jpg,active,Shirts',
      'fancy Tee,Fancy Tee,"<p>Fancy.</p>",Acme,Shirts,"fancy",TRUE,Size,Small,,,ACM-FANCY-1,29.99,34.99,shopify,20,https://cdn.example.com/fancy-tee.jpg,showing,Shirts',
      ',Orphan Variant,"<p>Orphan product.</p>",Acme,Shirts,"orphan",TRUE,Size,Small,,,ORP-001,15.00,19.99,shopify,5,https://cdn.example.com/orphan.jpg,active,Shirts',
      ',Another Orphan,"<p>Orphan product.</p>",Acme,Shirts,"orphan",TRUE,Color,Red,,,ORP-002,nineteen ninety nine,,shopify,3.5,https://cdn.example.com/orphan2.jpg,showing,Shirts',
      'teal-mug,Teal Mug,"<p>Ceramic mug.</p>",Acme,Mugs,"mug, teal",TRUE,,,,,MUG-TEAL-1,12.99,15.99,shopify,50,https://cdn.example.com/teal-mug.jpg,active,Home & Garden > Kitchen & Dining',
      'teal-mug,Teal Mug Large,"<p>Bigger mug.</p>",Acme,Mugs,"mug, teal",TRUE,,,,,MUG-TEAL-2,12.99,15.99,shopify,20,https://cdn.example.com/teal-mug-large.jpg,active,Home & Garden > Kitchen & Dining',
      'no-title-product,,"<p>Missing title.</p>",Acme,Shirts,"weird",TRUE,Size,Small,,,NT-001,9.99,12.99,shopify,5,https://cdn.example.com/nt.jpg,active,Shirts',
      'partial-collapse,Partial Collapse,"<p>Test.</p>",Acme,Shirts,"test",TRUE,Size,,,,SOME-SKU,9.99,12.99,shopify,10,https://cdn.example.com/some.jpg,active,Shirts',
      'malformed-image,Malformed Image,"<p>Test.</p>",Acme,Shirts,"test",TRUE,Size,Small,,,MAL-001,9.99,12.99,shopify,10,not-a-url,active,Shirts',
      'multi-image-tee,Multi Image Tee,"<p>A tee with three images.</p>",Acme,Shirts,"cotton",TRUE,,,,,MIT-001,24.99,29.99,shopify,15,https://cdn.example.com/mit-1.jpg,active,Shirts',
      'multi-image-tee,,,,,,,,,,,,,,,,https://cdn.example.com/mit-2.jpg,,',
      'multi-image-tee,,,,,,,,,,,,,,,,https://cdn.example.com/mit-3.jpg,,',
      'dup-image-tee,Dup Image Tee,"<p>Test.</p>",Acme,Shirts,"test",TRUE,Title,Default Title,,,DIT-001,14.99,19.99,shopify,20,https://cdn.example.com/dit-1.jpg,active,Shirts',
      'dup-image-tee,,,,,,,,,,,,,,,,https://cdn.example.com/dit-1.jpg,,',
      'dup-image-tee,,,,,,,,,,,,,,,,https://cdn.example.com/dit-2.jpg,,',
      'boolean-lowercase,Boolean Lowercase,"<p>Test.</p>",Acme,Shirts,"test",yes,Size,Small,,,BL-001,9.99,12.99,shopify,10,https://cdn.example.com/bl.jpg,active,Shirts',
      'inv-no-qty,Inv No Qty,"<p>Test.</p>",Acme,Shirts,"test",TRUE,Size,Small,,,INQ-001,9.99,12.99,shopify,,https://cdn.example.com/inq.jpg,active,Shirts',
      ''
    ].join('\n');
    const withBOM = '\uFEFF' + sample;
    downloadBlob(withBOM, 'autonom-sample-shopify-products.csv', 'text/csv;charset=utf-8');
  }

  function wireEvents() {
    const dropzone = document.getElementById('asg-dropzone');
    const fileInput = document.getElementById('asg-file-input');
    const privacyToggle = document.getElementById('asg-privacy-toggle');
    const privacyPanel = document.getElementById('asg-privacy-panel');
    const newScanBtn = document.getElementById('asg-new-scan-btn');
    const sampleBtn = document.getElementById('asg-download-sample-btn');
    const compareStartBtn = document.getElementById('asg-compare-start-btn');
    const removeFileBtn = document.getElementById('asg-remove-file-btn');
    const detectOverride = document.getElementById('asg-detect-override');
    const toggleSample = document.getElementById('asg-toggle-sample');
    const delimConvert = document.getElementById('asg-delim-convert');
    const selectAllBtn = document.getElementById('asg-repair-select-all');
    const deselectAllBtn = document.getElementById('asg-repair-deselect-all');

    dropzone.addEventListener('click', e => {
      if (e.target.tagName === 'LABEL' || e.target.closest('label')) return;
      fileInput.click();
    });
    dropzone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });
    ['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('is-dragover'); }));
    ['dragleave', 'drop'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('is-dragover'); }));
    dropzone.addEventListener('drop', e => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) handleFiles(files);
    });
    fileInput.addEventListener('change', e => {
      const files = e.target.files;
      if (files && files.length) handleFiles(files);
      fileInput.value = '';
    });

    document.querySelectorAll('#asg-mode-grid .asg-mode-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('#asg-mode-grid .asg-mode-card').forEach(c => c.classList.remove('is-selected'));
        card.classList.add('is-selected');
        state.mode = card.dataset.mode;
        state.detectedMode = null;
        state.detectedConfidence = null;
        const banner = document.getElementById('asg-detect-banner');
        if (banner) {
          banner.hidden = false;
          banner.classList.remove('is-medium', 'is-low');
          banner.classList.add('is-low');
          document.getElementById('asg-detect-icon').textContent = '✋';
          document.getElementById('asg-detect-line').textContent = 'Mode: ' + (state.mode === 'existing_products' ? 'Updating existing products' : 'Adding new products');
          document.getElementById('asg-detect-sub').textContent = 'You selected this.';
        }
        updateActionBar('setup');
      });
    });

    document.querySelectorAll('#asg-batch-mode-grid .asg-mode-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('#asg-batch-mode-grid .asg-mode-card').forEach(c => c.classList.remove('is-selected'));
        card.classList.add('is-selected');
        state.batchMode = card.dataset.mode;
        updateActionBar('batch-queue');
      });
    });

    if (detectOverride) {
      detectOverride.addEventListener('click', () => {
        const grid = document.getElementById('asg-mode-grid');
        grid.classList.remove('is-hidden');
        state.detectedMode = null;
        state.detectedConfidence = null;
        document.getElementById('asg-detect-icon').textContent = '🤔';
        document.getElementById('asg-detect-line').textContent = 'Choose a mode';
        document.getElementById('asg-detect-sub').textContent = 'Select what you are doing with this file.';
        updateActionBar('setup');
      });
    }

    if (toggleSample) {
      toggleSample.addEventListener('click', () => {
        const table = document.getElementById('asg-file-sample-table');
        const isHidden = table.style.display === 'none';
        table.style.display = isHidden ? '' : 'none';
        toggleSample.textContent = isHidden ? 'Hide preview' : 'Show preview';
      });
    }

    if (delimConvert) {
      delimConvert.addEventListener('click', () => {
        if (state.detectedDelimiter === ',') return;
        const converted = convertDelimiter(state.fileText, state.detectedDelimiter, ',');
        const parsed = fallbackParseCSV(converted);
        state.headers = parsed.fields;
        state.rows = parsed.data;
        state.fileText = converted;
        state.detectedDelimiter = ',';
        renderFilePreview();
        renderFileSample();
        renderDelimiterBanner();
        const detection = detectMode(state.headers, state.rows);
        state.detectedMode = detection.mode;
        state.detectedConfidence = detection.confidence;
        state.detectedReason = detection.reason;
        renderDetectionBanner();
      });
    }

    if (selectAllBtn) selectAllBtn.addEventListener('click', () => {
      document.querySelectorAll('#asg-repair-review-list input[data-accept]').forEach(i => { i.checked = true; });
    });
    if (deselectAllBtn) deselectAllBtn.addEventListener('click', () => {
      document.querySelectorAll('#asg-repair-review-list input[data-accept]').forEach(i => { i.checked = false; });
    });

    if (newScanBtn) newScanBtn.addEventListener('click', resetToLanding);
    if (sampleBtn) sampleBtn.addEventListener('click', downloadSampleCSV);
    if (removeFileBtn) removeFileBtn.addEventListener('click', resetToLanding);
    if (compareStartBtn) compareStartBtn.addEventListener('click', startCompareMode);

    if (privacyToggle && privacyPanel) {
      privacyToggle.addEventListener('click', () => {
        const ex = privacyToggle.getAttribute('aria-expanded') === 'true';
        privacyToggle.setAttribute('aria-expanded', String(!ex));
        privacyPanel.hidden = ex;
      });
    }

    document.querySelectorAll('.asg-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
        document.querySelectorAll('.asg-filter-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        document.querySelectorAll('.asg-issue').forEach(el => {
          el.hidden = !(filter === 'all' || el.dataset.severity === filter);
        });
      });
    });

    const compareStoreDz = document.getElementById('asg-compare-store-dropzone');
    const compareStoreInput = document.getElementById('asg-compare-store-input');
    const compareUpdateDz = document.getElementById('asg-compare-update-dropzone');
    const compareUpdateInput = document.getElementById('asg-compare-update-input');

    if (compareStoreDz && compareStoreInput) {
      compareStoreDz.addEventListener('click', () => compareStoreInput.click());
      compareStoreDz.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); compareStoreInput.click(); }
      });
      ['dragenter', 'dragover'].forEach(ev => compareStoreDz.addEventListener(ev, e => { e.preventDefault(); compareStoreDz.classList.add('is-dragover'); }));
      ['dragleave', 'drop'].forEach(ev => compareStoreDz.addEventListener(ev, e => { e.preventDefault(); compareStoreDz.classList.remove('is-dragover'); }));
      compareStoreDz.addEventListener('drop', e => {
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) handleCompareFile('store', files[0]);
      });
      compareStoreInput.addEventListener('change', e => {
        const files = e.target.files;
        if (files && files.length) handleCompareFile('store', files[0]);
        compareStoreInput.value = '';
      });
    }

    if (compareUpdateDz && compareUpdateInput) {
      compareUpdateDz.addEventListener('click', () => compareUpdateInput.click());
      compareUpdateDz.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); compareUpdateInput.click(); }
      });
      ['dragenter', 'dragover'].forEach(ev => compareUpdateDz.addEventListener(ev, e => { e.preventDefault(); compareUpdateDz.classList.add('is-dragover'); }));
      ['dragleave', 'drop'].forEach(ev => compareUpdateDz.addEventListener(ev, e => { e.preventDefault(); compareUpdateDz.classList.remove('is-dragover'); }));
      compareUpdateDz.addEventListener('drop', e => {
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) handleCompareFile('update', files[0]);
      });
      compareUpdateInput.addEventListener('change', e => {
        const files = e.target.files;
        if (files && files.length) handleCompareFile('update', files[0]);
        compareUpdateInput.value = '';
      });
    }
  }

  function wireExtraUI() {
    const compareBackBtn = document.getElementById('asg-compare-back-btn');
    const compareExitBtn = document.getElementById('asg-compare-exit-btn');
    const exportNewScanBtn = document.getElementById('asg-export-new-scan-btn');

    if (compareBackBtn) {
      compareBackBtn.addEventListener('click', resetToLanding);
    }
    if (compareExitBtn) {
      compareExitBtn.addEventListener('click', resetToLanding);
    }
    if (exportNewScanBtn) {
      exportNewScanBtn.addEventListener('click', resetToLanding);
    }
  }

  function init() {
    if (!document.getElementById('autonom-shopify-guard')) return;
    initPrivacyMonitor();
    wireEvents();
    wireExtraUI();
    showScreen('landing');
    LOG('Init complete — v2.0.1 (Batch + Mapping + Comparison + UX)');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
