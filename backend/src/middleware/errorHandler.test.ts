import { describe, it, expect, vi, afterEach } from 'vitest';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { toHttpError, errorHandler } from './errorHandler';
import {
  HttpError, BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError,
  PayloadTooLargeError,
} from '../errors';

function prismaKnownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test' });
}

// body-parser errors are plain errors tagged with a `type`
function bodyParserError(type: string) {
  return Object.assign(new Error('body-parser'), { type });
}

describe('error classes', () => {
  it.each([
    [new BadRequestError(), 400, 'errors.validationError'],
    [new UnauthorizedError(), 401, 'errors.unauthorized'],
    [new ForbiddenError('errors.cannotDeleteDefaultMenu'), 403, 'errors.cannotDeleteDefaultMenu'],
    [new NotFoundError(), 404, 'errors.notFound'],
    [new ConflictError(), 409, 'errors.duplicateEntry'],
    [new PayloadTooLargeError(), 413, 'errors.fileTooLarge'],
  ])('%s has its status and default key', (error, status, key) => {
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(status);
    expect(error.i18nKey).toBe(key);
    expect(error.name).toBe(error.constructor.name);
  });

  it('keeps optional details', () => {
    expect(new BadRequestError('errors.invalidImportFile', { reason: 'x' }).details).toEqual({ reason: 'x' });
    expect(new ConflictError('errors.cannotDelete', ['a']).details).toEqual(['a']);
  });
});

describe('toHttpError', () => {
  it('returns an HttpError unchanged', () => {
    const error = new ConflictError('errors.cannotDelete', { ids: [1] });
    expect(toHttpError(error)).toBe(error);
  });

  it.each([
    ['P2025', 'GET', 404, 'errors.notFound'],
    ['P2002', 'POST', 409, 'errors.duplicateEntry'],
    ['P2003', 'DELETE', 409, 'errors.cannotDelete'],
    ['P2003', 'PUT', 400, 'errors.validationError'],
    ['P2003', 'POST', 400, 'errors.validationError'],
    ['P2000', 'POST', 500, 'errors.serverError'],
  ])('maps Prisma %s on %s to %i %s', (code, method, status, key) => {
    const httpError = toHttpError(prismaKnownError(code), method);
    expect(httpError.status).toBe(status);
    expect(httpError.i18nKey).toBe(key);
  });

  it('maps a Prisma validation error (such as a NaN id) to 400', () => {
    const error = new Prisma.PrismaClientValidationError('Invalid value', { clientVersion: 'test' });
    expect(toHttpError(error)).toMatchObject({ status: 400, i18nKey: 'errors.validationError' });
  });

  it('maps a multer size limit to 413', () => {
    const error = new multer.MulterError('LIMIT_FILE_SIZE', 'image');
    expect(toHttpError(error)).toMatchObject({ status: 413, i18nKey: 'errors.fileTooLarge' });
  });

  it('maps other multer errors to 400', () => {
    const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'photo');
    expect(toHttpError(error)).toMatchObject({ status: 400, i18nKey: 'errors.validationError' });
  });

  it('maps an invalid JSON body to 400', () => {
    expect(toHttpError(bodyParserError('entity.parse.failed')))
      .toMatchObject({ status: 400, i18nKey: 'errors.invalidJson' });
  });

  it('maps a body over the parser limit to 413', () => {
    expect(toHttpError(bodyParserError('entity.too.large')))
      .toMatchObject({ status: 413, i18nKey: 'errors.fileTooLarge' });
  });

  it('keeps the status of other exposed client errors', () => {
    const error = Object.assign(bodyParserError('charset.unsupported'), { status: 415, expose: true });
    expect(toHttpError(error)).toMatchObject({ status: 415, i18nKey: 'errors.validationError' });
  });

  it.each([
    ['an Error', new Error('boom')],
    ['an unknown body-parser type', bodyParserError('charset.unsupported')],
    ['an exposed server error', Object.assign(new Error('x'), { status: 503, expose: true })],
    ['an unexposed client error', Object.assign(new Error('x'), { status: 400, expose: false })],
    ['an error with a non-string type', Object.assign(new Error('x'), { type: 42 })],
    ['a string', 'boom'],
    ['null', null],
  ])('maps %s to 500', (_label, error) => {
    expect(toHttpError(error)).toMatchObject({ status: 500, i18nKey: 'errors.serverError' });
  });
});

describe('errorHandler', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  function mockResponse(headersSent = false) {
    const res = { headersSent, status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    return res;
  }

  it('sends the translated message and the details', () => {
    const req = { method: 'POST', t: vi.fn((key: string) => `translated:${key}`) };
    const res = mockResponse();
    const next = vi.fn();

    errorHandler(new BadRequestError('errors.invalidImportFile', { reason: 'bad csv' }),
      req as unknown as Request, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'translated:errors.invalidImportFile',
      details: { reason: 'bad csv' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('omits details when the error has none', () => {
    const req = { method: 'GET', t: (key: string) => key };
    const res = mockResponse();

    errorHandler(new NotFoundError(), req as unknown as Request, res as unknown as Response, vi.fn());

    expect(res.json).toHaveBeenCalledWith({ error: 'errors.notFound' });
  });

  it('falls back to English when the i18n middleware has not run', () => {
    const req = { method: 'POST' };
    const res = mockResponse();

    errorHandler(bodyParserError('entity.parse.failed'), req as unknown as Request, res as unknown as Response, vi.fn());

    expect(res.json).toHaveBeenCalledWith({ error: 'The request body is not valid JSON' });
  });

  it('logs unexpected errors and hides their message', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = { method: 'GET', t: (key: string) => key };
    const res = mockResponse();
    const error = new Error('secret internal detail');

    errorHandler(error, req as unknown as Request, res as unknown as Response, vi.fn());

    expect(consoleError).toHaveBeenCalledWith(error);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'errors.serverError' });
  });

  it('does not log client errors', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = { method: 'GET', t: (key: string) => key };

    errorHandler(new NotFoundError(), req as unknown as Request, mockResponse() as unknown as Response, vi.fn());

    expect(consoleError).not.toHaveBeenCalled();
  });

  it('hands the error to Express when the response has already started', () => {
    const req = { method: 'GET', t: (key: string) => key };
    const res = mockResponse(true);
    const next = vi.fn();
    const error = new Error('stream failed');

    errorHandler(error, req as unknown as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});
