import { weightedScore } from './performance.controller';

describe('weightedScore', () => {
  it('computes a weighted 1–5 average of scored goals', () => {
    expect(weightedScore([{ weight: 40, score: 5 }, { weight: 30, score: 3 }, { weight: 30, score: 4 }])).toBe(4.1);
  });
  it('ignores unscored goals and returns null when none are scored', () => {
    expect(weightedScore([{ weight: 50, score: 4 }, { weight: 50, score: null }])).toBe(4);
    expect(weightedScore([{ weight: 50, score: null }])).toBeNull();
  });
});
