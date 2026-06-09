"""Atlas personality addressing and phrasing."""

from src.atlas_personality import (
    get_address,
    get_completion,
    get_confirmation,
    get_greeting,
    get_standby,
)
from src.atlas_user_settings import patch_user_settings, save_user_settings


def test_get_address_boss(tmp_path, monkeypatch):
    monkeypatch.setattr("src.atlas_user_settings._path", lambda: tmp_path / "user_settings.json")
    save_user_settings({"preferred_address": "boss"})
    assert get_address() == "boss"


def test_get_confirmation_appends_address(tmp_path, monkeypatch):
    monkeypatch.setattr("src.atlas_user_settings._path", lambda: tmp_path / "user_settings.json")
    save_user_settings({"assistant_identity": "Atlas", "preferred_address": "sir"})
    assert get_confirmation("Opening Cursor") == "Opening Cursor, sir."


def test_get_confirmation_maam(tmp_path, monkeypatch):
    monkeypatch.setattr("src.atlas_user_settings._path", lambda: tmp_path / "user_settings.json")
    patch_user_settings({"preferred_address": "ma'am"})
    assert get_completion().endswith("ma'am.")


def test_atlasia_greeting_no_sir(tmp_path, monkeypatch):
    monkeypatch.setattr("src.atlas_user_settings._path", lambda: tmp_path / "user_settings.json")
    patch_user_settings({"assistant_identity": "Atlasia"})
    greeting = get_greeting()
    assert "sir" not in greeting.lower()
    assert get_standby() in ("Standing by.", "I'll be here.", "On standby.")
