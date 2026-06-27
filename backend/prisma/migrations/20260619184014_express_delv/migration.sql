-- CreateTable
CREATE TABLE "express_delivery_photos" (
    "id" TEXT NOT NULL,
    "express_delivery_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "express_delivery_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "express_delivery_photos_express_delivery_id_idx" ON "express_delivery_photos"("express_delivery_id");

-- AddForeignKey
ALTER TABLE "express_delivery_photos" ADD CONSTRAINT "express_delivery_photos_express_delivery_id_fkey" FOREIGN KEY ("express_delivery_id") REFERENCES "express_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
