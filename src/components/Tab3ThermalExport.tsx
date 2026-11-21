import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, Download } from 'lucide-react';
import { MotorParams, SVPWM_LINEAR_LIMIT } from '../core/motorPhysics';
import { MAX_EXPORT_SAMPLES, synthesizeSixMosWaveform } from '../core/thermalExporter';
import { MultiChannelWaveChart } from './Charts';
import { SmoothNumberInput } from './SmoothNumberInput';

interface Tab3Props {
  params: MotorParams;
  onChangeParams: (next: MotorParams) => void;
  exportPoint: { vMeasV: number; iBusA: number; nRpm: number };
  onChangeExportPoint: (pt: { vMeasV: number; iBusA: number; nRpm: number }) => void;
}

export const Tab3ThermalExport: React.FC<Tab3Props> = ({
  params,
  onChangeParams,
  exportPoint,
  onChangeExportPoint,
}) => {
  const [tAmbC, setTAmbC] = useState(25);
  const [fsHz, setFsHz] = useState(20000);
  const [durationS, setDurationS] = useState(0.5);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const synth = useMemo(
    () =>
      synthesizeSixMosWaveform(
        {
          vMeasV: exportPoint.vMeasV,
          iBusA: exportPoint.iBusA,
          nRpm: exportPoint.nRpm,
          tAmbC,
          fsHz,
          durationS,
        },
        params
      ),
    [exportPoint, tAmbC, fsHz, durationS, params]
  );

  const previewSamples = useMemo(() => {
    const { samples, summary } = synth;
    if (samples.length === 0) return [];
    if (summary.isStall || summary.feHz < 1) {
      return samples.slice(0, Math.min(samples.length, 400));
    }
    const threeCyclesS = Math.min(durationS, Math.max(0.015, 3 / summary.feHz));
    const maxCount = Math.min(samples.length, Math.max(60, Math.round(threeCyclesS * fsHz)));
    return samples.slice(0, maxCount);
  }, [synth, durationS, fsHz]);

  const handleDownloadCsv = () => {
    if (synth.error || !synth.csvContent) return;
    const blob = new Blob([synth.csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `foc_6mos_${exportPoint.nRpm.toFixed(0)}rpm_${synth.summary.iqPeakA.toFixed(2)}A_${fsHz}Hz.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyValue = (key: string, val: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1400);
  };

  const { summary, pointResult } = synth;
  const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '无效');

  const summaryRows: Array<{ key: string; label: string; value: string; hint?: string; highlight?: boolean }> = [
    { key: 'ia', label: 'Phase Ia (A)', value: 'Ia', hint: '导入 CSV 后下拉选择 Ia 列' },
    { key: 'ib', label: 'Phase Ib (A)', value: 'Ib', hint: '导入 CSV 后下拉选择 Ib 列' },
    { key: 'ic', label: 'Phase Ic (or -Ia-Ib)', value: 'Auto: Ic = -(Ia + Ib)', hint: '亦可直接映射 Ic 列' },
    { key: 'vbus', label: 'Vbus (V)', value: fmt(summary.vBusCapV, 3), hint: '或 Vbus Ch 选 Vbus 列' },
    { key: 'tamb', label: 'T_amb (°C)', value: summary.tAmbC.toFixed(1) },
    { key: 'mod', label: 'Modulation', value: 'SVPWM / DPWM1', hint: summary.modulationNote },
    {
      key: 'm_motor',
      label: 'Mod Depth m [Vph/(Vbus/2), 上限 1.1547] (电机端)',
      value: fmt(summary.mMotor, 4),
      hint: `指令端 m_cmd = ${fmt(summary.mCmd, 4)}`,
      highlight: true,
    },
    {
      key: 'm_norm_motor',
      label: 'Mod Depth m_norm [√3·Vph/Vbus, 上限 1.0000] (电机端)',
      value: fmt(summary.mNormMotor, 4),
      hint: `指令端 m_norm_cmd = ${fmt(summary.mNormCmd, 4)}`,
      highlight: true,
    },
    {
      key: 'phi',
      label: 'PF Angle φ (°)',
      value: fmt(summary.phiDeg, 2),
      hint: `含管压降 φ_cmd = ${fmt(summary.phiCmdDeg, 2)}°`,
    },
    {
      key: 'fe',
      label: '电频率 f_e (Hz)',
      value: summary.feHz.toFixed(2),
      hint: summary.isStall
        ? '堵转状态: 导出单相最大直流偏相 (Ia=Iq, Ib=Ic=-Iq/2)'
        : `Iq 峰值 = ${fmt(summary.iqPeakA, 3)} A (RMS ${fmt(summary.iphRmsA, 3)} A)`,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Steady-state point & Export Configuration */}
      <div className="space-y-4 rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] p-5 dark:border-[#262C38] dark:bg-[#191D26]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-[#E6EAF2]">6-MOS 瞬态结温软件波形合成与参数导出区</h3>
            <p className="text-xs text-slate-500 dark:text-[#7E8899]">
              输出 UTF-8 逗号分隔 CSV（Time 单位 s，列：Time, Ia, Ib, Ic, Vbus），单次上限 {MAX_EXPORT_SAMPLES.toLocaleString()} 点
            </p>
          </div>
          <button
            type="button"
            disabled={Boolean(synth.error)}
            onClick={handleDownloadCsv}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
              synth.error
                ? 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-[#242A36] dark:text-[#6E788A]'
                : 'bg-sky-600 text-white hover:bg-sky-500 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400'
            }`}
          >
            <Download className="h-4 w-4" />
            {synth.error ? '工况无解 · 禁止导出' : `下载 6-MOS 波形 CSV (${synth.samples.length} 行)`}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <label className="block text-xs">
            <span className="mb-1 block text-slate-500 dark:text-[#8E98A8]">实测 V_meas (V)</span>
            <SmoothNumberInput
              step={0.1}
              value={exportPoint.vMeasV}
              onChange={(v) => onChangeExportPoint({ ...exportPoint, vMeasV: v })}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2]"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-slate-500 dark:text-[#8E98A8]">母线 I_bus (A)</span>
            <SmoothNumberInput
              step={0.01}
              value={exportPoint.iBusA}
              onChange={(v) => onChangeExportPoint({ ...exportPoint, iBusA: v })}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2]"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-slate-500 dark:text-[#8E98A8]">转速 n (RPM, 0=堵转)</span>
            <SmoothNumberInput
              step={50}
              value={exportPoint.nRpm}
              onChange={(v) => onChangeExportPoint({ ...exportPoint, nRpm: v })}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2]"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-slate-500 dark:text-[#8E98A8]">环境温度 T_amb (°C)</span>
            <SmoothNumberInput
              step={1}
              value={tAmbC}
              onChange={setTAmbC}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2]"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-slate-500 dark:text-[#8E98A8]">采样率 f_s (Hz)</span>
            <SmoothNumberInput
              step={1000}
              min={1000}
              max={200000}
              value={fsHz}
              onChange={(v) => setFsHz(Math.max(1000, Math.round(v)))}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2]"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-slate-500 dark:text-[#8E98A8]">导出时长 (s)</span>
            <SmoothNumberInput
              step={0.05}
              min={0.05}
              max={5}
              value={durationS}
              onChange={(v) => setDurationS(Math.max(0.05, Math.min(5, v)))}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2]"
            />
          </label>

          <div className="grid grid-cols-2 gap-1.5">
            <label className="block text-xs">
              <span className="mb-1 block text-slate-500 dark:text-[#8E98A8]">I_idle (A)</span>
              <SmoothNumberInput
                step={0.005}
                min={0}
                precision={3}
                value={params.iIdleA}
                onChange={(v) => onChangeParams({ ...params, iIdleA: Math.max(0, v) })}
                className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1.5 font-mono text-xs tabular-nums text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2]"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-slate-500 dark:text-[#8E98A8]">η_inv</span>
              <SmoothNumberInput
                step={0.01}
                min={0.3}
                max={0.999}
                precision={3}
                value={params.etaInv}
                onChange={(v) => onChangeParams({ ...params, etaInv: Math.min(0.999, Math.max(0.3, v)) })}
                className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1.5 font-mono text-xs tabular-nums text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2]"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E4E9F1] pt-3 text-xs dark:border-[#242A36]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500 dark:text-[#8E98A8]">采样率快捷:</span>
            {[10000, 20000, 50000].map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => setFsHz(rate)}
                className={`rounded border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                  fsHz === rate
                    ? 'border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-500/50 dark:bg-sky-500/15 dark:text-sky-300'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#8E98A8]'
                }`}
              >
                {rate / 1000} kHz
              </button>
            ))}
            <span className="mx-1 text-slate-300 dark:text-[#333C4D]">|</span>
            <button
              type="button"
              onClick={() => onChangeExportPoint({ vMeasV: 13.5, iBusA: 1.06, nRpm: 1000 })}
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:border-sky-500 dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#CBD5E1]"
            >
              1000 RPM 额定点
            </button>
            <button
              type="button"
              onClick={() => onChangeExportPoint({ vMeasV: 13.5, iBusA: 0.65, nRpm: 0 })}
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-amber-700 hover:border-amber-500 dark:border-[#2C3444] dark:bg-[#12161E] dark:text-amber-300"
            >
              n=0 堵转直流偏相
            </button>
          </div>

          <div className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-[#8E98A8]">
            Iq={fmt(summary.iqPeakA, 3)} A · T_est={fmt(pointResult.tEstNm, 4)} N·m
            {(pointResult.alerts.cmdSat || pointResult.alerts.motorSat) && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                调制比超 {SVPWM_LINEAR_LIMIT.toFixed(4)}
              </span>
            )}
          </div>
        </div>

        {synth.error && (
          <div className="rounded-md border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            ✖ {synth.error}
          </div>
        )}
        {synth.clampedByLimit && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            ▲ 请求采样点超出 {MAX_EXPORT_SAMPLES.toLocaleString()} 点安全上限，已自动截断至 {MAX_EXPORT_SAMPLES.toLocaleString()} 行以防浏览器卡顿。
          </div>
        )}
      </div>

      {/* Main Split: Waveform Preview + Copyable 6-MOS Summary Card */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-7">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold tracking-wide text-slate-700 dark:text-[#D8DEE9]">
              导出波形预览 ({summary.isStall ? '堵转单相直流偏相 Ia=Iq, Ib=Ic=-Iq/2' : `三相正弦 Ia, Ib, Ic @ f_e = ${summary.feHz.toFixed(2)} Hz`})
            </h4>
            <span className="font-mono text-[11px] text-slate-500 dark:text-[#7E8899]">
              预览前 {previewSamples.length} 点 / 全长 {synth.samples.length} 点
            </span>
          </div>

          {previewSamples.length > 0 ? (
            <>
              <MultiChannelWaveChart
                times={previewSamples.map((s) => s.timeS)}
                yLabel="相电流 (A)"
                height={300}
                series={[
                  { label: 'Ia (A)', color: '#0284C7', values: previewSamples.map((s) => s.iaA) },
                  { label: 'Ib (A)', color: '#D97706', values: previewSamples.map((s) => s.ibA) },
                  { label: 'Ic (A)', color: '#059669', values: previewSamples.map((s) => s.icA) },
                ]}
              />
              <div className="rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] p-4 dark:border-[#262C38] dark:bg-[#191D26]">
                <div className="mb-1.5 text-[11px] text-slate-500 dark:text-[#8E98A8]">CSV 前 4 行格式预览 (UTF-8, Time 单位: s)</div>
                <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed tabular-nums text-slate-700 dark:text-[#CBD5E1]">
                  {synth.csvContent.split('\n').slice(0, 5).join('\n')}
                </pre>
              </div>
            </>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] px-6 text-center text-sm text-rose-600 dark:border-[#262C38] dark:bg-[#191D26] dark:text-rose-300">
              当前输入工况无物理实数解，请调整 V_meas / I_bus / n 后导出。
            </div>
          )}
        </div>

        {/* Strictly Aligned 6-MOS Simulator Parameter Summary Card */}
        <div className="rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] p-5 xl:col-span-5 dark:border-[#262C38] dark:bg-[#191D26]">
          <div className="mb-3 border-b border-[#E4E9F1] pb-3 dark:border-[#242A36]">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-[#E6EAF2]">
              对齐 6-MOS 结温软件参数摘要卡
            </h4>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-[#8E98A8]">
              已同时列出两种 Mod Depth 定义（上限 1.1547 与归一化 1.0000），对照抄入即可
            </p>
          </div>

          <div className="divide-y divide-[#E4E9F1] dark:divide-[#242A36]">
            {summaryRows.map((row) => (
              <div
                key={row.key}
                className={`flex items-center justify-between gap-3 py-2.5 ${
                  row.highlight ? 'rounded-md bg-sky-50/80 px-2.5 -mx-2.5 dark:bg-sky-500/10' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-700 dark:text-[#D8DEE9]">{row.label}</div>
                  {row.hint && <div className="font-mono text-[10px] text-slate-500 dark:text-[#7E8899]">{row.hint}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`font-mono text-xs font-semibold tabular-nums ${
                      row.highlight ? 'text-sky-700 dark:text-sky-300' : 'text-slate-800 dark:text-[#E6EAF2]'
                    }`}
                  >
                    {row.value}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyValue(row.key, row.value)}
                    className="rounded border border-slate-300 bg-white p-1 text-slate-500 transition-colors hover:border-sky-500 hover:text-sky-700 dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#8E98A8] dark:hover:border-sky-400/60 dark:hover:text-sky-300"
                    title="复制数值"
                  >
                    {copiedKey === row.key ? <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
