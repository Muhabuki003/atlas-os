"""Tests for desktop command intent parsing."""



from src.atlas_desktop_intent import classify_confirmation_reply, parse_desktop_intent





def test_parse_open_cursor():

    r = parse_desktop_intent("open cursor")

    assert r["matched"] is True

    assert r["command"] == "open_app"

    assert r["args"]["app"] == "cursor"





def test_parse_please_activate_cursor():

    for phrase in ("please open cursor", "activate cursor", "can you open cursor", "hey atlas open cursor"):

        r = parse_desktop_intent(phrase)

        assert r["matched"] is True, phrase

        assert r["args"]["app"] == "cursor", phrase





def test_parse_open_brave_browser():

    assert parse_desktop_intent("open brave")["args"]["app"] == "brave"

    assert parse_desktop_intent("please open brave")["args"]["app"] == "brave"

    assert parse_desktop_intent("open browser")["args"]["app"] == "brave"





def test_parse_browser_on_google():

    r = parse_desktop_intent("open browser on google")

    assert r["matched"] is True

    assert r["command"] == "open_url"

    assert "google.com" in r["args"]["url"]





def test_parse_powershell_cmd_rocketleague():

    assert parse_desktop_intent("open powershell")["args"]["app"] == "powershell"

    assert parse_desktop_intent("open cmd")["args"]["app"] == "cmd"

    assert parse_desktop_intent("launch rocket league")["args"]["app"] == "rocketleague"

    assert parse_desktop_intent("play fortnite")["args"]["app"] == "fortnite"





def test_parse_youtube_search():

    r = parse_desktop_intent("find video about Atlas OS")

    assert r["matched"] is True

    assert r["command"] == "open_url"

    assert "search_query" in r["args"]["url"]

    assert "atlas" in r["args"]["url"].lower()





def test_parse_open_youtube():

    r = parse_desktop_intent("open youtube")

    assert r["matched"] is True

    assert r["command"] == "open_url"

    assert "youtube.com" in r["args"]["url"]





def test_parse_play_music():

    r = parse_desktop_intent("play music")

    assert r["matched"] is True

    assert r["command"] == "open_app"

    assert r["args"]["app"] == "spotify"





def test_parse_known_sites():

    r = parse_desktop_intent("open chatgpt")

    assert r["matched"] is True

    assert "chatgpt.com" in r["args"]["url"]





def test_parse_project_in_cursor_when_project_exists():

    from src.atlas_config import load_projects

    projects = load_projects()

    if not projects:

        return

    name = projects[0].get("name") or projects[0].get("id")

    if not name:

        return

    r = parse_desktop_intent(f"open {name} in cursor")

    assert r["matched"] is True

    assert r["command"] == "open_project_in_cursor"

    assert r["args"]["project_id"] == projects[0]["id"]





def test_confirmation_classifier():

    assert classify_confirmation_reply("yes") == "confirm"

    assert classify_confirmation_reply("cancel") == "cancel"

    assert classify_confirmation_reply("open cursor") == "other"

