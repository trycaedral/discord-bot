# Contributing

Thank you for contributing to the Caedral Discord bot.

## Development setup

1. Clone the repository (bot sources at repo root + bundled `knowledge/`).
2. Copy `.env.example` to `.env` and configure secrets.
3. Build both packages:

```bash
cd knowledge && npm install && npm run build
cd .. && npm install && npm run build
```

## Pull requests

- Open PRs against `main`.
- Keep changes focused; include a short description of behavior changes.
- Ensure `npm run build` passes in both `knowledge/` and the repo root.

## Code of conduct

Be respectful and constructive. Security issues: report privately to the Caedral team rather than opening a public issue with secrets or exploit details.
