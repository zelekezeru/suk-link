import { test, expect } from '@playwright/test';

test.describe('E2E — Offline Order Queueing & Idempotent Sync (Section 7 & Section 13)', () => {
  test('places an order while offline (shown as Waiting for connection), reconnects, and syncs to the shop exactly once', async ({
    browser,
  }) => {
    const customerContext = await browser.newContext();
    const shopContext = await browser.newContext();

    const customerPage = await customerContext.newPage();
    const shopPage = await shopContext.newPage();

    // 1. Log in as Shop Owner on Device 2
    await shopPage.goto('/login');
    await shopPage.getByTestId('quick-login-shop').click();
    await expect(shopPage).toHaveURL(/\/s\/dashboard/);

    // 2. Log in as Customer on Device 1 and load Abebe Mini Market while online
    await customerPage.goto('/login');
    await customerPage.getByTestId('quick-login-customer').click();
    await expect(customerPage).toHaveURL(/\/c\/home/);

    await customerPage.getByTestId('shop-card-Abebe Mini Market').first().click();
    await expect(customerPage).toHaveURL(/\/c\/shops\//);
    await expect(customerPage.getByTestId('product-card-Teff Injera (5 pcs)')).toBeVisible();

    // 3. Set Customer Context OFFLINE
    await customerContext.setOffline(true);

    // Add 2x Teff Injera (2 * Br 75.00 = Br 150.00) to cart while offline
    const injeraCard = customerPage.getByTestId('product-card-Teff Injera (5 pcs)');
    await injeraCard.getByRole('button', { name: /Add/i }).click();
    await injeraCard.getByRole('button', { name: /Increase quantity/i }).click();

    // Open cart and place order offline
    await customerPage.getByTestId('shop-go-to-cart').click();
    await expect(customerPage.getByTestId('cart-total-amount')).toContainText('Br 150.00');

    await customerPage.getByTestId('place-order-button').click();

    // Verify order is queued with "Waiting for connection" status
    await expect(customerPage).toHaveURL(/\/c\/orders\//);
    await expect(customerPage.getByText(/Waiting for connection/i).first()).toBeVisible();
    await expect(customerPage.getByTestId('sync-status-pill')).toContainText(/1 changes waiting/i);

    // 4. Bring Customer Context back ONLINE
    await customerContext.setOffline(false);
    await customerPage.evaluate(() => window.dispatchEvent(new Event('online')));

    // Wait for outbox to drain and status pill to show Online · Synced
    await expect(customerPage.getByTestId('sync-status-pill')).toContainText(/Online · Synced/i, {
      timeout: 15000,
    });
    await expect(customerPage.getByText('Pending').first()).toBeVisible();

    // 5. Verify the order reached the shop owner on Device 2 exactly once
    await shopPage.goto('/s/orders');
    const matchingOrders = shopPage.locator('text=Br 150.00');
    await expect(matchingOrders.first()).toBeVisible({ timeout: 10000 });

    await customerContext.close();
    await shopContext.close();
  });
});
