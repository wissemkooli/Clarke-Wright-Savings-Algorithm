import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-zinc-950 text-white">
      <h1 className="text-6xl font-extrabold mb-6 tracking-tight bg-gradient-to-br from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent text-center">
        VRP Master's Platform
      </h1>
      <p className="max-w-2xl text-center text-lg text-zinc-400 mb-10">
        Advanced research platform comparing Clarke-Wright heuristics against CPLEX optimal solutions for the Vehicle Routing Problem. Includes analytics, ML predictions, and automated reporting.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl w-full">
        <Link href="/solver" className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-indigo-500 hover:bg-zinc-800 transition-all group">
          <h2 className="text-2xl font-semibold mb-2 group-hover:text-indigo-400 transition-colors">Solver Interface &rarr;</h2>
          <p className="text-zinc-500">Run CW vs CPLEX directly on the map and compare results.</p>
        </Link>

        <Link href="/analytics" className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-blue-500 hover:bg-zinc-800 transition-all group">
          <h2 className="text-2xl font-semibold mb-2 group-hover:text-blue-400 transition-colors">Analytics &rarr;</h2>
          <p className="text-zinc-500">Visualize benchmarks and performance metrics.</p>
        </Link>

        <Link href="/predictions" className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500 hover:bg-zinc-800 transition-all group">
          <h2 className="text-2xl font-semibold mb-2 group-hover:text-emerald-400 transition-colors">Predictions &rarr;</h2>
          <p className="text-zinc-500">View ML model predictions for upcoming deliveries.</p>
        </Link>
        
        <Link href="/report" className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-pink-500 hover:bg-zinc-800 transition-all group">
          <h2 className="text-2xl font-semibold mb-2 group-hover:text-pink-400 transition-colors">Generate Report &rarr;</h2>
          <p className="text-zinc-500">Export PDF reports of scenarios and solutions.</p>
        </Link>
      </div>
    </div>
  );
}
