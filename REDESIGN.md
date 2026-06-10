# thebox — UI/UX redesign (brand system v3)

A complete **front-end reskin** of The Box Café POS against the **thebox design
system** ("The operating system for modern restaurants"). Backend, routes, and
business logic are untouched — this is purely CSS / markup / color.

Source of truth: the thebox design-system bundle (brand brief + tokens + UI kits).
Palette: **no pure black, no pure white — everything warm.** Burgundy is the new
black; cream is the page; tan is the rare hero accent.

## What changed

### Foundations (token-driven — this is where most of the reskin lives)
- **`public/css/base.css`** — the `:root` and `[data-theme="dark"]` token blocks
  were rewritten from the old emerald-green / cool-slate system to the warm thebox
  palette. **Every variable name was preserved**, so the whole app inherits the new
  look through the existing `var(--…)` references.
  - Canvas `--bg` → cream `#F4ECD8`; surfaces `--surface` → bone `#FAFAF5`.
  - `--primary` → burgundy `#5C1A24`; `--accent` → burgundy `#7A2230`; tan reserved.
  - States: success → sage `#6B7A5C`, danger → signal `#B83A2E`, warn → warm amber,
    info → warm slate (no blue).
  - Shadows are **burgundy-tinted, never gray**. Gradients are flat-by-design.
  - Dark mode → deep-wine back-of-house theme where tan punches harder.
- **`public/css/brand.css`** (new, loaded last) — editorial details the token swap
  can't express: the cube-logo treatment, the **small-caps label signature**
  (table headers, section labels, +10% tracking), **tabular mono numerals** on money
  and metrics (JetBrains Mono), calm flat in-product buttons, and the **2026 glow**
  reserved for the two hero moments (login + encaisser).
- **Type** — Poppins dropped; **Inter** (display optical sizing) everywhere +
  **JetBrains Mono** for numerals/receipts. Loaded in `index.html` and `marketing.html`.

### Color cleanup beyond tokens
Hardcoded greens, plus stray cyan / blue / indigo / violet / pink accents (table
statuses, KPI accent bars, chart palettes) were remapped to the warm system across
`public/css/*.css` and `public/js/{dashboard,commandes,store,app}.js`. Verified: a
hue-heuristic scan reports **zero** cool or green colors remaining.

Warm status system for the floor plan: sage = free · burgundy = occupied ·
tan = reserved · ash = cleaning. Dashboard charts use a warm categorical palette
(burgundy / tan / sage / clay / plum / gold) defined in `THEBOX_PALETTE`.

### Brand assets & logo
- Cube mark copied to **`public/brand/logo-cube.svg`** + `logo-cube-inverse.svg`.
- Login and sidebar now show the **cube + lowercase `thebox` wordmark** (the old
  green box / stacked "THE BOX CAFÉ" gradient text is gone).
- Favicon, apple-touch-icon, PWA `manifest.json`, and `theme-color` updated to the
  cube and burgundy `#5C1A24`.

### Iconography (de-emoji)
The brand drops all emoji for **1.5px outlined icons**. Replaced on the primary
surfaces: login role buttons, dashboard KPI strip, Caisse topbar (report/bell/user),
order-panel empty state, the validate/encaisser button, receipt, and offline banner.

### Marketing site (new)
- **`public/marketing.html`** — a standalone, production-ready editorial landing page
  built from the design system's marketing UI kit: sticky glass nav, hero with the
  glowing tan CTA, a live dashboard mock, three feature cards, a pull quote, the
  burgundy CTA band, and a footer. Served at **`/marketing.html`**, uses the same
  brand tokens (`base.css`).

## Known follow-ups (flagged, not yet done)
- **Remaining emoji (~36 lines)** live on admin/secondary surfaces — the **Settings
  tab rail** (☕💳📊🖨…), the product/category modals, and the reserve-table modal —
  plus a few unicode symbol-glyphs used as icons (→ ← ✓ ✕ ↺ ⬇ ✎). These weren't on
  the default login→Caisse→Dashboard path; happy to finish de-emojifying the admin
  panels on request.
- **Fonts** are Google-Fonts substitutions (Inter for "Inter Display"; JetBrains Mono
  for Geist Mono). Swap in licensed files if you have them.
- **Photography** — none ships; marketing uses a product-UI mock, not restaurant
  photography. Drop real warm, natural-light images into `public/brand/` to use them.

## Verifying locally
```bash
npm install
npm start            # http://localhost:3001  (app)  ·  /marketing.html  (site)
```
Default dev PINs are created on first boot (see Utilisateurs). The 11 smoke-test
failures in a bare sandbox are all "Supabase non configuré" (no database) — unrelated
to the reskin; auth / permissions / tables / sessions pass.
