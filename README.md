# GitHub Tests Filter

> Chrome extension that filters test files from GitHub Pull Request file views.

When reviewing PRs, test files can dominate the file list and make it harder to focus on production code. This extension adds a **`.test.*`** toggle to GitHub's native "File extensions" dropdown, letting you hide test files from both the file tree and the diff panels with one click.

## How it works

The extension injects a checkbox into GitHub's existing file filter dropdown on PR pages. When test files are hidden:

- They disappear from the **file tree sidebar**
- Their **diff panels** are removed from the main view
- **Empty parent directories** collapse automatically
- The toggle shows the **count** of test files in the PR

The filter state persists across page loads and PR navigations.

### Matched patterns

Files matching these patterns are filtered (case insensitive):

- `*.test.ts`
- `*.test.tsx`

## Installation

1. Clone this repository:
   ```sh
   git clone https://github.com/pbuchman/github-tests-filter-extension.git
   ```
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the cloned folder
5. The extension icon appears in your toolbar

## Usage

1. Click the extension icon (funnel) in the Chrome toolbar
2. Toggle the extension **on**
3. Navigate to any GitHub PR → **Files changed** tab
4. Open the file extensions filter dropdown — you'll see the `.test.*` row
5. Uncheck it to show test files again; check it to hide them

## Project structure

```
├── manifest.json       Chrome extension manifest (V3)
├── content.js          Content script — DOM injection and filtering logic
├── popup.html          Toolbar popup UI
├── popup.js            Popup toggle logic
├── icons/              Extension icons (16, 48, 128px)
├── scripts/
│   ├── generate-icons.mjs   Icon generation script
│   └── test-extension.mjs   E2E test (Playwright)
├── LICENSE
└── README.md
```

## Development

### Prerequisites

- Node.js 18+
- Chrome

### Dev dependencies

```sh
npm install
```

### Regenerate icons

```sh
npm run generate-icons
```

### Run E2E tests

The test script requires a GitHub account with access to a PR containing test files:

```sh
GITHUB_EMAIL=you@example.com \
GITHUB_PASSWORD=yourpassword \
GITHUB_PR_URL=https://github.com/owner/repo/pull/123/files \
npm run test:e2e
```

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE)
