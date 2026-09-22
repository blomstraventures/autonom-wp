/**
 * Autonom Shopify Ready — Shortcode [autonom_shopify_ready]
 */
add_shortcode( 'autonom_shopify_ready', function () {
	if ( is_admin() || is_feed() ) {
		return '';
	}
	ob_start();
	?>
	<main id="autonom-shopify-ready">
		<div class="asr-shell">

			<!-- 1. DROP ZONE -->
			<section class="asr-card asr-drop" id="asr-drop">
				<input id="asr-file" type="file" accept=".csv,text/csv" hidden>
				<div class="asr-drop-icon">CSV</div>
				<h3>Drop your Shopify import CSV here</h3>
				<p>or click to choose a file from your device</p>
				<button id="asr-choose" class="asr-primary" type="button">Choose CSV File</button>
				<div class="asr-trust-badge">🔒 100% Local Processing · Your customer data never leaves your browser</div>
			</section>

			<!-- 2. FILE CARD -->
			<section class="asr-card asr-hidden" id="asr-filecard">
				<div class="asr-file-row">
					<div class="asr-file-icon">CSV</div>
					<div class="asr-file-meta">
						<div class="asr-file-name" id="asr-fname">—</div>
						<div class="asr-file-sub" id="asr-fsub">—</div>
					</div>
					<button id="asr-reset" class="asr-ghost" type="button">Change file</button>
				</div>
				<button id="asr-scan" class="asr-primary asr-wide" style="margin-top:20px" type="button" disabled>Scan for Shopify Errors</button>
			</section>

			<!-- 3. PROGRESS -->
			<section class="asr-card asr-hidden" id="asr-progress" style="text-align:center;padding:48px 32px">
				<span class="asr-eyebrow">ANALYZING DATA</span>
				<h3 style="margin:12px 0 8px;font-size:1.25rem;font-weight:700">Checking Shopify schema rules…</h3>
				<div class="asr-bar"><div class="asr-bar-fill"></div></div>
				<p class="asr-sub">Local processing only. No data is uploaded.</p>
			</section>

			<!-- 4. RESULTS -->
			<section class="asr-card asr-hidden" id="asr-results">
				<div class="asr-head">
					<div>
						<span class="asr-eyebrow">IMPORT READINESS</span>
						<h2 id="asr-title" class="asr-verdict">—</h2>
						<p id="asr-sub" class="asr-sub"></p>
					</div>
					<div class="asr-score-ring" id="asr-score">—</div>
				</div>

				<div class="asr-stats" id="asr-stats"></div>

				<div id="asr-issues-list"></div>

				<div class="asr-preview asr-hidden" id="asr-preview">
					<div class="asr-preview-head">Before / After preview</div>
					<div class="asr-preview-scroll">
						<table>
							<thead id="asr-preview-thead"></thead>
							<tbody id="asr-preview-tbody"></tbody>
						</table>
					</div>
					<div class="asr-preview-note" id="asr-preview-note"></div>
				</div>

				<div class="asr-checklist" id="asr-checklist"></div>

				<div style="margin-top:24px;display:flex;gap:12px;flex-wrap:wrap">
					<button id="asr-download" class="asr-primary asr-hidden" type="button">⬇ Download Shopify-Ready CSV</button>
					<button onclick="document.getElementById('asr-reset').click()" class="asr-ghost" type="button">Check another file</button>
				</div>

				<div class="asr-pro-upsell">
					<div>
						<h4>🚀 Managing a large catalog or multiple suppliers?</h4>
						<p>Autonom Pro adds batch processing, supplier column mapping, and a CSV history log so you can track what changed between imports.</p>
					</div>
					<button class="asr-pro-btn" type="button" onclick="alert('Connect this button to your checkout.')">Get Pro Access</button>
				</div>

				<footer class="asr-footer">
					<span>Autonom Shopify Ready · v1.0</span>
					<span>Local-first processing · Zero telemetry</span>
				</footer>
			</section>

		</div>
	</main>
	<?php
	return ob_get_clean();
} );
