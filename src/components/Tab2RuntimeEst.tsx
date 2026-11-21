import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Upload } from 'lucide-react';
import {
  MotorParams,
  SVPWM_LINEAR_LIMIT,
  forwardVerifyPoint,
  processRuntimeLog,
  solveSinglePoint,
} from '../core/motorPhysics';
import { RawRuntimeLogEntry } from '../core/demoData';
import { parseSpreadsheetFile } from '../core/dynoCalibrator';
import { MultiChannelWaveChart } from './Charts';
import { SmoothNumberInput } from './SmoothNumberInput';

interface Tab2Props {
  params: MotorParams;
  logRows: RawRuntimeLogEntry[];
  logFileName: string;
  onUpdateLog: (rows: RawRuntimeLogEntry[], fileName: string) => void;
  onSendPointToExport: (pt: { vMeasV: number; iBusA: number; nRpm: number }) => void;
}

export const Tab2RuntimeEst: React.FC<Tab2Props> = ({
  params,
  logRows,
  logFileName,
  onUpdateLog,
  onSendPointToExport,
}) => {
  const [subMode, setSubMode] = useState<'single' | 'batch'>('single');

  const [vMeas, setVMeas] = useState(13.5);
  const [iBus, setIBus] = useState(1.06);
  const [nRpm, setNRpm] = useState(1000);

  const [fwdIq, setFwdIq] = useState(1.44);
  const [fwdN, setFwdN] = useState(1000);
  const [fwdV, setFwdV] = useState(13.5);

  const [filterMs, setFilterMs] = useState(10);
  const [batchChartView, setBatchChartView] = useState<'currents' | 'mod' | 'voltages'>('currents');

  const singleRes = useMemo(() => solveSinglePoint(vMeas, iBus, nRpm, params), [vMeas, iBus, nRpm, params]);
  const fwdRes = useMemo(() => forwardVerifyPoint(fwdIq, fwdN, fwdV, params), [fwdIq, fwdN, fwdV, params]);

  const logProcessed = useMemo(
    () => processRuntimeLog(logRows, filterMs, params),
    [logRows, filterMs, params]
  );

  const batchAlertsSummary = useMemo(() => {
    let lowSpeed = 0;
    let cmdSat = 0;
    let motorSat = 0;
    let lowFreq = 0;
    let zeroDrift = 0;
    let regenLimit = 0;
    let invalidBus = 0;
    for (const r of logProcessed) {
      if (r.result.alerts.lowSpeed) lowSpeed++;
      if (r.result.alerts.cmdSat) cmdSat++;
      if (r.result.alerts.motorSat) motorSat++;
      if (r.result.alerts.lowFreqThermal) lowFreq++;
      if (r.result.alerts.zeroDrift) zeroDrift++;
      if (r.result.alerts.regenLimit) regenLimit++;
      if (r.result.alerts.invalidBus) invalidBus++;
    }
    return { lowSpeed, cmdSat, motorSat, lowFreq, zeroDrift, regenLimit, invalidBus };
  }, [logProcessed]);

  const handleLogUpload = async (file: File | undefined) => {
    if (!file) return;
    const ds = await parseSpreadsheetFile(file);
    const find = (re: RegExp) => ds.headers.find((h) => re.test(h.toLowerCase())) ?? '';
    const cTime = find(/time|^t$|时间戳|时间/) || ds.headers[0];
    const cV = find(/v_?bus|v_?meas|voltage|电压/) || ds.headers[1];
    const cI = find(/i_?bus|current|电流/) || ds.headers[2];
    const cN = find(/n_?rpm|rpm|speed|转速/) || ds.headers[3];

    const toNum = (raw: unknown): number => {
      if (raw === null || raw === undefined || typeof raw === 'boolean') return Number.NaN;
      if (typeof raw === 'string' && raw.trim() === '') return Number.NaN;
      const v = Number(raw);
      return Number.isFinite(v) ? v : Number.NaN;
    };
    const parsed: RawRuntimeLogEntry[] = [];
    ds.rows.forEach((row, idx) => {
      const t = toNum(row[cTime]);
      const v = toNum(row[cV]);
      const ib = toNum(row[cI]);
      const n = toNum(row[cN]);
      if (Number.isFinite(v) && Number.isFinite(ib) && Number.isFinite(n)) {
        parsed.push({
          timeS: Number.isFinite(t) ? t : idx * 0.001,
          vMeasV: v,
          iBusA: ib,
          nRpm: n,
        });
      }
    });
    if (parsed.length > 0) {
      onUpdateLog(parsed, file.name);
    }
  };

  const renderAlertsBar = (res: typeof singleRes) => {
    const hasAnyWarn =
      res.alerts.lowSpeed ||
      res.alerts.cmdSat ||
      res.alerts.motorSat ||
      res.alerts.lowFreqThermal ||
      res.alerts.regenLimit ||
      res.alerts.invalidBus;

    return (
      <div className="space-y-3 rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] p-4 dark:border-[#262C38] dark:bg-[#191D26]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-[#D8DEE9]">工程安全边界与工况状态告警</span>
          <span className="font-mono text-[11px] text-slate-500 dark:text-[#8E98A8]">
            当前运行态:{' '}
            <span className="font-semibold text-sky-700 dark:text-sky-300">
              {res.mode === 'invalid_bus'
                ? '母线压降异常 (Vbus_cap ≤ 0.1V)'
                : res.mode === 'zero_drift'
                ? '空载零漂区 (No-Load Zero-Drift)'
                : res.mode === 'motoring'
                ? '电动驱动 (Motoring)'
                : res.mode === 'regen'
                ? '发电回馈 (Regen)'
                : '超出发电极限 (Δ < 0)'}
            </span>
          </span>
        </div>

        {(res.alerts.invalidBus || res.alerts.regenLimit) && (
          <div className="rounded-md border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {res.alerts.invalidBus
              ? `✖ 母线电压无效：V_meas (${res.vMeasV.toFixed(2)} V) − I_bus·R_line (${(res.iBusA * params.rLineOhm).toFixed(2)} V) ≤ 0.1 V，已阻止输出失真数值。`
              : `✖ 超出最大发电回馈功率极限 Eq²/(4·Rs) (Δ = ${res.delta.toFixed(3)} < 0)，反推相电流无实数解。`}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          <div
            className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-xs ${
              res.alerts.zeroDrift
                ? 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200'
                : 'border-[#E4E9F1] bg-white text-slate-500 dark:border-[#242A36] dark:bg-[#131720] dark:text-[#6E788A]'
            }`}
          >
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <div className="font-medium">微电流零漂保护 (|I_net| &lt; {params.iDeadbandA.toFixed(3)} A)</div>
              <div className="mt-0.5 font-mono text-[11px] tabular-nums">
                {res.alerts.zeroDrift
                  ? `空载零漂区 (I_net=${res.iNetA.toFixed(3)}A)，按 Iq=0 处理防误判发电`
                  : `正常区间 (I_net=${res.iNetA.toFixed(3)} A)`}
              </div>
            </div>
          </div>

          <div
            className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-xs ${
              res.alerts.lowSpeed
                ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
                : 'border-[#E4E9F1] bg-white text-slate-500 dark:border-[#242A36] dark:bg-[#131720] dark:text-[#6E788A]'
            }`}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <div className="font-medium">低速信噪比告警 (|n| &lt; 0.08·n0)</div>
              <div className="mt-0.5 font-mono text-[11px] tabular-nums">
                {res.alerts.lowSpeed
                  ? `|n|=${Math.abs(res.nRpm).toFixed(0)} < ${(0.08 * params.n0Rpm).toFixed(0)} RPM，反推误差放大`
                  : `正常 (|n|=${Math.abs(res.nRpm).toFixed(0)} ≥ ${(0.08 * params.n0Rpm).toFixed(0)} RPM)`}
              </div>
            </div>
          </div>

          <div
            className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-xs ${
              res.alerts.motorSat || res.alerts.cmdSat
                ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
                : 'border-[#E4E9F1] bg-white text-slate-500 dark:border-[#242A36] dark:bg-[#131720] dark:text-[#6E788A]'
            }`}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <div className="font-medium">双调制比电压饱和 (&gt; {SVPWM_LINEAR_LIMIT.toFixed(4)})</div>
              <div className="mt-0.5 font-mono text-[11px] tabular-nums">
                m_motor={Number.isFinite(res.mMotor) ? res.mMotor.toFixed(3) : '--'}
                {res.alerts.motorSat ? '[饱和]' : ''} · m_cmd=
                {Number.isFinite(res.mCmd) ? res.mCmd.toFixed(3) : '--'}
                {res.alerts.cmdSat ? '[饱和]' : ''}
              </div>
            </div>
          </div>

          <div
            className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-xs ${
              res.alerts.lowFreqThermal
                ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200'
                : 'border-[#E4E9F1] bg-white text-slate-500 dark:border-[#242A36] dark:bg-[#131720] dark:text-[#6E788A]'
            }`}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <div className="font-medium">堵转 / 极低频发热 (f_e &lt; 3 Hz)</div>
              <div className="mt-0.5 font-mono text-[11px] tabular-nums">
                {res.alerts.lowFreqThermal
                  ? `f_e=${res.feHz.toFixed(2)} Hz，单相管持续受流风险高`
                  : `正常 (f_e=${res.feHz.toFixed(1)} Hz)`}
              </div>
            </div>
          </div>
        </div>

        {!hasAnyWarn && !res.alerts.zeroDrift && (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>所有运行态边界正常，处于线性 SVPWM 与有效信噪比区间内。</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Sub-mode switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] px-4 py-2.5 dark:border-[#262C38] dark:bg-[#191D26]">
        <div className="flex items-center gap-1 rounded-md border border-[#DCE2EC] bg-[#F1F4F8] p-1 dark:border-[#282F3D] dark:bg-[#12151C]">
          <button
            type="button"
            onClick={() => setSubMode('single')}
            className={`rounded px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              subMode === 'single'
                ? 'bg-white text-sky-700 shadow-xs dark:bg-[#232A37] dark:text-sky-300'
                : 'text-slate-500 hover:text-slate-800 dark:text-[#8E98A8] dark:hover:text-[#E6EAF2]'
            }`}
          >
            单点实时推算与正向校验
          </button>
          <button
            type="button"
            onClick={() => setSubMode('batch')}
            className={`rounded px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              subMode === 'batch'
                ? 'bg-white text-sky-700 shadow-xs dark:bg-[#232A37] dark:text-sky-300'
                : 'text-slate-500 hover:text-slate-800 dark:text-[#8E98A8] dark:hover:text-[#E6EAF2]'
            }`}
          >
            批量运行日志 CSV (滑动滤波)
          </button>
        </div>

        {subMode === 'single' && (
          <button
            type="button"
            onClick={() => onSendPointToExport({ vMeasV: vMeas, iBusA: iBus, nRpm })}
            className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100 whitespace-nowrap dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
          >
            送入 Tab 3 导出波形
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {subMode === 'single' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {/* Reverse Estimation Card */}
            <div className="space-y-4 rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] p-5 dark:border-[#262C38] dark:bg-[#191D26]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-[#E6EAF2]">逆向推算：实测 (V_meas, I_bus, n) → Iq & 双 Vq</h3>
                  <p className="text-xs text-slate-500 dark:text-[#7E8899]">支持正/反转、发电制动、零漂死区与堵转</p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => { setVMeas(13.5); setIBus(1.06); setNRpm(1000); }}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-600 transition-colors hover:border-sky-500 hover:text-sky-700 dark:border-[#2E3646] dark:bg-[#12161E] dark:text-[#B8C0CE] dark:hover:border-sky-400/60"
                  >
                    额定 0.1Nm
                  </button>
                  <button
                    type="button"
                    onClick={() => { setVMeas(13.52); setIBus(0.045); setNRpm(1000); }}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-600 transition-colors hover:border-sky-500 hover:text-sky-700 dark:border-[#2E3646] dark:bg-[#12161E] dark:text-[#B8C0CE] dark:hover:border-sky-400/60"
                  >
                    零漂 0.045A
                  </button>
                  <button
                    type="button"
                    onClick={() => { setVMeas(13.5); setIBus(1.95); setNRpm(1380); }}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-600 transition-colors hover:border-amber-500 hover:text-amber-700 dark:border-[#2E3646] dark:bg-[#12161E] dark:text-[#B8C0CE] dark:hover:border-amber-400/60"
                  >
                    高速饱和
                  </button>
                  <button
                    type="button"
                    onClick={() => { setVMeas(13.5); setIBus(0.65); setNRpm(0); }}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-600 transition-colors hover:border-rose-500 hover:text-rose-700 dark:border-[#2E3646] dark:bg-[#12161E] dark:text-[#B8C0CE] dark:hover:border-rose-400/60"
                  >
                    堵转态
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="block text-xs">
                  <span className="mb-1 block text-slate-500 dark:text-[#8E98A8]">实测母线 V_meas (V)</span>
                  <SmoothNumberInput
                    step={0.1}
                    value={vMeas}
                    onChange={setVMeas}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2] dark:focus:border-sky-400"
                  />
                </label>
                <label className="block text-xs">
                  <span className="mb-1 block text-slate-500 dark:text-[#8E98A8]">实测电流 I_bus (A)</span>
                  <SmoothNumberInput
                    step={0.01}
                    value={iBus}
                    onChange={setIBus}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2] dark:focus:border-sky-400"
                  />
                </label>
                <label className="block text-xs">
                  <span className="mb-1 block text-slate-500 dark:text-[#8E98A8]">转速 n (RPM)</span>
                  <SmoothNumberInput
                    step={25}
                    value={nRpm}
                    onChange={setNRpm}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2] dark:focus:border-sky-400"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3.5 border-t border-[#E4E9F1] pt-3.5 sm:grid-cols-3 font-mono tabular-nums dark:border-[#242A36]">
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">相电流峰值 Iq</div>
                  <div className="text-lg font-semibold text-sky-700 dark:text-sky-300">
                    {Number.isFinite(singleRes.iqA) ? singleRes.iqA.toFixed(4) : 'NaN'}{' '}
                    <span className="text-xs font-normal text-slate-400 dark:text-[#6E788A]">A</span>
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">相电流有效值 Iph_rms</div>
                  <div className="text-lg font-semibold text-slate-800 dark:text-[#E6EAF2]">
                    {Number.isFinite(singleRes.iphRmsA) ? singleRes.iphRmsA.toFixed(4) : 'NaN'}{' '}
                    <span className="text-xs font-normal text-slate-400 dark:text-[#6E788A]">A</span>
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">预估轴扭矩 T_est</div>
                  <div className="text-lg font-semibold text-slate-800 dark:text-[#E6EAF2]">
                    {Number.isFinite(singleRes.tEstNm) ? singleRes.tEstNm.toFixed(4) : 'NaN'}{' '}
                    <span className="text-xs font-normal text-slate-400 dark:text-[#6E788A]">N·m</span>
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">真实端电压 Vq_motor</div>
                  <div className="text-sm font-medium text-slate-700 dark:text-[#CBD5E1]">
                    {Number.isFinite(singleRes.vqMotorV) ? singleRes.vqMotorV.toFixed(3) : 'NaN'} V
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">固件指令 Vq_cmd</div>
                  <div className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    {Number.isFinite(singleRes.vqCmdV) ? singleRes.vqCmdV.toFixed(3) : 'NaN'} V
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">d轴 Vd / 功因角 φ</div>
                  <div className="text-sm font-medium text-slate-700 dark:text-[#CBD5E1]">
                    {Number.isFinite(singleRes.vdV) ? singleRes.vdV.toFixed(3) : '--'} V /{' '}
                    {Number.isFinite(singleRes.phiDeg) ? singleRes.phiDeg.toFixed(2) : '--'}°
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">调制比 m_motor / m_norm</div>
                  <div className="text-sm font-medium text-sky-700 dark:text-sky-300">
                    {Number.isFinite(singleRes.mMotor) ? singleRes.mMotor.toFixed(4) : '--'} /{' '}
                    {Number.isFinite(singleRes.mNormMotor) ? singleRes.mNormMotor.toFixed(4) : '--'}
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">指令调制比 m_cmd / m_norm</div>
                  <div className={`text-sm font-medium ${singleRes.alerts.cmdSat ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-[#CBD5E1]'}`}>
                    {Number.isFinite(singleRes.mCmd) ? singleRes.mCmd.toFixed(4) : '--'} /{' '}
                    {Number.isFinite(singleRes.mNormCmd) ? singleRes.mNormCmd.toFixed(4) : '--'}
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">电容端 Vbus_cap / η_est</div>
                  <div className="text-sm font-medium text-slate-700 dark:text-[#CBD5E1]">
                    {Number.isFinite(singleRes.vBusCapV) ? singleRes.vBusCapV.toFixed(3) : '--'} V /{' '}
                    {Number.isFinite(singleRes.etaEst) ? `${(singleRes.etaEst * 100).toFixed(1)}%` : '--'}
                  </div>
                </div>
              </div>
            </div>

            {/* Forward Verification Card */}
            <div className="space-y-4 rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] p-5 dark:border-[#262C38] dark:bg-[#191D26]">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-[#E6EAF2]">正向校验：给定 (Iq, n, V_meas) → 反算 I_bus</h3>
                <p className="text-xs text-slate-500 dark:text-[#7E8899]">与逆向二次求解闭环互验，核对母线压降与端电压一致性</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="block text-xs">
                  <span className="mb-1 block text-slate-500 dark:text-[#8E98A8]">给定相电流 Iq (A)</span>
                  <SmoothNumberInput
                    step={0.1}
                    value={fwdIq}
                    onChange={setFwdIq}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2] dark:focus:border-sky-400"
                  />
                </label>
                <label className="block text-xs">
                  <span className="mb-1 block text-slate-500 dark:text-[#8E98A8]">转速 n (RPM)</span>
                  <SmoothNumberInput
                    step={25}
                    value={fwdN}
                    onChange={setFwdN}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2] dark:focus:border-sky-400"
                  />
                </label>
                <label className="block text-xs">
                  <span className="mb-1 block text-slate-500 dark:text-[#8E98A8]">母线 V_meas (V)</span>
                  <SmoothNumberInput
                    step={0.1}
                    value={fwdV}
                    onChange={setFwdV}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-800 focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2] dark:focus:border-sky-400"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3.5 border-t border-[#E4E9F1] pt-3.5 sm:grid-cols-3 font-mono tabular-nums dark:border-[#242A36]">
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">正算母线电流 I_bus_est</div>
                  <div className="text-lg font-semibold text-sky-700 dark:text-sky-300">
                    {Number.isFinite(fwdRes.iBusEstA) ? fwdRes.iBusEstA.toFixed(4) : '母线塌陷'}{' '}
                    {Number.isFinite(fwdRes.iBusEstA) && <span className="text-xs font-normal text-slate-400 dark:text-[#6E788A]">A</span>}
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">轴输出扭矩 T_est</div>
                  <div className="text-lg font-semibold text-slate-800 dark:text-[#E6EAF2]">
                    {fwdRes.tEstNm.toFixed(4)} <span className="text-xs font-normal text-slate-400 dark:text-[#6E788A]">N·m</span>
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">系统效率 η_est</div>
                  <div className="text-lg font-semibold text-slate-800 dark:text-[#E6EAF2]">
                    {Number.isFinite(fwdRes.etaEst) ? (fwdRes.etaEst * 100).toFixed(1) : '--'}{' '}
                    <span className="text-xs font-normal text-slate-400 dark:text-[#6E788A]">%</span>
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">Vq_motor / Vq_cmd</div>
                  <div className="text-sm font-medium text-slate-700 dark:text-[#CBD5E1]">
                    {fwdRes.vqMotorV.toFixed(3)} / {Number.isFinite(fwdRes.vqCmdV) ? fwdRes.vqCmdV.toFixed(3) : '--'} V
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">m_motor / m_cmd</div>
                  <div className="text-sm font-medium text-slate-700 dark:text-[#CBD5E1]">
                    {Number.isFinite(fwdRes.mMotor) ? fwdRes.mMotor.toFixed(4) : '--'} /{' '}
                    {Number.isFinite(fwdRes.mCmd) ? fwdRes.mCmd.toFixed(4) : '--'}
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">闭环互验</div>
                  <button
                    type="button"
                    disabled={fwdRes.alerts.invalidBus || !Number.isFinite(fwdRes.iBusEstA)}
                    onClick={() => {
                      setVMeas(fwdV);
                      setIBus(Number(fwdRes.iBusEstA.toFixed(5)));
                      setNRpm(fwdN);
                    }}
                    className="mt-0.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-sky-700 transition-colors hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#2E3646] dark:bg-[#12161E] dark:text-sky-300 dark:hover:border-sky-400/60"
                  >
                    填入左侧反推验证
                  </button>
                </div>
              </div>
            </div>
          </div>

          {renderAlertsBar(singleRes)}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] p-4 dark:border-[#262C38] dark:bg-[#191D26]">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-[#E6EAF2]">批量运行日志动态推算与滑动平均滤波</h3>
              <p className="text-xs text-slate-500 dark:text-[#7E8899]">
                当前日志: <span className="font-mono text-slate-700 dark:text-[#CBD5E1]">{logFileName}</span> · 样本数{' '}
                <span className="font-mono tabular-nums text-sky-700 dark:text-sky-300">{logProcessed.length}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-3 text-xs">
                <span className="text-slate-600 dark:text-[#9BA4B5]">滑动平均滤波窗口:</span>
                <input
                  type="range"
                  min={5}
                  max={20}
                  step={1}
                  value={filterMs}
                  onChange={(e) => setFilterMs(Number(e.target.value))}
                  className="w-32 accent-sky-600 dark:accent-sky-400"
                />
                <span className="w-12 font-mono tabular-nums text-sky-700 dark:text-sky-300">{filterMs} ms</span>
              </label>

              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-sky-500 whitespace-nowrap dark:border-[#2E3646] dark:bg-[#12161E] dark:text-[#CBD5E1] dark:hover:border-sky-400/60">
                <Upload className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                上传运行日志 CSV
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.txt"
                  className="hidden"
                  onChange={(e) => handleLogUpload(e.target.files?.[0])}
                />
              </label>
            </div>
          </div>

          {(batchAlertsSummary.regenLimit > 0 || batchAlertsSummary.invalidBus > 0) && (
            <div className="rounded-lg border border-amber-400/60 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              ▲ 日志中检测到 {batchAlertsSummary.regenLimit} 个超发电极限点、{batchAlertsSummary.invalidBus} 个母线压降异常点（在曲线中以断点显示，不做虚假插值）。
            </div>
          )}

          {/* Unified Batch Alert Summary Strip */}
          <div className="grid grid-cols-2 divide-y divide-[#E4E9F1] rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] font-mono text-xs tabular-nums md:grid-cols-5 md:divide-x md:divide-y-0 dark:divide-[#242A36] dark:border-[#262C38] dark:bg-[#191D26]">
            <div className="p-3">
              <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">空载零漂区样本</div>
              <div className="mt-1 text-base font-semibold text-sky-700 dark:text-sky-300">{batchAlertsSummary.zeroDrift} 点</div>
            </div>
            <div className="p-3">
              <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">低速告警 (&lt;0.08·n0)</div>
              <div className="mt-1 text-base font-semibold text-amber-600 dark:text-amber-300">{batchAlertsSummary.lowSpeed} 点</div>
            </div>
            <div className="p-3">
              <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">指令饱和 (m_cmd&gt;1.1547)</div>
              <div className="mt-1 text-base font-semibold text-amber-600 dark:text-amber-400">{batchAlertsSummary.cmdSat} 点</div>
            </div>
            <div className="p-3">
              <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">电机弱磁 (m_motor&gt;1.1547)</div>
              <div className="mt-1 text-base font-semibold text-amber-600 dark:text-amber-400">{batchAlertsSummary.motorSat} 点</div>
            </div>
            <div className="p-3">
              <div className="font-sans text-[11px] text-slate-500 dark:text-[#8E98A8]">低频发热 (f_e&lt;3 Hz)</div>
              <div className="mt-1 text-base font-semibold text-rose-600 dark:text-rose-400">{batchAlertsSummary.lowFreq} 点</div>
            </div>
          </div>

          {/* Chart selector */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-md border border-[#DCE2EC] bg-[#F1F4F8] p-1 dark:border-[#282F3D] dark:bg-[#12151C]">
              <button
                type="button"
                onClick={() => setBatchChartView('currents')}
                className={`rounded px-3 py-1 text-xs font-medium ${
                  batchChartView === 'currents'
                    ? 'bg-white text-sky-700 shadow-xs dark:bg-[#232A37] dark:text-sky-300'
                    : 'text-slate-500 hover:text-slate-800 dark:text-[#8E98A8]'
                }`}
              >
                电流通道 (I_bus / Iq)
              </button>
              <button
                type="button"
                onClick={() => setBatchChartView('mod')}
                className={`rounded px-3 py-1 text-xs font-medium ${
                  batchChartView === 'mod'
                    ? 'bg-white text-sky-700 shadow-xs dark:bg-[#232A37] dark:text-sky-300'
                    : 'text-slate-500 hover:text-slate-800 dark:text-[#8E98A8]'
                }`}
              >
                双调制比 (m_motor / m_cmd)
              </button>
              <button
                type="button"
                onClick={() => setBatchChartView('voltages')}
                className={`rounded px-3 py-1 text-xs font-medium ${
                  batchChartView === 'voltages'
                    ? 'bg-white text-sky-700 shadow-xs dark:bg-[#232A37] dark:text-sky-300'
                    : 'text-slate-500 hover:text-slate-800 dark:text-[#8E98A8]'
                }`}
              >
                双端电压 (Vq_motor / Vq_cmd)
              </button>
            </div>
            <span className="text-xs text-slate-400 dark:text-[#6E788A]">悬停波形可探针查看任意时刻物理推算值</span>
          </div>

          {batchChartView === 'currents' && (
            <MultiChannelWaveChart
              times={logProcessed.map((r) => r.timeS)}
              yLabel="电流 (A)"
              series={[
                { label: 'I_bus_raw (A)', color: '#94A3B8', values: logProcessed.map((r) => r.iBusRawA), dashed: true },
                { label: 'I_bus_filt (A)', color: '#D97706', values: logProcessed.map((r) => r.iBusFilteredA) },
                { label: 'Iq_est (A)', color: '#0284C7', values: logProcessed.map((r) => r.result.iqA) },
              ]}
            />
          )}

          {batchChartView === 'mod' && (
            <MultiChannelWaveChart
              times={logProcessed.map((r) => r.timeS)}
              yLabel="调制比 m"
              referenceLine={{ value: SVPWM_LINEAR_LIMIT, label: 'SVPWM 线性极限', color: '#D97706' }}
              series={[
                { label: 'm_motor', color: '#0284C7', values: logProcessed.map((r) => r.result.mMotor) },
                { label: 'm_cmd', color: '#E11D48', values: logProcessed.map((r) => r.result.mCmd) },
              ]}
            />
          )}

          {batchChartView === 'voltages' && (
            <MultiChannelWaveChart
              times={logProcessed.map((r) => r.timeS)}
              yLabel="q轴电压 (V)"
              series={[
                { label: 'Vq_motor (V)', color: '#0284C7', values: logProcessed.map((r) => r.result.vqMotorV) },
                { label: 'Vq_cmd (V)', color: '#D97706', values: logProcessed.map((r) => r.result.vqCmdV) },
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
};
