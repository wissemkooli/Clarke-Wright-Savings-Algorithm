import docplex.mp.model as cpx
import math

class Node:
    def __init__(self, id, demand):
        self.id = id
        self.demand = demand

nodes = [Node(0, 0), Node(1, 10), Node(2, 20), Node(3, 10)]
N = len(nodes)
m = 3
Q = 50

mdl = cpx.Model(name="CVRP")
x = {(i, j): mdl.binary_var(name=f"x_{i}_{j}") for i in range(N) for j in range(N) if i != j}
f = {(i, j): mdl.continuous_var(lb=0, ub=Q, name=f"f_{i}_{j}") for i in range(N) for j in range(N) if i != j}

dist_idx = {(i, j): 1 for i in range(N) for j in range(N) if i != j}

mdl.minimize(mdl.sum(dist_idx[i, j] * x[i, j] for i, j in x))

total_demand = sum(c.demand for c in nodes[1:])
m_min = math.ceil(total_demand / Q) if Q > 0 else 1

mdl.add_constraint(mdl.sum(x[0, j] for j in range(1, N)) >= m_min)
mdl.add_constraint(mdl.sum(x[0, j] for j in range(1, N)) <= m)
mdl.add_constraint(mdl.sum(x[i, 0] for i in range(1, N)) >= m_min)
mdl.add_constraint(mdl.sum(x[i, 0] for i in range(1, N)) <= m)

for i in range(1, N):
    mdl.add_constraint(mdl.sum(x[j, i] for j in range(N) if j != i) == 1)
    mdl.add_constraint(mdl.sum(x[i, j] for j in range(N) if j != i) == 1)
    mdl.add_constraint(
        mdl.sum(f[j, i] for j in range(N) if j != i) -
        mdl.sum(f[i, j] for j in range(N) if j != i)
        == nodes[i].demand
    )

for i, j in x:
    if j == 0:
        mdl.add_constraint(f[i, 0] == 0)
    else:
        if i == 0:
            mdl.add_constraint(f[0, j] <= Q * x[0, j])
        else:
            mdl.add_constraint(f[i, j] <= (Q - nodes[i].demand) * x[i, j])
        mdl.add_constraint(f[i, j] >= nodes[j].demand * x[i, j])

sol = mdl.solve(log_output=True)
if sol:
    print("SOLVED")
    for i, j in x:
        if dict(sol.get_value_dict(x)).get(x[i,j], 0) > 0.5:
            print(f"Edge {i}->{j}, f={dict(sol.get_value_dict(f)).get(f[i,j], 0)}")
else:
    print("INFEASIBLE")
