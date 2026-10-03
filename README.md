# Parlia

## Foundation setup

The application requires a PostgreSQL database, transactional email delivery, and a private HMAC secret for owner verification codes.

1. Copy `.env.example` to `.env` and set `DATABASE_URL`, `DIRECT_URL`, `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, and `OWNER_CODE_HMAC_KEY`. For Supabase, use the transaction-mode pooler URL for `DATABASE_URL` and the session-mode pooler URL for `DIRECT_URL`; both credentials belong only in environment variables. Configure the sender on a verified Resend domain. `APP_URL` must be the public HTTPS origin (HTTP is accepted for `localhost` development only). Generate the HMAC key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`; it must contain at least 64 hexadecimal characters and must be stored outside the database, in a secret manager in production.
2. Install dependencies with `npm install`.
3. Generate the Prisma client and apply the PostgreSQL migrations:

   ```sh
   npx prisma generate
   npx prisma migrate deploy
   ```

4. Start locally with `npm run dev`, or build and run with `npm run build` and `npm start`.

The first firm is created through `/get-started`; no demo firm or sample records are seeded. Owners verify by email code on every sign-in. Invited staff set their password using the single-use email link.

Prisma uses `DATABASE_URL` for application traffic and `DIRECT_URL` for schema migrations. It stores firm accounts, roles and module permissions, supervisor relationships, invitations, hashed session/reset tokens, HMAC-protected owner verification codes, and audit records. Tenant-owned auth rows carry their firm ID; composite foreign keys bind roles, users, sessions, challenges, reset links, invitations, and audit actors to that same firm. The tenant-isolation migration backfills firm IDs and invalidates any outstanding pre-migration owner codes. Parlia does not store client documents in this foundation module.
