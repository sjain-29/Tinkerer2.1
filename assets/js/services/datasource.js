/* Tinkerer — Google Sheets catalogue, fetched on demand.
 *
 * The app never shows or preloads the component list. It only:
 *   - polls a tiny "version" fingerprint (+ row counts) in the background, and
 *   - downloads the full catalogue when a BOM is generated / recalculated /
 *     reopened, re-using the cached copy if the fingerprint is unchanged.
 * When the fingerprint changes while a BOM is open, listeners get a
 * 'sheetChanged' event and the BOM is rebuilt from the latest sheet.
 *
 * Sources: appsScript (recommended) · publishedSheet (gviz CSV) · local (Excel / TEST data)
 */
(function (root) {
  'use strict';
  const TK = (root.TK = root.TK || {});
  const listeners = [];
  const state = {
    status: 'idle', message: '', source: null, test: false,
    remote: null, // {version, counts, total, spreadsheet, checkedAt}
    catalogue: null, catalogueVersion: null, lastFetch: null, lastCheck: null, sheetName: '',
  };

  function emit(evt) {
    listeners.forEach((fn) => {
      try { fn(state, evt || 'state'); } catch (e) { console.error(e); }
    });
  }
  function on(fn) { listeners.push(fn); }
  function set(p, evt) { Object.assign(state, p); emit(evt); }

  function validAppsScriptUrl(u) {
    try {
      const x = new URL(u);
      return x.protocol === 'https:' && /(^|\.)script\.google(usercontent)?\.com$/.test(x.hostname);
    } catch (e) { return false; }
  }

  async function fetchText(url, opts, ms) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), ms || 30000) : null;
    try {
      const res = await fetch(url, Object.assign({ redirect: 'follow', cache: 'no-store', signal: ctl && ctl.signal }, opts || {}));
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url, location.href).hostname}`);
      return await res.text();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('The request timed out — check your connection and try again.');
      if (e instanceof TypeError) throw new Error('Network error, or the server blocked the request (check the URL and that the web app is shared with "Anyone").');
      throw e;
    } finally { if (t) clearTimeout(t); }
  }
  function parseJson(txt) {
    try { return JSON.parse(txt); } catch (e) {
      throw new Error(/<html|<!doctype/i.test(txt) ? 'The URL returned a web page instead of data — redeploy the web app with access "Anyone" and use the URL ending in /exec.' : 'The API returned invalid data.');
    }
  }
  async function appsScriptGet(url, action) {
    if (!validAppsScriptUrl(url)) throw new Error('The Apps Script URL must be an https://script.google.com/macros/s/…/exec link.');
    const data = parseJson(await fetchText(url + (url.indexOf('?') === -1 ? '?' : '&') + 'action=' + action + '&_=' + Date.now()));
    if (!data || data.ok === false) throw new Error((data && data.error) || 'The API reported an error.');
    return data;
  }
  async function fetchAppsScript(url) {
    const d = await appsScriptGet(url, 'catalogue');
    if (!Array.isArray(d.sheets)) throw new Error('Unexpected response — is this the Tinkerer Apps Script?');
    return { sheets: d.sheets, name: d.spreadsheet || '', version: d.version || null };
  }

  function csvToSheet(name, txt) {
    const wb = root.XLSX.read(txt, { type: 'string', raw: true });
    const aoa = root.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
    return { name, headers: (aoa[0] || []).map(String), rows: aoa.slice(1) };
  }
  async function fetchPublished(id, extraTabs) {
    if (!/^[A-Za-z0-9_-]{25,}$/.test(id || '')) throw new Error('Enter the Google Sheet ID (the long code between /d/ and /edit in the sheet URL).');
    const base = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=1`;
    const first = await fetchText(base);
    if (/<html/i.test(first.slice(0, 200))) throw new Error('The sheet is not shared publicly ("Anyone with the link — Viewer").');
    const tabs = TK.schema.CATEGORIES.map((c) => c.label).concat([TK.schema.THRUST_TABLE.label]).concat(TK.util.toList(extraTabs));
    const out = [];
    let firstUsedBy = null;
    const firstSheet = csvToSheet('?', first);
    await Promise.all(tabs.map(async (tab) => {
      try {
        const txt = await fetchText(base + '&sheet=' + encodeURIComponent(tab));
        if (txt === first) {
          // gviz returns the FIRST tab for unknown names; accept only for the best header match.
          const cat = TK.schema.CATEGORIES.find((c) => c.label === tab);
          const want = cat ? TK.schema.templateHeaders(cat).map(TK.util.norm) : [];
          const score = firstSheet.headers.map(TK.util.norm).filter((h) => want.indexOf(h) !== -1 && h !== 'componentid' && h !== 'componentname').length;
          if (score >= 3 && (!firstUsedBy || score > firstUsedBy.score)) firstUsedBy = { tab, score };
          return;
        }
        out.push(csvToSheet(tab, txt));
      } catch (e) { /* tab missing */ }
    }));
    if (firstUsedBy) out.push(csvToSheet(firstUsedBy.tab, first));
    return { sheets: out, name: '', version: hash(JSON.stringify(out)) };
  }

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }

  function parseWorkbook(buf, filename) {
    const wb = root.XLSX.read(buf, { type: 'array', cellDates: true });
    const sheets = [];
    wb.SheetNames.forEach((n) => {
      const aoa = root.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: true });
      const hi = aoa.findIndex((r) => r.filter((v) => String(v).trim() !== '').length >= 2);
      if (hi === -1) return;
      let name = n;
      if (/\.csv$/i.test(filename || '') && wb.SheetNames.length === 1) name = filename.replace(/\.csv$/i, '');
      sheets.push({ name, headers: aoa[hi].map((h) => String(h).trim()), rows: aoa.slice(hi + 1) });
    });
    return sheets;
  }

  function countsFromSheets(sheets) {
    const counts = {};
    let total = 0;
    (sheets || []).forEach((s) => {
      if (/^_/.test(s.name) || /thrust/i.test(s.name)) return;
      const n = (s.rows || []).filter((r) => r.some((v) => String(v).trim() !== '')).length;
      counts[s.name] = n;
      total += n;
    });
    return { counts, total };
  }
  function cacheKey(s) {
    return s.source + '|' + (s.source === 'appsScript' ? s.appsScriptUrl : s.source === 'publishedSheet' ? s.sheetId : 'local');
  }

  /** Light background check: no component data downloaded (Apps Script mode). */
  async function check() {
    const s = TK.store.settings();
    const busy = state.status === 'checking' || state.status === 'loading';
    if (busy) return state;
    if (s.source === 'local') {
      const lc = TK.store.localCatalogue();
      if (!lc || !lc.sheets) return set({ status: 'unconfigured', source: 'local', remote: null, test: false, message: 'Not connected. Add your Apps Script URL in Settings (or load the TEST catalogue).' }), state;
      const c = countsFromSheets(lc.sheets);
      const v = hash(lc.savedAt + c.total);
      set({ status: 'ok', source: 'local', remote: { version: v, counts: c.counts, total: c.total, spreadsheet: lc.name, checkedAt: new Date().toISOString() }, sheetName: lc.name || '', test: !!lc.test, lastCheck: new Date().toISOString(), message: '' });
      return state;
    }
    if (s.source === 'appsScript' && !s.appsScriptUrl) return set({ status: 'unconfigured', source: s.source, remote: null, test: false, message: 'Add your Apps Script Web App URL in Settings to connect your Google Sheet.' }), state;
    if (s.source === 'publishedSheet') {
      // no cheap fingerprint endpoint: treat as connected; data is read on demand
      return set({ status: s.sheetId ? 'ok' : 'unconfigured', source: s.source, test: false, lastCheck: new Date().toISOString(), message: s.sheetId ? '' : 'Add the Google Sheet ID in Settings.' }), state;
    }
    set({ status: 'checking', source: s.source, test: false });
    try {
      const v = await appsScriptGet(s.appsScriptUrl, 'version');
      v.total = Object.keys(v.counts || {}).filter((k) => !/thrust/i.test(k)).reduce((t, k) => t + (v.counts[k] || 0), 0);
      const changed = state.catalogueVersion && v.version !== state.catalogueVersion;
      set({ status: v.total ? (changed ? 'changed' : 'ok') : 'empty', remote: { version: v.version, counts: v.counts || {}, total: v.total || 0, spreadsheet: v.spreadsheet || '', checkedAt: v.checkedAt }, sheetName: v.spreadsheet || '', lastCheck: new Date().toISOString(), message: v.total ? '' : 'Connected, but the sheet has no components yet.' }, changed ? 'sheetChanged' : 'state');
    } catch (e) {
      set({ status: 'error', message: e.message, lastCheck: new Date().toISOString() });
    }
    return state;
  }

  /**
   * Make sure the latest catalogue is in memory and return it. Called when a
   * BOM is generated, recalculated or reopened. Downloads only if the sheet's
   * fingerprint differs from the cached copy.
   */
  let inflight = null;
  function ensureCatalogue(opts) {
    if (inflight) return inflight;
    inflight = ensureInner(opts || {}).finally(() => { inflight = null; });
    return inflight;
  }
  async function ensureInner(opts) {
    const s = TK.store.settings();
    const key = cacheKey(s);
    if (s.source === 'local') {
      const lc = TK.store.localCatalogue();
      if (!lc || !lc.sheets) throw new Error('No component database connected. Add your Apps Script URL in Settings.');
      const v = hash(lc.savedAt + JSON.stringify(countsFromSheets(lc.sheets)));
      if (!state.catalogue || state.catalogueVersion !== v || opts.force) {
        set({ catalogue: TK.catalogue.build(lc.sheets, { source: 'local', name: lc.name, fetchedAt: lc.savedAt }), catalogueVersion: v, lastFetch: lc.savedAt, test: !!lc.test }, 'catalogue');
      }
      return state.catalogue;
    }
    if (s.source === 'appsScript') {
      if (!s.appsScriptUrl) throw new Error('No Google Sheet connected. Add your Apps Script Web App URL in Settings.');
      await check();
      const remoteV = state.remote && state.remote.version;
      if (!opts.force && state.catalogue && remoteV && state.catalogueVersion === remoteV) return state.catalogue;
      const c = TK.store.cache();
      if (!opts.force && c && c.key === key && remoteV && c.version === remoteV && c.sheets) {
        set({ catalogue: TK.catalogue.build(c.sheets, { source: s.source, fetchedAt: c.fetchedAt, name: c.name }), catalogueVersion: c.version, lastFetch: c.fetchedAt, status: 'ok' }, 'catalogue');
        return state.catalogue;
      }
      if (state.status === 'error') return offlineFallback(key, state.message);
    }
    set({ status: 'loading', message: 'Fetching components from Google Sheets…' });
    try {
      const res = s.source === 'appsScript' ? await fetchAppsScript(s.appsScriptUrl) : await fetchPublished(s.sheetId, s.extraTabs);
      const now = new Date().toISOString();
      const cat = TK.catalogue.build(res.sheets, { source: s.source, fetchedAt: now, name: res.name });
      TK.store.saveCache({ key, version: res.version, sheets: res.sheets, fetchedAt: now, name: res.name });
      const cnt = countsFromSheets(res.sheets);
      set({ status: cat.items.length ? 'ok' : 'empty', catalogue: cat, catalogueVersion: res.version, lastFetch: now, sheetName: res.name, message: cat.items.length ? '' : 'The sheet has no components yet.',
        remote: Object.assign({}, state.remote || {}, { version: res.version, counts: cnt.counts, total: cnt.total, spreadsheet: res.name, checkedAt: now }) }, 'catalogue');
      return cat;
    } catch (e) {
      return offlineFallback(key, e.message);
    }
  }
  function offlineFallback(key, msg) {
    const c = TK.store.cache();
    if (c && c.key === key && c.sheets) {
      set({ status: 'offline', catalogue: TK.catalogue.build(c.sheets, { fetchedAt: c.fetchedAt, name: c.name, cached: true }), catalogueVersion: c.version, lastFetch: c.fetchedAt, message: `Google Sheet unreachable — using the copy from ${new Date(c.fetchedAt).toLocaleString('en-IN')}. ${msg}` }, 'catalogue');
      return state.catalogue;
    }
    set({ status: 'error', message: msg });
    throw new Error(msg);
  }

  // ------------------------------------------------------------------ automatic background sync
  let timer = null;
  function startAutoSync() {
    stopAutoSync();
    const sec = Number(TK.store.settings().autoSyncSec);
    if (sec > 0) timer = setInterval(() => { if (!document.hidden) check(); }, Math.max(15, sec) * 1000);
  }
  function stopAutoSync() { if (timer) clearInterval(timer); timer = null; }
  let lastFocus = 0;
  function onFocus() {
    if (document.hidden || Date.now() - lastFocus < 10000) return;
    lastFocus = Date.now();
    check();
    if (TK.sync) TK.sync.pull();
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', () => { lastFocus = 0; onFocus(); });
  }

  async function adminPost(payload, timeoutMs) {
    const s = TK.store.settings();
    if (s.source !== 'appsScript' || !s.appsScriptUrl) throw new Error('Sync with Google Sheets needs the Apps Script connection.');
    const key = TK.store.adminKey();
    if (!key) throw new Error('Enter your sync key in Settings first.');
    const data = parseJson(await fetchText(s.appsScriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ key }, payload)) }, timeoutMs || 60000));
    if (!data.ok) throw new Error(data.error || 'The Apps Script rejected the request.');
    return data;
  }
  function canAdmin() {
    const s = TK.store.settings();
    return s.source === 'appsScript' && !!s.appsScriptUrl && !!TK.store.adminKey();
  }

  TK.data = { state, on, check, ensureCatalogue, startAutoSync, stopAutoSync, fetchAppsScript, fetchPublished, parseWorkbook, adminPost, canAdmin, validAppsScriptUrl, fetchText, appsScriptGet };
})(typeof window !== 'undefined' ? window : globalThis);
