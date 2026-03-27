export const metadata = {
  title: "Analytics",
};

export default function AnalyticsPage() {
  return (
    <div className="page-shell">
      <h1>Analytics</h1>
      <p className="lead">
        Benchmark Clarke–Wright against exact solvers such as CPLEX: gap,
        runtime, and instance statistics will live here as you wire the backend.
      </p>
      <div className="page-divider" />
      <p className="lead">This section is ready for charts and saved runs.</p>
    </div>
  );
}
