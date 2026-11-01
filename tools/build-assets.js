/* Regenerates derived files from the schema:
 *   apps-script/Code.gs (TINKERER_HEADERS), templates/*.xlsx, samples/*.xlsx + json
 * Usage: node tools/build-assets.js   (needs `npm i xlsx` in tools/ or globally)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let XLSX;
try { XLSX = require('xlsx'); } catch (e) { XLSX = require('/tmp/vend/node_modules/xlsx'); }
['util', 'schema', 'catalogue'].forEach((m) => require(path.join(ROOT, 'assets/js/core', m + '.js')));
const TK = globalThis.TK;
const { toSheets } = require('./sample-data');

// 1) headers into Code.gs
const headers = {};
TK.schema.CATEGORIES.forEach((c) => (headers[c.label] = TK.schema.templateHeaders(c)));
headers[TK.schema.THRUST_TABLE.label] = TK.schema.THRUST_TABLE.fields.map((f) => f.label);
const gsPath = path.join(ROOT, 'apps-script/Code.gs');
let gs = fs.readFileSync(gsPath, 'utf8');
gs = gs.replace(/\/\*HEADERS\*\/[\s\S]*?\/\*END\*\//, '/*HEADERS*/' + JSON.stringify(headers, null, 2) + '/*END*/');
fs.writeFileSync(gsPath, gs);

// 2) workbooks
const README = [
  ['Tinkerer component master — read me'],
  [''],
  ['One tab per category. Row 1 = column headers, one component per row.'],
  ['"Component ID" must be unique across the workbook (e.g. MT-6215-180). Saved projects refer to components by this ID.'],
  ['Price (INR) is per pack (excl. GST unless your projects use GST-inclusive mode). Weight (g) is per single unit. Units per Pack = 2 for propeller pairs.'],
  ['GST (%) is optional — leave blank to use the default GST from Settings.'],
  ['Stock Status: In Stock / Limited / Out of Stock / On Order / Discontinued. Discontinued items are never auto-selected.'],
  ['Booleans (Folding, Integrated Gimbal, Telemetry Support …): Yes / No.'],
  ['Voltage limits use cell counts: Min Cells (S) / Max Cells (S). You can also type a single "Voltage Compatibility" column like 4-6S.'],
  ['Thrust Tables tab (optional): bench or manufacturer data per Motor ID + prop + cell count. When present, Tinkerer uses it instead of generic estimates.'],
  ['Tabs or columns whose name starts with "_" are private: the Apps Script API never publishes them (e.g. "_Cost Price").'],
  ['Add a new tab to create a new category; columns Tinkerer does not recognise are shown as extra specifications.'],
];
function writeBook(file, sheets, readme) {
  const wb = XLSX.utils.book_new();
  if (readme) {
    const ws = XLSX.utils.aoa_to_sheet(README);
    ws['!cols'] = [{ wch: 140 }];
    XLSX.utils.book_append_sheet(wb, ws, '_README');
  }
  sheets.forEach((s) => {
    const ws = XLSX.utils.aoa_to_sheet([s.headers].concat(s.rows.map((r) => r.map(TK.util.safeCell))));
    ws['!cols'] = s.headers.map((h) => ({ wch: Math.max(12, Math.min(40, String(h).length + 2)) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  });
  XLSX.writeFile(wb, file);
}
const empty = TK.catalogue.toSheets(TK.catalogue.build([], {}), { includeEmpty: true });
writeBook(path.join(ROOT, 'templates/Tinkerer_Component_Master_Template.xlsx'), empty, true);
const test = toSheets();
writeBook(path.join(ROOT, 'samples/Tinkerer_TEST_Catalogue.xlsx'), test, true);
fs.writeFileSync(path.join(ROOT, 'samples/test-catalogue.json'), JSON.stringify({ note: 'TEST DATA — fictitious components for trying Tinkerer. Not for quotations.', sheets: test }));
console.log('Code.gs headers:', Object.keys(headers).length, 'tabs; template + TEST catalogue written');
