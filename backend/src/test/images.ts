import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import sharp from 'sharp';
import { config } from '../config';

export interface TestImageOptions {
  width?: number;
  height?: number;
  format?: 'jpeg' | 'png' | 'webp';
  /** EXIF orientation: 6 means the camera was turned a quarter clockwise. */
  orientation?: number;
  /** Adds an EXIF block with a camera make and a GPS position, as a phone writes it. */
  withGps?: boolean;
  /** Transparent pixels (PNG and WebP only). */
  transparent?: boolean;
}

/** A real image, small unless asked otherwise, encoded by sharp. */
export async function testImage(options: TestImageOptions = {}): Promise<Buffer> {
  const { width = 64, height = 48, format = 'jpeg', orientation, withGps, transparent } = options;
  let image = sharp({
    create: {
      width,
      height,
      channels: transparent ? 4 : 3,
      background: transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : '#c0392b',
    },
  }).toFormat(format);
  if (orientation) image = image.withMetadata({ orientation });
  if (withGps) {
    image = image.withExif({
      IFD0: { Make: 'Test phone' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 51/1 24/1' },
    });
  }
  return image.toBuffer();
}

/** A real JPEG of exactly `size` bytes: decoders stop at its end marker and ignore the padding. */
export async function jpegOfSize(size: number): Promise<Buffer> {
  const image = await testImage();
  return Buffer.concat([image, Buffer.alloc(size - image.length)]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/**
 * A valid black grayscale PNG of `width` x `height`: a few hundred kB for 100 Mpx,
 * where sharp would need gigabytes of memory to create the same picture.
 */
export function blackPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  // 8 bits per sample, grayscale, default compression, filter and interlace
  header.set([8, 0, 0, 0, 0], 8);
  // Each row: filter byte 0, then one zero byte per pixel
  const pixels = zlib.deflateSync(Buffer.alloc((width + 1) * height));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', pixels),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Writes a photo to the upload folder, as uploads stored it before the smaller copies existed. */
export async function writeStoredPhoto(fileName: string, content?: Buffer): Promise<Buffer> {
  const photo = content ?? (await testImage({ width: 2000, height: 1000 }));
  fs.mkdirSync(config.uploadDir, { recursive: true });
  fs.writeFileSync(path.join(config.uploadDir, fileName), photo);
  return photo;
}

export function uploadedFile(fileName: string): string {
  return path.join(config.uploadDir, fileName);
}
