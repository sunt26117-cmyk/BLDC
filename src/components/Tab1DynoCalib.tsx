import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Download, Lock, Play, SlidersHorizontal, Upload } from 'lucide-react';
import {
  CalibrationReport,
  DynoColumnMapping,
  EfficiencyFormat,
  KeSourceMode,
  RsFitMode,
  TabularDataset,
  TorqueUnit,
  autoMapColumns,
  normalizeDynoDataset,
  parseSpreadsheetFile,
} from '../core/dynoCalibrator';
import { MotorParams } from '../core/motorPhysics';
import { DynoFitComparisonChart, EfficiencyHeatmap2D } from './Charts';
import { SmoothNumberInput } from './SmoothNumberInput';

interface Tab1Props {
  params: MotorParams;
  openLoopRaw: TabularDataset;
  closedLoopRaw: TabularDataset;
  openLoopMap: DynoColumnMapping;
  closedLoopMap: DynoColumnMapping;
  torqueUnit: TorqueUnit;
  etaFormat: EfficiencyFormat;
  keSource: KeSourceMode;
  manualN0Rpm: number;
  manualVTestV: number;
  manualKv: number;
  rsFitMode: RsFitMode;
  report: CalibrationReport;
  warnings: string[];
  onUpdateOpenLoop: (ds: TabularDataset, map: DynoColumnMapping) => void;
  onUpdateClosedLoop: (ds: TabularDataset, map: DynoColumnMapping) => void;
  onChangeOpenMap: (map: DynoColumnMapping) => void;
  onChangeClosedMap: (map: DynoColumnMapping) => void;
  onChangeTorqueUnit: (u: TorqueUnit) => void;
  onChangeEtaFormat: (f: EfficiencyFormat) => void;
  onChangeKeSource: (s: KeSourceMode) => void;
  onChangeManualKe: (n0: number, vtest: number, kv: number) => void;
  onChangeRsFitMode: (m: RsFitMode) => void;
  onRunCalibration: () => void;
}

const REQUIRED_FIELDS: Array<{ key: keyof DynoColumnMapping; label: string; required?: boolean }> = [
  { key: 'n_rpm', label: '转速 n_rpm', required: true },
  { key: 'T_Nm', label: '扭矩 T' },
  { key: 'V_bus', label: '母线 V_bus', required: true },
  { key: 'I_bus', label: '电流 I_bus', required: true },
  { key: 'P_in', label: 'P_in (缺省补算)' },
  { key: 'P_out', label: 'P_out (缺省补算)' },
  { key: 'eta', label: '效率 eta (缺省补算)' },
];

function escapeCsvCell(val: unknown): string {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export const Tab1DynoCalib: React.FC<Tab1Props> = ({
  openLoopRaw,
  closedLoopRaw,
  openLoopMap,
  closedLoopMap,
  torqueUnit,
  etaFormat,
  keSource,
  manualN0Rpm,
  manualVTestV,
  manualKv,
  rsFitMode,
  report,
  warnings,
  onUpdateOpenLoop,
  onUpdateClosedLoop,
  onChangeOpenMap,
  onChangeClosedMap,
  onChangeTorqueUnit,
  onChangeEtaFormat,
  onChangeKeSource,
  onChangeManualKe,
  onChangeRsFitMode,
  onRunCalibration,
}) => {
  const [showMappingDrawer, setShowMappingDrawer] = useState(false);

  const closedNormCount = useMemo(
    () => normalizeDynoDataset(closedLoopRaw, closedLoopMap, torqueUnit, etaFormat, { requireTorque: true }).points.length,
    [closedLoopRaw, closedLoopMap, torqueUnit, etaFormat]
  );

  const openNormCount = useMemo(
    () => normalizeDynoDataset(openLoopRaw, openLoopMap, 'Nm', '0-1', { requireTorque: false }).points.length,
    [openLoopRaw, openLoopMap]
  );

  const handleFileUpload = async (file: File | undefined, kind: 'open' | 'closed') => {
    if (!file) return;
    const ds = await parseSpreadsheetFile(file);
    const mapped = autoMapColumns(ds.headers);
    if (kind === 'open') {
      onUpdateOpenLoop(ds, mapped);
    } else {
      onUpdateClosedLoop(ds, mapped);
    }
    setShowMappingDrawer(true);
  };

  const downloadCsvFromDataset = (ds: TabularDataset) => {
    if (ds.headers.length === 0) return;
    const lines = [ds.headers.map(escapeCsvCell).join(',')];
    for (const r of ds.rows) {
      lines.push(ds.headers.map((h) => escapeCsvCell(r[h])).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ds.fileName.endsWith('.csv') ? ds.fileName : `${ds.fileName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const { metrics } = report;

  return (
    <div className="space-y-5">
      {/* Compact Data Source & Calibration Control Strip */}
      <div className="rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] p-4 dark:border-[#262C38] dark:bg-[#191D26]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <div>
              <span className="text-slate-500 dark:text-[#7E8899]">开环: </span>
              <span className="font-mono font-medium text-slate-700 dark:text-[#D8DEE9]">{openLoopRaw.fileName}</span>
              <span className="ml-1 font-mono tabular-nums text-sky-700 dark:text-sky-300">({openNormCount}点)</span>
            </div>
            <span className="text-slate-300 dark:text-[#333C4D]">·</span>
            <div>
              <span className="text-slate-500 dark:text-[#7E8899]">闭环: </span>
              <span className="font-mono font-medium text-slate-700 dark:text-[#D8DEE9]">{closedLoopRaw.fileName}</span>
              <span className="ml-1 font-mono tabular-nums text-sky-700 dark:text-sky-300">({closedNormCount}点)</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-sky-500 hover:text-sky-700 whitespace-nowrap dark:border-[#2E3646] dark:bg-[#131720] dark:text-[#CBD5E1] dark:hover:border-sky-400/60 dark:hover:text-sky-300">
              <Upload className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              开环表
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.txt"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files?.[0], 'open')}
              />
            </label>

            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-sky-500 hover:text-sky-700 whitespace-nowrap dark:border-[#2E3646] dark:bg-[#131720] dark:text-[#CBD5E1] dark:hover:border-sky-400/60 dark:hover:text-sky-300">
              <Upload className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              闭环表
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.txt"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files?.[0], 'closed')}
              />
            </label>

            <button
              type="button"
              onClick={() => setShowMappingDrawer((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900 whitespace-nowrap dark:border-[#2E3646] dark:bg-[#131720] dark:text-[#9BA4B5] dark:hover:border-[#3D475C] dark:hover:text-[#E6EAF2]"
            >
              {showMappingDrawer ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              列映射与 Ke&apos; 配置
            </button>

            <button
              type="button"
              onClick={onRunCalibration}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-500 whitespace-nowrap dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
            >
              <Play className="h-3.5 w-3.5" />
              重新分步标定
            </button>
          </div>
        </div>

        {/* Always-accessible compact unit & anti-overfit strip */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#E4E9F1] pt-3 text-xs dark:border-[#242A36]">
          <label className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-[#8E98A8]">扭矩单位</span>
            <select
              value={torqueUnit}
              onChange={(e) => onChangeTorqueUnit(e.target.value as TorqueUnit)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2] dark:focus:border-sky-400"
            >
              <option value="Nm">N·m (标准)</option>
              <option value="mNm">mN·m (×1e-3)</option>
              <option value="kgf_cm">kgf·cm (×0.09807)</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-[#8E98A8]">效率格式</span>
            <select
              value={etaFormat}
              onChange={(e) => onChangeEtaFormat(e.target.value as EfficiencyFormat)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2] dark:focus:border-sky-400"
            >
              <option value="0-1">小数 (0–1)</option>
              <option value="percent">百分比 (0–100%)</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-[#8E98A8]">防过拟合 Rs_eff</span>
            <select
              value={rsFitMode}
              onChange={(e) => onChangeRsFitMode(e.target.value as RsFitMode)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2] dark:focus:border-sky-400"
            >
              <option value="locked">严格锁定 R_LL/2 温修基准</option>
              <option value="bounded_15pct">在基准 ±15% 内微调</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => downloadCsvFromDataset(closedLoopRaw)}
            className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-sky-700 dark:text-[#8E98A8] dark:hover:text-sky-300"
            title="导出当前闭环测功表以便换算校验"
          >
            <Download className="h-3.5 w-3.5" />
            导出当前闭环表
          </button>
        </div>

        {/* Collapsible Column Mapping & Ke' Source Drawer */}
        {showMappingDrawer && (
          <div className="mt-4 grid grid-cols-1 gap-5 border-t border-[#E4E9F1] pt-4 xl:grid-cols-2 dark:border-[#242A36]">
            {/* 1A Open Loop */}
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-700 dark:text-[#D8DEE9]">1A. 开环空载列映射与 Ke&apos; 提取策略</div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {REQUIRED_FIELDS.slice(0, 4).map((f) => (
                  <label key={f.key} className="block text-[11px]">
                    <span className="mb-1 block text-slate-500 dark:text-[#8E98A8]">{f.label}</span>
                    <select
                      value={openLoopMap[f.key]}
                      onChange={(e) => onChangeOpenMap({ ...openLoopMap, [f.key]: e.target.value })}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2]"
                    >
                      <option value="">-- 未映射 --</option>
                      {openLoopRaw.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-slate-500 dark:text-[#8E98A8]">Ke&apos; 初值来源:</span>
                <select
                  value={keSource}
                  onChange={(e) => onChangeKeSource(e.target.value as KeSourceMode)}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2]"
                >
                  <option value="open_loop_auto">自动取开环最高空载点</option>
                  <option value="manual_n0_vtest">手动空载点 (n0, V_test)</option>
                  <option value="manual_kv">手动输入电机 KV</option>
                </select>

                {keSource === 'manual_n0_vtest' && (
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-slate-500 dark:text-[#8E98A8]">n0:</span>
                    <SmoothNumberInput
                      value={manualN0Rpm}
                      min={10}
                      step={50}
                      onChange={(v) => onChangeManualKe(v, manualVTestV, manualKv)}
                      className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-right tabular-nums text-slate-800 dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2]"
                    />
                    <span className="text-slate-500 dark:text-[#8E98A8]">V_test:</span>
                    <SmoothNumberInput
                      value={manualVTestV}
                      min={0.5}
                      step={0.1}
                      onChange={(v) => onChangeManualKe(manualN0Rpm, v, manualKv)}
                      className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-right tabular-nums text-slate-800 dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2]"
                    />
                  </div>
                )}

                {keSource === 'manual_kv' && (
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-slate-500 dark:text-[#8E98A8]">KV (RPM/V):</span>
                    <SmoothNumberInput
                      value={manualKv}
                      min={1}
                      step={1}
                      onChange={(v) => onChangeManualKe(manualN0Rpm, manualVTestV, v)}
                      className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-right tabular-nums text-slate-800 dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2]"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 1B Closed Loop */}
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-700 dark:text-[#D8DEE9]">1B. 闭环负载列映射（缺失 Pin / Pout / eta 时自动补算）</div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {REQUIRED_FIELDS.map((f) => (
                  <label key={f.key} className="block text-[11px]">
                    <span className="mb-1 block text-slate-500 dark:text-[#8E98A8]">{f.label}</span>
                    <select
                      value={closedLoopMap[f.key]}
                      onChange={(e) => onChangeClosedMap({ ...closedLoopMap, [f.key]: e.target.value })}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2]"
                    >
                      <option value="">-- 自动补算/未映射 --</option>
                      {closedLoopRaw.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Data Quality / Unit Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-400/60 bg-amber-50 px-4 py-3 text-xs text-amber-900 space-y-1 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {warnings.map((w, i) => (
            <div key={i}>▲ {w}</div>
          ))}
        </div>
      )}

      {/* Unified 6-Metric KPI Strip (Single surface, hairline divided — no box overload) */}
      <div className="grid grid-cols-2 divide-y divide-[#E4E9F1] rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] md:grid-cols-3 md:divide-x xl:grid-cols-6 xl:divide-y-0 dark:divide-[#242A36] dark:border-[#262C38] dark:bg-[#191D26]">
        <div className="p-4">
          <div className="text-[11px] text-slate-500 dark:text-[#8E98A8]">标定 Ke&apos;</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-800 dark:text-[#E6EAF2]">
            {report.kePrime.toFixed(5)}
            <span className="ml-1 text-[10px] font-normal text-slate-400 dark:text-[#6E788A]">Vp/(rad/s)</span>
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-[#8E98A8]">
            {report.rsFitMode === 'locked' ? (
              <Lock className="h-3 w-3 text-sky-600 dark:text-sky-400" />
            ) : (
              <SlidersHorizontal className="h-3 w-3 text-amber-600 dark:text-amber-400" />
            )}
            等效相电阻 Rs_eff
          </div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-800 dark:text-[#E6EAF2]">
            {report.rsEffOhm.toFixed(4)}
            <span className="ml-1 text-[10px] font-normal text-slate-400 dark:text-[#6E788A]">Ω</span>
          </div>
          <div className="font-mono text-[10px] tabular-nums text-slate-400 dark:text-[#6E788A]">
            基准 {report.rsAnchorOhm.toFixed(4)} Ω
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] text-slate-500 dark:text-[#8E98A8]">磁饱和系数 β</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-sky-700 dark:text-sky-300">
            {report.betaSat.toFixed(5)}
            <span className="ml-1 text-[10px] font-normal text-slate-400 dark:text-[#6E788A]">1/A²</span>
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] text-slate-500 dark:text-[#8E98A8]">扭矩回代 MAE / RMSE</div>
          <div className="mt-1 font-mono text-base font-semibold tabular-nums text-slate-800 dark:text-[#E6EAF2]">
            {metrics.maeTorqueNm.toFixed(4)} / {metrics.rmseTorqueNm.toFixed(4)}
            <span className="ml-1 text-[10px] font-normal text-slate-400 dark:text-[#6E788A]">N·m</span>
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] text-slate-500 dark:text-[#8E98A8]">扭矩回代 MAPE</div>
          <div
            className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
              metrics.mapeTorquePct <= 3.5
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {metrics.mapeTorquePct.toFixed(2)}
            <span className="ml-1 text-xs font-normal text-slate-400 dark:text-[#6E788A]">%</span>
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] text-slate-500 dark:text-[#8E98A8]">效率回代 MAE / MAPE</div>
          <div
            className={`mt-1 font-mono text-base font-semibold tabular-nums ${
              metrics.mapeEtaPct <= 3.5
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {metrics.maeEtaPct.toFixed(2)}pp / {metrics.mapeEtaPct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Measured vs Predicted & 3-Way Loss Chart */}
      <DynoFitComparisonChart points={report.evaluatedPoints} />

      {/* Side-by-Side 2D Efficiency Maps */}
      <div>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-[#E6EAF2]">二维效率 Map η(n, T) 实测与模型重构对比</h3>
          <span className="text-xs text-slate-500 dark:text-[#7E8899]">已基于凸包插值，绝不盲目外推边界外区域</span>
        </div>
        <EfficiencyHeatmap2D grid={report.grid2D} points={report.evaluatedPoints} />
      </div>

      {/* Quiet Stepwise Fit Audit Log at bottom */}
      <div className="rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] px-4 py-3 text-xs text-slate-600 dark:border-[#262C38] dark:bg-[#191D26] dark:text-[#9BA4B5]">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-[11px]">
          {report.fitNotes.map((note, idx) => (
            <span key={idx}>{note}</span>
          ))}
        </div>
      </div>
    </div>
  );
};
