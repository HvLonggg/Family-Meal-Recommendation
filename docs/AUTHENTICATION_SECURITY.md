# Authentication and account data

## Email verification and password recovery

Registration is a direct flow. `POST /api/v1/auth/register` validates the email format, password policy, and email uniqueness, then creates the account without an OTP. The frontend redirects the user to sign in and pre-fills the email address. A welcome notification is queued for delivery after the account transaction commits. Since registration has no email confirmation step, successful registration does not prove mailbox ownership and leaves `email_verified_at` unset. If an email is already registered, the API reports that it is in use.

Password recovery uses `POST /api/v1/auth/forgot-password`, followed by `/api/v1/auth/forgot-password/verify-code` and `/api/v1/auth/reset-password`. It sends a five-digit, single-use email OTP to registered addresses; unknown addresses receive an explicit `EMAIL_NOT_REGISTERED` response so the interface can tell the user that no Bếp Việt account exists for that email. A verified OTP returns a random, one-use reset token that expires after the configured reset window. Changing or resetting the password revokes refresh sessions and increments the account's auth version, immediately invalidating previously issued access tokens. The account page also supports authenticated password changes through `POST /api/v1/auth/change-password`.

Only the automated test environment can return an OTP in the API response. Development, staging, and production require working SMTP for recovery OTP delivery; if it is missing or rejects a message, the challenge is invalidated and the request fails instead of pretending an email was sent. Account creation, password resets, and authenticated password changes create security-notification records in the database outbox; the API worker delivers them after the transaction commits and retries transient SMTP failures. The account-created email welcomes the user, wishes them a great experience, and points them to Bếp Việt support if they encounter a problem. Notifications never include passwords, reset tokens, or OTPs. There are no SMS OTP or phone-login endpoints.

## SMTP configuration

The configured sender for this local project is `hvlongg@gmail.com`, using Gmail SMTP over STARTTLS. Set these values in the private root `.env` used by Docker Compose (or `backend/.env` when running the API directly). Create an App Password in the sender Google account and store it only in that private env file. Do not use the account's normal sign-in password, commit SMTP credentials, or send them in chat. Google requires 2-Step Verification for App Passwords; some managed or Advanced Protection accounts do not offer them.

```dotenv
BEP_VIET_EMAIL_SMTP_HOST=smtp.gmail.com
BEP_VIET_EMAIL_SMTP_PORT=587
BEP_VIET_EMAIL_SMTP_USERNAME=hvlongg@gmail.com
BEP_VIET_EMAIL_SMTP_PASSWORD=
BEP_VIET_EMAIL_FROM_ADDRESS=hvlongg@gmail.com
BEP_VIET_EMAIL_FROM_NAME=Bếp Việt
BEP_VIET_EMAIL_USE_SSL=false
BEP_VIET_EMAIL_STARTTLS=true
```

For a fresh local setup, paste the 16-character App Password into the blank password setting, then restart the API. Port 587 uses STARTTLS. Production refuses to start without complete SMTP credentials and a non-development JWT secret. OTP delivery failures invalidate the challenge and return an error; notification delivery failures remain queued for retry. SMTP credentials and provider response details are never sent to clients.

Five-digit codes have a smaller search space than longer OTPs, so the application limits attempts, lifetime, and resend rate. Use a unique random JWT secret and TLS for all production traffic.

## Sessions and remembered devices

Access tokens stay in frontend memory. Refresh tokens are rotated, stored hashed in the database, and sent only in an `HttpOnly`, `SameSite=Lax` cookie. Without “Ghi nhớ thiết bị này”, the cookie is a browser-session cookie and the server session expires after 12 hours. When selected, the cookie persists for the configured refresh lifetime (30 days by default). The app remembers only the email identifier in local storage. Password autofill and save prompts are handled by the browser's password manager; the app never stores a plaintext password in local storage.

API responses are marked `no-store`. When a page is restored from browser back-forward cache, the frontend clears its in-memory identity and revalidates the refresh cookie before rendering a protected route. After logout, reset, or change-password, a revoked session cannot restore the previous private page.

Saved meals and favorite recipes are stored with a database foreign key to the authenticated user's ID, and every list/update/delete query is scoped to that ID. The random-meal local fallback is namespaced by that same ID, with a separate guest key, so switching accounts does not show another user's browser history.
