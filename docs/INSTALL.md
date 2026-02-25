# Co-op/Plant Payment - Install & Setup Guide

This document covers deploying the app and configuring it on each store.

---

## Requirements

- **Shopify Plus** store (required for Payment Customization Functions)
- **Custom distribution** app with due to customer data access requirements
- Manual payment methods created in Shopify Admin

---

## Prerequisites

1. **Create manual payment methods** in Shopify Admin:
   - Settings → Payments → Manual payment methods
   - Create "Co-op"
   - Create "Plant"
   - Names must **exactly match** the hardcoded names in the function source: `Co-op` and `Plant`

2. **Install app** on the store:
   - **Dev stores:** Run `npm run dev` and select the target store when prompted (auto-installs)
   - **Production stores in other orgs:** Use the custom distribution install link

3. **Open GraphiQL:**
   - **Dev stores:** Press `g` while the dev server is running
   - **Production stores:** Install a GraphQL app (e.g., "Shopify GraphiQL App") from the App Store

---

## Quick Setup Checklist

1. [ ] Create manual payment methods ("Co-op", "Plant") on target store
2. [ ] Install app (dev: `npm run dev`; production: use install link)
3. [ ] Open GraphiQL (dev: press `g`; production: use GraphQL app)
4. [ ] Step 1: Get function ID
5. [ ] Step 2: Create PaymentCustomization
6. [ ] Step 3: Import Shopify Flows
7. [ ] Step 4: Create order metafield definitions (via Admin UI)
8. [ ] Step 5: Create customer entitlement metafield definitions (via Admin UI)
9. [ ] Step 6: Set customer entitlements (via Admin UI)
10. [ ] Add Checkout UI block in Checkout Editor, enable "Block checkout progress", and configure payment method handles

---

## Deploy

This is a **Custom Distribution** app — it is not on the Shopify App Store.

### Push the app

Run from the repo root:

```bash
npm run deploy
```

This pushes the app and its extensions to the Partner Dashboard. Run this whenever you change code and want the changes available for install.

### Installing on additional stores (same org)

If you need to install on additional stores within the same Plus organization:

1. Go to **Partner Dashboard → Apps → Co-op Checkout**
2. Click **Custom distribution**
3. Enter a store's `myshopify.com` domain from that org
4. Check **"Allow multi-store installs for one Plus organization"**
5. Click **Generate link**
6. Share the link — any store in that org can use it to install

After installation, run the setup steps below for each store.

### Installing on a different Plus organization

Each Plus organization requires its own app in the Partner Dashboard. Use named config files to manage multiple apps from the same repo.

**One-time setup for a new org:**

```bash
# Create a new config linked to a new/existing app in Partner Dashboard
shopify app config link --config <org-name>
# Example: shopify app config link --config ufp-plus
```

This creates `shopify.app.<org-name>.toml` with that app's `client_id`.

**Deploy and install:**

```bash
# Deploy to that org's app
shopify app deploy -c <org-name>

# Run dev server for that org
shopify app dev -c <org-name>
```

**Switch default config (optional):**

```bash
# Set a config as the default (so you don't need -c flag)
shopify app config use <org-name>
```

**Config files:**
- `shopify.app.toml` — default config (UFP Apps org)
- `shopify.app.<org-name>.toml` — additional org configs

Each config file should be committed to the repo. Add org-specific configs to `.gitignore` if you don't want them shared.

**Important:** Every value in the steps (function ID, PaymentCustomization ID) is per-store. They are not shared across stores.

**Note on payment method handles:** The Checkout UI extension matches payment methods by opaque handle. Handles are configured per-store via the Checkout Editor settings (no code change or redeploy needed). See [TECHNICAL_IMPLEMENTATION.md Section 5](TECHNICAL_IMPLEMENTATION.md#5-setup--install-flow) for the handle discovery process.

### Configuring stores without CLI access

The Shopify CLI can only connect to development stores in your Partner account. For production stores in other Plus organizations, use a GraphQL app instead:

1. Install a GraphQL app on the target store (e.g., "Shopify GraphiQL App" from the App Store)
2. Run Steps 1–2 GraphQL queries/mutations directly in that app

---

## Step 1: Get Function ID

Lists all Shopify Functions installed on the store. We need the function `id` for Step 2.

```graphql
query GetShopifyFunctions {
  shopifyFunctions(first: 25) {
    nodes {
      app {
        title
      }
      apiType
      title
      id
    }
  }
}
```

Look for:
- `apiType`: `"payment_customization"`
- `title`: `"payment-customization"`

**Save the `id`** (e.g., `019c20b8-9d6f-7753-90ff-14ab9f171c54`)

---

## Step 2: Create PaymentCustomization

Creates the PaymentCustomization that runs our function at checkout.

**Replace `YOUR_FUNCTION_ID` with the ID from Step 1.**

```graphql
mutation CreatePaymentCustomization {
  paymentCustomizationCreate(
    paymentCustomization: {
      functionId: "YOUR_FUNCTION_ID"
      title: "Co-op/Plant Payment Gate"
      enabled: true
    }
  ) {
    paymentCustomization {
      id
      title
      enabled
    }
    userErrors {
      field
      message
    }
  }
}
```

**Save the `paymentCustomization.id`** (e.g., `gid://shopify/PaymentCustomization/89358513`)

---

## Step 3: Import Shopify Flows

Two Shopify Flows automate order data handling. Import both on the target store.

Flow files are in `docs/shopify-flows/`.

**To import each flow:**
1. Go to **Settings → Flow**
2. Click **Import**
3. Select the `.flow` file
4. Review and activate

### Flow 1: Assign Co-op and Plant metafields and MSR tags

**File:** `docs/shopify-flows/Assign Co-op and Plant metafields and MSR tags.flow`

Runs on order creation. For Co-op orders: copies the Customer Code attribute to `custom.co_op_customer_code` and sets `checkoutcustomizer.customercode_v1` to the first 4 chars of the code. For Plant orders: copies the Plant Number to `custom.plant_number`. For all other orders: sets `checkoutcustomizer.customercode_v1 = "CAHM"`. Every order gets the "Send to MSR" tag.

### Flow 2: Initialize entitlements for new customers

**File:** `docs/shopify-flows/Set Co-op or Plant metafield to false for new customers.flow`

Runs on customer creation. Sets `custom.co_op` and `custom.plant` to `false` for any new customer that doesn't already have those metafields set to `true`.

**Note:** The `checkoutcustomizer.customercode_v1` metafield and "Send to MSR" tag set by Flow 1 are specific to the Deckorators MSR integration. The `checkoutcustomizer.customercode_v1` metafield (named "MSR Customer Code" in Admin) is created by a separate legacy custom app called "MSR Integration", installed by IT. Other stores may need to modify or remove those actions from the Flow.

---

## Step 4: Create Order Metafield Definitions (Admin UI)

Create order metafield definitions so the Shopify Flows can write order data that is visible and searchable in Admin.

### 4a: Co-op Customer Code

1. Go to **Settings → Custom data → Orders**
2. Click **Add definition**
3. Fill in:
   - **Name:** Co-op Customer Code
   - **Namespace and key:** `custom.co_op_customer_code`
   - **Type:** Single line text
   - **Description:** Customer Code selected at checkout for Co-op orders
4. Click **Save**

### 4b: Plant Number

1. Go to **Settings → Custom data → Orders**
2. Click **Add definition**
3. Fill in:
   - **Name:** Plant Number
   - **Namespace and key:** `custom.plant_number`
   - **Type:** Single line text
   - **Description:** Plant number entered at checkout for Plant orders
4. Click **Save**

### 4c: MSR Customer Code (Deckorators only)

This metafield is part of the MSR integration and is created by a separate legacy custom app called "MSR Integration", installed by IT. It is documented here for completeness.

1. Go to **Settings → Custom data → Orders**
2. Click **Add definition**
3. Fill in:
   - **Name:** MSR Customer Code
   - **Namespace and key:** `checkoutcustomizer.customercode_v1`
   - **Type:** Single line text
   - **Description:** 4-character customer code for MSR sync
4. Click **Save**

**Note:** On production Deckorators stores, this definition is managed by the MSR Integration app. Only create it manually on dev/test stores where that app is not installed.

---

## Step 5: Create Customer Entitlement Metafield Definitions (Admin UI)

Create metafield definitions via Admin UI so entitlement checkboxes appear when editing customers.

### 5a: Co-op Entitlement

1. Go to **Settings → Custom data → Customers**
2. Click **Add definition**
3. Fill in:
   - **Name:** Co-op
   - **Namespace and key:** `custom.co_op`
   - **Type:** (One value) True or false
   - **Description:** Customer can use Co-op payment method
4. Click **Save**

### 5b: Plant Entitlement

1. Go to **Settings → Custom data → Customers**
2. Click **Add definition**
3. Fill in:
   - **Name:** Plant
   - **Namespace and key:** `custom.plant`
   - **Type:** (One value) True or false
   - **Description:** Customer can use Plant payment method
4. Click **Save**

After creating both, they appear as checkboxes when editing any customer.

---

## Step 6: Set Customer Entitlements (Admin UI)

1. Go to **Admin → Customers** → select a customer
2. Scroll to the **Metafields** section
3. Toggle **Co-op** and/or **Plant** checkboxes
4. Click **Save**

Repeat for each customer who should have access to Co-op or Plant payment methods.

---

## When to Re-run Steps

| Step | What it does | Re-run when... |
|------|--------------|----------------|
| **Step 1** | Get function ID | Never (ID is stable unless you delete/recreate the function extension) |
| **Step 2** | Create PaymentCustomization | Never (once created, it exists). Only re-run if you deleted it. |
| **Step 3** | Import Flows | Never (once imported and active, they persist). Re-import if deleted. |
| **Step 4** | Create order metafield definitions | Never (once created, they exist) |
| **Step 5** | Create customer metafield definitions | Never (once created, they exist) |
| **Step 6** | Set customer entitlements | Per-customer, as needed |

**Key point:** Payment method names in Shopify Admin must match the hardcoded names in the function source (`"co-op"` and `"plant"`, case-insensitive). If you rename the payment methods, you must update the source and redeploy. If you delete and recreate payment methods, you must re-discover the handles and update them in the Checkout Editor settings.

---

## Verification Queries

Use these queries to verify the app is configured correctly after completing setup.

### List Payment Customizations

Verifies the PaymentCustomization was created (Step 2).

```graphql
query ListPaymentCustomizations {
  paymentCustomizations(first: 10) {
    nodes {
      id
      title
      enabled
    }
  }
}
```

**Expected result:**
- One node with `title: "Co-op/Plant Payment Gate"` and `enabled: true`

### Get Customer Entitlements

Verifies a customer's entitlement metafields are set correctly (Step 6).

**Replace `$customerId` with a customer ID** (e.g., `gid://shopify/Customer/123456789`).
1. Get customer list to find customer ID
```graphql
query CustomerList {
  customers(first: 10) {
    nodes {
      id
      firstName
      lastName
      defaultEmailAddress {
        emailAddress
      }
      createdAt
      updatedAt
      verifiedEmail
    }
  }
}
```
2. Use customer ID to check entitlements
```graphql
query GetCustomerEntitlements($customerId: ID!) {
  customer(id: $customerId) {
    id
    defaultEmailAddress {
        emailAddress
    }
    coop: metafield(namespace: "custom", key: "co_op") {
      value
    }
    plant: metafield(namespace: "custom", key: "plant") {
      value
    }
  }
}
# variables
{
  "customerId": "gid://shopify/Customer/8901222596785"
}
```

**Expected result:**
- `coop.value: "true"` if customer is entitled to Co-op payment
- `plant.value: "true"` if customer is entitled to Plant payment
- `null` if not entitled (metafield not set)

---

## Troubleshooting

### Payment methods not hiding

1. Verify PaymentCustomization is enabled
2. Check payment method names in Admin exactly match the hardcoded names (`Co-op`, `Plant`)
3. Verify customer has entitlement metafields set to `"true"`
4. Check function logs in Partner Dashboard → Extensions → Functions
5. Verify `buyerIdentity` in function input is not `null` (customer must be logged in)

### Function input shows `buyerIdentity: null`

- Customer is not logged in during checkout
- App doesn't have protected customer data access (requires Custom distribution)

### Checkout UI not showing fields

1. Verify extension block is added in Checkout Editor
2. Verify payment method handles in the Checkout Editor settings match the actual handles for this store — add a temporary `console.log(selectedOptions)` in `Checkout.jsx`, deploy, and compare
3. Check browser console for errors
4. Use the dev console preview link (`<tunnel>/extensions/dev-console`) rather than navigating checkout manually — Checkout Editor caches the tunnel URL across sessions

### Customer can't see Co-op/Plant payment

1. Verify customer is logged in
2. Check customer's entitlement metafield values are `"true"`
3. Verify function is working (check function logs)

### Validation not blocking checkout (can proceed without required fields)

The `block_progress` capability must be enabled **both** in the extension config (`shopify.extension.toml`) and in the Checkout Editor for the placed block:

1. Open **Checkout Editor** (Sales channels → Online Store → Checkout → Customize)
2. Click on the **Co-op Checkout** block you placed
3. In the block settings panel, find **"Block checkout progress"** or similar toggle
4. Enable it and **Save** the checkout configuration

Without this setting enabled in Checkout Editor, the extension can render fields but cannot block checkout progress.

### Extension appears twice / shows without being placed in Checkout Editor

The **dev-console preview** (`<tunnel>/extensions/dev-console`) auto-injects extensions for testing purposes. This is separate from the Checkout Editor placement:

- **Dev-console preview:** Extension renders automatically (for development iteration)
- **Real checkout:** Extension only renders where you place it in Checkout Editor

To verify production behavior:
1. Deploy with `npm run deploy`
2. Test via actual checkout (not the dev-console preview) — add items to cart, go to checkout normally
3. The extension will only appear if you've placed the block in the Checkout Editor
