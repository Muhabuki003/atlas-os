"""Tests for Docker-mounted Atlas workspace."""

from pathlib import Path

import pytest

from src.atlas_mount_workspace import (
    bootstrap_workspace_folders,
    save_agent_report_markdown,
    validate_project_path,
)


@pytest.fixture
def atlas_mount(tmp_path, monkeypatch):
    mount = tmp_path / "workspace"
    mount.mkdir()
    monkeypatch.setenv("ATLAS_WORKSPACE_CONTAINER", str(mount))
    monkeypatch.setenv("ATLAS_WORKSPACE_HOST", r"C:\AtlasWorkspace")
    return mount


def test_bootstrap_creates_folders(atlas_mount):
    result = bootstrap_workspace_folders()
    assert result["ok"] is True
    assert (atlas_mount / "Projects").is_dir()
    assert (atlas_mount / "Agents" / "Developer" / "Reports").is_dir()


def test_validate_rejects_windows_path(atlas_mount):
    ws = {
        "workspace_mode": "docker_mount",
        "workspace_container_root": str(atlas_mount).replace("\\", "/"),
    }
    _, err = validate_project_path(r"C:\dev\houseify", ws)
    assert err is not None
    assert "Windows" in err


def test_save_agent_report_markdown(atlas_mount):
    bootstrap_workspace_folders()
    path = save_agent_report_markdown(
        "developer",
        "developer_project_review",
        "Developer Project Review: Houseify",
        "# Review\n\nTest content",
    )
    assert path is not None
    assert Path(path).is_file()
    assert "Cursor Prompts" in path.replace("\\", "/")
