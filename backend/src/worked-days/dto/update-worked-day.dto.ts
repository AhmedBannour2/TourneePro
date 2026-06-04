import { PartialType } from '@nestjs/swagger';
import { CreateWorkedDayDto } from './create-worked-day.dto';

export class UpdateWorkedDayDto extends PartialType(CreateWorkedDayDto) {}
