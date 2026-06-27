-- CreateEnum
CREATE TYPE "TourType" AS ENUM ('STANDARD', 'GV', 'INSTALL', 'MONO', 'SPECIAL');

-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('CHAUFFEUR', 'AIDE');

-- CreateEnum
CREATE TYPE "WorkedDayStatus" AS ENUM ('ASSIGNED', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpressMissionType" AS ENUM ('STANDARD', 'GV', 'AUTRE');

-- CreateEnum
CREATE TYPE "ExpressDeliveryType" AS ENUM ('STANDARD', 'GV', 'AUTRE');

-- CreateEnum
CREATE TYPE "ExpressDeliveryStatus" AS ENUM ('PENDING', 'ASSIGNED', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConfirmationStatus" AS ENUM ('UNCONFIRMED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "TourSource" AS ENUM ('IMPORT', 'MANUAL');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "TruckDocumentType" AS ENUM ('ASSURANCE', 'CONTROLE_TECHNIQUE', 'CONTROLE_HAYON', 'CARTE_GRISE');

-- CreateEnum
CREATE TYPE "InspectionItemName" AS ENUM ('HUILE', 'RADIATEUR', 'CAISSE_OUTILS', 'CHARIOT', 'ROULETTES', 'COUVERCLE');

-- CreateEnum
CREATE TYPE "InspectionItemStatus" AS ENUM ('OK', 'PROBLEME');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT,
    "responsible_truck_id" TEXT,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trucks" (
    "id" TEXT NOT NULL,
    "immatriculation" TEXT NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'available',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsible_employee_id" TEXT,

    CONSTRAINT "trucks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "truck_documents" (
    "id" TEXT NOT NULL,
    "truck_id" TEXT NOT NULL,
    "type" "TruckDocumentType" NOT NULL,
    "start_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "file_path" TEXT,
    "file_name" TEXT,
    "mime_type" TEXT,
    "notes" TEXT,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "truck_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platforms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tours" (
    "id" TEXT NOT NULL,
    "tour_code" TEXT NOT NULL,
    "tour_type" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "platform_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'imported',
    "import_batch_id" TEXT,
    "horaire" TEXT,
    "quai" TEXT,
    "nb_colis" INTEGER,
    "prestataire" TEXT,
    "immatriculation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmation_status" "ConfirmationStatus" NOT NULL DEFAULT 'UNCONFIRMED',
    "source" "TourSource" NOT NULL DEFAULT 'IMPORT',

    CONSTRAINT "tours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "sheet_name" TEXT NOT NULL,
    "row_index" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "parsed_data" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "tour_id" TEXT NOT NULL,
    "chauffeur_id" TEXT,
    "aide_id" TEXT,
    "truck_id" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "chauffeur_seen_at" TIMESTAMP(3),
    "aide_seen_at" TIMESTAMP(3),

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_validations" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "validated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_by_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "day_validations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "express_deliveries" (
    "id" TEXT NOT NULL,
    "type" "ExpressDeliveryType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "ExpressDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "photo" TEXT,
    "notes" TEXT,
    "pay" DOUBLE PRECISION,
    "start_time" TEXT,
    "end_time" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "express_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "express_assignments" (
    "id" TEXT NOT NULL,
    "express_delivery_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "pay" DOUBLE PRECISION NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_notes" TEXT,

    CONSTRAINT "express_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_confirmations" (
    "id" TEXT NOT NULL,
    "tour_id" TEXT NOT NULL,
    "confirmed_by_id" TEXT NOT NULL,
    "total_clients" INTEGER NOT NULL,
    "delivered" INTEGER NOT NULL,
    "absent" INTEGER NOT NULL,
    "non_conform" INTEGER NOT NULL,
    "d3e" INTEGER,
    "notes" TEXT,
    "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tour_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_pay_rates" (
    "id" TEXT NOT NULL,
    "tour_type" "TourType" NOT NULL,
    "chauffeur_rate" DOUBLE PRECISION NOT NULL,
    "aide_rate" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "global_pay_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_pay_rates" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "tour_type" "TourType" NOT NULL,
    "chauffeur_rate" DOUBLE PRECISION NOT NULL,
    "aide_rate" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "employee_pay_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worked_days" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "tour_id" TEXT,
    "date" DATE NOT NULL,
    "tour_type" "TourType",
    "employee_role" "EmployeeRole" NOT NULL,
    "base_pay" DOUBLE PRECISION NOT NULL,
    "override_pay" DOUBLE PRECISION,
    "final_pay" DOUBLE PRECISION NOT NULL,
    "status" "WorkedDayStatus" NOT NULL DEFAULT 'ASSIGNED',
    "confirmed_at" TIMESTAMP(3),
    "override_note" TEXT,
    "override_by_id" TEXT,
    "override_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worked_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "express_missions" (
    "id" TEXT NOT NULL,
    "worked_day_id" TEXT NOT NULL,
    "type" "ExpressMissionType" NOT NULL,
    "pay" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "added_by_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "express_missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "user_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "truck_assignment_history" (
    "id" TEXT NOT NULL,
    "truck_id" TEXT NOT NULL,
    "tour_id" TEXT NOT NULL,
    "tour_code" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "chauffeur_name" TEXT,
    "aide_name" TEXT,
    "action" TEXT NOT NULL DEFAULT 'assigned',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "truck_assignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "truck_repair_logs" (
    "id" TEXT NOT NULL,
    "truck_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cost" DOUBLE PRECISION,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "truck_repair_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by_id" TEXT,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "truck_inspections" (
    "id" TEXT NOT NULL,
    "truck_id" TEXT NOT NULL,
    "assigned_to_id" TEXT NOT NULL,
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_id" TEXT,
    "general_comment" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "truck_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "truck_inspection_items" (
    "id" TEXT NOT NULL,
    "inspection_id" TEXT NOT NULL,
    "item" "InspectionItemName" NOT NULL,
    "status" "InspectionItemStatus" NOT NULL,
    "comment" TEXT,

    CONSTRAINT "truck_inspection_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_read_idx" ON "notifications"("user_id", "read");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_responsible_truck_id_key" ON "employees"("responsible_truck_id");

-- CreateIndex
CREATE UNIQUE INDEX "trucks_immatriculation_key" ON "trucks"("immatriculation");

-- CreateIndex
CREATE UNIQUE INDEX "trucks_responsible_employee_id_key" ON "trucks"("responsible_employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "platforms_code_key" ON "platforms"("code");

-- CreateIndex
CREATE INDEX "tours_date_idx" ON "tours"("date");

-- CreateIndex
CREATE INDEX "tours_status_idx" ON "tours"("status");

-- CreateIndex
CREATE INDEX "tours_platform_id_idx" ON "tours"("platform_id");

-- CreateIndex
CREATE UNIQUE INDEX "tours_tour_code_date_platform_id_key" ON "tours"("tour_code", "date", "platform_id");

-- CreateIndex
CREATE INDEX "import_rows_batch_id_idx" ON "import_rows"("batch_id");

-- CreateIndex
CREATE INDEX "assignments_tour_id_idx" ON "assignments"("tour_id");

-- CreateIndex
CREATE UNIQUE INDEX "day_validations_date_key" ON "day_validations"("date");

-- CreateIndex
CREATE INDEX "express_deliveries_date_idx" ON "express_deliveries"("date");

-- CreateIndex
CREATE INDEX "express_deliveries_status_idx" ON "express_deliveries"("status");

-- CreateIndex
CREATE INDEX "express_assignments_express_delivery_id_idx" ON "express_assignments"("express_delivery_id");

-- CreateIndex
CREATE INDEX "express_assignments_employee_id_idx" ON "express_assignments"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "express_assignments_express_delivery_id_employee_id_key" ON "express_assignments"("express_delivery_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "tour_confirmations_tour_id_key" ON "tour_confirmations"("tour_id");

-- CreateIndex
CREATE INDEX "tour_confirmations_tour_id_idx" ON "tour_confirmations"("tour_id");

-- CreateIndex
CREATE UNIQUE INDEX "global_pay_rates_tour_type_key" ON "global_pay_rates"("tour_type");

-- CreateIndex
CREATE INDEX "employee_pay_rates_employee_id_idx" ON "employee_pay_rates"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_pay_rates_employee_id_tour_type_key" ON "employee_pay_rates"("employee_id", "tour_type");

-- CreateIndex
CREATE INDEX "worked_days_employee_id_idx" ON "worked_days"("employee_id");

-- CreateIndex
CREATE INDEX "worked_days_date_idx" ON "worked_days"("date");

-- CreateIndex
CREATE INDEX "worked_days_tour_id_idx" ON "worked_days"("tour_id");

-- CreateIndex
CREATE INDEX "express_missions_worked_day_id_idx" ON "express_missions"("worked_day_id");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- CreateIndex
CREATE INDEX "truck_assignment_history_truck_id_idx" ON "truck_assignment_history"("truck_id");

-- CreateIndex
CREATE INDEX "truck_assignment_history_date_idx" ON "truck_assignment_history"("date");

-- CreateIndex
CREATE INDEX "truck_repair_logs_truck_id_idx" ON "truck_repair_logs"("truck_id");

-- CreateIndex
CREATE INDEX "truck_repair_logs_date_idx" ON "truck_repair_logs"("date");

-- CreateIndex
CREATE INDEX "employee_documents_employee_id_idx" ON "employee_documents"("employee_id");

-- CreateIndex
CREATE INDEX "truck_inspections_truck_id_idx" ON "truck_inspections"("truck_id");

-- CreateIndex
CREATE INDEX "truck_inspections_assigned_to_id_idx" ON "truck_inspections"("assigned_to_id");

-- CreateIndex
CREATE INDEX "truck_inspections_status_idx" ON "truck_inspections"("status");

-- CreateIndex
CREATE INDEX "truck_inspection_items_inspection_id_idx" ON "truck_inspection_items"("inspection_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_responsible_truck_id_fkey" FOREIGN KEY ("responsible_truck_id") REFERENCES "trucks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_responsible_employee_id_fkey" FOREIGN KEY ("responsible_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "truck_documents" ADD CONSTRAINT "truck_documents_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "truck_documents" ADD CONSTRAINT "truck_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tours" ADD CONSTRAINT "tours_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tours" ADD CONSTRAINT "tours_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_chauffeur_id_fkey" FOREIGN KEY ("chauffeur_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_aide_id_fkey" FOREIGN KEY ("aide_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_validations" ADD CONSTRAINT "day_validations_validated_by_id_fkey" FOREIGN KEY ("validated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "express_deliveries" ADD CONSTRAINT "express_deliveries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "express_assignments" ADD CONSTRAINT "express_assignments_express_delivery_id_fkey" FOREIGN KEY ("express_delivery_id") REFERENCES "express_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "express_assignments" ADD CONSTRAINT "express_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_confirmations" ADD CONSTRAINT "tour_confirmations_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_confirmations" ADD CONSTRAINT "tour_confirmations_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global_pay_rates" ADD CONSTRAINT "global_pay_rates_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_pay_rates" ADD CONSTRAINT "employee_pay_rates_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_pay_rates" ADD CONSTRAINT "employee_pay_rates_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worked_days" ADD CONSTRAINT "worked_days_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worked_days" ADD CONSTRAINT "worked_days_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worked_days" ADD CONSTRAINT "worked_days_override_by_id_fkey" FOREIGN KEY ("override_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "express_missions" ADD CONSTRAINT "express_missions_worked_day_id_fkey" FOREIGN KEY ("worked_day_id") REFERENCES "worked_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "express_missions" ADD CONSTRAINT "express_missions_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "truck_assignment_history" ADD CONSTRAINT "truck_assignment_history_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "truck_repair_logs" ADD CONSTRAINT "truck_repair_logs_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "truck_repair_logs" ADD CONSTRAINT "truck_repair_logs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "truck_inspections" ADD CONSTRAINT "truck_inspections_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "truck_inspections" ADD CONSTRAINT "truck_inspections_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "truck_inspections" ADD CONSTRAINT "truck_inspections_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "truck_inspections" ADD CONSTRAINT "truck_inspections_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "truck_inspection_items" ADD CONSTRAINT "truck_inspection_items_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "truck_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

