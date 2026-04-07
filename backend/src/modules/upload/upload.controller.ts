import {
  Controller, Post, Param, UploadedFile, UseInterceptors,
  UseGuards, BadRequestException, ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UploadService } from './upload.service';
import { SearchRequest } from '../../database/entities/search-request.entity';

@ApiTags('Upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(
    private uploadService: UploadService,
    @InjectRepository(SearchRequest) private searchRepo: Repository<SearchRequest>,
  ) {}

  @Post('ec/:searchId')
  @ApiOperation({ summary: 'Manually upload Encumbrance Certificate PDF' } as any)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_, file, cb) => {
      if (file.mimetype !== 'application/pdf') {
        return cb(new BadRequestException('Only PDF files allowed'), false);
      }
      cb(null, true);
    },
  }))
  async uploadEc(
    @Param('searchId', ParseUUIDPipe) searchId: string,
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');

    const search = await this.searchRepo.findOne({ where: { id: searchId, userId } });
    if (!search) throw new BadRequestException('Search not found');

    const key = await this.uploadService.uploadFile(
      file.buffer,
      file.originalname,
      'application/pdf',
      `ec-uploads/${userId}`,
    );

    await this.searchRepo.update(searchId, {
      status: 'manual_required',
      errorMessage: 'EC uploaded manually — awaiting processing',
    });

    return { success: true, key, message: 'EC uploaded. Our team will process it shortly.' };
  }
}
