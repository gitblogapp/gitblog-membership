# Membership reader boundaries

- This repository owns the embedded reader, its gate, translations and parent/popup protocol.
- GitBlog owns login, memberships, billing, permission checks and private article/media APIs.
- Never add database bindings, shared session secrets, private article storage or public Worker routes here.
- Never put reader credentials in URLs, persistent browser storage, logs or parent-window messages.
- Keep `/membership/embed/{id}` and the v1 message protocol compatible with installed templates.
- Validate message origin, source, article ID and popup challenge. Treat render context as untrusted input.
- Run `npm run check`, `npm test`, `npm run build` before deployment.
- Deploy this Worker before adding its Service Binding to a new GitBlog deployment.
