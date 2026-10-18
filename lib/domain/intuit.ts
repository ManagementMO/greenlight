export interface IntuitBankRow { id: string; date: string; amount: string; running_balance_amount: string }
function dateIsValid(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** Parse exact decimal amounts without floating-point multiplication or debit/credit assumptions. */
export function decimalToCents(value: string): number {
  if (value.length > 24 || !/^-?\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("Unsupported decimal money amount");
  const negative = value.startsWith("-"); const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  const signed = negative ? -cents : cents;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error("Money exceeds safe integer cents");
  return Number(signed);
}
/** A deliberately narrow adapter for the sponsor's flat emitted bank-record format, not arbitrary YAML. */
export function parseIntuitBankLedgerYaml(text: string): IntuitBankRow[] {
  const rows: IntuitBankRow[] = []; let current: Partial<IntuitBankRow> | null = null;
  const finish = () => {
    if (!current) return;
    if (!current.id || !current.date || current.amount === undefined || current.running_balance_amount === undefined) throw new Error("Unsupported or incomplete Intuit bank record");
    rows.push(current as IntuitBankRow);
  };
  for (const line of text.split(/\r?\n/)) {
    const header = /^- id: ([a-zA-Z0-9_.:-]+)$/.exec(line);
    if (header) { finish(); current = { id: header[1] }; continue; }
    const field = /^  (date|amount|running_balance_amount): (?:'([^']*)'|"([^"]*)"|([^\s]+))$/.exec(line);
    if (field && current) {
      const key = field[1] as "date" | "amount" | "running_balance_amount";
      if (current[key] !== undefined) throw new Error("Duplicate bank-record field");
      current[key] = field[2] ?? field[3] ?? field[4];
    }
  }
  finish(); if (!rows.length) throw new Error("No supported Intuit bank rows"); return rows;
}
export function reconcileIntuitSnapshot(input: { companyId: string; asOfDate: string; rows: IntuitBankRow[]; restrictedFundsCents?: number }) {
  if (!input.companyId || !dateIsValid(input.asOfDate)) throw new Error("Snapshot needs a company scope and ISO as-of date");
  if (input.restrictedFundsCents !== undefined && (!Number.isSafeInteger(input.restrictedFundsCents) || input.restrictedFundsCents < 0)) throw new Error("Restricted funds need nonnegative integer cents");
  if (input.rows.some(row => !dateIsValid(row.date))) throw new Error("Bank ledger contains an invalid record date");
  const visible = input.rows.filter(row => row.date <= input.asOfDate);
  if (!visible.length) throw new Error("No bank balance is available at this snapshot");
  const seen = new Map<string, IntuitBankRow>(); let prior: { date: string; balance: number } | null = null; let last: IntuitBankRow | null = null; let count = 0;
  for (const row of visible) {
    const duplicate = seen.get(row.id);
    if (duplicate) {
      if (JSON.stringify(duplicate) !== JSON.stringify(row)) throw new Error("Conflicting bank identity");
      continue;
    }
    seen.set(row.id, row);
    const amount = decimalToCents(row.amount); const balance = decimalToCents(row.running_balance_amount);
    if (prior && (row.date < prior.date || !Number.isSafeInteger(prior.balance + amount) || prior.balance + amount !== balance)) throw new Error(`Bank running balance does not reconcile at ${row.id}`);
    prior = { date: row.date, balance }; last = row; count++;
  }
  const bankBalanceCents = prior!.balance;
  const availableCashCents = input.restrictedFundsCents === undefined ? null : bankBalanceCents - input.restrictedFundsCents;
  if (availableCashCents !== null && availableCashCents < 0) throw new Error("Confirmed restricted funds exceed the available bank balance");
  return { companyId: input.companyId, asOfDate: input.asOfDate, bankBalanceCents, availableCashCents, lastBankEventId: last!.id, lastObservedDate: last!.date, reconciledRowCount: count, limitation: "Bank ledger balances establish recorded funds only. Available cash remains unknown until restricted/unavailable funds are explicitly confirmed. Forward commitments are a separate required input." };
}
