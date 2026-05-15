import { SetMetadata } from '@nestjs/common';
import { PerfilTipo } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: PerfilTipo[]) => SetMetadata(ROLES_KEY, roles);
