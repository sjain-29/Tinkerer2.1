/* TEST catalogue — fictitious "TEST …" components with plausible specs and
 * indicative INR prices. Used only by the automated tests and the
 * "Load TEST catalogue" button in Settings. Never use it for real quotations.
 */
const V = 'TEST Vendor', VU = 'https://example.com';
const L = (slug) => `https://example.com/test/${slug}`;
const today = '2026-10-30';
const C = (id, name, mfr, model, price, gst, weight, stock, specs, extra) =>
  Object.assign({ 'Component ID': id, 'Component Name': name, Manufacturer: mfr, 'Model Number': model, 'Vendor Name': V, 'Vendor Website': VU, 'Product URL': L(id.toLowerCase()), 'Price (INR)': price, 'GST (%)': gst, 'Weight (g)': weight, 'Stock Status': stock || 'In Stock', 'Last Updated': today, Remarks: 'TEST DATA — not a real product' }, specs, extra || {});

const sheets = {
  Frames: [
    C('FR-Q450', 'TEST Quad 450 Frame', 'TestFrames', 'Q450', 2400, 18, 290, null, { 'Airframe Class': 'Multirotor', Configuration: 'Quadcopter', 'Frame Type': 'X', 'Motor Count': 4, Arms: 4, 'Wheelbase (mm)': 450, 'Max Propeller (in)': 10, Material: 'Glass fibre', Folding: 'No', 'Max Take-off Weight (kg)': 2.5, 'Max Payload (kg)': 0.6, 'Landing Gear Included': 'Yes', 'Integrated PDB': 'Yes' }),
    C('FR-Q700', 'TEST Quad 700 Carbon Frame', 'TestFrames', 'Q700', 9800, 18, 820, null, { 'Airframe Class': 'Multirotor', Configuration: 'Quadcopter', 'Frame Type': 'X', 'Motor Count': 4, Arms: 4, 'Wheelbase (mm)': 700, 'Max Propeller (in)': 15, Material: 'Carbon fibre', Folding: 'Yes', 'Max Take-off Weight (kg)': 8, 'Max Payload (kg)': 2, 'Landing Gear Included': 'Yes', 'Integrated PDB': 'No' }),
    C('FR-H1200', 'TEST Hexa 1200 Folding Carbon Frame', 'TestFrames', 'H1200', 38500, 18, 2650, null, { 'Airframe Class': 'Multirotor', Configuration: 'Hexacopter', 'Frame Type': 'X', 'Motor Count': 6, Arms: 6, 'Wheelbase (mm)': 1200, 'Max Propeller (in)': 24, Material: 'Carbon fibre', Folding: 'Yes', 'Max Take-off Weight (kg)': 25, 'Max Payload (kg)': 8, 'Landing Gear Included': 'No', 'Integrated PDB': 'No', 'Payload Mounting': 'Dual 25 mm rails, quick release' }),
    C('FR-H1600', 'TEST Hexa 1600 Heavy Carbon Frame', 'TestFrames', 'H1600', 58000, 18, 3600, null, { 'Airframe Class': 'Multirotor', Configuration: 'Hexacopter', 'Frame Type': 'X', 'Motor Count': 6, Arms: 6, 'Wheelbase (mm)': 1600, 'Max Propeller (in)': 30, Material: 'Carbon fibre', Folding: 'Yes', 'Max Take-off Weight (kg)': 40, 'Max Payload (kg)': 12, 'Landing Gear Included': 'Yes', 'Integrated PDB': 'No', 'Payload Mounting': 'Dual 25 mm rails, quick release' }),
    C('FR-O1600', 'TEST Octo 1600 Heavy-lift Frame', 'TestFrames', 'O1600', 72000, 18, 4900, null, { 'Airframe Class': 'Multirotor', Configuration: 'Octocopter', 'Frame Type': 'X', 'Motor Count': 8, Arms: 8, 'Wheelbase (mm)': 1600, 'Max Propeller (in)': 28, Material: 'Carbon fibre', Folding: 'Yes', 'Max Take-off Weight (kg)': 45, 'Max Payload (kg)': 15, 'Landing Gear Included': 'Yes', 'Integrated PDB': 'Yes' }),
    C('FR-FW2200', 'TEST 2.2 m Mapping Wing', 'TestFrames', 'FW2200', 42000, 18, 1650, null, { 'Airframe Class': 'Fixed Wing', Configuration: 'Fixed Wing', 'Frame Type': 'Conventional', 'Motor Count': 0, 'Cruise Motors': 1, 'Wingspan (mm)': 2200, 'Wing Area (m2)': 0.62, 'Max Take-off Weight (kg)': 7, 'Max Payload (kg)': 1.5, Material: 'EPO + carbon spars' }),
    C('FR-VT3000', 'TEST 3 m Quadplane VTOL Airframe', 'TestFrames', 'VT3000', 145000, 18, 4200, null, { 'Airframe Class': 'VTOL', Configuration: 'Quadplane', 'Frame Type': 'Quadplane', 'Motor Count': 4, Arms: 4, 'Cruise Motors': 1, 'Max Propeller (in)': 18, 'Wingspan (mm)': 3000, 'Wing Area (m2)': 0.95, 'Max Take-off Weight (kg)': 18, 'Max Payload (kg)': 3, Material: 'Carbon / glass composite', 'Landing Gear Included': 'Yes' }),
  ],
  Motors: [
    C('MT-2216', 'TEST 2216 920KV Motor', 'TestMotors', '2216-920', 1450, 18, 68, null, { 'KV (rpm/V)': 920, 'Max Thrust (g)': 1150, 'Max Current (A)': 18, 'Max Power (W)': 270, 'Min Cells (S)': 3, 'Max Cells (S)': 4, 'Min Prop (in)': 9, 'Max Prop (in)': 10, 'Thrust Test Prop (in)': 10, 'Thrust Test Cells (S)': 4, Role: 'Lift' }),
    C('MT-4114', 'TEST 4114 400KV Motor', 'TestMotors', '4114-400', 5200, 18, 152, null, { 'KV (rpm/V)': 400, 'Max Thrust (g)': 2600, 'Max Current (A)': 28, 'Max Power (W)': 620, 'Min Cells (S)': 6, 'Max Cells (S)': 6, 'Min Prop (in)': 14, 'Max Prop (in)': 16, 'Thrust Test Prop (in)': 15, 'Thrust Test Cells (S)': 6, Role: 'Lift' }),
    C('MT-5010', 'TEST 5010 300KV Motor', 'TestMotors', '5010-300', 7800, 18, 205, null, { 'KV (rpm/V)': 300, 'Max Thrust (g)': 3600, 'Max Current (A)': 32, 'Max Power (W)': 760, 'Min Cells (S)': 6, 'Max Cells (S)': 6, 'Min Prop (in)': 16, 'Max Prop (in)': 18, 'Thrust Test Prop (in)': 18, 'Thrust Test Cells (S)': 6, Role: 'Lift' }),
    C('MT-6215', 'TEST 6215 180KV Motor', 'TestMotors', '6215-180', 14500, 18, 395, null, { 'KV (rpm/V)': 180, 'Max Thrust (g)': 7200, 'Max Current (A)': 36, 'Max Power (W)': 1600, 'Min Cells (S)': 12, 'Max Cells (S)': 12, 'Min Prop (in)': 22, 'Max Prop (in)': 24, 'Thrust Test Prop (in)': 24, 'Thrust Test Cells (S)': 12, 'Recommended Propellers': '22x7.2, 24x8', Role: 'Lift' }),
    C('MT-8120', 'TEST 8120 100KV Motor', 'TestMotors', '8120-100', 28500, 18, 790, null, { 'KV (rpm/V)': 100, 'Max Thrust (g)': 13500, 'Max Current (A)': 58, 'Max Power (W)': 2900, 'Min Cells (S)': 12, 'Max Cells (S)': 14, 'Min Prop (in)': 28, 'Max Prop (in)': 30, 'Thrust Test Prop (in)': 30, 'Thrust Test Cells (S)': 14, Role: 'Lift' }),
    C('MT-5015', 'TEST 5015 260KV VTOL Lift Motor', 'TestMotors', '5015-260', 11200, 18, 265, null, { 'KV (rpm/V)': 260, 'Max Thrust (g)': 6200, 'Max Current (A)': 40, 'Max Power (W)': 1750, 'Min Cells (S)': 6, 'Max Cells (S)': 12, 'Min Prop (in)': 16, 'Max Prop (in)': 20, 'Thrust Test Prop (in)': 18, 'Thrust Test Cells (S)': 12, Role: 'Lift' }),
    C('MT-4120', 'TEST 4120 300KV Cruise Motor', 'TestMotors', '4120-300', 9800, 18, 240, null, { 'KV (rpm/V)': 300, 'Max Thrust (g)': 5800, 'Max Current (A)': 48, 'Max Power (W)': 2100, 'Min Cells (S)': 6, 'Max Cells (S)': 12, 'Min Prop (in)': 14, 'Max Prop (in)': 17, 'Thrust Test Prop (in)': 16, 'Thrust Test Cells (S)': 12, Role: 'Cruise' }),
    C('MT-6215-OLD', 'TEST 6215 170KV Motor (old batch)', 'TestMotors', '6215-170', 9900, 18, 400, 'Discontinued', { 'KV (rpm/V)': 170, 'Max Thrust (g)': 7000, 'Max Current (A)': 35, 'Min Cells (S)': 12, 'Max Cells (S)': 12, 'Min Prop (in)': 22, 'Max Prop (in)': 24, 'Thrust Test Prop (in)': 24, 'Thrust Test Cells (S)': 12 }),
    C('MT-NODATA', 'TEST 6010 Motor (no thrust data)', 'OtherCo', '6010', 6100, 18, 260, null, { 'KV (rpm/V)': 230, 'Min Cells (S)': 6, 'Max Cells (S)': 12 }),
    C('MT-3520', 'TEST 3520 520KV Pusher Motor', 'TestMotors', '3520-520', 4800, 18, 175, null, { 'KV (rpm/V)': 520, 'Max Thrust (g)': 3300, 'Max Current (A)': 45, 'Max Power (W)': 1000, 'Min Cells (S)': 4, 'Max Cells (S)': 6, 'Min Prop (in)': 12, 'Max Prop (in)': 15, 'Thrust Test Prop (in)': 14, 'Thrust Test Cells (S)': 6, Role: 'Cruise' }),
  ],
  ESCs: [
    C('ESC-30', 'TEST 30A ESC', 'TestPower', 'E30', 1100, 18, 28, null, { 'Continuous Current (A)': 30, 'Burst Current (A)': 40, 'Min Cells (S)': 2, 'Max Cells (S)': 4, 'Motor Channels': 1, Firmware: 'BLHeli_32', Protocol: 'DShot600 / PWM' }),
    C('ESC-4IN1-55', 'TEST 55A 4-in-1 ESC', 'TestPower', 'E4-55', 6800, 18, 24, null, { 'Continuous Current (A)': 55, 'Burst Current (A)': 65, 'Min Cells (S)': 3, 'Max Cells (S)': 6, 'Motor Channels': 4, Firmware: 'AM32', Protocol: 'DShot600 / PWM' }),
    C('ESC-50-6S', 'TEST 50A 6S ESC', 'TestPower', 'E50', 2300, 18, 45, null, { 'Continuous Current (A)': 50, 'Burst Current (A)': 65, 'Min Cells (S)': 3, 'Max Cells (S)': 6, 'Motor Channels': 1, Firmware: 'BLHeli_32', Protocol: 'DShot / PWM' }),
    C('ESC-60-12S', 'TEST 60A 12S FOC ESC', 'TestPower', 'F60-12', 6900, 18, 92, null, { 'Continuous Current (A)': 60, 'Burst Current (A)': 80, 'Min Cells (S)': 6, 'Max Cells (S)': 12, 'Motor Channels': 1, Firmware: 'FOC', Protocol: 'PWM / DroneCAN' }),
    C('ESC-40-12S', 'TEST 40A 12S ESC', 'TestPower', 'E40-12', 4100, 18, 70, null, { 'Continuous Current (A)': 40, 'Burst Current (A)': 55, 'Min Cells (S)': 6, 'Max Cells (S)': 12, 'Motor Channels': 1, Firmware: 'FOC', Protocol: 'PWM' }),
    C('ESC-100-14S', 'TEST 100A 14S ESC', 'TestPower', 'E100-14', 11800, 18, 160, null, { 'Continuous Current (A)': 100, 'Burst Current (A)': 130, 'Min Cells (S)': 12, 'Max Cells (S)': 14, 'Motor Channels': 1, Firmware: 'FOC', Protocol: 'PWM' }),
  ],
  Propellers: [
    C('PR-1045', 'TEST 10x4.5 Prop Pair', 'TestProps', '1045', 280, 18, 13, null, { 'Diameter (in)': 10, 'Pitch (in)': 4.5, Blades: 2, Material: 'Nylon', Role: 'Lift' }, { 'Units per Pack': 2 }),
    C('PR-1550', 'TEST 15x5 Carbon Prop Pair', 'TestProps', '1550', 2400, 18, 22, null, { 'Diameter (in)': 15, 'Pitch (in)': 5, Blades: 2, Material: 'Carbon fibre', Role: 'Lift' }, { 'Units per Pack': 2 }),
    C('PR-1855', 'TEST 18x5.5 Carbon Prop Pair', 'TestProps', '1855', 3300, 18, 32, null, { 'Diameter (in)': 18, 'Pitch (in)': 5.5, Blades: 2, Material: 'Carbon fibre', Role: 'Lift' }, { 'Units per Pack': 2 }),
    C('PR-2272', 'TEST 22x7.2 Folding Carbon Prop Pair', 'TestProps', '2272F', 6200, 18, 58, null, { 'Diameter (in)': 22, 'Pitch (in)': 7.2, Blades: 2, Material: 'Carbon fibre', Folding: 'Yes', Role: 'Lift' }, { 'Units per Pack': 2 }),
    C('PR-2480', 'TEST 24x8 Folding Carbon Prop Pair', 'TestProps', '2480F', 7400, 18, 66, null, { 'Diameter (in)': 24, 'Pitch (in)': 8, Blades: 2, Material: 'Carbon fibre', Folding: 'Yes', 'Motor Compatibility': '6215', Role: 'Lift' }, { 'Units per Pack': 2 }),
    C('PR-2892', 'TEST 28x9.2 Folding Carbon Prop Pair', 'TestProps', '2892F', 11200, 18, 98, null, { 'Diameter (in)': 28, 'Pitch (in)': 9.2, Blades: 2, Material: 'Carbon fibre', Folding: 'Yes', Role: 'Lift' }, { 'Units per Pack': 2 }),
    C('PR-3010', 'TEST 30x10 Carbon Prop Pair', 'TestProps', '3010', 14800, 18, 120, null, { 'Diameter (in)': 30, 'Pitch (in)': 10, Blades: 2, Material: 'Carbon fibre', Role: 'Lift' }, { 'Units per Pack': 2 }),
    C('PR-1410', 'TEST 14x10 Pusher Prop', 'TestProps', '1410P', 900, 18, 38, null, { 'Diameter (in)': 14, 'Pitch (in)': 10, Blades: 2, Material: 'Glass-nylon', Role: 'Cruise' }),
    C('PR-1612', 'TEST 16x12 Engine Prop', 'TestProps', '1612E', 1500, 18, 60, null, { 'Diameter (in)': 16, 'Pitch (in)': 12, Blades: 2, Material: 'Wood', Role: 'Cruise' }),
  ],
  Batteries: [
    C('BT-4S5200', 'TEST 4S 5200 mAh LiPo', 'TestCells', '4S5200', 4200, 18, 520, null, { Chemistry: 'LiPo', 'Cells (S)': 4, 'Capacity (mAh)': 5200, 'C-Rating (continuous)': 50, Connector: 'XT60' }),
    C('BT-6S10000', 'TEST 6S 10000 mAh LiPo', 'TestCells', '6S10000', 11500, 18, 1320, null, { Chemistry: 'LiPo', 'Cells (S)': 6, 'Capacity (mAh)': 10000, 'C-Rating (continuous)': 25, Connector: 'XT90' }),
    C('BT-6S16000LI', 'TEST 6S 16000 mAh Li-ion', 'TestCells', '6S16000LI', 13900, 18, 1600, null, { Chemistry: 'Li-ion', 'Cells (S)': 6, 'Capacity (mAh)': 16000, 'C-Rating (continuous)': 4, 'Max Discharge (A)': 60, Connector: 'XT90' }),
    C('BT-6S22000', 'TEST 6S 22000 mAh LiPo', 'TestCells', '6S22000', 21500, 18, 2650, null, { Chemistry: 'LiPo', 'Cells (S)': 6, 'Capacity (mAh)': 22000, 'C-Rating (continuous)': 25, Connector: 'AS150' }),
    C('BT-12S22000', 'TEST 12S 22000 mAh LiPo', 'TestCells', '12S22000', 44000, 18, 5250, null, { Chemistry: 'LiPo', 'Cells (S)': 12, 'Capacity (mAh)': 22000, 'C-Rating (continuous)': 25, Connector: 'AS150' }),
    C('BT-12S30000SS', 'TEST 12S 30000 mAh Semi-solid', 'TestCells', '12S30000SS', 78000, 18, 5350, null, { Chemistry: 'Semi-solid', 'Cells (S)': 12, 'Capacity (mAh)': 30000, 'C-Rating (continuous)': 10, Connector: 'AS150' }),
    C('BT-12S42000SS', 'TEST 12S 42000 mAh Semi-solid', 'TestCells', '12S42000SS', 112000, 18, 7300, 'On Order', { Chemistry: 'Semi-solid', 'Cells (S)': 12, 'Capacity (mAh)': 42000, 'C-Rating (continuous)': 10, Connector: 'AS150' }),
    C('BT-12S16000SS', 'TEST 12S 16000 mAh Semi-solid', 'TestCells', '12S16000SS', 46000, 18, 2900, 'Limited', { Chemistry: 'Semi-solid', 'Cells (S)': 12, 'Capacity (mAh)': 16000, 'C-Rating (continuous)': 10, Connector: 'AS150' }),
  ],
  'Flight Controllers': [
    C('FC-H7', 'TEST H7 Flight Controller (triple IMU)', 'TestAvionics', 'H7-PRO', 32000, 18, 95, null, { MCU: 'STM32H743', 'Supported Firmware': 'ArduPilot, PX4', IMU: 'ICM-42688 ×3', 'IMU Count': 3, UARTs: 7, 'CAN Ports': 2, 'PWM Outputs': 14, 'Power Module Inputs': 2, 'GPS Compatibility': 'UART, DroneCAN' }),
    C('FC-F7', 'TEST F7 Flight Controller', 'TestAvionics', 'F7-MINI', 9500, 18, 30, null, { MCU: 'STM32F765', 'Supported Firmware': 'ArduPilot, PX4, INAV', 'IMU Count': 2, UARTs: 6, 'CAN Ports': 1, 'PWM Outputs': 8, 'Power Module Inputs': 1, 'GPS Compatibility': 'UART, CAN' }),
    C('FC-F4BF', 'TEST F4 Betaflight FC', 'OtherCo', 'F4-BF', 2900, 18, 8, null, { MCU: 'STM32F405', 'Supported Firmware': 'Betaflight', 'IMU Count': 1, UARTs: 5, 'CAN Ports': 0, 'PWM Outputs': 8 }),
  ],
  'GPS Modules': [
    C('GPS-M10', 'TEST M10 GNSS + Compass (UART)', 'TestAvionics', 'M10-C', 3600, 18, 32, null, { Constellations: 'GPS, GLONASS, Galileo, BeiDou', 'Update Rate (Hz)': 10, Interface: 'UART', 'Integrated Compass': 'Yes', 'Accuracy (m)': 1.5 }),
    C('GPS-CAN', 'TEST DroneCAN GNSS', 'TestAvionics', 'CAN-G', 9800, 18, 48, null, { Constellations: 'GPS, Galileo, BeiDou', 'Update Rate (Hz)': 10, Interface: 'DroneCAN', 'Integrated Compass': 'Yes' }),
  ],
  'RTK Modules': [
    C('RTK-ROVER', 'TEST RTK Rover (UART/CAN)', 'TestAvionics', 'RTK-R1', 28500, 18, 62, null, { Type: 'Rover', 'Accuracy (cm)': 1, 'Update Rate (Hz)': 10, Interface: 'UART, DroneCAN', Constellations: 'GPS, Galileo, BeiDou, GLONASS' }),
  ],
  'Power Distribution Boards': [
    C('PDB-200', 'TEST 200A 14S PDB', 'TestPower', 'PDB200', 4500, 18, 85, null, { 'Max Current (A)': 200, 'Min Cells (S)': 6, 'Max Cells (S)': 14, 'Output Ports': 8 }),
    C('PDB-120-6S', 'TEST 120A 6S PDB', 'TestPower', 'PDB120', 1800, 18, 30, null, { 'Max Current (A)': 120, 'Min Cells (S)': 3, 'Max Cells (S)': 6, 'Output Ports': 6 }),
    C('PDB-400', 'TEST 400A 14S Heavy PDB', 'TestPower', 'PDB400', 9800, 18, 160, null, { 'Max Current (A)': 400, 'Min Cells (S)': 6, 'Max Cells (S)': 14, 'Output Ports': 8 }),
  ],
  'Power Modules': [
    C('PM-90', 'TEST 90A Analog Power Module', 'TestPower', 'PM90', 1900, 18, 22, null, { 'Max Current (A)': 90, 'Min Cells (S)': 2, 'Max Cells (S)': 6, 'Output Voltage (V)': 5.3, Interface: 'Analog' }),
    C('PM-200CAN', 'TEST 200A DroneCAN Power Module', 'TestPower', 'PMC200', 7500, 18, 48, null, { 'Max Current (A)': 200, 'Min Cells (S)': 6, 'Max Cells (S)': 14, 'Output Voltage (V)': 5.3, Interface: 'DroneCAN' }),
    C('PM-300', 'TEST 300A Analog Power Module', 'TestPower', 'PM300', 6200, 18, 60, null, { 'Max Current (A)': 300, 'Min Cells (S)': 6, 'Max Cells (S)': 14, 'Output Voltage (V)': 5.3, Interface: 'Analog' }),
  ],
  UBECs: [
    C('UBEC-10A', 'TEST 10A UBEC 5/12V', 'TestPower', 'UB10', 1600, 18, 40, null, { 'Output Current (A)': 10, 'Output Voltage (V)': '5/12', 'Min Cells (S)': 3, 'Max Cells (S)': 14 }),
    C('UBEC-3A', 'TEST 3A UBEC 5V', 'TestPower', 'UB3', 450, 18, 12, null, { 'Output Current (A)': 3, 'Output Voltage (V)': 5, 'Min Cells (S)': 2, 'Max Cells (S)': 6 }),
  ],
  Cameras: [
    C('CAM-4K-G3', 'TEST 4K 3-axis Gimbal Camera', 'TestOptics', '4K-G3', 68000, 18, 520, null, { 'Camera Type': 'RGB', 'Sensor Resolution (MP)': 20, 'Video Resolution': '4K', 'Sensor Size': '1"', 'Optical Zoom (x)': 1, 'Lens Type': 'Wide', 'Focal Length (mm)': '8.8', 'FOV (deg)': 84, Interface: 'UART, Ethernet', 'Power (W)': 9, 'Integrated Gimbal': 'Yes', 'Gimbal Axes': 3 }),
    C('CAM-1080', 'TEST 1080p FPV Camera', 'TestOptics', 'FHD', 4200, 18, 35, null, { 'Camera Type': 'RGB', 'Sensor Resolution (MP)': 2, 'Video Resolution': '1080p', 'FOV (deg)': 120, Interface: 'HDMI', 'Power (W)': 2.5, 'Integrated Gimbal': 'No' }),
    C('CAM-ZOOM30', 'TEST 30x Zoom 4K Gimbal Camera', 'TestOptics', 'Z30', 185000, 18, 880, null, { 'Camera Type': 'Zoom', 'Sensor Resolution (MP)': 8, 'Video Resolution': '4K', 'Optical Zoom (x)': 30, 'Digital Zoom (x)': 6, 'FOV (deg)': 63, Interface: 'Ethernet, UART', 'Power (W)': 14, 'Integrated Gimbal': 'Yes', 'Gimbal Axes': 3 }),
  ],
  'Thermal Cameras': [
    C('TH-DUAL640', 'TEST Dual 640 Thermal + 4K Gimbal', 'TestOptics', 'D640-4K', 245000, 18, 690, null, { 'Thermal Resolution': '640x512', 'NETD (mK)': 40, 'Detection Range (m)': 1200, 'Thermal Lens (mm)': 19, Radiometric: 'Yes', 'Visible Sensor (MP)': 48, 'Visible Video Resolution': '4K', 'FOV (deg)': 32, Interface: 'Ethernet, UART', 'Power (W)': 15, 'Integrated Gimbal': 'Yes', 'Gimbal Axes': 3 }),
    C('TH-256', 'TEST 256 Thermal Core', 'TestOptics', 'T256', 38000, 18, 60, null, { 'Thermal Resolution': '256x192', 'NETD (mK)': 50, 'Detection Range (m)': 300, 'Thermal Lens (mm)': 7, Radiometric: 'No', Interface: 'USB', 'Power (W)': 1.5, 'Integrated Gimbal': 'No' }),
    C('TH-384', 'TEST 384 Thermal Gimbal', 'TestOptics', 'T384G', 115000, 18, 420, null, { 'Thermal Resolution': '384x288', 'NETD (mK)': 45, 'Detection Range (m)': 700, 'Thermal Lens (mm)': 13, Radiometric: 'Yes', Interface: 'Ethernet', 'Power (W)': 8, 'Integrated Gimbal': 'Yes', 'Gimbal Axes': 3 }),
  ],
  'Multispectral Cameras': [
    C('MS-5B', 'TEST 5-band Multispectral', 'TestOptics', 'MS5', 310000, 18, 180, null, { Bands: 5, 'Wavelengths (nm)': '475, 560, 668, 717, 842', 'Sensor Resolution (MP)': 3.2, Interface: 'UART, Ethernet', 'Power (W)': 6 }),
  ],
  LiDAR: [
    C('LD-450', 'TEST 450 m Mapping LiDAR', 'TestSensing', 'L450', 1450000, 18, 1100, null, { 'Range (m)': 450, 'Point Rate (pts/s)': 240000, 'Accuracy (cm)': 3, 'FOV (deg)': 70, Interface: 'Ethernet', 'Power (W)': 25, Use: 'Mapping' }),
    C('LD-OA', 'TEST 40 m Obstacle LiDAR', 'TestSensing', 'OA40', 18500, 18, 55, null, { 'Range (m)': 40, Interface: 'UART', 'Power (W)': 2, Use: 'Obstacle avoidance' }),
  ],
  Gimbals: [
    C('GB-3AX', 'TEST 3-axis Gimbal (1.2 kg)', 'TestOptics', 'G3-1200', 32000, 18, 380, null, { Axes: 3, 'Max Payload (g)': 1200, 'Compatible Cameras': 'Most 1080p/4K box cameras', Interface: 'PWM, UART', 'Power (W)': 6 }),
  ],
  Transmitters: [
    C('TX-7GCS', 'TEST 7" Android GCS Link (15 km)', 'TestLink', 'GCS7', 98000, 18, 1100, null, { 'Screen Size (in)': 7, Channels: 16, Frequency: '2.4 GHz', Protocol: 'SIYI', 'Control Range (km)': 15, 'Operating System': 'Android', 'Telemetry Support': 'Yes', 'Integrated Video Link': 'Yes', 'Video Range (km)': 15, 'Video Type': 'Digital', 'Includes Air Unit': 'Yes' }),
    C('TX-5GCS', 'TEST 5.5" GCS Link (8 km)', 'TestLink', 'GCS55', 52000, 18, 750, null, { 'Screen Size (in)': 5.5, Channels: 16, Frequency: '2.4 GHz', Protocol: 'SIYI', 'Control Range (km)': 8, 'Operating System': 'Android', 'Telemetry Support': 'Yes', 'Integrated Video Link': 'Yes', 'Video Range (km)': 8, 'Video Type': 'Digital', 'Includes Air Unit': 'Yes' }),
    C('TX-ELRS', 'TEST ELRS Radio (2.4 GHz)', 'TestLink', 'ELRS-R', 14500, 18, 520, null, { 'Screen Size (in)': 2.4, Channels: 16, Frequency: '2.4 GHz', Protocol: 'ExpressLRS', 'Control Range (km)': 20, 'Operating System': 'EdgeTX', 'Telemetry Support': 'Yes', 'Integrated Video Link': 'No', 'Includes Air Unit': 'No' }),
  ],
  Receivers: [
    C('RX-ELRS', 'TEST ELRS 2.4 GHz Receiver', 'TestLink', 'ELRS-RX', 1700, 18, 5, null, { Channels: 16, Protocol: 'ExpressLRS', Frequency: '2.4 GHz', 'Range (km)': 20, Telemetry: 'Yes', Output: 'CRSF' }),
    C('RX-FRSKY', 'TEST FrSky ACCST Receiver', 'OtherCo', 'X8R', 2600, 18, 17, null, { Channels: 16, Protocol: 'FrSky ACCST', Frequency: '2.4 GHz', 'Range (km)': 1.5, Telemetry: 'Yes', Output: 'SBUS' }),
  ],
  'Video Transmitters': [
    C('VTX-DIG10', 'TEST Digital HD Video Link (10 km)', 'TestLink', 'HD10', 36000, 18, 95, null, { 'Video Type': 'Digital', System: 'HD link', 'Range (km)': 10, Frequency: '5.8 GHz', 'Output Power (mW)': 1000, 'Video Resolution': '1080p', 'Latency (ms)': 40 }),
    C('VTX-ANA', 'TEST Analog 5.8 GHz VTX', 'TestLink', 'A58', 2500, 18, 10, null, { 'Video Type': 'Analog', 'Range (km)': 3, Frequency: '5.8 GHz', 'Output Power (mW)': 800 }),
  ],
  'Telemetry Modules': [
    C('TL-915', 'TEST 915 MHz Telemetry Kit (20 km)', 'TestLink', 'T915', 11500, 18, 30, null, { 'Range (km)': 20, Frequency: '915 MHz', Protocol: 'MAVLink', 'Output Power (mW)': 1000, Interface: 'UART', 'Air + Ground Kit': 'Yes' }),
  ],
  Antennas: [
    C('AN-24P', 'TEST 2.4 GHz 14 dBi Patch Antenna', 'TestLink', 'P24-14', 3400, 18, 210, null, { 'Antenna Type': 'Patch', Use: 'RC', Frequency: '2.4 GHz', 'Gain (dBi)': 14, Polarization: 'Linear', Connector: 'SMA' }),
  ],
  'Landing Gear': [
    C('LG-SKID30', 'TEST Carbon Skid Gear (30 kg)', 'TestFrames', 'SK30', 6800, 18, 480, null, { Type: 'Fixed skid', 'Height (mm)': 260, Retractable: 'No', 'Max Load (kg)': 30 }),
    C('LG-SKID8', 'TEST Skid Gear (8 kg)', 'TestFrames', 'SK8', 1900, 18, 160, null, { Type: 'Fixed skid', 'Height (mm)': 180, Retractable: 'No', 'Max Load (kg)': 8 }),
  ],
  Servos: [
    C('SV-15', 'TEST 15 kg-cm Digital Servo', 'TestMotion', 'S15', 1300, 18, 56, null, { 'Torque (kg-cm)': 15, 'Speed (s/60deg)': 0.12, 'Voltage (V)': '4.8-7.4', Type: 'Digital', 'Size Class': 'Standard' }),
    C('SV-25', 'TEST 25 kg-cm HV Digital Servo', 'TestMotion', 'S25HV', 2600, 18, 72, null, { 'Torque (kg-cm)': 25, 'Speed (s/60deg)': 0.1, 'Voltage (V)': '6-8.4', Type: 'Digital', 'Size Class': 'Standard' }),
    C('SV-3', 'TEST 3 kg-cm Micro Servo', 'TestMotion', 'S3', 450, 18, 14, null, { 'Torque (kg-cm)': 3, 'Speed (s/60deg)': 0.1, 'Voltage (V)': '4.8-6', Type: 'Digital', 'Size Class': 'Micro' }),
  ],
  'Connectors and Wiring': [
    C('WR-XT90', 'TEST XT90 Connector Pair', 'TestPower', 'XT90', 180, 18, 12, null, { Use: 'Battery connector', 'Current Rating (A)': 90, 'Connector Type': 'XT90', 'Qty Basis': 'Per battery', 'Qty Multiplier': 1, 'Auto-include': 'Yes' }),
    C('WR-AS150', 'TEST AS150 Anti-spark Connector Pair', 'TestPower', 'AS150', 650, 18, 30, null, { Use: 'Battery connector', 'Current Rating (A)': 150, 'Connector Type': 'AS150', 'Qty Basis': 'Per battery', 'Qty Multiplier': 1, 'Auto-include': 'Yes' }),
    C('WR-MOT', 'TEST 3.5 mm Bullet Set', 'TestPower', 'B35', 120, 18, 6, null, { Use: 'Motor connector', 'Current Rating (A)': 60, 'Connector Type': '3.5 mm bullet', 'Qty Basis': 'Per motor', 'Qty Multiplier': 1, 'Auto-include': 'Yes' }),
  ],
  'Other Accessories': [
    C('AC-CHG2K', 'TEST Dual 1000 W 14S Charger', 'TestPower', 'C2000', 38000, 18, 2400, null, { 'Accessory Type': 'Charger', 'Max Cells (S)': 14, 'Charge Power (W)': 2000, 'Charge Channels': 2, 'Auto-include': 'No' }),
    C('AC-CHG200', 'TEST 200 W 6S Charger', 'TestPower', 'C200', 4800, 18, 600, null, { 'Accessory Type': 'Charger', 'Max Cells (S)': 6, 'Charge Power (W)': 200, 'Charge Channels': 1 }),
    C('AC-CASE', 'TEST Hard Transport Case', 'TestCases', 'HC-1', 9500, 18, 6000, null, { 'Accessory Type': 'Transport case', 'Auto-include': 'Yes' }),
  ],
  'Fuel Engines': [
    C('EN-35EFI', 'TEST 35 cc EFI Engine + Generator', 'TestEngines', 'E35G', 210000, 28, 2100, null, { 'Max Power (W)': 2600, 'BSFC (g/kWh)': 550, 'Fuel Type': 'Petrol', 'Displacement (cc)': 35, 'Integrated Generator': 'Yes' }),
  ],
  'Thrust Tables': [
    [40, 1600, 5.0, 225], [50, 2400, 7.2, 320], [60, 3250, 10.8, 480], [70, 4250, 15.5, 690], [80, 5250, 21.5, 955], [90, 6250, 28.5, 1265], [100, 7200, 36, 1600],
  ].map((r) => ({ 'Motor ID': 'MT-6215', 'Propeller ID': 'PR-2480', 'Prop Diameter (in)': 24, 'Prop Pitch (in)': 8, 'Cells (S)': 12, 'Throttle (%)': r[0], 'Thrust (g)': r[1], 'Current (A)': r[2], 'Power (W)': r[3], Source: 'Bench test (TEST data)', 'Test Date': today })),
};

function toSheets() {
  return Object.keys(sheets).map((name) => {
    const rows = sheets[name];
    const headers = [];
    rows.forEach((r) => Object.keys(r).forEach((h) => headers.indexOf(h) === -1 && headers.push(h)));
    return { name, headers, rows: rows.map((r) => headers.map((h) => (r[h] === undefined ? '' : r[h]))) };
  });
}

if (typeof module !== 'undefined') module.exports = { sheets, toSheets };
