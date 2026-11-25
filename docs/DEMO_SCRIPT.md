# SUK LINK — Live Presentation & Demo Script (`docs/DEMO_SCRIPT.md`)

> **Before starting the presentation:** Run `npm run demo:reset` in the terminal. In under 30 seconds it resets the database, applies all migrations, and seeds the exact demo accounts, shops, products, and 14-day transaction history.

---

## Demo Setup (Two Browser Windows or Devices)

| Session | Role | Account Email | Password | Initial URL |
|---|---|---|---|---|
| **Device 1** (Left / Mobile viewport) | **Customer** (Selam Tesfaye) | `customer@demo.suklink.et` | `Demo@2026` | `http://localhost:5173/welcome` |
| **Device 2** (Right / Tablet or Desktop) | **Shop Owner** (Abebe Kebede — Abebe Mini Market) | `shop@demo.suklink.et` | `Demo@2026` | `http://localhost:5173/login` |
| **Admin Tab** (Step 7) | **Admin** | `admin@demo.suklink.et` | `Demo@2026` | `http://localhost:5173/login` |

---

## Step-by-Step Walkthrough (Matches Section 3)

### Step 1 — Language Picker & Customer Login (Device 1)
1. On **Device 1**, open `/welcome`.
2. Tap **አማርኛ**, **Afaan Oromoo**, **Soomaali**, **ትግርኛ**, or **Kiswahili** at the top to demonstrate instant runtime switching across all 6 languages. Switch back to **English** (or keep your preferred language).
3. Tap **Log in**, then tap **Customer: Selam (`customer@demo.suklink.et`)** (or enter `customer@demo.suklink.et` / `Demo@2026`).
4. **Expected Result:** Lands on `/c/home` showing **"Abebe Mini Market"** (Open, Accepts credit) and **"Tsehay Bakery"**. Tap **Abebe Mini Market** to view its product grid.

### Step 2 — Shop Owner Adds a Product Live (Device 2 → Device 1)
1. On **Device 2**, log in as **Shop Owner: Abebe Mini Market** (`shop@demo.suklink.et`).
2. Navigate to the **Products** tab (`/s/products`) and tap **Add product**.
3. Enter:
   - **Name:** `Highland Honey 500g`
   - **Price (Br):** `450.00`
   - **Unit:** `pack`
   - **Category:** `Pantry`
4. Tap **Save**.
5. **Expected Result:** Within ~1 second, `Highland Honey 500g (Br 450.00)` appears live on **Device 1**'s product grid without refreshing.

### Step 3 — Customer Places an Order (Device 1)
1. On **Device 1** (inside Abebe Mini Market):
   - Find **Sugar 1kg** (`Br 140.00`): tap **+ Add**, then tap **+** on the inline stepper so quantity = **2** (`Br 280.00`).
   - Find **Cooking oil 3L** (`Br 690.00`): tap **+ Add** so quantity = **1** (`Br 690.00`).
2. Tap **View cart (3) · Br 970.00**.
3. Review the line items (`2× Sugar 1kg = Br 280.00`, `1× Cooking oil 3L = Br 690.00`), leave fulfilment as **Pickup at shop**, add an optional note, and tap **Place order · Br 970.00**.
4. **Expected Result:** Redirects to the live Order Tracking page (`/c/orders/:orderId`) with status **Pending** and payment status **Unpaid**.

### Step 4 — Shop Owner Receives & Processes the Order Live (Device 2 → Device 1)
1. On **Device 2**, a toast notification appears, the notification chime plays, and the **Orders** badge increments.
2. Open **Orders** (`/s/orders`) → **New** tab, and tap the top order (`Br 970.00`).
3. Tap **Accept**.
   - *Behind the scenes:* The server writes a `+Br 970.00` (`97,000` minor units) charge to the append-only `ledger_entries` table.
4. Tap **Start processing**.
5. **Expected Result:** On **Device 1**, the order status timeline updates live (`Pending → Accepted → Processing`) and the **Pay now · Br 970.00** button appears.

### Step 5 — Customer Pays Online or on Credit (Device 1)
1. On **Device 1**, tap **Pay now · Br 970.00**.
2. The payment method picker displays all market- and shop-enabled methods: **Chapa · telebirr · CBE Birr · Cash · Pay later (credit)**.
3. Select **telebirr** (or **Chapa**) and tap **Pay Br 970.00**.
4. On the hosted Demo Payment Gateway screen (`/pay/demo/:paymentId`), tap **Approve Payment**.
5. **Expected Result:**
   - Full-screen confirmation displays **Paid ✓**, `Br 970.00`, reference code, and timestamp.
   - Tap **Back to order**: payment status is now **Paid**.

### Step 6 — Shop Completes Order & Records Partial Credit Settlement (Device 2)
1. On **Device 2**, tap **Mark completed** on the order detail page.
2. Navigate to **Dashboard** (`/s/dashboard`) to show today's updated KPIs (**Orders today**, **Sales today**, **Collected today**, **Outstanding credit**).
3. Navigate to **Customers** (`/s/customers`) and tap **Dawit Bekele**, who has an existing credit balance of **Br 865.00**.
4. Review Dawit's append-only ledger history (charge of `Br 1,165.00` and previous partial cash payment of `-Br 300.00`).
5. Tap **Record payment**, enter **`265.00`**, and tap **Confirm**.
6. **Expected Result:** Dawit's outstanding credit balance drops immediately from **Br 865.00** to **Br 600.00**, and a new `-Br 265.00` payment row appears in the transaction history.

### Step 7 — Subscription Management & Data-Driven Admin Controls (Device 2 + Admin Tab)
1. On **Device 2**, open **More → Subscription** (`/s/subscription`) to view the **Annual Shop Plan**, **Active** status pill, expiry date, days remaining, and renewal button (`Renew subscription · Br 2400.00`).
2. In the **Admin Tab**, log in as **Admin** (`admin@demo.suklink.et`).
3. Open **Subscriptions** (`/a/subscriptions`):
   - Locate **Tsehay Bakery** (currently in **Free Trial**, 5 days remaining) and tap **Activate** (or **Extend 1 Year**), enter a reason, and confirm. Every action is recorded in `audit_log`.
4. Open **Configuration** (`/a/config`):
   - Under **Subscription Plans**, change the `ET` Annual Plan price from `2400.00` to `2600.00` and click **Save**.
   - Check **Device 2** (`/s/subscription`): the renewal button updates to `Br 2600.00` for future renewals while existing active subscription dates remain untouched.
   - Under **Markets Configuration**, toggle **Kenya (KE - KES)** active. Visit `/welcome` in an incognito tab to see the market selector (`Ethiopia (ETB)` / `Kenya (KES)`) appear automatically with zero code changes.
