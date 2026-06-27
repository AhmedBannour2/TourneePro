-- AlterTable: add pay, start_time, end_time to express_deliveries (were missing from prod)
ALTER TABLE "express_deliveries" ADD COLUMN "pay" DOUBLE PRECISION;
ALTER TABLE "express_deliveries" ADD COLUMN "start_time" TEXT;
ALTER TABLE "express_deliveries" ADD COLUMN "end_time" TEXT;
