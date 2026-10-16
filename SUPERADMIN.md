# Superadmin

Sign in with the explicitly granted account and open `/superadmin`, or choose Superadmin in the sidebar. Shop owners and role administrators do not receive platform access automatically. Registration and member forms cannot grant it.

The console includes:

- Businesses: search registered shops, view members and locations, suspend or reactivate a shop, and open its workspace.
- Subscriptions: add manual subscriptions, approve offline requests, change packages and dates, cancel or expire access. Verified M-Pesa payments cannot be marked approved without provider confirmation.
- Packages: edit prices, features and member/location limits, create packages, or stop offering a package for new registrations and purchases. Existing records are retained.
- Coupons: percentage or fixed KES discounts, optional expiry, business and package restrictions. Checkout calculates prices on the backend.
- Settings: registration availability, support contact, application label, and subscription expiry alert window.
- Audit log: platform changes and temporary business support access.

Opening a workspace requires a reason and starts a 20-minute support session as an active business owner. Package restrictions remain in effect. A visible banner returns you to the original Superadmin session. Credential changes and nested Superadmin access are blocked. Ending a session or revoking the actor's Superadmin privilege invalidates it.

Businesses keep immediate registration-package access until Superadmin begins managing their subscriptions. Thereafter an active, approved subscription is required; cancelled or expired access cannot fall back to the registration package. Owners can still access subscription requests when renewal is needed.

## Account grants

The web account `daviesmwangi407@gmail.com` has been granted Superadmin access in the configured database. No matching active account was found in the local `stockpro-user-data` desktop profile, so no other desktop account was promoted.

A local operator can grant or revoke web access with `node grant-superadmin.js --email account@example.com [--revoke]` from `bar-inventory-backend`. Desktop grants use `node scripts/grant-desktop-superadmin.js --data-dir <existing-profile> --email account@example.com`. Both require an existing active account. Neither command creates an account or changes its password.

## Schema and validation

Run `node migrate-platform.js` in `bar-inventory-backend` for an existing MySQL database. New installations include the platform migration in the normal runner. SQLite profiles upgrade when opened. New database sessions use UTC for date storage and comparison; the interface displays dates in the browser's local time.

Tests: `node --test scripts/platform-test.js` at the repository root, and `node --test test/platform.test.js` from `bar-inventory-backend`. Tests use temporary accounts and fixtures, and never grant platform access to arbitrary real accounts.

## Add a business and change the theme

Open Superadmin > Businesses > Add business (`/superadmin/business/create`). Enter business details, a new owner's unique email and username, password, package, recorded payment method and reference. This creates the owner, first location and approved subscription atomically without replacing your Superadmin sign-in. M-Pesa references here record payments already received; this form does not send a payment request or claim provider verification.

The Theme menu is available in the workspace navigation, Superadmin header and registration page. Pick a preset, use the color picker or enter any six-digit hex color, then Save theme. Authenticated preferences are saved per account; public registration preferences are saved on the current device. Button text and chart accents adapt for readable contrast. During a support session, theme changes belong to the Superadmin actor, rather than the customer account.

The login screen's Register business button opens public registration directly. The interface follows the simpler design requested earlier; it is not a pixel-for-pixel copy of the supplied reference site.
