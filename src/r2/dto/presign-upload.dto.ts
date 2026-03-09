import { IsNotEmpty, IsString } from 'class-validator';

export class PresignUploadDto {
  /** Original filename (used to generate the storage key). */
  @IsString()
  @IsNotEmpty()
  filename: string;

  /** MIME content-type, e.g. "image/jpeg", "video/mp4", "application/pdf". */
  @IsString()
  @IsNotEmpty()
  contentType: string;

  /** Sub-folder inside the bucket, e.g. "drivers". */
  @IsString()
  @IsNotEmpty()
  folder: string;
}
