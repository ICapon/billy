import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

export const API_VERSION = '0.1.0';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Billy API')
    .setDescription(
      'Business file upload, extraction results and queryable records. ' +
        'No authentication in v1: every resource belongs to the single configured business owner.',
    )
    .setVersion(API_VERSION)
    .addTag('files', 'Upload, list, download, retry and delete business files')
    .addTag('records', 'Extracted transactions, totals and product lists')
    .addTag('duplicates', 'Likely duplicate transactions across files')
    .addTag('costs', 'Processing cost summary and limit status')
    .addTag('dashboard', 'File activity and pending items for the dashboard')
    .build();
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}
