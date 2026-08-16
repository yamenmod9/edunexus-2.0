"""Routing decisions, tested as pure logic. The end-to-end consequences are
covered in test_attempt_flow.py; this pins the rule itself."""

import pytest

from app.services.routing_service import DEFAULT_ROUTING_THRESHOLD, decide_variant


def test_below_threshold_routes_to_the_easier_module():
    decision = decide_variant(raw_correct=5, total=10, threshold=0.6)
    assert decision.variant == "easy"
    assert decision.ratio == 0.5


def test_at_threshold_routes_upward():
    # The boundary is inclusive. Hard-coding it here means a future change to
    # the comparison operator cannot pass silently.
    decision = decide_variant(raw_correct=6, total=10, threshold=0.6)
    assert decision.variant == "hard"
    assert decision.ratio == pytest.approx(0.6)


def test_above_threshold_routes_upward():
    assert decide_variant(raw_correct=9, total=10, threshold=0.6).variant == "hard"


def test_all_wrong_routes_down_and_all_right_routes_up():
    assert decide_variant(0, 10, 0.6).variant == "easy"
    assert decide_variant(10, 10, 0.6).variant == "hard"


def test_threshold_of_zero_always_routes_up():
    assert decide_variant(0, 10, 0.0).variant == "hard"


def test_empty_module_routes_down_rather_than_dividing_by_zero():
    decision = decide_variant(raw_correct=0, total=0, threshold=0.6)
    assert decision.variant == "easy"
    assert decision.ratio == 0.0


def test_decision_carries_its_inputs():
    decision = decide_variant(raw_correct=7, total=10, threshold=0.65)
    assert (decision.raw_correct, decision.total, decision.threshold) == (7, 10, 0.65)


def test_default_threshold_is_documented_value():
    assert DEFAULT_ROUTING_THRESHOLD == 0.6
