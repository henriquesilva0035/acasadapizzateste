/*
  Warnings:

  - Added the required column `updatedAt` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "border" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "customerName" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "extras" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "flavors" TEXT;

-- AlterTable
ALTER TABLE "Table" ADD COLUMN "currentSessionCode" TEXT;
ALTER TABLE "Table" ADD COLUMN "waiterName" TEXT;

-- CreateTable
CREATE TABLE "Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "daysOfWeek" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerValue" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetValue" TEXT NOT NULL,
    "discountPercent" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bannerText" TEXT,
    "bannerActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Neighborhood" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Customer" ("address", "createdAt", "id", "name", "phone") SELECT "address", "createdAt", "id", "name", "phone" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");
CREATE TABLE "new_Order" (
    "idString" TEXT NOT NULL PRIMARY KEY,
    "customerId" INTEGER,
    "customerName" TEXT,
    "waiterName" TEXT,
    "waiterId" INTEGER,
    "customerPhone" TEXT,
    "customerAddress" TEXT,
    "observation" TEXT,
    "tableId" INTEGER,
    "tableSessionId" TEXT,
    "tableSessionCode" TEXT,
    "total" REAL NOT NULL,
    "deliveryFee" REAL,
    "canceledAt" DATETIME,
    "cancelReason" TEXT,
    "closedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "origin" TEXT NOT NULL DEFAULT 'LOCAL',
    "isTakeout" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethod" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "syncedAt" DATETIME,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("createdAt", "customerAddress", "customerId", "customerName", "customerPhone", "idString", "origin", "paymentMethod", "status", "tableId", "total") SELECT "createdAt", "customerAddress", "customerId", "customerName", "customerPhone", "idString", "origin", "paymentMethod", "status", "tableId", "total" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE TABLE "new_Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL NOT NULL,
    "promoPrice" REAL,
    "promoDays" TEXT,
    "image" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Product" ("category", "description", "id", "image", "name", "price", "promoDays", "promoPrice") SELECT "category", "description", "id", "image", "name", "price", "promoDays", "promoPrice" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE TABLE "new_ProductOptionGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "min" INTEGER NOT NULL DEFAULT 0,
    "max" INTEGER NOT NULL DEFAULT 1,
    "chargeMode" TEXT NOT NULL DEFAULT 'SUM',
    "available" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ProductOptionGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProductOptionGroup" ("id", "max", "min", "productId", "title") SELECT "id", "max", "min", "productId", "title" FROM "ProductOptionGroup";
DROP TABLE "ProductOptionGroup";
ALTER TABLE "new_ProductOptionGroup" RENAME TO "ProductOptionGroup";
CREATE TABLE "new_ProductOptionItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "groupId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ProductOptionItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductOptionGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProductOptionItem" ("description", "groupId", "id", "name", "price") SELECT "description", "groupId", "id", "name", "price" FROM "ProductOptionItem";
DROP TABLE "ProductOptionItem";
ALTER TABLE "new_ProductOptionItem" RENAME TO "ProductOptionItem";
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'WAITER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("id", "name", "pin", "role") SELECT "id", "name", "pin", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_pin_key" ON "User"("pin");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
