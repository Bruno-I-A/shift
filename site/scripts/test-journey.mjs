import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const routes = ['index', 'solucoes', 'processo', 'segmentos', 'sites', 'cases', 'contato', 'termos', 'privacidade', '404', 'diagnostico'];
const cases = [
  ['vendas', 'followup-manual', '3-5', '12 a 20', 'skip'],
  ['atendimento', 'triagem-manual', '6-10', '24 a 40', 'consent'],
  ['operacao', 'redigitacao', '10+', 'mais de 40', 'error'],
  ['gestao', 'sem-indicadores', 'ate-2', 'até 8', 'no-consent'],
  ['operacao', 'conferencia', 'incerto', 'Ainda não medido', 'skip']
];
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [], posts = [];
    let fail = false;
    page.on('pageerror', err => errors.push(err.message));
    await page.route(/^https?:/, async route => {
      if (route.request().url() !== 'https://crm.shiftsys.com.br/api/leads') return route.abort();
      posts.push(route.request().postDataJSON());
      return route.fulfill({ status: fail ? 503 : 201, headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
    });
    for (const name of routes) {
      await page.goto(new URL('../dist/' + name + '.html', import.meta.url).href);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('h1').count(), 1, name);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ': horizontal overflow at ' + width);
    }
    const click = value => page.locator('.quiz-step.active [data-value="' + value + '"]').click();
    for (const [area, pain, time, hours, mode] of cases) {
      posts.length = 0;
      fail = mode === 'error';
      await click('servicos');
      await click(area === 'vendas' ? 'gestao' : 'vendas');
      await page.locator('#pain-options button').first().click();
      await page.locator('.quiz-step.active [data-q="tempo"]').first().waitFor();
      await page.locator('#quiz-back').click();
      await page.locator('#quiz-back').click();
      await click(area);
      assert.equal(await page.locator('#pain-options .picked').count(), 0);
      await click(pain);
      await click(time);
      for (const value of ['ilhas', 'solta', '2-5', 'agora']) await click(value);
      if (mode === 'skip') await page.locator('#lead-skip').click();
      else {
        if (mode !== 'no-consent') {
          await page.locator('#lead-consent').check();
          await page.locator('#lead-form button[type=submit]').click();
          assert.equal(posts.length, 0);
        }
        await page.locator('#lead-name').fill('Teste');
        await page.locator('#lead-whatsapp').fill('54999990000');
        await page.locator('#lead-form button[type=submit]').click();
      }
      await page.locator('.quiz-step.active #result-title').waitFor();
      assert.ok((await page.locator('#result-hours').textContent()).startsWith(hours));
      assert.equal(await page.locator('#result-recommendations li').count(), 3);
      const painLabel = await page.locator('#result-bottleneck').textContent();
      assert.ok(new URL(await page.locator('#result-wa').getAttribute('href')).searchParams.get('text').includes(painLabel));
      if (mode === 'consent' || fail) {
        await page.waitForFunction(() => /Pedido recebido|Não foi possível/.test(document.querySelector('#contact-status').textContent));
        assert.equal(posts.length, 1);
        assert.equal(posts[0].consentimento.autorizado, true);
        assert.equal(posts[0].respostas.dor, painLabel);
        assert.ok(Object.keys(posts[0].respostas).length <= 12);
        assert.equal((await page.locator('#contact-status').textContent()).startsWith('Pedido recebido'), !fail);
      } else assert.equal(posts.length, 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('#quiz-restart').click();
      assert.equal(await page.locator('#lead-consent').isChecked(), false);
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log('PASS:', routes.length, 'routes, 5 adaptive journeys and CRM consent/error states at', width);
  }
} finally {
  await browser.close();
}
