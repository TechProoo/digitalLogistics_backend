-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('VAN', 'BIKE');

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "proofOfOwnershipPath" TEXT NOT NULL,
    "vehicleLicensePath" TEXT NOT NULL,
    "hackneyPermitPath" TEXT NOT NULL,
    "vehicleInsurancePath" TEXT NOT NULL,
    "vehicleVideoPath" TEXT NOT NULL,
    "driversLicensePath" TEXT NOT NULL,
    "meansOfIdPath" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverAddress" TEXT NOT NULL,
    "driverFacePhotoPath" TEXT NOT NULL,
    "driverFullBodyPhotoPath" TEXT NOT NULL,
    "guarantorName" TEXT NOT NULL,
    "guarantorAddress" TEXT NOT NULL,
    "guarantorPhone" TEXT NOT NULL,
    "guarantorNin" TEXT NOT NULL,
    "guarantorMeansOfIdPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Driver_vehicleType_idx" ON "Driver"("vehicleType");

-- CreateIndex
CREATE INDEX "Driver_createdAt_idx" ON "Driver"("createdAt");
