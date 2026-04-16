# RC System Information - Backend Documentation

This document describes the internal architecture, data flow, and maintenance details for
future developers.

---

# System Architecture

The application is split into three layers:

## 1. Electron Main Process

Responsible for:

- system data collection
- IPC handling
- report submission
- network detection

## 2. React Renderer

Responsible for:

- UI rendering
- displaying system stats
- triggering IPC calls
- sending IT requests

## 3. Preload Script

Secure bridge between renderer and main process:

- exposes limited API
- prevents direct Node.js access in UI

---

# Data Flow

## Live System Stats

Function:
pullResources()

Runs every 1000ms and sends:

- CPU usage
- RAM usage
- Storage usage
- Network speeds

Sent via IPC event:
statistics

---

## Static System Data

Function:
getStaticData()

Collects:

- CPU model
- RAM size
- Disk size
- OS information
- Device identifiers
- User session info
- Network info

Also calls:
getFullNetworkData()

---

## Network Information

### Local IP

Extracted from OS network interfaces.

### Public IP

Fetched from:

GET https://blackstone.roanoke.edu/scotty/itweboncall/public/api/ip
//This will change when finished production

Includes caching system:

- cachedPublicIp
- publicIpPromise

Prevents duplicate network requests.

---

# Report Generation

Function:
buildFullItReport()

Creates a formatted system report containing:

- system info
- network info
- performance snapshot

---

# Report Encoding

Before sending:

- HTML escaping applied
- Newlines converted to <br>
- Spaces normalized

Ensures safe transmission via email relay.

---

# Report Submission

Endpoint:
POST /api/send-report

Headers:
Authorization: Bearer <REPORT_API_TOKEN>
Content-Type: application/json

Payload:
{
"report": "<HTML encoded system report>"
}

---

# IPC Communication

## Renderer → Main

| Event         | Payload         |
| ------------- | --------------- |
| getStaticData | none            |
| sendToIT      | { data, stats } |

---

## Main → Renderer

| Event      | Payload                          |
| ---------- | -------------------------------- |
| statistics | CPU, RAM, storage, network stats |

---

# Info Files System

Reads from:

Windows: C:/info
Mac/Linux: ~/info

Files:

- RCTag.txt
- Department.txt
- AssignedLocationBuilding.txt
- AssignedLocationRoom.txt
- LocalAccount.txt
- OwnerFirstName.txt
- OwnerLastName.txt
- OwnerEmail.txt
- UsageType.txt
- YearModel.txt

Used for:

- asset tracking
- device identification
- IT reporting metadata

---

# Security Notes

## ⚠️ Development Only

NODE_TLS_REJECT_UNAUTHORIZED = "0"

This disables TLS verification and must be removed in production builds.

---

## API Security

Authentication uses:
Bearer token (REPORT_API_TOKEN)

Stored in environment variables.

Never hardcoded in production.

---

# Maintenance Notes

## If reports fail:

- check API availability
- verify token
- check network connectivity

## If public IP is missing:

- internal endpoint may be down
- fallback returns "N/A"

---
