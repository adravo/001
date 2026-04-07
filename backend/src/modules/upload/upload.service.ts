import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client, PutObjectCommand, GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly s3Enabled: boolean;

  constructor(private config: ConfigService) {
    const region = config.get<string>('AWS_REGION', 'ap-south-1');
    const accessKey = config.get<string>('AWS_ACCESS_KEY_ID');
    const secretKey = config.get<string>('AWS_SECRET_ACCESS_KEY');

    this.bucket = config.get<string>('AWS_S3_BUCKET', 'tn-land-verification');
    this.s3Enabled = !!(accessKey && secretKey);

    if (this.s3Enabled) {
      this.s3 = new S3Client({
        region,
        credentials: { accessKeyId: accessKey!, secretAccessKey: secretKey! },
      });
    } else {
      this.logger.warn('AWS credentials not configured — S3 uploads disabled');
    }
  }

  async uploadBuffer(
    buffer: Buffer,
    key: string,
    contentType: string,
  ): Promise<string> {
    if (!this.s3Enabled) {
      this.logger.warn(`S3 disabled. Would upload to: ${key}`);
      return `local://${key}`;
    }

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );

    return key;
  }

  async uploadFile(
    fileBuffer: Buffer,
    originalName: string,
    contentType: string,
    folder: string,
  ): Promise<string> {
    const hash = createHash('md5').update(fileBuffer).digest('hex').slice(0, 8);
    const ext = originalName.split('.').pop() || 'bin';
    const key = `${folder}/${Date.now()}-${hash}.${ext}`;
    return this.uploadBuffer(fileBuffer, key, contentType);
  }

  async getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    if (!this.s3Enabled || key.startsWith('local://')) {
      return `#local-file-${key}`;
    }
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn });
  }
}
