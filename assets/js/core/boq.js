/* Tinkerer — Bill of Quantities assembly and totals. */
(function (root) {
  'use strict';
  const TK = (root.TK = root.TK || {});
  const U = TK.util;

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  /**
   * opts: { req, defaultGst, qtyOverrides:{lineKey:qty}, extras:[{desc, amount, gst}], gstMode:'exclusive'|'inclusive', removed:{lineKey:true} }
   */
  function build(result, catalogue, opts) {
    opts = opts || {};
    const req = opts.req || {};
    const defGst = isFinite(opts.defaultGst) ? Number(opts.defaultGst) : 18;
    const inclusive = (opts.gstMode || req.gstMode) === 'inclusive';
    const qo = opts.qtyOverrides || {};
    const lines = [];
    const byItem = {};

    result.slots.forEach((s) => {
      if (s.na || s.excluded) return;
      if (s.pick) {
        const it = catalogue.byId[s.pick.id] || s.pick.item;
        if (!it) return;
        if (s.shareable && byItem[it.id]) {
          const L = byItem[it.id];
          L.functions.push(s.label);
          L.slotKeys.push(s.key);
          return;
        }
        const catDef = catalogue.categories[it.cat] || { label: it.cat };
        const L = {
          key: s.key, slotKeys: [s.key], functions: [s.label], itemId: it.id, category: catDef.label, slotLabel: s.label,
          name: it.name, manufacturer: it.manufacturer || '', model: it.model || '', specs: TK.catalogue.specSummary(it, catalogue),
          engineQty: s.qty, units: s.units, packQty: it.packQty || 1, unitPrice: it.price, gstPct: U.toNum(it.gst) !== null ? Number(it.gst) : defGst,
          vendor: it.vendor || '', vendorUrl: U.safeUrl(it.vendorUrl), url: U.safeUrl(it.url), unitWeight: it.weight, groundOnly: s.groundOnly,
          status: s.pick.status, pinned: !!s.pinned, justification: s.reason || '', stock: it.stock || '', remarks: it.remarks || '',
        };
        if (s.shareable) byItem[it.id] = L;
        lines.push(L);
      } else if (s.unresolved && s.need !== 'optional') {
        lines.push({ key: s.key, slotKeys: [s.key], functions: [s.label], unresolved: true, category: s.label, slotLabel: s.label, name: 'No suitable component found', specs: s.message || '', engineQty: 0, unitPrice: null, gstPct: defGst, status: 'unavailable', justification: s.closest ? `Closest in database: ${s.closest.item.name} (${TK.matcher.ST_LABEL[s.closest.status]})` : '' });
      }
    });

    // custom payloads entered on the form
    (req.payloads || []).forEach((p, i) => {
      if (p.type !== 'Custom') return;
      lines.push({
        key: 'custom_' + i, slotKeys: [], functions: ['Custom payload'], custom: true, category: 'Custom payload', slotLabel: 'Custom payload',
        name: p.description || 'Custom payload', manufacturer: '', model: '', specs: [p.weightG ? `${p.weightG} g` : '', p.powerW ? `${p.powerW} W` : ''].filter(Boolean).join(' · '),
        engineQty: Number(p.qty) || 1, units: Number(p.qty) || 1, packQty: 1, unitPrice: U.toNum(p.price), gstPct: defGst, vendor: p.supplier || 'Customer-supplied', unitWeight: U.toNum(p.weightG),
        status: 'manual', justification: 'Custom payload specified in the requirements.',
      });
    });

    const removed = opts.removed || {};
    const kept = lines.filter((L) => !removed[L.key]);
    let sub = 0, gst = 0, weightG = 0;
    kept.forEach((L, i) => {
      L.sr = i + 1;
      const ov = qo[L.key];
      L.qty = ov !== undefined && ov !== null && ov !== '' && isFinite(ov) ? Math.max(0, Number(ov)) : L.engineQty;
      L.qtyOverridden = L.qty !== L.engineQty && !L.unresolved;
      const price = L.unitPrice || 0;
      const lineGross = price * L.qty;
      if (inclusive) {
        L.taxable = round2(lineGross / (1 + L.gstPct / 100));
        L.gst = round2(lineGross - L.taxable);
      } else {
        L.taxable = round2(lineGross);
        L.gst = round2((lineGross * L.gstPct) / 100);
      }
      L.total = round2(L.taxable + L.gst);
      L.installedWeight = !L.groundOnly && L.unitWeight ? L.unitWeight * (L.units || L.qty) : 0;
      sub += L.taxable;
      gst += L.gst;
      weightG += L.installedWeight;
    });

    const droneQty = Math.max(1, Math.round(Number(req.droneQty) || 1));
    const extras = (opts.extras || []).filter((e) => e && (e.desc || e.amount)).map((e) => {
      const amt = Number(e.amount) || 0;
      const g = isFinite(Number(e.gst)) && e.gst !== '' ? Number(e.gst) : defGst;
      const taxable = inclusive ? round2(amt / (1 + g / 100)) : amt;
      const tax = inclusive ? round2(amt - taxable) : round2((amt * g) / 100);
      return { desc: e.desc || 'Additional expense', amount: amt, gstPct: g, taxable, gst: tax, total: round2(taxable + tax) };
    });
    const extrasTaxable = extras.reduce((s, e) => s + e.taxable, 0);
    const extrasGst = extras.reduce((s, e) => s + e.gst, 0);
    const perDrone = round2(sub + gst);
    const subtotal = round2(sub * droneQty + extrasTaxable);
    const gstTotal = round2(gst * droneQty + extrasGst);
    const grandTotal = round2(subtotal + gstTotal);
    const budget = U.toNum(req.budget);
    const budgetTotal = budget !== null ? (req.budgetBasis === 'order' ? budget : budget * droneQty) : null;
    const an = result.analysis || {};
    return {
      lines: kept, removedLines: lines.filter((L) => removed[L.key]), extras, droneQty, inclusive,
      perDroneSubtotal: round2(sub), perDroneGst: round2(gst), perDroneTotal: perDrone,
      extrasTaxable: round2(extrasTaxable), extrasGst: round2(extrasGst), extrasTotal: round2(extrasTaxable + extrasGst),
      subtotal, gstTotal, grandTotal,
      componentWeightG: weightG, mtowKg: an.mass || null,
      budget: budgetTotal, budgetVariance: budgetTotal !== null ? round2(budgetTotal - grandTotal) : null, overBudget: budgetTotal !== null && grandTotal > budgetTotal,
      unresolvedCount: kept.filter((L) => L.unresolved).length, feasibility: result.feasibility,
    };
  }

  TK.boq = { build };
})(typeof window !== 'undefined' ? window : globalThis);
