import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import './UserPage.css';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Role {
  role_id: number;
  role_name: string;
}

interface Location {
  location_id: number;
  warehouse_name: string;
  floor: string | null;
  shelf: string | null;
  tray: string | null;
  status: string;
}

interface User {
  user_id: number;
  full_name: string;
  username: string;
  password_hash: string;
  role_id: number;
  status: string;
  date_created: string;
  email: string | null;
  phone_number: string | null;
  assigned_type: string | null;       // 'S1' | 'Bidding' | null
  assigned_location_id: number | null;
  role: Role | null;
  assigned_location: Location | null;
}

interface UserFormData {
  full_name: string;
  username: string;
  password_hash: string;
  email: string;
  phone_number: string;
  role_id: string;
  status: string;
  assigned_type: string;
  assigned_location_id: string;
}

type SortKey = 'full_name' | 'user_id' | 'date_created';
type SortDir = 'asc' | 'desc';

const EMPTY_FORM: UserFormData = {
  full_name: '',
  username: '',
  password_hash: '',
  email: '',
  phone_number: '',
  role_id: '',
  status: 'Active',
  assigned_type: '',
  assigned_location_id: '',
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Roles that require a warehouse assignment
const WAREHOUSE_ROLE_NAMES = ['Warehouse'];

// ── Component ─────────────────────────────────────────────────────────────────
export default function UserPage() {
  const [users, setUsers]               = useState<User[]>([]);
  const [filtered, setFiltered]         = useState<User[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [hideInactive, setHideInactive] = useState(false);
  const [roles, setRoles]               = useState<Role[]>([]);
  const [locations, setLocations]       = useState<Location[]>([]);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('date_created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // Add / Edit Modal
  const [formMode, setFormMode]         = useState<'add' | 'edit' | null>(null);
  const [formData, setFormData]         = useState<UserFormData>(EMPTY_FORM);
  const [editingId, setEditingId]       = useState<number | null>(null);
  const [formLoading, setFormLoading]   = useState(false);
  const [formError, setFormError]       = useState<string | null>(null);
  const [showFormPass, setShowFormPass] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize]       = useState(10);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { setCurrentPage(1); }, [search, pageSize, sortKey, sortDir, hideInactive]);
  useEffect(() => { fetchUsers(); fetchRoles(); fetchLocations(); }, []);
  useEffect(() => { applyFilters(); }, [users, search, sortKey, sortDir, hideInactive]); // eslint-disable-line

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Derived: selected role name in form ──────────────────────────────────
  const selectedRoleName = roles.find(r => r.role_id === Number(formData.role_id))?.role_name ?? '';
  const needsWarehouse   = WAREHOUSE_ROLE_NAMES.includes(selectedRoleName);

  // Unique warehouse names for dropdown
  const warehouseOptions: { location_id: number; label: string }[] = [];
  const seen: Record<string, boolean> = {};
  for (const loc of locations) {
    if (!seen[loc.warehouse_name]) {
      seen[loc.warehouse_name] = true;
      warehouseOptions.push({ location_id: loc.location_id, label: loc.warehouse_name });
    }
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        role:role_id ( role_id, role_name ),
        assigned_location:assigned_location_id ( location_id, warehouse_name, floor, shelf, tray, status )
      `)
      .order('date_created', { ascending: false });
    if (!error && data) setUsers(data as unknown as User[]);
    setLoading(false);
  };

  const fetchRoles = async () => {
    const { data } = await supabase.from('role').select('role_id, role_name').order('role_name');
    if (data) setRoles(data as Role[]);
  };

  const fetchLocations = async () => {
    const { data } = await supabase
      .from('location')
      .select('location_id, warehouse_name, floor, shelf, tray, status')
      .eq('status', 'Active')
      .order('warehouse_name');
    if (data) setLocations(data as Location[]);
  };

  const applyFilters = () => {
    let result = [...users];
    if (hideInactive) result = result.filter(u => u.status === 'Active');
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(u =>
        u.full_name?.toLowerCase().includes(s) ||
        u.username?.toLowerCase().includes(s) ||
        u.email?.toLowerCase().includes(s) ||
        u.phone_number?.toLowerCase().includes(s) ||
        u.role?.role_name?.toLowerCase().includes(s) ||
        u.assigned_location?.warehouse_name?.toLowerCase().includes(s)
      );
    }
    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'full_name') cmp = (a.full_name ?? '').localeCompare(b.full_name ?? '');
      else if (sortKey === 'user_id') cmp = a.user_id - b.user_id;
      else cmp = new Date(a.date_created).getTime() - new Date(b.date_created).getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });
    setFiltered(result);
  };

  // ── Toggle status ─────────────────────────────────────────────────────────
  const toggleStatus = async (user: User) => {
    const newStatus = user.status === 'Active' ? 'Inactive' : 'Active';
    await supabase.from('users').update({ status: newStatus }).eq('user_id', user.user_id);
    setUsers(prev => prev.map(u => u.user_id === user.user_id ? { ...u, status: newStatus } : u));
  };

  // ── Form handlers ─────────────────────────────────────────────────────────
  const openAddForm = () => {
    setFormData(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
    setShowFormPass(false);
    setFormMode('add');
  };

  const openEditForm = (u: User) => {
    setFormData({
      full_name:            u.full_name ?? '',
      username:             u.username ?? '',
      password_hash:        '',
      email:                u.email ?? '',
      phone_number:         u.phone_number ?? '',
      role_id:              u.role_id?.toString() ?? '',
      status:               u.status ?? 'Active',
      assigned_type:        u.assigned_type ?? '',
      assigned_location_id: u.assigned_location_id?.toString() ?? '',
    });
    setEditingId(u.user_id);
    setFormError(null);
    setShowFormPass(false);
    setFormMode('edit');
  };

  const closeForm = () => { setFormMode(null); setFormError(null); };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      // If role changed away from Warehouse, clear warehouse assignment
      if (name === 'role_id') {
        const roleName = roles.find(r => r.role_id === Number(value))?.role_name ?? '';
        if (!WAREHOUSE_ROLE_NAMES.includes(roleName)) {
          next.assigned_location_id = '';
        }
      }
      return next;
    });
  };

  const handleFormSubmit = async () => {
    setFormError(null);
    if (!formData.full_name.trim())  { setFormError('Full name is required.'); return; }
    if (!formData.username.trim())   { setFormError('Username is required.'); return; }
    if (formMode === 'add' && !formData.password_hash.trim()) { setFormError('Password is required.'); return; }
    if (!formData.role_id)           { setFormError('Role is required.'); return; }
    if (needsWarehouse && !formData.assigned_location_id) {
      setFormError('Please assign a warehouse for this Warehouse user.'); return;
    }

    setFormLoading(true);
    const payload: any = {
      full_name:            formData.full_name.trim(),
      username:             formData.username.trim(),
      email:                formData.email.trim() || null,
      phone_number:         formData.phone_number.trim() || null,
      role_id:              Number(formData.role_id),
      status:               formData.status,
      assigned_type:        formData.assigned_type || null,
      assigned_location_id: formData.assigned_location_id ? Number(formData.assigned_location_id) : null,
    };
    if (formData.password_hash.trim()) payload.password_hash = formData.password_hash.trim();

    const { error } = formMode === 'add'
      ? await supabase.from('users').insert([payload])
      : await supabase.from('users').update(payload).eq('user_id', editingId);

    setFormLoading(false);
    if (error) {
      setFormError(error.code === '23505' ? 'Username already exists.' : error.message);
      return;
    }
    closeForm();
    fetchUsers();
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const formatDate = (d: string) =>
    new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const getPageNumbers = (): (number | '...')[] => {
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
    else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const totalUsers    = filtered.length;
  const activeCount   = filtered.filter(u => u.status === 'Active').length;
  const inactiveCount = filtered.filter(u => u.status === 'Inactive').length;
  const startItem     = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem       = Math.min(currentPage * pageSize, filtered.length);

  const SORT_LABELS: Record<string, string> = {
    'full_name-asc':     'Name A → Z',
    'full_name-desc':    'Name Z → A',
    'user_id-asc':       'ID Ascending',
    'user_id-desc':      'ID Descending',
    'date_created-desc': 'Date Newest',
    'date_created-asc':  'Date Oldest',
  };
  const applySort = (key: SortKey, dir: SortDir) => { setSortKey(key); setSortDir(dir); setSortOpen(false); };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="product-page">

      {/* ── ADD / EDIT MODAL ──────────────────────────────────────────── */}
      {formMode && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-left">
                <span className="modal-tag">{formMode === 'add' ? 'New User' : 'Edit User'}</span>
                <h2 className="modal-title">{formMode === 'add' ? 'Add User' : formData.full_name || 'Edit User'}</h2>
              </div>
              <button className="modal-close" onClick={closeForm}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="form-body">
              {formError && (
                <div className="form-error">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {formError}
                </div>
              )}

              {/* Row 1: Full Name + Username */}
              <div className="form-row">
                <div className="form-field">
                  <label className="form-label">Full Name <span className="form-required">*</span></label>
                  <input className="form-input" name="full_name" value={formData.full_name}
                    onChange={handleFormChange} placeholder="e.g. Juan dela Cruz" autoFocus />
                </div>
                <div className="form-field">
                  <label className="form-label">Username <span className="form-required">*</span></label>
                  <input className="form-input" name="username" value={formData.username}
                    onChange={handleFormChange} placeholder="e.g. juan123" />
                </div>
              </div>

              {/* Row 2: Password + Email */}
              <div className="form-row">
                <div className="form-field">
                  <label className="form-label">
                    Password{' '}
                    {formMode === 'edit'
                      ? <span className="form-hint">(leave blank to keep)</span>
                      : <span className="form-required">*</span>}
                  </label>
                  <div className="input-icon-wrap">
                    <input className="form-input" name="password_hash"
                      type={showFormPass ? 'text' : 'password'}
                      value={formData.password_hash}
                      onChange={handleFormChange} placeholder="••••••••" />
                    <button type="button" className="input-icon-btn" onClick={() => setShowFormPass(p => !p)}>
                      {showFormPass
                        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      }
                    </button>
                  </div>
                </div>
                <div className="form-field">
                  <label className="form-label">Email</label>
                  <input className="form-input" name="email" type="email" value={formData.email}
                    onChange={handleFormChange} placeholder="e.g. juan@email.com" />
                </div>
              </div>

              {/* Row 3: Phone + Role */}
              <div className="form-row">
                <div className="form-field">
                  <label className="form-label">Phone Number</label>
                  <input className="form-input" name="phone_number" value={formData.phone_number}
                    onChange={handleFormChange} placeholder="e.g. 09XX-XXX-XXXX" />
                </div>
                <div className="form-field">
                  <label className="form-label">Role <span className="form-required">*</span></label>
                  <select className="form-select" name="role_id" value={formData.role_id} onChange={handleFormChange}>
                    <option value="">— Select Role —</option>
                    {roles.map(r => (
                      <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 4: Assigned Type + Assigned Warehouse (conditional) */}
              <div className="form-row">
                <div className="form-field">
                  <label className="form-label">Assigned Type</label>
                  <select className="form-select" name="assigned_type" value={formData.assigned_type} onChange={handleFormChange}>
                    <option value="">— None (All Types) —</option>
                    <option value="S1">S1</option>
                    <option value="Bidding">Bidding</option>
                  </select>
                </div>

                {/* Only show warehouse select if role is Warehouse */}
                {needsWarehouse ? (
                  <div className="form-field">
                    <label className="form-label">
                      Assigned Warehouse <span className="form-required">*</span>
                    </label>
                    <select className="form-select" name="assigned_location_id"
                      value={formData.assigned_location_id} onChange={handleFormChange}>
                      <option value="">— Select Warehouse —</option>
                      {warehouseOptions.map(w => (
                        <option key={w.location_id} value={w.location_id}>{w.label}</option>
                      ))}
                    </select>
                    <span className="form-hint-text">Required for Warehouse role</span>
                  </div>
                ) : (
                  <div className="form-field">
                    <label className="form-label">Status</label>
                    <select className="form-select" name="status" value={formData.status} onChange={handleFormChange}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Row 5: Status (only when warehouse row is showing) */}
              {needsWarehouse && (
                <div className="form-row">
                  <div className="form-field">
                    <label className="form-label">Status</label>
                    <select className="form-select" name="status" value={formData.status} onChange={handleFormChange}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="form-field" /> {/* spacer */}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="modal-btn-edit" onClick={handleFormSubmit} disabled={formLoading}>
                {formLoading ? (
                  <><span className="btn-spinner" />{formMode === 'add' ? 'Adding…' : 'Saving…'}</>
                ) : (
                  <>
                    {formMode === 'add'
                      ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    }
                    {formMode === 'add' ? 'Add User' : 'Save Changes'}
                  </>
                )}
              </button>
              <button className="modal-btn-close" onClick={closeForm} disabled={formLoading}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ────────────────────────────────────────────────────── */}
      <div className="product-header">
        <div className="product-header-left">
          <h1 className="product-title">Users</h1>
          <p className="product-subtitle">Manage system users and their roles</p>
        </div>
        <button className="product-refresh-btn" onClick={fetchUsers}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* ── FILTERS ───────────────────────────────────────────────────── */}
      <div className="product-filters">
        <div className="product-search-wrap">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input className="product-search" placeholder="Search by name, username, email, role, warehouse..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Sort dropdown */}
        <div className="sort-dropdown-wrap" ref={sortRef}>
          <button className={`product-action-btn sort-btn${sortOpen ? ' open' : ''}`} onClick={() => setSortOpen(v => !v)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/>
            </svg>
            {SORT_LABELS[`${sortKey}-${sortDir}`]}
            <svg className={`chevron${sortOpen ? ' flipped' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {sortOpen && (
            <div className="sort-dropdown">
              <div className="sort-group-label">Alphabetical</div>
              <button className={`sort-option${sortKey === 'full_name' && sortDir === 'asc' ? ' active' : ''}`} onClick={() => applySort('full_name', 'asc')}>↑ Name A → Z</button>
              <button className={`sort-option${sortKey === 'full_name' && sortDir === 'desc' ? ' active' : ''}`} onClick={() => applySort('full_name', 'desc')}>↓ Name Z → A</button>
              <div className="sort-group-label">By User ID</div>
              <button className={`sort-option${sortKey === 'user_id' && sortDir === 'asc' ? ' active' : ''}`} onClick={() => applySort('user_id', 'asc')}>↑ ID Ascending</button>
              <button className={`sort-option${sortKey === 'user_id' && sortDir === 'desc' ? ' active' : ''}`} onClick={() => applySort('user_id', 'desc')}>↓ ID Descending</button>
              <div className="sort-group-label">By Date Added</div>
              <button className={`sort-option${sortKey === 'date_created' && sortDir === 'desc' ? ' active' : ''}`} onClick={() => applySort('date_created', 'desc')}>↓ Newest First</button>
              <button className={`sort-option${sortKey === 'date_created' && sortDir === 'asc' ? ' active' : ''}`} onClick={() => applySort('date_created', 'asc')}>↑ Oldest First</button>
              <div className="sort-divider" />
              <label className="sort-toggle">
                <input type="checkbox" checked={hideInactive} onChange={e => { setHideInactive(e.target.checked); setSortOpen(false); }} />
                Hide Inactive users
              </label>
            </div>
          )}
        </div>

        <div className="product-filter-actions">
          <button className="product-action-btn primary" onClick={openAddForm}>+ Add User</button>
        </div>
      </div>

      {/* ── STATS ─────────────────────────────────────────────────────── */}
      <div className="product-stats">
        <div className="stat-chip"><span className="stat-num">{totalUsers}</span><span className="stat-label">Total</span></div>
        <div className="stat-chip"><span className="stat-num green">{activeCount}</span><span className="stat-label">Active</span></div>
        <div className="stat-chip"><span className="stat-num red">{inactiveCount}</span><span className="stat-label">Inactive</span></div>
      </div>

      {/* ── TABLE ─────────────────────────────────────────────────────── */}
      <div className="product-table-wrap">
        {loading ? (
          <div className="product-loading"><span className="product-spinner" /><p>Loading users...</p></div>
        ) : filtered.length === 0 ? (
          <div className="product-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <p>No users found</p>
          </div>
        ) : (
          <>
            <div className="product-table-scroll">
              <table className="product-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Full Name</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Assigned Type</th>
                    <th>Warehouse</th>
                    <th>Status</th>
                    <th>Date Added</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(u => (
                    <tr key={u.user_id}>
                      <td className="td-id">{u.user_id}</td>

                      {/* Full Name with avatar */}
                      <td className="td-name">
                        <div className="user-cell">
                          <div className="user-avatar">
                            {u.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                          </div>
                          <span>{u.full_name}</span>
                        </div>
                      </td>

                      <td className="td-mono">@{u.username}</td>
                      <td>{u.email ?? '—'}</td>
                      <td>{u.phone_number ?? '—'}</td>

                      <td>
                        <span className="badge badge-blue">{u.role?.role_name ?? '—'}</span>
                      </td>

                      <td>
                        {u.assigned_type
                          ? <span className="badge badge-amber">{u.assigned_type}</span>
                          : <span className="td-muted">All</span>}
                      </td>

                      <td>
                        {u.assigned_location
                          ? <span className="badge badge-gray">{u.assigned_location.warehouse_name}</span>
                          : <span className="td-muted">All</span>}
                      </td>

                      <td>
                        <span className={`badge ${u.status === 'Active' ? 'badge-green' : 'badge-red'}`}>
                          {u.status}
                        </span>
                      </td>

                      <td className="td-date">{u.date_created ? formatDate(u.date_created) : '—'}</td>

                      <td className="td-actions">
                        <button className="icon-btn edit" title="Edit user" onClick={() => openEditForm(u)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button
                          className={`icon-btn ${u.status === 'Active' ? 'deactivate' : 'activate'}`}
                          title={u.status === 'Active' ? 'Deactivate user' : 'Activate user'}
                          onClick={() => toggleStatus(u)}
                        >
                          {u.status === 'Active' ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/>
                              <line x1="12" y1="8" x2="12" y2="16"/>
                              <line x1="8" y1="12" x2="16" y2="12"/>
                            </svg>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="product-pagination">
              <span className="pagination-info">
                Showing <strong>{startItem}–{endItem}</strong> of <strong>{filtered.length}</strong> users
              </span>
              <div className="pagination-controls">
                <div className="pagination-pagesize">
                  <span>Rows per page:</span>
                  <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="pagesize-select">
                    {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="pagination-pages">
                  <button className="page-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  {getPageNumbers().map((p, i) =>
                    p === '...'
                      ? <span key={`e-${i}`} className="page-ellipsis">…</span>
                      : <button key={p} className={`page-btn${currentPage === p ? ' active' : ''}`} onClick={() => setCurrentPage(p as number)}>{p}</button>
                  )}
                  <button className="page-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
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