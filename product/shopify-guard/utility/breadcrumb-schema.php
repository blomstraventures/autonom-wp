/**
 * Autonom · Shopify Guard — Schema markup
 * Handles the tool page and all guide pages for this tool.
 * To add a new page: add a new key to $asg_schemas with the URL path.
 */

add_action( 'wp_head', 'autonom_shopify_guard_schema', 5 );

function autonom_shopify_guard_schema() {
    if ( is_admin() || is_feed() ) {
        return;
    }

    $path = parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH );
    $path = rtrim( $path, '/' );

    $schemas = array(

        /* -------------------------------------------------------------
           TOOL PAGE — /ready/shopify-guard/
        ------------------------------------------------------------- */
        '/ready/shopify-guard' => array(
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'SoftwareApplication',
                'name'     => 'Autonom Shopify Guard',
                'alternateName'     => 'Shopify CSV Validator',
                'applicationCategory' => 'BusinessApplication',
                'operatingSystem'     => 'Web',
                'description' => 'Free browser-based Shopify CSV validator. Checks for 30+ import errors including missing handles, blank overwrites, variant issues, encoding errors, and more.',
                'offers' => array(
                    '@type'         => 'Offer',
                    'price'         => '0',
                    'priceCurrency' => 'USD',
                ),
                'featureList' => array(
                    'Validate Shopify product CSVs before import',
                    'Detect missing and duplicate handles',
                    'Warn about destructive blank overwrites',
                    'Check variant relationships and option combinations',
                    'Map supplier columns to Shopify format',
                    'Compare store exports against update files',
                    'Batch process up to 20 files',
                    'Automatic safe fixes with full change log',
                ),
            ),
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'HowTo',
                'name'     => 'How to validate a Shopify CSV before import',
                'description' => 'Check your Shopify product CSV for import errors using Autonom Shopify Guard — a free browser-based validator.',
                'totalTime' => 'PT2M',
                'step' => array(
                    array( '@type' => 'HowToStep', 'position' => 1, 'name' => 'Drop your CSV', 'text' => 'Autonom reads the file in your browser. Nothing is uploaded to a server.' ),
                    array( '@type' => 'HowToStep', 'position' => 2, 'name' => 'Review the readiness report', 'text' => 'Every issue is grouped by severity. Each one tells you what is wrong, why it matters, and which rows are affected.' ),
                    array( '@type' => 'HowToStep', 'position' => 3, 'name' => 'Decide what to fix', 'text' => 'Safe fixes are applied automatically. Review fixes have checkboxes. Anything Autonom will not touch is flagged for you.' ),
                    array( '@type' => 'HowToStep', 'position' => 4, 'name' => 'Download your files', 'text' => 'One ZIP with your corrected CSV (or split parts), a change log, a full report, and an import checklist.' ),
                ),
            ),
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'FAQPage',
                'mainEntity' => array(
                    array( '@type' => 'Question', 'name' => 'Is my file uploaded to Autonom?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'No. Everything runs in your browser. Your CSV is never sent to a server. You can verify this in your browser\'s DevTools Network tab.' ) ),
                    array( '@type' => 'Question', 'name' => 'Is Autonom Shopify Guard free?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Yes. Every feature is free. No account, no paywall, no watermark, no credit card.' ) ),
                    array( '@type' => 'Question', 'name' => 'Does Autonom connect to my Shopify store?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'No. Autonom never connects to your Shopify store. It generates a corrected file you choose to import yourself.' ) ),
                    array( '@type' => 'Question', 'name' => 'Can Autonom guarantee my Shopify import will succeed?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'No. We do not know your store\'s current data. We check what we can check and tell you what we cannot.' ) ),
                    array( '@type' => 'Question', 'name' => 'What is a destructive blank in a Shopify CSV?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'A blank cell in a column you have included in your CSV. Shopify treats blanks in included columns as intentional overwrites — so existing products with matching handles may have their values cleared. Autonom flags these before you import.' ) ),
                    array( '@type' => 'Question', 'name' => 'How is this different from Shopify\'s built-in CSV preview?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Shopify\'s preview runs after you click import. Autonom runs before, on your local machine, with a broader set of checks — including destructive blanks, variant inconsistencies, and file size handling.' ) ),
                    array( '@type' => 'Question', 'name' => 'Will Autonom fix my Shopify CSV or just tell me what is wrong?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Both. Safe fixes are applied automatically. Review-required fixes need your approval. Issues that would require inventing data are flagged for you to fix in the source.' ) ),
                    array( '@type' => 'Question', 'name' => 'What happens if my Shopify CSV is over 15 MB?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Autonom splits it into parts under Shopify\'s limit. Products stay whole — all variant rows of the same Handle go into the same part.' ) ),
                ),
            ),
        ),

        /* -------------------------------------------------------------
           GUIDE · Handle Errors
        ------------------------------------------------------------- */
        '/guide/shopify-csv-import/handle-errors' => array(
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'Article',
                'headline' => 'Shopify CSV Handle Errors: How to Fix Missing, Duplicate, and Invalid Handles',
                'description' => 'Learn how to fix missing, duplicate, and invalid handles in your Shopify CSV before they break URLs, merge products, or create silent duplicates.',
                'author'    => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app/' ),
                'publisher' => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app' ),
                'mainEntityOfPage' => 'https://autonom.app/guide/shopify-csv-import/handle-errors/',
            ),
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'FAQPage',
                'mainEntity' => array(
                    array( '@type' => 'Question', 'name' => 'Can I leave the Handle column blank on a new-product import?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Yes, but not recommended. Shopify will auto-generate a handle from the title, which sometimes produces unexpected slugs. Always define handles explicitly.' ) ),
                    array( '@type' => 'Question', 'name' => 'What happens if I import a CSV with handles that do not match any existing product?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Shopify creates a new product. It does not fail the import. This is how merchants accidentally create duplicates when they meant to update.' ) ),
                    array( '@type' => 'Question', 'name' => 'Can I change a product handle after it has been imported?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Yes, but the old URL will 404. Shopify automatically redirects some cases but not all. If your product has external links pointing to it, consider whether the handle change is worth breaking them.' ) ),
                    array( '@type' => 'Question', 'name' => 'Are Shopify handles case-sensitive?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'No. Blue-Tee and blue-tee resolve to the same URL. But Shopify normalizes on import, so always use lowercase to avoid surprises.' ) ),
                    array( '@type' => 'Question', 'name' => 'What is the difference between Handle and URL in Shopify?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Handle is the CSV column name. URL is the full address (yourstore.com/products/handle). Same concept, different context.' ) ),
                ),
            ),
        ),

        /* -------------------------------------------------------------
           GUIDE · Blank Overwrites
        ------------------------------------------------------------- */
        '/guide/shopify-csv-import/blank-overwrites' => array(
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'Article',
                'headline' => 'Shopify CSV Blank Overwrites: How Empty Cells Erase Live Data',
                'description' => 'Blank cells in included Shopify CSV columns are treated as intentional clears. Learn how this quietly wipes prices, inventory, and titles — and how to catch it before import.',
                'author'    => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app/' ),
                'publisher' => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app' ),
                'mainEntityOfPage' => 'https://autonom.app/guide/shopify-csv-import/blank-overwrites/',
            ),
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'FAQPage',
                'mainEntity' => array(
                    array( '@type' => 'Question', 'name' => 'How do I know if a blank cell will erase data or be ignored?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'If the column is included in the CSV header, Shopify treats any blank cells in that column as intentional overwrites for matching products. If the entire column is omitted from the CSV, Shopify leaves the corresponding field alone.' ) ),
                    array( '@type' => 'Question', 'name' => 'Is there a way to tell Shopify to leave a field alone?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Yes — omit the column entirely. There is no skip-this-cell value. If a column is present, every blank cell is treated as a clear instruction.' ) ),
                    array( '@type' => 'Question', 'name' => 'What if I only want to update some products prices?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Include only the rows for products you want to update. Handle + Variant Price columns are usually enough. Rows for other products should not be in the file at all.' ) ),
                    array( '@type' => 'Question', 'name' => 'Can I recover from a destructive blank?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Yes, if you have a backup export from before the import. Re-import the original values. Without a backup, you will need to restore manually. Always export a fresh backup before any bulk import.' ) ),
                    array( '@type' => 'Question', 'name' => 'Does the destructive blank problem apply to new-product imports?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'No. New-product imports create products, so there is no existing data to erase. The destructive blank problem is specific to updates and requires the product to already exist in your store.' ) ),
                    array( '@type' => 'Question', 'name' => 'Are some CSV columns more dangerous than others?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Yes. Price, inventory quantity, title, and status are the highest-impact columns. Clearing a price or inventory count has immediate customer-facing consequences. Autonom sorts issues by severity in the report.' ) ),
                ),
            ),
        ),
		
		        /* -------------------------------------------------------------
           GUIDE · Variant Errors
        ------------------------------------------------------------- */
        '/guide/shopify-csv-import/variant-errors' => array(
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'Article',
                'headline' => 'Shopify CSV Variant Errors: Orphaned Rows, Duplicate Combinations, and Collapsed Products',
                'description' => 'Variant errors silently collapse products, drop options, and duplicate rows. Learn how Shopify handles variants in CSV — and how to catch the errors before import.',
                'author'    => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app/' ),
                'publisher' => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app' ),
                'mainEntityOfPage' => 'https://autonom.app/guide/shopify-csv-import/variant-errors/',
            ),
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'FAQPage',
                'mainEntity' => array(
                    array( '@type' => 'Question', 'name' => 'Can I have multiple variants without an Option1 Name?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'No. Shopify requires Option1 Name and Option1 Value on every variant row. Without them, Shopify cannot distinguish your variants and treats the extra rows as duplicates.' ) ),
                    array( '@type' => 'Question', 'name' => 'What is the maximum number of variants per product in Shopify?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Shopify supports up to 100 variants per product on standard plans. Shopify Plus supports up to 2,000. The 3-option structure (100 x 100 x 100) is a hard limit on the option matrix.' ) ),
                    array( '@type' => 'Question', 'name' => 'Why did my variants disappear after import?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'The most common cause is duplicate option combinations or column inconsistency. Shopify picks one interpretation and drops the others. Check the CSV for rows with the same Handle and the same option values.' ) ),
                    array( '@type' => 'Question', 'name' => 'Can I update a single variant without touching the others?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Yes, but you need to include every variant row of that product in the CSV. Shopify replaces the entire variant set when you update a product. If you only include one variant row, Shopify may delete the others.' ) ),
                    array( '@type' => 'Question', 'name' => 'Do variants need the same Handle or the same Title?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Both must match. Every variant row must have the same Handle. Only the first parent row should have a Title. Non-parent rows should leave Title blank — filling it creates ambiguity.' ) ),
                    array( '@type' => 'Question', 'name' => 'What does Option1 Name Title and Option1 Value Default Title mean?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'It is how Shopify represents a single-variant product. When a product has one variant but needs to be recognized as a variant (for example to allow multiple images), you set Option1 Name to Title and Option1 Value to Default Title. This is standard on Shopify exports.' ) ),
                ),
            ),
        ),
		
		        /* -------------------------------------------------------------
           GUIDE · Encoding Errors
        ------------------------------------------------------------- */
        '/guide/shopify-csv-import/encoding-errors' => array(
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'Article',
                'headline' => 'Shopify CSV Encoding Errors: UTF-8 BOM, Smart Quotes, and Delimiter Problems',
                'description' => 'Encoding errors break Shopify imports before they start. Learn how to fix UTF-8 BOM, smart quotes, wrong delimiters, and other invisible file problems.',
                'author'    => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app/' ),
                'publisher' => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app' ),
                'mainEntityOfPage' => 'https://autonom.app/guide/shopify-csv-import/encoding-errors/',
            ),
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'FAQPage',
                'mainEntity' => array(
                    array( '@type' => 'Question', 'name' => 'What is a UTF-8 BOM and why does it break Shopify imports?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'A BOM is a three-byte sequence (EF BB BF) that some software writes at the start of UTF-8 files. Shopify treats these bytes as part of the first column name, so Handle becomes a broken header that no longer matches. The column is effectively ignored.' ) ),
                    array( '@type' => 'Question', 'name' => 'How do I know if my CSV has a BOM?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Open the file in a text editor with encoding display (Notepad++, VS Code, Sublime Text). If the encoding shows UTF-8 with BOM, it has one. You can also check the raw bytes with a hex editor.' ) ),
                    array( '@type' => 'Question', 'name' => 'Why does my Shopify import show garbled characters like CafÃ©?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Your file is encoded in a legacy encoding (Windows-1252 or ISO-8859-1) instead of UTF-8. The accented character was stored as one byte, but Shopify reads it as two. Re-save the file as UTF-8 and the characters will display correctly.' ) ),
                    array( '@type' => 'Question', 'name' => 'Does Excel save CSV files in UTF-8 by default?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'No. Excel default CSV (Comma delimited) uses your system regional encoding, often Windows-1252 in the US. Always choose CSV UTF-8 (Comma delimited) when saving a file for Shopify.' ) ),
                    array( '@type' => 'Question', 'name' => 'What is the difference between commas and semicolons in CSV?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Both are valid CSV delimiters, but Shopify only accepts commas. Semicolons are used by default in Excel for some European locales. The first line of your CSV tells you which delimiter is being used.' ) ),
                    array( '@type' => 'Question', 'name' => 'Can I fix these errors without opening a hex editor?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Yes. Most encoding issues can be fixed by re-saving the file in a tool that forces UTF-8 without BOM — Notepad++, VS Code, or Google Sheets. For delimiters, re-export as comma-separated. A validator can also detect and fix all of these automatically.' ) ),
                ),
            ),
        ),
		
		        /* -------------------------------------------------------------
           GUIDE · CSV Template
        ------------------------------------------------------------- */
        '/guide/shopify-csv-import/csv-template' => array(
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'Article',
                'headline' => 'Shopify CSV Template: Free Download with Every Column Explained',
                'description' => 'Download a free Shopify product CSV template with every required column. Includes column reference, examples, and a built-in validator.',
                'author'    => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app/' ),
                'publisher' => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app' ),
                'mainEntityOfPage' => 'https://autonom.app/guide/shopify-csv-import/csv-template/',
            ),
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'FAQPage',
                'mainEntity' => array(
                    array( '@type' => 'Question', 'name' => 'Where can I download a Shopify CSV template?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'You can download ours above, or export a template from your own Shopify store (Products, Export, All products, Plain CSV). The Shopify export is the most accurate source because it includes every column your specific store uses.' ) ),
                    array( '@type' => 'Question', 'name' => 'What columns are required in a Shopify product CSV?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'For a new product, only Handle and Title are strictly required, but you will also want Variant Price for the product to be sellable. For updating existing products, only Handle is required.' ) ),
                    array( '@type' => 'Question', 'name' => 'Can I delete columns I do not need?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Yes. Shopify ignores columns that are not in its schema, and it only processes columns you have included. The only caution: for update imports, do not leave a column in the file if most of its cells are blank, because you will trigger blank overwrites.' ) ),
                    array( '@type' => 'Question', 'name' => 'Does column order matter in a Shopify CSV?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'No. Shopify matches column names, not positions. You can reorder columns freely.' ) ),
                    array( '@type' => 'Question', 'name' => 'Can I add custom columns to a Shopify CSV?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'You can add them, but Shopify will ignore them unless they are metafield columns. To store custom data, use metafields (columns starting with Metafield:) or the Tags column.' ) ),
                    array( '@type' => 'Question', 'name' => 'What file format does Shopify accept for product imports?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Shopify only accepts CSV files (.csv extension) with UTF-8 encoding and comma delimiters. Files that are .xlsx, .xls, or .numbers will be rejected.' ) ),
                    array( '@type' => 'Question', 'name' => 'Can I use this Shopify CSV template for Shopify Plus?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Yes. The template works for both standard Shopify and Shopify Plus. Plus stores support more variants per product (up to 2,000 vs 100), but the column structure is identical.' ) ),
                    array( '@type' => 'Question', 'name' => 'What is the difference between this template and Shopify default export?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Our template includes the same columns but with one example row and clearer column descriptions. Shopify export contains your actual store data with no examples — which is what you want for updates, but not helpful as a blank starting point.' ) ),
                ),
            ),
        ),
		
		        /* -------------------------------------------------------------
           GUIDE · Before-Import Checklist
        ------------------------------------------------------------- */
        '/guide/shopify-csv-import/before-import' => array(
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'Article',
                'headline' => 'Shopify CSV Import Checklist: 15 Checks Before You Upload',
                'description' => 'A 15-point checklist for validating your Shopify product CSV before import. Covers handles, prices, variants, encoding, and the destructive blanks that erase live data.',
                'author'    => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app/' ),
                'publisher' => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app' ),
                'mainEntityOfPage' => 'https://autonom.app/guide/shopify-csv-import/before-import/',
            ),
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'FAQPage',
                'mainEntity' => array(
                    array( '@type' => 'Question', 'name' => 'How often should I run this Shopify CSV checklist?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Every time before you import a CSV that touches existing products. For new-product imports, checks 1 through 11 are the critical ones. For update imports, check 13 (destructive blanks) becomes the most important one.' ) ),
                    array( '@type' => 'Question', 'name' => 'What is the most common cause of failed Shopify imports?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'The top three are: missing Handle values, blank cells in included columns (destructive blanks), and duplicate option combinations. These three account for the majority of silent import failures.' ) ),
                    array( '@type' => 'Question', 'name' => 'Can I import a CSV without a backup?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'You can, but it is risky. If the import modifies products in ways you did not intend, you cannot restore them without re-entering data manually. Always export a backup first — it takes 30 seconds.' ) ),
                    array( '@type' => 'Question', 'name' => 'Do I need to run every check every time before importing?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'For small imports under 50 rows you can usually eyeball checks 1 through 4 and be done. For anything larger, run all 15. The Autonom validator handles this automatically.' ) ),
                    array( '@type' => 'Question', 'name' => 'What is the safest way to test a Shopify import?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Create a small test CSV with 2 to 5 products — either new ones you will delete afterward, or existing products you can manually verify. Import that first. If it works, run the full file.' ) ),
                    array( '@type' => 'Question', 'name' => 'What if my Shopify import already failed?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Re-export your products from Shopify Admin. The current state of your store is the new truth. From there, run the CSV through the validator, fix the errors it finds, and try again.' ) ),
                    array( '@type' => 'Question', 'name' => 'Are there checks specific to Shopify Plus CSV imports?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'The checks are the same. Plus stores support more variants per product (up to 2,000 vs 100), so check 10 on duplicate option combinations applies to a much larger space of combinations.' ) ),
                ),
            ),
        ),
		
		        /* -------------------------------------------------------------
           PILLAR · Shopify CSV Import Guide
        ------------------------------------------------------------- */
        '/guide/shopify-csv-import' => array(
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'Article',
                'headline' => 'Shopify CSV Import Guide: The Complete Reference',
                'description' => 'The complete guide to importing Shopify product CSVs. Covers structure, handle matching, blank overwrites, variant errors, encoding, and pre-import validation.',
                'author'    => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app/' ),
                'publisher' => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app' ),
                'mainEntityOfPage' => 'https://autonom.app/guide/shopify-csv-import/',
            ),
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'FAQPage',
                'mainEntity' => array(
                    array( '@type' => 'Question', 'name' => 'What file format does Shopify accept for product imports?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Shopify only accepts CSV files — specifically UTF-8 encoded, comma-delimited files with the .csv extension. Files saved as .xlsx, .xls, .numbers, or with semicolon delimiters will be rejected.' ) ),
                    array( '@type' => 'Question', 'name' => 'How many products can I import into Shopify at once?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Shopify does not limit the number of products, but it does limit file size to 15 MB. If your file exceeds that, split it into multiple files. Each file imports independently.' ) ),
                    array( '@type' => 'Question', 'name' => 'Will importing a CSV delete my existing Shopify products?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'No. A CSV import never deletes products. It creates new ones or updates existing ones. However, if you include a column in your update CSV and leave cells blank, Shopify will clear those fields on matching products — which can feel like deletion.' ) ),
                    array( '@type' => 'Question', 'name' => 'How do I know if a Shopify import succeeded?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Shopify shows an import summary at the end of the process. It lists how many products were created, updated, or skipped. But success does not mean the data is correct — always verify a sample of the results on the storefront.' ) ),
                    array( '@type' => 'Question', 'name' => 'Can I import Shopify products that do not have handles yet?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Yes, but not recommended. Shopify will auto-generate a handle from the title. The generated handles are sometimes unpredictable, especially for titles with special characters. Always define handles explicitly.' ) ),
                    array( '@type' => 'Question', 'name' => 'What happens if my Shopify CSV has extra columns Shopify does not recognize?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Shopify ignores unknown columns silently. Your import still succeeds, but the data in those columns is not stored anywhere. If you need to store extra data, use tags or metafields.' ) ),
                    array( '@type' => 'Question', 'name' => 'Do I need to include every column in my Shopify CSV?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'No. Include only the columns you are actively importing. This is safer than including columns you do not need, because any column you include triggers the blank overwrite behavior for its blank cells.' ) ),
                    array( '@type' => 'Question', 'name' => 'How do I backup my Shopify products before importing?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Shopify Admin, Products, Export, All products, Plain CSV file. Save the resulting file. If your import goes wrong, re-import this file to restore your products to their previous state.' ) ),
                    array( '@type' => 'Question', 'name' => 'What is the difference between creating and updating Shopify products via CSV?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'The format is identical. The difference is whether the Handle matches an existing product. If it does, Shopify updates. If it does not, Shopify creates. You do not tell Shopify which mode to use — it decides based on the handles in your file.' ) ),
                    array( '@type' => 'Question', 'name' => 'Can I roll back a Shopify import if something goes wrong?', 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => 'Only if you exported a backup before importing. Shopify does not offer built-in version history for products. Re-importing the backup file restores the previous state for the fields it contains.' ) ),
                ),
            ),
        ),
		
		/* -------------------------------------------------------------
           HUB · Guides
        ------------------------------------------------------------- */
        '/guide' => array(
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'CollectionPage',
                'name'     => 'Autonom Guides',
                'description' => 'Step-by-step guides for Autonom readiness tools. Practical references for preparing files correctly.',
                'publisher' => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app' ),
                'mainEntityOfPage' => 'https://autonom.app/guide/',
                'hasPart' => array(
                    array(
                        '@type' => 'Article',
                        'name' => 'Shopify CSV Import Guide',
                        'url' => 'https://autonom.app/guide/shopify-csv-import/',
                    ),
                ),
            ),
        ),
		
		/* -------------------------------------------------------------
           HUB · Ready Tools
        ------------------------------------------------------------- */
        '/ready' => array(
            array(
                '@context' => 'https://schema.org',
                '@type'    => 'CollectionPage',
                'name'     => 'Ready Tools — Autonom',
                'description' => 'Autonom Ready tools prepare your files for specific destinations before you upload. Shopify Guard, PDF Preflight, and more.',
                'publisher' => array( '@type' => 'Organization', 'name' => 'Autonom', 'url' => 'https://autonom.app' ),
                'mainEntityOfPage' => 'https://autonom.app/ready/',
                'hasPart' => array(
                    array(
                        '@type' => 'SoftwareApplication',
                        'name' => 'Autonom Shopify Guard',
                        'url' => 'https://autonom.app/ready/shopify-guard/',
                    ),
                ),
            ),
        ),

        /* -------------------------------------------------------------
           ADD NEW PAGES HERE (copy the pattern above)
        ------------------------------------------------------------- */

    );

    if ( isset( $schemas[ $path ] ) ) {
        foreach ( $schemas[ $path ] as $schema ) {
            echo '<script type="application/ld+json">'
                . wp_json_encode( $schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
                . '</script>' . "\n";
        }
    }
}
