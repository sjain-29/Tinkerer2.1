/* Tinkerer — customer requirement form (definition, render, validation). */
(function (root) {
  'use strict';
  const TK = (root.TK = root.TK || {});
  const U = TK.util;
  const e = U.esc;

  const CLASS = ['Multirotor', 'Fixed Wing', 'VTOL', 'Hybrid VTOL', 'Other'];
  const CONFIG = [['Quadcopter', 'Quadcopter'], ['Hexacopter', 'Hexacopter'], ['Octocopter', 'Octocopter'], ['Tricopter', 'Tricopter'], ['Fixed Wing', 'Fixed Wing'], ['Custom', 'Custom configuration']];
  const APPS = ['Surveillance', 'Mapping', 'Agriculture', 'Defence', 'Industrial inspection', 'Photography / Videography', 'Delivery', 'Training', 'Other'];
  const isMR = (r) => ['Multirotor', 'Other'].indexOf(r.aircraftClass || 'Multirotor') !== -1;
  const isWing = (r) => ['Fixed Wing', 'VTOL', 'Hybrid VTOL'].indexOf(r.aircraftClass) !== -1;

  const SECTIONS = [
    {
      id: 'basic', n: 'A', title: 'Basic drone requirements', summary: (r) => [r.projectName, r.aircraftClass, r.configuration === 'Custom' ? `${r.customMotorCount || '?'} motors` : r.configuration, r.application].filter(Boolean).join(' · '),
      fields: [
        { k: 'projectName', label: 'Project / customer name', type: 'text', required: true, placeholder: 'e.g. Acme Infra — bridge inspection' },
        { k: 'projectRef', label: 'Project reference number', type: 'text', placeholder: 'e.g. TNK-2026-014' },
        { k: 'aircraftClass', label: 'Drone category', type: 'select', options: CLASS },
        { k: 'configuration', label: 'Drone configuration', type: 'select', options: CONFIG, help: (r) => (r.aircraftClass === 'VTOL' || r.aircraftClass === 'Hybrid VTOL' ? 'For VTOL this sets the lift layout (Quadcopter = 4 lift motors + 1 cruise).' : '') },
        { k: 'customMotorCount', label: 'Number of motors', type: 'number', min: 1, step: 1, show: (r) => r.configuration === 'Custom', required: true },
        { k: 'coaxial', label: 'Coaxial (stacked) rotor pairs', type: 'check', show: isMR },
        { k: 'application', label: 'Intended application', type: 'select', options: APPS },
        { k: 'applicationOther', label: 'Describe the application', type: 'text', show: (r) => r.application === 'Other' },
      ],
    },
    {
      id: 'flight', n: 'B', title: 'Flight performance', summary: (r) => [r.enduranceMin && r.enduranceMin + ' min', r.rangeKm && r.rangeKm + ' km', r.payloadKg && r.payloadKg + ' kg payload', r.mtowLimitKg && 'MTOW ≤ ' + r.mtowLimitKg + ' kg'].filter(Boolean).join(' · '),
      fields: [
        { k: 'enduranceMin', label: 'Required endurance', type: 'number', unit: 'min', min: 0, help: 'Total airborne time the mission needs.' },
        { k: 'rangeKm', label: 'Operational range', type: 'number', unit: 'km', min: 0, step: 0.1 },
        { k: 'rangeMode', label: 'Range means', type: 'select', options: [['oneway', 'One-way distance (fly out and back)'], ['route', 'Total route distance']] },
        { k: 'altitudeM', label: 'Maximum flight altitude (AGL)', type: 'number', unit: 'm', min: 0 },
        { k: 'cruiseSpeed', label: 'Cruising speed', type: 'speed', unitKey: 'cruiseSpeedUnit', min: 0, step: 0.1, placeholder: 'default 13 m/s' },
        { k: 'maxSpeed', label: 'Desired maximum flight speed', type: 'speed', unitKey: 'maxSpeedUnit', min: 0, step: 0.1 },
        { k: 'mtowLimitKg', label: 'Maximum take-off weight (MTOW) limit', type: 'number', unit: 'kg', min: 0, step: 0.1, help: 'Leave blank if there is no regulatory or customer limit.' },
        { k: 'payloadKg', label: 'Required payload capacity', type: 'number', unit: 'kg', min: 0, step: 0.05, help: 'Design payload. If the selected cameras weigh more, the heavier value is used.' },
        { k: 'windSpeed', label: 'Wind resistance (sustained wind)', type: 'number', unit: 'm/s', min: 0, step: 0.5 },
        { k: 'operation', label: 'Operation mode', type: 'select', options: ['Hybrid', 'Manual', 'Autonomous'] },
        { k: 'flightModes', label: 'Flight mode requirements', type: 'chips', options: ['Position hold', 'Return to launch', 'Waypoint missions', 'Orbit / POI', 'Follow-me', 'Terrain following', 'Precision landing'], full: true },
      ],
    },
    { id: 'payload', n: 'C', title: 'Payload and camera', summary: (r) => (r.payloads || []).map((p) => p.type).join(' + ') || 'No payload selected', custom: 'payload' },
    {
      id: 'frame', n: 'D', title: 'Frame and mechanical', summary: (r) => [r.frameType !== 'Any' && r.frameType, r.wheelbaseMm && r.wheelbaseMm + ' mm', r.maxPropIn && 'props ≤ ' + r.maxPropIn + '"', r.material !== 'Any' && r.material].filter(Boolean).join(' · ') || 'Optional',
      fields: [
        { k: 'frameType', label: 'Frame type', type: 'select', options: ['Any', 'X', 'H', 'Plus (+)', 'Y6', 'Coaxial X8'] },
        { k: 'wheelbaseMm', label: 'Wheelbase', type: 'number', unit: 'mm', min: 0, show: isMR },
        { k: 'frameSize', label: 'Frame size / class', type: 'text', placeholder: 'e.g. 1200 class' },
        { k: 'armsCount', label: 'Number of arms', type: 'number', min: 0, step: 1, show: isMR },
        { k: 'maxPropIn', label: 'Maximum propeller diameter', type: 'number', unit: 'in', min: 0, step: 0.5 },
        { k: 'folding', label: 'Folding', type: 'select', options: ['Any', 'Folding', 'Non-folding'] },
        { k: 'material', label: 'Material', type: 'select', options: ['Any', 'Carbon fibre', 'Aluminium', 'Glass fibre', 'Composite', 'EPO / foam'] },
        { k: 'landingGearType', label: 'Landing gear', type: 'select', options: ['Any', 'Fixed skid', 'Retractable', 'None'], show: (r) => r.aircraftClass !== 'Fixed Wing' },
        { k: 'maxStructPayloadKg', label: 'Maximum structural payload', type: 'number', unit: 'kg', min: 0, step: 0.1 },
        { k: 'mounting', label: 'Mounting requirements', type: 'text', placeholder: 'e.g. quick-release, 25 mm rails' },
      ],
    },
    {
      id: 'fc', n: 'E', title: 'Flight control and navigation', summary: (r) => [r.firmware !== 'Any' && r.firmware, r.gps, r.rtk && 'RTK', r.telemetry && 'Telemetry radio', r.obstacle && 'Obstacle avoidance'].filter(Boolean).join(' · '),
      fields: [
        { k: 'fcPreference', label: 'Flight controller preference', type: 'text', placeholder: 'brand or model (soft preference)' },
        { k: 'firmware', label: 'Firmware compatibility', type: 'select', options: ['Any', 'ArduPilot', 'PX4', 'ArduPilot or PX4', 'Betaflight', 'INAV'] },
        { k: 'gps', label: 'GPS requirement', type: 'select', options: ['Standard GPS', 'Dual GPS', 'None'] },
        { k: 'uartsMin', label: 'Minimum UARTs', type: 'number', min: 0, step: 1, help: 'Tinkerer also counts the UARTs your selected devices need.' },
        { k: 'rtk', label: 'RTK positioning required', type: 'check' },
        { k: 'rtkAccuracyCm', label: 'RTK accuracy needed', type: 'number', unit: 'cm', min: 0, step: 0.5, show: (r) => r.rtk },
        { k: 'telemetry', label: 'Long-range telemetry radio (MAVLink)', type: 'check' },
        { k: 'obstacle', label: 'Obstacle avoidance required', type: 'check' },
        { k: 'autonomous', label: 'Autonomous missions required', type: 'check' },
        { k: 'redundancy', label: 'Redundancy requirements', type: 'chips', options: ['Triple IMU', 'Dual GPS', 'Dual battery', 'Dual power module', 'Motor-out tolerance'], full: true },
      ],
    },
    {
      id: 'comms', n: 'F', title: 'Communication and transmitter', summary: (r) => [r.screenMin && 'screen ≥ ' + r.screenMin + '"', r.channelsMin && r.channelsMin + ' ch', (r.controlRangeKm || r.rangeKm) && 'control ' + (r.controlRangeKm || r.rangeKm) + ' km', r.videoType !== 'None' && r.videoType + ' video'].filter(Boolean).join(' · '),
      fields: [
        { k: 'txPreference', label: 'Transmitter preference', type: 'text', placeholder: 'brand or model (soft preference)' },
        { k: 'screenMin', label: 'Minimum screen size', type: 'number', unit: 'in', min: 0, step: 0.1 },
        { k: 'channelsMin', label: 'Number of channels', type: 'number', min: 0, step: 1 },
        { k: 'controlRangeKm', label: 'Control range', type: 'number', unit: 'km', min: 0, step: 0.5, placeholder: (r) => (r.rangeKm ? `defaults to ${r.rangeKm}` : '') },
        { k: 'videoType', label: 'Video downlink', type: 'select', options: ['None', 'Digital', 'Analog'] },
        { k: 'videoRangeKm', label: 'Video transmission range', type: 'number', unit: 'km', min: 0, step: 0.5, show: (r) => r.videoType && r.videoType !== 'None' },
        { k: 'frequency', label: 'Frequency requirement', type: 'select', options: ['Any', '2.4 GHz', '900 MHz', '5.8 GHz', '433 MHz'] },
        { k: 'protocol', label: 'RC protocol preference', type: 'text', placeholder: 'e.g. ExpressLRS, SIYI' },
        { k: 'telemetrySupport', label: 'Transmitter must display telemetry', type: 'check' },
        { k: 'gcs', label: 'Ground control station requirements', type: 'text', placeholder: 'e.g. Mission Planner on laptop, QGC on tablet' },
      ],
    },
    {
      id: 'power', n: 'G', title: 'Power system', summary: (r) => [r.chemistry !== 'Any' && r.chemistry, r.batteryCells && r.batteryCells + 'S', r.maxBatteryKg && 'battery ≤ ' + r.maxBatteryKg + ' kg', r.charger && 'charger'].filter(Boolean).join(' · ') || 'Automatic',
      fields: [
        { k: 'chemistry', label: 'Battery chemistry preference', type: 'select', options: ['Any', 'LiPo', 'Li-ion', 'LiHV', 'Semi-solid'] },
        { k: 'batteryCells', label: 'Battery voltage', type: 'select', options: [['', 'Automatic'], ['3', '3S (11.1 V)'], ['4', '4S (14.8 V)'], ['6', '6S (22.2 V)'], ['8', '8S (29.6 V)'], ['10', '10S (37 V)'], ['12', '12S (44.4 V)'], ['14', '14S (51.8 V)'], ['18', '18S (66.6 V)']] },
        { k: 'capacityMah', label: 'Battery capacity preference (min)', type: 'number', unit: 'mAh', min: 0, step: 100 },
        { k: 'maxBatteryKg', label: 'Maximum battery weight', type: 'number', unit: 'kg', min: 0, step: 0.1 },
        { k: 'charger', label: 'Include a battery charger', type: 'check' },
        { k: 'chargerQty', label: 'Number of chargers', type: 'number', min: 1, step: 1, show: (r) => r.charger },
        { k: 'chargeNotes', label: 'Charging requirements', type: 'text', placeholder: 'e.g. field charging from 230 V, < 1 h', show: (r) => r.charger },
        { k: 'redundantPower', label: 'Redundant power (dual packs + dual monitoring)', type: 'check' },
      ],
    },
    {
      id: 'commercial', n: 'H', title: 'Commercial', summary: (r) => [r.budget && U.inr(Number(r.budget)), r.droneQty > 1 && r.droneQty + ' drones', r.gstMode === 'inclusive' ? 'GST incl.' : 'GST extra'].filter(Boolean).join(' · '),
      fields: [
        { k: 'budget', label: 'Customer budget', type: 'number', unit: '₹', min: 0, step: 1000 },
        { k: 'budgetBasis', label: 'Budget applies to', type: 'select', options: [['perDrone', 'Each drone'], ['order', 'Whole order']] },
        { k: 'droneQty', label: 'Quantity of drones', type: 'number', min: 1, step: 1 },
        { k: 'gstMode', label: 'GST', type: 'select', options: [['exclusive', 'Prices exclude GST (add GST)'], ['inclusive', 'Prices include GST']] },
        { k: 'preferredBrands', label: 'Preferred brands', type: 'text', placeholder: 'comma separated' },
        { k: 'preferredVendors', label: 'Preferred vendors', type: 'text', placeholder: 'comma separated' },
        { k: 'deliveryTimeline', label: 'Delivery timeline', type: 'text', placeholder: 'e.g. 6 weeks from PO' },
        { k: 'remarks', label: 'Additional remarks', type: 'textarea', full: true },
      ],
    },
  ];

  const PAYLOAD_TYPES = ['RGB', 'Thermal', 'Multispectral', 'Hyperspectral', 'Night Vision', 'Zoom', 'LiDAR', 'Custom'];
  const VIDEO = [['', 'Any'], ['720p', '720p'], ['1080p', '1080p'], ['2K', '2K'], ['4K', '4K'], ['5.4K', '5.4K'], ['8K', '8K']];
  const GIMBAL = ['None', '2-axis', '3-axis'];
  const CAM_FIELDS = [
    { k: 'videoRes', label: 'Video resolution (min)', type: 'select', options: VIDEO },
    { k: 'sensorMP', label: 'Image resolution (min)', type: 'number', unit: 'MP', min: 0, step: 0.1 },
    { k: 'sensorSize', label: 'Sensor size', type: 'text', placeholder: 'e.g. 1"' },
    { k: 'opticalZoom', label: 'Optical zoom (min)', type: 'number', unit: '×', min: 0, step: 1 },
    { k: 'digitalZoom', label: 'Digital zoom (min)', type: 'number', unit: '×', min: 0, step: 1 },
    { k: 'lensType', label: 'Lens type', type: 'text', placeholder: 'e.g. wide, mapping' },
    { k: 'focalLength', label: 'Lens focal length', type: 'text', placeholder: 'e.g. 8.8 mm' },
    { k: 'fovMin', label: 'Field of view (min)', type: 'number', unit: '°', min: 0 },
    { k: 'maxWeightG', label: 'Camera weight (max)', type: 'number', unit: 'g', min: 0 },
    { k: 'maxPowerW', label: 'Power consumption (max)', type: 'number', unit: 'W', min: 0, step: 0.5 },
    { k: 'interface', label: 'Interface / protocol', type: 'text', placeholder: 'e.g. Ethernet, HDMI, UART' },
    { k: 'gimbal', label: 'Gimbal requirement', type: 'select', options: GIMBAL },
  ];
  const PAYLOAD_FIELDS = {
    RGB: CAM_FIELDS, Zoom: CAM_FIELDS, 'Night Vision': CAM_FIELDS, Hyperspectral: CAM_FIELDS,
    Thermal: [
      { k: 'thermalRes', label: 'Thermal resolution (min)', type: 'select', options: [['', 'Any'], ['160x120', '160 × 120'], ['256x192', '256 × 192'], ['384x288', '384 × 288'], ['640x512', '640 × 512'], ['1280x1024', '1280 × 1024']] },
      { k: 'netdMax', label: 'Thermal sensitivity / NETD (max)', type: 'number', unit: 'mK', min: 0 },
      { k: 'detectionRangeM', label: 'Detection range (min)', type: 'number', unit: 'm', min: 0 },
      { k: 'lensMM', label: 'Lens size', type: 'text', placeholder: 'e.g. 19 mm' },
      { k: 'radiometric', label: 'Radiometric', type: 'select', options: ['Any', 'Radiometric', 'Non-radiometric'] },
      { k: 'maxWeightG', label: 'Camera weight (max)', type: 'number', unit: 'g', min: 0 },
      { k: 'maxPowerW', label: 'Power consumption (max)', type: 'number', unit: 'W', min: 0, step: 0.5 },
      { k: 'interface', label: 'Interface / protocol', type: 'text' },
      { k: 'gimbal', label: 'Gimbal requirement', type: 'select', options: GIMBAL },
    ],
    Multispectral: [
      { k: 'bands', label: 'Number of bands (min)', type: 'number', min: 0, step: 1 },
      { k: 'wavelengths', label: 'Wavelengths', type: 'text', placeholder: 'e.g. 475, 560, 668, 717, 842 nm' },
      { k: 'maxWeightG', label: 'Sensor weight (max)', type: 'number', unit: 'g', min: 0 },
      { k: 'maxPowerW', label: 'Power consumption (max)', type: 'number', unit: 'W', min: 0, step: 0.5 },
      { k: 'interface', label: 'Interface', type: 'text' },
    ],
    LiDAR: [
      { k: 'rangeM', label: 'Range (min)', type: 'number', unit: 'm', min: 0 },
      { k: 'pointRate', label: 'Point rate (min)', type: 'number', unit: 'pts/s', min: 0, step: 1000 },
      { k: 'accuracyCm', label: 'Accuracy (max)', type: 'number', unit: 'cm', min: 0, step: 0.5 },
      { k: 'maxWeightG', label: 'Weight (max)', type: 'number', unit: 'g', min: 0 },
      { k: 'maxPowerW', label: 'Power consumption (max)', type: 'number', unit: 'W', min: 0, step: 0.5 },
      { k: 'interface', label: 'Interface', type: 'text' },
    ],
    Custom: [
      { k: 'description', label: 'Description', type: 'text', placeholder: 'e.g. spray system, drop mechanism' },
      { k: 'weightG', label: 'Weight', type: 'number', unit: 'g', min: 0 },
      { k: 'powerW', label: 'Power draw', type: 'number', unit: 'W', min: 0, step: 0.5 },
      { k: 'qty', label: 'Quantity', type: 'number', min: 1, step: 1 },
      { k: 'price', label: 'Unit price (optional)', type: 'number', unit: '₹', min: 0 },
      { k: 'supplier', label: 'Supplier', type: 'text', placeholder: 'Customer-supplied' },
    ],
  };

  function defaults() {
    return {
      projectName: '', projectRef: '', aircraftClass: 'Multirotor', configuration: 'Quadcopter', application: 'Surveillance', rangeMode: 'oneway',
      cruiseSpeedUnit: 'ms', maxSpeedUnit: 'ms', operation: 'Hybrid', flightModes: [], payloads: [], frameType: 'Any', folding: 'Any', material: 'Any', landingGearType: 'Any',
      firmware: 'Any', gps: 'Standard GPS', redundancy: [], videoType: 'None', frequency: 'Any', chemistry: 'Any', batteryCells: '', budgetBasis: 'perDrone', droneQty: 1, gstMode: 'exclusive', selectionMode: 'balanced',
    };
  }

  // ---------------------------------------------------------------- render
  function val(v) {
    return v === null || v === undefined ? '' : v;
  }
  function fieldHtml(f, r, err, ns) {
    if (f.show && !f.show(r)) return '';
    const id = (ns || 'f') + '_' + f.k;
    const v = r[f.k];
    const bind = ns ? `data-p="${ns}" data-k="${f.k}"` : `data-k="${f.k}"`;
    const help = typeof f.help === 'function' ? f.help(r) : f.help;
    const ph = typeof f.placeholder === 'function' ? f.placeholder(r) : f.placeholder;
    let input;
    switch (f.type) {
      case 'select':
        input = `<select id="${id}" ${bind}>${f.options.map((o) => {
          const [ov, ol] = Array.isArray(o) ? o : [o, o];
          return `<option value="${e(ov)}" ${String(val(v)) === String(ov) ? 'selected' : ''}>${e(ol)}</option>`;
        }).join('')}</select>`;
        break;
      case 'check':
        return `<div class="field ${f.full ? 'span-all' : ''}"><label class="lbl">&nbsp;</label><label class="check" for="${id}"><input type="checkbox" id="${id}" ${bind} ${v ? 'checked' : ''}><span>${e(f.label)}</span></label></div>`;
      case 'chips':
        input = `<div class="chips" role="group" aria-label="${e(f.label)}">${f.options.map((o) => `<button type="button" class="chip ${(v || []).indexOf(o) !== -1 ? 'on' : ''}" data-act="chip" data-k="${f.k}" ${ns ? `data-p="${ns}"` : ''} data-v="${e(o)}" aria-pressed="${(v || []).indexOf(o) !== -1}">${e(o)}</button>`).join('')}</div>`;
        break;
      case 'textarea':
        input = `<textarea id="${id}" ${bind} rows="3" placeholder="${e(ph || '')}">${e(val(v))}</textarea>`;
        break;
      case 'speed':
        input = `<div class="unit-wrap"><input id="${id}" type="number" inputmode="decimal" ${bind} value="${e(val(v))}" min="${f.min ?? ''}" step="${f.step || 'any'}" placeholder="${e(ph || '')}"><select data-k="${f.unitKey}" aria-label="unit"><option value="ms" ${r[f.unitKey] !== 'kmh' ? 'selected' : ''}>m/s</option><option value="kmh" ${r[f.unitKey] === 'kmh' ? 'selected' : ''}>km/h</option></select></div>`;
        break;
      case 'number':
        input = `<div class="${f.unit ? 'suffix' : ''}"><input id="${id}" type="number" inputmode="decimal" ${bind} value="${e(val(v))}" min="${f.min ?? ''}" step="${f.step || 'any'}" placeholder="${e(ph || '')}">${f.unit ? `<span class="u">${e(f.unit)}</span>` : ''}</div>`;
        break;
      default:
        input = `<input id="${id}" type="text" ${bind} value="${e(val(v))}" placeholder="${e(ph || '')}" maxlength="200">`;
    }
    return `<div class="field ${f.full ? 'span-all' : ''} ${err ? 'invalid' : ''}"><label for="${id}">${e(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</label>${input}${err ? `<div class="err">${e(err)}</div>` : help ? `<div class="help">${e(help)}</div>` : ''}</div>`;
  }

  function payloadHtml(r, errors) {
    const pls = r.payloads || [];
    const on = (t) => pls.some((p) => p.type === t);
    let h = `<p class="small t2" style="margin:0 0 10px">Select every payload the drone must carry. Video resolution (4K, 1080p) and image-sensor resolution (MP) are compared separately.</p>
      <div class="chips">${PAYLOAD_TYPES.map((t) => `<button type="button" class="chip ${on(t) ? 'on' : ''}" data-act="payloadType" data-v="${e(t)}" aria-pressed="${on(t)}">${e(t)}</button>`).join('')}</div>`;
    pls.forEach((p, i) => {
      const fields = PAYLOAD_FIELDS[p.type] || [];
      h += `<div class="sub-block"><h4><span>${e(p.type)}${p.type === 'Custom' ? ' payload' : ' requirements'} <span class="muted small" style="font-weight:400">— all optional</span></span><button type="button" class="btn sm ghost" data-act="payloadRemove" data-i="${i}">${TK.ui.icon('x', 14)} Remove</button></h4>
        <div class="grid g3">${fields.map((f) => fieldHtml(f, p, errors['p' + i + '.' + f.k], String(i))).join('')}</div></div>`;
    });
    if (on('Custom')) h += `<div style="margin-top:10px"><button type="button" class="btn sm" data-act="payloadAddCustom">${TK.ui.icon('plus', 14)} Add another custom payload</button></div>`;
    if (on('RGB') && on('Thermal')) h += `<div class="alert info" style="margin-top:12px">${TK.ui.icon('info')}<div class="ab small">A dual-sensor thermal camera whose visible channel meets the RGB requirement will be preferred, so one unit serves both.</div></div>`;
    return h;
  }

  function assumptionsHtml(projA, baseA) {
    const groups = {};
    TK.sizing.A_META.forEach((m) => (groups[m[0]] = groups[m[0]] || []).push(m));
    const changed = Object.keys(projA || {}).filter((k) => projA[k] !== '' && projA[k] !== null && projA[k] !== undefined).length;
    return `<details class="card sec glass" data-sec="advanced" ${TK.app.state.open.advanced ? 'open' : ''}>
      <summary><span class="si">${TK.ui.icon('wrench', 16)}</span><span class="st"><b>Advanced settings — engineering assumptions</b><span>${changed ? changed + ' changed for this project' : 'Using defaults from Settings'} · visible and editable</span></span>${TK.ui.icon('chev', 16).replace('<svg', '<svg class="chev"')}</summary>
      <div class="sb">
        <p class="small t2" style="margin:0 0 14px">These values drive every calculation. Blank = default (shown as placeholder). Defaults come from Drone_Calculations.xlsx where marked, and can be changed for all projects in Settings.</p>
        ${Object.keys(groups).map((g) => `<div class="eyebrow" style="margin-top:14px">${e(g)}</div><div class="grid g4">${groups[g].map((m) => {
          const v = projA && projA[m[1]] !== undefined ? projA[m[1]] : '';
          const def = baseA[m[1]] !== undefined && baseA[m[1]] !== '' ? baseA[m[1]] : m[4];
          return `<div class="field"><label for="a_${m[1]}" title="${e(m[6])}">${e(m[2])}</label><div class="${m[3] ? 'suffix' : ''}"><input id="a_${m[1]}" type="number" step="${m[5]}" data-a="${m[1]}" value="${e(v)}" placeholder="${e(def)}">${m[3] ? `<span class="u">${e(m[3])}</span>` : ''}</div>${m[6] ? `<div class="help">${e(m[6])}</div>` : ''}</div>`;
        }).join('')}</div>`).join('')}
        <div class="btn-row" style="margin-top:14px"><button type="button" class="btn sm" data-act="resetAssumptions">${TK.ui.icon('refresh', 14)} Reset this project to defaults</button></div>
      </div></details>`;
  }

  function render(project, errors) {
    errors = errors || {};
    const r = project.req;
    const open = TK.app.state.open;
    const secs = SECTIONS.map((s, i) => {
      const isOpen = open[s.id] !== undefined ? open[s.id] : i < 2;
      const errCount = s.fields ? s.fields.filter((f) => errors[f.k]).length : Object.keys(errors).filter((k) => /^p\d/.test(k)).length;
      const body = s.custom === 'payload' ? payloadHtml(r, errors) : `<div class="grid g3">${s.fields.map((f) => fieldHtml(f, r, errors[f.k])).join('')}</div>`;
      return `<details class="card sec glass" data-sec="${s.id}" ${isOpen ? 'open' : ''}>
        <summary><span class="si">${s.n}</span><span class="st"><b>${e(s.title)}</b><span>${e(s.summary(r) || 'Optional')}</span></span>${errCount ? `<span class="badge bad">${errCount} to fix</span>` : ''}${TK.ui.icon('chev', 16).replace('<svg', '<svg class="chev"')}</summary>
        <div class="sb">${body}</div></details>`;
    }).join('');
    return secs + assumptionsHtml(project.assumptions || {}, TK.store.settings().assumptions || {});
  }

  // ---------------------------------------------------------------- validation
  function validate(r) {
    const err = {};
    const num = (k, opts) => {
      const v = r[k];
      if (v === '' || v === null || v === undefined) return;
      const n = Number(v);
      if (!isFinite(n)) err[k] = 'Enter a number.';
      else if (n < (opts && opts.min !== undefined ? opts.min : 0)) err[k] = `Must be at least ${opts && opts.min !== undefined ? opts.min : 0}.`;
      else if (opts && opts.max !== undefined && n > opts.max) err[k] = `Must be at most ${opts.max}.`;
    };
    if (!String(r.projectName || '').trim()) err.projectName = 'Give the project a name.';
    ['enduranceMin', 'rangeKm', 'altitudeM', 'cruiseSpeed', 'maxSpeed', 'mtowLimitKg', 'payloadKg', 'windSpeed', 'wheelbaseMm', 'maxPropIn', 'maxStructPayloadKg', 'uartsMin', 'rtkAccuracyCm', 'screenMin', 'channelsMin', 'controlRangeKm', 'videoRangeKm', 'capacityMah', 'maxBatteryKg', 'budget', 'armsCount'].forEach((k) => num(k));
    num('enduranceMin', { max: 2000 });
    num('altitudeM', { max: 6000 });
    num('droneQty', { min: 1, max: 10000 });
    if (r.configuration === 'Custom') {
      const n = Number(r.customMotorCount);
      if (!n || n < 1 || n > 16 || !Number.isInteger(n)) err.customMotorCount = 'Enter a whole number of motors (1–16).';
    }
    const cls = r.aircraftClass;
    if ((cls === 'Multirotor' || cls === 'Other') && r.configuration === 'Fixed Wing') err.configuration = 'A multirotor cannot use the Fixed Wing configuration.';
    if (cls === 'Fixed Wing' && ['Quadcopter', 'Hexacopter', 'Octocopter', 'Tricopter'].indexOf(r.configuration) !== -1) err.configuration = 'Choose "Fixed Wing" or "Custom configuration" for a fixed-wing aircraft.';
    if (r.mtowLimitKg && r.payloadKg && Number(r.payloadKg) >= Number(r.mtowLimitKg)) err.payloadKg = 'Payload must be lighter than the MTOW limit.';
    if (r.maxSpeed && r.cruiseSpeed && Number(r.maxSpeed) * (r.maxSpeedUnit === 'kmh' ? 1 / 3.6 : 1) < Number(r.cruiseSpeed) * (r.cruiseSpeedUnit === 'kmh' ? 1 / 3.6 : 1)) err.maxSpeed = 'Maximum speed is below the cruise speed.';
    (r.payloads || []).forEach((p, i) => {
      (PAYLOAD_FIELDS[p.type] || []).forEach((f) => {
        if (f.type === 'number' && p[f.k] !== '' && p[f.k] !== undefined && p[f.k] !== null && (!isFinite(Number(p[f.k])) || Number(p[f.k]) < 0)) err['p' + i + '.' + f.k] = 'Enter a positive number.';
      });
      if (p.type === 'Custom' && !(Number(p.weightG) > 0)) err['p' + i + '.weightG'] = 'Custom payload weight is needed for sizing.';
    });
    if (!(Number(r.enduranceMin) > 0) && !(Number(r.rangeKm) > 0)) err.enduranceMin = 'Enter an endurance or a range so the battery can be sized.';
    return err;
  }

  /** Coerce number fields from input strings. */
  function coerceValue(f, raw) {
    if (!f) return raw;
    if (f.type === 'number' || f.type === 'speed') return raw === '' ? '' : Number(raw);
    return raw;
  }
  function fieldDef(k) {
    for (const s of SECTIONS) {
      if (!s.fields) continue;
      const f = s.fields.find((x) => x.k === k);
      if (f) return f;
    }
    return null;
  }
  function payloadFieldDef(type, k) {
    return (PAYLOAD_FIELDS[type] || []).find((f) => f.k === k) || null;
  }
  // fields whose change alters which other fields are visible
  const STRUCTURAL = ['aircraftClass', 'configuration', 'application', 'rtk', 'charger', 'videoType'];

  TK.form = { SECTIONS, PAYLOAD_TYPES, PAYLOAD_FIELDS, defaults, render, validate, coerceValue, fieldDef, payloadFieldDef, STRUCTURAL };
})(typeof window !== 'undefined' ? window : globalThis);
