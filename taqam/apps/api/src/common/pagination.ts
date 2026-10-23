export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function pageParams(q: { page?: unknown; pageSize?: unknown }) {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(q.pageSize) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
