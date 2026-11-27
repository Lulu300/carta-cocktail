import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { parseNameTranslations } from '../utils/translations';
import { AuthRequest, optionalAuth } from '../middleware/auth';
import { NotFoundError } from '../errors';
import { calculateAvailabilities } from '../services/availabilityService';
import { buildPublicCocktailSelect, CATEGORY_PUBLIC_SELECT } from '../services/cocktail/includes';
import { exportCocktail } from '../services/cocktail/cocktailExport';
import { previewImageName } from '../services/cocktail/imageVariants';
import { getOrCreateSettings } from '../services/settingsService';
import { EMBED_ORIGINS_HEADER, parseEmbedOrigins } from '../services/embedOrigins';
import { renderSharePage } from '../services/sharePreview';
import { config } from '../config';
import { apiDocs, excludedFromApiDocs } from '../openapi/routeDoc';
import { IdParams } from '../validation/common';
import { CocktailExportFormat } from '../validation/cocktailImport';
import { MenuSummary } from '../validation/menus';
import { PublicCocktail, PublicMenu } from '../validation/public';
import { SiteSettings } from '../validation/settings';
import { Unit } from '../validation/units';

const router = Router();
const doc = apiDocs('Public');

// An invalid id answers 404 like an unknown one: a guest learns nothing about which ids exist
const COCKTAIL_NOT_FOUND =
  'No cocktail visible in a published menu has this id (any cocktail for the admin).';
const ADMIN_PREVIEW = 'With the admin token, also the private fields (preview).';
const SHARE_PAGE_EXCLUSION =
  'Link preview page (HTML) that nginx serves to the robots of messaging apps on /menu/ (task F-03): not an API for clients.';

// Bottles of a bottle menu: inventory fields stay on the server (see includes.ts)
const MENU_BOTTLE_PUBLIC_SELECT = {
  id: true,
  name: true,
  capacityMl: true,
  categoryId: true,
  alcoholPercentage: true,
  location: true,
  category: { select: CATEGORY_PUBLIC_SELECT },
} satisfies Prisma.BottleSelect;

// Hidden menu items and empty bottles are never served, even in admin preview:
// the public page does not display them either.
const VISIBLE_MENU_COCKTAIL_WHERE = { isHidden: false } satisfies Prisma.MenuCocktailWhereInput;
const VISIBLE_MENU_BOTTLE_WHERE = {
  isHidden: false,
  bottle: { remainingPercent: { gt: 0 } },
} satisfies Prisma.MenuBottleWhereInput;

// A guest only reaches cocktails that are visible in at least one published menu.
// The admin can preview any cocktail.
function buildPublicCocktailWhere(id: number, isAdmin: boolean): Prisma.CocktailWhereInput {
  if (isAdmin) return { id };
  return {
    id,
    menuCocktails: { some: { ...VISIBLE_MENU_COCKTAIL_WHERE, menu: { isPublic: true } } },
  };
}

function parseCocktailId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isAdminRequest(req: AuthRequest): boolean {
  return req.userId !== undefined;
}

/**
 * Adds `available` to each cocktail. Decision of 2026-10-08: a guest sees a
 * cocktail as available only when the manual switch (`isAvailable`, still
 * returned as is for the admin) is on AND the stock allows one serving.
 * One stock load for the whole list.
 */
async function withPublicAvailability<T extends { id: number; isAvailable: boolean }>(
  cocktails: T[],
): Promise<(T & { available: boolean })[]> {
  const availabilities = await calculateAvailabilities(
    prisma,
    cocktails.map(({ id }) => id),
  );
  return cocktails.map((cocktail) => {
    const maxServings = availabilities.get(cocktail.id)?.maxServings ?? 0;
    return { ...cocktail, available: cocktail.isAvailable && maxServings > 0 };
  });
}

router.use(optionalAuth);

router.get(
  '/menus',
  doc({
    operationId: 'listPublicMenus',
    summary: 'List the published menus',
    description: 'With their number of visible items, the most recently updated first.',
    responses: { 200: z.array(MenuSummary) },
  }),
  async (_req: Request, res: Response) => {
    const menus = await prisma.menu.findMany({
      where: { isPublic: true },
      include: {
        _count: {
          select: {
            cocktails: { where: VISIBLE_MENU_COCKTAIL_WHERE },
            bottles: { where: VISIBLE_MENU_BOTTLE_WHERE },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(menus);
  },
);

router.get(
  '/menus/:slug',
  doc({
    operationId: 'getPublicMenu',
    summary: 'Get a published menu',
    description: `Its sections and its visible items; empty bottles are left out. The admin also gets an unpublished menu (preview). ${ADMIN_PREVIEW}`,
    responses: { 200: PublicMenu },
    errors: { 404: 'No published menu has this slug (no menu at all for the admin).' },
  }),
  async (req: AuthRequest, res: Response) => {
    const isAdmin = isAdminRequest(req);
    const menu = await prisma.menu.findUnique({
      where: { slug: String(req.params.slug) },
      include: {
        sections: {
          orderBy: { position: 'asc' },
        },
        cocktails: {
          where: VISIBLE_MENU_COCKTAIL_WHERE,
          include: {
            cocktail: { select: buildPublicCocktailSelect(isAdmin) },
          },
          orderBy: { position: 'asc' },
        },
        bottles: {
          where: VISIBLE_MENU_BOTTLE_WHERE,
          include: {
            bottle: { select: MENU_BOTTLE_PUBLIC_SELECT },
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    // Unpublished menus are only visible to a verified admin (preview)
    if (!menu || (!menu.isPublic && !isAdmin)) throw new NotFoundError();

    const cocktails = await withPublicAvailability(menu.cocktails.map(({ cocktail }) => cocktail));
    const menuCocktails = menu.cocktails.map((menuCocktail, index) => ({
      ...menuCocktail,
      cocktail: cocktails[index],
    }));
    res.json(parseNameTranslations({ ...menu, cocktails: menuCocktails }));
  },
);

router.get(
  '/settings',
  doc({
    operationId: 'getPublicSiteSettings',
    summary: 'Get the name and the icon of the site',
    responses: { 200: SiteSettings },
  }),
  async (_req: Request, res: Response) => {
    const settings = await getOrCreateSettings();
    res.json({ siteName: settings.siteName, siteIcon: settings.siteIcon });
  },
);

// Sites allowed to show the public menu in an iframe, for nginx: it asks on each load of a
// /menu/ page (auth_request in frontend/nginx.conf.template) and copies the header into the
// frame-ancestors directive of that page. Empty when no site is allowed. Not secret: every
// /menu/ page sends the same list in its CSP.
router.get(
  '/embed-origins',
  doc({
    operationId: 'getEmbedOrigins',
    summary: 'Get the sites allowed to show the menu in a frame',
    description:
      'Asked by nginx on each load of a /menu/ page. Not secret: the CSP of the page sends the same list.',
    responses: {
      204: {
        description: 'The list is in the header.',
        headers: {
          [EMBED_ORIGINS_HEADER]: 'The allowed origins, separated by spaces; empty when none.',
        },
      },
    },
  }),
  async (_req: Request, res: Response) => {
    const { embedOrigins } = await getOrCreateSettings();
    res.set(EMBED_ORIGINS_HEADER, parseEmbedOrigins(embedOrigins).join(' ')).status(204).end();
  },
);

router.get(
  '/cocktails/:id/export',
  doc({
    operationId: 'exportPublicCocktail',
    summary: 'Export a cocktail as a JSON file',
    description: `The file the admin imports. ${ADMIN_PREVIEW}`,
    pathParams: IdParams,
    responses: {
      200: {
        description: 'The recipe, as a file to save.',
        content: { 'application/json': CocktailExportFormat },
        headers: { 'Content-Disposition': 'attachment; filename="<cocktail name>.json"' },
      },
    },
    errors: { 404: COCKTAIL_NOT_FOUND },
  }),
  async (req: AuthRequest, res: Response) => {
    const id = parseCocktailId(req.params.id);
    if (id === null) throw new NotFoundError();

    const isAdmin = isAdminRequest(req);
    const exported = await exportCocktail(buildPublicCocktailWhere(id, isAdmin), {
      includePrivate: isAdmin,
    });
    if (!exported) throw new NotFoundError();
    res.attachment(exported.filename).json(exported.payload);
  },
);

router.get(
  '/units',
  doc({
    operationId: 'listPublicUnits',
    summary: 'List the units',
    description: 'The public pages convert the quantities of the recipes with them.',
    responses: { 200: z.array(Unit) },
  }),
  async (_req: Request, res: Response) => {
    const units = await prisma.unit.findMany({ orderBy: { name: 'asc' } });
    res.json(parseNameTranslations(units));
  },
);

router.get(
  '/cocktails/:id',
  doc({
    operationId: 'getPublicCocktail',
    summary: 'Get a cocktail of a published menu',
    description: `Its recipe and whether it is available (switch on and enough stock). ${ADMIN_PREVIEW}`,
    pathParams: IdParams,
    responses: { 200: PublicCocktail },
    errors: { 404: COCKTAIL_NOT_FOUND },
  }),
  async (req: AuthRequest, res: Response) => {
    const id = parseCocktailId(req.params.id);
    if (id === null) throw new NotFoundError();

    const isAdmin = isAdminRequest(req);
    const cocktail = await prisma.cocktail.findFirst({
      where: buildPublicCocktailWhere(id, isAdmin),
      select: buildPublicCocktailSelect(isAdmin),
    });

    if (!cocktail) throw new NotFoundError();

    const [publicCocktail] = await withPublicAvailability([cocktail]);
    res.json(parseNameTranslations(publicCocktail));
  },
);

/** What a link preview shows of a menu or a cocktail. */
interface SharedPage {
  name: string;
  description: string | null;
  imagePath: string | null;
}

/**
 * Absolute URLs are required by Open Graph. nginx forwards the host the client
 * asked for (X-Forwarded-Host), but `http` behind a TLS reverse proxy:
 * PUBLIC_BASE_URL gives the real address.
 */
function publicBaseUrl(req: Request): string {
  return config.publicBaseUrl ?? `${req.protocol}://${req.host}`;
}

async function sendSharePage(req: Request, res: Response, page: SharedPage, pagePath: string) {
  const { siteName } = await getOrCreateSettings();
  const baseUrl = publicBaseUrl(req);
  const html = renderSharePage({
    pageName: page.name,
    siteName,
    description: page.description,
    pageUrl: `${baseUrl}${pagePath}`,
    imageUrl: page.imagePath
      ? `${baseUrl}/uploads/${encodeURIComponent(previewImageName(page.imagePath))}`
      : null,
  });
  // nginx answers the same URL with the SPA to every other client: a cache must not mix them up
  res.set({ 'Cache-Control': 'no-cache', Vary: 'User-Agent' }).type('html').send(html);
}

// Link previews of /menu/:slug and /menu/:slug/cocktail/:id. nginx sends the preview robots of
// messaging apps here (frontend/nginx.conf.template). Guest rules only, even with an admin
// token: an unpublished menu, a hidden item or a cocktail outside the menu answers 404.
router.get(
  '/share/menu/:slug',
  excludedFromApiDocs(SHARE_PAGE_EXCLUSION),
  async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const menu = await prisma.menu.findFirst({
      where: { slug, isPublic: true },
      select: {
        name: true,
        description: true,
        // The photo of the first illustrated cocktail stands for the menu
        cocktails: {
          where: { ...VISIBLE_MENU_COCKTAIL_WHERE, cocktail: { imagePath: { not: null } } },
          orderBy: { position: 'asc' },
          take: 1,
          select: { cocktail: { select: { imagePath: true } } },
        },
      },
    });
    if (!menu) throw new NotFoundError();

    const imagePath = menu.cocktails[0]?.cocktail.imagePath ?? null;
    await sendSharePage(req, res, { ...menu, imagePath }, `/menu/${encodeURIComponent(slug)}`);
  },
);

router.get(
  '/share/menu/:slug/cocktail/:id',
  excludedFromApiDocs(SHARE_PAGE_EXCLUSION),
  async (req: Request, res: Response) => {
    const id = parseCocktailId(req.params.id);
    if (id === null) throw new NotFoundError();

    const slug = String(req.params.slug);
    const menuCocktail = await prisma.menuCocktail.findFirst({
      where: { ...VISIBLE_MENU_COCKTAIL_WHERE, cocktailId: id, menu: { slug, isPublic: true } },
      select: { cocktail: { select: { name: true, description: true, imagePath: true } } },
    });
    if (!menuCocktail) throw new NotFoundError();

    await sendSharePage(
      req,
      res,
      menuCocktail.cocktail,
      `/menu/${encodeURIComponent(slug)}/cocktail/${id}`,
    );
  },
);

export default router;
