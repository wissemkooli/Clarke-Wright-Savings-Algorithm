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
};

export type SavingsRow = {
  i: number;
  j: number;
  saving: number;
};

export type VRPResponse = {
  routes: Route[];
  total_distance: number;
  savings_table: SavingsRow[];
  steps: string[];
};

