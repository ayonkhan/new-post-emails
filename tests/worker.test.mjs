// Tests the Worker with a fake feed, a fake KV store and a fake Resend, so nothing real is called.
// Run them with: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

var env;
var store;
var broadcasts;
var resendStatus;
var feed;

function item(title, link, date, description) {
    return '<item><title>' + title + '</title><link>' + link + '</link>' +
        '<pubDate>' + date + '</pubDate><description>' + description + '</description></item>';
}

beforeEach(function () {
    store = { 'last-sent': 'https://example.com/posts/older/' };
    broadcasts = [];
    resendStatus = 200;
    feed = '<rss><channel>' +
        item('Fish &amp; Chips', 'https://example.com/posts/fish/', 'Sun, 08 Nov 2026 00:30:00 +0000',
            '&lt;p&gt;Why fish &amp;amp; chips &amp;rsquo;s the best.&lt;/p&gt;') +
        item('Older Post', 'https://example.com/posts/older/', 'Sat, 01 Nov 2026 12:00:00 +0000', 'Older') +
        '</channel></rss>';

    env = {
        RESEND_API_KEY: 're_test',
        FEED_URL: 'https://example.com/index.xml',
        FROM_EMAIL: 'Test <blog@news.example.com>',
        REPLY_TO: 'hello@example.com',
        SEGMENT_ID: 'segment-test',
        SITE_NAME: 'example.com',
        SITE_URL: 'https://example.com/',
        SENT_POSTS: {
            get: async function (key) { return key in store ? store[key] : null; },
            put: async function (key, value) { store[key] = value; }
        }
    };

    globalThis.fetch = async function (url, options) {
        if (url === env.FEED_URL) return new Response(feed);
        broadcasts.push(JSON.parse(options.body));
        return new Response('{}', { status: resendStatus });
    };
});

// Runs one scheduled check, the way Cloudflare does every hour
async function run() {
    var work = [];
    await worker.scheduled({}, env, { waitUntil: function (promise) { work.push(promise); } });
    await Promise.all(work);
}

test('a new post becomes a broadcast to the segment', async function () {
    await run();
    assert.equal(broadcasts.length, 1);
    var sent = broadcasts[0];
    assert.equal(sent.subject, 'New post: Fish & Chips');
    assert.equal(sent.segment_id, 'segment-test');
    assert.equal(sent.from, 'Test <blog@news.example.com>');
    assert.equal(sent.reply_to, 'hello@example.com');
    assert.equal(sent.send, true);
    assert.equal(store['last-sent'], 'https://example.com/posts/fish/');
});

test('the email is filled in, with special characters made safe', async function () {
    await run();
    var html = broadcasts[0].html;
    assert.match(html, /Fish &amp; Chips/);
    assert.match(html, /Why fish &amp; chips ’s the best\./);
    assert.match(html, /href="https:\/\/example\.com\/posts\/fish\/"/);
    assert.match(html, />example\.com</);
    assert.doesNotMatch(html, /%%\w+%%/);
    assert.match(html, /\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/);
});

test('the date follows TIME_ZONE and DATE_LOCALE', async function () {
    await run();
    assert.match(broadcasts[0].html, /8 November 2026/);

    store['last-sent'] = 'https://example.com/posts/older/';
    env.TIME_ZONE = 'America/Regina';
    env.DATE_LOCALE = 'en-US';
    await run();
    assert.match(broadcasts[1].html, /November 7, 2026/);
});

test('the same post is only emailed once', async function () {
    await run();
    await run();
    assert.equal(broadcasts.length, 1);
});

test('the very first run only remembers the newest post', async function () {
    delete store['last-sent'];
    await run();
    assert.equal(broadcasts.length, 0);
    assert.equal(store['last-sent'], 'https://example.com/posts/fish/');
});

test('the email is scheduled two hours later by default', async function () {
    await run();
    var minutes = (new Date(broadcasts[0].scheduled_at) - Date.now()) / 60000;
    assert.ok(minutes > 119 && minutes <= 120, 'scheduled ' + minutes + ' minutes later');
});

test('SEND_DELAY_HOURS changes the delay, and 0 sends right away', async function () {
    env.SEND_DELAY_HOURS = '0.5';
    await run();
    var minutes = (new Date(broadcasts[0].scheduled_at) - Date.now()) / 60000;
    assert.ok(minutes > 29 && minutes <= 30, 'scheduled ' + minutes + ' minutes later');

    store['last-sent'] = 'https://example.com/posts/older/';
    env.SEND_DELAY_HOURS = '0';
    await run();
    assert.equal(broadcasts[1].scheduled_at, undefined);
});

test('an invalid SEND_DELAY_HOURS stops before anything is sent', async function () {
    env.SEND_DELAY_HOURS = 'two';
    await assert.rejects(run(), /SEND_DELAY_HOURS must be a number/);
    assert.equal(broadcasts.length, 0);
    assert.equal(store['last-sent'], 'https://example.com/posts/older/');
});

test('if Resend fails, the post is tried again next time', async function () {
    resendStatus = 500;
    await assert.rejects(run(), /Resend returned 500/);
    assert.equal(store['last-sent'], 'https://example.com/posts/older/');
});

test('missing settings stop with a clear error', async function () {
    delete env.FEED_URL;
    delete env.SITE_NAME;
    await assert.rejects(run(), /Missing settings: FEED_URL, SITE_NAME/);
    assert.equal(broadcasts.length, 0);
});
