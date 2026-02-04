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

Config JSON shared between Function and Checkout UI:

```json
{
  "coOpPaymentMethodNames": ["Charge to Co-op Account (PO)"],
  "plantPaymentMethodNames": ["Charge to Plant Account (PO)"]
}
```

- `coOpPaymentMethodNames` - array of manual payment method labels that behave as Co-op (e.g., `"Charge to Co-op Account (PO)"`)
- `plantPaymentMethodNames` - array of manual payment method labels that behave as Plant (e.g., `"Charge to Plant Account (PO)"`)
- Labels must **exactly match** the payment method names in Shopify Admin (Settings → Payments → Manual payment methods)

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

Configure `shopify.extension.toml`:

```toml
api_version = "2025-10"

[[extensions]]
name = "Co-op/Plant Checkout Fields"
handle = "checkout-ui"
type = "ui_extension"

[[extensions.targeting]]
target = "purchase.checkout.block.render"
module = "./src/Checkout.jsx"

[extensions.capabilities]
block_progress = true
```

## 4.2 UI & Validation Behavior

**Rendering rules:**
- If no Co-op/Plant method selected → render nothing
- If Co-op method selected:
  - Render `Customer Code` (required), `Notes` (optional)
  - Set attributes: `co_op_type = "co-op"`, `co_op_customer_code`, `co_op_notes`
- If Plant method selected:
  - Render `Plant #` (required), `Notes` (optional)
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

- Co-op method selected → Customer Code field required, Notes optional
- Plant method selected → Plant # field required, Notes optional
- Empty required field → Checkout blocked with error message
- Order attributes set correctly after completion

## 6.3 Debugging

- Check function logs in Partner Dashboard → Extensions → Functions
- Verify `buyerIdentity` is populated (not `null`) in function input
- Verify customer is logged in during checkout
