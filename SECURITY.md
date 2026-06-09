# Security Policy

Atlas OS Community is a self-hosted AI workspace with privileged local capabilities (inherited from the upstream Odysseus codebase). Treat it like an **admin console**, not a public website.

## Supported versions

Security fixes are handled on the default branch until formal releases are cut.

## Deployment guidance

### Do not expose Atlas directly to the public internet

- Run on **localhost** (`APP_BIND=127.0.0.1`) for personal use.
- If you need remote access, use a **trusted reverse proxy or private access layer** (VPN, Tailscale, Cloudflare Access, etc.) with authentication — not a raw port forward.
- Keep **auth enabled** (`AUTH_ENABLED=true`) for any network-accessible deployment.
- Set `LOCALHOST_BYPASS=false` outside local development.
- Set `SECURE_COOKIES=true` when served over HTTPS behind a trusted proxy.

### Protect secrets and runtime data

- Keep **`.env` private** — never commit it or paste values into issues, PRs, or screenshots.
- Protect `data/`, `logs/`, uploads, backups, auth/session files, databases, and API keys.
- Users must configure their **own OpenAI, Ollama, and other provider credentials** — the project does not ship keys.
- Rotate API keys, webhook secrets, and tokens if they appear in logs, demos, or shared chats.

### Desktop Bridge

The Desktop Bridge can launch apps and open folders on your Windows host. It is **powerful**:

- Keep **`ATLAS_BRIDGE_TOKEN` secret** — same value in `.env`, the bridge process, and Atlas settings.
- Run the bridge bound to **localhost only** (default); do not expose port 8765 to LAN or the internet without additional controls.
- Keep `DESKTOP_COMMANDS_ENABLED=false` until you have configured `desktop_bridge/apps.json` intentionally.
- Whitelist only apps you trust in `apps.json`.

### Internal services

Keep ChromaDB, SearXNG, ntfy, Ollama, vLLM, llama.cpp, databases, and raw model/provider APIs **internal-only**. Common ports: Atlas `7000`, SearXNG `8080`, ntfy `8091`, ChromaDB `8100`, Ollama `11434`.

### Privileged features

Logged-in admins may use shell, Python, file read/write, email, MCP, model serving, and settings tools. Leave high-risk agent tools restricted to admins on serious deployments. Use strong passwords and 2FA where possible. Disable open signup unless intentional.

### Screenshots and demos

- **Do not share screenshots** that show API keys, tokens, `.env` contents, or personal data.
- Redact bridge tokens and auth cookies before posting issue attachments.

## Publishing a fork

Before pushing a public fork:

```powershell
git status --short
git check-ignore -v .env data/auth.json data/app.db logs/compound.log odysseus.db
```

Only source, tests, static assets, and `.env.example` should be committed — not live secrets or runtime data.

See [CLEAN_RELEASE_CHECKLIST.md](CLEAN_RELEASE_CHECKLIST.md).

## Reporting vulnerabilities

**Do not** disclose exploit details in a public issue.

Report vulnerabilities via:

- **GitHub Security Advisories** (preferred, if enabled for the repository), or
- A **minimal private issue** that describes impact without reproduction steps, or
- **Private contact:** replace with your maintainer security email when publishing the repo

We will acknowledge reports and coordinate fixes responsibly.
