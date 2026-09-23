/**
 * Autonom Context Merge v1.1 — Shortcode [autonom_context_merge]
 */
add_shortcode( 'autonom_context_merge', function () {
	if ( is_admin() || is_feed() ) {
		return '';
	}
	ob_start();
	?>
	<section id="autonom-context-merge">

		<!-- STEP 1 · SOURCE -->
		<div class="cm-card">
			<div class="cm-label"><span class="num">01</span><span>Source documents</span></div>
			<h2>Add every file you need to combine</h2>
			<p class="cm-hint">PDF, TXT, MD, HTML, or CSV. Add as many as you want — Autonom merges them into one clean document. Nothing is uploaded.</p>

			<div class="cm-tabs">
				<button type="button" class="cm-tab is-active" data-mode="files">Add files</button>
				<button type="button" class="cm-tab" data-mode="paste">Paste text</button>
			</div>

			<div class="cm-panel is-active" data-mode="files">
				<label class="cm-drop">
					<input type="file" class="cm-file" accept=".pdf,.txt,.md,.markdown,.html,.htm,.csv,application/pdf,text/plain,text/markdown,text/html,text/csv" multiple>
					<span class="cm-drop-icon">📎</span>
					<strong>Drop files here</strong>
					<small>or click to browse · multiple files supported · PDF, TXT, MD, HTML, CSV</small>
				</label>

				<div class="cm-filelist" hidden>
					<div class="cm-filelist-head">
						<span><span class="count">0 files</span></span>
						<button type="button" class="clear-all">Clear all</button>
					</div>
					<div class="cm-filelist-body"></div>
				</div>
			</div>

			<div class="cm-panel" data-mode="paste">
				<textarea class="cm-input" placeholder="Or paste a single block of text here — for example, text you copied from a PDF. Autonom will clean it and use it as one document."></textarea>
			</div>
		</div>

		<!-- STEP 2 · OPTIONS -->
		<div class="cm-card">
			<div class="cm-label"><span class="num">02</span><span>How to clean</span></div>
			<h2>Toggle the cleanup steps</h2>
			<p class="cm-hint">Each cleanup runs per document before merging. Turn off anything you do not need.</p>

			<div class="cm-toggles">
				<label class="cm-toggle">
					<input type="checkbox" data-step="rejoinHyphens" checked>
					<span><b>Rejoin hyphenated words</b><small>infor- / mation → information</small></span>
				</label>
				<label class="cm-toggle">
					<input type="checkbox" data-step="unwrap" checked>
					<span><b>Reflow line breaks</b><small>Rebuild paragraphs from broken lines</small></span>
				</label>
				<label class="cm-toggle">
					<input type="checkbox" data-step="removePageNumbers" checked>
					<span><b>Remove page numbers</b><small>Digits, "Page X of Y", "Sida X"</small></span>
				</label>
				<label class="cm-toggle">
					<input type="checkbox" data-step="removeHeaders" checked>
					<span><b>Remove running headers/footers</b><small>Fuzzy match — catches headers that vary by page number</small></span>
				</label>
				<label class="cm-toggle">
					<input type="checkbox" data-step="preserveLists" checked>
					<span><b>Preserve lists</b><small>Keep bulleted and numbered items</small></span>
				</label>
				<label class="cm-toggle">
					<input type="checkbox" data-step="preserveHeadings" checked>
					<span><b>Preserve headings</b><small>Keep short heading-like lines separate</small></span>
				</label>
				<label class="cm-toggle">
					<input type="checkbox" data-step="crossDocDedup">
					<span><b>Remove content repeated across documents</b><small>Strips shared headers, case numbers, and boilerplate</small></span>
				</label>
			</div>

			<div class="cm-field">
				<label>Between documents</label>
				<div class="cm-seg cm-seg-merge">
					<button type="button" data-value="heading" class="is-active">Filename heading</button>
					<button type="button" data-value="divider">Dividing rule</button>
					<button type="button" data-value="none">No separator</button>
				</div>
			</div>

			<button type="button" class="cm-run" disabled>Merge and clean</button>
		</div>

		<!-- STEP 3 · RESULT -->
		<div class="cm-card">
			<div class="cm-label"><span class="num">03</span><span>Merged context</span></div>

			<div class="cm-running" hidden>
				<div class="cm-spinner"></div>
				<div>Reading documents…</div>
			</div>

			<div class="cm-result">
				<div class="cm-stats">
					<div class="cm-stat">
						<div class="cm-stat-label">Documents merged</div>
						<div class="cm-stat-value" data-stat="docs">—</div>
					</div>
					<div class="cm-stat">
						<div class="cm-stat-label">Words</div>
						<div class="cm-stat-value" data-stat="words">—</div>
					</div>
					<div class="cm-stat">
						<div class="cm-stat-label">Est. tokens</div>
						<div class="cm-stat-value" data-stat="tokens">—</div>
					</div>
					<div class="cm-stat">
						<div class="cm-stat-label">Lines removed</div>
						<div class="cm-stat-value" data-stat="removed">—</div>
					</div>
				</div>

				<div class="cm-output-head">
					<div class="cm-format-group">
						<button type="button" class="cm-format is-active" data-format="text">Plain text</button>
						<button type="button" class="cm-format" data-format="markdown">Markdown</button>
						<button type="button" class="cm-format" data-format="html">HTML</button>
					</div>
					<div class="cm-output-actions">
						<button type="button" class="cm-btn cm-copy">Copy</button>
						<button type="button" class="cm-btn primary cm-download">Download</button>
					</div>
				</div>

				<textarea class="cm-output" readonly placeholder="The merged, cleaned document will appear here."></textarea>
			</div>
		</div>

	</section>
	<?php
	return ob_get_clean();
} );
