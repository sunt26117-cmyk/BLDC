import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Moon, PanelLeftClose, PanelLeftOpen, Sun, X } from 'lucide-react';
import {
  DEMO_MOTOR_PARAMS,
  RawRuntimeLogEntry,
  buildDemoClosedLoopDataset,
  buildDemoOpenLoopDataset,
  buildDemoRuntimeLog,
} from './core/demoData';
import {
  DynoColumnMapping,
  EfficiencyFormat,
  KeSourceMode,
  RsFitMode,
  TabularDataset,
  TorqueUnit,
  autoMapColumns,
  normalizeDynoDataset,
  runStepwiseCalibration,
} from './core/dynoCalibrator';
import { MotorParams, getEffectiveRsOhm } from './core/motorPhysics';
import { PYTHON_BUNDLE_FILES, downloadPythonBundleZip } from './core/pythonBundle';
import { SidebarParams } from './components/SidebarParams';
import { Tab1DynoCalib } from './components/Tab1DynoCalib';
import { Tab2RuntimeEst } from './components/Tab2RuntimeEst';
import { Tab3ThermalExport } from './components/Tab3ThermalExport';

type ActiveTab = 'tab1' | 'tab2' | 'tab3';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('tab1');
  const [isDark, setIsDark] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [params, setParams] = useState<MotorParams>(() => ({ ...DEMO_MOTOR_PARAMS }));

  // Tab 1 Dyno datasets & options
  const [openLoopRaw, setOpenLoopRaw] = useState<TabularDataset>(() => buildDemoOpenLoopDataset());
  const [closedLoopRaw, setClosedLoopRaw] = useState<TabularDataset>(() => buildDemoClosedLoopDataset());
  const [openLoopMap, setOpenLoopMap] = useState<DynoColumnMapping>(() =>
    autoMapColumns(buildDemoOpenLoopDataset().headers)
  );
  const [closedLoopMap, setClosedLoopMap] = useState<DynoColumnMapping>(() =>
    autoMapColumns(buildDemoClosedLoopDataset().headers)
  );
  const [torqueUnit, setTorqueUnit] = useState<TorqueUnit>('Nm');
  const [etaFormat, setEtaFormat] = useState<EfficiencyFormat>('0-1');
  const [keSource, setKeSource] = useState<KeSourceMode>('open_loop_auto');
  const [manualN0Rpm, setManualN0Rpm] = useState(1450);
  const [manualVTestV, setManualVTestV] = useState(13.5);
  const [manualKv, setManualKv] = useState(107.4);
  const [rsFitMode, setRsFitMode] = useState<RsFitMode>('locked');
  const [calibTrigger, setCalibTrigger] = useState(0);

  // Tab 2 Runtime log
  const [logRows, setLogRows] = useState<RawRuntimeLogEntry[]>(() => buildDemoRuntimeLog());
  const [logFileName, setLogFileName] = useState('demo_runtime_log_13V5_30W.csv');

  // Tab 3 Steady-state export point
  const [exportPoint, setExportPoint] = useState({ vMeasV: 13.5, iBusA: 1.06, nRpm: 1000 });

  // Python Source Bundle viewer modal
  const [showPythonModal, setShowPythonModal] = useState(false);
  const [selectedPyFile, setSelectedPyFile] = useState(PYTHON_BUNDLE_FILES[0].name);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((prev) => (prev === msg ? null : prev)), 2600);
  }, []);

  const { calibReport, normWarnings } = useMemo(() => {
    void calibTrigger;
    const olRes = normalizeDynoDataset(openLoopRaw, openLoopMap, 'Nm', '0-1', { requireTorque: false });
    const clRes = normalizeDynoDataset(closedLoopRaw, closedLoopMap, torqueUnit, etaFormat, { requireTorque: true });
    const report = runStepwiseCalibration(olRes.points, clRes.points, params, {
      keSource,
      manualN0Rpm,
      manualVTestV,
      manualKv,
      rsFitMode,
    });
    return {
      calibReport: report,
      normWarnings: [...olRes.warnings, ...clRes.warnings],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
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
    params.rLL25Ohm,
    params.tCoilC,
    params.iIdleA,
    params.etaInv,
    params.iDeadbandA,
    params.rLineOhm,
    calibTrigger,
  ]);

  useEffect(() => {
    setParams((prev) => {
      const nextRsOverride = rsFitMode === 'locked' ? null : calibReport.rsEffOhm;
      if (
        Math.abs(prev.kePrime - calibReport.kePrime) < 1e-7 &&
        Math.abs(prev.n0Rpm - calibReport.n0Rpm) < 1e-3 &&
        Math.abs(prev.p0A - calibReport.p0A) < 1e-9 &&
        Math.abs(prev.p0B - calibReport.p0B) < 1e-11 &&
        Math.abs(prev.betaSat - calibReport.betaSat) < 1e-7 &&
        prev.rsEffOverrideOhm === nextRsOverride
      ) {
        return prev;
      }
      return {
        ...prev,
        kePrime: calibReport.kePrime,
        n0Rpm: calibReport.n0Rpm,
        p0A: calibReport.p0A,
        p0B: calibReport.p0B,
        betaSat: calibReport.betaSat,
        rsEffOverrideOhm: nextRsOverride,
      };
    });
  }, [calibReport, rsFitMode]);

  const handleLoadDemo = () => {
    const ol = buildDemoOpenLoopDataset();
    const cl = buildDemoClosedLoopDataset();
    setParams({ ...DEMO_MOTOR_PARAMS });
    setOpenLoopRaw(ol);
    setClosedLoopRaw(cl);
    setOpenLoopMap(autoMapColumns(ol.headers));
    setClosedLoopMap(autoMapColumns(cl.headers));
    setTorqueUnit('Nm');
    setEtaFormat('0-1');
    setKeSource('open_loop_auto');
    setRsFitMode('locked');
    setLogRows(buildDemoRuntimeLog());
    setLogFileName('demo_runtime_log_13V5_30W.csv');
    setExportPoint({ vMeasV: 13.5, iBusA: 1.06, nRpm: 1000 });
    setCalibTrigger((c) => c + 1);
    showToast('已载入 13.5V / 30W / 1000 RPM / 0.1 N·m 演示数据集并完成分步标定');
  };

  const activePyContent =
    PYTHON_BUNDLE_FILES.find((f) => f.name === selectedPyFile)?.content ?? PYTHON_BUNDLE_FILES[0].content;

  const rsEff = getEffectiveRsOhm(params);

  return (
    <div className="min-h-screen bg-[#F1F4F8] text-slate-800 flex flex-col dark:bg-[#12151C] dark:text-[#E6EAF2]">
      {/* Top Bar Contract: Strictly 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 border-b border-[#DCE2EC] bg-[#FAFBFD]/95 px-6 py-3 backdrop-blur-sm dark:border-[#262C38] dark:bg-[#171B23]/95">
        <span className="text-base font-bold tracking-tight text-slate-800 whitespace-nowrap shrink-0 dark:text-[#E6EAF2]">
          FOC DynoLab
        </span>

        <nav className="flex items-center gap-6 overflow-x-auto text-sm font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('tab1')}
            className={`border-b-2 py-1 whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'tab1'
                ? 'border-sky-600 text-sky-700 dark:border-sky-400 dark:text-sky-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-[#8E98A8] dark:hover:text-[#E6EAF2]'
            }`}
          >
            测功仪标定与 Map
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tab2')}
            className={`border-b-2 py-1 whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'tab2'
                ? 'border-sky-600 text-sky-700 dark:border-sky-400 dark:text-sky-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-[#8E98A8] dark:hover:text-[#E6EAF2]'
            }`}
          >
            运行态推算与告警
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tab3')}
            className={`border-b-2 py-1 whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'tab3'
                ? 'border-sky-600 text-sky-700 dark:border-sky-400 dark:text-sky-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-[#8E98A8] dark:hover:text-[#E6EAF2]'
            }`}
          >
            6-MOS 波形与导出
          </button>
          <button
            type="button"
            onClick={() => setShowPythonModal(true)}
            className="border-b-2 border-transparent py-1 text-slate-500 hover:text-sky-700 whitespace-nowrap shrink-0 transition-colors dark:text-[#8E98A8] dark:hover:text-sky-300"
          >
            Python 源码包
          </button>
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={handleLoadDemo}
            className="rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-500 whitespace-nowrap shrink-0 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
          >
            载入 13.5V/30W Demo
          </button>
        </div>
      </header>

      {/* Main Split Console */}
      <div className="flex flex-1 flex-col lg:flex-row">
        {sidebarOpen && (
          <SidebarParams
            params={params}
            onChange={setParams}
            onResetDemoParams={() => {
              setParams({ ...DEMO_MOTOR_PARAMS });
              showToast('已重置为 13.5V / 30W 电机物理基准参数');
            }}
          />
        )}

        <main className="min-w-0 flex-1 p-5 lg:p-6">
          {/* Quiet Workspace Toolbar: Sidebar Collapse + Active Motor Snapshot + Eye-Care Theme Switch */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#DCE2EC] bg-[#FAFBFD] px-2.5 py-1 text-slate-600 transition-colors hover:border-sky-500 hover:text-sky-700 dark:border-[#262C38] dark:bg-[#191D26] dark:text-[#9BA4B5] dark:hover:border-sky-400/60 dark:hover:text-sky-300"
              >
                {sidebarOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
                {sidebarOpen ? '收起参数栏' : '展开参数栏'}
              </button>

              <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-[#7E8899]">
                p={params.polePairs} · Ke&apos;={params.kePrime.toFixed(5)} · Rs_eff={rsEff.toFixed(4)} Ω · β={params.betaSat.toFixed(5)}
              </span>
            </div>

            <div className="flex items-center gap-1 rounded-md border border-[#DCE2EC] bg-[#FAFBFD] p-0.5 dark:border-[#262C38] dark:bg-[#191D26]">
              <button
                type="button"
                onClick={() => setIsDark(true)}
                className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  isDark
                    ? 'bg-[#252C3A] text-sky-300'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Moon className="h-3 w-3" />
                护眼深灰
              </button>
              <button
                type="button"
                onClick={() => setIsDark(false)}
                className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  !isDark
                    ? 'bg-sky-50 text-sky-700'
                    : 'text-[#8E98A8] hover:text-[#E6EAF2]'
                }`}
              >
                <Sun className="h-3 w-3" />
                柔光白昼
              </button>
            </div>
          </div>

          {activeTab === 'tab1' && (
            <Tab1DynoCalib
              params={params}
              openLoopRaw={openLoopRaw}
              closedLoopRaw={closedLoopRaw}
              openLoopMap={openLoopMap}
              closedLoopMap={closedLoopMap}
              torqueUnit={torqueUnit}
              etaFormat={etaFormat}
              keSource={keSource}
              manualN0Rpm={manualN0Rpm}
              manualVTestV={manualVTestV}
              manualKv={manualKv}
              rsFitMode={rsFitMode}
              report={calibReport}
              warnings={normWarnings}
              onUpdateOpenLoop={(ds, map) => {
                setOpenLoopRaw(ds);
                setOpenLoopMap(map);
                showToast(`已导入开环表 ${ds.fileName}，自动完成分步标定`);
              }}
              onUpdateClosedLoop={(ds, map) => {
                setClosedLoopRaw(ds);
                setClosedLoopMap(map);
                showToast(`已导入闭环表 ${ds.fileName}，自动完成分步标定`);
              }}
              onChangeOpenMap={setOpenLoopMap}
              onChangeClosedMap={setClosedLoopMap}
              onChangeTorqueUnit={setTorqueUnit}
              onChangeEtaFormat={setEtaFormat}
              onChangeKeSource={setKeSource}
              onChangeManualKe={(n0, vt, kv) => {
                setManualN0Rpm(n0);
                setManualVTestV(vt);
                setManualKv(kv);
              }}
              onChangeRsFitMode={setRsFitMode}
              onRunCalibration={() => {
                setCalibTrigger((c) => c + 1);
                showToast('分步标定已重新执行');
              }}
            />
          )}

          {activeTab === 'tab2' && (
            <Tab2RuntimeEst
              params={params}
              logRows={logRows}
              logFileName={logFileName}
              onUpdateLog={(rows, fname) => {
                setLogRows(rows);
                setLogFileName(fname);
                showToast(`已载入运行日志 ${fname} (${rows.length} 行)`);
              }}
              onSendPointToExport={(pt) => {
                setExportPoint(pt);
                setActiveTab('tab3');
                showToast('已将该稳态工况点同步至 Tab 3 导出区');
              }}
            />
          )}

          {activeTab === 'tab3' && (
            <Tab3ThermalExport
              params={params}
              onChangeParams={setParams}
              exportPoint={exportPoint}
              onChangeExportPoint={setExportPoint}
            />
          )}
        </main>
      </div>

      {/* Lightweight Toast */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-40 rounded-lg border border-sky-400/50 bg-[#FAFBFD] px-4 py-2.5 text-xs text-sky-800 shadow-lg dark:border-sky-500/40 dark:bg-[#191D26] dark:text-sky-200">
          {toastMsg}
        </div>
      )}

      {/* Python / Streamlit Bundle Modal */}
      {showPythonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[#DCE2EC] bg-[#FAFBFD] shadow-2xl dark:border-[#2C3444] dark:bg-[#171B23]">
            <div className="flex items-center justify-between border-b border-[#DCE2EC] px-5 py-3.5 dark:border-[#262C38]">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-[#E6EAF2]">Python / Streamlit 本地工程源码包 (V2.0)</h3>
                <p className="text-xs text-slate-500 dark:text-[#8E98A8]">
                  含 requirements.txt、motor_physics.py、dyno_calibrator.py、thermal_exporter.py、app.py（可直接本地 streamlit run app.py）
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void downloadPythonBundleZip();
                    showToast('已开始下载 bldc_foc_dyno_v2_python.zip');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-500 whitespace-nowrap dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                >
                  <Download className="h-3.5 w-3.5" />
                  一键打包下载 .zip
                </button>
                <button
                  type="button"
                  onClick={() => setShowPythonModal(false)}
                  className="rounded-md border border-slate-300 p-1.5 text-slate-500 hover:text-slate-800 dark:border-[#2C3444] dark:text-[#8E98A8] dark:hover:text-[#E6EAF2]"
                  aria-label="关闭弹窗"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              <div className="w-52 shrink-0 space-y-1 border-r border-[#DCE2EC] bg-[#F1F4F8] p-2 dark:border-[#262C38] dark:bg-[#12151C]">
                {PYTHON_BUNDLE_FILES.map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    onClick={() => setSelectedPyFile(f.name)}
                    className={`w-full rounded-md px-3 py-2 text-left font-mono text-xs transition-colors ${
                      selectedPyFile === f.name
                        ? 'bg-sky-100 font-semibold text-sky-800 dark:bg-sky-500/15 dark:text-sky-300'
                        : 'text-slate-600 hover:bg-slate-200/70 dark:text-[#8E98A8] dark:hover:bg-[#1D222D] dark:hover:text-[#D8DEE9]'
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
              <pre className="flex-1 overflow-auto bg-white p-4 font-mono text-xs leading-relaxed text-slate-700 dark:bg-[#12151C] dark:text-[#CBD5E1]">
                {activePyContent}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
