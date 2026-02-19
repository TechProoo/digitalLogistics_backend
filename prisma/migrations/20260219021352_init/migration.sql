-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'QUOTED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('ROAD', 'AIR', 'SEA', 'DOOR_TO_DOOR');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" VARCHAR(60),
    "resetPasswordTokenHash" VARCHAR(64),
    "resetPasswordTokenExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "pickupLocation" TEXT NOT NULL,
    "destinationLocation" TEXT NOT NULL,
    "packageType" TEXT NOT NULL,
    "weight" TEXT NOT NULL,
    "dimensions" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "receiverPhone" TEXT,
    "declaredValueNgn" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentStatusHistory" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminName" TEXT,
    "note" TEXT,

    CONSTRAINT "ShipmentStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentCheckpoint" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminName" TEXT,

    CONSTRAINT "ShipmentCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentNote" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminName" TEXT,

    CONSTRAINT "ShipmentNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Customer_resetPasswordTokenHash_idx" ON "Customer"("resetPasswordTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_trackingId_key" ON "Shipment"("trackingId");

-- CreateIndex
CREATE INDEX "Shipment_customerId_idx" ON "Shipment"("customerId");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_createdAt_idx" ON "Shipment"("createdAt");

-- CreateIndex
CREATE INDEX "ShipmentStatusHistory_shipmentId_idx" ON "ShipmentStatusHistory"("shipmentId");

-- CreateIndex
CREATE INDEX "ShipmentStatusHistory_shipmentId_timestamp_idx" ON "ShipmentStatusHistory"("shipmentId", "timestamp");

-- CreateIndex
CREATE INDEX "ShipmentCheckpoint_shipmentId_idx" ON "ShipmentCheckpoint"("shipmentId");

-- CreateIndex
CREATE INDEX "ShipmentCheckpoint_shipmentId_timestamp_idx" ON "ShipmentCheckpoint"("shipmentId", "timestamp");

-- CreateIndex
CREATE INDEX "ShipmentNote_shipmentId_idx" ON "ShipmentNote"("shipmentId");

-- CreateIndex
CREATE INDEX "ShipmentNote_shipmentId_timestamp_idx" ON "ShipmentNote"("shipmentId", "timestamp");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentStatusHistory" ADD CONSTRAINT "ShipmentStatusHistory_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentCheckpoint" ADD CONSTRAINT "ShipmentCheckpoint_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentNote" ADD CONSTRAINT "ShipmentNote_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
