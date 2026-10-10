/**
 * Errors that carry an HTTP status and an i18n key.
 * Route handlers and services throw them; the error middleware translates the key
 * and sends `{ error, details? }`.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly i18nKey: string,
    public readonly details?: unknown,
  ) {
    super(i18nKey);
    this.name = new.target.name;
  }
}

export class BadRequestError extends HttpError {
  constructor(key = 'errors.validationError', details?: unknown) {
    super(400, key, details);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(key = 'errors.unauthorized') {
    super(401, key);
  }
}

export class ForbiddenError extends HttpError {
  constructor(key: string) {
    super(403, key);
  }
}

export class NotFoundError extends HttpError {
  constructor(key = 'errors.notFound') {
    super(404, key);
  }
}

export class ConflictError extends HttpError {
  constructor(key = 'errors.duplicateEntry', details?: unknown) {
    super(409, key, details);
  }
}

export class PayloadTooLargeError extends HttpError {
  constructor(key = 'errors.fileTooLarge') {
    super(413, key);
  }
}
