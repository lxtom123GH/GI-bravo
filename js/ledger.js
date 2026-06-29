// Borrowed/lent bean ledger — "borrowed from Mark, owe 250 g" / "lent Sam 200 g". Keeps the
// collective side honest when beans get swapped between roasting friends. Pure summary here;
// the entries live on the pantry bean (so JSON backup covers them automatically).
//
// Entry: { id, dir: 'borrowed' | 'lent', who, grams, note?, date }.
//   dir 'borrowed' = you owe `who` that many grams.
//   dir 'lent'     = `who` owes you that many grams.

export const LEDGER_DIRS = ['borrowed', 'lent'];

// Total grams you owe (borrowed) vs are owed (lent), and the net (positive = owed to you).
// Ignores non-positive grams. Pure.
export function summariseLedger(ledger) {
    let owed = 0, lent = 0;
    for (const e of ledger || []) {
        const g = Number(e && e.grams) || 0;
        if (g <= 0) continue;
        if (e.dir === 'borrowed') owed += g;
        else if (e.dir === 'lent') lent += g;
    }
    return { owed, lent, net: lent - owed };
}
