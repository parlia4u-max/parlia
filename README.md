# Parlia

## Foundation setup

The application requires a PostgreSQL database, transactional email delivery, and a private HMAC secret for owner verification codes.

1. Copy `.env.example` to `.env` and set `DATABASE_URL`, `DIRECT_URL`, `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL`, `OWNER_CODE_HMAC_KEY`, and `SENSITIVE_DATA_ENCRYPTION_KEY`. For Supabase, use the transaction-mode pooler URL for `DATABASE_URL` and the session-mode pooler URL for `DIRECT_URL`; both credentials belong only in environment variables. Configure the sender on a verified Resend domain. `SUPPORT_EMAIL` defaults to `parlia4u@gmail.com`. `APP_URL` must be the public HTTPS origin (HTTP is accepted for `localhost` development only). Generate both secrets independently with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`; `OWNER_CODE_HMAC_KEY` must contain at least 64 hexadecimal characters and `SENSITIVE_DATA_ENCRYPTION_KEY` exactly 64 hexadecimal characters (32 bytes). Keep them in a secret manager in production. Sensitive HR operations fail closed if the encryption key is missing or invalid. Back up the encryption key securely: encrypted next-of-kin details, HR documents, and vault entries cannot be recovered without it. Rotating it requires a planned data re-encryption migration.
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

## Module G: leave and HR

`/leave` stores firm-scoped leave requests, balances, approvals and task handovers in Postgres. Balances use the owner-published leave cycle, carry-over, annual/sick allowances, the staff member’s owner-set employment start date (account creation date until configured), and working days after configured country public holidays/weekends. Study and family-responsibility allowances are unset by default and those request types remain disabled until the owner explicitly configures and publishes them; these are firm policy values, not inferred legal entitlements. Sick, study and family-responsibility submissions create a private submit-proof task; no client document is stored. Approval is limited to the owner or assigned direct supervisor with people-module edit rights, hands open tasks to the request’s active cover person with durable snapshots, and creates an internal source event in Calendar. The requester or owner can explicitly return from leave after its end date; restoration changes only tasks still assigned to the cover person. Approved requests can be downloaded as actual PDFs based on saved request details and the published A/B/C brand-aware form configuration.

Staff HR profiles have owner/self-only encrypted next-of-kin details and onboarding checklist items derived from published Setup. The owner sets each employee’s employment start date and onboarding due date. HR documents (bank confirmation, identity document, signed contract or a custom type) are accepted only as PDF, PNG or JPEG up to 5 MB; content and original filename/MIME/size metadata are encrypted with AES-256-GCM before being stored in Postgres. Downloads are authenticated, firm-scoped, authorized and audited; no public document URLs are issued. Documents lock on submission, and only the owner can request resubmission; the staff member then replaces their own document. `SENSITIVE_DATA_ENCRYPTION_KEY` is required for all sensitive-data encryption/decryption and HR document upload/download.

The equipment register records serials, condition reports, assignee declarations and assignment/return history for owners and authorized people managers. The password vault is owner-only, encrypts entry metadata and secrets with the same key, audits each successful reveal, and never places secrets in audit details or server logs. Keep this key backed up outside Postgres and do not rotate it without re-encrypting the stored payloads.

## Module H: clock-in attendance

`/attendance` provides owner-managed approved geofence locations and staff clock-in, lunch start/end, clock-out, and assigned-duty check-in/out. Only the firm owner can add, edit or deactivate a location. Locations are firm-scoped, use validated coordinates and a 25–2,000 metre radius, and are never deleted from historical event records. Each staff action requests a fresh high-accuracy browser GPS reading only after the user selects an action. The server validates coordinate bounds, reading age, accuracy (100 metres or better), approved location status, and that the full GPS uncertainty radius falls inside the approved geofence. It records the server time, event, approved-location snapshot, duty reference (where applicable), and GPS evidence in the firm’s attendance log; it does not continuously track device location. Browser GPS can be spoofed and is not a proof of identity or presence.

The owner assigns attendance View/Edit access and Own/Team/Firm report scope using Settings → Permissions and role templates. Edit enables an employee’s own clock and duty actions; report visibility is still limited by the assigned attendance scope and direct-report relationships. Location management remains owner-only regardless of role. All attendance and geofence mutations and CSV report exports are audited; CSV reports omit exact GPS coordinates. Attendance data is for operational accountability only and is not payroll, pay calculation, or a time-sheet system. Firm workdays use the published country setting (South African time for the South Africa default, otherwise UTC); recorded timestamps remain in UTC.

The Module H migration adds tenant-composite foreign keys among attendance days, staff, locations and duty records, and backfills the attendance permission for existing role templates and Setup Centre drafts. Apply it with the ordered Prisma migrations after configuring private database URLs. No sample locations, staff attendance, or client records are seeded.

## Module I: reports

`/reports` includes quiet-matter reporting for active matters with no recorded meaningful activity beyond the firm owner’s configurable threshold (default 30 days). The report and CSV export use the narrower of the signed-in user’s Reports and Matters permissions (Own/Team/Firm), and team scope follows active direct-supervisor assignments. CSV export is audited and protects spreadsheet formula cells. A user may request an on-demand quiet-matter digest email to their own signed-in account address; it is not a scheduled email. Email requires configured Resend credentials and a verified sender. Client matter details are included only for matters the current user can view.

The Module I migration adds the firm-scoped report-threshold setting. No report data is seeded.

## Module J: client portal

Staff with matter Edit access can connect the email already recorded on a matter to the client portal. New clients receive a seven-day, single-use invitation link to set a password; existing client accounts can be connected to additional matters explicitly. Each connection and revocation is firm-scoped and audited. Client accounts use a separate session cookie/table from staff accounts, and every client query is constrained to the signed-in account, firm, and active matter-access row. Client sign-in requires the firm code from the invitation, password, and a one-time email code. Password recovery also requires an email code, and resets revoke all existing client sessions. These codes use `OWNER_CODE_HMAC_KEY`; Resend credentials and a verified sender are also required.

The client can see only connected matters and updates staff explicitly shared. Staff may save private drafts or deliberately share an update. Client document submissions are secure HTTPS references to content in the firm’s approved document system; Parlia does not accept or store client document files. References begin in Pending review and a staff member with matter Edit access in scope may accept or reject them. Review status and optional notes are recorded and emailed to the client. External links are never fetched by the server.

The Module J migration adds separate client portal accounts, invitations, sessions, email challenges, explicit matter access, shared updates and reference-review records, all with firm-bound foreign keys. No client accounts, invitations, matter access or client submissions are seeded. Apply all ordered migrations only after configuring the private database URLs.
