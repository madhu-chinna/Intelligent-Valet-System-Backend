# Intelligent Valet System: Backend Overview

## Backend Architecture

The backend is built using Node.js with Express.js and SQLite. It serves as the core processing engine for the intelligent valet system, handling data storage, business logic, and API endpoints.

### Key Responsibilities
- Receives sensor data (BLE, Wi-Fi, IMU, GPS) from user devices
- Runs the exit gate inference algorithm to predict the user's intended exit gate
- Manages valet tickets and dispatch orders
- Communicates with the valet dashboard for real-time operations

## Main Endpoints
- `POST /api/tickets` — Create a new valet ticket when a car is dropped off
- `POST /api/tickets/:id/request` — User requests car retrieval
- `POST /api/tickets/:id/sensor` — Receive sensor data from user device
- `POST /api/tickets/:id/infer` — Run exit gate inference and trigger dispatch if confidence threshold is met
- `GET /api/dispatches` — List all dispatches for valet dashboard
- `POST /api/dispatches/:id/status` — Update dispatch status (e.g., retrieved, en route, completed)
- `GET /api/tickets` — List all tickets (admin/debug)
- `GET /api/gates` — List all gates
- `GET /api/tickets/:id/sensor` — List all sensor data for a ticket

## Exit Gate Inference Logic

The backend uses a probabilistic scoring model to determine the most likely exit gate for each user. It combines BLE, Wi-Fi, IMU, and GPS data, updating scores every few seconds. When a gate's confidence score exceeds 90% for a sustained period, a dispatch order is triggered.

## Database Structure
- **valet_tickets**: Stores ticket info, car details, status, timestamps
- **sensor_data**: Stores sensor readings linked to tickets
- **dispatches**: Stores dispatch orders, gate, score, status, timestamps
- **gates**: Stores gate names (A, B, C, D)

## Real-World Handling
- Fallback hierarchy for signal loss (BLE > Wi-Fi > IMU > GPS)
- Monitors user direction after dispatch; can redirect if feasible
- (Phase 2) Considers gate congestion in dispatch logic

---

For more details, see `app.js` in this folder.
