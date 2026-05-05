import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import './AuditLogPage.css';

interface AuditLog {
  log_id: number;
  action: string;
  table_name: string;
  record_id: number;
  description: string;
  date_created: string;
  users: { username: string; full_name: string } | null;
}

const ACTION_COLORS: Record<string, string> = {
  INSERT:    'badge-green',
  UPDATE:    'badge-blue',
  DELETE:    'badge-red',
  SELECT:    'badge-gray',
  LOGIN:     'badge-teal',
  LOGOUT:    'badge-orange',
  STOCK_IN:  'badge-emerald',
  STOCK_OUT: 'badge-rose',
  TRANSFER:  'badge-purple',
  RETURN:    'badge-amber',
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function AuditLogPage() {
  const [logs,         setLogs]         = useState<AuditLog[]>([]);
  const [filtered,     setFiltered]     = useState<AuditLog[]>([]);
  const [loading,      setLoading]      = useState(true);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search,       setSearch]       = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [tableFilter,  setTableFilter]  = useState('All');
  const [userFilter,   setUserFilter]   = useState('All');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');

  // ── Derived option lists ──────────────────────────────────────────────────
  const [tables, setTables] = useState<string[]>([]);
  const [users,  setUsers]  = useState<{ username: string; full_name: string }[]>([]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize,    setPageSize]    = useState(10);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const startItem  = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem    = Math.min(currentPage * pageSize, filtered.length);

  // Reset to page 1 whenever filters or page size change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, actionFilter, tableFilter, userFilter, dateFrom, dateTo, pageSize]);

  useEffect(() => { fetchLogs(); }, []);
  useEffect(() => { applyFilters(); }, [logs, search, actionFilter, tableFilter, userFilter, dateFrom, dateTo]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('audit_log')
      .select(`
        log_id, action, table_name, record_id, description, date_created,
        users(username, full_name)
      `)
      .order('date_created', { ascending: false });

    if (!error && data) {
      setLogs(data as any);

      const uniqueTables = Array.from(
        new Set((data as any[]).map((d) => d.table_name).filter(Boolean))
      ) as string[];
      setTables(uniqueTables);

      const uniqueUsers = Array.from(
        new Map(
          (data as any[])
            .filter((d) => d.users)
            .map((d) => [d.users.username, d.users])
        ).values()
      ) as { username: string; full_name: string }[];
      setUsers(uniqueUsers);
    }
    setLoading(false);
  };

  // ── Filter logic ──────────────────────────────────────────────────────────
  const applyFilters = () => {
    let result = [...logs];

    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.description?.toLowerCase().includes(s) ||
          l.table_name?.toLowerCase().includes(s) ||
          l.action?.toLowerCase().includes(s) ||
          l.users?.username?.toLowerCase().includes(s) ||
          l.users?.full_name?.toLowerCase().includes(s)
      );
    }
    if (actionFilter !== 'All') result = result.filter((l) => l.action === actionFilter);
    if (tableFilter  !== 'All') result = result.filter((l) => l.table_name === tableFilter);
    if (userFilter   !== 'All') result = result.filter((l) => l.users?.username === userFilter);

    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      result = result.filter((l) => new Date(l.date_created) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((l) => new Date(l.date_created) <= to);
    }

    setFiltered(result);
  };

  // ── Pagination helpers ────────────────────────────────────────────────────
  const getPageNumbers = (): (number | '...')[] => {
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      for (
        let i = Math.max(2, currentPage - 1);
        i <= Math.min(totalPages - 1, currentPage + 1);
        i++
      ) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  // ── Misc helpers ──────────────────────────────────────────────────────────
  const formatDate = (d: string) =>
    new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const clearFilters = () => {
    setSearch(''); setActionFilter('All'); setTableFilter('All');
    setUserFilter('All'); setDateFrom(''); setDateTo('');
  };

  const hasActiveFilters =
    search || actionFilter !== 'All' || tableFilter !== 'All' ||
    userFilter !== 'All' || dateFrom || dateTo;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="audit-page">

      {/* Header */}
      <div className="audit-header">
        <div className="audit-header-left">
          <h1 className="audit-title">Audit Log</h1>
          <p className="audit-subtitle">Track all system activity and changes</p>
        </div>
        <button className="audit-refresh-btn" onClick={fetchLogs}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="audit-filters">
        <div className="audit-search-wrap">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="audit-search"
            placeholder="Search by user, table, description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select className="audit-select" value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}>
          <option value="All">All Actions</option>
          <optgroup label="Auth">
            <option value="LOGIN">LOGIN</option>
            <option value="LOGOUT">LOGOUT</option>
          </optgroup>
          <optgroup label="CRUD">
            <option value="INSERT">INSERT</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="SELECT">SELECT</option>
          </optgroup>
          <optgroup label="Stock Movements">
            <option value="STOCK_IN">STOCK IN</option>
            <option value="STOCK_OUT">STOCK OUT</option>
            <option value="TRANSFER">TRANSFER</option>
            <option value="RETURN">RETURN</option>
          </optgroup>
        </select>

        <select className="audit-select" value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}>
          <option value="All">All Tables</option>
          {tables.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <select className="audit-select" value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}>
          <option value="All">All Users</option>
          {users.map((u) => (
            <option key={u.username} value={u.username}>
              {u.full_name} (@{u.username})
            </option>
          ))}
        </select>

        <div className="audit-date-wrap">
          <label className="audit-date-label">From</label>
          <input type="date" className="audit-date-input" value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)} />
        </div>

        <div className="audit-date-wrap">
          <label className="audit-date-label">To</label>
          <input type="date" className="audit-date-input" value={dateTo}
            onChange={(e) => setDateTo(e.target.value)} />
        </div>

        {hasActiveFilters && (
          <button className="audit-clear-btn" onClick={clearFilters}>Clear</button>
        )}
      </div>

      {/* Stats */}
      <div className="audit-stats">
        <div className="stat-chip">
          <span className="stat-num">{filtered.length}</span>
          <span className="stat-label">Total</span>
        </div>
        {['LOGIN', 'LOGOUT', 'INSERT', 'UPDATE', 'DELETE', 'STOCK_IN', 'STOCK_OUT', 'TRANSFER'].map((action) => (
          <div className="stat-chip" key={action}>
            <span className="stat-num">{filtered.filter((l) => l.action === action).length}</span>
            <span className="stat-label">{action.replace('_', ' ')}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="audit-table-wrap">
        {loading ? (
          <div className="audit-loading">
            <span className="audit-spinner"/>
            <p>Loading logs...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="audit-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            <p>No logs found</p>
          </div>
        ) : (
          <>
            {/* Scrollable table */}
            <div className="audit-table-scroll">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Table</th>
                    <th>Record ID</th>
                    <th>Description</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((log) => (
                    <tr key={log.log_id}>
                      <td className="td-id">{log.log_id}</td>
                      <td className="td-user">
                        <div className="user-cell">
                          <div className="user-cell-avatar">
                            {log.users?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                          </div>
                          <div className="user-cell-info">
                            <span className="user-cell-name">{log.users?.full_name ?? '—'}</span>
                            <span className="user-cell-username">@{log.users?.username ?? '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${ACTION_COLORS[log.action] ?? 'badge-gray'}`}>
                          {log.action.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="td-table">{log.table_name ?? '—'}</td>
                      <td className="td-record">{log.record_id ?? '—'}</td>
                      <td className="td-desc">{log.description ?? '—'}</td>
                      <td className="td-date">{log.date_created ? formatDate(log.date_created) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="audit-pagination">
              <span className="pagination-info">
                Showing <strong>{startItem}–{endItem}</strong> of <strong>{filtered.length}</strong> logs
              </span>
              <div className="pagination-controls">
                <div className="pagination-pagesize">
                  <span>Rows per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="pagesize-select"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="pagination-pages">
                  <button
                    className="page-btn"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                  </button>
                  {getPageNumbers().map((p, i) =>
                    p === '...'
                      ? <span key={`e-${i}`} className="page-ellipsis">…</span>
                      : <button
                          key={p}
                          className={`page-btn${currentPage === p ? ' active' : ''}`}
                          onClick={() => setCurrentPage(p as number)}
                        >{p}</button>
                  )}
                  <button
                    className="page-btn"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AuditLogPage;