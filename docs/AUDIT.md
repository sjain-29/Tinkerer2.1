# Tinkerer 1.x — Audit of the existing application

Audited file: `tinkerer (1).html` (single-file app, ~1,100 lines, Firebase Realtime Database over REST).

## 1. What currently works

| Area | Status | Notes |
|---|---|---|
| Schema-driven categories | Works well | One `CATEGORIES` array drives navigation, add forms, tables, bulk parsing and matching. Good foundation — **retained** as the idea behind `assets/js/core/schema.js`. |
| Spreadsheet import | Works | `.xlsx/.xls/.csv` upload with forgiving header normalisation (`normHeader`) and per-category sample templates. **Retained and extended** (aliases, validation, issue reporting). |
| Sizing Report | Works | Faithful replica of `Drone_Calculations.xlsx → Sheet1 (4)`: weight budget → thrust → disk area → ideal hover power `T^1.5/√(2ρA)` → `/(FM·η)` → +15 % margin → energy → +20 % reserve → battery weight by energy density → mission time profile → hover current → C-rating. **Retained** as the core of the multirotor model, with the same default constants. |
| Weight budget auto-fill | Works | Picks flow into the weight budget; wiring/misc allowance as a % of build weight. **Retained** (`Wiring / misc allowance %`). |
| UX touches | Works | Toasts, red "not up to the mark" rows, mobile bottom nav, `T` mark. **Retained** (brand mark, flagged rows, bottom nav). |

## 2. Bugs and engineering weaknesses

### Calculation logic
1. **Two calculation engines disagree.** `computeAll()` (Home) and `computeExcelSheet()` (Sizing Report) use different constants (FM 0.7 vs 0.7×0.8 η, energy density 180 vs 175 Wh/kg, efficiency 0.85 vs 0.80) and different weights (MTOW *target* vs actual build weight), so the two pages show different answers for the same build.
2. **Battery weight is not in the loop.** Requirements are derived from the MTOW you type, not the real build weight; the battery's own weight never feeds back into thrust, power and endurance (the "battery mass spiral" is invisible).
3. **Thrust-to-weight is hard-coded to 2** in the sizing replica (`M6 = 2 × W`), ignoring the T/W assumption field.
4. **C-rating uses hover current**, not peak current. At T/W = 2 the peak current is ≈ 2.8× hover current, so required C-rating is under-estimated by ~3×.
5. **Battery weight check is inverted** (`actual ≥ required` passes a heavier battery and fails a lighter one with enough energy).
6. **Mission time is never compared with available endurance.** The sheet computes the time a mission *needs* but never the time the battery *can deliver*.
7. **3.7 V/cell for every chemistry** (Li-ion, LiHV, semi-solid differ).
8. **Altitude correction applied in one engine only.**

### Matching and BOQ
9. **Build cost counts one unit per category.** A quad's four motors, four ESCs and four props are priced as one each — the total is wrong.
10. **No cross-component compatibility.** Motor cells vs battery cells, ESC current vs motor current, prop vs frame max prop, receiver vs transmitter protocol are not checked. Frame, FC, GPS, receiver, antenna pick "cheapest, review manually".
11. **Propeller "exact" match** accepts any larger prop, including ones that won't fit the frame.
12. **Payload matching inverted for weight and power** (requires `item.weight ≥ max weight`), so lighter cameras are rejected.
13. **Selected camera weight silently overrides the payload weight** you entered.
14. **Always picks the cheapest item** — no performance or balanced mode, no alternatives.
15. **Currency shown as `$`.** No GST, vendor, model, manufacturer or quantity data.

### Data and robustness
16. Every write is fire-and-forget; failures are only logged to the console (silent data loss). When Firebase is unreachable the app runs on an empty, unsaved database.
17. No project save/reopen; the form is lost on refresh. No loading indicators.
18. 18 navigation tabs; one page per category is hard to use on mobile.
19. `maximum-scale=1` blocks pinch-zoom (accessibility).

## 3. Security issues

| Severity | Issue |
|---|---|
| **Critical** | Firebase URL is hard-coded and the app does unauthenticated `PUT/POST/DELETE`. This only works if the Realtime Database rules allow public read **and write** — anyone who opens the page source can overwrite or delete the whole database. **Action: lock the rules now** (`".read": false, ".write": false`) once you have migrated your data (Settings → Migrate legacy Firebase). |
| **High** | Every "Compute" pushes the customer's requirements to `/inputHistory` in that public database — customer data is world-readable. |
| **High** | Stored XSS: `sourceLink` is placed in `href` without a scheme check (`javascript:` links execute), `escAttr` only escapes `"`, and record IDs are interpolated into inline `onclick` handlers. Anyone with write access to the open database can inject script into your browser. |
| Medium | No formula-injection protection on exported spreadsheets. |

## 4. Retain / redesign summary

**Retained:** schema-driven category config; forgiving header import + templates; the Drone_Calculations.xlsx formula chain and its default constants; mission time profile (climb → transit out → payload time → take-off/landing → transit back → descent); wiring/misc allowance %; flagged rows; brand identity (`Tinkerer`, `T` mark).

**Redesigned:** data layer (Google Sheets via a read-only Apps Script API, admin writes behind a server-side key), a single unified calculation engine with the battery inside the weight loop and separate multirotor / fixed-wing / VTOL / hybrid models, a compatibility-based matching engine with statuses, alternatives and overrides, a proper BOQ with quantities, GST and exports, saved projects, and a 6-item navigation with a glassmorphism UI.
