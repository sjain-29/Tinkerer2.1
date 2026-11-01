# Tinkerer 2.1 — Intelligent Drone Configuration & Build Planner

Customer requirements → engineering calculations → component matching → compatibility verification → weight & power analysis → bill of materials (BOM) → cost estimate. Static site for GitHub Pages; your component catalogue lives in Google Sheets.

## How Tinkerer and Google Sheets stay in sync

| Direction | What happens | When |
|---|---|---|
| Sheet → app | Tinkerer polls a tiny **fingerprint** of the sheet (`?action=version`, a few hundred bytes with row counts) | every minute (configurable), when you return to the tab, and when the network comes back |
| Sheet → app | The full component catalogue is downloaded **only when a BOM needs it** — Generate, Recalculate, reopening a project — and only if the fingerprint changed since the last download | on demand |
| Sheet → app | If the sheet changes while a BOM is open, the BOM is rebuilt automatically with the new parts/prices | automatic |
| App → sheet | Saving a project writes it to the private **`_Projects`** tab and its BOM lines to **`_BOM`** | on Save |
| Sheet → app | Every device with the sync key pulls projects from `_Projects` (newest edit wins, deletions propagate) | on start-up, on focus, every 2 min |

The app never lists the component catalogue — you maintain components in Google Sheets. The dashboard only shows how many parts each category has.

## What you need to provide

| Item | Where it goes | Required? |
|---|---|---|
| Apps Script **Web App URL** (`https://script.google.com/macros/s/…/exec`) | `assets/js/config.js` → `APPS_SCRIPT_URL` (or Settings in the app) | Yes, for Google Sheets |
| Google Sheet **edit link** | `config.js` → `GOOGLE_SHEET_URL` | Optional (enables "Open Google Sheet") |
| **Sync key** (12+ chars) | Apps Script → Project Settings → Script properties → `ADMIN_KEY`. Enter the same value in Settings → Project & BOM sync (tick "Remember on this device" on trusted devices). **Never** put it in `config.js`. | For project/BOM sync |
| Company name, GSTIN, address, terms | Settings → Company & quotation details | Optional |

## Repository layout

```
index.html                    app shell (strict Content-Security-Policy, no inline scripts)
assets/css/tinkerer.css       glassmorphism UI + print stylesheet
assets/js/config.js           ← your deployment configuration
assets/js/core/               engine (also runs in Node for tests)
  schema.js                   category & column definitions (25 categories + Fuel Engines + Thrust Tables)
  catalogue.js                header matching, validation, normalisation, export shaping, v1 migration
  sizing.js                   multirotor / fixed-wing / VTOL / hybrid models + editable assumptions
  matcher.js                  compatibility engine, joint propulsion search, statuses, report
  boq.js                      quantities, GST (inclusive/exclusive), extras, budget variance
assets/js/services/           storage, Google Sheets / Excel data sources, Excel/PDF/print exports
assets/js/ui/                 dashboard, configuration form, BOM report, projects, settings
assets/js/services/sync.js    automatic project/BOM sync with the _Projects and _BOM tabs
apps-script/Code.gs           Google Apps Script API (public read-only fingerprint + catalogue; key-protected project/BOM sync)
templates/                    blank component master workbook
samples/                      TEST catalogue (fictitious, flagged in the UI — never loaded automatically)
vendor/                       SheetJS, jsPDF, jsPDF-AutoTable (self-hosted, no CDN dependency)
tools/                        tests and the template/Code.gs generator
docs/AUDIT.md                 audit of Tinkerer 1.x
```

## Setup

### 1. Create the Google Sheet
1. Create a new Google Sheet, e.g. "Tinkerer Component Master".
2. Either **import** `templates/Tinkerer_Component_Master_Template.xlsx` (File → Import → Replace spreadsheet), or let the script create the tabs in step 2.

### 2. Set up the component master sheet and Apps Script API
1. In the sheet: **Extensions → Apps Script**.
2. Replace the default code with `apps-script/Code.gs`. In Project Settings tick "Show appsscript.json" and replace it with `apps-script/appsscript.json`.
3. Select `setupTinkererSheet` in the toolbar and **Run** (authorise when asked). It creates `_README` plus one tab per category with headers and a Stock Status dropdown; existing tabs are untouched.
4. Project Settings → Script properties → add `ADMIN_KEY` = a long random string (your **sync key** for projects/BOMs).
5. **Deploy → New deployment → Web app**: *Execute as* **Me**, *Who has access* **Anyone**. Copy the URL ending in `/exec`.
6. Open the URL in a browser — you should see JSON starting `{"ok":true,"app":"Tinkerer"…`. Add `?action=version` to see the small fingerprint the app polls.

Sheet rules (also in the `_README` tab):
- One row per component; **Component ID** must be unique across the workbook — saved projects refer to it.
- **Price (INR)** is per pack; **Weight (g)** is per single unit; **Units per Pack** = 2 for propeller pairs.
- Voltage limits are cell counts (`Min Cells (S)` / `Max Cells (S)`, or one `Voltage Compatibility` column like `4-6S`).
- `Stock Status = Discontinued` keeps history but the item is never auto-selected.
- Add a tab to create a category; unknown columns are shown as extra specs.
- Tabs/columns starting with `_` (e.g. `_Cost Price`) are never published.
- Optional **Thrust Tables** tab (Motor ID, Prop Diameter, Prop Pitch, Cells, Throttle %, Thrust g, Current A, Power W, Source). When rows exist for the selected motor + prop + cell count, hover power, peak current and max thrust come from them instead of generic estimates. Put "Flight test" in Source only for genuinely flight-tested combinations.

### 3. Connect the application
Put the Web App URL in `assets/js/config.js` (`APPS_SCRIPT_URL`) and commit, **or** paste it into Settings → Google Sheet connection → *Test connection* → *Save & sync*. Then enter your sync key under *Project & BOM sync*. The header pill shows the sheet status, part count and last check; the ↻ button syncs immediately.

### 4. Configure GitHub Pages
1. Create a repository and push the contents of this folder to the default branch (keep `.nojekyll`).
2. Repository **Settings → Pages → Build and deployment → Deploy from a branch → main / (root)**.
3. Open `https://<user>.github.io/<repo>/`.

### 5. Updating later
- **Components / prices / vendors**: edit the Google Sheet. Tinkerer notices within a minute (or when you switch back to it) and any open BOM updates itself. No redeploy needed.
- **Application code**: edit files and push; GitHub Pages republishes in about a minute.
- **Apps Script code**: edit, then Deploy → Manage deployments → ✏️ → Version: *New version* → Deploy. The URL stays the same.
- **New columns/categories in `schema.js`**: run `npm i xlsx && node tools/build-assets.js` to regenerate the template and the header list in `Code.gs`.

### Migrating from Tinkerer 1.x
Settings → Data tools → **Migrate** reads your old Firebase `/components` once and downloads it as a Tinkerer 2.0 workbook (prices copied as-is — the old app displayed `$`, so check currency). Then **lock the old database**: Firebase console → Realtime Database → Rules → `".read": false, ".write": false`. It currently allows public writes and holds customer requirement history (`/inputHistory`).

## Security model
- The public `doGet` API only **reads** the catalogue and its fingerprint. Projects and BOMs (customer data) go through `doPost`, which requires `ADMIN_KEY`; the key is compared server-side using hashes, failed attempts lock out for 10 minutes, and text is stored so Sheets cannot evaluate it as a formula. `_Projects` and `_BOM` start with `_`, so the public API never returns them.
- The sync key is kept in `sessionStorage` (cleared when the tab closes) unless you tick "Remember on this device", which stores it in that browser's `localStorage` so sync runs automatically — only do that on devices you control.
- **What becomes public:** anyone with the Web App URL (visible in your GitHub Pages source) can read every visible tab and column except those starting with `_`. With the *published-sheet* fallback (Sheet ID mode), the **entire** spreadsheet — every tab, hidden and `_` columns — is readable by anyone with the ID. Prefer the Apps Script mode and keep internal costs in `_` columns.
- No credentials, service-account keys or passwords are in the frontend. Settings, the draft and a cache of the last catalogue download live in `localStorage`; projects are mirrored to the sheet when sync is on (JSON export is still available).
- All user/sheet data is HTML-escaped; links must be `http(s)`; exported spreadsheet text cells are formula-injection safe; a CSP blocks inline and third-party scripts.

## Engineering model (summary)
- **Multirotor** — the Drone_Calculations.xlsx chain from 1.x (ideal hover power `T^1.5/√(2ρA)`, ÷ FM·η, +15 % margin, +20 % landing reserve, 175 Wh/kg pre-sizing, climb/transit/payload/take-off-landing profile) extended with ISA density, momentum-theory climb and forward-flight power, wind-driven T/W, coaxial penalty and thrust tables.
- **Fixed wing** — drag polar from frame wing area/span (or assumed L/D), stall-margin check, pitch-speed check.
- **VTOL (quadplane)** — separate lift and cruise systems; hover time for take-off/transitions/landing, wing-borne cruise with stopped-rotor drag penalty.
- **Hybrid VTOL** — electric lift from the battery, fuel cruise sized from BSFC; engine power checked against climb power.
- The battery's own mass is inside the weight loop for every candidate battery; a parametric pre-sizing detects the battery mass spiral.
- *Theoretical endurance* (100 % capacity, no reserve/margin) is shown separately from *estimated mission endurance* (usable energy after reserve, DoD and derate ÷ mission-average power). Neither is a guarantee.
- Every assumption is editable per project (Configuration → Advanced settings) and globally (Settings).

## Testing
```
node tools/test-engine.js         # 30 engine scenarios: brief example, missing parts, thrust shortfall, battery limit, budget overrun, FW/VTOL/hybrid, empty DB, validation/XSS
node tools/test-apps-script.js    # Code.gs against a mock Apps Script runtime (incl. fingerprint and project/BOM sync)
python3 -m http.server 8765 & python3 tools/test-browser.py   # Playwright end-to-end with a simulated Apps Script: on-demand fetch, sheet edit → BOM auto-update, two-device sync, mobile
```
Use Settings → Data tools → **Load TEST catalogue** to try every feature before your own sheet is ready (it switches that browser to an offline catalogue); a banner and "DRAFT" export watermark make sure test data is never quoted.
