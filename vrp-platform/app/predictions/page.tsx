export const metadata = {
  title: "Predictions",
};

export default function PredictionsPage() {
  return (
    <div className="page-shell">
      <h1>Predictions</h1>
      <p className="lead">
        Reserve this space for models that suggest demand, fleet sizing, or
        route risk from historical data—keeping the same visual language as the
        rest of the lab.
      </p>
      <div className="page-divider" />
      <p className="lead">Connect your inference service when ready.</p>
    </div>
  );
}
