import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { UpdatePlatformDto } from './dto/update-platform.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PlatformsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPlatformDto: CreatePlatformDto) {
    try {
      return await this.prisma.platform.create({
        data: createPlatformDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Platform with code ${createPlatformDto.code} already exists`,
          );
        }
      }
      throw error;
    }
  }

  async findAll() {
    return this.prisma.platform.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const platform = await this.prisma.platform.findUnique({
      where: { id },
    });

    if (!platform) {
      throw new NotFoundException(`Platform with ID ${id} not found`);
    }

    return platform;
  }

  async update(id: string, updatePlatformDto: UpdatePlatformDto) {
    // Check if platform exists
    await this.findOne(id);

    try {
      return await this.prisma.platform.update({
        where: { id },
        data: updatePlatformDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Platform with code ${updatePlatformDto.code} already exists`,
          );
        }
      }
      throw error;
    }
  }
}
