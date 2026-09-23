/* ==========================================================================
   Autonom Image Fit — v3.1 Complete Stylesheet
   ========================================================================== */

/* ---------- TOKENS ---------- */
#autonom-image-fit,
#autonom-image-fit-intro,
#autonom-image-fit-seo {
  --if-ink:        #0a0e1a;
  --if-ink-2:      #0e1422;
  --if-paper:      #ffffff;
  --if-paper-2:    #f5f6f8;
  --if-paper-3:    #eef0f4;

  --if-text:       #0d1220;
  --if-text-2:     #3d4757;
  --if-muted:      #6b7280;
  --if-muted-2:    #9aa3b0;

  --if-text-dark:  #e8edf7;
  --if-muted-dark: #8892a6;

  --if-line:       #e2e5ea;
  --if-line-2:     #eef0f4;

  --if-accent:     #10b981;
  --if-accent-2:   #34d399;
  --if-accent-ink: #04291d;
  --if-warn:       #f59e0b;
  --if-danger:     #dc2626;

  --if-mono: ui-monospace, "SF Mono", "JetBrains Mono", "Fira Code", Consolas, Monaco, monospace;

  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", ui-sans-serif, system-ui,
               "Inter", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.55;
  color: var(--if-text);
  box-sizing: border-box;
  text-align: left !important;
  -webkit-font-smoothing: antialiased;
}
#autonom-image-fit *,
#autonom-image-fit-intro *,
#autonom-image-fit-seo * { box-sizing: border-box; }
#autonom-image-fit a { text-decoration: none; color: inherit; }
#autonom-image-fit p { margin: 0; }
#autonom-image-fit h1,
#autonom-image-fit h2,
#autonom-image-fit h3,
#autonom-image-fit h4 { margin: 0; font-family: inherit; }

/* ==========================================================================
   INTRO
   ========================================================================== */
#autonom-image-fit-intro {
  max-width: 1180px;
  margin: 0 auto 32px;
  padding: 0 4px;
}
#autonom-image-fit-intro .if-brand {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-family: var(--if-mono);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--if-muted);
  margin-bottom: 22px;
}
#autonom-image-fit-intro .if-brand::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--if-accent);
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.15);
}
#autonom-image-fit-intro h1 {
  font-size: clamp(36px, 5vw, 60px);
  line-height: 1.02;
  letter-spacing: -0.038em;
  font-weight: 700;
  color: var(--if-text);
  margin: 0 0 18px;
  max-width: 820px;
}
#autonom-image-fit-intro h1 em { font-style: normal; color: var(--if-accent); }
#autonom-image-fit-intro .if-lead {
  font-size: 1.06rem;
  line-height: 1.65;
  color: var(--if-muted);
  max-width: 640px;
  margin: 0 0 22px;
}
#autonom-image-fit-intro .if-lead strong { color: var(--if-text); font-weight: 600; }
#autonom-image-fit-intro .if-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.28);
  border-radius: 999px;
  font-family: var(--if-mono);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: #047857;
  text-transform: uppercase;
}
#autonom-image-fit-intro .if-pill::before {
  content: "";
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--if-accent);
}

/* ==========================================================================
   TOOL SHELL
   ========================================================================== */
#autonom-image-fit {
  background: var(--if-paper-2);
  border-radius: 18px;
  padding: 24px;
  max-width: 1180px;
  margin: 0 auto 44px;
}
@media (max-width: 640px) { #autonom-image-fit { padding: 16px; } }

#autonom-image-fit .if-card {
  background: var(--if-paper);
  border: 1px solid var(--if-line);
  border-radius: 14px;
  padding: 24px;
  margin-bottom: 14px;
}
#autonom-image-fit .if-card:last-child { margin-bottom: 0; }
@media (max-width: 640px) { #autonom-image-fit .if-card { padding: 18px; } }

#autonom-image-fit .if-label {
  display: flex;
  align-items: center;
  gap: 9px;
  font-family: var(--if-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--if-muted);
  margin-bottom: 14px;
}
#autonom-image-fit .if-label .num { color: var(--if-accent); }
#autonom-image-fit .if-card h2 {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--if-text);
  margin: 0 0 6px;
}
#autonom-image-fit .if-card p.if-hint {
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--if-muted);
  margin: 0 0 16px;
}

/* ==========================================================================
   DROPZONE
   ========================================================================== */
#autonom-image-fit .if-drop {
  display: block;
  border: 1.5px dashed #b8bec9;
  border-radius: 12px;
  padding: 38px 20px;
  text-align: center;
  background: var(--if-paper-2);
  cursor: pointer;
  transition: border-color .15s, background .15s;
}
#autonom-image-fit .if-drop:hover { border-color: var(--if-muted-2); }
#autonom-image-fit .if-drop.is-drag { border-color: var(--if-accent); background: #ecfdf5; }
#autonom-image-fit .if-drop-icon {
  display: inline-grid;
  place-items: center;
  width: 52px; height: 52px;
  border-radius: 14px;
  background: var(--if-paper);
  border: 1px solid var(--if-line);
  font-size: 22px;
  margin-bottom: 14px;
}
#autonom-image-fit .if-drop strong {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: var(--if-text);
  margin-bottom: 4px;
}
#autonom-image-fit .if-drop small {
  display: block;
  font-size: 12.5px;
  color: var(--if-muted);
}
#autonom-image-fit .if-file { display: none; }

#autonom-image-fit .if-source {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  background: var(--if-paper-2);
  border: 1px solid var(--if-line);
  border-radius: 12px;
  margin-top: 14px;
}
#autonom-image-fit .if-source[hidden] { display: none; }
#autonom-image-fit .if-source-thumb {
  width: 52px; height: 52px;
  object-fit: contain;
  border-radius: 10px;
  background: repeating-conic-gradient(#dce4f2 0 25%, #9ca7ba 0 50%) 50% / 12px 12px;
  flex-shrink: 0;
}
#autonom-image-fit .if-source-meta { flex: 1; min-width: 0; }
#autonom-image-fit .if-source-meta b {
  display: block;
  font-size: 13.5px;
  color: var(--if-text);
  word-break: break-all;
  margin-bottom: 3px;
}
#autonom-image-fit .if-source-meta span { font-size: 12px; color: var(--if-muted); }
#autonom-image-fit .if-source-change {
  background: transparent;
  border: 1px solid var(--if-line);
  border-radius: 8px;
  padding: 7px 12px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--if-text);
  cursor: pointer;
  transition: border-color .15s;
}
#autonom-image-fit .if-source-change:hover { border-color: var(--if-muted-2); }

#autonom-image-fit .if-upscale-note {
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.25);
  border-radius: 10px;
  font-size: 12.5px;
  line-height: 1.5;
  color: #3730a3;
  margin-top: 8px;
}
#autonom-image-fit .if-upscale-note[hidden] { display: none; }
#autonom-image-fit .if-upscale-note strong { color: #312e81; }

/* ==========================================================================
   MODE SELECTOR
   ========================================================================== */
#autonom-image-fit .if-modes {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 900px) { #autonom-image-fit .if-modes { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 500px) { #autonom-image-fit .if-modes { grid-template-columns: 1fr; } }

#autonom-image-fit .if-mode {
  position: relative;
  text-align: left;
  background: var(--if-paper);
  border: 1.5px solid var(--if-line);
  border-radius: 12px;
  padding: 18px 18px 16px;
  cursor: pointer;
  transition: border-color .15s, background .15s;
  font: inherit;
  color: inherit;
}
#autonom-image-fit .if-mode:hover { border-color: var(--if-muted-2); }
#autonom-image-fit .if-mode.is-active { border-color: var(--if-ink); background: var(--if-ink); color: #ffffff; }
#autonom-image-fit .if-mode-icon {
  display: inline-grid;
  place-items: center;
  width: 32px; height: 32px;
  border-radius: 9px;
  background: var(--if-paper-2);
  font-size: 15px;
  margin-bottom: 12px;
  transition: background .15s;
}
#autonom-image-fit .if-mode.is-active .if-mode-icon { background: rgba(255, 255, 255, 0.1); }
#autonom-image-fit .if-mode-title {
  display: block;
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--if-text);
  margin-bottom: 4px;
}
#autonom-image-fit .if-mode.is-active .if-mode-title { color: #ffffff; }
#autonom-image-fit .if-mode-desc {
  display: block;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--if-muted);
}
#autonom-image-fit .if-mode.is-active .if-mode-desc { color: rgba(255, 255, 255, 0.7); }

/* ==========================================================================
   SETTINGS PANELS
   ========================================================================== */
#autonom-image-fit .if-settings { display: none; margin-top: 22px; }
#autonom-image-fit .if-settings.is-active { display: block; }

#autonom-image-fit .if-field { margin-bottom: 18px; }
#autonom-image-fit .if-field:last-child { margin-bottom: 0; }
#autonom-image-fit .if-field > label {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--if-text-2);
  margin-bottom: 8px;
}

#autonom-image-fit .if-chips { display: flex; gap: 6px; flex-wrap: wrap; }
#autonom-image-fit .if-chip {
  background: var(--if-paper);
  border: 1px solid var(--if-line);
  border-radius: 8px;
  padding: 8px 14px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--if-text);
  cursor: pointer;
  transition: border-color .12s, background .12s, color .12s;
}
#autonom-image-fit .if-chip:hover { border-color: var(--if-muted-2); }
#autonom-image-fit .if-chip.is-active { background: var(--if-ink); border-color: var(--if-ink); color: #ffffff; }

#autonom-image-fit .if-num-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 10px;
  align-items: center;
}
#autonom-image-fit .if-num {
  width: 100%;
  background: var(--if-paper);
  border: 1px solid var(--if-line);
  border-radius: 9px;
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  color: var(--if-text);
  outline: none;
}
#autonom-image-fit .if-num:focus { border-color: var(--if-accent); }
#autonom-image-fit .if-num-row .if-times { font-size: 14px; color: var(--if-muted); font-weight: 600; }

#autonom-image-fit .if-custom-kb { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
#autonom-image-fit .if-custom-kb input {
  width: 120px;
  background: var(--if-paper);
  border: 1px solid var(--if-line);
  border-radius: 9px;
  padding: 9px 12px;
  font: inherit;
  font-size: 14px;
  outline: none;
}
#autonom-image-fit .if-custom-kb input:focus { border-color: var(--if-accent); }
#autonom-image-fit .if-custom-kb span { font-size: 13.5px; color: var(--if-muted); }

#autonom-image-fit .if-seg {
  display: inline-flex;
  background: var(--if-paper-2);
  border: 1px solid var(--if-line);
  border-radius: 9px;
  padding: 3px;
  gap: 3px;
  flex-wrap: wrap;
}
#autonom-image-fit .if-seg button {
  background: transparent;
  border: 0;
  border-radius: 6px;
  padding: 7px 14px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--if-muted);
  cursor: pointer;
  transition: background .12s, color .12s;
}
#autonom-image-fit .if-seg button:hover { color: var(--if-text); }
#autonom-image-fit .if-seg button.is-active {
  background: var(--if-paper);
  color: var(--if-text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
#autonom-image-fit .if-seg button:disabled { cursor: not-allowed; opacity: 0.4; }

#autonom-image-fit .if-checkbox {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13.5px;
  color: var(--if-text-2);
  cursor: pointer;
  line-height: 1.5;
}
#autonom-image-fit .if-checkbox input { margin-top: 3px; accent-color: var(--if-accent); flex-shrink: 0; }

#autonom-image-fit .if-presets {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}
#autonom-image-fit .if-preset {
  text-align: left;
  background: var(--if-paper);
  border: 1px solid var(--if-line);
  border-radius: 10px;
  padding: 12px 14px;
  font: inherit;
  cursor: pointer;
  transition: border-color .12s, background .12s;
}
#autonom-image-fit .if-preset:hover { border-color: var(--if-muted-2); }
#autonom-image-fit .if-preset.is-active { border-color: var(--if-accent); background: #ecfdf5; }
#autonom-image-fit .if-preset b { display: block; font-size: 13.5px; font-weight: 700; color: var(--if-text); margin-bottom: 3px; }
#autonom-image-fit .if-preset small { display: block; font-family: var(--if-mono); font-size: 11px; color: var(--if-muted); }

/* ==========================================================================
   FILL / BLUR / FOCAL
   ========================================================================== */
#autonom-image-fit .if-fillbox { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
#autonom-image-fit .if-fillbox[hidden] { display: none; }
#autonom-image-fit .if-fillopt {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: var(--if-paper);
  border: 1.5px solid var(--if-line);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color .12s, background .12s;
  font-size: 13.5px;
  line-height: 1.5;
}
#autonom-image-fit .if-fillopt:hover { border-color: var(--if-muted-2); }
#autonom-image-fit .if-fillopt input { margin-top: 3px; accent-color: var(--if-accent); flex-shrink: 0; }
#autonom-image-fit .if-fillopt.is-active { border-color: var(--if-accent); background: #ecfdf5; }
#autonom-image-fit .if-fillopt b { display: block; color: var(--if-text); font-weight: 600; margin-bottom: 2px; }
#autonom-image-fit .if-fillopt small { color: var(--if-muted); font-size: 12px; }

#autonom-image-fit .if-blur-row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
#autonom-image-fit .if-blur-row[hidden] { display: none; }
#autonom-image-fit .if-blur-row input[type="range"] { flex: 1; accent-color: var(--if-accent); }
#autonom-image-fit .if-blur-row .if-blur-val {
  font-family: var(--if-mono);
  font-size: 11.5px;
  color: var(--if-muted);
  min-width: 44px;
  text-align: right;
}

#autonom-image-fit .if-focal { margin-bottom: 16px; }
#autonom-image-fit .if-focal[hidden] { display: none; }
#autonom-image-fit .if-focal-hint { font-size: 12.5px; color: var(--if-muted); margin-bottom: 10px; line-height: 1.5; }
#autonom-image-fit .if-focal-stage {
  position: relative;
  display: inline-block;
  border: 1px solid var(--if-line);
  border-radius: 10px;
  overflow: hidden;
  cursor: crosshair;
  background: repeating-conic-gradient(#dce4f2 0 25%, #9ca7ba 0 50%) 50% / 12px 12px;
  max-width: 100%;
}
#autonom-image-fit .if-focal-stage canvas { display: block; max-width: 240px; height: auto; border-radius: 9px; }
#autonom-image-fit .if-focal-crop {
  position: absolute;
  border: 1.5px solid var(--if-accent);
  border-radius: 4px;
  box-shadow: 0 0 0 9999px rgba(10, 14, 26, 0.55);
  pointer-events: none;
  transition: left .1s, top .1s, width .1s, height .1s;
  display: none;
}
#autonom-image-fit .if-focal-dot {
  position: absolute;
  width: 22px; height: 22px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  background: rgba(16, 185, 129, 0.6);
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
  transform: translate(-50%, -50%);
  pointer-events: none;
  transition: top .12s, left .12s;
}

/* ==========================================================================
   ID MODE
   ========================================================================== */
#autonom-image-fit .if-id-notice {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.28);
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.55;
  color: #78350f;
  margin-bottom: 18px;
}
#autonom-image-fit .if-id-notice strong { color: var(--if-text); }
#autonom-image-fit .if-id-group { margin-bottom: 18px; }
#autonom-image-fit .if-id-group:last-child { margin-bottom: 0; }
#autonom-image-fit .if-id-group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 8px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--if-line);
}
#autonom-image-fit .if-id-group-head b { font-size: 13px; font-weight: 700; color: var(--if-text); letter-spacing: -0.01em; }
#autonom-image-fit .if-id-group-head small { font-family: var(--if-mono); font-size: 11px; color: var(--if-muted); }
#autonom-image-fit .if-id-presets {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}
#autonom-image-fit .if-id-preset {
  text-align: left;
  background: var(--if-paper);
  border: 1px solid var(--if-line);
  border-radius: 10px;
  padding: 12px 14px;
  font: inherit;
  cursor: pointer;
  transition: border-color .12s, background .12s;
}
#autonom-image-fit .if-id-preset:hover { border-color: var(--if-muted-2); }
#autonom-image-fit .if-id-preset.is-active { border-color: var(--if-accent); background: #ecfdf5; }
#autonom-image-fit .if-id-preset b { display: block; font-size: 13.5px; font-weight: 700; color: var(--if-text); margin-bottom: 3px; }
#autonom-image-fit .if-id-preset small { display: block; font-family: var(--if-mono); font-size: 11px; color: var(--if-muted); }
#autonom-image-fit .if-id-maxkb { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }

/* ==========================================================================
   RUN BUTTON
   ========================================================================== */
#autonom-image-fit .if-run {
  width: 100%;
  background: var(--if-ink);
  color: #ffffff;
  border: 0;
  border-radius: 11px;
  padding: 16px 22px;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: background .15s, opacity .15s;
  margin-top: 22px;
  letter-spacing: -0.005em;
}
#autonom-image-fit .if-run:hover:not(:disabled) { background: #000; }
#autonom-image-fit .if-run:disabled { opacity: 0.35; cursor: not-allowed; }

/* ==========================================================================
   RESULT
   ========================================================================== */
#autonom-image-fit .if-result { display: none; }
#autonom-image-fit .if-result.is-active { display: block; }

#autonom-image-fit .if-result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--if-line);
}
#autonom-image-fit .if-verdict {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 8px 14px;
  border-radius: 999px;
  font-family: var(--if-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
#autonom-image-fit .if-verdict.is-ready {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #047857;
}
#autonom-image-fit .if-verdict.is-partial {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #b45309;
}
#autonom-image-fit .if-verdict::before {
  content: "";
  width: 6px; height: 6px;
  border-radius: 50%;
  background: currentColor;
}
#autonom-image-fit .if-verdict-note {
  font-size: 13.5px;
  color: var(--if-muted);
  flex: 1;
  min-width: 200px;
  text-align: right;
}
@media (max-width: 640px) { #autonom-image-fit .if-verdict-note { text-align: left; } }

#autonom-image-fit .if-previews {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 20px;
}
@media (max-width: 700px) { #autonom-image-fit .if-previews { grid-template-columns: 1fr; } }
#autonom-image-fit .if-preview {
  background: var(--if-paper-2);
  border: 1px solid var(--if-line);
  border-radius: 12px;
  padding: 14px;
}
#autonom-image-fit .if-preview-tag {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--if-mono);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--if-muted);
  margin-bottom: 12px;
}
#autonom-image-fit .if-preview-tag .size { color: var(--if-text); letter-spacing: 0.02em; font-size: 11.5px; }
#autonom-image-fit .if-preview-canvas {
  height: 220px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: repeating-conic-gradient(#dce4f2 0 25%, #9ca7ba 0 50%) 50% / 16px 16px;
  overflow: hidden;
}
#autonom-image-fit .if-preview-canvas canvas { max-width: 100%; max-height: 100%; object-fit: contain; }

#autonom-image-fit .if-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}
@media (max-width: 700px) { #autonom-image-fit .if-stats { grid-template-columns: repeat(2, 1fr); } }
#autonom-image-fit .if-stat {
  background: var(--if-paper-2);
  border: 1px solid var(--if-line);
  border-radius: 11px;
  padding: 14px 16px;
}
#autonom-image-fit .if-stat-label {
  font-family: var(--if-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--if-muted);
  margin-bottom: 6px;
}
#autonom-image-fit .if-stat-value {
  font-size: 17px;
  font-weight: 700;
  color: var(--if-text);
  letter-spacing: -0.015em;
  line-height: 1.2;
}
#autonom-image-fit .if-stat-value .delta { font-size: 12px; font-weight: 600; color: var(--if-accent); margin-left: 4px; }
#autonom-image-fit .if-stat-delta.is-increase .if-stat-value,
#autonom-image-fit .if-stat-delta.is-increase .if-stat-value .delta { color: var(--if-warn); }

#autonom-image-fit .if-actions { display: flex; gap: 10px; flex-wrap: wrap; }
#autonom-image-fit .if-download {
  flex: 1;
  min-width: 200px;
  background: var(--if-accent);
  color: var(--if-accent-ink);
  border: 0;
  border-radius: 11px;
  padding: 15px 22px;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: background .15s;
  letter-spacing: -0.005em;
}
#autonom-image-fit .if-download:hover { background: var(--if-accent-2); }
#autonom-image-fit .if-reset {
  background: transparent;
  border: 1px solid var(--if-line);
  border-radius: 11px;
  padding: 15px 20px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  color: var(--if-text);
  cursor: pointer;
  transition: border-color .15s;
}
#autonom-image-fit .if-reset:hover { border-color: var(--if-muted-2); }

#autonom-image-fit .if-notice {
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 13.5px;
  line-height: 1.55;
  margin-bottom: 18px;
}
#autonom-image-fit .if-notice.is-warn {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.28);
  color: #78350f;
}
#autonom-image-fit .if-notice.is-info {
  background: var(--if-paper-2);
  border: 1px solid var(--if-line);
  color: var(--if-text-2);
}
#autonom-image-fit .if-notice[hidden] { display: none; }
#autonom-image-fit .if-notice strong { color: var(--if-text); }

#autonom-image-fit .if-running {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px;
  background: var(--if-paper-2);
  border: 1px solid var(--if-line);
  border-radius: 11px;
  font-size: 14px;
  color: var(--if-text-2);
}
#autonom-image-fit .if-running[hidden] { display: none; }
#autonom-image-fit .if-spinner {
  width: 18px; height: 18px;
  border: 2px solid var(--if-line);
  border-top-color: var(--if-accent);
  border-radius: 50%;
  animation: if-spin .7s linear infinite;
  flex-shrink: 0;
}
@keyframes if-spin { to { transform: rotate(360deg); } }

/* ==========================================================================
   SEO
   ========================================================================== */
#autonom-image-fit-seo {
  max-width: 1180px;
  margin: 0 auto;
  padding: 44px 0 0;
  border-top: 1px solid var(--if-line);
}
#autonom-image-fit-seo h2 {
  margin: 40px 0 16px !important;
  padding: 0 0 10px !important;
  border: 0 !important;
  border-bottom: 1px solid var(--if-line) !important;
  font-size: 1.45rem !important;
  font-weight: 700 !important;
  letter-spacing: -0.01em;
  color: var(--if-text) !important;
  line-height: 1.3 !important;
}
#autonom-image-fit-seo .if-seo-block:first-child h2 { margin-top: 0 !important; }
#autonom-image-fit-seo h3 {
  margin: 0 0 8px !important;
  font-size: 1.05rem !important;
  font-weight: 600 !important;
  color: var(--if-accent) !important;
  line-height: 1.4 !important;
}
#autonom-image-fit-seo p {
  margin-bottom: 16px !important;
  font-size: .975rem !important;
  line-height: 1.75 !important;
  color: var(--if-text-2) !important;
}
#autonom-image-fit-seo strong { color: var(--if-text) !important; font-weight: 600 !important; }
#autonom-image-fit-seo code {
  background: var(--if-paper-2) !important;
  color: var(--if-accent) !important;
  padding: 3px 8px !important;
  border-radius: 5px !important;
  font-family: var(--if-mono) !important;
  font-size: .85rem !important;
  border: 1px solid var(--if-line) !important;
  display: inline-block;
}
#autonom-image-fit-seo .if-seo-grid {
  display: grid !important;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)) !important;
  gap: 14px !important;
  margin: 20px 0 !important;
}
#autonom-image-fit-seo .if-seo-card {
  background: var(--if-paper-2) !important;
  border: 1px solid var(--if-line) !important;
  border-radius: 12px !important;
  padding: 18px !important;
}
#autonom-image-fit-seo .if-seo-card p { margin-bottom: 0 !important; font-size: .92rem !important; color: var(--if-muted) !important; }
#autonom-image-fit-seo ul.if-list,
#autonom-image-fit-seo ol.if-steps {
  margin: 16px 0 24px !important;
  padding-left: 24px !important;
  list-style-position: outside !important;
}
#autonom-image-fit-seo ul.if-list { list-style-type: disc !important; }
#autonom-image-fit-seo ol.if-steps { list-style-type: decimal !important; }
#autonom-image-fit-seo ul.if-list li,
#autonom-image-fit-seo ol.if-steps li {
  margin-bottom: 12px !important;
  font-size: .95rem !important;
  color: var(--if-text-2) !important;
  padding-left: 6px !important;
  line-height: 1.65 !important;
}
#autonom-image-fit-seo ul.if-list li::marker,
#autonom-image-fit-seo ol.if-steps li::marker { color: var(--if-accent) !important; font-weight: bold !important; }
#autonom-image-fit-seo .if-faq-item {
  background: var(--if-paper-2) !important;
  border: 1px solid var(--if-line) !important;
  border-radius: 12px !important;
  padding: 18px !important;
  margin-bottom: 14px !important;
}
#autonom-image-fit-seo .if-faq-item h3 { color: var(--if-text) !important; font-size: 1.02rem !important; margin-bottom: 8px !important; }
#autonom-image-fit-seo .if-faq-item p { margin-bottom: 0 !important; font-size: .92rem !important; color: var(--if-muted) !important; }
