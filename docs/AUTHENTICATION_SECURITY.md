# Authentication and account data

## Email verification and password recovery

Registration is a direct flow. `POST /api/v1/auth/register` validates the email format, password policy, and email uniqueness, then creates the account without an OTP. The frontend redirects the user to sign in and pre-fills the email address. A welcome notification is queued for delivery after the account transaction commits. Since registration has no email confirmation step, successful registration does not prove mailbox ownership and leaves `email_verified_at` unset. If an email is already registered, the API reports that it is in use.

Password recovery uses `POST /api/v1/auth/forgot-password`, followed by `/api/v1/auth/forgot-password/verify-code` and `/api/v1/auth/reset-password`. It sends a five-digit, single-use email OTP to registered addresses; unknown addresses receive an explicit `EMAIL_NOT_REGISTERED` response so the interface can tell the user that no Bếp Việt account exists for that email. A verified OTP returns a random, one-use reset token that expires after the configured reset window. Changing or resetting the password revokes refresh sessions and increments the account's auth version, immediately invalidating previously issued access tokens. The account page also supports authenticated password changes through `POST /api/v1/auth/change-password`.

Only the automated test environment can return an OTP in the API response. Development, staging, and production require a working SMTP or Gmail API provider for recovery OTP delivery; if it is missing or rejects a message, the challenge is invalidated and the request fails instead of pretending an email was sent. Account creation, password resets, and authenticated password changes create security-notification records in the database outbox; the API worker delivers them after the transaction commits and retries transient provider failures. The account-created email welcomes the user, wishes them a great experience, and points them to Bếp Việt support if they encounter a problem. Notifications never include passwords, reset tokens, or OTPs. There are no SMS OTP or phone-login endpoints.

## SMTP configuration

The sender account is configured only through environment variables, using Gmail SMTP over STARTTLS. Set these values in the private root `.env` used by Docker Compose (or `backend/.env` when running the API directly). Create an App Password in the sender Google account and store it only in that private env file. Do not use the account's normal sign-in password, commit SMTP credentials, or send them in chat. Google requires 2-Step Verification for App Passwords; some managed or Advanced Protection accounts do not offer them.

```dotenv
BEP_VIET_EMAIL_PROVIDER=auto
BEP_VIET_EMAIL_SMTP_HOST=smtp.gmail.com
BEP_VIET_EMAIL_SMTP_PORT=587
BEP_VIET_EMAIL_SMTP_USERNAME=<your-account>@gmail.com
BEP_VIET_EMAIL_SMTP_PASSWORD=
BEP_VIET_EMAIL_FROM_ADDRESS=<your-account>@gmail.com
BEP_VIET_EMAIL_FROM_NAME=Bếp Việt
BEP_VIET_EMAIL_USE_SSL=false
BEP_VIET_EMAIL_STARTTLS=true
```

With `BEP_VIET_EMAIL_PROVIDER=auto`, the backend uses Gmail API when all OAuth credentials are configured; otherwise it uses SMTP when the App Password is present. For a fresh local SMTP setup, paste the 16-character App Password into the blank password setting, then restart the API. Port 587 uses STARTTLS. SMTP credentials and provider response details are never sent to clients.

## Gmail API configuration for local development

Use Gmail API over HTTPS when the local network or Docker host refuses SMTP connections on ports 465 and 587. Gmail API setup is separate from Google sign-in; the Google login client ID cannot replace the email-sending OAuth credentials.

1. In Google Cloud Console, create or select a project, enable **Gmail API**, and create an OAuth client of type **Desktop app**. Configure the OAuth consent screen with the `https://www.googleapis.com/auth/gmail.send` scope and add the sending Gmail account as a test user while the app is in Testing.
2. From the `backend` directory, run the token helper and sign in to the same Gmail account that will appear in `BEP_VIET_EMAIL_FROM_ADDRESS`:

   ```powershell
   .\.venv\Scripts\python.exe scripts\get_gmail_refresh_token.py
   ```

   Enter the client ID and secret at the prompts; the secret is hidden while typing. The helper prints a refresh token once. Keep it private; do not commit it or share it in chat. For automation, the helper also accepts `BEP_VIET_EMAIL_GMAIL_CLIENT_ID` and `BEP_VIET_EMAIL_GMAIL_CLIENT_SECRET` from the process environment.
3. In the private root `.env` used by Docker Compose, or `backend/.env` when running the API directly, set:

   ```dotenv
   BEP_VIET_EMAIL_PROVIDER=gmail_api
   BEP_VIET_EMAIL_GMAIL_CLIENT_ID=<OAUTH_CLIENT_ID>
   BEP_VIET_EMAIL_GMAIL_CLIENT_SECRET=<OAUTH_CLIENT_SECRET>
   BEP_VIET_EMAIL_GMAIL_REFRESH_TOKEN=<REFRESH_TOKEN>
   BEP_VIET_EMAIL_FROM_ADDRESS=<your-account>@gmail.com
   ```

   Keep `BEP_VIET_EMAIL_GMAIL_*` values on the backend only. Restart the API after changing them. The Gmail API provider does not use the SMTP password. OAuth apps left in Testing may issue refresh tokens that expire after seven days; move the consent screen to production before relying on long-running delivery.

4. As an admin, request `GET /api/v1/admin/meal-suggestions/delivery-status`. It returns only the provider, readiness flag and a safe reason code. The readiness probe never sends a test email. A send request is rejected with HTTP 503 only when no provider credentials are configured; temporary connectivity problems do not block queueing, and the delivery result is recorded in the email history.

The probe checks SMTP authentication, or Gmail OAuth refresh, the granted `gmail.send` scope and HTTPS connectivity to the Gmail API discovery endpoint. It cannot guarantee final recipient acceptance; API enablement, quotas or recipient-specific rejection may still cause a send to fail. Delivery history records the result without exposing provider credentials.

Production refuses to start without complete credentials for the selected provider and a non-development JWT secret. OTP delivery failures invalidate the challenge and return an error; notification delivery failures remain queued for retry.

Five-digit codes have a smaller search space than longer OTPs, so the application limits attempts, lifetime, and resend rate. Use a unique random JWT secret and TLS for all production traffic.

## Sessions and remembered devices

Access tokens stay in frontend memory. Refresh tokens are rotated, stored hashed in the database, and sent only in an `HttpOnly`, `SameSite=Lax` cookie. Without “Ghi nhớ thiết bị này”, the cookie is a browser-session cookie and the server session expires after 12 hours. When selected, the cookie persists for the configured refresh lifetime (30 days by default). The app remembers only the email identifier in local storage. Password autofill and save prompts are handled by the browser's password manager; the app never stores a plaintext password in local storage.

API responses are marked `no-store`. When a page is restored from browser back-forward cache, the frontend clears its in-memory identity and revalidates the refresh cookie before rendering a protected route. After logout, reset, or change-password, a revoked session cannot restore the previous private page.

Saved meals and favorite recipes are stored with a database foreign key to the authenticated user's ID, and every list/update/delete query is scoped to that ID. The random-meal local fallback is namespaced by that same ID, with a separate guest key, so switching accounts does not show another user's browser history.

## Data export and self-service account deletion

`GET /api/v1/account/export` returns the signed-in user's own data as JSON (profile, preferences, favorites, plans, vegetarian days, stories, submissions, assistant conversations and memories, cook logs, saved meals). `POST /api/v1/account/delete` requires the typed confirmation `XÓA` plus the current password; accounts without a password (social sign-in only) first call `POST /api/v1/account/delete/request-code` and confirm with the emailed five-digit `account_delete` OTP, bound to the requesting user. Deletion runs in one transaction and removes user-owned rows explicitly (not relying on database cascades): conversations and messages, memories, cook logs, timers, push subscriptions, favorites, plans and plan events, reminders, vegetarian days, saved meals, recipe submissions, sessions, reset tokens, OTP challenges, security outbox and identities. Published stories stay visible with `author_id` cleared, unpublished ones are deleted; support tickets are kept but unlinked from the account. The public legal pages live at `/privacy` and `/terms`.
