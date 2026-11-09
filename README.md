# new-post-emails

A Cloudflare Worker that emails subscribers when a new post goes live on [ayonkhan.ca](https://www.ayonkhan.ca/).

Once an hour, it reads the blog's RSS feed. When it finds a post it hasn't emailed yet, it fills in the email template and creates a broadcast in [Resend](https://resend.com/), scheduled two hours later. That leaves time to check the email and cancel it in Resend if something looks wrong.

It reads the live feed instead of watching the blog's repo, because Hugo hides posts with a future date until that date comes. The feed only lists posts that are actually live.

The signup form and the confirmation emails live in the blog's own repo, as Cloudflare Pages Functions.

## How It Works

- `src/index.js` reads the feed, compares the newest post with the last one emailed, and creates the broadcast.
- `templates/new-post.mjml` is the email template, written in [MJML](https://mjml.io/). It's compiled to HTML on every build. Placeholders use `%%name%%`, so they don't clash with Resend's `{{{...}}}` placeholders.
- Cloudflare KV (`SENT_POSTS`) remembers the last post that was emailed. On the very first run, it only records the newest post and sends nothing.

## Requirements

- [Node.js](https://nodejs.org/)
- A Cloudflare account, for KV and deploying
- A Resend account with a verified domain

## Setup

Install the dependencies:

```bash
npm install
```

Log Wrangler in to your Cloudflare account:

```bash
npx wrangler login
```

## Settings

Plain settings live in `wrangler.toml`: the feed address, the sender, the reply address, the subscribers segment, the KV namespace and the hourly schedule.

The Resend API key is a secret, set once on Cloudflare:

```bash
npx wrangler secret put RESEND_API_KEY
```

## Run Locally

Create a `.dev.vars` file in the project folder. It's in `.gitignore`, so it never gets committed.

```text
RESEND_API_KEY=re_...
SEGMENT_ID=<a test segment with only your own address>
```

`SEGMENT_ID` here overrides the one in `wrangler.toml`, so local runs only ever email the test segment, never real subscribers.

Locally, KV starts empty, so the first run would only record the newest post. To make the newest post count as new, pretend an older one was emailed last:

```bash
npx wrangler kv key put last-sent "https://www.ayonkhan.ca/posts/old/" --binding SENT_POSTS --local
```

Start the Worker. This also compiles the template, and lets you trigger the hourly job yourself:

```bash
npm run dev
```

Then, in a second terminal tab, trigger a run:

```bash
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

A new broadcast shows up in Resend under **Broadcasts**, scheduled two hours later. Run the same command again, and nothing new should appear, since the Worker now remembers that post. When you're done, unschedule or delete the test broadcast in Resend.

## Deploy

The repo is connected to Cloudflare with Workers Builds, so every push to `main` builds and deploys the Worker. The build compiles the template, using the `[build]` command in `wrangler.toml`.

To see which post the deployed Worker emailed last:

```bash
npx wrangler kv key get last-sent --binding SENT_POSTS --remote
```

## License

[MIT](LICENSE)
