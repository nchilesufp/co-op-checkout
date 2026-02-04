# Co-op/Plant Payment App

A Shopify extension-only app that enables B2B buyers to checkout using Co-op or Plant account payment methods.

## Features

- **Payment Customization Function**: Hides/shows Co-op and Plant payment methods based on customer entitlements
- **Checkout UI Extension**: Displays required input fields (Customer Code or Plant #) when Co-op/Plant payment is selected

## Requirements

- **Shopify Plus** store (required for Payment Customization Functions and Checkout UI block targets)
- Node.js installed
- Shopify Partner account with a Plus sandbox store

## Getting Started

### 1. Create a Plus Sandbox Store

This app requires Shopify Plus features. In your Partner Dashboard:
1. Go to Stores > Add store
2. Select "Development store"
3. Choose "Create a store to test and build" with **Shopify Plus** features

### 2. Start Development

```bash
npm run dev
```

When prompted, select your Plus sandbox store.

### 3. Configure the App

See [docs/INSTALL.md](docs/INSTALL.md) for complete setup instructions including:
- Creating manual payment methods
- Configuring metafields via GraphQL
- Setting customer entitlements

## Development Commands

```bash
# Start dev server (select your Plus store when prompted)
npm run dev

# Build extensions
npm run build

# Deploy to production
npm run deploy

# Open GraphiQL (press 'g' while dev server is running)
```

## Documentation

- [Technical Implementation](docs/TECHNICAL_IMPLEMENTATION.md) - Architecture and implementation details
- [Install & Setup Guide](docs/INSTALL.md) - Deploy, install, and configure
