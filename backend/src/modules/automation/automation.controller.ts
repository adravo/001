import {
  Controller, Post, Get, Body, Param, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AutomationService } from './automation.service';

class CaptchaResponseDto {
  @IsString() sessionToken: string;
  @IsString() solution: string;
}

@ApiTags('Automation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('automation')
export class AutomationController {
  constructor(private automationService: AutomationService) {}

  @Post(':searchId/captcha-response')
  @ApiOperation({ summary: 'Submit CAPTCHA solution to resume automation' })
  submitCaptcha(
    @Param('searchId', ParseUUIDPipe) searchId: string,
    @Body() dto: CaptchaResponseDto,
  ) {
    return this.automationService.submitCaptchaResponse(
      searchId,
      dto.sessionToken,
      dto.solution,
    );
  }

  @Get(':searchId/logs')
  @ApiOperation({ summary: 'Get automation activity logs for a search' })
  getLogs(@Param('searchId', ParseUUIDPipe) searchId: string) {
    return this.automationService.getAutomationLogs(searchId);
  }
}
