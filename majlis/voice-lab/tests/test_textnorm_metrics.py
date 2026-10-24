import math

import pytest

from majlis_voice_lab.metrics import (
    Counts,
    bootstrap_ci,
    corpus_wer,
    mean_ci,
    percentile,
    utterance_counts,
)
from majlis_voice_lab.textnorm import normalize_for_scoring


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("أَهْلاً وسَهْلاً", "اهلا وسهلا"),
        ("إيش السالفة؟", "ايش السالفه"),
        ("مستشفى", "مستشفي"),
        ("الـ Delivery كان late!", "ال delivery كان late"),
        ("دفعت ٢٥ ريال", "دفعت 25 ريال"),
        ("  كذا   يعني  ", "كذا يعني"),
    ],
)
def test_normalize_for_scoring(raw: str, expected: str) -> None:
    assert normalize_for_scoring(raw) == expected


def test_orthographic_variants_are_not_errors() -> None:
    assert utterance_counts("الأكل لذيذة", "الاكل لذيذه").word_errors == 0


def test_word_errors_and_empty_hypothesis() -> None:
    c = utterance_counts("وش رايك بالطلب", "وش رايك")
    assert (c.word_errors, c.ref_words) == (1, 3)
    empty = utterance_counts("وش رايك", "")
    assert (empty.word_errors, empty.ref_words) == (2, 2)


def test_corpus_wer_is_weighted_by_words_not_averaged() -> None:
    counts = [Counts(1, 1, 0, 1), Counts(0, 9, 0, 9)]
    assert corpus_wer(counts) == pytest.approx(0.1)  # not mean(1.0, 0.0) = 0.5


def test_bootstrap_ci_brackets_point_estimate() -> None:
    counts = [Counts(i % 3, 10, 0, 40) for i in range(60)]
    lo, hi = bootstrap_ci(counts)
    assert lo <= corpus_wer(counts) <= hi


def test_percentile_matches_linear_definition() -> None:
    values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
    assert percentile(values, 50) == pytest.approx(550)
    assert percentile(values, 90) == pytest.approx(910)
    assert math.isnan(percentile([], 90))


def test_mean_ci() -> None:
    mean, half = mean_ci([4, 5, 4, 5])
    assert mean == 4.5
    assert half > 0
