# Co-op/Plant Payment - Install & Setup Guide

This document covers deploying the app and configuring it on each store.

---

## Requirements

- **Shopify Plus** store (required for Payment Customization Functions)
- **Custom distribution** app with protected customer data access
- Manual payment methods created in Shopify Admin

---

## Prerequisites

1. **Create manual payment methods** in Shopify Admin:
   - Settings -> Payments -> Manual payment methods
   - Create "Co-op"
   - Create "Plant"
   - Names must normalize to `co-op` and `plant` (the function matches names case-insensitively)

2. **Install app** on the store:
   - **Dev store:** `npm run dev` (auto-installs on the store in `shopify.app.toml`)
   - **Other orgs:** deploy first (see Deploy), then install via shared link

3. **Open GraphiQL:**
   - **Dev store:** press `g` while dev server is running
   - **Other orgs:** Admin -> Apps -> GraphQL Explorer

---

## Quick Setup Checklist

1. [ ] Deploy app (`npm run deploy`) - skip if only setting up dev store
2. [ ] Create manual payment methods ("Co-op", "Plant") on target store
3. [ ] Install app on target store
4. [ ] Step 1: Get function ID
5. [ ] Step 2: Create PaymentCustomization
6. [ ] Step 3: Discover payment handles and update `extensions/checkout-ui/src/Checkout.jsx`
7. [ ] Step 4: Create customer entitlement metafield definitions (Admin UI)
8. [ ] Step 5: Set customer entitlements (Admin UI)
9. [ ] Add Checkout UI block in Checkout Editor and enable "Block checkout progress"

---

## Deploy

This is a **custom distribution** app (not listed on the Shopify App Store). Installation is done via a link generated in the Partner Dashboard.

### Push the app

Run from repo root:

```bash
npm run deploy
```

This pushes app + extensions to Partner Dashboard.

### Generate the install link

1. Partner Dashboard -> Apps -> Co-op/Plant Payment
2. Click **Custom distribution**
3. Enter target store `myshopify.com` domain
4. Leave **Allow multi-store installs for one Plus organization** checked if needed
5. Click **Generate link**
6. Share link with target store owner

### Per-store: install and configure

Each store that receives the install link needs to:

1. Open install link while logged into Shopify Admin
2. Approve app permissions
3. Create manual payment methods ("Co-op", "Plant")
4. Run **Steps 1-2** in GraphQL Explorer
5. Run **Step 3** (discover handles, update `Checkout.jsx`, redeploy)
6. Run **Steps 4-5** in Admin UI
7. Add Checkout UI block in Checkout Editor

**Important:** Function ID, PaymentCustomization ID, and payment method handles are per-store.

---

## Step 1: Get Function ID

Lists Shopify Functions installed on the store. We need the `id` for Step 2.

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
- `apiType: "payment_customization"`
- `title: "payment-customization"`

Save the `id`.

---

## Step 2: Create PaymentCustomization

Creates the PaymentCustomization that runs the function at checkout.

Replace `YOUR_FUNCTION_ID` with Step 1 result.

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

Save `paymentCustomization.id`.

---

## Step 3: Discover Payment Handles and Update Checkout UI

The Checkout UI extension currently uses a **hardcoded handle map** in `extensions/checkout-ui/src/Checkout.jsx`.

Handles are opaque IDs like `custom-manual-payment-<hash>`, unique per store.

1. Run `shopify app dev`
2. Temporarily log selected options in `extensions/checkout-ui/src/Checkout.jsx`:

```javascript
console.log('selectedOptions:', useSelectedPaymentOptions());
```

3. Open `<tunnel>/extensions/dev-console` and launch checkout preview from there
4. Select Co-op payment method, record its `handle`
5. Select Plant payment method, record its `handle`
6. Update the `paymentMethodHandles` object in `extensions/checkout-ui/src/Checkout.jsx`
7. Remove temporary `console.log`
8. Redeploy with `npm run deploy`

---

## Step 4: Create Customer Entitlement Metafield Definitions (Admin UI)

Create metafield definitions so entitlement checkboxes appear on customer records.

### 4a: Co-op Entitlement

1. Settings -> Custom data -> Customers
2. Click **Add definition**
3. Set:
   - **Name:** Co-op
   - **Namespace and key:** `custom.co_op`
   - **Type:** True or false
   - **Description:** Customer can use Co-op payment method
4. Save

### 4b: Plant Entitlement

1. Settings -> Custom data -> Customers
2. Click **Add definition**
3. Set:
   - **Name:** Plant
   - **Namespace and key:** `custom.plant`
   - **Type:** True or false
   - **Description:** Customer can use Plant payment method
4. Save

---

## Step 5: Set Customer Entitlements (Admin UI)

1. Admin -> Customers -> select customer
2. In **Metafields**, toggle Co-op and/or Plant
3. Save

Repeat for each customer who should have access.

---

## Verification Queries

### List Payment Customizations

Verifies the PaymentCustomization was created and enabled.

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

Expected:
- One node with `title: "Co-op/Plant Payment Gate"`
- `enabled: true`

### Get Customer Entitlements

Verifies customer entitlement metafields.

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
```

Expected:
- `coop.value: "true"` for Co-op entitled customer
- `plant.value: "true"` for Plant entitled customer

---

## Troubleshooting

### Payment methods not hiding

1. Verify PaymentCustomization is enabled
2. Verify manual payment method names are Co-op and Plant
3. Verify customer metafields are `"true"` as expected
4. Check function logs in Partner Dashboard -> Extensions -> Functions
5. Verify checkout is logged-in customer checkout (`buyerIdentity` not null)

### Checkout UI not showing fields

1. Verify extension block is added in Checkout Editor
2. Verify hardcoded handles in `extensions/checkout-ui/src/Checkout.jsx` match the store's actual handles
3. Re-discover handles via `useSelectedPaymentOptions()` if methods were recreated
4. Check browser console for extension errors
5. Use dev-console preview link (`<tunnel>/extensions/dev-console`) during handle discovery

### Customer cannot see Co-op/Plant

1. Verify customer is logged in
2. Verify customer entitlement metafields are set correctly
3. Verify function is running and enabled

### Validation not blocking checkout

`block_progress` must be enabled in both places:
1. `extensions/checkout-ui/shopify.extension.toml`
2. Checkout Editor block settings ("Block checkout progress")

### Extension appears twice or appears without block placement

The dev-console preview auto-injects extensions for testing. Real checkout only shows the block where placed in Checkout Editor.
