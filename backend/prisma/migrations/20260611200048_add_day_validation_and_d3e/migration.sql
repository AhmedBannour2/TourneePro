-- Add updated_at to assignments (nullable — existing rows get NULL)
ALTER TABLE "assignments" ADD COLUMN "updated_at" TIMESTAMP(3);

-- Add d3e to tour_confirmations (nullable — existing confirmations get NULL)
ALTER TABLE "tour_confirmations" ADD COLUMN "d3e" INTEGER;

-- Create day_validations table
CREATE TABLE "day_validations" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "validated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_by_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "day_validations_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on date
CREATE UNIQUE INDEX "day_validations_date_key" ON "day_validations"("date");

-- Foreign key to users
ALTER TABLE "day_validations" ADD CONSTRAINT "day_validations_validated_by_id_fkey"
    FOREIGN KEY ("validated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
