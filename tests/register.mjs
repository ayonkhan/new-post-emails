// Lets Node import the compiled email template the way Wrangler does, as plain text
import { register } from 'node:module';

register('./html-loader.mjs', import.meta.url);
