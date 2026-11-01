/* Tinkerer — component master schema.
 * One entry per Google Sheet tab. Column headers in the sheet are matched to
 * field keys by label, key or alias (case/units/punctuation-insensitive), so
 * you can rename columns slightly without breaking anything. Any column the
 * schema does not know is kept and displayed as an extra specification, and
 * any tab the schema does not know becomes a custom category automatically.
 */
(function (root) {
  'use strict';
  const TK = (root.TK = root.TK || {});

  const STOCK = ['In Stock', 'Limited', 'Out of Stock', 'On Order', 'Discontinued'];

  // Common columns present on every category tab.
  const COMMON = [
    { k: 'id', label: 'Component ID', type: 'text', aliases: ['id', 'sku', 'partno', 'itemid', 'componentcode'] },
    { k: 'name', label: 'Component Name', type: 'text', aliases: ['name', 'product', 'productname', 'item', 'itemname', 'component'] },
    { k: 'manufacturer', label: 'Manufacturer', type: 'text', aliases: ['brand', 'make', 'mfr', 'oem'] },
    { k: 'model', label: 'Model Number', type: 'text', aliases: ['model', 'modelno', 'partnumber', 'mpn', 'modelnumber'] },
    { k: 'vendor', label: 'Vendor Name', type: 'text', aliases: ['vendor', 'supplier', 'seller', 'vendorname'] },
    { k: 'vendorUrl', label: 'Vendor Website', type: 'url', aliases: ['vendorwebsite', 'vendorsite', 'website', 'vendorurl'] },
    { k: 'url', label: 'Product URL', type: 'url', aliases: ['producturl', 'purchaseurl', 'link', 'sourcelink', 'url', 'buylink', 'productlink'] },
    { k: 'price', label: 'Price (INR)', type: 'num', aliases: ['price', 'priceinr', 'cost', 'unitprice', 'rate', 'pricers'] },
    { k: 'gst', label: 'GST (%)', type: 'num', aliases: ['gst', 'gstpercent', 'gstrate', 'tax', 'gstpercentage'] },
    { k: 'weight', label: 'Weight (g)', type: 'num', aliases: ['weight', 'weightg', 'mass', 'weightgrams'] },
    { k: 'packQty', label: 'Units per Pack', type: 'num', aliases: ['unitsperpack', 'packqty', 'packof', 'pack', 'qtyperpack'] },
    { k: 'stock', label: 'Stock Status', type: 'enum', options: STOCK, aliases: ['stock', 'availability', 'stockstatus', 'status'] },
    { k: 'updated', label: 'Last Updated', type: 'text', aliases: ['lastupdated', 'updated', 'lastchecked', 'updatedon', 'date'] },
    { k: 'remarks', label: 'Remarks', type: 'text', aliases: ['remarks', 'notes', 'comment', 'comments'] },
  ];

  const cellsMin = { k: 'cellsMin', label: 'Min Cells (S)', type: 'num', aliases: ['mincells', 'cellmin', 'minvoltage'] };
  const cellsMax = { k: 'cellsMax', label: 'Max Cells (S)', type: 'num', aliases: ['maxcells', 'cellmax', 'maxvoltage'] };
  // Accepts "4-6S" / "12S" in a single column; split into min/max during import.
  const cellRange = { k: 'cellRange', label: 'Voltage Compatibility (S)', type: 'text', aliases: ['voltagecompatibility', 'cellcompatibility', 'voltagerange', 'cells', 'voltage', 'inputvoltage'], hidden: true };
  const ifaceField = { k: 'interface', label: 'Interface', type: 'text', aliases: ['interface', 'protocol', 'communication', 'connection'] };
  const powerW = { k: 'power', label: 'Power (W)', type: 'num', aliases: ['power', 'powerdraw', 'powerconsumption', 'powerw'] };
  const fov = { k: 'fov', label: 'FOV (deg)', type: 'num', aliases: ['fov', 'fieldofview'] };
  const role = { k: 'role', label: 'Role', type: 'enum', options: ['Any', 'Lift', 'Cruise'], aliases: ['role', 'use'] };

  const CATEGORIES = [
    {
      key: 'frames', label: 'Frames', singular: 'Frame', group: 'Structure', aliases: ['frame', 'airframe', 'airframes'],
      summary: ['configuration', 'wheelbase', 'maxProp', 'maxAuw'],
      fields: [
        { k: 'airframe', label: 'Airframe Class', type: 'enum', options: ['Multirotor', 'Fixed Wing', 'VTOL', 'Hybrid VTOL'], aliases: ['airframeclass', 'class', 'dronecategory'] },
        { k: 'configuration', label: 'Configuration', type: 'text', aliases: ['configuration', 'config', 'layout'] },
        { k: 'frameType', label: 'Frame Type', type: 'text', aliases: ['frametype', 'type', 'geometry'] },
        { k: 'motorCount', label: 'Motor Count', type: 'num', aliases: ['motorcount', 'motors', 'motormounts', 'liftmotors'] },
        { k: 'arms', label: 'Arms', type: 'num', aliases: ['arms', 'numberofarms'] },
        { k: 'cruiseMotors', label: 'Cruise Motors', type: 'num', aliases: ['cruisemotors', 'pushermotors'] },
        { k: 'wheelbase', label: 'Wheelbase (mm)', type: 'num', aliases: ['wheelbase', 'diagonal'] },
        { k: 'frameSize', label: 'Frame Size', type: 'text', aliases: ['framesize', 'size', 'sizeclass'] },
        { k: 'maxProp', label: 'Max Propeller (in)', type: 'num', aliases: ['maxprop', 'maxpropsize', 'maxpropeller', 'maxpropdiameter'] },
        { k: 'material', label: 'Material', type: 'text', aliases: ['material'] },
        { k: 'folding', label: 'Folding', type: 'bool', aliases: ['folding', 'foldable'] },
        { k: 'maxAuw', label: 'Max Take-off Weight (kg)', type: 'num', aliases: ['maxtakeoffweight', 'maxauw', 'mtow', 'maxtow', 'maxmtow'] },
        { k: 'maxPayload', label: 'Max Payload (kg)', type: 'num', aliases: ['maxpayload', 'payloadcapacity', 'maxstructuralpayload'] },
        { k: 'wingspan', label: 'Wingspan (mm)', type: 'num', aliases: ['wingspan', 'span'] },
        { k: 'wingArea', label: 'Wing Area (m2)', type: 'num', aliases: ['wingarea', 'wingaream2'] },
        { k: 'gearIncluded', label: 'Landing Gear Included', type: 'bool', aliases: ['landinggearincluded', 'gearincluded'] },
        { k: 'pdbIncluded', label: 'Integrated PDB', type: 'bool', aliases: ['integratedpdb', 'pdbincluded'] },
        { k: 'mounting', label: 'Payload Mounting', type: 'text', aliases: ['payloadmounting', 'mounting', 'mountingrequirements'] },
      ],
    },
    {
      key: 'motors', label: 'Motors', singular: 'Motor', group: 'Propulsion', aliases: ['motor', 'bldc', 'bldcmotors'],
      summary: ['kv', 'maxThrust', 'maxCurrent', 'cellsMax'],
      fields: [
        { k: 'kv', label: 'KV (rpm/V)', type: 'num', aliases: ['kv', 'kvrating'] },
        { k: 'maxThrust', label: 'Max Thrust (g)', type: 'num', aliases: ['maxthrust', 'thrust', 'maximumthrust'] },
        { k: 'maxCurrent', label: 'Max Current (A)', type: 'num', aliases: ['maxcurrent', 'peakcurrent', 'current', 'maximumcurrent'] },
        { k: 'maxPower', label: 'Max Power (W)', type: 'num', aliases: ['maxpower', 'maximumpower', 'power'] },
        cellsMin, cellsMax, cellRange,
        { k: 'propMin', label: 'Min Prop (in)', type: 'num', aliases: ['minprop', 'propmin'] },
        { k: 'propMax', label: 'Max Prop (in)', type: 'num', aliases: ['maxprop', 'propmax'] },
        { k: 'testProp', label: 'Thrust Test Prop (in)', type: 'num', aliases: ['thrusttestprop', 'testprop'] },
        { k: 'testCells', label: 'Thrust Test Cells (S)', type: 'num', aliases: ['thrusttestcells', 'testcells', 'testvoltage'] },
        { k: 'recProp', label: 'Recommended Propellers', type: 'text', aliases: ['recommendedpropellers', 'recommendedprop', 'recommendedprops'] },
        role,
        { k: 'dimensions', label: 'Motor Dimensions', type: 'text', aliases: ['dimensions', 'motordimensions', 'statorsize', 'size'] },
        { k: 'mountPattern', label: 'Mounting Dimensions', type: 'text', aliases: ['mountingdimensions', 'mountingpattern', 'mounting'] },
      ],
    },
    {
      key: 'escs', label: 'ESCs', singular: 'ESC', group: 'Propulsion', aliases: ['esc', 'speedcontrollers', 'escs'],
      summary: ['contCurrent', 'channels', 'cellsMax', 'protocol'],
      fields: [
        { k: 'contCurrent', label: 'Continuous Current (A)', type: 'num', aliases: ['continuouscurrent', 'currentrating', 'current', 'contcurrent'] },
        { k: 'burstCurrent', label: 'Burst Current (A)', type: 'num', aliases: ['burstcurrent', 'peakcurrent', 'burst'] },
        cellsMin, cellsMax, cellRange,
        { k: 'channels', label: 'Motor Channels', type: 'num', aliases: ['motorchannels', 'channels', 'motorsperesc'] },
        { k: 'firmware', label: 'Firmware', type: 'text', aliases: ['firmware'] },
        { k: 'protocol', label: 'Protocol', type: 'text', aliases: ['protocol', 'signal'] },
      ],
    },
    {
      key: 'propellers', label: 'Propellers', singular: 'Propeller', group: 'Propulsion', aliases: ['propeller', 'props', 'prop'],
      summary: ['diameter', 'pitch', 'blades', 'material'],
      fields: [
        { k: 'diameter', label: 'Diameter (in)', type: 'num', aliases: ['diameter', 'size', 'propdiameter'] },
        { k: 'pitch', label: 'Pitch (in)', type: 'num', aliases: ['pitch'] },
        { k: 'blades', label: 'Blades', type: 'num', aliases: ['blades', 'numberofblades', 'bladecount'] },
        { k: 'material', label: 'Material', type: 'text', aliases: ['material'] },
        { k: 'folding', label: 'Folding', type: 'bool', aliases: ['folding'] },
        { k: 'motorCompat', label: 'Motor Compatibility', type: 'text', aliases: ['motorcompatibility', 'recommendedmotor', 'recommendedmotorcompatibility', 'compatiblemotors'] },
        role,
      ],
    },
    {
      key: 'batteries', label: 'Batteries', singular: 'Battery', group: 'Power', aliases: ['battery', 'lipo', 'packs'],
      summary: ['cells', 'capacity', 'cRating', 'chemistry'],
      fields: [
        { k: 'chemistry', label: 'Chemistry', type: 'text', aliases: ['chemistry', 'type', 'batterytype'] },
        { k: 'cells', label: 'Cells (S)', type: 'num', aliases: ['cells', 'cellcount', 's', 'series'] },
        { k: 'voltageV', label: 'Nominal Voltage (V)', type: 'num', aliases: ['nominalvoltage', 'voltagev', 'voltage'] },
        { k: 'capacity', label: 'Capacity (mAh)', type: 'num', aliases: ['capacity', 'capacitymah', 'mah'] },
        { k: 'cRating', label: 'C-Rating (continuous)', type: 'num', aliases: ['crating', 'c', 'continuousc', 'dischargerate'] },
        { k: 'burstC', label: 'Burst C-Rating', type: 'num', aliases: ['burstc', 'burstcrating'] },
        { k: 'maxDischarge', label: 'Max Discharge (A)', type: 'num', aliases: ['maxdischarge', 'maxdischargecurrent', 'maximumdischargecurrent'] },
        { k: 'energy', label: 'Energy (Wh)', type: 'num', aliases: ['energy', 'wh', 'energywh'] },
        { k: 'dimensions', label: 'Dimensions', type: 'text', aliases: ['dimensions', 'size'] },
        { k: 'connector', label: 'Connector', type: 'text', aliases: ['connector', 'plug'] },
      ],
    },
    {
      key: 'flightControllers', label: 'Flight Controllers', singular: 'Flight Controller', group: 'Avionics', aliases: ['flightcontroller', 'fc', 'fcs', 'autopilot'],
      summary: ['firmware', 'uarts', 'can', 'pwm'],
      fields: [
        { k: 'mcu', label: 'MCU', type: 'text', aliases: ['mcu', 'processor'] },
        { k: 'firmware', label: 'Supported Firmware', type: 'list', aliases: ['supportedfirmware', 'firmware'] },
        { k: 'imu', label: 'IMU', type: 'text', aliases: ['imu', 'imus'] },
        { k: 'imuCount', label: 'IMU Count', type: 'num', aliases: ['imucount', 'redundantimu', 'numberofimus'] },
        { k: 'uarts', label: 'UARTs', type: 'num', aliases: ['uarts', 'uartcount', 'serialports'] },
        { k: 'can', label: 'CAN Ports', type: 'num', aliases: ['canports', 'can', 'cancount'] },
        { k: 'pwm', label: 'PWM Outputs', type: 'num', aliases: ['pwmoutputs', 'pwm', 'outputs'] },
        { k: 'pmInputs', label: 'Power Module Inputs', type: 'num', aliases: ['powermoduleinputs', 'powerinputs'] },
        { k: 'gpsSupport', label: 'GPS Compatibility', type: 'text', aliases: ['gpscompatibility', 'gpssupport'] },
      ],
    },
    {
      key: 'gps', label: 'GPS Modules', singular: 'GPS Module', group: 'Avionics', aliases: ['gps', 'gnss', 'gpsmodule'],
      summary: ['constellations', 'interface', 'updateRate'],
      fields: [
        { k: 'constellations', label: 'Constellations', type: 'text', aliases: ['constellations', 'gnss'] },
        { k: 'updateRate', label: 'Update Rate (Hz)', type: 'num', aliases: ['updaterate', 'rate'] },
        ifaceField,
        { k: 'compass', label: 'Integrated Compass', type: 'bool', aliases: ['integratedcompass', 'compass', 'magnetometer'] },
        { k: 'accuracy', label: 'Accuracy (m)', type: 'num', aliases: ['accuracy'] },
      ],
    },
    {
      key: 'rtk', label: 'RTK Modules', singular: 'RTK Module', group: 'Avionics', aliases: ['rtk', 'rtkmodule', 'rtkgps'],
      summary: ['rtkType', 'accuracy', 'interface'],
      fields: [
        { k: 'rtkType', label: 'Type', type: 'text', aliases: ['type', 'rtktype'] },
        { k: 'accuracy', label: 'Accuracy (cm)', type: 'num', aliases: ['accuracy'] },
        { k: 'updateRate', label: 'Update Rate (Hz)', type: 'num', aliases: ['updaterate'] },
        ifaceField,
        { k: 'heading', label: 'Dual-antenna Heading', type: 'bool', aliases: ['dualantennaheading', 'heading', 'moving baseline'] },
        { k: 'constellations', label: 'Constellations', type: 'text', aliases: ['constellations'] },
        { k: 'correction', label: 'Correction Link', type: 'text', aliases: ['correctionlink', 'corrections'] },
      ],
    },
    {
      key: 'pdbs', label: 'Power Distribution Boards', singular: 'PDB', group: 'Power', aliases: ['pdb', 'pdbs', 'powerdistributionboard'],
      summary: ['maxCurrent', 'cellsMax', 'outputs'],
      fields: [
        { k: 'maxCurrent', label: 'Max Current (A)', type: 'num', aliases: ['maxcurrent', 'current'] },
        cellsMin, cellsMax, cellRange,
        { k: 'outputs', label: 'Output Ports', type: 'num', aliases: ['outputports', 'outputs'] },
        { k: 'becOut', label: 'BEC Outputs', type: 'text', aliases: ['becoutputs', 'bec'] },
      ],
    },
    {
      key: 'powerModules', label: 'Power Modules', singular: 'Power Module', group: 'Power', aliases: ['powermodule', 'pm', 'powermodules'],
      summary: ['maxCurrent', 'cellsMax', 'interface'],
      fields: [
        { k: 'maxCurrent', label: 'Max Current (A)', type: 'num', aliases: ['maxcurrent', 'current'] },
        cellsMin, cellsMax, cellRange,
        { k: 'outputVoltage', label: 'Output Voltage (V)', type: 'num', aliases: ['outputvoltage'] },
        ifaceField,
      ],
    },
    {
      key: 'ubecs', label: 'UBECs', singular: 'UBEC', group: 'Power', aliases: ['ubec', 'bec', 'becs', 'regulators'],
      summary: ['outputCurrent', 'outputVoltage', 'cellsMax'],
      fields: [
        { k: 'outputCurrent', label: 'Output Current (A)', type: 'num', aliases: ['outputcurrent', 'current'] },
        { k: 'outputVoltage', label: 'Output Voltage (V)', type: 'text', aliases: ['outputvoltage', 'voltageout'] },
        cellsMin, cellsMax, cellRange,
      ],
    },
    {
      key: 'cameras', label: 'Cameras', singular: 'Camera', group: 'Payload', aliases: ['camera', 'rgbcameras', 'gimbalcameras'],
      summary: ['cameraType', 'videoRes', 'sensorMP', 'opticalZoom'],
      fields: [
        { k: 'cameraType', label: 'Camera Type', type: 'text', aliases: ['cameratype', 'type'] },
        { k: 'sensorMP', label: 'Sensor Resolution (MP)', type: 'num', aliases: ['sensorresolution', 'resolution', 'megapixels', 'mp', 'imageresolution'] },
        { k: 'videoRes', label: 'Video Resolution', type: 'text', aliases: ['videoresolution', 'video'] },
        { k: 'sensorSize', label: 'Sensor Size', type: 'text', aliases: ['sensorsize', 'sensor'] },
        { k: 'opticalZoom', label: 'Optical Zoom (x)', type: 'num', aliases: ['opticalzoom'] },
        { k: 'digitalZoom', label: 'Digital Zoom (x)', type: 'num', aliases: ['digitalzoom'] },
        { k: 'lensType', label: 'Lens Type', type: 'text', aliases: ['lenstype', 'lens'] },
        { k: 'focalLength', label: 'Focal Length (mm)', type: 'text', aliases: ['focallength'] },
        fov, ifaceField, powerW,
        { k: 'gimbalIncluded', label: 'Integrated Gimbal', type: 'bool', aliases: ['integratedgimbal', 'gimbalincluded', 'gimbal'] },
        { k: 'gimbalAxes', label: 'Gimbal Axes', type: 'num', aliases: ['gimbalaxes', 'axes'] },
      ],
    },
    {
      key: 'thermalCameras', label: 'Thermal Cameras', singular: 'Thermal Camera', group: 'Payload', aliases: ['thermalcamera', 'thermal', 'ircameras'],
      summary: ['thermalRes', 'netd', 'videoRes', 'radiometric'],
      fields: [
        { k: 'thermalRes', label: 'Thermal Resolution', type: 'text', aliases: ['thermalresolution', 'irresolution', 'resolution'] },
        { k: 'netd', label: 'NETD (mK)', type: 'num', aliases: ['netd', 'thermalsensitivity', 'sensitivity'] },
        { k: 'detectionRange', label: 'Detection Range (m)', type: 'num', aliases: ['detectionrange', 'range'] },
        { k: 'lensMM', label: 'Thermal Lens (mm)', type: 'num', aliases: ['thermallens', 'lens', 'lenssize', 'focallength'] },
        { k: 'radiometric', label: 'Radiometric', type: 'bool', aliases: ['radiometric'] },
        { k: 'visibleMP', label: 'Visible Sensor (MP)', type: 'num', aliases: ['visiblesensor', 'visiblemp', 'rgbmp'] },
        { k: 'videoRes', label: 'Visible Video Resolution', type: 'text', aliases: ['visiblevideoresolution', 'videoresolution', 'rgbvideo'] },
        { k: 'opticalZoom', label: 'Optical Zoom (x)', type: 'num', aliases: ['opticalzoom'] },
        fov, ifaceField, powerW,
        { k: 'gimbalIncluded', label: 'Integrated Gimbal', type: 'bool', aliases: ['integratedgimbal', 'gimbalincluded', 'gimbal'] },
        { k: 'gimbalAxes', label: 'Gimbal Axes', type: 'num', aliases: ['gimbalaxes', 'axes'] },
      ],
    },
    {
      key: 'multispectral', label: 'Multispectral Cameras', singular: 'Multispectral Camera', group: 'Payload', aliases: ['multispectral', 'multispectralcamera', 'hyperspectralcameras'],
      summary: ['bands', 'wavelengths', 'interface'],
      fields: [
        { k: 'bands', label: 'Bands', type: 'num', aliases: ['bands', 'numberofbands'] },
        { k: 'wavelengths', label: 'Wavelengths (nm)', type: 'text', aliases: ['wavelengths'] },
        { k: 'sensorMP', label: 'Sensor Resolution (MP)', type: 'num', aliases: ['sensorresolution', 'resolution', 'mp'] },
        ifaceField, powerW,
      ],
    },
    {
      key: 'lidar', label: 'LiDAR', singular: 'LiDAR', group: 'Payload', aliases: ['lidars', 'lidarsensors', 'laserscanner'],
      summary: ['range', 'pointRate', 'accuracy'],
      fields: [
        { k: 'range', label: 'Range (m)', type: 'num', aliases: ['range', 'maxrange'] },
        { k: 'pointRate', label: 'Point Rate (pts/s)', type: 'num', aliases: ['pointrate', 'points', 'pointspersecond'] },
        { k: 'accuracy', label: 'Accuracy (cm)', type: 'num', aliases: ['accuracy'] },
        fov, ifaceField, powerW,
        { k: 'lidarUse', label: 'Use', type: 'text', aliases: ['use', 'application'] },
      ],
    },
    {
      key: 'gimbals', label: 'Gimbals', singular: 'Gimbal', group: 'Payload', aliases: ['gimbal'],
      summary: ['axes', 'maxPayload'],
      fields: [
        { k: 'axes', label: 'Axes', type: 'num', aliases: ['axes'] },
        { k: 'maxPayload', label: 'Max Payload (g)', type: 'num', aliases: ['maxpayload', 'payload', 'maxload'] },
        { k: 'compatible', label: 'Compatible Cameras', type: 'text', aliases: ['compatiblecameras', 'compatibility'] },
        ifaceField, powerW,
      ],
    },
    {
      key: 'transmitters', label: 'Transmitters', singular: 'Transmitter', group: 'Communication', aliases: ['transmitter', 'tx', 'radios', 'gcs', 'groundcontrol'],
      summary: ['screen', 'channels', 'range', 'protocol'],
      fields: [
        { k: 'screen', label: 'Screen Size (in)', type: 'num', aliases: ['screensize', 'screen', 'display'] },
        { k: 'channels', label: 'Channels', type: 'num', aliases: ['channels'] },
        { k: 'frequency', label: 'Frequency', type: 'text', aliases: ['frequency', 'band'] },
        { k: 'protocol', label: 'Protocol', type: 'text', aliases: ['protocol', 'communicationprotocol'] },
        { k: 'range', label: 'Control Range (km)', type: 'num', aliases: ['controlrange', 'range', 'rangekm', 'maxrange', 'maximumrange'] },
        { k: 'os', label: 'Operating System', type: 'text', aliases: ['operatingsystem', 'os'] },
        { k: 'telemetry', label: 'Telemetry Support', type: 'bool', aliases: ['telemetrysupport', 'telemetry'] },
        { k: 'videoLink', label: 'Integrated Video Link', type: 'bool', aliases: ['integratedvideolink', 'videolink', 'videodownlink'] },
        { k: 'videoRange', label: 'Video Range (km)', type: 'num', aliases: ['videorange'] },
        { k: 'videoType', label: 'Video Type', type: 'text', aliases: ['videotype'] },
        { k: 'airUnit', label: 'Includes Air Unit', type: 'bool', aliases: ['includesairunit', 'airunit', 'receiverincluded'] },
      ],
    },
    {
      key: 'receivers', label: 'Receivers', singular: 'Receiver', group: 'Communication', aliases: ['receiver', 'rx'],
      summary: ['protocol', 'channels', 'range'],
      fields: [
        { k: 'channels', label: 'Channels', type: 'num', aliases: ['channels'] },
        { k: 'protocol', label: 'Protocol', type: 'text', aliases: ['protocol'] },
        { k: 'frequency', label: 'Frequency', type: 'text', aliases: ['frequency', 'band'] },
        { k: 'range', label: 'Range (km)', type: 'num', aliases: ['range', 'rangekm'] },
        { k: 'telemetry', label: 'Telemetry', type: 'bool', aliases: ['telemetry'] },
        { k: 'output', label: 'Output', type: 'text', aliases: ['output', 'outputprotocol'] },
      ],
    },
    {
      key: 'videoTx', label: 'Video Transmitters', singular: 'Video Transmitter', group: 'Communication', aliases: ['videotransmitter', 'vtx', 'vtxs', 'videolinks'],
      summary: ['videoType', 'range', 'resolution'],
      fields: [
        { k: 'videoType', label: 'Video Type', type: 'text', aliases: ['videotype', 'type'] },
        { k: 'system', label: 'System', type: 'text', aliases: ['system'] },
        { k: 'range', label: 'Range (km)', type: 'num', aliases: ['range', 'rangekm'] },
        { k: 'frequency', label: 'Frequency', type: 'text', aliases: ['frequency'] },
        { k: 'outputPower', label: 'Output Power (mW)', type: 'num', aliases: ['outputpower', 'power'] },
        { k: 'resolution', label: 'Video Resolution', type: 'text', aliases: ['videoresolution', 'resolution'] },
        { k: 'latency', label: 'Latency (ms)', type: 'num', aliases: ['latency'] },
      ],
    },
    {
      key: 'telemetry', label: 'Telemetry Modules', singular: 'Telemetry Module', group: 'Communication', aliases: ['telemetrymodule', 'telemetryradios', 'telemetry'],
      summary: ['range', 'frequency', 'protocol'],
      fields: [
        { k: 'range', label: 'Range (km)', type: 'num', aliases: ['range'] },
        { k: 'frequency', label: 'Frequency', type: 'text', aliases: ['frequency'] },
        { k: 'protocol', label: 'Protocol', type: 'text', aliases: ['protocol'] },
        { k: 'outputPower', label: 'Output Power (mW)', type: 'num', aliases: ['outputpower', 'power'] },
        ifaceField,
        { k: 'kit', label: 'Air + Ground Kit', type: 'bool', aliases: ['airgroundkit', 'kit', 'pair'] },
      ],
    },
    {
      key: 'antennas', label: 'Antennas', singular: 'Antenna', group: 'Communication', aliases: ['antenna', 'patchantenna', 'patchantennas'],
      summary: ['antennaType', 'antennaUse', 'frequency', 'gain'],
      fields: [
        { k: 'antennaType', label: 'Antenna Type', type: 'text', aliases: ['antennatype', 'type'] },
        { k: 'antennaUse', label: 'Use', type: 'text', aliases: ['use', 'application'] },
        { k: 'frequency', label: 'Frequency', type: 'text', aliases: ['frequency'] },
        { k: 'gain', label: 'Gain (dBi)', type: 'num', aliases: ['gain'] },
        { k: 'polarization', label: 'Polarization', type: 'text', aliases: ['polarization', 'polarisation'] },
        { k: 'connector', label: 'Connector', type: 'text', aliases: ['connector'] },
      ],
    },
    {
      key: 'landingGear', label: 'Landing Gear', singular: 'Landing Gear', group: 'Structure', aliases: ['landinggears', 'gear', 'landingskids'],
      summary: ['gearType', 'height', 'maxLoad'],
      fields: [
        { k: 'gearType', label: 'Type', type: 'text', aliases: ['type', 'geartype'] },
        { k: 'height', label: 'Height (mm)', type: 'num', aliases: ['height'] },
        { k: 'retractable', label: 'Retractable', type: 'bool', aliases: ['retractable'] },
        { k: 'maxLoad', label: 'Max Load (kg)', type: 'num', aliases: ['maxload', 'load'] },
      ],
    },
    {
      key: 'servos', label: 'Servos', singular: 'Servo', group: 'Structure', aliases: ['servo'],
      summary: ['torque', 'speed', 'servoType'],
      fields: [
        { k: 'torque', label: 'Torque (kg-cm)', type: 'num', aliases: ['torque'] },
        { k: 'speed', label: 'Speed (s/60deg)', type: 'num', aliases: ['speed'] },
        { k: 'voltage', label: 'Voltage (V)', type: 'text', aliases: ['voltage'] },
        { k: 'servoType', label: 'Type', type: 'text', aliases: ['type', 'servotype'] },
        { k: 'sizeClass', label: 'Size Class', type: 'text', aliases: ['sizeclass', 'size'] },
      ],
    },
    {
      key: 'wiring', label: 'Connectors and Wiring', singular: 'Connector / Wiring item', group: 'Power', aliases: ['connectors', 'wiring', 'connectorsandwiring', 'cables'],
      summary: ['wiringUse', 'current', 'gauge'],
      fields: [
        { k: 'wiringUse', label: 'Use', type: 'text', aliases: ['use', 'application'] },
        { k: 'current', label: 'Current Rating (A)', type: 'num', aliases: ['currentrating', 'current'] },
        { k: 'gauge', label: 'Gauge (AWG)', type: 'num', aliases: ['gauge', 'awg'] },
        { k: 'connectorType', label: 'Connector Type', type: 'text', aliases: ['connectortype', 'connector'] },
        { k: 'qtyBasis', label: 'Qty Basis', type: 'enum', options: ['Per build', 'Per motor', 'Per battery'], aliases: ['qtybasis', 'basis'] },
        { k: 'qtyMult', label: 'Qty Multiplier', type: 'num', aliases: ['qtymultiplier', 'multiplier'] },
        { k: 'autoInclude', label: 'Auto-include', type: 'bool', aliases: ['autoinclude', 'standard'] },
      ],
    },
    {
      key: 'accessories', label: 'Other Accessories', singular: 'Accessory', group: 'Other', aliases: ['accessories', 'otheraccessories', 'accessory', 'misc'],
      summary: ['accType', 'maxCells', 'power'],
      fields: [
        { k: 'accType', label: 'Accessory Type', type: 'text', aliases: ['accessorytype', 'type'] },
        { k: 'autoInclude', label: 'Auto-include', type: 'bool', aliases: ['autoinclude', 'standard'] },
        { k: 'maxCells', label: 'Max Cells (S)', type: 'num', aliases: ['maxcells'] },
        { k: 'chargePower', label: 'Charge Power (W)', type: 'num', aliases: ['chargepower'] },
        { k: 'chargeChannels', label: 'Charge Channels', type: 'num', aliases: ['chargechannels'] },
        powerW, ifaceField,
      ],
    },
    {
      key: 'engines', label: 'Fuel Engines', singular: 'Fuel Engine', group: 'Propulsion', aliases: ['engine', 'engines', 'fuelengine', 'icengines', 'gasengines'],
      summary: ['enginePower', 'bsfc', 'fuelType'],
      fields: [
        { k: 'enginePower', label: 'Max Power (W)', type: 'num', aliases: ['maxpower', 'power', 'enginepower'] },
        { k: 'bsfc', label: 'BSFC (g/kWh)', type: 'num', aliases: ['bsfc'] },
        { k: 'fuelType', label: 'Fuel Type', type: 'text', aliases: ['fueltype', 'fuel'] },
        { k: 'displacement', label: 'Displacement (cc)', type: 'num', aliases: ['displacement', 'cc'] },
        { k: 'generator', label: 'Integrated Generator', type: 'bool', aliases: ['integratedgenerator', 'generator', 'alternator'] },
      ],
    },
  ];

  // Optional bench/manufacturer thrust data used instead of generic estimates.
  const THRUST_TABLE = {
    label: 'Thrust Tables',
    aliases: ['thrusttable', 'thrusttables', 'thrustdata', 'motortests'],
    fields: [
      { k: 'motorId', label: 'Motor ID', type: 'text', aliases: ['motorid', 'motor'] },
      { k: 'propId', label: 'Propeller ID', type: 'text', aliases: ['propellerid', 'propid'] },
      { k: 'diameter', label: 'Prop Diameter (in)', type: 'num', aliases: ['propdiameter', 'diameter'] },
      { k: 'pitch', label: 'Prop Pitch (in)', type: 'num', aliases: ['proppitch', 'pitch'] },
      { k: 'cells', label: 'Cells (S)', type: 'num', aliases: ['cells', 's'] },
      { k: 'throttle', label: 'Throttle (%)', type: 'num', aliases: ['throttle'] },
      { k: 'thrust', label: 'Thrust (g)', type: 'num', aliases: ['thrust', 'thrustg'] },
      { k: 'current', label: 'Current (A)', type: 'num', aliases: ['current'] },
      { k: 'power', label: 'Power (W)', type: 'num', aliases: ['power', 'powerw'] },
      { k: 'source', label: 'Source', type: 'text', aliases: ['source', 'datasource'] },
      { k: 'testDate', label: 'Test Date', type: 'text', aliases: ['testdate', 'date'] },
    ],
  };

  const byKey = {};
  CATEGORIES.forEach((c) => (byKey[c.key] = c));

  function allFields(cat) {
    return COMMON.concat(cat.fields);
  }
  function templateHeaders(cat) {
    return COMMON.slice(0, 1)
      .concat(COMMON.slice(1))
      .concat(cat.fields.filter((f) => !f.hidden))
      .map((f) => f.label);
  }

  TK.schema = { COMMON, CATEGORIES, THRUST_TABLE, STOCK, byKey, allFields, templateHeaders };
})(typeof window !== 'undefined' ? window : globalThis);
