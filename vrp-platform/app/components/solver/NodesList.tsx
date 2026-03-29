"use client";

import type { Node } from "../../types/vrp";

type Props = {
  depot: Node | null;
  customers: Node[];
  onDeleteCustomer: (customerId: number) => void;
};

export function NodesList({ depot, customers, onDeleteCustomer }: Props) {
  return (
    <div className="nodes-list custom-scrollbar">
      {depot ? (
        <div className="node-item depot">
          <div className="node-info">
            <div className="node-id">Depot</div>
            <div className="node-coords">
              Lat: {depot.lat.toFixed(5)}, Lng: {depot.lng.toFixed(5)}
            </div>
          </div>
        </div>
      ) : null}

      {customers.length ? (
        customers.map((customer) => (
          <div key={customer.id} className="node-item">
            <div className="node-info">
              <div className="node-id">Customer {customer.id}</div>
              <div className="node-coords">
                Lat: {customer.lat.toFixed(5)}, Lng: {customer.lng.toFixed(5)}
              </div>
              <div className="node-demand">Demand: {customer.demand}</div>
            </div>
            <button className="delete-btn" type="button" onClick={() => onDeleteCustomer(customer.id)}>
              Delete
            </button>
          </div>
        ))
      ) : (
        <p className="placeholder-text">No nodes added yet</p>
      )}
    </div>
  );
}

