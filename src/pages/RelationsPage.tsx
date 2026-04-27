import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import './RelationsPage.css';

interface Relation {
  relation_id: number;
  name: string;
  company_name: string;
  contact_number: string;
  email: string;
  relation_type: string;
  status: string;
  date_created: string;
}

const EMPTY_FORM = {
  name: '',
  company_name: '',
  contact_number: '',
  email: '',
  relation_type: 'Customer',
  status: 'Active',
};

const PAGE_SIZE = 10;

type SortKey = 'name' | 'relation_id' | 'date_created';
type SortDir = 'asc' | 'desc';

function RelationsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'Customer' | 'Supplier'>('Customer');
  const [relations, setRelations] = useState<Relation[]>([]);
  const [filtered, setFiltered] = useState<Relation[]>([]);
  const [paginated, setPaginated] = useState<Relation[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Relation | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Filter/sort state
  const [showFilter, setShowFilter] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('date_created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [hideInactive, setHideInactive] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => { fetchRelations(); }, []);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilter(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    applyFilters();
    setPage(1);
  }, [relations, activeTab, search, sortKey, sortDir, hideInactive]);

  useEffect(() => {
    const start = (page - 1) * PAGE_SIZE;
    setPaginated(filtered.slice(start, start + PAGE_SIZE));
  }, [filtered, page]);

  const fetchRelations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('relations')
      .select('*');
    if (!error && data) setRelations(data);
    setLoading(false);
  };

  const applyFilters = () => {
    let data = relations.filter(r =>
      r.relation_type === activeTab || r.relation_type === 'Both'
    );

    if (hideInactive) {
      data = data.filter(r => r.status === 'Active');
    }

    if (search.trim()) {
      const s = search.toLowerCase();
      data = data.filter(r =>
        r.name?.toLowerCase().includes(s) ||
        r.company_name?.toLowerCase().includes(s) ||
        r.email?.toLowerCase().includes(s) ||
        r.contact_number?.toLowerCase().includes(s)
      );
    }

    data = [...data].sort((a, b) => {
      let valA: any = a[sortKey];
      let valB: any = b[sortKey];

      if (sortKey === 'relation_id') {
        valA = Number(valA);
        valB = Number(valB);
      } else if (sortKey === 'date_created') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else {
        valA = (valA ?? '').toLowerCase();
        valB = (valB ?? '').toLowerCase();
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    setFiltered(data);
  };

  const openAdd = () => {
    setEditItem(null);
    setForm({ ...EMPTY_FORM, relation_type: activeTab });
    setError('');
    setShowModal(true);
  };

  const openEdit = (item: Relation) => {
    setEditItem(item);
    setForm({
      name: item.name ?? '',
      company_name: item.company_name ?? '',
      contact_number: item.contact_number ?? '',
      email: item.email ?? '',
      relation_type: item.relation_type ?? activeTab,
      status: item.status ?? 'Active',
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');

    if (editItem) {
      const { error: err } = await supabase
        .from('relations').update(form).eq('relation_id', editItem.relation_id);
      if (err) { setError('Failed to update.'); setSaving(false); return; }
      await supabase.from('audit_log').insert({
        user_id: user?.user_id, action: 'UPDATE', table_name: 'relations',
        record_id: editItem.relation_id,
        description: `Updated ${form.relation_type}: ${form.name}`,
      });
    } else {
      const { data: inserted, error: err } = await supabase
        .from('relations').insert(form).select().single();
      if (err) { setError('Failed to save.'); setSaving(false); return; }
      await supabase.from('audit_log').insert({
        user_id: user?.user_id, action: 'INSERT', table_name: 'relations',
        record_id: inserted?.relation_id,
        description: `Added ${form.relation_type}: ${form.name}`,
      });
    }

    setSaving(false);
    setShowModal(false);
    fetchRelations();
  };

  const handleToggleStatus = async (item: Relation) => {
    const newStatus = item.status === 'Active' ? 'Inactive' : 'Active';
    await supabase.from('relations').update({ status: newStatus }).eq('relation_id', item.relation_id);
    await supabase.from('audit_log').insert({
      user_id: user?.user_id, action: 'UPDATE', table_name: 'relations',
      record_id: item.relation_id,
      description: `Set ${item.name} status to ${newStatus}`,
    });
    fetchRelations();
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const isFilterActive = sortKey !== 'date_created' || sortDir !== 'desc' || hideInactive;

  const SortOption = ({ label, sk, sd }: { label: string; sk: SortKey; sd: SortDir }) => (
    <button
      className={`filter-option ${sortKey === sk && sortDir === sd ? 'selected' : ''}`}
      onClick={() => { setSortKey(sk); setSortDir(sd); }}
    >
      {sortKey === sk && sortDir === sd && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
      {label}
    </button>
  );

  return (
    <div className="rel-page">

      {/* Header */}
      <div className="rel-header">
        <div>
          <h1 className="rel-title">Relations</h1>
          <p className="rel-subtitle">Manage customers and suppliers</p>
        </div>
        <button className="rel-add-btn" onClick={openAdd}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add {activeTab}
        </button>
      </div>

      {/* Tabs */}
      <div className="rel-tabs">
        {(['Customer', 'Supplier'] as const).map(tab => (
          <button key={tab}
            className={`rel-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab); setSearch(''); }}>
            {tab === 'Customer' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              </svg>
            )}
            {tab}
            <span className="rel-tab-count">
              {relations.filter(r => r.relation_type === tab || r.relation_type === 'Both').length}
            </span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="rel-toolbar">
        <div className="rel-search-wrap">
          <svg className="rel-search-icon" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input className="rel-search"
            placeholder={`Search ${activeTab.toLowerCase()}s...`}
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Filter Button */}
        <div className="filter-wrap" ref={filterRef}>
          <button
            className={`filter-btn ${isFilterActive ? 'filter-active' : ''}`}
            onClick={() => setShowFilter(v => !v)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            Filter
            {isFilterActive && <span className="filter-dot" />}
          </button>

          {showFilter && (
            <div className="filter-dropdown">
              <div className="filter-section-label">Sort by Name</div>
              <SortOption label="A → Z" sk="name" sd="asc" />
              <SortOption label="Z → A" sk="name" sd="desc" />

              <div className="filter-divider" />
              <div className="filter-section-label">Sort by ID</div>
              <SortOption label="ID: Low → High" sk="relation_id" sd="asc" />
              <SortOption label="ID: High → Low" sk="relation_id" sd="desc" />

              <div className="filter-divider" />
              <div className="filter-section-label">Sort by Date</div>
              <SortOption label="Newest First" sk="date_created" sd="desc" />
              <SortOption label="Oldest First" sk="date_created" sd="asc" />

              <div className="filter-divider" />
              <div className="filter-section-label">Status</div>
              <button
                className={`filter-option ${hideInactive ? 'selected' : ''}`}
                onClick={() => setHideInactive(v => !v)}
              >
                {hideInactive && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
                Hide Inactive
              </button>

              <div className="filter-divider" />
              <button className="filter-reset"
                onClick={() => { setSortKey('date_created'); setSortDir('desc'); setHideInactive(false); }}>
                Reset Filters
              </button>
            </div>
          )}
        </div>

        <div className="rel-count-chip">
          <span>{filtered.length}</span> record{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Table */}
      <div className="rel-table-wrap">
        {loading ? (
          <div className="rel-loading">
            <span className="rel-spinner" /><p>Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rel-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
            </svg>
            <p>No {activeTab.toLowerCase()}s found</p>
          </div>
        ) : (
          <>
            <table className="rel-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Email</th>
                  <th>Contact</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Date Added</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((item) => (
                  <tr key={item.relation_id}>
                    <td className="td-id">{item.relation_id}</td>
                    <td className="td-name">
                      <div className="name-cell">
                        <div className="name-avatar">
                          {item.name?.charAt(0)?.toUpperCase() ?? '?'}
                        </div>
                        <span>{item.name}</span>
                      </div>
                    </td>
                    <td>{item.company_name ?? '—'}</td>
                    <td className="td-email">{item.email ?? '—'}</td>
                    <td>{item.contact_number ?? '—'}</td>
                    <td>
                      <span className={`type-badge ${item.relation_type === 'Customer' ? 'type-customer' : item.relation_type === 'Supplier' ? 'type-supplier' : 'type-both'}`}>
                        {item.relation_type}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${item.status === 'Active' ? 'status-active' : 'status-inactive'}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="td-date">{item.date_created ? formatDate(item.date_created) : '—'}</td>
                    <td>
                      <div className="action-btns">
                        <button className="tbl-btn edit" onClick={() => openEdit(item)} title="Edit">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button
                          className={`tbl-btn ${item.status === 'Active' ? 'deactivate' : 'activate'}`}
                          onClick={() => handleToggleStatus(item)}
                          title={item.status === 'Active' ? 'Deactivate' : 'Activate'}
                        >
                          {item.status === 'Active' ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                              strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/>
                              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                              strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                              <polyline points="22 4 12 14.01 9 11.01"/>
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="pagination">
              <span className="pagination-info">
                Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="pagination-btns">
                <button className="page-btn" onClick={() => setPage(1)} disabled={page === 1}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>
                  </svg>
                </button>
                <button className="page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === '...'
                      ? <span key={`ellipsis-${i}`} className="page-ellipsis">…</span>
                      : <button key={p} className={`page-btn ${page === p ? 'active' : ''}`}
                          onClick={() => setPage(p as number)}>{p}</button>
                  )}

                <button className="page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
                <button className="page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editItem ? 'Edit Relation' : `Add ${activeTab}`}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {error && <div className="modal-error">{error}</div>}

            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Name <span className="required">*</span></label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
                </div>
                <div className="form-group">
                  <label>Company Name</label>
                  <input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} placeholder="Company name" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
                </div>
                <div className="form-group">
                  <label>Contact Number</label>
                  <input value={form.contact_number} onChange={e => setForm({ ...form, contact_number: e.target.value })} placeholder="09XXXXXXXXX" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Type</label>
                  <select value={form.relation_type} onChange={e => setForm({ ...form, relation_type: e.target.value })}>
                    <option value="Customer">Customer</option>
                    <option value="Supplier">Supplier</option>
                    <option value="Both">Both</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="modal-cancel" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="modal-save" onClick={handleSave} disabled={saving}>
                {saving ? <span className="rel-spinner small" /> : editItem ? 'Save Changes' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RelationsPage;