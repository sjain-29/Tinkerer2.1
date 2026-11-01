/* Tinkerer — automatic project & BOM sync with Google Sheets.
 * Saved projects live in the private "_Projects" tab and their BOM lines in
 * "_BOM" (never published by the read API). Every device that has the sync
 * key pulls on start-up, on focus and periodically; saving pushes immediately.
 * Conflicts: newest updatedAt wins. Deletions are remembered until the sheet
 * confirms them.
 */
(function (root) {
  'use strict';
  const TK = (root.TK = root.TK || {});
  const S = () => TK.store;
  const listeners = [];
  const state = { status: 'off', message: '', lastSync: null };
  const emit = () => listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } });
  const set = (p) => { Object.assign(state, p); emit(); };

  function enabled() {
    return TK.data.canAdmin();
  }
  function raw() {
    return S().get(S().K.projects, {});
  }
  function putRaw(all) {
    return S().set(S().K.projects, all);
  }
  function slim(p) {
    const o = JSON.parse(JSON.stringify(p));
    delete o.syncedAt;
    return o;
  }
  function summaryOf(p) {
    const ls = p.lastSummary || {};
    return { configuration: [p.req.aircraftClass, p.req.configuration].filter(Boolean).join(' · '), feasibility: ls.feasibility || '', grandTotal: ls.grandTotal || '', mtow: ls.mtow ? Math.round(ls.mtow * 100) / 100 : '' };
  }

  async function push(p, bomLines) {
    if (!enabled()) { set({ status: 'off' }); return false; }
    set({ status: 'syncing' });
    try {
      const bom = bomLines ? bomLines.filter((L) => !L.unresolved).map((L) => ({ sr: L.sr, category: L.category, name: L.name, itemId: L.itemId, manufacturer: L.manufacturer, model: L.model, qty: L.qty, unitPrice: L.unitPrice, gstPct: L.gstPct, total: L.total, vendor: L.vendor, url: L.url, status: TK.matcher.ST_LABEL[L.status] || L.status })) : undefined;
      await TK.data.adminPost({ action: 'projectSave', project: slim(p), summary: summaryOf(p), bom });
      const all = raw();
      if (all[p.id]) {
        all[p.id].syncedAt = all[p.id].updatedAt;
        putRaw(all);
      }
      set({ status: 'ok', lastSync: new Date().toISOString(), message: '' });
      return true;
    } catch (e) {
      set({ status: 'error', message: e.message });
      return false;
    }
  }

  async function remove(id) {
    const tomb = S().tombstones();
    if (tomb.indexOf(id) === -1) tomb.push(id);
    S().setTombstones(tomb);
    if (!enabled()) return false;
    try {
      await TK.data.adminPost({ action: 'projectDelete', id });
      S().setTombstones(S().tombstones().filter((x) => x !== id));
      return true;
    } catch (e) {
      set({ status: 'error', message: e.message });
      return false;
    }
  }

  let pulling = null;
  function pull() {
    if (!enabled()) { set({ status: 'off' }); return Promise.resolve(false); }
    if (pulling) return pulling;
    pulling = (async () => {
      set({ status: 'syncing' });
      try {
        for (const id of S().tombstones()) {
          await TK.data.adminPost({ action: 'projectDelete', id });
          S().setTombstones(S().tombstones().filter((x) => x !== id));
        }
        const res = await TK.data.adminPost({ action: 'projectsList' }, 30000);
        const remote = {};
        (res.projects || []).forEach((p) => { if (p && p.id) remote[p.id] = p; });
        const local = raw();
        const toPush = [];
        let changed = 0;
        Object.keys(remote).forEach((id) => {
          const r = remote[id], l = local[id];
          if (!l || (r.updatedAt || '') > (l.updatedAt || '')) {
            local[id] = Object.assign(r, { syncedAt: r.updatedAt });
            changed++;
          } else if ((l.updatedAt || '') > (r.updatedAt || '')) toPush.push(l);
          else if (l.syncedAt !== l.updatedAt) { l.syncedAt = l.updatedAt; }
        });
        Object.keys(local).forEach((id) => {
          if (remote[id]) return;
          if (local[id].syncedAt) { delete local[id]; changed++; } // deleted on another device
          else toPush.push(local[id]);
        });
        putRaw(local);
        for (const p of toPush) await push(p);
        set({ status: 'ok', lastSync: new Date().toISOString(), message: '', changed });
        return changed > 0;
      } catch (e) {
        set({ status: 'error', message: e.message });
        return false;
      } finally {
        pulling = null;
      }
    })();
    return pulling;
  }

  let timer = null;
  function start() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) pull(); }, 120000);
  }

  TK.sync = { state, on: (fn) => listeners.push(fn), enabled, push, pull, remove, start };
})(typeof window !== 'undefined' ? window : globalThis);
