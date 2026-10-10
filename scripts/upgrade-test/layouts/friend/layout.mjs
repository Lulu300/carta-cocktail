// Self-hosted setup with bind mounts, photos mounted on /uploads and secrets in an env_file.
export default {
  name: 'friend',
  description: 'bind mounts ./data:/app/data and ./uploads:/uploads, env_file with the secrets, external network',
  composeFile: 'docker-compose.yml',
  envFile: 'carta-cocktail.env',
  // Compose file generations available in this folder (compose-<generation>.yml).
  initialGeneration: '1.4.0',
  // The real env_file holds exactly these two variables; the bench uses random values of the
  // same lengths. A 6-character ADMIN_PASSWORD is below the v1.5.0 minimum for a new admin.
  envSecrets: { JWT_SECRET: 46, ADMIN_PASSWORD: 6 },
  // Where the database and the photos live on the host side.
  database: { kind: 'bind', hostDir: 'data' },
  photos: { kind: 'bind', hostDir: 'uploads', containerPath: '/uploads' },
  externalNetwork: 'swag',
};
