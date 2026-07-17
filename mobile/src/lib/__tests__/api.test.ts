import { getGraph, getPackageInfo } from '@/lib/api';
import { API_BASE } from '@/lib/config';
import type { DependencyGraph, PackageInfo } from '@/lib/types';

function mockJsonResponse<T>(body: T, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('getGraph', () => {
  const sample: DependencyGraph = {
    root: 'left-pad@1.3.0',
    nodeCount: 1,
    edgeCount: 0,
    nodes: [
      {
        key: 'left-pad@1.3.0',
        name: 'left-pad',
        version: '1.3.0',
        level: 0,
        deprecated: false,
      },
    ],
    edges: [],
  };

  it('requests the /graph endpoint with an encoded package query', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(sample));
    await getGraph('@scope/pkg');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/graph?package=${encodeURIComponent('@scope/pkg')}`);
    expect(url).toContain('%40scope%2Fpkg');
  });

  it('sends the ngrok-skip-browser-warning and json accept headers', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(sample));
    await getGraph('left-pad');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toMatchObject({
      'ngrok-skip-browser-warning': 'true',
      accept: 'application/json',
    });
  });

  it('parses and returns the JSON payload', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(sample));
    await expect(getGraph('left-pad')).resolves.toEqual(sample);
  });

  it('throws with status and statusText on a non-ok response', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(null, false, 404));
    await expect(getGraph('nope')).rejects.toThrow('404');
  });
});

describe('getPackageInfo', () => {
  const info: PackageInfo = {
    name: 'left-pad',
    version: '1.3.0',
    keywords: [],
    deprecated: false,
    maintainers: [],
    dist: {},
    downloadsLastMonth: null,
    score: null,
  };

  it('requests the /package-info endpoint and parses the response', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(info));
    const result = await getPackageInfo('left-pad');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/package-info?package=left-pad`);
    expect(result).toEqual(info);
  });
});
