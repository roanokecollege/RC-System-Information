# RC System Information - User Guide

This guide explains how to use the RC System Information Dashboard.

---

## Overview

This tool collects system diagnostics and sends them to IT for:

- troubleshooting
- asset tracking
- system auditing

---

## Main Interface

### System Info Section

Displays:

- Computer name
- RC asset tag
- Logged-in user
- Local admin account
- Operating system version

---

### Network Section

Displays:

- MAC address
- Local IP (internal network)
- Public IP (internet-facing)
- Live network speeds

---

### Performance Section

Displays real-time usage:

- CPU usage
- RAM usage
- Storage usage

---

## Sending a Report

Click:

> **Send To IT**

The system will:

1. Gather all system information
2. Generate a full diagnostic report
3. Send it to IT automatically

Button states:

- Sending…
- Sent ✓
- Failed ✗

---

## After Sending

Once submitted:

- IT receives a structured system report
- The report is used for diagnostics or asset tracking
- No further action is required from the user

---

## Troubleshooting

### Report failed to send

- Check internet connection
- Try again after a few seconds

### Missing system data

- Ensure the application has permission to access system information

## Missing asset information

- Insure the users computer has a folder in the root/home direcctory called 'info'
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

---

## Notes

- No manual input is required
- The tool runs automatically in real time
- Designed for internal IT environments

## Author

Haytham Rida Hlioui
