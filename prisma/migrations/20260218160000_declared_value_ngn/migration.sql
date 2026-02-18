-- Add declared item value to shipments
ALTER TABLE "Shipment"
ADD COLUMN "declaredValueNgn" INTEGER NOT NULL DEFAULT 0;
