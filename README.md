# RC System Information Dashboard

A desktop IT diagnostics application built with Electron, React, and TypeScript.

It collects system information and sends structured reports to an internal IT system for support and asset tracking.

---

## Features

- Real-time system monitoring (CPU, RAM, Storage)
- Device identification (serial, model, manufacturer)
- Network information (local + public IP)
- OS and user tracking
- One-click IT report submission
- Dark mode support

---

## How to Use

1. Open the application
2. Review system information
3. Click **Send To IT**
4. Wait for confirmation (Sent ✓ or Failed ✗)

---

## What "Send To IT" Does

When clicked, the app:

- Collects full system diagnostics
- Generates a structured report
- Encodes it for safe transmission
- Sends it to the internal IT API
- IT receives it for support or asset tracking

---

## Requirements

- Internet connection required for sending reports
- Internal IT API access required

---

## Security Notes

This application uses internal network services.

⚠️ Development-only setting:

NODE_TLS_REJECT_UNAUTHORIZED=0

This must NOT be used in production builds.

---

## Documentation

Full documentation is maintained separately by the IT department.

- User Guide → internal IT documentation system
- Backend Documentation → internal engineering documentation

---

## Tech Stack

- Electron
- React
- TypeScript
- systeminformation
- Vite

---

## Author

Haytham Rida Hlioui
