const API_URL = 'http://localhost:8000';

let map;
let depot = null;
let customers = [];
let nextId = 1;
let mode = 'idle';
let markers = [];
let routeLines = [];
let isVisualizationRunning = false;

window.initializeVRPMapp = function() {
    // Clear previous map if it exists
    if (map) {
        map.off();
        map.remove();
        map = null;
    }
    initMap();
    setupEventListeners();
};

// Make sure it runs if loaded for the first time
setTimeout(() => {
    if (!map && document.getElementById('map')) {
        window.initializeVRPMapp();
    }
}, 500);

function initMap() {
    map = L.map('map').setView([36.8065, 10.1815], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    console.log('Map initialized successfully!');
}

function getCapacityViolationMessage(customerList, capacity) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
        return 'Enter a valid vehicle capacity greater than zero.';
    }
    const bad = customerList.filter(function(c) {
        return c.demand > capacity;
    });
    if (bad.length === 0) {
        return null;
    }
    if (bad.length === 1) {
        var c = bad[0];
        return 'Customer ' + c.id + ' has demand ' + c.demand + ' which exceeds vehicle capacity ' + capacity + '.';
    }
    return (
        'The following customers exceed vehicle capacity (' + capacity + '): ' +
        bad.map(function(c) {
            return 'customer ' + c.id + ' (demand ' + c.demand + ')';
        }).join(', ') +
        '.'
    );
}

function updateSolveButtonState() {
    var btn = document.getElementById('solveBtn');
    if (!btn) {
        return;
    }
    var capacity = parseFloat(document.getElementById('capacity').value);
    var violation = getCapacityViolationMessage(customers, capacity);
    var badCapacity = !Number.isFinite(capacity) || capacity <= 0;
    var capBlock = badCapacity || violation !== null;
    var baseDisable = !depot || customers.length < 2 || isVisualizationRunning;
    btn.disabled = baseDisable || capBlock;
}

async function parseErrorResponse(response) {
    var msg = 'Server error: ' + response.status;
    try {
        var errBody = await response.json();
        var d = errBody.detail;
        if (typeof d === 'string') {
            return d;
        }
        if (Array.isArray(d) && d.length && d[0].msg) {
            return d
                .map(function(e) {
                    return e.msg;
                })
                .join('; ');
        }
    } catch (_) {}
    return msg;
}

function setupEventListeners() {
    document.getElementById('setDepotBtn').addEventListener('click', function() {
        mode = 'setDepot';
        updateStatus('Click on the map to set depot location');
    });

    document.getElementById('addCustomerBtn').addEventListener('click', function() {
        mode = 'addCustomer';
        updateStatus('Click on the map to add customers');
    });

    document.getElementById('clearBtn').addEventListener('click', clearAll);
    document.getElementById('solveBtn').addEventListener('click', solveProblem);

    var importCsvBtn = document.getElementById('importCsvBtn');
    var csvImportInput = document.getElementById('csvImportInput');
    if (importCsvBtn && csvImportInput) {
        importCsvBtn.addEventListener('click', function() {
            csvImportInput.click();
        });
        csvImportInput.addEventListener('change', function(e) {
            var file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file) {
                return;
            }
            var reader = new FileReader();
            reader.onload = function() {
                importFromCsvText(reader.result);
            };
            reader.onerror = function() {
                updateStatus('Could not read CSV file.');
            };
            reader.readAsText(file, 'UTF-8');
        });
    }

    map.on('click', function(e) {
        handleMapClick(e.latlng);
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.tab + '-tab').classList.add('active');
        });
    });

    var capInput = document.getElementById('capacity');
    if (capInput) {
        capInput.addEventListener('input', updateSolveButtonState);
        capInput.addEventListener('change', updateSolveButtonState);
    }

    updateSolveButtonState();
}

function handleMapClick(latlng) {
    if (mode === 'setDepot') {
        setDepot(latlng);
    } else if (mode === 'addCustomer') {
        addCustomer(latlng);
    }
}

function stripVrpCsv(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }
    var t = text;
    if (t.charCodeAt(0) === 0xfeff) {
        t = t.slice(1);
    }
    return t.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function splitCsvLines(text) {
    return text.split('\n').map(function(l) {
        return l.trim();
    }).filter(function(l) {
        return l.length > 0;
    });
}

function parseRowCells(line) {
    return line.split(',').map(function(s) {
        return s.trim();
    });
}

function parseVrpCsv(text) {
    var raw = stripVrpCsv(text);
    if (!raw) {
        return { error: 'CSV is empty.' };
    }
    var lines = splitCsvLines(raw);
    if (lines.length < 2) {
        return { error: 'CSV must have a depot row (lat, lng) and at least one customer row (lat, lng, demand).' };
    }

    var depotCells = parseRowCells(lines[0]);
    if (depotCells.length !== 2) {
        return { error: 'Row 1 (depot) must have exactly 2 columns: lat, lng.' };
    }
    var depotLat = parseFloat(depotCells[0]);
    var depotLng = parseFloat(depotCells[1]);
    if (!Number.isFinite(depotLat) || !Number.isFinite(depotLng)) {
        return { error: 'Row 1 (depot): lat and lng must be valid numbers.' };
    }
    if (depotLat < -90 || depotLat > 90 || depotLng < -180 || depotLng > 180) {
        return { error: 'Row 1 (depot): lat must be between -90 and 90, lng between -180 and 180.' };
    }

    var customerRows = [];
    for (var i = 1; i < lines.length; i++) {
        var cells = parseRowCells(lines[i]);
        if (cells.length !== 3) {
            return { error: 'Row ' + (i + 1) + ' must have exactly 3 columns: lat, lng, demand.' };
        }
        var clat = parseFloat(cells[0]);
        var clng = parseFloat(cells[1]);
        var demand = parseFloat(cells[2]);
        if (!Number.isFinite(clat) || !Number.isFinite(clng) || !Number.isFinite(demand)) {
            return { error: 'Row ' + (i + 1) + ': lat, lng, and demand must be valid numbers.' };
        }
        if (clat < -90 || clat > 90 || clng < -180 || clng > 180) {
            return { error: 'Row ' + (i + 1) + ': lat must be between -90 and 90, lng between -180 and 180.' };
        }
        if (demand < 0) {
            return { error: 'Row ' + (i + 1) + ': demand cannot be negative.' };
        }
        customerRows.push({ lat: clat, lng: clng, demand: demand });
    }

    return {
        depot: { lat: depotLat, lng: depotLng },
        customers: customerRows
    };
}

function fitMapToImportedNodes() {
    if (!map || !depot) {
        return;
    }
    var bounds = L.latLngBounds([depot.lat, depot.lng]);
    customers.forEach(function(c) {
        bounds.extend([c.lat, c.lng]);
    });
    try {
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
    } catch (err) {
        map.setView([depot.lat, depot.lng], 13);
    }
}

function importFromCsvText(text) {
    var parsed = parseVrpCsv(text);
    if (parsed.error) {
        updateStatus('CSV error: ' + parsed.error);
        return;
    }
    clearAll();
    setDepot(L.latLng(parsed.depot.lat, parsed.depot.lng));
    for (var j = 0; j < parsed.customers.length; j++) {
        var row = parsed.customers[j];
        addCustomerWithDemand(L.latLng(row.lat, row.lng), row.demand, { silent: true });
    }
    fitMapToImportedNodes();
    mode = 'idle';
    updateStatus('CSV import: loaded depot and ' + parsed.customers.length + ' customer(s).');
}

function setDepot(latlng) {
    if (depot && depot.marker) {
        map.removeLayer(depot.marker);
    }

    const marker = L.marker([latlng.lat, latlng.lng], {
        icon: L.divIcon({
            className: 'custom-depot-marker',
            html: '<div style="background-color: #e74c3c; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 16px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">D</div>',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        })
    }).addTo(map);

    marker.bindPopup('<div class="popup-content"><strong>Depot</strong><br>Lat: ' + latlng.lat.toFixed(5) + '<br>Lng: ' + latlng.lng.toFixed(5) + '</div>');

    depot = {
        id: 0,
        lat: latlng.lat,
        lng: latlng.lng,
        x: latlng.lng,
        y: latlng.lat,
        demand: 0,
        marker: marker
    };

    updateNodesList();
    mode = 'idle';
    updateStatus('Depot set! Now add customers.');
}

function addCustomer(latlng) {
    var demand = parseInt(document.getElementById('defaultDemand').value, 10) || 15;
    addCustomerWithDemand(latlng, demand);
}

function addCustomerWithDemand(latlng, demand, opts) {
    var silent = opts && opts.silent;
    if (!Number.isFinite(demand) || demand < 0) {
        demand = 0;
    }

    const marker = L.marker([latlng.lat, latlng.lng], {
        icon: L.divIcon({
            className: 'custom-customer-marker',
            html: '<div style="background-color: #3498db; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">' + nextId + '</div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        })
    }).addTo(map);

    marker.bindPopup('<div class="popup-content"><strong>Customer ' + nextId + '</strong><br>Demand: ' + demand + '<br>Lat: ' + latlng.lat.toFixed(5) + '<br>Lng: ' + latlng.lng.toFixed(5) + '</div>');

    const customer = {
        id: nextId++,
        lat: latlng.lat,
        lng: latlng.lng,
        x: latlng.lng,
        y: latlng.lat,
        demand: demand,
        marker: marker
    };

    customers.push(customer);
    updateNodesList();
    if (!silent) {
        updateStatus('Customer added! Add more or click Solve.');
    }
}

function updateNodesList() {
    const nodesList = document.getElementById('nodesList');
    let html = '';

    if (depot) {
        html += '<div class="node-item depot">';
        html += '<div class="node-info">';
        html += '<div class="node-id">Depot</div>';
        html += '<div class="node-coords">Lat: ' + depot.lat.toFixed(5) + ', Lng: ' + depot.lng.toFixed(5) + '</div>';
        html += '</div>';
        html += '</div>';
    }

    customers.forEach((customer, idx) => {
        html += '<div class="node-item">';
        html += '<div class="node-info">';
        html += '<div class="node-id">Customer ' + customer.id + '</div>';
        html += '<div class="node-coords">Lat: ' + customer.lat.toFixed(5) + ', Lng: ' + customer.lng.toFixed(5) + '</div>';
        html += '<div class="node-demand">Demand: ' + customer.demand + '</div>';
        html += '</div>';
        html += '<button class="delete-btn" onclick="deleteCustomer(' + idx + ')">Delete</button>';
        html += '</div>';
    });

    nodesList.innerHTML = html || '<p class="placeholder-text">No nodes added yet</p>';
    var nodeCountEl = document.getElementById('nodeCount');
    if (nodeCountEl) {
        nodeCountEl.textContent = String((depot ? 1 : 0) + customers.length);
    }
    updateSolveButtonState();
}

function deleteCustomer(idx) {
    const customer = customers[idx];
    if (customer && customer.marker) {
        map.removeLayer(customer.marker);
    }
    customers.splice(idx, 1);
    updateNodesList();
}

function clearAll() {
    if (depot && depot.marker) {
        map.removeLayer(depot.marker);
    }
    customers.forEach(c => {
        if (c.marker) map.removeLayer(c.marker);
    });

    routeLines.forEach(line => map.removeLayer(line));
    routeLines = [];

    depot = null;
    customers = [];
    nextId = 1;
    mode = 'idle';
    isVisualizationRunning = false;

    updateNodesList();
    updateStatus('Click "Set Depot" to start');
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('savingsTable').innerHTML = '<p class="placeholder-text">Savings will appear here after solving</p>';
    document.getElementById('stepsContent').innerHTML = '<p class="placeholder-text">Algorithm steps will appear here after solving</p>';
}

async function solveProblem() {
    if (!depot) {
        alert('Please set a depot first!');
        return;
    }

    if (customers.length < 2) {
        alert('Add at least 2 customers!');
        return;
    }

    if (isVisualizationRunning) {
        alert('Visualization is already running!');
        return;
    }

    const capacity = parseFloat(document.getElementById('capacity').value);

    var capViolation = getCapacityViolationMessage(customers, capacity);
    if (capViolation) {
        alert(capViolation);
        updateStatus(capViolation);
        return;
    }

    // Show capacity info
    const totalDemand = customers.reduce((sum, c) => sum + c.demand, 0);
    console.log('Vehicle Capacity:', capacity);
    console.log('Total Customer Demand:', totalDemand);
    console.log('Minimum Vehicles Needed:', Math.ceil(totalDemand / capacity));

    const cleanNodes = [
        {
            id: depot.id,
            lat: depot.lat,
            lng: depot.lng,
            x: depot.x,
            y: depot.y,
            demand: depot.demand
        },
        ...customers.map(c => ({
            id: c.id,
            lat: c.lat,
            lng: c.lng,
            x: c.x,
            y: c.y,
            demand: c.demand
        }))
    ];

    updateStatus('Solving... Capacity: ' + capacity + ' | Total Demand: ' + totalDemand);

    try {
        isVisualizationRunning = true;
        updateSolveButtonState();

        const response = await fetch(`${API_URL}/solve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nodes: cleanNodes,
                depot_id: 0,
                vehicle_capacity: capacity
            })
        });

        if (!response.ok) {
            const errMsg = await parseErrorResponse(response);
            throw new Error(errMsg);
        }

        const data = await response.json();

        // Show savings and steps
        displaySavingsTable(data.savings_table);
        displaySteps(data.steps);

        // FASTER Animation: Draw all routes quickly
        await visualizeAlgorithmFast(data);

        document.getElementById('resultsSection').style.display = 'block';
    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        alert('Error: ' + message);
        console.error(error);
        updateStatus(message);
    } finally {
        isVisualizationRunning = false;
        updateSolveButtonState();
    }
}

// FASTER Visualization
async function visualizeAlgorithmFast(data) {
    // Clear old routes
    routeLines.forEach(line => map.removeLayer(line));
    routeLines = [];

    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];

    updateStatus('Drawing ' + data.routes.length + ' optimized routes...');

    // Draw all routes with small delays
    for (let idx = 0; idx < data.routes.length; idx++) {
        const route = data.routes[idx];
        const color = colors[idx % colors.length];

        // Build waypoints
        const waypoints = [depot];
        route.customers.forEach(custId => {
            const customer = customers.find(c => c.id === custId);
            if (customer) waypoints.push(customer);
        });
        waypoints.push(depot);

        await drawSingleRoute(waypoints, color, route.total_demand);
        await sleep(300); // Faster: only 300ms between routes
    }

    // Display final results
    displayResults(data);
    updateStatus('✅ Solution complete! ' + data.routes.length + ' vehicles used.');
}

// Draw a single route with capacity info
async function drawSingleRoute(waypoints, color, routeDemand) {
    const waypointCoords = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${waypointCoords}?overview=full&geometries=geojson`;

    try {
        const response = await fetch(osrmUrl);
        const data = await response.json();

        if (data.code === 'Ok' && data.routes && data.routes[0]) {
            const coordinates = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);

            const polyline = L.polyline(coordinates, {
                color: color,
                weight: 5,
                opacity: 0.8
            }).addTo(map);

            // Add tooltip showing demand
            polyline.bindTooltip('Load: ' + routeDemand, {
                permanent: false,
                direction: 'center'
            });

            routeLines.push(polyline);
        }
    } catch (error) {
        // Fallback to straight line
        const latlngs = waypoints.map(wp => [wp.lat, wp.lng]);
        const polyline = L.polyline(latlngs, {
            color: color,
            weight: 5,
            opacity: 0.8
        }).addTo(map);

        polyline.bindTooltip('Load: ' + routeDemand, {
            permanent: false,
            direction: 'center'
        });

        routeLines.push(polyline);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function displayResults(data) {
    const resultsDiv = document.getElementById('results');
    const capacity = parseFloat(document.getElementById('capacity').value);

    let html = '<strong>Vehicle Capacity:</strong> ' + capacity + '<br>';
    html += '<strong>Total Distance:</strong> ' + data.total_distance.toFixed(2) + ' km<br>';
    html += '<strong>Number of Vehicles:</strong> ' + data.routes.length + '<br><br>';

    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];

    data.routes.forEach((route, i) => {
        const utilization = ((route.total_demand / capacity) * 100).toFixed(1);
        html += '<strong style="color:' + colors[i % colors.length] + '">Vehicle ' + (i + 1) + ':</strong> ';
        html += 'Depot → ' + route.customers.join(' → ') + ' → Depot<br>';
        html += 'Load: ' + route.total_demand + '/' + capacity + ' (' + utilization + '% full) | ';
        html += 'Distance: ' + route.total_distance.toFixed(2) + ' km<br><br>';
    });

    resultsDiv.innerHTML = html;
}

function displaySavingsTable(savings) {
    const tableDiv = document.getElementById('savingsTable');
    let html = '<table><thead><tr><th>Rank</th><th>Customer i</th><th>Customer j</th><th>Saving (km)</th></tr></thead><tbody>';

    savings.forEach((s, idx) => {
        html += '<tr><td>' + (idx + 1) + '</td><td>' + s.i + '</td><td>' + s.j + '</td><td>' + s.saving.toFixed(2) + '</td></tr>';
    });

    html += '</tbody></table>';
    tableDiv.innerHTML = html;
}

function displaySteps(steps) {
    const stepsDiv = document.getElementById('stepsContent');
    let html = '';
    steps.forEach(step => {
        html += '<div class="step">' + step + '</div>';
    });
    stepsDiv.innerHTML = html;
}

function updateStatus(text) {
    document.getElementById('statusText').textContent = text;
}

console.log('App.js with fast animation and capacity visualization loaded!');