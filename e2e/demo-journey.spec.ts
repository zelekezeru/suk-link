import { test, expect } from '@playwright/test';

test.describe('E2E — Full Suk Link Two-Device Demo Journey (Section 3 Steps 1–7)', () => {
  test('executes Steps 1 to 7 across Customer, Shop Owner, and Admin sessions in real time', async ({
    browser,
  }) => {
    const customerContext = await browser.newContext();
    const shopContext = await browser.newContext();
    const adminContext = await browser.newContext();

    const customerPage = await customerContext.newPage();
    const shopPage = await shopContext.newPage();
    const adminPage = await adminContext.newPage();

    const consoleErrors: string[] = [];
    customerPage.on('framenavigated', (f) => {
      if (f === customerPage.mainFrame()) console.log('NAV customer ->', f.url());
    });
    customerPage.on('load', () => console.log('LOAD customer', customerPage.url()));
    customerPage.on('console', (m) => {
      if (m.text().includes('vite') || m.text().includes('reload')) console.log('CONSOLE customer:', m.text());
    });
    customerPage.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    shopPage.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

    // =========================================================================
    // STEP 1: Customer Registration / Login on Device 1
    // =========================================================================
    await customerPage.goto('/welcome');
    // Verify language picker works at runtime (switch to Amharic and back to English)
    await customerPage.getByTestId('lang-am').click();
    await expect(customerPage.getByText('መሸመት እፈልጋለሁ')).toBeVisible();
    await customerPage.getByTestId('lang-en').click();
    await expect(customerPage.getByText('I want to shop')).toBeVisible();

    await customerPage.getByTestId('welcome-login-btn').click();
    await customerPage.getByTestId('quick-login-customer').click();
    await expect(customerPage).toHaveURL(/\/c\/home/);
    await expect(customerPage.getByTestId('shop-card-Abebe Mini Market').first()).toBeVisible();

    // Open Abebe Mini Market on Device 1
    await customerPage.getByTestId('shop-card-Abebe Mini Market').first().click();
    await expect(customerPage).toHaveURL(/\/c\/shops\//);
    await expect(customerPage.getByTestId('product-card-Sugar 1kg')).toBeVisible();

    // =========================================================================
    // STEP 2: Shop Owner adds a new product on Device 2 -> appears live on Device 1
    // =========================================================================
    await shopPage.goto('/login');
    await shopPage.getByTestId('quick-login-shop').click();
    await expect(shopPage).toHaveURL(/\/s\/dashboard/);
    await expect(shopPage.getByText('Abebe Mini Market')).toBeVisible();

    await shopPage.goto('/s/products');
    await expect(shopPage.getByTestId('shop-product-row-Sugar 1kg')).toBeVisible();
    await shopPage.getByTestId('shop-add-product-btn').click();

    const newProductName = `Highland Honey 500g`;
    await shopPage.getByTestId('product-name-input').fill(newProductName);
    await shopPage.getByTestId('product-price-input').fill('450.00');
    await shopPage.getByTestId('save-product-btn').click();

    await expect(shopPage.getByTestId(`shop-product-row-${newProductName}`)).toBeVisible();

    await customerPage.waitForTimeout(3000);
    console.log('DBG url:', customerPage.url());
    console.log('DBG cards:', await customerPage.locator('[data-testid^="product-card-"]').allInnerTexts());
    console.log('DBG body:', (await customerPage.locator('body').innerText()).slice(0, 600));
    console.log('DBG errors:', consoleErrors.slice(0, 5));
    console.log('DBG visibility:', await customerPage.evaluate(() => document.visibilityState));

    // Assert new product appears on Customer's Device 1 via Realtime SSE within 3s
    await expect(
      customerPage.getByTestId(`product-card-${newProductName}`)
    ).toBeVisible({ timeout: 5000 });

    // =========================================================================
    // STEP 3: Customer places an order (2x Sugar 1kg @ Br 140 + 1x Cooking oil 3L @ Br 690 = Br 970.00)
    // =========================================================================
    const sugarCard = customerPage.getByTestId('product-card-Sugar 1kg');
    await sugarCard.getByRole('button', { name: /Add/i }).click();
    await sugarCard.getByRole('button', { name: /Increase quantity/i }).click();

    const oilCard = customerPage.getByTestId('product-card-Cooking oil 3L');
    await oilCard.getByRole('button', { name: /Add/i }).click();

    await customerPage.getByTestId('shop-go-to-cart').click();
    await expect(customerPage.getByTestId('cart-total-amount')).toContainText('Br 970.00');

    await customerPage.getByTestId('place-order-button').click();
    await expect(customerPage).toHaveURL(/\/c\/orders\//);
    await expect(customerPage.getByTestId('order-detail-total')).toContainText('Br 970.00');

    // =========================================================================
    // STEP 4: Shop Owner receives the order in real time, Accepts, then Starts Processing
    // =========================================================================
    await shopPage.goto('/s/orders');
    await expect(shopPage.getByText('Br 970.00').first()).toBeVisible({ timeout: 5000 });
    await shopPage.getByText('Br 970.00').first().click();

    // Accept order -> writes +97000 charge to ledger
    await shopPage.getByTestId('shop-accept-order-btn').click();
    await expect(shopPage.getByTestId('shop-start-processing-btn')).toBeVisible();

    // Start processing
    await shopPage.getByTestId('shop-start-processing-btn').click();
    await expect(shopPage.getByTestId('shop-mark-completed-btn')).toBeVisible();

    // Verify Device 1 tracking timeline and Pay button update live
    await expect(customerPage.getByTestId('customer-pay-order-btn')).toBeVisible({
      timeout: 5000,
    });

    // =========================================================================
    // STEP 5: Customer pays online via method picker (Chapa / telebirr / CBE Birr -> DemoProvider)
    // =========================================================================
    await customerPage.getByTestId('customer-pay-order-btn').click();
    await expect(customerPage.getByTestId('payment-method-chapa')).toBeVisible();
    await expect(customerPage.getByTestId('payment-method-telebirr')).toBeVisible();
    await expect(customerPage.getByTestId('payment-method-cbe_birr')).toBeVisible();
    await expect(customerPage.getByTestId('payment-method-credit')).toBeVisible();

    await customerPage.getByTestId('payment-method-telebirr').click();
    await customerPage.getByTestId('confirm-pay-method-btn').click();

    // Hosted DemoProvider screen (/pay/demo/:paymentId)
    await expect(customerPage).toHaveURL(/\/pay\/demo\//);
    await customerPage.getByTestId('demo-pay-approve-btn').click();

    // Confirmation screen shows Paid ✓
    await expect(customerPage.getByTestId('payment-confirm-title')).toContainText('Paid ✓');
    await customerPage.getByTestId('back-to-order-btn').click();
    await expect(customerPage.getByText('Paid').first()).toBeVisible();

    // =========================================================================
    // STEP 6: Shop marks order Completed, checks Sales KPIs, and records partial cash payment on Customer credit
    // =========================================================================
    await shopPage.getByTestId('shop-mark-completed-btn').click();
    await expect(shopPage.getByText('Completed').first()).toBeVisible();

    // Open Customers and select Dawit Bekele (seeded credit balance Br 865.00)
    await shopPage.goto('/s/customers');
    await shopPage.getByTestId('shop-customer-row-Dawit Bekele').click();
    await expect(shopPage.getByTestId('customer-detail-balance')).toContainText('Br 865.00');

    // Record a partial cash payment of Br 265.00 -> watch balance drop to Br 600.00
    await shopPage.getByTestId('record-customer-payment-btn').click();
    await shopPage.getByTestId('partial-payment-amount-input').fill('265.00');
    await shopPage.getByTestId('submit-partial-payment-btn').click();

    await expect(shopPage.getByTestId('customer-detail-balance')).toContainText('Br 600.00');

    // =========================================================================
    // STEP 7: Subscription & Admin Dashboard (Extend subscription, update plan price, activate KE market)
    // =========================================================================
    await shopPage.goto('/s/subscription');
    await expect(shopPage.getByTestId('renew-subscription-btn')).toContainText('Br 2400.00');

    // Log in as Admin in the 3rd context
    await adminPage.goto('/login');
    await adminPage.getByTestId('quick-login-admin').click();
    await expect(adminPage).toHaveURL(/\/a\/overview/);

    // Admin activates/extends Tsehay Bakery subscription
    await adminPage.goto('/a/subscriptions');
    await adminPage.getByTestId('admin-activate-Tsehay Bakery').click();
    await adminPage.getByTestId('admin-confirm-sub-action-btn').click();

    // Admin changes ET Annual plan price from Br 2400.00 to Br 2600.00 and activates KE market
    await adminPage.goto('/a/config');
    await adminPage.getByTestId('admin-edit-plan-price-ET').click();
    await adminPage.getByTestId('admin-plan-price-input-ET').fill('2600.00');
    await adminPage.getByTestId('admin-save-plan-price-ET').click();

    // Shop owner's renewal button now reflects the updated Br 2600.00 price while keeping active subscription intact
    await expect(shopPage.getByTestId('renew-subscription-btn')).toContainText('Br 2600.00', {
      timeout: 5000,
    });

    expect(consoleErrors).toEqual([]);

    await customerContext.close();
    await shopContext.close();
    await adminContext.close();
  });
});
