/**
 * Autonom PDF Private — Shortcode [autonom_pdf_private]
 * v3.0 — includes Signature operation
 */
add_shortcode( 'autonom_pdf_private', function () {
	if ( is_admin() || is_feed() ) {
		return '';
	}
	ob_start();
	?>
	<section id="autonom-pdf-private">

		<div class="pp-card">
			<div class="pp-label"><span class="num">01</span><span>Source PDF</span></div>
			<h2>Drop your PDF file(s)</h2>
			<p class="pp-hint">Everything runs in your browser. Your file is never sent to a server.</p>

			<div class="pp-drop" role="button" tabindex="0" aria-label="Drop PDF files or click to browse">
				<input type="file" class="pp-file" accept="application/pdf,.pdf" multiple aria-hidden="true">
				<span class="pp-drop-icon" aria-hidden="true">📄</span>
				<strong>Drop PDF file(s) here</strong>
				<small>or click to browse · multiple files supported for merge</small>
			</div>

			<div class="pp-filelist" hidden>
				<div class="pp-filelist-head">
					<span><span class="count">0 files</span></span>
					<button type="button" class="clear-all">Clear all</button>
				</div>
				<div class="pp-filelist-body"></div>
			</div>
			<div class="pp-file-note"></div>
		</div>

		<div class="pp-card pp-pages-card" hidden>
			<div class="pp-pages-head">
				<div class="pp-pages-head-left">
					<div class="pp-label"><span class="num">02</span><span>Preview &amp; select pages</span></div>
					<h2>Click pages to select them</h2>
					<div class="pp-pages-file">Showing: <b>—</b></div>
				</div>
			</div>
			<p class="pp-hint">
				Click a page to select. Click it again to deselect. Shift-click extends a range. Ctrl/Cmd-click toggles a single page.
				In <strong>Split document</strong> mode, clicking a page opens the cut-line editor.
			</p>

			<div class="pp-pages-bar">
				<div class="pp-pages-count">0 of 0 pages selected</div>
				<div class="pp-pages-range">
					<input type="text" placeholder="e.g. 1-5,8,10-12" aria-label="Add range">
					<button type="button" class="pp-mini-btn pp-range-add">Add</button>
				</div>
			</div>

			<div class="pp-pages-actions" style="margin-bottom:12px;">
				<button type="button" class="pp-mini-btn pp-pages-select-all">Select all</button>
				<button type="button" class="pp-mini-btn pp-pages-deselect-all">Deselect all</button>
				<button type="button" class="pp-mini-btn pp-pages-invert">Invert</button>
			</div>

			<div class="pp-pages">
				<div class="pp-pages-empty">Load a PDF to see its pages here.</div>
			</div>
		</div>

		<div class="pp-card">
			<div class="pp-label"><span class="num">03</span><span>Choose an operation</span></div>
			<h2>What do you want to do?</h2>
			<p class="pp-hint">Operations stack. Run one, then another. Your working document accumulates the changes until you download.</p>

			<div class="pp-modes">
				<button type="button" class="pp-mode is-active" data-mode="merge">
					<b>Merge files</b>
					<small>Combine multiple PDFs</small>
				</button>
				<button type="button" class="pp-mode" data-mode="keep">
					<b>Keep selected</b>
					<small>New PDF with only selected pages</small>
				</button>
				<button type="button" class="pp-mode" data-mode="delete">
					<b>Delete selected</b>
					<small>Remove selected pages</small>
				</button>
				<button type="button" class="pp-mode is-new" data-mode="split">
					<b>Split document</b>
					<small>Cut inside a page — get two PDFs</small>
				</button>
				<button type="button" class="pp-mode" data-mode="rotate">
					<b>Rotate</b>
					<small>Rotate all or selected pages</small>
				</button>
				<button type="button" class="pp-mode" data-mode="watermark">
					<b>Watermark</b>
					<small>Add text to pages</small>
				</button>
				<button type="button" class="pp-mode" data-mode="numbers">
					<b>Page numbers</b>
					<small>Number the pages</small>
				</button>
				<button type="button" class="pp-mode is-new" data-mode="signature">
					<b>Signature</b>
					<small>Place a signature image on pages</small>
				</button>
			</div>

			<div class="pp-settings is-active" data-mode="merge">
				<div class="pp-notice is-info">
					<span>ℹ️</span>
					<div>Files are merged in the order shown above. Use the ▲ ▼ buttons to reorder.</div>
				</div>
			</div>

			<div class="pp-settings" data-mode="keep">
				<div class="pp-notice is-info">
					<span>ℹ️</span>
					<div>Only the selected pages will remain in the working document, in their original order.</div>
				</div>
			</div>

			<div class="pp-settings" data-mode="delete">
				<div class="pp-notice is-info">
					<span>ℹ️</span>
					<div>The selected pages will be removed from the working document.</div>
				</div>
			</div>

			<div class="pp-settings" data-mode="split">
				<div class="pp-notice">
					<span>✂️</span>
					<div>
						<strong>Cut inside a page, not just between pages.</strong> Click a page above to open the cut-line editor.
						Place one cut to split into two parts. Add a second cut to extract a <strong>middle section</strong> as its own PDF.
						All parts are full-size pages — sliced content is aligned at the top with whitespace below.
					</div>
				</div>

				<div class="pp-field">
					<div class="pp-split-status" style="font-size:13px;color:var(--pp-muted);line-height:1.55;">
						No cut line set yet. Click a page above to place one.
					</div>
				</div>

				<div class="pp-field">
					<label>Output format</label>
					<div class="pp-seg pp-seg-output" data-value="zip">
						<button type="button" data-value="zip" class="is-active">ZIP with all parts</button>
						<button type="button" data-value="single">First part only</button>
					</div>
					<span class="pp-sub">ZIP produces all parts at once. "First part only" gives you just the top portion.</span>
				</div>
			</div>

			<div class="pp-settings" data-mode="rotate">
				<div class="pp-field">
					<label>Rotation angle</label>
					<div class="pp-seg pp-seg-angle" data-value="90">
						<button type="button" data-value="90" class="is-active">90° clockwise</button>
						<button type="button" data-value="180">180°</button>
						<button type="button" data-value="270">270° (90° counter)</button>
					</div>
				</div>
				<div class="pp-field">
					<label>Which pages?</label>
					<div class="pp-seg pp-seg-scope" data-value="all">
						<button type="button" data-value="all" class="is-active">All pages</button>
						<button type="button" data-value="selected">Selected pages only</button>
					</div>
				</div>
			</div>

			<div class="pp-settings" data-mode="watermark">
				<div class="pp-field">
					<label for="pp-wm-text">Watermark text</label>
					<input type="text" class="pp-input pp-wm-text" id="pp-wm-text" value="CONFIDENTIAL">
				</div>
				<div class="pp-field">
					<label>Which pages?</label>
					<div class="pp-seg pp-seg-scope" data-value="all">
						<button type="button" data-value="all" class="is-active">All pages</button>
						<button type="button" data-value="selected">Selected pages only</button>
					</div>
				</div>
				<div class="pp-field">
					<label>Position</label>
					<div class="pp-seg pp-seg-pos" data-value="diagonal">
						<button type="button" data-value="diagonal" class="is-active">Diagonal</button>
						<button type="button" data-value="center">Center</button>
						<button type="button" data-value="top">Top</button>
						<button type="button" data-value="bottom">Bottom</button>
					</div>
				</div>
				<div class="pp-row">
					<div class="pp-field">
						<label for="pp-wm-size">Font size</label>
						<input type="text" class="pp-input pp-wm-size" id="pp-wm-size" value="60">
					</div>
					<div class="pp-field">
						<label for="pp-wm-color">Color</label>
						<input type="color" class="pp-color pp-wm-color" id="pp-wm-color" value="#9c2525">
					</div>
				</div>
				<div class="pp-field">
					<label for="pp-wm-opacity">Opacity</label>
					<input type="range" class="pp-range pp-wm-opacity" id="pp-wm-opacity" min="0.05" max="0.5" step="0.01" value="0.15">
				</div>
				<div class="pp-field">
					<label class="pp-checkbox">
						<input type="checkbox" class="pp-wm-skip">
						<span>Skip the first page</span>
					</label>
				</div>
			</div>

			<div class="pp-settings" data-mode="numbers">
				<div class="pp-field">
					<label>Which pages?</label>
					<div class="pp-seg pp-seg-scope" data-value="all">
						<button type="button" data-value="all" class="is-active">All pages</button>
						<button type="button" data-value="selected">Selected pages only</button>
					</div>
				</div>
				<div class="pp-field">
					<label>Format</label>
					<div class="pp-seg pp-seg-format" data-value="simple">
						<button type="button" data-value="simple" class="is-active">1</button>
						<button type="button" data-value="of">1 / N</button>
						<button type="button" data-value="page">Page 1</button>
						<button type="button" data-value="pageOf">Page 1 of N</button>
					</div>
				</div>
				<div class="pp-field">
					<label>Position</label>
					<div class="pp-seg pp-seg-numpos" data-value="bottom-center">
						<button type="button" data-value="bottom-center" class="is-active">Bottom center</button>
						<button type="button" data-value="bottom-right">Bottom right</button>
						<button type="button" data-value="bottom-left">Bottom left</button>
						<button type="button" data-value="top-center">Top center</button>
						<button type="button" data-value="top-right">Top right</button>
					</div>
				</div>
				<div class="pp-row">
					<div class="pp-field">
						<label for="pp-num-start">Start number</label>
						<input type="text" class="pp-input pp-num-start" id="pp-num-start" value="1">
					</div>
					<div class="pp-field">
						<label for="pp-num-size">Font size</label>
						<input type="text" class="pp-input pp-num-size" id="pp-num-size" value="11">
					</div>
				</div>
				<div class="pp-field">
					<label for="pp-num-color">Color</label>
					<input type="color" class="pp-color pp-num-color" id="pp-num-color" value="#0d1220">
				</div>
				<div class="pp-field">
					<label class="pp-checkbox">
						<input type="checkbox" class="pp-num-skip">
						<span>Skip the first page</span>
					</label>
				</div>
			</div>

			<div class="pp-settings" data-mode="signature">
				<div class="pp-notice">
					<span>✍️</span>
					<div>
						<strong>Place a signature image on the PDF.</strong> Upload a transparent PNG (best) or JPG.
						The signature is drawn as an image layer on top of the pages — the original content is untouched.
					</div>
				</div>

				<div class="pp-field">
					<label>Signature image</label>
					<label class="pp-sig-file-wrap">
						<input type="file" class="pp-sig-file" accept="image/png,image/jpeg">
						<span>Click to choose a PNG or JPG · transparent PNG recommended</span>
					</label>
					<div class="pp-sig-preview" hidden>
						<img class="pp-sig-preview-img" alt="Signature preview">
						<button type="button" class="pp-sig-clear">Remove</button>
					</div>
				</div>

				<div class="pp-field">
					<label>Position</label>
					<div class="pp-seg pp-seg-sig-pos" data-value="bottom-right">
						<button type="button" data-value="bottom-left">Bottom left</button>
						<button type="button" data-value="bottom-center">Bottom center</button>
						<button type="button" data-value="bottom-right" class="is-active">Bottom right</button>
						<button type="button" data-value="top-right">Top right</button>
					</div>
				</div>

				<div class="pp-row">
					<div class="pp-field">
						<label for="pp-sig-width">Width (in points)</label>
						<input type="text" class="pp-input pp-sig-width" id="pp-sig-width" value="120">
						<span class="pp-sub">72 points = 1 inch. 120 pt ≈ 4.2 cm.</span>
					</div>
					<div class="pp-field">
						<label for="pp-sig-opacity">Opacity</label>
						<input type="range" class="pp-range pp-sig-opacity" id="pp-sig-opacity" min="0.2" max="1" step="0.05" value="1">
					</div>
				</div>

				<div class="pp-field">
					<label>Which pages?</label>
					<div class="pp-seg pp-seg-sig-scope" data-value="last">
						<button type="button" data-value="last" class="is-active">Last page only</button>
						<button type="button" data-value="all">Every page</button>
						<button type="button" data-value="selected">Selected pages only</button>
					</div>
				</div>
			</div>

			<button type="button" class="pp-run" disabled>Apply operation</button>

			<div class="pp-progress" hidden>
				<div class="pp-spinner"></div>
				<div class="pp-progress-text">Preparing…</div>
			</div>
		</div>

		<div class="pp-card pp-work-card" hidden>
			<div class="pp-label"><span class="num">04</span><span>Working document</span></div>
			<h2 id="pp-work-name" class="pp-work-name">document.pdf</h2>
			<p class="pp-hint">
				This is your current document. Every operation you apply is added to it. When you are done, download it once.
			</p>

			<div class="pp-history"></div>

			<div class="pp-stats">
				<div class="pp-stat">
					<div class="pp-stat-label">Pages</div>
					<div class="pp-stat-value" id="pp-work-pages">—</div>
				</div>
				<div class="pp-stat">
					<div class="pp-stat-label">Size</div>
					<div class="pp-stat-value" id="pp-work-size">—</div>
				</div>
				<div class="pp-stat">
					<div class="pp-stat-label">Operations applied</div>
					<div class="pp-stat-value pp-work-count" id="pp-work-count">0</div>
				</div>
			</div>

			<div class="pp-work-actions">
				<button type="button" class="pp-download">Download final PDF</button>
				<button type="button" class="pp-reset" disabled>Reset to original</button>
			</div>

			<div class="pp-work-note"></div>
		</div>

	</section>
	<?php
	return ob_get_clean();
} );
