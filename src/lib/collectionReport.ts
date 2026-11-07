export type TerminalTotal = { id: string; name: string; count: number; cents: string };
export type BranchTotal = { id: string; name: string; count: number; cents: string; terminals: TerminalTotal[] };
export type CollectionReport = { total_cents: string; operations_cents: string; balance_cents: string; count: number; operations_count: number; branches: BranchTotal[] };
export type CollectionDetail = { id: string; date: string; cents: string };

export function formatCents(value: string | bigint): string {
  const cents = BigInt(value);
  const abs = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '-' : ''}$${(abs / 100n).toLocaleString('es-MX')}.${(abs % 100n).toString().padStart(2, '0')}`;
}

export function reconcileCollections(report: CollectionReport): boolean {
  const total = BigInt(report.total_cents);
  return report.branches.reduce((sum, branch) => sum + BigInt(branch.cents), 0n) === total
    && report.branches.reduce((sum, branch) => sum + branch.count, 0) === report.count
    && report.branches.every(branch => branch.terminals.reduce((sum, terminal) => sum + BigInt(terminal.cents), 0n) === BigInt(branch.cents)
      && branch.terminals.reduce((sum, terminal) => sum + terminal.count, 0) === branch.count)
    && BigInt(report.operations_cents) === total && report.operations_count === report.count;
}