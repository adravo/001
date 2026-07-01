import {
  Controller, Post, Get, Param, Body, Query,
  UseGuards, ParseUUIDPipe, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SearchService } from './search.service';
import { CreateSearchDto } from './dto/create-search.dto';

@ApiTags('Search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Post()
  @ApiOperation({ summary: 'Initiate a new land search' })
  createSearch(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSearchDto,
  ) {
    return this.searchService.createSearch(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all searches for the authenticated user' })
  listSearches(
    @CurrentUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.searchService.listSearches(userId, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get status of a specific search' })
  getSearch(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.searchService.getSearch(id, userId);
  }

  @Get(':id/report')
  @ApiOperation({ summary: 'Get full land verification report' })
  getReport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.searchService.getReport(id, userId);
  }
}
