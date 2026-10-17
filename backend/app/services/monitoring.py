"""
Lightweight event log for platform monitoring — independent of MLflow so
upload/validation failures (which never reach MLflow) are still counted.
Tracks: upload count, failure count, average quality score, average repair
time, and overall average processing time. Backed by a local SQLite file.
"""
import sqlite3
import time
from contextlib import contextmanager

from app.config import BASE_DIR

DB_PATH = str(BASE_DIR / "monitoring.db")


def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db():
    conn = _connect()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type        TEXT NOT NULL,   -- upload | profile | repair
            filename          TEXT,
            status            TEXT NOT NULL,   -- success | failed
            duration_seconds  REAL,
            quality_score     REAL,
            error             TEXT,
            created_at        REAL NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


_init_db()


@contextmanager
def timed_event(event_type: str, filename: str):
    """
    Usage:
        with timed_event("repair", filename) as ev:
            ... do work ...
            ev["quality_score"] = 97.5   # optional
    Logs a 'success' row on normal exit, a 'failed' row (with the error
    message) if the block raises, then re-raises — callers keep their
    existing exception handling untouched.
    """
    start = time.time()
    ev = {"quality_score": None}
    try:
        yield ev
        log_event(
            event_type=event_type,
            filename=filename,
            status="success",
            duration_seconds=round(time.time() - start, 4),
            quality_score=ev.get("quality_score"),
        )
    except Exception as exc:
        log_event(
            event_type=event_type,
            filename=filename,
            status="failed",
            duration_seconds=round(time.time() - start, 4),
            error=str(exc)[:500],
        )
        raise


def log_event(event_type, filename, status, duration_seconds=None, quality_score=None, error=None):
    conn = _connect()
    conn.execute(
        """
        INSERT INTO events (event_type, filename, status, duration_seconds, quality_score, error, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (event_type, filename, status, duration_seconds, quality_score, error, time.time()),
    )
    conn.commit()
    conn.close()


def get_stats(recent_limit: int = 20) -> dict:
    conn = _connect()

    def scalar(query, params=()):
        row = conn.execute(query, params).fetchone()
        return row[0] if row else None

    upload_count  = scalar("SELECT COUNT(*) FROM events WHERE event_type='upload' AND status='success'")
    failure_count = scalar("SELECT COUNT(*) FROM events WHERE status='failed'")
    avg_quality   = scalar(
        "SELECT AVG(quality_score) FROM events "
        "WHERE event_type='repair' AND status='success' AND quality_score IS NOT NULL"
    )
    avg_repair_time = scalar(
        "SELECT AVG(duration_seconds) FROM events WHERE event_type='repair' AND status='success'"
    )
    avg_processing_time = scalar(
        "SELECT AVG(duration_seconds) FROM events WHERE status='success'"
    )
    total_events = scalar("SELECT COUNT(*) FROM events")

    recent = conn.execute(
        "SELECT event_type, filename, status, duration_seconds, quality_score, error, created_at "
        "FROM events ORDER BY created_at DESC LIMIT ?",
        (recent_limit,),
    ).fetchall()
    conn.close()

    return {
        "upload_count":                   upload_count or 0,
        "failure_count":                  failure_count or 0,
        "average_quality_score":          round(avg_quality, 2) if avg_quality is not None else None,
        "average_repair_time_seconds":    round(avg_repair_time, 3) if avg_repair_time is not None else None,
        "average_processing_time_seconds": round(avg_processing_time, 3) if avg_processing_time is not None else None,
        "total_events":                   total_events or 0,
        "recent_events":                  [dict(r) for r in recent],
    }
