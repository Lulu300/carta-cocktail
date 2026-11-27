import { describe, it, expect } from 'vitest';
import { scalarConfiguration } from './apiReferenceConfiguration';

const DOCUMENT = { openapi: '3.1.1', info: { title: 'Carta Cocktail API', version: 'test' } };

describe('scalarConfiguration', () => {
  it('hands the viewer the document and the session token of the admin', () => {
    const configuration = scalarConfiguration(DOCUMENT, 'session-token', 'en');

    expect(configuration).toMatchObject({
      content: DOCUMENT,
      baseServerURL: window.location.origin,
      authentication: {
        preferredSecurityScheme: 'bearerAuth',
        securitySchemes: { bearerAuth: { token: 'session-token' } },
      },
      persistAuth: false,
    });
  });

  it('turns off everything that would reach another site', () => {
    const configuration = scalarConfiguration(DOCUMENT, 'session-token', 'en');

    expect(configuration).toMatchObject({
      withDefaultFonts: false,
      agent: { disabled: true },
      mcp: { disabled: true },
      telemetry: false,
    });
  });

  it.each([
    ['fr', 'fr'],
    ['en', 'en'],
    ['de', 'en'],
  ])('shows the viewer in the language of the app (%s gives %s)', (language, locale) => {
    expect(scalarConfiguration(DOCUMENT, null, language)).toMatchObject({
      localization: { locale },
    });
  });

  it('sends no token when there is no session', () => {
    expect(scalarConfiguration(DOCUMENT, null, 'en')).toMatchObject({
      authentication: { securitySchemes: { bearerAuth: { token: '' } } },
    });
  });
});
