# Getting the brief online, step by step

You'll use Terminal a handful of times. Every command below is copy-and-paste; nothing needs editing. The whole thing takes about 15 minutes, most of it waiting.

## Before you start

You need a Fly.io account (you have one) and a Mac. Keep this file open alongside Terminal.

## Step 1. Open Terminal

Press Cmd + Space, type `Terminal`, press Return. A window with a blinking cursor appears. Everything you paste goes there, followed by Return.

## Step 2. Install Homebrew (skip if you already have it)

Paste this and press Return. It asks for your Mac password (nothing shows while you type; that's normal) and takes a few minutes.

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

When it finishes it may print two lines starting with `echo` and `eval` under "Next steps". Copy and paste those too.

## Step 3. Install the Fly command-line tool

```
brew install flyctl
```

## Step 4. Sign in to Fly

```
fly auth login
```

Your browser opens. Sign in to Fly, click the button to authorise, come back to Terminal. It says you're logged in.

## Step 5. Go to the deploy folder

```
cd ~/Documents/Claude\ Projects/Briefing/deploy
```

## Step 6. Run the setup

```
bash setup.sh
```

It asks two questions. First, a name for the site (press Return to accept `shamal-brief`; your address becomes `https://shamal-brief.fly.dev`). If Fly says the name is taken, run it again with a different one. Second, a passphrase of at least 12 characters, which is what you type to open the brief in a browser. Pick something you'll remember; nothing shows while you type.

Then it works for a couple of minutes: creates the app in Sydney, adds storage, saves your passphrase and a generated publishing key as secrets on Fly, deploys, saves the publishing settings into a private folder on your Mac, and pushes today's brief. The last line is "Done" with your address.

## Step 7. Open the site

Visit the address in your browser, enter your passphrase, and today's brief is there. The passphrase lasts 30 days per browser. On your phone, open the same address and enter it once.

## Step 8. Turn on the morning update

Come back to the Claude chat and say "the site is live, set up the morning schedule". Claude will create a weekday 06:30 task that reads your Slack, Calendar, Zoom, Gmail and Figma, writes the brief, checks every link and quote against what it read, and publishes it to your site. You don't need Terminal for that.

## If something goes wrong

If Terminal says `command not found: fly`, close Terminal, open it again, and repeat from Step 3.

If `setup.sh` stops partway, running `bash setup.sh` again is safe; it skips what already exists.

If the site shows "No brief has been published yet", wait a minute and paste:

```
cd ~/Documents/Claude\ Projects/Briefing/deploy && ./push-brief.sh "$(ls ../briefs/*.json | sort | tail -n 1)"
```

To see what the server is doing: `fly logs -a shamal-brief`. To take the site down completely: `fly apps destroy shamal-brief`.

## What's where

The site's two secrets (your passphrase, the publishing key) live on Fly. A copy of the publishing key and your site address live in `Briefing/.deploy/` on your Mac so the morning job can publish; don't share that folder. No Slack, Google, Zoom or Figma credentials exist anywhere on the server. Fly's smallest machine with a 1 GB volume sits within the free allowance for most personal accounts; check your Fly dashboard after the first month.
