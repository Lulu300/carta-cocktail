import { describe, it, expect } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import { z } from 'zod';
import { errorHandler } from '../middleware/errorHandler';
import { IdParams } from './common';
import { valid, validate } from './validate';

const schemas = {
  params: IdParams,
  query: z.object({ page: z.coerce.number().int().optional() }),
  body: z.object({ name: z.string() }),
};

// A mini app that echoes what the handler receives after validation
function buildApp() {
  const app = express();
  app.use(express.json());
  app.post('/items/:id', validate(schemas), (req, res) => {
    res.json({ valid: valid<typeof schemas>(res), body: req.body });
  });
  app.use(errorHandler);
  return supertest(app);
}

describe('validate', () => {
  it('stores the parsed params, query and body in res.locals.valid', async () => {
    const res = await buildApp().post('/items/12?page=2').send({ name: 'Rum' });

    expect(res.status).toBe(200);
    expect(res.body.valid).toEqual({ params: { id: 12 }, query: { page: 2 }, body: { name: 'Rum' } });
  });

  it('removes unknown keys from the body', async () => {
    const res = await buildApp().post('/items/12').send({ name: 'Rum', id: 999, createdAt: 'x' });

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({ name: 'Rum' });
    expect(res.body.valid.body).toEqual({ name: 'Rum' });
  });

  it('answers 400 with the path of an invalid param', async () => {
    const res = await buildApp().post('/items/abc').send({ name: 'Rum' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
    expect(res.body.details).toHaveLength(1);
    expect(res.body.details[0]).toMatchObject({ path: 'params.id', code: 'invalid_type' });
    expect(typeof res.body.details[0].message).toBe('string');
  });

  it('reports the issues of every part at once', async () => {
    const res = await buildApp().post('/items/0?page=x').send({ name: 42 });

    expect(res.status).toBe(400);
    expect(res.body.details.map((d: { path: string }) => d.path)).toEqual(['params.id', 'query.page', 'body.name']);
  });
});
