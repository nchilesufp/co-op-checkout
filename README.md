# Co-op/Plant Payment App

A Shopify extension-only app that enables B2B buyers to checkout using Co-op or Plant account payment methods.

## Features

- **Payment Customization Function**: Hides Co-op and Plant payment methods for non-entitled customers (guests and customers without entitlement metafields)
- **Checkout UI Extension**: Displays required input fields (Customer Code dropdown or Plant # text field) when Co-op/Plant payment is selected
- **Shopify Flows**: Automates order data handling — copies Customer Code / Plant Number to searchable order metafields, initializes entitlement metafields for new customers

## Requirements

- **Shopify Plus** store (required for Payment Customization Functions and Checkout UI block targets)
- Node.js installed
- Shopify Partner account

## How It Works

1. **Manual payment methods** named "Co-op" and "Plant" are created in Shopify Admin
2. **Customer entitlements** are stored as boolean metafields (`custom.co_op`, `custom.plant`)
3. **Payment Customization Function** runs at checkout and hides payment methods the customer isn't entitled to
4. **Checkout UI Extension** renders input fields when an entitled customer selects Co-op or Plant; captures Customer Code or Plant Number as order attributes
5. **Shopify Flows** run on order creation to copy those attributes to searchable order metafields and add downstream processing tags

## Development

```bash
# Start dev server
npm run dev

# Deploy to production
shopify app deploy -c <org-name>
```

## Multi-Org Deployment

Each Shopify Plus organization requires its own app. Use config files:

```bash
# Link to a new org
shopify app config link --config deckorators

# Deploy to that org
shopify app deploy -c deckorators
```

## Documentation

- [Technical Implementation](docs/TECHNICAL_IMPLEMENTATION.md) - Architecture and implementation details
- [Install & Setup Guide](docs/INSTALL.md) - Deploy, install, and configure per-store
- [Customer Codes](docs/customer-codes.md) - List of valid customer codes for Co-op payment
- [Shopify Flows](docs/shopify-flows/) - `.flow` files for order data handling and customer initialization

## Key Files

| File | Purpose |
|------|---------|
| `extensions/payment-customization/src/cart_payment_methods_transform_run.js` | Function that hides payment methods |
| `extensions/checkout-ui/src/Checkout.jsx` | UI that renders input fields at checkout |
| `shopify.app.<org>.toml` | Per-org app configuration |
