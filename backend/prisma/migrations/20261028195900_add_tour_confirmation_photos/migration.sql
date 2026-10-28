-- CreateTable
CREATE TABLE "tour_confirmation_photos" (
    "id" TEXT NOT NULL,
    "tour_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tour_confirmation_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tour_confirmation_photos_tour_id_idx" ON "tour_confirmation_photos"("tour_id");

-- AddForeignKey
ALTER TABLE "tour_confirmation_photos" ADD CONSTRAINT "tour_confirmation_photos_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;
