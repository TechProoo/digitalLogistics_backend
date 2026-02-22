-- CreateEnum
CREATE TYPE "DriverApplicationStatus" AS ENUM ('PENDING', 'NEEDS_INFO', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('AVAILABLE', 'BUSY', 'OFFLINE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "applicationStatus" "DriverApplicationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "status" "DriverStatus" NOT NULL DEFAULT 'OFFLINE';

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "driverId" TEXT;

-- CreateIndex
CREATE INDEX "Driver_applicationStatus_idx" ON "Driver"("applicationStatus");

-- CreateIndex
CREATE INDEX "Driver_status_idx" ON "Driver"("status");

-- CreateIndex
CREATE INDEX "Shipment_driverId_idx" ON "Shipment"("driverId");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
