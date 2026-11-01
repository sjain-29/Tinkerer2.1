/* Tinkerer — catalogue normalisation, validation and export shaping.
 * Every data source (Apps Script JSON, published-sheet CSV, Excel import)
 * is first converted to  [{ name, headers:[...], rows:[[...]] }]  and then
 * passed through build() — one validation path for all sources.
 */
(function (root) {
  'use strict';
  const TK = (root.TK = root.TK || {});
  const U = TK.util;
  const S = TK.schema;

  const MAX_TEXT = 400;
  const CHEM_V = { lipo: 3.7, lihv: 3.8, liion: 3.6, 'semisolid': 3.7, solidstate: 3.7, lifepo4: 3.2 };

  function nominalCellVoltage(chem, assumptions) {
    const c = U.norm(chem);
    const a = assumptions || {};
    if (c.indexOf('lihv') !== -1) return a.vCellLiHV || 3.8;
    if (c.indexOf('liion') !== -1 || c.indexOf('21700') !== -1 || c.indexOf('18650') !== -1) return a.vCellLiIon || 3.6;
    if (c.indexOf('lifepo') !== -1) return 3.2;
    if (c.indexOf('semi') !== -1 || c.indexOf('solid') !== -1) return a.vCellSemiSolid || 3.7;
    return a.vCellLiPo || 3.7;
  }

  function matchCategory(sheetName) {
    const n = U.norm(sheetName);
    if (!n) return null;
    for (const c of S.CATEGORIES) {
      if (U.norm(c.label) === n || U.norm(c.key) === n || (c.aliases || []).some((a) => U.norm(a) === n)) return c;
    }
    return null;
  }
  function isThrustSheet(sheetName) {
    const n = U.norm(sheetName);
    return U.norm(S.THRUST_TABLE.label) === n || S.THRUST_TABLE.aliases.some((a) => U.norm(a) === n);
  }

  function headerMap(fields) {
    const map = {};
    const put = (key, f) => {
      if (key && !(key in map)) map[key] = f;
    };
    fields.forEach((f) => put(U.norm(f.label), f));
    fields.forEach((f) => put(U.norm(f.k), f));
    fields.forEach((f) => (f.aliases || []).forEach((a) => put(U.norm(a), f)));
    return map;
  }

  function normStock(v) {
    if (v === null || v === undefined || v === '') return '';
    const s = String(v).toLowerCase();
    if (/discontinu|eol|obsolete|not available/.test(s)) return 'Discontinued';
    if (/out of stock|out-of-stock|sold out|^out$|unavailable|no stock/.test(s)) return 'Out of Stock';
    if (/order|backorder|pre-?order|lead/.test(s)) return 'On Order';
    if (/limited|low/.test(s)) return 'Limited';
    if (/in stock|in-stock|available|yes|^y$/.test(s)) return 'In Stock';
    return String(v).slice(0, 40);
  }

  function cleanText(v, max) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
    return s.length > (max || MAX_TEXT) ? s.slice(0, max || MAX_TEXT) : s;
  }

  function coerce(f, raw, issues, ctx) {
    if (raw === null || raw === undefined || raw === '') return null;
    switch (f.type) {
      case 'num': {
        const n = U.toNum(raw);
        if (n === null) {
          issues.push({ level: 'warn', where: ctx, msg: `"${f.label}" is not a number ("${cleanText(raw, 40)}") — ignored.` });
          return null;
        }
        return n;
      }
      case 'bool':
        return U.toBool(raw);
      case 'list':
        return U.toList(cleanText(raw));
      case 'url': {
        const u = U.safeUrl(raw);
        if (!u) issues.push({ level: 'warn', where: ctx, msg: `"${f.label}" is not a valid http(s) link — removed.` });
        return u || null;
      }
      default:
        return cleanText(raw);
    }
  }

  function guessType(values) {
    const nonEmpty = values.filter((v) => v !== null && v !== undefined && v !== '');
    if (!nonEmpty.length) return 'text';
    const nums = nonEmpty.filter((v) => typeof v === 'number' || /^\s*-?\d+(\.\d+)?\s*$/.test(String(v)));
    return nums.length / nonEmpty.length > 0.8 ? 'num' : 'text';
  }

  function customCategory(sheet) {
    const commonMap = headerMap(S.COMMON);
    const fields = [];
    sheet.headers.forEach((h, i) => {
      const n = U.norm(h);
      if (!n || commonMap[n] || n === 'category') return;
      fields.push({ k: 'x_' + n, label: String(h).trim(), type: guessType(sheet.rows.map((r) => r[i])), aliases: [] });
    });
    return { key: 'custom-' + U.slug(sheet.name), label: String(sheet.name).trim(), singular: String(sheet.name).trim(), group: 'Custom', custom: true, fields, summary: fields.slice(0, 3).map((f) => f.k), aliases: [] };
  }

  /** Build the in-memory catalogue from normalised sheets. */
  function build(sheets, meta) {
    const issues = [];
    const items = [];
    const categories = {};
    const thrust = [];
    const seenIds = {};
    S.CATEGORIES.forEach((c) => (categories[c.key] = c));

    (sheets || []).forEach((sheet) => {
      if (!sheet || !sheet.name || /^_/.test(String(sheet.name))) return;
      const headers = (sheet.headers || []).map((h) => cleanText(h, 120));
      const rows = sheet.rows || [];

      if (isThrustSheet(sheet.name)) {
        const hm = headerMap(S.THRUST_TABLE.fields);
        rows.forEach((r, ri) => {
          const o = {};
          headers.forEach((h, i) => {
            const f = hm[U.norm(h)];
            if (f) o[f.k] = coerce(f, r[i], issues, `${sheet.name} row ${ri + 2}`);
          });
          if (o.motorId && o.thrust !== null && o.thrust !== undefined) thrust.push(o);
        });
        return;
      }

      let cat = matchCategory(sheet.name);
      if (!cat) {
        cat = customCategory({ name: sheet.name, headers, rows });
        categories[cat.key] = cat;
      }
      const fields = S.allFields(cat);
      const hm = headerMap(fields);
      const colField = headers.map((h) => hm[U.norm(h)] || null);

      rows.forEach((r, ri) => {
        if (!r || r.every((v) => v === null || v === undefined || String(v).trim() === '')) return;
        const where = `${sheet.name} row ${ri + 2}`;
        const it = { cat: cat.key, spec: {}, extra: {}, _sheet: sheet.name, _row: ri + 2 };
        headers.forEach((h, i) => {
          const f = colField[i];
          const raw = r[i];
          if (!f) {
            if (h && raw !== null && raw !== undefined && raw !== '' && U.norm(h) !== 'category') it.extra[h] = cleanText(raw);
            return;
          }
          const val = coerce(f, raw, issues, where);
          if (S.COMMON.indexOf(f) !== -1) it[f.k] = val;
          else if (val !== null) it.spec[f.k] = val;
        });

        if (!it.name) {
          issues.push({ level: 'error', where, msg: 'Row skipped — "Component Name" is empty.' });
          return;
        }
        it.name = cleanText(it.name, 160);
        if (it.price !== null && it.price !== undefined && it.price < 0) {
          issues.push({ level: 'warn', where, msg: 'Negative price ignored.' });
          it.price = null;
        }
        if (it.price === null || it.price === undefined) issues.push({ level: 'warn', where, msg: `"${it.name}" has no price — it will appear in the BOQ without cost.` });
        if (it.weight !== null && it.weight !== undefined && it.weight < 0) it.weight = null;
        if (it.weight === null || it.weight === undefined) issues.push({ level: 'info', where, msg: `"${it.name}" has no weight — weight calculations will treat it as 0 g.` });
        if (it.gst !== null && it.gst !== undefined && (it.gst < 0 || it.gst > 40)) {
          issues.push({ level: 'warn', where, msg: `GST ${it.gst}% looks wrong — default GST will be used.` });
          it.gst = null;
        }
        it.packQty = it.packQty && it.packQty > 0 ? Math.round(it.packQty) : 1;
        it.stock = normStock(it.stock);

        // Category-specific derivations
        const sp = it.spec;
        if (sp.cellRange && (sp.cellsMin == null || sp.cellsMax == null)) {
          const rg = U.parseCellRange(sp.cellRange);
          if (rg) {
            if (sp.cellsMin == null) sp.cellsMin = rg.min;
            if (sp.cellsMax == null) sp.cellsMax = rg.max;
          }
        }
        delete sp.cellRange;
        if (cat.key === 'batteries') {
          if (sp.cells == null && sp.voltageV != null) {
            const v = sp.voltageV;
            if (Number.isInteger(v) && v <= 14 && Math.abs(v / 3.7 - Math.round(v / 3.7)) > 0.15) {
              sp.cells = v; // legacy sheets stored "voltage" as cell count
              sp.voltageV = null;
              issues.push({ level: 'info', where, msg: `Battery voltage "${v}" interpreted as ${v}S.` });
            } else sp.cells = Math.round(v / nominalCellVoltage(sp.chemistry));
          }
          if (sp.voltageV == null && sp.cells) sp.voltageV = +(sp.cells * nominalCellVoltage(sp.chemistry)).toFixed(2);
          if (sp.energy == null && sp.voltageV && sp.capacity) sp.energy = +((sp.voltageV * sp.capacity) / 1000).toFixed(1);
        }
        if (cat.key === 'ubecs' && sp.outputVoltage != null) {
          const nums = String(sp.outputVoltage).match(/\d+(\.\d+)?/g);
          sp.outputVoltageMax = nums ? Math.max.apply(null, nums.map(Number)) : null;
        }

        // IDs
        let id = it.id ? cleanText(it.id, 80) : '';
        if (!id) {
          id = `${cat.key}-r${ri + 2}`;
          issues.push({ level: 'info', where, msg: `"${it.name}" has no Component ID — using "${id}". Add an ID so saved projects can find it after rows move.` });
        }
        if (seenIds[id]) {
          const nid = `${id}~${ri + 2}`;
          issues.push({ level: 'warn', where, msg: `Duplicate Component ID "${id}" (also in ${seenIds[id]}) — renamed to "${nid}".` });
          id = nid;
        }
        seenIds[id] = where;
        it.id = id;
        items.push(it);
      });
    });

    const byId = {};
    const byCat = {};
    items.forEach((it) => {
      byId[it.id] = it;
      (byCat[it.cat] = byCat[it.cat] || []).push(it);
    });
    return { meta: Object.assign({ builtAt: new Date().toISOString() }, meta || {}), categories, items, byId, byCat, thrust, issues };
  }

  function categoryList(cat) {
    return Object.values(cat.categories).sort((a, b) => {
      const ia = S.CATEGORIES.indexOf(a), ib = S.CATEGORIES.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.label.localeCompare(b.label);
    });
  }

  function specValue(it, f) {
    if (S.COMMON.indexOf(f) !== -1) return it[f.k];
    return it.spec[f.k];
  }

  function displayVal(v) {
    if (v === null || v === undefined || v === '') return '';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return v;
  }

  /** Short spec summary for tables/BOQ: "KV 170 · Max Thrust 5200 g". */
  function specSummary(it, catalogue, limit) {
    const cat = (catalogue && catalogue.categories[it.cat]) || S.byKey[it.cat];
    if (!cat) return '';
    const keys = cat.summary && cat.summary.length ? cat.summary : cat.fields.slice(0, 3).map((f) => f.k);
    const parts = [];
    keys.forEach((k) => {
      const f = cat.fields.find((x) => x.k === k);
      const v = it.spec[k];
      if (!f || v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return;
      const unit = (f.label.match(/\(([^)]+)\)/) || [])[1];
      const name = f.label.replace(/\s*\(.*?\)/, '');
      parts.push(`${name} ${displayVal(v)}${unit && unit !== 'S' ? ' ' + unit : unit === 'S' ? 'S' : ''}`);
    });
    return parts.slice(0, limit || 4).join(' · ');
  }

  /** Rows for export: one sheet per category in template format. */
  function toSheets(catalogue, opts) {
    const out = [];
    const withEmpty = opts && opts.includeEmpty;
    categoryList(catalogue).forEach((cat) => {
      const its = catalogue.byCat[cat.key] || [];
      if (!its.length && !withEmpty) return;
      const fields = S.COMMON.concat(cat.fields.filter((f) => !f.hidden));
      const extraHeaders = [];
      its.forEach((it) => Object.keys(it.extra || {}).forEach((h) => extraHeaders.indexOf(h) === -1 && extraHeaders.push(h)));
      const headers = fields.map((f) => f.label).concat(extraHeaders);
      const rows = its.map((it) => fields.map((f) => displayVal(specValue(it, f))).concat(extraHeaders.map((h) => it.extra[h] || '')));
      out.push({ name: cat.label, headers, rows });
    });
    if (catalogue.thrust && (catalogue.thrust.length || withEmpty)) {
      const fs = S.THRUST_TABLE.fields;
      out.push({ name: S.THRUST_TABLE.label, headers: fs.map((f) => f.label), rows: catalogue.thrust.map((r) => fs.map((f) => displayVal(r[f.k]))) });
    }
    return out;
  }

  function emptyCatalogue(meta) {
    return build([], meta);
  }

  /** Convert a Tinkerer 1.x Firebase export ({components:{cat:{id:item}}}) into sheets. */
  function legacyToSheets(fb) {
    const comps = (fb && fb.components) || fb || {};
    const map = {
      frame: ['frames', { type: 'frameType', wheelbase: 'wheelbase', maxPropSize: 'maxProp', arms: 'arms' }],
      landingGear: ['landingGear', { gearType: 'gearType', height: 'height' }],
      motor: ['motors', { kv: 'kv', maxThrust: 'maxThrust', voltage: 'cellRange', maxCurrent: 'maxCurrent' }],
      esc: ['escs', { currentRating: 'contCurrent', cellCompatibility: 'cellRange' }],
      pdb: ['pdbs', { maxCurrent: 'maxCurrent', voltageRange: 'cellRange', outputs: 'outputs' }],
      powerModule: ['powerModules', { maxCurrent: 'maxCurrent', voltageRange: 'cellRange', outputVoltage: 'outputVoltage' }],
      propeller: ['propellers', { diameter: 'diameter', pitch: 'pitch' }],
      fc: ['flightControllers', { mcu: 'mcu', imu: 'imu', uarts: 'uarts' }],
      gps: ['gps', { constellations: 'constellations', updateRate: 'updateRate' }],
      rtk: ['rtk', { accuracy: 'accuracy', updateRate: 'updateRate' }],
      transmitter: ['transmitters', { channels: 'channels', frequency: 'frequency', rangeKm: 'range', protocol: 'protocol' }],
      receiver: ['receivers', { channels: 'channels', protocol: 'protocol', frequency: 'frequency' }],
      patchAntenna: ['antennas', { gain: 'gain', frequency: 'frequency', polarization: 'polarization', connector: 'connector' }],
      camera: ['cameras', { resolution: 'sensorMP', fov: 'fov', power: 'power', interface: 'interface' }],
      lidar: ['lidar', { range: 'range', power: 'power', interface: 'interface' }],
      battery: ['batteries', { capacity: 'capacity', voltage: 'cells', cRating: 'cRating' }],
    };
    const today = new Date().toISOString().slice(0, 10);
    const sheets = [];
    Object.keys(map).forEach((oldKey) => {
      const items = comps[oldKey];
      if (!items || typeof items !== 'object') return;
      const [newKey, fmap] = map[oldKey];
      const cat = S.byKey[newKey];
      const specKeys = Object.values(fmap);
      const headers = ['Component ID', 'Component Name', 'Price (INR)', 'Weight (g)', 'Product URL', 'Stock Status', 'Last Updated', 'Remarks']
        .concat(specKeys.map((k) => (cat.fields.find((f) => f.k === k) || { label: k }).label))
        .concat(newKey === 'antennas' ? ['Antenna Type'] : []);
      const rows = Object.keys(items).map((id, i) => {
        const it = items[id] || {};
        const row = [
          `${newKey.toUpperCase().slice(0, 4)}-LEG-${String(i + 1).padStart(3, '0')}`,
          it.name || '',
          it.price ?? '',
          it.weight ?? '',
          it.sourceLink || '',
          it.stock && it.stock !== 'unknown' ? it.stock : '',
          (it.lastChecked || '').slice(0, 10) || today,
          'Migrated from Tinkerer 1.x — verify price currency (old app displayed $) and fill in manufacturer, model, vendor.',
        ].concat(Object.keys(fmap).map((ok) => (it[ok] === undefined || it[ok] === null ? '' : it[ok])));
        if (newKey === 'antennas') row.push('Patch');
        return row;
      });
      sheets.push({ name: cat.label, headers, rows });
    });
    return sheets;
  }

  TK.catalogue = { build, emptyCatalogue, matchCategory, categoryList, specSummary, displayVal, toSheets, legacyToSheets, nominalCellVoltage, headerMap };
})(typeof window !== 'undefined' ? window : globalThis);
