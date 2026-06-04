import { PartialType } from '@nestjs/swagger';
import { CreateExpressDeliveryDto } from './create-express-delivery.dto';

export class UpdateExpressDeliveryDto extends PartialType(CreateExpressDeliveryDto) {}
