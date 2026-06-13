"""Tests for Atlas CE managed workspace."""

from pathlib import Path

import pytest

from src import atlas_ce_workspace as ce


@pytest.fixture
def ws_root(tmp_path, monkeypatch):
    monkeypatch.setenv("ATLAS_WORKSPACE_PATH", str(tmp_path))
    return tmp_path


def test_bootstrap_creates_structure(ws_root):
    result = ce.ensure_workspace_bootstrap(ws_root)
    assert result["ok"] is True
    assert (ws_root / "Offices").is_dir()
    assert (ws_root / "Global" / "Inbox").is_dir()
    assert (ws_root / "System" / "settings.json").is_file()


def test_create_office_and_project(ws_root):
    ce.ensure_workspace_bootstrap(ws_root)
    office = ce.create_office("Test Office", root=ws_root)
    assert (ws_root / "Offices" / "Test Office" / "office.json").is_file()
    project = ce.create_project("Demo App", office["id"], root=ws_root)
    proj_dir = ws_root / "Offices" / "Test Office" / "Projects" / "Demo App"
    assert proj_dir.is_dir()
    assert (proj_dir / "project.json").is_file()
    assert (proj_dir / "Files").is_dir()


def test_discover_ce_projects(ws_root):
    ce.ensure_workspace_bootstrap(ws_root)
    office = ce.create_office("Acme", root=ws_root)
    ce.create_project("Portal", office["id"], root=ws_root)
    found = ce.discover_ce_projects()
    assert any(p["name"] == "Portal" for p in found)
