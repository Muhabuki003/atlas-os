"""Tests for desktop bridge app registry and resolution."""

import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "desktop_bridge"))

from app_registry import (
    build_alias_index,
    load_registry,
    resolve_alias,
    resolve_app,
    resolve_all_apps,
)


def test_registry_loads_apps():
    apps = load_registry(force_reload=True)
    ids = {a.get("id") for a in apps}
    assert "cursor" in ids
    assert "brave" in ids
    assert "rocketleague" in ids


def test_cursor_friendly_error_when_missing(tmp_path, monkeypatch):
    fake_registry = tmp_path / "apps.json"
    fake_registry.write_text(json.dumps({
        "apps": [{
            "id": "cursor",
            "display_name": "Cursor",
            "aliases": ["cursor"],
            "type": "folder_exe",
            "path": str(tmp_path / "missing"),
            "exe": "Cursor.exe",
            "enabled": True,
        }]
    }), encoding="utf-8")
    monkeypatch.setattr("app_registry._REGISTRY_PATH", fake_registry)
    monkeypatch.setattr("app_registry._registry_cache", None)
    monkeypatch.setattr("app_registry._alias_index_cache", None)
    monkeypatch.setenv("ATLAS_CURSOR_PATH", "")
    monkeypatch.setattr("app_registry.shutil.which", lambda *_a, **_k: None)
    result = resolve_app("cursor")
    assert result["ok"] is False
    assert "ATLAS_CURSOR_PATH" in result["message"]
    assert result.get("attempted_paths")


def test_cursor_uses_env_path(tmp_path, monkeypatch):
    fake = tmp_path / "Cursor.exe"
    fake.write_text("")
    fake_registry = tmp_path / "apps.json"
    fake_registry.write_text(json.dumps({
        "apps": [{
            "id": "cursor",
            "display_name": "Cursor",
            "aliases": ["cursor"],
            "type": "folder_exe",
            "path": str(tmp_path / "missing"),
            "exe": "Cursor.exe",
            "env_path_key": "ATLAS_CURSOR_PATH",
            "enabled": True,
        }]
    }), encoding="utf-8")
    monkeypatch.setattr("app_registry._REGISTRY_PATH", fake_registry)
    monkeypatch.setattr("app_registry._registry_cache", None)
    monkeypatch.setattr("app_registry._alias_index_cache", None)
    env = {"ATLAS_CURSOR_PATH": str(fake)}
    with patch.dict(os.environ, env, clear=False):
        result = resolve_app("cursor")
    assert result["ok"] is True
    assert result["path"] == str(fake.resolve())


def test_folder_exe_joins_path_and_exe(tmp_path, monkeypatch):
    folder = tmp_path / "MyApp"
    folder.mkdir()
    exe = folder / "app.exe"
    exe.write_text("")
    fake_registry = tmp_path / "apps.json"
    fake_registry.write_text(json.dumps({
        "apps": [{
            "id": "testapp",
            "display_name": "Test",
            "aliases": ["testapp"],
            "type": "folder_exe",
            "path": str(folder),
            "exe": "app.exe",
            "enabled": True,
        }]
    }), encoding="utf-8")
    monkeypatch.setattr("app_registry._REGISTRY_PATH", fake_registry)
    monkeypatch.setattr("app_registry._registry_cache", None)
    monkeypatch.setattr("app_registry._alias_index_cache", None)
    result = resolve_app("testapp")
    assert result["ok"] is True
    assert result["path"] == str(exe.resolve())


def test_resolve_all_apps_shape():
    result = resolve_all_apps()
    assert result["ok"] is True
    assert "cursor" in result["apps"]
    assert "app_count" in result
    assert "available_apps" in result
    assert "missing_apps" in result


def test_alias_resolution():
    index = build_alias_index()
    assert index.get("rocket league") == "rocketleague"
    assert resolve_alias("play fortnite") == "fortnite"
    assert resolve_alias("fortnite") == "fortnite"


def test_unsupported_app():
    result = resolve_app("notepad")
    assert result["ok"] is False
