# Security Policy

## Scope

This app is a private, custom-distribution Shopify app. It has no public-facing endpoints — all logic runs inside Shopify Functions and Checkout UI Extensions.

## Sensitive data handled

- **Customer entitlement metafields** (`custom.co_op`, `custom.plant`) — read-only during checkout via the Function's input query. The app scopes are `read_customers` and `write_customers`.
- **Order attributes** (`Payment Type`, `Customer Code`, `Plant Number`) — written by the Checkout UI Extension during checkout. The optional Notes field is written to the standard Shopify order note.
- **App configuration** is hardcoded in extension source files (`cart_payment_methods_transform_run.js`, `Checkout.jsx`). No secrets are stored; config contains only payment method names and handles.

## Reporting

Report security issues directly to the app owner via your organization's standard channels. There is no bug bounty program for this app.
