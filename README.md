# GitHub YOLO Review

> The missing GitHub feature for the AI-generated code era.

Let's face it. It's 2026. Your pull requests are written by frontier LLMs. The code is *immaculate*. Statistically flawless. Peer-reviewed by a model that has read every Stack Overflow post ever written and still chose to mass-produce test files nobody asked for.

The problem? **Metrics.** Somebody somewhere decided that "test coverage" matters, so now your AI dutifully generates 47 test files per PR. Beautiful, pristine tests. Tests that test the tests. Tests that import mocks of mocks. A cathedral of verification for code that was already perfect the moment it left the transformer.

And now you — the human reviewer — are expected to *look at them*. Scroll past them. Pretend to understand them. Click "Approve" with the quiet dignity of someone who definitely read all 2,400 lines of `useGitHubEventLog.test.ts`.

**No more.**

GitHub YOLO Review adds the one filter GitHub was too afraid to ship: **hide the tests.** One click and they vanish. Gone. The diff shrinks. The file tree breathes. You can finally focus on what matters — approving the PR and getting back to prompting.

Our rigorous research shows this saves between **32% and 34%** of code review time*, which can be reinvested into generating even more code. The cycle of productivity is now complete.

This extension is built entirely by a frontier LLM — so you know it works. It was tested by an LLM too. The tests were then hidden using this very extension. It's LLMs all the way down.

*\*Methodology: vibes.*

---

## Installation

Since you've already mass adopted AI-generated code without reading it, installing an unreviewed browser extension from a stranger on the internet should feel completely natural.

1. Clone this repository (or just ask your LLM to do it):
   ```sh
   git clone https://github.com/pbuchman/github-yolo-review-extension.git
   ```
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** — yes, the toggle in the top-right that says "I accept the consequences." You've been accepting consequences all year.
4. Click **Load unpacked** and select the cloned folder. Chrome will warn you about security. Ignore it. You ignore test files, why not security warnings.
5. The extension icon (a funnel, because we're filtering out accountability) appears in your toolbar. You're ready.

> **Enterprise users:** If your security team asks what this extension does, tell them it's an "AI-assisted code review optimization layer." They'll approve it immediately.

---

## How it works

The extension injects a toggle into GitHub's native file filter dropdown on PR pages. When test files are hidden:

- They disappear from the **file tree sidebar**
- Their **diff panels** are removed from the main view
- **Empty parent directories** collapse automatically (no lonely `__tests__/` folders judging you)
- The toggle shows the **count** of test files you're choosing to ignore

The filter state persists across page loads and PR navigations because commitment to not reviewing tests should be durable.

### Configurable patterns

Open the popup to manage which file suffixes get filtered. Defaults:

- `*.test.ts`
- `*.test.tsx`

Add your own — `.spec.ts`, `.stories.tsx`, `.test.js` — whatever your LLM is generating that you'd rather not see. The popup lets you add, remove, and toggle patterns without touching code, because touching code is what LLMs are for.

## Usage

1. Click the extension icon (funnel) in the Chrome toolbar
2. Toggle the extension **on** (icon turns green — the color of go, the color of approval)
3. Navigate to any GitHub PR -> **Files changed** tab
4. Open the file extensions filter dropdown — you'll see the test files row
5. Uncheck it to show test files again (in case someone is watching)

## Project structure

```
+-- manifest.json           Chrome extension manifest (V3)
+-- content.js              Content script -- DOM injection and filtering logic
+-- background.js           Service worker -- icon swapping (grey=off, green=go)
+-- popup.html / popup.js   Toolbar popup UI + pattern management
+-- icons/                  Extension icons (inactive grey + active green)
+-- scripts/
|   +-- generate-icons.mjs      Icon generation script
|   +-- test-local.mjs          E2E test -- classic GitHub view (public repo)
|   +-- test-logged-in.mjs      E2E test -- Primer view (authenticated)
|   +-- open-browser.mjs        Debug helper
+-- LICENSE
+-- README.md
```

## Development

### Prerequisites

- Node.js 18+
- Chrome
- A willingness to ship

### Setup

```sh
npm install
```

### Regenerate icons

```sh
npm run generate-icons
```

### Run E2E tests

Classic view (no login required):
```sh
node scripts/test-local.mjs
```

Primer view (requires GitHub login):
```sh
node scripts/test-logged-in.mjs
```

Yes, this extension has tests. No, we didn't review them.

## Contributing

Contributions are welcome. Please open an issue first, or just have your LLM open one. We'll have our LLM review it.

## License

[MIT](LICENSE)
