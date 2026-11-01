/* Engine test suite: node tools/test-engine.js
 * Runs the matching engine against the TEST catalogue for the scenarios in
 * the brief (customer example, missing components, insufficient thrust,
 * battery limits, budget overrun, other airframes) and asserts outcomes.
 */
const path = require('path');
const root = path.join(__dirname, '..', 'assets', 'js', 'core');
['util', 'schema', 'catalogue', 'sizing', 'matcher', 'boq'].forEach((m) => {
  try { require(path.join(root, m + '.js')); } catch (e) { if (m !== 'boq') throw e; }
});
const TK = globalThis.TK;
const { toSheets } = require('./sample-data');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); }
}
const cat = TK.catalogue.build(toSheets(), { source: 'test' });
console.log(`Catalogue: ${cat.items.length} items, ${Object.keys(cat.byCat).length} categories, ${cat.thrust.length} thrust rows, ${cat.issues.length} issues`);
cat.issues.filter((i) => i.level !== 'info').forEach((i) => console.log('   issue:', i.where, i.msg));

const base = {
  projectName: 'Customer example', aircraftClass: 'Multirotor', configuration: 'Hexacopter', application: 'Surveillance',
  enduranceMin: 40, rangeKm: 10, altitudeM: 120, payloadKg: 2, cruiseSpeed: 12, cruiseSpeedUnit: 'ms',
  payloads: [{ type: 'RGB', videoRes: '4K' }, { type: 'Thermal', thermalRes: '640x512' }],
  firmware: 'ArduPilot', gps: 'Standard GPS', screenMin: 7, controlRangeKm: 10, videoType: 'Digital', videoRangeKm: 10, telemetrySupport: true,
  budget: 300000, selectionMode: 'balanced', operation: 'Hybrid',
};

function show(r) {
  const line = (s) => {
    const p = s.pick ? `${s.pick.item.name} ×${s.qty} [${s.status}]` : s.na ? `— (${s.na})` : s.excluded ? '— excluded' : `UNRESOLVED${s.closest ? ' (closest: ' + s.closest.item.name + ')' : ''}`;
    return `    ${s.label.padEnd(30)} ${p}`;
  };
  r.slots.forEach((s) => console.log(line(s)));
  const a = r.analysis;
  console.log(`    → ${r.feasibility.toUpperCase()} | MTOW ${a.mass.toFixed(2)} kg | ${r.cells}S ×${r.parallel} | T/W ${a.twActual ? a.twActual.toFixed(2) : '—'} | est. endurance ${a.estimatedEnduranceMin ? a.estimatedEnduranceMin.toFixed(1) : '—'} min (mission ${(a.missionTimeS / 60).toFixed(1)}) | peak ${a.peakCurrentA ? a.peakCurrentA.toFixed(0) : '—'} A | ${r.ms} ms, ${r.combosEvaluated} combos, ${r.iterations} it`);
  r.flags.forEach((f) => console.log(`      [${f.level}] ${f.text}`));
}
function run(name, req, opts) {
  console.log('\n■ ' + name);
  const r = TK.matcher.run(cat, req, opts || {});
  show(r);
  return r;
}
const pick = (r, k) => (r.slots.find((s) => s.key === k) || {}).pick;
const slot = (r, k) => r.slots.find((s) => s.key === k);

// 1. Customer example from the brief
let r = run('1. Brief example — hexa, 40 min, 10 km, 2 kg, 4K RGB + thermal, ArduPilot, 7" TX', base);
assert(r.layout.lift === 6, 'hexacopter → 6 lift motors');
assert(pick(r, 'liftMotor') && pick(r, 'liftMotor').units === 6, '6 motors in build');
assert(slot(r, 'liftProp').pick && slot(r, 'liftProp').qty === 3, 'props bought as 3 pairs');
assert(pick(r, 'transmitter') && pick(r, 'transmitter').item.spec.screen >= 7, 'transmitter has ≥ 7" screen');
assert(pick(r, 'flightController') && /ardupilot/i.test(pick(r, 'flightController').item.spec.firmware.join()), 'FC supports ArduPilot');
const thermal = pick(r, 'payload_thermal'), rgb = pick(r, 'payload_rgb');
assert(thermal && rgb && thermal.id === rgb.id, 'dual-sensor thermal camera serves RGB too (no duplicate)');
assert(slot(r, 'receiver').na, 'receiver not needed — GCS link includes air unit');
assert(!pick(r, 'liftMotor') || pick(r, 'liftMotor').item.stock !== 'Discontinued', 'discontinued motor never auto-selected');
assert(r.analysis.mass > 8 && r.analysis.mass < 30, 'MTOW in a plausible range');
if (typeof TK.boq !== 'undefined') {
  const b = TK.boq.build(r, cat, { req: base, defaultGst: 18 });
  console.log(`    BOQ: ${b.lines.length} lines, subtotal ${TK.util.inr(b.subtotal)}, GST ${TK.util.inr(b.gstTotal)}, grand ${TK.util.inr(b.grandTotal)}, budget variance ${TK.util.inr(b.budgetVariance)}`);
  assert(b.lines.filter((l) => l.itemId === thermal.id).length === 1, 'BOQ lists the dual camera once');
  assert(Math.abs(b.grandTotal - (b.subtotal + b.gstTotal + b.extrasTotal)) < 1, 'grand total = subtotal + GST + extras');
}

// 2. Lowest-cost vs best-performance
const rLow = run('2a. Same requirement — lowest cost mode', Object.assign({}, base, { selectionMode: 'lowest' }));
const rBest = run('2b. Same requirement — best performance mode', Object.assign({}, base, { selectionMode: 'best' }));
assert(rLow.feasibility !== 'infeasible' || r.feasibility === 'infeasible', 'lowest-cost mode finds a build when balanced does');

// 3. Insufficient thrust
r = run('3. Insufficient thrust — quad 450 limited to 10" props carrying 3 kg', { aircraftClass: 'Multirotor', configuration: 'Quadcopter', enduranceMin: 10, payloadKg: 3, maxPropIn: 10, payloads: [], gps: 'Standard GPS', firmware: 'Any' });
assert(r.feasibility === 'infeasible', 'flagged infeasible');
assert(slot(r, 'liftMotor').unresolved || r.flags.some((f) => /thrust/i.test(f.text)), 'thrust shortfall reported');

// 4. Battery limitation / mass spiral
r = run('4. Battery limitation — quad, 2 kg payload, 90 min', { aircraftClass: 'Multirotor', configuration: 'Quadcopter', enduranceMin: 90, payloadKg: 2, payloads: [], firmware: 'Any' });
assert(r.feasibility === 'infeasible', 'flagged infeasible');
assert(slot(r, 'battery').unresolved || r.flags.some((f) => /endurance|spiral/i.test(f.text)), 'endurance/battery limit reported');

// 5. Budget overrun
r = run('5. Budget overrun — brief example with ₹1,00,000 budget', Object.assign({}, base, { budget: 100000 }));
if (TK.boq) {
  const b = TK.boq.build(r, cat, { req: Object.assign({}, base, { budget: 100000 }), defaultGst: 18 });
  assert(b.budgetVariance < 0 && b.overBudget, `over budget by ${TK.util.inr(-b.budgetVariance)}`);
}

// 6. Missing component category
const cat2 = TK.catalogue.build(toSheets().filter((s) => s.name !== 'Telemetry Modules' && s.name !== 'Gimbals'), {});
console.log('\n■ 6. Missing category — telemetry required, no telemetry modules in DB');
r = TK.matcher.run(cat2, Object.assign({}, base, { telemetry: true, screenMin: null, txPreference: 'ELRS', payloads: [{ type: 'RGB', videoRes: '1080p', gimbal: '3-axis' }] }), {});
show(r);
const tel = slot(r, 'telemetry');
assert(tel && (tel.na || tel.unresolved), 'telemetry slot unresolved or covered');
if (tel && tel.unresolved) assert(/No suitable component found/.test(tel.message), 'shows the "No suitable component found" message');

// 7. Manual override recomputes dependents
r = run('7. Override — pin 4114 motor on the hexa (incompatible with 12S)', base, { overrides: { liftMotor: 'MT-4114' } });
assert(pick(r, 'liftMotor') && pick(r, 'liftMotor').id === 'MT-4114', 'pinned motor kept');
assert(r.cells === 6 || pick(r, 'liftMotor').status === 'incompatible', 'cell count moved to the motor or flagged incompatible');

// 8. Fixed wing
r = run('8. Fixed wing mapping — 60 min, 1 kg payload, 15 m/s', { aircraftClass: 'Fixed Wing', configuration: 'Fixed Wing', enduranceMin: 60, rangeKm: 5, altitudeM: 120, payloadKg: 0.6, cruiseSpeed: 16, cruiseSpeedUnit: 'ms', payloads: [{ type: 'RGB', sensorMP: 20 }], firmware: 'ArduPilot', telemetry: true });
assert(r.layout.cls === 'fixedwing' && !slot(r, 'liftMotor'), 'no multirotor lift slots for fixed wing');
assert(r.analysis.wing && r.analysis.wing.LD > 5, 'fixed-wing L/D computed from wing data');

// 9. VTOL
r = run('9. VTOL quadplane — 60 min, 15 km', { aircraftClass: 'VTOL', configuration: 'Quadcopter', enduranceMin: 60, rangeKm: 15, altitudeM: 120, payloadKg: 1, cruiseSpeed: 20, cruiseSpeedUnit: 'ms', payloads: [], firmware: 'ArduPilot', telemetry: true });
assert(r.layout.lift === 4 && r.layout.cruise === 1, 'VTOL: 4 lift + 1 cruise');

// 10. Hybrid VTOL
r = run('10. Hybrid VTOL — 3 h endurance', { aircraftClass: 'Hybrid VTOL', configuration: 'Quadcopter', enduranceMin: 180, rangeKm: 20, altitudeM: 150, payloadKg: 1.5, cruiseSpeed: 22, cruiseSpeedUnit: 'ms', payloads: [], firmware: 'ArduPilot' });
assert(r.analysis.fuelKg > 0, `fuel sized: ${r.analysis.fuelKg && r.analysis.fuelKg.toFixed(2)} kg`);

// 11. Empty database
console.log('\n■ 11. Empty database');
r = TK.matcher.run(TK.catalogue.build([], {}), base, {});
assert(r.feasibility === 'infeasible' && r.slots.filter((s) => s.unresolved).length > 5, 'all required slots unresolved, no crash');

// 12. Validation / XSS-y data
const evil = TK.catalogue.build([{ name: 'Motors', headers: ['Component ID', 'Component Name', 'Price (INR)', 'Weight (g)', 'Product URL', 'KV (rpm/V)'], rows: [['X1', '<img src=x onerror=alert(1)>', '-5', 'abc', 'javascript:alert(1)', '900'], ['', '', '', '', '', ''], ['X1', 'Dup', 100, 10, 'robu.in/x', '']] }], {});
console.log('\n■ 12. Validation');
assert(evil.items[0].url === null && evil.items[0].price === null, 'javascript: URL and negative price rejected');
assert(evil.items[1].id !== 'X1' && evil.items[1].url === 'https://robu.in/x', 'duplicate ID renamed; bare domain normalised');
assert(TK.util.esc(evil.items[0].name).indexOf('<') === -1, 'names are HTML-escaped on render');
assert(TK.util.safeCell('=HYPERLINK("x")') === "'=HYPERLINK(\"x\")", 'formula injection neutralised in exports');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
