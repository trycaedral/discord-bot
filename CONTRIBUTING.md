# Contributing

Thank you for contributing to the Caedral Discord bot.

## Development setup

1. Clone the repository (includes `discord-bot/` and `knowledge/`).
2. Copy `discord-bot/.env.example` to `discord-bot/.env` and configure secrets.
3. Build both packages:

```bash
cd knowledge && npm install && npm run build
cd ../discord-bot && npm install && npm run build
```

4. Run migrations: `cd discord-bot && npm run db:migrate`

## Pull requests

- Write commit messages in English.
- Keep changes focused; match existing TypeScript and formatting conventions.
- Ensure `npm run build` passes in both `knowledge/` and `discord-bot/`.
- Do not commit secrets (`.env`, API keys, tokens).

## Security

Report security issues to support@caedral.com — do not open public issues for vulnerabilities.

## License

By contributing, you agree that your contributions are licensed under the MIT License.
