# Contributing to node-red-contrib-i3x

Thanks for your interest in improving the i3X nodes for Node-RED! Contributions of
all kinds are welcome — bug reports, documentation fixes, new features, and tests.

## Getting started

```bash
git clone https://github.com/blanpa/node-red-contrib-i3x
cd node-red-contrib-i3x
npm install
```

Requires **Node.js ≥ 18**.

## Development workflow

```bash
npm run lint           # ESLint over lib/, nodes/, test/
npm run lint:fix       # auto-fix what can be fixed
npm run test:unit      # offline unit tests (HTTP mocks via nock)
npm run test:coverage  # unit tests with coverage report
npm test               # full suite (unit + integration; integration needs network)
```

To try the nodes inside a real Node-RED instance:

```bash
cd ~/.node-red
npm install /path/to/node-red-contrib-i3x
node-red
```

Or use the bundled Docker setup:

```bash
docker compose up node-red   # http://localhost:18880
```

## Pull request checklist

Before opening a PR, please make sure:

- [ ] `npm run lint` passes with no errors
- [ ] `npm run test:unit` passes
- [ ] New behaviour is covered by tests
- [ ] Public client changes are reflected in `lib/i3x-client.d.ts`
- [ ] User-facing changes are noted in `CHANGELOG.md` and, if relevant, `README.md`
- [ ] The change stays compatible with the **i3X API 1.0 Release** specification

## Coding conventions

- CommonJS modules, 4-space indentation (see `.editorconfig`)
- Keep the shared HTTP logic in `lib/i3x-client.js`; nodes should delegate to it
  rather than calling `axios` directly
- Match the resilience patterns already in place (retry/backoff, caching, rate
  limiting) when adding new endpoints

## Reporting bugs and requesting features

Please use the GitHub issue templates. Include the i3X server version, the node
version, and a minimal flow export where possible.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
