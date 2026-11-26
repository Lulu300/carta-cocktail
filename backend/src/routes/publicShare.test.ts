import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanDatabase,
  seedRequiredData,
  request,
  authHeader,
  prisma,
  seedCocktail,
  seedMenu,
  addCocktailToMenu,
} from '../test/helpers';
import { config } from '../config';
import { writeStoredPhoto } from '../test/images';

beforeAll(async () => {
  await setupTestDatabase();
});
afterAll(async () => {
  await teardownTestDatabase();
});
beforeEach(async () => {
  await cleanDatabase();
  await seedRequiredData();
  await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: { siteName: 'My Bar' },
    create: { siteName: 'My Bar' },
  });
});

const savedPublicBaseUrl = config.publicBaseUrl;
afterEach(() => {
  config.publicBaseUrl = savedPublicBaseUrl;
});

const HOST = 'carte.test';

/** The content of a <meta property|name="key"> tag, or undefined when the page has none. */
function metaContent(html: string, key: string): string | undefined {
  return html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`))?.[1];
}

async function seedIllustratedCocktail(
  name: string,
  imagePath: string,
  description: string | null = null,
) {
  return seedCocktail({ name, description, imagePath });
}

function getShare(path: string) {
  return request.get(`/api/public/share${path}`).set('Host', HOST);
}

describe('GET /api/public/share/menu/:slug', () => {
  it('should describe a public menu with the photo of its first visible illustrated cocktail', async () => {
    const menu = await seedMenu({
      name: 'Summer',
      slug: 'summer',
      isPublic: true,
      description: 'Fresh drinks',
    });
    const plain = await seedCocktail({ name: 'Plain' });
    const hidden = await seedIllustratedCocktail('Hidden', 'hidden.jpg');
    const mojito = await seedIllustratedCocktail('Mojito', 'mojito.jpg');
    const daiquiri = await seedIllustratedCocktail('Daiquiri', 'daiquiri.jpg');
    await addCocktailToMenu(menu.id, plain.id, { position: 0 });
    await addCocktailToMenu(menu.id, hidden.id, { position: 1, isHidden: true });
    await addCocktailToMenu(menu.id, daiquiri.id, { position: 3 });
    await addCocktailToMenu(menu.id, mojito.id, { position: 2 });

    const res = await getShare('/menu/summer');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/html/);
    expect(res.headers.vary).toMatch(/User-Agent/);
    expect(res.text).toContain('<title>Summer · My Bar</title>');
    expect(metaContent(res.text, 'og:title')).toBe('Summer · My Bar');
    expect(metaContent(res.text, 'og:site_name')).toBe('My Bar');
    expect(metaContent(res.text, 'og:type')).toBe('website');
    expect(metaContent(res.text, 'og:description')).toBe('Fresh drinks');
    expect(metaContent(res.text, 'og:url')).toBe(`http://${HOST}/menu/summer`);
    expect(metaContent(res.text, 'og:image')).toBe(`http://${HOST}/uploads/mojito.jpg`);
    expect(metaContent(res.text, 'twitter:card')).toBe('summary_large_image');
    expect(res.text).toContain(`<a href="http://${HOST}/menu/summer">Summer · My Bar</a>`);
  });

  it('should leave out the image and the description when the menu has none', async () => {
    const menu = await seedMenu({ name: 'Plain', slug: 'plain', isPublic: true });
    await addCocktailToMenu(menu.id, (await seedCocktail()).id);

    const res = await getShare('/menu/plain');

    expect(res.status).toBe(200);
    expect(metaContent(res.text, 'og:image')).toBeUndefined();
    expect(metaContent(res.text, 'og:description')).toBeUndefined();
    expect(metaContent(res.text, 'twitter:card')).toBe('summary');
  });

  it('should fall back to the default site name when the admin left it empty', async () => {
    await prisma.siteSettings.update({ where: { id: 1 }, data: { siteName: '' } });
    await seedMenu({ name: 'Summer', slug: 'summer', isPublic: true });

    const res = await getShare('/menu/summer');

    expect(metaContent(res.text, 'og:title')).toBe('Summer · Carta Cocktail');
  });

  it('should use the scheme and the host, port included, forwarded by nginx', async () => {
    await seedMenu({ name: 'Summer', slug: 'summer', isPublic: true });

    const res = await getShare('/menu/summer')
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-Host', 'carte.example.com:8443');

    expect(metaContent(res.text, 'og:url')).toBe('https://carte.example.com:8443/menu/summer');
  });

  it('should build absolute URLs on PUBLIC_BASE_URL when it is set', async () => {
    config.publicBaseUrl = 'https://carte.example.com';
    const menu = await seedMenu({ name: 'Summer', slug: 'summer', isPublic: true });
    await addCocktailToMenu(menu.id, (await seedIllustratedCocktail('Mojito', 'mojito.jpg')).id);

    const res = await getShare('/menu/summer');

    expect(metaContent(res.text, 'og:url')).toBe('https://carte.example.com/menu/summer');
    expect(metaContent(res.text, 'og:image')).toBe('https://carte.example.com/uploads/mojito.jpg');
  });

  it('should answer 404 for an unpublished menu, even with an admin token', async () => {
    await seedMenu({ name: 'Draft', slug: 'draft', isPublic: false });

    expect((await getShare('/menu/draft')).status).toBe(404);
    expect((await getShare('/menu/draft').set(authHeader())).status).toBe(404);
  });

  it('should answer 404 for an unknown slug', async () => {
    expect((await getShare('/menu/unknown')).status).toBe(404);
  });
});

describe('GET /api/public/share/menu/:slug/cocktail/:id', () => {
  it('should describe a cocktail of a public menu, without its private notes', async () => {
    const menu = await seedMenu({ name: 'Summer', slug: 'summer', isPublic: true });
    const mojito = await seedIllustratedCocktail('Mojito', 'mojito.jpg', 'Mint and lime');
    await prisma.cocktail.update({ where: { id: mojito.id }, data: { notes: 'Use the good rum' } });
    await addCocktailToMenu(menu.id, mojito.id);

    const res = await getShare(`/menu/summer/cocktail/${mojito.id}`);

    expect(res.status).toBe(200);
    expect(metaContent(res.text, 'og:title')).toBe('Mojito · My Bar');
    expect(metaContent(res.text, 'og:description')).toBe('Mint and lime');
    expect(metaContent(res.text, 'og:url')).toBe(
      `http://${HOST}/menu/summer/cocktail/${mojito.id}`,
    );
    // No JPEG copy on disk (a photo the backfill has not reached): the photo itself
    expect(metaContent(res.text, 'og:image')).toBe(`http://${HOST}/uploads/mojito.jpg`);
    expect(res.text).not.toContain('good rum');
  });

  it('should show the JPEG copy of the photo, which every messaging app displays', async () => {
    const menu = await seedMenu({ name: 'Summer', slug: 'summer', isPublic: true });
    const mojito = await seedIllustratedCocktail('Mojito', 'mojito.webp');
    await addCocktailToMenu(menu.id, mojito.id);
    await writeStoredPhoto('mojito-og.jpg');

    const res = await getShare(`/menu/summer/cocktail/${mojito.id}`);

    expect(metaContent(res.text, 'og:image')).toBe(`http://${HOST}/uploads/mojito-og.jpg`);
  });

  it('should escape the names and descriptions it inserts', async () => {
    const menu = await seedMenu({ name: 'Summer', slug: 'summer', isPublic: true });
    const cocktail = await seedCocktail({
      name: '<script>alert("x")</script> & co',
      description: '"><img src=x onerror=alert(1)>',
    });
    await addCocktailToMenu(menu.id, cocktail.id);

    const res = await getShare(`/menu/summer/cocktail/${cocktail.id}`);

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<script>');
    expect(res.text).not.toContain('<img');
    expect(metaContent(res.text, 'og:title')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co · My Bar',
    );
    expect(metaContent(res.text, 'og:description')).toBe(
      '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;',
    );
  });

  it('should answer 404 for a cocktail hidden in the menu', async () => {
    const menu = await seedMenu({ name: 'Summer', slug: 'summer', isPublic: true });
    const cocktail = await seedCocktail();
    await addCocktailToMenu(menu.id, cocktail.id, { isHidden: true });

    expect((await getShare(`/menu/summer/cocktail/${cocktail.id}`)).status).toBe(404);
  });

  it('should answer 404 for a cocktail of another menu', async () => {
    await seedMenu({ name: 'Summer', slug: 'summer', isPublic: true });
    const winter = await seedMenu({ name: 'Winter', slug: 'winter', isPublic: true });
    const cocktail = await seedCocktail();
    await addCocktailToMenu(winter.id, cocktail.id);

    expect((await getShare(`/menu/summer/cocktail/${cocktail.id}`)).status).toBe(404);
  });

  it('should answer 404 for a cocktail of an unpublished menu, even with an admin token', async () => {
    const menu = await seedMenu({ name: 'Draft', slug: 'draft', isPublic: false });
    const cocktail = await seedCocktail();
    await addCocktailToMenu(menu.id, cocktail.id);

    expect((await getShare(`/menu/draft/cocktail/${cocktail.id}`)).status).toBe(404);
    expect((await getShare(`/menu/draft/cocktail/${cocktail.id}`).set(authHeader())).status).toBe(
      404,
    );
  });

  it.each(['abc', '0', '1.5'])('should answer 404 for the id %s', async (id) => {
    await seedMenu({ name: 'Summer', slug: 'summer', isPublic: true });

    expect((await getShare(`/menu/summer/cocktail/${id}`)).status).toBe(404);
  });
});
