# FreightFlow — Import Tracking System
## Complete Deployment Guide

---

## What You're Deploying

| Layer | Service | Cost |
|---|---|---|
| Frontend + API | Vercel | Free |
| Database | Supabase | Free (up to 500MB) |
| Email sending | Resend | Free (3,000 emails/month) |
| AI Assistant | Anthropic Claude | Pay per use (~$0.01/query) |

**Total cost to start: $0/month**

---

## Step 1 — Set Up Supabase (Database)

1. Go to **https://supabase.com** → Create account → New project
2. Choose a name (e.g. `freightflow`), set a strong database password, pick region **West EU (Ireland)**
3. Wait ~2 minutes for the project to spin up
4. Go to **SQL Editor** (left sidebar) → click **New query**
5. Open `supabase/migrations/001_schema.sql` from this project
6. Paste the entire contents into the SQL editor → click **Run**
7. You should see: *"Success. No rows returned"*

**Get your keys:**
- Go to **Project Settings → API**
- Copy: `Project URL` → this is your `NEXT_PUBLIC_SUPABASE_URL`
- Copy: `anon public` key → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Copy: `service_role secret` key → this is your `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 2 — Set Up Resend (Email)

1. Go to **https://resend.com** → Create account
2. Go to **API Keys** → Create API Key → copy it → this is your `RESEND_API_KEY`
3. Go to **Domains** → Add your domain (e.g. `yourcompany.fr`)
4. Add the DNS records shown (takes 5–30 min to verify)
5. Once verified, set `FROM_EMAIL=imports@yourcompany.fr`

> **Quick start without a domain:** Use `onboarding@resend.dev` as FROM_EMAIL to test immediately.

---

## Step 3 — Get Anthropic API Key (AI Assistant)

1. Go to **https://console.anthropic.com**
2. Go to **API Keys** → Create Key → copy it → this is your `ANTHROPIC_API_KEY`

---

## Step 4 — Deploy to Vercel

### Option A: Deploy via GitHub (recommended)

1. Create a GitHub account if you don't have one
2. Create a new repository called `freightflow`
3. Upload all files from this project to the repository
4. Go to **https://vercel.com** → New Project → Import your GitHub repo
5. Vercel auto-detects Next.js — click **Deploy**

### Option B: Deploy via Vercel CLI

```bash
npm install -g vercel
cd freightflow
vercel
# Follow the prompts
```

---

## Step 5 — Set Environment Variables in Vercel

1. Go to your Vercel project → **Settings → Environment Variables**
2. Add each of these:

```
NEXT_PUBLIC_SUPABASE_URL        = https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   = eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY       = eyJhbGc...
RESEND_API_KEY                  = re_xxxx
FROM_EMAIL                      = imports@yourcompany.fr
FROM_NAME                       = FreightFlow Imports
NEXT_PUBLIC_APP_URL             = https://your-app.vercel.app
ANTHROPIC_API_KEY               = sk-ant-xxxx
```

3. Click **Save** → Go to **Deployments** → **Redeploy**

---

## Step 6 — Test Your Deployment

1. Open your Vercel URL (e.g. `https://freightflow.vercel.app`)
2. You should see the FreightFlow dashboard with 3 sample shipments
3. Click **+ New Shipment** and create a test file
4. Click 📧 on a shipment → **New Arrival** → Send (make sure the email field is filled)
5. Copy the consignee link from a shipment detail → open in incognito → fill and submit
6. Watch the shipment auto-update in your dashboard

---

## How the Consignee Flow Works

```
You open a file → Client arrives → AWB received
        ↓
Click 📧 → Send "New Arrival" email
        ↓
Email contains: unique link → https://yourapp.vercel.app/confirm/[token]
        ↓
Consignee opens link → sees pre-filled shipment info
        ↓
They fill: delivery address, EORI, VAT, contact name
They tick: invoice confirmed, mandate signed, address confirmed
        ↓
They click Submit → your database updates automatically
Checklist item "Consignee OK" ticked ✓
Status auto-advances to "Docs Pending"
        ↓
You see the update live in your dashboard
```

---

## Daily Workflow

| Action | How |
|---|---|
| New shipment arrives | Click **+ New Shipment**, fill AWB, supplier, client |
| Send consignee notification | Open file → 📧 → New Arrival |
| Track missing documents | Dashboard → "Needs Attention" panel |
| Tick off checklist items | Open file → click each checklist item |
| Advance status | Open file → "Advance Status" button |
| Ask AI what's urgent | AI Assistant tab → "What's urgent?" |
| Send customs cleared notice | Open file → 📧 → Customs Cleared |

---

## File Structure

```
freightflow/
├── src/
│   ├── pages/
│   │   ├── index.tsx              ← Main dashboard app
│   │   ├── confirm/[token].tsx    ← Public consignee form
│   │   ├── _app.tsx
│   │   ├── _document.tsx
│   │   └── api/
│   │       ├── shipments/
│   │       │   ├── index.ts       ← GET all, POST new
│   │       │   ├── [id].ts        ← GET/PATCH/DELETE one
│   │       │   └── [id]/activity.ts
│   │       ├── confirm/[token].ts ← Public consignee API
│   │       ├── send-email.ts      ← Email sending
│   │       ├── ai-chat.ts         ← AI assistant
│   │       └── stats.ts           ← Dashboard stats
│   ├── lib/
│   │   ├── supabase.ts            ← DB client + types
│   │   └── email.ts               ← Email templates
│   └── styles/
│       └── globals.css
├── supabase/
│   └── migrations/
│       └── 001_schema.sql         ← Run this in Supabase
├── .env.local.example             ← Copy to .env.local
├── vercel.json
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## Adding Your Team

1. Go to Vercel project → **Settings → Members** → Invite colleagues
2. Go to Supabase project → **Settings → Team** → Invite team
3. Everyone accesses the same live data at your Vercel URL

---

## Importing Your Existing Excel Data

To migrate your existing tracker data from Excel:

1. Open **Supabase → Table Editor → shipments**
2. Click **Insert → Import data from CSV**
3. Or run the following in SQL Editor, replacing values:

```sql
INSERT INTO shipments (supplier, client_name, client_email, status, awb, agent, origin, packages, weight_kg, notes)
VALUES
  ('YOUR SUPPLIER', 'YOUR CLIENT', 'email@client.fr', 'Complete', 'AWB-NUMBER', 'AGENT', 'CHINE', 5, 200, 'Notes here');
```

---

## Troubleshooting

**Emails not sending:**
- Check Resend API key is correct in Vercel env vars
- Verify your domain in Resend dashboard
- Check Resend logs at resend.com/emails

**Database errors:**
- Make sure you ran the full SQL migration in Supabase
- Check that SUPABASE_SERVICE_ROLE_KEY is the `service_role` key, not the `anon` key

**Consignee form not loading:**
- Make sure NEXT_PUBLIC_APP_URL is set to your actual Vercel URL (no trailing slash)
- The token URL must match exactly: `/confirm/[uuid]`

**AI not responding:**
- Verify ANTHROPIC_API_KEY is valid
- Check Anthropic console for usage/billing

---

## Support & Next Features

Potential additions for v2:
- Document upload (invoice, packing list, AWB) stored in Supabase Storage
- Multi-user auth with team roles (admin, operator, read-only)
- Export to PDF for customs declarations
- WhatsApp notifications via Twilio
- Stripe invoicing integration
- Automated reminders (cron job via Vercel Cron)

---

*Built with Next.js · Supabase · Resend · Anthropic Claude*
