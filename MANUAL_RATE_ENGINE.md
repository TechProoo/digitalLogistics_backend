# Manual Rate Engine (Delivery Estimator)

This document explains how the **Manual Rate Engine** works. It provides **quick delivery cost estimates** for common shipment types.

Important notes:
- This is an **estimator** (not live carrier pricing). Numbers are based on configurable heuristics and 2026 market assumptions.
- Currency returned is **NGN**.
- Output includes an **assumptions** list explaining what was applied.

---

## API Endpoint

**POST** `/rates/manual-quote`

- Accepts a JSON body (`ManualQuoteRequestDto`).
- Returns a JSON response (`ManualQuoteResponseDto`).

---

## Request Body

You can either:
1) send structured fields (`mode`, `origin`, `destination`, etc.), or
2) send `freeText` and let the engine extract fields automatically.

### Fields

- `freeText` (string, optional)
  - Natural language prompt like: `"10kg from China to Lagos by air"`.
  - The engine will try to infer: `mode`, `origin`, `destination`, `weightKg`, `dimensionsCm`, `distanceKm`, `containerType`, and `isExpress`.

- `mode` (optional): one of `parcel | air | ocean | ground`
  - If omitted, the engine attempts to detect it from `freeText`.

- `origin` (string, optional)
- `destination` (string, optional)

- `weightKg` (number, optional)
  - Required for `parcel` and `air`.

- `dimensionsCm` (optional object)
  - `{ length: number, width: number, height: number }`
  - Used for air volumetric weight calculation.

- `volumeCbm` (number, optional)
  - Alternative to `dimensionsCm` for volumetric calculation.

- `containerType` (optional): one of `20ft | 40ft | 40hc`
  - Required for `ocean`.

- `distanceKm` (number, optional)
  - Used for `ground`. If missing, the engine tries to resolve/estimate distance.

- `start` / `end` (optional objects)
  - `{ lat: number, lng: number }`
  - If provided, the engine can compute driving distance for `ground`.

- `isExpress` (boolean, optional)
  - Used for `air` (rate tier).

- `detentionDemurrageDays` (number, optional)
  - Used for `ocean` to add a per-day charge.

---

## Response

### Status values

- `ok`
  - An estimate was produced.

- `needs_clarification`
  - Required fields are missing. The response includes `missingFields`.

- `error`
  - An unexpected error occurred.

### Response shape (simplified)

```json
{
  "status": "ok",
  "message": "Estimate only...",
  "quote": {
    "provider": "manual-rate-engine",
    "mode": "air",
    "origin": "China",
    "destination": "Lagos",
    "chargeableWeightKg": 45,
    "breakdown": {
      "base": { "amount": 0, "currency": "NGN" },
      "surcharges": { "amount": 0, "currency": "NGN" },
      "margin": { "amount": 0, "currency": "NGN" },
      "total": { "amount": 0, "currency": "NGN" },
      "assumptions": ["..."]
    }
  }
}
```

Notes:
- `chargeableWeightKg` is returned for **air** quotes.
- All money values are NGN.

---

## What is required (by mode)

The engine enforces these minimum requirements:

### Parcel (`mode = parcel`)
- `origin`
- `destination`
- `weightKg`

### Air (`mode = air`)
- `origin`
- `destination`
- `weightKg`
- Optional but recommended: `dimensionsCm` or `volumeCbm`

### Ocean (`mode = ocean`)
- `origin`
- `destination`
- `containerType`

### Ground (`mode = ground`)
- `origin`
- `destination`
- `distanceKm`
  - If `distanceKm` is missing, the engine attempts to resolve it automatically.

---

## How freeText extraction works

If you provide `freeText`, the engine looks for patterns like:

- `from <origin> to <destination>`
- weights like `10kg`
- dimensions like `30x20x10 cm`
- distance like `760km`
- container type keywords: `20ft`, `40ft`, `40hc`
- mode keywords:
  - Parcel: `dhl`, `fedex`, `ups`, `parcel`, `express`
  - Air: `air`, `airport`, `air freight`
  - Ocean: `ocean`, `sea`, `container`, `vessel`, `port`
  - Ground: `truck`, `trucking`, `road`, `ground`

If extraction is incomplete, you’ll get `needs_clarification` with the missing fields.

---

## How pricing is calculated

All modes use the same high-level structure:

1) Compute a **base** amount
2) Compute **surcharges**
3) Apply a combined multiplier:

$$multiplier = inflation2026 \times marketMultiplier(mode)$$

4) Compute **margin** as a percentage of `(base + surcharges)`
5) Total is:

$$total = (base + surcharges) + margin$$

The response includes an `assumptions` array describing what was applied.

### Common tunables
- FX conversion: USD → NGN
- Inflation and market multipliers
- Margin per mode

(See **Configuration (Environment Variables)** below.)

---

## Mode details

### 1) Parcel

#### Domestic Nigeria parcel (origin and destination both in Nigeria)
- Uses a Nigeria lane table (city-pair mapping) for parcels ≤ 1 kg.
- If the city pair is not mapped, it falls back to a long-distance default base.
- Applies a **weight factor** multiplier based on `weightKg`.
- Adds a domestic parcel surcharge percentage.

#### International parcel
- Chooses a USD base using weight brackets.
- Applies an origin-region adjustment factor (e.g., USA slightly higher).
- Adds a parcel surcharge percentage.
- Converts USD to NGN using configured FX.

### 2) Ocean
- Base rate is selected from a region table (USD) by:
  - origin region, and
  - `containerType` (`20ft`, `40ft`, `40hc`).
- If destination is not Nigeria, it applies a modest premium.
- Surcharges include:
  - port congestion fee (USD)
  - documentation fee (USD)
  - BAF/CAF percentage of the base (USD)
  - optional detention/demurrage (days × per-day USD)
- Converts USD to NGN and applies multipliers and margin.

### 3) Air
- Uses **chargeable weight**:
  - `max(actualWeightKg, volumetricWeightKg)`
- Volumetric weight is computed from either:
  - `dimensionsCm` via `(L×W×H)/divisor`, or
  - `volumeCbm` converted into cm³.
- Enforces a minimum chargeable weight (default 45 kg).
- Selects a USD/kg rate by origin region and `isExpress`.
- Applies an air surcharge percentage.
- Converts USD to NGN and applies multipliers and margin.

### 4) Ground
- If `distanceKm` is provided, it uses it directly.
- If `distanceKm` is missing, it tries to resolve distance in this order:
  1) in-memory cache (24h TTL)
  2) optional geocoding + routing (if configured)
  3) haversine (great-circle) fallback
  4) Nigeria lane heuristics fallback

Per-km pricing:
- Intra-city Nigeria (origin city == destination city): uses a city-specific per-km rate (or fallback).
- Inter-city Nigeria: uses a distance-tiered per-km rate.

Adds a ground surcharge percentage and then applies multipliers and margin.

---

## Configuration (Environment Variables)

These variables tune the estimator. Defaults shown are used if the env var is not set.

### Global
- `MANUAL_USD_TO_NGN` (default: `1550`)
- `MANUAL_QUOTES_INFLATION_2026` (default: `1.03`)

### Market multipliers (by mode)
- `MANUAL_QUOTES_MARKET_MULT_PARCEL` (default: `1.06`)
- `MANUAL_QUOTES_MARKET_MULT_OCEAN` (default: `0.88`)
- `MANUAL_QUOTES_MARKET_MULT_AIR` (default: `1.03`)
- `MANUAL_QUOTES_MARKET_MULT_GROUND` (default: `1.02`)

### Surcharges
- `MANUAL_PARCEL_DOMESTIC_SURCHARGE_PCT` (default: `0.15`)
- `MANUAL_PARCEL_SURCHARGE_PCT` (default: `0.25`)

- `MANUAL_OCEAN_PORT_CONGESTION_USD` (default: `400`)
- `MANUAL_OCEAN_DOCUMENTATION_USD` (default: `100`)
- `MANUAL_OCEAN_BAF_CAF_PCT` (default: `0.075`)
- `MANUAL_OCEAN_DEMURRAGE_USD_PER_DAY` (default: `200`)

- `MANUAL_AIR_MIN_CHARGEABLE_KG` (default: `45`)
- `MANUAL_AIR_SURCHARGE_PCT` (default: `0.15`)

- `MANUAL_GROUND_NGN_PER_KM` (default: `250`)
- `MANUAL_GROUND_SURCHARGE_PCT` (default: `0.1`)

### Margin (by mode)
- `MANUAL_QUOTES_MARGIN_PARCEL` (default: `0.275`)
- `MANUAL_QUOTES_MARGIN_OCEAN` (default: `0.2`)
- `MANUAL_QUOTES_MARGIN_AIR` (default: `0.25`)
- `MANUAL_QUOTES_MARGIN_GROUND` (default: `0.4`)

### Optional distance resolution providers (ground mode)
If you want the engine to compute route distance automatically:

**LocationIQ**
- `LOCATIONIQ_API_KEY` (or `LOCATIONIQ_KEY`)
- `LOCATIONIQ_GEOCODE_URL` (default: `https://us1.locationiq.com/v1/search`)
- `LOCATIONIQ_DIRECTIONS_URL` (default: `https://us1.locationiq.com/v1/directions/driving`)
- `LOCATIONIQ_TIMEOUT_MS` (default: `8000`)

**OpenRouteService**
- `OPENROUTE_API_KEY` (or `OPENROUTESERVICE_API_KEY`)
- `OPENROUTE_DIRECTIONS_URL` (default: `https://api.openrouteservice.org/v2/directions/driving-car`)
- `OPENROUTE_TIMEOUT_MS` (default: `8000`)

If none of these keys are configured, the engine will still work, but it may rely on heuristics/haversine for distance.

---

## Examples

### Example A — Air (free text)

```bash
curl -X POST https://<your-api-host>/rates/manual-quote \
  -H "Content-Type: application/json" \
  -d '{
    "freeText": "Need a quote: 10kg from China to Lagos by air"
  }'
```

Expected behavior:
- Detects `mode = air`
- Extracts origin/destination
- Applies minimum chargeable weight (default 45 kg)

### Example B — Ocean (missing containerType → needs clarification)

```bash
curl -X POST https://<your-api-host>/rates/manual-quote \
  -H "Content-Type: application/json" \
  -d '{
    "freeText": "Ocean shipment from China to Lagos"
  }'
```

Expected behavior:
- Returns `needs_clarification`
- `missingFields` includes `containerType`

### Example C — Ground (distance provided)

```bash
curl -X POST https://<your-api-host>/rates/manual-quote \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "ground",
    "origin": "Lagos",
    "destination": "Kano",
    "distanceKm": 1000
  }'
```

Expected behavior:
- Uses inter-city tiered per-km pricing
- Adds ground surcharge and margin

---

## Client-facing language you can copy

> “This quote is an estimate generated from a rules-based pricing engine. It uses configurable market assumptions (FX, inflation, surcharges, margin) and may differ from final pricing once a live quote is created based on availability, timing, dimensions, and carrier rates.”
