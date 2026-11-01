/* Mock-runtime test for apps-script/Code.gs: node tools/test-apps-script.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

function makeSheet(name, data, hidden) {
  return {
    data, name,
    getName: () => name, isSheetHidden: () => !!hidden,
    getLastRow() { return this.data.length; },
    getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); },
    getRange(r, c, nr, nc) {
      const sh = this;
      nr = nr || 1; nc = nc || 1;
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((sh.data[r - 1 + i] || [])[c - 1 + j] ?? ''))),
        setValues(v) { v.forEach((row, i) => row.forEach((val, j) => { while (sh.data.length < r + i) sh.data.push([]); sh.data[r - 1 + i][c - 1 + j] = val; })); return this; },
        setValue(v) { return this.setValues([[v]]); },
        clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (sh.data[r - 1 + i]) sh.data[r - 1 + i][c - 1 + j] = ''; sh.data = sh.data.filter((row, k) => k === 0 || row.some((v) => v !== '' && v !== undefined)); return this; },
        setFontWeight() { return this; }, setBackground() { return this; }, setDataValidation() { return this; }, setFontSize() { return this; },
      };
    },
    deleteRow(r) { this.data.splice(r - 1, 1); },
    setFrozenRows() {}, setFrozenColumns() {}, autoResizeColumns() {}, setColumnWidth() {},
  };
}
const sheets = [
  makeSheet('_README', [['private']]),
  makeSheet('Motors', [['Component ID', 'Component Name', 'Price (INR)', '_Cost Price', 'Last Updated'], ['MT-1', 'Motor one', 1000, 600, new Date('2026-01-02')]]),
  makeSheet('Hidden', [['x']], true),
];
const ss = {
  getName: () => 'Test SS', getSheets: () => sheets,
  getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
  insertSheet(n) { const s = makeSheet(n, []); sheets.push(s); return s; }, deleteSheet() {},
};
const props = { ADMIN_KEY: 'correct-horse-battery' };
const cache = {};
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, newDataValidation: () => ({ requireValueInList() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } }) },
  ContentService: { createTextOutput: (t) => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  Utilities: {
    formatDate: (d) => d.toISOString().slice(0, 10),
    computeDigest: (a, s) => Array.from(require('crypto').createHash(a === 2 ? 'md5' : 'sha256').update(s).digest()).map((b) => (b > 127 ? b - 256 : b)),
    DigestAlgorithm: { SHA_256: 1, MD5: 2 }, Charset: { UTF_8: 'utf8' },
  },
  Session: { getScriptTimeZone: () => 'Asia/Kolkata' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k], put: (k, v) => (cache[k] = v), remove: (k) => delete cache[k] }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const call = (fn, arg) => JSON.parse(ctx[fn](arg).t);
let ok = 0, bad = 0;
const t = (c, m) => (c ? (ok++, console.log('  ✓ ' + m)) : (bad++, console.log('  ✗ ' + m)));

const cat = call('doGet', { parameter: { action: 'catalogue' } });
t(cat.ok && cat.sheets.length === 1, 'publishes only non-private, visible tabs');
t(cat.sheets[0].headers.indexOf('_Cost Price') === -1 && cat.sheets[0].rows[0].length === 4, 'private "_" columns stripped');
t(cat.sheets[0].rows[0][3] === '2026-01-02', 'dates formatted');
t(call('doPost', { postData: { contents: JSON.stringify({ action: 'upsert', key: 'wrong', sheet: 'Motors', record: {} }) } }).ok === false, 'wrong key rejected');
let r = call('doPost', { postData: { contents: JSON.stringify({ action: 'upsert', key: 'correct-horse-battery', sheet: 'Motors', record: { 'Component ID': 'MT-2', 'Component Name': '=IMPORTXML("http://evil")', 'Price (INR)': 5 } }) } });
t(r.ok && r.added === 1, 'upsert adds a row');
t(sheets[1].data[2][1].startsWith("'="), 'formula text neutralised');
r = call('doPost', { postData: { contents: JSON.stringify({ action: 'upsert', key: 'correct-horse-battery', sheet: 'Motors', record: { 'Component ID': 'MT-1', 'Price (INR)': 1200 } }) } });
t(r.updated === 1 && sheets[1].data[1][2] === 1200 && sheets[1].data[1][3] === 600, 'upsert updates by ID and keeps other columns');
r = call('doPost', { postData: { contents: JSON.stringify({ action: 'delete', key: 'correct-horse-battery', sheet: 'Motors', id: 'MT-2' }) } });
t(r.ok && sheets[1].data.length === 2, 'delete removes the row');
t(call('doPost', { postData: { contents: JSON.stringify({ action: 'upsert', key: 'correct-horse-battery', sheet: '_README', record: { 'Component ID': 'x' } }) } }).ok === false, 'private tabs are not writable');
for (let i = 0; i < 9; i++) call('doPost', { postData: { contents: JSON.stringify({ action: 'verifyKey', key: 'nope' }) } });
t(call('doPost', { postData: { contents: JSON.stringify({ action: 'verifyKey', key: 'correct-horse-battery' }) } }).ok === false, 'locks out after 10 failed attempts');
const v1 = call('doGet', { parameter: { action: 'version' } });
t(v1.ok && v1.version && v1.total === 1 && JSON.stringify(v1).length < 400, 'version endpoint is tiny and counts rows: ' + JSON.stringify(v1.counts));
sheets[1].data[1][2] = 1500; ctx.onEdit();
const v2 = call('doGet', { parameter: { action: 'version' } });
t(v2.version !== v1.version, 'editing a cell changes the version fingerprint');
const K = 'correct-horse-battery';
delete cache.tk_fail;
const post = (b) => call('doPost', { postData: { contents: JSON.stringify(Object.assign({ key: K }, b)) } });
r = post({ action: 'projectSave', project: { id: 'prj-1', updatedAt: 'x', req: { projectName: '=Acme', projectRef: 'R1' } }, summary: { feasibility: 'feasible', grandTotal: 100 }, bom: [{ sr: 1, category: 'Motors', name: 'M', qty: 6, unitPrice: 10, total: 70.8, gstPct: 18 }, { sr: 2, category: 'Frames', name: 'F', qty: 1 }] });
t(r.ok && sheets.find((s) => s.name === '_Projects').data.length === 2 && sheets.find((s) => s.name === '_BOM').data.length === 3, 'projectSave writes _Projects row and BOM lines');
t(sheets.find((s) => s.name === '_Projects').data[1][1] === "'=Acme", 'project text is formula-safe');
post({ action: 'projectSave', project: { id: 'prj-2', req: { projectName: 'B' } }, bom: [{ sr: 1, name: 'X', qty: 1 }] });
post({ action: 'projectSave', project: { id: 'prj-1', req: { projectName: 'Acme v2' } }, bom: [{ sr: 1, name: 'M2', qty: 4 }] });
t(sheets.find((s) => s.name === '_BOM').data.length === 3 && sheets.find((s) => s.name === '_Projects').data.length === 3, 're-saving replaces that project\'s BOM rows only');
const lst = post({ action: 'projectsList' });
t(lst.ok && lst.projects.length === 2 && lst.projects[0].req.projectName === 'Acme v2', 'projectsList returns saved projects');
t(call('doPost', { postData: { contents: JSON.stringify({ action: 'projectsList', key: 'nope' }) } }).ok === false, 'projects need the key');
post({ action: 'projectDelete', id: 'prj-1' });
t(post({ action: 'projectsList' }).projects.length === 1 && sheets.find((s) => s.name === '_BOM').data.length === 2, 'projectDelete removes project and its BOM');
t(call('doGet', { parameter: { action: 'catalogue' } }).sheets.every((s) => !/^_/.test(s.name)), 'private _Projects/_BOM tabs never published');
ctx.setupTinkererSheet();
t(sheets.some((s) => s.name === 'Batteries') && sheets.find((s) => s.name === 'Batteries').data[0][0] === 'Component ID', 'setupTinkererSheet creates category tabs');
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
