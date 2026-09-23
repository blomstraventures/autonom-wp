/**
 * Autonom PDF Ready — v4.0
 * Local-first PDF inspection. No file content leaves the browser.
 * Fix guides integrated from consultant logic.
 */
(function () {
  'use strict';

  var PDFJS_VERSION = '3.11.174';
  var PDFJS_BASE    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VERSION + '/';

  /* ---------- FIX GUIDES ---------- */
  var GUIDES = {
    'doc.version':        'Re-save the file from a standard PDF producer: Adobe Acrobat, Microsoft Word (Save As PDF), or LibreOffice. Avoid unknown online converters.',
    'doc.encrypted':      'In Acrobat: File > Properties > Security > change Security Method to "No Security". In macOS Preview: File > Export > uncheck "Encrypt". Remove encryption before submission — portals often reject encrypted files.',
    'doc.linearized':     'In Adobe Acrobat Pro: File > Save As Other > Optimized PDF > check "Fast Web View". Recommended for large PDFs served over the web.',
    'doc.title':          'In Acrobat: File > Properties > Description > Title. In Word: File > Info > Properties. A title improves browser tabs, search results, and screen reader output.',
    'doc.lang':           'In Acrobat Pro: File > Properties > Advanced > Language. In InDesign: ensure document language is set before export. Required for correct screen reader pronunciation.',
    'page.sizes':         'In InDesign: File > Document Setup. In Word: Layout > Size. In Acrobat Pro: Tools > Print Production > Preflight > Fix page sizes. Uniform page sizes are required for print, KDP, and most submissions.',
    'page.orientation':   'In Acrobat Pro: Document > Rotate Pages. Check whether mixed orientation is intentional — some documents (portfolio, magazine) deliberately mix, most do not.',
    'page.blank':         'In Acrobat Pro: Tools > Organize Pages > select blank pages > Delete. In Word: check for accidental page breaks.',
    'page.bleedbox':      'In InDesign: File > Export > Adobe PDF (Print) > Marks and Bleeds > check "Use Document Bleed Settings" and set 3mm (0.125 in). In Illustrator: File > Document Setup > Bleed.',
    'page.trimbox':       'In InDesign: File > Export > Adobe PDF (Print) > Marks and Bleeds > check "Crop Marks" and "Use Document Bleed Settings". The TrimBox defines the final trim size.',
    'font.embedded':      'In Adobe Acrobat: File > Properties > Fonts. Every font must say "(Embedded)" or "(Embedded Subset)". In Word: File > Options > Save > check "Embed fonts in the file". Non-embedded fonts are the #1 cause of print rejection.',
    'color.cmyk':         'In InDesign: Window > Color > set colors in CMYK (not RGB). File > Export > Adobe PDF (Print) > Output > Color Conversion > "Convert to Destination" with a printer profile such as FOGRA39 or GRACoL.',
    'color.transparency': 'In Acrobat Pro: Tools > Print Production > Flatten Preview to see affected areas. Some printers require flattening via "Print Production > Flattener Preview" or export from InDesign with "Flatten Transparency" enabled.',
    'struct.tagged':      'In Acrobat Pro: Tools > Accessibility > Autotag Document. In Word: Save As PDF > Options > check "Document structure tags for accessibility". Required by many academic and government portals.',
    'profile.print.dpi':  'In Photoshop: Image > Image Size > set Resolution to 300 pixels/inch. In InDesign: check "Effective PPI" in the Links panel — images below 300 DPI at final placement size will print soft.',
    'profile.print.fonts':'Re-export with "Embed all fonts" enabled. Commercial printers reject any PDF with non-embedded fonts, even from paid font licenses.',
    'profile.print.bleed':'Add 3mm (0.125 in) bleed on all four sides in your layout tool, then re-export with "Use Document Bleed Settings" enabled.',
    'profile.kdp.size':   "Compare against Amazon KDP's current trim-size table. Common paperback sizes: 5×8, 5.25×8, 5.5×8.5, 6×9. Any deviation causes rejection.",
    'profile.kdp.margins':"KDP minimum inside margin ranges from 0.375 in (24–150 pages) to 0.875 in (701–828 pages). Verify your inside margin for your specific page count.",
    'profile.kdp.fonts':  'Enable font embedding when exporting. KDP rejects any PDF with non-embedded fonts.',
    'profile.kdp.pages':  'KDP paperbacks require at least 24 pages. If your manuscript is shorter, consider combining with another work or switching to a digital-only format.',
    'profile.academic.size':'Many journals cap submissions at 10 MB. Downsample images or subset fonts. In Acrobat: File > Save As Other > Reduced Size PDF.',
    'profile.academic.fonts':'Export with font embedding enabled. Non-embedded fonts are a common cause of rejection in academic submission portals.',
    'profile.digital.linear':"Re-save with 'Optimize for Fast Web View' enabled in Acrobat, or use a linearizer.",
    'profile.general.scanned':'Run OCR (Acrobat, Tesseract, or your scanner software) to add a searchable text layer. Scanned PDFs without OCR cannot be indexed or searched.'
  };

  /* ---------- CONSTANTS ---------- */
  var CATEGORIES = [
    ['document',  'Document & Metadata'],
    ['pages',     'Pages & Geometry'],
    ['fonts',     'Fonts (Critical for Print)'],
    ['images',    'Images'],
    ['colors',    'Color & Transparency'],
    ['structure', 'Structure & Accessibility'],
    ['profile',   'Profile-Specific Requirements']
  ];
  var DETAIL_SCAN_LIMIT = 300;
  var SAMPLE_STEP = 5;
  var LARGE_FILE_BYTES = 50 * 1024 * 1024;

  var state = { file: null, profile: 'general', report: null };

  function loadPdfJs(cb) {
    if (window.pdfjsLib) return cb();
    var script = document.createElement('script');
    script.src = PDFJS_BASE + 'pdf.min.js';
    script.async = true;
    script.onload = function () {
      if (!window.pdfjsLib) return cb(new Error('PDF.js loaded but global not defined.'));
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js';
      cb();
    };
    script.onerror = function () {
      cb(new Error('Failed to load PDF.js from CDN. Check network or CSP settings.'));
    };
    document.head.appendChild(script);
  }

  function init() {
    var root = document.getElementById('autonom-pdf-ready');
    if (!root) return;

    var $ = function (id) { return root.querySelector('#' + id) || document.getElementById(id); };

    var dropEl        = $('apf-drop');
    var fileInput     = $('apf-file');
    var chooseBtn     = $('apf-choose');
    var fileCard      = $('apf-filecard');
    var fnameEl       = $('apf-fname');
    var fsubEl        = $('apf-fsub');
    var resetBtn      = $('apf-reset');
    var profilesSec   = $('apf-profiles');
    var profileGrid   = $('apf-profile-grid');
    var runBtn        = $('apf-run');
    var progressSec   = $('apf-progress');
    var progTitle     = $('apf-prog-title');
    var progDetail    = $('apf-prog-detail');
    var barFill       = $('apf-bar-fill');
    var resultsSec    = $('apf-results');
    var titleEl       = $('apf-title');
    var subEl         = $('apf-sub');
    var scoreEl       = $('apf-score');
    var statsEl       = $('apf-stats');
    var checksEl      = $('apf-checks');
    var techEl        = $('apf-technical');
    var exportJsonBtn = $('apf-export-json');
    var exportTextBtn = $('apf-export-text');
    var copySummaryBtn= $('apf-copy-summary');

    if (!dropEl || !fileInput) return;

    function selectFile(f) {
      state.file = f;
      fnameEl.textContent = f.name;
      fsubEl.textContent =
        bytes(f.size) + ' · modified ' + new Date(f.lastModified).toLocaleDateString();
      dropEl.classList.add('apf-hidden');
      fileCard.classList.remove('apf-hidden');
      profilesSec.classList.remove('apf-hidden');
      progressSec.classList.add('apf-hidden');
      resultsSec.classList.add('apf-hidden');
    }

    function resetAll() {
      state.file = null;
      state.report = null;
      fileInput.value = '';
      dropEl.classList.remove('apf-hidden');
      fileCard.classList.add('apf-hidden');
      profilesSec.classList.add('apf-hidden');
      progressSec.classList.add('apf-hidden');
      resultsSec.classList.add('apf-hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    chooseBtn.addEventListener('click', function () { fileInput.value = ''; fileInput.click(); });
    fileInput.addEventListener('change', function () {
      if (fileInput.files[0]) selectFile(fileInput.files[0]);
    });
    resetBtn.addEventListener('click', resetAll);

    ['dragenter', 'dragover'].forEach(function (evt) {
      dropEl.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        dropEl.classList.add('drag');
      });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      dropEl.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        dropEl.classList.remove('drag');
      });
    });
    dropEl.addEventListener('drop', function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      for (var i = 0; i < files.length; i++) {
        var x = files[i];
        if (x.type === 'application/pdf' || /\.pdf$/i.test(x.name)) { selectFile(x); break; }
      }
    });

    profileGrid.addEventListener('click', function (e) {
      var btn = e.target.closest('.apf-profile');
      if (!btn) return;
      profileGrid.querySelectorAll('.apf-profile').forEach(function (x) { x.classList.remove('active'); });
      btn.classList.add('active');
      state.profile = btn.dataset.p;
    });

    runBtn.addEventListener('click', run);
    exportJsonBtn.addEventListener('click', function () { downloadReport('json'); });
    exportTextBtn.addEventListener('click', function () { downloadReport('text'); });
    copySummaryBtn.addEventListener('click', copySummary);

    function progressUpdate(pct, title, detail) {
      barFill.style.width = pct + '%';
      if (title)  progTitle.textContent = title;
      if (detail) progDetail.textContent = detail;
    }

    async function run() {
      if (!state.file) return;
      if (!window.pdfjsLib) {
        runBtn.disabled = true;
        runBtn.textContent = 'Loading PDF engine…';
        try {
          await new Promise(function (res, rej) {
            loadPdfJs(function (err) { err ? rej(err) : res(); });
          });
        } catch (e) {
          renderError(e);
          runBtn.disabled = false;
          runBtn.textContent = 'Run Readiness Check';
          return;
        }
      }

      runBtn.disabled = true;
      runBtn.textContent = 'Checking…';
      progressSec.classList.remove('apf-hidden');
      resultsSec.classList.add('apf-hidden');
      progressSec.scrollIntoView({ behavior: 'smooth', block: 'center' });

      try {
        var report = await inspect(state.file, state.profile, progressUpdate);
        state.report = report;
        render(report);
      } catch (e) {
        console.error(e);
        renderError(e);
      } finally {
        runBtn.disabled = false;
        runBtn.textContent = 'Run Readiness Check';
        progressSec.classList.add('apf-hidden');
      }
    }

    /* =====================================================================
       INSPECTION ENGINE — unchanged working logic
       ===================================================================== */
    async function inspect(file, profile, progress) {
      var pdfjsLib = window.pdfjsLib;

      progress(5, 'Reading file…', 'Loading bytes into browser memory.');
      var arrayBuf = await file.arrayBuffer();
      var bytes8 = new Uint8Array(arrayBuf);
      var rawText = new TextDecoder('latin1').decode(bytes8);

      progress(15, 'Opening PDF…', 'Initializing PDF.js parser.');
      var pdf = await pdfjsLib.getDocument({ data: bytes8 }).promise;

      progress(25, 'Reading metadata…', 'Document info and XMP.');
      var meta = await pdf.getMetadata().catch(function () { return { info: {}, metadata: null }; });

      var versionMatch = rawText.match(/%PDF-(\d+\.\d+)/);
      var pdfVersion = versionMatch ? versionMatch[1] : null;
      var encrypted  = /\/Encrypt\s+\d+\s+\d+\s+R/.test(rawText);
      var linearized = rawText.slice(0, 2048).indexOf('/Linearized') !== -1;
      var tagged     = /\/MarkInfo\s*<<[^>]*\/Marked\s+true/.test(rawText)
                    || /\/StructTreeRoot/.test(rawText);
      var langMatch  = rawText.match(/\/Lang\s*\(([^)]+)\)/);
      var docLang    = langMatch ? langMatch[1] : null;

      var hasCropBox  = /\/CropBox/.test(rawText);
      var hasBleedBox = /\/BleedBox/.test(rawText);
      var hasTrimBox  = /\/TrimBox/.test(rawText);
      var hasArtBox   = /\/ArtBox/.test(rawText);

      var declaredFonts = new Set();
      var bfRe = /\/BaseFont\s*\/([A-Za-z0-9+\-_,\.]+)/g;
      var bfm;
      while ((bfm = bfRe.exec(rawText))) {
        declaredFonts.add(bfm[1].replace(/^[A-Z]{6}\+/, ''));
      }
      var embeddedFontFileCount = (rawText.match(/\/FontFile[23]?\s+\d+\s+\d+\s+R/g) || []).length;

      var totalPages = pdf.numPages;
      var sampleEvery = totalPages > DETAIL_SCAN_LIMIT ? SAMPLE_STEP : 1;

      var pages = [];
      var sizes = new Map();
      var orientations = { portrait: 0, landscape: 0, square: 0 };
      var rotations = new Set();
      var blankPages = [];
      var colorSpaces = new Set();
      var fontsInContent = new Set();
      var totalChars = 0, totalImages = 0, totalOps = 0, transparentPages = 0;
      var hasOutline = false, hasAnnotations = false, hasForms = false;

      try {
        var outline = await pdf.getOutline();
        hasOutline = !!(outline && outline.length);
      } catch (_) {}

      for (var n = 1; n <= totalPages; n++) {
        var doFullScan = (n === 1) || (n <= DETAIL_SCAN_LIMIT) || (n % sampleEvery === 0);

        if (n === 1 || n % Math.max(1, Math.floor(totalPages / 10)) === 0) {
          var pct = 25 + Math.floor((n / totalPages) * 60);
          progress(pct, 'Analyzing page ' + n + ' of ' + totalPages + '…', 'Local processing only.');
        }

        var page = await pdf.getPage(n);
        var vp = page.getViewport({ scale: 1 });

        var sizeKey = vp.width.toFixed(0) + 'x' + vp.height.toFixed(0);
        sizes.set(sizeKey, (sizes.get(sizeKey) || 0) + 1);

        if (Math.abs(vp.width - vp.height) < 1) orientations.square++;
        else if (vp.width > vp.height) orientations.landscape++;
        else orientations.portrait++;

        rotations.add(page.rotate || 0);

        var chars = 0, imgCount = 0, opCount = 0;

        if (doFullScan) {
          try {
            var tc = await page.getTextContent();
            for (var ti = 0; ti < tc.items.length; ti++) {
              chars += (tc.items[ti].str || '').length;
            }
          } catch (_) {}

          try {
            var ops = await page.getOperatorList();
            var fnArr = ops.fnArray, argArr = ops.argsArray;
            opCount = fnArr.length;

            for (var i = 0; i < fnArr.length; i++) {
              var fn = fnArr[i], args = argArr[i];

              if (fn === pdfjsLib.OPS.paintImageXObject ||
                  fn === pdfjsLib.OPS.paintInlineImageXObject ||
                  fn === pdfjsLib.OPS.paintImageMaskXObject ||
                  fn === pdfjsLib.OPS.paintJpegXObject ||
                  fn === pdfjsLib.OPS.paintSolidColorImageMask) {
                imgCount++;
              }

              if (fn === pdfjsLib.OPS.setFont && args && args[0]) {
                fontsInContent.add(String(args[0]).replace(/^[A-Z]{6}\+/, ''));
              }

              if (fn === pdfjsLib.OPS.setFillRGBColor || fn === pdfjsLib.OPS.setStrokeRGBColor) colorSpaces.add('RGB');
              if (fn === pdfjsLib.OPS.setFillCMYKColor || fn === pdfjsLib.OPS.setStrokeCMYKColor) colorSpaces.add('CMYK');
              if (fn === pdfjsLib.OPS.setFillGray || fn === pdfjsLib.OPS.setStrokeGray) colorSpaces.add('Gray');
            }

            if (fnArr.indexOf(pdfjsLib.OPS.setGState) !== -1) transparentPages++;
          } catch (_) {}

          try {
            var annots = await page.getAnnotations({ intent: 'display' });
            if (annots && annots.length) {
              hasAnnotations = true;
              for (var ai = 0; ai < annots.length; ai++) {
                if (annots[ai].subtype === 'Widget') { hasForms = true; break; }
              }
            }
          } catch (_) {}

          var isBlank = chars === 0 && imgCount === 0 && opCount < 8;
          if (isBlank) blankPages.push(n);
        }

        pages.push({ n: n, w: vp.width, h: vp.height, chars: chars, images: imgCount, ops: opCount, rotation: page.rotate || 0 });
        totalChars += chars;
        totalImages += imgCount;
        totalOps += opCount;
      }

      progress(90, 'Compiling results…', 'Applying profile rules.');

      return {
        generatedAt: new Date().toISOString(),
        tool: 'Autonom PDF Ready v4.0',
        file: { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified },
        profile: profile,
        pdf: {
          numPages: totalPages,
          version: pdfVersion,
          encrypted: encrypted,
          linearized: linearized,
          tagged: tagged,
          hasOutline: hasOutline,
          hasAnnotations: hasAnnotations,
          hasForms: hasForms,
          boxes: { crop: hasCropBox, bleed: hasBleedBox, trim: hasTrimBox, art: hasArtBox }
        },
        meta: {
          title:        (meta.info && meta.info.Title) || null,
          author:       (meta.info && meta.info.Author) || null,
          subject:      (meta.info && meta.info.Subject) || null,
          keywords:     (meta.info && meta.info.Keywords) || null,
          creator:      (meta.info && meta.info.Creator) || null,
          producer:     (meta.info && meta.info.Producer) || null,
          creationDate: (meta.info && meta.info.CreationDate) || null,
          modDate:      (meta.info && meta.info.ModDate) || null,
          hasXMP:       !!(meta.metadata),
          lang:         docLang
        },
        fonts: {
          declared: Array.from(declaredFonts),
          used: Array.from(fontsInContent),
          embeddedFontFileCount: embeddedFontFileCount
        },
        pages: pages,
        stats: {
          totalChars: totalChars,
          totalImages: totalImages,
          totalOps: totalOps,
          sizeDistribution: Array.from(sizes.entries()).map(function (e) { return { size: e[0], count: e[1] }; }),
          orientations: orientations,
          rotations: Array.from(rotations),
          blankPages: blankPages,
          transparentPages: transparentPages,
          sampled: totalPages > DETAIL_SCAN_LIMIT,
          sampleEvery: sampleEvery
        },
        colors: { spaces: Array.from(colorSpaces) }
      };
    }

    /* =====================================================================
       CHECKS — full rule set
       ===================================================================== */
    function buildChecks(r) {
      var checks = [];
      function add(cat, id, name, status, detail, fix) {
        checks.push({ cat: cat, id: id, name: name, status: status, detail: detail, fix: fix || null });
      }

      /* DOCUMENT */
      add('document', 'doc.version', 'PDF version',
        r.pdf.version ? 'pass' : 'warn',
        r.pdf.version ? 'PDF ' + r.pdf.version + ' declared in header.' : 'Could not read a PDF version from the file header.',
        GUIDES['doc.version']);

      add('document', 'doc.encrypted', 'Encryption / password',
        r.pdf.encrypted ? 'warn' : 'pass',
        r.pdf.encrypted ? 'The document appears to be encrypted or password-protected. Some checks may be limited.' : 'No encryption dictionary detected.',
        r.pdf.encrypted ? GUIDES['doc.encrypted'] : null);

      add('document', 'doc.size', 'File size',
        r.file.size <= LARGE_FILE_BYTES ? 'pass' : 'warn',
        bytes(r.file.size) + '.',
        r.file.size > LARGE_FILE_BYTES ? 'Consider image downsampling or linearization for easier distribution.' : null);

      add('document', 'doc.linearized', 'Fast Web View (linearized)',
        r.pdf.linearized ? 'pass' : 'info',
        r.pdf.linearized ? 'Document is linearized — first page renders before the full file downloads.' : 'Document is not linearized. Recommended for large PDFs served from the web.',
        r.pdf.linearized ? null : GUIDES['doc.linearized']);

      add('document', 'doc.title', 'Title metadata',
        r.meta.title ? 'pass' : 'warn',
        r.meta.title ? '"' + r.meta.title + '"' : 'No title is set in document metadata.',
        r.meta.title ? null : GUIDES['doc.title']);

      add('document', 'doc.author', 'Author metadata',
        r.meta.author ? 'pass' : 'info',
        r.meta.author || 'No author specified.', null);

      add('document', 'doc.subject', 'Subject metadata',
        r.meta.subject ? 'pass' : 'info',
        r.meta.subject || 'No subject specified.', null);

      add('document', 'doc.keywords', 'Keywords metadata',
        r.meta.keywords ? 'pass' : 'info',
        r.meta.keywords || 'No keywords specified.', null);

      add('document', 'doc.creator', 'Creator application', 'info',
        r.meta.creator || 'Not reported.', null);

      add('document', 'doc.producer', 'Producer application', 'info',
        r.meta.producer || 'Not reported.', null);

      add('document', 'doc.dates', 'Creation & modification dates', 'info',
        [r.meta.creationDate ? 'Created: ' + r.meta.creationDate : null,
         r.meta.modDate ? 'Modified: ' + r.meta.modDate : null].filter(Boolean).join(' · ')
        || 'No creation or modification dates reported.', null);

      add('document', 'doc.lang', 'Document language',
        r.meta.lang ? 'pass' : 'warn',
        r.meta.lang ? 'Declared as "' + r.meta.lang + '".' : 'No document language is declared.',
        r.meta.lang ? null : GUIDES['doc.lang']);

      add('document', 'doc.xmp', 'XMP metadata stream',
        r.meta.hasXMP ? 'pass' : 'info',
        r.meta.hasXMP ? 'XMP metadata stream present.' : 'No XMP metadata stream detected (older-style Info dict only).', null);

      /* PAGES */
      add('pages', 'page.count', 'Page count',
        r.pdf.numPages > 0 ? 'pass' : 'fail',
        r.pdf.numPages + ' page' + (r.pdf.numPages === 1 ? '' : 's') + '.', null);

      var uniqueSizes = r.stats.sizeDistribution.length;
      add('pages', 'page.sizes', 'Page size consistency',
        uniqueSizes === 1 ? 'pass' : 'warn',
        uniqueSizes === 1
          ? 'All pages share ' + fmtSize(r.stats.sizeDistribution[0].size) + '.'
          : uniqueSizes + ' different page sizes: ' + r.stats.sizeDistribution.map(function (s) { return s.size + ' (' + s.count + ' page' + (s.count === 1 ? '' : 's') + ')'; }).join(', ') + '.',
        uniqueSizes === 1 ? null : GUIDES['page.sizes']);

      var o = r.stats.orientations;
      var mixed = o.portrait > 0 && o.landscape > 0;
      add('pages', 'page.orientation', 'Page orientation consistency',
        mixed ? 'warn' : 'pass',
        mixed
          ? 'Mixed orientations: ' + o.portrait + ' portrait, ' + o.landscape + ' landscape.'
          : 'Consistent orientation: ' + o.portrait + ' portrait, ' + o.landscape + ' landscape, ' + o.square + ' square.',
        mixed ? GUIDES['page.orientation'] : null);

      var rotations = r.stats.rotations.filter(function (x) { return x !== 0; });
      add('pages', 'page.rotation', 'Page rotation values',
        rotations.length === 0 ? 'pass' : 'info',
        rotations.length === 0 ? 'No page rotation applied.' : 'Some pages have a non-zero rotation: ' + rotations.join('°, ') + '°.',
        null);

      add('pages', 'page.blank', 'Blank pages',
        r.stats.blankPages.length === 0 ? 'pass' : 'warn',
        r.stats.blankPages.length === 0
          ? 'No blank pages detected.'
          : r.stats.blankPages.length + ' likely blank page' + (r.stats.blankPages.length === 1 ? '' : 's') + ': ' + r.stats.blankPages.slice(0, 12).join(', ') + (r.stats.blankPages.length > 12 ? '…' : '') + '.',
        r.stats.blankPages.length ? GUIDES['page.blank'] : null);

      add('pages', 'page.cropbox', 'CropBox defined',
        r.pdf.boxes.crop ? 'pass' : 'info',
        r.pdf.boxes.crop ? 'A CropBox is defined on at least one page.' : 'No CropBox declared. The MediaBox is used as the visible page.',
        null);

      if (r.profile === 'print' || r.profile === 'kdp') {
        add('pages', 'page.bleedbox', 'BleedBox defined',
          r.pdf.boxes.bleed ? 'pass' : 'warn',
          r.pdf.boxes.bleed ? 'A BleedBox is declared.' : 'No BleedBox declared — required for print files that need bleed.',
          r.pdf.boxes.bleed ? null : GUIDES['page.bleedbox']);

        add('pages', 'page.trimbox', 'TrimBox defined',
          r.pdf.boxes.trim ? 'pass' : 'warn',
          r.pdf.boxes.trim ? 'A TrimBox is declared — final trim size is explicit.' : 'No TrimBox declared — printer cannot determine the final trim size reliably.',
          r.pdf.boxes.trim ? null : GUIDES['page.trimbox']);
      }

      /* FONTS */
      var declaredCount = r.fonts.declared.length;
      var embeddedCount = r.fonts.embeddedFontFileCount;

      add('fonts', 'font.count', 'Fonts referenced', 'info',
        declaredCount > 0
          ? declaredCount + ' font' + (declaredCount === 1 ? '' : 's') + ' referenced: ' + r.fonts.declared.slice(0, 8).join(', ') + (declaredCount > 8 ? '…' : '') + '.'
          : 'No fonts referenced (or none were readable in a raw scan).',
        null);

      var fontStatus, fontDetail, fontFix;
      if (declaredCount === 0) {
        fontStatus = 'info';
        fontDetail = 'No fonts detected in raw scan; cannot evaluate embedding.';
        fontFix = null;
      } else if (embeddedCount >= declaredCount) {
        fontStatus = 'pass';
        fontDetail = 'Embedded font streams found (' + embeddedCount + ') for ' + declaredCount + ' referenced font' + (declaredCount === 1 ? '' : 's') + '.';
        fontFix = null;
      } else if (embeddedCount > 0) {
        fontStatus = 'warn';
        fontDetail = 'Only ' + embeddedCount + ' embedded font stream' + (embeddedCount === 1 ? '' : 's') + ' found for ' + declaredCount + ' referenced font' + (declaredCount === 1 ? '' : 's') + '. Some fonts may not be embedded.';
        fontFix = GUIDES['font.embedded'];
      } else {
        fontStatus = 'warn';
        fontDetail = declaredCount + ' font' + (declaredCount === 1 ? '' : 's') + ' referenced, no embedded font streams detected. Fonts are likely referenced by name only.';
        fontFix = GUIDES['font.embedded'];
      }
      add('fonts', 'font.embedded', 'Font embedding', fontStatus, fontDetail, fontFix);

      var subsetPrefixes = r.fonts.declared.filter(function (f) { return /^[A-Z]{6}\+/.test(f); }).length;
      add('fonts', 'font.subset', 'Font subsetting', 'info',
        subsetPrefixes > 0
          ? subsetPrefixes + ' of ' + declaredCount + ' font' + (declaredCount === 1 ? '' : 's') + ' appear to be subsetted (6-letter tag prefix).'
          : 'No font subsetting prefixes detected.',
        null);

      /* IMAGES */
      add('images', 'img.count', 'Image XObjects',
        r.stats.totalImages > 0 ? 'info' : 'pass',
        r.stats.totalImages > 0
          ? r.stats.totalImages + ' image paint operation' + (r.stats.totalImages === 1 ? '' : 's') + ' detected across ' + r.pdf.numPages + ' page' + (r.pdf.numPages === 1 ? '' : 's') + '.'
          : 'No raster image operations detected. Document appears to be vector / text only.',
        null);

      add('images', 'img.dpi', 'Effective image resolution (DPI)', 'info',
        'Precise DPI computation requires per-image transformation matrices and is scheduled for a future release. Verify image resolution in your authoring tool before print.',
        null);

      /* COLORS */
      var cs = r.colors.spaces;
      add('colors', 'color.spaces', 'Color spaces used', 'info',
        cs.length ? 'Detected: ' + cs.join(', ') + '.' : 'No color-space operators detected — the document may be text/vector only.',
        null);

      if (r.profile === 'print' || r.profile === 'kdp') {
        var hasCMYK = cs.indexOf('CMYK') !== -1;
        var hasRGB  = cs.indexOf('RGB') !== -1;
        add('colors', 'color.cmyk', 'CMYK for print',
          hasCMYK ? 'pass' : (hasRGB ? 'warn' : 'info'),
          hasCMYK
            ? 'CMYK operators detected — suitable for offset / commercial print.'
            : hasRGB
              ? 'Only RGB operators detected. Print workflows typically expect CMYK.'
              : 'No color operators found to evaluate.',
          hasCMYK ? null : (hasRGB ? GUIDES['color.cmyk'] : null));
      }

      add('colors', 'color.transparency', 'Transparency / blending',
        r.stats.transparentPages > 0 ? 'info' : 'pass',
        r.stats.transparentPages > 0
          ? 'Graphics state operators detected on ' + r.stats.transparentPages + ' page' + (r.stats.transparentPages === 1 ? '' : 's') + '. Transparency may be present.'
          : 'No graphics-state operators detected; page content appears flat.',
        r.stats.transparentPages > 0 ? GUIDES['color.transparency'] : null);

      /* STRUCTURE */
      add('structure', 'struct.tagged', 'Tagged PDF (accessibility)',
        r.pdf.tagged ? 'pass' : 'warn',
        r.pdf.tagged
          ? 'Marked-content or structure tree present. Screen readers can traverse the document.'
          : 'No structure tree / MarkInfo detected. Screen readers may read the file as one undifferentiated block.',
        r.pdf.tagged ? null : GUIDES['struct.tagged']);

      add('structure', 'struct.outline', 'Bookmarks / outline',
        r.pdf.hasOutline ? 'pass' : 'info',
        r.pdf.hasOutline ? 'Document outline present.' : 'No document outline. Long documents benefit from bookmarks.',
        null);

      add('structure', 'struct.annots', 'Annotations', 'info',
        r.pdf.hasAnnotations ? 'Annotations present (comments, links, or form fields).' : 'No annotations detected.',
        null);

      add('structure', 'struct.forms', 'Interactive form fields', 'info',
        r.pdf.hasForms ? 'Widget annotations / form fields detected.' : 'No interactive form fields detected.',
        null);

      /* PROFILE-SPECIFIC */
      applyProfileRules(r, add);

      return checks;
    }

    function applyProfileRules(r, add) {
      var p = r.profile;

      if (p === 'print') {
        add('profile', 'profile.print.dpi', 'Print: 300 DPI minimum', 'info',
          'Effective DPI is not yet measured by this version. Confirm images are placed at ≥300 DPI at final size.',
          GUIDES['profile.print.dpi']);

        var allEmbedded = r.fonts.embeddedFontFileCount >= r.fonts.declared.length && r.fonts.declared.length > 0;
        add('profile', 'profile.print.fonts', 'Print: all fonts embedded',
          allEmbedded ? 'pass' : 'warn',
          allEmbedded ? 'Embedded font streams present for all referenced fonts.' : 'Some fonts may not be embedded. Commercial printers require full embedding.',
          allEmbedded ? null : GUIDES['profile.print.fonts']);

        add('profile', 'profile.print.bleed', 'Print: 3 mm bleed',
          r.pdf.boxes.bleed ? 'pass' : 'warn',
          r.pdf.boxes.bleed ? 'BleedBox present.' : 'No BleedBox — commercial print typically requires 3 mm (0.125 in) bleed on all edges.',
          r.pdf.boxes.bleed ? null : GUIDES['profile.print.bleed']);
      }

      if (p === 'kdp') {
        add('profile', 'profile.kdp.size', 'KDP: supported trim size', 'info',
          'Detected page size: ' + r.stats.sizeDistribution.map(function (s) { return s.size; }).join(', ') + ". Compare against Amazon KDP's trim-size list for the current year — page size must match exactly.",
          GUIDES['profile.kdp.size']);

        add('profile', 'profile.kdp.margins', 'KDP: interior margins', 'info',
          "Margins depend on page count and trim size. Verify inside margin meets KDP's current minimum for your page count.",
          GUIDES['profile.kdp.margins']);

        var kdpEmbedded = r.fonts.embeddedFontFileCount >= r.fonts.declared.length && r.fonts.declared.length > 0;
        add('profile', 'profile.kdp.fonts', 'KDP: embedded fonts',
          kdpEmbedded ? 'pass' : 'warn',
          kdpEmbedded ? 'Embedded font streams present.' : 'Fonts may not be fully embedded. KDP rejects PDFs with non-embedded fonts.',
          kdpEmbedded ? null : GUIDES['profile.kdp.fonts']);

        add('profile', 'profile.kdp.pages', 'KDP: minimum page count',
          r.pdf.numPages >= 24 ? 'pass' : 'warn',
          r.pdf.numPages + ' page' + (r.pdf.numPages === 1 ? '' : 's') + '. KDP paperbacks require at least 24 pages.',
          r.pdf.numPages >= 24 ? null : GUIDES['profile.kdp.pages']);
      }

      if (p === 'academic') {
        add('profile', 'profile.academic.size', 'Academic: file size limits',
          r.file.size <= 10 * 1024 * 1024 ? 'pass' : 'warn',
          bytes(r.file.size) + '. Many journals cap submissions at 10 MB.',
          r.file.size > 10 * 1024 * 1024 ? GUIDES['profile.academic.size'] : null);

        var acadEmbedded = r.fonts.embeddedFontFileCount >= r.fonts.declared.length && r.fonts.declared.length > 0;
        add('profile', 'profile.academic.fonts', 'Academic: embedded fonts',
          acadEmbedded ? 'pass' : 'warn',
          acadEmbedded ? 'Fonts are embedded.' : 'Non-embedded fonts are a common cause of rejection in academic submission portals.',
          acadEmbedded ? null : GUIDES['profile.academic.fonts']);

        add('profile', 'profile.academic.tagging', 'Academic: accessibility tagging',
          r.pdf.tagged ? 'pass' : 'info',
          r.pdf.tagged ? 'Document is tagged.' : 'Not tagged. Some institutions require tagged PDFs for accessibility compliance.',
          null);
      }

      if (p === 'digital') {
        add('profile', 'profile.digital.linear', 'Digital: Fast Web View',
          r.pdf.linearized ? 'pass' : 'warn',
          r.pdf.linearized ? 'Linearized — renders before full download.' : 'Not linearized. Not critical for small files, but improves perceived load time.',
          r.pdf.linearized ? null : GUIDES['profile.digital.linear']);

        add('profile', 'profile.digital.size', 'Digital: file size',
          r.file.size <= 5 * 1024 * 1024 ? 'pass' : 'info',
          bytes(r.file.size) + '. Small files load faster in email clients and browsers.', null);
      }

      if (p === 'general' && r.stats.totalChars === 0 && r.stats.totalImages > 0) {
        add('profile', 'profile.general.scanned', 'Scanned / image-only document', 'info',
          'No extractable text found, but images are present. This is likely a scanned PDF.',
          GUIDES['profile.general.scanned']);
      }
    }

    /* =====================================================================
       RENDER
       ===================================================================== */
    function render(r) {
      var checks = buildChecks(r);

      var counts = { pass: 0, warn: 0, fail: 0, info: 0 };
      checks.forEach(function (c) { counts[c.status]++; });

      var scored = counts.pass + counts.warn + counts.fail;
      var score = scored ? Math.round((counts.pass / scored) * 100) : 0;

      var verdict = counts.fail > 0 ? 'not-ready'
                  : counts.warn > 2 ? 'review'
                  : 'ready';

      var verdictLabels = {
        'ready': 'READY TO UPLOAD',
        'review': 'REVIEW RECOMMENDED',
        'not-ready': 'NOT READY'
      };

      titleEl.textContent = verdictLabels[verdict];
      titleEl.className = 'apf-verdict ' + verdict;
      subEl.textContent = r.file.name + ' · ' + r.profile + ' profile · ' + r.pdf.numPages + ' page' + (r.pdf.numPages === 1 ? '' : 's');

      scoreEl.className = 'apf-score-ring ' + (verdict === 'ready' ? 'good' : verdict === 'review' ? 'warn' : 'bad');
      scoreEl.textContent = scored ? score + '%' : '—';

      statsEl.innerHTML = [
        ['pass', counts.pass, 'PASS'],
        ['warn', counts.warn, 'WARN'],
        ['fail', counts.fail, 'FAIL'],
        ['info', counts.info, 'INFO']
      ].map(function (row) {
        return '<div class="apf-stat ' + row[0] + '"><b>' + row[1] + '</b><span>' + row[2] + '</span></div>';
      }).join('');

      var grouped = {};
      checks.forEach(function (c) {
        grouped[c.cat] = grouped[c.cat] || [];
        grouped[c.cat].push(c);
      });

      var html = CATEGORIES.map(function (cat) {
        var key = cat[0], label = cat[1];
        var list = grouped[key] || [];
        if (!list.length) return '';
        return '<div class="apf-cat">' +
          '<div class="apf-cat-head">' + esc(label.toUpperCase()) + '</div>' +
          list.map(renderCheck).join('') +
          '</div>';
      }).join('');

      checksEl.innerHTML = html;
      techEl.textContent = JSON.stringify(buildTechnical(r, checks), null, 2);

      resultsSec.classList.remove('apf-hidden');
      resultsSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderCheck(c) {
      var fixText = GUIDES[c.id] || c.fix;
      var fix = fixText ? '<div class="apf-fix"><b>💡 How to fix this</b>' + esc(fixText) + '</div>' : '';
      return '<div class="apf-check">' +
        '<div class="apf-check-body">' +
          '<div class="apf-name">' + esc(c.name) + '</div>' +
          '<div class="apf-detail">' + esc(c.detail) + '</div>' +
          fix +
        '</div>' +
        '<span class="apf-badge ' + c.status + '">' + c.status + '</span>' +
        '</div>';
    }

    function renderError(e) {
      resultsSec.classList.remove('apf-hidden');
      titleEl.textContent = 'COULD NOT CHECK';
      titleEl.className = 'apf-verdict not-ready';
      subEl.textContent = e.message || String(e);
      scoreEl.textContent = '!';
      scoreEl.className = 'apf-score-ring bad';
      statsEl.innerHTML = '';
      checksEl.innerHTML =
        '<div class="apf-check">' +
          '<div class="apf-check-body">' +
            '<div class="apf-name">PDF parsing failed</div>' +
            '<div class="apf-detail">Make sure this is a readable PDF. Password-protected or malformed files are not supported by this version.</div>' +
          '</div>' +
          '<span class="apf-badge fail">fail</span>' +
        '</div>';
      techEl.textContent = e.stack || String(e);
      resultsSec.scrollIntoView({ behavior: 'smooth' });
    }

    /* =====================================================================
       REPORT EXPORT
       ===================================================================== */
    function buildTechnical(r, checks) {
      return {
        tool: r.tool, generatedAt: r.generatedAt, file: r.file, profile: r.profile,
        pdf: r.pdf, meta: r.meta, fonts: r.fonts, colors: r.colors,
        stats: {
          totalChars: r.stats.totalChars, totalImages: r.stats.totalImages,
          totalOps: r.stats.totalOps, sizeDistribution: r.stats.sizeDistribution,
          orientations: r.stats.orientations, rotations: r.stats.rotations,
          blankPages: r.stats.blankPages, transparentPages: r.stats.transparentPages,
          sampled: r.stats.sampled
        },
        checks: checks.map(function (c) {
          return { id: c.id, category: c.cat, name: c.name, status: c.status, detail: c.detail, fix: c.fix };
        })
      };
    }

    function downloadReport(kind) {
      if (!state.report) return;
      var r = state.report;
      var checks = buildChecks(r);
      var tech = buildTechnical(r, checks);
      var base = r.file.name.replace(/\.pdf$/i, '');

      if (kind === 'json') {
        downloadBlob(JSON.stringify(tech, null, 2), base + '-preflight.json', 'application/json');
        return;
      }

      var counts = { pass: 0, warn: 0, fail: 0, info: 0 };
      checks.forEach(function (c) { counts[c.status]++; });

      var lines = [];
      lines.push('Autonom PDF Ready — Report');
      lines.push('Generated: ' + new Date(r.generatedAt).toLocaleString());
      lines.push('File: ' + r.file.name + ' (' + bytes(r.file.size) + ')');
      lines.push('Profile: ' + r.profile);
      lines.push('Pages: ' + r.pdf.numPages);
      lines.push('');
      lines.push('Summary: ' + counts.pass + ' pass · ' + counts.warn + ' warn · ' + counts.fail + ' fail · ' + counts.info + ' info');
      lines.push('');
      lines.push('--- Document & Metadata ---');
      lines.push('  Title:      ' + (r.meta.title || '—'));
      lines.push('  Author:     ' + (r.meta.author || '—'));
      lines.push('  Producer:   ' + (r.meta.producer || '—'));
      lines.push('  Version:    ' + (r.pdf.version || '—'));
      lines.push('  Lang:       ' + (r.meta.lang || '—'));
      lines.push('  Tagged:     ' + (r.pdf.tagged ? 'yes' : 'no'));
      lines.push('  Encrypted:  ' + (r.pdf.encrypted ? 'yes' : 'no'));
      lines.push('  Linearized: ' + (r.pdf.linearized ? 'yes' : 'no'));
      lines.push('');

      var currentCat = '';
      checks.forEach(function (c) {
        if (c.cat !== currentCat) {
          currentCat = c.cat;
          var catLabel = 'Other';
          for (var i = 0; i < CATEGORIES.length; i++) {
            if (CATEGORIES[i][0] === currentCat) { catLabel = CATEGORIES[i][1]; break; }
          }
          lines.push('');
          lines.push('--- ' + catLabel + ' ---');
        }
        var tag = c.status.toUpperCase();
        while (tag.length < 5) tag += ' ';
        lines.push('  [' + tag + '] ' + c.name);
        lines.push('         ' + c.detail);
        var fixText = GUIDES[c.id] || c.fix;
        if (fixText) lines.push('         Fix: ' + fixText);
      });

      lines.push('');
      lines.push('---');
      lines.push('Generated locally in your browser. No file content was uploaded.');

      downloadBlob(lines.join('\n'), base + '-readiness.txt', 'text/plain');
    }

    function copySummary() {
      if (!state.report) return;
      var r = state.report;
      var checks = buildChecks(r);
      var counts = { pass: 0, warn: 0, fail: 0, info: 0 };
      checks.forEach(function (c) { counts[c.status]++; });

      var summary = [
        'Autonom PDF Ready — ' + r.file.name,
        'Profile: ' + r.profile + ' · ' + r.pdf.numPages + ' pages',
        'Result: ' + counts.pass + ' pass · ' + counts.warn + ' warn · ' + counts.fail + ' fail · ' + counts.info + ' info',
        ''
      ].concat(
        checks.filter(function (c) { return c.status === 'fail' || c.status === 'warn'; })
              .map(function (c) { return '[' + c.status.toUpperCase() + '] ' + c.name + ' — ' + c.detail; })
      ).join('\n');

      var btn = copySummaryBtn;
      var original = btn.textContent;

      var done = function () { btn.textContent = 'Copied!'; setTimeout(function () { btn.textContent = original; }, 1800); };
      var fail = function () { btn.textContent = 'Press Ctrl+C'; setTimeout(function () { btn.textContent = original; }, 2200); };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(summary).then(done).catch(fallback);
      } else {
        fallback();
      }

      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = summary;
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); }
        catch (_) { fail(); }
        finally { document.body.removeChild(ta); }
      }
    }
  }

  function bytes(n) {
    var u = ['B', 'KB', 'MB', 'GB'], i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(i ? 1 : 0) + ' ' + u[i];
  }

  function fmtSize(key) {
    var parts = key.split('x');
    var w = Number(parts[0]), h = Number(parts[1]);
    var wIn = (w / 72).toFixed(2), hIn = (h / 72).toFixed(2);
    var wMm = Math.round(w / 72 * 25.4), hMm = Math.round(h / 72 * 25.4);
    return wIn + ' × ' + hIn + ' in (' + wMm + ' × ' + hMm + ' mm)';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function downloadBlob(content, filename, mime) {
    var blob = new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function boot() {
    loadPdfJs(function (err) {
      if (err) console.warn('[Autonom PDF Ready]', err.message);
      init();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
