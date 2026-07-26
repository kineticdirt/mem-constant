"""Tests for score_tick.py"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from score_tick import detect_outcome, outcome_matches, score_run, score_path


def test_intent_and_exit_bonus(tmp_path):
    run = {
        "pod": "fast",
        "exit_code": 0,
        "intent": "INTENT_OK",
        "log_path": "",
    }
    log = tmp_path / "tick.log"
    log.write_text("INTENT_OK pod=fast\nIDLE\n", encoding="utf-8")
    run["log_path"] = str(log)

    result = score_run(run, tasks=[])
    assert result["intent_score"] == 1
    assert result["exit_bonus"] == 1
    assert result["detected_outcome"] == "idle"
    assert result["total"] == 2


def test_intent_fail_zeroes_outcome(tmp_path):
    run = {"pod": "think", "exit_code": 0, "intent": "INTENT_FAIL", "log_path": ""}
    assert score_run(run, tasks=[])["intent_score"] == 0


def test_outcome_match_against_eval_task(tmp_path):
    run = {
        "pod": "fast",
        "eval_task_id": "fast-idle-tick",
        "exit_code": 0,
        "intent": "INTENT_OK",
        "log_path": "",
    }
    tasks = [
        {
            "id": "fast-idle-tick",
            "pod": "fast",
            "expected_outcome": "idle",
            "task_line_pattern": "\\bIDLE\\b",
        }
    ]
    result = score_run(run, tasks=tasks, log_text="Hermes reply: IDLE\n")
    assert result["matched_task_id"] == "fast-idle-tick"
    assert result["outcome_score"] == 1
    assert result["total"] == 3


def test_score_path_reads_run_json(tmp_path, monkeypatch):
    runs = tmp_path / "runs" / "fast"
    runs.mkdir(parents=True)
    run_file = runs / "20260707-010203.json"
    run_file.write_text(
        json.dumps(
            {
                "pod": "fast",
                "exit_code": 0,
                "intent": "INTENT_OK",
                "log_path": "",
            }
        ),
        encoding="utf-8",
    )

    result = score_path(run_file, tasks=[])
    assert result["intent_score"] == 1
    assert result["run_file"] == str(run_file)


def test_detect_outcome_advance():
    run = {"intent": "INTENT_OK"}
    assert detect_outcome(run, "marked done in agents/PONYTAIL_CLEANUP_BOARD.md") == "advance"


def test_outcome_matches_intent_ok_bucket():
    assert outcome_matches("intent_ok", "idle", 1) is True
    assert outcome_matches("idle", "advance", 1) is False
