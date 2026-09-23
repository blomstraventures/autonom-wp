/**
 * Autonom PII & Secret Sanitizer — Shortcode [autonom_pii_tool]
 * Single-pane input (paste OR drag-drop upload). Use once per page.
 */
add_shortcode( 'autonom_pii_tool', function () {
	if ( is_admin() || is_feed() ) {
		return '';
	}
	ob_start();
	?>
	<main id="autonom-pii-app">

		<div class="apii-toggles-card">
			<span class="apii-toggles-title">Active Sanitization Rulesets</span>
			<div class="apii-toggles-grid">
				<label class="apii-toggle"><input type="checkbox" id="apii-toggle-keys" checked> API Keys &amp; Secrets</label>
				<label class="apii-toggle"><input type="checkbox" id="apii-toggle-db" checked> DB Strings &amp; Webhooks</label>
				<label class="apii-toggle"><input type="checkbox" id="apii-toggle-emails" checked> Emails &amp; Auth</label>
				<label class="apii-toggle"><input type="checkbox" id="apii-toggle-financial" checked> Credit Cards</label>
				<label class="apii-toggle"><input type="checkbox" id="apii-toggle-ssn" checked> SSN / National IDs</label>
				<label class="apii-toggle"><input type="checkbox" id="apii-toggle-ips" checked> IP Addresses &amp; Phones</label>
				<label class="apii-toggle"><input type="checkbox" id="apii-toggle-urls" checked> URL Auth Parameters</label>
			</div>
			<div class="apii-custom-field">
				<label for="apii-custom-terms">Custom Proprietary Terms (Comma Separated)</label>
				<input type="text" id="apii-custom-terms" placeholder="e.g. AcmeCorp, secret-db.internal, ProjectTitan, John Doe">
			</div>
		</div>

		<div class="apii-grid">

			<!-- INPUT CARD (drop target) -->
			<div class="apii-card apii-input-card" id="apii-input-card">
				<div class="apii-card-header">
					<label for="apii-input">Raw Text / Log / Prompt Input</label>
					<div class="apii-btn-group">
						<button type="button" id="apii-clear-btn" class="apii-btn-text">Clear</button>
						<button type="button" id="apii-upload-btn" class="apii-btn-secondary">📁 Upload File</button>
					</div>
				</div>
				<p class="apii-hint">
					Paste up to ~50,000 lines. For larger logs, click <strong>Upload File</strong> or drag the file onto this panel.
				</p>

				<div class="apii-file-banner" id="apii-file-banner" style="display:none;">
					<span class="apii-file-banner-icon">📎</span>
					<div class="apii-file-meta">
						<span class="apii-file-name" id="apii-file-name">filename.log</span>
						<span class="apii-file-info" id="apii-file-info"></span>
					</div>
					<button type="button" id="apii-file-remove" class="apii-btn-text">✕ Remove</button>
				</div>

				<input type="file" id="apii-file-input" accept=".txt,.log,.json,.csv,.env,.yml,.yaml,.xml" hidden>
				<textarea id="apii-input" placeholder="Paste un-sanitized code, terminal output, server logs, or API responses here..."></textarea>

				<div class="apii-drop-overlay" aria-hidden="true">
					<span class="apii-drop-overlay-icon">☁️</span>
					<span>Drop log file to sanitize</span>
				</div>
			</div>

			<!-- OUTPUT CARD -->
			<div class="apii-card">
				<div class="apii-card-header">
					<label for="apii-output">Sanitized Ready-To-Prompt Output</label>
					<div class="apii-btn-group">
						<button type="button" id="apii-copy-btn" class="apii-btn-primary"><span id="apii-copy-text">Copy Clean Text</span></button>
						<button type="button" id="apii-download-btn" class="apii-btn-secondary">Download .txt</button>
					</div>
				</div>
				<p class="apii-hint">
					Full sanitized output is preserved for downloads — the panel above shows a preview for very large files.
				</p>
				<textarea id="apii-output" readonly placeholder="Sanitized prompt text will automatically appear here..."></textarea>
			</div>

		</div>

		<footer class="apii-footer">
			<div class="apii-stats">
				<div class="apii-stat-item">
					<strong>Total Redactions: </strong><span id="apii-count-total">0</span>
				</div>
				<div class="apii-stat-detail" id="apii-breakdown" aria-live="polite">Clean text. No sensitive data detected.</div>
			</div>
		</footer>

	</main>
	<?php
	return ob_get_clean();
} );
