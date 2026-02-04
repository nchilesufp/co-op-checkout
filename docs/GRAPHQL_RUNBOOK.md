# Co-op/Plant Payment Setup - GraphQL Runbook

This document provides GraphQL mutations and queries for setting up the Co-op/Plant Payment app.

---

## Requirements

- **Shopify Plus** store (required for Payment Customization Functions)
- **Custom distribution** app with protected customer data access
- Manual payment methods created in Shopify Admin

---

## Prerequisites

1. **Create manual payment methods** in Shopify Admin:
   - Settings → Payments → Manual payment methods
   - Create "Co-op"
   - Create "Plant"
   - Names must **exactly match** what you put in the Step 3 config below

2. **Install app** on the store via `npm run dev`

3. **Open GraphiQL** by pressing `g` while dev server is running

---

## Quick Setup Checklist

1. [ ] Create manual payment methods ("Co-op", "Plant")
2. [ ] Run `npm run dev` and install app
3. [ ] Step 1: Get function ID
4. [ ] Step 2: Create PaymentCustomization
5. [ ] Step 3: Set PaymentCustomization config
6. [ ] Step 4: Get Shop ID
7. [ ] Step 5: Set Shop config
8. [ ] Step 6: Create customer entitlement metafield definitions (via Admin UI)
9. [ ] Step 7: Set customer entitlements (via Admin UI)
10. [ ] Add Checkout UI block in Checkout Editor

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

## Step 3: Set PaymentCustomization Config

Configures which payment method names are Co-op vs Plant.

**Replace `YOUR_PAYMENT_CUSTOMIZATION_ID` with the ID from Step 2.**

```graphql
mutation SetPaymentCustomizationConfig {
  metafieldsSet(
    metafields: [
      {
        ownerId: "YOUR_PAYMENT_CUSTOMIZATION_ID"
        namespace: "$app:payment-customization"
        key: "function-configuration"
        type: "json"
        value: "{\"coOpPaymentMethodNames\":[\"Co-op\"],\"plantPaymentMethodNames\":[\"Plant\"]}"
      }
    ]
  ) {
    metafields {
      id
      namespace
      key
    }
    userErrors {
      field
      message
    }
  }
}
```

---

## Step 4: Get Shop ID

Gets the Shop ID needed for the Checkout UI config.

```graphql
query GetShopId {
  shop {
    id
    name
  }
}
```

**Save the `id`** (e.g., `gid://shopify/Shop/72973123761`)

---

## Step 5: Set Shop Config (for Checkout UI)

Stores config on the Shop for the Checkout UI extension to read. This config uses a **handle-to-type map** because the Checkout UI extension's `PaymentOption` type only exposes `type` and `handle` — no `name` property. Each key is a payment method handle; the value is `"co-op"` or `"plant"`.

Handles are opaque identifiers like `custom-manual-payment-<hash>`. To discover them:
1. Run `shopify app dev`
2. Add a `console.log` of `useSelectedPaymentOptions()` in your extension
3. Select each payment method at checkout and note the handle from the dev console

**Replace `YOUR_SHOP_ID` with the ID from Step 4. Replace the handle placeholders with actual values from your store.**

```graphql
mutation SetShopConfig {
  metafieldsSet(
    metafields: [
      {
        ownerId: "YOUR_SHOP_ID"
        namespace: "$app:co-op-plant-payment"
        key: "configuration"
        type: "json"
        value: "{\"paymentMethodHandles\":{\"COOP_HANDLE_HERE\":\"co-op\",\"PLANT_HANDLE_HERE\":\"plant\"}}"
      }
    ]
  ) {
    metafields {
      id
      namespace
      key
    }
    userErrors {
      field
      message
    }
  }
}
```

**Note:** Step 3 (PaymentCustomization config) and Step 5 (Shop config) have **different** formats by design. Step 3 maps payment method names to roles (the Function matches by name via GraphQL). Step 5 maps payment method handles to roles (the Checkout UI extension can only see handles). If you recreate payment methods, re-run Step 3 with new names and Step 5 with new handles.

---

## When to Re-run Steps

| Step | What it does | Re-run when... |
|------|--------------|----------------|
| **Step 1** | Get function ID | Never (ID is stable unless you delete/recreate the function extension) |
| **Step 2** | Create PaymentCustomization | Never (once created, it exists). Only re-run if you deleted it. |
| **Step 3** | Set PaymentCustomization config | **Payment method names change** in Shopify Admin |
| **Step 4** | Get Shop ID | Never (Shop ID never changes) |
| **Step 5** | Set Shop config | **Payment methods deleted/recreated** (handles change) |
| **Step 6** | Create metafield definitions | Never (once created, they exist) |
| **Step 7** | Set customer entitlements | Per-customer, as needed |

**Key point:** Step 3 names must **exactly match** the payment method names in Shopify Admin (Settings → Payments → Manual payment methods). Step 5 handles must match the actual handles from `useSelectedPaymentOptions()`. Renaming a payment method requires re-running Step 3. Deleting and recreating one requires re-running both Step 3 (new name) and Step 5 (new handle).

---

## Step 6: Create Customer Entitlement Metafield Definitions (Admin UI)

Create metafield definitions via Admin UI so entitlement checkboxes appear when editing customers.

### 6a: Co-op Entitlement

1. Go to **Settings → Custom data → Customers**
2. Click **Add definition**
3. Fill in:
   - **Name:** Co-op
   - **Namespace and key:** `custom.co_op`
   - **Type:** (One value) True or false
   - **Description:** Customer can use Co-op payment method
4. Click **Save**

### 6b: Plant Entitlement

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

## Step 7: Set Customer Entitlements (Admin UI)

1. Go to **Admin → Customers** → select a customer
2. Scroll to the **Metafields** section
3. Toggle **Co-op** and/or **Plant** checkboxes
4. Click **Save**

Repeat for each customer who should have access to Co-op or Plant payment methods.

---

## Verification Queries

Use these queries to verify the app is configured correctly after completing setup.

### List Payment Customizations

Verifies the PaymentCustomization was created (Step 2) and configured (Step 3).

```graphql
query ListPaymentCustomizations {
  paymentCustomizations(first: 10) {
    nodes {
      id
      title
      enabled
      metafield(namespace: "$app:payment-customization", key: "function-configuration") {
        value
      }
    }
  }
}
```

**Expected result:**
- One node with `title: "Co-op/Plant Payment Gate"` and `enabled: true`
- `metafield.value` contains the config JSON with payment method names

### Get Customer Entitlements

Verifies a customer's entitlement metafields are set correctly (Step 7).

**Replace `$customerId` with a customer ID** (e.g., `gid://shopify/Customer/123456789`).
1. Get customer list to to find customer ID
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

### Get Shop Config

Verifies the Shop config metafield was set correctly (Step 5).

```graphql
query GetShopConfig {
  shop {
    id
    metafield(namespace: "$app:co-op-plant-payment", key: "configuration") {
      value
    }
  }
}
```

**Expected result:**
- `metafield.value` contains the handle-to-type map: `{"paymentMethodHandles":{"<handle>":"co-op","<handle>":"plant"}}`
- This format is intentionally different from Step 3 (which uses names). The Checkout UI extension can only see handles.
- If `null`, the Checkout UI extension won't know which payment methods are Co-op/Plant

---

## Troubleshooting

### Payment methods not hiding

1. Verify PaymentCustomization is enabled
2. Check payment method names in config match Shopify Admin exactly
3. Verify customer has entitlement metafields set to `"true"`
4. Check function logs in Partner Dashboard → Extensions → Functions
5. Verify `buyerIdentity` in function input is not `null` (customer must be logged in)

### Function input shows `buyerIdentity: null`

- Customer is not logged in during checkout
- App doesn't have protected customer data access (requires Custom distribution)

### Checkout UI not showing fields

1. Verify extension block is added in Checkout Editor
2. Check Shop config metafield is set (run the "Get Shop Config" verification query)
3. Verify payment method handles in Shop config match actual handles — log `useSelectedPaymentOptions()` in the extension and compare
4. Check browser console for errors
5. Use the dev console preview link (`<tunnel>/extensions/dev-console`) rather than navigating checkout manually — Checkout Editor caches the tunnel URL across sessions

### Customer can't see Co-op/Plant payment

1. Verify customer is logged in
2. Check customer's entitlement metafield values are `"true"`
3. Verify function is working (check function logs)
