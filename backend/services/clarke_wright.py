import math
from typing import List
from fastapi import HTTPException
from backend.schemas.vrp import Node, Route, VRPResponse


def calculate_distance(node1: Node, node2: Node) -> float:
    R = 6371
    lat1_rad = math.radians(node1.lat)
    lat2_rad = math.radians(node2.lat)
    delta_lat = math.radians(node2.lat - node1.lat)
    delta_lng = math.radians(node2.lng - node1.lng)
    a = (math.sin(delta_lat / 2) ** 2 +
         math.cos(lat1_rad) * math.cos(lat2_rad) *
         math.sin(delta_lng / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def clarke_wright_algorithm(nodes: List[Node], depot_id: int, capacity: float) -> VRPResponse:
    steps = []
    depot = next((n for n in nodes if n.id == depot_id), None)
    if depot is None:
        raise HTTPException(status_code=400, detail=f"Depot ID {depot_id} not found in nodes.")

    customers = [n for n in nodes if n.id != depot_id]

    violations = [c for c in customers if c.demand > capacity]
    if violations:
        if len(violations) == 1:
            c = violations[0]
            msg = f"Customer {c.id} has demand {c.demand} which exceeds vehicle capacity {capacity}."
        else:
            parts = [f"customer {c.id} (demand {c.demand})" for c in violations]
            msg = f"The following customers exceed vehicle capacity ({capacity}): {', '.join(parts)}."
        raise HTTPException(status_code=400, detail=msg)

    customer_dict = {c.id: c for c in customers}

    steps.append("Step 1: Calculating distance matrix using Haversine formula")
    distances = {}
    for i in range(len(nodes)):
        for j in range(len(nodes)):
            if i != j:
                distances[(nodes[i].id, nodes[j].id)] = calculate_distance(nodes[i], nodes[j])

    steps.append("Step 2: Calculating savings for all customer pairs")
    savings = []
    for i in range(len(customers)):
        for j in range(i + 1, len(customers)):
            c1, c2 = customers[i], customers[j]
            saving_value = (distances[(depot.id, c1.id)] +
                            distances[(depot.id, c2.id)] -
                            distances[(c1.id, c2.id)])
            savings.append({
                'i': c1.id,
                'j': c2.id,
                'saving': round(saving_value, 2),
                'distance_i': round(distances[(depot.id, c1.id)], 2),
                'distance_j': round(distances[(depot.id, c2.id)], 2),
                'distance_ij': round(distances[(c1.id, c2.id)], 2)
            })

    savings.sort(key=lambda x: x['saving'], reverse=True)
    steps.append(f"Step 3: Sorted {len(savings)} savings in descending order")

    routes = [{'customers': [c.id], 'demand': c.demand} for c in customers]
    steps.append(f"Step 4: Initialized {len(routes)} individual routes with capacity {capacity}")

    steps.append("Step 5: Merging routes based on savings...")
    merges = 0

    for saving in savings:
        i, j = saving['i'], saving['j']
        route_i_idx = route_j_idx = pos_i = pos_j = None

        for idx, route in enumerate(routes):
            if i in route['customers']:
                route_i_idx = idx
                pos_i = 0 if route['customers'][0] == i else (len(route['customers']) - 1 if route['customers'][-1] == i else None)
            if j in route['customers']:
                route_j_idx = idx
                pos_j = 0 if route['customers'][0] == j else (len(route['customers']) - 1 if route['customers'][-1] == j else None)

        if (route_i_idx is not None and route_j_idx is not None and
                route_i_idx != route_j_idx and pos_i is not None and pos_j is not None):

            route_i = routes[route_i_idx]
            route_j = routes[route_j_idx]
            combined_demand = route_i['demand'] + route_j['demand']

            if combined_demand <= capacity:
                if pos_i == len(route_i['customers']) - 1 and pos_j == 0:
                    new_customers = route_i['customers'] + route_j['customers']
                elif pos_i == 0 and pos_j == len(route_j['customers']) - 1:
                    new_customers = route_j['customers'] + route_i['customers']
                elif pos_i == len(route_i['customers']) - 1 and pos_j == len(route_j['customers']) - 1:
                    new_customers = route_i['customers'] + route_j['customers'][::-1]
                elif pos_i == 0 and pos_j == 0:
                    new_customers = route_i['customers'][::-1] + route_j['customers']
                else:
                    continue

                new_route = {'customers': new_customers, 'demand': combined_demand}

                if route_i_idx > route_j_idx:
                    routes.pop(route_i_idx)
                    routes.pop(route_j_idx)
                else:
                    routes.pop(route_j_idx)
                    routes.pop(route_i_idx)

                routes.append(new_route)
                merges += 1
                steps.append(f"  ✓ Merged customers {i} and {j} | Combined demand: {combined_demand:.1f}/{capacity} | Saving: {saving['saving']:.2f} km")
            else:
                steps.append(f"  ✗ Cannot merge {i} and {j} | Would exceed capacity: {combined_demand:.1f} > {capacity}")

    steps.append(f"Step 6: Completed {merges} merges, final routes: {len(routes)}")

    final_routes = []
    total_dist = 0

    for idx, route in enumerate(routes):
        route_distance = distances[(depot.id, route['customers'][0])]
        for k in range(len(route['customers']) - 1):
            route_distance += distances[(route['customers'][k], route['customers'][k + 1])]
        route_distance += distances[(route['customers'][-1], depot.id)]

        actual_demand = sum(customer_dict[cid].demand for cid in route['customers'])
        final_routes.append(Route(
            customers=route['customers'],
            total_demand=round(actual_demand, 2),
            total_distance=round(route_distance, 2)
        ))
        total_dist += route_distance
        steps.append(f"  Route {idx + 1}: {len(route['customers'])} customers, demand: {actual_demand:.1f}/{capacity}, distance: {route_distance:.2f} km")

    return VRPResponse(
        routes=final_routes,
        total_distance=round(total_dist, 2),
        savings_table=savings[:20],
        steps=steps
    )