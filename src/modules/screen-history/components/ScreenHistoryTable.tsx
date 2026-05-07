import { Link } from '@tanstack/react-router';
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers3,
  Search,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type {
  GeneratedScreenSummary,
  PromptSessionSummary,
  ScreenListQuery,
} from '../../../../shared/schemas/screen-history.schema';

type HistoryEntry = {
  id: string;
  sessionId?: string;
  type: 'session' | 'screen';
  title: string;
  intent: string | null;
  prompt: string | null;
  updatedAt: string;
  versionCount: number;
  activeVersion: number | null;
  activeScreenId: string | null;
};

type ScreenHistoryTableProps = {
  screens: GeneratedScreenSummary[];
  sessions: PromptSessionSummary[];
  total: number;
  query: ScreenListQuery;
  onQueryChange: (query: ScreenListQuery) => void;
  isDeleting?: boolean;
  onDelete?: (id: string) => void;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ScreenHistoryTable({
  screens,
  sessions,
  total,
  query,
  onQueryChange,
  isDeleting,
  onDelete,
}: ScreenHistoryTableProps) {
  const [searchValue, setSearchValue] = useState(query.search ?? '');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== query.search) {
        onQueryChange({ ...query, search: searchValue, page: 1 });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchValue, query, onQueryChange]);

  const data = useMemo<HistoryEntry[]>(() => {
    if (sessions.length > 0) {
      return sessions.map((s) => ({
        id: s.id,
        sessionId: s.id,
        type: 'session',
        title: s.page ?? s.title,
        intent: s.inferredIntent,
        prompt: s.prompt,
        updatedAt: s.updatedAt,
        versionCount: s.screenCount,
        activeVersion: s.activeVersion,
        activeScreenId: s.activeScreenJsonId,
      }));
    }
    return screens.map((s) => ({
      id: s.id,
      sessionId: s.sessionId,
      type: 'screen',
      title: s.page,
      intent: s.inferredIntent,
      prompt: s.prompt,
      updatedAt: s.updatedAt,
      versionCount: 1,
      activeVersion: s.version,
      activeScreenId: s.id,
    }));
  }, [screens, sessions]);

  const columns = useMemo<ColumnDef<HistoryEntry>[]>(
    () => [
      {
        accessorKey: 'title',
        header: () => {
          const isSorted = query.sortBy === 'title';
          return (
            <button
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              onClick={() =>
                onQueryChange({
                  ...query,
                  sortBy: 'title',
                  sortOrder: isSorted && query.sortOrder === 'asc' ? 'desc' : 'asc',
                })
              }
              type="button"
            >
              Title
              {isSorted ? (
                query.sortOrder === 'asc' ? (
                  <ArrowUp className="h-3 w-3 text-primary" />
                ) : (
                  <ArrowDown className="h-3 w-3 text-primary" />
                )
              ) : (
                <ArrowUpDown className="h-3 w-3 opacity-30" />
              )}
            </button>
          );
        },
        cell: ({ row }) => {
          const entry = row.original;
          const linkProps =
            entry.type === 'session'
              ? // biome-ignore lint/suspicious/noExplicitAny: route path type is generated dynamically.
                { to: '/prompt/session/$sessionId' as any, params: { sessionId: entry.id } }
              : // biome-ignore lint/suspicious/noExplicitAny: route path type is generated dynamically.
                { to: '/prompt/$screenId' as any, params: { screenId: entry.id } };

          return (
            <div className="flex flex-col gap-0.5">
              <Link
                // biome-ignore lint/suspicious/noExplicitAny: dynamic link props
                {...(linkProps as any)}
                className="font-semibold text-primary hover:text-primary/80 hover:underline decoration-primary/50 underline-offset-4 transition-colors"
              >
                {entry.title}
              </Link>
              <span className="text-muted-foreground text-[11px] line-clamp-1">
                {entry.intent || 'No intent description'}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'versionCount',
        header: () => {
          const isSorted = query.sortBy === 'screenCount';
          return (
            <button
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              onClick={() =>
                onQueryChange({
                  ...query,
                  sortBy: 'screenCount',
                  sortOrder: isSorted && query.sortOrder === 'asc' ? 'desc' : 'asc',
                })
              }
              type="button"
            >
              Checkpoints
              {isSorted ? (
                query.sortOrder === 'asc' ? (
                  <ArrowUp className="h-3 w-3 text-primary" />
                ) : (
                  <ArrowDown className="h-3 w-3 text-primary" />
                )
              ) : (
                <ArrowUpDown className="h-3 w-3 opacity-30" />
              )}
            </button>
          );
        },
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Layers3 className="h-3 w-3" />
            <span>{row.original.versionCount}</span>
            {row.original.activeVersion && (
              <span className="text-[10px] bg-secondary/50 text-secondary-foreground px-1.5 py-0.5 rounded">
                v{row.original.activeVersion}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: () => {
          const isSorted = query.sortBy === 'updatedAt';
          return (
            <button
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              onClick={() =>
                onQueryChange({
                  ...query,
                  sortBy: 'updatedAt',
                  sortOrder: isSorted && query.sortOrder === 'asc' ? 'desc' : 'asc',
                })
              }
              type="button"
            >
              Last Updated
              {isSorted ? (
                query.sortOrder === 'asc' ? (
                  <ArrowUp className="h-3 w-3 text-primary" />
                ) : (
                  <ArrowDown className="h-3 w-3 text-primary" />
                )
              ) : (
                <ArrowUpDown className="h-3 w-3 opacity-30" />
              )}
            </button>
          );
        },
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs whitespace-nowrap">
            <Clock className="h-3 w-3" />
            {formatDate(row.original.updatedAt)}
          </div>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const entry = row.original;
          const deleteId = entry.activeScreenId || entry.id;
          return (
            <div className="flex justify-end">
              <button
                aria-label="Delete entry"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                disabled={isDeleting}
                onClick={() => onDelete?.(deleteId)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        },
      },
    ],
    [query, onQueryChange, isDeleting, onDelete]
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  });

  const pageCount = Math.ceil(total / query.limit) || 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex flex-1 items-center group">
          <input
            className="h-9 w-full rounded-l-md border border-r-0 border-border bg-card px-3 text-xs outline-none ring-primary/20 transition-all focus:border-primary focus:ring-4 focus:z-10"
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search UI designs..."
            value={searchValue}
          />
          <button
            aria-label="Search"
            className="inline-flex h-9 w-9 items-center justify-center rounded-r-md border border-border bg-muted/50 text-muted-foreground group-focus-within:border-primary group-focus-within:bg-primary/5 transition-all"
            type="button"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>
        <Link
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm shadow-primary/10 whitespace-nowrap"
          to="/prompt"
        >
          <WandSparkles className="h-3.5 w-3.5" />
          New Prompt
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-muted/50 border-b border-border">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th className="px-4 py-2.5 font-medium text-muted-foreground" key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border">
              {data.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <tr className="group hover:bg-muted/30 transition-colors" key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td className="px-4 py-2.5" key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    className="px-4 py-12 text-center text-muted-foreground"
                    colSpan={columns.length}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Search className="h-8 w-8 opacity-20" />
                      <p>No results found for "{searchValue}"</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 bg-muted/20">
          <div className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">
            Page {query.page} of {pageCount}
            <span className="ml-2 opacity-50">({total} total items)</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-card hover:bg-muted disabled:opacity-50 disabled:hover:bg-card transition-colors shadow-sm"
              disabled={query.page <= 1}
              onClick={() => onQueryChange({ ...query, page: query.page - 1 })}
              type="button"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-card hover:bg-muted disabled:opacity-50 disabled:hover:bg-card transition-colors shadow-sm"
              disabled={query.page >= pageCount}
              onClick={() => onQueryChange({ ...query, page: query.page + 1 })}
              type="button"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
