"""Corpus-level error rates, bootstrap confidence intervals and percentiles."""

from __future__ import annotations

import math
import random
from collections.abc import Sequence
from dataclasses import dataclass

import jiwer

from .textnorm import normalize_for_scoring


@dataclass(frozen=True)
class Counts:
    """Edit counts for one utterance; corpus rates are sums of these, not means of rates."""

    word_errors: int
    ref_words: int
    char_errors: int
    ref_chars: int


def utterance_counts(reference: str, hypothesis: str) -> Counts:
    ref = normalize_for_scoring(reference)
    hyp = normalize_for_scoring(hypothesis)
    if not ref:
        raise ValueError("reference is empty after normalization")
    words = jiwer.process_words(ref, hyp or "")
    w_err = words.substitutions + words.deletions + words.insertions
    ref_nospace, hyp_nospace = ref.replace(" ", ""), (hyp or "").replace(" ", "")
    chars = jiwer.process_characters(ref_nospace, hyp_nospace or "")
    c_err = chars.substitutions + chars.deletions + chars.insertions
    return Counts(w_err, len(ref.split()), c_err, len(ref_nospace))


def corpus_wer(counts: Sequence[Counts]) -> float:
    return sum(c.word_errors for c in counts) / max(1, sum(c.ref_words for c in counts))


def corpus_cer(counts: Sequence[Counts]) -> float:
    return sum(c.char_errors for c in counts) / max(1, sum(c.ref_chars for c in counts))


def bootstrap_ci(
    counts: Sequence[Counts], iterations: int = 1000, seed: int = 7
) -> tuple[float, float]:
    """95% CI of corpus WER by resampling utterances with replacement."""
    if not counts:
        return (math.nan, math.nan)
    rng = random.Random(seed)
    n = len(counts)
    samples = sorted(
        corpus_wer([counts[rng.randrange(n)] for _ in range(n)]) for _ in range(iterations)
    )
    return (samples[int(0.025 * iterations)], samples[int(0.975 * iterations) - 1])


def percentile(values: Sequence[float], p: float) -> float:
    """Linear-interpolated percentile (same definition as numpy's default)."""
    if not values:
        return math.nan
    ordered = sorted(values)
    rank = (len(ordered) - 1) * p / 100
    lo, hi = math.floor(rank), math.ceil(rank)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (rank - lo)


def mean_ci(values: Sequence[float]) -> tuple[float, float]:
    """Mean and 95% half-width (normal approximation)."""
    n = len(values)
    if n == 0:
        return (math.nan, math.nan)
    mean = sum(values) / n
    if n == 1:
        return (mean, math.nan)
    var = sum((v - mean) ** 2 for v in values) / (n - 1)
    return (mean, 1.96 * math.sqrt(var / n))
