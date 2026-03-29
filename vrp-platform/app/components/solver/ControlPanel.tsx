"use client";

import { useMemo, useRef } from "react";

type SolverMode = "idle" | "setDepot" | "addCustomer";

type Props = {
  vehicleCapacity: number;
  defaultDemand: number;
  mode: SolverMode;
  isLoading: boolean;
  statusText: string;
  disableSolve: boolean;
  onVehicleCapacityChange: (value: number) => void;
  onDefaultDemandChange: (value: number) => void;
  onSetDepot: () => void;
  onAddCustomers: () => void;
  onSolve: () => void;
  onClear: () => void;
  onImportCsvText: (csvText: string) => void;
};

export function ControlPanel({
  vehicleCapacity,
  defaultDemand,
  mode,
  isLoading,
  statusText,
  disableSolve,
  onVehicleCapacityChange,
  onDefaultDemandChange,
  onSetDepot,
  onAddCustomers,
  onSolve,
  onClear,
  onImportCsvText,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const solveLabel = useMemo(() => (isLoading ? "Solving..." : "Solve Clarke–Wright"), [isLoading]);

  return (
    <>
      <div className="vrp-panel">
        <h2 className="vrp-panel-title">Configuration</h2>
        <div className="form-group">
          <label htmlFor="capacity">Vehicle capacity</label>
          <input
            type="number"
            id="capacity"
            value={Number.isFinite(vehicleCapacity) ? vehicleCapacity : ""}
            min={1}
            onChange={(e) => onVehicleCapacityChange(Number(e.target.value))}
          />
        </div>
        <div className="form-group mt-3">
          <label htmlFor="defaultDemand">Default demand</label>
          <input
            type="number"
            id="defaultDemand"
            value={Number.isFinite(defaultDemand) ? defaultDemand : ""}
            min={0}
            onChange={(e) => onDefaultDemandChange(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="vrp-panel">
        <h2 className="vrp-panel-title">Map actions</h2>
        <p className="vrp-legend">
          <span style={{ color: "var(--vrp-rose, #e8a598)" }}>●</span> Depot ·{" "}
          <span style={{ color: "var(--vrp-violet, #b8a9d9)" }}>●</span> Customer
        </p>
        <div className="flex flex-col gap-0">
          <button id="setDepotBtn" className="btn btn-warning" type="button" onClick={onSetDepot} disabled={isLoading}>
            {mode === "setDepot" ? "Setting depot..." : "Set depot"}
          </button>
          <button
            id="addCustomerBtn"
            className="btn btn-primary"
            type="button"
            onClick={onAddCustomers}
            disabled={isLoading}
          >
            {mode === "addCustomer" ? "Adding customers..." : "Add customers"}
          </button>
          <button
            id="solveBtn"
            className="btn btn-success"
            type="button"
            onClick={onSolve}
            disabled={disableSolve}
          >
            {solveLabel}
          </button>
          <button id="clearBtn" className="btn btn-secondary" type="button" onClick={onClear} disabled={isLoading}>
            Clear all
          </button>

          <input
            id="csvImportInput"
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            tabIndex={-1}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const text = await file.text();
                onImportCsvText(text);
              } catch {
                // Keep behavior close to vanilla: status update handled by caller
                onImportCsvText("");
              }
            }}
          />
          <button
            id="importCsvBtn"
            className="btn btn-secondary"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
          >
            Import CSV
          </button>
        </div>
        <div className="vrp-status">
          <span className="vrp-status-label">Status</span>
          <span id="statusText">{statusText}</span>
        </div>
      </div>
    </>
  );
}

