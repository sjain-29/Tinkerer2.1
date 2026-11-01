/* Tinkerer — local persistence (settings, projects, draft, catalogue cache).
 * Everything lives in this browser's localStorage; the admin key lives only
 * in sessionStorage (cleared when the tab closes).
 */
(function (root) {
  'use strict';
  const TK = (root.TK = root.TK || {});
  const K = { settings: 'tk2.settings', projects: 'tk2.projects', draft: 'tk2.draft', cache: 'tk2.catalogueCache', local: 'tk2.localCatalogue', admin: 'tk2.adminKey', tomb: 'tk2.deletedProjects' };

  function get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage write failed', key, e);
      if (TK.ui && TK.ui.toast) TK.ui.toast('Browser storage is full or blocked — export a backup (Saved Projects → Export).', 'error');
      return false;
    }
  }
  function del(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  const CFG = root.TINKERER_CONFIG || {};
  function defaultSettings() {
    return {
      source: CFG.APPS_SCRIPT_URL ? 'appsScript' : CFG.PUBLISHED_SHEET_ID ? 'publishedSheet' : 'local',
      appsScriptUrl: CFG.APPS_SCRIPT_URL || '',
      sheetId: CFG.PUBLISHED_SHEET_ID || '',
      sheetUrl: CFG.GOOGLE_SHEET_URL || '',
      extraTabs: '',
      defaultGst: CFG.DEFAULT_GST_PERCENT || 18,
      company: { name: CFG.COMPANY_NAME || '', address: '', gstin: '', email: '', phone: '', terms: 'Prices in INR. Quotation valid for 15 days. Delivery timelines subject to component availability. Endurance figures are engineering estimates and are confirmed after flight testing.', validityDays: 15 },
      assumptions: {},
      quotePrefix: 'TNK',
      autoSyncSec: 60,
    };
  }
  function settings() {
    const s = get(K.settings, null);
    const d = defaultSettings();
    if (!s) return d;
    const out = Object.assign(d, s);
    out.company = Object.assign(defaultSettings().company, s.company || {});
    // a committed config.js URL wins when the user never set one
    if (!out.appsScriptUrl && CFG.APPS_SCRIPT_URL) out.appsScriptUrl = CFG.APPS_SCRIPT_URL;
    if (!out.sheetUrl && CFG.GOOGLE_SHEET_URL) out.sheetUrl = CFG.GOOGLE_SHEET_URL;
    return out;
  }
  function saveSettings(s) {
    return set(K.settings, s);
  }

  function projects() {
    return get(K.projects, {});
  }
  function saveProject(p) {
    const all = projects();
    p.updatedAt = new Date().toISOString();
    if (!p.createdAt) p.createdAt = p.updatedAt;
    all[p.id] = p;
    return set(K.projects, all);
  }
  function deleteProject(id) {
    const all = projects();
    delete all[id];
    return set(K.projects, all);
  }
  function importProjects(obj) {
    const all = projects();
    let n = 0;
    Object.values(obj || {}).forEach((p) => {
      if (p && p.id && p.req) {
        all[p.id] = p;
        n++;
      }
    });
    set(K.projects, all);
    return n;
  }

  TK.store = {
    K, get, set, del, settings, saveSettings, defaultSettings, projects, saveProject, deleteProject, importProjects,
    draft: () => get(K.draft, null), saveDraft: (d) => set(K.draft, d), clearDraft: () => del(K.draft),
    cache: () => get(K.cache, null), saveCache: (c) => set(K.cache, c),
    localCatalogue: () => get(K.local, null), saveLocalCatalogue: (c) => set(K.local, c),
    // Sync key: session-only by default; "remember on this device" keeps it in localStorage so sync runs automatically.
    adminKey: () => { try { return sessionStorage.getItem(K.admin) || localStorage.getItem(K.admin) || ''; } catch (e) { return ''; } },
    adminKeyRemembered: () => { try { return !!localStorage.getItem(K.admin); } catch (e) { return false; } },
    setAdminKey: (k, remember) => {
      try {
        sessionStorage.removeItem(K.admin);
        localStorage.removeItem(K.admin);
        if (k) (remember ? localStorage : sessionStorage).setItem(K.admin, k);
      } catch (e) { /* ignore */ }
    },
    tombstones: () => get(K.tomb, []), setTombstones: (t) => set(K.tomb, t),
  };
})(typeof window !== 'undefined' ? window : globalThis);
