import { afterEach, describe, expect, it, vi } from 'vitest';
import { backup, categories, units } from '../../services/api';
import { buildUnit } from '../factories';
import {
  captureRequest,
  errorResponse,
  holdApiResponse,
  mockApiError,
  mockApiPending,
  mockApiResponse,
  mockNetworkError,
  pendingResponse,
  readJsonObject,
  rejectNextFetch,
} from './utils';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fake backend', () => {
  it('answers the requests of services/api.ts with the default data', async () => {
    const list = await units.list();

    expect(list.map((unit) => unit.abbreviation)).toEqual(['cl', 'ml']);
  });

  it('answers a creation with the body it received and a new id', async () => {
    const created = await categories.create({ name: 'Mezcal', type: 'SPIRIT' });

    expect(created).toEqual({ id: 1001, name: 'Mezcal', type: 'SPIRIT' });
  });

  it('serves the response a test sets, then the default one again in the next test', async () => {
    mockApiResponse('get', '/api/units', [buildUnit({ name: 'Once' })]);

    expect((await units.list())[0].name).toBe('Once');
  });

  it('turns an error response into an ApiError carrying the server message', async () => {
    mockApiError('delete', '/api/units/:id', 409, 'Unit in use');

    await expect(units.delete(1)).rejects.toMatchObject({ status: 409, message: 'Unit in use' });
  });

  it('rejects like a dropped connection', async () => {
    mockNetworkError('get', '/api/units');

    await expect(units.list()).rejects.toThrow(TypeError);
  });

  it('keeps a request pending', async () => {
    mockApiPending('get', '/api/units');
    const outcome = await Promise.race([units.list(), new Promise((resolve) => setTimeout(() => resolve('pending'), 20))]);

    expect(outcome).toBe('pending');
  });

  it('captures the body and URL of a request and still answers it', async () => {
    const request = captureRequest('put', '/api/units/:id');

    const updated = await units.update(4, { abbreviation: 'oz' });

    expect(await request.body).toEqual({ abbreviation: 'oz' });
    expect((await request.url).pathname).toBe('/api/units/4');
    expect(request.count()).toBe(1);
    expect(updated).toEqual({ id: 4, abbreviation: 'oz' });
  });

  it('holds a response until the test releases it', async () => {
    const release = holdApiResponse('get', '/api/units', [buildUnit({ name: 'Held' })]);
    let settled = false;
    const list = units.list().then((result) => {
      settled = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);

    release();

    expect((await list)[0].name).toBe('Held');
  });

  it('makes the next fetch reject with any value, then lets the next ones through', async () => {
    rejectNextFetch('not an Error');

    await expect(units.list()).rejects.toBe('not an Error');
    expect(await units.list()).toHaveLength(2);
  });

  it('gives the raw multipart text of a file upload', async () => {
    mockApiResponse('post', '/api/backup/import', { message: 'ok', skippedFiles: 0, restartRecommended: false });
    const request = captureRequest('post', '/api/backup/import');

    await backup.importBackup(new File(['zip'], 'backup.zip', { type: 'application/zip' }));

    const body = await request.body;
    expect(body).toContain('name="backup"');
    expect(body).toContain('Content-Type: application/zip');
  });
});

describe('fake answer building blocks', () => {
  it('reads a JSON object body, and anything else as an empty object', async () => {
    const post = (body: string) => new Request('http://localhost/api', { method: 'POST', body });

    expect(await readJsonObject(post('{"name":"Gin"}'))).toEqual({ name: 'Gin' });
    expect(await readJsonObject(post('[1, 2]'))).toEqual({});
    expect(await readJsonObject(post('null'))).toEqual({});
  });

  it('builds the error body of the real API', async () => {
    const response = errorResponse(409, 'Unit in use');

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Unit in use' });
  });

  it('builds an answer that never comes', async () => {
    const outcome = await Promise.race([pendingResponse(), new Promise((resolve) => setTimeout(() => resolve('pending'), 20))]);

    expect(outcome).toBe('pending');
  });
});
