// Application entry point. Kept as a file so the inline script can be removed
// and the page can enforce a strict script-src Content-Security-Policy.
import { boot } from './ui.js';

boot();
