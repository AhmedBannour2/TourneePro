-- Prevent duplicate "live" WorkedDay rows for the same tour + employee.
-- A row is "live" (pay-counting) unless its status is CANCELLED — the payroll
-- summary sums every non-CANCELLED row (worked-days.service.ts), so two live
-- rows for the same tour+employee silently double that employee's pay.
--
-- This closes a race in WorkedDaysService.createFromAssignment(): its
-- cancel-old-ASSIGNED-then-create-new sequence was not transactional, so two
-- near-simultaneous assignment requests for the same tour could each pass the
-- "cancel" step before the other's "create" committed, leaving two live rows.
-- With this constraint, the second insert now fails with a unique violation
-- (P2002) instead of silently succeeding — the service catches P2002 and
-- treats it as a no-op duplicate call.
--
-- Partial index only (WHERE clause) since Prisma's schema DSL does not
-- support filtered unique indexes — this exists purely as raw SQL and is not
-- represented in schema.prisma.
CREATE UNIQUE INDEX "worked_days_tour_employee_live_key"
ON "worked_days" ("tour_id", "employee_id")
WHERE "tour_id" IS NOT NULL AND "status" <> 'CANCELLED';
