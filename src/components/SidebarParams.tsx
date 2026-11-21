import React, { useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { MotorParams, calcLqH, calcRsAnchorOhm, getEffectiveRsOhm } from '../core/motorPhysics';
import { SmoothNumberInput } from './SmoothNumberInput';

interface SidebarParamsProps {
  params: MotorParams;
  onChange: (next: MotorParams) => void;
  onResetDemoParams: () => void;
}

interface NumFieldProps {
  label: string;
  unit?: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  onChange: (v: number) => void;
}

const NumField: React.FC<NumFieldProps> = ({
  label,
  unit,
  value,
  step = 0.01,
  min,
  max,
  precision,
  onChange,
}) => {
  return (
    <label className="flex items-center justify-between gap-2 py-1 text-xs">
      <span className="truncate text-slate-600 dark:text-[#A5AEBE]" title={label}>
        {label}
        {unit && <span className="ml-1 font-mono text-[10px] text-slate-400 dark:text-[#6C7687]">({unit})</span>}
      </span>
      <SmoothNumberInput
        value={value}
        step={step}
        min={min}
        max={max}
        precision={precision}
        onChange={onChange}
        ariaLabel={label}
        className="w-24 shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-right font-mono text-xs tabular-nums text-slate-800 transition-colors focus:border-sky-600 focus:outline-none dark:border-[#2C3444] dark:bg-[#12161E] dark:text-[#E6EAF2] dark:focus:border-sky-400"
      />
    </label>
  );
};

export const SidebarParams: React.FC<SidebarParamsProps> = ({
  params,
  onChange,
  onResetDemoParams,
}) => {
  const [openSec, setOpenSec] = useState({
    motor: true,
    calib: true,
    inv: true,
    drop: false,
  });

  const rsAnchor = calcRsAnchorOhm(params.rLL25Ohm, params.tCoilC);
  const rsEff = getEffectiveRsOhm(params);
  const lqMh = calcLqH(params.lLLmH) * 1e3;

  const update = (patch: Partial<MotorParams>) => onChange({ ...params, ...patch });

  return (
    <aside className="w-full shrink-0 border-b border-[#DCE2EC] bg-[#FAFBFD] dark:border-[#262C38] dark:bg-[#171B23] lg:w-80 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between border-b border-[#DCE2EC] px-4 py-3.5 dark:border-[#262C38]">
        <div>
          <h2 className="text-xs font-semibold tracking-wide text-slate-800 dark:text-[#E6EAF2]">物理基准参数</h2>
          <p className="text-[11px] text-slate-500 dark:text-[#7E8899]">等幅值变换 · 国际单位制 (SI)</p>
        </div>
        <button
          type="button"
          onClick={onResetDemoParams}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-sky-500 hover:text-sky-700 whitespace-nowrap shrink-0 dark:border-[#2E3646] dark:bg-[#1F2430] dark:text-[#B8C0CE] dark:hover:border-sky-400/60 dark:hover:text-sky-300"
          title="恢复 13.5V / 30W / 1000 RPM / 0.1 Nm 基准参数"
        >
          <RotateCcw className="h-3 w-3" />
          重置基准
        </button>
      </div>

      <div className="divide-y divide-[#E4E9F1] dark:divide-[#242A36]">
        {/* Section 1: Motor Anchor Params */}
        <div className="px-4 py-3.5">
          <button
            type="button"
            onClick={() => setOpenSec((s) => ({ ...s, motor: !s.motor }))}
            className="mb-2 flex w-full items-center justify-between text-left text-xs font-semibold text-slate-700 dark:text-[#D8DEE9]"
          >
            <span>电机本体锚定参数</span>
            {openSec.motor ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 dark:text-[#6E788A]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-[#6E788A]" />
            )}
          </button>
          {openSec.motor && (
            <div className="space-y-1">
              <NumField label="极对数 p" value={params.polePairs} step={1} min={1} max={40} onChange={(v) => update({ polePairs: Math.max(1, Math.round(v)) })} />
              <NumField label="线电阻 R_LL@25°C" unit="Ω" value={params.rLL25Ohm} step={0.01} min={0.001} precision={4} onChange={(v) => update({ rLL25Ohm: v, rsEffOverrideOhm: null })} />
              <NumField label="绕组温度 T_coil" unit="°C" value={params.tCoilC} step={1} min={-40} max={200} precision={1} onChange={(v) => update({ tCoilC: v, rsEffOverrideOhm: null })} />
              <NumField label="线电感 L_LL" unit="mH" value={params.lLLmH} step={0.01} min={0.001} precision={3} onChange={(v) => update({ lLLmH: v })} />
              <NumField label="空载参考转速 n0" unit="RPM" value={params.n0Rpm} step={50} min={10} precision={0} onChange={(v) => update({ n0Rpm: v })} />
              <NumField label="反电势常数 Ke'" unit="Vp/(rad/s)" value={params.kePrime} step={0.0005} min={0.0001} precision={5} onChange={(v) => update({ kePrime: v })} />

              <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-md bg-slate-100/80 px-2.5 py-2 font-mono text-[11px] tabular-nums dark:bg-[#12161E]">
                <div>
                  <div className="text-[10px] text-slate-500 dark:text-[#6E788A]">Rs 温修基准</div>
                  <div className="font-medium text-slate-800 dark:text-[#D8DEE9]">{rsAnchor.toFixed(4)} Ω</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 dark:text-[#6E788A]">等效 Lq = L_LL/2</div>
                  <div className="font-medium text-slate-800 dark:text-[#D8DEE9]">{lqMh.toFixed(3)} mH</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Calibration & Saturation */}
        <div className="px-4 py-3.5">
          <button
            type="button"
            onClick={() => setOpenSec((s) => ({ ...s, calib: !s.calib }))}
            className="mb-2 flex w-full items-center justify-between text-left text-xs font-semibold text-slate-700 dark:text-[#D8DEE9]"
          >
            <span>磁饱和与随速铁损/风摩</span>
            {openSec.calib ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 dark:text-[#6E788A]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-[#6E788A]" />
            )}
          </button>
          {openSec.calib && (
            <div className="space-y-1">
              <NumField label="磁饱和系数 β" unit="1/A²" value={params.betaSat} step={0.0005} min={0} precision={5} onChange={(v) => update({ betaSat: Math.max(0, v) })} />
              <NumField label="铁损线性系数 a" unit="W/RPM" value={params.p0A} step={0.00005} min={0} precision={6} onChange={(v) => update({ p0A: Math.max(0, v) })} />
              <NumField label="风摩二次系数 b" unit="W/RPM²" value={params.p0B} step={1e-7} min={0} precision={8} onChange={(v) => update({ p0B: Math.max(0, v) })} />
              <div className="mt-2 flex items-center justify-between rounded-md bg-slate-100/80 px-2.5 py-1.5 text-[11px] dark:bg-[#12161E]">
                <span className="text-slate-500 dark:text-[#8E98A8]">当前 Rs_eff</span>
                <span className="font-mono font-medium tabular-nums text-sky-700 dark:text-sky-300">
                  {rsEff.toFixed(4)} Ω {params.rsEffOverrideOhm !== null ? '(微调)' : '(锁定)'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Simple Inverter & Zero-Drift Deadband */}
        <div className="px-4 py-3.5">
          <button
            type="button"
            onClick={() => setOpenSec((s) => ({ ...s, inv: !s.inv }))}
            className="mb-2 flex w-full items-center justify-between text-left text-xs font-semibold text-slate-700 dark:text-[#D8DEE9]"
          >
            <span>逆变级基准与零漂死区</span>
            {openSec.inv ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 dark:text-[#6E788A]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-[#6E788A]" />
            )}
          </button>
          {openSec.inv && (
            <div className="space-y-1">
              <NumField label="静态电流 I_idle" unit="A" value={params.iIdleA} step={0.005} min={0} precision={3} onChange={(v) => update({ iIdleA: Math.max(0, v) })} />
              <NumField label="逆变效率 η_inv" unit="0–1" value={params.etaInv} step={0.01} min={0.3} max={0.999} precision={3} onChange={(v) => update({ etaInv: Math.min(0.999, Math.max(0.3, v)) })} />
              <NumField label="零漂死区 |I_net| <" unit="A" value={params.iDeadbandA} step={0.005} min={0} max={0.5} precision={3} onChange={(v) => update({ iDeadbandA: Math.max(0, v) })} />
              <NumField label="线束线阻 R_line" unit="Ω" value={params.rLineOhm} step={0.005} min={0} precision={4} onChange={(v) => update({ rLineOhm: Math.max(0, v) })} />
            </div>
          )}
        </div>

        {/* Section 4: Voltage Drop for Vq_cmd */}
        <div className="px-4 py-3.5">
          <button
            type="button"
            onClick={() => setOpenSec((s) => ({ ...s, drop: !s.drop }))}
            className="mb-2 flex w-full items-center justify-between text-left text-xs font-semibold text-slate-700 dark:text-[#D8DEE9]"
          >
            <span>管压降与死区 (仅用于 Vq_cmd)</span>
            {openSec.drop ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 dark:text-[#6E788A]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-[#6E788A]" />
            )}
          </button>
          {openSec.drop && (
            <div className="space-y-1">
              <NumField label="等效 Rds(on)" unit="mΩ" value={params.rdsOnMOhm} step={0.5} min={0} precision={1} onChange={(v) => update({ rdsOnMOhm: Math.max(0, v) })} />
              <NumField label="死区时间 t_dead" unit="ns" value={params.tDeadNs} step={10} min={0} precision={0} onChange={(v) => update({ tDeadNs: Math.max(0, v) })} />
              <NumField label="开关频率 f_sw" unit="kHz" value={params.fSwKhz} step={1} min={1} precision={1} onChange={(v) => update({ fSwKhz: Math.max(1, v) })} />
              <NumField label="体二极管 V_SD" unit="V" value={params.vSdV} step={0.05} min={0} precision={2} onChange={(v) => update({ vSdV: Math.max(0, v) })} />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
