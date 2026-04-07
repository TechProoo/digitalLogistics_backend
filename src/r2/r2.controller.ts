import {
  Body,
  Controller,
  Post,
  Query,
  Get,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { R2Service } from './r2.service';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';

@SkipThrottle({ global: true, adminLogin: true })
@Controller('uploads')
export class R2Controller {
  constructor(private readonly r2Service: R2Service) {}

  /**
   * POST /uploads/presign
   * Returns { key, uploadUrl } so the frontend can PUT the file directly to R2.
   * This endpoint is public (driver applicants are not authenticated).
   */
  @SetMetadata('response_message', 'Presigned upload URL generated.')
  @Post('presign')
  async presign(@Body() dto: PresignUploadDto) {
    return this.r2Service.presignUpload(
      dto.folder,
      dto.filename,
      dto.contentType,
    );
  }

  /**
   * GET /uploads/view?key=drivers/xxx.jpg
   * Returns { url } — a presigned download URL for the admin to view a file.
   */
  @UseGuards(AdminJwtGuard)
  @SetMetadata('response_message', 'Presigned download URL generated.')
  @Get('view')
  async view(@Query('key') key: string) {
    const url = await this.r2Service.presignDownload(key);
    return { url };
  }
}
