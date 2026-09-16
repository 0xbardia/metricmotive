"""Standalone verdict mapping tests. Mirror of the Intelligent Contract function.

These tests do not require GenVM. They lock the deterministic mapping that
the contract applies after consensus findings are agreed.
"""

from __future__ import annotations

import itertools
import unittest


def map_verdict(
    evidence_sufficient: bool,
    metric_satisfied: bool,
    material_violation: bool,
    circumvention_detected: bool,
    goal_advanced: bool,
) -> str:
    if not evidence_sufficient:
        return "INSUFFICIENT_EVIDENCE"
    if metric_satisfied and (
        material_violation or circumvention_detected or (not goal_advanced)
    ):
        return "METRIC_GAMING"
    if (
        goal_advanced
        and metric_satisfied
        and (not material_violation)
        and (not circumvention_detected)
    ):
        return "FAITHFUL_SUCCESS"
    return "PARTIAL_ALIGNMENT"


class VerdictMappingTests(unittest.TestCase):
    def test_insufficient_dominates(self) -> None:
        self.assertEqual(
            map_verdict(False, True, True, True, True),
            "INSUFFICIENT_EVIDENCE",
        )

    def test_faithful(self) -> None:
        self.assertEqual(
            map_verdict(True, True, False, False, True),
            "FAITHFUL_SUCCESS",
        )

    def test_gaming_no_goal(self) -> None:
        self.assertEqual(
            map_verdict(True, True, False, False, False),
            "METRIC_GAMING",
        )

    def test_gaming_violation(self) -> None:
        self.assertEqual(
            map_verdict(True, True, True, False, True),
            "METRIC_GAMING",
        )

    def test_gaming_circumvention(self) -> None:
        self.assertEqual(
            map_verdict(True, True, False, True, True),
            "METRIC_GAMING",
        )

    def test_partial_missed_metric(self) -> None:
        self.assertEqual(
            map_verdict(True, False, False, False, True),
            "PARTIAL_ALIGNMENT",
        )

    def test_exhaustive_32(self) -> None:
        rows = 0
        for combo in itertools.product([False, True], repeat=5):
            rows += 1
            verdict = map_verdict(*combo)
            self.assertIn(
                verdict,
                {
                    "INSUFFICIENT_EVIDENCE",
                    "METRIC_GAMING",
                    "FAITHFUL_SUCCESS",
                    "PARTIAL_ALIGNMENT",
                },
            )
            if not combo[0]:
                self.assertEqual(verdict, "INSUFFICIENT_EVIDENCE")
            elif combo[1] and (combo[2] or combo[3] or not combo[4]):
                self.assertEqual(verdict, "METRIC_GAMING")
            elif combo[4] and combo[1] and not combo[2] and not combo[3]:
                self.assertEqual(verdict, "FAITHFUL_SUCCESS")
            else:
                self.assertEqual(verdict, "PARTIAL_ALIGNMENT")
        self.assertEqual(rows, 32)


if __name__ == "__main__":
    unittest.main()
