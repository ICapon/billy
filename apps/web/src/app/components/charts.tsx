// Lightweight SVG charts for real data. Each chart is an image with an aria-label and a
// visually hidden table with the same numbers, so it is readable without seeing the graphic.

const W = 600;
const H = 220;
const PAD_X = 48;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

export interface Series {
  name: string;
  color: string;
  values: number[];
}

type Format = (value: number) => string;

function niceMax(values: number[]): number {
  const max = Math.max(0, ...values);
  if (max === 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

/** At most `limit` label indexes, evenly spread, always including the last one. */
function visibleLabelIndexes(count: number, limit = 6): Set<number> {
  if (count <= limit)
    return new Set(Array.from({ length: count }, (_, i) => i));
  const step = Math.ceil(count / limit);
  const picked = new Set<number>();
  for (let i = 0; i < count; i += step) picked.add(i);
  picked.add(count - 1);
  return picked;
}

function DataTable({
  caption,
  labels,
  series,
  format,
}: {
  caption: string;
  labels: string[];
  series: Series[];
  format: Format;
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Periodo</th>
          {series.map((s) => (
            <th key={s.name} scope="col">
              {s.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels.map((label, i) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            {series.map((s) => (
              <td key={s.name}>{format(s.values[i] ?? 0)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {series.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full"
            style={{ background: s.color }}
          />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

function Axes({
  labels,
  max,
  format,
  xAt,
}: {
  labels: string[];
  max: number;
  format: Format;
  xAt: (i: number) => number;
}) {
  const visible = visibleLabelIndexes(labels.length);
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  return (
    <>
      {[0, 0.5, 1].map((t) => {
        const y = PAD_TOP + innerH * (1 - t);
        return (
          <g key={t}>
            <line
              x1={PAD_X}
              x2={W - 8}
              y1={y}
              y2={y}
              stroke="var(--separator)"
            />
            <text
              x={PAD_X - 6}
              y={y + 4}
              textAnchor="end"
              fontSize={10}
              fill="var(--muted)"
            >
              {format(max * t)}
            </text>
          </g>
        );
      })}
      {labels.map((label, i) =>
        visible.has(i) ? (
          <text
            key={`${label}-${i}`}
            x={xAt(i)}
            y={H - 8}
            textAnchor="middle"
            fontSize={10}
            fill="var(--muted)"
          >
            {label}
          </text>
        ) : null,
      )}
    </>
  );
}

export function SeriesLineChart({
  labels,
  series,
  format = String,
  ariaLabel,
}: {
  labels: string[];
  series: Series[];
  format?: Format;
  ariaLabel: string;
}) {
  if (labels.length === 0) return null;
  const max = niceMax(series.flatMap((s) => s.values));
  const innerW = W - PAD_X - 8;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const xAt = (i: number) =>
    labels.length === 1
      ? PAD_X + innerW / 2
      : PAD_X + (i * innerW) / (labels.length - 1);
  const yAt = (v: number) => PAD_TOP + innerH * (1 - v / max);

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={ariaLabel}
      >
        <Axes labels={labels} max={max} format={format} xAt={xAt} />
        {series.map((s) => (
          <g key={s.name}>
            <path
              d={s.values
                .map((v, i) => `${i ? 'L' : 'M'}${xAt(i)},${yAt(v)}`)
                .join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
            {s.values.map((v, i) => (
              <circle
                key={i}
                cx={xAt(i)}
                cy={yAt(v)}
                r={labels.length > 40 ? 0 : 3}
                fill={s.color}
              >
                <title>{`${labels[i]} · ${s.name}: ${format(v)}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <Legend series={series} />
      <DataTable
        caption={ariaLabel}
        labels={labels}
        series={series}
        format={format}
      />
    </div>
  );
}

export function GroupedBarChart({
  labels,
  series,
  format = String,
  ariaLabel,
}: {
  labels: string[];
  series: Series[];
  format?: Format;
  ariaLabel: string;
}) {
  if (labels.length === 0) return null;
  const max = niceMax(series.flatMap((s) => s.values));
  const innerW = W - PAD_X - 8;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const slot = innerW / labels.length;
  const group = slot * 0.7;
  const bar = group / series.length;
  const xCenter = (i: number) => PAD_X + slot * i + slot / 2;

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={ariaLabel}
      >
        <Axes labels={labels} max={max} format={format} xAt={xCenter} />
        {labels.map((label, i) =>
          series.map((s, j) => {
            const value = s.values[i] ?? 0;
            const height = (value / max) * innerH;
            return (
              <rect
                key={`${label}-${s.name}`}
                x={xCenter(i) - group / 2 + bar * j}
                y={PAD_TOP + innerH - height}
                width={Math.max(bar - 2, 1)}
                height={height}
                rx={3}
                fill={s.color}
              >
                <title>{`${label} · ${s.name}: ${format(value)}`}</title>
              </rect>
            );
          }),
        )}
      </svg>
      <Legend series={series} />
      <DataTable
        caption={ariaLabel}
        labels={labels}
        series={series}
        format={format}
      />
    </div>
  );
}

export function HorizontalBars({
  items,
  format,
  ariaLabel,
}: {
  items: { label: string; value: number; share: number }[];
  format: Format;
  ariaLabel: string;
}) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="flex flex-col gap-2" aria-label={ariaLabel}>
      {items.map((item) => (
        <li key={item.label} className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between gap-3">
            <span className="truncate">{item.label}</span>
            <span className="shrink-0 text-muted">
              {format(item.value)} · {Math.round(item.share * 100)} %
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-default"
            aria-hidden
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
