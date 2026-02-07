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
    - Co-op: `Customer Code` dropdown (required), `Notes` (optional)
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
1. PaymentCustomization config metafields work in dev mode but fail silently in production
2. Shop metafields are not accessible to Checkout UI extensions via `useAppMetafields()`

### Payment Customization Function

Matches payment methods by **name** (case-insensitive, trimmed):

```javascript
// In cart_payment_methods_transform_run.js
const isCoOpMethod = name === "co-op";
const isPlantMethod = name === "plant";
```

Names must match the manual payment method names in Shopify Admin (Settings → Payments).

### Checkout UI Extension

Matches payment methods by **handle**:

```javascript
// In Checkout.jsx
const paymentMethodHandles = {
  'custom-manual-payment-a10cd6c44f627f6a0a3be7f57cd3baad': 'co-op',
  'custom-manual-payment-414957dd431505fb5d4dadc40c7554ef': 'plant',
};
```

Handles are opaque hashes unique to each store. When deploying to a new store, you must:
1. Discover the handles (see Section 5)
2. Update the hardcoded values in `Checkout.jsx`
3. Redeploy

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

```javascript
const paymentMethodHandles = {
  'custom-manual-payment-a10cd6c44f627f6a0a3be7f57cd3baad': 'co-op',
  'custom-manual-payment-414957dd431505fb5d4dadc40c7554ef': 'plant',
};

const selectedOptions = useSelectedPaymentOptions();
let selectedPaymentType = null;
for (const option of selectedOptions) {
  if (paymentMethodHandles[option.handle]) {
    selectedPaymentType = paymentMethodHandles[option.handle];
    break;
  }
}
```

## 4.3 UI & Validation Behavior

**Rendering rules:**
- If no Co-op/Plant method selected → render nothing
- If Co-op method selected:
  - Render `Customer Code` dropdown (required) — populated from `docs/customer-codes.md`
  - Render `Notes` textarea (optional)
  - Set attributes: `co_op_type = "co-op"`, `co_op_customer_code`, `co_op_notes`
- If Plant method selected:
  - Render `Plant #` text field (required)
  - Render `Notes` textarea (optional)
  - Set attributes: `co_op_type = "plant"`, `co_op_plant_number`, `co_op_notes`

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

3. **Discover payment method handles** (for Checkout UI)
   - Add temporary console.log to `Checkout.jsx`:
     ```javascript
     console.log('handle:', selectedOptions[0]?.handle);
     ```
   - Deploy and go through checkout on the target store
   - Select Co-op, note the handle from browser console
   - Select Plant, note the handle
   - Update the `paymentMethodHandles` object in `Checkout.jsx`
   - Remove the console.log and redeploy

4. **Create PaymentCustomization instance** via GraphQL
   - See INSTALL.md Steps 1-2

5. **Create customer entitlement metafield definitions** via Admin UI
   - Settings → Custom data → Customers → Add definition
   - Create "Co-op" (boolean, key: `co_op`, namespace: `custom`)
   - Create "Plant" (boolean, key: `plant`, namespace: `custom`)

6. **Add Checkout UI block** in Checkout Editor
   - Enable "Block checkout progress" in the block settings

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

- Co-op method selected → Customer Code dropdown appears with all codes, Notes optional
- Plant method selected → Plant # text field appears, Notes optional
- No code/number entered → Checkout blocked with error message
- Order attributes set correctly after completion (`co_op_type`, `co_op_customer_code` or `co_op_plant_number`, `co_op_notes`)

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

**Solution:** Hardcode the values directly in the source code. This is less flexible but 100% reliable.

### Payment method handles are opaque hashes, not derived from names

Handles look like `custom-manual-payment-56cf4b0afa456be23003a3c1792143a1`. They are **not** slugified versions of the payment method name. Do not try to compute them from names. The only way to discover a handle is to log `useSelectedPaymentOptions()` at runtime and select each payment method.

### Handles are stable, but only while the payment method exists

A manual payment method's handle does not change across sessions or page reloads. It changes only if the payment method is deleted and recreated in Admin. If you recreate a payment method, you must:
1. Re-discover the new handle
2. Update `Checkout.jsx`
3. Redeploy

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

**Order Note** (under "Notes from customer"):

The optional notes field saves to the standard Shopify order note, not a custom attribute.

Access these in the Shopify Admin order details or via the Orders API.

---

# 9. Shopify Flows

Two Shopify Flows automate data handling for Co-op/Plant orders. These flows are stored in `docs/shopify-flows/` and can be imported on new stores.

## 9.1 Order Created: Assign Metafields and MSR Tags

**File:** `docs/shopify-flows/Assign Co-op and Plant metafields and MSR tags.flow`

This flow runs when an order is created and:
1. Checks the payment gateway name
2. For Co-op/Plant orders:
   - Copies the Customer Code or Plant Number attribute to a searchable order metafield
   - Sets `checkoutcustomizer.customercode_v1` = "9201"
   - Adds "Send to MSR" tag
3. For other orders:
   - Sets `checkoutcustomizer.customercode_v1` = "MOWI"
   - Adds "Send to MSR" tag

### Metafields Created

| Metafield | Source Attribute | Condition |
|-----------|------------------|-----------|
| `custom.co_op_customer_code` | Customer Code | Payment = Co-op |
| `custom.plant_number` | Plant Number | Payment = Plant |
| `checkoutcustomizer.customercode_v1` | (hardcoded) | Always (9201 for Co-op/Plant, MOWI otherwise) |

### Liquid Template for Attribute Extraction

The flow uses this Liquid template to extract attribute values:

```liquid
{% for attr in order.customAttributes %}{% if attr.key == 'Customer Code' or attr.key == 'co_op_customer_code' %}{{ attr.value }}{% endif %}{% endfor %}
```

### Why Metafields?

Order attributes are not searchable in Shopify Admin. This flow copies attribute values to metafields, which can be:
- Searched and filtered in Admin
- Used in reports
- Accessed via API

## 9.2 Customer Created: Initialize Entitlements

**File:** `docs/shopify-flows/Set Co-op or Plant metafield to false for new customers.flow`

This flow runs when a customer is created and sets both entitlement metafields to `false` if they don't already have a value:
- `custom.co_op` → false
- `custom.plant` → false

This ensures consistent behavior for new customers — explicitly `false` rather than unset.

## 9.3 Importing Flows

To import a flow on a new store:
1. Go to **Settings → Flow**
2. Click **Import**
3. Select the `.flow` file
4. Review and activate

**Note:** The `checkoutcustomizer.customercode_v1` metafield and "Send to MSR" tag are specific to the Deckorators MSR integration. Other stores may need to modify or remove these actions.
