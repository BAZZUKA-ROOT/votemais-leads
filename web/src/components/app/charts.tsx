'use client';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useEffect, useState } from 'react';
import { fmtNum } from '@/lib/format';

const axis = { stroke: 'var(--color-muted-foreground)', fontSize: 11, tickLine: false, axisLine: false } as const;
const COLORS = ['var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)', 'var(--color-chart-4)', 'var(--color-chart-5)'];

function TooltipBox({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-2.5 py-1.5 text-[11px] shadow-md">
      {label && <div className="mb-0.5 font-medium">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          {p.name}: <span className="font-medium text-foreground tabular">{fmtNum(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

const shortDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function TimeAreaChart({ data, series, height = 220 }: { data: Array<Record<string, number | string>>; series: Array<{ key: string; label: string; color?: string }>; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? COLORS[i]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color ?? COLORS[i]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip content={<TooltipBox />} labelFormatter={(l) => shortDay(String(l))} />
        {series.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? COLORS[i]} strokeWidth={2} fill={`url(#fill-${s.key})`} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HBarChart({ data, labelKey, valueKey, height = 240, color = 'var(--color-chart-1)' }: { data: Array<Record<string, number | string>>; labelKey: string; valueKey: string; height?: number; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} {...axis} />
        <YAxis type="category" dataKey={labelKey} width={110} {...axis} tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: 'var(--color-muted)' }} />
        <Bar dataKey={valueKey} name="Leads" fill={color} radius={[0, 4, 4, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Tela estreita (celular): gráficos inclinam rótulos para não se sobreporem. */
function useNarrow(max = 640) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${max}px)`);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [max]);
  return narrow;
}

export function VBarChart({ data, labelKey, series, height = 240, stacked }: { data: Array<Record<string, number | string>>; labelKey: string; series: Array<{ key: string; label: string; color?: string }>; height?: number; stacked?: boolean }) {
  const tilt = useNarrow() && data.length > 4;
  return (
    <ResponsiveContainer width="100%" height={tilt ? height + 40 : height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis
          dataKey={labelKey}
          {...axis}
          interval={tilt && data.length > 12 ? 'preserveStartEnd' : 0}
          tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
          {...(tilt ? { angle: -40, textAnchor: 'end', height: 56 } : {})}
        />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: 'var(--color-muted)' }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? COLORS[i]} radius={stacked ? 0 : [4, 4, 0, 0]} stackId={stacked ? 'a' : undefined} maxBarSize={28} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, height = 200 }: { data: Array<{ name: string; value: number; color?: string }>; height?: number }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="flex items-center gap-4">
      <div className="relative" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none">
              {data.map((d, i) => (
                <Cell key={d.name} fill={d.color ?? COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<TooltipBox />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular">{fmtNum(total)}</span>
          <span className="text-[10px] text-muted-foreground">total</span>
        </div>
      </div>
      <ul className="space-y-1.5 text-xs">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-2 rounded-sm" style={{ background: d.color ?? COLORS[i % COLORS.length] }} />
            <span className="text-muted-foreground">{d.name}</span>
            <span className="ml-auto pl-3 font-medium tabular">{fmtNum(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
