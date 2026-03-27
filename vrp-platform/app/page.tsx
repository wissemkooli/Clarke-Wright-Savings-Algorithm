import Link from "next/link";

export default function Home() {
  return (
    <>
      <div className="home-hero">
        <p className="home-hero__eyebrow">Operations research, on a map</p>
        <h1>Plan routes that respect capacity and the real road network</h1>
        <p>
          A quiet workspace for Clarke–Wright savings on OpenStreetMap: place a
          depot and customers, then watch merges and savings unfold with
          road-snapped geometry—not a generic dashboard template.
        </p>
      </div>

      <div className="home-grid">
        <Link href="/solver" className="home-card home-card--solver">
          <h2>Solver</h2>
          <p>
            Interactive map, demand controls, and step-by-step savings with the
            classic heuristic.
          </p>
        </Link>

        <Link href="/analytics" className="home-card home-card--analytics">
          <h2>Analytics</h2>
          <p>
            Benchmarks and performance views for heuristics versus exact
            methods.
          </p>
        </Link>

        <Link href="/predictions" className="home-card home-card--predictions">
          <h2>Predictions</h2>
          <p>
            Placeholder for ML-assisted workload and delivery forecasts.
          </p>
        </Link>

        <Link href="/report" className="home-card home-card--report">
          <h2>Reports</h2>
          <p>
            Export-oriented views for scenarios and solution summaries.
          </p>
        </Link>
      </div>
    </>
  );
}
