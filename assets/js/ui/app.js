/* Tinkerer — application shell: state, routing, dashboard, configuration, projects, settings. */
(function (root) {
  'use strict';
  const TK = (root.TK = root.TK || {});
  const U = TK.util, UI = TK.ui, e = U.esc, I = (n, s) => UI.icon(n, s);
  const VERSION = '2.1.0';
  const LEGACY_FIREBASE = 'https://drone-data-4a9c4-default-rtdb.europe-west1.firebasedatabase.app';

  const ROUTES = [
    { id: 'dashboard', label: 'Dashboard', short: 'Home', icon: 'dashboard' },
    { id: 'configure', label: 'New Configuration', short: 'Configure', icon: 'drone' },
    { id: 'report', label: 'Bill of Materials', short: 'BOM', icon: 'report' },
    { id: 'projects', label: 'Saved Projects', short: 'Projects', icon: 'folder' },
    { id: 'settings', label: 'Settings', short: 'Settings', icon: 'settings' },
  ];

  const state = {
    route: 'dashboard', open: {}, project: null, result: null, boq: null, errors: {}, reportTab: 'summary',
    db: { q: '', cat: '', vendor: '', stock: '', sort: 'name', limit: 100 }, projQ: '', lastCatBuilt: null, running: false,
  };

  function newProject() {
    const s = TK.store.settings();
    const n = Object.keys(TK.store.projects()).length + 1;
    const req = TK.form.defaults();
    req.projectRef = `${s.quotePrefix || 'TNK'}-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`;
    return { id: U.uid('prj'), req, overrides: {}, qtyOverrides: {}, removed: {}, extras: [], assumptions: {}, createdAt: new Date().toISOString() };
  }
  const saveDraft = U.debounce(() => {
    if (state.project) TK.store.saveDraft({ project: state.project, savedAt: new Date().toISOString() });
  }, 400);

  function catalogue() {
    return TK.data.state.catalogue || TK.catalogue.emptyCatalogue({});
  }
  function effectiveAssumptions(p) {
    return Object.assign({}, TK.store.settings().assumptions || {}, (p || state.project).assumptions || {});
  }

  // ------------------------------------------------------------------ engine
  function compute(opts) {
    const p = state.project;
    const s = TK.store.settings();
    const res = TK.matcher.run(catalogue(), p.req, { overrides: p.overrides, mode: p.req.selectionMode || 'balanced', assumptions: effectiveAssumptions(p) });
    state.result = res;
    state.boq = TK.boq.build(res, catalogue(), { req: p.req, defaultGst: s.defaultGst, qtyOverrides: p.qtyOverrides, extras: p.extras, gstMode: p.req.gstMode, removed: p.removed });
    p.lastSummary = { feasibility: res.feasibility, grandTotal: state.boq.grandTotal, mtow: res.analysis && res.analysis.mass, generatedAt: res.generatedAt, unresolved: state.boq.unresolvedCount };
    state.lastCatBuilt = catalogue().meta.builtAt;
    saveDraft();
    if (!(opts && opts.silent)) renderRoute();
  }
  function rebuildBoq() {
    const p = state.project;
    if (!state.result) return;
    state.boq = TK.boq.build(state.result, catalogue(), { req: p.req, defaultGst: TK.store.settings().defaultGst, qtyOverrides: p.qtyOverrides, extras: p.extras, gstMode: p.req.gstMode, removed: p.removed });
    p.lastSummary = Object.assign(p.lastSummary || {}, { grandTotal: state.boq.grandTotal });
    saveDraft();
  }
  function runWithLoader(label, fn) {
    UI.loading(true, label);
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          fn();
        } catch (err) {
          console.error(err);
          UI.toast('Calculation failed: ' + err.message, 'error');
        }
        UI.loading(false);
        resolve();
      }, 30);
    });
  }

  /** Fetch the latest catalogue from Google Sheets (only if it changed), then calculate. */
  async function withCatalogue(label, fn, opts) {
    UI.loading(true, 'Fetching the latest components from Google Sheets…');
    try {
      await TK.data.ensureCatalogue(opts);
    } catch (err) {
      UI.loading(false);
      UI.toast(err.message, 'error', 8000);
      return false;
    }
    if (TK.data.state.status === 'offline') UI.toast(TK.data.state.message, 'info', 7000);
    UI.loading(false);
    await runWithLoader(label || 'Sizing the aircraft and matching components…', fn);
    return true;
  }

  // ------------------------------------------------------------------ chrome
  function renderNav() {
    const nav = (cls) => ROUTES.map((r) => `<a href="#/${r.id}" class="${state.route === r.id ? 'active' : ''}" ${state.route === r.id ? 'aria-current="page"' : ''}>${I(r.icon, cls === 'b' ? 19 : 15)}<span>${e(cls === 'b' ? r.short : r.label)}</span></a>`).join('');
    document.getElementById('nav').innerHTML = nav('t');
    document.getElementById('bottomnav').innerHTML = nav('b');
  }
  function syncInfo() {
    const st = TK.data.state;
    const n = st.remote ? st.remote.total : 0;
    const local = st.source === 'local';
    const map = {
      idle: ['busy', 'Connecting…'], checking: ['busy', 'Checking sheet…'], loading: ['busy', 'Fetching components…'],
      ok: ['ok', local ? `Local catalogue · ${n} parts` : `Google Sheet synced${n ? ' · ' + n + ' parts' : ''}`], changed: ['warn', 'Sheet changed · updating'],
      offline: ['warn', 'Offline copy'], error: ['bad', 'Sheet unreachable'], empty: ['warn', 'Sheet connected · empty'], unconfigured: ['warn', 'Sheet not connected'],
    };
    return map[st.status] || ['busy', '…'];
  }
  function renderSync() {
    const st = TK.data.state;
    const [cls, txt] = syncInfo();
    const t = st.lastCheck ? new Date(st.lastCheck).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
    const ps = TK.sync.state.status;
    const busy = st.status === 'loading' || st.status === 'checking' || ps === 'syncing';
    document.getElementById('sync').innerHTML = `<span class="pill" title="${e(st.message || (TK.sync.state.message ? 'Project sync: ' + TK.sync.state.message : 'Checks your Google Sheet automatically'))}"><span class="dot ${cls}"></span><span class="txt">${e(txt)}${t && !busy ? ' · ' + e(t) : ''}${ps === 'ok' ? ' · projects ✓' : ps === 'error' ? ' · projects ⚠' : ''}</span></span>
      <button class="btn icon ghost" data-act="refreshDb" title="Sync now" aria-label="Sync with Google Sheet now">${busy ? I('refresh', 17).replace('<svg', '<svg class="spin"') : I('refresh', 17)}</button>`;
    const b = document.getElementById('testBanner');
    b.classList.toggle('hidden', !st.test);
    b.innerHTML = st.test ? `${I('alert', 15)}<span>TEST catalogue loaded — fictitious components for trying Tinkerer. Do not use for quotations.</span><button class="btn sm" data-act="clearTest">Remove</button>` : '';
  }

  function renderRoute() {
    renderNav();
    const v = document.getElementById('view');
    const fn = VIEWS[state.route] || VIEWS.dashboard;
    v.innerHTML = `<div class="view">${fn()}</div>`;
    if (AFTER[state.route]) AFTER[state.route](v);
  }
  function go(route) {
    if (location.hash !== '#/' + route) location.hash = '#/' + route;
    else {
      state.route = route;
      renderRoute();
    }
  }
  window.addEventListener('hashchange', () => {
    const r = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
    state.route = ROUTES.some((x) => x.id === r) ? r : 'dashboard';
    renderRoute();
    window.scrollTo({ top: 0 });
  });

  // ------------------------------------------------------------------ dashboard
  function syncCard() {
    const st = TK.data.state;
    const s = TK.store.settings();
    const [cls, txt] = syncInfo();
    const r = st.remote;
    const ps = TK.sync.state;
    const chips = r && r.counts ? Object.keys(r.counts).filter((k) => r.counts[k] > 0).map((k) => `<span class="chip static">${e(k)} <b class="mono">${r.counts[k]}</b></span>`).join('') : '';
    const projSync = TK.sync.enabled() ? (ps.status === 'error' ? `<span style="color:var(--bad)">${e(ps.message)}</span>` : ps.lastSync ? 'On — last synced ' + UI.timeAgo(ps.lastSync) : 'On') : `Off — <a href="#/settings">enter your sync key</a> to share projects across devices`;
    return `<div class="card sync-card"><div class="card-h"><h3>${I('sheet')} Google Sheet sync</h3><span class="pill"><span class="dot ${cls}"></span>${e(txt)}</span></div>
      <div class="kv">
        <div>Spreadsheet</div><div>${e(st.sheetName || (s.source === 'local' ? 'Local catalogue (this browser)' : '—'))}</div>
        <div>Automatic check</div><div>${Number(s.autoSyncSec) > 0 ? `Every ${s.autoSyncSec < 60 ? s.autoSyncSec + ' s' : s.autoSyncSec / 60 + ' min'} and when you return to the app` : 'Off'}${st.lastCheck ? ` · last ${UI.timeAgo(st.lastCheck)}` : ''}</div>
        <div>Components</div><div>${r ? `<b class="mono">${r.total}</b> in ${Object.keys(r.counts || {}).filter((k) => r.counts[k] > 0).length} categories — fetched only when a BOM is built` : '—'}</div>
        <div>Projects &amp; BOMs</div><div>${projSync}</div>
      </div>
      ${chips ? `<div class="chips" style="margin-top:12px">${chips}</div>` : ''}
      <div class="btn-row" style="margin-top:14px"><button class="btn sm" data-act="refreshDb">${I('refresh', 14)} Sync now</button>${s.sheetUrl ? `<a class="btn sm" href="${e(U.safeUrl(s.sheetUrl))}" target="_blank" rel="noopener">${I('ext', 14)} Open Google Sheet</a>` : ''}<a class="btn sm ghost" href="#/settings">${I('settings', 14)} Connection</a></div></div>`;
  }

  function viewDashboard() {
    const st = TK.data.state;
    const projs = Object.values(TK.store.projects()).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const total = projs.reduce((s, p) => s + ((p.lastSummary && p.lastSummary.grandTotal) || 0), 0);
    const [cls, txt] = syncInfo();
    const r = st.remote;
    const needsSetup = st.status === 'unconfigured' || st.status === 'empty' || st.status === 'error';
    const recent = projs.slice(0, 5).map((p) => `<div class="lrow"><div class="lm"><b>${e(p.req.projectName || 'Untitled')}</b><span>${e(p.req.projectRef || '')} · ${e(p.req.configuration || '')} · ${UI.timeAgo(p.updatedAt)}</span></div>${p.lastSummary ? UI.feasBadge(p.lastSummary.feasibility) : ''}<span class="mono small hide-sm">${p.lastSummary ? U.inr(p.lastSummary.grandTotal) : '—'}</span><button class="btn sm" data-act="openProject" data-id="${e(p.id)}">Open</button></div>`).join('');
    const draft = state.project && state.project.req.projectName && !TK.store.projects()[state.project.id];
    return `
      <div class="page-head"><div><div class="eyebrow">Dashboard</div><h1 class="page-title">Tinkerer</h1><p>Intelligent Drone Configuration &amp; Build Planner — enter the customer's requirements and Tinkerer pulls the right parts from your Google Sheet into a priced bill of materials.</p></div>
        <div class="btn-row"><button class="btn primary lg" data-act="newConfig">${I('plus', 17)} New configuration</button></div></div>
      ${needsSetup ? `<div class="alert ${st.status === 'error' ? 'error' : 'warn'}">${I('alert')}<div class="ab"><b>${st.status === 'error' ? 'Your Google Sheet could not be reached.' : st.status === 'empty' ? 'Your Google Sheet has no components yet.' : 'Connect your Google Sheet to start building BOMs.'}</b><br><span class="t2">${e(st.message || '')}</span><div class="btn-row" style="margin-top:10px"><a class="btn sm primary" href="#/settings">${I('settings', 14)} Connect Google Sheet</a><button class="btn sm ghost" data-act="loadTest">Try with the TEST catalogue</button></div></div></div>` : ''}
      ${st.status === 'offline' ? `<div class="alert warn">${I('cloud')}<div class="ab">${e(st.message)}</div></div>` : ''}
      <div class="stats">
        <div class="card stat c1"><div class="k">${I('sheet', 14)} Parts in Google Sheet</div><div class="v">${r ? r.total : '—'}<small>${r ? 'parts' : ''}</small></div><div class="d">${r ? Object.keys(r.counts || {}).filter((k) => r.counts[k] > 0).length + ' categories · not downloaded until needed' : 'not connected'}</div></div>
        <div class="card stat c2"><div class="k">${I('folder', 14)} Saved configurations</div><div class="v">${projs.length}</div><div class="d">${draft ? 'Unsaved draft in progress' : TK.sync.enabled() ? 'Synced with Google Sheet' : 'Stored in this browser'}</div></div>
        <div class="card stat c3"><div class="k">${I('rupee', 14)} Value of saved BOMs</div><div class="v" style="font-size:21px">${U.inr(total)}</div><div class="d">Grand totals incl. GST</div></div>
        <div class="card stat c4"><div class="k">${I('cloud', 14)} Sheet sync</div><div class="v" style="font-size:16px;display:flex;align-items:center;gap:9px"><span class="dot ${cls}"></span>${e(txt.split(' · ')[0])}</div><div class="d">${st.lastCheck ? 'Checked ' + UI.timeAgo(st.lastCheck) : 'Not checked yet'} · <a href="#" data-act="refreshDb">Sync now</a></div></div>
      </div>
      <div class="grid g2">
        <div class="card"><div class="card-h"><h3>${I('folder')} Recent projects</h3><a class="btn sm ghost" href="#/projects">All projects ${I('chev', 13)}</a></div>
          ${draft ? `<div class="lrow" style="margin-bottom:8px;border-style:dashed"><div class="lm"><b>${e(state.project.req.projectName)}</b><span>Unsaved draft</span></div><a class="btn sm" href="#/configure">Continue</a></div>` : ''}
          ${recent ? `<div class="list">${recent}</div>` : `<div class="empty">${I('drone', 28)}<h4>No saved configurations yet</h4><p>Start a configuration from a customer's requirements; Tinkerer sizes the aircraft and picks compatible parts from your Google Sheet.</p><button class="btn primary" data-act="newConfig">${I('plus', 15)} New configuration</button></div>`}
        </div>
        ${syncCard()}
      </div>`;
  }

  // ------------------------------------------------------------------ configure
  function viewConfigure() {
    const p = state.project;
    const mode = p.req.selectionMode || 'balanced';
    return `
      <div class="page-head"><div><div class="eyebrow">New drone configuration</div><h1 class="page-title">${e(p.req.projectName || 'Customer requirements')}</h1><p>Only the fields you fill in are used as requirements; everything else is optional. Your entries are saved automatically in this browser.</p></div>
        <div class="btn-row"><button class="btn" data-act="newConfig">${I('plus', 15)} Blank</button><a class="btn" href="#/projects">${I('folder', 15)} Open saved</a></div></div>
      ${['unconfigured', 'empty', 'error'].indexOf(TK.data.state.status) !== -1 ? `<div class="alert warn">${I('alert')}<div class="ab">${e(TK.data.state.message || 'Google Sheet not connected.')} Components are fetched from your sheet when you click Generate. <a href="#/settings">Connection settings</a></div></div>` : `<div class="alert info">${I('sheet')}<div class="ab small">When you click <b>Generate</b>, Tinkerer fetches the latest components from your Google Sheet (only if it changed since last time) and builds the BOM.</div></div>`}
      <form id="reqForm" novalidate autocomplete="off">${TK.form.render(p, state.errors)}</form>
      <div class="actionbar"><div class="btn-row"><span class="small muted hide-sm">Selection mode</span><div class="seg" role="group" aria-label="Selection mode">
        ${[['lowest', 'Lowest cost'], ['balanced', 'Balanced'], ['best', 'Best performance']].map(([k, l]) => `<button type="button" class="${mode === k ? 'on' : ''}" data-act="mode" data-v="${k}">${l}</button>`).join('')}</div></div>
        <div class="btn-row"><button class="btn" data-act="saveProject">${I('save', 15)} Save</button><button class="btn primary lg" data-act="generate">${I('bolt', 16)} Generate Drone Configuration</button></div></div>`;
  }
  function afterConfigure(v) {
    const form = v.querySelector('#reqForm');
    if (!form) return;
    form.addEventListener('submit', (ev) => ev.preventDefault());
    form.addEventListener('toggle', (ev) => {
      const d = ev.target;
      if (d.dataset && d.dataset.sec) state.open[d.dataset.sec] = d.open;
    }, true);
    const onEdit = (ev) => {
      const t = ev.target;
      const p = state.project;
      if (t.dataset.a) {
        p.assumptions[t.dataset.a] = t.value === '' ? '' : Number(t.value);
        if (t.value === '') delete p.assumptions[t.dataset.a];
        saveDraft();
        return;
      }
      if (!t.dataset.k) return;
      const k = t.dataset.k;
      let val = t.type === 'checkbox' ? t.checked : t.value;
      if (t.dataset.p !== undefined) {
        const pl = p.req.payloads[Number(t.dataset.p)];
        if (!pl) return;
        pl[k] = TK.form.coerceValue(TK.form.payloadFieldDef(pl.type, k), val);
      } else {
        p.req[k] = TK.form.coerceValue(TK.form.fieldDef(k), val);
        if (k === 'aircraftClass') {
          if (val === 'Fixed Wing' && ['Quadcopter', 'Hexacopter', 'Octocopter', 'Tricopter'].indexOf(p.req.configuration) !== -1) p.req.configuration = 'Fixed Wing';
          if (val !== 'Fixed Wing' && p.req.configuration === 'Fixed Wing') p.req.configuration = 'Quadcopter';
        }
      }
      const f = t.closest('.field');
      if (f && f.classList.contains('invalid')) {
        f.classList.remove('invalid');
        const er = f.querySelector('.err');
        if (er) er.remove();
        delete state.errors[t.dataset.p !== undefined ? 'p' + t.dataset.p + '.' + k : k];
      }
      saveDraft();
      if (ev.type === 'change' && (TK.form.STRUCTURAL.indexOf(k) !== -1 || k === 'projectName')) setTimeout(rerenderForm, 0);
    };
    form.addEventListener('input', (ev) => {
      if (ev.target.tagName !== 'SELECT' && ev.target.type !== 'checkbox') onEdit(ev);
    });
    form.addEventListener('change', onEdit);
  }
  function rerenderForm() {
    const y = window.scrollY;
    const f = document.getElementById('reqForm');
    if (!f) return;
    f.querySelectorAll('details[data-sec]').forEach((d) => (state.open[d.dataset.sec] = d.open));
    f.innerHTML = TK.form.render(state.project, state.errors);
    const t = document.querySelector('.page-title');
    if (t) t.textContent = state.project.req.projectName || 'Customer requirements';
    window.scrollTo({ top: y });
  }

  // ------------------------------------------------------------------ projects
  function viewProjects() {
    const q = state.projQ.toLowerCase();
    const projs = Object.values(TK.store.projects()).filter((p) => !q || [p.req.projectName, p.req.projectRef, p.req.configuration, p.req.application].join(' ').toLowerCase().indexOf(q) !== -1).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const rows = projs.map((p) => `<div class="lrow"><div class="lm"><b>${e(p.req.projectName || 'Untitled')}</b><span>${e(p.req.projectRef || '—')} · ${e(p.req.aircraftClass || '')} ${e(p.req.configuration || '')} · updated ${UI.timeAgo(p.updatedAt)}${p.lastSummary && p.lastSummary.mtow ? ' · ' + U.fmt(p.lastSummary.mtow, 1) + ' kg' : ''}</span></div>
      ${TK.sync.enabled() ? (p.syncedAt && p.syncedAt === p.updatedAt ? `<span class="badge ok" title="Synced to Google Sheets">${I('cloud', 12)} Synced</span>` : `<span class="badge warn" title="Waiting to sync">${I('cloud', 12)} Pending</span>`) : ''}
      ${p.lastSummary ? UI.feasBadge(p.lastSummary.feasibility) : '<span class="badge neutral">Not generated</span>'}<span class="mono small hide-sm" style="min-width:110px;text-align:right">${p.lastSummary ? U.inr(p.lastSummary.grandTotal) : '—'}</span>
      <div class="btn-row"><button class="btn sm primary" data-act="openProject" data-id="${e(p.id)}">Open</button><button class="btn sm icon" data-act="dupProject" data-id="${e(p.id)}" title="Duplicate" aria-label="Duplicate">${I('copy', 14)}</button><button class="btn sm icon danger" data-act="delProject" data-id="${e(p.id)}" title="Delete" aria-label="Delete">${I('trash', 14)}</button></div></div>`).join('');
    return `<div class="page-head"><div><div class="eyebrow">Saved projects</div><h1 class="page-title">Configurations &amp; quotations</h1><p>${TK.sync.enabled() ? 'Synced automatically with the <span class="mono">_Projects</span> and <span class="mono">_BOM</span> tabs of your Google Sheet — available on every device that has your sync key.' : 'Saved in this browser. Add your sync key in Settings to sync them through Google Sheets.'}</p></div>
      <div class="btn-row">${TK.sync.enabled() ? `<button class="btn" data-act="syncProjects">${I('refresh', 15)} Sync</button>` : ''}<button class="btn" data-act="exportProjects">${I('download', 15)} Export all</button><label class="btn" for="importProjects">${I('upload', 15)} Import</label><input id="importProjects" type="file" accept=".json,application/json" class="hidden"><button class="btn primary" data-act="newConfig">${I('plus', 15)} New</button></div></div>
      <div class="toolbar"><div class="search">${I('search', 15)}<input id="projSearch" type="search" placeholder="Search projects" value="${e(state.projQ)}" aria-label="Search projects"></div></div>
      ${rows ? `<div class="list">${rows}</div>` : `<div class="empty">${I('folder', 28)}<h4>${q ? 'No matching projects' : 'No saved projects'}</h4><p>Projects you save from the configuration or BOM pages appear here and can be reopened, duplicated or exported.</p></div>`}`;
  }
  function afterProjects(v) {
    const s = v.querySelector('#projSearch');
    if (s) s.addEventListener('input', U.debounce(() => {
      state.projQ = s.value;
      renderRoute();
      const n = document.getElementById('projSearch');
      n.focus();
      n.setSelectionRange(n.value.length, n.value.length);
    }, 250));
    const imp = v.querySelector('#importProjects');
    if (imp) imp.addEventListener('change', () => {
      const f = imp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const data = JSON.parse(rd.result);
          const n = TK.store.importProjects(data.projects || data);
          UI.toast(`Imported ${n} project${n === 1 ? '' : 's'}.`, 'ok');
          renderRoute();
        } catch (err) {
          UI.toast('That file is not a Tinkerer projects backup.', 'error');
        }
      };
      rd.readAsText(f);
    });
  }

  // ------------------------------------------------------------------ settings
  function viewSettings() {
    const s = TK.store.settings();
    const st = TK.data.state;
    const admin = TK.store.adminKey();
    const groups = {};
    TK.sizing.A_META.forEach((m) => (groups[m[0]] = groups[m[0]] || []).push(m));
    const c = s.company;
    return `<div class="page-head"><div><div class="eyebrow">Settings</div><h1 class="page-title">Settings</h1><p>Stored in this browser. Values in <span class="mono">assets/js/config.js</span> provide the defaults for every device.</p></div></div>
      <div class="card"><div class="card-h"><h3>${I('sheet')} Google Sheet connection</h3><span class="pill"><span class="dot ${syncInfo()[0]}"></span>${e(syncInfo()[1])}</span></div>
        <div class="grid g3">
          <div class="field"><label for="s_source">Data source</label><select id="s_source"><option value="appsScript" ${s.source === 'appsScript' ? 'selected' : ''}>Google Sheets — Apps Script API (recommended)</option><option value="publishedSheet" ${s.source === 'publishedSheet' ? 'selected' : ''}>Google Sheets — published / link-shared sheet</option><option value="local" ${s.source === 'local' ? 'selected' : ''}>Local catalogue (Excel import, this browser only)</option></select></div>
          <div class="field span2 ${s.source === 'appsScript' ? '' : 'hidden'}" data-src="appsScript"><label for="s_url">Apps Script Web App URL</label><input id="s_url" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="${e(s.appsScriptUrl)}"><div class="help">Deploy → Manage deployments → Web app URL (ends in /exec).</div></div>
          <div class="field span2 ${s.source === 'publishedSheet' ? '' : 'hidden'}" data-src="publishedSheet"><label for="s_sheet">Google Sheet ID</label><input id="s_sheet" type="text" placeholder="1AbC…xyz" value="${e(s.sheetId)}"><div class="help">Sheet must be shared "Anyone with the link — Viewer". Keep the _README tab first.</div></div>
          <div class="field span2 ${s.source === 'local' ? '' : 'hidden'}" data-src="local"><label>Offline catalogue</label><div class="btn-row"><button class="btn sm" data-act="importExcel">${I('upload', 14)} Use an Excel file</button><button class="btn sm ghost" data-act="loadTest">Load TEST catalogue</button></div><div class="help">${st.source === 'local' && st.remote ? `${st.remote.total} components${st.sheetName ? ' from ' + e(st.sheetName) : ''}.` : 'Nothing loaded yet.'} Use only when you cannot reach Google Sheets.</div></div>
          <div class="field ${s.source === 'publishedSheet' ? '' : 'hidden'}" data-src="publishedSheet"><label for="s_tabs">Extra tab names (custom categories)</label><input id="s_tabs" type="text" placeholder="e.g. Parachutes, Spray Systems" value="${e(s.extraTabs)}"></div>
          <div class="field"><label for="s_auto">Automatic sync</label><select id="s_auto">${[[30, 'Every 30 seconds'], [60, 'Every minute (recommended)'], [300, 'Every 5 minutes'], [0, 'Off (manual only)']].map(([v, l]) => `<option value="${v}" ${Number(s.autoSyncSec) === v ? 'selected' : ''}>${l}</option>`).join('')}</select><div class="help">Checks a tiny fingerprint of the sheet; components download only when they changed and a BOM needs them.</div></div>
          <div class="field span2"><label for="s_sheetUrl">Google Sheet edit link (for "Open Google Sheet" buttons)</label><input id="s_sheetUrl" type="url" placeholder="https://docs.google.com/spreadsheets/d/…/edit" value="${e(s.sheetUrl)}"></div>
        </div>
        <div class="alert info" style="margin-top:14px">${I('info')}<div class="ab small"><b>What is public?</b> With the Apps Script API, anyone who has the web-app URL can read every visible tab and column except those whose name starts with "_" (use e.g. "_Cost Price" for private data). With a link-shared sheet, <b>everything</b> in the spreadsheet — all tabs, hidden and "_" columns, comments and edit history visible to viewers — is readable by anyone with the ID. The URL is visible in your GitHub Pages source, so treat the catalogue as public information.</div></div>
        <div class="btn-row" style="margin-top:6px"><button class="btn" data-act="testConn">${I('cloud', 15)} Test connection</button><button class="btn primary" data-act="saveSource">${I('save', 15)} Save &amp; sync</button></div>
      </div>
      <div class="card"><div class="card-h"><h3>${I('key')} Project &amp; BOM sync to Google Sheets</h3><span class="badge ${admin ? 'ok' : 'neutral'}">${admin ? (TK.store.adminKeyRemembered() ? 'On — remembered on this device' : 'On for this tab') : 'Off'}</span></div>
        <p class="small t2" style="margin-top:0">Saved projects and their bills of materials are written to the private <span class="mono">_Projects</span> and <span class="mono">_BOM</span> tabs of your sheet and pulled onto every device automatically. Because those tabs hold customer data, sync needs the key you set as the script property <span class="mono">ADMIN_KEY</span> in Apps Script. The key is never put in the code; tick "remember" only on devices you trust.</p>
        <div class="grid g3"><div class="field"><label for="s_admin">Sync key</label><input id="s_admin" type="password" autocomplete="off" placeholder="${admin ? '•••••••• (set)' : '12+ characters'}"></div>
          <div class="field"><label class="lbl">&nbsp;</label><label class="check" for="s_remember"><input type="checkbox" id="s_remember" ${!admin || TK.store.adminKeyRemembered() ? 'checked' : ''}><span>Remember on this device</span></label></div>
          <div class="field"><label class="lbl">&nbsp;</label><div class="btn-row"><button class="btn primary" data-act="setAdmin">${I('check', 15)} Verify &amp; sync</button>${admin ? `<button class="btn ghost" data-act="clearAdmin">Forget key</button>` : ''}</div></div></div>
        ${admin ? `<p class="small muted" style="margin:4px 0 0">Project sync: ${e(TK.sync.state.status === 'error' ? 'error — ' + TK.sync.state.message : TK.sync.state.lastSync ? 'last synced ' + UI.timeAgo(TK.sync.state.lastSync) : 'waiting')}</p>` : ''}
      </div>
      <div class="card"><div class="card-h"><h3>${I('report')} Company &amp; quotation details</h3></div>
        <div class="grid g3">
          <div class="field"><label for="c_name">Company name</label><input id="c_name" data-c="name" value="${e(c.name)}" placeholder="Shown on BOM exports"></div>
          <div class="field"><label for="c_gstin">GSTIN</label><input id="c_gstin" data-c="gstin" value="${e(c.gstin)}" maxlength="15"></div>
          <div class="field"><label for="c_phone">Phone</label><input id="c_phone" data-c="phone" value="${e(c.phone)}"></div>
          <div class="field"><label for="c_email">Email</label><input id="c_email" data-c="email" value="${e(c.email)}"></div>
          <div class="field span2"><label for="c_addr">Address</label><input id="c_addr" data-c="address" value="${e(c.address)}"></div>
          <div class="field"><label for="s_gst">Default GST %</label><div class="suffix"><input id="s_gst" type="number" min="0" max="40" step="0.5" value="${e(s.defaultGst)}"><span class="u">%</span></div><div class="help">Used when a component has no GST value.</div></div>
          <div class="field"><label for="s_prefix">Project reference prefix</label><input id="s_prefix" value="${e(s.quotePrefix)}" maxlength="10"></div>
          <div class="field span-all"><label for="c_terms">Terms printed on the BOM</label><textarea id="c_terms" data-c="terms" rows="3">${e(c.terms)}</textarea></div>
        </div>
        <div class="btn-row"><button class="btn primary" data-act="saveCompany">${I('save', 15)} Save details</button></div>
      </div>
      <details class="card sec glass"><summary><span class="si">${I('wrench', 16)}</span><span class="st"><b>Default engineering assumptions</b><span>Apply to every new calculation unless a project overrides them</span></span>${I('chev', 16).replace('<svg', '<svg class="chev"')}</summary><div class="sb">
        ${Object.keys(groups).map((g) => `<div class="eyebrow" style="margin-top:12px">${e(g)}</div><div class="grid g4">${groups[g].map((m) => `<div class="field"><label for="sa_${m[1]}">${e(m[2])}</label><div class="${m[3] ? 'suffix' : ''}"><input id="sa_${m[1]}" type="number" step="${m[5]}" data-sa="${m[1]}" value="${e(s.assumptions[m[1]] ?? '')}" placeholder="${e(m[4])}">${m[3] ? `<span class="u">${e(m[3])}</span>` : ''}</div></div>`).join('')}</div>`).join('')}
        <div class="btn-row" style="margin-top:14px"><button class="btn primary" data-act="saveAssumptions">${I('save', 15)} Save defaults</button><button class="btn ghost" data-act="resetDefaultAssumptions">Reset to built-in values</button></div></div></details>
      <div class="card"><div class="card-h"><h3>${I('wrench')} Data tools</h3></div>
        <div class="list">
          <div class="lrow"><div class="lm"><b>Blank component master template</b><span>Excel workbook with every category tab and column header</span></div><button class="btn sm" data-act="template">${I('download', 14)} Download</button></div>
          <div class="lrow"><div class="lm"><b>Excel backup of your Google Sheet</b><span>Fetches the latest components and saves them as a workbook</span></div><button class="btn sm" data-act="exportDb">${I('download', 14)} Export</button></div>
          <div class="lrow"><div class="lm"><b>Projects backup</b><span>All saved projects as JSON</span></div><button class="btn sm" data-act="exportProjects">${I('download', 14)} Export</button></div>
          <div class="lrow"><div class="lm"><b>TEST catalogue</b><span>85 fictitious components to try Tinkerer before your sheet is ready. Clearly flagged; never use for quotations.</span></div><button class="btn sm" data-act="loadTest">Load</button></div>
          <div class="lrow"><div class="lm"><b>Migrate from Tinkerer 1.x (Firebase)</b><span>Reads your old database once and converts it to the new Excel format</span></div><button class="btn sm" data-act="migrate">${I('upload', 14)} Migrate</button></div>
          <div class="lrow"><div class="lm"><b>Clear local data</b><span>Removes settings, cached catalogue, local catalogue, draft and projects from this browser</span></div><button class="btn sm danger" data-act="clearAll">${I('trash', 14)} Clear</button></div>
        </div>
      </div>
      <p class="xs muted" style="text-align:center">Tinkerer ${VERSION} · runs entirely in your browser · <a href="https://github.com" target="_blank" rel="noopener">GitHub Pages</a> ready</p>`;
  }
  function afterSettings(v) {
    const src = v.querySelector('#s_source');
    if (src) src.addEventListener('change', () => v.querySelectorAll('[data-src]').forEach((el) => el.classList.toggle('hidden', el.dataset.src !== src.value)));
  }

  // ------------------------------------------------------------------ actions
  async function loadTestCatalogue() {
    const ok = await UI.confirm('Load TEST catalogue?', 'This switches this browser to an offline catalogue of fictitious "TEST" components. Your Google Sheet is not touched; switch back in Settings.', 'Load TEST data');
    if (!ok) return;
    UI.loading(true, 'Loading TEST catalogue…');
    try {
      let data;
      try {
        data = JSON.parse(await TK.data.fetchText('samples/test-catalogue.json'));
      } catch (err) {
        throw new Error('Could not load samples/test-catalogue.json (open Tinkerer through a web server or GitHub Pages, not as a local file).');
      }
      TK.store.saveLocalCatalogue({ sheets: data.sheets, name: 'TEST catalogue', savedAt: new Date().toISOString(), test: true });
      const s = TK.store.settings();
      s.source = 'local';
      TK.store.saveSettings(s);
      TK.data.state.catalogue = null;
      await TK.data.check();
      renderRoute();
      UI.toast('TEST catalogue loaded.', 'ok');
    } finally {
      UI.loading(false);
    }
  }

  UI.registerActions({
    newConfig: async () => {
      if (state.project && state.project.req.projectName && !TK.store.projects()[state.project.id]) {
        const ok = await UI.confirm('Start a new configuration?', 'The current draft has not been saved as a project. Start a blank configuration anyway?', 'Start new');
        if (!ok) return;
      }
      state.project = newProject();
      state.result = null;
      state.boq = null;
      state.errors = {};
      state.open = {};
      saveDraft();
      go('configure');
    },
    chip: (el) => {
      const p = state.project;
      const target = el.dataset.p !== undefined ? p.req.payloads[Number(el.dataset.p)] : p.req;
      const k = el.dataset.k;
      const arr = Array.isArray(target[k]) ? target[k] : [];
      const i = arr.indexOf(el.dataset.v);
      if (i === -1) arr.push(el.dataset.v);
      else arr.splice(i, 1);
      target[k] = arr;
      el.classList.toggle('on', i === -1);
      el.setAttribute('aria-pressed', i === -1);
      saveDraft();
    },
    payloadType: (el) => {
      const p = state.project;
      const t = el.dataset.v;
      const i = p.req.payloads.findIndex((x) => x.type === t);
      if (i === -1) p.req.payloads.push(t === 'Custom' ? { type: t, qty: 1 } : { type: t, gimbal: 'None' });
      else p.req.payloads = p.req.payloads.filter((x) => x.type !== t);
      state.open.payload = true;
      saveDraft();
      rerenderForm();
    },
    payloadRemove: (el) => {
      state.project.req.payloads.splice(Number(el.dataset.i), 1);
      saveDraft();
      rerenderForm();
    },
    payloadAddCustom: () => {
      state.project.req.payloads.push({ type: 'Custom', qty: 1 });
      saveDraft();
      rerenderForm();
    },
    resetAssumptions: () => {
      state.project.assumptions = {};
      saveDraft();
      rerenderForm();
      UI.toast('Project assumptions reset to defaults.', 'ok');
    },
    mode: (el) => {
      state.project.req.selectionMode = el.dataset.v;
      el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
      saveDraft();
      if (state.route === 'report' && state.result) withCatalogue('Re-selecting components…', () => compute());
    },
    generate: async () => {
      const errs = TK.form.validate(state.project.req);
      state.errors = errs;
      if (Object.keys(errs).length) {
        TK.form.SECTIONS.forEach((s) => {
          if ((s.fields && s.fields.some((f) => errs[f.k])) || (s.id === 'payload' && Object.keys(errs).some((k) => /^p\d/.test(k)))) state.open[s.id] = true;
        });
        rerenderForm();
        const first = document.querySelector('.field.invalid');
        if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        UI.toast(`Please fix ${Object.keys(errs).length} field${Object.keys(errs).length > 1 ? 's' : ''} before generating.`, 'error');
        return;
      }
      const ok = await withCatalogue('Sizing the aircraft and matching components…', () => {
        state.project.overrides = state.project.overrides || {};
        compute({ silent: true });
      });
      if (!ok) return;
      state.reportTab = 'summary';
      go('report');
    },
    saveProject: async () => {
      const p = state.project;
      if (!String(p.req.projectName || '').trim()) {
        UI.toast('Give the project a name first (section A).', 'error');
        state.errors = { projectName: 'Give the project a name.' };
        state.open.basic = true;
        if (state.route === 'configure') rerenderForm();
        return;
      }
      if (state.result && state.boq) {
        p.snapshot = { at: new Date().toISOString(), grandTotal: state.boq.grandTotal, lines: state.boq.lines.map((L) => ({ key: L.key, id: L.itemId, name: L.name, qty: L.qty, unitPrice: L.unitPrice })) };
      }
      const copy = U.deepClone(p);
      if (!TK.store.saveProject(copy)) return;
      p.updatedAt = copy.updatedAt;
      if (!TK.sync.enabled()) return UI.toast(`Saved "${p.req.projectName}" on this device. Add your sync key in Settings to sync projects to Google Sheets.`, 'ok', 6000);
      UI.toast(`Saved "${p.req.projectName}" — syncing to Google Sheets…`, 'ok');
      const ok = await TK.sync.push(TK.store.projects()[p.id], state.result && state.boq ? state.boq.lines : null);
      UI.toast(ok ? 'Project and BOM synced to Google Sheets (_Projects / _BOM tabs).' : 'Saved locally; Google Sheets sync failed — it will retry automatically. ' + TK.sync.state.message, ok ? 'ok' : 'error');
      if (state.route === 'projects') renderRoute();
    },
    openProject: async (el) => {
      const p = TK.store.projects()[el.dataset.id];
      if (!p) return UI.toast('Project not found.', 'error');
      state.project = Object.assign(newProject(), U.deepClone(p));
      state.errors = {};
      state.result = null;
      const ok = await withCatalogue('Recalculating with the latest Google Sheet data…', () => compute({ silent: true }));
      if (ok) {
        const snap = p.snapshot;
        if (snap && state.boq) {
          const now = {};
          state.boq.lines.forEach((L) => (now[L.key] = L));
          const changed = snap.lines.filter((l) => now[l.key] && (now[l.key].itemId !== l.id || now[l.key].unitPrice !== l.unitPrice)).length;
          if (changed) UI.toast(`${changed} line${changed > 1 ? 's' : ''} changed since this project was saved (new prices or selections from your Google Sheet).`, 'info', 7000);
        }
        state.reportTab = 'summary';
        go('report');
      } else {
        saveDraft();
        go('configure');
      }
    },
    dupProject: (el) => {
      const p = U.deepClone(TK.store.projects()[el.dataset.id]);
      p.id = U.uid('prj');
      p.req.projectName = (p.req.projectName || 'Untitled') + ' (copy)';
      p.createdAt = null;
      TK.store.saveProject(p);
      renderRoute();
      UI.toast('Project duplicated.', 'ok');
      if (TK.sync.enabled()) TK.sync.push(TK.store.projects()[p.id]).then(() => state.route === 'projects' && renderRoute());
    },
    delProject: async (el) => {
      const p = TK.store.projects()[el.dataset.id];
      if (!(await UI.confirm('Delete project?', `Delete "${p.req.projectName}"${TK.sync.enabled() ? ' from this browser and from Google Sheets' : ' from this browser'}? This cannot be undone.`, 'Delete', true))) return;
      TK.store.deleteProject(el.dataset.id);
      renderRoute();
      TK.sync.remove(el.dataset.id);
    },
    exportProjects: () => TK.exporters.exportJson({ app: 'Tinkerer', version: VERSION, exportedAt: new Date().toISOString(), projects: TK.store.projects() }, `Tinkerer_Projects_${TK.exporters.stamp()}.json`),
    refreshDb: () => syncNow(true),
    syncProjects: async () => {
      if (!TK.sync.enabled()) return UI.toast('Add your sync key in Settings to sync projects with Google Sheets.', 'info');
      await TK.sync.pull();
      UI.toast(TK.sync.state.status === 'ok' ? 'Projects synced with Google Sheets.' : TK.sync.state.message, TK.sync.state.status === 'ok' ? 'ok' : 'error');
      renderRoute();
    },
    exportDb: async () => {
      UI.loading(true, 'Fetching components from Google Sheets…');
      try {
        const cat = await TK.data.ensureCatalogue();
        if (!cat.items.length) return UI.toast('The sheet has no components — nothing to export.', 'error');
        TK.exporters.exportCatalogue(cat);
      } catch (err) {
        UI.toast(err.message, 'error');
      } finally {
        UI.loading(false);
      }
    },
    showIssues: () => {
      const iss = catalogue().issues.filter((i) => i.level !== 'info');
      UI.modal({
        title: `Sheet data checks (${iss.length})`, size: 'wide',
        body: iss.length ? `<p class="small t2" style="margin-top:0">Fix these rows in your Google Sheet; Tinkerer picks the changes up automatically.</p><div class="tw"><table><thead><tr><th>Level</th><th>Where</th><th>Issue</th></tr></thead><tbody>${iss.map((i) => `<tr><td><span class="badge ${i.level === 'error' ? 'bad' : 'warn'}">${e(i.level)}</span></td><td class="nowrap small">${e(i.where)}</td><td class="small">${e(i.msg)}</td></tr>`).join('')}</tbody></table></div>` : '<p>No issues found in the last fetch.</p>',
        foot: '<button class="btn" data-close>Close</button>',
      });
    },
    importExcel: () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.xlsx,.xls,.csv';
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = async () => {
          try {
            const sheets = TK.data.parseWorkbook(new Uint8Array(rd.result), f.name);
            const n = TK.catalogue.build(sheets, {}).items.length;
            if (!n) throw new Error('No valid component rows found.');
            TK.store.saveLocalCatalogue({ sheets, name: f.name, savedAt: new Date().toISOString(), test: false });
            const st = TK.store.settings();
            st.source = 'local';
            TK.store.saveSettings(st);
            await TK.data.check();
            renderRoute();
            UI.toast(`Offline catalogue set from ${f.name} (${n} parts).`, 'ok');
          } catch (err) {
            UI.toast('Import failed: ' + err.message, 'error');
          }
        };
        rd.readAsArrayBuffer(f);
      };
      inp.click();
    },
    template: () => TK.exporters.downloadTemplate(),
    loadTest: loadTestCatalogue,
    clearTest: async () => {
      if (!(await UI.confirm('Remove TEST catalogue?', 'This clears the local TEST catalogue from this browser.', 'Remove'))) return;
      TK.store.del(TK.store.K.local);
      const s = TK.store.settings();
      if (s.appsScriptUrl) s.source = 'appsScript';
      TK.store.saveSettings(s);
      TK.data.state.catalogue = null;
      await TK.data.check();
      renderRoute();
    },
    testConn: async () => {
      const v = document.getElementById('view');
      const src = v.querySelector('#s_source').value;
      UI.loading(true, 'Testing connection…');
      try {
        let res;
        if (src === 'appsScript') {
          const r = await TK.data.appsScriptGet(v.querySelector('#s_url').value.trim(), 'version');
          UI.toast(`Connected${r.spreadsheet ? ' to "' + r.spreadsheet + '"' : ''}: ${r.total} components in ${Object.keys(r.counts || {}).length} tabs.`, 'ok', 6000);
        } else if (src === 'publishedSheet') {
          const res = await TK.data.fetchPublished(v.querySelector('#s_sheet').value.trim(), v.querySelector('#s_tabs').value);
          UI.toast(`Connected: ${res.sheets.length} tabs, ${TK.catalogue.build(res.sheets, {}).items.length} components.`, 'ok', 6000);
        } else return UI.toast('Local mode needs no connection.', 'info');
      } catch (err) {
        UI.toast(err.message, 'error');
      } finally {
        UI.loading(false);
      }
    },
    saveSource: async () => {
      const v = document.getElementById('view');
      const s = TK.store.settings();
      s.source = v.querySelector('#s_source').value;
      const url = v.querySelector('#s_url').value.trim();
      if (s.source === 'appsScript' && url && !TK.data.validAppsScriptUrl(url)) return UI.toast('That is not an https://script.google.com/…/exec URL.', 'error');
      s.appsScriptUrl = url;
      s.sheetId = v.querySelector('#s_sheet').value.trim();
      s.extraTabs = v.querySelector('#s_tabs').value.trim();
      const su = v.querySelector('#s_sheetUrl').value.trim();
      s.sheetUrl = su && U.safeUrl(su) ? U.safeUrl(su) : '';
      const iv = Number(v.querySelector('#s_auto').value);
      s.autoSyncSec = isFinite(iv) ? iv : 60;
      TK.store.saveSettings(s);
      TK.data.state.catalogue = null;
      TK.data.state.catalogueVersion = null;
      TK.data.startAutoSync();
      await TK.data.check();
      renderRoute();
      const st = TK.data.state;
      UI.toast(st.status === 'ok' ? `Saved — connected${st.remote ? `, ${st.remote.total} components in the sheet` : ''}.` : st.message || 'Saved.', st.status === 'ok' ? 'ok' : st.status === 'error' ? 'error' : 'info');
      if (state.result && st.status === 'ok') withCatalogue('Recalculating with the new sheet…', () => compute());
    },
    setAdmin: async () => {
      const k = document.getElementById('s_admin').value;
      if (k.length < 12) return UI.toast('Sync keys must be at least 12 characters.', 'error');
      const prev = TK.store.adminKey();
      const prevRem = TK.store.adminKeyRemembered();
      const remember = document.getElementById('s_remember').checked;
      TK.store.setAdminKey(k, remember);
      UI.loading(true, 'Verifying key…');
      try {
        await TK.data.adminPost({ action: 'verifyKey' });
        UI.toast(`Sync key verified — projects and BOMs now sync with Google Sheets${remember ? ' automatically on this device' : ' for this browser tab'}.`, 'ok');
        await TK.sync.pull();
      } catch (err) {
        TK.store.setAdminKey(prev, prevRem);
        UI.toast(err.message, 'error');
      } finally {
        UI.loading(false);
        renderRoute();
      }
    },
    clearAdmin: () => {
      TK.store.setAdminKey('');
      renderRoute();
    },
    saveCompany: () => {
      const v = document.getElementById('view');
      const s = TK.store.settings();
      v.querySelectorAll('[data-c]').forEach((el) => (s.company[el.dataset.c] = el.value.trim()));
      const g = Number(v.querySelector('#s_gst').value);
      s.defaultGst = isFinite(g) && g >= 0 && g <= 40 ? g : 18;
      s.quotePrefix = v.querySelector('#s_prefix').value.trim().replace(/[^\w-]/g, '') || 'TNK';
      TK.store.saveSettings(s);
      if (state.result) rebuildBoq();
      UI.toast('Company details saved.', 'ok');
    },
    saveAssumptions: () => {
      const s = TK.store.settings();
      s.assumptions = {};
      document.querySelectorAll('[data-sa]').forEach((el) => {
        if (el.value !== '' && isFinite(Number(el.value))) s.assumptions[el.dataset.sa] = Number(el.value);
      });
      TK.store.saveSettings(s);
      UI.toast('Default assumptions saved. Re-generate open configurations to apply them.', 'ok');
    },
    resetDefaultAssumptions: () => {
      const s = TK.store.settings();
      s.assumptions = {};
      TK.store.saveSettings(s);
      renderRoute();
      UI.toast('Built-in assumption values restored.', 'ok');
    },
    clearAll: async () => {
      if (!(await UI.confirm('Clear all local data?', 'Settings, cached and local catalogues, the current draft and ALL saved projects will be removed from this browser. Export a backup first if you need it. Your Google Sheet is not affected.', 'Clear everything', true))) return;
      Object.values(TK.store.K).forEach((k) => TK.store.del(k));
      TK.store.setAdminKey('');
      location.reload();
    },
    migrate: () => {
      const m = UI.modal({
        title: 'Migrate from Tinkerer 1.x', size: 'narrow',
        body: `<p class="small t2" style="margin-top:0">Reads <span class="mono">/components.json</span> from your old Firebase Realtime Database once and converts it to the Tinkerer 2.0 sheet format. Prices are copied as-is — the old app displayed "$", so check the currency.</p>
          <div class="field"><label for="fbUrl">Firebase database URL</label><input id="fbUrl" type="url" value="${e(LEGACY_FIREBASE)}"></div>
          <div class="alert warn" style="margin-top:12px">${I('alert')}<div class="ab small">After migrating, lock that database: in the Firebase console set Realtime Database rules to <span class="mono">".read": false, ".write": false</span>. The old app required public write access, so anyone could change or delete it.</div></div>`,
        foot: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-go>${I('download', 15)} Fetch &amp; convert</button>`,
      });
      m.el.querySelector('[data-go]').addEventListener('click', async () => {
        const url = m.el.querySelector('#fbUrl').value.trim().replace(/\/+$/, '');
        if (!/^https:\/\/[a-z0-9-]+\.(firebaseio\.com|[a-z0-9-]+\.firebasedatabase\.app)$/i.test(url)) return UI.toast('Enter the https://….firebaseio.com or ….firebasedatabase.app URL.', 'error');
        UI.loading(true, 'Reading the old database…');
        try {
          const json = JSON.parse(await TK.data.fetchText(url + '/components.json'));
          const sheets = TK.catalogue.legacyToSheets(json || {});
          const n = sheets.reduce((s, x) => s + x.rows.length, 0);
          if (!n) throw new Error('No components found at that address.');
          const cat = TK.catalogue.build(sheets, {});
          root.XLSX.writeFile(TK.exporters.catalogueWorkbook(cat, false), `Tinkerer_Migrated_from_v1_${TK.exporters.stamp()}.xlsx`);
          m.close();
          UI.toast(`Converted ${n} components. Review the downloaded Excel, then paste its tabs into your Google Sheet (or import it as a local catalogue).`, 'ok', 9000);
        } catch (err) {
          UI.toast('Migration failed: ' + (err.message || err) + ' (if the database rules are already locked, export the JSON from the Firebase console instead).', 'error', 9000);
        } finally {
          UI.loading(false);
        }
      });
    },
  });

  const VIEWS = { dashboard: viewDashboard, configure: viewConfigure, projects: viewProjects, settings: viewSettings };
  const AFTER = { configure: afterConfigure, projects: afterProjects, settings: afterSettings };

  // ------------------------------------------------------------------ boot
  function boot() {
    const d = TK.store.draft();
    state.project = d && d.project ? Object.assign(newProject(), d.project) : newProject();
    ['overrides', 'qtyOverrides', 'removed', 'assumptions'].forEach((k) => (state.project[k] = state.project[k] || {}));
    state.project.extras = state.project.extras || [];
    TK.data.on((st, evt) => {
      renderSync();
      if (evt === 'sheetChanged' && state.result) {
        // the Google Sheet changed while a BOM is open: refetch and rebuild it automatically
        TK.data.ensureCatalogue().then(() => {
          compute({ silent: true });
          if (state.route === 'report' && !document.querySelector('.modal-bg')) {
            const y = window.scrollY;
            renderRoute();
            window.scrollTo({ top: y });
          }
          UI.toast('Your Google Sheet changed — the BOM was updated with the latest components and prices.', 'info', 6000);
        }).catch((err) => console.warn(err));
        return;
      }
      if (st.status === 'loading' || st.status === 'checking') return;
      softRender(['dashboard', 'settings']);
    });
    TK.sync.on(() => {
      renderSync();
      if (TK.sync.state.status !== 'syncing') softRender(['dashboard', 'projects']);
    });
    const r = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
    state.route = ROUTES.some((x) => x.id === r) ? r : 'dashboard';
    renderSync();
    renderRoute();
    TK.data.startAutoSync();
    TK.sync.start();
    TK.data.check().then(() => {
      if (TK.data.state.status === 'error') UI.toast('Google Sheet unreachable: ' + TK.data.state.message, 'error', 8000);
      if (state.route === 'report' && !state.result && state.project.lastSummary) withCatalogue('Restoring your last configuration…', () => compute());
    });
    TK.sync.pull();
  }

  /** Re-render background-updated pages without disturbing typing or open dialogs. */
  function softRender(routes) {
    if (routes.indexOf(state.route) === -1 || document.querySelector('.modal-bg')) return;
    const a = document.activeElement;
    if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
    const y = window.scrollY;
    renderRoute();
    window.scrollTo({ top: y });
  }

  /** "Sync now": check the sheet, pull projects, rebuild an open BOM if anything changed. */
  async function syncNow(announce) {
    await TK.data.check();
    const st = TK.data.state;
    if (state.result && st.catalogueVersion && st.remote && st.remote.version !== st.catalogueVersion) {
      await withCatalogue('Updating the BOM with your latest sheet…', () => compute());
    }
    if (TK.sync.enabled()) await TK.sync.pull();
    if (!announce) return;
    if (st.status === 'ok' || st.status === 'changed') UI.toast(`Google Sheet checked${st.remote ? ` — ${st.remote.total} components` : ''}${TK.sync.enabled() ? '; projects synced' : ''}.`, 'ok');
    else if (st.message) UI.toast(st.message, st.status === 'error' ? 'error' : 'info');
    softRender(['dashboard', 'settings', 'projects']);
  }

  TK.app = { state, VIEWS, AFTER, ROUTES, go, renderRoute, compute, rebuildBoq, runWithLoader, withCatalogue, syncNow, catalogue, effectiveAssumptions, saveDraft, newProject, renderSync, VERSION };
  document.addEventListener('DOMContentLoaded', boot);
})(typeof window !== 'undefined' ? window : globalThis);
