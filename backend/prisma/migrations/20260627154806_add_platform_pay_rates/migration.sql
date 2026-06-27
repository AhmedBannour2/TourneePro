-- CreateTable
CREATE TABLE "platform_pay_rates" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "chauffeur_rate" DOUBLE PRECISION NOT NULL,
    "aide_rate" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "platform_pay_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_platform_pay_rates" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "chauffeur_rate" DOUBLE PRECISION NOT NULL,
    "aide_rate" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "employee_platform_pay_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_pay_rates_platform_id_key" ON "platform_pay_rates"("platform_id");

-- CreateIndex
CREATE INDEX "employee_platform_pay_rates_employee_id_idx" ON "employee_platform_pay_rates"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_platform_pay_rates_employee_id_platform_id_key" ON "employee_platform_pay_rates"("employee_id", "platform_id");

-- AddForeignKey
ALTER TABLE "platform_pay_rates" ADD CONSTRAINT "platform_pay_rates_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_pay_rates" ADD CONSTRAINT "platform_pay_rates_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_platform_pay_rates" ADD CONSTRAINT "employee_platform_pay_rates_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_platform_pay_rates" ADD CONSTRAINT "employee_platform_pay_rates_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_platform_pay_rates" ADD CONSTRAINT "employee_platform_pay_rates_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
