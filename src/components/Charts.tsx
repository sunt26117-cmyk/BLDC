import React, { useState } from 'react';
import { EfficiencyGrid2D, EvaluatedDynoPoint } from '../core/dynoCalibrator';
import { SVPWM_LINEAR_LIMIT } from '../core/motorPhysics';

const VIRIDIS_STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [49, 46, 129]],   // Calm indigo
  [0.25, [14, 116, 144]], // Muted teal
  [0.5, [2, 132, 199]],   // Calibrated sky-cobalt
  [0.75, [16, 185, 129]], // Balanced emerald
  [0.9, [245, 158, 11]],  // Warm amber
  [1.0, [250, 204, 21]],  // Soft gold
];

function sampleColor(norm: number): string {
  const t = Math.max(0, Math.min(1, norm));
  for (let i = 0; i < VIRIDIS_STOPS.length - 1; i++) {
    const [t0, c0] = VIRIDIS_STOPS[i];
    const [t1, c1] = VIRIDIS_STOPS[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / Math.max(1e-6, t1 - t0);
      const r = Math.round(c0[0] + f * (c1[0] - c0[0]));
      const g = Math.round(c0[1] + f * (c1[1] - c0[1]));
      const b = Math.round(c0[2] + f * (c1[2] - c0[2]));
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return 'rgb(250, 204, 21)';
}

interface HeatmapProps {
  grid: EfficiencyGrid2D;
  points: EvaluatedDynoPoint[];
}

export const EfficiencyHeatmap2D: React.FC<HeatmapProps> = ({ grid, points }) => {
  const [hoverCell, setHoverCell] = useState<{
    i: number;
    j: number;
    speed: number;
    torque: number;
    etaM: number | null;
    etaP: number | null;
  } | null>(null);

  if (grid.speeds.length === 0 || grid.torques.length === 0) {
    return (
      <div className="flex h-60 items-center justify-center rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] px-6 text-center text-sm text-slate-500 dark:border-[#262C38] dark:bg-[#191D26] dark:text-[#8E98A8]">
        当前数据不足以构建二维效率 Map（需至少包含 4 个测点、≥2 个独立转速与 ≥2 个独立扭矩，单转速/单扭矩 1D 曲线自动跳过二维插值）。
      </div>
    );
  }

  const w = 440;
  const h = 290;
  const padL = 54;
  const padR = 16;
  const padT = 16;
  const padB = 42;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const nCols = grid.speeds.length;
  const nRows = grid.torques.length;
  const cellW = plotW / nCols;
  const cellH = plotH / nRows;

  const minN = grid.speeds[0];
  const maxN = grid.speeds[nCols - 1];
  const minT = grid.torques[0];
  const maxT = grid.torques[nRows - 1];
  const spanEta = Math.max(10, grid.maxEta - grid.minEta);

  const renderSingleMap = (title: string, zMatrix: Array<Array<number | null>>) => (
    <div className="rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] p-4 dark:border-[#262C38] dark:bg-[#191D26]">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-slate-700 dark:text-[#D8DEE9]">{title}</span>
        <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-[#7E8899]">
          {grid.minEta.toFixed(0)}% – {grid.maxEta.toFixed(0)}%
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full cursor-crosshair select-none"
        onMouseLeave={() => setHoverCell(null)}
      >
        <rect
          x={padL}
          y={padT}
          width={plotW}
          height={plotH}
          className="fill-[#EEF2F7] stroke-[#D0D7E2] dark:fill-[#12161E] dark:stroke-[#282F3D]"
          strokeWidth={1}
        />
        {zMatrix.map((row, j) =>
          row.map((val, i) => {
            if (val === null) return null;
            const x = padL + i * cellW;
            const y = padT + (nRows - 1 - j) * cellH;
            const norm = (val - grid.minEta) / spanEta;
            const isHovered = hoverCell?.i === i && hoverCell?.j === j;
            return (
              <rect
                key={`${i}-${j}`}
                x={x}
                y={y}
                width={cellW + 0.6}
                height={cellH + 0.6}
                fill={sampleColor(norm)}
                stroke={isHovered ? '#FFFFFF' : 'none'}
                strokeWidth={isHovered ? 1.2 : 0}
                onMouseEnter={() =>
                  setHoverCell({
                    i,
                    j,
                    speed: grid.speeds[i],
                    torque: grid.torques[j],
                    etaM: grid.zMeasured[j]?.[i] ?? null,
                    etaP: grid.zPredicted[j]?.[i] ?? null,
                  })
                }
              />
            );
          })
        )}

        {/* Measured dyno scatter anchors */}
        {points.map((pt, idx) => {
          const cx = padL + ((pt.nRpm - minN) / Math.max(1e-6, maxN - minN)) * plotW;
          const cy = padT + plotH - ((pt.tNm - minT) / Math.max(1e-6, maxT - minT)) * plotH;
          return (
            <circle
              key={idx}
              cx={cx}
              cy={cy}
              r={2.2}
              fill="rgba(18,22,30,0.8)"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth={0.8}
              className="pointer-events-none"
            />
          );
        })}

        {/* X Axis Ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const x = padL + f * plotW;
          const val = minN + f * (maxN - minN);
          return (
            <g key={`x-${f}`}>
              <line x1={x} y1={padT + plotH} x2={x} y2={padT + plotH + 4} className="stroke-slate-400 dark:stroke-[#4E596B]" />
              <text
                x={x}
                y={padT + plotH + 16}
                textAnchor="middle"
                className="fill-slate-500 font-mono text-[10px] tabular-nums dark:fill-[#8B95A7]"
              >
                {val.toFixed(0)}
              </text>
            </g>
          );
        })}
        <text
          x={padL + plotW / 2}
          y={h - 6}
          textAnchor="middle"
          className="fill-slate-500 text-[10px] dark:fill-[#8B95A7]"
        >
          转速 n (RPM)
        </text>

        {/* Y Axis Ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = padT + plotH - f * plotH;
          const val = minT + f * (maxT - minT);
          return (
            <g key={`y-${f}`}>
              <line x1={padL - 4} y1={y} x2={padL} y2={y} className="stroke-slate-400 dark:stroke-[#4E596B]" />
              <text
                x={padL - 7}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-500 font-mono text-[10px] tabular-nums dark:fill-[#8B95A7]"
              >
                {val.toFixed(2)}
              </text>
            </g>
          );
        })}
        <text
          x={13}
          y={padT + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 13 ${padT + plotH / 2})`}
          className="fill-slate-500 text-[10px] dark:fill-[#8B95A7]"
        >
          扭矩 T (N·m)
        </text>
      </svg>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {renderSingleMap('实测效率 Map η_meas(n, T)', grid.zMeasured)}
        {renderSingleMap('模型重构效率 Map η_est(n, T)', grid.zPredicted)}
      </div>

      {/* Color legend & Crosshair readout bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] px-4 py-2.5 text-xs dark:border-[#262C38] dark:bg-[#191D26]">
        <div className="flex items-center gap-3">
          <span className="text-slate-500 dark:text-[#8E98A8]">效率色阶</span>
          <span className="font-mono tabular-nums text-slate-700 dark:text-[#CBD5E1]">{grid.minEta.toFixed(0)}%</span>
          <div
            className="h-2.5 w-44 rounded-sm border border-slate-300 dark:border-[#2E3646]"
            style={{
              background:
                'linear-gradient(90deg, rgb(49,46,129) 0%, rgb(14,116,144) 25%, rgb(2,132,199) 50%, rgb(16,185,129) 75%, rgb(245,158,11) 90%, rgb(250,204,21) 100%)',
            }}
          />
          <span className="font-mono tabular-nums text-slate-700 dark:text-[#CBD5E1]">{grid.maxEta.toFixed(0)}%</span>
        </div>

        <div className="font-mono text-xs tabular-nums text-slate-700 dark:text-[#D8DEE9]">
          {hoverCell ? (
            <span>
              n={hoverCell.speed.toFixed(0)} RPM · T={hoverCell.torque.toFixed(3)} N·m · 实测=
              <span className="font-semibold text-sky-700 dark:text-sky-300">
                {hoverCell.etaM !== null ? `${hoverCell.etaM.toFixed(1)}%` : '--'}
              </span>{' '}
              · 重构=
              <span className="font-semibold text-amber-600 dark:text-amber-300">
                {hoverCell.etaP !== null ? `${hoverCell.etaP.toFixed(1)}%` : '--'}
              </span>
            </span>
          ) : (
            <span className="text-slate-400 dark:text-[#6E788A]">悬停网格读取效率（四角空白为实测凸包外区域）</span>
          )}
        </div>
      </div>
    </div>
  );
};

interface FitCompareProps {
  points: EvaluatedDynoPoint[];
}

export const DynoFitComparisonChart: React.FC<FitCompareProps> = ({ points }) => {
  const [metricView, setMetricView] = useState<'torque' | 'eta' | 'losses'>('torque');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length === 0) return null;

  const w = 780;
  const h = 250;
  const padL = 58;
  const padR = 20;
  const padT = 18;
  const padB = 36;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const sorted = [...points].sort((a, b) => (a.nRpm !== b.nRpm ? a.nRpm - b.nRpm : a.tNm - b.tNm));

  const renderParityOrLine = (isTorque: boolean) => {
    const valsM = sorted.map((p) => (isTorque ? p.tNm : p.etaMeas * 100));
    const valsP = sorted.map((p) => (isTorque ? p.tEstNm : p.etaEst * 100));
    const maxV = Math.max(...valsM, ...valsP, isTorque ? 0.05 : 10) * 1.08;
    const minV = Math.min(0, ...valsM, ...valsP);
    const spanV = Math.max(1e-4, maxV - minV);

    const xOf = (idx: number) => padL + (idx / Math.max(1, sorted.length - 1)) * plotW;
    const yOf = (v: number) => padT + plotH - ((v - minV) / spanV) * plotH;

    const pathM = sorted.map((_, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(idx).toFixed(1)},${yOf(valsM[idx]).toFixed(1)}`).join(' ');
    const pathP = sorted.map((_, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(idx).toFixed(1)},${yOf(valsP[idx]).toFixed(1)}`).join(' ');

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full cursor-crosshair select-none" onMouseLeave={() => setHoverIdx(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = padT + plotH - f * plotH;
          const v = minV + f * spanV;
          return (
            <g key={f}>
              <line x1={padL} y1={y} x2={padL + plotW} y2={y} className="stroke-slate-200 dark:stroke-[#262D3B]" strokeDasharray="3 3" />
              <text x={padL - 8} y={y + 3} textAnchor="end" className="fill-slate-500 font-mono text-[10px] tabular-nums dark:fill-[#8B95A7]">
                {isTorque ? v.toFixed(2) : v.toFixed(0)}
              </text>
            </g>
          );
        })}

        <path d={pathM} fill="none" stroke="#94A3B8" strokeWidth={1.6} strokeDasharray="4 3" />
        <path d={pathP} fill="none" stroke="#0284C7" strokeWidth={2} />

        {sorted.map((pt, idx) => {
          const x = xOf(idx);
          const ym = yOf(valsM[idx]);
          const yp = yOf(valsP[idx]);
          return (
            <g key={idx}>
              <circle cx={x} cy={ym} r={2.6} fill="#94A3B8" />
              <circle cx={x} cy={yp} r={2.6} fill="#38BDF8" />
              <rect
                x={x - plotW / sorted.length / 2}
                y={padT}
                width={Math.max(8, plotW / sorted.length)}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(idx)}
              />
            </g>
          );
        })}

        {hoverIdx !== null && sorted[hoverIdx] && (
          <line x1={xOf(hoverIdx)} y1={padT} x2={xOf(hoverIdx)} y2={padT + plotH} stroke="#D97706" strokeWidth={1.1} strokeDasharray="2 2" />
        )}

        <text x={padL + plotW / 2} y={h - 6} textAnchor="middle" className="fill-slate-500 text-[10px] dark:fill-[#8B95A7]">
          测功仪排序测试点序号 (按转速→负载递增)
        </text>
        <text x={14} y={padT + plotH / 2} textAnchor="middle" transform={`rotate(-90 14 ${padT + plotH / 2})`} className="fill-slate-500 text-[10px] dark:fill-[#8B95A7]">
          {isTorque ? '扭矩 (N·m)' : '系统效率 (%)'}
        </text>
      </svg>
    );
  };

  const renderLossBreakdown = () => {
    const step = Math.max(1, Math.ceil(sorted.length / 16));
    const subset = sorted.filter((_, idx) => idx % step === 0);
    const maxLoss = Math.max(
      1,
      ...subset.map((p) => p.pInvLossW + p.pCuLossW + p.pIronWindLossW)
    ) * 1.1;
    const barW = Math.max(8, (plotW / subset.length) * 0.62);

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full select-none" onMouseLeave={() => setHoverIdx(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = padT + plotH - f * plotH;
          const v = f * maxLoss;
          return (
            <g key={f}>
              <line x1={padL} y1={y} x2={padL + plotW} y2={y} className="stroke-slate-200 dark:stroke-[#262D3B]" strokeDasharray="3 3" />
              <text x={padL - 8} y={y + 3} textAnchor="end" className="fill-slate-500 font-mono text-[10px] tabular-nums dark:fill-[#8B95A7]">
                {v.toFixed(1)}
              </text>
            </g>
          );
        })}

        {subset.map((pt, idx) => {
          const cx = padL + ((idx + 0.5) / subset.length) * plotW;
          const x = cx - barW / 2;
          const hInv = (pt.pInvLossW / maxLoss) * plotH;
          const hCu = (pt.pCuLossW / maxLoss) * plotH;
          const hFe = (pt.pIronWindLossW / maxLoss) * plotH;

          const yInv = padT + plotH - hInv;
          const yCu = yInv - hCu;
          const yFe = yCu - hFe;

          return (
            <g key={idx}>
              <rect x={x} y={yInv} width={barW} height={hInv} fill="#64748B" rx={1} />
              <rect x={x} y={yCu} width={barW} height={hCu} fill="#D97706" rx={1} />
              <rect x={x} y={yFe} width={barW} height={hFe} fill="#0284C7" rx={1} />
              <text x={cx} y={padT + plotH + 14} textAnchor="middle" className="fill-slate-500 font-mono text-[9px] tabular-nums dark:fill-[#7E8899]">
                {pt.nRpm.toFixed(0)}
              </text>
            </g>
          );
        })}

        <text x={padL + plotW / 2} y={h - 4} textAnchor="middle" className="fill-slate-500 text-[10px] dark:fill-[#8B95A7]">
          抽样工况点转速 (RPM)
        </text>
        <text x={14} y={padT + plotH / 2} textAnchor="middle" transform={`rotate(-90 14 ${padT + plotH / 2})`} className="fill-slate-500 text-[10px] dark:fill-[#8B95A7]">
          损耗拆分 (W)
        </text>
      </svg>
    );
  };

  const hovered = hoverIdx !== null ? sorted[hoverIdx] : null;

  return (
    <div className="rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] p-4 dark:border-[#262C38] dark:bg-[#191D26]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-md border border-[#DCE2EC] bg-[#F1F4F8] p-1 dark:border-[#282F3D] dark:bg-[#12151C]">
          <button
            type="button"
            onClick={() => setMetricView('torque')}
            className={`rounded px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
              metricView === 'torque'
                ? 'bg-white text-sky-700 shadow-xs dark:bg-[#232A37] dark:text-sky-300'
                : 'text-slate-500 hover:text-slate-800 dark:text-[#8E98A8] dark:hover:text-[#E6EAF2]'
            }`}
          >
            扭矩回代对比
          </button>
          <button
            type="button"
            onClick={() => setMetricView('eta')}
            className={`rounded px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
              metricView === 'eta'
                ? 'bg-white text-sky-700 shadow-xs dark:bg-[#232A37] dark:text-sky-300'
                : 'text-slate-500 hover:text-slate-800 dark:text-[#8E98A8] dark:hover:text-[#E6EAF2]'
            }`}
          >
            效率回代对比
          </button>
          <button
            type="button"
            onClick={() => setMetricView('losses')}
            className={`rounded px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
              metricView === 'losses'
                ? 'bg-white text-sky-700 shadow-xs dark:bg-[#232A37] dark:text-sky-300'
                : 'text-slate-500 hover:text-slate-800 dark:text-[#8E98A8] dark:hover:text-[#E6EAF2]'
            }`}
          >
            损耗三拆分
          </button>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-[#9BA4B5]">
          {metricView === 'losses' ? (
            <>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#64748B]" /> 逆变+线损</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#D97706]" /> 电机铜损</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#0284C7]" /> 铁损+风摩</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-slate-400" /> 实测值</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-sky-600 dark:bg-sky-400" /> 模型回代</span>
            </>
          )}
        </div>
      </div>

      {metricView === 'torque' && renderParityOrLine(true)}
      {metricView === 'eta' && renderParityOrLine(false)}
      {metricView === 'losses' && renderLossBreakdown()}

      {hovered && metricView !== 'losses' && (
        <div className="mt-2.5 flex flex-wrap gap-4 border-t border-[#E4E9F1] pt-2.5 font-mono text-xs tabular-nums text-slate-600 dark:border-[#262C38] dark:text-[#CBD5E1]">
          <span>n={hovered.nRpm.toFixed(0)} RPM</span>
          <span>I_bus={hovered.iBusA.toFixed(3)} A</span>
          <span>T_meas={hovered.tNm.toFixed(4)} N·m</span>
          <span className="font-semibold text-sky-700 dark:text-sky-300">T_est={hovered.tEstNm.toFixed(4)} N·m</span>
          <span>η_meas={(hovered.etaMeas * 100).toFixed(1)}%</span>
          <span className="font-semibold text-sky-700 dark:text-sky-300">η_est={(hovered.etaEst * 100).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
};

export interface WaveSeries {
  label: string;
  color: string;
  values: number[];
  dashed?: boolean;
}

interface MultiWaveProps {
  times: number[];
  series: WaveSeries[];
  yLabel: string;
  referenceLine?: { value: number; label: string; color: string };
  height?: number;
}

export const MultiChannelWaveChart: React.FC<MultiWaveProps> = ({
  times,
  series,
  yLabel,
  referenceLine,
  height = 230,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (times.length === 0 || series.length === 0) return null;

  const step = Math.max(1, Math.floor(times.length / 480));
  const idxs: number[] = [];
  for (let i = 0; i < times.length; i += step) idxs.push(i);

  const w = 780;
  const h = height;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 34;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const allVals: number[] = [];
  for (const s of series) {
    for (const idx of idxs) {
      const v = s.values[idx];
      if (Number.isFinite(v)) allVals.push(v);
    }
  }
  if (referenceLine) allVals.push(referenceLine.value);

  const rawMin = allVals.length ? Math.min(...allVals) : 0;
  const rawMax = allVals.length ? Math.max(...allVals) : 1;
  const margin = Math.max(0.05, (rawMax - rawMin) * 0.1);
  const yMin = rawMin - margin;
  const yMax = rawMax + margin;
  const ySpan = Math.max(1e-6, yMax - yMin);

  const tMin = times[0];
  const tMax = times[times.length - 1];
  const tSpan = Math.max(1e-6, tMax - tMin);

  const xOf = (t: number) => padL + ((t - tMin) / tSpan) * plotW;
  const yOf = (v: number) => padT + plotH - ((v - yMin) / ySpan) * plotH;

  return (
    <div className="rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] p-4 dark:border-[#262C38] dark:bg-[#191D26]">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 text-slate-600 dark:text-[#C2CBD8]">
              <span
                className="inline-block h-0.5 w-4"
                style={{
                  backgroundColor: s.dashed ? 'transparent' : s.color,
                  borderTop: s.dashed ? `2px dashed ${s.color}` : 'none',
                }}
              />
              {s.label}
            </span>
          ))}
        </div>
        <div className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-[#8B95A7]">
          {hoverIdx !== null ? (
            <span>
              t={times[hoverIdx].toFixed(4)}s ·{' '}
              {series
                .map((s) => `${s.label.split(' ')[0]}=${Number.isFinite(s.values[hoverIdx]) ? s.values[hoverIdx].toFixed(3) : 'NaN'}`)
                .join(' · ')}
            </span>
          ) : (
            <span>{yLabel}</span>
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full cursor-crosshair select-none"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rx = ((e.clientX - rect.left) / rect.width) * w;
          const frac = Math.max(0, Math.min(1, (rx - padL) / plotW));
          const targetT = tMin + frac * tSpan;
          let lo = 0;
          let hi = times.length - 1;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (times[mid] < targetT) lo = mid + 1;
            else hi = mid;
          }
          setHoverIdx(lo);
        }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = padT + plotH - f * plotH;
          const val = yMin + f * ySpan;
          return (
            <g key={f}>
              <line x1={padL} y1={y} x2={padL + plotW} y2={y} className="stroke-slate-200 dark:stroke-[#262D3B]" strokeDasharray="3 3" />
              <text x={padL - 7} y={y + 3} textAnchor="end" className="fill-slate-500 font-mono text-[10px] tabular-nums dark:fill-[#8B95A7]">
                {val.toFixed(2)}
              </text>
            </g>
          );
        })}

        {yMin < 0 && yMax > 0 && (
          <line x1={padL} y1={yOf(0)} x2={padL + plotW} y2={yOf(0)} className="stroke-slate-300 dark:stroke-[#384255]" strokeWidth={1} />
        )}

        {referenceLine && (
          <g>
            <line
              x1={padL}
              y1={yOf(referenceLine.value)}
              x2={padL + plotW}
              y2={yOf(referenceLine.value)}
              stroke={referenceLine.color}
              strokeWidth={1.2}
              strokeDasharray="5 4"
            />
            <text
              x={padL + plotW - 4}
              y={yOf(referenceLine.value) - 5}
              textAnchor="end"
              fill={referenceLine.color}
              className="font-mono text-[10px]"
            >
              {referenceLine.label} ({SVPWM_LINEAR_LIMIT.toFixed(4)})
            </text>
          </g>
        )}

        {series.map((s) => {
          let d = '';
          let penDown = false;
          for (const idx of idxs) {
            const v = s.values[idx];
            if (!Number.isFinite(v)) {
              penDown = false;
              continue;
            }
            const x = xOf(times[idx]);
            const y = yOf(v);
            d += `${penDown ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
            penDown = true;
          }
          return (
            <path
              key={s.label}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth={1.7}
              strokeDasharray={s.dashed ? '4 3' : undefined}
            />
          );
        })}

        {hoverIdx !== null && (
          <line
            x1={xOf(times[hoverIdx])}
            y1={padT}
            x2={xOf(times[hoverIdx])}
            y2={padT + plotH}
            stroke="#94A3B8"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        )}

        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const t = tMin + f * tSpan;
          const x = padL + f * plotW;
          return (
            <text
              key={`tx-${f}`}
              x={x}
              y={padT + plotH + 16}
              textAnchor="middle"
              className="fill-slate-500 font-mono text-[10px] tabular-nums dark:fill-[#8B95A7]"
            >
              {t.toFixed(3)}s
            </text>
          );
        })}
      </svg>
    </div>
  );
};
