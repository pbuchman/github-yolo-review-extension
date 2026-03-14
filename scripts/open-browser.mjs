/**
 * Opens a Chrome browser with the extension loaded and keeps it open.
 * You can log in manually and test the extension.
 * Press Ctrl+C in the terminal to close.
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..');
const PR_URL = process.argv[2] || 'https://github.com/pbuchman/intexuraos/pull/1161/files';

const userDataDir = path.join(__dirname, '..', '.logged-in-profile');

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
    '--no-first-run',
  ],
});

const page = context.pages()[0] || await context.newPage();
await page.goto(PR_URL);

console.log('Browser open. Log in and test the extension.');
console.log('Press Ctrl+C to close.');

// Keep alive until Ctrl+C
await new Promise(() => {});
