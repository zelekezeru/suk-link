# SUK LINK — MVP Build Plan (Implementation Brief for the Coding Agent)

> **How to use this document:** You are the implementing engineer. Build Suk Link exactly as specified here, milestone by milestone (Section 14). After each milestone, run its acceptance checks and do not start the next one until they pass. Every feature must be **functional end-to-end against the real backend**. No mock screens, no hard-coded lists, no "TODO later" stubs in the demo path. If something in this document is ambiguous, choose the simplest option that keeps the Section 3 demo flow working, and write the decision down in `docs/DECISIONS.md`.

---

## 0. Product understanding (read first)

**What Suk Link is:** a two-sided ordering and shop-management app for neighborhood shops ("suk" means shop). Today, customers phone the shop or walk in. Shop owners track orders, sales and customer credit (goods taken now, paid later) in paper notebooks.

**The three messages the demo must prove:**
1. **Customers:** ordering from nearby shops is easy. Browse, add to cart, order, track, pay, with no phone call.
2. **Shop owners:** one simple digital system for products, orders, customers, sales, payments and **credit**.
3. **The business:** shops pay an **annual subscription**, which gives recurring revenue. Admins can see and control subscription status.

**Guiding rule:** fewer screens that work perfectly beat many screens that half-work. Correct money handling and a reliable flow between the customer and the shop owner are the product.

**Confirmed product decisions. These are all data-driven: never hard-code them.**
- **Market is configurable at runtime.** The default market is **Ethiopia (ET)** with currency **ETB (Br)**. Currency, symbol, minor-unit digits, phone country code and format, timezone, default and enabled languages, enabled payment methods and subscription plans all come from the `markets` table and related tables (Section 5.1). Adding a new market (e.g. Kenya, KES) must require **only data**, with no code changes. Money is always stored as integer **minor units** (santim for ETB).
- **Six languages:** English (`en`), Amharic (`am`, አማርኛ), Afaan Oromoo (`om`), Somali (`so`, Soomaali), Tigrinya (`ti`, ትግርኛ) and Kiswahili (`sw`). They switch at runtime. English is the fallback. Each market chooses which languages it enables and its default.
- **Payments:** **Chapa** is the primary gateway. **telebirr** and **CBE Birr** are also offered as selectable methods, alongside **cash** and **pay later (credit)**. Every online method sits behind a common `PaymentProvider` interface (Section 4, Payments). A **Demo provider** must also exist so the demo works without live keys.
- **The subscription is configurable:** plan price, duration, trial length, grace period and reminder schedule live in the `plans` and `app_settings` tables and are editable from the admin dashboard. The annual plan is the default.
- **Credit timing (confirmed):** a customer's charge is recorded on the shop's ledger **when the shop accepts the order** (Section 5).
- **Sign-in identity:** a user can register with a phone number, an email, or both, plus a password. Phone numbers are validated against the market's format. Supabase Auth is keyed on email, so a phone-only user gets a synthetic, non-deliverable email (`<digits>@phone.suklink.invalid`). The login screen accepts either identifier and maps a phone number to that email. Email confirmation is off in the MVP (no SMS provider), so phone numbers are unverified until phone OTP in Phase 2. Phone-only accounts cannot reset a password by email, so an admin triggers the reset through support. Record this in `DECISIONS.md`.

---

## 1. Tech stack (fixed; do not substitute)

| Layer | Choice | Why |
|---|---|---|
| App framework | **Vite + React 18 + TypeScript (strict)** | Builds as a single-page app, which wraps cleanly in Capacitor |
| Routing | `react-router-dom` v6 (data routers) | |
| Styling | **Tailwind CSS v3** + CSS variables design tokens + **Radix UI primitives** (shadcn/ui pattern: copy components into `src/components/ui`) | |
| Icons and motion | `lucide-react`, `framer-motion` | |
| Server state | **TanStack Query v5**, persisted to IndexedDB | |
| Local DB / offline | **Dexie.js** (IndexedDB) + custom sync engine (Section 7) | |
| Client state | **Zustand** (cart, UI, session), persisted | |
| Forms and validation | `react-hook-form` + **zod**. The same zod schemas are shared by client and Edge Functions. | |
| i18n | `i18next` + `react-i18next` + `i18next-icu` (plurals and number formatting), files `src/i18n/{en,am,om,so,ti,sw}.json` | Six locales, see Section 8.1 |
| PWA | `vite-plugin-pwa` (Workbox, `injectManifest` strategy) | Offline shell, image cache, install prompt |
| Native shells | **Capacitor 6** (Android + iOS) with plugins: `@capacitor/app`, `network`, `haptics`, `local-notifications`, `push-notifications` (Phase 2 for remote push), `camera`, `preferences`, `splash-screen`, `status-bar` | One codebase for web, Android and iOS |
| Backend | **Supabase**: Postgres 15, Auth, Row Level Security, Storage, Realtime, Edge Functions (Deno), `pg_cron` | Relational ledger, enforced security, realtime across devices |
| Payments | Chapa (primary, test mode) + telebirr + CBE Birr + DemoProvider, all behind a `PaymentProvider` interface in Edge Functions; methods enabled per market and per shop | |
| Testing | **Vitest** (unit), **Playwright** (E2E, two browser contexts), SQL-level RLS tests run with Vitest against local Supabase | |
| Quality | ESLint (typescript-eslint, react-hooks), Prettier, `tsc --noEmit` in CI | |
| Hosting | Web on Vercel or Netlify, backend on Supabase Cloud | |

Run the backend locally with the **Supabase CLI** (`supabase start`). All schema changes go in `supabase/migrations/*.sql`. Never change the schema through the dashboard.

---

## 2. User roles and permissions

| Role | How it is created | Can do |
|---|---|---|
| `customer` | Self-registration ("I'm a customer") | Browse active shops, manage cart, place, track and cancel (while pending) own orders, pay, view own balances per shop, contact support, edit own profile |
| `shop_owner` | Self-registration ("I own a shop"), then shop setup wizard | Manage **own** shop profile and products, see and manage orders **to own shop**, record payments, view own customers' histories and credit, view subscription, contact support |
| `admin` | **Never self-assignable.** Set only by seed script or SQL (`auth.users.raw_app_meta_data.role = 'admin'`) | View all users, shops and subscriptions, activate, extend or suspend subscriptions, handle support tickets |

**Rules:**
- The role is stored in `profiles.role` and mirrored into the JWT via `app_metadata.role` by a Postgres trigger or auth hook. The client reads it only to choose a layout. **All enforcement is in RLS and in RPC functions.**
- The client may request `customer` or `shop_owner` at signup. The trigger rejects anything else.
- An MVP account has one role. The UI switches layout by role: `/c/*` customer, `/s/*` shop, `/a/*` admin. Route guards redirect a user on the wrong path to their own home page.

---

## 3. The demo flow (this is the acceptance test for the whole project)

Two devices or browser sessions: **Device 1 = Customer**, **Device 2 = Shop Owner** (plus an Admin session at the end).

1. **Customer registration.** Open the app, register as a customer (or log in as `customer@demo.suklink.et`), land on the customer home page.
2. **Shop setup.** On Device 2, log in as the shop owner, open "Abebe Mini Market", add 2–3 products with photo, name, price and availability. They appear instantly on Device 1, through realtime updates.
3. **Customer places an order.** Browse the shop, add several products, change quantities, review the total, submit.
4. **Shop owner receives the order.** Device 2 shows a toast, plays a sound, increments the badge, and the order appears at the top of "New". Open the order details, **Accept**, then **Processing**. Device 1's tracking timeline updates live.
5. **Payment.** On Device 1, tap "Pay". The method picker shows **Chapa · telebirr · CBE Birr · Cash · Pay later (credit)**. Pay the full amount online (Demo provider in the presentation), or choose **Pay later (credit)**. The confirmation screen shows "Paid" or "On credit", and the order's payment status updates.
6. **Shop records the transaction.** On Device 2, mark the order **Completed**. Show Sales today. Open Customers, select the customer, and show the transaction history with the payment record and outstanding credit balance. Record a partial cash payment and watch the balance drop.
7. **Subscription and admin.** On Device 2, open Subscription: annual plan, status, expiry date, renewal button. In the admin session, see users, shops and subscription statuses, and activate or extend a shop.

**Playwright must automate steps 1–7 with two browser contexts (`e2e/demo-journey.spec.ts`). This test must pass before the project is "done".**

---

## 4. Feature specification

### A. Registration and account management
- **Welcome screen:** logo, one-line value proposition, two large choices: "I want to shop" and "I own a shop", plus "Log in".
- **Language and market first:** the Welcome screen opens with a language picker that shows each language in its own name (English · አማርኛ · Afaan Oromoo · Soomaali · ትግርኛ · Kiswahili). The market is preselected as the default (ET). A market selector appears only when more than one market is active.
- **Register:** full name, phone (input mask and country code from the market, e.g. +251), email, password (min 8, show/hide). Show a password strength hint. Validate with zod. Map server errors to friendly messages.
- **Login and logout:** email or phone plus password. "Remember me" is the default (session persisted). Logout clears the local Dexie DB, the query cache and the cart for that user. This prevents data leaking between accounts on a shared device. **Critical for switching between demo accounts.**
- **Forgot password:** Supabase email reset for accounts that have an email. Phone-only accounts see "Contact support" (see the sign-in identity decision in Section 0).
- **Legal and account deletion:** the register screen requires accepting the Terms and Privacy Policy (versioned, with the acceptance time stored on the profile). Profile has **Delete my account** (required by Apple and Google). Deletion anonymizes the profile but keeps orders and ledger rows, because shops need their records.
- **Profile:** name, phone, avatar (camera or gallery), language (any language enabled for the market: en · am · om · so · ti · sw), theme (system, light or dark), default delivery address or note.
- **Role-based dashboards** as described in Section 2.

### B. Shop profile and product management (shop owner)
- **Shop setup wizard** (first login): name, category (grocery, bakery, pharmacy, electronics, other), phone, address text, optional map pin (lat/lng from the browser geolocation), opening hours (simple from/to time), logo and cover image, "accepts credit" toggle, delivery or pickup options. A new shop gets a free-trial subscription automatically, with the length taken from the market's default plan (`plans.trial_days`).
- **Shop profile edit** with the same fields, plus an **Open/Closed toggle**. Customers can browse a closed shop but cannot order from it.
- **Products:** list with search and an availability filter. Add/edit sheet: image (camera, gallery or URL; client-side compressed to a maximum of 1024px WebP, under 200KB), name, description (optional), price in the market currency (decimal input, stored as minor units), unit (piece, kg, litre, pack), category (free text with suggestions), **available toggle** (a one-tap switch directly in the list). Delete is a **soft delete** with confirmation and a 5-second undo toast.
- Products with `is_available = false` show to customers as "Out of stock" and cannot be added to the cart.

### C. Customer shopping and ordering
- **Home:** greeting, search bar (shops and products), "Your shops" (previously ordered), "Nearby/All shops" cards (cover, logo, name, category, open/closed badge, distance if location was granted).
- **Shop page:** cover header, info, category chips, product grid (2 columns on mobile, 3–4 on wider screens). Each card has image, name, price, unit and a "+" button. After the first tap, the card shows an inline stepper (− qty +).
- **Cart:** one cart **per shop** (a customer can hold carts for several shops). Line items with stepper and remove. The subtotal and total update instantly. Delivery fee is 0 in the MVP but appears as a line so the model supports it. Optional note to the shop. Fulfilment choice: pickup or delivery (address). Large "Place order · Br 1,245.00" button.
- **Order placement:** calls RPC `place_order` (Section 6). The **server recomputes all prices and totals** from the products table. If prices changed or items became unavailable, return a structured error. The client shows a "Prices updated" dialog with the differences and asks for confirmation.
- **Order tracking:** order list (Active / Past tabs). The order detail page shows a status timeline (Pending → Accepted → Processing → Completed, or Rejected/Cancelled with reason), items, totals, payment status and a Pay button when applicable. The page updates live.
- **Cancel:** allowed only while `pending`.

### D. Shop-owner order management
- **Orders board:** tabs New (pending) · Active (accepted + processing) · Completed · Rejected/Cancelled, each with a count badge. Mobile shows a list. Tablet and desktop add an optional kanban view. Sort is newest first.
- **Order detail:** customer name and phone (tap to call), items (qty × unit price = line total), subtotal and total, note, fulfilment, payment status, timeline. The actions shown depend on status:
  - `pending` → **Accept** / **Reject** (reject requires a reason from presets or free text)
  - `accepted` → **Start processing**
  - `processing` → **Mark completed**
  - Any unpaid or partly paid order → **Record payment** (cash or other) / **Put on credit**
- **History:** all orders with date filter and search by customer.
- **Allowed status transitions are enforced in the database** (Section 6). The UI only displays them.

### Supporting features (MVP scope, functional)
1. **Order notifications:** Supabase Realtime subscription on `orders` filtered by `shop_id`. A new order triggers an in-app toast, a short sound (pre-loaded and user-unlockable for browser autoplay rules), haptics on native, a Capacitor **local notification** when the app is in the background, a badge on the Orders tab, and a row in the `notifications` table (bell icon with list and unread count). Remote push (FCM/APNs) is Phase 2. Keep the code path ready.
2. **Order tracking** for customers, as described in C.
3. **Credit management:** per (shop, customer) ledger. Shows outstanding balance, transaction history (charges, payments, adjustments), an optional per-customer credit limit, and "Record payment". The customer sees "My balances" per shop.
4. **Reminders** (`pg_cron` hourly; each market is processed at 08:00 in **its own timezone** from `markets.timezone`, plus a check on app open; reminder day thresholds come from `app_settings.subscription_reminder_days`, default `[30,7,1]`):
   - Shop owner: subscription expires in 30, 7 or 1 days, or has expired.
   - Customer: outstanding balance older than 7 days ("You owe Br X at Abebe Mini Market").
   - Shop owner: a "Customers with balances" summary card on the dashboard.
   - Delivered as `notifications` rows plus an in-app banner.
5. **Customer support:** "Help & Support" screen with FAQ (static, i18n), a **contact form** that creates a `support_tickets` row, plus Call and Telegram/WhatsApp deep links (configurable numbers). Users see their ticket list and status.
6. **Admin dashboard:** KPI cards (users by role, shops, active / trial / expired subscriptions, orders today, GMV today). Tables for Users (search, role, created_at, disable or enable), Shops (owner, status, subscription, expiry), Subscriptions (activate, extend by one plan period, suspend, each with a reason; every action is logged in `audit_log`) and Support tickets (status: open → in_progress → resolved). It also has **configuration screens**:
   - **Markets:** create or edit a market (currency, symbol, minor digits, phone code and regex, timezone, enabled and default languages), activate or deactivate it, set the default.
   - **Payment methods per market:** enable or disable, sort order, display name per language, routing (`via_chapa` | `direct`).
   - **Plans per market:** price, duration, trial days, grace days, active or default.
   - **App settings:** reminder thresholds, support contacts, the credit-reminder age.
   - Every configuration change is written to `audit_log`.

### Payments (Step 5)
- **Methods** (rows in `payment_methods`, per market; each shop picks which ones it accepts in `shop_payment_methods`):

  | Code | Type | Adapter | Notes |
  |---|---|---|---|
  | `chapa` | online | `ChapaProvider` | Primary. Hosted checkout (card, wallets, bank). |
  | `telebirr` | online | `routing = via_chapa` (default): Chapa checkout with telebirr selected · `routing = direct`: `TelebirrProvider` | Shown as its own option in the picker |
  | `cbe_birr` | online | `routing = via_chapa` (default) · `direct`: `CbeBirrProvider` | Shown as its own option in the picker |
  | `cash` | offline | `manual` | The customer chooses "Pay cash on pickup/delivery". The shop records it with `record_payment`. |
  | `credit` | credit | none | "Pay later". Allowed only if the shop accepts credit and the limit is not exceeded. |
  | `demo` | online | `DemoProvider` | Enabled when `PAYMENT_MODE=demo`. **It replaces every online adapter during the presentation**, while the picker still shows the real method names. |

  **Provider interface** (`supabase/functions/_shared/providers/`):
  ```ts
  interface PaymentProvider {
    code: 'chapa' | 'telebirr' | 'cbe_birr' | 'demo';
    initiate(i: { paymentId; amountMinor; currency; customer; returnUrl; callbackUrl; method?: string }): Promise<{ checkoutUrl: string; providerRef: string }>;
    verifyWebhook(req: Request): Promise<{ providerRef: string; status: 'succeeded' | 'failed'; amountMinor: number; currency: string }>;
    verifyTransaction(providerRef: string): Promise<{ status; amountMinor; currency }>;
  }
  ```
  - Before coding, **check the current Chapa API docs** for how to preselect a wallet (telebirr or CBE Birr) at checkout. If Chapa cannot preselect one, open the normal Chapa checkout and let the customer pick there. Record what you did in `DECISIONS.md`.
  - Build `direct` adapters only behind the interface, and enable one only when its credentials are configured. **A method with no usable credentials is shown as unavailable, never faked.**
  - After a webhook, always call `verifyTransaction` and compare the amount and currency with the `payments` row before marking the payment succeeded.
- **Flow, `online`:** the customer taps Pay. The client calls Edge Function `payments-init` with `order_id`. The server creates a `payments` row (`status = pending`, idempotency key) and asks the provider for a checkout URL. On web, the client opens it. On native, it opens with `@capacitor/browser`. The provider calls webhook `payments-webhook` (signature verified, idempotent). The server marks the payment `succeeded`, writes a ledger `payment` entry and recomputes `orders.payment_status`. The client receives a realtime update and shows the confirmation screen (amount, reference, date and time, shop, "Paid ✓").
- **DemoProvider:** a hosted page inside the app (`/pay/demo/:paymentId`) with "Approve" / "Decline" buttons. It calls the same webhook logic through an authenticated server endpoint. Enabled when `PAYMENT_MODE=demo`. **The demo uses this by default for reliability.**
- **Never** mark a payment as paid from the client. **Never** store card or wallet credentials. The app stores only provider references.
- `orders.payment_status`: `unpaid` | `partially_paid` | `paid` | `on_credit` (unpaid but accepted onto the ledger). It is always derived server-side from the ledger, never set directly.

### Subscription (Step 7)
- Plans are **fully configurable per market** in the `plans` table, managed from the admin dashboard. The seeded default is an **Annual** plan in ETB (price is seed data, e.g. Br 2,400). There is no price, duration or trial constant anywhere in code.
- Changing a plan's price affects **new purchases and renewals only**. Each subscription payment stores the amount actually paid. Deactivating a plan hides it from new purchases. Existing subscribers keep it until expiry.
- Status: `trial` (`plans.trial_days`, seeded 30) → `active` → `grace` (`plans.grace_days`, seeded 7, after expiry; everything still works and a banner is shown) → `expired` (the shop is hidden from customers and new orders are blocked; the owner can still log in and renew) | `suspended` (set by admin).
- The shop's Subscription screen shows plan, status pill, start and end dates, days remaining (progress ring), renewal through the same payment flow (`purpose = subscription`) and payment history.
- A successful subscription payment extends `current_period_end` by `plans.duration_days` from max(now, current end).
- Subscription payments use the same method picker (Chapa, telebirr, CBE Birr). An admin can also record an offline payment ("activate with reference"), which is written to `audit_log`.

---

## 5. Data model (Postgres, `supabase/migrations`)

All tables have `id uuid primary key default gen_random_uuid()` unless noted, plus `created_at timestamptz default now()` and `updated_at timestamptz default now()` (maintained by trigger). Tables that sync to the client also get `deleted_at timestamptz null` for soft deletes. **Money columns are `bigint` in minor units of the row's `currency_code` (santim for ETB). Never use float.**

```text
profiles            id (= auth.users.id) · role (enum: customer|shop_owner|admin) · full_name · phone (unique) · email
                    · avatar_url · locale (en|am|om|so|ti|sw) · market_code → markets · is_disabled bool
shops               owner_id → profiles · market_code → markets · name · slug (unique) · category · description · phone · address_text
                    · lat · lng · logo_url · cover_url · opening_time · closing_time · is_open bool
                    · accepts_credit bool · offers_delivery bool · offers_pickup bool
                    (MVP: one shop per owner → unique(owner_id))
products            shop_id → shops · name · description · price_minor bigint check ≥ 0 · unit · category
                    · image_url · is_available bool · sort_order int · deleted_at
orders              id uuid (CLIENT-GENERATED, used as idempotency key) · order_number (per-shop sequence, e.g. SL-0042)
                    · shop_id · customer_id · status (enum: pending|accepted|processing|completed|rejected|cancelled)
                    · payment_status (enum: unpaid|partially_paid|paid|on_credit) · fulfilment (pickup|delivery)
                    · currency_code (snapshot of the shop's market currency) · preferred_payment_method
                    · delivery_address · note · subtotal_minor · delivery_fee_minor · total_minor
                    · rejection_reason · placed_at · accepted_at · completed_at · client_created_at
order_items         order_id · product_id · product_name_snapshot · unit_snapshot · unit_price_minor (snapshot)
                    · quantity int check (1..999) · line_total_minor
order_events        order_id · from_status · to_status · actor_id · reason · created_at    (append-only timeline)
payments            id · purpose (order|balance|subscription) · order_id null · subscription_id null · shop_id · shop_customer_id null · payer_id
                    · amount_minor · currency_code · method_code → payment_methods (chapa|telebirr|cbe_birr|cash|demo|other)
                    · provider (chapa|telebirr|cbe_birr|demo|manual) · provider_ref · unique(provider, provider_ref)
                    · status (pending|succeeded|failed|refunded) · idempotency_key unique
                    · recorded_by · paid_at
shop_customers      shop_id · customer_id null (null = walk-in customer without an app account) · display_name · phone
                    · credit_limit_minor null · notes · first_order_at · last_order_at
                    (unique(shop_id, customer_id) where customer_id is not null; created on first order or by the shop owner, Section 17.1)
ledger_entries      shop_id · shop_customer_id · order_id null · payment_id null · type (charge|payment|adjustment)
                    · amount_minor (charge = +, payment = −) · description · created_by · created_at
                    (APPEND-ONLY: no update/delete policies. Corrections are new adjustment rows.)
plans               market_code · code (e.g. annual) · name_i18n jsonb · price_minor · currency_code · duration_days
                    · trial_days · grace_days · is_active · is_default   (unique(market_code, code))
subscriptions       shop_id unique · plan_id · status (trial|active|grace|expired|suspended) · last_paid_minor
                    · current_period_start · current_period_end · suspended_reason
notifications       user_id · type · title · body · data jsonb · read_at
support_tickets     user_id · subject · message · status (open|in_progress|resolved) · admin_reply
audit_log           actor_id · action · entity · entity_id · payload jsonb · created_at
```

### 5.1 Configuration tables (market, languages, payments, settings)

```text
markets             code (PK, ISO-3166 alpha-2, e.g. ET) · name_i18n jsonb · currency_code (ISO-4217, ETB) · currency_symbol (Br)
                    · minor_unit_digits (2) · phone_country_code (+251) · phone_regex · timezone (Africa/Addis_Ababa)
                    · default_locale (en) · enabled_locales text[] (en,am,om,so,ti,sw) · is_active · is_default
                    (exactly one row has is_default = true, enforced by a partial unique index)
payment_methods     market_code · code (chapa|telebirr|cbe_birr|cash|credit|demo) · type (online|offline|credit)
                    · routing (via_chapa|direct|manual|none) · name_i18n jsonb · icon · sort_order · is_enabled
                    · config jsonb (NON-secret options only; secrets live in Edge Function env vars)
shop_payment_methods shop_id · method_code · is_enabled   (a shop can only enable methods its market has enabled)
app_settings        key (PK) · value jsonb · updated_by · updated_at
                    keys: subscription_reminder_days [30,7,1] · credit_reminder_after_days 7 · support_phone
                          · support_telegram · support_whatsapp · default_market ET
```

- RLS: every authenticated user can read active markets, enabled payment methods and public app settings. Only an admin can write them.
- The client loads `markets`, `payment_methods`, `plans` and `app_settings` at startup into Dexie, so they also work offline, and refreshes them on sync. A `useMarket()` hook exposes the current market (the shop's market on shop screens, the user's market elsewhere).
- Customers see only shops in their own market. A shop's currency is its market's currency.

**Views and functions:**
- `v_customer_balances(shop_id, shop_customer_id, balance_minor, last_activity)` = `SUM(ledger_entries.amount_minor)`.
- `v_shop_sales_daily(shop_id, day, orders_count, gross_minor, collected_minor)`.
- Indexes: `orders(shop_id, status, placed_at desc)`, `orders(customer_id, placed_at desc)`, `products(shop_id) where deleted_at is null`, `ledger_entries(shop_id, shop_customer_id)`, `unique(shop_id, order_number)`, and `updated_at` on every synced table (for delta sync).
- Enable Realtime on `orders`, `order_events`, `products`, `payments`, `notifications`, `subscriptions`.

**Ledger semantics (must be exact):**
- **Confirmed rule:** when the shop **accepts** an order (`pending → accepted`), write one `charge` of +total for that order. From that moment it counts in the customer's outstanding balance at that shop.
- If an accepted or processing order is later cancelled by the shop owner (a reason is required; `rejected` is only valid from `pending`), write a compensating `adjustment` of −total. If money was already paid against it, the shop must refund or keep it as customer credit, so show a warning and record the choice.
- When a payment succeeds, write a `payment` entry of −amount.
- Balance = sum of entries. An order's paid amount = −sum(payment entries for that order).
- `payment_status` is recalculated by function `recompute_order_payment_status(order_id)` after every ledger write.

- "Pay later (credit)" does not create a second charge. It marks the order `on_credit` and checks the credit limit against balance + this order.
- Pending orders create **no** ledger entry and cannot be paid. The Pay button appears only after acceptance.

---

## 6. Server-side business logic (RPC functions, `security definer`, `search_path` set)

The client **never** writes directly to `orders`, `order_items`, `payments`, `ledger_entries` or `subscriptions`. It calls these functions:

| Function | Who | Behavior |
|---|---|---|
| `place_order(p_order_id uuid, p_shop_id, p_items jsonb[{product_id, quantity}], p_fulfilment, p_address, p_note, p_client_created_at, p_expected_total_minor)` | customer | **Idempotent** on `p_order_id`: if the order already exists for this customer, return it. Checks: shop exists, is open, subscription is not expired or suspended, every product belongs to the shop, is available and not deleted, quantity is between 1 and 999. **Recomputes** prices and totals from the DB. If the total differs from `p_expected_total_minor`, raise `PRICE_CHANGED` with the new lines (client asks for confirmation and retries). Inserts order + items + event, upserts `shop_customers`, inserts a notification for the shop owner. |
| `update_order_status(p_order_id, p_to_status, p_reason)` | shop owner of that shop (customer only for `cancelled` from `pending`) | Enforces the transition table: pending→accepted/rejected/cancelled, accepted→processing/cancelled (owner only), processing→completed/cancelled (owner only), and nothing leaves completed, rejected or cancelled. Requires a reason for rejected or cancelled. Writes `order_events` and the ledger effects from Section 5, and notifies the customer. A no-op if the order is already in the target status, so retries are idempotent. |
| `record_payment(p_idempotency_key, p_shop_id, p_shop_customer_id, p_order_id null, p_amount_minor, p_method, p_note)` | shop owner | Manual cash or other payment. Amount must be > 0 and ≤ outstanding (unless an admin override flag is set). Writes payment + ledger + recompute. |
| `set_order_on_credit(p_order_id)` | customer (if the shop accepts credit and the credit limit is not exceeded) or shop owner | Marks the order `on_credit`. The charge stays on the ledger. |
| `admin_set_subscription(p_shop_id, p_action: activate|extend|suspend|unsuspend, p_reason)` | admin | Updates the subscription and writes `audit_log`. |
| `record_manual_charge(p_idempotency_key, p_shop_id, p_shop_customer_id, p_amount_minor, p_note)` | shop owner | Goods given on credit outside an app order (Section 17.1). Writes a `charge`, with limit check and audit. |
| `upsert_shop_customer(p_shop_id, p_display_name, p_phone, p_credit_limit_minor)` | shop owner | Creates or edits a walk-in customer. If a registered user has the same phone, links `customer_id`. |
| `delete_my_account()` | any user | Anonymizes the profile, keeps orders and ledger rows (Section 4A). |
| `mark_notifications_read(p_ids uuid[])` | owner of the notifications | |

Edge Functions (Deno, `supabase/functions`): `payments-init`, `payments-webhook`, `payments-demo-confirm`, `reminders-run` and `subscriptions-tick` (both called by `pg_cron`), `admin-stats`. They share `supabase/functions/_shared/{provider.ts, chapa.ts, demo.ts, schemas.ts, money.ts}`.

**RLS policies (enable RLS on every table; default deny):**
- `profiles`: a user selects or updates only their own row and cannot change `role`. A shop owner can read the name and phone of customers who ordered from their shop. Admin reads all.
- `shops`: anyone authenticated can read shops whose subscription is not `expired` or `suspended`. The owner reads and updates their own shop. Admin reads all.
- `products`: everyone authenticated reads the products of visible shops (not deleted). Only the owner of the shop can insert, update or delete.
- `orders`, `order_items`, `order_events`: the customer reads their own. The shop owner reads orders for their shop. **There are no direct insert or update policies** (only RPC).
- `ledger_entries`, `payments`, `shop_customers`: the shop owner reads rows for their shop. The customer reads their own rows. Writes happen only through RPC or Edge Functions.
- `subscriptions`: the owner reads their own. Admin reads and writes.
- `notifications`, `support_tickets`: the user reads their own and can insert support tickets. Admin reads all and updates tickets.
- `audit_log`: admin read only.
- Storage buckets: `product-images` and `shop-images` (public read; writes only under the path `{shop_id}/...` by that shop's owner; max 2MB; image/* only), `avatars` (each user writes only `{user_id}/...`).

Write **RLS tests** (`tests/rls/*.test.ts`) that sign in as customer A, customer B, shop owner X, shop owner Y and admin, and assert that cross-tenant reads return nothing and forbidden writes fail.

---

## 7. Offline-first and sync architecture

**Goal:** the app opens and stays useful with no network. Changes made offline sync automatically and safely when the connection returns.

### 7.1 What works offline
| Action | Offline behavior |
|---|---|
| App shell, navigation, login session | ✅ Precached by the service worker. The session is persisted. |
| Browse previously viewed shops and products and their images | ✅ From Dexie plus the Workbox image cache (CacheFirst, 30 days, max 300 entries) |
| Build and edit carts | ✅ Local only (Zustand persisted) |
| Place an order | ✅ **Queued.** Shows status "Waiting for connection". Sent automatically. |
| Shop owner: view orders, customers, balances | ✅ From Dexie (last synced) |
| Shop owner: change order status, toggle product availability, edit or add products, record cash payment | ✅ **Queued** in the outbox |
| Online payment, registration, password reset, admin actions | ❌ Online only. Disable the buttons and explain why ("You're offline"). |

### 7.2 Components (`src/lib/sync/`)
- **`db.ts`:** a Dexie schema mirroring synced tables (`shops`, `products`, `orders`, `order_items`, `order_events`, `payments`, `ledger_entries`, `shop_customers`, `notifications`, `subscriptions`) plus `outbox` and `sync_meta`. **The DB name includes the user id** (`suklink_<userId>`) so accounts never share data. Delete it on logout.
- **`outbox.ts`:** each mutation is `{id (uuid), op: 'place_order'|'update_order_status'|'upsert_product'|'record_payment'|..., payload, created_at, attempts, last_error, status: queued|sending|failed|done}`. **Every op carries a client-generated id or idempotency key**, so a retry never duplicates. Apply an **optimistic update** to Dexie immediately and tag the row `_pending = true`.
- **`push.ts`:** drains the outbox in **FIFO order**, one op at a time (order matters), with exponential backoff (1s, 2s, 4s… max 60s). Business errors from the server (e.g. `PRICE_CHANGED`, `INVALID_TRANSITION`, `PRODUCT_UNAVAILABLE`) are **not retried**. Mark the op `failed`, roll back the optimistic row by re-pulling it, and surface it in the "Needs attention" sheet with a clear action.
- **`pull.ts`:** delta sync per table using `updated_at > sync_meta[table].cursor` (keep a small overlap window of 5s to tolerate clock skew). Upsert into Dexie. Rows with `deleted_at` set are removed locally. The server is the source of truth: after each push, pull the affected rows.
- **`engine.ts`:** triggers sync on app start, login, `online` event, Capacitor `Network` status change, `App` resume, every Realtime event (a pull of that table), and a 60s interval while the app is foregrounded. Also registers **Background Sync** (`sync` tag) in the service worker where supported (Android Chrome).
- **Conflict policy:**
  - Order status: the server validates the transition. If the order has already moved on, the op fails gracefully and the user sees the real status.
  - Products: last write wins on the whole row, compared by `updated_at`. If the server row is newer than the base version the edit started from, show "This product was changed on another device. Keep mine / Keep theirs".
  - Money: never conflicts, because ledger entries are append-only and idempotent.
- **UI:** a global **sync status pill** in the header: "Online · Synced", "Offline · 3 changes waiting", "Syncing…", "1 needs attention". Each pending order or product row shows a small clock icon until confirmed.
- **TanStack Query** reads from Dexie through `useLiveQuery` (dexie-react-hooks) for synced entities, so the UI updates reactively from either local or remote changes. Use Query only for non-synced, online-only requests (admin stats, payment init).

### 7.3 Native specifics (Capacitor)
- `capacitor.config.ts`: `appId: 'et.suklink.app'`, `appName: 'Suk Link'`, `webDir: 'dist'`, `server.androidScheme: 'https'`.
- Handle safe areas (`env(safe-area-inset-*)`), set status bar color per theme, show the splash screen until the first render, use the Android back button to navigate back or exit at root, run `App.addListener('appStateChange')` to trigger sync, use the camera for product photos, and add haptics on add-to-cart and on status change.
- Deep link `suklink://pay/return` (and the `https` equivalent) returns from the payment page.
- Document the build commands: `npm run build && npx cap sync && npx cap open android|ios`.

---

## 8. Design system ("smart, elegant, calm, trustworthy")

**Principles:** clarity over decoration. One primary action per screen. Large touch targets (≥ 44px). Numbers (prices, totals, balances) are prominent and use **tabular figures**. Motion confirms actions and is never gratuitous. The app should feel premium on a low-end Android phone. Performance is part of the design.

**Tokens** (CSS variables in `src/styles/tokens.css`, mapped into Tailwind; light and dark):
- **Brand primary:** deep emerald `#0E7C66` (hover `#0B6655`, tint `#E6F4F0`). **Accent:** warm amber `#F2A93B` (used sparingly: highlights, badges). Neutral slate scale for text and surfaces. Semantic colors: success `#16A34A`, warning `#D97706`, danger `#DC2626`, info `#2563EB`.
- **Dark mode:** surface `#0B1412`, raised `#121D1A`, primary `#2BB596`. All text meets **WCAG AA contrast**.
- **Typography:** `Inter` (Latin script: en, om, so, sw) + `Noto Sans Ethiopic` (Ge'ez script: am, ti), self-hosted (no CDN, so they work offline). Scale 12/14/16/18/22/28/34. Weights 400/500/600/700. `font-variant-numeric: tabular-nums` on money.
- **Spacing:** 4-pt base (4, 8, 12, 16, 20, 24, 32, 48). **Radius:** 10 (inputs), 14 (cards), 20 (sheets), full (pills). **Elevation:** 3 soft shadow levels, plus borders in dark mode instead of shadows.
- **Motion:** 150–250ms, `cubic-bezier(.2,.8,.2,1)`. Spring for bottom sheets. Respect `prefers-reduced-motion`.

**Layout and navigation:**
- Mobile first. **Customer bottom tabs:** Home · Orders · Balances · Profile (floating cart button with item count when the cart is not empty). **Shop owner bottom tabs:** Dashboard · Orders (badge) · Products · Customers · More (Shop profile, Subscription, Support, Settings).
- Tablet and desktop (≥ 1024px) switch to a left sidebar layout with a wider content area and a two-pane order list plus detail view.
- Admin is desktop-first, with responsive tables that collapse to cards on mobile.

**Components to build** (in `src/components/ui`): Button (primary, secondary, ghost, destructive; loading state), Input, Textarea, Select, Switch, Stepper (− qty +), Badge or StatusPill (one color per order status, used consistently everywhere), Card, ProductCard, ShopCard, OrderCard, Money (formats minor units using the market currency, e.g. "Br 1,245.00", via `formatMoney`), Avatar, BottomSheet (Radix Dialog + framer-motion), Tabs, Toast (sonner), Skeleton, EmptyState (illustration + message + action), Timeline, KPI card, SyncStatusPill, OfflineBanner, ConfirmDialog, ImagePicker.

**States:** every list has a skeleton loading state, an empty state with a helpful call to action, an error state with retry and an offline state. Every button that mutates has a loading and disabled state that **prevents double submission**.

**Status colors (fixed):** pending = amber, accepted = blue, processing = violet, completed = green, rejected/cancelled = slate or red. Payment: paid = green, partially_paid = amber, on_credit = orange, unpaid = slate.

**Key screen notes:**
- *Shop dashboard:* today's KPIs (orders, sales, collected, outstanding credit), "New orders" list with large Accept and Reject buttons, "Customers with balances" card, subscription banner if trial, grace or expiring.
- *Order detail (owner):* sticky bottom action bar with the single next action as the primary button.
- *Cart:* sticky total bar. The total updates through an animated number transition.
- *Payment confirmation:* a full-screen success view with a checkmark animation, amount, reference and "Back to order".

---

### 8.1 Languages (six locales)

| Code | Language | Script | Font |
|---|---|---|---|
| `en` | English (source and fallback) | Latin | Inter |
| `am` | Amharic, አማርኛ | Ge'ez | Noto Sans Ethiopic |
| `om` | Afaan Oromoo | Latin | Inter |
| `so` | Somali, Soomaali | Latin | Inter |
| `ti` | Tigrinya, ትግርኛ | Ge'ez | Noto Sans Ethiopic |
| `sw` | Kiswahili | Latin | Inter |

- `en.json` is the single source of keys. A unit test fails if any key is missing from the other five files, or if any interpolation placeholder (`{{name}}`) differs between them.
- Locale files are lazy-loaded but **all precached by the service worker**, so switching language works offline.
- Translations: produce drafts for all five, then list every file in `src/i18n/STATUS.md` as `draft` until a **native speaker** has reviewed it. Before the presentation, at least the demo-path strings in the languages being demonstrated must be `reviewed`. Do not present machine translation as final.
- Numbers, money and dates go through `Intl` with a fallback chain (`om-ET` → `om` → `en`), because browsers and Android WebView have limited `Intl` data for `om`, `so` and `ti`. A unit test checks that `formatMoney` and `formatDate` never throw and always return a string for all six locales. Always use Western (Latin) digits. The Gregorian calendar is used in the MVP. The Ethiopian calendar is Phase 2.
- Layout must tolerate **text expansion** (Oromo and Somali strings often run 30–40% longer than English). Use no fixed-width buttons or labels, allow wrapping, and test the main screens in `om` at 360px.
- Translated user content: plan and payment-method names use `name_i18n jsonb` with an `en` fallback. Shop and product names stay as the owner typed them.

## 9. Money and calculation rules (must be unit-tested)

- All amounts are integers in **minor units** of the record's `currency_code` (santim for ETB). Convert only at the UI edge using the market's `minor_unit_digits`: `src/lib/money.ts` exposes `toMinor("12.50", 2) → 1250` and `formatMoney(1250, { currency: 'ETB', symbol: 'Br', digits: 2 }, locale) → "Br 12.50"`. Reject input with more decimals than the currency allows.
- An order, a payment and a ledger entry always carry a `currency_code`. Functions refuse to mix currencies (a payment currency must equal the order currency). There is no currency conversion in the MVP.
- `line_total = unit_price × quantity`. `subtotal = Σ line_total`. `total = subtotal + delivery_fee`. The same function is implemented in TypeScript (client preview) and SQL (authoritative). Add a test that compares them on random carts.
- Prices are snapshotted on the order item at placement. A later product price change never alters existing orders.
- Outstanding balance = Σ ledger. Payment amounts must not exceed the outstanding amount. There are no negative balances unless an explicit adjustment creates one.

---

## 10. Security baseline (MVP, not Phase 2)

- RLS on every table, with tests (Section 6). Writes for orders, money and subscriptions go only through RPC or Edge Functions.
- Roles come from the DB and JWT `app_metadata`, never from client-editable `user_metadata`.
- Edge Functions validate input with zod, check the caller's JWT and role, and verify every webhook signature. Each provider has its own endpoint (`payments-webhook/chapa`, `/telebirr`, `/cbe_birr`) and verifier (e.g. Chapa HMAC with `CHAPA_WEBHOOK_SECRET`). After verification, re-confirm the payment with `verifyTransaction` and check that the amount and currency match. Webhook handling is idempotent on `(provider, provider_ref)`.
- No secrets in the client bundle. The client has only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The service role key is used only in Edge Functions.
- Logout wipes the local DB, caches and cart for that user. The service worker never caches authenticated API responses (cache images and the app shell only).
- Content Security Policy headers on web hosting. Escape all user content (React default; never use `dangerouslySetInnerHTML`).
- Passwords are handled by Supabase Auth. Rate limiting uses Supabase defaults. Add a simple per-user limit (10/min) in `place_order` and support ticket creation.
- PII minimization: a shop sees only the name and phone of its own customers. Payment provider data is limited to the reference id.
- `audit_log` covers admin actions and manual payment records.

---

## 11. Project structure

```text
suk-link/
├─ docs/  SUK_LINK_BUILD_PLAN.md · DECISIONS.md · DEMO_SCRIPT.md
├─ supabase/
│  ├─ migrations/  0001_extensions_enums.sql · 0002_core_tables.sql · 0003_rls.sql · 0004_functions.sql
│  │               0005_views_indexes.sql · 0006_realtime_cron_storage.sql
│  ├─ functions/   _shared/ · payments-init/ · payments-webhook/ · payments-demo-confirm/ · reminders-run/ · subscriptions-tick/ · admin-stats/
│  └─ seed.sql     (plus scripts/seed.ts for auth users and images)
├─ src/
│  ├─ app/          router.tsx · guards.tsx · layouts/ (CustomerLayout, ShopLayout, AdminLayout, AuthLayout)
│  ├─ features/
│  │  ├─ auth/      Welcome, Login, Register, ForgotPassword, useSession
│  │  ├─ customer/  Home, ShopPage, Cart, Checkout, Orders, OrderDetail, Balances, PaymentConfirm
│  │  ├─ shop/      Setup wizard, Dashboard, Orders, OrderDetail, Products, ProductEditor, Customers,
│  │  │             CustomerDetail (ledger), ShopProfile, Subscription
│  │  ├─ admin/     Overview, Users, Shops, Subscriptions, Tickets
│  │  ├─ payments/  PayButton, DemoPayPage, usePaymentStatus
│  │  ├─ notifications/  Bell, NotificationList, useRealtimeNotifications
│  │  └─ support/   HelpCenter, ContactForm, MyTickets
│  ├─ components/ui/   (design system components)
│  ├─ lib/       supabase.ts · money.ts · sync/ (db, outbox, push, pull, engine) · i18n.ts · native.ts · images.ts
│  ├─ stores/    cart.ts · ui.ts
│  ├─ schemas/   zod schemas shared with functions
│  ├─ i18n/      en.json · am.json · om.json · so.json · ti.json · sw.json · STATUS.md
│  ├─ styles/    tokens.css · globals.css
│  └─ sw.ts      (Workbox service worker)
├─ e2e/          demo-journey.spec.ts · offline-order.spec.ts · auth-switch.spec.ts
├─ tests/        unit/ · rls/
├─ scripts/      seed.ts · reset-demo.ts
├─ android/ ios/ (generated by Capacitor)
└─ capacitor.config.ts · vite.config.ts · tailwind.config.ts · .env.example
```

**`.env.example`:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, for functions: `SUPABASE_SERVICE_ROLE_KEY`, `PAYMENT_MODE=demo|live`, `CHAPA_SECRET_KEY`, `CHAPA_WEBHOOK_SECRET`, `TELEBIRR_APP_ID`, `TELEBIRR_APP_KEY`, `TELEBIRR_PUBLIC_KEY`, `TELEBIRR_SHORT_CODE`, `CBEBIRR_MERCHANT_ID`, `CBEBIRR_API_KEY`, `CBEBIRR_WEBHOOK_SECRET` (the direct-adapter keys are optional), `APP_PUBLIC_URL`. Support contacts, market, plan and price are **not** env vars. They live in the DB (Section 5.1).

**npm scripts:** `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `test:rls`, `e2e`, `db:reset` (`supabase db reset` + seed), `seed`, `demo:reset`, `cap:android`, `cap:ios`.

---

## 12. Seed and demo data (`scripts/seed.ts`, idempotent)

- **Configuration:**
  - Market `ET` (active, default, ETB, Br, 2 digits, +251, Africa/Addis_Ababa, all six languages enabled, default `en`).
  - Market `KE` (**inactive**, KES, KSh, +254, Africa/Nairobi, `en`/`sw`). This proves configurability: activating it in admin must work with no code change.
  - ET payment methods: chapa, telebirr (via_chapa), cbe_birr (via_chapa), cash, credit.
  - ET plan "Annual" (Br 2,400, 365 days, trial 30, grace 7). Changing it from admin is part of the Step 7 demo.
- **Accounts** (password `Demo@2026`, change for real use):
  - `customer@demo.suklink.et`: Selam Tesfaye, customer
  - `customer2@demo.suklink.et`: Dawit Bekele, customer (has an existing credit balance)
  - `shop@demo.suklink.et`: Abebe Kebede, owner of **"Abebe Mini Market"** (grocery, accepts credit, open, subscription **active**, expires in ~11 months)
  - `shop2@demo.suklink.et`: owner of "Tsehay Bakery" (subscription in **trial**, 5 days left, to show reminders)
  - `admin@demo.suklink.et`: admin
- **Walk-in customer:** at Abebe Mini Market, "Ato Kebede (walk-in)" with a phone number and Br 450 of manual credit, so the credit screens show a customer who is not on the app.
- **Products for Abebe Mini Market** (with real-looking photos stored in `scripts/seed-images/` and uploaded to Storage; include licence-free images): Teff Injera (5 pcs) Br 75 · Buna / Coffee beans 500g Br 320 · Sugar 1kg Br 140 · Cooking oil 3L Br 690 · Pasta 500g Br 85 · Lentils (misir) 1kg Br 180 · Berbere 250g Br 150 · Eggs (12) Br 210 · Fresh milk 1L Br 90 · Bread loaf Br 45 · Bottled water 2L Br 40 · Laundry soap Br 60 (one product marked **out of stock**).
- **History:** ~20 past orders over the last 14 days across both customers in mixed statuses, with payments and one outstanding credit balance (Dawit owes Br 865), so the dashboard, sales and customer history look alive.
- `npm run demo:reset` restores this exact state in under 30 seconds. **Run it before every presentation.**
- `docs/DEMO_SCRIPT.md`: a clickable step-by-step script matching Section 3, with which account goes on which device, the exact products to tap and expected results.

---

## 13. Testing requirements

- **Unit (Vitest):** money utils, cart store (add, increase, decrease, remove, per-shop totals), order status transition table, outbox ordering, retry and idempotency, the i18n key and placeholder parity test across all six locales, `formatMoney` and `formatDate` for every locale × market, plan-price changes not altering existing subscriptions, the method picker showing only methods enabled for both the market and the shop.
- **RLS tests:** as described in Section 6.
- **Ledger invariant tests:** random sequences of accept, pay, partial pay, cancel and retry (Section 17.6). Also payment allocation for balance payments and concurrent `place_order` order numbers.
- **E2E (Playwright, mobile viewport Pixel 7 + desktop):**
  - `demo-journey.spec.ts`: Section 3 steps 1–7 with two browser contexts, asserting totals (e.g. 2× Sugar + 1× Cooking oil = Br 970.00), realtime arrival of the order on the shop context within 3s, status timeline updates, payment status `paid`, ledger balance values.
  - `offline-order.spec.ts`: set the customer context offline, add to cart, place the order (shown as queued), go online, the order reaches the shop exactly **once**.
  - `auth-switch.spec.ts`: log in as the shop owner, log out, log in as the customer on the same context. No shop data is visible, and no console errors occur.
- **CI** (GitHub Actions): lint → typecheck → unit → start Supabase → RLS tests → build → Playwright.
- **Lighthouse (mobile):** PWA installable, Performance ≥ 85, Accessibility ≥ 95.

---

## 14. Milestones (build in this order; each must pass before moving on)

| # | Milestone | Done when |
|---|---|---|
| **M0** | Scaffold: Vite + React + TS + Tailwind + tokens + ESLint/Prettier + Vitest + Playwright + Supabase CLI + `.env.example` + CI | `npm run lint && npm run typecheck && npm test && npm run build` pass. An empty app renders with design tokens in light and dark mode. |
| **M1** | Database: all migrations (enums, configuration tables from Section 5.1, core tables, triggers, RLS, RPCs, views, storage, realtime) + seed script | `npm run db:reset` works. RLS tests pass. `place_order` and `update_order_status` are covered by SQL-level tests. |
| **M2** | Design system components + app layouts + i18n (all six locales, Ge'ez and Latin fonts) + theme switch | A component gallery route `/dev/ui` (dev only) shows all components in both themes and languages. |
| **M3** | Auth: welcome, register (role choice), login, logout (with local wipe), forgot password, role guards, profile | A customer and a shop owner can each register and land on their own home pages. Wrong-role URLs redirect. `auth-switch.spec.ts` passes. |
| **M4** | Shop owner: setup wizard (auto trial), shop profile, products CRUD with image upload and availability toggle | Products created on Device 2 appear on Device 1 in real time. |
| **M5** | Customer: home, shop page, per-shop cart with steppers, checkout, `place_order` with the price-change dialog | The order is saved with correct totals, verified in the DB. Two simultaneous orders get different order numbers. |
| **M6** | Orders: owner board + detail + transitions + realtime notifications (toast, sound, badge, bell, local notification); customer tracking timeline; cancel | Steps 3–4 work live across two sessions. |
| **M7** | Payments + ledger: `PaymentProvider` interface, DemoProvider, Chapa (test), telebirr and CBE Birr via Chapa (direct adapters behind flags), method picker filtered by market and shop, payments-init and per-provider webhooks, confirmation screen, record cash payment, put on credit, customer detail ledger, balances screens, sales KPIs, walk-in customers and manual credit (17.1), pay-a-balance with oldest-first allocation (17.2), test-mode banner (17.5), ledger invariant tests (17.6), optional receipts (17.10) | Steps 5–6 work. Ledger sums are exact. |
| **M8** | Subscription + status ticker (17.4) + reminders + admin dashboard + admin configuration (markets, payment methods, plans, settings) + support tickets | Step 7 works. An expired shop is hidden from customers. Changing the plan price in admin shows the new price on the shop's renewal screen. Activating the `KE` market works with no code change. |
| **M9** | Offline sync engine (Dexie, outbox, pull, engine, sync pill, needs-attention sheet) + PWA service worker + image caching + offline product images (17.7) | `offline-order.spec.ts` passes. The app reloads offline and shows cached data. |
| **M10** | Capacitor Android and iOS: config, icons, splash, safe areas, back button, camera, haptics, local notifications, deep link return, closed-app push as a stretch goal (17.8) | The app runs on an Android emulator and an iOS simulator and the full demo flow works on device. |
| **M11** | Polish and hardening: empty, error and loading states everywhere, accessibility pass, Lighthouse targets, `DEMO_SCRIPT.md`, `demo:reset`, full `demo-journey.spec.ts` green on mobile and desktop, legal screens and account deletion, staging and production setup, error tracking and backups (17.11), recorded fallback demo video (17.12) | All checklist items in Section 16 are ticked. |

---

## 15. Phase 2 (do not build now; keep the architecture open)

Advanced inventory and stock levels; analytics/BI; marketing campaigns; referrals and rewards; remote push automation (FCM/APNs); call-centre tools; multi-branch shops; delivery-rider coordination; advanced financial reports; phone OTP login; production certification of the direct telebirr and CBE Birr adapters; Ethiopian calendar display; currency conversion across markets; multi-role accounts; market-specific tax rules.

---

## 16. Definition of done (pre-presentation checklist)

- [ ] Every core feature (Section 4 A–D plus Section 17.1 and 17.2) works against the real backend. Nothing is mocked.
- [ ] Customer and shop-owner sessions communicate in real time (order arrives in under 3s, status updates in under 3s).
- [ ] Orders are saved and displayed accurately. Prices and totals are correct (server-recomputed, unit-tested).
- [ ] Payment status is consistent everywhere (order list, order detail, ledger, customer balances, admin).
- [ ] Sales and customer transaction histories are accessible and correct.
- [ ] Switching accounts on the same device shows no stale or foreign data and no errors.
- [ ] A walk-in customer's credit can be recorded and paid down, and the same balance is shown consistently on the shop and customer sides.
- [ ] Terms acceptance and account deletion work. The test-mode banner shows whenever payments are in demo mode.
- [ ] The app works offline for browsing, cart and order queueing, and syncs once without duplicates.
- [ ] Installable PWA. Android and iOS builds run.
- [ ] The UI is clean, consistent, responsive (360px → desktop), light and dark, all six languages (demo-path strings native-reviewed), and default market ET with configurable markets, plans and payment methods.
- [ ] `npm run demo:reset` prepares the demo data. `docs/DEMO_SCRIPT.md` is ready.
- [ ] `demo-journey.spec.ts`, `offline-order.spec.ts`, `auth-switch.spec.ts`, unit tests and RLS tests all pass in CI.
- [ ] No console errors or unhandled promise rejections during the demo flow.

---

## 17. Additions found in review (build them in the milestone shown)

1. **Walk-in customers and manual credit (M7).** Shops use credit mostly for people who are not on the app, and this is the paper notebook Suk Link replaces. A shop owner can add a customer by name and phone, record "goods on credit" for them (RPC `record_manual_charge`, a `charge` entry with a note, idempotent) and record payments. When someone later registers with the same phone number, link their account to the existing `shop_customers` row, so they see their balance and history. Ledger and balances are keyed by `shop_customer_id`.
2. **Customer pays an outstanding balance (M7).** From My balances, the customer can pay any amount up to the balance through the normal method picker (`payments.purpose = 'balance'`). **Allocation rule:** any payment without an `order_id` is applied to the shop customer's oldest unpaid accepted orders first. `recompute_order_payment_status` follows this rule, and the allocation is covered by tests.
3. **Order numbers (M1).** Use a `shop_order_counters(shop_id, last_number)` table updated with a row lock inside `place_order`, so two simultaneous orders never get the same number. The unique constraint `unique(shop_id, order_number)` is the safety net.
4. **Subscription status ticker (M8).** The hourly cron job also moves subscriptions through trial → expired, active → grace → expired using the plan's `grace_days`, writes the notifications and logs the changes. Nothing relies on someone opening the app for a status to change.
5. **Test-mode banner (M7).** When `PAYMENT_MODE=demo`, show a persistent "Test payments, no real money moves" ribbon and label the provider in the receipt. The presentation must never imply live charges.
6. **Ledger invariant tests (M7).** Add database-level tests with random sequences of accept, pay, partially pay, cancel and retry the same request. They must always hold: balance = sum of entries, no overpayment, `payment_status` matches the ledger, and a duplicated idempotency key creates nothing new.
7. **Offline product images (M9).** An image chosen offline is stored as a blob in Dexie and uploaded first when the outbox drains. The `upsert_product` op then carries the final URL.
8. **Notifications when the app is closed (M10, stretch).** Realtime only reaches a running app, so a shop owner with the app closed misses orders. Add FCM (native) and Web Push (PWA) through an Edge Function triggered by the `notifications` insert. If it is not done before the presentation, say so honestly in the demo.
9. **iOS subscription payments (decision needed before an App Store release).** Apple may require in-app purchase for paid software access, even for shop owners. Check the current App Store review guidelines before submitting. Options are to renew through the web or an admin-recorded payment on the iOS build, or to use IAP. Android is unaffected. This does not affect the demo.
10. **Receipts and statements (M7, optional).** A shareable order receipt and a customer statement (image or PDF via the Capacitor Share plugin) so a shop can settle credit disputes over WhatsApp.
11. **Operations (M11).** Separate staging and production Supabase projects, scheduled database backups, Sentry (or similar) for client and Edge Function errors with no personal data in the payload, and a `/health` check for the payment webhook.
12. **Demo safety net (M11).** Record a screen capture of the working demo flow as a fallback, and run `demo:reset` and the E2E test on the **exact presentation devices and network** the day before.

---

## 18. Working rules for the coding agent

1. Work one milestone at a time. At the end of each, run lint, typecheck, tests and build, then report what was built and the test results.
2. Never fake functionality to make a screen look finished. If a dependency is missing (e.g. no Chapa keys), use the DemoProvider path. That path is real code, not a mock.
3. Keep business rules on the server (SQL functions and RLS). The client previews but never decides money or status.
4. Keep the code typed end to end: generate DB types with `supabase gen types typescript --local > src/lib/database.types.ts` after every migration.
5. Every user-visible string goes through i18n. No hard-coded English in components.
6. Small, focused components. No file over ~300 lines. Business logic in hooks or `lib`, not in JSX.
7. Record every non-obvious decision in `docs/DECISIONS.md`.
