# Security Policy

## Scope

This app is a private, custom-distribution Shopify app. It has no public-facing endpoints — all logic runs inside Shopify Functions and Checkout UI Extensions.

## Sensitive data handled

- **Customer entitlement metafields** (`custom.co_op`, `custom.plant`) — read-only during checkout via the Function's input query. The app scopes are `read_customers` and `write_customers`.
- **Order attributes** (`co_op_type`, `co_op_customer_code`, `co_op_plant_number`, `co_op_notes`) — written by the Checkout UI Extension during checkout.
- **App configuration** stored in metafields under app-owned namespaces (`$app:*`). No secrets are stored in config; it contains only payment method identifiers and handles.

## Reporting

Report security issues directly to the app owner via your organization's standard channels. There is no bug bounty program for this app.
