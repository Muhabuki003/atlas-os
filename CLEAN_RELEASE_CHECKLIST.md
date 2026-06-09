# Public Release Checklist

Use this checklist before publishing **Atlas OS Community** to a public GitHub repository.

## Secrets and credentials

- [ ] No API keys in the repo (`OPENAI_API_KEY`, `sk-…`, Stripe, Supabase, Dropbox, etc.)
- [ ] No tokens (bridge tokens, webhook secrets, HF tokens)
- [ ] No `.env` file committed (only `.env.example` with placeholders)
- [ ] `.gitignore` excludes `.env`, `*.key`, `*.pem`, `*.db`, `*.sqlite`

## Personal data

- [ ] No personal names
- [ ] No private project names or descriptions in config defaults
- [ ] No agent reports with real content
- [ ] No finance or personal finance entries
- [ ] No calendar, notes, cookbook, or task runtime data
- [ ] No workspace project paths pointing to private folders

## Config defaults

- [ ] `config/atlas/default_profile.json` is generic (no personal names or private context)
- [ ] `config/atlas/projects.json`, `finance.json`, `goals.json` are clean first-run defaults
- [ ] No references to removed personal profile files in docs (use `default_profile.json`)

## Desktop and paths

- [ ] `desktop_bridge/apps.json` has no personal Windows paths (use `%LOCALAPPDATA%`, `%USERPROFILE%`, or disabled entries)
- [ ] Desktop commands disabled by default (`DESKTOP_COMMANDS_ENABLED=false`)
- [ ] No `C:\Users\<username>\…` hardcoded paths except documented generic examples

## Runtime data

- [ ] `data/` directory not committed (runtime state stays local)
- [ ] `logs/` not committed
- [ ] No local databases, uploads, or backups in git

## Documentation

- [ ] `README.md` reviewed — Atlas OS Community branding, no Odysseus marketing copy (attribution only where required)
- [ ] `INSTALL.md` reviewed — accurate Windows steps, no secrets or personal paths
- [ ] `CONTRIBUTING.md`, `SECURITY.md`, and GitHub templates reviewed
- [ ] No personal screenshots or private project names in docs

## Repository hygiene

- [ ] GitHub repo visibility set to **public** intentionally
- [ ] `LICENSE` reviewed (preserve upstream Odysseus MIT license if forked)
- [ ] `ACKNOWLEDGMENTS.md` credits upstream projects

## Final scan (run from repo root)

```powershell
rg -i "Patryk|Aurelius|aureliusog|Houseify|TransportOS" .
rg "sk-[a-zA-Z0-9]{20,}" .
rg -i "C:\\Users\\" .
rg -i "Odysseus|odysseus|pewdiepie|archdaemon" --glob "*.md" --glob ".github/**"
```

Expected:

- **Zero hits** for personal names, private projects, API key patterns, and `C:\Users\` paths (except generic documented examples like `C:\AtlasWorkspace`)
- **Odysseus** only in attribution, license, or upstream credit context

## Validation

```powershell
Get-ChildItem config\atlas\*.json | ForEach-Object { python -m json.tool $_.FullName > $null }
python -m pytest tests -q
git status --short
```

Confirm `.env` and `data/` are not staged.
