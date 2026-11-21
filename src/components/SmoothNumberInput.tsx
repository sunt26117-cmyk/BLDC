import React, { useEffect, useState } from 'react';

interface SmoothNumberInputProps {
  value: number;
  onChange: (val: number) => void;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  className?: string;
  ariaLabel?: string;
}

/**
 * Ergonomic numeric input that allows typing '-', '.', or partial decimals cleanly
 * without resetting to 0 mid-keystroke.
 */
export const SmoothNumberInput: React.FC<SmoothNumberInputProps> = ({
  value,
  onChange,
  step = 0.01,
  min,
  max,
  precision,
  className = '',
  ariaLabel,
}) => {
  const formatVal = (v: number) => {
    if (!Number.isFinite(v)) return '0';
    return precision !== undefined ? String(Number(v.toFixed(precision))) : String(v);
  };

  const [draft, setDraft] = useState<string>(() => formatVal(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(formatVal(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, precision, focused]);

  const commitValue = (rawStr: string) => {
    const parsed = parseFloat(rawStr);
    if (!Number.isFinite(parsed)) {
      setDraft(formatVal(value));
      return;
    }
    let clamped = parsed;
    if (min !== undefined) clamped = Math.max(min, clamped);
    if (max !== undefined) clamped = Math.min(max, clamped);
    onChange(clamped);
    setDraft(formatVal(clamped));
  };

  return (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      aria-label={ariaLabel}
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        const parsed = parseFloat(next);
        if (Number.isFinite(parsed)) {
          if (min !== undefined && parsed < min) return;
          if (max !== undefined && parsed > max) return;
          onChange(parsed);
        }
      }}
      onBlur={() => {
        setFocused(false);
        commitValue(draft);
      }}
      className={className}
    />
  );
};
