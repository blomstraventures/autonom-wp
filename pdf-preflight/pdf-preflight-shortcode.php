/**
 * Autonom PDF Ready — Shortcode [autonom_pdf_ready]
 * Renders the tool. Use once per page.
 */
add_shortcode( 'autonom_pdf_ready', function () {
	if ( is_admin() || is_feed() ) {
		return '';
	}
	ob_start();
	?>
	<main id="autonom-pdf-ready">
		<div class="apf-shell">

			<!-- 1. DROP ZONE -->
			<section class="apf-card apf-drop" id="apf-drop">
				<input id="apf-file" type="file" accept=".pdf,application/pdf" hidden>
				<div class="apf-drop-icon">PDF</div>
				<h3>Drop your PDF here</h3>
				<p>or choose a file from your device</p>
				<button id="apf-choose" class="apf-primary" type="button">Choose PDF</button>
				<div class="apf-trust-badge">🔒 100% Local Processing · Your file never leaves your browser</div>
			</section>

			<!-- 2. FILE CARD -->
			<section class="apf-card apf-hidden" id="apf-filecard">
				<div class="apf-file-row">
					<div class="apf-file-icon">PDF</div>
					<div class="apf-file-meta">
						<div class="apf-file-name" id="apf-fname">—</div>
						<div class="apf-file-sub" id="apf-fsub">—</div>
					</div>
					<button id="apf-reset" class="apf-ghost" type="button">Change file</button>
				</div>
			</section>

			<!-- 3. PROFILE -->
			<section class="apf-card apf-hidden" id="apf-profiles">
				<span class="apf-eyebrow">CHECK PROFILE</span>
				<h3>What are you preparing this for?</h3>
				<p class="apf-muted">Each profile applies a different rule set. Unsupported checks are reported as INFO, not passed.</p>
				<div class="apf-profile-grid" id="apf-profile-grid">
					<button type="button" class="apf-profile active" data-p="general">
						<b>General Upload</b><span>Basic PDF health &amp; metadata</span>
					</button>
					<button type="button" class="apf-profile" data-p="print">
						<b>Commercial Print</b><span>Bleed, margins, CMYK, 300 DPI</span>
					</button>
					<button type="button" class="apf-profile" data-p="kdp">
						<b>Amazon KDP</b><span>Paperback / hardcover submission rules</span>
					</button>
					<button type="button" class="apf-profile" data-p="academic">
						<b>University / Journal</b><span>Thesis &amp; academic submission checks</span>
					</button>
					<button type="button" class="apf-profile" data-p="digital">
						<b>Digital / Web</b><span>Email, browser, and online delivery</span>
					</button>
				</div>
				<button id="apf-run" class="apf-primary apf-wide" type="button">Run Readiness Check</button>
			</section>

			<!-- 4. PROGRESS -->
			<section class="apf-card apf-hidden" id="apf-progress">
				<span class="apf-eyebrow">RUNNING LOCAL CHECKS</span>
				<h3 id="apf-prog-title">Opening PDF…</h3>
				<div class="apf-bar"><div class="apf-bar-fill" id="apf-bar-fill"></div></div>
				<p class="apf-muted" id="apf-prog-detail">Local processing only. No data is uploaded.</p>
			</section>

			<!-- 5. RESULTS -->
			<section class="apf-card apf-hidden" id="apf-results">
				<div class="apf-head">
					<div>
						<span class="apf-eyebrow">READINESS RESULT</span>
						<h2 id="apf-title" class="apf-verdict">—</h2>
						<p id="apf-sub" class="apf-muted"></p>
					</div>
					<div class="apf-score-ring" id="apf-score">—</div>
				</div>

				<div class="apf-stats" id="apf-stats"></div>

				<div class="apf-actions">
					<button id="apf-export-json" class="apf-ghost" type="button">Download JSON report</button>
					<button id="apf-export-text" class="apf-ghost" type="button">Download text report</button>
					<button id="apf-copy-summary" class="apf-ghost" type="button">Copy summary</button>
				</div>

				<div id="apf-checks"></div>

				<!-- PRO UPSELL -->
				<div class="apf-pro-upsell">
					<div>
						<h4>🚀 Need to check multiple files or get a readiness certificate?</h4>
						<p>Autonom Pro adds batch checking, software-specific fix guides, and a downloadable certificate you can attach to submissions.</p>
					</div>
					<button class="apf-pro-btn" type="button" onclick="alert('Connect this to your checkout URL.')">Get Pro Access</button>
				</div>

				<details>
					<summary>Technical details</summary>
					<pre id="apf-technical"></pre>
				</details>

				<footer class="apf-footer">
					<span>Autonom PDF Ready · v4.0</span>
					<span>Local-first processing · Zero telemetry</span>
				</footer>
			</section>

		</div>
	</main>
	<?php
	return ob_get_clean();
} );
