import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ExpressDeliveriesService } from './express-deliveries.service';
import { CreateExpressDeliveryDto } from './dto/create-express-delivery.dto';
import { UpdateExpressDeliveryDto } from './dto/update-express-delivery.dto';
import { GetExpressDeliveriesQueryDto } from './dto/get-express-deliveries-query.dto';

@ApiTags('express-deliveries')
@ApiBearerAuth()
@Controller('express-deliveries')
export class ExpressDeliveriesController {
  constructor(
    private readonly expressDeliveriesService: ExpressDeliveriesService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a manual express delivery' })
  @ApiResponse({
    status: 201,
    description: 'Express delivery created successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  create(@Body() createDto: CreateExpressDeliveryDto) {
    return this.expressDeliveriesService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all express deliveries with filtering' })
  @ApiResponse({ status: 200, description: 'Returns express deliveries list' })
  findAll(@Query() query: GetExpressDeliveriesQueryDto) {
    return this.expressDeliveriesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get express delivery by ID' })
  @ApiParam({ name: 'id', description: 'Express delivery UUID' })
  @ApiResponse({ status: 200, description: 'Returns the express delivery' })
  @ApiResponse({ status: 404, description: 'Express delivery not found' })
  findOne(@Param('id') id: string) {
    return this.expressDeliveriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update express delivery' })
  @ApiParam({ name: 'id', description: 'Express delivery UUID' })
  @ApiResponse({
    status: 200,
    description: 'Express delivery updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Express delivery not found' })
  update(@Param('id') id: string, @Body() updateDto: UpdateExpressDeliveryDto) {
    return this.expressDeliveriesService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete express delivery (set status=CANCELLED)' })
  @ApiParam({ name: 'id', description: 'Express delivery UUID' })
  @ApiResponse({
    status: 200,
    description: 'Express delivery cancelled successfully',
  })
  @ApiResponse({ status: 404, description: 'Express delivery not found' })
  remove(@Param('id') id: string) {
    return this.expressDeliveriesService.remove(id);
  }
}
