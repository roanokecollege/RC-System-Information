# RC System Dashboard

A desktop IT diagnostics application built with Electron, React, and TypeScript, distributed by Roanoke College Information Technology.

It collects system information and sends structured reports to an internal IT system for support and asset tracking.

---

## Features

- Real-time system monitoring (CPU, RAM, Storage, Network)
- Device identification (serial, model, manufacturer, RC Tag)
- Network information (local + public IP, MAC address)
- Owner and department tracking via local info files
- One-click IT report submission with code verification
- Dark mode support

---

## Tech Stack

- Electron
- React
- TypeScript
- systeminformation
- Vite

---

## Requirements

- Internet connection required for sending reports
- Internal IT API access required
- Auth token must be present in `.env`

---

# User Guide

This section explains how to use the RC System Information Dashboard.

## Overview

This tool collects system diagnostics and sends them to IT for:

- troubleshooting
- asset tracking
- system auditing

## Main Interface

### System Info Section

Displays:

- Computer name
- RC asset tag
- Logged-in user
- Local admin account
- Operating system version

### Network Section

Displays:

- MAC address
- Local IP (internal network)
- Public IP (internet-facing)
- Live network speeds

### Performance Section

Displays real-time usage:

- CPU usage
- RAM usage
- Storage usage

## Sending a Report

1. Open the application
2. Review system information
3. Click **Send To IT**
4. Enter your code when prompted
5. Wait for confirmation (button turns green or red)

The system will:

1. Gather all system information
2. Generate a full diagnostic report
3. Send it to IT automatically

Button states:

- Sending…
- Sent ✓
- Failed ✗

### What "Send To IT" Does

When submitted, the app:

- Collects full system diagnostics (device, owner, network, hardware)
- Sends a structured report to the internal IT API
- IT receives it for support or asset tracking

## After Sending

Once submitted:

- IT receives a structured system report
- The report is used for diagnostics or asset tracking
- No further action is required from the user

## Troubleshooting

### Report failed to send

- Check internet connection
- Try again after a few seconds

### Missing system data

- Ensure the application has permission to access system information

### Missing asset information

- Ensure the user's computer has a folder in the root/home directory called `info`
- The naming convention for the txt files are:
  - AssignedLocationBuilding.txt
  - Department.txt
  - OwnerEmail.txt
  - OwnerLastName.txt
  - UsageType.txt
  - AssignedLocationRoom.txt
  - LocalAccount.txt
  - OwnerFirstName.txt
  - RCTag.txt
  - YearModel.txt

## Notes

- No manual input is required
- The tool runs automatically in real time
- Designed for internal IT environments

---

# Backend Documentation

This section describes the internal architecture, data flow, and maintenance details for future developers.

## System Architecture

The application is split into three layers:

### 1. Electron Main Process

Responsible for:

- system data collection
- IPC handling
- report submission
- network detection

### 2. React Renderer

Responsible for:

- UI rendering
- displaying system stats
- triggering IPC calls
- sending IT requests

### 3. Preload Script

Secure bridge between renderer and main process:

- exposes limited API
- prevents direct Node.js access in UI

## Data Flow

### Live System Stats

Function:
`pullResources()`

Runs every 3000ms and sends:

- CPU usage
- RAM usage
- Storage usage
- Network speeds

Sent via IPC event: `statistics`

### Static System Data

Function:
`getStaticData()`

Collects:

- CPU model
- RAM size
- Disk size
- OS information
- Device identifiers
- User session info
- Network info

Also calls: `getFullNetworkData()`

### Network Information

**Local IP** — Extracted from OS network interfaces.

**Public IP** — Fetched from:

```
GET https://blackstone.roanoke.edu:4434/scotty/itrelay/public/api/ip
```

Includes caching system:

- `cachedPublicIp`
- `publicIpPromise`

Prevents duplicate network requests.

## Report Generation

Function:
`buildFullItReport()`

Creates a formatted system report containing:

- Device info (manufacturer, model, serial, RC Tag)
- System info (computer name, OS, uptime)
- Owner info (name, email, department, location)
- Network info (MAC, local IP, public IP, speeds)
- Hardware snapshot (CPU, RAM, storage usage)

Newlines are replaced with `<br>` before transmission.

## Report Submission

Endpoint:

```
POST https://blackstone.roanoke.edu:4434/scotty/itrelay/public/api/email
```

Headers: `Content-Type: application/json`

Payload:

```json
{
  "auth_token": "<AUTH_TOKEN from .env>",
  "body": "<report with newlines replaced by <br>>",
  "code": "<user-entered code>"
}
```

## IPC Communication

### Renderer → Main

| Event         | Payload               |
| ------------- | ---------------------- |
| getStaticData | none                  |
| sendToIT      | { data, stats, code } |

### Main → Renderer

| Event      | Payload                          |
| ---------- | --------------------------------- |
| statistics | CPU, RAM, storage, network stats |

## Info Files System

Reads from:

- Windows: `C:/info`
- Mac/Linux: `~/info`

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

## Security Notes

### API Security

Authentication uses `auth_token` in the JSON request body.

Stored in `.env` as `AUTH_TOKEN` — bundled into the app via `extraResources` at build time.

### IPC Security

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- IPC channels are whitelisted in preload
- Frame URL validated on every IPC call

### General Security Notes

- TLS verification uses the system certificate store via Electron's `net` module
- IPC is locked to a channel whitelist with frame URL validation
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`

## Maintenance Notes

### If reports fail

- check API availability
- verify token
- check network connectivity

### If public IP is missing

- internal endpoint may be down
- fallback returns "N/A"

---

## Author

Haytham Rida Hlioui
Roanoke College Information Technology
