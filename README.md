# Parlia

## Foundation setup

The application requires a PostgreSQL database, transactional email delivery, and a private HMAC secret for owner verification codes.

1. Copy `.env.example` to `.env` and set `DATABASE_URL`, `DIRECT_URL`, `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL`, and `OWNER_CODE_HMAC_KEY`. For Supabase, use the transaction-mode pooler URL for `DATABASE_URL` and the session-mode pooler URL for `DIRECT_URL`; both credentials belong only in environment variables. Configure the sender on a verified Resend domain. `SUPPORT_EMAIL` defaults to `parlia4u@gmail.com`. `APP_URL` must be the public HTTPS origin (HTTP is accepted for `localhost` development only). Generate the HMAC key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`; it must contain at least 64 hexadecimal characters and must be stored outside the database, in a secret manager in production.
2. Install dependencies with `npm install`.
3. Generate the Prisma client and apply the PostgreSQL migrations:

   ```sh
   npx prisma generate
   npx prisma migrate deploy
   ```

4. Start locally with `npm run dev`, or build and run with `npm run build` and `npm start`.

The first firm is created through `/get-started`; no demo firm or sample records are seeded. Owners verify by email code on every sign-in. Invited staff set their password using the single-use email link.

Prisma uses `DATABASE_URL` for application traffic and `DIRECT_URL` for schema migrations. It stores firm accounts, roles and module permissions, supervisor relationships, invitations, hashed session/reset tokens, HMAC-protected owner verification codes, and audit records. Tenant-owned auth rows carry their firm ID; composite foreign keys bind roles, users, sessions, challenges, reset links, invitations, and audit actors to that same firm. The tenant-isolation migration backfills firm IDs and invalidates any outstanding pre-migration owner codes. Firms can carry an optional `staffSeatLimit` entitlement supplied by subscription management; null means no allowance is recorded, not a price tier or an inferred cap. Staff seat accounting is separate from future client portal accounts, which do not consume staff seats. The subscription/team view reports known seat usage and allowance only; invitation enforcement belongs in the staff-invitation flow. Parlia does not store client documents in this foundation module.

## Build Order Module C: matters and tasks

The Module C migration adds firm-owned matters, tasks, matter notes/activity, document references and task nudges. Composite tenant foreign keys bind matter/task relationships, staff assignments, creators, note authors and activity actors to users and records in the same firm. All matter and task pages and server mutations authenticate the current staff account, check module permissions and scopes, and constrain database access to the active firm. No client document content is uploaded or stored; a matter may carry a text label and external location/reference only.

Use `/matters` to search and filter firm-visible matters, `/matters/board` to view open matters by the active configured stage, `/matters/new` to open a matter, and `/matters/import` to validate and import CSV rows. `/tasks` provides the scoped My to-do list with active Setup Centre urgency bands, task completion, reasoned reassignment/due-date changes and direct-supervisor nudges. Stage changes use the currently published matter type/stage configuration, create that stage's configured tasks, and create a due-dated Follow up task for waiting stages from the published follow-up interval. New work requires an owner-published Setup Centre configuration. Matter quiet-time reporting is based on `lastActivityAt`; only opening/importing a matter, changing its stage, adding a note, or completing an associated task advances it.

Staff invitations reserve seats transactionally: active non-owner staff plus non-expired pending invitations may not exceed a recorded `staffSeatLimit`. When no limit is recorded, Parlia does not infer one. Client accounts are not included in staff-seat usage.
