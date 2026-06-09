"""Tests for Atlas desktop bridge client."""

import asyncio

from src.atlas_desktop import (
    container_to_host_path,
    desktop_status,
    is_allowed_host_path,
    load_desktop_permissions,
    queue_desktop_command,
)


def test_desktop_command_disabled_by_default():
    from src.atlas_desktop import _DEFAULTS, load_desktop_permissions

    perms = {**_DEFAULTS, "desktop_commands_enabled": False}
    import src.atlas_desktop as mod
    original = mod.load_desktop_permissions
    mod.load_desktop_permissions = lambda: perms
    try:
        result = asyncio.run(queue_desktop_command("open_app", {"app": "cursor"}))
    finally:
        mod.load_desktop_permissions = original
    assert result["ok"] is False
    assert result.get("executed") is False
    assert "disabled" in result["message"].lower()


def test_desktop_status_shape():
    status = asyncio.run(desktop_status())
    assert status["ok"] is True
    assert "enabled" in status
    assert "bridge_ready" in status
    assert "bridge_url" in status
    assert "message" in status


def test_container_to_host_path_translation():
    host, err = container_to_host_path("/workspace/Projects/Houseify")
    assert err is None
    assert host
    assert "AtlasWorkspace" in host
    assert "Projects" in host
    assert "Houseify" in host


def test_rejects_path_outside_workspace():
    host, err = container_to_host_path("C:/Other/secret")
    assert host is None
    assert err


def test_allowed_host_path_check():
    perms = load_desktop_permissions()
    assert is_allowed_host_path(r"C:\AtlasWorkspace\Projects\X", perms) is True
    assert is_allowed_host_path(r"D:\Other", perms) is False
