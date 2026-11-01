"""End-to-end browser test with a simulated Google Apps Script backend.
Run from the repo root:  python3 -m http.server 8765 &  then  python3 tools/test-browser.py
Screenshots go to ./tools/screens/ (git-ignored)."""
import os, sys, json, hashlib, urllib.parse
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TK_URL', 'http://localhost:8765/index.html')
ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(os.path.dirname(__file__), 'screens'); os.makedirs(OUT, exist_ok=True)
API = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec'
KEY = 'correct-horse-battery'
errors, fails = [], []
def ok(c, m):
    print(('  ✓ ' if c else '  ✗ ') + m)
    if not c: fails.append(m)

# ---------------- simulated Google Sheet + Apps Script
SHEET = {'sheets': json.load(open(os.path.join(ROOT, 'samples/test-catalogue.json')))['sheets'], 'projects': {}, 'bom': {}}
HITS = {'version': 0, 'catalogue': 0, 'post': 0}
def version():
    return hashlib.md5(json.dumps(SHEET['sheets'], sort_keys=True).encode()).hexdigest()[:16]
def handle(route, request):
    u = urllib.parse.urlparse(request.url); q = urllib.parse.parse_qs(u.query)
    body = {}
    if request.method == 'GET':
        a = q.get('action', ['catalogue'])[0]; HITS[a] = HITS.get(a, 0) + 1
        if a == 'version':
            counts = {s['name']: len(s['rows']) for s in SHEET['sheets']}
            body = {'ok': True, 'version': version(), 'counts': counts, 'total': sum(counts.values()), 'spreadsheet': 'Tinkerer Component Master'}
        else:
            body = {'ok': True, 'version': version(), 'spreadsheet': 'Tinkerer Component Master', 'sheets': SHEET['sheets']}
    else:
        HITS['post'] += 1
        b = json.loads(request.post_data or '{}')
        if b.get('key') != KEY: body = {'ok': False, 'error': 'Invalid admin key'}
        elif b['action'] == 'verifyKey': body = {'ok': True}
        elif b['action'] == 'projectsList': body = {'ok': True, 'projects': list(SHEET['projects'].values())}
        elif b['action'] == 'projectSave':
            SHEET['projects'][b['project']['id']] = b['project']
            if 'bom' in b and b['bom'] is not None: SHEET['bom'][b['project']['id']] = b['bom']
            body = {'ok': True}
        elif b['action'] == 'projectDelete':
            SHEET['projects'].pop(b['id'], None); SHEET['bom'].pop(b['id'], None); body = {'ok': True}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(body))

SETTINGS = json.dumps({'source': 'appsScript', 'appsScriptUrl': API, 'sheetUrl': 'https://docs.google.com/spreadsheets/d/TEST/edit', 'autoSyncSec': 60})
def new_page(browser, **kw):
    ctx = browser.new_context(accept_downloads=True, **kw)
    ctx.route('https://script.google.com/**', handle)
    ctx.add_init_script(f"if(!localStorage.getItem('tk2.settings')) localStorage.setItem('tk2.settings', {json.dumps(SETTINGS)});")
    pg = ctx.new_page()
    pg.on('console', lambda m: m.type == 'error' and 'ERR_TUNNEL' not in m.text and 'fonts.g' not in m.text and errors.append(m.text))
    pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    return ctx, pg

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx, pg = new_page(b, viewport={'width': 1440, 'height': 900})
    pg.goto(BASE); pg.wait_for_selector('.view'); pg.wait_for_timeout(900)
    ok(HITS['version'] >= 1 and HITS['catalogue'] == 0, f"start-up only checks the sheet fingerprint (version calls {HITS['version']}, catalogue downloads {HITS['catalogue']})")
    ok('85' in pg.inner_text('.stats'), 'dashboard shows parts count from the sheet without listing them')
    ok(pg.locator('a[href="#/database"]').count() == 0, 'no component list page in the navigation')
    pg.screenshot(path=f'{OUT}/01-dashboard.png', full_page=True)

    # sync key
    pg.goto(BASE + '#/settings'); pg.wait_for_selector('#s_admin')
    pg.fill('#s_admin', KEY); pg.click('[data-act="setAdmin"]'); pg.wait_for_timeout(800)
    ok(pg.locator('text=Sync key verified').count() > 0, 'sync key verified and remembered')
    pg.screenshot(path=f'{OUT}/02-settings.png', full_page=True)

    # configure + generate
    pg.goto(BASE + '#/configure'); pg.wait_for_selector('#reqForm')
    pg.fill('[data-k="projectName"]', 'Acme Surveillance Hexa')
    pg.select_option('[data-k="configuration"]', 'Hexacopter')
    for k, v in [('enduranceMin', '40'), ('rangeKm', '10'), ('altitudeM', '120'), ('cruiseSpeed', '12'), ('payloadKg', '2')]: pg.fill(f'[data-k="{k}"]', v)
    pg.click('details[data-sec="payload"] > summary')
    pg.click('[data-act="payloadType"][data-v="RGB"]'); pg.click('[data-act="payloadType"][data-v="Thermal"]')
    pg.select_option('[data-p="0"][data-k="videoRes"]', '4K'); pg.select_option('[data-p="1"][data-k="thermalRes"]', '640x512')
    pg.click('details[data-sec="fc"] > summary'); pg.select_option('[data-k="firmware"]', 'ArduPilot')
    pg.click('details[data-sec="comms"] > summary'); pg.fill('[data-k="screenMin"]', '7'); pg.select_option('[data-k="videoType"]', 'Digital'); pg.fill('[data-k="videoRangeKm"]', '10')
    pg.click('details[data-sec="commercial"] > summary'); pg.fill('[data-k="budget"]', '300000')
    pg.screenshot(path=f'{OUT}/03-configure.png', full_page=True)
    pg.click('[data-act="generate"]'); pg.wait_for_selector('#rtabBody', timeout=20000); pg.wait_for_timeout(500)
    ok(HITS['catalogue'] == 1, f"components fetched from the sheet when the BOM was generated ({HITS['catalogue']} download)")
    pg.screenshot(path=f'{OUT}/04-report-summary.png', full_page=True)
    pg.click('[data-act="mode"][data-v="lowest"]'); pg.wait_for_timeout(1200)
    ok(HITS['catalogue'] == 1, 'recalculating with an unchanged sheet re-uses the cached data (no second download)')
    pg.click('[data-act="mode"][data-v="balanced"]'); pg.wait_for_timeout(1200)
    pg.click('[data-act="rtab"][data-v="components"]'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/05-components.png', full_page=True)
    frame_name = pg.locator('.slot', has_text='Frame').first.locator('.pn').inner_text()

    # sheet edit → automatic update of the open BOM
    pg.click('[data-act="rtab"][data-v="boq"]'); pg.wait_for_timeout(200)
    for s in SHEET['sheets']:
        if s['name'] == 'Frames':
            iid, ipr = s['headers'].index('Component ID'), s['headers'].index('Price (INR)')
            for r in s['rows']:
                if r[iid] == 'FR-H1600': r[ipr] = 61111
    pg.evaluate("window.dispatchEvent(new Event('focus'))")
    pg.wait_for_selector('text=Your Google Sheet changed', timeout=10000); pg.wait_for_timeout(600)
    ok(HITS['catalogue'] == 2, 'sheet change detected → latest components downloaded automatically')
    ok('61,111' in pg.inner_text('#rtabBody'), f'open BOM updated with the new sheet price ({frame_name})')
    pg.screenshot(path=f'{OUT}/06-bom.png', full_page=True)
    with pg.expect_download() as d1: pg.click('.card [data-act="boqXlsx"] >> nth=0')
    ok(d1.value.suggested_filename.startswith('BOM_'), 'Excel BOM downloaded: ' + d1.value.suggested_filename); d1.value.save_as(f'{OUT}/bom.xlsx')
    with pg.expect_download() as d2: pg.click('[data-act="boqPdf"] >> nth=0')
    ok(d2.value.suggested_filename.endswith('.pdf'), 'PDF BOM downloaded'); d2.value.save_as(f'{OUT}/bom.pdf')

    # save → project + BOM written to the sheet
    pg.click('[data-act="saveProject"] >> nth=0'); pg.wait_for_selector('text=synced to Google Sheets', timeout=8000)
    pid = list(SHEET['projects'].keys())[0] if SHEET['projects'] else None
    ok(pid and len(SHEET['bom'].get(pid, [])) >= 10, f"project saved to _Projects and {len(SHEET['bom'].get(pid, []))} BOM lines to _BOM")

    # second device pulls it automatically
    ctx2, pg2 = new_page(b, viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True)
    pg2.add_init_script(f"localStorage.setItem('tk2.adminKey', '{KEY}')")
    pg2.goto(BASE + '#/projects'); pg2.wait_for_timeout(1500)
    ok(pg2.locator('.lrow', has_text='Acme Surveillance Hexa').count() == 1, 'second device receives the project from Google Sheets automatically')
    pg2.screenshot(path=f'{OUT}/m1-projects.png', full_page=False)
    pg2.click('[data-act="openProject"]'); pg2.wait_for_selector('#rtabBody', timeout=20000); pg2.wait_for_timeout(500)
    ok('Acme' in pg2.inner_text('h1'), 'second device rebuilds the BOM from the sheet')
    pg2.screenshot(path=f'{OUT}/m2-report.png', full_page=False)
    pg2.click('[data-act="rtab"][data-v="boq"]'); pg2.wait_for_timeout(300); pg2.screenshot(path=f'{OUT}/m3-bom.png', full_page=False)
    sw = pg2.evaluate('document.documentElement.scrollWidth'); ok(sw <= 392, f'no horizontal scroll on mobile ({sw}px)')
    pg2.goto(BASE + '#/dashboard'); pg2.wait_for_timeout(600); pg2.screenshot(path=f'{OUT}/m4-dashboard.png', full_page=True)
    # delete on device 2 → disappears on device 1
    pg2.goto(BASE + '#/projects'); pg2.wait_for_timeout(500)
    pg2.click('[data-act="delProject"]'); pg2.click('.modal [data-ok]'); pg2.wait_for_timeout(800)
    ok(not SHEET['projects'], 'deleting on one device removes it from the sheet')
    pg.goto(BASE + '#/projects'); pg.wait_for_timeout(300)
    pg.evaluate("TK.sync.pull()"); pg.wait_for_timeout(800)
    ok(pg.locator('.lrow', has_text='Acme Surveillance Hexa').count() == 0, 'and from the other device on its next sync')
    pg.goto(BASE + '#/dashboard'); pg.wait_for_timeout(500); pg.screenshot(path=f'{OUT}/07-dashboard-after.png', full_page=True)
    b.close()

print(f"\nAPI calls: {HITS}")
print('Console errors:', len(errors))
for e in errors[:15]: print('   ', e[:300])
print(f'{len(fails)} failed')
sys.exit(1 if fails or errors else 0)
