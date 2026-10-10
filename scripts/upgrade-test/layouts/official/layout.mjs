// docker-compose.prod.yml as published, with named volumes and a .env file next to it,
// configured as the v1.4.0 README asked (JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD).
export default {
  name: 'official',
  description: 'docker-compose.prod.yml with the named volumes db-data and uploads, .env next to it',
  composeFile: 'docker-compose.prod.yml',
  envFile: '.env',
  initialGeneration: '1.4.0',
  envSecrets: { JWT_SECRET: 64, ADMIN_PASSWORD: 16 },
  database: { kind: 'volume', volume: 'db-data' },
  // v1.4.0 wrote the photos to /uploads, inside the container and outside the uploads volume
  // (fixed in v1.5.0): that is where the photos of a v1.4.0 instance are.
  photos: { kind: 'container', containerPath: '/uploads' },
  externalNetwork: null,
};
