"use client";

type Props = {
  steps: string[];
};

export function AlgorithmSteps({ steps }: Props) {
  if (!steps.length) {
    return <p className="placeholder-text">Steps will appear here after you solve.</p>;
  }

  return (
    <>
      {steps.map((step, idx) => (
        <div key={idx} className="step">
          {step}
        </div>
      ))}
    </>
  );
}

