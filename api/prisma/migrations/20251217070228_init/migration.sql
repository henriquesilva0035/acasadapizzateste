-- CreateTable
CREATE TABLE "Order" (
    "idString" TEXT NOT NULL PRIMARY KEY,
    "customerName" TEXT,
    "tableNumber" INTEGER,
    "total" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "origin" TEXT NOT NULL DEFAULT 'LOCAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "idString" TEXT NOT NULL PRIMARY KEY,
    "product" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "orderId" TEXT NOT NULL,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("idString") ON DELETE RESTRICT ON UPDATE CASCADE
);
