# Field-Ready Incident Logger

An **Offline-First Mobile Application** built with **React Native (Expo)** and **Node.js/Express Backend** backed by **PostgreSQL** with Docker containerization.

Designed for field service engineers, utility technicians, logistics operators, and construction personnel working in remote environments with intermittent or nonexistent internet connectivity.

---

## 🏗️ System Architecture

The application adopts the **Offline-First Architectural Pattern**:

```
┌─────────────────────────────────────────────────────────────┐
│                 Mobile App (React Native / Expo)            │
│                                                             │
│  ┌────────────────────────┐       ┌──────────────────────┐  │
│  │     UI Components      │       │     Sync Service     │  │
│  │ (Form, List, Resolver) │       │ (Push/Pull & Delta)  │  │
│  └───────────┬────────────┘       └──────────┬───────────┘  │
│              │ CRUD Operations               │              │
│              ▼                               │              │
│  ┌────────────────────────┐                  │              │
│  │   Local SQLite DB      │◄─────────────────┘              │
│  │ (incidents table schema│                                 │
│  │ + sync_status tracking)│                                 │
│  └────────────────────────┘                                 │
└──────────────┬───────────────────────────────▲──────────────┘
               │ Multipart/Form-Data           │ JSON Delta
               ▼                               │
┌──────────────────────────────────────────────┴──────────────┐
│                  Node.js / Express Backend                  │
│                                                             │
│  ┌───────────────────────┐        ┌──────────────────────┐  │
│  │   POST /api/incidents │        │  GET /api/incidents  │  │
│  │   (Bulk Upsert &      │        │  (Paginated & Delta  │  │
│  │   Multer Photo Upload)│        │   last_synced_at)    │  │
│  └───────────┬───────────┘        └──────────┬───────────┘  │
│              │                               │              │
│              ▼                               ▼              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │             PostgreSQL Database (Dockerized)          │  │
│  │               (Pre-seeded with 60 incidents)          │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Key Capabilities
- **Local-First CRUD**: All reads and writes target the on-device SQLite database (`expo-sqlite`) instantly without network latency.
- **Background Synchronization**: Monitors connection status (`@react-native-community/netinfo`) and automatically pushes pending records upon reconnecting.
- **Delta Sync**: Pulls only records modified since the `last_synced_at` timestamp to optimize bandwidth and battery.
- **Multipart Photo Uploads**: Attaches binary image files along with structured metadata using standard `multipart/form-data`.
- **Conflict Resolution UI**: Dedicated side-by-side visual diff resolver allowing operators to choose between local device edits and remote dispatcher updates.

---

## 📁 Repository Structure

```
incidentlogger/
├── backend/                      # Node.js Express API & Database
│   ├── Dockerfile                # Production Docker container definition
│   ├── docker-compose.yml        # Orchestrates PostgreSQL + Node API with healthchecks
│   ├── .env.example              # Environment variable documentation
│   ├── .env                      # Local environment configuration
│   ├── seed.sql                  # PostgreSQL table schema & 60 initial sample records
│   ├── package.json
│   ├── src/
│   │   ├── index.js              # Express application setup & middleware
│   │   ├── db.js                 # PostgreSQL connection pool with in-memory fallback
│   │   └── routes/
│   │       └── incidents.js      # REST API endpoints (GET & POST /api/incidents)
│   ├── tests/
│   │   └── incidents.test.js     # Backend integration & API unit tests
│   └── uploads/                  # Attached photos storage directory
│
├── mobile-app/                   # React Native (Expo) Client Application
│   ├── app.json                  # Expo configuration
│   ├── App.js                    # Root mobile application component & state manager
│   ├── index.js                  # Entry point
│   ├── package.json
│   ├── src/
│   │   ├── components/
│   │   │   ├── ConflictResolver.js      # Side-by-side conflict resolution UI
│   │   │   ├── IncidentForm.js          # Field logging form with photo & coordinates
│   │   │   ├── IncidentList.js          # Filterable list with severity/status badges
│   │   │   └── SyncStatusIndicator.js   # Dynamic pending count indicator
│   │   ├── database/
│   │   │   └── db.js                    # SQLite database layer (window.getLocalIncidents)
│   │   └── services/
│   │       ├── api.js                   # Axios HTTP client with multipart support
│   │       └── syncService.js           # Bidirectional sync engine
│   └── tests/
│       └── syncService.test.js          # Sync logic & conflict handling unit tests
│
├── tests/
│   └── sync.test.js              # Root test suite for Jest test runners
└── README.md
```

---

## ⚙️ Environment Variables

### Backend Configuration (`backend/.env.example`)

| Variable | Description | Default Value |
| :--- | :--- | :--- |
| `PORT` | Port for the Express server | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:password@localhost:5432/incidents_db` |
| `UPLOAD_DIR` | Server folder for uploaded photo evidence | `uploads` |

---

## 🚀 Quick Start Guide

### 1. Start Backend Stack with Docker Compose

Ensure Docker is installed and running, then execute:

```bash
cd backend
docker-compose up --build -d
```

This starts:
1. **PostgreSQL container (`incident_db`)** on port `5432` with automated schema generation and 60 pre-seeded incident records.
2. **Node.js Express API container (`incident_api`)** on port `3000` waiting for the database healthcheck.

Verify running containers:
```bash
docker-compose ps
```

Health check endpoint:
```bash
curl http://localhost:3000/health
```

### 2. Run the Mobile App (Expo)

In a new terminal window:

```bash
cd mobile-app
npm install
npm start
```

You can run the app in:
- **Expo Go** on an iOS/Android device by scanning the QR code.
- **Android Emulator**: press `a` in terminal.
- **iOS Simulator**: press `i` in terminal.
- **Web Browser**: press `w` in terminal (`http://localhost:8081`).

---

## 🧪 Running Automated Tests

Run all unit and integration test suites:

### Backend Tests
```bash
cd backend
npm test
```
*Validates:*
- `GET /health` service status
- `GET /api/incidents` pagination and delta synchronization
- `POST /api/incidents` bulk upsert and multipart photo upload handling

### Mobile Synchronization Unit Tests
```bash
cd mobile-app
npm test
```
*Validates:*
- Offline incident creation and pending state queueing
- Multipart payload formatting and push synchronization
- Delta sync pulling and local cache updates
- Remote vs local conflict detection and interactive resolution

---

## 📡 API Reference

### 1. `GET /api/incidents`
Fetch paginated incidents with delta sync support.

**Query Parameters:**
- `page` (number, default: `1`): Page number.
- `limit` (number, default: `20`): Items per page.
- `last_synced_at` (ISO 8601 string, optional): Filter records modified after this timestamp.

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "inc-001",
      "description": "Water pipe rupture causing minor localized flooding in North Warehouse",
      "severity": "Medium",
      "latitude": 37.7749,
      "longitude": -122.4194,
      "photo_url": "/uploads/sample_pipe.jpg",
      "created_at": "2026-09-01T08:30:00.000Z",
      "updated_at": "2026-09-01T08:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total_items": 60,
    "total_pages": 3
  }
}
```

### 2. `POST /api/incidents`
Bulk synchronize and upsert incidents with multipart file attachments.

**Request Header:** `Content-Type: multipart/form-data`

**Request Body:**
- `incidents`: JSON string containing array of incident objects.
- `photo_<local_id>`: File attachment part for each incident with a photo.

**Response (200 OK):**
```json
{
  "synced_incidents": [
    {
      "local_id": "loc-1727238123-abc",
      "server_id": "srv-4820a1-def",
      "status": "synced"
    }
  ]
}
```
.
---

## 📱 Testing Contract Elements

- **Global Testing Hook**: `window.getLocalIncidents()` returns a promise resolving with all records in the local SQLite table.
- **Sync Status Indicator**: `data-testid="sync-status-indicator"` dynamically updates text (e.g. `"3 records pending sync"`).
- **Conflict Resolver**:
  - Container: `data-testid="conflict-resolver"`
  - Local fields: `data-testid="local-version-field-description"`, `data-testid="local-version-field-severity"`, etc.
  - Server fields: `data-testid="server-version-field-description"`, `data-testid="server-version-field-severity"`, etc.
  - Resolution button: `data-testid="resolve-conflict-button"`

---

## 🔒 Security & Best Practices
- Non-root user execution in Docker images.
- Input validation and parameterized SQL queries to prevent SQL injection.
- Safe multipart file handling with size limits and randomized storage paths.
- Graceful offline error handling preventing app crashes or unhandled rejections during connectivity loss.
