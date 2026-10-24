'use client';
import Link from 'next/link';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import { Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { Async, Avatar, SearchInput } from '@/components/app/primitives';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import type { OrgNode } from '@/lib/types';

interface TreeNode extends OrgNode { children: TreeNode[]; size: number }

function buildTree(nodes: OrgNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  nodes.forEach((n) => map.set(n.id, { ...n, children: [], size: 0 }));
  const roots: TreeNode[] = [];
  map.forEach((n) => {
    const parent = n.managerId ? map.get(n.managerId) : undefined;
    if (parent && parent.id !== n.id) parent.children.push(n); else roots.push(n);
  });
  const sizeOf = (n: TreeNode): number => (n.size = n.children.reduce((a, c) => a + 1 + sizeOf(c), 0));
  roots.forEach(sizeOf);
  const sort = (arr: TreeNode[]) => { arr.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name)); arr.forEach((c) => sort(c.children)); };
  sort(roots);
  return roots;
}

export default function OrgChartPage() {
  const { t } = useLang();
  const { data, loading, error, reload } = useFetch(() => api.get<OrgNode[]>('/org-chart'), []);
  const [q, setQ] = useState('');
  const [zoom, setZoom] = useState(1);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const roots = useMemo(() => buildTree(data ?? []), [data]);
  const toggle = (id: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const match = q.trim().toLowerCase();
  const scroller = useRef<HTMLDivElement>(null);
  // Center the (usually very wide) tree horizontally once it renders.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [roots.length, zoom]);

  return (
    <>
      <PageHeader title={t('الهيكل التنظيمي', 'Org chart')} subtitle={t('علاقات الإدارة المباشرة في المنشأة', 'Reporting lines across the company')}
        actions={<>
          <SearchInput value={q} onChange={setQ} placeholder={t('تمييز موظف…', 'Highlight employee…')} className="w-56" />
          <div className="flex items-center rounded-xl border border-line bg-white">
            <button className="p-2.5 text-ink-muted hover:text-primary" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))} aria-label="zoom out"><Minus className="h-4 w-4" /></button>
            <span className="num w-12 text-center text-xs">{Math.round(zoom * 100)}%</span>
            <button className="p-2.5 text-ink-muted hover:text-primary" onClick={() => setZoom((z) => Math.min(1.4, z + 0.1))} aria-label="zoom in"><Plus className="h-4 w-4" /></button>
          </div>
          <Button variant="secondary" onClick={() => setCollapsed(new Set())}>{t('توسيع الكل', 'Expand all')}</Button>
        </>} />
      <Card className="overflow-hidden">
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          {!roots.length ? <EmptyState /> : (
            <div ref={scroller} dir="ltr" className="overflow-auto bg-[radial-gradient(#DCE4E0_1px,transparent_1px)] p-6 [background-size:18px_18px]" style={{ minHeight: 420 }}>
              <div className="org-tree mx-auto flex w-max min-w-full justify-center" style={{ zoom }}>
                <ul className="flex gap-6">
                  {roots.map((r) => <Node key={r.id} node={r} collapsed={collapsed} toggle={toggle} match={match} />)}
                </ul>
              </div>
            </div>
          )}
        </Async>
      </Card>
      <style>{`
        .org-tree ul ul { display:flex; justify-content:center; padding-top:20px; position:relative; }
        .org-tree ul ul::before { content:''; position:absolute; top:0; left:50%; height:20px; border-left:2px solid #E9E1D2; }
        .org-tree li { list-style:none; position:relative; padding:20px 6px 0; display:flex; flex-direction:column; align-items:center; }
        .org-tree > ul > li { padding-top:0; }
        .org-tree li::before, .org-tree li::after { content:''; position:absolute; top:0; height:20px; width:50%; border-top:2px solid #E9E1D2; }
        .org-tree li::before { right:50%; } .org-tree li::after { left:50%; border-left:2px solid #E9E1D2; }
        .org-tree li:only-child::before, .org-tree li:only-child::after { display:none; }
        .org-tree li:only-child { padding-top:0; }
        .org-tree li:first-child::before, .org-tree li:last-child::after { border:0 none; }
        .org-tree li:last-child::before { border-right:2px solid #E9E1D2; border-radius:0 8px 0 0; }
        .org-tree li:first-child::after { border-radius:8px 0 0 0; }
        .org-tree > ul > li::before, .org-tree > ul > li::after { display:none; }
      `}</style>
    </>
  );
}

function Node({ node, collapsed, toggle, match }: { node: TreeNode; collapsed: Set<string>; toggle: (id: string) => void; match: string }) {
  const { t } = useLang();
  const isCollapsed = collapsed.has(node.id);
  const hit = match && node.name.toLowerCase().includes(match);
  return (
    <li>
      <div className={clsx('relative w-48 rounded-2xl border bg-white p-3 text-center shadow-soft transition-shadow hover:shadow-lift',
        hit ? 'border-accent ring-2 ring-accent/50' : 'border-line')}>
        <Link href={`/app/employees/${node.id}`} className="flex flex-col items-center gap-1.5">
          <Avatar name={node.name} />
          <span className="line-clamp-1 text-sm font-semibold text-ink">{node.name}</span>
          <span className="line-clamp-1 text-xs text-ink-muted">{node.jobTitle}</span>
          {node.branchName && <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] text-primary-500">{node.branchName}</span>}
        </Link>
        {node.children.length > 0 && (
          <button onClick={() => toggle(node.id)} title={isCollapsed ? t('توسيع', 'Expand') : t('طي', 'Collapse')}
            className="absolute -bottom-3 left-1/2 z-10 flex h-6 -translate-x-1/2 items-center gap-0.5 rounded-full border border-line bg-white px-2 text-[11px] font-medium text-ink-muted shadow-soft hover:text-primary">
            <span className="num">{node.size}</span><ChevronDown className={clsx('h-3 w-3 transition-transform', isCollapsed && '-rotate-90')} />
          </button>
        )}
      </div>
      {node.children.length > 0 && !isCollapsed && (
        <ul>{node.children.map((c) => <Node key={c.id} node={c} collapsed={collapsed} toggle={toggle} match={match} />)}</ul>
      )}
    </li>
  );
}
