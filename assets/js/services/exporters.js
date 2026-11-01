/* Tinkerer — Excel / PDF / print exports. Every text cell is formula-safe. */
(function (root) {
  'use strict';
  const TK = (root.TK = root.TK || {});
  const U = TK.util;
  const INR_FMT = '[>=10000000]"₹"##\\,##\\,##\\,##0.00;[>=100000]"₹"##\\,##\\,##0.00;"₹"##,##0.00';
  const STL = () => TK.matcher.ST_LABEL;

  function stamp() {
    const d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }
  function fileSafe(s) {
    return String(s || 'Tinkerer').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'Tinkerer';
  }
  function aoaSheet(aoa, widths) {
    const ws = root.XLSX.utils.aoa_to_sheet(aoa.map((r) => r.map(U.safeCell)));
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
    return ws;
  }
  const README = [
    ['Tinkerer component master'],
    ['One tab per category, row 1 = headers, one component per row. "Component ID" must be unique.'],
    ['Price (INR) is per pack; Weight (g) is per single unit; Units per Pack = 2 for propeller pairs.'],
    ['Stock Status: In Stock / Limited / Out of Stock / On Order / Discontinued.'],
    ['Tabs/columns starting with "_" are private and never published by the Apps Script API.'],
  ];

  function catalogueWorkbook(cat, includeEmpty) {
    const wb = root.XLSX.utils.book_new();
    root.XLSX.utils.book_append_sheet(wb, aoaSheet(README, [120]), '_README');
    TK.catalogue.toSheets(cat, { includeEmpty }).forEach((s) => {
      root.XLSX.utils.book_append_sheet(wb, aoaSheet([s.headers].concat(s.rows), s.headers.map((h) => Math.max(12, Math.min(40, String(h).length + 2)))), s.name.slice(0, 31));
    });
    return wb;
  }
  function exportCatalogue(cat) {
    root.XLSX.writeFile(catalogueWorkbook(cat, false), `Tinkerer_Component_Database_${stamp()}.xlsx`);
  }
  function downloadTemplate() {
    root.XLSX.writeFile(catalogueWorkbook(TK.catalogue.emptyCatalogue({}), true), 'Tinkerer_Component_Master_Template.xlsx');
  }

  // ------------------------------------------------------------------ BOQ data shaping
  function header(ctx) {
    const p = ctx.project, req = p.req, s = ctx.settings;
    const r = ctx.result;
    return {
      company: s.company.name || 'Tinkerer',
      title: 'Bill of Materials (BOM)',
      project: req.projectName || 'Untitled project',
      ref: req.projectRef || p.quoteNo || '',
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      config: `${req.aircraftClass || 'Multirotor'} · ${req.configuration || ''} · ${req.application || ''}`.replace(/ · $/, ''),
      power: `${r.cells}S${r.parallel > 1 ? ' × ' + r.parallel + ' packs' : ''}`,
      draft: ctx.boq.unresolvedCount > 0 || r.feasibility === 'infeasible' || ctx.test,
    };
  }
  function engineeringRows(ctx) {
    const a = ctx.result.analysis || {}, b = ctx.boq;
    const rows = [
      ['Feasibility', { feasible: 'Feasible', conditional: 'Feasible with conditions', infeasible: 'Not feasible' }[ctx.result.feasibility]],
      ['Estimated take-off weight (MTOW)', a.mass ? U.fmt(a.mass, 2) + ' kg' : '—'],
      ['Total installed component weight', U.fmt(b.componentWeightG / 1000, 2) + ' kg'],
      ['Battery system', `${ctx.result.cells}S, ${ctx.result.parallel * (ctx.result.series || 1)} pack(s)`],
    ];
    if (a.twActual) rows.push(['Thrust-to-weight ratio', U.fmt(a.twActual, 2) + ` (required ${U.fmt(a.twRequired, 2)})`]);
    if (a.rotor) rows.push(['Hover power (incl. margin)', U.fmt(a.rotor.Phover, 0) + ' W']);
    if (a.wing) rows.push(['Cruise power', U.fmt(ctx.result.layout.cls === 'hybrid' ? a.pw.cruiseShaft : a.wing.Pcruise, 0) + ' W']);
    rows.push(['Mission time required', U.fmt(a.missionTimeS / 60, 1) + ' min']);
    if (a.estimatedEnduranceMin != null) rows.push(['Estimated mission endurance (with reserve)', U.fmt(a.estimatedEnduranceMin, 1) + ' min']);
    if (a.theoreticalEnduranceMin != null) rows.push(['Theoretical endurance (upper bound, not guaranteed)', U.fmt(a.theoreticalEnduranceMin, 1) + ' min']);
    if (a.peakCurrentA) rows.push(['Peak current', U.fmt(a.peakCurrentA, 0) + ' A']);
    if (a.fuelKg) rows.push(['Fuel (hybrid, incl. reserve)', U.fmt(a.fuelKg, 2) + ' kg']);
    return rows;
  }

  // ------------------------------------------------------------------ Excel
  function exportBoqXlsx(ctx) {
    const h = header(ctx), b = ctx.boq;
    const aoa = [
      [h.company],
      [h.title + (h.draft ? ' — DRAFT' : '')],
      ['Project', h.project, '', 'Reference', h.ref, '', 'Date', h.date],
      ['Configuration', h.config, '', 'Power system', h.power, '', 'Drones', b.droneQty],
      [],
    ];
    const cols = ['Sr. No.', 'Category', 'Component', 'Manufacturer', 'Model', 'Specifications', 'Qty', 'Unit Price (INR)', 'GST %', 'Taxable (INR)', 'GST (INR)', 'Total (INR)', 'Vendor', 'Vendor Website', 'Product URL', 'Unit Weight (g)', 'Installed Weight (g)', 'Compatibility', 'Selection justification'];
    const headRow = aoa.length;
    aoa.push(cols);
    b.lines.forEach((L) => {
      aoa.push([L.sr, L.category, L.name + (L.functions && L.functions.length > 1 ? ` (serves ${L.functions.join(' + ')})` : ''), L.manufacturer || '', L.model || '', L.specs || '', L.qty, L.unitPrice ?? '', L.gstPct, L.taxable, L.gst, L.total, L.vendor || '', L.vendorUrl || '', L.url || '', L.unitWeight ?? '', L.installedWeight || '', STL()[L.status] || '', L.justification || '']);
    });
    const firstLine = headRow + 1, lastLine = aoa.length - 1;
    aoa.push([]);
    const tot = [];
    tot.push(['', '', 'Per-drone subtotal (taxable)', '', '', '', '', '', '', b.perDroneSubtotal]);
    tot.push(['', '', 'Per-drone GST', '', '', '', '', '', '', b.perDroneGst]);
    tot.push(['', '', 'Per-drone total', '', '', '', '', '', '', b.perDroneTotal]);
    if (b.droneQty > 1) tot.push(['', '', `× ${b.droneQty} drones`, '', '', '', '', '', '', b.perDroneTotal * b.droneQty]);
    b.extras.forEach((e) => tot.push(['', '', `Additional: ${e.desc}`, '', '', '', '', '', e.gstPct, e.taxable, e.gst, e.total]));
    tot.push(['', '', 'Subtotal (taxable)', '', '', '', '', '', '', b.subtotal]);
    tot.push(['', '', 'GST', '', '', '', '', '', '', b.gstTotal]);
    tot.push(['', '', 'GRAND TOTAL', '', '', '', '', '', '', b.grandTotal]);
    if (b.budget !== null) {
      tot.push(['', '', 'Customer budget', '', '', '', '', '', '', b.budget]);
      tot.push(['', '', b.budgetVariance >= 0 ? 'Within budget by' : 'Over budget by', '', '', '', '', '', '', Math.abs(b.budgetVariance)]);
    }
    const totStart = aoa.length;
    tot.forEach((r) => aoa.push(r));
    aoa.push([]);
    aoa.push(['Engineering summary (estimates)']);
    engineeringRows(ctx).forEach((r) => aoa.push(['', r[0], '', r[1]]));
    aoa.push([]);
    aoa.push(['Notes']);
    (ctx.result.confidence || []).forEach((n) => aoa.push(['', n]));
    if (ctx.settings.company.terms) aoa.push(['', ctx.settings.company.terms]);
    if (ctx.test) aoa.push(['', 'TEST catalogue data — not a valid quotation.']);

    const ws = aoaSheet(aoa, [7, 18, 38, 16, 14, 40, 6, 15, 7, 15, 13, 15, 18, 26, 34, 11, 12, 22, 60]);
    const X = root.XLSX.utils;
    for (let r = firstLine; r <= lastLine; r++) {
      [7, 9, 10, 11].forEach((c) => {
        const cell = ws[X.encode_cell({ r, c })];
        if (cell && typeof cell.v === 'number') cell.z = INR_FMT;
      });
      [13, 14].forEach((c) => {
        const cell = ws[X.encode_cell({ r, c })];
        if (cell && cell.v && /^https?:/.test(cell.v)) cell.l = { Target: cell.v };
      });
    }
    for (let r = totStart; r < totStart + tot.length; r++) {
      [9, 10, 11].forEach((c) => {
        const cell = ws[X.encode_cell({ r, c })];
        if (cell && typeof cell.v === 'number') cell.z = INR_FMT;
      });
    }
    ws['!autofilter'] = { ref: X.encode_range({ s: { r: headRow, c: 0 }, e: { r: lastLine, c: cols.length - 1 } }) };
    const wb = X.book_new();
    X.book_append_sheet(wb, ws, 'BOM');

    const eng = [['Section', 'Item', 'Value', 'Unit', 'Status', 'Note']];
    (ctx.result.report || []).forEach((sec) => sec.rows.forEach((r) => eng.push([sec.title, r.label, r.value, r.unit, r.flag === 'bad' ? 'NOT OK' : r.flag === 'warn' ? 'Check' : r.flag === 'ok' ? 'OK' : '', r.note])));
    eng.push([]);
    (ctx.result.flags || []).forEach((f) => eng.push(['Flag', f.level.toUpperCase(), f.text]));
    X.book_append_sheet(wb, aoaSheet(eng, [26, 60, 18, 18, 9, 50]), 'Engineering');

    const reqRows = [['Requirement', 'Value']];
    Object.keys(ctx.project.req).forEach((k) => {
      const v = ctx.project.req[k];
      if (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length)) return;
      reqRows.push([k, typeof v === 'object' ? JSON.stringify(v) : v]);
    });
    X.book_append_sheet(wb, aoaSheet(reqRows, [28, 90]), 'Requirements');
    const asm = [['Assumption', 'Value', 'Unit']];
    TK.sizing.A_META.forEach((m) => asm.push([m[0] + ' — ' + m[2], ctx.result.assumptions[m[1]], m[3]]));
    X.book_append_sheet(wb, aoaSheet(asm, [60, 10, 10]), 'Assumptions');
    root.XLSX.writeFile(wb, `BOM_${fileSafe(h.project)}_${stamp()}.xlsx`);
  }

  // ------------------------------------------------------------------ PDF
  function exportBoqPdf(ctx) {
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const h = header(ctx), b = ctx.boq;
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const M = 36;
    const ink = [20, 28, 45], muted = [100, 110, 125], accent = [37, 99, 235];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...ink);
    doc.text(h.company, M, M + 6);
    doc.setFontSize(11);
    doc.setTextColor(...accent);
    doc.text(h.title + (h.draft ? ' — DRAFT' : ''), M, M + 24);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    const co = ctx.settings.company;
    const right = [co.address, co.gstin ? 'GSTIN ' + co.gstin : '', [co.phone, co.email].filter(Boolean).join(' · ')].filter(Boolean);
    right.forEach((t, i) => doc.text(String(t), W - M, M + i * 12, { align: 'right', maxWidth: 260 }));
    const info = [['Project', h.project], ['Reference', h.ref || '—'], ['Date', h.date], ['Configuration', h.config], ['Power system', h.power], ['Drones', String(b.droneQty)]];
    doc.autoTable({
      startY: M + 36, margin: { left: M, right: M }, theme: 'plain', styles: { fontSize: 8.5, cellPadding: 2, textColor: ink },
      body: [info.slice(0, 3).flatMap((x) => [x[0], x[1]]), info.slice(3).flatMap((x) => [x[0], x[1]])],
      columnStyles: { 0: { fontStyle: 'bold', textColor: muted }, 2: { fontStyle: 'bold', textColor: muted }, 4: { fontStyle: 'bold', textColor: muted } },
    });
    const body = b.lines.map((L) => [
      L.sr, L.category,
      L.name + (L.model ? `\nModel: ${L.model}` : '') + (L.manufacturer ? ` · ${L.manufacturer}` : '') + (L.specs ? `\n${L.specs}` : '') + (L.functions && L.functions.length > 1 ? `\nServes: ${L.functions.join(' + ')}` : ''),
      L.qty, L.unitPrice != null ? U.inrPlain(L.unitPrice) : '-', L.gstPct + '%', U.inrPlain(L.total), L.vendor || '-', L.unitWeight != null ? U.fmt(L.unitWeight, 0) + ' g' : '-', (STL()[L.status] || '').replace('Compatible with conditions', 'Conditional').replace('Requires manual verification', 'Verify'),
    ]);
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 8, margin: { left: M, right: M },
      head: [['#', 'Category', 'Component / model / specifications', 'Qty', 'Unit price', 'GST', 'Total', 'Vendor', 'Unit wt', 'Status']],
      body, theme: 'grid',
      styles: { fontSize: 7.6, cellPadding: 3, lineColor: [215, 220, 228], lineWidth: 0.4, textColor: ink, valign: 'top' },
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [239, 246, 255] },
      columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 78 }, 2: { cellWidth: 250 }, 3: { cellWidth: 28, halign: 'right' }, 4: { cellWidth: 70, halign: 'right' }, 5: { cellWidth: 32, halign: 'right' }, 6: { cellWidth: 74, halign: 'right' }, 7: { cellWidth: 80 }, 8: { cellWidth: 42, halign: 'right' } },
      didParseCell: (d) => {
        if (d.section !== 'body') return;
        const L = b.lines[d.row.index];
        if (L && L.unresolved) d.cell.styles.textColor = [185, 40, 40];
      },
      didDrawCell: (d) => {
        if (d.section === 'body' && d.column.index === 2) {
          const L = b.lines[d.row.index];
          if (L && L.url) doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: L.url });
        }
      },
    });
    const tot = [['Per-drone subtotal (taxable)', U.inrPlain(b.perDroneSubtotal)], ['Per-drone GST', U.inrPlain(b.perDroneGst)], ['Per-drone total', U.inrPlain(b.perDroneTotal)]];
    if (b.droneQty > 1) tot.push([`x ${b.droneQty} drones`, U.inrPlain(b.perDroneTotal * b.droneQty)]);
    b.extras.forEach((e) => tot.push(['Additional: ' + e.desc, U.inrPlain(e.total)]));
    tot.push(['Subtotal (taxable)', U.inrPlain(b.subtotal)], ['GST', U.inrPlain(b.gstTotal)], ['GRAND TOTAL', U.inrPlain(b.grandTotal)]);
    if (b.budget !== null) tot.push(['Customer budget', U.inrPlain(b.budget)], [b.budgetVariance >= 0 ? 'Within budget by' : 'Over budget by', U.inrPlain(Math.abs(b.budgetVariance))]);
    let y = doc.lastAutoTable.finalY + 10;
    if (y > H - 200) { doc.addPage(); y = M; }
    doc.autoTable({
      startY: y, margin: { left: W - M - 260, right: M }, theme: 'plain', body: tot, styles: { fontSize: 8.5, cellPadding: 2.5, textColor: ink },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: (d) => { if (/GRAND/.test(d.row.raw[0])) { d.cell.styles.fontSize = 10; d.cell.styles.textColor = accent; d.cell.styles.fontStyle = 'bold'; } if (/Over budget/.test(d.row.raw[0])) d.cell.styles.textColor = [185, 40, 40]; },
    });
    doc.autoTable({
      startY: y, margin: { left: M, right: 320 }, theme: 'plain', head: [['Engineering summary (estimates)', '']], body: engineeringRows(ctx),
      styles: { fontSize: 8, cellPadding: 2, textColor: ink }, headStyles: { textColor: accent, fontStyle: 'bold' }, columnStyles: { 0: { textColor: muted } },
    });
    y = Math.max(doc.lastAutoTable.finalY, y) + 12;
    const notes = (ctx.result.confidence || []).concat(ctx.settings.company.terms ? [ctx.settings.company.terms] : []).concat(h.draft ? ['DRAFT: this BOM has unresolved items or an infeasible configuration' + (ctx.test ? ' and uses TEST catalogue data' : '') + ' — not a valid quotation.'] : []);
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    notes.forEach((n) => {
      const lines = doc.splitTextToSize('• ' + n, W - 2 * M);
      if (y + lines.length * 9 > H - 30) { doc.addPage(); y = M; }
      doc.text(lines, M, y);
      y += lines.length * 9 + 2;
    });
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(...muted);
      doc.text(`${h.project} · ${h.ref || ''} · Generated with Tinkerer on ${h.date}`, M, H - 16);
      doc.text(`Page ${i} of ${pages}`, W - M, H - 16, { align: 'right' });
      if (h.draft) {
        doc.setTextColor(220, 80, 80);
        doc.setFontSize(48);
        doc.text('DRAFT', W / 2, H / 2, { align: 'center', angle: 25, renderingMode: 'stroke' });
      }
    }
    doc.save(`BOM_${fileSafe(h.project)}_${stamp()}.pdf`);
  }

  // ------------------------------------------------------------------ print (HTML)
  function boqPrintHtml(ctx) {
    const h = header(ctx), b = ctx.boq, e = U.esc, co = ctx.settings.company;
    const rows = b.lines.map((L) => `<tr class="${L.unresolved ? 'unres' : ''}"><td>${L.sr}</td><td>${e(L.category)}</td><td><b>${e(L.name)}</b>${L.model ? `<br><span class="m">Model ${e(L.model)}${L.manufacturer ? ' · ' + e(L.manufacturer) : ''}</span>` : ''}${L.specs ? `<br><span class="m">${e(L.specs)}</span>` : ''}${L.url ? `<br><span class="m">${e(L.url)}</span>` : ''}</td><td class="n">${L.qty}</td><td class="n">${L.unitPrice != null ? U.inr(L.unitPrice, true) : '—'}</td><td class="n">${L.gstPct}%</td><td class="n">${U.inr(L.total, true)}</td><td>${e(L.vendor || '—')}</td><td class="n">${L.unitWeight != null ? U.fmt(L.unitWeight, 0) + ' g' : '—'}</td><td>${e(STL()[L.status] || '')}</td></tr>`).join('');
    const tot = [['Per-drone subtotal (taxable)', b.perDroneSubtotal], ['Per-drone GST', b.perDroneGst], ['Per-drone total', b.perDroneTotal]];
    if (b.droneQty > 1) tot.push([`× ${b.droneQty} drones`, b.perDroneTotal * b.droneQty]);
    b.extras.forEach((x) => tot.push(['Additional: ' + x.desc, x.total]));
    tot.push(['Subtotal (taxable)', b.subtotal], ['GST', b.gstTotal], ['Grand total', b.grandTotal]);
    if (b.budget !== null) tot.push(['Customer budget', b.budget], [b.budgetVariance >= 0 ? 'Within budget by' : 'Over budget by', Math.abs(b.budgetVariance)]);
    return `<div class="print-doc">
      <div class="ph"><div><h1>${e(h.company)}</h1><h2>${e(h.title)}${h.draft ? ' — DRAFT' : ''}</h2></div><div class="pc">${[co.address, co.gstin ? 'GSTIN ' + co.gstin : '', co.phone, co.email].filter(Boolean).map(e).join('<br>')}</div></div>
      <table class="pi"><tr><th>Project</th><td>${e(h.project)}</td><th>Reference</th><td>${e(h.ref || '—')}</td><th>Date</th><td>${e(h.date)}</td></tr><tr><th>Configuration</th><td>${e(h.config)}</td><th>Power</th><td>${e(h.power)}</td><th>Drones</th><td>${b.droneQty}</td></tr></table>
      <table class="pt"><thead><tr><th>#</th><th>Category</th><th>Component</th><th>Qty</th><th>Unit price</th><th>GST</th><th>Total</th><th>Vendor</th><th>Unit wt</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="pf"><table class="pe"><tr><th colspan="2">Engineering summary (estimates)</th></tr>${engineeringRows(ctx).map((r) => `<tr><td>${e(r[0])}</td><td>${e(r[1])}</td></tr>`).join('')}</table>
      <table class="ptot">${tot.map((t) => `<tr class="${/Grand/.test(t[0]) ? 'g' : /Over/.test(t[0]) ? 'o' : ''}"><td>${e(t[0])}</td><td class="n">${U.inr(t[1], true)}</td></tr>`).join('')}</table></div>
      <ul class="pn">${(ctx.result.confidence || []).concat(co.terms ? [co.terms] : []).map((n) => `<li>${e(n)}</li>`).join('')}${h.draft ? '<li><b>DRAFT — unresolved items or infeasible configuration; not a valid quotation.</b></li>' : ''}</ul>
      <div class="sig"><div>Prepared by</div><div>Authorised signatory</div></div>
    </div>`;
  }

  function exportJson(obj, name) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }

  TK.exporters = { exportCatalogue, downloadTemplate, exportBoqXlsx, exportBoqPdf, boqPrintHtml, exportJson, catalogueWorkbook, stamp, fileSafe };
})(typeof window !== 'undefined' ? window : globalThis);
