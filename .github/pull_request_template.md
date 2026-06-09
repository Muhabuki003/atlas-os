## Summary

<!-- One paragraph: what changed and why. "Fixed bug" and "Added feature" are not summaries. -->

## Target branch

- [ ] This PR targets **`main`** (or **`dev`** if that branch exists). Check the base branch dropdown before submitting.

## Linked Issue

<!-- Every PR should be linked to an issue.
     Use one of:  Fixes #NNN  |  Part of #NNN  |  Closes #NNN  -->

Fixes #

## Type of Change

- [ ] Bug fix (non-breaking — fixes a confirmed issue)
- [ ] New feature (non-breaking — adds new behaviour)
- [ ] Breaking change (changes or removes existing behaviour)
- [ ] Refactor / cleanup (behaviour unchanged)
- [ ] Documentation only
- [ ] CI / tooling / configuration

## Checklist

- [ ] I searched [open issues](../../issues) and [open PRs](../../pulls) — this is not a duplicate.
- [ ] My changes are limited to the scope described above — no unrelated refactors or whitespace changes mixed in.
- [ ] I actually ran the app (`docker compose up` or `uvicorn app:app`) and verified the change works end-to-end. Type-checks and unit tests are not enough.

## How to Test

<!-- Step-by-step instructions a reviewer can follow to verify this works.
     Do not leave this empty — a PR without test steps will be sent back. -->

1.
2.
3.

## Visual / UI changes — REQUIRED if you touched anything that renders

**Anything that changes what the UI looks like — buttons, icons, padding, colors, fonts, spacing, layout, CSS, HTML, SVG, or any `static/js/` module that draws to the DOM — needs all of the following. PRs that change rendering without these WILL be closed.**

- [ ] **Screenshot or short clip** of the change in the running app, attached below. Mobile screenshot too if the change affects mobile.
- [ ] **Style match**: the change preserves Atlas OS Community visual language. Specifically:
  - **Blueprint UI** — structured panels and mission-control surfaces
  - **Glassmorphism** — reuse existing translucent card/overlay patterns
  - **Neon theme variables** — reuse CSS variables from `static/themes/atlas-themes.css`; do not introduce hard-coded palette values
  - **Voice-first workflow** — do not break Home voice navigation or global HUD
  - **Bottom dock / global HUD** — extend existing chrome; no parallel navigation patterns
  - Reuse existing button/input/card/border classes
  - **No Unicode emoji in UI or code** — use inline SVG or plain text
- [ ] **No new component patterns.** If a similar widget already exists, extend it.
- [ ] **LLM-generated PRs:** describe changes clearly; open an issue first for bulk agent submissions.

### Screenshots / clips

<!-- Drag and drop images or a screen recording here. Required for any UI/visual change. -->
