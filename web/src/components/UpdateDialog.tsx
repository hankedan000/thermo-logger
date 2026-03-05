import { useState, useEffect, useRef, type CSSProperties } from "react";

// ── Types ──────────────────────────────────────────────────

type ButtonVariant = "primary" | "danger" | "ghost";

interface DialogButton {
  show: boolean;
  label: string;
  onClick: () => void;
  variant?: ButtonVariant;
}

interface UpdateDialogProps {
  open?: boolean;
  onClose?: () => void;
  /** Dialog title shown in the header. */
  title?: string;
  /** Array of log lines streamed from your backend. Append to this to stream output. */
  lines?: string[];
  /** Buttons rendered in the bottom-right footer. */
  buttons?: DialogButton[];
  /** CSS width of the dialog panel. @default "680px" */
  width?: string;
  /** Max visible lines before the console area scrolls. @default 12 */
  maxLines?: number;
}

interface ConsoleLineProps {
  line: string;
  index: number;
}

// ── Constants ──────────────────────────────────────────────

const LINE_HEIGHT_PX = 12.5 * 1.7 + 3; // fontSize * lineHeight + marginBottom ≈ 24.25px
const CONSOLE_VERTICAL_PADDING_PX = 16 * 2;

const VARIANT_STYLES: Record<ButtonVariant, CSSProperties> = {
  primary: { background: "#00e5a0", color: "#0a0f1a", border: "1px solid #00e5a0" },
  danger:  { background: "transparent", color: "#ff4d6d", border: "1px solid #ff4d6d" },
  ghost:   { background: "transparent", color: "#8892a4", border: "1px solid #2a3348" },
};

// ── Sub-components ─────────────────────────────────────────

function ConsoleLine({ line, index }: ConsoleLineProps) {
  const isError = /error|fail|exception/i.test(line);
  const isWarn  = /warn|warning/i.test(line);
  const isOk    = /success|done|complete|✓|✔/i.test(line);

  const prefixColor = isError ? "#ff4d6d" : isWarn ? "#f4c842" : isOk ? "#00e5a0" : "#6b8aad";
  const textColor   = isError ? "#ff4d6d" : isWarn ? "#f4c842" : isOk ? "#c8ffe9"  : "#8da9c4";
  const prefix      = isError ? "✖"       : isWarn ? "⚠"       : isOk ? "✔"        : "›";

  return (
    <div
      style={{
        display: "flex",
        gap: "10px",
        marginBottom: "3px",
        fontSize: "12.5px",
        lineHeight: "1.7",
        animation: "fadeSlideIn 0.18s ease both",
      }}
    >
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <span style={{ color: "#2e3f58", userSelect: "none", minWidth: "28px", textAlign: "right" }}>
        {String(index + 1).padStart(3, "0")}
      </span>
      <span style={{ color: prefixColor, minWidth: "14px" }}>{prefix}</span>
      <span style={{ color: textColor, wordBreak: "break-all" }}>{line}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────

/**
 * UpdateDialog — A centered popup dialog with a live-streaming console output area.
 *
 * Stream backend output by appending to the `lines` array.
 * The console grows up to `maxLines` rows then scrolls, always revealing the latest line.
 */
export default function UpdateDialog({
  open = true,
  onClose,
  title = "Console Output",
  lines = [],
  buttons = [],
  width = "680px",
  maxLines = 12,
}: UpdateDialogProps) {
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(open);
  const [animating, setAnimating] = useState(false);

  const maxConsoleHeight = Math.round(maxLines * LINE_HEIGHT_PX + CONSOLE_VERTICAL_PADDING_PX);

  // Auto-scroll to the latest line
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  // Handle open/close transitions
  useEffect(() => {
    if (open) {
      setVisible(true);
      requestAnimationFrame(() => setAnimating(true));
    } else {
      setAnimating(false);
      const t = setTimeout(() => setVisible(false), 260);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!visible) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(5, 8, 18, 0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 9999,
        opacity: animating ? 1 : 0,
        transition: "opacity 0.26s ease",
      }}
    >
      {/* Dialog panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: "calc(100vw - 40px)",
          display: "flex",
          flexDirection: "column",
          background: "#0d1424",
          border: "1px solid #1e2d45",
          borderRadius: "12px",
          boxShadow:
            "0 0 0 1px rgba(0,229,160,0.06), 0 32px 80px rgba(0,0,0,0.7), 0 0 60px rgba(0,229,160,0.04)",
          fontFamily: "'IBM Plex Mono', 'Fira Code', 'Cascadia Code', monospace",
          transform: animating ? "translateY(0) scale(1)" : "translateY(18px) scale(0.97)",
          transition: "transform 0.26s cubic-bezier(0.34, 1.4, 0.64, 1), opacity 0.26s ease",
          overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid #1e2d45",
            background: "#0a0f1a",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: "12px",
              fontWeight: 500,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#4a5a72",
            }}
          >
            {title}
          </span>

          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#4a5a72",
              fontSize: "18px",
              lineHeight: 1,
              padding: "2px 4px",
              borderRadius: "4px",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ccd6f6")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#4a5a72")}
          >
            ✕
          </button>
        </div>

        {/* ── Console body ── */}
        <div
          style={{
            overflowY: "auto",
            padding: "16px 20px",
            background: "#070b14",
            maxHeight: `${maxConsoleHeight}px`,
            scrollbarWidth: "thin",
            scrollbarColor: "#1e2d45 transparent",
          }}
        >
          {lines.length === 0 ? (
            <span style={{ color: "#2e3f58", fontSize: "13px" }}>Waiting for output…</span>
          ) : (
            lines.map((line, i) => <ConsoleLine key={i} line={line} index={i} />)
          )}
          <div ref={consoleEndRef} />
        </div>

        {/* ── Footer / buttons ── */}
        {buttons.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "10px",
              padding: "12px 18px",
              borderTop: "1px solid #1e2d45",
              background: "#0a0f1a",
              flexShrink: 0,
            }}
          >
            {buttons.map(({ label, onClick, variant = "ghost" }, i) => (
              <button
                hidden={!buttons[i].show}
                key={i}
                onClick={onClick}
                style={{
                  ...VARIANT_STYLES[variant],
                  fontFamily: "inherit",
                  fontSize: "12px",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  padding: "8px 18px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  transition: "opacity 0.15s, transform 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
