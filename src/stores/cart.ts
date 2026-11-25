import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { computeCartTotals } from '../lib/money';

export interface CartItem {
  product_id: string;
  name: string;
  unit: string;
  unit_price_minor: number;
  image_url: string | null;
  quantity: number;
}

export interface ShopCart {
  shop_id: string;
  shop_name: string;
  currency_code: string;
  items: CartItem[];
  fulfilment: 'pickup' | 'delivery';
  delivery_address: string;
  note: string;
}

interface CartStoreState {
  cartsByShop: Record<string, ShopCart>;
  addItem: (
    shop: { id: string; name: string; currency_code: string },
    product: {
      id: string;
      name: string;
      unit: string;
      price_minor: number;
      image_url: string | null;
    },
    qty?: number
  ) => void;
  setQuantity: (shopId: string, productId: string, quantity: number) => void;
  increment: (shopId: string, productId: string) => void;
  decrement: (shopId: string, productId: string) => void;
  removeItem: (shopId: string, productId: string) => void;
  setFulfilment: (shopId: string, fulfilment: 'pickup' | 'delivery') => void;
  setDeliveryAddress: (shopId: string, address: string) => void;
  setNote: (shopId: string, note: string) => void;
  updatePricesFromServer: (
    shopId: string,
    updatedLines: { product_id: string; unit_price_minor: number }[]
  ) => void;
  clearShopCart: (shopId: string) => void;
  clearAllCarts: () => void;
  getShopTotals: (shopId: string) => {
    itemCount: number;
    subtotal_minor: number;
    delivery_fee_minor: number;
    total_minor: number;
  };
  getTotalItemCount: () => number;
}

export const useCartStore = create<CartStoreState>()(
  persist(
    (set, get) => ({
      cartsByShop: {},

      addItem: (shop, product, qty = 1) => {
        set((state) => {
          const existingCart: ShopCart = state.cartsByShop[shop.id] || {
            shop_id: shop.id,
            shop_name: shop.name,
            currency_code: shop.currency_code || 'ETB',
            items: [],
            fulfilment: 'pickup',
            delivery_address: '',
            note: '',
          };

          const existingIdx = existingCart.items.findIndex((i) => i.product_id === product.id);
          let nextItems: CartItem[];
          if (existingIdx >= 0) {
            nextItems = existingCart.items.map((item, idx) =>
              idx === existingIdx
                ? { ...item, quantity: Math.min(999, item.quantity + qty) }
                : item
            );
          } else {
            nextItems = [
              ...existingCart.items,
              {
                product_id: product.id,
                name: product.name,
                unit: product.unit,
                unit_price_minor: product.price_minor,
                image_url: product.image_url,
                quantity: Math.min(999, Math.max(1, qty)),
              },
            ];
          }

          return {
            cartsByShop: {
              ...state.cartsByShop,
              [shop.id]: {
                ...existingCart,
                shop_name: shop.name,
                items: nextItems,
              },
            },
          };
        });
      },

      setQuantity: (shopId, productId, quantity) => {
        set((state) => {
          const cart = state.cartsByShop[shopId];
          if (!cart) return state;
          if (quantity <= 0) {
            const nextItems = cart.items.filter((i) => i.product_id !== productId);
            const nextCarts = { ...state.cartsByShop };
            if (nextItems.length === 0) {
              delete nextCarts[shopId];
            } else {
              nextCarts[shopId] = { ...cart, items: nextItems };
            }
            return { cartsByShop: nextCarts };
          }
          return {
            cartsByShop: {
              ...state.cartsByShop,
              [shopId]: {
                ...cart,
                items: cart.items.map((i) =>
                  i.product_id === productId
                    ? { ...i, quantity: Math.min(999, quantity) }
                    : i
                ),
              },
            },
          };
        });
      },

      increment: (shopId, productId) => {
        const cart = get().cartsByShop[shopId];
        const item = cart?.items.find((i) => i.product_id === productId);
        if (item) {
          get().setQuantity(shopId, productId, item.quantity + 1);
        }
      },

      decrement: (shopId, productId) => {
        const cart = get().cartsByShop[shopId];
        const item = cart?.items.find((i) => i.product_id === productId);
        if (item) {
          get().setQuantity(shopId, productId, item.quantity - 1);
        }
      },

      removeItem: (shopId, productId) => {
        get().setQuantity(shopId, productId, 0);
      },

      setFulfilment: (shopId, fulfilment) => {
        set((state) => {
          const cart = state.cartsByShop[shopId];
          if (!cart) return state;
          return {
            cartsByShop: {
              ...state.cartsByShop,
              [shopId]: { ...cart, fulfilment },
            },
          };
        });
      },

      setDeliveryAddress: (shopId, delivery_address) => {
        set((state) => {
          const cart = state.cartsByShop[shopId];
          if (!cart) return state;
          return {
            cartsByShop: {
              ...state.cartsByShop,
              [shopId]: { ...cart, delivery_address },
            },
          };
        });
      },

      setNote: (shopId, note) => {
        set((state) => {
          const cart = state.cartsByShop[shopId];
          if (!cart) return state;
          return {
            cartsByShop: {
              ...state.cartsByShop,
              [shopId]: { ...cart, note },
            },
          };
        });
      },

      updatePricesFromServer: (shopId, updatedLines) => {
        set((state) => {
          const cart = state.cartsByShop[shopId];
          if (!cart) return state;
          const priceMap = new Map(updatedLines.map((l) => [l.product_id, l.unit_price_minor]));
          return {
            cartsByShop: {
              ...state.cartsByShop,
              [shopId]: {
                ...cart,
                items: cart.items.map((item) =>
                  priceMap.has(item.product_id)
                    ? { ...item, unit_price_minor: priceMap.get(item.product_id)! }
                    : item
                ),
              },
            },
          };
        });
      },

      clearShopCart: (shopId) => {
        set((state) => {
          const next = { ...state.cartsByShop };
          delete next[shopId];
          return { cartsByShop: next };
        });
      },

      clearAllCarts: () => {
        set({ cartsByShop: {} });
      },

      getShopTotals: (shopId) => {
        const cart = get().cartsByShop[shopId];
        if (!cart || cart.items.length === 0) {
          return {
            itemCount: 0,
            subtotal_minor: 0,
            delivery_fee_minor: 0,
            total_minor: 0,
          };
        }
        const itemCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);
        const computed = computeCartTotals(
          cart.items.map((i) => ({
            unit_price_minor: i.unit_price_minor,
            quantity: i.quantity,
          })),
          0
        );
        return {
          itemCount,
          subtotal_minor: computed.subtotal_minor,
          delivery_fee_minor: computed.delivery_fee_minor,
          total_minor: computed.total_minor,
        };
      },

      getTotalItemCount: () => {
        return Object.values(get().cartsByShop).reduce(
          (acc, cart) => acc + cart.items.reduce((s, i) => s + i.quantity, 0),
          0
        );
      },
    }),
    {
      name: 'suklink_carts_v1',
    }
  )
);
