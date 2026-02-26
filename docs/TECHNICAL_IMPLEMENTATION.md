# Co-op Checkout - Technical Implementation Document

## Key Capabilities Docs (Reference Links)

- **Payment Customization Function API**: [Payment Customization Function API](https://shopify.dev/docs/api/functions/latest/payment-customization)
- **Checkout UI Extensions**: [Checkout UI extensions](https://shopify.dev/docs/api/checkout-ui-extensions/2026-01)
- **Checkout UI standard APIs (buyerJourney, attributes, payments)**: [Checkout UI Standard API](https://shopify.dev/docs/api/checkout-ui-extensions/latest/apis/standardapi)
- **Admin GraphQL mutations**: [paymentCustomizationCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/paymentCustomizationCreate), [metafieldsSet](https://shopify.dev/docs/api/admin-graphql/latest/mutations/metafieldsSet)

---

# 1. High-Level Architecture

## 1.1 Surfaces and Components

The app is a **custom Shopify app** (Custom distribution, no App Store listing) with two extensions:

### 1. Payment Customization Function
- Template: `payment_customization`
- Target: `cart.payment-methods.transform.run`
- Purpose: Hide/show manual payment methods based on customer entitlements
- Matches payment methods by **name** (hardcoded: "co-op", "plant")

### 2. Checkout UI Extension
- Template: `checkout_ui`
- Target: `purchase.checkout.block.render` (Plus-only target)
- API version: `2026-01`
- Purpose:
  - Detect when Co-op or Plant payment method is selected
  - Render required input fields:
    - Co-op: `Customer Code` dropdown (required), optional `Big Box Order` yes/no radio (if configured), `Notes` (optional)
    - Plant: `Plant #` text field (required), `Notes` (optional)
  - Block checkout progress when required fields are missing
  - Store values in order attributes
- Matches payment methods by **handle** (hardcoded per-store)

## 1.2 No Backend / Server

- All runtime logic is in Shopify Functions and Checkout UI extensions
- Configuration is **hardcoded in source** for reliability (see Section 7: Gotchas)
- Per-store values (handles) require code changes and redeployment

---

# 2. Data Model & Configuration

## 2.1 Customer Entitlement Metafields

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

## 2.2 Hardcoded Configuration (No Metafields)

Both extensions use **hardcoded values** instead of reading from metafields. This approach was adopted after discovering that:
1. PaymentCustomization config metafields work in dev mode but fail silently in production (function input reads empty/null)
2. Shop metafields are not accessible to Checkout UI extensions via `useAppMetafields()` — returns `[]` even with proper metafield definitions and storefront access

### Payment Customization Function

Matches payment methods by **name** (case-insensitive, trimmed):

```javascript
// In cart_payment_methods_transform_run.js
const isCoOpMethod = name === "co-op";
const isPlantMethod = name === "plant";
```

Names must match the manual payment method names in Shopify Admin (Settings → Payments).

### Checkout UI Extension

Matches payment methods by **handle**, configured per-store via Checkout Editor settings with hardcoded fallbacks:

```javascript
// In Checkout.jsx
const settings = shopify.settings.value;
const coopHandle = String(settings.coop_payment_handle || 'custom-manual-payment-d8fbfb9b8f6ff61a1e835fd6452beaec');
const plantHandle = String(settings.plant_payment_handle || 'custom-manual-payment-56cf4b0afa456be23003a3c1792143a1');

const paymentMethodHandles = {
  [coopHandle]: 'co-op',
  [plantHandle]: 'plant',
};
```

Handles are opaque hashes unique to each store. When installing on a new store:
1. Discover the handles (see Section 5)
2. Paste them into the Checkout Editor settings for the Co-op Checkout block
No code change or redeploy needed.

### Optional Big Box Order Radio (Co-op only)

An optional yes/no radio field can be enabled per-store via the Checkout Editor setting **"Co-op Radio Question"** (`coop_radio_label`). When the setting is populated, the radio appears below the Customer Code dropdown during Co-op checkout and is required to proceed. The answer is stored as the `Big Box Order` order attribute with a value of `"true"` or `"false"`.

```javascript
const coopRadioLabel = String(settings.coop_radio_label || '');
const showCoopRadio = Boolean(coopRadioLabel);
```

If the setting is left blank (default), the radio is hidden and no attribute is written. This allows stores to opt in to the feature without affecting other stores.

---

# 3. Payment Customization Function Implementation

## 3.1 Key Files

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
}
```

## 3.3 Function Logic

```javascript
export function cartPaymentMethodsTransformRun(input) {
  const customer = input?.cart?.buyerIdentity?.customer;

  // Defaults: guests & customers without explicit flags are not entitled
  const isCoopEntitled = customer?.coop?.value === "true";
  const isPlantEntitled = customer?.plant?.value === "true";

  const operations = [];

  for (const method of input.paymentMethods ?? []) {
    const name = method.name.trim().toLowerCase();

    const isCoOpMethod = name === "co-op";
    const isPlantMethod = name === "plant";

    if (isCoOpMethod && !isCoopEntitled) {
      operations.push({
        paymentMethodHide: { paymentMethodId: method.id },
      });
    }

    if (isPlantMethod && !isPlantEntitled) {
      operations.push({
        paymentMethodHide: { paymentMethodId: method.id },
      });
    }
  }

  return operations.length === 0 ? { operations: [] } : { operations };
}
```

Key behaviors:
- Guest users (no `buyerIdentity.customer`) → both methods hidden
- Customers without entitlement metafields → both methods hidden
- Payment method names are matched case-insensitively after trimming

---

# 4. Checkout UI Extension Implementation

## 4.1 Key Files

- `extensions/checkout-ui/src/Checkout.jsx`
- `extensions/checkout-ui/shopify.extension.toml`

Key settings in `shopify.extension.toml`:

- `api_version = "2026-01"`
- `target = "purchase.checkout.block.render"` (Plus-only)
- `block_progress = true`

## 4.2 Handle Detection

Handles are read from Checkout Editor settings, with hardcoded fallbacks:

```javascript
const settings = shopify.settings.value;
const coopHandle = String(settings.coop_payment_handle || 'custom-manual-payment-d8fbfb9b8f6ff61a1e835fd6452beaec');
const plantHandle = String(settings.plant_payment_handle || 'custom-manual-payment-56cf4b0afa456be23003a3c1792143a1');

const paymentMethodHandles = {
  [coopHandle]: 'co-op',
  [plantHandle]: 'plant',
};

const selectedOptions = useSelectedPaymentOptions();
let selectedPaymentType = null;
for (const option of selectedOptions) {
  if (paymentMethodHandles[option.handle]) {
    selectedPaymentType = paymentMethodHandles[option.handle];
    break;
  }
}
// Fallback: on some stores, Shopify returns a name-based handle on return visits
// (e.g. "custom-manual-payment-co-op" instead of the hash). See Section 7 gotcha.
if (!selectedPaymentType) {
  for (const option of selectedOptions) {
    if (option.handle.includes('co-op')) { selectedPaymentType = 'co-op'; break; }
    if (option.handle.includes('plant')) { selectedPaymentType = 'plant'; break; }
  }
}
```

Settings are defined in `shopify.extension.toml` as `coop_radio_label`, `coop_payment_handle`, and `plant_payment_handle` (all `single_line_text_field` type). Merchants configure them in the Checkout Editor when placing the block.

## 4.3 UI & Validation Behavior

**Rendering rules:**
- If no Co-op/Plant method selected → render nothing
- If Co-op method selected:
  - Render `Customer Code` dropdown (required) — populated from `docs/customer-codes.md`
  - If `coop_radio_label` setting is configured: render yes/no radio with that label (required)
  - Render `Notes` textarea (optional)
  - Set attributes: `Payment Type = "Co-op"`, `Customer Code = "<code> <name>"`, optionally `Big Box Order = "true"/"false"`
  - Set order note from `Notes` field (standard Shopify order note, not an attribute)
- If Plant method selected:
  - Render `Plant #` text field (required)
  - Render `Notes` textarea (optional)
  - Set attributes: `Payment Type = "Plant"`, `Plant Number = "<value>"`
  - Set order note from `Notes` field (standard Shopify order note, not an attribute)

**Validation:**
- Uses `useBuyerJourneyIntercept` to block progress when required fields are empty
- Error message shown only after user attempts to proceed (not on initial load)

---

# 5. Setup & Install Flow

## Per-Store Setup

1. **Create manual payment methods** in Shopify Admin
   - Settings → Payments → Manual payment methods
   - Create "Co-op" and "Plant" (names must be exactly "Co-op" and "Plant")

2. **Install app** on Shopify Plus store
   - Custom distribution app with protected customer data access

3. **Discover payment method handles** (for Checkout UI — new stores only)
   - Payment method handles are opaque hashes unique to each store (e.g., `custom-manual-payment-<hash>`)
   - They cannot be queried via Admin API — they must be logged at runtime
   - Add temporary console.log to `Checkout.jsx`:
     ```javascript
     console.log('selectedOptions:', selectedOptions);
     ```
   - Run `npm run dev` and go through checkout on the target store
   - Select Co-op, note the handle from the browser console; select Plant, note the handle
   - Remove the console.log
   - Paste the handles into the Checkout Editor settings for the Co-op Checkout block (see step 8)

4. **Create PaymentCustomization instance** via GraphQL
   - See INSTALL.md Steps 1-2

5. **Import Shopify Flows**
   - See INSTALL.md Step 3

6. **Create order metafield definitions** via Admin UI
   - See INSTALL.md Step 4

7. **Create customer entitlement metafield definitions** via Admin UI
   - See INSTALL.md Step 5

8. **Add Checkout UI block** in Checkout Editor
   - Enable "Block checkout progress" in the block settings

9. **Set customer entitlements** via Admin UI
   - See INSTALL.md Step 6

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

- Co-op method selected → Customer Code dropdown appears with all codes, Notes optional
- Plant method selected → Plant # text field appears, Notes optional
- No code/number entered → Checkout blocked with error message
- Order attributes set correctly after completion (`co_op_type`, `co_op_customer_code` or `co_op_plant_number`, `co_op_notes`)
- Return visit (leave checkout, come back with Co-op/Plant pre-selected) → fields still render and validation still blocks

## 6.3 Debugging

- Check function logs in Partner Dashboard → Extensions → Functions
- Verify `buyerIdentity` is populated (not `null`) in function input
- Verify customer is logged in during checkout
- Check browser console for extension errors

---

# 7. Gotchas & Lessons Learned

These are non-obvious platform behaviors discovered during development. Read before debugging.

### Metafield config doesn't work reliably in production

Both extensions were originally designed to read configuration from metafields:
- PaymentCustomization config metafield (for payment method names)
- Shop metafield (for payment method handles)

**What we discovered:**
- The PaymentCustomization config metafield worked in dev mode (`shopify app dev`) but was empty/null when the function ran in production after `shopify app deploy`
- The Shop metafield was never accessible from the Checkout UI extension — `useAppMetafields()` returned `[]` even after creating proper metafield definitions with storefront access

**Solution:** Payment method names are hardcoded in the function source (reliable). Payment method handles use Checkout Editor extension settings (configurable per-store without code changes), with hardcoded fallbacks for safety.

### Payment method handles are opaque hashes, not derived from names

Handles look like `custom-manual-payment-56cf4b0afa456be23003a3c1792143a1`. They are **not** slugified versions of the payment method name. Do not try to compute them from names. The only way to discover a handle is to log `useSelectedPaymentOptions()` at runtime and select each payment method.

### Handles are stable, but only while the payment method exists

A manual payment method's handle does not change across sessions or page reloads. It changes only if the payment method is deleted and recreated in Admin. If you recreate a payment method, you must:
1. Re-discover the new handle
2. Update the handle in the Checkout Editor settings for the Co-op Checkout block

### Shopify may return a different handle format on return visits

On some stores, when a buyer leaves checkout and returns with a payment method pre-selected from their previous session, `useSelectedPaymentOptions()` returns a **name-based handle** (e.g., `custom-manual-payment-co-op`) instead of the usual hash-based handle (e.g., `custom-manual-payment-a10cd6c44f627f6a0a3be7f57cd3baad`). This only affects the pre-selected state on return — actively clicking the payment method returns the correct hash handle.

The Checkout UI extension handles this with a two-pass matching strategy: exact handle match first, then a name-based fallback that checks if the handle contains `co-op` or `plant`. This behavior has been observed on production stores but not dev stores.

### Payment method names must match exactly

The Payment Customization Function matches names case-insensitively after trimming. The manual payment methods in Shopify Admin must be named "Co-op" and "Plant" (or any casing that normalizes to "co-op" and "plant").

### `<s-text-field>` does not support `multiline`

Use `<s-text-area>` for multi-line input. It accepts the same core props (`label`, `value`, `onInput`) plus `rows`.

### `<s-select>` uses `onChange`, not `onInput`

The select component fires `change` when a selection is completed. Use `onChange` for the handler. The `value` is read the same way as other fields: `e.currentTarget.value`.

### Checkout Editor caches the dev tunnel URL

Each `shopify app dev` session creates a new Cloudflare tunnel. The Checkout Editor saves the URL from the first session and does not update it. If the extension block is not appearing, do not navigate checkout manually — use the preview link from the dev console at `<tunnel>/extensions/dev-console`.

### Multi-org deployment requires separate apps and config files

Each Shopify Plus organization requires its own app in the Partner Dashboard. Use named config files (`shopify.app.<org-name>.toml`) to manage multiple apps from the same codebase:

```bash
# Create config for new org
shopify app config link --config deckorators

# Deploy to that org
shopify app deploy -c deckorators
```

### Deploying automatically builds

`shopify app deploy` runs the build step for all extensions before deploying. You don't need to run `npm run build` separately.

---

# 8. Order Data Reference

After a successful checkout with Co-op or Plant payment, this data is set on the order:

**Order Attributes** (under "Additional details"):

| Attribute | Example Value |
|-----------|---------------|
| `Payment Type` | `"Co-op"` or `"Plant"` |
| `Customer Code` | `"9050 UFP International"` (Co-op only) |
| `Plant Number` | `"12345"` (Plant only) |
| `Big Box Order` | `"true"` or `"false"` (Co-op only, when radio is configured) |

**Order Note** (under "Notes from customer"):

The optional notes field saves to the standard Shopify order note, not a custom attribute.

Access these in the Shopify Admin order details or via the Orders API.

---

# 9. Shopify Flows

Two Shopify Flows automate data handling for Co-op/Plant orders. These flows are stored in `docs/shopify-flows/` and can be imported on new stores.

## 9.1 Order Created: Assign Metafields and MSR Tags

**File:** `docs/shopify-flows/Assign Co-op and Plant metafields and MSR tags.flow`

Trigger: `order_created`. Logic runs as two sequential conditions:

```
IF paymentGatewayNames contains "Co-op"
  → Set custom.co_op_customer_code  (Customer Code attribute value)
  → Set custom.big_box_order  (Big Box Order attribute value, boolean metafield)
  → Set checkoutcustomizer.customercode_v1  (first 4 chars of Customer Code)
  → Add "Send to MSR" tag
ELSE IF paymentGatewayNames contains "Plant"
  → Set custom.plant_number  (Plant Number attribute value)
  → Add "Send to MSR" tag
ELSE (all other payment methods)
  → Set checkoutcustomizer.customercode_v1 = "CAHM"
  → Add "Send to MSR" tag
```

All orders receive the "Send to MSR" tag regardless of payment method. Plant orders do **not** set `checkoutcustomizer.customercode_v1`.

### Metafields Set on Orders

| Metafield | Value | Condition |
|-----------|-------|-----------|
| `custom.co_op_customer_code` | Customer Code attribute (`"<code> <name>"`) | Payment = Co-op |
| `custom.big_box_order` | Big Box Order attribute (`"true"` or `"false"`) | Payment = Co-op |
| `custom.plant_number` | Plant Number attribute | Payment = Plant |
| `checkoutcustomizer.customercode_v1` | First 4 chars of Customer Code (e.g. `"9050"`) | Payment = Co-op |
| `checkoutcustomizer.customercode_v1` | `"CAHM"` | All other payment methods |

### Liquid Templates Used

Extract full Customer Code value (for `custom.co_op_customer_code`):
```liquid
{% for attr in order.customAttributes %}{% if attr.key == 'Customer Code' or attr.key == 'co_op_customer_code' %}{{ attr.value }}{% endif %}{% endfor %}
```

Extract 4-char code only (for `checkoutcustomizer.customercode_v1`):
```liquid
{% for attr in order.customAttributes %}{% if attr.key == 'Customer Code' or attr.key == 'co_op_customer_code' %}{{ attr.value | strip_newlines | slice: 0, 4 }}{% endif %}{% endfor %}
```

Extract Big Box Order value (for `custom.big_box_order`):
```liquid
{% for attr in order.customAttributes %}{% if attr.key == 'Big Box Order' %}{{ attr.value }}{% endif %}{% endfor %}
```

Extract Plant Number value (for `custom.plant_number`):
```liquid
{% for attr in order.customAttributes %}{% if attr.key == 'Plant Number' or attr.key == 'co_op_plant_number' %}{{ attr.value }}{% endif %}{% endfor %}
```

### Why Metafields?

Order attributes are not searchable in Shopify Admin. This flow copies attribute values to metafields, which can be:
- Searched and filtered in Admin
- Used in reports
- Accessed via API

## 9.2 Customer Created: Initialize Entitlements

**File:** `docs/shopify-flows/Set Co-op or Plant metafield to false for new customers.flow`

Trigger: `customer_created`. Runs two parallel checks:

1. If `custom.co_op` is **not already `true`** → set `custom.co_op = false`
2. If `custom.plant` is **not already `true`** → set `custom.plant = false`

This ensures new customers have explicitly `false` entitlements rather than an unset metafield, so the payment function behaves consistently (both unset and `false` are treated as not entitled, but explicit values are cleaner).

## 9.3 Importing Flows

To import a flow on a new store:
1. Go to **Settings → Flow**
2. Click **Import**
3. Select the `.flow` file
4. Review and activate

**Note:** The `checkoutcustomizer.customercode_v1` metafield (named "MSR Customer Code" in Admin) and "Send to MSR" tag are specific to the Deckorators MSR integration. The metafield definition is created by a separate legacy custom app called "MSR Integration", installed by IT. Other stores may need to modify or remove these actions from the Flow.
