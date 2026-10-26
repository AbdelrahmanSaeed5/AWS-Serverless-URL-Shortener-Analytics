# 🔗 LinkForge — Serverless URL Shortener & Analytics

**A full-stack AWS serverless application for creating, managing, and analyzing short links.**

LinkForge gives authenticated users a dashboard to create short URLs, review click counts, view seven-day traffic history, download QR codes, and enable or disable individual links. Short-link redirection is public; link management is protected with Amazon Cognito.

> **Project status:** Functional portfolio MVP. The React frontend runs locally; the AWS backend is deployed separately. Public frontend hosting is intentionally not included.

## ✨ Features

- **Shorten URLs:** Generate collision-resistant, seven-character alphanumeric codes.
- **Fast redirects:** Resolve public links through an AWS Lambda endpoint (`302` redirects).
- **Sign up / sign in:** Email-based authentication with Amazon Cognito.
- **Private link management:** Create and list your own URLs, and disable or re-enable them.
- **Analytics:** Total click counts and per-link daily clicks (last seven days, UTC).
- **QR codes:** Generate and download PNG QR codes for shortened links.
- **Responsive dashboard:** React interface with link lists, counters, analytics, and QR preview.
- **Infrastructure as Code:** Deploy AWS resources with AWS SAM and CloudFormation.

## 🖼️ Screenshots

> Add **your own screenshots** after verifying they don't expose account IDs, email addresses, session tokens, or unrelated browser tabs.

| Dashboard | Analytics + QR |
|---|---|
| ![LinkForge dashboard](docs/screenshots/dashboard.png) | ![Analytics and QR code](docs/screenshots/analytics-qr.png) |

## 🏗️ Architecture

See the **editable Mermaid architecture diagram**, service map, and request flows in [docs/architecture.md](docs/architecture.md).

**AWS:** API Gateway HTTP API · Lambda (Python 3.14) · DynamoDB (on-demand) · Cognito · IAM · CloudWatch · SAM/CloudFormation  
**Frontend:** React · Vite · AWS Amplify UI · qrcode.react

## 🔄 How it works

1. An authenticated user signs in through Cognito on the local React dashboard.
2. React sends an access token to the protected API Gateway `POST /links` route.
3. The management Lambda validates the URL, creates a random code, and saves it to DynamoDB with the owner's Cognito user ID.
4. Anyone opening `/r/{code}` hits a public redirect Lambda, which looks up the original destination, checks whether the link is active/unexpired, and responds with HTTP `302`.
5. The redirect Lambda increments a total-click counter and records an aggregated daily click count in DynamoDB. The dashboard requests link and analytics information via authenticated API routes.

## 🔌 API reference

| Method | Route | Access | Description |
|---|---|---|---|
| `POST` | `/links` | JWT required | Create a short link |
| `GET` | `/links` | JWT required | List up to 100 of your newest links |
| `GET` | `/links/{code}/stats` | JWT required | View owned link + seven days of daily counts |
| `PATCH` | `/links/{code}` | JWT required | Change `isActive` status |
| `GET` | `/r/{code}` | Public | Redirect to the saved URL |

**Example create request** (authentication header omitted):

```json
{ "originalUrl": "https://www.wikipedia.org" }
```

**Example create response** (short code varies):

```json
{
  "shortCode": "Ab72xK9",
  "originalUrl": "https://www.wikipedia.org",
  "createdAt": "2026-10-26T13:00:00+00:00",
  "expiresAt": null,
  "isActive": true,
  "totalClicks": 0,
  "lastClickedAt": null
}
```

The frontend assembles the short URL using the deployed API base URL and `/r/{code}`.

## 📂 Project structure

```text
AWS-Serverless-URL-Shortener-Analytics/
├── backend/
│   └── functions/
│       ├── links/             # Create/list/stats/toggle Lambda
│       │   ├── app.py
│       │   └── requirements.txt
│       └── redirect/          # Public redirect + click counters
│           ├── app.py
│           └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── main.jsx
│   ├── .env.example
│   └── package.json
├── infrastructure/
│   └── template.yaml
├── docs/
│   ├── architecture.md
│   ├── testing.md
│   └── screenshots/
├── .gitignore
└── README.md
```

## 🛠️ Prerequisites

- An AWS account with permissions to deploy CloudFormation/SAM resources, Lambda, DynamoDB, API Gateway, IAM, and Cognito
- AWS CLI v2 configured with a suitable development identity (`aws login` or AWS IAM Identity Center)
- AWS SAM CLI
- Python **3.14** for the Lambda runtime used in the template
- Current Node.js version compatible with the project's Vite version

**Costs:** AWS resources can incur charges even when React runs locally. Review AWS pricing and enable a budget alert before deployment. An alert does not automatically stop spending.

## 🚀 Run your own deployment

From the repository root:

```powershell
sam validate --lint --template-file infrastructure\template.yaml
sam build --template-file infrastructure\template.yaml
sam deploy --guided
```

Select the desired AWS region, review IAM permissions and the CloudFormation change set, then approve deployment. Keep your stack name and region consistent across commands.

Get the configuration values from the deployment outputs:

```powershell
aws cloudformation describe-stacks `
  --stack-name <your-stack-name> `
  --region <your-region> `
  --query "Stacks[0].Outputs[*].[OutputKey,OutputValue]" `
  --output table
```

In `frontend/`, copy `.env.example` to `.env.local`, and insert **your own** deployed values:

```powershell
cd frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Visit the URL printed by Vite, typically `http://localhost:5173`. The SAM CORS configuration is set up for this local development origin; update it when intentionally using another origin.

**Do not commit** `.env.local`, AWS access keys, temporary credentials, or local deployment artifacts. Cognito public client IDs and user pool IDs are configuration identifiers, not secrets, but use placeholders in shared examples.

## 🧪 Validation & tests

See the reproducible manual test checklist in [docs/testing.md](docs/testing.md).

```powershell
# Backend infrastructure validation
sam validate --lint --template-file infrastructure\template.yaml

# Frontend production build and production-dependency audit
cd frontend
npm run build
npm audit --omit=dev
```

This MVP has been manually tested with real AWS endpoints. Passing a build or security audit does **not** substitute for automated tests, security review, or production abuse protection.

## 🔒 Security and design notes

- Management routes use Cognito JWT authentication. Lambda also checks ownership using the token's `sub` claim before serving or updating a link.
- Short-code creation uses Python `secrets` and DynamoDB conditional writes to avoid overwriting existing codes.
- HTTP/HTTPS URL validation excludes credentials in the URL, but **does not prevent malicious destination websites**. A public commercial shortener requires stronger anti-phishing and abuse protection.
- Per-link analytics store aggregated counts, not visitor IP addresses.
- The seven-day chart begins from when daily analytics collection was introduced; earlier individual-day counts cannot be reconstructed.
- Click counts are approximate under certain transient failures/retries. The system is designed as an MVP, not a high-volume analytics pipeline.
- The link listing currently loads at most the newest 100 entries per user; cursor pagination has not been implemented.
- The API does not expose a delete-link operation. The dashboard supports disabling and re-enabling.
- A custom short domain, paid public frontend hosting, advanced anti-abuse controls, and production-scale rate limiting are outside this MVP.

## 🧹 Cleanup

If you no longer need the AWS deployment, review the CloudFormation stack and back up any important data before deleting it. **Deletion is destructive and can remove DynamoDB data.**

```powershell
sam delete --stack-name <your-stack-name> --region <your-region>
```

Review AWS Billing afterward for any residual charges.

## 📄 License

Choose and add a license file before publishing if you want to explicitly allow reuse; no license is implied by uploading source code to GitHub.
