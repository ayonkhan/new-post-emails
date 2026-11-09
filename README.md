# new-post-emails

A Cloudflare Worker that emails subscribers when a new post goes live on [ayonkhan.ca](https://www.ayonkhan.ca/).

Once an hour, it reads the blog's RSS feed. When it finds a post it hasn't emailed yet, it fills in the email template and creates a broadcast in [Resend](https://resend.com/), scheduled two hours later. That leaves time to check the email and cancel it in Resend if something looks wrong.

It reads the live feed instead of watching the repo, because Hugo hides posts with a future date until that date comes. The feed only lists posts that are actually live.

## How it works

- `src/index.js` reads the feed, compares the newest post with the last one emailed, and creates the broadcast.
- `templates/new-post.mjml` is the email template, written in [MJML](https://mjml.io/). It's compiled to HTML on every build. Placeholders use `%%name%%`, so they don't clash with Resend's `{{{...}}}` placeholders.
- Cloudflare KV (`SENT_POSTS`) remembers the last post that was emailed. On the very first run, it only records the newest post and sends nothing.

## Settings

Plain settings live in `wrangler.toml`. The Resend API key is a secret:

```bash
npx wrangler secret put RESEND_API_KEY
```

## Local testing

Create a `.dev.vars` file (it's in `.gitignore`):

```text
RESEND_API_KEY=re_...
SEGMENT_ID=<a test segment with only your own address>
```

Then start the Worker with scheduled events enabled:

```bash
npm run build
```

```bash
npm run dev
```

And trigger a run:

```bash
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```
