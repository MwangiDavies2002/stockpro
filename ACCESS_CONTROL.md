# Packages, roles and locations

Registration requires a package and makes it usable immediately. Basic POS includes two locations and five total member accounts, including the owner. It includes reports and excludes accounting and treasury. Inactive accounts still count toward the member limit. Growth retains five locations with unlimited members and accounting; ERP has unlimited locations and members.

Use Administration > Roles to create a role, then Administration > Members to assign that role and one or more locations. Owners always see all locations. Every other member, including an Administrator, requires explicit location assignments. Existing staff without assignments must be assigned locations by the owner before accessing location records. Built-in Cashier and Administrator roles remain available. Only the owner manages members, roles, and locations; accounting is also owner-only when included in the package.

Package checks and permissions run on the REST API and Electron dispatcher. Authenticated SQL reads apply location restrictions to product and document tables, child records and report aggregates. Writes validate target records and supplied references. Account, role and location assignments are reloaded on every request, so changes do not require waiting for token expiry. Customer and supplier directories remain shared business contacts; location-specific products, stock and sales are restricted.

The registration package is stored separately from editable business settings. A currently approved paid subscription takes precedence. After it expires, access returns to the registration package. Package creation limits count existing records and never delete records when a package changes.

## Schema

For an existing MySQL database, run `node migrate-access.js` from `bar-inventory-backend`. The normal migration runner includes the same idempotent schema changes. SQLite desktop databases upgrade on open.

## Validation

- `node --test scripts/access-control-test.js` tests the desktop dispatcher in an isolated temporary SQLite database.
- `node --test test/access-web.test.js` from `bar-inventory-backend` tests the real REST middleware against short-lived fixture businesses in the configured MySQL database, with targeted cleanup.
- `npm test` from `bar-inventory-backend` runs existing purchasing, sales-document and provider tests.
- Frontend: `tsc --noEmit --incremental false --pretty false`.
