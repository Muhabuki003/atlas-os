#!/usr/bin/env python3
"""
Atlas Calendar Sync — pulls Canvas iCal feed and injects events into Atlas DB.
Also creates a daily cron-style check for "what's due today".
"""

import sqlite3
import urllib.request
import uuid
import re
from datetime import datetime, timezone, timedelta

# Config
ATLAS_DB = "/root/atlas-os/data/app.db"
OWNER = "founder@bookistudios.com"
CALENDAR_URL = "https://canvas.uhd.edu/feeds/calendars/user_BOnEpFPmFBrVNopn4vaekw4bgLWWfJGGQBuE8i7Z.ics"

# Map Canvas course -> Atlas calendar name
COURSE_CALENDARS = {
    "Introduction to Computer Science": "UHD Classes",
    "Visual Basic": "UHD Classes",
}

def get_calendar_id(db, name):
    row = db.execute("SELECT id FROM calendars WHERE name = ? AND owner = ?", (name, OWNER)).fetchone()
    if row:
        return row[0]
    # Create it
    cal_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    db.execute(
        "INSERT INTO calendars (id, owner, name, color, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (cal_id, OWNER, name, "#e74c3c", "local", now, now)
    )
    return cal_id

def main():
    print("Fetching Canvas calendar...")
    req = urllib.request.Request(CALENDAR_URL)
    ical = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="replace")

    today = datetime.now(timezone.utc).date()
    upcoming = []

    for ev in ical.split("BEGIN:VEVENT"):
        summary_m = re.search(r"SUMMARY:([^\r\n]+)", ev)
        dtstart_m = re.search(r"DTSTART.*?:(\d{8})(?:T\d{6})?", ev)
        dtend_m = re.search(r"DTEND.*?:(\d{8})(?:T\d{6})?", ev)
        desc_m = re.search(r"DESCRIPTION:([^\r\n]+)", ev)

        if not summary_m or not dtstart_m:
            continue

        summary = summary_m.group(1).strip()
        start_raw = dtstart_m.group(1)

        # Parse date
        d = datetime(int(start_raw[:4]), int(start_raw[4:6]), int(start_raw[6:8]))

        due_date = d.date()
        diff = (due_date - today).days

        description = ""
        if desc_m:
            description = desc_m.group(1).replace("\\n", "\n").replace("\\,", ",").replace("\\;", ";")[:500]

        # Determine calendar
        cal_name = "UHD Classes"
        for kw, cal in COURSE_CALENDARS.items():
            if kw.lower() in summary.lower():
                cal_name = cal
                break

        upcoming.append({
            "summary": summary,
            "dtstart": d,
            "dtend": d + timedelta(days=1),  # all-day event
            "description": description,
            "days_away": diff,
            "calendar": cal_name,
            "all_day": True,
        })

    # Sort oldest first
    upcoming.sort(key=lambda x: x["dtstart"])

    print(f"Found {len(upcoming)} total assignments/quizzes")

    # Connect to Atlas DB and sync
    db = sqlite3.connect(ATLAS_DB)
    cal_ids = {}

    for event in upcoming:
        cal_name = event["calendar"]
        if cal_name not in cal_ids:
            cal_ids[cal_name] = get_calendar_id(db, cal_name)
        cal_id = cal_ids[cal_name]

        # Check if event already exists
        existing = db.execute(
            "SELECT uid FROM calendar_events WHERE summary = ? AND calendar_id = ? AND DATE(dtstart) = DATE(?)",
            (event["summary"][:200], cal_id, event["dtstart"].isoformat())
        ).fetchone()

        if existing:
            continue

        # Create event
        ev_id = str(uuid.uuid4())
        now_ts = datetime.utcnow().isoformat()
        description = event.get("description", "")

        db.execute(
            """INSERT INTO calendar_events 
               (uid, calendar_id, summary, description, dtstart, dtend, all_day, is_utc, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                ev_id, cal_id,
                event["summary"][:500],
                description[:2000] if description else "",
                event["dtstart"].isoformat(),
                event["dtend"].isoformat(),
                event["all_day"],
                0,
                "confirmed",
                now_ts, now_ts
            )
        )
        status = "OVERDUE" if event["days_away"] < 0 else f"{event['days_away']} days" if event["days_away"] > 0 else "TODAY"
        print(f"  Added: {event['summary'][:60]}... ({status})")

    db.commit()
    db.close()
    print(f"\nSync complete! {len(upcoming)} events in calendar.")

    # Print daily briefing
    print("\n=== TODAY'S HOMEWORK ===")
    today_events = [e for e in upcoming if e["days_away"] == 0]
    for e in today_events:
        print(f"  ⚠️ DUE TODAY: {e['summary'][:80]}")
    if not today_events:
        print("  Nothing due today")

    print("\n=== UPCOMING (7 days) ===")
    week_events = [e for e in upcoming if 0 < e["days_away"] <= 7]
    for e in week_events:
        print(f"  {e['days_away']}d: {e['summary'][:80]}")
    if not week_events:
        print("  Nothing in next 7 days")

    print("\n=== OVERDUE ===")
    overdue = [e for e in upcoming if e["days_away"] < 0]
    print(f"  {len(overdue)} overdue assignments")

if __name__ == "__main__":
    main()
