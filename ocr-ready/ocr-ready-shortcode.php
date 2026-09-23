/**
 * Autonom OCR Ready — Shortcode [autonom_ocr_ready]
 */
add_shortcode( 'autonom_ocr_ready', function () {
	if ( is_admin() || is_feed() ) {
		return '';
	}
	ob_start();
	?>
	<section id="autonom-ocr-ready">

		<!-- STEP 1 · SOURCE -->
		<div class="or-card">
			<div class="or-label"><span class="num">01</span><span>Source PDF</span></div>
			<h2>Drop the scanned or OCR PDF</h2>
			<p class="or-hint">Court filings, contracts, signed documents. Autonom reads the layout, tables, and text in your browser and produces an editable Word document.</p>

			<div class="or-drop" role="button" tabindex="0" aria-label="Drop a PDF here, or click to browse">
				<input type="file" class="or-file" accept="application/pdf,.pdf" aria-hidden="true">
				<span class="or-drop-icon" aria-hidden="true">📄</span>
				<strong>Drop a PDF here</strong>
				<small>or click to browse · scanned PDFs welcome</small>
			</div>

			<div class="or-source" hidden>
				<div class="or-source-icon">📄</div>
				<div class="or-source-meta">
					<b class="or-source-name">—</b>
					<span class="or-source-size">—</span>
				</div>
				<button type="button" class="or-source-change">Change</button>
			</div>
		</div>

		<!-- STEP 2 · SETTINGS -->
		<div class="or-card">
			<div class="or-label"><span class="num">02</span><span>Settings</span></div>
			<h2>Document title and conversion</h2>
			<p class="or-hint">The engine detects language automatically. No configuration needed.</p>

			<div class="or-field">
				<label for="or-title">Document title (optional)</label>
				<input type="text" class="or-text or-title" id="or-title" placeholder="e.g. Statement of Claim">
			</div>

			<div class="or-notice" style="margin-top:16px;margin-bottom:0;">
				<span>⚠️</span>
				<div>
					<strong>What this tool does — and what it does not.</strong>
					It produces an editable DOCX with real Word headings and real Word tables, matching the structure of the original. It does <em>not</em> reproduce the original fonts or exact visual layout. Always proof-read against the source before submitting anywhere official.
				</div>
			</div>

			<button type="button" class="or-run" disabled>Convert to structured DOCX</button>

			<div class="or-progress" hidden>
				<div class="or-progress-bar"><div class="or-progress-fill"></div></div>
				<div class="or-progress-text">
					<span class="left">Preparing…</span>
					<span class="pct">0%</span>
				</div>
			</div>
		</div>

		<!-- STEP 3 · RESULT -->
		<div class="or-card">
			<div class="or-label"><span class="num">03</span><span>Result</span></div>

			<div class="or-result">
				<div class="or-stats">
					<div class="or-stat">
						<div class="or-stat-label">Pages</div>
						<div class="or-stat-value" data-stat="pages">—</div>
					</div>
					<div class="or-stat">
						<div class="or-stat-label">Words</div>
						<div class="or-stat-value" data-stat="words">—</div>
					</div>
					<div class="or-stat">
						<div class="or-stat-label">Tables found</div>
						<div class="or-stat-value" data-stat="tables">—</div>
					</div>
					<div class="or-stat">
						<div class="or-stat-label">Time</div>
						<div class="or-stat-value" data-stat="time">—</div>
					</div>
				</div>

				<div class="or-actions">
					<button type="button" class="or-dl primary or-dl-docx" disabled>
						<b>Download structured DOCX</b>
						<small>Real Word tables · heading styles · ready for Google Translate</small>
					</button>
					<button type="button" class="or-dl secondary or-dl-pdf" disabled>
						<b>Download searchable PDF</b>
						<small>Looks identical · text is selectable and searchable</small>
					</button>
				</div>

				<div class="or-preview" aria-label="Preview of detected structure"></div>
			</div>
		</div>

	</section>
	<?php
	return ob_get_clean();
} );
