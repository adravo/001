import {
  Controller, Get, Param, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get(':searchId')
  @ApiOperation({ summary: 'Get full land verification report with signed PDF URL' })
  getReport(
    @Param('searchId', ParseUUIDPipe) searchId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.reportsService.getReport(searchId, userId);
  }
}
