import { readFile } from 'node:fs/promises';

// Turns `import template from '../templates/new-post.html'` into the file's text
export async function load(url, context, nextLoad) {
    if (url.endsWith('.html')) {
        var text = await readFile(new URL(url), 'utf8');
        return { format: 'module', source: 'export default ' + JSON.stringify(text) + ';', shortCircuit: true };
    }
    return nextLoad(url, context);
}
