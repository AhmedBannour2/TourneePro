import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { PlatformsService } from './platforms.service';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { UpdatePlatformDto } from './dto/update-platform.dto';

// We'll create a stub guard since auth module is being built in parallel
// @UseGuards(JwtAuthGuard)
@ApiTags('platforms')
@ApiBearerAuth()
@Controller('platforms')
export class PlatformsController {
  constructor(private readonly platformsService: PlatformsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new platform' })
  @ApiResponse({ status: 201, description: 'Platform created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Platform with this code already exists' })
  create(@Body() createPlatformDto: CreatePlatformDto) {
    return this.platformsService.create(createPlatformDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all platforms' })
  @ApiResponse({ status: 200, description: 'Returns all platforms' })
  findAll() {
    return this.platformsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get platform by ID' })
  @ApiParam({ name: 'id', description: 'Platform UUID' })
  @ApiResponse({ status: 200, description: 'Returns the platform' })
  @ApiResponse({ status: 404, description: 'Platform not found' })
  findOne(@Param('id') id: string) {
    return this.platformsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update platform' })
  @ApiParam({ name: 'id', description: 'Platform UUID' })
  @ApiResponse({ status: 200, description: 'Platform updated successfully' })
  @ApiResponse({ status: 404, description: 'Platform not found' })
  @ApiResponse({ status: 409, description: 'Platform with this code already exists' })
  update(@Param('id') id: string, @Body() updatePlatformDto: UpdatePlatformDto) {
    return this.platformsService.update(id, updatePlatformDto);
  }
}
