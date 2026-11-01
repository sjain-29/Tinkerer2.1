/**
 * Tinkerer — Google Apps Script API for the component master sheet.
 *
 *  GET  …/exec?action=version     → tiny change fingerprint + row counts (polled by the app)
 *  GET  …/exec?action=catalogue   → read-only JSON of every tab (fetched only when a BOM is built)
 *  GET  …/exec?action=ping        → health check
 *  POST …/exec  (text/plain JSON) → admin writes, only with the ADMIN_KEY
 *        { action:'upsert', key, sheet, record:{Header: value, …} }
 *        { action:'bulkUpsert', key, sheet, records:[…] }
 *        { action:'delete', key, sheet, id }
 *        { action:'verifyKey', key }
 *        { action:'projectsList', key }                      → saved projects (private "_Projects" tab)
 *        { action:'projectSave', key, project, summary, bom } → upsert project + replace its rows in "_BOM"
 *        { action:'projectDelete', key, id }
 *
 * Privacy rules:
 *  - Tabs whose name starts with "_" are never published.
 *  - Columns whose header starts with "_" (e.g. "_Cost Price", "_Internal Notes")
 *    are never published.
 *  - Admin writes are disabled until you set the script property ADMIN_KEY
 *    (Project Settings → Script properties). The key is never stored in the
 *    web app; you type it in Tinkerer → Settings for the current browser tab.
 */

const ID_HEADER = 'Component ID';
const UPDATED_HEADER = 'Last Updated';
const MAX_ROWS_PER_SHEET = 5000;

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'catalogue';
  try {
    if (action === 'ping') return json_({ ok: true, app: 'Tinkerer', time: new Date().toISOString() });
    if (action === 'version') return json_(versionInfo_());
    if (action === 'catalogue') return json_(readCatalogue_());
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function readCatalogue_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = [];
  ss.getSheets().forEach(function (sh) {
    const name = sh.getName();
    if (/^_/.test(name) || sh.isSheetHidden()) return;
    const lastRow = Math.min(sh.getLastRow(), MAX_ROWS_PER_SHEET + 1);
    const lastCol = sh.getLastColumn();
    if (lastRow < 1 || lastCol < 1) return;
    const values = sh.getRange(1, 1, lastRow, lastCol).getValues();
    const rawHeaders = values[0].map(function (h) { return String(h).trim(); });
    const keep = [];
    rawHeaders.forEach(function (h, i) { if (h && !/^_/.test(h)) keep.push(i); });
    const headers = keep.map(function (i) { return rawHeaders[i]; });
    const rows = [];
    for (let r = 1; r < values.length; r++) {
      const row = keep.map(function (i) { return clean_(values[r][i]); });
      if (row.some(function (v) { return v !== '' && v !== null; })) rows.push(row);
    }
    sheets.push({ name: name, headers: headers, rows: rows });
  });
  return { ok: true, app: 'Tinkerer', spreadsheet: ss.getName(), generatedAt: new Date().toISOString(), version: version_(sheets), sheets: sheets };
}

/** Short fingerprint of everything the catalogue publishes — changes whenever any cell does. */
function version_(sheets) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(sheets), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('').slice(0, 16);
}

/** Polled by Tinkerer every minute: a few hundred bytes instead of the whole catalogue. */
function versionInfo_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('tk_version');
  if (hit) return JSON.parse(hit);
  const cat = readCatalogue_();
  const counts = {};
  let total = 0;
  cat.sheets.forEach(function (s) { counts[s.name] = s.rows.length; if (!/thrust/i.test(s.name)) total += s.rows.length; });
  const out = { ok: true, app: 'Tinkerer', spreadsheet: cat.spreadsheet, version: cat.version, counts: counts, total: total, checkedAt: new Date().toISOString() };
  cache.put('tk_version', JSON.stringify(out), 20);
  return out;
}

/** Simple trigger: any manual edit invalidates the cached fingerprint immediately. */
function onEdit() {
  try { CacheService.getScriptCache().remove('tk_version'); } catch (err) { /* simple-trigger limits */ }
}

function clean_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  return v === null || v === undefined ? '' : String(v);
}

// ------------------------------------------------------------------ admin writes
function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Invalid JSON' });
  }
  const auth = checkKey_(body.key);
  if (!auth.ok) return json_(auth);
  if (body.action === 'verifyKey') return json_({ ok: true });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, error: 'The sheet is busy — try again.' });
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (/^project/.test(String(body.action))) return json_(projects_(ss, body));
    CacheService.getScriptCache().remove('tk_version');
    const name = String(body.sheet || '');
    if (!name || /^_/.test(name) || name.length > 80) return json_({ ok: false, error: 'Invalid sheet name' });
    let sh = ss.getSheetByName(name);
    if (body.action === 'delete') {
      if (!sh) return json_({ ok: false, error: 'Sheet not found' });
      const row = findRow_(sh, String(body.id || ''));
      if (!row) return json_({ ok: false, error: 'Component ID not found' });
      sh.deleteRow(row);
      return json_({ ok: true, deleted: body.id });
    }
    const records = body.action === 'bulkUpsert' ? body.records : body.action === 'upsert' ? [body.record] : null;
    if (!records || !Array.isArray(records) || !records.length) return json_({ ok: false, error: 'Nothing to write' });
    if (records.length > 1000) return json_({ ok: false, error: 'Max 1000 records per request' });
    if (!sh) {
      if (!body.createSheet || !Array.isArray(body.headers) || !body.headers.length) return json_({ ok: false, error: 'Sheet "' + name + '" does not exist' });
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, body.headers.length).setValues([body.headers.map(String)]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    let added = 0, updated = 0;
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    records.forEach(function (rec) {
      if (!rec || typeof rec !== 'object') return;
      const headers = ensureHeaders_(sh, Object.keys(rec));
      const id = String(rec[ID_HEADER] || '').trim();
      if (!id) throw new Error('Every record needs a "' + ID_HEADER + '"');
      rec[UPDATED_HEADER] = today;
      const row = findRow_(sh, id);
      const target = row || sh.getLastRow() + 1;
      const current = row ? sh.getRange(target, 1, 1, headers.length).getValues()[0] : headers.map(function () { return ''; });
      const out = headers.map(function (h, i) { return Object.prototype.hasOwnProperty.call(rec, h) ? safe_(rec[h]) : current[i]; });
      sh.getRange(target, 1, 1, headers.length).setValues([out]);
      if (row) updated++; else added++;
    });
    return json_({ ok: true, added: added, updated: updated });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------------ project / BOM sync (private tabs)
const PROJECT_SHEET = '_Projects';
const BOM_SHEET = '_BOM';
const PROJECT_HEADERS = ['Project ID', 'Project Name', 'Reference', 'Configuration', 'Feasibility', 'Grand Total (INR)', 'MTOW (kg)', 'Updated At', 'Project JSON'];
const BOM_HEADERS = ['Project ID', 'Project Name', 'Reference', 'Sr. No.', 'Category', 'Component', 'Component ID', 'Manufacturer', 'Model', 'Qty', 'Unit Price (INR)', 'GST %', 'Total (INR)', 'Vendor', 'Product URL', 'Status', 'Saved At'];

function privateSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#e8eef7');
    sh.setFrozenRows(1);
  }
  return sh;
}

function projects_(ss, body) {
  const psh = privateSheet_(ss, PROJECT_SHEET, PROJECT_HEADERS);
  const data = psh.getLastRow() > 1 ? psh.getRange(2, 1, psh.getLastRow() - 1, PROJECT_HEADERS.length).getValues() : [];
  if (body.action === 'projectsList') {
    const list = [];
    data.forEach(function (r) {
      try { list.push(JSON.parse(String(r[8]))); } catch (err) { /* skip damaged row */ }
    });
    return { ok: true, projects: list };
  }
  const id = String((body.project && body.project.id) || body.id || '').trim();
  if (!/^[\w-]{3,80}$/.test(id)) return { ok: false, error: 'Invalid project id' };
  let rowIdx = 0;
  for (let i = 0; i < data.length; i++) if (String(data[i][0]) === id) { rowIdx = i + 2; break; }
  const bsh = privateSheet_(ss, BOM_SHEET, BOM_HEADERS);
  const replaceBom = function (rows) {
    const last = bsh.getLastRow();
    const keep = last > 1 ? bsh.getRange(2, 1, last - 1, BOM_HEADERS.length).getValues().filter(function (r) { return String(r[0]) !== id; }) : [];
    const all = keep.concat(rows || []);
    if (last > 1) bsh.getRange(2, 1, last - 1, BOM_HEADERS.length).clearContent();
    if (all.length) bsh.getRange(2, 1, all.length, BOM_HEADERS.length).setValues(all);
  };
  if (body.action === 'projectDelete') {
    if (rowIdx) psh.deleteRow(rowIdx);
    replaceBom([]);
    return { ok: true, deleted: id };
  }
  if (body.action !== 'projectSave') return { ok: false, error: 'Unknown action' };
  const p = body.project;
  const json = JSON.stringify(p);
  if (json.length > 45000) return { ok: false, error: 'Project too large to store' };
  const sm = body.summary || {};
  const row = [id, safe_(p.req && p.req.projectName), safe_(p.req && p.req.projectRef), safe_(sm.configuration), safe_(sm.feasibility), Number(sm.grandTotal) || '', Number(sm.mtow) || '', safe_(p.updatedAt), json];
  psh.getRange(rowIdx || psh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  if (Array.isArray(body.bom)) {
    const at = new Date().toISOString();
    replaceBom(body.bom.slice(0, 300).map(function (l) {
      return [id, safe_(p.req && p.req.projectName), safe_(p.req && p.req.projectRef), l.sr || '', safe_(l.category), safe_(l.name), safe_(l.itemId), safe_(l.manufacturer), safe_(l.model), Number(l.qty) || 0, l.unitPrice == null ? '' : Number(l.unitPrice), Number(l.gstPct) || 0, Number(l.total) || 0, safe_(l.vendor), safe_(l.url), safe_(l.status), at];
    }));
  }
  return { ok: true, saved: id };
}

function checkKey_(key) {
  const props = PropertiesService.getScriptProperties();
  const expected = props.getProperty('ADMIN_KEY');
  if (!expected || expected.length < 12) return { ok: false, error: 'Sync is disabled. Set a script property ADMIN_KEY (12+ characters) to enable project sync and edits.' };
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('tk_fail') || 0);
  if (fails >= 10) return { ok: false, error: 'Too many failed attempts — locked for 10 minutes.' };
  const a = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(key || ''));
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) {
    cache.put('tk_fail', String(fails + 1), 600);
    return { ok: false, error: 'Invalid admin key' };
  }
  return { ok: true };
}

function findRow_(sh, id) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const col = headers.indexOf(ID_HEADER) + 1;
  if (!col) return 0;
  const ids = sh.getRange(2, col, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === id) return i + 2;
  return 0;
}

function ensureHeaders_(sh, keys) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  keys.forEach(function (k) {
    k = String(k).trim();
    if (k && headers.indexOf(k) === -1 && !/^_/.test(k) && k.length <= 80) {
      headers.push(k);
      sh.getRange(1, headers.length).setValue(k).setFontWeight('bold');
    }
  });
  return headers;
}

/** Store text so Sheets never evaluates it as a formula. */
function safe_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v).slice(0, 2000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------ one-time setup helper
/**
 * Run once from the Apps Script editor (select setupTinkererSheet → Run) to
 * create every category tab with the standard Tinkerer column headers.
 * Existing tabs are left untouched.
 */
function setupTinkererSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let readme = ss.getSheetByName('_README');
  if (!readme) {
    readme = ss.insertSheet('_README', 0);
    readme.getRange(1, 1, 8, 1).setValues([
      ['Tinkerer component master'],
      ['• One tab per category. Row 1 holds the column headers; one component per row.'],
      ['• "Component ID" must be unique across the whole spreadsheet (e.g. MT-6215-180).'],
      ['• Price (INR) is per pack; Weight (g) is per single unit. Units per Pack = 2 for prop pairs.'],
      ['• Stock Status: In Stock / Limited / Out of Stock / On Order / Discontinued.'],
      ['• Tabs or columns starting with "_" are private and never sent to the app (e.g. "_Cost Price").'],
      ['• Keep this _README tab first if you use the "published sheet" connection mode.'],
      ['• Add a new tab to create a new category; unknown columns are shown as extra specifications.'],
    ]);
    readme.getRange(1, 1).setFontWeight('bold').setFontSize(14);
    readme.setColumnWidth(1, 900);
  }
  Object.keys(TINKERER_HEADERS).forEach(function (tab) {
    if (ss.getSheetByName(tab)) return;
    const sh = ss.insertSheet(tab);
    const h = TINKERER_HEADERS[tab];
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#e8eef7');
    sh.setFrozenRows(1);
    sh.setFrozenColumns(2);
    const stockCol = h.indexOf('Stock Status') + 1;
    if (stockCol) {
      const rule = SpreadsheetApp.newDataValidation().requireValueInList(['In Stock', 'Limited', 'Out of Stock', 'On Order', 'Discontinued'], true).setAllowInvalid(true).build();
      sh.getRange(2, stockCol, 999, 1).setDataValidation(rule);
    }
    sh.autoResizeColumns(1, h.length);
  });
  const def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
}

// Generated from assets/js/core/schema.js by tools/build-apps-script.js — do not edit by hand.
const TINKERER_HEADERS = /*HEADERS*/{
  "Frames": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Airframe Class",
    "Configuration",
    "Frame Type",
    "Motor Count",
    "Arms",
    "Cruise Motors",
    "Wheelbase (mm)",
    "Frame Size",
    "Max Propeller (in)",
    "Material",
    "Folding",
    "Max Take-off Weight (kg)",
    "Max Payload (kg)",
    "Wingspan (mm)",
    "Wing Area (m2)",
    "Landing Gear Included",
    "Integrated PDB",
    "Payload Mounting"
  ],
  "Motors": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "KV (rpm/V)",
    "Max Thrust (g)",
    "Max Current (A)",
    "Max Power (W)",
    "Min Cells (S)",
    "Max Cells (S)",
    "Min Prop (in)",
    "Max Prop (in)",
    "Thrust Test Prop (in)",
    "Thrust Test Cells (S)",
    "Recommended Propellers",
    "Role",
    "Motor Dimensions",
    "Mounting Dimensions"
  ],
  "ESCs": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Continuous Current (A)",
    "Burst Current (A)",
    "Min Cells (S)",
    "Max Cells (S)",
    "Motor Channels",
    "Firmware",
    "Protocol"
  ],
  "Propellers": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Diameter (in)",
    "Pitch (in)",
    "Blades",
    "Material",
    "Folding",
    "Motor Compatibility",
    "Role"
  ],
  "Batteries": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Chemistry",
    "Cells (S)",
    "Nominal Voltage (V)",
    "Capacity (mAh)",
    "C-Rating (continuous)",
    "Burst C-Rating",
    "Max Discharge (A)",
    "Energy (Wh)",
    "Dimensions",
    "Connector"
  ],
  "Flight Controllers": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "MCU",
    "Supported Firmware",
    "IMU",
    "IMU Count",
    "UARTs",
    "CAN Ports",
    "PWM Outputs",
    "Power Module Inputs",
    "GPS Compatibility"
  ],
  "GPS Modules": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Constellations",
    "Update Rate (Hz)",
    "Interface",
    "Integrated Compass",
    "Accuracy (m)"
  ],
  "RTK Modules": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Type",
    "Accuracy (cm)",
    "Update Rate (Hz)",
    "Interface",
    "Dual-antenna Heading",
    "Constellations",
    "Correction Link"
  ],
  "Power Distribution Boards": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Max Current (A)",
    "Min Cells (S)",
    "Max Cells (S)",
    "Output Ports",
    "BEC Outputs"
  ],
  "Power Modules": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Max Current (A)",
    "Min Cells (S)",
    "Max Cells (S)",
    "Output Voltage (V)",
    "Interface"
  ],
  "UBECs": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Output Current (A)",
    "Output Voltage (V)",
    "Min Cells (S)",
    "Max Cells (S)"
  ],
  "Cameras": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Camera Type",
    "Sensor Resolution (MP)",
    "Video Resolution",
    "Sensor Size",
    "Optical Zoom (x)",
    "Digital Zoom (x)",
    "Lens Type",
    "Focal Length (mm)",
    "FOV (deg)",
    "Interface",
    "Power (W)",
    "Integrated Gimbal",
    "Gimbal Axes"
  ],
  "Thermal Cameras": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Thermal Resolution",
    "NETD (mK)",
    "Detection Range (m)",
    "Thermal Lens (mm)",
    "Radiometric",
    "Visible Sensor (MP)",
    "Visible Video Resolution",
    "Optical Zoom (x)",
    "FOV (deg)",
    "Interface",
    "Power (W)",
    "Integrated Gimbal",
    "Gimbal Axes"
  ],
  "Multispectral Cameras": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Bands",
    "Wavelengths (nm)",
    "Sensor Resolution (MP)",
    "Interface",
    "Power (W)"
  ],
  "LiDAR": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Range (m)",
    "Point Rate (pts/s)",
    "Accuracy (cm)",
    "FOV (deg)",
    "Interface",
    "Power (W)",
    "Use"
  ],
  "Gimbals": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Axes",
    "Max Payload (g)",
    "Compatible Cameras",
    "Interface",
    "Power (W)"
  ],
  "Transmitters": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Screen Size (in)",
    "Channels",
    "Frequency",
    "Protocol",
    "Control Range (km)",
    "Operating System",
    "Telemetry Support",
    "Integrated Video Link",
    "Video Range (km)",
    "Video Type",
    "Includes Air Unit"
  ],
  "Receivers": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Channels",
    "Protocol",
    "Frequency",
    "Range (km)",
    "Telemetry",
    "Output"
  ],
  "Video Transmitters": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Video Type",
    "System",
    "Range (km)",
    "Frequency",
    "Output Power (mW)",
    "Video Resolution",
    "Latency (ms)"
  ],
  "Telemetry Modules": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Range (km)",
    "Frequency",
    "Protocol",
    "Output Power (mW)",
    "Interface",
    "Air + Ground Kit"
  ],
  "Antennas": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Antenna Type",
    "Use",
    "Frequency",
    "Gain (dBi)",
    "Polarization",
    "Connector"
  ],
  "Landing Gear": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Type",
    "Height (mm)",
    "Retractable",
    "Max Load (kg)"
  ],
  "Servos": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Torque (kg-cm)",
    "Speed (s/60deg)",
    "Voltage (V)",
    "Type",
    "Size Class"
  ],
  "Connectors and Wiring": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Use",
    "Current Rating (A)",
    "Gauge (AWG)",
    "Connector Type",
    "Qty Basis",
    "Qty Multiplier",
    "Auto-include"
  ],
  "Other Accessories": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Accessory Type",
    "Auto-include",
    "Max Cells (S)",
    "Charge Power (W)",
    "Charge Channels",
    "Power (W)",
    "Interface"
  ],
  "Fuel Engines": [
    "Component ID",
    "Component Name",
    "Manufacturer",
    "Model Number",
    "Vendor Name",
    "Vendor Website",
    "Product URL",
    "Price (INR)",
    "GST (%)",
    "Weight (g)",
    "Units per Pack",
    "Stock Status",
    "Last Updated",
    "Remarks",
    "Max Power (W)",
    "BSFC (g/kWh)",
    "Fuel Type",
    "Displacement (cc)",
    "Integrated Generator"
  ],
  "Thrust Tables": [
    "Motor ID",
    "Propeller ID",
    "Prop Diameter (in)",
    "Prop Pitch (in)",
    "Cells (S)",
    "Throttle (%)",
    "Thrust (g)",
    "Current (A)",
    "Power (W)",
    "Source",
    "Test Date"
  ]
}/*END*/;
