const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://service.plazafestival-gmsb.co.id/admin/login');
  await page.getByRole('textbox', { name: 'E-mail' }).click();
  await page.getByRole('textbox', { name: 'E-mail' }).click();
  await page.getByRole('textbox', { name: 'E-mail' }).fill('admin@admin.com');
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('@Lgarin211aa');
  await page.getByRole('button', { name: 'Login' }).click();
  // wait 4 secon
  var i = 1;
  while (i < 5) {
    await page.goto('https://service.plazafestival-gmsb.co.id/admin');
    await page.getByRole('link', { name: 'Analisis Lengkap' }).click();
    await page.locator('input[name="date_start"]').fill('2026-11-03');
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page.getByRole('link', { name: ' Edit' }).first().click();
    await page.locator('input[name="timesuccess"]').click();
    await page.getByRole('cell', { name: '4' }).first().click();
    await page.locator('.panel-body > div:nth-child(5)').click();
    await page.locator('input[name="timeexpaired"]').click();
    await page.getByRole('cell', { name: '4' }).first().click();
    await page.locator('div').filter({ hasText: 'Edit Transaction' }).nth(2).click();
    await page.locator('input[name="date_start"]').click();
    await page.getByRole('cell', { name: '4' }).first().click();
    await page.locator('div:nth-child(9)').click();
    await page.locator('input[name="created_at"]').click();
    await page.getByRole('cell', { name: '4' }).first().click();
    await page.locator('div').filter({ hasText: 'Edit Transaction' }).nth(2).click();
    i++;
  }
  await page.getByRole('button', { name: 'Save' }).click();
  await page.close();

  // ---------------------
  await context.close();
  await browser.close();
})();