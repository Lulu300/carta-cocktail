// Prisma CLI config of the image, which has no TypeScript loader and no src/:
// loads the config bundled at build time (see the build stage of the Dockerfile).
// The CLI wants the config object itself, not the module that holds it.
module.exports = require('./dist/lib/prisma.config.js').default;
