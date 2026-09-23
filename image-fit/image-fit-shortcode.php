/**
 * Autonom Image Fit v3.1 — Shortcode [autonom_image_fit]
 */
add_shortcode( 'autonom_image_fit', function () {
	if ( is_admin() || is_feed() ) {
		return '';
	}
	ob_start();
	?>
	<section id="autonom-image-fit">

		<!-- STEP 1 · SOURCE -->
		<div class="if-card">
			<div class="if-label"><span class="num">01</span><span>Source image</span></div>
			<h2>Drop the image you need to fit</h2>
			<p class="if-hint">Drag it, paste it, or click to browse. Nothing is uploaded — everything happens in your browser.</p>

			<label class="if-drop">
				<input type="file" class="if-file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml">
				<span class="if-drop-icon">🖼️</span>
				<strong>Drop an image here</strong>
				<small>or click to browse · PNG, JPG, WebP, GIF, BMP, SVG</small>
			</label>

			<div class="if-source" hidden>
				<img class="if-source-thumb" alt="">
				<div class="if-source-meta">
					<b class="if-source-name">—</b>
					<span class="if-source-info">—</span>
				</div>
				<button type="button" class="if-source-change">Change</button>
			</div>

			<div class="if-upscale-note" hidden></div>
		</div>

		<!-- STEP 2 · MODE -->
		<div class="if-card">
			<div class="if-label"><span class="num">02</span><span>What do you need?</span></div>
			<h2>Pick the constraint you have to meet</h2>
			<p class="if-hint">Then we will only show the settings that matter for that constraint.</p>

			<div class="if-modes">
				<button type="button" class="if-mode is-active" data-mode="size">
					<span class="if-mode-icon">📦</span>
					<span class="if-mode-title">Under a file size</span>
					<span class="if-mode-desc">Portals that say "max 100 KB".</span>
				</button>
				<button type="button" class="if-mode" data-mode="dims">
					<span class="if-mode-icon">📐</span>
					<span class="if-mode-title">Exact dimensions</span>
					<span class="if-mode-desc">A specific width and height.</span>
				</button>
				<button type="button" class="if-mode" data-mode="preset">
					<span class="if-mode-icon">🌐</span>
					<span class="if-mode-title">Platform preset</span>
					<span class="if-mode-desc">Open Graph, LinkedIn, Instagram.</span>
				</button>
				<button type="button" class="if-mode" data-mode="id">
					<span class="if-mode-icon">🪪</span>
					<span class="if-mode-title">ID / Document</span>
					<span class="if-mode-desc">Passport, visa, driving licence.</span>
				</button>
			</div>

			<!-- ========== SIZE MODE ========== -->
			<div class="if-settings is-active" data-mode="size">
				<div class="if-field">
					<label>Target file size</label>
					<div class="if-chips">
						<button type="button" class="if-chip" data-kb="50">50 KB</button>
						<button type="button" class="if-chip is-active" data-kb="100">100 KB</button>
						<button type="button" class="if-chip" data-kb="200">200 KB</button>
						<button type="button" class="if-chip" data-kb="500">500 KB</button>
						<button type="button" class="if-chip" data-kb="1024">1 MB</button>
					</div>
					<div class="if-custom-kb">
						<input type="number" min="10" max="20480" placeholder="Custom">
						<span>KB</span>
					</div>
				</div>

				<div class="if-field">
					<label>Output format</label>
					<div class="if-seg if-seg-format">
						<button type="button" data-value="jpg" class="is-active">JPG</button>
						<button type="button" data-value="png">PNG</button>
						<button type="button" data-value="webp">WebP</button>
					</div>
				</div>

				<div class="if-field">
					<label class="if-checkbox">
						<input type="checkbox" class="if-size-downscale" checked>
						<span>Allow downscaling if quality alone cannot reach the target. <em>Recommended.</em></span>
					</label>
				</div>
			</div>

			<!-- ========== DIMS MODE ========== -->
			<div class="if-settings" data-mode="dims">
				<div class="if-field">
					<label>Target dimensions</label>
					<div class="if-num-row">
						<input type="number" class="if-num if-dims-w" placeholder="Width" min="4" max="8192">
						<span class="if-times">×</span>
						<input type="number" class="if-num if-dims-h" placeholder="Height" min="4" max="8192">
					</div>
				</div>

				<div class="if-field">
					<label>Fit mode</label>
					<div class="if-seg if-seg-fit">
						<button type="button" data-value="cover" class="is-active">Cover — fill the frame</button>
						<button type="button" data-value="contain">Contain — show it all</button>
					</div>
					<p class="if-hint" style="margin-top:8px;">Cover crops to fill the exact shape. Contain keeps the whole image visible.</p>
				</div>

				<div class="if-focal if-dims-focal" hidden>
					<div class="if-focal-hint">Click the part of the image that should stay in frame. The green rectangle shows exactly what will remain.</div>
					<div class="if-focal-stage">
						<canvas></canvas>
						<div class="if-focal-crop"></div>
						<div class="if-focal-dot" style="left:50%;top:50%;"></div>
					</div>
				</div>

				<div class="if-fillbox" hidden>
					<label class="if-fillopt is-active">
						<input type="radio" name="if-dims-fill" value="blur" checked>
						<span><b>Blurred backdrop</b><small>Fill empty areas with a blurred copy of the same image.</small></span>
					</label>
					<label class="if-fillopt">
						<input type="radio" name="if-dims-fill" value="extend">
						<span><b>Edge extend</b><small>Continue the image's own edges into the empty space. Best for photos with soft edges — sky, walls, gradients.</small></span>
					</label>
					<label class="if-fillopt">
						<input type="radio" name="if-dims-fill" value="plain">
						<span><b>Solid colour</b><small>Fill empty areas with a colour you choose.</small></span>
					</label>
				</div>

				<div class="if-blur-row if-dims-blur-row" hidden>
					<label style="font-size:12.5px;font-weight:600;color:var(--if-text-2);min-width:90px;">Blur strength</label>
					<input type="range" class="if-dims-blur" min="0" max="80" value="30" step="1">
					<span class="if-blur-val if-dims-blur-val">30px</span>
				</div>

				<div class="if-field if-dims-bg-field" hidden>
					<label>Background colour</label>
					<input type="color" class="if-dims-bg" value="#ffffff" style="width:60px;height:36px;padding:0;border:1px solid var(--if-line);border-radius:8px;cursor:pointer;">
				</div>

				<div class="if-field">
					<label>Output format</label>
					<div class="if-seg if-seg-format">
						<button type="button" data-value="jpg" class="is-active">JPG</button>
						<button type="button" data-value="png">PNG</button>
						<button type="button" data-value="webp">WebP</button>
					</div>
				</div>
			</div>

			<!-- ========== PLATFORM PRESET MODE ========== -->
			<div class="if-settings" data-mode="preset">
				<div class="if-field">
					<label>Platform preset</label>
					<div class="if-presets"></div>
				</div>

				<div class="if-field">
					<label>Fit mode</label>
					<div class="if-seg if-seg-fit">
						<button type="button" data-value="cover" class="is-active">Cover</button>
						<button type="button" data-value="contain">Contain</button>
					</div>
				</div>

				<div class="if-focal if-preset-focal" hidden>
					<div class="if-focal-hint">Click the part of the image that should stay in frame.</div>
					<div class="if-focal-stage">
						<canvas></canvas>
						<div class="if-focal-crop"></div>
						<div class="if-focal-dot" style="left:50%;top:50%;"></div>
					</div>
				</div>

				<div class="if-fillbox" hidden>
					<label class="if-fillopt is-active">
						<input type="radio" name="if-preset-fill" value="blur" checked>
						<span><b>Blurred backdrop</b><small>Fill empty areas with a blurred copy of the same image.</small></span>
					</label>
					<label class="if-fillopt">
						<input type="radio" name="if-preset-fill" value="extend">
						<span><b>Edge extend</b><small>Continue the image's own edges into the empty space.</small></span>
					</label>
					<label class="if-fillopt">
						<input type="radio" name="if-preset-fill" value="plain">
						<span><b>Solid colour</b><small>Fill empty areas with a colour you choose.</small></span>
					</label>
				</div>

				<div class="if-blur-row if-preset-blur-row" hidden>
					<label style="font-size:12.5px;font-weight:600;color:var(--if-text-2);min-width:90px;">Blur strength</label>
					<input type="range" class="if-preset-blur" min="0" max="80" value="30" step="1">
					<span class="if-blur-val if-preset-blur-val">30px</span>
				</div>

				<div class="if-field if-preset-bg-field" hidden>
					<label>Background colour</label>
					<input type="color" class="if-preset-bg" value="#ffffff" style="width:60px;height:36px;padding:0;border:1px solid var(--if-line);border-radius:8px;cursor:pointer;">
				</div>

				<div class="if-field">
					<label>Output format</label>
					<div class="if-seg if-seg-format">
						<button type="button" data-value="jpg" class="is-active">JPG</button>
						<button type="button" data-value="png">PNG</button>
						<button type="button" data-value="webp">WebP</button>
					</div>
				</div>
			</div>

			<!-- ========== ID / DOCUMENT MODE ========== -->
			<div class="if-settings" data-mode="id">
				<div class="if-id-notice">
					<span>⚠️</span>
					<div>
						<strong>Dimensions and file size only.</strong>
						Autonom can enforce exact pixels and the maximum file size these portals require. It cannot verify head position, background colour, expression, or the dozens of other rules each country enforces. Always check the official source before submitting.
					</div>
				</div>

				<div class="if-field">
					<label>Document type — grouped by photo format</label>
					<div class="if-id-groups"></div>
				</div>

				<div class="if-focal if-id-focal" hidden>
					<div class="if-focal-hint">Click the face so the crop centres on it.</div>
					<div class="if-focal-stage">
						<canvas></canvas>
						<div class="if-focal-crop"></div>
						<div class="if-focal-dot" style="left:50%;top:50%;"></div>
					</div>
				</div>

				<div class="if-field">
					<label>Max file size override (optional)</label>
					<div class="if-id-maxkb">
						<button type="button" class="if-chip" data-kb="50">50 KB</button>
						<button type="button" class="if-chip is-active" data-kb="240">240 KB</button>
						<button type="button" class="if-chip" data-kb="300">300 KB</button>
						<button type="button" class="if-chip" data-kb="500">500 KB</button>
						<button type="button" class="if-chip" data-kb="1000">1 MB</button>
					</div>
				</div>

				<div class="if-field">
					<label>Output format</label>
					<div class="if-seg if-seg-format">
						<button type="button" data-value="jpg" class="is-active">JPG</button>
						<button type="button" data-value="png">PNG</button>
						<button type="button" data-value="webp">WebP</button>
					</div>
				</div>
			</div>

			<button type="button" class="if-run" disabled>Make it fit</button>
		</div>

		<!-- STEP 3 · RESULT -->
		<div class="if-card">
			<div class="if-label"><span class="num">03</span><span>Result</span></div>

			<div class="if-running" hidden>
				<div class="if-spinner"></div>
				<div>Working locally in your browser…</div>
			</div>

			<div class="if-result">
				<div class="if-notice" hidden></div>

				<div class="if-result-head">
					<span class="if-verdict is-ready">Ready</span>
					<span class="if-verdict-note"></span>
				</div>

				<div class="if-previews">
					<div class="if-preview">
						<div class="if-preview-tag if-original-tag">
							<span>Original</span>
							<span class="dims-size"><span class="dims">—</span> · <span class="size">—</span></span>
						</div>
						<div class="if-preview-canvas"><canvas class="if-original-canvas"></canvas></div>
					</div>

					<div class="if-preview">
						<div class="if-preview-tag if-result-tag">
							<span>Result</span>
							<span class="dims-size"><span class="dims">—</span> · <span class="size">—</span></span>
						</div>
						<div class="if-preview-canvas"><canvas class="if-result-canvas"></canvas></div>
					</div>
				</div>

				<div class="if-stats">
					<div class="if-stat if-stat-dims">
						<div class="if-stat-label">Dimensions</div>
						<div class="if-stat-value">—</div>
					</div>
					<div class="if-stat if-stat-size">
						<div class="if-stat-label">File size</div>
						<div class="if-stat-value">—</div>
					</div>
					<div class="if-stat if-stat-quality">
						<div class="if-stat-label">Quality</div>
						<div class="if-stat-value">—</div>
					</div>
					<div class="if-stat if-stat-delta">
						<div class="if-stat-label">Reduction</div>
						<div class="if-stat-value">—</div>
					</div>
				</div>

				<div class="if-actions">
					<button type="button" class="if-download">Download image</button>
					<button type="button" class="if-reset">Start over</button>
				</div>
			</div>
		</div>

	</section>
	<?php
	return ob_get_clean();
} );
