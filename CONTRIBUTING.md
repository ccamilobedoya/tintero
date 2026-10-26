# Contributing

[Leer en español](CONTRIBUTING.es.md)

Thank you for helping. This page tells you how to set up the project, what to check before you send a change, and what must never go into the repository.

## Set up

You need Node 24 (see `.nvmrc`) and Docker. Then, from the repository folder:

```bash
npm ci && npm run setup   # dependencies + git hooks
```

`npm ci` installs exactly what `package-lock.json` says. Please do not run `npm install <package>`: a new dependency needs a good reason, and the reviewers will ask for it.

## Checks before you send a change

All of these must pass:

```bash
npm run typecheck     # strict TypeScript
npm run lint          # ESLint with security rules
npm test              # unit tests (Vitest), next to the code in *.test.ts
npm run format:check  # Prettier
tools/revisar         # the full review (needs Docker); the summary is in .revisar/resumen.md
```

Write unit tests for the code you add. Code, identifiers and comments are in English.

## What must never go in

- **Nothing personal, nothing about your own infrastructure, no secrets.** No real names, home or office networks, `*.ts.net` names, IP addresses, e-mail addresses, file paths from your machine, keys, tokens or calendar addresses. Use placeholders such as `tintero.example.ts.net`, `example.com`, `p1` and `/path/to/pki`.
- Files such as `secrets.h`, `tintero_certs.h`, `*.key`, `*.pem`, `devices.txt` and `.env*` are blocked by name by the pre-commit hook (the full list is in `tools/never-commit.txt`).
- Hooks can be skipped with `git commit --no-verify`; please do not. Before publishing, `tools/revision-publicacion` is run: it checks the tree and the history without relying on the hooks.
- Every input from outside (network, files, headers, output of other programs) gets a size limit **before** it is parsed.
- Local services listen on `127.0.0.1` only. Please do not add examples or documents that use HTTP without TLS, open file permissions, or turn off certificate checks.

If you find a security problem, do not open an issue: follow [SECURITY.md](SECURITY.md).

## About the agent process

The author builds Tintero with a process of AI agents (cards, architecture decisions, reviews) described in [`docs/PROCESO.md`](docs/PROCESO.md) (in Spanish). That process is the author's own and is **not** required from you. A normal pull request that passes the checks above is welcome.

By contributing you agree that your work is released under the [MIT License](LICENSE).
