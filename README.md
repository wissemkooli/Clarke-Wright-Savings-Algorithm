# Clarke–Wright VRP Solver 🌍🚚

Interactive web application that implements the **Clarke–Wright savings algorithm** to solve a capacitated Vehicle Routing Problem (VRP) on top of a real OpenStreetMap basemap. Users can set a depot and customer locations directly on the map, assign demands and vehicle capacity, then visualize optimized routes that respect capacity constraints and follow real road networks.

![Clarke-Wright Algorithm Demo](https://img.shields.io/badge/Algorithm-Clarke--Wright-blue)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-green)
![Leaflet](https://img.shields.io/badge/Maps-Leaflet.js-brightgreen)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 📸 Features

- 🗺️ **Interactive OpenStreetMap interface**
  - Click to place depot and customers
  - Visual markers with IDs and demands
  - Real-time map interaction

- 🚚 **Clarke–Wright savings algorithm**
  - Classic VRP heuristic from operations research
  - Haversine distance calculation for geographic coordinates
  - Savings formula: S(i,j) = d(0,i) + d(0,j) - d(i,j)

- 📦 **Capacity-constrained routing**
  - Define vehicle capacity and customer demands
  - Routes merge only if capacity permits
  - See load per vehicle (e.g., 45/100 = 45% full)

- 🛣️ **Road-following routes**
  - Uses OSRM routing service to snap routes to real roads
  - Smooth, realistic vehicle paths
  - Hover tooltips show route information

- 📊 **Algorithm visualization**
  - Top 20 savings pairs ranked
  - Step-by-step execution log
  - Merge decisions with capacity validation

---

## 🚀 Quick Start

### Prerequisites

- Python 3.8+
- Modern web browser
- Internet connection (for map tiles and routing)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/wissemkooli/Clarke-Wright-Savings-Algorithm
   cd Clarke-Wright-Savings-Algorithm
   ```

2. **Install dependencies**
   ```bash
   pip install fastapi uvicorn pydantic
   ```

3. **Run the server**
   ```bash
   uvicorn backend.main:app --reload
   ```

4. **Open in browser**
   ```
   http://127.0.0.1:8000/static/index.html
   ```

---

## 📁 Project Structure

```
Clarke-Wright-Savings-Algorithm/
├── backend/
│   └── main.py              # FastAPI server + Clarke-Wright algorithm
├── static/
│   ├── index.html           # Frontend UI
│   ├── style.css            # Styling
│   └── app.js               # Map logic & visualization
└── README.md
```

---

## 🎮 How to Use

### Step 1: Set Depot
1. Click **"Set Depot (click map)"**
2. Click anywhere on the map to place the depot (🔴 red marker)

### Step 2: Add Customers
1. Adjust **"Customer Demand"** if needed (default: 15)
2. Click **"Add Customers (click map)"**
3. Click on the map to add customers (🔵 blue markers)
4. Each customer shows their ID and demand

### Step 3: Configure Vehicle
1. Set **"Vehicle Capacity"** (default: 100)
2. Higher capacity = fewer vehicles needed
3. Lower capacity = more vehicles needed

### Step 4: Solve
1. Click **"Solve with Clarke-Wright"**
2. Watch routes animate on the map
3. Each route gets a different color

### Step 5: Analyze Results
- **Results panel**: Shows total distance, number of vehicles, and per-route details
- **Top Savings tab**: See which customer pairs saved the most distance
- **Algorithm Steps tab**: Detailed execution log with merge decisions

---

## 🧮 Clarke–Wright Algorithm Explained

The Clarke–Wright savings algorithm is a heuristic for solving the Vehicle Routing Problem:

### Initial State
- Each customer has its own route: `Depot → Customer i → Depot`
- Very inefficient (one vehicle per customer)

### Savings Calculation
For every pair of customers (i, j), calculate the saving:

```
S(i,j) = distance(depot, i) + distance(depot, j) - distance(i, j)
```

This represents the distance saved by visiting both customers in one route instead of two separate routes.

### Merging Process
1. Sort all savings in descending order
2. For each pair (i, j) with highest savings:
   - Check if both customers are at route endpoints
   - Check if merging doesn't exceed vehicle capacity
   - If valid, merge the two routes
3. Continue until no more merges are possible

### Result
Optimized routes that minimize total distance while respecting capacity constraints.

---

## 🛠️ Technical Details

### Backend (FastAPI)
- **Haversine formula** for calculating real geographic distances
- **Pydantic models** for type-safe API contracts
- **CORS enabled** for local development
- Returns JSON with routes, distances, savings, and algorithm steps

### Frontend (JavaScript + Leaflet)
- **Leaflet.js** for interactive maps (OpenStreetMap tiles)
- **OSRM API** for road-following route geometry
- **Vanilla JavaScript** (no framework dependencies)
- Responsive design with clean UI

### Routing Service
- Uses public OSRM (Open Source Routing Machine) servers
- Converts waypoints to realistic road paths
- Free, no API key required

---

## 📊 Example Scenario

**Setup:**
- Vehicle Capacity: 50
- Customer 1: Demand 20
- Customer 2: Demand 25
- Customer 3: Demand 30
- Customer 4: Demand 15

**Result:**
- Vehicle 1: Depot → 1 → 4 → Depot (Load: 35/50)
- Vehicle 2: Depot → 2 → Depot (Load: 25/50)
- Vehicle 3: Depot → 3 → Depot (Load: 30/50)

Customers 1 and 4 are merged because their combined demand (35) fits in the vehicle capacity (50).

---

## 🔧 Configuration Options

### Vehicle Capacity
- Controls maximum load per vehicle
- Lower values = more vehicles, more routes
- Higher values = fewer vehicles, longer routes

### Customer Demand
- Set default demand for new customers
- Can vary per customer in real scenarios
- Affects route merging decisions

---

## 🌍 Supported Locations

Works worldwide! The app uses:
- **OpenStreetMap** for global map coverage
- **Haversine formula** for accurate geographic distances
- **OSRM** with worldwide road network data

Tested in: Tunisia, Europe, North America, and more.

---

## 🚧 Known Limitations

- **OSRM dependency**: Requires internet connection and relies on public server availability
- **Capacity only**: Doesn't support time windows, multiple depots, or heterogeneous fleet
- **Heuristic solution**: Clarke-Wright is fast but doesn't guarantee optimal solutions
- **No persistence**: Data is lost on page refresh

---

## 🔮 Future Enhancements

Potential improvements:
- [ ] Time windows for customers
- [ ] Multiple vehicle types with different capacities
- [ ] Multiple depots
- [ ] Save/load scenarios to localStorage
- [ ] Export routes as GeoJSON or CSV
- [ ] Route optimization with 2-opt or 3-opt
- [ ] Distance matrix caching
- [ ] Offline mode with embedded routing

---

## 📚 References

- [Clarke & Wright (1964) - Original paper on the savings algorithm](https://www.jstor.org/stable/167703)
- [OpenStreetMap](https://www.openstreetmap.org)
- [Leaflet.js Documentation](https://leafletjs.com)
- [OSRM Project](http://project-osrm.org)
- [FastAPI Documentation](https://fastapi.tiangolo.com)

---

## 👨‍💻 Author

**Wissem Kooli**
- GitHub: [@wissemkooli](https://github.com/wissemkooli)
- Project: [Clarke-Wright-Savings-Algorithm](https://github.com/wissemkooli/Clarke-Wright-Savings-Algorithm)

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Clarke & Wright for the original algorithm
- OpenStreetMap contributors for map data
- OSRM team for the routing service
- FastAPI and Leaflet.js communities

---

## 🐛 Found a Bug?

Please open an issue on [GitHub Issues](https://github.com/wissemkooli/Clarke-Wright-Savings-Algorithm/issues) with:
- Description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

---

## ⭐ Star This Repo!

If you find this project useful, please give it a star! ⭐

It helps others discover the project and motivates further development.
