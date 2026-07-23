import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../rbac';

export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
