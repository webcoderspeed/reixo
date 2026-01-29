import { describe, it, expect } from 'vitest';
import { Pipeline, AsyncPipeline } from '../src/utils/pipeline';

describe('Pipeline', () => {
  it('should transform data sequentially', () => {
    const pipeline = Pipeline.from<number>()
      .map((x) => x * 2)
      .map((x) => x + 1)
      .map((x) => x.toString());

    const result = pipeline.execute(5);
    expect(result).toBe('11'); // (5 * 2) + 1 = 11 -> "11"
  });

  it('should support tap for side effects', () => {
    let sideEffect = 0;
    const pipeline = Pipeline.from<number>()
      .tap((x) => {
        sideEffect = x;
      })
      .map((x) => x * 2);

    const result = pipeline.execute(10);
    expect(result).toBe(20);
    expect(sideEffect).toBe(10);
  });

  it('should handle async transformations', async () => {
    const pipeline = AsyncPipeline.from<number>()
      .map(async (x) => {
        await new Promise((r) => setTimeout(r, 10));
        return x * 2;
      })
      .map((x) => x + 1);

    const result = await pipeline.execute(5);
    expect(result).toBe(11);
  });

  it('should maintain type safety', () => {
    interface User {
      id: number;
      name: string;
    }

    const rawData = { id: 1, name: 'Alice', extra: 'ignored' };

    const pipeline = Pipeline.from<typeof rawData>()
      .map((data) => ({ id: data.id, name: data.name })) // Pick fields
      .map((user) => ({ ...user, active: true })); // Add field

    const result = pipeline.execute(rawData);

    expect(result).toEqual({ id: 1, name: 'Alice', active: true });
    // TypeScript would fail here if we tried to access result.extra
  });
});
