// Tastiness-per-dollar. Ranks your roasts by how much "cup quality" you got per dollar —
// reusing the tasting score and the bean's cost you already record. Higher = better value.
// All pure (no DOM) so it's easy to test; History renders buildLeaderboard().

const EMOJI_SCORE = { sad: 30, neutral: 60, happy: 100 };
const DEFAULT_GRAMS_PER_CUP = 15;
const DEFAULT_ROAST_LOSS = 0.15; // assume ~15% weight loss if roasted weight wasn't logged

// Normalise a tasting to 0–100: prefer a cupping score (total/max), else the emoji impression.
export function tastiness(tastingNotes) {
    if (!tastingNotes) return null;
    const s = tastingNotes.scores;
    if (s && s.total != null && Number(s.max) > 0) return (Number(s.total) / Number(s.max)) * 100;
    if (tastingNotes.emoji && EMOJI_SCORE[tastingNotes.emoji] != null) return EMOJI_SCORE[tastingNotes.emoji];
    return null;
}

// Cost of one brewed cup: (green cost) ÷ (roasted weight ÷ grams-per-cup).
export function costPerCup(greenWeightG, costPerKg, roastedWeightG, gramsPerCup = DEFAULT_GRAMS_PER_CUP) {
    const green = Number(greenWeightG) || 0;
    const cost = Number(costPerKg) || 0;
    if (green <= 0 || cost <= 0 || gramsPerCup <= 0) return null;
    const roasted = Number(roastedWeightG) > 0 ? Number(roastedWeightG) : green * (1 - DEFAULT_ROAST_LOSS);
    const cups = roasted / gramsPerCup;
    if (cups <= 0) return null;
    return (green / 1000) * cost / cups;
}

// Quality points per dollar.
export function valuePerDollar(tastinessScore, cpc) {
    if (tastinessScore == null || cpc == null || cpc <= 0) return null;
    return tastinessScore / cpc;
}

// Rank roasts (best value first). Only roasts with both a tasting score and a known cost count.
export function buildLeaderboard(roasts, beans, { gramsPerCup = DEFAULT_GRAMS_PER_CUP } = {}) {
    return (roasts || []).map(r => {
        const bean = (beans || []).find(b => b.id === r.beanId);
        const t = tastiness(r.tastingNotes);
        const cpc = bean ? costPerCup(r.greenWeightG, bean.costPerKg, r.roastedWeightG, gramsPerCup) : null;
        return {
            roast: r,
            beanName: (bean && bean.name) ? bean.name : 'Unknown bean',
            tastiness: t,
            costPerCup: cpc,
            value: valuePerDollar(t, cpc)
        };
    }).filter(x => x.value != null).sort((a, b) => b.value - a.value);
}
