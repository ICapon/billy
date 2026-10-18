// Gráficos SVG ligeros solo para demo (datos ficticios).

const W = 600;
const H = 220;
const PAD = 24;

function scale(values: number[]) {
  const max = Math.max(...values) * 1.1;
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (values.length - 1);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  return { x, y };
}

export function LineChart({
  data,
  labels,
}: {
  data: number[];
  labels: string[];
}) {
  const { x, y } = scale(data);
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const area = `${line} L${x(data.length - 1)},${H - PAD} L${x(0)},${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      <defs>
        <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <line
          key={t}
          x1={PAD}
          x2={W - PAD}
          y1={PAD + (H - PAD * 2) * t}
          y2={PAD + (H - PAD * 2) * t}
          stroke="var(--separator)"
        />
      ))}
      <path d={area} fill="url(#area)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
      {data.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill="var(--accent)" />
      ))}
      {labels.map((l, i) => (
        <text
          key={l}
          x={x(i)}
          y={H - 4}
          textAnchor="middle"
          fontSize={11}
          fill="var(--muted)"
        >
          {l}
        </text>
      ))}
    </svg>
  );
}

export function BarChart({
  data,
  labels,
}: {
  data: number[];
  labels: string[];
}) {
  const max = Math.max(...data) * 1.1;
  const slot = (W - PAD * 2) / data.length;
  const bw = slot * 0.55;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {data.map((v, i) => {
        const h = (v / max) * (H - PAD * 2);
        const bx = PAD + slot * i + (slot - bw) / 2;
        return (
          <g key={labels[i]}>
            <rect
              x={bx}
              y={H - PAD - h}
              width={bw}
              height={h}
              rx={6}
              fill="var(--accent)"
              opacity={0.55 + (0.45 * v) / Math.max(...data)}
            />
            <text
              x={bx + bw / 2}
              y={H - 6}
              textAnchor="middle"
              fontSize={11}
              fill="var(--muted)"
            >
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function DonutChart({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 56;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <svg viewBox="0 0 160 160" className="size-40" role="img">
        <g transform="rotate(-90 80 80)">
          {data.map((d) => {
            const len = (d.value / total) * c;
            const el = (
              <circle
                key={d.label}
                cx={80}
                cy={80}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={22}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </g>
        <text
          x={80}
          y={86}
          textAnchor="middle"
          fontSize={20}
          fontWeight={600}
          fill="var(--foreground)"
        >
          {total}%
        </text>
      </svg>
      <ul className="flex flex-col gap-2 text-sm">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span
              className="size-3 rounded-full"
              style={{ background: d.color }}
            />
            <span className="text-muted">{d.label}</span>
            <span className="font-medium">{d.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
