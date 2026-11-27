import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import sharp, { type Metadata } from 'sharp';
import { config } from '../../config';
import { BadRequestError } from '../../errors';
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanDatabase,
  seedRequiredData,
  seedCocktail,
  prisma,
} from '../../test/helpers';
import { blackPng, testImage, uploadedFile, writeStoredPhoto } from '../../test/images';
import {
  backfillImageVariants,
  derivedVariantNames,
  MAX_INPUT_PIXELS,
  previewImageName,
  storeUploadedImage,
  type ImageVariantsDb,
} from './imageVariants';

beforeAll(async () => {
  await setupTestDatabase();
});
afterAll(async () => {
  await teardownTestDatabase();
});
beforeEach(async () => {
  await cleanDatabase();
  await seedRequiredData();
  fs.rmSync(config.uploadDir, { recursive: true, force: true });
});
afterEach(() => {
  vi.restoreAllMocks();
});

function uploadDirContent(): string[] {
  return fs.existsSync(config.uploadDir) ? fs.readdirSync(config.uploadDir).sort() : [];
}

function storedMetadata(fileName: string): Promise<Metadata> {
  return sharp(uploadedFile(fileName)).metadata();
}

/** A photo in the parent of the upload folder, as a crafted backup could name it. */
async function writePhotoOutsideUploads() {
  const dir = path.dirname(config.uploadDir);
  const stem = `carta-outside-${process.pid}`;
  const name = `${stem}.jpg`;
  fs.writeFileSync(path.join(dir, name), await testImage());
  // The photo and the copies a faulty backfill would write next to it
  const remove = () => {
    for (const file of [name, ...derivedVariantNames(name)]) {
      fs.rmSync(path.join(dir, file), { force: true });
    }
  };
  return { dir, stem, name, remove };
}

function filesOf(imagePath: string): string[] {
  return [imagePath, ...derivedVariantNames(imagePath)];
}

describe('derivedVariantNames', () => {
  it('should name the copies after the photo, whatever its extension', () => {
    expect(derivedVariantNames('abc.webp')).toEqual(['abc-960.webp', 'abc-480.webp', 'abc-og.jpg']);
    expect(derivedVariantNames('1700000000-42.JPG')).toEqual([
      '1700000000-42-960.webp',
      '1700000000-42-480.webp',
      '1700000000-42-og.jpg',
    ]);
  });
});

describe('storeUploadedImage', () => {
  it('should store the photo as WebP under a random name, with three smaller copies', async () => {
    const imagePath = await storeUploadedImage(
      await testImage({ width: 3000, height: 2000, format: 'png' }),
    );

    expect(imagePath).toMatch(/^[0-9a-f-]{36}\.webp$/);
    expect(uploadDirContent()).toEqual(filesOf(imagePath).sort());
    const [main, w960, w480, og] = await Promise.all(filesOf(imagePath).map(storedMetadata));
    expect([main.format, main.width, main.height]).toEqual(['webp', 1600, 1067]);
    expect([w960.format, w960.width]).toEqual(['webp', 960]);
    expect([w480.format, w480.width]).toEqual(['webp', 480]);
    expect([og.format, og.width]).toEqual(['jpeg', 1200]);
  });

  it('should never enlarge a small photo', async () => {
    const imagePath = await storeUploadedImage(await testImage({ width: 300, height: 200 }));

    for (const fileName of filesOf(imagePath)) {
      expect((await storedMetadata(fileName)).width).toBe(300);
    }
  });

  it('should drop the EXIF block and its GPS position from every file', async () => {
    const upload = await testImage({ withGps: true });
    expect((await sharp(upload).metadata()).exif).toBeDefined();

    const imagePath = await storeUploadedImage(upload);

    for (const fileName of filesOf(imagePath)) {
      const metadata = await storedMetadata(fileName);
      expect(metadata.exif).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
    }
  });

  it('should turn a portrait photo upright from its EXIF orientation', async () => {
    // Stored landscape, shot in portrait: the camera recorded "turn a quarter clockwise"
    const imagePath = await storeUploadedImage(
      await testImage({ width: 400, height: 200, orientation: 6 }),
    );

    const main = await storedMetadata(imagePath);
    expect([main.width, main.height]).toEqual([200, 400]);
  });

  it('should give the link preview copy a white background, JPEG having no transparency', async () => {
    const imagePath = await storeUploadedImage(
      await testImage({ format: 'png', transparent: true }),
    );
    const [, , og] = derivedVariantNames(imagePath);

    const { data } = await sharp(uploadedFile(og)).raw().toBuffer({ resolveWithObject: true });
    expect(Math.min(...data)).toBeGreaterThan(240);
  });

  it('should refuse a file that is not a readable image, and write nothing', async () => {
    await expect(storeUploadedImage(Buffer.from('fake-png-data'))).rejects.toThrow(
      new BadRequestError('errors.invalidImage'),
    );
    expect(uploadDirContent()).toEqual([]);
  });

  it('should accept a photo of exactly the pixel limit', async () => {
    const imagePath = await storeUploadedImage(blackPng(10_000, MAX_INPUT_PIXELS / 10_000));

    expect((await storedMetadata(imagePath)).width).toBe(1600);
  });

  it('should refuse a photo over the pixel limit, and write nothing', async () => {
    const upload = blackPng(10_000, MAX_INPUT_PIXELS / 10_000 + 1);

    await expect(storeUploadedImage(upload)).rejects.toThrow(
      new BadRequestError('errors.invalidImage'),
    );
    expect(uploadDirContent()).toEqual([]);
  });

  it('should remove what it wrote when a write fails halfway', async () => {
    const rename = fs.promises.rename;
    let renames = 0;
    vi.spyOn(fs.promises, 'rename').mockImplementation(async (from, to) => {
      if (++renames === 3) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      return rename(from, to);
    });

    await expect(storeUploadedImage(await testImage())).rejects.toThrow('disk full');

    expect(uploadDirContent()).toEqual([]);
  });
});

describe('previewImageName', () => {
  it('should name the JPEG copy once it exists', async () => {
    const imagePath = await storeUploadedImage(await testImage());

    expect(previewImageName(imagePath)).toBe(imagePath.replace('.webp', '-og.jpg'));
  });

  it('should fall back to the photo itself while its copy is missing', () => {
    expect(previewImageName('old-photo.jpg')).toBe('old-photo.jpg');
  });

  it('should leave a name that is not a bare file name as it is', async () => {
    const outside = await writePhotoOutsideUploads();
    fs.writeFileSync(path.join(outside.dir, `${outside.stem}-og.jpg`), 'preview');
    try {
      expect(previewImageName(`../${outside.name}`)).toBe(`../${outside.name}`);
    } finally {
      outside.remove();
    }
  });
});

describe('backfillImageVariants', () => {
  it('should add the missing copies of an older photo and keep the photo as it was', async () => {
    const original = await writeStoredPhoto('1700000000-42.jpg');
    await seedCocktail({ imagePath: '1700000000-42.jpg' });

    const result = await backfillImageVariants(prisma);

    expect(result).toEqual({ created: 3, failed: 0 });
    expect(uploadDirContent()).toEqual(filesOf('1700000000-42.jpg').sort());
    expect(fs.readFileSync(uploadedFile('1700000000-42.jpg')).equals(original)).toBe(true);
    const widths = await Promise.all(
      derivedVariantNames('1700000000-42.jpg').map(
        async (name) => (await storedMetadata(name)).width,
      ),
    );
    expect(widths).toEqual([960, 480, 1200]);
  });

  it('should do nothing on a second run', async () => {
    await writeStoredPhoto('old.png');
    await seedCocktail({ imagePath: 'old.png' });
    await backfillImageVariants(prisma);
    const firstRun = uploadDirContent().map((name) => fs.statSync(uploadedFile(name)).mtimeMs);

    expect(await backfillImageVariants(prisma)).toEqual({ created: 0, failed: 0 });
    expect(uploadDirContent().map((name) => fs.statSync(uploadedFile(name)).mtimeMs)).toEqual(
      firstRun,
    );
  });

  it('should only write the copies that are missing', async () => {
    await writeStoredPhoto('old.jpg');
    fs.writeFileSync(uploadedFile('old-480.webp'), 'kept as it is');
    await seedCocktail({ imagePath: 'old.jpg' });

    expect(await backfillImageVariants(prisma)).toEqual({ created: 2, failed: 0 });
    expect(fs.readFileSync(uploadedFile('old-480.webp'), 'utf8')).toBe('kept as it is');
  });

  it('should count a photo shared by two cocktails once', async () => {
    await writeStoredPhoto('shared.jpg');
    await seedCocktail({ name: 'One', imagePath: 'shared.jpg' });
    await seedCocktail({ name: 'Two', imagePath: 'shared.jpg' });

    expect(await backfillImageVariants(prisma)).toEqual({ created: 3, failed: 0 });
  });

  it('should skip missing photos', async () => {
    await seedCocktail({ name: 'Gone', imagePath: 'gone.jpg' });
    await seedCocktail({ name: 'Plain' });

    expect(await backfillImageVariants(prisma)).toEqual({ created: 0, failed: 0 });
    expect(uploadDirContent()).toEqual([]);
  });

  it('should never write next to a photo outside the upload folder', async () => {
    const outside = await writePhotoOutsideUploads();
    try {
      await seedCocktail({ name: 'Crafted', imagePath: `../${outside.name}` });

      expect(await backfillImageVariants(prisma)).toEqual({ created: 0, failed: 0 });
      expect(fs.readdirSync(outside.dir).filter((name) => name.startsWith(outside.stem))).toEqual([
        outside.name,
      ]);
    } finally {
      outside.remove();
    }
  });

  it('should log an unreadable photo, leave it without copies and go on with the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await writeStoredPhoto('broken.jpg', Buffer.from('not a photo'));
    await writeStoredPhoto('fine.jpg');
    await seedCocktail({ name: 'Broken', imagePath: 'broken.jpg' });
    await seedCocktail({ name: 'Fine', imagePath: 'fine.jpg' });

    expect(await backfillImageVariants(prisma)).toEqual({ created: 3, failed: 1 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('No smaller copies of broken.jpg'));
    expect(uploadDirContent()).toEqual(['broken.jpg', ...filesOf('fine.jpg')].sort());
  });

  it('should log, not reject, when the cocktails cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = {
      cocktail: { findMany: () => Promise.reject(new Error('database is locked')) },
    } as unknown as ImageVariantsDb;

    await expect(backfillImageVariants(db)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[uploads] Smaller photo copies not checked: database is locked',
    );
  });

  it('should run one backfill at a time', async () => {
    await writeStoredPhoto('old.jpg');
    await seedCocktail({ imagePath: 'old.jpg' });

    const [first, second] = await Promise.all([
      backfillImageVariants(prisma),
      backfillImageVariants(prisma),
    ]);

    // Run together, both would have found the three copies missing
    expect(first).toEqual({ created: 3, failed: 0 });
    expect(second).toEqual({ created: 0, failed: 0 });
  });
});
