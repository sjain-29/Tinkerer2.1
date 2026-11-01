/* Tinkerer — build report: summary, component selections, engineering, BOQ. */
(function (root) {
  'use strict';
  const TK = (root.TK = root.TK || {});
  const U = TK.util, UI = TK.ui, e = U.esc, I = (n, s) => UI.icon(n, s);
  const A = () => TK.app;
  const S = () => A().state;

  const CHECK_ICON = { ok: '✓', warn: '!', fail: '✕', unknown: '?', info: '·' };
  function checksHtml(checks, limit) {
    const list = (checks || []).slice(0, limit || 99);
    return `<ul class="checks">${list.map((c) => `<li class="${c.r}"><i>${CHECK_ICON[c.r] || '·'}</i><span>${e(c.t)}</span></li>`).join('')}</ul>`;
  }
  function item(id) {
    return A().catalogue().byId[id];
  }

  function viewReport() {
    const st = S();
    const r = st.result, b = st.boq, p = st.project;
    if (!r) {
      return `<div class="page-head"><div><div class="eyebrow">Bill of Materials</div><h1 class="page-title">No configuration generated yet</h1></div></div>
        <div class="empty">${I('report', 30)}<h4>Generate a configuration first</h4><p>Enter the customer's requirements and click “Generate Drone Configuration”. Tinkerer will size the aircraft, match components from your database and build the bill of materials here.</p><a class="btn primary" href="#/configure">${I('drone', 15)} Go to configuration</a></div>`;
    }
    const a = r.analysis;
    const req = p.req;
    const unresolved = r.slots.filter((s) => s.unresolved && s.need !== 'optional').length;
    const reqMin = a.missionTimeS / 60;
    const end = a.estimatedEnduranceMin;
    const tabs = [['summary', 'Summary', ''], ['components', 'Components', unresolved ? `<span class="cnt bad">${unresolved}</span>` : `<span class="cnt">${r.slots.filter((s) => s.pick).length}</span>`], ['engineering', 'Engineering', ''], ['boq', 'BOM', `<span class="cnt">${b.lines.length}</span>`]];
    const mtowBad = U.toNum(req.mtowLimitKg) !== null && a.mass > Number(req.mtowLimitKg);
    const twShow = a.twActual != null ? a.twActual : a.cruiseTW;
    const twReq = a.twActual != null ? a.twRequired : r.layout.cls === 'fixedwing' ? r.assumptions.twFixedWing : null;
    const ds = TK.data.state;
    const stale = ds.status === 'changed' || (st.lastCatBuilt && ds.catalogue && ds.catalogue.meta.builtAt !== st.lastCatBuilt);
    let body = '';
    if (st.reportTab === 'components') body = componentsTab();
    else if (st.reportTab === 'engineering') body = engineeringTab();
    else if (st.reportTab === 'boq') body = boqTab();
    else body = summaryTab();
    return `
      <div class="page-head"><div><div class="eyebrow">Bill of Materials</div><h1 class="page-title">${e(req.projectName || 'Untitled project')}</h1>
        <p>${e([req.projectRef, `${req.aircraftClass} · ${req.configuration === 'Custom' ? (req.customMotorCount || '?') + '-motor custom' : req.configuration}`, req.application].filter(Boolean).join(' · '))} — generated ${UI.timeAgo(r.generatedAt)} in ${r.ms} ms · ${e({ lowest: 'lowest-cost', balanced: 'balanced', best: 'best-performance' }[r.mode])} selection</p></div>
        <div class="btn-row">${UI.feasBadge(r.feasibility)}${TK.data.state.test ? '<span class="badge test">TEST data</span>' : ''}<span class="badge neutral" title="Component data fetched from your Google Sheet">${I('sheet', 12)} ${TK.data.state.lastFetch ? 'Sheet data ' + UI.timeAgo(TK.data.state.lastFetch) : 'Sheet data'}</span></div></div>
      ${stale ? `<div class="alert info">${I('refresh')}<div class="ab">Your Google Sheet changed since this BOM was built — updating automatically… <a href="#" data-act="rerun">Recalculate now</a>.</div></div>` : ''}
      <div class="stats">
        <div class="card stat ${mtowBad ? 'bad' : ''}"><div class="k">${I('scale', 14)} Estimated take-off weight</div><div class="v">${U.fmt(a.mass, 2)}<small>kg</small></div><div class="d">${U.toNum(req.mtowLimitKg) !== null ? `limit ${req.mtowLimitKg} kg` : `dry ${U.fmt(a.mb.dryG / 1000, 2)} kg · payload ${U.fmt(a.mb.payloadG / 1000, 2)} kg`}</div></div>
        <div class="card stat v2 ${twShow != null && twReq && twShow < twReq ? 'bad' : ''}"><div class="k">${I('gauge', 14)} Thrust-to-weight</div><div class="v">${twShow != null ? U.fmt(twShow, 2) : '—'}</div><div class="d">${twReq ? 'required ' + U.fmt(twReq, 2) : r.layout.cls === 'hybrid' ? 'engine cruise' : ''}${a.hoverThrottlePct ? ` · hover ≈ ${U.fmt(a.hoverThrottlePct, 0)}% throttle` : ''}</div></div>
        <div class="card stat ${end != null ? (end >= reqMin - 0.05 ? 'good' : 'bad') : ''}"><div class="k">${I('bolt', 14)} Est. mission endurance</div><div class="v">${end != null ? U.fmt(end, 1) : r.layout.cls === 'hybrid' && a.fuelKg ? U.fmt(reqMin, 0) : '—'}<small>min</small></div><div class="d">${r.layout.cls === 'hybrid' ? `fuel-limited · ${U.fmt(a.fuelKg || 0, 2)} kg fuel` : `mission needs ${U.fmt(reqMin, 1)} min · estimate, not guaranteed`}</div></div>
        <div class="card stat v2 ${b.overBudget ? 'bad' : ''}"><div class="k">${I('rupee', 14)} Grand total${b.droneQty > 1 ? ` (${b.droneQty} drones)` : ''}</div><div class="v" style="font-size:21px">${U.inr(b.grandTotal)}</div><div class="d">${b.budget !== null ? (b.overBudget ? `<span style="color:var(--bad)">over budget by ${U.inr(-b.budgetVariance)}</span>` : `within budget · ${U.inr(b.budgetVariance)} spare`) : 'no budget set'}${b.unresolvedCount ? ` · <span style="color:var(--bad)">${b.unresolvedCount} unresolved</span>` : ''}</div></div>
      </div>
      <div class="card tight" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div class="btn-row"><a class="btn sm" href="#/configure">${I('edit', 14)} Edit requirements</a><button class="btn sm" data-act="rerun">${I('refresh', 14)} Recalculate</button><button class="btn sm" data-act="saveProject">${I('save', 14)} Save project</button></div>
        <div class="btn-row"><div class="seg" role="group" aria-label="Selection mode">${[['lowest', 'Lowest cost'], ['balanced', 'Balanced'], ['best', 'Best perf.']].map(([k, l]) => `<button type="button" class="${(req.selectionMode || 'balanced') === k ? 'on' : ''}" data-act="mode" data-v="${k}">${l}</button>`).join('')}</div>
          <button class="btn sm" data-act="boqXlsx">${I('download', 14)} Excel</button><button class="btn sm" data-act="boqPdf">${I('download', 14)} PDF</button><button class="btn sm" data-act="boqPrint">${I('printer', 14)} Print</button></div>
      </div>
      <div class="tabs" role="tablist">${tabs.map(([k, l, c]) => `<button role="tab" aria-selected="${st.reportTab === k}" class="${st.reportTab === k ? 'on' : ''}" data-act="rtab" data-v="${k}">${l} ${c}</button>`).join('')}</div>
      <div id="rtabBody">${body}</div>`;
  }

  // ------------------------------------------------------------------ summary
  function summaryTab() {
    const r = S().result, a = r.analysis, b = S().boq;
    const order = { error: 0, warn: 1, info: 2 };
    const flags = r.flags.slice().sort((x, y) => order[x.level] - order[y.level]);
    if (b.overBudget) flags.push({ level: 'warn', text: `Commercial: grand total ${U.inr(b.grandTotal)} exceeds the customer budget of ${U.inr(b.budget)} by ${U.inr(-b.budgetVariance)}. Try "Lowest cost" mode or relax requirements.` });
    if (!flags.length) flags.push({ level: 'ok', text: 'All requirements met with compatible components. Review the conditions on individual components before quoting.' });
    const mb = a.mb;
    const parts = [['Structure & propulsion', mb.groups.structure + mb.groups.propulsion, '#06b6d4'], ['Avionics, power & comms', mb.groups.avionics + mb.groups.power + mb.groups.comms + mb.groups.other, '#3b82f6'], ['Payload', mb.payloadG, '#8b5cf6'], ['Battery', mb.groups.battery, '#10b981'], ['Wiring allowance', mb.miscG, '#f59e0b']];
    if (a.fuelKg) parts.push(['Fuel', a.fuelKg * 1000, '#f97316']);
    const tot = parts.reduce((s, x) => s + x[1], 0) || 1;
    const kv = [];
    if (a.rotor) kv.push(['Hover power (incl. margin)', U.fmt(a.rotor.Phover, 0) + ' W', a.rotor.source]);
    if (a.rotor && r.layout.cls === 'multirotor') kv.push(['Cruise power', U.fmt(a.rotor.Pcruise, 0) + ' W', `at ${U.fmt(a.mission.cruise, 1)} m/s`]);
    if (a.wing) kv.push([r.layout.cls === 'hybrid' ? 'Cruise shaft power (engine)' : 'Cruise power', U.fmt(r.layout.cls === 'hybrid' ? a.pw.cruiseShaft : a.wing.Pcruise, 0) + ' W', `L/D ${U.fmt(a.wing.LD, 1)}`]);
    kv.push(['Mission energy (battery)', U.fmt(a.missionEnergyWh, 0) + ' Wh', `${U.fmt(a.missionTimeS / 60, 1)} min profile`]);
    kv.push(['Required nominal battery energy', U.fmt(a.requiredNominalWh, 0) + ' Wh', `+${r.assumptions.reserve}% reserve`]);
    if (a.energyNomWh) kv.push(['Selected battery energy', U.fmt(a.energyNomWh, 0) + ' Wh', `${r.cells}S × ${r.parallel * (r.series || 1)} pack(s)`]);
    if (a.theoreticalEnduranceMin) kv.push(['Theoretical endurance', U.fmt(a.theoreticalEnduranceMin, 1) + ' min', 'upper bound — not a quote figure']);
    if (a.estimatedEnduranceMin != null) kv.push(['Estimated mission endurance', U.fmt(a.estimatedEnduranceMin, 1) + ' min', 'with reserve, DoD and derating']);
    if (a.peakCurrentA) kv.push(['Peak current', U.fmt(a.peakCurrentA, 0) + ' A', a.requiredC ? `battery needs ${U.fmt(a.requiredC, 1)}C` : '']);
    return `<div class="grid g2">
      <div>
        <div class="card"><div class="card-h"><h3>${I('alert')} Feasibility</h3>${UI.feasBadge(r.feasibility)}</div>
          ${flags.map((f) => `<div class="alert ${f.level === 'error' ? 'error' : f.level === 'warn' ? 'warn' : f.level === 'ok' ? 'ok' : 'info'}">${I(f.level === 'ok' ? 'check' : f.level === 'info' ? 'info' : 'alert')}<div class="ab">${e(f.text)}</div></div>`).join('')}
        </div>
        <div class="card"><div class="card-h"><h3>${I('info')} Assumptions &amp; confidence</h3></div>
          <ul class="checks">${r.confidence.map((c) => `<li class="info"><i>·</i><span>${e(c)}</span></li>`).join('')}</ul>
          <p class="small muted" style="margin:12px 0 0">Selection evaluated ${r.combosEvaluated.toLocaleString('en-IN')} propulsion combinations in ${r.iterations} weight iteration${r.iterations > 1 ? 's' : ''}${r.converged ? ' (converged)' : ''}. <a href="#" data-act="rtab" data-v="engineering">See the full engineering report</a>.</p>
        </div>
      </div>
      <div>
        <div class="card"><div class="card-h"><h3>${I('scale')} Weight breakdown</h3><span class="mono">${U.fmt(a.mass, 2)} kg</span></div>
          <div class="wbar">${parts.map((x) => `<i style="width:${(x[1] / tot) * 100}%;background:${x[2]}" title="${e(x[0])}"></i>`).join('')}</div>
          <div class="legend">${parts.map((x) => `<span><i style="background:${x[2]}"></i>${e(x[0])} <b class="mono">${U.fmt(x[1] / 1000, 2)} kg</b></span>`).join('')}</div>
          <div class="kv" style="margin-top:12px"><div>Total installed component weight</div><div class="mono">${U.fmt(b.componentWeightG / 1000, 2)} kg</div><div>Payload sized for</div><div class="mono">${U.fmt(mb.payloadG / 1000, 2)} kg${mb.selectedPayloadG ? ` <span class="muted">(equipment ${U.fmt(mb.selectedPayloadG / 1000, 2)} kg)</span>` : ''}</div></div>
        </div>
        <div class="card"><div class="card-h"><h3>${I('bolt')} Power &amp; endurance</h3></div>
          <div class="kv">${kv.map((x) => `<div>${e(x[0])}</div><div><span class="mono">${e(x[1])}</span>${x[2] ? ` <span class="muted small">${e(x[2])}</span>` : ''}</div>`).join('')}</div>
          <div class="alert info" style="margin:14px 0 0">${I('info')}<div class="ab small">Endurance is never guaranteed: the estimated figure accounts for the battery's own weight, ${r.assumptions.reserve}% landing reserve, ${r.assumptions.dod} usable depth of discharge and ${r.assumptions.batteryDerate} health derate, in still air. Confirm with a flight test before committing to a customer.</div></div>
        </div>
      </div></div>`;
  }

  // ------------------------------------------------------------------ components
  function slotCard(s) {
    const p = S().project;
    const isBattery = s.key === 'battery';
    const head = `<div class="sh"><span class="lab">${e(s.label)}</span><span class="btn-row">${s.pinned ? '<span class="badge violet">Manual pick</span>' : ''}${s.pick ? UI.badge(s.pick.status) : UI.badge('unavailable', s.need === 'optional' ? 'Optional — none found' : 'Not available')}</span></div>`;
    const actions = `<div class="btn-row"><button class="btn sm" data-act="changeSlot" data-k="${e(s.key)}">${I('edit', 13)} Change</button>${s.pinned ? `<button class="btn sm ghost" data-act="autoSlot" data-k="${e(s.key)}">Let Tinkerer choose</button>` : ''}${s.need !== 'required' ? `<button class="btn sm ghost" data-act="excludeSlot" data-k="${e(s.key)}">Remove</button>` : ''}</div>`;
    if (!s.pick) {
      const c = s.closest;
      const ci = c && (c.item || item(c.id));
      return `<div class="card slot unresolved">${head}
        <div class="alert error" style="margin:0">${I('alert')}<div class="ab small">${e(s.message || TK.matcher.NO_MATCH_MSG)}</div></div>
        ${ci ? `<div class="small t2"><b>Closest in database:</b> ${e(ci.name)} ${UI.badge(c.status)}</div>${checksHtml(c.checks.filter((x) => x.r === 'fail' || x.r === 'unknown'), 4)}
          <div class="btn-row"><button class="btn sm" data-act="pickItem" data-k="${e(s.key)}" data-id="${e(ci.id)}">Use closest anyway</button><button class="btn sm ghost" data-act="changeSlot" data-k="${e(s.key)}">See all ${s.dbCount || 0} candidates</button>${s.need !== 'required' ? `<button class="btn sm ghost" data-act="excludeSlot" data-k="${e(s.key)}">Remove</button>` : ''}</div>` : `<div class="btn-row">${TK.store.settings().sheetUrl ? `<a class="btn sm" href="${e(U.safeUrl(TK.store.settings().sheetUrl))}" target="_blank" rel="noopener">${I('ext', 13)} Add one in Google Sheet</a>` : ''}<span class="small muted">Add a compatible part to your sheet — Tinkerer picks it up automatically.</span></div>`}
      </div>`;
    }
    const it = s.pick.item || item(s.pick.id);
    const nonOk = s.pick.checks.filter((x) => x.r !== 'ok' && x.r !== 'info').length;
    const price = it.price != null ? `${s.qty} × ${U.inr(it.price)} = <b>${U.inr(it.price * s.qty)}</b>` : `${s.qty} × <span style="color:var(--warn)">no price</span>`;
    return `<div class="card slot">${head}
      <div><div class="pn">${e(it.name)}</div><div class="meta">${[it.manufacturer, it.model && 'Model ' + it.model, it.vendor].filter(Boolean).map(e).join(' · ')}${it.url ? ' · ' + UI.link(it.url, 'Product page') : ''}</div></div>
      <div class="meta"><span>${price}</span>${it.packQty > 1 ? `<span>${s.units} units (${it.packQty}/pack)</span>` : ''}${it.weight != null ? `<span>${U.fmt(it.weight, 0)} g each</span>` : ''}${it.stock ? `<span>${e(it.stock)}</span>` : ''}</div>
      <div class="small mono t2">${e(TK.catalogue.specSummary(it, A().catalogue()))}</div>
      <div class="why">${e(s.reason || '')}</div>
      ${isBattery ? `<div class="btn-row small"><span class="muted">Packs in parallel:</span><div class="seg">${[['', 'Auto'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']].map(([v, l]) => `<button type="button" class="${String(p.overrides.__parallel || '') === v ? 'on' : ''}" data-act="parallel" data-v="${v}">${l}</button>`).join('')}</div><span class="muted">${S().result.series > 1 ? `× ${S().result.series} in series` : ''}</span></div>` : ''}
      <details class="more" ${nonOk ? 'open' : ''}><summary>${I('chev', 12)} ${s.pick.checks.length} checks${nonOk ? ` · ${nonOk} need attention` : ''}</summary>${checksHtml(s.pick.checks)}</details>
      ${s.alternatives && s.alternatives.length ? `<div class="alts"><span class="xs muted">Alternatives</span>${s.alternatives.map((x) => `<div class="alt"><span class="an">${e(x.item.name)} <span class="muted">· ${x.item.price != null ? U.inr(x.cost) : 'no price'}</span></span><span class="btn-row">${UI.badge(x.status)}<button class="btn sm" data-act="pickItem" data-k="${e(s.key)}" data-id="${e(x.id)}">Use</button></span></div>`).join('')}</div>` : ''}
      ${actions}</div>`;
  }
  function componentsTab() {
    const r = S().result;
    const active = r.slots.filter((s) => !s.na && !s.excluded);
    const na = r.slots.filter((s) => s.na);
    const ex = r.slots.filter((s) => s.excluded);
    const unresolved = active.filter((s) => !s.pick);
    return `${unresolved.length ? `<div class="alert error">${I('alert')}<div class="ab">${unresolved.length} slot${unresolved.length > 1 ? 's have' : ' has'} no suitable component. ${e(TK.matcher.NO_MATCH_MSG)}</div></div>` : ''}
      <div class="slots">${active.map(slotCard).join('')}</div>
      ${ex.length ? `<div class="card" style="margin-top:16px"><div class="card-h"><h3>Removed from this build</h3></div><div class="list">${ex.map((s) => `<div class="lrow"><div class="lm"><b>${e(s.label)}</b><span>Excluded by you — not in the BOM or calculations</span></div><button class="btn sm" data-act="autoSlot" data-k="${e(s.key)}">Restore</button></div>`).join('')}</div></div>` : ''}
      ${na.length ? `<details class="card more" style="margin-top:16px"><summary>${I('chev', 12)} Not required for this configuration (${na.length})</summary><div class="list" style="margin-top:10px">${na.map((s) => `<div class="lrow"><div class="lm"><b>${e(s.label)}</b><span>${e(s.na)}</span></div></div>`).join('')}</div></details>` : ''}`;
  }

  // ------------------------------------------------------------------ engineering
  function engineeringTab() {
    const r = S().result;
    const flagCls = (f) => (f === 'bad' ? 'flag-bad' : f === 'warn' ? 'flag-warn' : f === 'ok' ? 'flag-ok' : '');
    const secs = r.report.map((sec) => `<tr class="tsec"><td colspan="4">${e(sec.title)}</td></tr>` + sec.rows.map((x) => `<tr class="${flagCls(x.flag)}"><td>${e(x.label)}</td><td class="n">${e(x.value)}</td><td class="mono small muted">${e(x.unit)}</td><td class="small ${x.flag === 'bad' ? '' : 'muted'}">${x.flag === 'bad' ? '<b style="color:var(--bad)">Not up to the mark</b> · ' : ''}${e(x.note)}</td></tr>`).join('')).join('');
    const groups = {};
    TK.sizing.A_META.forEach((m) => (groups[m[0]] = groups[m[0]] || []).push(m));
    return `<div class="card"><div class="card-h"><h3>${I('report')} Sizing report</h3><span class="sub">${e(TK.sizing.classOf(S().project.req) === 'multirotor' ? 'Multirotor model (Drone_Calculations.xlsx chain, extended)' : { fixedwing: 'Fixed-wing model', vtol: 'VTOL quadplane model', hybrid: 'Hybrid VTOL model (fuel cruise, electric lift)' }[r.layout.cls])}</span></div>
        <div class="tw"><table><thead><tr><th>Item</th><th class="n">Value</th><th>Unit</th><th>Note</th></tr></thead><tbody>${secs}</tbody></table></div>
        <p class="small muted" style="margin:10px 0 0">Rows marked in red are not up to the mark. All values are estimates from the assumptions below.</p></div>
      <details class="card more"><summary>${I('chev', 12)} Assumptions used (${TK.sizing.A_META.length})</summary>
        <div class="grid g3" style="margin-top:12px">${Object.keys(groups).map((g) => `<div><div class="eyebrow">${e(g)}</div><div class="kv">${groups[g].map((m) => `<div>${e(m[2])}</div><div class="mono">${e(r.assumptions[m[1]])} ${e(m[3])}${r.assumptions[m[1]] !== m[4] ? ' <span class="badge violet">changed</span>' : ''}</div>`).join('')}</div></div>`).join('')}</div>
        <div class="btn-row" style="margin-top:12px"><button class="btn sm" data-act="editAssumptions">${I('edit', 13)} Edit assumptions for this project</button></div></details>`;
  }

  // ------------------------------------------------------------------ BOQ
  function boqTab() {
    const b = S().boq, p = S().project;
    const rows = b.lines.map((L) => `<tr class="${L.unresolved ? 'unres' : ''}">
      <td data-l="#">${L.sr}</td>
      <td data-l="Category">${e(L.category)}${L.functions && L.functions.length > 1 ? `<div class="xs muted">serves ${e(L.functions.join(' + '))}</div>` : ''}</td>
      <td data-l="Component"><b>${e(L.name)}</b>${L.model || L.manufacturer ? `<div class="xs muted">${e([L.manufacturer, L.model && 'Model ' + L.model].filter(Boolean).join(' · '))}</div>` : ''}${L.specs ? `<div class="xs mono t2">${e(L.specs)}</div>` : ''}${L.url ? `<div class="xs">${UI.link(L.url, 'Product page')}</div>` : ''}</td>
      <td data-l="Vendor">${e(L.vendor || '—')}${L.vendorUrl ? `<div class="xs">${UI.link(L.vendorUrl, 'Website')}</div>` : ''}</td>
      <td data-l="Qty" class="n">${L.unresolved ? '—' : `<input class="qty" type="number" min="0" step="1" value="${L.qty}" data-qty="${e(L.key)}" aria-label="Quantity">${L.qtyOverridden ? `<div class="xs muted">engine: ${L.engineQty}</div>` : ''}`}</td>
      <td data-l="Unit price" class="n">${L.unitPrice != null ? U.inr(L.unitPrice, true) : '—'}</td>
      <td data-l="GST" class="n">${L.gstPct}%</td>
      <td data-l="Total" class="n"><b>${U.inr(L.total, true)}</b></td>
      <td data-l="Weight" class="n">${L.unitWeight != null ? U.fmt(L.unitWeight, 0) + ' g' : '—'}</td>
      <td data-l="Status">${UI.badge(L.status)}</td>
      <td>${L.unresolved ? '' : `<button class="btn sm icon ghost" data-act="removeLine" data-k="${e(L.key)}" title="Remove from BOM" aria-label="Remove line">${I('x', 14)}</button>`}</td></tr>`).join('');
    const removed = b.removedLines.length ? `<div class="alert info" style="margin-top:12px">${I('info')}<div class="ab small">Removed from the BOM (still in the engineering calculation): ${b.removedLines.map((L) => `${e(L.name)} <a href="#" data-act="restoreLine" data-k="${e(L.key)}">restore</a>`).join(' · ')}</div></div>` : '';
    const extras = (p.extras || []).map((x, i) => `<div class="grid g4" style="margin-bottom:8px;align-items:end"><div class="field span2"><label>Description</label><input data-extra="${i}" data-f="desc" value="${e(x.desc || '')}" placeholder="e.g. Assembly & testing"></div><div class="field"><label>Amount (₹)</label><input type="number" min="0" data-extra="${i}" data-f="amount" value="${e(x.amount ?? '')}"></div><div class="field"><label>GST %</label><div class="btn-row" style="flex-wrap:nowrap"><input type="number" min="0" max="40" data-extra="${i}" data-f="gst" value="${e(x.gst ?? '')}" placeholder="${TK.store.settings().defaultGst}"><button class="btn icon ghost" data-act="delExtra" data-i="${i}" aria-label="Remove expense">${I('trash', 14)}</button></div></div></div>`).join('');
    const tot = [['Per-drone subtotal (taxable)', b.perDroneSubtotal], ['Per-drone GST', b.perDroneGst], ['Per-drone total', b.perDroneTotal]];
    if (b.droneQty > 1) tot.push([`× ${b.droneQty} drones`, b.perDroneTotal * b.droneQty]);
    if (b.extras.length) tot.push(['Additional expenses (incl. GST)', b.extrasTotal]);
    return `<div class="card"><div class="card-h"><h3>${I('report')} Bill of Materials (BOM)</h3>
        <div class="btn-row"><div class="seg" role="group" aria-label="GST mode"><button type="button" class="${p.req.gstMode !== 'inclusive' ? 'on' : ''}" data-act="gstMode" data-v="exclusive">Prices + GST</button><button type="button" class="${p.req.gstMode === 'inclusive' ? 'on' : ''}" data-act="gstMode" data-v="inclusive">GST inclusive</button></div>
        <label class="small muted" for="droneQty">Drones</label><input id="droneQty" type="number" min="1" step="1" value="${b.droneQty}" style="width:80px"></div></div>
        ${b.unresolvedCount ? `<div class="alert error">${I('alert')}<div class="ab">${b.unresolvedCount} line${b.unresolvedCount > 1 ? 's are' : ' is'} unresolved — the BOM is incomplete and exports are marked DRAFT.</div></div>` : ''}
        <div class="tw"><table class="cards"><thead><tr><th>#</th><th>Category</th><th>Component</th><th>Vendor</th><th class="n">Qty</th><th class="n">Unit price</th><th class="n">GST</th><th class="n">Total</th><th class="n">Unit wt</th><th>Status</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="11" class="muted">No lines.</td></tr>'}</tbody></table></div>
        ${removed}
      </div>
      <div class="grid g2">
        <div class="card"><div class="card-h"><h3>${I('plus')} Additional expenses</h3><button class="btn sm" data-act="addExtra">${I('plus', 13)} Add</button></div>
          ${extras || '<p class="small muted" style="margin:0">Assembly, testing, training, shipping, certification… added once per order.</p>'}</div>
        <div class="card"><div class="card-h"><h3>${I('rupee')} Totals</h3>${b.inclusive ? '<span class="badge neutral">Prices include GST</span>' : ''}</div>
          <div class="kv">${tot.map((t) => `<div>${e(t[0])}</div><div class="mono right">${U.inr(t[1], true)}</div>`).join('')}
            <div><b>Subtotal (taxable)</b></div><div class="mono right">${U.inr(b.subtotal, true)}</div>
            <div><b>GST</b></div><div class="mono right">${U.inr(b.gstTotal, true)}</div>
            <div><b style="color:var(--blue)">Grand total</b></div><div class="mono right" style="font-size:18px;color:var(--blue)"><b>${U.inr(b.grandTotal, true)}</b></div>
            ${b.budget !== null ? `<div>Customer budget</div><div class="mono right">${U.inr(b.budget, true)}</div><div>Budget variance</div><div class="mono right" style="color:${b.overBudget ? 'var(--bad)' : 'var(--ok)'}">${b.overBudget ? '−' : '+'}${U.inr(Math.abs(b.budgetVariance), true)}</div>` : ''}
            <div>Total installed component weight</div><div class="mono right">${U.fmt(b.componentWeightG / 1000, 2)} kg</div>
            <div>Estimated drone MTOW</div><div class="mono right">${U.fmt(b.mtowKg, 2)} kg</div>
          </div>
          <div class="btn-row" style="margin-top:14px"><button class="btn sm primary" data-act="boqXlsx">${I('download', 14)} Excel</button><button class="btn sm" data-act="boqPdf">${I('download', 14)} PDF</button><button class="btn sm" data-act="boqPrint">${I('printer', 14)} Print</button><button class="btn sm" data-act="saveProject">${I('save', 14)} Save project</button></div>
        </div></div>`;
  }

  function afterReport(v) {
    const body = v.querySelector('#rtabBody');
    if (!body) return;
    // Re-render after an edit, then put focus back on whichever BOQ input the user moved to.
    const keyOf = (el) => {
      if (!el || !el.dataset) return null;
      if (el.dataset.qty) return `[data-qty="${CSS.escape(el.dataset.qty)}"]`;
      if (el.dataset.extra !== undefined) return `[data-extra="${el.dataset.extra}"][data-f="${el.dataset.f}"]`;
      if (el.id === 'droneQty') return '#droneQty';
      return null;
    };
    const refreshBoq = () => setTimeout(() => {
      const sel = keyOf(document.activeElement);
      A().rebuildBoq();
      const y = window.scrollY;
      A().renderRoute();
      window.scrollTo({ top: y });
      const n = sel && document.querySelector(sel);
      if (n) {
        n.focus({ preventScroll: true });
        if (n.select) try { n.select(); } catch (err) { /* number inputs */ }
      }
    }, 0);
    body.addEventListener('change', (ev) => {
      const t = ev.target;
      const p = S().project;
      if (t.dataset.qty) {
        const n = t.value === '' ? undefined : Math.max(0, Math.round(Number(t.value)));
        if (n === undefined || !isFinite(n)) delete p.qtyOverrides[t.dataset.qty];
        else p.qtyOverrides[t.dataset.qty] = n;
        refreshBoq();
      } else if (t.dataset.extra !== undefined) {
        const x = p.extras[Number(t.dataset.extra)];
        x[t.dataset.f] = t.dataset.f === 'desc' ? t.value.slice(0, 120) : t.value === '' ? '' : Math.max(0, Number(t.value));
        refreshBoq();
      } else if (t.id === 'droneQty') {
        p.req.droneQty = Math.max(1, Math.round(Number(t.value) || 1));
        refreshBoq();
      }
    });
  }

  function exportCtx() {
    const st = S();
    return { project: st.project, result: st.result, boq: st.boq, settings: TK.store.settings(), catalogue: A().catalogue(), test: TK.data.state.test };
  }
  function recompute(label) {
    return A().runWithLoader(label || 'Recalculating…', () => A().compute());
  }

  UI.registerActions({
    rtab: (el) => {
      S().reportTab = el.dataset.v;
      A().renderRoute();
    },
    rerun: () => A().withCatalogue('Recalculating with the latest Google Sheet data…', () => A().compute(), { force: true }),
    changeSlot: (el) => openChangeDialog(el.dataset.k),
    pickItem: (el) => {
      S().project.overrides[el.dataset.k] = el.dataset.id;
      return recompute('Re-checking compatibility and recalculating…');
    },
    autoSlot: (el) => {
      delete S().project.overrides[el.dataset.k];
      return recompute();
    },
    excludeSlot: (el) => {
      S().project.overrides[el.dataset.k] = '__none__';
      return recompute();
    },
    parallel: (el) => {
      if (el.dataset.v) S().project.overrides.__parallel = Number(el.dataset.v);
      else delete S().project.overrides.__parallel;
      return recompute();
    },
    gstMode: (el) => {
      S().project.req.gstMode = el.dataset.v;
      A().rebuildBoq();
      A().renderRoute();
    },
    removeLine: (el) => {
      S().project.removed[el.dataset.k] = true;
      A().rebuildBoq();
      A().renderRoute();
    },
    restoreLine: (el) => {
      delete S().project.removed[el.dataset.k];
      A().rebuildBoq();
      A().renderRoute();
    },
    addExtra: () => {
      S().project.extras.push({ desc: '', amount: '', gst: '' });
      A().renderRoute();
    },
    delExtra: (el) => {
      S().project.extras.splice(Number(el.dataset.i), 1);
      A().rebuildBoq();
      A().renderRoute();
    },
    editAssumptions: () => {
      S().open.advanced = true;
      A().go('configure');
      setTimeout(() => {
        const d = document.querySelector('[data-sec="advanced"]');
        if (d) d.scrollIntoView({ behavior: 'smooth' });
      }, 80);
    },
    boqXlsx: () => {
      if (!S().result) return;
      TK.exporters.exportBoqXlsx(exportCtx());
      UI.toast('Excel BOM downloaded.', 'ok');
    },
    boqPdf: () => {
      if (!S().result) return;
      TK.exporters.exportBoqPdf(exportCtx());
      UI.toast('PDF BOM downloaded.', 'ok');
    },
    boqPrint: () => {
      if (!S().result) return;
      document.getElementById('printArea').innerHTML = TK.exporters.boqPrintHtml(exportCtx());
      setTimeout(() => window.print(), 50);
    },
  });

  function openChangeDialog(key) {
    const r = S().result;
    const s = r.slots.find((x) => x.key === key);
    if (!s) return;
    const cands = (s.candidates || []).map((c) => Object.assign({}, c, { item: item(c.id) })).filter((c) => c.item);
    let showBad = false, q = '';
    const render = (m) => {
      const list = cands.filter((c) => (showBad || c.status !== 'incompatible') && (!q || (c.item.name + ' ' + (c.item.model || '') + ' ' + (c.item.manufacturer || '') + ' ' + (c.item.vendor || '')).toLowerCase().indexOf(q) !== -1));
      const cur = s.pick && s.pick.id;
      m.el.querySelector('#candList').innerHTML = list.length ? list.map((c) => {
        const notable = c.checks.filter((x) => x.r === 'fail' || x.r === 'warn' || x.r === 'unknown').slice(0, 3);
        const goods = c.checks.filter((x) => x.r === 'ok').slice(0, 2);
        return `<div class="lrow" style="align-items:flex-start"><div class="lm"><b>${e(c.item.name)}</b><span>${e([c.item.manufacturer, c.item.model, c.item.vendor].filter(Boolean).join(' · '))} · ${c.item.price != null ? U.inr(c.cost) + (c.packs > 1 ? ` (${c.packs} × ${U.inr(c.item.price)})` : '') : 'no price'}</span>
          <div style="margin-top:6px">${checksHtml(notable.length ? notable : goods)}</div></div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">${UI.badge(c.status)}${c.id === cur ? '<span class="badge neutral">Selected</span>' : `<button class="btn sm ${c.status === 'incompatible' ? 'danger' : 'primary'}" data-pick="${e(c.id)}">Select</button>`}</div></div>`;
      }).join('') : `<div class="empty"><p>No ${showBad ? '' : 'compatible '}candidates${q ? ' match your search' : ''}.</p></div>`;
      m.el.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', async () => {
        const id = b.dataset.pick;
        const c = cands.find((x) => x.id === id);
        if (c.status === 'incompatible' && !(await UI.confirm('Select an incompatible component?', `"${c.item.name}" fails: ${c.checks.filter((x) => x.r === 'fail').map((x) => x.t).join('; ')}. The build will be flagged as not feasible.`, 'Select anyway', true))) return;
        S().project.overrides[key] = id;
        m.close();
        recompute('Re-checking compatibility and recalculating…');
      }));
    };
    const m = UI.modal({
      title: `Change: ${s.label}`, size: 'wide',
      body: `<p class="small t2" style="margin-top:0">Statuses are evaluated against the current build${TK.matcher && ['liftMotor', 'cruiseMotor', 'liftProp', 'cruiseProp', 'liftEsc', 'battery', 'frame'].indexOf(key) !== -1 ? ' (with the other propulsion parts as selected — dependent parts are re-selected after you choose)' : ''}. Selecting a component recalculates weight, power and the BOM.</p>
        <div class="toolbar"><div class="search">${I('search', 15)}<input id="candQ" type="search" placeholder="Search ${cands.length} candidates" aria-label="Search candidates"></div><label class="check" style="min-height:0;padding:8px 12px"><input type="checkbox" id="candBad"><span>Show not-compatible</span></label></div>
        <div class="list" id="candList"></div>`,
      foot: `${S().project.overrides[key] ? '<button class="btn" data-auto>Let Tinkerer choose</button>' : ''}${s.need !== 'required' ? '<button class="btn ghost" data-ex>Remove from build</button>' : ''}<button class="btn ghost" data-close>Close</button>`,
      onMount: (el, mm) => {
        el.querySelector('#candQ').addEventListener('input', (ev) => { q = ev.target.value.toLowerCase(); render(mm); });
        el.querySelector('#candBad').addEventListener('change', (ev) => { showBad = ev.target.checked; render(mm); });
        const au = el.querySelector('[data-auto]');
        if (au) au.addEventListener('click', () => { delete S().project.overrides[key]; mm.close(); recompute(); });
        const ex = el.querySelector('[data-ex]');
        if (ex) ex.addEventListener('click', () => { S().project.overrides[key] = '__none__'; mm.close(); recompute(); });
      },
    });
    render(m);
  }

  TK.app.VIEWS.report = viewReport;
  TK.app.AFTER.report = afterReport;
})(typeof window !== 'undefined' ? window : globalThis);
