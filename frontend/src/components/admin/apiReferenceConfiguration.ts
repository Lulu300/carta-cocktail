import type { ComponentProps } from 'react';
import type { ApiReferenceReact } from '@scalar/api-reference-react';

type ScalarConfiguration = ComponentProps<typeof ApiReferenceReact>['configuration'];

/** The security scheme of the session token in the OpenAPI document of the backend. */
const SESSION_SCHEME = 'bearerAuth';

const SCALAR_LOCALES = ['en', 'fr'];

/**
 * Settings of the Scalar viewer. It reads the document it is given (the backend's document needs
 * the session, which Scalar's own fetch would not send), and its "Test Request" button sends the
 * admin's token. Everything that would reach another site is off: the CSP (connect-src and
 * font-src 'self') would block it anyway.
 */
export function scalarConfiguration(
  document: Record<string, unknown>,
  token: string | null,
  language: string,
): ScalarConfiguration {
  return {
    content: document,
    // Requests go to the site the admin is on, through nginx like the app's own
    baseServerURL: window.location.origin,
    authentication: {
      preferredSecurityScheme: SESSION_SCHEME,
      securitySchemes: { [SESSION_SCHEME]: { token: token ?? '' } },
    },
    // The token stays in the app's own storage only
    persistAuth: false,
    localization: { locale: SCALAR_LOCALES.includes(language) ? language : 'en' },
    // The admin is dark: no light mode to switch to
    darkMode: true,
    forceDarkModeState: 'dark',
    hideDarkModeToggle: true,
    // Fonts, AI agent and MCP buttons all call scalar.com
    withDefaultFonts: false,
    agent: { disabled: true },
    mcp: { disabled: true },
    telemetry: false,
    showDeveloperTools: 'never',
    documentDownloadType: 'json',
  };
}
