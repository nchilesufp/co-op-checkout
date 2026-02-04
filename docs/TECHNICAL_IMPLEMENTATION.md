# Co-op Checkout - Technical Implementation Document

## Key Capabilities Docs (Reference Links)

- **Payment Customization Function API**: [Payment Customization Function API](https://shopify.dev/docs/api/functions/latest/payment-customization)
- **Configuring Functions with metafields**: [Add configuration to the payments function](https://shopify.dev/docs/apps/build/checkout/payments/add-configuration)
- **Checkout UI Extensions**: [Checkout UI extensions](https://shopify.dev/docs/api/checkout-ui-extensions/2025-10)
- **Checkout UI standard APIs (buyerJourney, attributes, payments)**: [Checkout UI Standard API](https://shopify.dev/docs/api/checkout-ui-extensions/latest/apis/standardapi)
- **Admin GraphQL mutations**: [paymentCustomizationCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/paymentCustomizationCreate), [metafieldsSet](https://shopify.dev/docs/api/admin-graphql/latest/mutations/metafieldsSet)
- **Metafields for Functions input queries**: [Metafields in Functions input queries](https://shopify.dev/docs/apps/build/functions/input-output/metafields-for-input-queries)

---

# 1. High-Level Architecture

## 1.1 Surfaces and Components

The app is a **custom Shopify app** (Custom distribution, no App Store listing) with two extensions:

### 1. Payment Customization Function
- Template: `payment_customization`
- Target: `cart.payment-methods.transform.run`
- Purpose: Hide/show manual payment methods based on:
  - Per-customer entitlement via two boolean metafields: `custom.co_op` and `custom.plant`
  - Per-store config mapping payment method labels to Co-op/Plant roles

### 2. Checkout UI Extension
- Template: `checkout_ui`
- Target: `purchase.checkout.block.render` (Plus-only target)
- API version: `2025-10`
- Purpose:
  - Detect when Co-op or Plant payment method is selected
  - Render required input fields:
    - Co-op: `Customer Code` (required), `Notes` (optional)
    - Plant: `Plant #` (required), `Notes` (optional)
  - Block checkout progress when required fields are missing
  - Store values in order attributes

## 1.2 No Backend / Server

- All runtime logic is in Shopify Functions and Checkout UI extensions
- Configuration stored in metafields only
- Configuration writes done via Admin GraphQL (GraphiQL runbooks)

---

# 2. Data Model & Configuration

## 2.1 Namespaces & Keys

### Customer entitlement metafields

| Property | Value |
|----------|-------|
| Owner | `Customer` |
| Namespace | `custom` |
| Keys | `co_op`, `plant` |
| Type | `boolean` |

Effective entitlement model:
- **Co-op only**: `co_op = true`, `plant = false`
- **Plant only**: `co_op = false`, `plant = true`
- **Both**: `co_op = true`, `plant = true`
- **None**: both `false` or unset

These metafields use the `custom` namespace (merchant-owned) so they:
- Persist after app uninstall
- Can be created/edited via Shopify Admin UI
- Appear as checkboxes when pinned to Customer records

### PaymentCustomization config metafield (Function side)

| Property | Value |
|----------|-------|
| Owner | `PaymentCustomization` |
| Namespace | `$app:payment-customization` |
| Key | `function-configuration` |
| Type | `json` |

### Shop config metafield (Checkout UI side)

| Property | Value |
|----------|-------|
| Owner | `Shop` |
| Namespace | `$app:co-op-plant-payment` |
| Key | `configuration` |
| Type | `json` |

## 2.2 Config JSON Structure

The two extensions use **different** config formats because they have different data available to them.

### PaymentCustomization config (Function — Step 3)

Matches payment methods by **name** (available via the Function's GraphQL input query):

```json
{
  "coOpPaymentMethodNames": ["Charge to Co-op Account (PO)"],
  "plantPaymentMethodNames": ["Charge to Plant Account (PO)"]
}
```

Names must **exactly match** the payment method names in Shopify Admin (Settings → Payments → Manual payment methods).

### Shop config (Checkout UI — Step 5)

Matches payment methods by **handle** (the only identifier exposed by `useSelectedPaymentOptions()`). Uses a handle-to-type map:

```json
{
  "paymentMethodHandles": {
    "custom-manual-payment-<coop-hash>": "co-op",
    "custom-manual-payment-<plant-hash>": "plant"
  }
}
```

Handles are opaque and stable for the lifetime of a manual payment method. Discover them by logging `useSelectedPaymentOptions()` at checkout during development.

---

# 3. Payment Customization Function Implementation

## 3.1 Scaffolding

```bash
shopify app generate extension --template payment_customization --name=payment-customization
```

Key files:
- `extensions/payment-customization/src/cart_payment_methods_transform_run.graphql`
- `extensions/payment-customization/src/cart_payment_methods_transform_run.js`
- `extensions/payment-customization/shopify.extension.toml`

## 3.2 Input Query

```graphql
query CartPaymentMethodsTransformRunInput {
  cart {
    buyerIdentity {
      customer {
        coop: metafield(namespace: "custom", key: "co_op") {
          value
        }
        plant: metafield(namespace: "custom", key: "plant") {
          value
        }
      }
    }
  }
  paymentMethods {
    id
    name
  }
  paymentCustomization {
    metafield(namespace: "$app:payment-customization", key: "function-configuration") {
      value
    }
  }
}
```

## 3.3 Function Logic

```javascript
export function cartPaymentMethodsTransformRun(input) {
  const operations = [];
  const customer = input.cart?.buyerIdentity?.customer;

  // Read boolean entitlements (metafield values are strings: "true" or "false")
  const isCoopEntitled = customer?.coop?.value === "true";
  const isPlantEntitled = customer?.plant?.value === "true";

  // Read config from paymentCustomization metafield
  const configValue = input.paymentCustomization?.metafield?.value;
  const config = configValue ? JSON.parse(configValue) : {};
  const coOpNames = config.coOpPaymentMethodNames || [];
  const plantNames = config.plantPaymentMethodNames || [];

  // Hide payment methods based on entitlements
  for (const method of input.paymentMethods || []) {
    const isCoopMethod = coOpNames.includes(method.name);
    const isPlantMethod = plantNames.includes(method.name);

    if (isCoopMethod && !isCoopEntitled) {
      operations.push({
        paymentMethodHide: { paymentMethodId: method.id }
      });
    }

    if (isPlantMethod && !isPlantEntitled) {
      operations.push({
        paymentMethodHide: { paymentMethodId: method.id }
      });
    }
  }

  return { operations };
}
```

Key behaviors:
- If customer entitlement metafields are unset or `"false"` → hide corresponding payment methods
- If config is missing or malformed → fail open (no operations)

---

# 4. Checkout UI Extension Implementation

## 4.1 Scaffolding

```bash
shopify app generate extension --template checkout_ui --name=checkout-ui
```

Key settings in `shopify.extension.toml`:

- `api_version = "2026-01"`
- `target = "purchase.checkout.block.render"` (Plus-only)
- `block_progress = true`
- Metafield declaration: namespace `$app:co-op-plant-payment`, key `configuration`

## 4.2 UI & Validation Behavior

**Rendering rules:**
- If no Co-op/Plant method selected → render nothing
- If Co-op method selected:
  - Render `Customer Code` dropdown (required) — populated from `docs/customer-codes.md`. Display: `"Code - Name"`, value: code only.
  - Render `Notes` textarea (optional)
  - Set attributes: `co_op_type = "co-op"`, `co_op_customer_code`, `co_op_notes`
- If Plant method selected:
  - Render `Plant #` text field (required)
  - Render `Notes` textarea (optional)
  - Set attributes: `co_op_type = "plant"`, `co_op_plant_number`, `co_op_notes`

**Validation:**
- Use `buyerJourney.intercept` to block progress when required fields are empty

---

# 5. Setup & Install Flow

1. **Create manual payment methods** in Shopify Admin
   - Settings → Payments → Manual payment methods
   - Create "Charge to Co-op Account (PO)" and "Charge to Plant Account (PO)" (names must match config exactly)

2. **Install app** on Shopify Plus store
   - Custom distribution app with protected customer data access

3. **Create PaymentCustomization instance** via GraphQL
   - See GRAPHQL_RUNBOOK.md Step 2

4. **Set config metafields** via GraphQL
   - PaymentCustomization metafield (Step 3)
   - Shop metafield (Step 5)

5. **Create customer entitlement metafield definitions** via Admin UI
   - Settings → Custom data → Customers → Add definition
   - Create "Co-op Entitlement" (boolean, key: `co_op`, namespace: `custom`)
   - Create "Plant Entitlement" (boolean, key: `plant`, namespace: `custom`)

6. **Add Checkout UI block** in Checkout Editor

7. **Set customer entitlements** via Admin UI
   - Customers → select customer → Metafields section → toggle checkboxes

---

# 6. Testing

## 6.1 Entitlement Test Cases

| Customer State | Expected Result |
|---------------|-----------------|
| Guest / not logged in | Co-op and Plant methods hidden |
| No entitlement metafields | Co-op and Plant methods hidden |
| `co_op = true` only | Co-op visible, Plant hidden |
| `plant = true` only | Plant visible, Co-op hidden |
| Both `true` | Both visible |

## 6.2 Checkout UI Test Cases

- Co-op method selected → Customer Code dropdown appears with all 34 codes, Notes optional
- Plant method selected → Plant # text field appears, Notes optional
- No code/number selected → Checkout blocked with error message
- Order attributes set correctly after completion (`co_op_type`, `co_op_customer_code` or `co_op_plant_number`, `co_op_notes`)

## 6.3 Debugging

- Check function logs in Partner Dashboard → Extensions → Functions
- Verify `buyerIdentity` is populated (not `null`) in function input
- Verify customer is logged in during checkout

---

# 7. Gotchas & Lessons Learned

These are non-obvious platform behaviors discovered during development. Read before debugging.

### Payment method handles are opaque hashes, not derived from names

Handles look like `custom-manual-payment-56cf4b0afa456be23003a3c1792143a1`. They are **not** slugified versions of the payment method name. Do not try to compute them from names. The only way to discover a handle is to log `useSelectedPaymentOptions()` at runtime and select each payment method.

### Function and Checkout UI configs must use different formats

The Payment Customization Function receives payment method **names** via its GraphQL input query. The Checkout UI Extension only receives **handles** via `useSelectedPaymentOptions()`. These are different identifiers with different stability characteristics. The two config metafields (Step 3 and Step 5) must therefore store different data. This is a platform limitation, not a design choice.

### Handles are stable, but only while the payment method exists

A manual payment method's handle does not change across sessions or page reloads. It changes only if the payment method is deleted and recreated in Admin. If you recreate a payment method, re-run Step 5.

### `useAppMetafields()` loads asynchronously

The first render of the extension will receive an empty array from `useAppMetafields()`. The metafield value is available on subsequent renders. The extension must handle the empty case gracefully — returning `null` (rendering nothing) until config is loaded is the correct behavior.

### `<s-text-field>` does not support `multiline`

Use `<s-text-area>` for multi-line input. It accepts the same core props (`label`, `value`, `onInput`) plus `rows`.

### `<s-select>` uses `onChange`, not `onInput`

The select component fires `change` when a selection is completed. Use `onChange` for the handler. The `value` is read the same way as other fields: `e.currentTarget.value`.

### Checkout Editor caches the dev tunnel URL

Each `shopify app dev` session creates a new Cloudflare tunnel. The Checkout Editor saves the URL from the first session and does not update it. If the extension block is not appearing, do not navigate checkout manually — use the preview link from the dev console at `<tunnel>/extensions/dev-console`.
