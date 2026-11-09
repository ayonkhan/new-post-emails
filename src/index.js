import template from '../templates/new-post.html';

export default {
    async scheduled(event, env, ctx) {
        ctx.waitUntil(checkFeed(env));
    }
};

async function checkFeed(env) {
    var xml = await fetch(env.FEED_URL).then(function (response) { return response.text(); });
    var post = latestPost(xml);
    if (!post) return;

    var lastSent = await env.SENT_POSTS.get('last-sent');
    if (lastSent === post.link) return;

    // On the very first run, remember the latest post without emailing it
    if (lastSent === null) {
        await env.SENT_POSTS.put('last-sent', post.link);
        return;
    }

    var response = await fetch('https://api.resend.com/broadcasts', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + env.RESEND_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            // Only shown in the Resend dashboard, so each broadcast is easy to find
            name: post.title,
            segment_id: env.SEGMENT_ID,
            from: env.FROM_EMAIL,
            reply_to: env.REPLY_TO,
            subject: 'New post: ' + post.title,
            html: fill(template, post),
            send: true,
            // Gives me time to check the email and cancel it in Resend
            scheduled_at: 'in 2 hours'
        })
    });

    if (!response.ok) {
        throw new Error('Resend returned ' + response.status + ': ' + await response.text());
    }
    await env.SENT_POSTS.put('last-sent', post.link);
}

// The feed lists the newest post first, so the first <item> is the one we want
function latestPost(xml) {
    var item = xml.match(/<item>([\s\S]*?)<\/item>/);
    if (!item) return null;

    var date = new Date(tag(item[1], 'pubDate'));
    return {
        title: tag(item[1], 'title'),
        link: tag(item[1], 'link'),
        // The description is escaped HTML, so decode it once more and strip the tags
        description: decode(tag(item[1], 'description')).replace(/<[^>]+>/g, '').trim(),
        date: date.toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Regina'
        })
    };
}

function tag(xml, name) {
    var match = xml.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>'));
    return match ? decode(match[1]) : '';
}

function decode(text) {
    return text
        .replace(/&#(\d+);/g, function (match, code) { return String.fromCodePoint(code); })
        .replace(/&#x([0-9a-f]+);/gi, function (match, code) { return String.fromCodePoint(parseInt(code, 16)); })
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&rsquo;/g, '’')
        .replace(/&amp;/g, '&');
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Uses %%name%% placeholders, so they never clash with Resend's {{{...}}} ones
function fill(html, post) {
    return html.replace(/%%(\w+)%%/g, function (match, name) {
        return escapeHtml(post[name] || '');
    });
}
