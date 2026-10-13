import { describe, expect, it } from 'vitest';
import { categories, units } from '../../services/api';
import { buildUnit } from '../factories';
import { captureRequest, mockApiError, mockApiPending, mockApiResponse, mockNetworkError } from './utils';

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
});
