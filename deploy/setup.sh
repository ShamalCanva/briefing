#!/usr/bin/env bash
# One-shot setup for the brief on Fly.io. Run it from Terminal after `fly auth login`:
#   bash setup.sh
# It asks for a passphrase, creates the app, the storage volume and the secrets, deploys,
# saves the publish settings into ../.deploy/, and pushes the newest brief.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }

command -v fly >/dev/null 2>&1 || { echo "flyctl is not installed. Run:  brew install flyctl   then try again."; exit 1; }
fly auth whoami >/dev/null 2>&1 || { echo "You're not logged in to Fly. Run:  fly auth login   then try again."; exit 1; }

say "1/6  Pick a name for your site"
read -r -p "App name (letters, numbers, dashes; becomes https://NAME.fly.dev) [shamal-brief]: " APP
APP="${APP:-shamal-brief}"
sed -i.bak "s/^app = .*/app = \"$APP\"/" fly.toml && rm -f fly.toml.bak

say "2/6  Choose the passphrase you'll type to open the site"
while true; do
  read -r -s -p "Passphrase (at least 12 characters): " PW; echo
  [ "${#PW}" -ge 12 ] && break
  echo "Too short, try again."
done
SECRET="$(openssl rand -hex 32)"

say "3/6  Creating the app on Fly (Sydney)"
if ! fly apps list 2>/dev/null | awk '{print $1}' | grep -qx "$APP"; then
  fly apps create "$APP" --org personal
fi

say "4/6  Creating storage and secrets"
if ! fly volumes list -a "$APP" 2>/dev/null | grep -q brief_data; then
  fly volumes create brief_data -a "$APP" --region syd --size 1 --yes
fi
fly secrets set -a "$APP" SITE_PASSWORD="$PW" INGEST_SECRET="$SECRET" --stage

say "5/6  Deploying (this takes a minute or two)"
fly deploy -a "$APP" --ha=false

say "6/6  Saving publish settings and pushing today's brief"
mkdir -p ../.deploy
echo "https://$APP.fly.dev" > ../.deploy/site_url
echo "$SECRET" > ../.deploy/ingest.secret
chmod 600 ../.deploy/ingest.secret
LATEST="$(ls ../briefs/*.json | sort | tail -n 1)"
sleep 5
if ./push-brief.sh "$LATEST"; then
  echo "Published $(basename "$LATEST")."
else
  echo "The site is up but the first push didn't go through yet. Wait a minute and run:  ./push-brief.sh $LATEST"
fi

say "Done. Open https://$APP.fly.dev and enter your passphrase."
echo "Keep ../.deploy/ private; it holds the key that lets the morning job publish."
