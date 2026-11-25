import { test, expect } from '@playwright/test';

test.describe('E2E — Auth Switch & Cross-Account Data Wipe (Section 4 A & Section 13)', () => {
  test('logs in as shop owner, logs out, logs in as customer on the same context with no stale shop data or console errors', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // 1. Navigate to login and sign in as Shop Owner (Abebe Mini Market)
    await page.goto('/login');
    await page.getByTestId('quick-login-shop').click();

    await expect(page).toHaveURL(/\/s\/dashboard/);
    await expect(page.getByText('Abebe Mini Market')).toBeVisible();

    // 2. Verify role guard: attempting to visit /c/home or /a/overview redirects back to /s/dashboard
    await page.goto('/c/home');
    await expect(page).toHaveURL(/\/s\/dashboard/);

    // 3. Log out (wipes local Dexie DB suklink_<userId>, cache, and carts)
    await page.goto('/s/more');
    await page.getByTestId('logout-button').click();
    await expect(page).toHaveURL(/\/welcome/);

    // 4. Log in as Customer (Selam Tesfaye) on the exact same browser context
    await page.getByTestId('welcome-login-btn').click();
    await page.getByTestId('quick-login-customer').click();

    await expect(page).toHaveURL(/\/c\/home/);
    await expect(page.getByText(/Selam/)).toBeVisible();

    // 5. Attempting to visit shop owner route /s/dashboard redirects to /c/home
    await page.goto('/s/dashboard');
    await expect(page).toHaveURL(/\/c\/home/);

    // Ensure no shop owner dashboard KPIs are rendered
    await expect(page.getByTestId('kpi-orders-today')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});
