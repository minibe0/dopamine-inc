# 혼자 하기 전체 플레이 자동 테스트 (전략별) + 스크린샷
import sys, json, asyncio
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/shots'
STRATS = {
    'clean_fc': lambda d: (1, 0, 0, True),
    'extreme': lambda d: (2, 2, 2, False),
    'mid': lambda d: (1, 1, 1, False),
    'factonly': lambda d: (0, 0, 0, False),
}

async def play(browser, name, strat, shots):
    ctx = await browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page = await ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    await page.goto(BASE + '?net=local')
    await page.wait_for_selector('[data-act="solo"]')
    if shots: await page.screenshot(path=f'{OUT}/01_home.png')
    await page.click('[data-act="solo"]')
    await page.wait_for_selector('[data-act="start"]')
    if shots: await page.wait_for_timeout(600); await page.screenshot(path=f'{OUT}/02_howto.png')
    await page.click('[data-act="start"]')
    day = 0
    while True:
        await page.wait_for_selector('#publish, .end-card', timeout=15000)
        if await page.query_selector('.end-card'): break
        day += 1
        h, t, a, fc = strat(day)
        await page.click(f'.chip[data-k="h"][data-v="{h}"]')
        await page.click(f'.chip[data-k="t"][data-v="{t}"]')
        await page.click(f'.chip[data-k="a"][data-v="{a}"]')
        if fc: await page.click('[data-act="fc"]')
        if shots and day == 1: await page.screenshot(path=f'{OUT}/03_edit_{name}.png', full_page=True)
        await page.click('#publish')
        await page.wait_for_selector('#next:not([disabled])', timeout=15000)
        if shots and day in (1, 3): await page.screenshot(path=f'{OUT}/04_result_{name}_d{day}.png', full_page=True)
        await page.click('#next')
        await page.wait_for_selector('#today:not([disabled]), .end-card', timeout=15000)
        if await page.query_selector('.end-card'): break
        if shots and day in (1, 2, 3): await page.screenshot(path=f'{OUT}/05_morning_{name}_d{day}.png', full_page=True)
        await page.click('#today')
        if day > 12: raise RuntimeError('무한 루프')
    await page.wait_for_timeout(900)
    if shots: await page.screenshot(path=f'{OUT}/06_end_{name}.png', full_page=True)
    state = await page.evaluate('() => ({ ending: __dopa.S.game.ending, money: __dopa.S.game.money, day: __dopa.S.game.day, persona: __dopa.S.game.persona })')
    # 도감 화면 확인
    await page.click('.codex-link')
    await page.wait_for_selector('.codex-grid')
    if shots: await page.screenshot(path=f'{OUT}/07_codex_{name}.png', full_page=True)
    await ctx.close()
    return state, errors

async def main():
    import os; os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
        ok = True
        for name, strat in STRATS.items():
            state, errors = await play(browser, name, strat, shots=name in ('clean_fc', 'extreme'))
            # 폰트 CDN 차단(샌드박스) 경고는 무시
            errs = [e for e in errors if 'cdn.jsdelivr' not in e and 'net::ERR' not in e and 'Failed to load resource' not in e]
            print(name, json.dumps(state, ensure_ascii=False), 'errors:', errs)
            ok = ok and not errs
        await browser.close()
        print('ALL OK' if ok else 'ERRORS FOUND')

asyncio.run(main())
