# Pulse Analytics

A production-oriented static business performance analytics app built with vanilla JavaScript, Supabase Auth/PostgreSQL, Papa Parse, Chart.js and Vercel.

## What this version includes

- Email/password signup and login through Supabase Auth.
- **Clickable email verification link** after signup.
- Resend confirmation email.
- **Clickable password-reset link** that returns to the app and opens the new-password screen.
- PKCE callback support (`code` query parameter).
- Support for custom Supabase `token_hash` email links.
- User profile management.
- CSV validation and KPI calculations.
- Current vs previous period comparison.
- Visualization and deterministic performance insights.
- Saved reports in Supabase PostgreSQL.
- Row Level Security (RLS) so users can access only their own reports.
- Portfolio / LinkedIn / Contact links in the footer.
- Vercel-friendly static deployment.

## Project structure

```text
pulse-analytics/
├── index.html
├── style.css
├── app.js
├── config.js
├── schema.sql
└── README.md
```

## 1. Supabase database

Open the Supabase SQL Editor and run `schema.sql`.

It creates:

- `profiles`
- `reports`
- `report_rows`
- RLS policies
- profile creation trigger

Never put a Supabase secret/service-role key in the frontend. `config.js` must contain only the browser-safe publishable key.

## 2. Supabase Authentication settings

In **Authentication → Providers**, enable Email authentication and keep email confirmation enabled.

In **Authentication → URL Configuration**:

### Local Live Preview

If VS Code Live Preview is using port 3000, add:

```text
http://127.0.0.1:3000/
http://127.0.0.1:3000/index.html
http://localhost:3000/
http://localhost:3000/index.html
```

### Production

After Vercel deployment, add the exact production URL, for example:

```text
https://YOUR-PULSE-APP.vercel.app/
https://YOUR-PULSE-APP.vercel.app/index.html
```

Set **Site URL** to the main production URL.

The URL passed by the application must be present in Supabase's Redirect URLs allow-list. Supabase documents this requirement here:
https://supabase.com/docs/guides/auth/redirect-urls

## 3. Email verification template

To make the **clickable verification button** work, the Supabase Confirm signup email template should use:

```html
<a href="{{ .ConfirmationURL }}">Confirm your email address</a>
```

Do not replace the confirmation link with OTP-only content if you want users to click the link.

Supabase provides both `{{ .ConfirmationURL }}` and `{{ .Token }}`. This project is designed around the clickable `ConfirmationURL` flow while also supporting direct `token_hash` callbacks.

Reference:
https://supabase.com/docs/guides/auth/auth-email-templates

## 4. Password reset email template

The password reset template should contain the Supabase confirmation URL, for example:

```html
<a href="{{ .ConfirmationURL }}">Reset your password</a>
```

The application calls:

```js
supabase.auth.resetPasswordForEmail(email, {
  redirectTo: getRecoveryRedirectUrl()
});
```

After the user clicks the email link, Supabase returns the user to the application. The app listens for the `PASSWORD_RECOVERY` auth event and opens the **Set a new password** screen. The new password is then saved with:

```js
supabase.auth.updateUser({ password });
```

Reference:
https://supabase.com/docs/guides/auth/passwords

## 5. Important: test the links correctly

Do not test authentication by opening:

```text
file:///D:/.../index.html
```

Use the HTTP server:

```text
http://127.0.0.1:3000/index.html
```

Test verification:

1. Create a new account.
2. Open the confirmation email.
3. Click **Confirm your email address**.
4. The browser should return to Pulse Analytics.
5. The dashboard should open automatically.

Test password reset:

1. Click **Forgot password?**.
2. Enter the account email.
3. Open the recovery email.
4. Click **Reset your password**.
5. The browser should return to Pulse Analytics.
6. The **Set a new password** screen should appear.
7. Enter the new password twice.
8. Click **Set new password**.
9. The dashboard should open.

Always use the newest email link. A previously used or expired Supabase email link can no longer be used.

## 6. Configure the frontend

`config.js` contains:

```js
window.PULSE_CONFIG = {
  SUPABASE_URL: 'YOUR_SUPABASE_URL',
  SUPABASE_PUBLISHABLE_KEY: 'YOUR_SUPABASE_PUBLISHABLE_KEY'
};
```

Replace the placeholders with your Supabase project URL and browser-safe publishable key if they are not already filled in.

Never use the `service_role` / secret key here.

## 7. CSV format

Required columns:

```text
Date,Leads,Calls,Visits,Revenue,Conversions
```

The application validates dates and numeric values before saving a report.

## 8. Footer links

The footer contains:

- LinkedIn
- Portfolio
- Contact section on the portfolio

These are visible on the login screen and inside the authenticated dashboard.

## 9. Deploy to Vercel

Push the project to GitHub and import the repository into Vercel.

This is a static frontend, so no backend build command is required.

After deployment:

1. Copy the Vercel production URL.
2. Put it in Supabase **Site URL**.
3. Add both the root URL and `/index.html` URL to Supabase **Redirect URLs**.
4. Test signup verification from the production URL.
5. Test password recovery from the production URL.

## Security notes

- Passwords are handled by Supabase Auth.
- CSV parsing happens in the browser before persistence.
- Reports are protected by PostgreSQL RLS.
- Every report belongs to an authenticated `user_id`.
- The publishable key is browser-safe; a secret/service-role key must never be exposed.
- For larger production use, add custom SMTP, rate limiting/CAPTCHA, automated tests and monitoring.
