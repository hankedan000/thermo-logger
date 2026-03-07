import type { CSSProperties, ReactNode } from "react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type SettingsRowControl =
  | { type: "toggle";   checked: boolean;   onChange: (v: boolean) => void;  disabled?: boolean }
  | { type: "select";   value: string;      onChange: (v: string) => void;   options: { label: string; value: string }[]; disabled?: boolean }
  | { type: "input";    value: string;      onChange: (v: string) => void;   placeholder?: string; disabled?: boolean }
  | { type: "number";   value: number;      onChange: (v: number) => void;   min?: number; max?: number; step?: number; disabled?: boolean }
  | { type: "button";   label: string;      onClick: () => void;             variant?: "primary" | "danger" | "ghost"; disabled?: boolean }
  | { type: "custom";   children: ReactNode }
  | { type: "readonly"; value: string };

export interface SettingsRowDef {
  /** Row label */
  label: string;
  /** Optional sublabel / helper text */
  description?: string;
  /** The control to render on the right side */
  control: SettingsRowControl;
  /** Hide this row entirely */
  hidden?: boolean;
}

export interface SettingsSectionDef {
  /** Section heading */
  title: string;
  /** Optional section description */
  description?: string;
  rows: SettingsRowDef[];
}

export interface SettingsPanelProps {
  /** Hide the panel entirely */
  showPanel: boolean;
  /** Panel heading */
  title?: string;
  sections: SettingsSectionDef[];
  /** Width of the panel. @default "480px" */
  width?: string;
  /** Additional wrapper styles */
  style?: CSSProperties;
}

// ─────────────────────────────────────────────────────────────
// Design tokens (match UpdateDialog / ToggleSwitch palette)
// ─────────────────────────────────────────────────────────────

const T = {
  bg:          "#0d1424",
  bgDeep:      "#070b14",
  bgHeader:    "#0a0f1a",
  border:      "#1e2d45",
  borderSub:   "#111927",
  accent:      "#00e5a0",
  accentDim:   "rgba(0,229,160,0.15)",
  accentGlow:  "rgba(0,229,160,0.2)",
  textPrimary: "#8da9c4",
  textDim:     "#3d5068",
  textActive:  "#c8ffe9",
  danger:      "#ff4d6d",
  warn:        "#f4c842",
  font:        "'IBM Plex Mono','Fira Code','Cascadia Code',monospace",
} as const;

// ─────────────────────────────────────────────────────────────
// Inline control renderers
// ─────────────────────────────────────────────────────────────

function ToggleControl({ ctrl }: { ctrl: Extract<SettingsRowControl, { type: "toggle" }> }) {
  const trackW = 42, trackH = 24, thumbSize = 16, thumbOffset = 4;
  const thumbX = ctrl.checked
    ? trackW - thumbSize - thumbOffset
    : thumbOffset;

  return (
    <button
      role="switch"
      aria-checked={ctrl.checked}
      disabled={ctrl.disabled}
      onClick={() => !ctrl.disabled && ctrl.onChange(!ctrl.checked)}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!ctrl.disabled) ctrl.onChange(!ctrl.checked); }}}
      onFocus={(e) => { if (e.target.matches(":focus-visible")) { e.currentTarget.style.outline = `2px solid ${T.accentGlow}`; e.currentTarget.style.outlineOffset = "3px"; }}}
      onBlur={(e) => { e.currentTarget.style.outline = "none"; }}
      style={{
        position: "relative", flexShrink: 0,
        width: `${trackW}px`, height: `${trackH}px`,
        borderRadius: `${trackH}px`,
        border: `1px solid ${ctrl.checked ? T.accent : T.border}`,
        background: ctrl.checked ? T.accentDim : T.bgHeader,
        boxShadow: ctrl.checked ? `0 0 10px ${T.accentGlow}` : "inset 0 1px 3px rgba(0,0,0,0.4)",
        cursor: ctrl.disabled ? "not-allowed" : "pointer",
        padding: 0, outline: "none",
        opacity: ctrl.disabled ? 0.4 : 1,
        transition: "background 0.22s, border-color 0.22s, box-shadow 0.22s",
      }}
    >
      <span aria-hidden="true" style={{
        position: "absolute", top: "50%", left: 0,
        width: `${thumbSize}px`, height: `${thumbSize}px`, borderRadius: "50%",
        background: ctrl.checked ? T.accent : "#2e4060",
        boxShadow: ctrl.checked ? `0 0 8px ${T.accentGlow}` : "0 1px 3px rgba(0,0,0,0.5)",
        transform: `translate(${thumbX}px,-50%)`,
        transition: "transform 0.22s cubic-bezier(0.34,1.4,0.64,1), background 0.22s, box-shadow 0.22s",
      }} />
    </button>
  );
}

function SelectControl({ ctrl }: { ctrl: Extract<SettingsRowControl, { type: "select" }> }) {
  return (
    <select
      value={ctrl.value}
      disabled={ctrl.disabled}
      onChange={(e) => ctrl.onChange(e.target.value)}
      style={{
        background: T.bgDeep, color: T.textPrimary,
        border: `1px solid ${T.border}`, borderRadius: "6px",
        fontFamily: T.font, fontSize: "12px", padding: "6px 28px 6px 10px",
        cursor: ctrl.disabled ? "not-allowed" : "pointer",
        opacity: ctrl.disabled ? 0.4 : 1,
        outline: "none", appearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%233d5068'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
        minWidth: "140px",
      }}
    >
      {ctrl.options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function InputControl({ ctrl }: { ctrl: Extract<SettingsRowControl, { type: "input" }> }) {
  return (
    <input
      type="text"
      value={ctrl.value}
      placeholder={ctrl.placeholder}
      disabled={ctrl.disabled}
      onChange={(e) => ctrl.onChange(e.target.value)}
      style={{
        background: T.bgDeep, color: T.textPrimary,
        border: `1px solid ${T.border}`, borderRadius: "6px",
        fontFamily: T.font, fontSize: "12px", padding: "6px 10px",
        outline: "none", minWidth: "160px",
        opacity: ctrl.disabled ? 0.4 : 1,
        cursor: ctrl.disabled ? "not-allowed" : "text",
        transition: "border-color 0.15s",
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = T.accent; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = T.border; }}
    />
  );
}

function NumberControl({ ctrl }: { ctrl: Extract<SettingsRowControl, { type: "number" }> }) {
  return (
    <input
      type="number"
      value={ctrl.value}
      min={ctrl.min} max={ctrl.max} step={ctrl.step}
      disabled={ctrl.disabled}
      onChange={(e) => ctrl.onChange(Number(e.target.value))}
      style={{
        background: T.bgDeep, color: T.textPrimary,
        border: `1px solid ${T.border}`, borderRadius: "6px",
        fontFamily: T.font, fontSize: "12px", padding: "6px 10px",
        outline: "none", width: "80px", textAlign: "right",
        opacity: ctrl.disabled ? 0.4 : 1,
        cursor: ctrl.disabled ? "not-allowed" : "text",
        transition: "border-color 0.15s",
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = T.accent; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = T.border; }}
    />
  );
}

function ButtonControl({ ctrl }: { ctrl: Extract<SettingsRowControl, { type: "button" }> }) {
  const variant = ctrl.variant ?? "ghost";
  const styles: Record<string, CSSProperties> = {
    primary: { background: T.accent,       color: "#0a0f1a", border: `1px solid ${T.accent}` },
    danger:  { background: "transparent",  color: T.danger,  border: `1px solid ${T.danger}` },
    ghost:   { background: "transparent",  color: T.textPrimary, border: `1px solid ${T.border}` },
  };
  return (
    <button
      onClick={ctrl.onClick}
      disabled={ctrl.disabled}
      style={{
        ...styles[variant],
        fontFamily: T.font, fontSize: "11.5px", fontWeight: 700,
        letterSpacing: "0.06em", padding: "6px 16px", borderRadius: "6px",
        cursor: ctrl.disabled ? "not-allowed" : "pointer",
        opacity: ctrl.disabled ? 0.4 : 1,
        transition: "opacity 0.15s, transform 0.1s",
        outline: "none",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.75"; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = ctrl.disabled ? "0.4" : "1"; }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.96)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {ctrl.label}
    </button>
  );
}

function ReadonlyControl({ ctrl }: { ctrl: Extract<SettingsRowControl, { type: "readonly" }> }) {
  return (
    <span style={{ fontFamily: T.font, fontSize: "12px", color: T.textDim, letterSpacing: "0.03em" }}>
      {ctrl.value}
    </span>
  );
}

function renderControl(ctrl: SettingsRowControl): ReactNode {
  switch (ctrl.type) {
    case "toggle":   return <ToggleControl   ctrl={ctrl} />;
    case "select":   return <SelectControl   ctrl={ctrl} />;
    case "input":    return <InputControl    ctrl={ctrl} />;
    case "number":   return <NumberControl   ctrl={ctrl} />;
    case "button":   return <ButtonControl   ctrl={ctrl} />;
    case "readonly": return <ReadonlyControl ctrl={ctrl} />;
    case "custom":   return ctrl.children;
  }
}

// ─────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────

function SettingsRow({ row }: { row: SettingsRowDef }) {
  if (row.hidden) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: "16px", padding: "13px 20px",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
        <span style={{ fontSize: "12.5px", fontWeight: 500, color: T.textPrimary, letterSpacing: "0.02em" }}>
          {row.label}
        </span>
        {row.description && (
          <span style={{ fontSize: "11px", color: T.textDim, letterSpacing: "0.02em" }}>
            {row.description}
          </span>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>
        {renderControl(row.control)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Section
// ─────────────────────────────────────────────────────────────

function SettingsSection({ section }: { section: SettingsSectionDef }) {
  const visibleRows = section.rows.filter((r) => !r.hidden);
  if (visibleRows.length === 0) return null;

  return (
    <div>
      {/* Section header */}
      <div style={{ padding: "10px 20px 8px", borderBottom: `1px solid ${T.borderSub}` }}>
        <span style={{
          fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.14em",
          textTransform: "uppercase", color: T.textDim,
        }}>
          {section.title}
        </span>
        {section.description && (
          <p style={{ margin: "3px 0 0", fontSize: "11px", color: T.textDim, letterSpacing: "0.02em" }}>
            {section.description}
          </p>
        )}
      </div>

      {/* Rows */}
      {visibleRows.map((row, i) => (
        <div key={row.label}>
          <SettingsRow row={row} />
          {i < visibleRows.length - 1 && (
            <div style={{ height: "1px", background: T.borderSub, margin: "0 20px" }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SettingsPanel — main export
// ─────────────────────────────────────────────────────────────

/**
 * SettingsPanel — A composable settings panel that renders typed controls per-row.
 *
 * Supports: toggle, select, input, number, button, readonly, custom (ReactNode).
 * Groups rows into named sections. Matches the UpdateDialog / ToggleSwitch palette.
 *
 * @example
 * <SettingsPanel
 *   title="Preferences"
 *   sections={[{
 *     title: "Build",
 *     rows: [
 *       { label: "Auto-deploy", control: { type: "toggle", checked, onChange } },
 *       { label: "Environment", control: { type: "select", value, onChange, options } },
 *     ]
 *   }]}
 * />
 */
export default function SettingsPanel({ showPanel, title, sections, width = "480px", style }: SettingsPanelProps) {
  return (
    <div hidden={!showPanel} style={{
      width, maxWidth: "100%",
      background: T.bg,
      border: `1px solid ${T.border}`,
      borderRadius: "12px",
      boxShadow: "0 0 0 1px rgba(0,229,160,0.04), 0 24px 64px rgba(0,0,0,0.6)",
      fontFamily: T.font,
      overflow: "hidden",
      ...style,
    }}>
      {/* Panel header */}
      {title && (
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${T.border}`,
          background: T.bgHeader,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{
            fontSize: "11px", fontWeight: 600, letterSpacing: "0.12em",
            textTransform: "uppercase", color: T.textDim,
          }}>
            {title}
          </span>
        </div>
      )}

      {/* Sections */}
      {sections.map((section, i) => (
        <div key={section.title}>
          <SettingsSection section={section} />
          {i < sections.length - 1 && (
            <div style={{ height: "1px", background: T.border }} />
          )}
        </div>
      ))}
    </div>
  );
}
