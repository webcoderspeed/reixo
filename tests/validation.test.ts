import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HTTPClient } from '../src/core/http-client';
import { ValidationError } from '../src/utils/http';
import { objectToFormData } from '../src/utils/form-data';

describe('Runtime Validation', () => {
  let client: HTTPClient;

  beforeEach(() => {
    client = new HTTPClient({ baseURL: 'https://api.example.com' });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should validate response data using a function validator', async () => {
    const mockData = { id: 1, name: 'Test' };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockData,
    } as Response);

    const validator = (data: unknown) => {
      if (typeof data === 'object' && data !== null && 'id' in data) {
        return data as { id: number; name: string };
      }
      throw new Error('Invalid data');
    };

    const response = await client.request('https://api.example.com/users/1', {
      validationSchema: validator,
    });

    expect(response.data).toEqual(mockData);
  });

  it('should validate response data using a Zod-like schema', async () => {
    const mockData = { id: 1, name: 'Test' };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockData,
    } as Response);

    const schema = {
      parse: (data: unknown) => {
        if (typeof data === 'object' && data !== null && 'id' in data) {
          return data;
        }
        throw new Error('Zod Error');
      },
    };

    const response = await client.request('https://api.example.com/users/1', {
      validationSchema: schema,
    });

    expect(response.data).toEqual(mockData);
  });

  it('should throw ValidationError when validation fails', async () => {
    const mockData = { error: 'invalid' };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockData,
    } as Response);

    const validator = () => {
      throw new Error('Custom Validation Error');
    };

    await expect(
      client.request('https://api.example.com/users/1', {
        validationSchema: validator,
      })
    ).rejects.toThrow(ValidationError);
  });
});

describe('Smart FormData Utility', () => {
  it('should convert flat object to FormData', () => {
    const obj = { name: 'John', age: 30 };
    const formData = objectToFormData(obj);
    expect(formData.get('name')).toBe('John');
    expect(formData.get('age')).toBe('30');
  });

  it('should convert nested object to FormData', () => {
    const obj = { user: { name: 'John', details: { age: 30 } } };
    const formData = objectToFormData(obj);
    expect(formData.get('user[name]')).toBe('John');
    expect(formData.get('user[details][age]')).toBe('30');
  });

  it('should handle arrays of primitives', () => {
    const obj = { tags: ['a', 'b'] };
    const formData = objectToFormData(obj);
    // FormData.getAll returns array of strings/files
    const values = formData.getAll('tags');
    expect(values).toEqual(['a', 'b']);
  });

  it('should handle array of objects', () => {
    const obj = { users: [{ name: 'A' }, { name: 'B' }] };
    const formData = objectToFormData(obj);
    expect(formData.get('users[0][name]')).toBe('A');
    expect(formData.get('users[1][name]')).toBe('B');
  });

  it('should ignore null and undefined', () => {
    const obj = { name: 'John', age: undefined, role: null };
    const formData = objectToFormData(obj);
    expect(formData.has('name')).toBe(true);
    expect(formData.has('age')).toBe(false);
    expect(formData.has('role')).toBe(false);
  });
});

describe('HTTPClient FormData Integration', () => {
  let client: HTTPClient;

  beforeEach(() => {
    client = new HTTPClient({ baseURL: 'https://api.example.com' });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should automatically convert object to FormData when useFormData is true', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => ({}),
      text: async () => '{}',
    } as Response);

    const data = { name: 'John' };
    await client.post('/users', data, { useFormData: true });

    const call = vi.mocked(fetch).mock.calls[0];
    const options = call[1] as RequestInit;

    expect(options.body).toBeInstanceOf(FormData);
    const formData = options.body as FormData;
    expect(formData.get('name')).toBe('John');

    // Headers should NOT have Content-Type (let browser set it)
    const headers = options.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('should respect explicit FormData input without useFormData flag', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => ({}),
      text: async () => '{}',
    } as Response);

    const formData = new FormData();
    formData.append('key', 'value');

    await client.post('/upload', formData);

    const call = vi.mocked(fetch).mock.calls[0];
    const options = call[1] as RequestInit;

    expect(options.body).toBe(formData);
    const headers = options.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('should use JSON by default', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => ({}),
      text: async () => '{}',
    } as Response);

    const data = { name: 'John' };
    await client.post('/users', data);

    const call = vi.mocked(fetch).mock.calls[0];
    const options = call[1] as RequestInit;

    expect(typeof options.body).toBe('string');
    expect(options.body).toBe(JSON.stringify(data));
    const headers = options.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });
});
