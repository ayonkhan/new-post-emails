# Paperboy

**Paperboy** emails your subscribers when a new post appears in your RSS feed, using [Resend](https://resend.com/). It's a small Cloudflare Worker. I use it on my blog, [ayonkhan.ca](https://www.ayonkhan.ca/).

Once an hour, it reads your feed. When it finds a post it hasn't emailed yet, it fills in the email template and creates a broadcast in Resend, scheduled two hours later. That leaves time to check the email and cancel it in Resend if something looks wrong.

It works with any site that has an RSS feed, whatever it's built with. It reads the live feed instead of watching your site's repo, so a post with a future date isn't emailed until it's actually published.

Paperboy only sends. To collect subscribers on a Hugo site using PaperMod, see [papermod-subscribe](https://github.com/ayonkhan/papermod-subscribe). Any other way of adding contacts to a Resend segment works too.

## How It Works

- `src/index.js` reads the feed, compares the newest post with the last one emailed, and creates the broadcast.
- `templates/new-post.mjml` is the email template, written in [MJML](https://mjml.io/). It's compiled to HTML on every build. Placeholders use `%%name%%`, so they don't clash with Resend's `{{{...}}}` placeholders.
- Cloudflare KV (`SENT_POSTS`) remembers the last post that was emailed. On the very first run, it only records the newest post and sends nothing, so turning it on doesn't email an old post to everyone.

## Requirements

- [Node.js](https://nodejs.org/)
- A Cloudflare account, for the Worker and KV
- A [Resend](https://resend.com/) account with a verified domain
- An RSS 2.0 feed (Atom feeds aren't supported)

## Setup

### 1. Get the Code

Fork this repo on GitHub, then clone your fork:

```bash
git clone git@github.com:<your-username>/paperboy.git
```

```bash
cd paperboy
```

Install the dependencies:

```bash
npm install
```

Log Wrangler in to your Cloudflare account:

```bash
npx wrangler login
```

### 2. Create the KV Namespace

This is where Paperboy remembers the last post it emailed:

```bash
npx wrangler kv namespace create SENT_POSTS
```

It prints an `id`. Put that in `wrangler.toml`, under `[[kv_namespaces]]`, in place of the one there.

### 3. Set Up Resend

1. Add and verify your sending domain. Resend recommends a subdomain, such as `news.example.com`.
2. Under **Audience**, create a segment for subscribers, and copy its ID.
3. Under **API Keys**, create a key with sending access.

### 4. Fill In the Settings

Plain settings live under `[vars]` in `wrangler.toml`:

| Setting | Example | What it's for |
| --- | --- | --- |
| `SITE_NAME` | `example.com` | Shown at the top and bottom of the email |
| `SITE_URL` | `https://example.com/` | Where the site name links to |
| `FEED_URL` | `https://example.com/index.xml` | Your RSS feed |
| `FROM_EMAIL` | `Your Name <blog@news.example.com>` | The sender, on your verified domain |
| `REPLY_TO` | `hello@example.com` | Where replies go (optional) |
| `SEGMENT_ID` | the Resend segment ID | Who gets the email |
| `TIME_ZONE` | `America/Regina` | Used for the post date in the email (optional, defaults to `UTC`) |
| `DATE_LOCALE` | `en-US` | How the date is written (optional, defaults to `en-GB`, as in "7 November 2026") |

The Resend API key is a secret, so it's set on Cloudflare instead:

```bash
npx wrangler secret put RESEND_API_KEY
```

It asks you to paste the key, and stores it encrypted.

### 5. Deploy

```bash
npm run deploy
```

This compiles the template and deploys the Worker. From then on, it checks your feed at the start of every hour.

To deploy on every push instead, connect the repo in Cloudflare under **Workers & Pages > paperboy > Settings > Builds**.

## Customize

- **The email:** edit `templates/new-post.mjml`. The placeholders you can use are `%%title%%`, `%%description%%`, `%%link%%`, `%%date%%`, `%%site_name%%` and `%%site_url%%`. Keep `{{{RESEND_UNSUBSCRIBE_URL}}}`, since Resend needs it for the unsubscribe link.
- **The subject:** it's set in `src/index.js`, as `'New post: ' + post.title`.
- **How often it checks:** change `crons` in `wrangler.toml`.
- **The delay before sending:** change `scheduled_at` in `src/index.js`.

## Run Locally

Create a `.dev.vars` file in the project folder. It's in `.gitignore`, so it never gets committed.

```text
RESEND_API_KEY=re_...
SEGMENT_ID=<a test segment with only your own address>
```

`SEGMENT_ID` here overrides the one in `wrangler.toml`, so local runs only ever email the test segment, never real subscribers.

Locally, KV starts empty, so the first run would only record the newest post. To make the newest post count as new, pretend an older one was emailed last:

```bash
npx wrangler kv key put last-sent "https://example.com/posts/old/" --binding SENT_POSTS --local
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

## Check on It

To see which post was emailed last:

```bash
npx wrangler kv key get last-sent --binding SENT_POSTS --remote
```

If a run fails, for example because Resend rejects the broadcast, the error shows up under **Workers & Pages > paperboy > Observability**.

## License

[MIT](LICENSE)
