-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "designation" TEXT,
    CONSTRAINT "Admin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Stall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stallName" TEXT NOT NULL,
    "zoneId" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "contactPhone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Stall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Stall_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Distributor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "vehicleInfo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "currentLat" REAL,
    "currentLng" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Distributor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FoodItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "isTemperatureSensitive" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "FoodBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchCode" TEXT NOT NULL,
    "stallId" TEXT NOT NULL,
    "foodItemId" TEXT,
    "foodName" TEXT NOT NULL,
    "totalServings" INTEGER NOT NULL,
    "remainingServings" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'servings',
    "preparedAt" DATETIME NOT NULL,
    "usableUntil" DATETIME NOT NULL,
    "isTemperatureSensitive" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FoodBatch_stallId_fkey" FOREIGN KEY ("stallId") REFERENCES "Stall" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FoodBatch_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RedistributionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestingStallId" TEXT NOT NULL,
    "foodNameWanted" TEXT,
    "quantityNeeded" INTEGER NOT NULL,
    "quantityFulfilled" INTEGER NOT NULL DEFAULT 0,
    "urgency" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "matchedBatchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RedistributionRequest_requestingStallId_fkey" FOREIGN KEY ("requestingStallId") REFERENCES "Stall" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RedistributionRequest_matchedBatchId_fkey" FOREIGN KEY ("matchedBatchId") REFERENCES "FoodBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PickupRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "foodBatchId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "acceptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    "pickupLat" REAL,
    "pickupLng" REAL,
    CONSTRAINT "PickupRecord_foodBatchId_fkey" FOREIGN KEY ("foodBatchId") REFERENCES "FoodBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PickupRecord_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "foodBatchId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetStallId" TEXT,
    "redistributionRequestId" TEXT,
    "pilgrimPointId" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" DATETIME,
    CONSTRAINT "DeliveryRecord_foodBatchId_fkey" FOREIGN KEY ("foodBatchId") REFERENCES "FoodBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryRecord_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryRecord_redistributionRequestId_fkey" FOREIGN KEY ("redistributionRequestId") REFERENCES "RedistributionRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeliveryRecord_pilgrimPointId_fkey" FOREIGN KEY ("pilgrimPointId") REFERENCES "PilgrimDistributionPoint" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PilgrimDistributionPoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "zoneId" TEXT,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "PilgrimDistributionPoint_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PilgrimDistributionRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "foodBatchId" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "distributedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "distributedByUserId" TEXT,
    CONSTRAINT "PilgrimDistributionRecord_foodBatchId_fkey" FOREIGN KEY ("foodBatchId") REFERENCES "FoodBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PilgrimDistributionRecord_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "PilgrimDistributionPoint" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WasteRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "foodBatchId" TEXT,
    "stallId" TEXT NOT NULL,
    "foodName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REPORTED',
    "reportedById" TEXT NOT NULL,
    "reportedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectedAt" DATETIME,
    CONSTRAINT "WasteRecord_foodBatchId_fkey" FOREIGN KEY ("foodBatchId") REFERENCES "FoodBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WasteRecord_stallId_fkey" FOREIGN KEY ("stallId") REFERENCES "Stall" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WasteRecord_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QRTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "foodBatchId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "scannedByUserId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "latitude" REAL,
    "longitude" REAL,
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanToken" TEXT NOT NULL,
    CONSTRAINT "QRTransaction_foodBatchId_fkey" FOREIGN KEY ("foodBatchId") REFERENCES "FoodBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relatedBatchId" TEXT,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_userId_key" ON "Admin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_name_key" ON "Zone"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Stall_userId_key" ON "Stall"("userId");

-- CreateIndex
CREATE INDEX "Stall_status_idx" ON "Stall"("status");

-- CreateIndex
CREATE INDEX "Stall_zoneId_idx" ON "Stall"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "Distributor_userId_key" ON "Distributor"("userId");

-- CreateIndex
CREATE INDEX "Distributor_status_isAvailable_idx" ON "Distributor"("status", "isAvailable");

-- CreateIndex
CREATE UNIQUE INDEX "FoodItem_name_key" ON "FoodItem"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FoodBatch_batchCode_key" ON "FoodBatch"("batchCode");

-- CreateIndex
CREATE INDEX "FoodBatch_status_idx" ON "FoodBatch"("status");

-- CreateIndex
CREATE INDEX "FoodBatch_usableUntil_idx" ON "FoodBatch"("usableUntil");

-- CreateIndex
CREATE INDEX "FoodBatch_stallId_idx" ON "FoodBatch"("stallId");

-- CreateIndex
CREATE INDEX "RedistributionRequest_status_idx" ON "RedistributionRequest"("status");

-- CreateIndex
CREATE INDEX "PickupRecord_status_idx" ON "PickupRecord"("status");

-- CreateIndex
CREATE INDEX "DeliveryRecord_status_idx" ON "DeliveryRecord"("status");

-- CreateIndex
CREATE INDEX "PilgrimDistributionRecord_pointId_idx" ON "PilgrimDistributionRecord"("pointId");

-- CreateIndex
CREATE INDEX "WasteRecord_status_idx" ON "WasteRecord"("status");

-- CreateIndex
CREATE INDEX "WasteRecord_category_idx" ON "WasteRecord"("category");

-- CreateIndex
CREATE UNIQUE INDEX "QRTransaction_scanToken_key" ON "QRTransaction"("scanToken");

-- CreateIndex
CREATE INDEX "QRTransaction_foodBatchId_action_idx" ON "QRTransaction"("foodBatchId", "action");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
