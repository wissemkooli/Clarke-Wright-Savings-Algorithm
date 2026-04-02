export type Node = {
  id: number;
  lat: number;
  lng: number;
  x: number;
  y: number;
  demand: number;
};

export type VRPRequest = {
  nodes: Node[];
  depot_id: number;
  vehicle_capacity: number;
};

export type Route = {
  customers: number[];
  total_demand: number;
  total_distance: number;
  geometry: [number, number][];
  road_distance_km?: number;
  duration_s?: number;
};

export type MergeEvent = {
  i: number;
  j: number;
  routes: number[][];
  geometries?: [number, number][][];
};

export type SavingsRow = {
  i: number;
  j: number;
  saving: number;
};

export type VRPResponse = {
  routes: Route[];
  total_distance: number;
  total_road_distance_km?: number;
  total_duration_s?: number;
  num_vehicles?: number;
  computation_time_ms?: number;
  savings_table: SavingsRow[];
  steps: string[];
  merge_events?: MergeEvent[];
  edge_geometries?: Record<string, [number, number][]>;
};

export type VRPComparisonResponse = {
  clarke_wright: VRPResponse;
  cplex: VRPResponse;
};