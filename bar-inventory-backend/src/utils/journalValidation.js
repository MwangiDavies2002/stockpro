function validateJournal(lines) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!Array.isArray(lines) || lines.length < 2) fail('A journal requires at least two lines');
  let debit = 0, credit = 0;
  for (const line of lines) {
    const id = Number(line.account_id ?? line.accountId);
    const d = Number(line.debit ?? 0), c = Number(line.credit ?? 0);
    if (!Number.isInteger(id) || id < 1 || !Number.isFinite(d) || !Number.isFinite(c) || d < 0 || c < 0 || (d > 0 && c > 0) || (d === 0 && c === 0)) fail('Each journal line needs a valid account and a positive debit or credit');
    debit += Math.round(d * 100); credit += Math.round(c * 100);
  }
  if (debit !== credit || debit === 0) fail('Journal debits and credits must balance');
}
module.exports = { validateJournal };
