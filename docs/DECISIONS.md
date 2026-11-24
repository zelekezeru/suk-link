# Suk Link — Architectural & Engineering Decisions (`docs/DECISIONS.md`)

## 1. Ledger Charge Timing (Section 5)
- **Confirmed Rule:** When a shop owner **accepts** an order (`pending -> accepted` in `update_order_status`), the database immediately writes one `charge` entry (`+total_minor`) to `ledger_entries`.
- **Why:** In the demo flow (Step 4 → Step 5), the customer pays immediately after the shop owner accepts the order. Writing the charge on acceptance ensures that paying right after acceptance settles a real ledger charge, and `recompute_order_payment_status` accurately computes `paid`, `partially_paid`, `on_credit`, or `unpaid`.
- **Compensating Adjustment:** If an accepted order is subsequently cancelled or rejected, a compensating `adjustment` entry (`-total_minor`) is appended to `ledger_entries` (since `ledger_entries` is strictly append-only).
- **Pending Orders:** Pending orders create no ledger entry and cannot be paid until accepted.

## 2. Data-Driven Markets, Currencies, Languages & Payment Methods (Section 0 & Section 5.1)
- **Decision:** All market attributes (`currency_code`, `currency_symbol`, `minor_unit_digits`, `phone_country_code`, `phone_regex`, `timezone`, `default_locale`, `enabled_locales`), payment methods (`payment_methods`, `shop_payment_methods`), subscription plans (`plans`), and global settings (`app_settings`) live in PostgreSQL configuration tables and are synced to Dexie for offline availability.
- **Seeded Markets:** `ET` (active, default, `ETB`, `Br`, 2 digits, `+251`, `Africa/Addis_Ababa`, `en/am/om/so/ti/sw`) and `KE` (inactive, `KES`, `KSh`, 2 digits, `+254`, `Africa/Nairobi`, `en/sw`). Activating `KE` in the Admin Dashboard works immediately with zero code changes.

## 3. Payment Providers & Chapa Wallet Preselection (Section 4 — Payments)
- **Chapa API check:** Chapa's `/v1/transaction/initialize` endpoint accepts `customization` and optional `payment_method` hints, or opens the unified Chapa hosted checkout where customers can select `telebirr` or `CBE Birr` when `routing = 'via_chapa'`. Our `ChapaProvider` passes the selected method code in the initialization payload (`meta.preferred_method` and Chapa's `payment_method` parameter when supported) and falls back cleanly to standard Chapa checkout.
- **Demo Mode (`PAYMENT_MODE=demo`):** In demo mode, the customer's payment method picker displays the real market/shop-enabled methods (`Chapa`, `telebirr`, `CBE Birr`, `Cash`, `Pay later (credit)`), while online initiation routes through `DemoProvider` (`/pay/demo/:paymentId`) which invokes the exact same server-side webhook verification, `verifyTransaction` check, ledger write, and `recompute_order_payment_status` pipeline.
- **Direct Adapters:** `TelebirrProvider` and `CbeBirrProvider` implement `PaymentProvider` behind `routing = 'direct'` and check for configured environment credentials (`TELEBIRR_*`, `CBEBIRR_*`); if credentials are absent when `routing = 'direct'` in live mode, the method is reported as unavailable and never faked.

## 4. Local Postgres Execution Engine for Development & CI
- **Context:** All migrations live in `supabase/migrations/0001_*.sql` through `0006_*.sql` using standard PostgreSQL 15+ DDL, RLS policies, triggers, views, and `SECURITY DEFINER` PL/pgSQL RPC functions.
- **Decision:** To allow `npm run db:reset`, `npm run test:rls`, and the local Supabase backend (`http://127.0.0.1:54321`) to run reliably even when Docker Desktop is not installed on the host machine, we use `@electric-sql/pglite` (full PostgreSQL 16 compiled to WebAssembly) executing the exact `supabase/migrations/*.sql` files, enforcing native PostgreSQL Row Level Security (`SET LOCAL ROLE authenticated`, `request.jwt.claims`), and serving a local Supabase-compatible REST, RPC, Auth, Storage, Edge Functions, and Realtime WebSocket/SSE gateway on port `54321` (or Vite middleware).
