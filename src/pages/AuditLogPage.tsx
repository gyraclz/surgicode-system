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
    INSERT: 'badge-green',
    UPDATE: 'badge-blue',
    DELETE: 'badge-red',
    SELECT: 'badge-gray',
    };

    function AuditLogPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [filtered, setFiltered] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [actionFilter, setActionFilter] = useState('All');
    const [tableFilter, setTableFilter] = useState('All');
    const [tables, setTables] = useState<string[]>([]);

    useEffect(() => {
        fetchLogs();
    }, []);

    useEffect(() => {
        applyFilters();
    }, [logs, search, actionFilter, tableFilter]);

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
            new Set(data.map((d: any) => d.table_name).filter(Boolean))
          );
        setTables(uniqueTables);
        }
        setLoading(false);
    };

    const applyFilters = () => {
        let result = [...logs];

        if (search.trim()) {
        const s = search.toLowerCase();
        result = result.filter(l =>
            l.description?.toLowerCase().includes(s) ||
            l.table_name?.toLowerCase().includes(s) ||
            l.action?.toLowerCase().includes(s) ||
            (l.users?.username?.toLowerCase().includes(s)) ||
            (l.users?.full_name?.toLowerCase().includes(s))
        );
        }

        if (actionFilter !== 'All') {
        result = result.filter(l => l.action === actionFilter);
        }

        if (tableFilter !== 'All') {
        result = result.filter(l => l.table_name === tableFilter);
        }

        setFiltered(result);
    };

    const formatDate = (d: string) =>
        new Date(d).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        });

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
                onChange={e => setSearch(e.target.value)}
            />
            </div>

            <select className="audit-select" value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}>
            <option value="All">All Actions</option>
            <option value="INSERT">INSERT</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="SELECT">SELECT</option>
            </select>

            <select className="audit-select" value={tableFilter}
            onChange={e => setTableFilter(e.target.value)}>
            <option value="All">All Tables</option>
            {tables.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
        </div>

        {/* Stats */}
        <div className="audit-stats">
            <div className="stat-chip">
            <span className="stat-num">{filtered.length}</span>
            <span className="stat-label">Total</span>
            </div>
            {['INSERT','UPDATE','DELETE'].map(action => (
            <div className="stat-chip" key={action}>
                <span className="stat-num">
                {filtered.filter(l => l.action === action).length}
                </span>
                <span className="stat-label">{action}</span>
            </div>
            ))}
        </div>

        {/* Table */}
        <div className="audit-table-wrap">
            {loading ? (
            <div className="audit-loading">
                <span className="audit-spinner" />
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
                {filtered.map((log, i) => (
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
                        {log.action}
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
            )}
        </div>
        </div>
    );
    }

    export default AuditLogPage;