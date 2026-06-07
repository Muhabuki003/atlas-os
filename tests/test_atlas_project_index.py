"""Tests for read-only Atlas project indexing."""

from pathlib import Path

import pytest

from src import atlas_config
from src.atlas_project_index import (
    diff_indexes,
    index_all_projects,
    index_project,
    index_projects_batch,
    scan_directory,
)


@pytest.fixture
def atlas_data_dir(tmp_path, monkeypatch):
    data_dir = tmp_path / "data" / "atlas"
    data_dir.mkdir(parents=True)
    monkeypatch.setattr(atlas_config, "_DATA_DIR", data_dir)
    mount = tmp_path / "workspace"
    (mount / "Projects").mkdir(parents=True)
    monkeypatch.setenv("ATLAS_WORKSPACE_CONTAINER", str(mount))
    return data_dir


def test_scan_directory_skips_env_and_node_modules(tmp_path):
    root = tmp_path / "proj"
    (root / "src").mkdir(parents=True)
    (root / "src" / "main.py").write_text("print('hi')", encoding="utf-8")
    (root / ".env").write_text("SECRET=1", encoding="utf-8")
    (root / "node_modules" / "pkg").mkdir(parents=True)
    (root / "node_modules" / "pkg" / "index.js").write_text("x", encoding="utf-8")

    result = scan_directory(root, tmp_path / "data" / "atlas")
    paths = {f["path"] for f in result["files"]}
    assert "src/main.py" in paths
    assert ".env" not in paths
    assert not any("node_modules" in p for p in paths)


def test_diff_indexes_detects_changes():
    prev = {"files": [{"path": "a.py", "modified_at": "t1"}]}
    curr = {
        "files": [
            {"path": "a.py", "modified_at": "t2"},
            {"path": "b.py", "modified_at": "t1"},
        ]
    }
    diff = diff_indexes(prev, curr)
    assert diff["modified_count"] == 1
    assert diff["new_count"] == 1


def test_index_project_read_only(atlas_data_dir, tmp_path):
    mount = tmp_path / "workspace"
    root = mount / "Projects" / "houseify"
    root.mkdir(parents=True)
    (root / "app.py").write_text("# app", encoding="utf-8")

    project = {
        "id": "houseify",
        "name": "Houseify",
        "path": str(root).replace("\\", "/"),
        "agents_allowed": True,
    }
    result = index_project(atlas_data_dir, project)
    assert result["ok"] is True
    assert result["project"]["file_count"] == 1
    assert result["index"]["files"][0]["path"] == "app.py"


def test_index_all_skips_invalid_paths(atlas_data_dir, tmp_path):
    mount = tmp_path / "workspace"
    good = mount / "Projects" / "good"
    good.mkdir(parents=True)
    (good / "main.py").write_text("x", encoding="utf-8")

    projects = [
        {"id": "good", "name": "Good", "path": str(good).replace("\\", "/"), "agents_allowed": True},
        {"id": "bad", "name": "Bad", "path": "", "agents_allowed": True},
        {"id": "win", "name": "Win", "path": r"C:\dev\old", "agents_allowed": True},
        {"id": "missing", "name": "Missing", "path": f"{str(mount).replace(chr(92), '/')}/Projects/nope", "agents_allowed": True},
    ]
    atlas_config.save_projects(projects)

    result = index_all_projects(atlas_data_dir)
    assert result["ok"] is True
    assert result["indexed_count"] == 1
    assert result["skipped_count"] == 3
    assert len(result["errors"]) == 3
