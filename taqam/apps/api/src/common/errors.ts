import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export const badRequest = (message: string, messageAr?: string, extra: Record<string, unknown> = {}) =>
  new BadRequestException({ message, messageAr, ...extra });
export const notFound = (entity = 'Resource', messageAr = 'العنصر غير موجود') =>
  new NotFoundException({ message: `${entity} not found`, messageAr });
export const conflict = (message: string, messageAr?: string) => new ConflictException({ message, messageAr });
export const forbidden = (message = 'Forbidden', messageAr = 'ليس لديك صلاحية لهذا الإجراء') =>
  new ForbiddenException({ message, messageAr });
