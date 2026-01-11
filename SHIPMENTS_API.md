# Shipments API Documentation

## Overview

The Shipments API provides complete CRUD operations for managing shipments with tracking, status updates, checkpoints, and notes.

## Base URL

`http://localhost:3000/shipments`

## Authentication

All endpoints require JWT authentication via the `Authorization: Bearer <token>` header.

## Endpoints

### 1. Create Shipment

**POST** `/shipments`

Creates a new shipment with auto-generated tracking ID.

**Request Body:**

```json
{
  "customerId": "uuid (optional - defaults to authenticated user)",
  "serviceType": "ROAD | AIR | SEA | DOOR_TO_DOOR",
  "pickupLocation": "string",
  "destinationLocation": "string",
  "packageType": "string",
  "weight": "string",
  "dimensions": "string"
}
```

**Response:** Shipment object with customer, statusHistory, checkpoints, and notes

---

### 2. Get All Shipments

**GET** `/shipments`

Retrieves all shipments with optional filtering.

**Query Parameters:**

- `customerId` (optional): Filter by customer UUID
- `status` (optional): Filter by shipment status

**Response:** Array of shipment objects

---

### 3. Get Shipment by Tracking ID

**GET** `/shipments/tracking/:trackingId`

Retrieve a shipment using its tracking ID (e.g., DD-2026-123456).

**Response:** Complete shipment object with all relations

---

### 4. Get Shipment by ID

**GET** `/shipments/:id`

Retrieve a specific shipment by its UUID.

**Response:** Complete shipment object with all relations

---

### 5. Update Shipment

**PATCH** `/shipments/:id`

Update shipment details.

**Request Body:**

```json
{
  "serviceType": "ROAD | AIR | SEA | DOOR_TO_DOOR (optional)",
  "pickupLocation": "string (optional)",
  "destinationLocation": "string (optional)",
  "packageType": "string (optional)",
  "weight": "string (optional)",
  "dimensions": "string (optional)"
}
```

**Response:** Updated shipment object

---

### 6. Update Shipment Status

**PATCH** `/shipments/:id/status`

Update the shipment status and create a status history entry.

**Request Body:**

```json
{
  "status": "PENDING | QUOTED | ACCEPTED | PICKED_UP | IN_TRANSIT | DELIVERED | CANCELLED",
  "note": "string (optional)",
  "adminName": "string (optional)"
}
```

**Response:** Updated shipment with new status history

---

### 7. Add Checkpoint

**POST** `/shipments/:id/checkpoints`

Add a location checkpoint to track shipment progress.

**Request Body:**

```json
{
  "location": "string",
  "description": "string",
  "adminName": "string (optional)"
}
```

**Response:** Created checkpoint object

---

### 8. Add Note

**POST** `/shipments/:id/notes`

Add an internal note to the shipment.

**Request Body:**

```json
{
  "text": "string",
  "adminName": "string (optional)"
}
```

**Response:** Created note object

---

### 9. Delete Shipment

**DELETE** `/shipments/:id`

Permanently delete a shipment and all related data (cascades to statusHistory, checkpoints, and notes).

**Response:**

```json
{
  "message": "Shipment deleted successfully"
}
```

---

## Shipment Status Values

- `PENDING` - Initial state after creation
- `QUOTED` - Quote provided to customer
- `ACCEPTED` - Customer accepted the quote
- `PICKED_UP` - Package collected from pickup location
- `IN_TRANSIT` - Package in transit
- `DELIVERED` - Package delivered successfully
- `CANCELLED` - Shipment cancelled

## Service Types

- `ROAD` - Ground/road transportation
- `AIR` - Air freight
- `SEA` - Ocean freight
- `DOOR_TO_DOOR` - Complete door-to-door service

## Shipment Object Structure

```json
{
  "id": "uuid",
  "trackingId": "DD-2026-123456",
  "customerId": "uuid",
  "serviceType": "ROAD | AIR | SEA | DOOR_TO_DOOR",
  "status": "PENDING | QUOTED | ...",
  "pickupLocation": "string",
  "destinationLocation": "string",
  "packageType": "string",
  "weight": "string",
  "dimensions": "string",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "customer": {
    "id": "uuid",
    "name": "string",
    "email": "string",
    "phone": "string"
  },
  "statusHistory": [
    {
      "id": "uuid",
      "status": "PENDING",
      "timestamp": "ISO8601",
      "adminName": "string | null",
      "note": "string | null"
    }
  ],
  "checkpoints": [
    {
      "id": "uuid",
      "location": "string",
      "description": "string",
      "timestamp": "ISO8601",
      "adminName": "string | null"
    }
  ],
  "notes": [
    {
      "id": "uuid",
      "text": "string",
      "timestamp": "ISO8601",
      "adminName": "string | null"
    }
  ]
}
```

## Features Implemented

✅ **Auto-generated tracking IDs** - Format: `DD-YYYY-XXXXXX` (e.g., DD-2026-123456)
✅ **JWT Authentication** - All endpoints protected
✅ **Customer validation** - Verifies customer exists before creating shipment
✅ **Automatic status history** - Creates initial PENDING status entry
✅ **Complete CRUD operations** - Create, Read, Update, Delete
✅ **Filtering** - By customer and status
✅ **Tracking ID lookup** - Find shipments by tracking number
✅ **Status management** - Update status with history tracking
✅ **Checkpoint tracking** - Add location updates
✅ **Internal notes** - Add admin/customer notes
✅ **Cascading deletes** - Related data deleted automatically
✅ **Full validation** - DTOs with class-validator decorators
✅ **Error handling** - Proper HTTP status codes and messages
✅ **Timestamps** - Automatic createdAt/updatedAt tracking
