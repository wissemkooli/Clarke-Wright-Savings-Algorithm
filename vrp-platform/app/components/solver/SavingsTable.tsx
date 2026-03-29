"use client";

import type { SavingsRow } from "../../types/vrp";

type Props = {
  savings: SavingsRow[];
};

export function SavingsTable({ savings }: Props) {
  if (!savings.length) {
    return (
      <p className="placeholder-text">
        Savings will appear here after you solve.
      </p>
    );
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Customer i</th>
          <th>Customer j</th>
          <th>Saving (km)</th>
        </tr>
      </thead>
      <tbody>
        {savings.map((s, idx) => (
          <tr key={`${s.i}-${s.j}-${idx}`}>
            <td>{idx + 1}</td>
            <td>{s.i}</td>
            <td>{s.j}</td>
            <td>{Number.isFinite(s.saving) ? s.saving.toFixed(2) : String(s.saving)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

