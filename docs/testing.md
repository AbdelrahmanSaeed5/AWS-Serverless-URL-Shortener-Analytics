# ✅ LinkForge Test Checklist

Use a **test account** and example destination such as `https://www.wikipedia.org`. Record the result after you actually test each case.

## Frontend and user flow

- [ ] Create and verify a Cognito account.
- [ ] Sign in; verify authenticated dashboard loads.
- [ ] Create an HTTP/HTTPS short URL.
- [ ] Open the generated short link; destination opens.
- [ ] Refresh analytics and confirm the total click count increased.
- [ ] Confirm the new daily count appears for today's UTC date.
- [ ] Download QR code as PNG and scan it.
- [ ] Disable the link; a visit returns `410`.
- [ ] Enable the link; visit redirects again.
- [ ] Refresh dashboard; links remain saved.
- [ ] Sign out; protected dashboard is no longer available.
- [ ] Test dashboard on desktop and narrow/mobile browser width.

## API checks

Substitute your deployed API base address **locally** when running these tests.

```powershell
$api = "https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com"

# Must be 401 Unauthorized
curl.exe -i -X POST "$api/links"

# Must be 404 Not Found
curl.exe -i "$api/r/Z7q3P8x"
```

Other manual checks:

- [ ] Invalid short code returns 404.
- [ ] Unknown code returns 404.
- [ ] Inactive link returns 410.
- [ ] Malformed/non-HTTP URL is rejected at creation time.
- [ ] User B cannot read or modify user A's link information.
- [ ] Authorization-free `GET /links` returns 401.

## Build, security, and deployment checks

- [ ] `sam validate --lint --template-file infrastructure\template.yaml` passes.
- [ ] `sam build --template-file infrastructure\template.yaml` succeeds.
- [ ] CloudFormation stack is `CREATE_COMPLETE` or `UPDATE_COMPLETE`.
- [ ] `npm run build` succeeds.
- [ ] `npm audit --omit=dev` reports no current known production-dependency vulnerabilities.
- [ ] No secrets, passwords, `.env.local` or session tokens in files to be published.
- [ ] Budget alerts are configured and current cloud resources have been reviewed.

## Known limitations to disclose

- No public frontend hosting; dashboard runs locally.
- Up to 100 newest links appear in the dashboard; no pagination controls.
- No delete-link API; disable/enable is supported.
- Per-day statistics only cover the period after daily tracking was introduced.
- Aggregated click counts are **not** deduplicated visitors.
- High-volume or adversarial public usage would require stronger rate limiting and abuse defenses.
