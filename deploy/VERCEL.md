# Deploying on Vercel, step by step

The repo now works on Vercel out of the box: `public/index.html` is the page, `api/` holds the login and brief functions, `middleware.js` keeps everything behind your passphrase, and briefs are stored in a Vercel Blob store. No build step.

## 1. Push the Vercel files

In Terminal:

```
cd ~/Documents/Claude\ Projects/Briefing
git add .
git commit -m "Vercel host: functions, middleware, blob storage"
git push
```

## 2. Make your two secrets

Still in Terminal, generate the publishing key and copy the output (a long string of letters and numbers):

```
openssl rand -hex 32
```

Decide on a passphrase of at least 12 characters. That's what you'll type to open the site.

## 3. Fill in the New Project form on vercel.com

Leave Vercel Team, Project Name (`briefing`), Root Directory (`./`) and Application Preset (`Other`) as they are. Leave Build and Output Settings empty; `vercel.json` in the repo sets them.

Under Environment Variables add two rows (click "Add More" for the second). Keep "Production and Preview" selected:

| Key | Value |
|---|---|
| `SITE_PASSWORD` | your passphrase |
| `INGEST_SECRET` | the string from `openssl rand -hex 32` |

Click Deploy. It takes under a minute. The site will open to the passphrase screen; after you log in it will say "No Blob store connected", which the next step fixes.

## 4. Add storage

In the project on vercel.com, open the **Storage** tab → **Create Database** → **Blob** → name it `briefs` → Create, then **Connect** it to the `briefing` project (all environments). This adds `BLOB_READ_WRITE_TOKEN` to the project automatically.

Then go to **Deployments**, open the ⋯ menu on the latest deployment, and choose **Redeploy** so the function picks up the token.

## 5. Tell the publish script about the site

Your address is shown on the project page, something like `https://briefing-xyz.vercel.app`. In Terminal (replace the address and paste your publishing key when prompted):

```
cd ~/Documents/Claude\ Projects/Briefing
mkdir -p .deploy
echo "https://briefing-xyz.vercel.app" > .deploy/site_url
read -r -s -p "Paste INGEST_SECRET: " S; echo; echo "$S" > .deploy/ingest.secret; chmod 600 .deploy/ingest.secret
./deploy/push-brief.sh "$(ls briefs/*.json | sort | tail -n 1)"
```

You should see `{"ok":true,"date":"2026-10-08"}`. Reload the site: today's brief is there. The `.deploy` folder is gitignored, so these never reach GitHub.

## 6. Morning updates

Back in the Claude chat, say "the site is live on Vercel, set up the morning schedule". Each weekday at 06:30 Claude reads your sources, writes the brief, verifies links and quotes, and runs `push-brief.sh`. The Refresh button on the page re-fetches the latest brief.

## Notes

The passphrase cookie lasts 30 days per browser. Vercel's own password protection isn't needed (and isn't included on Hobby); the middleware does the same job. Login attempts are rate-limited per function instance, which is best-effort on serverless; the passphrase length is the real defence, so make it long. The Blob store's free allowance covers years of daily briefs. To rotate the publishing key, change `INGEST_SECRET` in Settings → Environment Variables, redeploy, and update `.deploy/ingest.secret`; changing `SITE_PASSWORD` logs every browser out.

The Fly.io variant in this folder still works if you ever prefer it; the two share the page and the publish script.
