import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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

  /** File size in bytes (used for upload-size validation). */
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  @IsOptional()
  fileSize?: number;

  /** Backward compatibility for clients sending lowercase "filesize". */
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  @IsOptional()
  filesize?: number;
}
