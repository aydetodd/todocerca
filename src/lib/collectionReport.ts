export type TerminalTotal = { id: string; name: string; count: number; cents: string };
export type BranchTotal = { id: string; name: string; count: number; cents: string; terminals: TerminalTotal[] };
export type CollectionReport = { total_cents: string; operations_cents: string; balance_cents: string; count: number; operations_count: number; branches: BranchTotal[] };
export type CollectionDetail = { id: string; date: string; cents: string };

/** Add existing registrations with no receipts; never reassign historical amounts. */
export function collectionDisplayBranches(report: CollectionReport, branches: { id: string; nombre: string }[], terminals: { id: string; phone: string; terminal_name: string | null; negocio_id: string | null }[]): BranchTotal[] {
  const display = report.branches.map(branch => ({ ...branch, terminals: branch.terminals.map(terminal => ({ ...terminal })) }));
  for (const branch of branches) {
    if (!display.some(row => row.id === branch.id)) display.push({ id: branch.id, name: branch.nombre, cents: '0', count: 0, terminals: [] });
  }
  for (const terminal of terminals) {
    const branchId = terminal.negocio_id || 'unassigned';
    let branch = display.find(row => row.id === branchId);
    if (!branch && terminal.negocio_id === null) {
      branch = { id: branchId, name: 'Sin sucursal', cents: '0', count: 0, terminals: [] };
      display.push(branch);
    }
    if (branch && !branch.terminals.some(row => row.id === terminal.id)) branch.terminals.push({ id: terminal.id, name: terminal.terminal_name || `Terminal · ${terminal.phone.slice(-4)}`, cents: '0', count: 0 });
  }
  return display.sort((a, b) => a.name.localeCompare(b.name, 'es')).map(branch => ({ ...branch, terminals: branch.terminals.sort((a, b) => a.name.localeCompare(b.name, 'es')) }));
}

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