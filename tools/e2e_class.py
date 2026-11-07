# 학급 모드 자동 테스트: 교사 1 + 학생 N (로컬 모의 서버, 같은 브라우저의 여러 탭)
import sys, json, asyncio, os
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/shots_class'
SCENARIO = sys.argv[3] if len(sys.argv) > 3 else 'mixed'

STRATS = {
    'mixed': [(1, 0, 0, True), (2, 2, 2, False), (2, 1, 2, False), (0, 0, 0, True), (1, 1, 0, False)],
    'collapse': [(2, 1, 2, False)] * 4,
}
IGNORE = ('cdn.jsdelivr', 'net::ERR', 'Failed to load resource')

def watch(page, tag, errors):
    page.on('console', lambda m: errors.append(f'[{tag}] console.{m.type}: {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'[{tag}] pageerror: {e}'))

async def step(page, strat):
    """현재 화면을 보고 한 단계 진행. 끝났으면 True"""
    if await page.query_selector('.end-card'): return True
    if await page.query_selector('[data-act="start"]'):
        await page.click('[data-act="start"]'); return False
    if await page.query_selector('#publish'):
        h, t, a, fc = strat
        await page.click(f'.chip[data-k="h"][data-v="{h}"]')
        await page.click(f'.chip[data-k="t"][data-v="{t}"]')
        await page.click(f'.chip[data-k="a"][data-v="{a}"]')
        if fc: await page.click('[data-act="fc"]')
        await page.click('#publish')
        await page.wait_for_selector('#next:not([disabled]), .end-card', timeout=15000)
        return False
    if await page.query_selector('#next:not([disabled])'):
        await page.click('#next')
        await page.wait_for_selector('#today:not([disabled]), .end-card', timeout=15000)
        return False
    if await page.query_selector('#today:not([disabled])'):
        await page.click('#today'); return False
    await page.wait_for_timeout(150)
    return False

async def main():
    os.makedirs(OUT, exist_ok=True)
    strats = STRATS[SCENARIO]
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        ctx = await browser.new_context()
        host = await ctx.new_page()
        await host.set_viewport_size({'width': 1366, 'height': 900})
        watch(host, 'host', errors)
        await host.goto(BASE + 'host.html?net=local')
        await host.click('[data-act="create"]')
        await host.wait_for_selector('.pin-huge')
        pin = (await host.inner_text('.pin-huge')).strip()
        print('PIN', pin)

        students = []
        for i, s in enumerate(strats):
            pg = await ctx.new_page()
            await pg.set_viewport_size({'width': 390, 'height': 844})
            watch(pg, f's{i}', errors)
            await pg.goto(BASE + f'?net=local&room={pin}')
            students.append(pg)
        for pg in students:
            await pg.wait_for_selector('.lobby-card', timeout=10000)
        await host.wait_for_timeout(500)
        await host.screenshot(path=f'{OUT}/h1_lobby.png')
        await students[0].screenshot(path=f'{OUT}/s_lobby.png')
        nicks = await host.evaluate('() => Object.values(__host.players).map(p => p.nick)')
        print('닉네임', nicks, '중복 없음' if len(set(nicks)) == len(nicks) else '중복!')

        await host.click('[data-act="start"]')
        for pg in students:
            await pg.wait_for_selector('[data-act="start"]', timeout=10000)

        done = [False] * len(students)
        rounds = 0
        reloaded = False
        while not all(done) and rounds < 200:
            rounds += 1
            for i, pg in enumerate(students):
                if not done[i]:
                    done[i] = await step(pg, strats[i])
            # 중간에 새로고침해도 이어지는지 확인 (학생 0, 4번째 루프쯤)
            if rounds == 9 and not reloaded and not done[0]:
                before = await students[0].evaluate('() => __dopa.S.game.history.length')
                await students[0].reload()
                await students[0].wait_for_selector('#publish, #next, #today, .end-card', timeout=10000)
                after = await students[0].evaluate('() => __dopa.S.game.history.length')
                print(f'새로고침 이어하기: {before}일 → {after}일', 'OK' if before == after else 'FAIL')
                reloaded = True
            if rounds == 6:
                await host.screenshot(path=f'{OUT}/h2_live.png')
                await students[0].screenshot(path=f'{OUT}/s_mid.png', full_page=False)
        await host.wait_for_timeout(800)
        await host.screenshot(path=f'{OUT}/h3_live_end.png')
        for i, pg in enumerate(students[:2]):
            await pg.wait_for_timeout(600)
            await pg.screenshot(path=f'{OUT}/s{i}_end.png', full_page=True)
        await host.click('[data-act="tab"]')
        await host.wait_for_timeout(400)
        await host.screenshot(path=f'{OUT}/h4_debrief.png', full_page=True)

        results = []
        for pg in students:
            results.append(await pg.evaluate('() => ({ ending: __dopa.S.game.ending, money: __dopa.S.game.money, days: __dopa.S.game.history.length, nick: __dopa.S.game.nick })'))
        print(json.dumps(results, ensure_ascii=False))
        trust = await host.evaluate('() => __host')
        board = await host.inner_text('.h-heat') if await host.query_selector('.h-heat') else ''
        insights = await host.inner_text('.h-insight')
        print('인사이트:', insights.replace('\n', ' | '))

        # 2회차: 새 판 → 학생들이 대기실로 돌아오는지
        await host.click('[data-act="tab"]')
        await host.click('[data-act="new"]')
        await host.click('[data-x="ok"]')
        for pg in students:
            await pg.wait_for_selector('.lobby-card', timeout=10000)
        await host.click('[data-act="start"]')
        for pg in students:
            await pg.wait_for_selector('[data-act="start"]', timeout=10000)
        print('2회차 시작: OK')
        # 2회차 2일 진행 후 교사가 판 끝내기 → 시간 종료 엔딩
        for _ in range(6):
            for i, pg in enumerate(students):
                await step(pg, (1, 0, 0, True))
        await host.click('[data-act="end"]')
        await host.click('[data-x="ok"]')
        for pg in students:
            await pg.wait_for_selector('.end-card', timeout=10000)
        endings = [await pg.evaluate('() => __dopa.S.game.ending') for pg in students]
        print('판 끝내기 후 엔딩:', endings)
        await students[0].screenshot(path=f'{OUT}/s_timeup.png', full_page=True)

        # 방 닫기 → 학생 첫 화면
        await host.click('[data-act="close"]')
        await host.click('[data-x="ok"]')
        for pg in students:
            await pg.wait_for_selector('[data-act="solo"]', timeout=10000)
        print('방 닫기 → 학생 첫 화면 복귀: OK')
        await browser.close()

    errs = [e for e in errors if not any(x in e for x in IGNORE)]
    print('오류:', errs if errs else '없음')

asyncio.run(main())
