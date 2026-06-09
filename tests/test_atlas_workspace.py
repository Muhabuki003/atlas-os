"""Tests for Atlas workspace discovery."""

from pathlib import Path

import pytest

from src import atlas_config
from src.atlas_mount_workspace import is_legacy_windows_path, to_display_path
from src.atlas_workspace import detect_stack, discover_child_projects, merge_discovered, save_workspace, scan_workspace


@pytest.fixture
def atlas_data_dir(tmp_path, monkeypatch):
    data_dir = tmp_path / "data" / "atlas"
    data_dir.mkdir(parents=True)
    monkeypatch.setattr(atlas_config, "_DATA_DIR", data_dir)
    return data_dir


@pytest.fixture
def atlas_mount(tmp_path, monkeypatch):
    mount = tmp_path / "workspace"
    (mount / "Projects").mkdir(parents=True)
    monkeypatch.setenv("ATLAS_WORKSPACE_CONTAINER", str(mount))
    monkeypatch.setenv("ATLAS_WORKSPACE_HOST", r"C:\AtlasWorkspace")
    return mount


def test_detect_stack_node_project(tmp_path):
    proj = tmp_path / "myapp"
    proj.mkdir()
    (proj / "package.json").write_text('{"dependencies":{"react":"18"}}', encoding="utf-8")
    (proj / "README.md").write_text("# App", encoding="utf-8")
    ptype, stack = detect_stack(proj)
    assert "Node" in ptype or "React" in stack


def test_discover_immediate_children_only(tmp_path):
    ws = tmp_path / "workspace"
    ws.mkdir()
    (ws / "sampleapp").mkdir()
    (ws / "demoapp").mkdir()
    (ws / "notes.txt").write_text("x", encoding="utf-8")
    (ws / "sampleapp" / "nested").mkdir()

    found = discover_child_projects(ws)
    names = {p["name"] for p in found}
    assert names == {"sampleapp", "demoapp"}


def test_merge_preserves_manual_description():
    existing = {
        "id": "sampleapp",
        "name": "SampleApp",
        "description": "Custom manual description",
        "priority": "high",
        "source": "manual",
    }
    candidate = {
        "id": "sampleapp",
        "name": "SampleApp",
        "description": "Discovered project at SampleApp",
        "priority": "medium",
        "source": "workspace_scan",
        "path": "/workspace/Projects/sampleapp",
    }
    merged = merge_discovered(existing, candidate)
    assert merged["description"] == "Custom manual description"
    assert merged["priority"] == "high"
    assert merged["path"] == "/workspace/Projects/sampleapp"


def test_legacy_windows_path_detected():
    assert is_legacy_windows_path(r"C:\dev\sampleapp")
    assert not is_legacy_windows_path("/workspace/Projects/sampleapp")


def test_display_path_maps_container_to_host(atlas_mount):
    container = str(atlas_mount / "Projects" / "sampleapp").replace("\\", "/")
    ws = {"workspace_container_root": str(atlas_mount).replace("\\", "/"), "workspace_host_root_hint": r"C:\AtlasWorkspace"}
    display = to_display_path(container, ws)
    assert "AtlasWorkspace" in display
    assert "sampleapp" in display


def test_scan_workspace_updates_projects(atlas_data_dir, atlas_mount):
    house = atlas_mount / "Projects" / "sampleapp"
    house.mkdir()
    (house / "package.json").write_text("{}", encoding="utf-8")

    save_workspace(atlas_data_dir, {"auto_discover": True})

    result = scan_workspace(atlas_data_dir)
    assert result["ok"] is True
    assert "sampleapp" in result["discovered"]
    assert result["discovered_count"] == 1
    projects = atlas_config.load_projects()
    sample = next(p for p in projects if p.get("id") == "sampleapp")
    assert sample["path_status"] == "valid"
    assert "sampleapp" in sample["path"]


def test_scan_auto_index_on_scan(atlas_data_dir, atlas_mount):
    house = atlas_mount / "Projects" / "sampleapp"
    house.mkdir()
    (house / "package.json").write_text("{}", encoding="utf-8")
    (house / "README.md").write_text("# SampleApp", encoding="utf-8")

    save_workspace(
        atlas_data_dir,
        {"auto_discover": True, "auto_index_on_scan": True},
    )

    result = scan_workspace(atlas_data_dir)
    assert result["ok"] is True
    assert result["discovered_count"] == 1
    assert result["indexed_count"] == 1
    projects = atlas_config.load_projects()
    sample = next(p for p in projects if p.get("id") == "sampleapp")
    assert sample.get("indexed") is True
    assert sample.get("file_count", 0) >= 1
