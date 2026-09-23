/**
 * Autonom Brand Kit Pro v2.1 — Shortcode [autonom_brand_kit_pro]
 */
add_shortcode( 'autonom_brand_kit_pro', function () {
	if ( is_admin() || is_feed() ) {
		return '';
	}
	ob_start();
	?>
	<section id="autonom-brand-kit-pro">
		<div class="abk-wrap">

			<!-- 1. SOURCE -->
			<div class="abk-card">
				<span class="abk-eyebrow">Step 1 · Source logo</span>
				<h3>Upload a logo to generate every size you need</h3>
				<label class="abk-drop">
					<input type="file" class="abk-file" accept="image/png,image/jpeg,image/webp,image/svg+xml">
					<strong>Drop your logo here</strong>
					<small>or click to choose a file — PNG, JPG, WebP or SVG</small>
				</label>
				<div class="abk-source" hidden>
					<div class="abk-source-row">
						<img class="abk-thumb" alt="">
						<div class="abk-source-meta">
							<b class="abk-filename">—</b>
							<span class="abk-dimensions">—</span>
						</div>
					</div>
				</div>
			</div>

			<div class="abk-grid">

				<!-- LEFT COLUMN -->
				<div>

					<!-- 2. APPEARANCE (now first) -->
					<div class="abk-card">
						<span class="abk-eyebrow">Step 2 · Appearance</span>
						<h3>Background, layout, and mask</h3>

						<div class="abk-field">
							<label>Background mode</label>
							<div class="abk-seg abk-seg-bg">
								<button type="button" data-mode="transparent">Transparent</button>
								<button type="button" data-mode="solid">Solid</button>
								<button type="button" data-mode="gradient">Gradient</button>
							</div>
							<small class="abk-hint">Banners always render a background (from your palette if transparent is selected). Icons and avatars honour the transparent setting.</small>
						</div>

						<div class="abk-field">
							<label>Colors</label>
							<div class="abk-color-pair">
								<label>Start <input type="color" class="abk-bg-color1" value="#101a31"></label>
								<div class="abk-bg-color2-wrap" style="display:none;flex:1;">
									<label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--abk-muted);font-weight:600;">End <input type="color" class="abk-bg-color2" value="#79f2c0"></label>
								</div>
								<button type="button" class="abk-swap-btn" style="display:none;" title="Swap">⇄</button>
							</div>
							<div class="abk-palette"></div>
							<small class="abk-hint">Colors extracted from your logo appear below. Click one to set the start color.</small>
						</div>

						<div class="abk-field">
							<label>Padding (X / Y) <span class="abk-pad-x-label">12%</span> · <span class="abk-pad-y-label">12%</span></label>
							<div class="abk-row">
								<input type="range" class="abk-range abk-pad-x" min="0" max="45" value="12" aria-label="Horizontal padding">
								<input type="range" class="abk-range abk-pad-y" min="0" max="45" value="12" aria-label="Vertical padding">
							</div>
							<small class="abk-hint">Applies to icons and avatars.</small>
						</div>

						<div class="abk-field">
							<label>Fit mode</label>
							<select class="abk-select abk-fit">
								<option value="contain">Contain — show the whole logo, letterboxed</option>
								<option value="cover">Cover — fill the canvas, crop edges</option>
							</select>
						</div>

						<div class="abk-field">
							<label>Mask shape (icons &amp; avatars)</label>
							<select class="abk-select abk-mask">
								<option value="none">Square / rectangular</option>
								<option value="rounded">Rounded corners</option>
								<option value="circle">Circle</option>
							</select>
						</div>

						<div class="abk-field">
							<label>Banner layout</label>
							<select class="abk-select abk-template">
								<option value="minimal">Minimal — logo top-left, text bottom-left</option>
								<option value="centered">Centered — logo above, text below</option>
								<option value="split">Split — logo left, text right</option>
								<option value="frame">Frame — logo corner, tagline centered</option>
							</select>
						</div>

						<div class="abk-field">
							<label style="cursor:pointer;">
								<span>Add brand name next to logo (web &amp; email assets)</span>
								<input type="checkbox" class="abk-wordmark" style="accent-color:var(--abk-accent);width:16px;height:16px;">
							</label>
						</div>
					</div>

					<!-- 3. BRAND VOICE (now second, still optional) -->
					<div class="abk-card">
						<span class="abk-eyebrow">Brand voice · optional</span>
						<h3>Text used on banners and web assets</h3>
						<div class="abk-field">
							<label for="abk-brand-name">Brand name</label>
							<input type="text" id="abk-brand-name" class="abk-input abk-brand-name" placeholder="Autonom" autocomplete="organization">
						</div>
						<div class="abk-field">
							<label for="abk-tagline">Tagline</label>
							<input type="text" id="abk-tagline" class="abk-input abk-tagline" placeholder="Local-first document tools">
						</div>
						<div class="abk-field">
							<label for="abk-website">Website</label>
							<input type="text" id="abk-website" class="abk-input abk-website" placeholder="autonom.tools">
						</div>
						<div class="abk-field">
							<label for="abk-email">Contact email</label>
							<input type="email" id="abk-email" class="abk-input abk-email" placeholder="hello@autonom.tools">
						</div>
						<small class="abk-hint">All optional. Banners consume tagline and website; the email signature consumes your contact email. Skip this card if you only need favicons and icons.</small>
					</div>

					<!-- 4. ASSETS -->
					<div class="abk-card">
						<span class="abk-eyebrow">Step 3 · Assets</span>
						<div class="abk-actions-compact">
							<button type="button" class="abk-select-all">Select all</button>
							<button type="button" class="abk-clear-all">Clear all</button>
							<button type="button" class="abk-reset">Reset</button>
						</div>
						<div class="abk-checks"></div>

						<div class="abk-field" style="margin-top:16px;border-top:1px solid var(--abk-border);padding-top:14px;">
							<label>Add a custom size</label>
							<div class="abk-add-row">
								<input type="text" class="abk-input abk-add-name" placeholder="Name">
								<input type="number" class="abk-input abk-add-w" placeholder="W" min="4" max="4096">
								<input type="number" class="abk-input abk-add-h" placeholder="H" min="4" max="4096">
								<button type="button" class="abk-add-btn">Add</button>
							</div>
						</div>
					</div>

				</div>

				<!-- RIGHT COLUMN -->
				<div>
					<div class="abk-card">
						<div class="abk-preview-head">
							<h3>Live preview</h3>
							<div class="abk-preview-tools">
								<label class="abk-toggle-check" title="Show the circular crop platforms apply to avatars">
									<input type="checkbox" class="abk-circle-safe">
									<span>Circle-safe preview</span>
								</label>
								<span class="abk-count">0 assets selected</span>
							</div>
						</div>
						<div class="abk-previews is-empty">Upload a logo to preview your brand kit.</div>
					</div>

					<div class="abk-card">
						<button type="button" class="abk-btn abk-btn-primary abk-btn-wide abk-download" disabled>Download ZIP</button>
						<details class="abk-snippet">
							<summary>Favicon &lt;head&gt; snippet <button type="button" class="abk-btn abk-btn-secondary abk-snippet-copy" style="margin-left:8px;padding:4px 10px;font-size:11px;">Copy</button></summary>
							<pre class="abk-snippet-pre">Select favicon assets to generate a &lt;head&gt; snippet.</pre>
						</details>
					</div>
				</div>

			</div>

			<div class="abk-foot">
				<span>Autonom Brand Kit Pro · v2.1</span>
				<span>Local-first · Your logo never leaves your browser</span>
			</div>

		</div>
	</section>
	<?php
	return ob_get_clean();
} );
