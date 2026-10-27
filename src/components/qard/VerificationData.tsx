export default function VerificationData({ data, source }: { data: unknown; source: string }) {
  const render = (value: unknown, path: string): React.ReactNode => {
    if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => (
      <div key={`${path}.${key}`} className="min-w-0 border-l border-border pl-3 space-y-1">
        <dt className="text-xs text-muted-foreground break-words">{key}</dt>
        <dd className="text-sm break-words [overflow-wrap:anywhere]">{render(item, `${path}.${key}`)}</dd>
      </div>
    ));
    return value === null || value === undefined || value === '' ? 'No informado' : typeof value === 'boolean' ? (value ? 'Sí' : 'No') : String(value);
  };
  return <section className="space-y-3 min-w-0"><h3 className="font-semibold">Datos recibidos · {source}</h3><dl className="space-y-2">{render(data, source)}</dl></section>;
}