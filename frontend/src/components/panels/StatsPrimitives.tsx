// frontend/src/components/panels/StatsPrimitives.tsx
import React from 'react';

// -------------------- Tipos e temas --------------------

export type ColorTheme = 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'gray' | 'auto';
export type SizeVariant = 'sm' | 'md' | 'lg';

const COLOR_SCHEMES: Record<ColorTheme, string> = {
  blue: '#3b82f6',
  green: '#10b981',
  red: '#ef4444',
  yellow: '#f59e0b',
  purple: '#8b5cf6',
  gray: '#6b7280',
  auto: 'currentColor',
};

const SIZE_SCHEMES = {
  sm: { height: 2, text: 'text-xs' },
  md: { height: 3, text: 'text-sm' },
  lg: { height: 4, text: 'text-base' },
};

// -------------------- MetricBar --------------------

export function MetricBar({
  label,
  value,
  suffix = '%',
  color = 'blue',
  theme = 'blue',
  size = 'md',
  showValue = true,
  animate = true,
  help,
  className = '',
  formatValue,
}: {
  label: string;
  value?: number; // 0..100 ou qualquer range se formatValue for fornecido
  suffix?: string;
  color?: string; // override direto (hex/rgb/etc.)
  theme?: ColorTheme; // usa tema pré-definido
  size?: SizeVariant;
  showValue?: boolean;
  animate?: boolean;
  help?: string;
  className?: string;
  formatValue?: (value: number) => string; // para valores não percentuais
}) {
  const normalizedValue =
    typeof value === 'number' ? Math.max(0, Math.min(100, value)) : undefined;

  // Se "color" foi alterado do default "blue", usa-o diretamente.
  // Caso contrário, use o tema escolhido.
  const colorValue = color !== 'blue' ? color : COLOR_SCHEMES[theme];
  const sizeConfig = SIZE_SCHEMES[size];

  const displayValue =
    formatValue && typeof value === 'number'
      ? formatValue(value)
      : typeof normalizedValue === 'number'
      ? `${normalizedValue}${suffix}`
      : '—';

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className={`flex items-center justify-between ${sizeConfig.text} text-slate-600`}>
        <span className="truncate" title={help || label}>
          {label}
        </span>
        {showValue && (
          <span
            className="tabular-nums font-medium text-slate-900 ml-2 flex-shrink-0"
            title={typeof value === 'number' ? String(value) : undefined}
          >
            {displayValue}
          </span>
        )}
      </div>

      <div
        className={`rounded bg-slate-100 overflow-hidden ${
          size === 'sm' ? 'h-1.5' : size === 'md' ? 'h-2' : 'h-3'
        }`}
      >
        <div
          className={`h-full rounded ${animate ? 'transition-all duration-500 ease-out' : ''}`}
          style={{
            width: `${normalizedValue ?? 0}%`,
            background: colorValue,
            transitionProperty: animate ? 'width, background-color' : 'none',
          }}
          role="progressbar"
          aria-valuenow={normalizedValue}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label}: ${displayValue}`}
        />
      </div>
    </div>
  );
}

// Variante compacta para grids densos
export function CompactMetricBar({
  value,
  color = 'blue',
  showLabel = false,
  label,
}: {
  value?: number;
  color?: ColorTheme;
  showLabel?: boolean;
  label?: string;
}) {
  const normalizedValue =
    typeof value === 'number' ? Math.max(0, Math.min(100, value)) : 0;

  return (
    <div className="flex items-center gap-2 min-w-0">
      {showLabel && label && (
        <span className="text-xs text-slate-500 truncate flex-shrink-0">{label}</span>
      )}
      <div className="flex-1 min-w-0">
        <div className="h-1.5 rounded bg-slate-200 overflow-hidden">
          <div
            className="h-full rounded transition-all duration-300"
            style={{
              width: `${normalizedValue}%`,
              backgroundColor: COLOR_SCHEMES[color],
            }}
          />
        </div>
      </div>
      <span className="text-xs tabular-nums text-slate-600 flex-shrink-0">
        {typeof value === 'number' ? `${Math.round(value)}%` : '—'}
      </span>
    </div>
  );
}

// -------------------- MiniSparkline --------------------

export function MiniSparkline({
  data,
  height = 28,
  width = 80,
  strokeWidth = 2,
  valueRange,
  color = 'blue',
  smooth = false,
  showArea = false,
  showPoints = false,
  ariaLabel,
  className = '',
}: {
  data?: number[];
  height?: number;
  width?: number;
  strokeWidth?: number;
  valueRange?: { min: number; max: number };
  color?: ColorTheme;
  smooth?: boolean;
  showArea?: boolean;
  showPoints?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  if (!data || data.length < 2) {
    return (
      <div
        className={`flex items-center justify-center text-slate-400 ${className || ''}`}
        style={{ height, width }}
      >
        <span className="text-[10px]">sem dados</span>
      </div>
    );
  }

  const W = width;
  const H = height;
  const strokeColor = COLOR_SCHEMES[color];

  // Normalização
  let values = [...data];
  let min = valueRange?.min ?? Math.min(...values);
  let max = valueRange?.max ?? Math.max(...values);

  if (max === min) {
    max = min + 1;
    values = values.map(() => 0.5);
  } else {
    values = values.map((v) => (v - min) / (max - min));
  }

  const step = W / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = H - v * H;
    return { x, y };
  });

  const createSmoothPath = (pts: { x: number; y: number }[]): string => {
    if (pts.length < 2) return '';
    let path = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cX = (prev.x + curr.x) / 2;
      path += ` C ${cX},${prev.y} ${cX},${curr.y} ${curr.x},${curr.y}`;
    }
    return path;
  };

  const linearPath = `M ${points[0].x},${points[0].y} ` + points
    .slice(1)
    .map((p) => `L ${p.x},${p.y}`)
    .join(' ');

  const lineD = smooth ? createSmoothPath(points) : linearPath;

  // Área preenchida baseada no path da linha
  const areaD = `${lineD} L ${points[points.length - 1].x},${H} L ${points[0].x},${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      aria-label={ariaLabel}
      role="img"
      className={`block ${className}`}
    >
      {/* Linha guia (baseline) */}
      <line x1="0" y1={H} x2={W} y2={H} stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="2,2" />

      {/* Área preenchida */}
      {showArea && (
        <path d={areaD} fill={strokeColor} fillOpacity="0.1" />
      )}

      {/* Linha principal */}
      <path
        d={lineD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Pontos */}
      {showPoints &&
        points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={strokeWidth * 1.2} fill={strokeColor} stroke="#fff" strokeWidth="1" />
        ))}
    </svg>
  );
}

// Sparkline com valor atual
export function SparklineWithValue({
  data,
  currentValue,
  formatValue = (v: number) => v.toString(),
  color = 'blue',
  ...sparklineProps
}: {
  data?: number[];
  currentValue?: number;
  formatValue?: (value: number) => string;
} & Omit<React.ComponentProps<typeof MiniSparkline>, 'ariaLabel'>) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-shrink-0">
        <span className="text-sm font-semibold text-slate-900 tabular-nums">
          {typeof currentValue === 'number' ? formatValue(currentValue) : '—'}
        </span>
      </div>
      <div className="flex-1">
        <MiniSparkline data={data} color={color} ariaLabel={`Histórico: ${data?.join(', ')}`} {...sparklineProps} />
      </div>
    </div>
  );
}

// -------------------- KPIs --------------------

export function KpiRow({
  items,
  variant = 'default',
  className = '',
}: {
  items: Array<{
    label: string;
    value: React.ReactNode;
    hint?: string;
    trend?: 'up' | 'down' | 'neutral';
    change?: number;
    color?: ColorTheme;
  }>;
  variant?: 'default' | 'compact' | 'highlight';
  className?: string;
}) {
  const getTrendIcon = (trend?: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up':
        return '↗';
      case 'down':
        return '↘';
      case 'neutral':
        return '→';
      default:
        return null;
    }
  };

  const getTrendColor = (trend?: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-600';
      case 'neutral':
        return 'text-slate-500';
      default:
        return 'text-slate-400';
    }
  };

  const baseClasses = {
    default: 'grid grid-cols-3 gap-3',
    compact: 'grid grid-cols-4 gap-2',
    highlight: 'grid grid-cols-2 gap-4',
  };

  const itemClasses = {
    default: 'p-3 rounded-lg bg-slate-50 border border-slate-200',
    compact: 'p-2 rounded-md bg-white border border-slate-200',
    highlight:
      'p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 shadow-sm',
  };

  return (
    <div className={`${baseClasses[variant]} ${className}`}>
      {items.map((it, index) => (
        <div key={it.label + index} className={itemClasses[variant]}>
          <div className="flex items-start justify-between mb-1">
            <div
              className={`${
                variant === 'compact' ? 'text-[10px]' : 'text-[11px]'
              } text-slate-500 uppercase tracking-wide font-medium`}
            >
              {it.label}
            </div>

            {(it.trend || it.change !== undefined) && (
              <div
                className={`flex items-center gap-1 ${
                  variant === 'compact' ? 'text-xs' : 'text-sm'
                } ${getTrendColor(it.trend)}`}
              >
                {getTrendIcon(it.trend)}
                {it.change !== undefined && (
                  <span className="tabular-nums font-medium">
                    {it.change > 0 ? '+' : ''}
                    {it.change}%
                  </span>
                )}
              </div>
            )}
          </div>

          <div
            className={`font-semibold text-slate-900 ${
              variant === 'highlight'
                ? 'text-2xl'
                : variant === 'compact'
                ? 'text-sm'
                : 'text-lg'
            }`}
          >
            {it.value}
          </div>

          {it.hint && (
            <div
              className={`text-slate-400 mt-1 ${
                variant === 'compact' ? 'text-[10px]' : 'text-xs'
              }`}
            >
              {it.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// KPI individual
export function KpiCard({
  label,
  value,
  hint,
  trend,
  change,
  color = 'blue',
  size = 'md',
  className = '',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  trend?: 'up' | 'down' | 'neutral';
  change?: number;
  color?: ColorTheme;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'p-2 text-xs',
    md: 'p-3 text-sm',
    lg: 'p-4 text-base',
  };

  const valueSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
  };

  // Acento sutil com cor (borda superior)
  const accentStyle =
    color !== 'auto'
      ? { boxShadow: `inset 0 2px 0 0 ${COLOR_SCHEMES[color]}` }
      : undefined;

  return (
    <div
      className={`rounded-lg bg-white border border-slate-200 ${sizeClasses[size]} ${className}`}
      style={accentStyle}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-slate-500 font-medium uppercase tracking-wide text-xs">
          {label}
        </div>
        {(trend || change !== undefined) && (
          <div
            className={`flex items-center gap-1 text-xs ${
              trend === 'up'
                ? 'text-green-600'
                : trend === 'down'
                ? 'text-red-600'
                : 'text-slate-500'
            }`}
          >
            {trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→'}
            {change !== undefined && (
              <span className="tabular-nums font-medium">
                {change > 0 ? '+' : ''}
                {change}%
              </span>
            )}
          </div>
        )}
      </div>

      <div className={`font-bold text-slate-900 ${valueSizes[size]}`}>{value}</div>

      {hint && <div className="text-slate-400 text-xs mt-1">{hint}</div>}
    </div>
  );
}

// -------------------- Extras --------------------

export function StatusIndicator({
  status,
  size = 'md',
  pulse = false,
  label,
}: {
  status: 'success' | 'warning' | 'error' | 'neutral' | 'loading';
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
  label?: string;
}) {
  const statusConfig = {
    success: { color: 'bg-green-500', label: 'Operacional' },
    warning: { color: 'bg-yellow-500', label: 'Atenção' },
    error: { color: 'bg-red-500', label: 'Crítico' },
    neutral: { color: 'bg-slate-400', label: 'Desconhecido' },
    loading: { color: 'bg-blue-500', label: 'Carregando' },
  };

  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <div
        className={`${sizeClasses[size]} ${config.color} rounded-full ${pulse ? 'animate-pulse' : ''}`}
        title={config.label}
      />
      {label && <span className="text-sm text-slate-700">{label}</span>}
    </div>
  );
}

export function MetricGroup({
  title,
  children,
  action,
  className = '',
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-lg border border-slate-200 p-4 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
          {action}
        </div>
      )}
      <div className="space-y-3">{children}</div>
    </div>
  );
}
