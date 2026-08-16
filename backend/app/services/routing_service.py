"""Multistage Adaptive Testing routing.

The single place that decides which module 2 a student receives. Per
CLAUDE.md section 7 this must never move to a client: the decision is derived
from the student's module 1 answers, which the client is not trusted to report
honestly, and the variant itself is information the student should not hold
before the score report.

The rule is deliberately simple and documented as an approximation: the real
exam routes on an IRT ability estimate we cannot reproduce without College
Board item calibration data. We route on the module 1 raw-score ratio against
a configurable threshold. Every input is stored on the module attempt so a
decision stays explainable later.
"""

from collections import namedtuple

DEFAULT_ROUTING_THRESHOLD = 0.6

RoutingDecision = namedtuple(
    "RoutingDecision", ["variant", "raw_correct", "total", "ratio", "threshold"]
)


def decide_variant(raw_correct: int, total: int, threshold: float) -> RoutingDecision:
    """Meeting the threshold routes upward. A student who answers exactly the
    threshold share correctly gets the harder module - the boundary is
    inclusive, which is what the at-threshold test pins down."""
    if total <= 0:
        # An empty module cannot demonstrate ability; route down rather than
        # rewarding a degenerate form.
        ratio = 0.0
    else:
        ratio = raw_correct / total

    variant = "hard" if ratio >= threshold else "easy"
    return RoutingDecision(
        variant=variant,
        raw_correct=raw_correct,
        total=total,
        ratio=ratio,
        threshold=threshold,
    )
