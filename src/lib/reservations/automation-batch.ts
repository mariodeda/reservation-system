export const AUTOMATED_EMAIL_CONCURRENCY = 3;

export async function settleLimited<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const safeLimit = Math.max(1, Math.trunc(limit));
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;

  async function run() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(safeLimit, items.length) }, run));
  return results;
}
