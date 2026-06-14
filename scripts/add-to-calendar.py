#!/usr/bin/env python3
"""
Atlas Calendar Adder — Natural language → event, via Atlas API.
Call this when Atlas detects a calendar-worthy event in conversation.

Usage:
  python3 add-to-calendar.py --summary "Trip to Seattle" --date "Jul 11-14" --calendar "Travel & Trips"
  python3 add-to-calendar.py --summary "Quiz 4" --date "Jun 17" --calendar "UHD Classes" --description "Webcam required, Respondus LockDown"
"""

import sqlite3
import uuid
import argparse
import sys
from datetime import datetime, timedelta

ATLAS_DB = "/root/atlas-os/data/app.db"
OWNER = "founder@bookistudios.com"

def get_calendar_id(db, name):
    row = db.execute("SELECT id FROM calendars WHERE name = ? AND owner = ?", (name, OWNER)).fetchone()
    if row:
        return row[0]
    cal_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    db.execute(
        "INSERT INTO calendars (id, owner, name, color, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (cal_id, OWNER, name, "#3498db", "local", now, now)
    )
    return cal_id

def main():
    parser = argparse.ArgumentParser(description="Add event to Atlas calendar")
    parser.add_argument("--summary", required=True, help="Event title")
    parser.add_argument("--date", required=True, help="Date (YYYY-MM-DD) or range like 'Jul 11-14'")
    parser.add_argument("--end-date", help="End date if multi-day")
    parser.add_argument("--calendar", default="Personal", help="Calendar name")
    parser.add_argument("--description", default="", help="Event description")
    parser.add_argument("--all-day", action="store_true", default=True)
    args = parser.parse_args()

    # Parse date - handle multiple formats
    dtstart = None
    dtend = None

    if args.end_date:
        try:
            dtstart = datetime.strptime(args.date, "%Y-%m-%d")
            dtend = datetime.strptime(args.end_date, "%Y-%m-%d") + timedelta(days=1)
        except:
            pass

    if not dtstart:
        try:
            dtstart = datetime.strptime(args.date, "%Y-%m-%d")
            dtend = dtstart + timedelta(days=1)
        except:
            pass

    if not dtstart:
        # Try relative / natural format
        today = datetime.now()
        if args.date.lower() in ("today", "tonight"):
            dtstart = today
            dtend = today + timedelta(hours=2)
        elif args.date.lower() == "tomorrow":
            dtstart = today + timedelta(days=1)
            dtend = dtstart + timedelta(hours=2)
        else:
            print(f"Couldn't parse date: {args.date}")
            sys.exit(1)

    if not dtend:
        dtend = dtstart + timedelta(hours=1)

    db = sqlite3.connect(ATLAS_DB)
    cal_id = get_calendar_id(db, args.calendar)
    ev_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    db.execute(
        """INSERT INTO calendar_events 
           (uid, calendar_id, summary, description, dtstart, dtend, all_day, is_utc, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (ev_id, cal_id, args.summary, args.description or "", dtstart.isoformat(), dtend.isoformat(), args.all_day, 0, "confirmed", now, now)
    )
    db.commit()
    db.close()

    print(f"✅ Added '{args.summary}' to {args.calendar} calendar ({dtstart.strftime('%b %d')})")
    print(f"   Calendar ID: {cal_id}")
    print(f"   Event UID: {ev_id}")

if __name__ == "__main__":
    main()
