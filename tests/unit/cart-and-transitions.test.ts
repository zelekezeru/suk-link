import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '../../src/stores/cart';
import { canTransitionOrderStatus } from '../../src/schemas';

describe('Cart store and Order Status transition rules (Section 4 C, D & Section 13)', () => {
  const shopA = { id: 'shop-a', name: 'Abebe Mini Market', currency_code: 'ETB' };
  const shopB = { id: 'shop-b', name: 'Tsehay Bakery', currency_code: 'ETB' };

  const sugar = {
    id: 'prod-sugar',
    name: 'Sugar 1kg',
    unit: 'kg',
    price_minor: 14000,
    image_url: null,
  };
  const oil = {
    id: 'prod-oil',
    name: 'Cooking oil 3L',
    unit: 'litre',
    price_minor: 69000,
    image_url: null,
  };
  const bread = {
    id: 'prod-bread',
    name: 'Bread loaf',
    unit: 'piece',
    price_minor: 4500,
    image_url: null,
  };

  beforeEach(() => {
    useCartStore.getState().clearAllCarts();
  });

  it('maintains isolated per-shop carts and computes accurate totals', () => {
    const store = useCartStore.getState();

    // Add 2x Sugar + 1x Cooking oil to Shop A = Br 970.00 (97000 minor)
    store.addItem(shopA, sugar, 1);
    store.increment(shopA.id, sugar.id);
    store.addItem(shopA, oil, 1);

    // Add 2x Bread to Shop B = Br 90.00 (9000 minor)
    store.addItem(shopB, bread, 2);

    const totalsA = useCartStore.getState().getShopTotals(shopA.id);
    expect(totalsA.itemCount).toBe(3);
    expect(totalsA.subtotal_minor).toBe(97000);
    expect(totalsA.total_minor).toBe(97000);

    const totalsB = useCartStore.getState().getShopTotals(shopB.id);
    expect(totalsB.itemCount).toBe(2);
    expect(totalsB.total_minor).toBe(9000);

    expect(useCartStore.getState().getTotalItemCount()).toBe(5);

    // Decrease sugar to 1 -> Shop A total becomes 14000 + 69000 = 83000
    useCartStore.getState().decrement(shopA.id, sugar.id);
    expect(useCartStore.getState().getShopTotals(shopA.id).total_minor).toBe(83000);

    // Remove oil -> Shop A total becomes 14000
    useCartStore.getState().removeItem(shopA.id, oil.id);
    expect(useCartStore.getState().getShopTotals(shopA.id).total_minor).toBe(14000);

    // Clear Shop A cart -> Shop B remains intact
    useCartStore.getState().clearShopCart(shopA.id);
    expect(useCartStore.getState().getShopTotals(shopA.id).total_minor).toBe(0);
    expect(useCartStore.getState().getShopTotals(shopB.id).total_minor).toBe(9000);
  });

  it('enforces order status transition table for customer and shop_owner', () => {
    // Customer can only cancel while pending
    expect(canTransitionOrderStatus('pending', 'cancelled', 'customer')).toBe(true);
    expect(canTransitionOrderStatus('pending', 'accepted', 'customer')).toBe(false);
    expect(canTransitionOrderStatus('accepted', 'cancelled', 'customer')).toBe(false);

    // Shop owner transitions: pending -> accepted/rejected, accepted -> processing, processing -> completed
    expect(canTransitionOrderStatus('pending', 'accepted', 'shop_owner')).toBe(true);
    expect(canTransitionOrderStatus('pending', 'rejected', 'shop_owner')).toBe(true);
    expect(canTransitionOrderStatus('pending', 'completed', 'shop_owner')).toBe(false);
    expect(canTransitionOrderStatus('accepted', 'processing', 'shop_owner')).toBe(true);
    expect(canTransitionOrderStatus('processing', 'completed', 'shop_owner')).toBe(true);
    expect(canTransitionOrderStatus('completed', 'pending', 'shop_owner')).toBe(false);
  });
});
