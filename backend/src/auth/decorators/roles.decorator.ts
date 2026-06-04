import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../dto/register.dto';
import { ROLES_KEY } from '../guards/roles.guard';

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
