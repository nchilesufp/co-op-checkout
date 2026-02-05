# Admin UI Feature Context

This document provides context for building an Admin UI backend for the Co-op Checkout app. The goal is to replace the manual GraphQL runbook steps with a user-friendly interface.

---

## Current State

The app is **extension-only** with no backend:
- **Payment Customization Function** — hides/shows Co-op and Plant payment methods based on customer entitlements
- **Checkout UI Extension** — renders input fields when Co-op/Plant payment is selected

All configuration is currently done via **manual GraphQL mutations** in Shopify's GraphiQL Explorer (see `docs/INSTALL.md`). This is tedious and error-prone.

---

## What the Admin UI Should Replace

The UI should automate these manual setup steps:

### 1. PaymentCustomization Setup (Steps 1-3 in INSTALL.md)

**Currently manual:**
1. Query `shopifyFunctions` to find the function ID
2. Run `paymentCustomizationCreate` mutation with that function ID
3. Run `metafieldsSet` mutation to configure payment method names

**UI should:**
- Auto-detect the installed function ID
- Create the PaymentCustomization if it doesn't exist
- Provide form fields for Co-op and Plant payment method names
- Save config via `metafieldsSet`

### 2. Shop Config for Checkout UI (Steps 4-5 in INSTALL.md)

**Currently manual:**
1. Query `shop { id }` to get Shop ID
2. Discover payment method handles by adding console.log to extension, going through checkout
3. Run `metafieldsSet` mutation with handle-to-type map

**UI should:**
- Auto-fetch Shop ID
- **Challenge:** Payment method handles cannot be discovered via Admin API — they're only visible in the Checkout UI extension at runtime. Options:
  - Have user paste handles discovered via dev console (simpler)
  - Query manual payment methods by name from Admin API, let user map them (but we still need handles)
- Save config via `metafieldsSet`

### 3. Customer Entitlement Metafield Definitions (Step 6)

**Currently manual:** Create metafield definitions in Admin UI (Settings → Custom data → Customers)

**UI could:**
- Run `metafieldDefinitionCreate` mutations for `custom.co_op` and `custom.plant` boolean metafields
- Check if definitions already exist first

### 4. Customer Entitlements Management (Step 7)

**Currently manual:** Toggle checkboxes on individual customer records

**UI could:**
- List customers with their current entitlement status
- Bulk update entitlements
- Search/filter customers

---

## Technical Requirements

### Shopify Embedded App

The UI will be an **embedded app** that runs inside Shopify Admin:
- Uses Shopify App Bridge for authentication and navigation
- Session token authentication (no traditional OAuth flow needed for embedded apps)
- Polaris components for UI consistency

### Framework Options

Shopify's recommended stack:
- **Remix** — Shopify's current recommended framework (`@shopify/shopify-app-remix`)
- **Node.js** with Express — older but still supported

The Shopify CLI can scaffold this:
```bash
shopify app generate extension --template app_home
# or scaffold a full Remix app with backend
```

### Required Scopes

Already configured in `shopify.app.toml`:
```toml
scopes = "read_customers,write_customers,write_payment_customizations"
```

May need to add:
- `read_metafield_definitions`, `write_metafield_definitions` — for creating customer metafield definitions
- `read_payment_customizations` — for reading existing PaymentCustomization config

### Admin GraphQL Mutations Needed

```graphql
# Find installed function
query GetShopifyFunctions {
  shopifyFunctions(first: 25) {
    nodes { id, apiType, title }
  }
}

# Create PaymentCustomization
mutation paymentCustomizationCreate($functionId: String!, $title: String!) {
  paymentCustomizationCreate(paymentCustomization: {
    functionId: $functionId
    title: $title
    enabled: true
  }) {
    paymentCustomization { id }
    userErrors { field, message }
  }
}

# Set metafields (works for PaymentCustomization and Shop owners)
mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id }
    userErrors { field, message }
  }
}

# Create metafield definition for customers
mutation metafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
  metafieldDefinitionCreate(definition: $definition) {
    createdDefinition { id }
    userErrors { field, message }
  }
}

# List customers with entitlements
query CustomersWithEntitlements($first: Int!) {
  customers(first: $first) {
    nodes {
      id
      email
      firstName
      lastName
      coop: metafield(namespace: "custom", key: "co_op") { value }
      plant: metafield(namespace: "custom", key: "plant") { value }
    }
  }
}

# Update customer metafields (entitlements)
mutation customerUpdate($input: CustomerInput!) {
  customerUpdate(input: $input) {
    customer { id }
    userErrors { field, message }
  }
}
```

---

## Config Metafield Schemas

### PaymentCustomization Config (Function)

Owner: `PaymentCustomization` (e.g., `gid://shopify/PaymentCustomization/89358513`)
Namespace: `$app:payment-customization`
Key: `function-configuration`
Type: `json`

```json
{
  "coOpPaymentMethodNames": ["Co-op"],
  "plantPaymentMethodNames": ["Plant"]
}
```

Names must exactly match manual payment method names in Shopify Admin.

### Shop Config (Checkout UI)

Owner: `Shop` (e.g., `gid://shopify/Shop/72973123761`)
Namespace: `$app:co-op-plant-payment`
Key: `configuration`
Type: `json`

```json
{
  "paymentMethodHandles": {
    "custom-manual-payment-<hash>": "co-op",
    "custom-manual-payment-<hash>": "plant"
  }
}
```

**Important:** These two configs use different identifiers because the Function has access to payment method names via its GraphQL input, but the Checkout UI extension only sees opaque handles via `useSelectedPaymentOptions()`.

---

## Known Gotchas

1. **Payment method handles are not queryable** — The Admin API doesn't expose manual payment method handles. They can only be discovered by logging `useSelectedPaymentOptions()` in the Checkout UI extension at runtime.

2. **Two separate configs required** — The Function and Checkout UI extension need separate config metafields with different formats (names vs handles).

3. **`$app:` namespace prefix** — Metafields with this prefix are app-owned and only readable/writable by this app.

4. **Customer metafields use `custom` namespace** — This is merchant-owned, so metafields persist after app uninstall and can be edited via Shopify Admin.

5. **PaymentCustomization is per-store** — Each store that installs the app needs its own PaymentCustomization instance created.

---

## Suggested UI Pages

### 1. Setup / Configuration Page

- Status indicators: "Function detected ✓", "PaymentCustomization created ✓", "Config saved ✓"
- Form fields:
  - Co-op payment method name (default: "Co-op")
  - Plant payment method name (default: "Plant")
  - Co-op payment method handle (manual input with instructions)
  - Plant payment method handle (manual input with instructions)
- "Save Configuration" button
- Instructions for handle discovery (link to dev console method)

### 2. Customer Entitlements Page

- Searchable customer list
- Columns: Name, Email, Co-op Entitled, Plant Entitled
- Inline toggles or checkboxes for entitlements
- Bulk actions: "Grant Co-op to selected", "Grant Plant to selected", "Revoke all"

### 3. Status / Debug Page (optional)

- Show current PaymentCustomization config
- Show current Shop config
- Verification queries results
- Link to function logs in Partner Dashboard

---

## Files to Reference

- `docs/INSTALL.md` — Current manual setup steps (what to automate)
- `docs/TECHNICAL_IMPLEMENTATION.md` — Architecture and data model details
- `extensions/payment-customization/src/cart_payment_methods_transform_run.js` — Function logic
- `extensions/checkout-ui/src/Checkout.jsx` — Checkout UI logic and config parsing
- `shopify.app.toml` — App configuration and scopes

---

## Open Questions

1. **Handle discovery UX** — How to make this less painful? Options:
   - Detailed instructions with screenshots
   - A "test mode" that logs handles automatically
   - Accept that this is a one-time setup step

2. **Multi-store management** — The app uses Custom Distribution. Should the UI support managing config across multiple stores, or is per-store sufficient?

3. **Customer entitlement bulk import** — Should there be CSV import/export for entitlements?
