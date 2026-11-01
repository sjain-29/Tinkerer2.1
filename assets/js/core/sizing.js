/* Tinkerer — engineering sizing models.
 *
 * Multirotor model is the formula chain from Drone_Calculations.xlsx
 * (Sheet1 (4)) used by Tinkerer 1.x, extended with:
 *   - the battery's own mass inside the weight loop,
 *   - ISA air density at site elevation + operating altitude,
 *   - climb / forward-flight power (momentum theory + parasitic drag),
 *   - peak-current based C-rating and ESC sizing,
 *   - measured thrust tables when available.
 * Fixed-wing, VTOL (quadplane) and hybrid (fuel cruise + electric VTOL) use
 * their own models — multirotor maths is never applied to wing-borne flight.
 * All results are estimates; they are labelled as such everywhere in the UI.
 */
(function (root) {
  'use strict';
  const TK = (root.TK = root.TK || {});
  const G = 9.81;
  const IN = 0.0254;

  // ------------------------------------------------------------------ assumptions
  const A_META = [
    // group, key, label, unit, default, step, help
    ['Atmosphere', 'rho0', 'Sea-level air density ρ', 'kg/m³', 1.225, 0.001, 'From Drone_Calculations.xlsx. Corrected for altitude with the ISA model.'],
    ['Atmosphere', 'siteElevation', 'Site elevation (AMSL)', 'm', 0, 50, 'Ground elevation of the operating site. Density is evaluated at elevation + max altitude (conservative).'],
    ['Multirotor', 'twMultirotor', 'Design thrust-to-weight ratio', '', 2.0, 0.1, 'Max total thrust ÷ take-off weight. 2.0 is standard; ≥1.8 minimum for stable control.'],
    ['Multirotor', 'fm', 'Rotor figure of merit (FM)', '', 0.7, 0.01, 'Rotor aerodynamic efficiency (Drone_Calculations.xlsx).'],
    ['Multirotor', 'etaElec', 'Motor + ESC efficiency η', '', 0.8, 0.01, 'Electrical-to-shaft efficiency (Drone_Calculations.xlsx).'],
    ['Multirotor', 'powerMargin', 'Power margin', '%', 15, 1, 'Added to hover power for gusts and manoeuvring (Drone_Calculations.xlsx).'],
    ['Multirotor', 'cdA', 'Drag area CdA (forward flight)', 'm²', 0.06, 0.005, 'Body + payload drag area for cruise and wind calculations.'],
    ['Multirotor', 'cruiseFloor', 'Cruise power floor (× hover)', '', 0.85, 0.05, 'Momentum theory under-predicts forward-flight power; cruise power is never taken below this fraction of hover power.'],
    ['Multirotor', 'coaxialLoss', 'Coaxial power penalty', '%', 15, 1, 'Extra power for coaxial (stacked) rotor pairs.'],
    ['Multirotor', 'ct', 'Propeller thrust coefficient Cт', '', 0.1, 0.005, 'Used only for the KV / RPM plausibility check when no thrust table exists.'],
    ['Multirotor', 'diskLoading', 'Target disk loading (pre-sizing)', 'N/m²', 80, 5, 'Used to suggest a propeller size before components are selected.'],
    ['Fixed wing', 'ldRatio', 'Lift-to-drag ratio (no wing data)', '', 10, 0.5, 'Used when the frame has no wing area / span in the database.'],
    ['Fixed wing', 'cd0', 'Zero-lift drag coefficient CD0', '', 0.035, 0.001, 'Used with wing area and span from the frame record.'],
    ['Fixed wing', 'oswald', 'Oswald efficiency e', '', 0.8, 0.01, ''],
    ['Fixed wing', 'clMax', 'Max lift coefficient CLmax', '', 1.2, 0.05, 'For stall-speed check.'],
    ['Fixed wing', 'etaProp', 'Propeller efficiency (cruise)', '', 0.65, 0.01, ''],
    ['Fixed wing', 'etaMotor', 'Motor + ESC efficiency (cruise)', '', 0.85, 0.01, ''],
    ['Fixed wing', 'twFixedWing', 'Static thrust-to-weight (fixed wing)', '', 0.6, 0.05, 'Static thrust needed for launch and climb.'],
    ['Fixed wing', 'fwClimbRate', 'Fixed-wing climb rate', 'm/s', 2.5, 0.5, ''],
    ['Fixed wing', 'wingLoading', 'Wing loading (pre-sizing)', 'N/m²', 120, 5, 'Used before a frame is selected.'],
    ['VTOL', 'twVtolLift', 'VTOL lift thrust-to-weight', '', 1.6, 0.05, 'Lift system max thrust ÷ take-off weight.'],
    ['VTOL', 'twVtolCruise', 'VTOL cruise motor static T/W', '', 0.4, 0.05, ''],
    ['VTOL', 'vtolHoverSec', 'Total hover time per sortie', 's', 120, 10, 'Vertical take-off, transitions and vertical landing combined.'],
    ['VTOL', 'vtolDragPenalty', 'Cruise drag penalty (stopped lift props)', '%', 12, 1, ''],
    ['VTOL', 'transitionAlt', 'Transition altitude', 'm', 30, 5, ''],
    ['Hybrid', 'bsfc', 'Engine BSFC (default)', 'g/kWh', 600, 10, 'Used when the engine record has no BSFC.'],
    ['Hybrid', 'fuelReserve', 'Fuel reserve', '%', 15, 1, ''],
    ['Hybrid', 'engineMargin', 'Engine power margin (× climb power)', '', 1.3, 0.05, ''],
    ['Battery & mission', 'reserve', 'Landing energy reserve', '%', 20, 1, 'Energy kept in the battery at landing (Drone_Calculations.xlsx).'],
    ['Battery & mission', 'dod', 'Usable depth of discharge', '', 0.9, 0.01, 'Fraction of rated capacity that is usable.'],
    ['Battery & mission', 'batteryDerate', 'Battery health / temperature derate', '', 0.95, 0.01, 'Ageing and temperature loss.'],
    ['Battery & mission', 'energyDensity', 'Battery energy density (pre-sizing)', 'Wh/kg', 175, 5, 'Used only before a battery is selected (Drone_Calculations.xlsx).'],
    ['Battery & mission', 'vCellLiPo', 'Nominal cell voltage — LiPo', 'V', 3.7, 0.05, ''],
    ['Battery & mission', 'vCellLiIon', 'Nominal cell voltage — Li-ion', 'V', 3.6, 0.05, ''],
    ['Battery & mission', 'vCellLiHV', 'Nominal cell voltage — LiHV', 'V', 3.8, 0.05, ''],
    ['Battery & mission', 'vCellSemiSolid', 'Nominal cell voltage — semi-solid', 'V', 3.7, 0.05, ''],
    ['Battery & mission', 'climbSpeed', 'Climb / descent speed', 'm/s', 3, 0.5, 'Drone_Calculations.xlsx.'],
    ['Battery & mission', 'cruiseSpeed', 'Default cruise speed', 'm/s', 13, 0.5, 'Used when no cruise speed is entered (Drone_Calculations.xlsx).'],
    ['Battery & mission', 'payloadSec', 'Payload-use time per sortie', 's', 300, 10, 'Drone_Calculations.xlsx.'],
    ['Battery & mission', 'tolSec', 'Take-off + landing time', 's', 60, 5, 'Drone_Calculations.xlsx.'],
    ['Battery & mission', 'avionicsPower', 'Avionics power (FC, GPS, radios)', 'W', 15, 1, ''],
    ['Weights', 'miscPct', 'Wiring / dampers / straps allowance', '%', 5, 0.5, 'Percentage of build weight excluding payload (Drone_Calculations.xlsx).'],
    ['Weights', 'emptyFractionMR', 'Empty-mass fraction, multirotor (pre-sizing)', '', 0.35, 0.01, 'Frame + propulsion + avionics as a fraction of MTOW, before components are chosen.'],
    ['Weights', 'emptyFractionFW', 'Empty-mass fraction, fixed wing / VTOL (pre-sizing)', '', 0.45, 0.01, ''],
    ['Electrical', 'escSafety', 'ESC current safety factor', '', 1.2, 0.05, 'ESC continuous rating ÷ motor peak current (Tinkerer 1.x).'],
    ['Electrical', 'pdbSafety', 'PDB / power module safety factor', '', 1.2, 0.05, ''],
    ['Electrical', 'cSafety', 'Battery C-rating safety factor', '', 1.2, 0.05, 'Label C-ratings are often optimistic.'],
    ['Selection', 'maxParallel', 'Max battery packs in parallel', '', 2, 1, 'The engine tries 1…N identical packs.'],
    ['Selection', 'seriesPacks', 'Battery packs in series', '', 1, 1, 'e.g. 2 × 6S packs for a 12S system.'],
    ['Selection', 'wheelbaseTol', 'Wheelbase tolerance', '%', 15, 1, 'Allowed deviation from the requested wheelbase.'],
    ['Selection', 'rangeMargin', 'Radio range margin', '', 1.2, 0.05, 'Control/video link rating ÷ required distance.'],
    ['Selection', 'servoTorquePerKg', 'Servo torque per kg MTOW', 'kg-cm/kg', 1.5, 0.1, 'Rule-of-thumb minimum for control-surface servos.'],
    ['Selection', 'defaultServos', 'Control-surface servos (fixed wing / VTOL)', '', 4, 1, ''],
  ];
  const DEFAULTS = {};
  A_META.forEach((m) => (DEFAULTS[m[1]] = m[4]));

  function withDefaults(a) {
    const out = Object.assign({}, DEFAULTS);
    Object.keys(a || {}).forEach((k) => {
      const v = a[k];
      if (v !== null && v !== undefined && v !== '' && isFinite(v)) out[k] = Number(v);
    });
    return out;
  }

  /** ISA troposphere density. */
  function isaDensity(altM, rho0) {
    const h = Math.max(-500, Math.min(11000, altM || 0));
    return (rho0 || 1.225) * Math.pow(1 - 2.25577e-5 * h, 4.25588);
  }

  // ------------------------------------------------------------------ thrust curves
  /** rows: [{throttle,thrust(g),current(A),power(W)}] → interpolator on thrust. */
  function makeCurve(rows, meta) {
    const pts = rows
      .filter((r) => r.thrust != null && isFinite(r.thrust))
      .map((r) => ({ throttle: r.throttle, thrust: r.thrust, current: r.current, power: r.power != null ? r.power : null }))
      .sort((a, b) => a.thrust - b.thrust);
    if (!pts.length) return null;
    const maxPt = pts[pts.length - 1];
    function interp(key, t) {
      const p = pts.filter((x) => x[key] != null && isFinite(x[key]));
      if (!p.length) return null;
      if (t <= p[0].thrust) return (p[0][key] * t) / Math.max(p[0].thrust, 1e-9);
      for (let i = 1; i < p.length; i++) {
        if (t <= p[i].thrust) {
          const a = p[i - 1], b = p[i];
          return a[key] + ((b[key] - a[key]) * (t - a.thrust)) / Math.max(b.thrust - a.thrust, 1e-9);
        }
      }
      return null; // beyond measured range
    }
    return Object.assign({ points: pts, maxThrustG: maxPt.thrust, maxCurrentA: maxPt.current, at: (t) => ({ power: interp('power', t), current: interp('current', t), throttle: interp('throttle', t) }) }, meta || {});
  }

  // ------------------------------------------------------------------ helpers
  function motorLayout(req) {
    const cls = classOf(req);
    const cfg = (req.configuration || '').toLowerCase();
    const custom = Number(req.customMotorCount) || null;
    const byCfg = { tricopter: 3, quadcopter: 4, hexacopter: 6, octocopter: 8 };
    let lift = byCfg[cfg] || (cfg === 'custom' ? custom : null);
    let cruise = 0;
    if (cls === 'fixedwing') {
      lift = 0;
      cruise = cfg === 'custom' && custom ? custom : 1;
    } else if (cls === 'vtol' || cls === 'hybrid') {
      lift = lift || 4;
      cruise = 1;
    } else {
      lift = lift || 4;
    }
    return { cls, lift, cruise, coaxial: !!req.coaxial };
  }

  function classOf(req) {
    const c = (req.aircraftClass || 'Multirotor').toLowerCase();
    if (c.indexOf('hybrid') !== -1) return 'hybrid';
    if (c.indexOf('vtol') !== -1) return 'vtol';
    if (c.indexOf('fixed') !== -1) return 'fixedwing';
    return 'multirotor';
  }

  function defaultCells(massKg) {
    if (massKg <= 2) return 4;
    if (massKg <= 7) return 6;
    if (massKg <= 25) return 12;
    if (massKg <= 45) return 14;
    return 18;
  }

  function windTW(req, A, massKg, rho) {
    const w = Number(req.windSpeedMs) || 0;
    if (!w || !massKg) return 0;
    const D = 0.5 * rho * w * w * A.cdA;
    const tilt = Math.atan(D / (massKg * G));
    return (1 / Math.cos(tilt)) * 1.3; // 30 % control headroom at the gust tilt angle
  }

  // ------------------------------------------------------------------ rotor power (multirotor & VTOL lift)
  function rotorPower(massKg, phys, A, rho, opts) {
    const n = phys.nLift;
    const D = (phys.propDiaIn || 10) * IN;
    const Adisk = Math.PI * Math.pow(D / 2, 2);
    const At = Adisk * n;
    const T = massKg * G;
    const vh = Math.sqrt(T / (2 * rho * At));
    const Pideal = Math.pow(T, 1.5) / Math.sqrt(2 * rho * At); // M20
    const coax = phys.coaxial ? 1 + A.coaxialLoss / 100 : 1;
    const Pactual = (Pideal / (A.fm * A.etaElec)) * coax; // M22
    let Phover = Pactual * (1 + A.powerMargin / 100); // M24
    let source = 'Momentum theory (FM ' + A.fm + ', η ' + A.etaElec + ')';
    let tableHover = null;
    const curve = phys.liftCurve;
    if (curve) {
      const perMotorG = (massKg * 1000) / n;
      const at = curve.at(perMotorG);
      if (at.power != null) {
        tableHover = at;
        Phover = at.power * n * coax * (1 + A.powerMargin / 100);
        source = 'Thrust table (' + (curve.source || 'measured') + ')';
      } else if (at.current != null && phys.vNom) {
        tableHover = at;
        Phover = at.current * phys.vNom * n * coax * (1 + A.powerMargin / 100);
        source = 'Thrust table (' + (curve.source || 'measured') + ', current × voltage)';
      }
    }
    const scale = Phover / ((Pideal / (A.fm * A.etaElec)) * coax * (1 + A.powerMargin / 100)); // table vs momentum
    // climb (exact momentum theory)
    const vc = (opts && opts.climb) || A.climbSpeed;
    const PclimbIdeal = T * (vc / 2 + Math.sqrt(Math.pow(vc / 2, 2) + vh * vh));
    const Pclimb = (PclimbIdeal / (A.fm * A.etaElec)) * coax * (1 + A.powerMargin / 100) * scale;
    // forward flight (Glauert induced velocity + parasitic)
    const V = (opts && opts.cruise) || A.cruiseSpeed;
    const vi2 = (-V * V + Math.sqrt(Math.pow(V, 4) + 4 * Math.pow(vh, 4))) / 2;
    const vi = Math.sqrt(Math.max(vi2, 0));
    const PfwdModel = ((T * vi + 0.5 * rho * Math.pow(V, 3) * A.cdA) / (A.fm * A.etaElec)) * coax * (1 + A.powerMargin / 100) * scale;
    const Pcruise = Math.max(PfwdModel, A.cruiseFloor * Phover);
    return { T, vh, Adisk, At, Pideal, Pactual: Pactual * scale, Phover, Pclimb, Pcruise, PfwdModel, source, tableHover, perMotorHoverG: (massKg * 1000) / n };
  }

  // ------------------------------------------------------------------ wing-borne power (fixed wing, VTOL/hybrid cruise)
  function wingPower(massKg, phys, A, rho, V, penaltyPct) {
    const W = massKg * G;
    const pen = 1 + (penaltyPct || 0) / 100;
    let LD, CL = null, CD = null, Vs = null, AR = null, method;
    if (phys.wingAreaM2) {
      const S = phys.wingAreaM2;
      AR = phys.wingspanM ? (phys.wingspanM * phys.wingspanM) / S : 8;
      CL = W / (0.5 * rho * V * V * S);
      CD = A.cd0 * pen + (CL * CL) / (Math.PI * A.oswald * AR);
      LD = CL / CD;
      Vs = Math.sqrt((2 * W) / (rho * S * A.clMax));
      method = `Drag polar (S ${phys.wingAreaM2} m², AR ${AR.toFixed(1)}, CD0 ${A.cd0})`;
    } else {
      LD = A.ldRatio / pen;
      method = `Assumed L/D ${A.ldRatio}${penaltyPct ? ` −${penaltyPct}% VTOL penalty` : ''}`;
    }
    const D = W / LD;
    const Pshaft = (D * V) / A.etaProp;
    const PshaftClimb = (D * V + W * A.fwClimbRate) / A.etaProp;
    const m = 1 + A.powerMargin / 100;
    return { W, LD, CL, CD, AR, Vs, D, Pshaft, PshaftClimb, Pcruise: (Pshaft / A.etaMotor) * m, Pclimb: (PshaftClimb / A.etaMotor) * m, Ploiter: (Pshaft / A.etaMotor) * m, method };
  }

  // ------------------------------------------------------------------ mission profile
  function missionInputs(req, A) {
    const cruise = Number(req.cruiseSpeedMs) || A.cruiseSpeed;
    return {
      enduranceS: (Number(req.enduranceMin) || 0) * 60,
      rangeM: (Number(req.rangeKm) || 0) * 1000,
      oneWay: req.rangeMode !== 'route',
      altM: Number(req.altitudeM) || 0,
      cruise,
    };
  }

  /** Build phases [{name, t (s), P (W, battery), Pfuel (W shaft)}] */
  function buildPhases(cls, m, A, pw) {
    const ph = [];
    const add = (name, t, P, Pfuel) => {
      if (t > 0.5) ph.push({ name, t, P: P || 0, Pfuel: Pfuel || 0 });
    };
    const transit = m.rangeM / m.cruise;
    if (cls === 'multirotor') {
      add('Take-off & landing', A.tolSec, pw.hover);
      add('Climb', m.altM / A.climbSpeed, pw.climb);
      add('Transit out', transit, pw.cruise);
      add('Payload operations', A.payloadSec, pw.hover);
      if (m.oneWay) add('Transit back', transit, pw.cruise);
      add('Descent', m.altM / A.climbSpeed, pw.hover);
    } else if (cls === 'fixedwing') {
      add('Launch & approach', A.tolSec, pw.cruise * 1.1);
      add('Climb', m.altM / A.fwClimbRate, pw.climb);
      add('Transit out', transit, pw.cruise);
      add('Payload operations (loiter)', A.payloadSec, pw.loiter);
      if (m.oneWay) add('Transit back', transit, pw.cruise);
      add('Descent', m.altM / A.fwClimbRate, pw.cruise * 0.6);
    } else {
      // VTOL / hybrid: battery carries hover; for hybrid the wing-borne phases are fuel
      const hy = cls === 'hybrid';
      add('VTOL hover (take-off, transitions, landing)', A.vtolHoverSec, pw.hover);
      const climbH = Math.max(0, m.altM - A.transitionAlt);
      add('Wing-borne climb', climbH / A.fwClimbRate, hy ? pw.avionicsOnBattery : pw.climb, hy ? pw.climbShaft : 0);
      add('Transit out', transit, hy ? pw.avionicsOnBattery : pw.cruise, hy ? pw.cruiseShaft : 0);
      add('Payload operations (loiter)', A.payloadSec, hy ? pw.avionicsOnBattery : pw.loiter, hy ? pw.cruiseShaft : 0);
      if (m.oneWay) add('Transit back', transit, hy ? pw.avionicsOnBattery : pw.cruise, hy ? pw.cruiseShaft : 0);
      add('Wing-borne descent', climbH / A.fwClimbRate, hy ? pw.avionicsOnBattery : pw.cruise * 0.6, hy ? pw.cruiseShaft * 0.5 : 0);
    }
    const tProfile = ph.reduce((s, p) => s + p.t, 0);
    if (m.enduranceS > tProfile) {
      const extra = m.enduranceS - tProfile;
      if (cls === 'multirotor') add('Additional loiter to meet endurance', extra, pw.hover);
      else if (cls === 'fixedwing') add('Additional loiter to meet endurance', extra, pw.loiter);
      else add('Additional loiter to meet endurance', extra, cls === 'hybrid' ? pw.avionicsOnBattery : pw.loiter, cls === 'hybrid' ? pw.cruiseShaft : 0);
    }
    return ph;
  }

  // ------------------------------------------------------------------ main analysis
  /**
   * phys: {
   *   cls, massKg, nLift, nCruise, coaxial, propDiaIn, liftCurve,
   *   liftMaxThrustG (per motor), liftMaxCurrentA, cruiseMaxThrustG, cruiseMaxCurrentA,
   *   cells, vNom, capacityAh (total), cRating, maxDischargeA (total), energyWhNom (total),
   *   wingAreaM2, wingspanM, payloadPowerW, engine:{bsfc, powerW, generator}
   * }
   */
  function analyse(phys, req, Ain) {
    const A = withDefaults(Ain);
    const cls = phys.cls;
    const m = missionInputs(req, A);
    const opAlt = (A.siteElevation || 0) + m.altM;
    const rho = isaDensity(opAlt, A.rho0);
    const mass = phys.massKg;
    const W = mass * G;
    const out = { cls, rho, opAlt, mass, W, checks: [], notes: [], mission: m };
    const loads = (phys.payloadPowerW || 0) + A.avionicsPower;
    out.loadsW = loads;

    let rotor = null, wing = null;
    const pw = {};
    if (cls === 'multirotor' || cls === 'vtol' || cls === 'hybrid') {
      rotor = rotorPower(mass, phys, A, rho, { cruise: m.cruise });
      pw.hover = rotor.Phover + loads;
      pw.climb = rotor.Pclimb + loads;
      pw.cruise = rotor.Pcruise + loads;
    }
    if (cls !== 'multirotor') {
      const penalty = cls === 'fixedwing' ? 0 : A.vtolDragPenalty;
      wing = wingPower(mass, phys, A, rho, m.cruise, penalty);
      if (cls === 'fixedwing') {
        pw.cruise = wing.Pcruise + loads;
        pw.climb = wing.Pclimb + loads;
        pw.loiter = wing.Ploiter + loads;
        pw.hover = 0;
      } else if (cls === 'vtol') {
        pw.cruise = wing.Pcruise + loads;
        pw.climb = wing.Pclimb + loads;
        pw.loiter = wing.Ploiter + loads;
      } else {
        const genLoad = phys.engine && phys.engine.generator ? loads / 0.8 : 0;
        pw.cruiseShaft = wing.Pshaft * (1 + A.powerMargin / 100) + genLoad;
        pw.climbShaft = wing.PshaftClimb * (1 + A.powerMargin / 100) + genLoad;
        pw.avionicsOnBattery = phys.engine && phys.engine.generator ? 0 : loads;
      }
    }
    out.rotor = rotor;
    out.wing = wing;
    out.pw = pw;

    // ---- mission energy
    const phases = buildPhases(cls, m, A, pw);
    phases.forEach((p) => {
      p.E = (p.P * p.t) / 3600;
      p.Efuel = (p.Pfuel * p.t) / 3600;
    });
    out.phases = phases;
    out.missionTimeS = phases.reduce((s, p) => s + p.t, 0);
    out.missionEnergyWh = phases.reduce((s, p) => s + p.E, 0);
    out.fuelShaftWh = phases.reduce((s, p) => s + p.Efuel, 0);
    out.avgPowerW = out.missionTimeS ? (out.missionEnergyWh * 3600) / out.missionTimeS : 0;
    out.requiredNominalWh = (out.missionEnergyWh * (1 + A.reserve / 100)) / (A.dod * A.batteryDerate);
    if (cls === 'hybrid') {
      const bsfc = (phys.engine && phys.engine.bsfc) || A.bsfc;
      out.bsfc = bsfc;
      out.fuelKg = ((out.fuelShaftWh / 1000) * bsfc * (1 + A.fuelReserve / 100)) / 1000;
      out.engineRequiredW = (pw.climbShaft || 0) * A.engineMargin;
    }

    // ---- battery
    const v = phys.vNom || null;
    out.vNom = v;
    if (v) out.requiredCapacityAh = out.requiredNominalWh / v;
    if (phys.energyWhNom) {
      const Enom = phys.energyWhNom;
      const Euse = Enom * A.dod * A.batteryDerate;
      out.energyNomWh = Enom;
      out.energyUsableWh = Euse;
      out.energyAfterReserveWh = Euse / (1 + A.reserve / 100);
      out.energyMarginPct = ((out.energyAfterReserveWh - out.missionEnergyWh) / Math.max(out.missionEnergyWh, 1e-9)) * 100;
      const pTheo = cls === 'fixedwing' ? (wing.Pshaft / A.etaMotor) + loads : rotor ? rotor.Pactual + loads : 0;
      out.theoreticalEnduranceMin = pTheo ? (Enom / pTheo) * 60 : null;
      if (cls === 'hybrid') {
        out.batteryHoverOk = out.energyAfterReserveWh >= out.missionEnergyWh;
        out.estimatedEnduranceMin = null;
      } else {
        out.estimatedEnduranceMin = out.avgPowerW ? (out.energyAfterReserveWh / out.avgPowerW) * 60 : null;
      }
    }

    // ---- thrust & current
    const twReq = cls === 'multirotor' ? Math.max(A.twMultirotor, windTW(req, A, mass, rho)) : cls === 'fixedwing' ? A.twFixedWing : A.twVtolLift;
    out.twRequired = twReq;
    out.twWind = cls === 'multirotor' ? windTW(req, A, mass, rho) : 0;
    if (phys.nLift) {
      out.liftThrustReqPerMotorG = (mass * 1000 * twReq) / phys.nLift * (phys.coaxial ? 1 + A.coaxialLoss / 100 : 1);
      out.hoverThrustPerMotorG = (mass * 1000) / phys.nLift;
      if (phys.liftMaxThrustG) {
        out.liftMaxTotalG = phys.liftMaxThrustG * phys.nLift / (phys.coaxial ? 1 + A.coaxialLoss / 100 : 1);
        out.twActual = out.liftMaxTotalG / (mass * 1000);
        out.hoverThrustFraction = out.hoverThrustPerMotorG / phys.liftMaxThrustG;
        out.hoverThrottlePct = rotor && rotor.tableHover && rotor.tableHover.throttle != null ? rotor.tableHover.throttle : Math.sqrt(Math.min(out.hoverThrustFraction, 1.5)) * 100;
      }
    }
    if (phys.nCruise && cls !== 'hybrid') {
      const twc = cls === 'fixedwing' ? A.twFixedWing : A.twVtolCruise;
      out.cruiseThrustReqPerMotorG = (mass * 1000 * twc) / phys.nCruise;
      if (phys.cruiseMaxThrustG) out.cruiseTW = (phys.cruiseMaxThrustG * phys.nCruise) / (mass * 1000);
    }
    if (v) {
      if (cls === 'fixedwing') {
        out.hoverCurrentA = null;
        out.cruiseCurrentA = pw.cruise / v;
        out.peakCurrentA = phys.cruiseMaxCurrentA ? phys.cruiseMaxCurrentA * phys.nCruise + loads / v : pw.climb * 1.5 / v;
      } else {
        out.hoverCurrentA = pw.hover / v; // M50 (with loads)
        out.cruiseCurrentA = pw.cruise / v;
        const tw = out.twActual || twReq;
        const peakEst = ((rotor.Pactual * Math.pow(tw, 1.5)) / v);
        const peakSpec = phys.liftMaxCurrentA ? phys.liftMaxCurrentA * phys.nLift : null;
        let peak = peakSpec ? Math.min(peakSpec, Math.max(peakEst, out.hoverCurrentA)) : peakEst;
        if (phys.liftCurve && phys.liftCurve.maxCurrentA) peak = phys.liftCurve.maxCurrentA * phys.nLift;
        out.peakCurrentA = peak + loads / v;
        if (cls === 'vtol' && phys.cruiseMaxCurrentA) out.peakCurrentA = Math.max(out.peakCurrentA, out.cruiseCurrentA + phys.cruiseMaxCurrentA * 0.5);
      }
      out.peakPerLiftMotorA = phys.nLift && out.peakCurrentA ? (out.peakCurrentA - loads / v) / phys.nLift : null;
      if (phys.capacityAh) {
        out.hoverC = out.hoverCurrentA ? out.hoverCurrentA / phys.capacityAh : null; // M52 (sheet "C rating")
        out.requiredC = (out.peakCurrentA * A.cSafety) / phys.capacityAh;
      }
    }

    // ---- fixed-wing checks
    if (wing && wing.Vs) {
      out.stallSpeed = wing.Vs;
      out.stallMarginOk = m.cruise >= 1.3 * wing.Vs;
    }
    return out;
  }

  // ------------------------------------------------------------------ parametric pre-sizing
  function preSize(req, Ain) {
    const A = withDefaults(Ain);
    const lay = motorLayout(req);
    const cls = lay.cls;
    const payloadKg = Math.max(Number(req.payloadKg) || 0, (Number(req.selectedPayloadG) || 0) / 1000);
    const fEmpty = cls === 'multirotor' ? A.emptyFractionMR : A.emptyFractionFW;
    const vCell = TK.catalogue ? TK.catalogue.nominalCellVoltage(req.chemistry, A) : 3.7;
    // For a trial take-off mass m, size battery (and fuel) by energy density and
    // return the take-off mass they imply. The design closes where g(m) = m.
    function trial(m) {
      const S = Number(req.batteryCells) || defaultCells(m);
      const phys = { cls, massKg: m, nLift: lay.lift, nCruise: lay.cruise, coaxial: lay.coaxial, payloadPowerW: Number(req.selectedPayloadW) || 0, vNom: S * vCell };
      if (lay.lift) {
        let D = (2 * Math.sqrt((m * G) / A.diskLoading / (lay.lift * Math.PI))) / IN;
        if (req.maxPropIn) D = Math.min(D, Number(req.maxPropIn));
        phys.propDiaIn = Math.max(3, Math.round(D * 2) / 2);
      }
      if (cls !== 'multirotor') {
        phys.wingAreaM2 = (m * G) / A.wingLoading;
        phys.wingspanM = Math.sqrt(phys.wingAreaM2 * 9);
      }
      const res = analyse(phys, req, A);
      const battKg = res.requiredNominalWh / A.energyDensity;
      const fuelKg = res.fuelKg || 0;
      return { res, S, battKg, fuelKg, implied: (payloadKg + battKg + fuelKg) / (1 - fEmpty), phys };
    }
    let lo = Math.max(0.05, payloadKg / (1 - fEmpty)), hi = null, t = null;
    for (let m = lo; m <= 400; m *= 1.25) {
      t = trial(m);
      if (t.implied <= m) { hi = m; break; }
      lo = m;
    }
    let converged = false;
    if (hi !== null) {
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        const tm = trial(mid);
        if (tm.implied <= mid) hi = mid; else lo = mid;
        if (hi - lo < 0.002) break;
      }
      t = trial(hi);
      converged = true;
    }
    const massKg = converged ? hi : t.implied;
    const res = t.res;
    res.cells = t.S;
    res.propDiaIn = t.phys.propDiaIn;
    res.wingAreaM2 = t.phys.wingAreaM2;
    return Object.assign({}, res, {
      layout: lay, payloadKg, batteryKg: t.battKg, fuelKg: t.fuelKg, emptyKg: massKg * fEmpty, massKg, converged, spiral: !converged,
      batteryFraction: t.battKg / massKg,
      requiredCapacityAh: res.requiredNominalWh / (t.S * vCell),
    });
  }

  TK.sizing = { A_META, DEFAULTS, withDefaults, isaDensity, makeCurve, motorLayout, classOf, defaultCells, analyse, preSize, rotorPower, wingPower, G, IN };
})(typeof window !== 'undefined' ? window : globalThis);
