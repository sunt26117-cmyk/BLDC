# bldc_foc_dyno_v2_python —— 缺陷清单（供修复用）

**代码位置**：`C:\Users\ASUS\Downloads\bldc_foc_dyno_v2_python.zip`
**已解压副本**：`D:\deepseek-workspace\Deepseek_1\_dyno_review\`
**回归脚本**：同目录 `_review_test.py`、`_review_test2.py`（修完直接复跑）

**环境**：Python 3.12.8，numpy 2.5.2 / scipy 1.18 / pandas / openpyxl 已装；
`streamlit`、`plotly` 未装（数学层不需要它们即可验证）。

**依赖声明**：`streamlit>=1.36.0, pandas>=2.2.0, numpy>=1.26.0, scipy>=1.13.0, plotly>=5.22.0, openpyxl>=3.1.2`

---

## P0 — 会算错 / 会崩，必须先修

### Issue 1：反向旋转时取错二次方程的根，返回物理不可能的解

- **位置**：`motor_physics.py:168`
- **代码**：
  ```python
  iq = (-eq + math.sqrt(delta)) / (2.0 * rs)
  ```
- **问题**：二次方程 `rs·iq² + eq·iq - (2/3)·p_elec = 0` 有两个根，代码恒取 `+sqrt` 分支。该分支只在 `eq > 0`（正转）时物理正确。
- **实测证据**（`solve_single_point(13.5, 1.06, n, MotorParams())`）：

  | 转速 | 返回 iq | p_elec | p_cu | t_est | P_mech | 结论 |
  |---|---|---|---|---|---|---|
  | +1000 | +1.4365 | 12.79 W | 1.20 W | +0.0996 | +10.43 W | 正确 |
  | **−1000** | **+15.2803** | 12.79 W | **135.99 W** | +0.4673 | **−48.94 W** | **错误** |

  负转速时：铜损 136 W 是总输入功率的 **10.6 倍**（能量不守恒），且 `mode` 标为 `motoring` 却算出负机械功率。

  另一根 `iq = −1.4365` 才是对的：`p_cu = 1.20 W`、`P_mech = +11.58 W`。

- **修法**：按 `eq` 的符号选根，例如
  ```python
  iq = (-eq + math.copysign(1.0, eq) * math.sqrt(delta)) / (2.0 * rs)
  ```
  （注意 `eq == 0` 即堵转情况，需单独定义分支）
- **验收**：`solve_single_point(13.5, 1.06, -1000, MotorParams())` 返回 `iq ≈ -1.4365`、`p_cu ≈ 1.20 W`、`P_mech > 0`；且对 ±转速镜像对称。

---

### Issue 2：闭环数据为空时 `KeyError: 'T_Nm'` 崩溃

- **位置**：`dyno_calibrator.py:174`
- **代码**：
  ```python
  mask_t = df_eval["T_Nm"].abs() > 0.015
  ```
- **问题**：`df_eval` 由空 `eval_rows` 构造时 `pd.DataFrame([])` **没有任何列**，取 `"T_Nm"` 直接抛 `KeyError`。
  上游 172–173 行有 `if len(df_eval)` 保护，174 行漏了。
- **触发条件**：用户上传的闭环 CSV 解析失败 / 全部行被 `dropna` 剔除 / 空表。
- **实测**：`run_stepwise_calibration(empty, empty, MotorParams())` → `KeyError: 'T_Nm'`，整个 Tab 1 崩溃。
- **修法**：在 174 行前加空表短路，或对所有指标统一用 `if len(df_eval)` 保护；建议同时向界面返回"数据不足"状态而不是抛异常。
- **验收**：传入空 DataFrame 不抛异常，返回 `metrics` 全 0 且带可读提示。

---

### Issue 3：`regen_limit` 时静默导出全零波形

- **位置**：`motor_physics.py:165-166`（进入 `regen_limit`）、`thermal_exporter.py:26`、`app.py:185-188`
- **问题链**：
  1. `solve_single_point` 判定 `delta < 0` 时把 `mode` 改成 `"regen_limit"`，随后 `iq / t_est / m_cmd / eta_est` **全部保持 NaN**
  2. `thermal_exporter.py:26`：`iq = res["iq"] if math.isfinite(res["iq"]) else 0.0` → **NaN 被当成 0**
  3. 导出 CSV 变成全零波形，无任何报错
  4. `solve_single_point` 返回了 `alert_regen_limit`，但 `app.py` 只检查 `alert_zero_drift` / `alert_cmd_sat` / `alert_motor_sat` / `alert_low_freq`，**从不检查 `alert_regen_limit`**
- **实测**：`synthesize_6mos_csv(13.5, -8.0, 1000.0, 25.0, "SVPWM", 2000, 0.01, MotorParams())` → `mode=regen_limit`，导出 `Ia` 幅值 `0.0000 A`。
- **修法**：
  - `thermal_exporter`：`iq` 非有限时抛异常或返回错误标记，不要静默填 0
  - `app.py`：Tab 2 / Tab 3 增加 `alert_regen_limit` 的提示（说明该工况超出最大回馈功率 `eq²/(4·rs)`）
- **验收**：该工况下 Tab 3 不下发全零 CSV，界面给出明确原因。

---

## P1 — UI 承诺与实现不符

### Issue 4：`modulation` 参数完全没有生效

- **位置**：`thermal_exporter.py:52-65`（`modulation` 只出现在 summary 第 58 行，未参与计算）
- **实测**：
  ```python
  d1,_ = synthesize_6mos_csv(13.5, 1.06, 1000.0, 25.0, "SVPWM", 20000, 0.5, MotorParams())
  d2,_ = synthesize_6mos_csv(13.5, 1.06, 1000.0, 25.0, "DPWM1", 20000, 0.5, MotorParams())
  d1[["Ia","Ib","Ic","Vbus"]].equals(d2[["Ia","Ib","Ic","Vbus"]])   # → True
  ```
  两种调制方式生成的波形**逐位相同**。`app.py:199` 的 `selectbox` 是装饰品。
- **修法**：二选一——
  - 实现 DPWM1 的占空比钳位（60° 扇区钳位到母线轨），真正改变相电流/线电压波形；或
  - 若暂不实现，**从 UI 移除该选项**，避免误导
- **验收**：两种模式的波形（或导出的占空比序列）存在可测量的差异；或选项已移除。

---

### Issue 6：`forward_verify_point` 被导入但从未使用

- **位置**：`app.py:22`（import），全文件无调用
- **说明**：该函数本身是正确的（反演 iq → 正演 i_bus，与实测差 `9.55e-15`），本该用于一致性自检。
- **修法**：要么在 Tab 2 加一个"反向校验"结果显示，要么删掉该 import。

---

## P2 — 数据静默污染

### Issue 7：缺失扭矩被填成 0 N·m

- **位置**：`dyno_calibrator.py:64` `out["T_Nm"] = out["T_Nm"].fillna(0.0)`
- **实测**：把 5 行 `T_Nm` 置空后，这些 0 值进入**拟合与指标统计**：

  | 指标 | 正常 | 5 行缺失 |
  |---|---|---|
  | MAE_T | 0.00075 | **0.02179（29×）** |
  | RMSE_T | 0.00093 | **0.04853（52×）** |

  无任何告警。
- **修法**：对 `T_Nm` 缺失的行 `dropna`，或标记为无效并在指标计算中排除。
- **验收**：缺失行不参与拟合，指标不被污染。

---

### Issue 8：`eta_format` 选错时 100× 误差且无校验

- **位置**：`dyno_calibrator.py:67-73`、`app.py:141`
- **实测**：数据本是 0–1，误选 `percent` → eta 均值变成 `0.00626`（真实 ~0.7）。之后被 `clip(0,1)`，**看起来完全正常**。
- **修法**：转换后做合理性检查，例如 `eta.max() > 1.05` 或 `eta.median() < 0.05` 时抛警告/在界面提示单位选错。
- **验收**：错误选择能被检出并提示。

---

### Issue 9：扭矩单位换算后 `P_out` 列不跟着换算

- **位置**：`dyno_calibrator.py:44-59`
- **代码**：
  ```python
  out["T_Nm"] = df[col_map["T_Nm"]] * factor        # mNm → ×1e-3  ✅
  ...
  out["P_out"] = pd.to_numeric(df[col_map["P_out"]], errors="coerce")   # 原样，不换算 ❌
  ```
- **实测**：同一个 CSV 选 `mNm` 时 `T_Nm` 均值 `0.1262`，选 `Nm` 时 `126.20`（符合预期）；但 **`P_out` 两种选择下完全相同**。
- **后果**：若 CSV 同时提供 `P_out` 列，扭矩与功率相差 1000 倍。
- **修法**：`P_out` 缺失时由 `T_Nm × omega` 自算（已是如此）；若 `P_out` 列存在且与 `T_Nm` 不自洽，应告警或忽略该列。

---

## P3 — 健壮性

### Issue 10：`v_bus_cap` 下限 0.1 掩盖负母线

- **位置**：`motor_physics.py:111` `v_bus_cap = max(0.1, v_meas - i_bus * params.r_line)`
- **实测**：`V=0.5, I=20, R_line=0.04` → 真实母线 `0.5 − 0.8 = −0.3 V`，被 clamp 成 `0.1` → `m_motor = 109.3065`（荒谬值），只触发饱和告警，不提示输入不物理。
- **修法**：计算值为负时返回明确错误状态（如 `mode="invalid_bus"`），而不是静默 clamp。

---

### Issue 11：优化残差对非有限值返回 0.0

- **位置**：`dyno_calibrator.py:133-138`
  ```python
  if math.isfinite(r["t_est"]):
      errs.append(r["t_est"] - float(row["T_Nm"]))
  else:
      errs.append(0.0)
  ```
- **问题**：参数被推到退化区（`t_est=NaN`）时反而获得**零残差**，`least_squares` 可能收敛到伪最优。
- **修法**：返回一个大惩罚值（如 `1e3`）或直接排除该行；不要用 0。

---

### Issue 12：效率图 16.1% 为 NaN

- **位置**：`dyno_calibrator.py:186-187` `griddata(..., method="linear")`
- **实测**：`z_meas` 与 `z_pred` 各 **16.1% NaN**（凸包外），热力图四角空白。
- **修法**：用 `method="linear"` 后对 NaN 区域再补一次 `method="nearest"`，或在图上明确标注"外推区域不可信"。

---

### Issue 13：运行日志推算产生 NaN 行

- **位置**：`motor_physics.py:281-293` `process_runtime_log`
- **实测**：1200 行里有 **1 行** `iq / t_est / m_cmd / eta_est` 全为 NaN（即 `regen_limit` 那一条），`st.line_chart` 会出现断点。
- **修法**：NaN 行用前值保持（forward-fill），或单独标记。

---

## P4 — 杂项

| # | 位置 | 问题 | 修法 |
|---|---|---|---|
| 14 | `app.py:163` | `use_container_width=True` 在 Streamlit ≥1.49 已弃用 | 改 `width="stretch"` |
| 15 | `app.py:147` | `normalize_dyno_df(df_ol, ..., torque_unit="Nm", eta_format="0-1")` 硬编码，与 L148 用用户选择不一致 | 统一用用户选择 |
| 16 | `app.py:202-203` | `fs` 最高 100 kHz × `dur` 5 s = 50 万行 CSV，浏览器可能卡 | 加上限或流式下载 |
| 17 | `motor_physics.py:227` | `alert_low_speed` 依赖 `params.n0_rpm`，但该字段无 UI 入口 | 加输入框或移除该告警 |

---

## ⚠️ 不要动的部分（已验证正确，改动会引入回归）

以下项目已实测通过，**不需要修改**：

| 项 | 实测结果 |
|---|---|
| 标定能否还原合成真值 | Ke′ 偏差 **0.06%**、`p0_a`/`p0_b` **<1%**、β **4.1%**、MAPE **0.68%** |
| 功率平衡二次方程推导 | 与 `1.5(eq·iq + rs·iq²) = p_elec` 完全一致 |
| `m_motor` 与 `m_norm` 两个调制比定义 | SVPWM 极限处分别为 1.1547 / 1.0，自洽 |
| 死区压降 `(4/π)·t_dead·f_sw·(Vbus+V_SD)` | 形式合理 |
| regen 时 `p_elec = V·I/η` | 符号与量级正确 |
| 逆变器效率方向（motoring 乘、regen 除） | 正确 |
| `n = 0` 堵转分支 | 无除零，退回 `t_est = kt·iq` |
| `forward_verify_point` 数值 | 与实测差 `9.55e-15` |
| `Ke′` 从空载反推 | 与默认值 0.051332 吻合 |
| 标定耗时 | 13.8 ms（locked）/ 16.7 ms（bounded）—— **不需要加缓存** |

---

## 回归验证方法

```bash
cd D:\deepseek-workspace\Deepseek_1\_dyno_review
python _review_test.py     # 复现 Issue 1/2/3/4/5
python _review_test2.py    # 复现 Issue 7/8/9/10
```

修完后应满足：

- `_review_test.py` 的 TEST 3 中，`负转速` 一行 `mode=motoring` 且导出幅值 < 5 A（而非 15.26 A）
- TEST 3 中 `regen 大电流` 不再导出 0 幅值波形，而是报错
- TEST 4 空表不再抛 `KeyError`
- TEST 2 中 `SVPWM 与 DPWM1 波形完全一致?` 为 `False`
- `_review_test2.py` 的 TEST 7 中，缺失行的 MAE_T 不再从 0.00075 暴涨到 0.02179
