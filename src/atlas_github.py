"""GitHub code access for Atlas.

Lets Atlas read code from connected repositories (Loveflix, Bookistudios, …)
and propose changes as pull requests — without giving it raw push access to
your default branch. Everything goes through the GitHub REST API with a token
from the ``GITHUB_TOKEN`` (or ``ATLAS_GITHUB_TOKEN``) environment variable.

Design notes:
- Read paths (list/get) need only a token with ``repo`` (or ``public_repo``)
  scope. Write paths create a branch + commit + PR so changes are reviewable.
- All calls are async (httpx) and never raise to the caller — they return
  ``{"ok": False, "error": ...}`` so route handlers stay simple.
"""

from __future__ import annotations

import base64
import logging
import os
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

API = "https://api.github.com"


def _token() -> Optional[str]:
    return os.environ.get("ATLAS_GITHUB_TOKEN") or os.environ.get("GITHUB_TOKEN")


def is_configured() -> bool:
    return bool(_token())


def _headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {_token()}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "atlas-os",
    }


async def _request(method: str, path: str, **kwargs: Any) -> Dict[str, Any]:
    if not _token():
        return {"ok": False, "error": "GitHub not connected. Set GITHUB_TOKEN."}
    url = path if path.startswith("http") else f"{API}{path}"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.request(method, url, headers=_headers(), **kwargs)
        if resp.status_code >= 400:
            detail = ""
            try:
                detail = resp.json().get("message", "")
            except Exception:
                detail = resp.text[:200]
            return {"ok": False, "status": resp.status_code, "error": detail or "GitHub error"}
        return {"ok": True, "data": resp.json() if resp.content else {}}
    except Exception as exc:
        logger.warning("[atlas-github] %s %s failed: %s", method, path, exc)
        return {"ok": False, "error": str(exc)}


async def list_repos(limit: int = 50) -> Dict[str, Any]:
    """Repos the token can see, most recently pushed first."""
    res = await _request("GET", f"/user/repos?per_page={min(limit, 100)}&sort=pushed")
    if not res.get("ok"):
        return res
    repos = [
        {
            "full_name": r.get("full_name"),
            "default_branch": r.get("default_branch"),
            "private": r.get("private"),
            "description": r.get("description"),
        }
        for r in res["data"]
    ]
    return {"ok": True, "repos": repos}


async def list_dir(repo: str, path: str = "") -> Dict[str, Any]:
    """List files/dirs at a path in a repo (e.g. repo='owner/loveflix')."""
    res = await _request("GET", f"/repos/{repo}/contents/{path.lstrip('/')}")
    if not res.get("ok"):
        return res
    data = res["data"]
    items = data if isinstance(data, list) else [data]
    return {
        "ok": True,
        "items": [
            {"name": i.get("name"), "path": i.get("path"), "type": i.get("type"), "size": i.get("size")}
            for i in items
        ],
    }


async def get_file(repo: str, path: str, ref: Optional[str] = None) -> Dict[str, Any]:
    """Read a file's text content and its blob sha (needed to update it)."""
    q = f"?ref={ref}" if ref else ""
    res = await _request("GET", f"/repos/{repo}/contents/{path.lstrip('/')}{q}")
    if not res.get("ok"):
        return res
    data = res["data"]
    if data.get("type") != "file":
        return {"ok": False, "error": "Not a file"}
    try:
        content = base64.b64decode(data.get("content", "")).decode("utf-8", "replace")
    except Exception:
        content = ""
    return {"ok": True, "path": data.get("path"), "sha": data.get("sha"), "content": content}


async def _default_branch(repo: str) -> Optional[str]:
    res = await _request("GET", f"/repos/{repo}")
    return res["data"].get("default_branch") if res.get("ok") else None


async def propose_change(
    repo: str,
    path: str,
    new_content: str,
    *,
    title: str,
    body: str = "",
    branch: Optional[str] = None,
    base: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a branch, commit ``new_content`` to ``path``, and open a PR.

    Reviewable by design — Atlas proposes, you merge. Returns the PR url.
    """
    base = base or await _default_branch(repo)
    if not base:
        return {"ok": False, "error": "Could not resolve base branch."}

    # Base branch head sha.
    ref = await _request("GET", f"/repos/{repo}/git/ref/heads/{base}")
    if not ref.get("ok"):
        return ref
    base_sha = ref["data"]["object"]["sha"]

    branch = branch or f"atlas/{path.replace('/', '-')[:40]}-{base_sha[:7]}"

    # Create the working branch (ignore 'already exists').
    created = await _request(
        "POST", f"/repos/{repo}/git/refs",
        json={"ref": f"refs/heads/{branch}", "sha": base_sha},
    )
    if not created.get("ok") and created.get("status") != 422:
        return created

    # Existing file sha on the branch, if any (required for updates).
    existing = await get_file(repo, path, ref=branch)
    payload: Dict[str, Any] = {
        "message": title,
        "content": base64.b64encode(new_content.encode("utf-8")).decode("ascii"),
        "branch": branch,
    }
    if existing.get("ok") and existing.get("sha"):
        payload["sha"] = existing["sha"]

    commit = await _request("PUT", f"/repos/{repo}/contents/{path.lstrip('/')}", json=payload)
    if not commit.get("ok"):
        return commit

    pr = await _request(
        "POST", f"/repos/{repo}/pulls",
        json={"title": title, "body": body or "Proposed by Atlas.", "head": branch, "base": base},
    )
    if not pr.get("ok"):
        return pr
    return {
        "ok": True,
        "pr_url": pr["data"].get("html_url"),
        "pr_number": pr["data"].get("number"),
        "branch": branch,
    }
