/* Tinkerer — requirement-driven component matching engine.
 *
 * Flow:  requirements → parametric pre-sizing → [select payload/avionics/comms
 * slots → joint propulsion search (frame × motor+prop × ESC × battery × cell
 * count, evaluated with the real build mass including the battery) → full
 * analysis] repeated until the selection and mass converge → verification
 * pass that re-checks every pick against the final numbers.
 *
 * Every candidate gets a status:
 *   compatible | conditional | manual | incompatible   (+ "unavailable" for empty slots)
 * Incompatible components are never auto-selected. If nothing qualifies, the
 * slot is left unresolved and the closest candidate is offered for the user
 * to accept explicitly.
 */
(function (root) {
  'use strict';
  const TK = (root.TK = root.TK || {});
  const U = TK.util;
  const SZ = TK.sizing;
  const CAT = TK.catalogue;

  const ST = { OK: 'compatible', COND: 'conditional', MANUAL: 'manual', BAD: 'incompatible', NA: 'unavailable' };
  const RANK = { compatible: 0, conditional: 1, manual: 2, incompatible: 3, unavailable: 4 };
  const ST_LABEL = { compatible: 'Compatible', conditional: 'Compatible with conditions', manual: 'Requires manual verification', incompatible: 'Not compatible', unavailable: 'Not available in database' };
  const NO_MATCH_MSG = 'No suitable component found in your current database. Please add a compatible component or revise the requirement.';
  const PROPULSION = ['frame', 'liftMotor', 'liftProp', 'liftEsc', 'cruiseMotor', 'cruiseProp', 'cruiseEsc', 'battery'];

  // ------------------------------------------------------------------ check helpers
  function C() {
    const a = [];
    return { a, ok: (t) => a.push({ r: 'ok', t }), warn: (t) => a.push({ r: 'warn', t }), fail: (t) => a.push({ r: 'fail', t }), unk: (t) => a.push({ r: 'unknown', t }), info: (t) => a.push({ r: 'info', t }) };
  }
  function statusOf(a) {
    if (a.some((x) => x.r === 'fail')) return ST.BAD;
    if (a.some((x) => x.r === 'unknown')) return ST.MANUAL;
    if (a.some((x) => x.r === 'warn')) return ST.COND;
    return ST.OK;
  }
  const f0 = (n) => U.fmt(n, 0);
  const f1 = (n) => U.fmt(n, 1);
  const f2 = (n) => U.fmt(n, 2);
  const has = (v) => v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && !isFinite(v));
  const low = (s) => String(s || '').toLowerCase();

  function cellOk(it, S, c, label) {
    const a = it.spec.cellsMin, b = it.spec.cellsMax;
    if (!has(a) && !has(b)) return c.unk(`${label || 'Voltage'} rating not recorded — confirm it supports ${S}S`);
    const lo = has(a) ? a : b, hi = has(b) ? b : a;
    if (S >= lo && S <= hi) c.ok(`Rated ${lo === hi ? lo + 'S' : lo + '–' + hi + 'S'} — supports ${S}S`);
    else c.fail(`Rated ${lo === hi ? lo + 'S' : lo + '–' + hi + 'S'} — does not support ${S}S`);
  }

  function commonChecks(it, ctx, c, opts) {
    const st = it.stock;
    if (st === 'Discontinued') c.fail('Marked discontinued in the database');
    else if (st === 'Out of Stock') c.warn('Out of stock — confirm lead time with the vendor');
    else if (st === 'On Order') c.warn('On order — confirm delivery date');
    else if (st === 'Limited') c.info('Limited stock');
    if (!has(it.price)) c.warn('No price in the database');
    if (!(opts && opts.noWeight) && !has(it.weight)) c.warn('No weight in the database — counted as 0 g');
    const pb = ctx.prefBrands, pv = ctx.prefVendors;
    if (pb.length && it.manufacturer && pb.some((b) => U.norm(it.manufacturer).indexOf(U.norm(b)) !== -1)) c.ok('Preferred brand');
    if (pv.length && it.vendor && pv.some((b) => U.norm(it.vendor).indexOf(U.norm(b)) !== -1)) c.ok('Preferred vendor');
  }
  function prefScore(it, ctx) {
    let s = 0;
    if (ctx.prefBrands.some((b) => it.manufacturer && U.norm(it.manufacturer).indexOf(U.norm(b)) !== -1)) s += 1;
    if (ctx.prefVendors.some((b) => it.vendor && U.norm(it.vendor).indexOf(U.norm(b)) !== -1)) s += 1;
    if (it.stock === 'In Stock') s += 0.3;
    return s;
  }

  const PROTO = {
    elrs: ['elrs', 'expresslrs'], crossfire: ['crossfire', 'crsf', 'tbs'], ghost: ['ghost'], frsky: ['frsky', 'accst', 'access', 'tandem'],
    flysky: ['flysky', 'afhds'], futaba: ['futaba', 'fasst', 'sfhss', 'tfhss'], spektrum: ['spektrum', 'dsmx', 'dsm2'], siyi: ['siyi'],
    herelink: ['herelink'], skydroid: ['skydroid'], dji: ['dji'], jumper: ['jumper'], radiolink: ['radiolink'],
  };
  function protoFamilies(s) {
    const n = U.norm(s);
    return Object.keys(PROTO).filter((k) => PROTO[k].some((t) => n.indexOf(t) !== -1));
  }
  function freqBands(s) {
    const t = low(s);
    const out = [];
    if (/2\.4|2400/.test(t)) out.push('2.4');
    if (/5\.8|5800/.test(t)) out.push('5.8');
    if (/9[01][05]|868|900|0\.9/.test(t)) out.push('900');
    if (/433/.test(t)) out.push('433');
    if (/1\.[23]\s*g|1\.2g|1\.3g|1200|1300/.test(t)) out.push('1.2');
    return out;
  }

  // ------------------------------------------------------------------ requirement normalisation
  function readReq(req, A) {
    const r = Object.assign({}, req);
    const sp = (v, unit) => (has(v) ? (unit === 'kmh' ? Number(v) / 3.6 : Number(v)) : null);
    r.cruiseSpeedMs = sp(req.cruiseSpeed, req.cruiseSpeedUnit);
    r.maxSpeedMs = sp(req.maxSpeed, req.maxSpeedUnit);
    r.windSpeedMs = has(req.windSpeed) ? Number(req.windSpeed) : null;
    r.payloads = Array.isArray(req.payloads) ? req.payloads : [];
    r.controlRangeKm = has(req.controlRangeKm) ? Number(req.controlRangeKm) : has(req.rangeKm) ? Number(req.rangeKm) : null;
    r.videoRangeKm = has(req.videoRangeKm) ? Number(req.videoRangeKm) : null;
    return r;
  }

  // ------------------------------------------------------------------ thrust data
  function findCurve(ctx, motor, prop, S) {
    const key = motor.id + '|' + (prop && prop.id) + '|' + S;
    if (key in ctx.cache.curves) return ctx.cache.curves[key];
    let curve = null;
    if (prop && has(prop.spec.diameter)) {
      const ids = [motor.id, motor.model, motor.name].filter(Boolean).map(U.norm);
      const rows = ctx.catalogue.thrust.filter((r) => {
        if (ids.indexOf(U.norm(r.motorId)) === -1) return false;
        if (r.propId && prop.id && U.norm(r.propId) === U.norm(prop.id)) return Number(r.cells) === S || !has(r.cells);
        if (!has(r.diameter) || Math.abs(r.diameter - prop.spec.diameter) > 0.3) return false;
        if (has(r.pitch) && has(prop.spec.pitch) && Math.abs(r.pitch - prop.spec.pitch) > 0.35) return false;
        return Number(r.cells) === S;
      });
      if (rows.length >= 2) {
        const src = rows.map((r) => r.source).filter(Boolean)[0] || 'Thrust table';
        curve = SZ.makeCurve(rows, { source: src, flightTested: rows.some((r) => /flight/i.test(r.source || '')) });
      }
    }
    ctx.cache.curves[key] = curve;
    return curve;
  }

  /** Effective max thrust per motor for a motor+prop at S cells. */
  function pairThrust(ctx, motor, prop, S) {
    const key = motor.id + '|' + (prop && prop.id) + '|' + S;
    if (ctx.cache.pairs[key]) return ctx.cache.pairs[key];
    const out = { thrustG: null, curve: null, notes: [], src: null };
    const curve = findCurve(ctx, motor, prop, S);
    const dia = prop && prop.spec.diameter;
    if (curve) {
      out.thrustG = curve.maxThrustG;
      out.curve = curve;
      out.src = 'table';
      out.notes.push({ r: 'ok', t: `Thrust from ${curve.source} data: ${f0(curve.maxThrustG)} g max with this prop at ${S}S` });
    } else if (has(motor.spec.maxThrust)) {
      let t = motor.spec.maxThrust;
      out.src = 'spec';
      const tc = motor.spec.testCells, tp = motor.spec.testProp;
      if (has(tc) && S < tc) {
        t *= Math.pow(S / tc, 2);
        out.notes.push({ r: 'warn', t: `Rated thrust is at ${tc}S; scaled to ≈${f0(t)} g at ${S}S` });
      } else if (has(tc) && S > tc) out.notes.push({ r: 'warn', t: `Running above the ${tc}S thrust-test voltage — verify current draw` });
      if (has(tp) && has(dia) && dia < tp - 0.5) {
        t *= Math.pow(dia / tp, 1.5);
        out.notes.push({ r: 'warn', t: `Rated thrust uses a ${tp}" prop; scaled to ≈${f0(t)} g for ${dia}"` });
      } else if (has(tp) && has(dia) && dia > tp + 0.5) out.notes.push({ r: 'warn', t: `Prop larger than the ${tp}" thrust-test prop — thrust not scaled up; check motor current` });
      if (!has(tp)) out.notes.push({ r: 'info', t: 'Thrust-test prop not recorded — manufacturer max thrust used as-is' });
      out.thrustG = t;
    }
    ctx.cache.pairs[key] = out;
    return out;
  }

  function kvCheck(ctx, motor, prop, S, reqThrustG, c) {
    const kv = motor.spec.kv, dia = prop && prop.spec.diameter;
    if (!has(kv) || !has(dia) || !reqThrustG) return;
    const V = S * ctx.vCell;
    const D = dia * SZ.IN;
    const nAvail = (kv * V * 0.85) / 60;
    const nReq = Math.sqrt(((reqThrustG / 1000) * SZ.G) / (ctx.A.ct * ctx.rho * Math.pow(D, 4)));
    const ratio = nAvail / nReq;
    const mach = (Math.PI * D * nAvail) / 343;
    const rpmA = f0(nAvail * 60), rpmR = f0(nReq * 60);
    if (ratio < 0.8) c.fail(`KV ${kv} at ${S}S ≈ ${rpmA} rpm loaded; a ${dia}" prop needs ≈ ${rpmR} rpm for ${f0(reqThrustG)} g`);
    else if (ratio < 1) c.warn(`KV ${kv} at ${S}S is marginal for ${f0(reqThrustG)} g on a ${dia}" prop (≈${f0(ratio * 100)}% of required rpm)`);
    else if (ratio > 2.3) c.warn(`KV ${kv} is high for a ${dia}" prop at ${S}S — over-current risk at full throttle`);
    else c.ok(`KV ${kv} suits a ${dia}" prop at ${S}S (≈${rpmA} rpm loaded)`);
    if (mach > 0.85) c.fail(`Prop tip speed ≈ Mach ${f2(mach)} at full throttle — too high`);
    else if (mach > 0.7) c.warn(`Prop tip speed ≈ Mach ${f2(mach)} — noisy and inefficient`);
  }

  // ------------------------------------------------------------------ physics from picks
  function quantities(picks, ctx) {
    const lay = ctx.lay, A = ctx.A;
    const q = {};
    const set = (k, units, it) => {
      const pack = it && it.packQty > 1 ? it.packQty : 1;
      q[k] = { units, packs: Math.ceil(units / pack) };
    };
    Object.keys(picks).forEach((k) => {
      const it = picks[k];
      if (!it) return;
      const slot = ctx.slotDefs[k];
      const units = slot ? slot.units(ctx, it, picks) : 1;
      set(k, units, it);
    });
    return q;
  }

  function batteryPhys(picks, ctx) {
    const b = picks.battery;
    if (!b) return null;
    const series = ctx.A.seriesPacks || 1;
    const par = ctx.parallel || 1;
    const cells = (b.spec.cells || 0) * series;
    const vCell = CAT.nominalCellVoltage(b.spec.chemistry, ctx.A);
    const vNom = has(b.spec.voltageV) ? b.spec.voltageV * series : cells * vCell;
    const capAh = has(b.spec.capacity) ? (b.spec.capacity / 1000) * par : null;
    const energy = has(b.spec.energy) ? b.spec.energy * par * series : capAh ? vNom * capAh : null;
    return { cells, vNom, capacityAh: capAh, energyWhNom: energy, cRating: b.spec.cRating, maxDischargeA: has(b.spec.maxDischarge) ? b.spec.maxDischarge * par : null };
  }

  function massBreakdown(picks, ctx) {
    const q = quantities(picks, ctx);
    const groups = { payload: 0, battery: 0, structure: 0, propulsion: 0, avionics: 0, power: 0, comms: 0, other: 0 };
    const seen = {};
    const lines = [];
    Object.keys(picks).forEach((k) => {
      const it = picks[k];
      if (!it || !q[k]) return;
      const slot = ctx.slotDefs[k];
      if (slot && slot.groundOnly) return; // transmitter, charger … not on the aircraft
      if (slot && slot.shareable && seen[it.id]) return;
      seen[it.id] = true;
      const w = (it.weight || 0) * q[k].units;
      const g = slot ? slot.massGroup : 'other';
      groups[g] = (groups[g] || 0) + w;
      lines.push({ slot: k, item: it, units: q[k].units, grams: w, group: g });
    });
    const custom = (ctx.req.payloads || []).filter((p) => p.type === 'Custom').reduce((s, p) => s + (Number(p.weightG) || 0) * (Number(p.qty) || 1), 0);
    const selectedPayloadG = groups.payload + custom;
    const requiredPayloadG = (Number(ctx.req.payloadKg) || 0) * 1000;
    const payloadG = Math.max(selectedPayloadG, requiredPayloadG);
    const nonPayload = groups.battery + groups.structure + groups.propulsion + groups.avionics + groups.power + groups.comms + groups.other;
    const wiringItems = lines.filter((l) => l.slot.indexOf('wiring') === 0).reduce((s, l) => s + l.grams, 0);
    const miscG = Math.max(0, (ctx.A.miscPct / 100) * (nonPayload - wiringItems) - wiringItems);
    return { groups, lines, selectedPayloadG, requiredPayloadG, payloadG, customPayloadG: custom, miscG, nonPayloadG: nonPayload, dryG: nonPayload - groups.battery + miscG, totalG: payloadG + nonPayload + miscG, q };
  }

  function buildPhys(picks, ctx) {
    const lay = ctx.lay;
    const mb = massBreakdown(picks, ctx);
    const bp = batteryPhys(picks, ctx);
    const S = bp ? bp.cells : ctx.S;
    const vNom = bp ? bp.vNom : S * ctx.vCell;
    const phys = {
      cls: lay.cls, nLift: lay.lift, nCruise: lay.cruise, coaxial: lay.coaxial || /coax/i.test((picks.frame && picks.frame.spec.frameType) || ''),
      massKg: mb.totalG / 1000, cells: S, vNom,
      payloadPowerW: payloadPower(picks, ctx),
    };
    if (bp) Object.assign(phys, bp);
    if (picks.liftMotor && picks.liftProp) {
      const pt = pairThrust(ctx, picks.liftMotor, picks.liftProp, S);
      phys.liftMaxThrustG = pt.thrustG;
      phys.liftCurve = pt.curve;
      phys.liftMaxCurrentA = pt.curve ? pt.curve.maxCurrentA : picks.liftMotor.spec.maxCurrent;
    }
    phys.propDiaIn = picks.liftProp && has(picks.liftProp.spec.diameter) ? picks.liftProp.spec.diameter : ctx.pre.propDiaIn || 10;
    if (picks.cruiseMotor && picks.cruiseProp) {
      const pt = pairThrust(ctx, picks.cruiseMotor, picks.cruiseProp, S);
      phys.cruiseMaxThrustG = pt.thrustG;
      phys.cruiseMaxCurrentA = pt.curve ? pt.curve.maxCurrentA : picks.cruiseMotor.spec.maxCurrent;
    }
    const fr = picks.frame;
    if (fr && has(fr.spec.wingArea)) phys.wingAreaM2 = fr.spec.wingArea;
    if (fr && has(fr.spec.wingspan)) phys.wingspanM = fr.spec.wingspan / 1000;
    if (lay.cls !== 'multirotor' && !phys.wingAreaM2) phys.wingAreaM2 = null;
    if (picks.engine) phys.engine = { bsfc: picks.engine.spec.bsfc, powerW: picks.engine.spec.enginePower, generator: picks.engine.spec.generator };
    return { phys, mb };
  }

  function payloadPower(picks, ctx) {
    let p = 0;
    const seen = {};
    Object.keys(picks).forEach((k) => {
      const it = picks[k];
      const slot = ctx.slotDefs[k];
      if (!it || !slot || slot.massGroup !== 'payload' || seen[it.id]) return;
      seen[it.id] = true;
      p += it.spec.power || 0;
    });
    (ctx.req.payloads || []).forEach((pl) => {
      if (pl.type === 'Custom') p += (Number(pl.powerW) || 0) * (Number(pl.qty) || 1);
    });
    return p;
  }

  function analysePicks(picks, ctx) {
    const { phys, mb } = buildPhys(picks, ctx);
    let an = SZ.analyse(phys, ctx.req, ctx.A);
    if (ctx.lay.cls === 'hybrid') {
      for (let i = 0; i < 4; i++) {
        phys.massKg = (mb.totalG + (an.fuelKg || 0) * 1000) / 1000;
        an = SZ.analyse(phys, ctx.req, ctx.A);
      }
    }
    an.mb = mb;
    an.phys = phys;
    return an;
  }

  // ------------------------------------------------------------------ slot definitions
  function frameMotorCount(fr) {
    const s = fr.spec;
    if (has(s.motorCount)) return s.motorCount;
    if (has(s.arms)) return /coax|x8|y6/i.test((s.frameType || '') + (s.configuration || '')) ? s.arms * 2 : s.arms;
    const cfg = low(s.configuration);
    if (/octo/.test(cfg)) return 8;
    if (/hexa/.test(cfg)) return 6;
    if (/quad/.test(cfg)) return 4;
    if (/tri/.test(cfg)) return 3;
    return null;
  }
  function frameClass(fr) {
    const s = low((fr.spec.airframe || '') + ' ' + (fr.spec.configuration || '') + ' ' + (fr.spec.frameType || ''));
    if (/hybrid/.test(s)) return 'hybrid';
    if (/vtol|quadplane/.test(s)) return 'vtol';
    if (/fixed|wing|plane/.test(s)) return 'fixedwing';
    if (/multi|copter|quad|hexa|octo|tri|x8|y6/.test(s)) return 'multirotor';
    return null;
  }
  function frameMaxProp(fr, n) {
    if (!fr) return { v: null };
    if (has(fr.spec.maxProp)) return { v: fr.spec.maxProp, src: 'spec' };
    if (has(fr.spec.wheelbase) && n >= 3) {
      const adj = fr.spec.wheelbase * Math.sin(Math.PI / n);
      return { v: Math.floor((adj * 0.95) / 25.4 * 2) / 2, src: 'geometry' };
    }
    return { v: null };
  }

  function evalFrame(it, ctx) {
    const c = C();
    const s = it.spec, lay = ctx.lay, req = ctx.req;
    const fc = frameClass(it);
    const want = lay.cls;
    const clsOk = (a, b) => a === b || ((a === 'vtol' || a === 'hybrid') && (b === 'vtol' || b === 'hybrid'));
    if (fc && !clsOk(fc, want)) c.fail(`${s.airframe || s.configuration || 'Frame'} airframe — this build needs a ${ctx.clsLabel} frame`);
    else if (fc) c.ok(`${ctx.clsLabel} airframe`);
    else c.unk('Airframe class not recorded');
    if (lay.lift) {
      const mc = frameMotorCount(it);
      if (!has(mc)) c.unk(`Motor count not recorded — needs ${lay.lift} lift motors`);
      else if (mc === lay.lift) c.ok(`${mc} motor positions`);
      else c.fail(`${mc} motor positions — configuration needs ${lay.lift}`);
      const mp = frameMaxProp(it, lay.lift);
      const prop = ctx.picks.liftProp;
      if (prop && has(prop.spec.diameter)) {
        if (!has(mp.v)) c.unk('Max propeller size not recorded — check prop clearance');
        else if (prop.spec.diameter <= mp.v) (mp.src === 'geometry' ? c.warn : c.ok)(`${prop.spec.diameter}" props fit (max ${mp.v}"${mp.src === 'geometry' ? ', estimated from wheelbase' : ''})`);
        else c.fail(`${prop.spec.diameter}" props exceed max ${mp.v}"${mp.src === 'geometry' ? ' (estimated from wheelbase)' : ''}`);
      }
    }
    const mass = ctx.an ? ctx.an.mass : ctx.massKg;
    if (has(s.maxAuw)) {
      if (s.maxAuw >= mass) c.ok(`Rated ${f1(s.maxAuw)} kg MTOW ≥ ${f2(mass)} kg estimated`);
      else c.fail(`Rated ${f1(s.maxAuw)} kg MTOW < ${f2(mass)} kg estimated take-off weight`);
    } else c.unk('Structural rating (max take-off weight) not recorded — verify structure');
    const payKg = Math.max(Number(req.payloadKg) || 0, Number(req.maxStructPayloadKg) || 0);
    if (has(s.maxPayload) && payKg) {
      if (s.maxPayload >= payKg) c.ok(`Max payload ${f1(s.maxPayload)} kg ≥ ${f1(payKg)} kg`);
      else c.fail(`Max payload ${f1(s.maxPayload)} kg < ${f1(payKg)} kg required`);
    }
    if (has(req.wheelbaseMm) && lay.lift) {
      if (!has(s.wheelbase)) c.unk('Wheelbase not recorded');
      else if (Math.abs(s.wheelbase - req.wheelbaseMm) / req.wheelbaseMm <= ctx.A.wheelbaseTol / 100) c.ok(`Wheelbase ${f0(s.wheelbase)} mm`);
      else c.warn(`Wheelbase ${f0(s.wheelbase)} mm vs ${f0(req.wheelbaseMm)} mm requested`);
    }
    if (req.frameType && req.frameType !== 'Any') (U.containsToken(s.frameType || s.configuration, req.frameType) ? c.ok : c.warn)(`Frame type ${s.frameType || '—'} (requested ${req.frameType})`);
    if (req.frameSize) (U.containsToken([s.frameSize, it.name, it.model].join(' '), req.frameSize) ? c.ok : c.warn)(`Frame size ${s.frameSize || '—'} (requested ${req.frameSize})`);
    if (has(req.armsCount) && has(s.arms) && Number(req.armsCount) !== s.arms) c.warn(`${s.arms} arms (requested ${req.armsCount})`);
    if (req.material && req.material !== 'Any') (U.containsToken(s.material, req.material) ? c.ok : c.warn)(`Material ${s.material || 'not recorded'} (requested ${req.material})`);
    if (req.folding === 'Folding' && s.folding === false) c.warn('Non-folding frame (folding requested)');
    if (req.folding === 'Non-folding' && s.folding === true) c.warn('Folding frame (non-folding requested)');
    if (req.mounting && !U.containsToken([s.mounting, it.remarks].join(' '), req.mounting)) c.warn(`Verify payload mounting: "${req.mounting}"`);
    commonChecks(it, ctx, c);
    const perf = has(s.maxAuw) && mass ? U.clamp(s.maxAuw / mass - 1, 0, 1.5) : 0.2;
    return { checks: c.a, perf };
  }

  function evalMotor(it, ctx, role) {
    const c = C();
    const S = ctx.S;
    const lift = role === 'lift';
    const prop = ctx.picks[lift ? 'liftProp' : 'cruiseProp'];
    if (it.spec.role && it.spec.role !== 'Any') {
      if (lift && /cruise/i.test(it.spec.role)) c.warn('Recorded as a cruise motor');
      if (!lift && /lift/i.test(it.spec.role)) c.warn('Recorded as a lift motor');
    }
    cellOk(it, S, c, 'Voltage');
    const n = lift ? ctx.lay.lift : ctx.lay.cruise;
    const an = ctx.an;
    const reqG = lift ? an && an.liftThrustReqPerMotorG : an && an.cruiseThrustReqPerMotorG;
    if (ctx.lay.cls === 'hybrid' && !lift) {
      c.info('Hybrid cruise is engine-driven');
    } else if (prop) {
      const pt = pairThrust(ctx, it, prop, S);
      pt.notes.forEach((x) => c.a.push(x));
      if (!has(pt.thrustG)) c.unk('Max thrust not recorded — cannot verify thrust');
      else if (reqG) {
        const tw = (pt.thrustG * n) / (an.mass * 1000) / (lift && an.phys && an.phys.coaxial ? 1 + ctx.A.coaxialLoss / 100 : 1);
        const twReq = lift ? an.twRequired : ctx.lay.cls === 'fixedwing' ? ctx.A.twFixedWing : ctx.A.twVtolCruise;
        if (pt.thrustG >= reqG) c.ok(`${f0(pt.thrustG)} g/motor ≥ ${f0(reqG)} g required (T/W ${f2(tw)} vs ${f2(twReq)})`);
        else if (lift && pt.thrustG * n > an.mass * 1000 * 1.4) c.fail(`${f0(pt.thrustG)} g/motor < ${f0(reqG)} g required — T/W only ${f2(tw)} (needs ${f2(twReq)})`);
        else c.fail(`${f0(pt.thrustG)} g/motor < ${f0(reqG)} g required (T/W ${f2(tw)})`);
        if (!pt.curve) kvCheck(ctx, it, prop, S, reqG, c);
        if (lift && an.hoverThrustFraction) {
          const ht = an.hoverThrottlePct;
          if (ht > 75) c.warn(`Hover at ≈${f0(ht)}% throttle — little control headroom`);
        }
        if (!lift && ctx.lay.cls !== 'multirotor' && has(prop.spec.pitch) && has(it.spec.kv)) {
          const pitchSpeed = prop.spec.pitch * SZ.IN * (it.spec.kv * S * ctx.vCell * 0.85) / 60;
          const V = an.mission.cruise;
          if (pitchSpeed < 1.25 * V) c.warn(`Pitch speed ≈${f1(pitchSpeed)} m/s is low for ${f1(V)} m/s cruise (want ≥ ${f1(1.25 * V)})`);
          else c.ok(`Pitch speed ≈${f1(pitchSpeed)} m/s suits ${f1(V)} m/s cruise`);
        }
      }
      const dia = prop.spec.diameter;
      if (has(dia)) {
        if (has(it.spec.propMax) && dia > it.spec.propMax + 0.01) c.fail(`${dia}" prop exceeds motor max ${it.spec.propMax}"`);
        else if (has(it.spec.propMin) && dia < it.spec.propMin - 0.01) c.warn(`${dia}" prop below motor's recommended ${it.spec.propMin}"`);
        else if (has(it.spec.propMin) || has(it.spec.propMax)) c.ok(`${dia}" prop within recommended range`);
        else if (it.spec.recProp && new RegExp('\\b' + String(Math.round(dia)) + '(\\.|\\b|x|")').test(it.spec.recProp)) c.ok(`Recommended props: ${it.spec.recProp}`);
        else if (it.spec.recProp) c.warn(`Recommended props: ${it.spec.recProp} — using ${dia}"`);
      }
    } else c.info('Thrust evaluated once a propeller is paired');
    if (!has(it.spec.maxCurrent) && !(prop && pairThrust(ctx, it, prop, S).curve)) c.warn('Max current not recorded — ESC sizing uses an estimate');
    commonChecks(it, ctx, c);
    let perf = 0.3;
    if (prop && reqG) {
      const pt = pairThrust(ctx, it, prop, S);
      if (has(pt.thrustG)) perf = U.clamp(pt.thrustG / reqG, 0, 2) / 2 + (pt.curve ? 0.1 : 0);
    }
    return { checks: c.a, perf };
  }

  function evalProp(it, ctx, role) {
    const c = C();
    const lift = role === 'lift';
    const s = it.spec;
    if (!has(s.diameter)) c.unk('Diameter not recorded');
    if (s.role && s.role !== 'Any') {
      if (lift && /cruise/i.test(s.role)) c.warn('Recorded as a cruise/pusher propeller');
      if (!lift && /lift/i.test(s.role)) c.warn('Recorded as a lift propeller');
    }
    if (lift && has(s.diameter)) {
      const mp = frameMaxProp(ctx.picks.frame, ctx.lay.lift);
      if (has(mp.v)) (s.diameter <= mp.v ? c.ok : c.fail)(`${s.diameter}" vs frame max ${mp.v}"`);
      if (has(ctx.req.maxPropIn)) (s.diameter <= Number(ctx.req.maxPropIn) ? c.ok : c.fail)(`${s.diameter}" vs requested max ${ctx.req.maxPropIn}"`);
      if (has(s.pitch)) {
        const r = s.pitch / s.diameter;
        if (r < 0.18 || r > 0.7) c.warn(`Pitch/diameter ${f2(r)} is unusual for a lift prop`);
      }
    }
    const m = ctx.picks[lift ? 'liftMotor' : 'cruiseMotor'];
    if (m && has(s.diameter)) {
      if (has(m.spec.propMax) && s.diameter > m.spec.propMax + 0.01) c.fail(`Above ${m.name}'s max prop ${m.spec.propMax}"`);
      else if (has(m.spec.propMin) && s.diameter < m.spec.propMin - 0.01) c.warn(`Below ${m.name}'s recommended ${m.spec.propMin}"`);
      if (s.motorCompat && U.containsToken([m.name, m.model].join(' '), s.motorCompat)) c.ok('Listed as compatible with the selected motor');
    }
    if (ctx.lay.coaxial || (ctx.picks.frame && /coax/i.test(ctx.picks.frame.spec.frameType || ''))) c.info('Coaxial layout — needs matched CW/CCW sets for upper and lower rotors');
    commonChecks(it, ctx, c);
    const perf = has(s.diameter) ? s.diameter / 40 : 0;
    return { checks: c.a, perf };
  }

  function escPeakPerMotor(ctx, role) {
    const lift = role === 'lift';
    const m = ctx.picks[lift ? 'liftMotor' : 'cruiseMotor'];
    const p = ctx.picks[lift ? 'liftProp' : 'cruiseProp'];
    if (m && p) {
      const pt = pairThrust(ctx, m, p, ctx.S);
      if (pt.curve && pt.curve.maxCurrentA) return { a: pt.curve.maxCurrentA, src: 'thrust table' };
    }
    if (m && has(m.spec.maxCurrent)) return { a: m.spec.maxCurrent, src: 'motor max current' };
    if (ctx.an && lift && ctx.an.peakPerLiftMotorA) return { a: ctx.an.peakPerLiftMotorA, src: 'estimate' };
    return { a: null };
  }

  function evalEsc(it, ctx, role) {
    const c = C();
    const s = it.spec;
    const n = role === 'lift' ? ctx.lay.lift : ctx.lay.cruise;
    cellOk(it, ctx.S, c, 'Voltage');
    const pk = escPeakPerMotor(ctx, role);
    if (!has(s.contCurrent)) c.unk('Continuous current not recorded');
    else if (has(pk.a)) {
      const need = pk.a * ctx.A.escSafety;
      if (s.contCurrent >= need) c.ok(`${f0(s.contCurrent)} A continuous ≥ ${f1(need)} A (${f1(pk.a)} A ${pk.src} × ${ctx.A.escSafety})`);
      else if (s.contCurrent >= pk.a) c.warn(`${f0(s.contCurrent)} A continuous covers ${f1(pk.a)} A peak but not the ×${ctx.A.escSafety} margin (${f1(need)} A)`);
      else c.fail(`${f0(s.contCurrent)} A continuous < ${f1(pk.a)} A motor peak (${pk.src})`);
      if (has(s.burstCurrent) && s.burstCurrent < pk.a) c.warn(`Burst rating ${f0(s.burstCurrent)} A below motor peak`);
    } else c.unk('Motor peak current unknown — cannot size ESC');
    const ch = s.channels || 1;
    const qty = Math.ceil(n / ch);
    if (ch > 1) {
      const spare = qty * ch - n;
      if (spare > 0) c.warn(`${ch}-in-1 ESC: ${qty} units for ${n} motors leaves ${spare} channel(s) unused`);
      else c.ok(`${ch}-in-1 ESC — ${qty} unit(s) for ${n} motors`);
    }
    const fcFw = ctx.picks.flightController && ctx.picks.flightController.spec.firmware;
    if (s.protocol && /can/i.test(s.protocol) && ctx.picks.flightController && !(ctx.picks.flightController.spec.can > 0)) c.fail('CAN ESC but the flight controller has no CAN port');
    if (s.firmware && /betaflight|blheli_s/i.test(s.firmware) && fcFw && /ardupilot|px4/i.test(fcFw.join(' '))) c.info(`${s.firmware} firmware — confirm DShot/PWM support with ${fcFw.join('/')}`);
    commonChecks(it, ctx, c);
    const perf = has(s.contCurrent) && has(pk.a) ? U.clamp(s.contCurrent / (pk.a * ctx.A.escSafety), 0, 2) / 2 : 0.2;
    return { checks: c.a, perf };
  }

  function evalBattery(it, ctx) {
    const c = C();
    const s = it.spec, req = ctx.req, A = ctx.A;
    const series = A.seriesPacks || 1;
    const par = ctx.parallel || 1;
    if (!has(s.cells)) c.unk('Cell count not recorded');
    else {
      const S = s.cells * series;
      if (has(req.batteryCells) && Number(req.batteryCells) !== S) c.fail(`${S}S system — ${req.batteryCells}S requested`);
      else c.ok(`${series > 1 ? series + ' × ' + s.cells + 'S = ' : ''}${S}S, ${par} pack${par > 1 ? 's' : ''} in parallel`);
    }
    if (req.chemistry && req.chemistry !== 'Any') (U.containsToken(s.chemistry, req.chemistry) ? c.ok : c.warn)(`Chemistry ${s.chemistry || 'not recorded'} (preferred ${req.chemistry})`);
    if (!has(s.capacity)) c.unk('Capacity not recorded');
    if (has(req.capacityMah) && has(s.capacity) && s.capacity * par < Number(req.capacityMah)) c.warn(`${f0(s.capacity * par)} mAh total < preferred ${f0(req.capacityMah)} mAh`);
    const packsW = (it.weight || 0) * par * series;
    if (has(req.maxBatteryKg) && packsW / 1000 > Number(req.maxBatteryKg)) c.fail(`Battery weight ${f2(packsW / 1000)} kg > ${req.maxBatteryKg} kg limit`);
    const an = ctx.an;
    if (an && an.energyNomWh) {
      if (ctx.lay.cls === 'hybrid') {
        if (an.batteryHoverOk) c.ok(`${f0(an.energyAfterReserveWh)} Wh usable covers ${f0(an.missionEnergyWh)} Wh of electric (VTOL) flight`);
        else c.fail(`${f0(an.energyAfterReserveWh)} Wh usable < ${f0(an.missionEnergyWh)} Wh needed for VTOL phases`);
      } else {
        const reqMin = an.missionTimeS / 60;
        if (an.estimatedEnduranceMin >= reqMin - 0.05) c.ok(`Est. mission endurance ${f1(an.estimatedEnduranceMin)} min ≥ ${f1(reqMin)} min mission (incl. own weight & ${A.reserve}% reserve)`);
        else c.fail(`Est. mission endurance ${f1(an.estimatedEnduranceMin)} min < ${f1(reqMin)} min required (incl. own weight & ${A.reserve}% reserve)`);
      }
    }
    if (an && an.requiredC != null) {
      const avail = has(s.maxDischarge) ? (s.maxDischarge * par) / Math.max(an.phys.capacityAh || 1, 1e-6) : s.cRating;
      if (!has(avail)) c.unk('C-rating not recorded — cannot verify discharge capability');
      else if (avail >= an.requiredC) c.ok(`${f0(avail)}C ≥ ${f1(an.requiredC)}C needed at ${f0(an.peakCurrentA)} A peak (×${A.cSafety})`);
      else if (avail * A.cSafety >= an.requiredC) c.warn(`${f0(avail)}C covers ${f0(an.peakCurrentA)} A peak without the ×${A.cSafety} safety margin`);
      else c.fail(`${f0(avail)}C < ${f1(an.requiredC)}C needed for ${f0(an.peakCurrentA)} A peak`);
    }
    const m = ctx.picks.liftMotor || ctx.picks.cruiseMotor;
    if (m && has(s.cells) && (has(m.spec.cellsMin) || has(m.spec.cellsMax))) {
      const S = s.cells * series;
      if ((has(m.spec.cellsMax) && S > m.spec.cellsMax) || (has(m.spec.cellsMin) && S < m.spec.cellsMin)) c.fail(`${S}S is outside the motor's ${m.spec.cellsMin || '?'}–${m.spec.cellsMax || '?'}S range`);
    }
    commonChecks(it, ctx, c);
    const perf = an && an.estimatedEnduranceMin && an.missionTimeS ? U.clamp(an.estimatedEnduranceMin / (an.missionTimeS / 60), 0, 2) / 2 : 0.2;
    return { checks: c.a, perf };
  }

  // ----- avionics, power, payload, comms
  function payloadSpecChecks(it, p, c, cat) {
    const s = it.spec;
    const vr = U.videoRank(p.videoRes);
    if (vr) {
      const ir = U.videoRank(s.videoRes);
      if (ir === null) c.unk(`Video resolution not recorded (needs ${p.videoRes})`);
      else if (ir >= vr) c.ok(`Video ${s.videoRes} ≥ ${p.videoRes}`);
      else c.fail(`Video ${s.videoRes} < ${p.videoRes}`);
    }
    if (has(p.sensorMP)) {
      const mp = cat === 'thermalCameras' ? s.visibleMP : s.sensorMP;
      if (!has(mp)) c.unk(`Image sensor resolution not recorded (needs ${p.sensorMP} MP)`);
      else (mp >= p.sensorMP ? c.ok : c.fail)(`${mp} MP image sensor (needs ≥ ${p.sensorMP} MP)`);
    }
    if (has(p.opticalZoom)) {
      if (!has(s.opticalZoom)) c.unk(`Optical zoom not recorded (needs ${p.opticalZoom}×)`);
      else (s.opticalZoom >= p.opticalZoom ? c.ok : c.fail)(`${s.opticalZoom}× optical zoom (needs ≥ ${p.opticalZoom}×)`);
    }
    if (has(p.digitalZoom) && has(s.digitalZoom)) (s.digitalZoom >= p.digitalZoom ? c.ok : c.warn)(`${s.digitalZoom}× digital zoom (wants ≥ ${p.digitalZoom}×)`);
    if (has(p.fovMin)) {
      if (!has(s.fov)) c.unk('Field of view not recorded');
      else (s.fov >= p.fovMin ? c.ok : c.fail)(`FOV ${s.fov}° (needs ≥ ${p.fovMin}°)`);
    }
    if (p.sensorSize) (U.containsToken(s.sensorSize, p.sensorSize) ? c.ok : c.warn)(`Sensor ${s.sensorSize || 'not recorded'} (wanted ${p.sensorSize})`);
    if (p.lensType) (U.containsToken(s.lensType, p.lensType) ? c.ok : c.warn)(`Lens ${s.lensType || 'not recorded'} (wanted ${p.lensType})`);
    if (p.focalLength) (U.containsToken(String(s.focalLength || s.lensMM || ''), String(p.focalLength)) ? c.ok : c.warn)(`Focal length ${s.focalLength || s.lensMM || 'not recorded'} (wanted ${p.focalLength})`);
    if (has(p.maxWeightG)) {
      if (!has(it.weight)) c.unk('Weight not recorded');
      else (it.weight <= p.maxWeightG ? c.ok : c.fail)(`${f0(it.weight)} g (max ${f0(p.maxWeightG)} g)`);
    }
    if (has(p.maxPowerW)) {
      if (!has(s.power)) c.unk('Power consumption not recorded');
      else (s.power <= p.maxPowerW ? c.ok : c.fail)(`${s.power} W (max ${p.maxPowerW} W)`);
    }
    if (p.interface) (U.containsToken(s.interface, p.interface) ? c.ok : c.warn)(`Interface ${s.interface || 'not recorded'} (wanted ${p.interface})`);
    if (p.gimbal && p.gimbal !== 'None') {
      const ax = parseInt(p.gimbal, 10) || 2;
      if (s.gimbalIncluded === true) (!has(s.gimbalAxes) || s.gimbalAxes >= ax ? c.ok : c.fail)(`Integrated ${s.gimbalAxes || ''}-axis gimbal (needs ${ax}-axis)`);
      else c.info(`No integrated gimbal — a separate ${ax}-axis gimbal will be added`);
    }
  }

  const CAM_TYPE_TOKENS = { RGB: ['rgb', 'visible', 'mapping', 'eo', 'camera'], Zoom: ['zoom'], 'Night Vision': ['night', 'starlight', 'lowlight', 'nir', 'ir-cut'], Hyperspectral: ['hyper'] };
  function evalCamera(it, ctx, p) {
    const c = C();
    const s = it.spec;
    if (it.cat === 'thermalCameras') {
      if (p.type !== 'RGB') c.fail('Thermal camera cannot serve this payload type');
      else if (!has(s.videoRes) && !has(s.visibleMP)) c.fail('Thermal camera without a recorded visible (RGB) sensor');
      else c.ok('Dual-sensor camera — visible channel covers the RGB requirement');
    } else if (it.cat === 'multispectral') {
      if (p.type !== 'Hyperspectral') c.fail('Not a camera of this type');
      else (s.bands >= 20 ? c.ok : c.warn)(`${s.bands || '?'} spectral bands — confirm hyperspectral capability`);
    } else {
      const t = low(s.cameraType);
      const tokens = CAM_TYPE_TOKENS[p.type] || [];
      if (p.type === 'Zoom' && (has(s.opticalZoom) && s.opticalZoom >= 2)) c.ok(`${s.opticalZoom}× optical zoom camera`);
      else if (!t) (p.type === 'RGB' ? c.warn : c.unk)(`Camera type not recorded (needs ${p.type})`);
      else if (tokens.some((k) => t.indexOf(k) !== -1)) c.ok(`${s.cameraType} camera`);
      else if (p.type === 'RGB' && !/thermal|night|hyper|multi/.test(t)) c.ok(`${s.cameraType} camera`);
      else c.fail(`${s.cameraType} camera — ${p.type} required`);
    }
    payloadSpecChecks(it, p, c, it.cat);
    commonChecks(it, ctx, c);
    const perf = (U.videoRank(s.videoRes) || 0) / 6 + (s.sensorMP || s.visibleMP || 0) / 200 + (s.opticalZoom || 0) / 60;
    return { checks: c.a, perf };
  }
  function evalThermal(it, ctx, p) {
    const c = C();
    const s = it.spec;
    const reqPx = U.parsePixels(p.thermalRes);
    if (reqPx) {
      const px = U.parsePixels(s.thermalRes);
      if (!px) c.unk(`Thermal resolution not recorded (needs ${p.thermalRes})`);
      else (px >= reqPx ? c.ok : c.fail)(`Thermal ${s.thermalRes} (needs ≥ ${p.thermalRes})`);
    }
    if (has(p.netdMax)) {
      if (!has(s.netd)) c.unk('NETD not recorded');
      else (s.netd <= p.netdMax ? c.ok : c.fail)(`NETD ${s.netd} mK (needs ≤ ${p.netdMax} mK)`);
    }
    if (has(p.detectionRangeM)) {
      if (!has(s.detectionRange)) c.unk('Detection range not recorded');
      else (s.detectionRange >= p.detectionRangeM ? c.ok : c.fail)(`Detection ${f0(s.detectionRange)} m (needs ≥ ${f0(p.detectionRangeM)} m)`);
    }
    if (p.lensMM) (has(s.lensMM) && U.containsToken(String(s.lensMM), String(p.lensMM)) ? c.ok : c.warn)(`Thermal lens ${s.lensMM || '—'} mm (wanted ${p.lensMM} mm)`);
    if (p.radiometric === 'Radiometric') {
      if (s.radiometric === null || s.radiometric === undefined) c.unk('Radiometric capability not recorded');
      else (s.radiometric ? c.ok : c.fail)(s.radiometric ? 'Radiometric' : 'Non-radiometric (radiometric required)');
    }
    payloadSpecChecks(it, Object.assign({}, p, { videoRes: null, sensorMP: null }), c, 'thermalCameras');
    commonChecks(it, ctx, c);
    const perf = (U.parsePixels(s.thermalRes) || 0) / 327680 + (has(s.netd) ? 40 / s.netd : 0) + (s.videoRes ? 0.2 : 0);
    return { checks: c.a, perf };
  }
  function evalMultispectral(it, ctx, p) {
    const c = C();
    const s = it.spec;
    if (has(p.bands)) {
      if (!has(s.bands)) c.unk('Band count not recorded');
      else (s.bands >= p.bands ? c.ok : c.fail)(`${s.bands} bands (needs ≥ ${p.bands})`);
    }
    if (p.wavelengths) (U.containsToken(s.wavelengths, p.wavelengths) ? c.ok : c.warn)(`Wavelengths ${s.wavelengths || 'not recorded'} — verify against ${p.wavelengths}`);
    payloadSpecChecks(it, Object.assign({}, p, { videoRes: null, gimbal: null }), c, 'multispectral');
    commonChecks(it, ctx, c);
    return { checks: c.a, perf: (s.bands || 0) / 10 };
  }
  function evalLidar(it, ctx, p) {
    const c = C();
    const s = it.spec;
    if (has(p.rangeM)) {
      if (!has(s.range)) c.unk('Range not recorded');
      else (s.range >= p.rangeM ? c.ok : c.fail)(`Range ${f0(s.range)} m (needs ≥ ${f0(p.rangeM)} m)`);
    }
    if (has(p.pointRate)) {
      if (!has(s.pointRate)) c.unk('Point rate not recorded');
      else (s.pointRate >= p.pointRate ? c.ok : c.fail)(`${f0(s.pointRate)} pts/s (needs ≥ ${f0(p.pointRate)})`);
    }
    if (has(p.accuracyCm)) {
      if (!has(s.accuracy)) c.unk('Accuracy not recorded');
      else (s.accuracy <= p.accuracyCm ? c.ok : c.fail)(`Accuracy ${s.accuracy} cm (needs ≤ ${p.accuracyCm} cm)`);
    }
    if (s.lidarUse && /obstacle|altimeter|rangefinder/i.test(s.lidarUse) && !/map/i.test(s.lidarUse)) c.warn(`Recorded use: ${s.lidarUse}`);
    payloadSpecChecks(it, Object.assign({}, p, { videoRes: null, gimbal: null }), c, 'lidar');
    commonChecks(it, ctx, c);
    return { checks: c.a, perf: (s.range || 0) / 1000 + (s.pointRate || 0) / 2e6 };
  }

  function gimbalNeed(ctx) {
    let axes = 0, grams = 0;
    const names = [];
    ctx.payloadSlots.forEach((ps) => {
      const it = ctx.picks[ps.key];
      const p = ps.payload;
      if (!it || !p.gimbal || p.gimbal === 'None') return;
      if (it.spec.gimbalIncluded === true) return;
      axes = Math.max(axes, parseInt(p.gimbal, 10) || 2);
      grams += it.weight || 0;
      names.push(it.name);
    });
    return { axes, grams, names };
  }
  function evalGimbal(it, ctx) {
    const c = C();
    const need = gimbalNeed(ctx);
    const s = it.spec;
    if (!has(s.axes)) c.unk('Axis count not recorded');
    else (s.axes >= need.axes ? c.ok : c.fail)(`${s.axes}-axis (needs ${need.axes}-axis)`);
    if (!has(s.maxPayload)) c.unk('Gimbal payload capacity not recorded');
    else (s.maxPayload >= need.grams ? c.ok : c.fail)(`Carries ${f0(s.maxPayload)} g (camera ${f0(need.grams)} g)`);
    if (need.names.length) (s.compatible && need.names.some((nm) => U.containsToken(s.compatible, nm)) ? c.ok : c.warn)(`Verify mount/interface compatibility with ${need.names.join(', ')}`);
    commonChecks(it, ctx, c);
    return { checks: c.a, perf: (s.axes || 0) / 3 };
  }

  function canDevices(ctx) {
    return ['gps', 'gps2', 'rtk', 'powerModule', 'liftEsc'].filter((k) => {
      const it = ctx.picks[k];
      if (!it) return false;
      return /can/i.test(it.spec.interface || it.spec.protocol || '');
    });
  }
  function uartNeed(ctx) {
    const list = [];
    const p = ctx.picks;
    ['gps', 'gps2', 'rtk'].forEach((k) => p[k] && !/can/i.test(p[k].spec.interface || '') && list.push(ctx.slotDefs[k].label));
    if (p.receiver || (p.transmitter && p.transmitter.spec.airUnit)) list.push('RC receiver');
    if (p.telemetry) list.push('Telemetry radio');
    if (p.transmitter && p.transmitter.spec.videoLink && p.transmitter.spec.telemetry && !p.telemetry) list.push('Integrated link telemetry');
    if (p.obstacle) list.push('Obstacle sensor');
    ctx.payloadSlots.forEach((ps) => {
      const it = p[ps.key];
      if (it && /uart|serial|mavlink|ttl/i.test(it.spec.interface || '')) list.push(it.name);
    });
    const user = Number(ctx.req.uartsMin) || 0;
    return { n: Math.max(user, list.length), list, user };
  }
  function evalFC(it, ctx) {
    const c = C();
    const s = it.spec, req = ctx.req;
    const fw = (s.firmware || []).join(' ');
    const want = req.firmware || 'Any';
    if (want !== 'Any') {
      const needs = want === 'ArduPilot or PX4' ? ['ardupilot', 'arducopter', 'arduplane', 'px4'] : want === 'ArduPilot' ? ['ardupilot', 'arducopter', 'arduplane'] : [U.norm(want)];
      if (!fw) c.unk(`Supported firmware not recorded (needs ${want})`);
      else (needs.some((x) => U.norm(fw).indexOf(x) !== -1) ? c.ok : c.fail)(`Firmware: ${fw} (needs ${want})`);
    }
    if (ctx.lay.cls !== 'multirotor' && /betaflight/i.test(fw) && !/ardu|px4|inav/i.test(fw)) c.fail('Betaflight does not support fixed-wing / VTOL missions');
    const un = uartNeed(ctx);
    if (!has(s.uarts)) c.unk(`UART count not recorded (needs ${un.n})`);
    else (s.uarts >= un.n ? c.ok : c.fail)(`${s.uarts} UARTs ≥ ${un.n} needed${un.list.length ? ' (' + un.list.join(', ') + ')' : ''}`);
    const cans = canDevices(ctx);
    if (cans.length) {
      if (!has(s.can)) c.unk('CAN port count not recorded (CAN devices selected)');
      else (s.can >= 1 ? c.ok : c.fail)(`${s.can} CAN port(s) for ${cans.map((k) => ctx.slotDefs[k].label).join(', ')}`);
    }
    const servos = ctx.picks.servos ? quantities({ servos: ctx.picks.servos }, ctx).servos.units : 0;
    const outs = ctx.lay.lift + ctx.lay.cruise + servos;
    if (!has(s.pwm)) c.unk(`PWM output count not recorded (needs ${outs})`);
    else (s.pwm >= outs ? c.ok : c.fail)(`${s.pwm} PWM outputs ≥ ${outs} (motors + servos)`);
    const red = req.redundancy || [];
    if (red.indexOf('Triple IMU') !== -1) {
      if (!has(s.imuCount)) c.unk('IMU count not recorded (triple IMU required)');
      else (s.imuCount >= 3 ? c.ok : c.fail)(`${s.imuCount} IMUs (triple required)`);
    }
    if (red.indexOf('Dual power module') !== -1 || req.redundantPower) {
      if (has(s.pmInputs)) (s.pmInputs >= 2 ? c.ok : c.fail)(`${s.pmInputs} power-module inputs (2 required)`);
      else c.unk('Power-module inputs not recorded (dual power monitoring required)');
    }
    if (req.fcPreference) (U.containsToken([it.name, it.model, it.manufacturer].join(' '), req.fcPreference) ? c.ok : c.warn)(`Preference: ${req.fcPreference}`);
    if ((req.operation === 'Autonomous' || req.operation === 'Hybrid' || req.autonomous) && fw && !/ardu|px4|inav/i.test(fw)) c.warn('Autonomous missions need ArduPilot, PX4 or INAV');
    commonChecks(it, ctx, c);
    const perf = ((s.uarts || 0) + (s.can || 0) * 2 + (s.imuCount || 1)) / 15;
    return { checks: c.a, perf };
  }

  function fcAccepts(ctx, it, c) {
    const fc = ctx.picks.flightController;
    if (!fc) return;
    if (/can/i.test(it.spec.interface || '') && !(fc.spec.can > 0)) {
      if (/uart/i.test(it.spec.interface || '')) c.warn('Use the UART connection — the flight controller has no CAN port');
      else c.fail('CAN-only device but the flight controller has no CAN port');
    }
  }
  function evalGPS(it, ctx) {
    const c = C();
    const s = it.spec;
    if (s.compass === false) c.warn('No integrated compass — add an external compass');
    if (has(s.updateRate) && s.updateRate < 5) c.warn(`${s.updateRate} Hz update rate (≥ 5 Hz recommended)`);
    if (s.constellations && U.toList(s.constellations).length >= 2) c.ok(`Multi-constellation: ${s.constellations}`);
    if (ctx.req.fcPreference && s.interface) c.info(`Interface: ${s.interface}`);
    fcAccepts(ctx, it, c);
    commonChecks(it, ctx, c);
    return { checks: c.a, perf: (U.toList(s.constellations).length || 1) / 4 + (s.updateRate || 0) / 50 };
  }
  function evalRTK(it, ctx) {
    const c = C();
    const s = it.spec;
    if (s.rtkType && /base/i.test(s.rtkType) && !/rover|kit|\+/i.test(s.rtkType)) c.fail('Base station only — a rover module is needed on the aircraft');
    else if (s.rtkType) c.ok(`${s.rtkType}`);
    if (has(ctx.req.rtkAccuracyCm)) {
      if (!has(s.accuracy)) c.unk('Accuracy not recorded');
      else (s.accuracy <= ctx.req.rtkAccuracyCm ? c.ok : c.fail)(`${s.accuracy} cm (needs ≤ ${ctx.req.rtkAccuracyCm} cm)`);
    }
    if (!s.correction) c.info('Plan the RTK correction source (base station / NTRIP via GCS)');
    fcAccepts(ctx, it, c);
    commonChecks(it, ctx, c);
    return { checks: c.a, perf: has(s.accuracy) ? 1 / Math.max(s.accuracy, 0.5) : 0 };
  }

  function currentNeed(ctx) {
    const an = ctx.an;
    return { peak: an && an.peakCurrentA, cont: an && Math.max(an.hoverCurrentA || 0, an.cruiseCurrentA || 0) };
  }
  function evalPdb(it, ctx) {
    const c = C();
    const s = it.spec;
    cellOk(it, ctx.S, c, 'Voltage');
    const cn = currentNeed(ctx);
    if (!has(s.maxCurrent)) c.unk('Current rating not recorded');
    else if (cn.peak) {
      const need = cn.peak * ctx.A.pdbSafety;
      if (s.maxCurrent >= need) c.ok(`${f0(s.maxCurrent)} A ≥ ${f0(need)} A (peak × ${ctx.A.pdbSafety})`);
      else if (s.maxCurrent >= cn.peak) c.warn(`${f0(s.maxCurrent)} A covers ${f0(cn.peak)} A peak without margin`);
      else c.fail(`${f0(s.maxCurrent)} A < ${f0(cn.peak)} A system peak`);
    }
    if (has(s.outputs)) (s.outputs >= ctx.lay.lift + ctx.lay.cruise ? c.ok : c.warn)(`${s.outputs} outputs for ${ctx.lay.lift + ctx.lay.cruise} ESC feeds`);
    commonChecks(it, ctx, c);
    return { checks: c.a, perf: has(s.maxCurrent) && cn.peak ? U.clamp(s.maxCurrent / cn.peak, 0, 2) / 2 : 0 };
  }
  function evalPM(it, ctx) {
    const c = C();
    const s = it.spec;
    cellOk(it, ctx.S, c, 'Voltage');
    const cn = currentNeed(ctx);
    if (!has(s.maxCurrent)) c.unk('Current rating not recorded');
    else if (cn.peak) {
      if (s.maxCurrent >= cn.peak) c.ok(`${f0(s.maxCurrent)} A ≥ ${f0(cn.peak)} A system peak`);
      else if (s.maxCurrent >= cn.cont * ctx.A.pdbSafety) c.warn(`${f0(s.maxCurrent)} A covers ${f0(cn.cont)} A continuous but not ${f0(cn.peak)} A peak`);
      else c.fail(`${f0(s.maxCurrent)} A < ${f0(cn.cont)} A continuous draw`);
    }
    fcAccepts(ctx, it, c);
    commonChecks(it, ctx, c);
    return { checks: c.a, perf: has(s.maxCurrent) && cn.peak ? U.clamp(s.maxCurrent / cn.peak, 0, 2) / 2 : 0 };
  }
  function auxPowerNeedW(ctx) {
    let w = 0;
    ctx.payloadSlots.forEach((ps) => {
      const it = ctx.picks[ps.key];
      if (it) w += it.spec.power || 5;
    });
    if (ctx.picks.gimbal) w += ctx.picks.gimbal.spec.power || 5;
    if (ctx.picks.servos) w += 5 * quantities({ servos: ctx.picks.servos }, ctx).servos.units;
    if (ctx.picks.videoTx) w += 6;
    (ctx.req.payloads || []).forEach((p) => p.type === 'Custom' && (w += Number(p.powerW) || 0));
    return w;
  }
  function evalUbec(it, ctx) {
    const c = C();
    const s = it.spec;
    cellOk(it, ctx.S, c, 'Input voltage');
    const need = auxPowerNeedW(ctx) * 1.3;
    if (!has(s.outputCurrent) || !has(s.outputVoltageMax)) c.unk('Output current/voltage not recorded');
    else {
      const cap = s.outputCurrent * s.outputVoltageMax;
      (cap >= need ? c.ok : c.fail)(`${s.outputCurrent} A @ ${s.outputVoltage} V ≈ ${f0(cap)} W (accessories need ≈ ${f0(need)} W incl. 30% margin)`);
    }
    commonChecks(it, ctx, c);
    return { checks: c.a, perf: has(s.outputCurrent) ? s.outputCurrent / 20 : 0 };
  }

  function evalTx(it, ctx) {
    const c = C();
    const s = it.spec, req = ctx.req, A = ctx.A;
    if (has(req.screenMin)) {
      if (!has(s.screen)) c.unk(`Screen size not recorded (needs ≥ ${req.screenMin}")`);
      else (s.screen >= req.screenMin ? c.ok : c.fail)(`${s.screen}" screen (needs ≥ ${req.screenMin}")`);
    }
    if (has(req.channelsMin)) {
      if (!has(s.channels)) c.unk('Channel count not recorded');
      else (s.channels >= req.channelsMin ? c.ok : c.fail)(`${s.channels} channels (needs ≥ ${req.channelsMin})`);
    }
    const rk = req.controlRangeKm;
    if (rk) {
      if (!has(s.range)) c.unk(`Control range not recorded (needs ${rk} km)`);
      else if (s.range >= rk * A.rangeMargin) c.ok(`${s.range} km rated control range ≥ ${f1(rk)} km × ${A.rangeMargin}`);
      else if (s.range >= rk) c.warn(`${s.range} km rated — covers ${f1(rk)} km with no margin`);
      else c.fail(`${s.range} km rated < ${f1(rk)} km required`);
    }
    if (req.protocol) (U.containsToken(s.protocol, req.protocol) ? c.ok : c.warn)(`Protocol ${s.protocol || 'not recorded'} (preferred ${req.protocol})`);
    if (req.frequency && req.frequency !== 'Any') (freqBands(s.frequency).some((b) => freqBands(req.frequency).indexOf(b) !== -1) ? c.ok : c.warn)(`Frequency ${s.frequency || 'not recorded'} (preferred ${req.frequency})`);
    if (req.telemetrySupport) {
      if (s.telemetry === true) c.ok('Telemetry support');
      else if (s.telemetry === false) c.fail('No telemetry support');
      else c.unk('Telemetry support not recorded');
    }
    if (req.videoType && req.videoType !== 'None' && s.videoLink === true) {
      c.ok(`Integrated ${s.videoType || ''} video link${has(s.videoRange) ? ' — ' + s.videoRange + ' km' : ''}`);
      if (req.videoRangeKm && has(s.videoRange) && s.videoRange < req.videoRangeKm) c.warn(`Video range ${s.videoRange} km < ${req.videoRangeKm} km required — a separate video link will be added`);
    }
    if (req.txPreference) (U.containsToken([it.name, it.model, it.manufacturer].join(' '), req.txPreference) ? c.ok : c.warn)(`Preference: ${req.txPreference}`);
    if (req.gcs) c.info(`GCS requirement: ${req.gcs}`);
    commonChecks(it, ctx, c, { noWeight: true });
    const perf = (has(s.range) && rk ? U.clamp(s.range / rk, 0, 3) / 3 : 0) + (s.screen || 0) / 20 + (s.videoLink ? 0.2 : 0);
    return { checks: c.a, perf };
  }
  function evalRx(it, ctx) {
    const c = C();
    const s = it.spec, req = ctx.req;
    const tx = ctx.picks.transmitter;
    if (tx) {
      const a = protoFamilies(tx.spec.protocol), b = protoFamilies(s.protocol);
      if (!tx.spec.protocol || !s.protocol) c.unk('Protocol not recorded — confirm it binds to the transmitter');
      else if (a.some((x) => b.indexOf(x) !== -1)) c.ok(`${s.protocol} matches transmitter (${tx.spec.protocol})`);
      else if (/multi|4in1/i.test(tx.spec.protocol)) c.warn(`Multi-protocol transmitter — confirm ${s.protocol} is supported`);
      else c.fail(`${s.protocol} does not match transmitter protocol ${tx.spec.protocol}`);
      if (tx.spec.frequency && s.frequency && !freqBands(tx.spec.frequency).some((x) => freqBands(s.frequency).indexOf(x) !== -1)) c.fail(`Frequency ${s.frequency} ≠ transmitter ${tx.spec.frequency}`);
    } else c.info('Matched once a transmitter is selected');
    if (has(req.channelsMin) && has(s.channels)) (s.channels >= req.channelsMin ? c.ok : c.fail)(`${s.channels} channels`);
    if (req.controlRangeKm && has(s.range)) (s.range >= req.controlRangeKm ? c.ok : c.fail)(`${s.range} km range (needs ${f1(req.controlRangeKm)} km)`);
    if (req.telemetrySupport && s.telemetry === false) c.warn('Receiver has no telemetry downlink');
    commonChecks(it, ctx, c);
    return { checks: c.a, perf: (s.range || 0) / 30 };
  }
  function evalVtx(it, ctx) {
    const c = C();
    const s = it.spec, req = ctx.req;
    const vt = req.videoType;
    if (vt && vt !== 'None') {
      if (!s.videoType) c.unk('Video type not recorded');
      else (U.containsToken(s.videoType, vt) ? c.ok : c.fail)(`${s.videoType} video (needs ${vt})`);
    }
    if (req.videoRangeKm) {
      if (!has(s.range)) c.unk('Video range not recorded');
      else (s.range >= req.videoRangeKm ? c.ok : c.fail)(`${s.range} km video range (needs ${req.videoRangeKm} km)`);
    }
    if (req.frequency && req.frequency !== 'Any' && s.frequency) c.info(`Video on ${s.frequency}`);
    commonChecks(it, ctx, c);
    return { checks: c.a, perf: (s.range || 0) / 30 };
  }
  function evalTelemetry(it, ctx) {
    const c = C();
    const s = it.spec, req = ctx.req;
    const rk = req.controlRangeKm;
    if (rk) {
      if (!has(s.range)) c.unk('Range not recorded');
      else (s.range >= rk ? c.ok : c.fail)(`${s.range} km range (needs ${f1(rk)} km)`);
    }
    if (s.protocol && !/mavlink/i.test(s.protocol)) c.warn(`${s.protocol} — confirm MAVLink support`);
    else if (s.protocol) c.ok('MAVLink');
    if (s.kit === false) c.info('Air unit only — quantity 2 (air + ground)');
    fcAccepts(ctx, it, c);
    commonChecks(it, ctx, c);
    return { checks: c.a, perf: (s.range || 0) / 40 };
  }
  function evalAntenna(it, ctx) {
    const c = C();
    const s = it.spec;
    const tx = ctx.picks.transmitter;
    if (s.antennaUse && !/rc|control|radio|telemetry/i.test(s.antennaUse)) c.warn(`Recorded use: ${s.antennaUse}`);
    if (tx && tx.spec.frequency) {
      if (!s.frequency) c.unk('Frequency not recorded');
      else (freqBands(tx.spec.frequency).some((b) => freqBands(s.frequency).indexOf(b) !== -1) ? c.ok : c.fail)(`${s.frequency} (transmitter ${tx.spec.frequency})`);
    }
    if (s.connector) c.info(`Connector ${s.connector} — check the transmitter's antenna port`);
    commonChecks(it, ctx, c, { noWeight: true });
    return { checks: c.a, perf: (s.gain || 0) / 15 };
  }
  function evalGear(it, ctx) {
    const c = C();
    const s = it.spec, req = ctx.req;
    const mass = ctx.an ? ctx.an.mass : ctx.massKg;
    if (!has(s.maxLoad)) c.unk('Load rating not recorded');
    else (s.maxLoad >= mass ? c.ok : c.fail)(`Rated ${f1(s.maxLoad)} kg (aircraft ≈ ${f1(mass)} kg)`);
    if (req.landingGearType && req.landingGearType !== 'Any') (U.containsToken([s.gearType, s.retractable ? 'retractable' : ''].join(' '), req.landingGearType) ? c.ok : c.warn)(`${s.gearType || 'Type not recorded'} (requested ${req.landingGearType})`);
    const gn = gimbalNeed(ctx);
    if (gn.grams && has(s.height) && s.height < 120) c.warn(`${s.height} mm height — check gimbal camera clearance`);
    commonChecks(it, ctx, c);
    return { checks: c.a, perf: has(s.maxLoad) ? U.clamp(s.maxLoad / mass, 0, 3) / 3 : 0 };
  }
  function evalServo(it, ctx) {
    const c = C();
    const s = it.spec;
    const mass = ctx.an ? ctx.an.mass : ctx.massKg;
    const need = ctx.A.servoTorquePerKg * mass;
    if (!has(s.torque)) c.unk('Torque not recorded');
    else if (s.torque >= need) c.ok(`${s.torque} kg-cm ≥ ${f1(need)} kg-cm rule of thumb`);
    else if (s.torque >= need * 0.7) c.warn(`${s.torque} kg-cm slightly below ${f1(need)} kg-cm rule of thumb`);
    else c.fail(`${s.torque} kg-cm < ${f1(need)} kg-cm rule of thumb`);
    c.info('Verify against control-surface size and hinge moments');
    commonChecks(it, ctx, c);
    return { checks: c.a, perf: has(s.torque) ? s.torque / 40 : 0 };
  }
  function evalCharger(it, ctx) {
    const c = C();
    const s = it.spec;
    const b = ctx.picks.battery;
    if (b && has(b.spec.cells)) {
      if (!has(s.maxCells)) c.unk('Max cells not recorded');
      else (s.maxCells >= b.spec.cells ? c.ok : c.fail)(`Charges up to ${s.maxCells}S (pack ${b.spec.cells}S)`);
      if (has(s.chargePower) && has(b.spec.energy)) {
        const packs = (ctx.parallel || 1) * (ctx.A.seriesPacks || 1);
        const chs = s.chargeChannels || 1;
        const hrs = (b.spec.energy * packs) / (s.chargePower * 0.85) ;
        const hrsPar = (b.spec.energy * Math.ceil(packs / chs) * chs) / (s.chargePower * 0.85);
        (hrs <= 2 ? c.ok : c.warn)(`≈ ${f1(Math.max(hrs, hrsPar / chs))} h to charge ${packs} pack(s)`);
      }
    }
    if (ctx.req.chargeNotes) c.info(`Charging requirement: ${ctx.req.chargeNotes}`);
    commonChecks(it, ctx, c, { noWeight: true });
    return { checks: c.a, perf: (s.chargePower || 0) / 2000 };
  }
  function evalObstacle(it, ctx) {
    const c = C();
    const s = it.spec;
    c.ok(`${s.accType || s.lidarUse || 'Sensor'} — obstacle detection`);
    if (s.interface) c.info(`Interface ${s.interface}`);
    fcAccepts(ctx, it, c);
    c.warn('Obstacle avoidance performance must be validated in flight tests');
    commonChecks(it, ctx, c);
    return { checks: c.a, perf: (s.range || 0) / 100 };
  }
  function evalEngine(it, ctx) {
    const c = C();
    const s = it.spec;
    const an = ctx.an;
    if (!has(s.enginePower)) c.unk('Engine power not recorded');
    else if (an && an.engineRequiredW) {
      if (s.enginePower >= an.engineRequiredW) c.ok(`${f0(s.enginePower)} W ≥ ${f0(an.engineRequiredW)} W (climb × ${ctx.A.engineMargin})`);
      else if (s.enginePower >= an.pw.climbShaft) c.warn(`${f0(s.enginePower)} W covers climb but not the ×${ctx.A.engineMargin} margin`);
      else c.fail(`${f0(s.enginePower)} W < ${f0(an.pw.climbShaft)} W climb power`);
    }
    if (!has(s.bsfc)) c.warn(`BSFC not recorded — ${ctx.A.bsfc} g/kWh assumed for fuel sizing`);
    if (s.generator === true) c.ok('Integrated generator powers avionics in cruise');
    commonChecks(it, ctx, c);
    return { checks: c.a, perf: has(s.bsfc) ? 400 / s.bsfc : 0.3 };
  }
  function wiringReq(it, ctx) {
    const u = low(it.spec.wiringUse);
    const an = ctx.an;
    if (!an) return null;
    if (/battery|main|power/.test(u)) return an.peakCurrentA / (ctx.parallel || 1);
    if (/motor|esc/.test(u)) return an.peakPerLiftMotorA;
    return null;
  }
  function evalWiring(it, ctx) {
    const c = C();
    const need = wiringReq(it, ctx);
    if (need && has(it.spec.current)) (it.spec.current >= need ? c.ok : c.fail)(`${it.spec.current} A rated (needs ${f0(need)} A)`);
    else if (need) c.unk(`Current rating not recorded (needs ${f0(need)} A)`);
    else c.ok('Standard build item (auto-include)');
    commonChecks(it, ctx, c, { noWeight: true });
    return { checks: c.a, perf: 0 };
  }
  function evalAccessory(it, ctx) {
    const c = C();
    c.ok('Standard accessory (auto-include)');
    commonChecks(it, ctx, c, { noWeight: true });
    return { checks: c.a, perf: 0 };
  }

  // ------------------------------------------------------------------ slot registry
  function makeSlots(ctx) {
    const req = ctx.req, lay = ctx.lay, cat = ctx.catalogue;
    const slots = [];
    const add = (s) => slots.push(Object.assign({ need: 'required', units: () => 1, massGroup: 'other', shareable: false }, s));
    const isMR = lay.cls === 'multirotor';
    const nLift = lay.lift, nCr = lay.cruise;
    const escUnits = (n) => (c2, it) => Math.ceil(n / ((it && it.spec.channels) || 1));

    add({ key: 'frame', label: 'Frame', cats: ['frames'], massGroup: 'structure', evaluate: evalFrame, propulsion: true });
    if (nLift) {
      add({ key: 'liftMotor', label: lay.cls === 'multirotor' ? 'Motors' : 'Lift motors', cats: ['motors'], units: () => nLift, massGroup: 'propulsion', evaluate: (it, c2) => evalMotor(it, c2, 'lift'), propulsion: true });
      add({ key: 'liftProp', label: lay.cls === 'multirotor' ? 'Propellers' : 'Lift propellers', cats: ['propellers'], units: () => nLift, massGroup: 'propulsion', evaluate: (it, c2) => evalProp(it, c2, 'lift'), propulsion: true });
      add({ key: 'liftEsc', label: lay.cls === 'multirotor' ? 'ESCs' : 'Lift ESCs', cats: ['escs'], units: escUnits(nLift), massGroup: 'propulsion', evaluate: (it, c2) => evalEsc(it, c2, 'lift'), propulsion: true });
    }
    if (nCr && lay.cls !== 'hybrid') {
      add({ key: 'cruiseMotor', label: lay.cls === 'fixedwing' ? 'Motor' : 'Cruise motor', cats: ['motors'], units: () => nCr, massGroup: 'propulsion', evaluate: (it, c2) => evalMotor(it, c2, 'cruise'), propulsion: true });
      add({ key: 'cruiseProp', label: lay.cls === 'fixedwing' ? 'Propeller' : 'Cruise propeller', cats: ['propellers'], units: () => nCr, massGroup: 'propulsion', evaluate: (it, c2) => evalProp(it, c2, 'cruise'), propulsion: true });
      add({ key: 'cruiseEsc', label: lay.cls === 'fixedwing' ? 'ESC' : 'Cruise ESC', cats: ['escs'], units: escUnits(nCr), massGroup: 'propulsion', evaluate: (it, c2) => evalEsc(it, c2, 'cruise'), propulsion: true });
    }
    if (lay.cls === 'hybrid') {
      add({ key: 'engine', label: 'Fuel engine', cats: ['engines'], massGroup: 'propulsion', evaluate: evalEngine });
      add({ key: 'engineProp', label: 'Engine propeller', cats: ['propellers'], need: 'recommended', units: () => 1, massGroup: 'propulsion', evaluate: (it, c2) => evalProp(it, c2, 'cruise') });
    }
    add({ key: 'battery', label: 'Battery', cats: ['batteries'], units: (c2) => (c2.parallel || 1) * (c2.A.seriesPacks || 1), massGroup: 'battery', evaluate: evalBattery, propulsion: true });

    if (nLift) add({ key: 'pdb', label: 'Power distribution board', cats: ['pdbs'], need: 'dynamic', massGroup: 'power', evaluate: evalPdb });
    const redPM = req.redundantPower || (req.redundancy || []).indexOf('Dual power module') !== -1;
    add({ key: 'powerModule', label: 'Power module', cats: ['powerModules'], need: 'recommended', units: () => (redPM ? 2 : 1), massGroup: 'power', evaluate: evalPM });
    add({ key: 'flightController', label: 'Flight controller', cats: ['flightControllers'], massGroup: 'avionics', evaluate: evalFC });
    const gpsNeeded = req.gps !== 'None' || req.autonomous || req.operation !== 'Manual';
    const dualGps = req.gps === 'Dual GPS' || (req.redundancy || []).indexOf('Dual GPS') !== -1;
    add({ key: 'gps', label: 'GPS module', cats: ['gps'], need: gpsNeeded ? 'required' : 'na', naReason: 'GPS not required', units: () => (dualGps ? 2 : 1), massGroup: 'avionics', evaluate: evalGPS });
    if (req.rtk) add({ key: 'rtk', label: 'RTK module', cats: ['rtk'], massGroup: 'avionics', evaluate: evalRTK });

    // payloads (thermal first so dual-sensor cameras can serve the RGB slot too)
    const order = ['Thermal', 'RGB', 'Zoom', 'Night Vision', 'Hyperspectral', 'Multispectral', 'LiDAR'];
    const pls = (req.payloads || []).filter((p) => p && p.type && p.type !== 'Custom').slice().sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    const typeCount = {};
    ctx.payloadSlots = [];
    pls.forEach((p) => {
      typeCount[p.type] = (typeCount[p.type] || 0) + 1;
      const key = 'payload_' + U.slug(p.type) + (typeCount[p.type] > 1 ? '_' + typeCount[p.type] : '');
      let cats, ev;
      if (p.type === 'Thermal') { cats = ['thermalCameras']; ev = (it, c2) => evalThermal(it, c2, p); }
      else if (p.type === 'Multispectral') { cats = ['multispectral']; ev = (it, c2) => evalMultispectral(it, c2, p); }
      else if (p.type === 'LiDAR') { cats = ['lidar']; ev = (it, c2) => evalLidar(it, c2, p); }
      else if (p.type === 'RGB') { cats = ['cameras', 'thermalCameras']; ev = (it, c2) => evalCamera(it, c2, p); }
      else if (p.type === 'Hyperspectral') { cats = ['cameras', 'multispectral']; ev = (it, c2) => evalCamera(it, c2, p); }
      else { cats = ['cameras']; ev = (it, c2) => evalCamera(it, c2, p); }
      const s = { key, label: p.type + ' payload', cats, massGroup: 'payload', evaluate: ev, shareable: true, payload: p };
      add(s);
      ctx.payloadSlots.push(s);
    });
    add({ key: 'gimbal', label: 'Gimbal', cats: ['gimbals'], need: 'dynamic', massGroup: 'payload', evaluate: evalGimbal });
    add({ key: 'ubec', label: 'UBEC (accessory power)', cats: ['ubecs'], need: 'dynamic', massGroup: 'power', evaluate: evalUbec });
    add({ key: 'transmitter', label: 'Transmitter / GCS', cats: ['transmitters'], massGroup: 'comms', groundOnly: true, evaluate: evalTx });
    add({ key: 'receiver', label: 'Receiver', cats: ['receivers'], need: 'dynamic', massGroup: 'comms', evaluate: evalRx });
    if (req.videoType && req.videoType !== 'None') add({ key: 'videoTx', label: 'Video transmitter', cats: ['videoTx'], need: 'dynamic', massGroup: 'comms', evaluate: evalVtx });
    if (req.telemetry) add({ key: 'telemetry', label: 'Telemetry radio', cats: ['telemetry'], need: 'dynamic', units: (c2, it) => (it && it.spec.kit === false ? 2 : 1), massGroup: 'comms', evaluate: evalTelemetry });
    add({ key: 'antenna', label: 'Ground antenna', cats: ['antennas'], need: 'dynamic', massGroup: 'comms', groundOnly: true, evaluate: evalAntenna });
    if (lay.cls !== 'fixedwing') add({ key: 'landingGear', label: 'Landing gear', cats: ['landingGear'], need: 'dynamic', massGroup: 'structure', evaluate: evalGear });
    if (lay.cls !== 'multirotor') add({ key: 'servos', label: 'Control-surface servos', cats: ['servos'], units: (c2) => c2.A.defaultServos, massGroup: 'structure', evaluate: evalServo });
    if (req.obstacle) add({ key: 'obstacle', label: 'Obstacle avoidance sensor', cats: ['accessories', 'lidar'], filter: (it) => (it.cat === 'lidar' ? /obstacle|avoid|proxim|range/i.test(it.spec.lidarUse || '') : /obstacle|avoid|proxim|rangefinder/i.test(it.spec.accType || '')), massGroup: 'avionics', evaluate: evalObstacle });
    if (req.charger) add({ key: 'charger', label: 'Battery charger', cats: ['accessories'], filter: (it) => /charg/i.test(it.spec.accType || it.name), groundOnly: true, units: () => Math.max(1, Number(req.chargerQty) || 1), evaluate: evalCharger });

    // auto-include wiring groups and accessories
    const wiringUses = {};
    (cat.byCat.wiring || []).filter((it) => it.spec.autoInclude === true).forEach((it) => {
      const u = it.spec.wiringUse || 'General';
      (wiringUses[u] = wiringUses[u] || []).push(it);
    });
    Object.keys(wiringUses).forEach((u) => {
      add({
        key: 'wiring_' + U.slug(u), label: 'Wiring — ' + u, cats: ['wiring'], need: 'optional', auto: true,
        filter: (it) => it.spec.autoInclude === true && (it.spec.wiringUse || 'General') === u, massGroup: 'power', evaluate: evalWiring,
        units: (c2, it) => {
          const m = (it && it.spec.qtyMult) || 1;
          const b = low(it && it.spec.qtyBasis);
          if (/motor/.test(b)) return m * (c2.lay.lift + c2.lay.cruise);
          if (/battery/.test(b)) return m * (c2.parallel || 1) * (c2.A.seriesPacks || 1);
          return m;
        },
      });
    });
    (cat.byCat.accessories || []).filter((it) => it.spec.autoInclude === true && !/charg/i.test(it.spec.accType || '')).forEach((it) => {
      add({ key: 'acc_' + U.slug(it.id), label: it.spec.accType || 'Accessory', cats: ['accessories'], need: 'optional', auto: true, filter: (x) => x.id === it.id, groundOnly: true, evaluate: evalAccessory, massGroup: 'other' });
    });
    return slots;
  }

  /** Decide dynamic needs from the current picks. */
  function slotNeed(slot, ctx) {
    const p = ctx.picks, req = ctx.req;
    if (slot.need !== 'dynamic') return slot.need;
    const tx = p.transmitter;
    switch (slot.key) {
      case 'pdb': {
        if (p.frame && p.frame.spec.pdbIncluded === true) return 'na';
        const e = p.liftEsc;
        return e && (e.spec.channels || 1) >= ctx.lay.lift && ctx.lay.lift > 1 ? 'optional' : 'recommended';
      }
      case 'gimbal':
        return gimbalNeed(ctx).axes ? 'required' : 'na';
      case 'ubec':
        return auxPowerNeedW(ctx) > 0 ? 'recommended' : 'na';
      case 'receiver':
        return tx && tx.spec.airUnit === true ? 'na' : 'required';
      case 'videoTx':
        if (tx && tx.spec.videoLink === true && !(req.videoRangeKm && has(tx.spec.videoRange) && tx.spec.videoRange < req.videoRangeKm)) return 'na';
        return 'required';
      case 'telemetry':
        return tx && tx.spec.videoLink === true && tx.spec.telemetry === true ? 'na' : 'required';
      case 'antenna':
        return (req.controlRangeKm || 0) >= 5 && !(tx && tx.spec.videoLink) ? 'optional' : 'na';
      case 'landingGear': {
        const fr = p.frame;
        if (fr && fr.spec.gearIncluded === true) return 'na';
        if (req.landingGearType === 'None') return 'na';
        return fr && fr.spec.gearIncluded === false ? 'required' : 'recommended';
      }
      default:
        return 'required';
    }
  }
  const NA_REASON = {
    pdb: 'Frame has an integrated PDB', gimbal: 'No separate gimbal needed', ubec: 'No accessory power needed', receiver: 'Transmitter includes the air unit',
    videoTx: 'Video link integrated in the transmitter', telemetry: 'Telemetry carried by the integrated link',
    antenna: 'Not needed for this control range', landingGear: 'Included with the frame / not required',
  };

  // ------------------------------------------------------------------ candidate ranking
  function itemsFor(slot, ctx) {
    let list = [];
    slot.cats.forEach((k) => (list = list.concat(ctx.catalogue.byCat[k] || [])));
    if (slot.filter) list = list.filter(slot.filter);
    return list;
  }

  function scoreList(cands, mode) {
    const ok = cands.filter((x) => x.status !== ST.BAD);
    const minCost = Math.max(1, Math.min.apply(null, ok.map((x) => x.cost || 0).concat([Infinity])));
    const maxPerf = Math.max(1e-6, Math.max.apply(null, ok.map((x) => x.perf || 0).concat([0])));
    const minW = Math.max(1, Math.min.apply(null, ok.map((x) => x.weight || 0).concat([Infinity])));
    cands.forEach((x) => {
      const cost = x.cost || 0, perf = x.perf || 0, w = x.weight || 0;
      if (mode === 'lowest') x.score = cost / minCost + w / minW * 0.001 - perf / maxPerf * 0.0001 - x.pref * 0.02;
      else if (mode === 'best') x.score = -perf / maxPerf + cost / minCost * 0.01 - x.pref * 0.02;
      else x.score = 0.5 * (cost / minCost) + 0.2 * (w / minW) - 0.3 * (perf / maxPerf) - x.pref * 0.03;
    });
    cands.sort((a, b) => RANK[a.status] - RANK[b.status] || a.score - b.score);
    return cands;
  }

  function candidate(slot, it, ctx) {
    const ev = slot.evaluate(it, ctx);
    const units = slot.units(ctx, it, ctx.picks);
    const packs = Math.ceil(units / (it.packQty || 1));
    let cost = (it.price || 0) * packs;
    let weight = (it.weight || 0) * units;
    if (slot.shareable) {
      const other = ctx.payloadSlots.find((s) => s.key !== slot.key && ctx.picks[s.key] && ctx.picks[s.key].id === it.id);
      if (other) {
        cost = 0;
        weight = 0;
        ev.checks.push({ r: 'ok', t: `Already selected for ${other.label} — one unit serves both` });
      }
    }
    if (ctx.overrides[slot.key] === it.id) ev.checks.push({ r: 'info', t: 'Manually selected' });
    return { item: it, id: it.id, checks: ev.checks, status: statusOf(ev.checks), perf: ev.perf || 0, cost, weight, units, packs, pref: prefScore(it, ctx) };
  }

  function rankSlot(slot, ctx) {
    const list = itemsFor(slot, ctx).map((it) => candidate(slot, it, ctx));
    return scoreList(list, ctx.mode);
  }

  // ------------------------------------------------------------------ joint propulsion search
  function cellOptions(ctx) {
    const series = ctx.A.seriesPacks || 1;
    const pinB = pinned(ctx, 'battery');
    if (has(ctx.req.batteryCells)) return [Number(ctx.req.batteryCells)];
    let set = {};
    const bats = pinB ? [pinB] : ctx.catalogue.byCat.batteries || [];
    bats.forEach((b) => has(b.spec.cells) && (set[b.spec.cells * series] = 1));
    let opts = Object.keys(set).map(Number);
    if (!opts.length) opts = [ctx.pre.cells || SZ.defaultCells(ctx.massKg)];
    return opts.sort((a, b) => a - b);
  }
  function pinned(ctx, key) {
    const id = ctx.overrides[key];
    if (!id || id === '__none__') return null;
    return ctx.catalogue.byId[id] || null;
  }
  function excluded(ctx, key) {
    return ctx.overrides[key] === '__none__';
  }

  function topK(arr, k) {
    return arr.slice(0, k);
  }

  function searchPropulsion(ctx) {
    const lay = ctx.lay, A = ctx.A;
    const slot = ctx.slotDefs;
    const tmpCtx = (extra) => Object.assign({}, ctx, extra);
    const pool = (key, cat) => {
      if (excluded(ctx, key)) return [null];
      const p = pinned(ctx, key);
      if (p) return [p];
      const items = (ctx.catalogue.byCat[cat] || []).filter((it) => it.stock !== 'Discontinued');
      return items.length ? items : [null];
    };

    // frames: static screen (class + motor count)
    let frames = pool('frame', 'frames');
    if (frames[0] && !pinned(ctx, 'frame')) {
      const scr = frames.map((f) => ({ f, c: candidate(slot.frame, f, tmpCtx({ picks: {}, an: null })) }))
        .filter((x) => !x.c.checks.some((ch) => ch.r === 'fail' && /airframe|motor positions/.test(ch.t)));
      frames = scr.length ? scoreList(scr.map((x) => Object.assign(x.c, { f: x.f })), ctx.mode).slice(0, 8).map((x) => x.f) : [null];
    }
    const Sopts = cellOptions(ctx);
    const fixedPicks = {};
    Object.keys(ctx.picks).forEach((k) => {
      if (PROPULSION.indexOf(k) === -1) fixedPicks[k] = ctx.picks[k];
    });

    // Items whose need depends on the frame (gear / PDB) are priced and weighed
    // into every combination so frames with and without them compare fairly.
    const guess = (key) => {
      const sd = slot[key];
      if (!sd || excluded(ctx, key)) return null;
      if (pinned(ctx, key)) return pinned(ctx, key);
      const ranked = rankSlot(sd, ctx);
      const b = ranked.find((x) => x.status !== ST.BAD) || ranked[0];
      return b ? b.item : null;
    };
    const gearGuess = guess('landingGear');
    const pdbGuess = guess('pdb');
    delete fixedPicks.landingGear;
    delete fixedPicks.pdb;
    function frameExtras(picks) {
      const fr = picks.frame;
      if (gearGuess && slot.landingGear && ctx.req.landingGearType !== 'None' && !(fr && fr.spec.gearIncluded === true)) picks.landingGear = gearGuess;
      const e = picks.liftEsc;
      const singleEsc = e && (e.spec.channels || 1) >= lay.lift && lay.lift > 1;
      if (pdbGuess && slot.pdb && !(fr && fr.spec.pdbIncluded === true) && !singleEsc) picks.pdb = pdbGuess;
    }

    const userMaxProp = has(ctx.req.maxPropIn) ? Number(ctx.req.maxPropIn) : Infinity;
    const motorsAll = (role) => pool(role === 'lift' ? 'liftMotor' : 'cruiseMotor', 'motors');
    const propsAll = (role) => pool(role === 'lift' ? 'liftProp' : 'cruiseProp', 'propellers');
    const pairCache = {};
    function pairsFor(role, S, maxProp) {
      const key = role + S + '|' + maxProp;
      if (pairCache[key]) return pairCache[key];
      const n = role === 'lift' ? lay.lift : lay.cruise;
      const twReq = role === 'lift' ? (lay.cls === 'multirotor' ? Math.max(A.twMultirotor, ctx.an ? ctx.an.twRequired : 0) : A.twVtolLift) : lay.cls === 'fixedwing' ? A.twFixedWing : A.twVtolCruise;
      const reqG = (ctx.massKg * 1000 * twReq) / n;
      const out = [];
      motorsAll(role).forEach((m) => {
        propsAll(role).forEach((p) => {
          if (!m || !p) return out.push({ m, p, thrustG: 0, cost: 0, bad: true });
          const isPinM = pinned(ctx, role === 'lift' ? 'liftMotor' : 'cruiseMotor');
          const isPinP = pinned(ctx, role === 'lift' ? 'liftProp' : 'cruiseProp');
          const dia = p.spec.diameter;
          if (!isPinP && (!has(dia) || dia > maxProp + 0.01 || (role === 'lift' && dia > userMaxProp + 0.01))) return;
          if (!isPinM) {
            const lo = m.spec.cellsMin, hi = m.spec.cellsMax;
            if ((has(hi) && S > hi) || (has(lo) && S < lo)) return;
            if (has(m.spec.propMax) && dia > m.spec.propMax + 0.01) return;
            if (m.spec.role && role === 'lift' && /cruise/i.test(m.spec.role)) return;
          }
          if (!isPinP && p.spec.role && ((role === 'lift' && /cruise/i.test(p.spec.role)) || (role === 'cruise' && /lift/i.test(p.spec.role)))) return;
          const pt = pairThrust(ctx, m, p, S);
          if (!has(pt.thrustG) && !(isPinM && isPinP)) return;
          const cost = (m.price || 0) * n + (p.price || 0) * Math.ceil(n / (p.packQty || 1));
          out.push({ m, p, thrustG: pt.thrustG || 0, cost, curve: pt.curve, enough: (pt.thrustG || 0) >= reqG, reqG });
        });
      });
      let good = out.filter((x) => x.enough);
      const rank = (arr) => {
        if (ctx.mode === 'lowest') arr.sort((a, b) => a.cost - b.cost || b.thrustG - a.thrustG);
        else if (ctx.mode === 'best') arr.sort((a, b) => (b.curve ? 1 : 0) - (a.curve ? 1 : 0) || b.p.spec.diameter - a.p.spec.diameter || a.cost - b.cost);
        else arr.sort((a, b) => a.cost / Math.max(a.thrustG, 1) - b.cost / Math.max(b.thrustG, 1) - ((b.p.spec.diameter || 0) - (a.p.spec.diameter || 0)) * 0.002);
        return arr;
      };
      if (!good.length) good = out.sort((a, b) => b.thrustG - a.thrustG).slice(0, 3); // closest
      else good = rank(good);
      // keep diversity: best few overall plus largest prop
      const res = topK(good, 5);
      pairCache[key] = res.length ? res : [{ m: null, p: null, thrustG: 0, cost: 0 }];
      return pairCache[key];
    }

    const escsAll = (role) => pool(role === 'lift' ? 'liftEsc' : 'cruiseEsc', 'escs');
    function bestEsc(role, pair, S, picksSoFar) {
      const n = role === 'lift' ? lay.lift : lay.cruise;
      const list = escsAll(role);
      if (!list[0]) return null;
      const sk = role === 'lift' ? 'liftEsc' : 'cruiseEsc';
      if (pinned(ctx, sk)) return list[0];
      const c2 = tmpCtx({ S, picks: Object.assign({}, picksSoFar, role === 'lift' ? { liftMotor: pair.m, liftProp: pair.p } : { cruiseMotor: pair.m, cruiseProp: pair.p }) });
      const cands = list.map((e) => candidate(slot[sk], e, c2)).filter((x) => x.status !== ST.BAD);
      if (!cands.length) {
        const all = scoreList(list.map((e) => candidate(slot[sk], e, c2)), ctx.mode);
        return all[0] ? Object.assign(all[0].item, {}) : null;
      }
      return scoreList(cands, ctx.mode)[0].item;
    }

    const batteriesAll = pool('battery', 'batteries');
    const minPar = (ctx.req.redundancy || []).indexOf('Dual battery') !== -1 || ctx.req.redundantPower ? 2 : 1;
    const maxPar = Math.max(minPar, Math.round(A.maxParallel || 1));
    const combos = [];
    const needCruise = lay.cruise && lay.cls !== 'hybrid';
    frames.forEach((fr) => {
      const mp = fr ? frameMaxProp(fr, lay.lift).v : null;
      const maxProp = has(mp) ? mp : Infinity;
      Sopts.forEach((S) => {
        const liftPairs = lay.lift ? pairsFor('lift', S, maxProp) : [{ m: null, p: null, none: true }];
        const cruisePairs = needCruise ? topK(pairsFor('cruise', S, Infinity), 3) : [{ m: null, p: null, none: true }];
        const bats = batteriesAll.filter((b) => !b || pinned(ctx, 'battery') || (has(b.spec.cells) && b.spec.cells * (A.seriesPacks || 1) === S));
        const batOpts = bats.length ? bats : [null];
        liftPairs.forEach((lp) => {
          cruisePairs.forEach((cp) => {
            const base = Object.assign({}, fixedPicks, { frame: fr });
            if (!lp.none) Object.assign(base, { liftMotor: lp.m, liftProp: lp.p });
            if (!cp.none) Object.assign(base, { cruiseMotor: cp.m, cruiseProp: cp.p });
            if (!lp.none && lp.m) base.liftEsc = bestEsc('lift', lp, S, base);
            if (!cp.none && cp.m) base.cruiseEsc = bestEsc('cruise', cp, S, base);
            batOpts.forEach((b) => {
              const pars = ctx.overrides.__parallel ? [Number(ctx.overrides.__parallel)] : b ? Array.from({ length: maxPar - minPar + 1 }, (_, i) => i + minPar) : [1];
              pars.forEach((par) => {
                const picks = Object.assign({}, base, { battery: b });
                combos.push(evalCombo(picks, S, par));
              });
            });
          });
        });
      });
    });

    function evalCombo(picks, S, par) {
      Object.keys(picks).forEach((k) => picks[k] === null && delete picks[k]);
      frameExtras(picks);
      const c2 = tmpCtx({ S, parallel: par, picks });
      c2.an = analysePicks(picks, c2);
      const res = { picks, S, par, an: c2.an, fails: [], worst: 0, cost: 0, short: 0 };
      PROPULSION.forEach((k) => {
        if (!slot[k]) return;
        const it = picks[k];
        if (!it) {
          if (!excluded(ctx, k)) {
            res.fails.push({ slot: k, t: 'none available' });
            res.worst = Math.max(res.worst, RANK.unavailable);
          }
          return;
        }
        const cd = candidate(slot[k], it, c2);
        res.cost += cd.cost;
        if (cd.status === ST.BAD) res.fails.push({ slot: k, t: cd.checks.filter((x) => x.r === 'fail').map((x) => x.t).join('; ') });
        res.worst = Math.max(res.worst, RANK[cd.status]);
      });
      ['landingGear', 'pdb'].forEach((k) => {
        if (picks[k]) res.cost += (picks[k].price || 0) * Math.ceil(slot[k].units(c2, picks[k], picks) / (picks[k].packQty || 1));
      });
      const an = c2.an;
      if (has(ctx.req.mtowLimitKg) && an.mass > Number(ctx.req.mtowLimitKg)) res.fails.push({ slot: 'system', t: 'MTOW limit' }), (res.worst = Math.max(res.worst, RANK.incompatible));
      // shortfall metric for closest-match ranking
      if (an.twActual && an.twRequired) res.short += Math.max(0, 1 - an.twActual / an.twRequired) * 3;
      if (an.estimatedEnduranceMin != null && an.missionTimeS) res.short += Math.max(0, 1 - an.estimatedEnduranceMin / (an.missionTimeS / 60)) * 2;
      if (an.requiredC && picks.battery && picks.battery.spec.cRating) res.short += Math.max(0, an.requiredC / picks.battery.spec.cRating - 1);
      res.perf = (an.estimatedEnduranceMin && an.missionTimeS ? Math.min(an.estimatedEnduranceMin / (an.missionTimeS / 60), 1.6) : 0) + 0.4 * Math.min((an.twActual || 0) / (an.twRequired || 2), 1.5);
      res.mass = an.mass;
      res.pref = PROPULSION.reduce((s, k) => s + (picks[k] ? prefScore(picks[k], ctx) : 0), 0);
      return res;
    }

    let feasible = combos.filter((c) => c.worst < RANK.incompatible);
    let chosen, closest = false;
    if (feasible.length) {
      const bestRank = Math.min.apply(null, feasible.map((c) => c.worst));
      const tier = feasible.filter((c) => c.worst === bestRank);
      const minCost = Math.max(1, Math.min.apply(null, tier.map((c) => c.cost)));
      const maxPerf = Math.max(1e-6, Math.max.apply(null, tier.map((c) => c.perf)));
      tier.forEach((c) => {
        if (ctx.mode === 'lowest') c.score = c.cost / minCost + c.mass * 1e-4 - c.pref * 0.005;
        else if (ctx.mode === 'best') c.score = -c.perf / maxPerf + (c.cost / minCost) * 0.02 - c.pref * 0.01;
        else c.score = 0.55 * (c.cost / minCost) - 0.45 * (c.perf / maxPerf) - c.pref * 0.01;
      });
      tier.sort((a, b) => a.score - b.score);
      chosen = tier[0];
    } else if (combos.length) {
      combos.sort((a, b) => a.fails.length - b.fails.length || a.short - b.short || a.cost - b.cost);
      chosen = combos[0];
      closest = true;
    }
    return { chosen, closest, combosEvaluated: combos.length, Sopts };
  }

  // ------------------------------------------------------------------ main entry
  function run(catalogue, reqIn, opts) {
    opts = opts || {};
    const t0 = Date.now();
    const A = SZ.withDefaults(opts.assumptions);
    const req = readReq(reqIn || {}, A);
    const lay = SZ.motorLayout(req);
    const clsLabel = { multirotor: 'multirotor', fixedwing: 'fixed-wing', vtol: 'VTOL', hybrid: 'hybrid VTOL' }[lay.cls];
    const flags = [];
    if (lay.cls === 'multirotor' && !lay.lift) flags.push({ level: 'error', text: 'Enter the motor count for a custom configuration.' });
    if ((req.aircraftClass || '').toLowerCase() === 'other') flags.push({ level: 'warn', text: '"Other" airframe category — analysed with the multirotor model. Verify the results manually.' });
    if (lay.cls === 'fixedwing' && /copter/i.test(req.configuration || '')) flags.push({ level: 'warn', text: `Configuration "${req.configuration}" does not apply to a fixed-wing aircraft — treated as a single-motor fixed wing.` });
    if ((lay.cls === 'vtol' || lay.cls === 'hybrid') && /fixed wing/i.test(req.configuration || '')) flags.push({ level: 'info', text: 'VTOL lift layout defaulted to 4 lift motors (quadplane).' });
    if (lay.cls === 'multirotor' && (req.redundancy || []).indexOf('Motor-out tolerance') !== -1 && lay.lift < 6) flags.push({ level: 'error', text: `Motor-out tolerance needs at least 6 motors — ${req.configuration} has ${lay.lift}.` });

    const vCellPref = CAT.nominalCellVoltage(req.chemistry, A);
    const pre = SZ.preSize(req, A);
    const ctx = {
      catalogue, req, A, lay, clsLabel, mode: opts.mode || req.selectionMode || 'balanced', overrides: Object.assign({}, opts.overrides || {}),
      prefBrands: U.toList(req.preferredBrands), prefVendors: U.toList(req.preferredVendors), cache: { curves: {}, pairs: {} },
      picks: {}, pre, massKg: has(req.mtowLimitKg) && !pre.converged ? Number(req.mtowLimitKg) : pre.massKg || 2,
      S: pre.cells || SZ.defaultCells(pre.massKg || 2), vCell: vCellPref, parallel: 1, an: null,
    };
    ctx.rho = SZ.isaDensity((A.siteElevation || 0) + (Number(req.altitudeM) || 0), A.rho0);
    if (ctx.overrides.__parallel) ctx.parallel = Number(ctx.overrides.__parallel) || 1;
    const slots = makeSlots(ctx);
    ctx.slotDefs = {};
    slots.forEach((s) => (ctx.slotDefs[s.key] = s));

    // seed pinned picks
    slots.forEach((s) => {
      const p = pinned(ctx, s.key);
      if (p) ctx.picks[s.key] = p;
    });

    let iter = 0, search = null, prevSig = '';
    const auxSlots = slots.filter((s) => !s.propulsion);
    for (iter = 0; iter < 6; iter++) {
      // 1) payload / avionics / comms / power
      auxSlots.forEach((s) => {
        const need = slotNeed(s, ctx);
        if (need === 'na' || excluded(ctx, s.key)) {
          delete ctx.picks[s.key];
          return;
        }
        const pin = pinned(ctx, s.key);
        if (pin) {
          ctx.picks[s.key] = pin;
          return;
        }
        delete ctx.picks[s.key];
        const ranked = rankSlot(s, ctx);
        const best = ranked.find((x) => x.status !== ST.BAD);
        if (best) ctx.picks[s.key] = best.item;
      });
      // 2) propulsion
      search = searchPropulsion(ctx);
      if (search.chosen) {
        PROPULSION.forEach((k) => delete ctx.picks[k]);
        Object.keys(search.chosen.picks).forEach((k) => {
          if (PROPULSION.indexOf(k) !== -1 && search.chosen.picks[k]) ctx.picks[k] = search.chosen.picks[k];
        });
        ctx.S = search.chosen.S;
        ctx.parallel = search.chosen.par;
      }
      ctx.vCell = ctx.picks.battery ? CAT.nominalCellVoltage(ctx.picks.battery.spec.chemistry, A) : vCellPref;
      ctx.an = analysePicks(ctx.picks, ctx);
      const prevMass = ctx.massKg;
      ctx.massKg = ctx.an.mass;
      const sig = Object.keys(ctx.picks).sort().map((k) => k + ':' + ctx.picks[k].id).join('|') + '|' + ctx.S + '|' + ctx.parallel;
      if (sig === prevSig && Math.abs(ctx.massKg - prevMass) / Math.max(prevMass, 0.01) < 0.005) break;
      prevSig = sig;
    }
    const converged = iter < 6;
    // final auxiliary pass so items whose need depends on the final frame / ESC / mass are settled
    auxSlots.forEach((s) => {
      const need = slotNeed(s, ctx);
      if (need === 'na' || excluded(ctx, s.key)) {
        delete ctx.picks[s.key];
        return;
      }
      if (pinned(ctx, s.key)) return;
      const cur = ctx.picks[s.key];
      if (cur && candidate(s, cur, ctx).status !== ST.BAD) return;
      const best = rankSlot(s, ctx).find((x) => x.status !== ST.BAD);
      if (best) ctx.picks[s.key] = best.item;
      else delete ctx.picks[s.key];
    });
    ctx.an = analysePicks(ctx.picks, ctx);
    ctx.massKg = ctx.an.mass;

    // ---------------- verification pass
    const unresolvedClosest = {};
    if (search && search.closest && search.chosen) {
      search.chosen.fails.forEach((f) => {
        if (f.slot !== 'system' && ctx.picks[f.slot] && !pinned(ctx, f.slot)) {
          unresolvedClosest[f.slot] = ctx.picks[f.slot];
        }
      });
    }
    const results = [];
    let anyManual = false, anyCond = false, missingRequired = [];
    slots.forEach((s) => {
      const need = s.propulsion ? 'required' : slotNeed(s, ctx);
      const r = { key: s.key, label: s.label, cats: s.cats, need, auto: !!s.auto, shareable: s.shareable, groundOnly: !!s.groundOnly, payload: s.payload || null, massGroup: s.massGroup };
      if (need === 'na') {
        r.na = s.naReason || NA_REASON[s.key] || 'Not required';
        results.push(r);
        return;
      }
      if (excluded(ctx, s.key)) {
        r.excluded = true;
        r.status = null;
        results.push(r);
        return;
      }
      const ranked = rankSlot(s, ctx);
      r.candidates = ranked.map((x) => ({ id: x.id, status: x.status, checks: x.checks, cost: x.cost, units: x.units, packs: x.packs, perf: x.perf }));
      r.dbCount = ranked.length;
      let pick = ctx.picks[s.key] || null;
      if (pick && !s.propulsion && !pinned(ctx, s.key) && candidate(s, pick, ctx).status === ST.BAD) {
        // re-check against the final numbers: never keep an incompatible auto-pick
        const alt = ranked.find((x) => x.status !== ST.BAD);
        pick = alt ? alt.item : null;
        if (pick) ctx.picks[s.key] = pick;
        else {
          r.closest = candidate(s, ctx.picks[s.key], ctx);
          delete ctx.picks[s.key];
        }
      }
      if (unresolvedClosest[s.key]) {
        r.closest = candidate(s, unresolvedClosest[s.key], ctx);
        pick = null;
      }
      if (pick) {
        const pc = candidate(s, pick, ctx);
        r.pick = pc;
        r.pinned = !!pinned(ctx, s.key);
        r.status = pc.status;
        r.units = pc.units;
        r.qty = pc.packs;
        r.alternatives = ranked.filter((x) => x.id !== pick.id && x.status !== ST.BAD).slice(0, 2);
        if (pc.status === ST.MANUAL) anyManual = true;
        if (pc.status === ST.COND) anyCond = true;
        r.reason = selectionReason(r, ctx);
      } else {
        if (!r.closest) {
          const best = ranked[0];
          if (best) r.closest = best;
        }
        r.status = ST.NA;
        r.unresolved = true;
        r.message = ranked.length ? NO_MATCH_MSG : `No ${(ctx.catalogue.categories[s.cats[0]] || { label: s.cats[0] }).label.toLowerCase()} in your database. ${NO_MATCH_MSG}`;
        if (need === 'required') missingRequired.push(s.label);
        else if (need === 'recommended') flags.push({ level: 'warn', text: `${s.label}: none suitable in the database (recommended item).` });
      }
      results.push(r);
    });

    // ---------------- feasibility
    const an = ctx.an;
    const mb = an.mb;
    const sys = [];
    if (missingRequired.length) flags.push({ level: 'error', text: `No suitable component for: ${missingRequired.join(', ')}. The BOQ is incomplete.` });
    results.forEach((r) => {
      if (r.pick && r.pick.status === ST.BAD) flags.push({ level: 'error', text: `${r.label}: the manually selected "${r.pick.item.name}" is not compatible — ${r.pick.checks.filter((x) => x.r === 'fail').map((x) => x.t).join('; ')}` });
    });
    if (pre.spiral) {
      const battOk = ctx.picks.battery && an.estimatedEnduranceMin != null && an.estimatedEnduranceMin >= an.missionTimeS / 60 - 0.05;
      if (battOk) flags.push({ level: 'info', text: `Parametric pre-sizing at ${A.energyDensity} Wh/kg did not close (battery mass spiral); the selected battery's real energy density is used for the final figures.` });
      else flags.push({ level: 'error', text: `Battery mass spiral: at ${A.energyDensity} Wh/kg the battery needed for this endurance/range grows faster than the energy it adds. Reduce endurance, range or payload, or use higher energy-density cells.` });
    }
    if (lay.lift && an.twActual != null) {
      if (an.twActual < an.twRequired) sys.push(['error', `Thrust-to-weight ${f2(an.twActual)} is below the required ${f2(an.twRequired)}${an.twWind > A.twMultirotor ? ' (raised for the specified wind)' : ''}.`]);
      if (an.twActual < 1.3) sys.push(['error', 'The aircraft cannot hover with adequate control authority (T/W < 1.3).']);
    }
    if (an.estimatedEnduranceMin != null && an.missionTimeS && lay.cls !== 'hybrid' && an.estimatedEnduranceMin < an.missionTimeS / 60 - 0.05) sys.push(['error', `Estimated mission endurance ${f1(an.estimatedEnduranceMin)} min is short of the ${f1(an.missionTimeS / 60)} min mission.`]);
    if (an.requiredC && ctx.picks.battery && has(ctx.picks.battery.spec.cRating) && an.requiredC > ctx.picks.battery.spec.cRating * A.cSafety) sys.push(['error', `Battery cannot supply the ${f0(an.peakCurrentA)} A peak current (needs ${f1(an.requiredC)}C).`]);
    if (has(req.mtowLimitKg) && an.mass > Number(req.mtowLimitKg)) sys.push(['error', `Estimated take-off weight ${f2(an.mass)} kg exceeds the ${req.mtowLimitKg} kg MTOW limit.`]);
    if (an.stallSpeed && an.stallMarginOk === false) sys.push(['warn', `Cruise speed ${f1(an.mission.cruise)} m/s is less than 1.3 × stall speed (${f1(an.stallSpeed)} m/s).`]);
    if (lay.cls !== 'multirotor' && req.windSpeedMs && req.windSpeedMs > 0.6 * an.mission.cruise) sys.push(['warn', `Wind ${f1(req.windSpeedMs)} m/s is more than 60% of cruise speed — ground speed into wind will be very low.`]);
    if (lay.cls === 'multirotor' && req.maxSpeedMs && an.twActual && an.twActual < 1.6 && req.maxSpeedMs > 15) sys.push(['warn', 'High requested speed with limited thrust margin.']);
    if (mb.selectedPayloadG > mb.requiredPayloadG && mb.requiredPayloadG > 0) sys.push(['warn', `Selected payload equipment (${f2(mb.selectedPayloadG / 1000)} kg) exceeds the stated payload capacity (${f2(mb.requiredPayloadG / 1000)} kg); sized for the heavier value.`]);
    if (ctx.picks.battery && mb.groups.battery / mb.totalG > 0.55) sys.push(['warn', `Battery is ${f0((mb.groups.battery / mb.totalG) * 100)}% of take-off weight — very sensitive to battery mass.`]);
    if (lay.cls === 'hybrid' && an.fuelKg) sys.push(['info', `Fuel required ≈ ${f2(an.fuelKg)} kg (incl. ${A.fuelReserve}% reserve). Fuel and tank are not part of the BOQ.`]);
    if (!converged) sys.push(['warn', 'Selection did not fully converge — verify the weight/power figures.']);
    if (search && search.closest) sys.push(['error', 'No propulsion combination in your database meets every requirement — the closest combination is shown for diagnosis only.']);
    sys.forEach((x) => flags.push({ level: x[0], text: x[1] }));

    const errors = flags.filter((f) => f.level === 'error').length;
    const feasibility = errors ? 'infeasible' : anyManual || anyCond || flags.some((f) => f.level === 'warn') ? 'conditional' : 'feasible';

    const report = buildReport(ctx, results, pre);
    return {
      version: 2, generatedAt: new Date().toISOString(), ms: Date.now() - t0, mode: ctx.mode,
      layout: lay, clsLabel, cells: ctx.S, parallel: ctx.parallel, series: A.seriesPacks, vNom: an.vNom,
      slots: results, flags, feasibility, analysis: stripAn(an), pre: stripAn(pre), report, assumptions: A,
      iterations: iter + 1, converged, combosEvaluated: search ? search.combosEvaluated : 0, catalogueBuiltAt: catalogue.meta && catalogue.meta.builtAt,
      confidence: confidenceNotes(ctx, an),
    };
  }

  function stripAn(an) {
    if (!an) return null;
    const o = {};
    Object.keys(an).forEach((k) => {
      if (k === 'phys') {
        o.phys = Object.assign({}, an.phys);
        if (o.phys.liftCurve) o.phys.liftCurve = { source: an.phys.liftCurve.source, maxThrustG: an.phys.liftCurve.maxThrustG, flightTested: an.phys.liftCurve.flightTested };
      } else if (k === 'mb') {
        o.mb = Object.assign({}, an.mb, { lines: an.mb.lines.map((l) => ({ slot: l.slot, id: l.item.id, name: l.item.name, units: l.units, grams: l.grams, group: l.group })) });
      } else if (typeof an[k] !== 'function') o[k] = an[k];
    });
    return o;
  }

  function selectionReason(r, ctx) {
    const p = r.pick;
    const oks = p.checks.filter((x) => x.r === 'ok').map((x) => x.t);
    const mode = { lowest: 'lowest-cost', balanced: 'best cost/performance balance', best: 'highest-performance' }[ctx.mode];
    let why = r.pinned ? 'Manually selected.' : `${ST_LABEL[p.status]} — ${mode} option among ${r.candidates.filter((x) => x.status !== ST.BAD).length} suitable of ${r.dbCount} in the database.`;
    if (oks.length) why += ' ' + oks.slice(0, 3).join('; ') + '.';
    return why;
  }

  function confidenceNotes(ctx, an) {
    const out = [];
    const c = an.phys && an.phys.liftCurve;
    if (ctx.lay.lift) {
      if (c) out.push(`Hover power and lift thrust use ${c.source} thrust-table data for the selected motor/propeller at ${ctx.S}S.`);
      else out.push(`Hover power uses momentum theory (FM ${ctx.A.fm}, η ${ctx.A.etaElec}); typical uncertainty ±15–25%. Add measured thrust tables to the "Thrust Tables" sheet for better accuracy.`);
      if (!c && ctx.picks.liftMotor) out.push('Lift thrust uses the manufacturer max-thrust figure, which is usually measured on the recommended propeller at full throttle.');
    }
    if (ctx.lay.cls !== 'multirotor') out.push(an.wing ? `Wing-borne power: ${an.wing.method}.` : 'Wing-borne power uses an assumed L/D.');
    if (ctx.lay.cls === 'vtol' || ctx.lay.cls === 'hybrid') out.push('Transition phases are modelled as hover time; tilt-rotor and tail-sitter dynamics are not modelled.');
    out.push('Endurance is an engineering estimate (still air, 15 °C ISA-corrected density, healthy battery). Wind, temperature, battery age and flying style change real endurance — verify by flight test before committing endurance to a customer.');
    out.push(c && c.flightTested ? 'A flight-test record exists in the thrust table for the selected motor/propeller.' : 'No flight-test record exists for this exact component combination.');
    return out;
  }

  function buildReport(ctx, results, pre) {
    const an = ctx.an, A = ctx.A, mb = an.mb, lay = ctx.lay;
    const sec = [];
    const row = (label, value, unit, flag, note) => ({ label, value, unit: unit || '', flag: flag || null, note: note || '' });
    const kg = (g) => g / 1000;

    sec.push({
      title: 'Weight budget', rows: [
        row('Dry weight (airframe, propulsion, avionics, wiring allowance)', f2(kg(mb.dryG)), 'kg'),
        row('Payload (design)', f2(kg(mb.payloadG)), 'kg', null, mb.selectedPayloadG > mb.requiredPayloadG ? 'selected payload equipment' : mb.requiredPayloadG ? `stated capacity; equipment ${f2(kg(mb.selectedPayloadG))} kg` : ''),
        row('Battery', f2(kg(mb.groups.battery)), 'kg', ctx.picks.battery ? null : 'bad', ctx.picks.battery ? `${ctx.parallel * (A.seriesPacks || 1)} × ${ctx.picks.battery.name}` : 'no battery selected'),
        row(`Wiring / dampers / straps allowance (${A.miscPct}%)`, f2(kg(mb.miscG)), 'kg'),
      ].concat(an.fuelKg ? [row('Fuel (hybrid)', f2(an.fuelKg), 'kg')] : []).concat([
        row('Estimated take-off weight (MTOW)', f2(an.mass), 'kg', has(ctx.req.mtowLimitKg) && an.mass > ctx.req.mtowLimitKg ? 'bad' : 'ok', has(ctx.req.mtowLimitKg) ? `limit ${ctx.req.mtowLimitKg} kg` : 'no MTOW limit set'),
      ]),
    });

    if (lay.lift) {
      const tw = an.twActual;
      sec.push({
        title: lay.cls === 'multirotor' ? 'Thrust' : 'Lift thrust (VTOL)', rows: [
          row('Hover thrust (H)', f2(an.W), 'N'),
          row('Required thrust-to-weight', f2(an.twRequired), '', null, an.twWind > (lay.cls === 'multirotor' ? A.twMultirotor : 0) ? `raised for ${ctx.req.windSpeedMs} m/s wind` : ''),
          row('Required max thrust per motor', f0(an.liftThrustReqPerMotorG), 'g'),
          row('Available max thrust per motor', has(an.phys.liftMaxThrustG) ? f0(an.phys.liftMaxThrustG) : '—', 'g', has(an.phys.liftMaxThrustG) ? (an.phys.liftMaxThrustG >= an.liftThrustReqPerMotorG ? 'ok' : 'bad') : null, an.phys.liftCurve ? 'thrust table' : 'manufacturer rating'),
          row('Total max thrust', has(an.liftMaxTotalG) ? f0(an.liftMaxTotalG) : '—', 'g'),
          row('Thrust-to-weight ratio (actual)', tw ? f2(tw) : '—', '', tw ? (tw >= an.twRequired ? 'ok' : 'bad') : null),
          row('Hover thrust per motor', f0(an.hoverThrustPerMotorG), 'g', null, an.hoverThrottlePct ? `≈ ${f0(an.hoverThrottlePct)}% throttle` : ''),
        ],
      });
      sec.push({
        title: 'Propeller', rows: [
          row('Propeller diameter', f1(an.phys.propDiaIn), 'in'),
          row('Disk area per prop (A)', U.fmt(an.rotor.Adisk, 4), 'm²'),
          row('Total disk area (At)', U.fmt(an.rotor.At, 4), 'm²'),
          row('Disk loading', f0(an.W / an.rotor.At), 'N/m²'),
        ],
      });
    }
    const powerRows = [row('Air density at operating altitude', U.fmt(an.rho, 3), 'kg/m³', null, `${f0(an.opAlt)} m AMSL`)];
    if (an.rotor) {
      powerRows.push(row('Ideal hover power (P_ideal)', f0(an.rotor.Pideal), 'W'));
      powerRows.push(row('Actual hover power (P_actual)', f0(an.rotor.Pactual), 'W', null, an.rotor.source));
      powerRows.push(row(`Hover power incl. ${A.powerMargin}% margin (P_req)`, f0(an.rotor.Phover), 'W'));
      if (lay.cls === 'multirotor') {
        powerRows.push(row(`Climb power @ ${A.climbSpeed} m/s`, f0(an.rotor.Pclimb), 'W'));
        powerRows.push(row(`Cruise power @ ${f1(an.mission.cruise)} m/s`, f0(an.rotor.Pcruise), 'W', null, an.rotor.Pcruise > an.rotor.PfwdModel + 1 ? `floored at ${A.cruiseFloor} × hover` : 'momentum + parasitic drag'));
      }
    }
    if (an.wing) {
      powerRows.push(row('Lift-to-drag ratio', f1(an.wing.LD), '', null, an.wing.method));
      if (an.wing.Vs) powerRows.push(row('Stall speed', f1(an.wing.Vs), 'm/s', an.stallMarginOk === false ? 'warn' : 'ok', `cruise ${f1(an.mission.cruise)} m/s`));
      powerRows.push(row(lay.cls === 'hybrid' ? 'Cruise shaft power (engine)' : 'Cruise electrical power', f0(lay.cls === 'hybrid' ? an.pw.cruiseShaft : an.wing.Pcruise), 'W'));
      powerRows.push(row(lay.cls === 'hybrid' ? 'Climb shaft power (engine)' : 'Climb electrical power', f0(lay.cls === 'hybrid' ? an.pw.climbShaft : an.wing.Pclimb), 'W'));
    }
    powerRows.push(row('Payload + avionics power', f0(an.loadsW), 'W'));
    sec.push({ title: 'Power', rows: powerRows });

    sec.push({
      title: 'Mission profile & energy', rows: an.phases.map((p) => row(p.name, `${f0(p.t)} s`, `${f0(p.P)} W → ${f1(p.E)} Wh`, null, p.Efuel ? `engine ${f1(p.Efuel)} Wh shaft` : '')).concat([
        row('Mission time', f1(an.missionTimeS / 60), 'min', null, ctx.req.enduranceMin ? `endurance requirement ${ctx.req.enduranceMin} min` : ''),
        row('Mission energy (battery)', f1(an.missionEnergyWh), 'Wh'),
        row(`Required nominal battery energy (+${A.reserve}% reserve, ÷ DoD ${A.dod} × ${A.batteryDerate})`, f1(an.requiredNominalWh), 'Wh'),
        row(`Required battery capacity at ${ctx.S}S`, an.requiredCapacityAh ? f0(an.requiredCapacityAh * 1000) : '—', 'mAh'),
      ]),
    });

    const b = ctx.picks.battery;
    const brows = [];
    if (b) {
      brows.push(row('Selected battery energy (nominal)', f0(an.energyNomWh), 'Wh', an.energyNomWh >= an.requiredNominalWh ? 'ok' : 'bad', `${ctx.parallel * (A.seriesPacks || 1)} × ${b.name}`));
      brows.push(row('Usable energy after reserve', f0(an.energyAfterReserveWh), 'Wh'));
      if (an.theoreticalEnduranceMin) brows.push(row('Theoretical endurance (100% capacity, no reserve, hover/cruise, no margin)', f1(an.theoreticalEnduranceMin), 'min', null, 'upper bound — never quote this'));
      if (an.estimatedEnduranceMin != null) brows.push(row('Estimated mission endurance (usable energy after reserve ÷ mission average power)', f1(an.estimatedEnduranceMin), 'min', an.estimatedEnduranceMin >= an.missionTimeS / 60 - 0.05 ? 'ok' : 'bad', `mission needs ${f1(an.missionTimeS / 60)} min`));
      if (lay.cls === 'hybrid') brows.push(row('Battery covers VTOL phases', an.batteryHoverOk ? 'Yes' : 'No', '', an.batteryHoverOk ? 'ok' : 'bad'));
      brows.push(row('Battery energy-density check', f0(an.energyNomWh / Math.max(kg(mb.groups.battery), 1e-6)), 'Wh/kg', null, `pre-sizing assumed ${A.energyDensity} Wh/kg`));
    } else brows.push(row('Battery', 'not selected', '', 'bad'));
    sec.push({ title: 'Battery & endurance', rows: brows });

    const crow = [];
    if (an.hoverCurrentA) crow.push(row('Hover current (C_h)', f1(an.hoverCurrentA), 'A'));
    if (an.cruiseCurrentA) crow.push(row('Cruise current', f1(an.cruiseCurrentA), 'A'));
    if (an.peakCurrentA) crow.push(row('Peak current (full thrust)', f0(an.peakCurrentA), 'A'));
    if (an.peakPerLiftMotorA) crow.push(row('Peak current per lift motor', f1(an.peakPerLiftMotorA), 'A'));
    const epk = escPeakPerMotor(ctx, 'lift').a;
    if (epk) crow.push(row(`ESC current requirement per motor (× ${A.escSafety})`, f1(epk * A.escSafety), 'A', ctx.picks.liftEsc && has(ctx.picks.liftEsc.spec.contCurrent) ? (ctx.picks.liftEsc.spec.contCurrent >= epk * A.escSafety ? 'ok' : ctx.picks.liftEsc.spec.contCurrent >= epk ? 'warn' : 'bad') : null, ctx.picks.liftEsc && has(ctx.picks.liftEsc.spec.contCurrent) ? `ESC ${ctx.picks.liftEsc.spec.contCurrent} A` : ''));
    if (an.hoverC) crow.push(row('Hover C-rate (Drone_Calculations.xlsx "C rating")', f2(an.hoverC), 'C'));
    if (an.requiredC) crow.push(row(`Battery discharge requirement (peak × ${A.cSafety})`, f1(an.requiredC), 'C', b && has(b.spec.cRating) ? (b.spec.cRating >= an.requiredC ? 'ok' : b.spec.cRating * A.cSafety >= an.requiredC ? 'warn' : 'bad') : null, b && has(b.spec.cRating) ? `battery ${b.spec.cRating}C` : ''));
    if (an.fuelKg) {
      crow.push(row('Fuel mass (incl. reserve)', f2(an.fuelKg), 'kg', null, `BSFC ${an.bsfc} g/kWh`));
      crow.push(row('Engine power required', f0(an.engineRequiredW), 'W'));
    }
    sec.push({ title: 'Electrical', rows: crow });

    sec.push({
      title: 'Requirement pre-sizing (before component selection)', rows: [
        row('Parametric take-off weight', f2(pre.massKg), 'kg', pre.spiral ? 'bad' : null, pre.spiral ? 'did not converge — battery mass spiral' : `empty-mass fraction ${lay.cls === 'multirotor' ? A.emptyFractionMR : A.emptyFractionFW}`),
        row('Parametric battery mass', f2(pre.batteryKg), 'kg', null, `${A.energyDensity} Wh/kg`),
        row(`Parametric battery capacity at ${pre.cells}S`, pre.requiredCapacityAh ? f0(pre.requiredCapacityAh * 1000) : '—', 'mAh'),
      ].concat(lay.lift ? [row('Suggested propeller diameter', f1(pre.propDiaIn), 'in', null, `disk loading ${A.diskLoading} N/m²`), row('Thrust per motor required', f0(pre.liftThrustReqPerMotorG), 'g')] : []),
    });
    return sec;
  }

  /** Evaluate every item of a slot's categories in the context of a finished result (for the Change dialog). */
  TK.matcher = { run, ST, ST_LABEL, RANK, NO_MATCH_MSG, statusOf };
})(typeof window !== 'undefined' ? window : globalThis);
