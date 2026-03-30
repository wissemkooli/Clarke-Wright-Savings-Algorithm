"use client";

import { useCallback, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CSVData {
  headers: string[];
  rows: string[][];
  fileName: string;
  fileSize: number;
  totalRows: number;
}

type UploadState = "idle" | "dragging" | "parsing" | "ready" | "error";
type InferenceState = "idle" | "loading" | "done" | "error";

type ModelName = "LinearRegression" | "RandomForest" | "XGBoost" | "SARIMAX";

interface PredictionRow {
  date: string;
  predicted_sales: number;
  actual_sales: number;
}

interface PredictionResult {
  model: ModelName;
  predictions: PredictionRow[];
  scores: { rmse: number; mae: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INFERENCE_ENDPOINT = "http://localhost:8000/api/predictions/predict";
const PREVIEW_ROWS = 10;

const MODELS: ModelName[] = ["LinearRegression", "RandomForest", "XGBoost", "SARIMAX"];

const MODEL_LABELS: Record<ModelName, string> = {
  LinearRegression: "Linear Reg.",
  RandomForest: "Random Forest",
  XGBoost: "XGBoost",
  SARIMAX: "SARIMAX",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0]!.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines
    .slice(1)
    .map((line) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
  return { headers, rows };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: "0.2rem",
      padding: "0.5rem 0.85rem", borderRadius: "0.55rem",
      border: "1px solid var(--border)", background: "var(--surface)",
    }}>
      <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontSize: "0.875rem", color: "var(--accent-warm)", fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}

function ModelTabs({ selected, onChange }: { selected: ModelName; onChange: (m: ModelName) => void }) {
  return (
    <div style={{
      display: "flex", gap: "0.25rem",
      padding: "0.25rem",
      borderRadius: "0.65rem",
      border: "1px solid var(--border)",
      background: "var(--surface)",
      width: "fit-content",
    }}>
      {MODELS.map((m) => {
        const active = m === selected;
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            style={{
              padding: "0.4rem 0.9rem",
              borderRadius: "0.45rem",
              fontSize: "0.8125rem",
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
              border: "none",
              background: active
                ? "linear-gradient(120deg, var(--accent-warm), var(--accent-rose) 60%, var(--accent-violet))"
                : "transparent",
              color: active ? "#0c0e14" : "var(--text-muted)",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
            }}
          >
            {MODEL_LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}

function MetricCard({ label, value, unit }: { label: string; value: number; unit?: string }) {
  return (
    <div style={{
      flex: 1,
      padding: "1rem 1.25rem",
      borderRadius: "0.75rem",
      border: "1px solid var(--border)",
      background: "var(--surface)",
      display: "flex",
      flexDirection: "column",
      gap: "0.35rem",
    }}>
      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{
        fontSize: "1.75rem", fontWeight: 700,
        background: "linear-gradient(120deg, var(--accent-warm), var(--accent-rose))",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
      }}>
        {value.toLocaleString()}{unit && <span style={{ fontSize: "1rem" }}> {unit}</span>}
      </span>
    </div>
  );
}

function PredictionsChart({ predictions }: { predictions: PredictionRow[] }) {
  return (
    <div style={{
      borderRadius: "0.75rem",
      border: "1px solid var(--border)",
      background: "var(--surface)",
      padding: "1.25rem",
    }}>
      <p style={{ margin: "0 0 1rem", fontSize: "0.75rem", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        Predicted vs Actual Sales
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={predictions} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={false}
            width={55}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              fontSize: "0.8rem",
              color: "var(--text)",
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: "0.8rem", paddingTop: "0.75rem" }}
          />
          <Line
            type="monotone"
            dataKey="predicted_sales"
            name="Predicted"
            stroke="var(--accent-warm)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--accent-warm)" }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="actual_sales"
            name="Actual"
            stroke="var(--accent-violet)"
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={{ r: 3, fill: "var(--accent-violet)" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PredictionsTable({ predictions }: { predictions: PredictionRow[] }) {
  return (
    <div style={{
      overflowX: "auto",
      borderRadius: "0.75rem",
      border: "1px solid var(--border)",
      background: "var(--surface)",
    }} className="custom-scrollbar">
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["#", "Date", "Predicted Sales", "Actual Sales", "Δ Error"].map((h, i) => (
              <th key={i} style={{
                padding: "0.6rem 0.85rem",
                textAlign: i === 0 ? "center" : "left",
                color: i === 0 ? "var(--border)" : "var(--accent-violet)",
                fontWeight: 600, whiteSpace: "nowrap", letterSpacing: "0.02em",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {predictions.map((row, i) => {
            const delta = row.predicted_sales - row.actual_sales;
            const isOver = delta > 0;
            return (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <td style={{ padding: "0.5rem 0.85rem", color: "var(--border)", textAlign: "center" }}>{i + 1}</td>
                <td style={{ padding: "0.5rem 0.85rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{row.date}</td>
                <td style={{ padding: "0.5rem 0.85rem", color: "var(--accent-warm)", fontWeight: 500 }}>
                  {row.predicted_sales.toLocaleString()}
                </td>
                <td style={{ padding: "0.5rem 0.85rem", color: "var(--text-muted)" }}>
                  {row.actual_sales.toLocaleString()}
                </td>
                <td style={{
                  padding: "0.5rem 0.85rem", fontWeight: 500,
                  color: delta === 0 ? "var(--text-muted)" : isOver ? "var(--accent-rose)" : "var(--accent-warm)",
                }}>
                  {delta > 0 ? "+" : ""}{delta.toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UploadZone({ state, onFiles }: { state: UploadState; onFiles: (files: FileList) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
  }, [onFiles]);

  const isDragging = state === "dragging";
  const isParsing = state === "parsing";

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        position: "relative", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "1rem",
        width: "100%", minHeight: "13rem", borderRadius: "1rem",
        border: `2px dashed ${isDragging ? "var(--accent-warm)" : "var(--border)"}`,
        background: isDragging ? "rgba(244,201,168,0.04)" : "var(--surface)",
        cursor: "pointer", transition: "border-color 0.2s ease, background 0.2s ease",
        userSelect: "none",
      }}
    >
      <input ref={inputRef} type="file" accept=".csv" style={{ display: "none" }}
        onChange={(e) => e.target.files && onFiles(e.target.files)} />

      {isParsing ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
          <div style={{
            width: "2rem", height: "2rem", borderRadius: "50%",
            border: "2px solid var(--accent-warm)", borderTopColor: "transparent",
            animation: "spin 0.7s linear infinite",
          }} />
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", letterSpacing: "0.06em" }}>Parsing file…</span>
        </div>
      ) : (
        <>
          <svg width="40" height="40" viewBox="0 0 48 48" fill="none"
            stroke={isDragging ? "var(--accent-warm)" : "var(--border)"}
            strokeWidth="1.5" style={{ transition: "stroke 0.2s ease" }}>
            <rect x="6" y="10" width="36" height="28" rx="2" />
            <path d="M16 22h16M16 28h10" strokeLinecap="round" />
            <path d="M30 6v8h8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M30 6l8 8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: "0.9375rem", color: "var(--text)" }}>
              {isDragging ? "Release to upload" : "Drop your CSV here"}
            </p>
            <p style={{ margin: "0.3rem 0 0", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              or{" "}
              <span style={{ color: "var(--accent-warm)", textDecoration: "underline", textUnderlineOffset: "2px" }}>
                click to browse
              </span>
            </p>
          </div>
          <span style={{
            position: "absolute", bottom: "0.75rem", right: "1rem",
            fontSize: "0.65rem", color: "var(--border)", letterSpacing: "0.1em", textTransform: "uppercase",
          }}>.csv only</span>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function DataTable({ data }: { data: CSVData }) {
  const preview = data.rows.slice(0, PREVIEW_ROWS);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <StatPill label="File" value={data.fileName} />
        <StatPill label="Size" value={formatBytes(data.fileSize)} />
        <StatPill label="Rows" value={data.totalRows.toLocaleString()} />
        <StatPill label="Columns" value={data.headers.length} />
      </div>
      <div style={{
        overflowX: "auto", borderRadius: "0.75rem",
        border: "1px solid var(--border)", background: "var(--surface)",
      }} className="custom-scrollbar">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "0.6rem 0.75rem", textAlign: "left", color: "var(--border)", fontWeight: 500, whiteSpace: "nowrap", width: "2rem" }}>#</th>
              {data.headers.map((h, i) => (
                <th key={i} style={{ padding: "0.6rem 0.75rem", textAlign: "left", color: "var(--accent-violet)", fontWeight: 600, whiteSpace: "nowrap", letterSpacing: "0.02em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <td style={{ padding: "0.5rem 0.75rem", color: "var(--border)" }}>{ri + 1}</td>
                {data.headers.map((_, ci) => (
                  <td key={ci} style={{ padding: "0.5rem 0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{row[ci] ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.totalRows > PREVIEW_ROWS && (
          <div style={{ padding: "0.5rem 0.75rem", borderTop: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Showing {PREVIEW_ROWS} of {data.totalRows.toLocaleString()} rows
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PredictionsPage() {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [csvData, setCSVData] = useState<CSVData | null>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");

  const [selectedModel, setSelectedModel] = useState<ModelName>("LinearRegression");
  const [inferenceState, setInferenceState] = useState<InferenceState>("idle");
  const [inferenceError, setInferenceError] = useState("");
  const [result, setResult] = useState<PredictionResult | null>(null);

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFiles = useCallback((files: FileList) => {
    const file = files[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      setUploadError("Only .csv files are accepted.");
      setUploadState("error");
      return;
    }
    setUploadState("parsing");
    setUploadError("");
    setResult(null);
    setInferenceState("idle");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const { headers, rows } = parseCSV(text);
        if (headers.length === 0) {
          setUploadError("File appears empty or malformed.");
          setUploadState("error");
          return;
        }
        setCSVData({ headers, rows, fileName: file.name, fileSize: file.size, totalRows: rows.length });
        setRawFile(file);
        setUploadState("ready");
      } catch {
        setUploadError("Failed to parse CSV. Check the file format.");
        setUploadState("error");
      }
    };
    reader.onerror = () => { setUploadError("Could not read the file."); setUploadState("error"); };
    reader.readAsText(file);
  }, []);

  // ── Inference ──────────────────────────────────────────────────────────────

  const handleRunInference = async () => {
    if (!rawFile) return;
    setInferenceState("loading");
    setInferenceError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", rawFile);

      // model_name is passed as a query param — FastAPI reads it from the URL
      const url = `${INFERENCE_ENDPOINT}?model_name=${encodeURIComponent(selectedModel)}`;
      const response = await fetch(url, { method: "POST", body: formData });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(err.detail ?? `${response.status}`);
      }

      const data: PredictionResult = await response.json();
      setResult(data);
      setInferenceState("done");
    } catch (err) {
      setInferenceError(err instanceof Error ? err.message : "Unknown error");
      setInferenceState("error");
    }
  };

  // ── Model tab change — reset results ──────────────────────────────────────

  const handleModelChange = (m: ModelName) => {
    setSelectedModel(m);
    setResult(null);
    setInferenceState("idle");
    setInferenceError("");
  };

  // ── Reset ──────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setCSVData(null);
    setRawFile(null);
    setUploadState("idle");
    setUploadError("");
    setInferenceState("idle");
    setInferenceError("");
    setResult(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="page-shell"
      onDragOver={(e) => { e.preventDefault(); if (uploadState !== "ready") setUploadState("dragging"); }}
      onDragLeave={() => { if (uploadState === "dragging") setUploadState("idle"); }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1>Predictions</h1>
          <p className="lead">
            Upload historical sales data and run your inference service to get
            demand forecasts — feeding directly into fleet sizing and route planning.
          </p>
        </div>
        {uploadState === "ready" && (
          <button
            onClick={handleReset}
            style={{
              marginTop: "0.5rem", fontSize: "0.8125rem", fontWeight: 500,
              color: "var(--text-muted)", background: "var(--surface)",
              border: "1px solid var(--border)", borderRadius: "0.45rem",
              padding: "0.4rem 0.75rem", cursor: "pointer", transition: "color 0.15s ease, border-color 0.15s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--accent-rose)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent-rose)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
          >
            ✕ Clear
          </button>
        )}
      </div>

      <div className="page-divider" />

      {/* Upload zone */}
      {uploadState !== "ready" && <UploadZone state={uploadState} onFiles={handleFiles} />}

      {/* Upload error */}
      {uploadState === "error" && (
        <div style={{
          marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.75rem",
          padding: "0.75rem 1rem", borderRadius: "0.6rem",
          border: "1px solid rgba(232,165,152,0.3)", background: "rgba(232,165,152,0.07)",
          fontSize: "0.875rem", color: "var(--accent-rose)",
        }}>
          <span>⚠</span>
          <span>{uploadError}</span>
          <button onClick={handleReset} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--accent-rose)", cursor: "pointer", fontSize: "0.8125rem", textDecoration: "underline", textUnderlineOffset: "2px" }}>
            Retry
          </button>
        </div>
      )}

      {/* File loaded */}
      {uploadState === "ready" && csvData && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* CSV preview */}
          <DataTable data={csvData} />

          <div className="page-divider" />

          {/* Model selector */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Select model
            </span>
            <ModelTabs selected={selectedModel} onChange={handleModelChange} />
          </div>

          {/* Run button */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button
              onClick={handleRunInference}
              disabled={inferenceState === "loading"}
              style={{
                padding: "0.55rem 1.25rem", borderRadius: "0.55rem",
                fontSize: "0.875rem", fontWeight: 600,
                cursor: inferenceState === "loading" ? "not-allowed" : "pointer",
                border: "none",
                background: inferenceState === "loading"
                  ? "var(--surface-strong)"
                  : "linear-gradient(120deg, var(--accent-warm), var(--accent-rose) 60%, var(--accent-violet))",
                color: inferenceState === "loading" ? "var(--text-muted)" : "#0c0e14",
                transition: "opacity 0.15s ease",
                opacity: inferenceState === "loading" ? 0.6 : 1,
                display: "flex", alignItems: "center", gap: "0.5rem",
              }}
            >
              {inferenceState === "loading" ? (
                <>
                  <span style={{
                    display: "inline-block", width: "0.75rem", height: "0.75rem",
                    borderRadius: "50%", border: "2px solid var(--text-muted)",
                    borderTopColor: "transparent", animation: "spin 0.7s linear infinite",
                  }} />
                  Running…
                </>
              ) : (
                `Run ${MODEL_LABELS[selectedModel]} →`
              )}
            </button>

            {inferenceState === "done" && (
              <span style={{ fontSize: "0.875rem", color: "var(--accent-warm)" }}>✓ Done</span>
            )}
          </div>

          {/* Inference error */}
          {inferenceState === "error" && (
            <div style={{
              display: "flex", alignItems: "center", gap: "0.75rem",
              padding: "0.75rem 1rem", borderRadius: "0.6rem",
              border: "1px solid rgba(232,165,152,0.3)", background: "rgba(232,165,152,0.07)",
              fontSize: "0.875rem", color: "var(--accent-rose)",
            }}>
              <span>⚠</span>
              <span>Inference failed: {inferenceError}</span>
            </div>
          )}

          {/* Results */}
          {result && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

              {/* Metric cards */}
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <MetricCard label="RMSE" value={result.scores.rmse} unit="units" />
                <MetricCard label="MAE" value={result.scores.mae} unit="units" />
              </div>

              {/* Chart */}
              <PredictionsChart predictions={result.predictions} />

              {/* Table */}
              <PredictionsTable predictions={result.predictions} />
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}