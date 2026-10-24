# GitBlog Membership

An embedded reader for GitBlog membership articles. Readers can sign in and read the full article **inside the author's blog**, with colors and typography that fit the surrounding page.

This repository contains the reader UI and its independently deployed Cloudflare Worker. GitBlog supplies authentication, membership management, private content storage, and authorization. **Deploying this repository alone does not provide a standalone membership or payment backend.**

## Features

- In-blog reading with a sign-in gate and a membership enrollment link.
- Light, dark, and system themes, with optional host colors and typography.
- Responsive layouts and automatic iframe height updates.
- Twelve interface languages, including right-to-left Arabic.
- Popup authentication for use inside a cross-origin iframe.
- Private images fetched through GitBlog's authorized media API.
- Independent reader releases without rebuilding the main GitBlog application.

## Using the embed

### With the GitBlog Svelte template

Use [svelte-gitblog-template](https://github.com/gitblogapp/svelte-gitblog-template). Version **1.13.2 or later** includes the host appearance integration.

1. Connect your blog to GitBlog and configure its membership in the blog settings.
2. Create a new membership article in GitBlog Studio. Choose whether to publish a public preview, and provide the preview text if enabled.
3. Publish the article and deploy the blog. The template renders the public preview and inserts the reader using the article's membership ID.
4. Visitors see the membership gate. Authorized readers can sign in and read the full article without leaving the blog page.

The public repository contains a stub with metadata and the approved preview. The private full body stays in GitBlog. Do not put private article text in public Markdown, build output, RSS, search indexes, or generated audio. Making an already-public article private cannot remove copies from Git history or external caches.

**Current enrollment behavior:** GitBlog currently supports temporary membership enrollment without payment. Enrolling can therefore grant access without a charge. Payment processing and paid entitlement rules belong to GitBlog's backend, not this reader.

### With another template or framework

The embed uses a standard iframe and `postMessage`; it does not require Svelte. It does require:

- A published membership article created through GitBlog.
- Its real membership article ID, rather than a slug or an arbitrary UUID.
- An HTTPS blog origin registered in GitBlog. The embed's `origin` parameter must exactly match that registered origin, including any non-default port.

The public reader URL is:

```text
https://gitblog.app/membership/embed/{articleId}?origin={encodedBlogOrigin}&lang=en&theme=auto
```

| Parameter | Meaning |
| --- | --- |
| `articleId` | The membership article's ID in GitBlog. |
| `origin` | Required parent origin, such as `https://example.com`, without a path or trailing slash. Encode it with `URLSearchParams`. |
| `lang` | Optional interface language. Use one of the supported locale codes below. |
| `theme` | Optional `auto`, `light`, or `dark`. Defaults to `auto`. |

Supported locales: `ar`, `de`, `en`, `es`, `fr`, `it`, `ja`, `ko`, `pt`, `pt-br`, `zh-hans`, and `zh-hant`.

Here is a complete single-article example. Replace `YOUR_MEMBERSHIP_ARTICLE_ID`, and run it on the registered blog origin:

```html
<div id="membership-reader" data-pagefind-ignore></div>

<script type="module">
  const articleId = 'YOUR_MEMBERSHIP_ARTICLE_ID';
  const readerOrigin = 'https://gitblog.app';
  const host = document.getElementById('membership-reader');
  const frame = document.createElement('iframe');

  frame.title = 'GitBlog membership article';
  frame.referrerPolicy = 'no-referrer';
  frame.style.cssText =
    'display:block;width:100%;height:310px;border:0;color-scheme:normal';

  function sendTheme(theme = 'auto') {
    frame.contentWindow?.postMessage({
      type: 'gitblog-membership-theme',
      id: articleId,
      theme
    }, readerOrigin);
  }

  function receiveResize(event) {
    if (
      event.origin !== readerOrigin ||
      event.source !== frame.contentWindow ||
      event.data?.type !== 'gitblog-membership-resize' ||
      event.data.id !== articleId
    ) return;

    const height = Number(event.data.height);
    if (Number.isFinite(height)) {
      frame.style.height = `${Math.max(200, Math.min(100000, height))}px`;
    }
  }

  window.addEventListener('message', receiveResize);
  frame.addEventListener('load', () => sendTheme());
  frame.src = `${readerOrigin}/membership/embed/${encodeURIComponent(articleId)}?${
    new URLSearchParams({
      origin: location.origin,
      lang: document.documentElement.lang || 'en',
      theme: 'auto'
    })
  }`;
  host.append(frame);

  // In an SPA, call this when the article component is unmounted.
  function destroyMembershipReader() {
    window.removeEventListener('message', receiveResize);
    frame.remove();
  }
</script>
```

Keep the iframe inside the same width-constrained container as the article body. If your site sets its own Content Security Policy, allow `https://gitblog.app` in `frame-src`. The reader needs JavaScript and a user-triggered login popup; a restrictive iframe sandbox can prevent authentication from working.

### Matching the blog design

Send a theme message after the iframe loads and whenever your blog's theme changes. Use `postMessage` instead of changing `frame.src`, which would reload the reader and discard its in-memory token.

The message can include an optional `appearance` object:

```js
frame.contentWindow?.postMessage({
  type: 'gitblog-membership-theme',
  id: articleId,
  theme: 'light',
  appearance: {
    text: '#202124',
    bodyText: '#444444',
    muted: '#686868',
    border: '#dddddd',
    surface: '#f7f7f7',
    background: '#ffffff',
    accent: '#3055b0',
    bodyFont: 'Georgia, serif',
    headingFont: 'system-ui, sans-serif',
    fontSize: 18,
    lineHeight: 1.6
  }
}, readerOrigin);
```

Read these values from your blog's computed styles for the closest match. The official Svelte integration also updates on viewport changes and aligns the iframe width with the article body.

| Fields | Accepted values |
| --- | --- |
| `text`, `bodyText`, `muted`, `border`, `surface`, `background`, `accent` | Supported solid color values, such as hex or computed `rgb(...)`. |
| `bodyFont`, `headingFont` | Validated font-family lists. |
| `fontSize` | A number from 12 to 40, in pixels. |
| `lineHeight` | A unitless number from 1.2 to 2.5. |

The reader accepts only allowlisted style values, not arbitrary CSS, URLs, or stylesheets. When an `appearance` object is supplied, missing or invalid fields revert to reader defaults. The iframe does not inherit font files loaded by the parent page; unavailable fonts use the specified fallback families.

## Architecture

```text
Blog page: public preview + iframe
  |
  v
GitBlog /membership/embed/{articleId}
  | Checks publication and the registered parent origin
  | Sends public render metadata only
  v
MEMBERSHIP Service Binding
  |
  v
This Worker: standalone reader HTML, CSS, and JavaScript

Reader iframe
  |-- Login popup --> GitBlog authentication
  |                   --> one-time code --> article-scoped temporary token
  |
  |-- /api/membership/read/{articleId} --> authorization --> private article
  `-- /api/membership/assets/{assetId} --> authorization --> private image
```

| Component | Responsibilities |
| --- | --- |
| This repository | Reader UI, gate, translations, appearance, popup communication, and resize messages. |
| GitBlog backend | Accounts, memberships, payment policy, private body/media storage, permission checks, token issuance, and public endpoints. |
| Blog template | Public preview, iframe placement, theme/appearance updates, and validated height handling. |

This Worker has **no database or R2 bindings, authentication secrets, or public routes**. `workers.dev` and preview URLs are disabled. GitBlog invokes it through a Service Binding and never passes private bodies, cookies, or reader tokens to the rendering service.

### Authorization boundaries

- GitBlog checks authorization on each private article and image request. The gate is UI; hiding or modifying it does not grant access.
- Full article HTML is sanitized by GitBlog before it reaches the reader.
- Temporary reader tokens are scoped to one article and kept in iframe memory, not URLs or persistent browser storage.
- The parent blog receives resize messages, never the private body or authentication token.
- Messages are validated against their origin and source window. Theme messages also match the article ID; popup grants match a one-time challenge.
- Reader HTML uses `private, no-store`, `noindex, nofollow`, and a nonce-based Content Security Policy with the registered blog as its allowed frame ancestor.
- A reader service failure returns an unavailable response; it does not fall back to exposing the full article publicly.

Source visibility does not confer membership access. Authorized readers can still copy content they have legitimately received; this is access control, not copy protection.

## Protocol reference

The integration remains compatible with `gitblog-membership-v1` templates.

| Direction | Message |
| --- | --- |
| Parent → iframe | `{ type: 'gitblog-membership-theme', id, theme, appearance? }` |
| Iframe → parent | `{ type: 'gitblog-membership-resize', id, height }` |
| Login popup → iframe | `{ type: 'gitblog-membership-grant', code, challenge }` |

The parent should only implement theme and resize handling. The reader handles the popup grant internally. Always use an exact `targetOrigin`, and validate both `event.origin` and `event.source` for incoming messages.

The internal rendering endpoint is `POST /internal/render`, called through the Service Binding with:

```json
{
  "version": 1,
  "id": "11111111-1111-4111-8111-111111111111",
  "blogId": "22222222-2222-4222-8222-222222222222",
  "title": "Article title",
  "parentOrigin": "https://blog.example.com",
  "locale": "en",
  "theme": "auto"
}
```

These are illustrative IDs, not production articles. Do not expose this internal endpoint as a public Worker route. See [the protocol types](src/protocol.ts), [rendering entry point](src/worker.ts), and [reader implementation](src/reader.ts).

## Development

Requires Node.js 22 or later and npm.

```sh
npm ci
npm run check
npm test
npm run build
```

| Command | Purpose |
| --- | --- |
| `npm run generate` | Bundle browser code and CSS into generated reader assets. |
| `npm run check` | Generate assets and run TypeScript checks. |
| `npm test` | Generate assets and run the reader's regression tests. |
| `npm run build` | Generate assets and perform a Wrangler deployment dry run. |
| `npm run dev` | Start the local Worker. |
| `npm run deploy` | Deploy the Worker using your authenticated Wrangler session. |

Generated assets, local secrets, dependencies, and build output are excluded from Git. `private: true` in `package.json` prevents accidental npm publication; it does not refer to GitHub repository visibility.

For end-to-end local development, run this Worker's `dev` command alongside GitBlog's `preview:worker` environment, with the `MEMBERSHIP` Service Binding connected. GitBlog needs a published test article, configured membership, and registered HTTPS parent origin. This repository alone can run renderer tests, but it cannot authenticate readers or supply private articles.

Source layout:

```text
src/worker.ts       Internal renderer and response security headers
src/browser.ts      Browser entry point
src/reader.ts       Authentication UI, article/media loading, and lifecycle
src/protocol.ts     Message types and validation
src/appearance.ts   Allowlisted host appearance values
src/reader.css      Gate and article styles
src/messages.json  Interface translations
scripts/build.mjs  Generated asset bundling
test/              Reader, renderer, and appearance regression tests
```

## Deployment and operations

Deployment is for GitBlog service maintainers. Blog authors using the hosted embed do not need to deploy this Worker.

1. Authenticate Wrangler for the Cloudflare account that hosts GitBlog.
2. Run the checks above, then `npm run deploy` from this repository.
3. Add this entry to the main GitBlog Worker's `services` array in its Wrangler configuration:

   ```json
   { "binding": "MEMBERSHIP", "service": "gitblog-membership" }
   ```

4. Deploy GitBlog after the reader service exists. Subsequent reader-only changes can be deployed independently, while preserving the v1 contract.

GitHub Actions runs type checks, tests, and the build dry run. It does not deploy the service. Do not commit deployment credentials or add public routes to work around the Service Binding.

The public iframe response exposes `X-GitBlog-Membership-Version` and `X-GitBlog-Membership-Transport: service-binding` for deployment verification. Roll back a reader release with:

```sh
npx wrangler rollback <version-id>
```

Reader deployment and rollback do not change membership records or payment state.

| Symptom | Check |
| --- | --- |
| Embed returns 403 | The `origin` parameter must exactly match the registered blog origin. |
| Embed returns 404 | Check the article ID, publication state, and active blog registration. |
| Embed returns 503 | Check the deployed reader and GitBlog's `MEMBERSHIP` binding. |
| Gate remains visible after login | Confirm membership access and that the article/product is available; login alone does not grant access. |
| Login popup does not open | Allow the popup and check iframe sandbox restrictions. |
| Reader is clipped | Install the resize listener and verify its origin, source-window, and article-ID checks. |
| Appearance differs from the blog | Send validated computed styles after iframe load and theme changes; include available font fallbacks. |

See the [Cloudflare HTTP Service Bindings documentation](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/) for infrastructure details.
