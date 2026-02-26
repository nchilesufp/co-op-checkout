# Co-op/Plant Payment App - Current State Overview (Pre-Backend)

## Purpose

This app enables entitled B2B customers to use manual payment methods (`Co-op` and `Plant`) at Shopify checkout, while collecting required account details for the selected method.

This document reflects the current implementation in code before introducing a backend service.

## What Exists Today

- Shopify custom-distribution app (not App Store listed)
- No backend/server runtime
- Two Shopify extensions:
  - Payment Customization Function: hides unauthorized payment methods
  - Checkout UI Extension: renders required fields and blocks checkout progress when missing
- Two Shopify Flow automations for downstream order/customer data handling

## Architecture Snapshot

### 1) Payment Customization Function

- File: `extensions/payment-customization/src/cart_payment_methods_transform_run.js`
- Target: `cart.payment-methods.transform.run`
- API version: `2025-07`
- Behavior:
  - Reads customer metafields:
    - `custom.co_op`
    - `custom.plant`
  - Matches payment method names case-insensitively after trim:
    - `co-op`
    - `plant`
  - Hides Co-op when `custom.co_op !== "true"`
  - Hides Plant when `custom.plant !== "true"`
  - Guests/non-logged-in buyers are treated as non-entitled

### 2) Checkout UI Extension

- File: `extensions/checkout-ui/src/Checkout.jsx`
- Target: `purchase.checkout.block.render`
- API version: `2026-01`
- `block_progress = true` enabled in extension config
- Behavior:
  - Detects selected payment method using handle map (configured via Checkout Editor settings, with hardcoded fallbacks; includes name-based fallback for return-visit handle variants)
  - If Co-op selected:
    - Shows required `Customer Code` select (code list hardcoded in source)
    - Optionally shows required `Big Box Order` yes/no radio (if `coop_radio_label` setting is configured in Checkout Editor)
    - Shows optional `Notes`
  - If Plant selected:
    - Shows required `Plant #` text input
    - Shows optional `Notes`
  - Blocks checkout on proceed if required field is missing
  - Writes order data:
    - Attributes: `Payment Type`, `Customer Code`, `Plant Number`, `Big Box Order` (Co-op only, when radio is configured)
    - Order note: optional `Notes`
  - Clears attributes/note when shopper switches away from Co-op/Plant

## Data Model (Current)

### Customer Entitlements (source of truth)

- Owner: Customer
- Namespace/key:
  - `custom.co_op` (boolean)
  - `custom.plant` (boolean)
- Set manually in Admin (and optionally initialized by Flow, below)

### Checkout-Captured Order Data

- Order attributes:
  - `Payment Type` = `Co-op` or `Plant`
  - `Customer Code` (Co-op path)
  - `Plant Number` (Plant path)
  - `Big Box Order` = `"true"` or `"false"` (Co-op path, only when radio is configured)
- Order note:
  - free-text `Notes`

## Deployment and Store Setup (Current Process)

- Deploy via Shopify CLI (`npm run deploy`)
- Install via custom-distribution link
- Per store:
  - Create manual payment methods named `Co-op` and `Plant`
  - Ensure Customer metafield definitions exist (`custom.co_op`, `custom.plant`)
  - Set customer entitlement values
  - Place Checkout UI block in Checkout Editor and enable block checkout progress
  - Configure payment method handles in the Checkout Editor settings for the Co-op Checkout block

## Shopify Flows in Repo

### Flow A: Assign Co-op and Plant metafields and MSR tags

- File: `docs/shopify-flows/Assign Co-op and Plant metafields and MSR tags.flow`
- Trigger: order created
- Observed behavior:
  - If payment gateways include `Co-op` or `Plant`:
    - Sets `checkoutcustomizer.customercode_v1 = "9201"`
    - Adds tag `Send to MSR`
  - Else:
    - Sets `checkoutcustomizer.customercode_v1 = "MOWI"`
    - Adds tag `Send to MSR`
  - Additional branch actions:
    - If payment gateway includes `Plant`, copies order attribute value to `custom.plant_number`
    - If payment gateway includes `Co-op`, copies order attribute value to `custom.co_op_customer_code` and `custom.big_box_order` (boolean)
  - Liquid extraction supports legacy/current keys:
    - `Customer Code` or `co_op_customer_code`
    - `Plant Number` or `co_op_plant_number`

### Flow B: Set Co-op or Plant metafield to false for new customers

- File: `docs/shopify-flows/Set Co-op or Plant metafield to false for new customers.flow`
- Trigger: customer created
- Observed behavior:
  - Sets `custom.co_op = false` unless already true
  - Sets `custom.plant = false` unless already true

## Known Constraints and Risks (Pre-Backend)

- Store-specific payment handles are configured via Checkout Editor settings (no code change needed), with hardcoded fallbacks
- Logic is split across multiple surfaces (function, UI extension, Shopify Flow), increasing operational setup complexity
- Configuration is partly manual in Shopify Admin (payment methods, checkout block placement, metafields)
- No centralized audit/config management layer yet (expected backend gap)

## Documentation Mismatches to Resolve

- `docs/TECHNICAL_IMPLEMENTATION.md` contains mixed attribute naming examples in different sections (`co_op_*` vs `Payment Type`/`Customer Code`/`Plant Number`)

## Confirmed Decisions

1. Payment handles are configured per-store via Checkout Editor extension settings, with hardcoded fallbacks for reliability.
2. Setup docs should remove old Shop config/metafield setup where not needed by current code.
3. Both Shopify Flows are required for all orgs, including MSR tagging flow behavior.

## Open Question

1. Should downstream integrations treat `Payment Type` / `Customer Code` / `Plant Number` as canonical order keys, with `co_op_*` accepted only for backward compatibility?
