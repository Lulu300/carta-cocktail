import { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import i18next from '../i18n';
import {
  BadRequestError,
  ConflictError,
  HttpError,
  NotFoundError,
  PayloadTooLargeError,
} from '../errors';

// Errors raised by body-parser (express.json) carry a `type` instead of a class.
function bodyParserErrorType(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('type' in err)) return undefined;
  return typeof err.type === 'string' ? err.type : undefined;
}

// Other client errors raised by body-parser (unsupported charset or encoding, aborted
// request) follow the http-errors convention: a 4xx `status` and `expose: true`.
function exposedClientStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const { status, expose } = err as { status?: unknown; expose?: unknown };
  const isClientStatus = typeof status === 'number' && status >= 400 && status < 500;
  return expose === true && isClientStatus ? status : undefined;
}

function fromPrismaKnownError(
  err: Prisma.PrismaClientKnownRequestError,
  method: string,
): HttpError | undefined {
  switch (err.code) {
    case 'P2025':
      return new NotFoundError();
    case 'P2002':
      return new ConflictError();
    case 'P2003':
      // On delete, the row is still referenced: a conflict. On create or update,
      // the request points to a row that does not exist: bad input.
      return method === 'DELETE' ? new ConflictError('errors.cannotDelete') : new BadRequestError();
    default:
      return undefined;
  }
}

/**
 * Maps any thrown value to the HttpError sent to the client.
 * Anything not recognized becomes a 500 so internal details never leak.
 */
export function toHttpError(err: unknown, method = 'GET'): HttpError {
  if (err instanceof HttpError) return err;

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = fromPrismaKnownError(err, method);
    if (mapped) return mapped;
  }
  // Includes ids parsed from a non-numeric path segment (NaN)
  if (err instanceof Prisma.PrismaClientValidationError) return new BadRequestError();

  if (err instanceof multer.MulterError) {
    return err.code === 'LIMIT_FILE_SIZE' ? new PayloadTooLargeError() : new BadRequestError();
  }

  const parserErrorType = bodyParserErrorType(err);
  if (parserErrorType === 'entity.parse.failed') return new BadRequestError('errors.invalidJson');
  if (parserErrorType === 'entity.too.large') return new PayloadTooLargeError();
  const clientStatus = exposedClientStatus(err);
  if (clientStatus) return new HttpError(clientStatus, 'errors.validationError');

  return new HttpError(500, 'errors.serverError');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // The response is already streaming: let Express close the connection.
  if (res.headersSent) {
    next(err);
    return;
  }
  const httpError = toHttpError(err, req.method);
  if (httpError.status >= 500) console.error(err);
  // req.t is missing when the error happens before the i18n middleware ran.
  const t = typeof req.t === 'function' ? req.t : i18next.getFixedT('en');
  res.status(httpError.status).json({
    error: t(httpError.i18nKey),
    ...(httpError.details !== undefined && { details: httpError.details }),
  });
};

/** JSON 404 for API paths that no router handles. */
export const apiNotFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new NotFoundError());
};
