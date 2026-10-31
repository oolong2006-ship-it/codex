import { Module } from '@nestjs/common';
import { PayrollModule } from '../payroll/payroll.module';
import { EmployeesModule } from '../employees/employees.module';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';

@Module({ imports: [PayrollModule, EmployeesModule], controllers: [ComplianceController], providers: [ComplianceService] })
export class ComplianceModule {}
