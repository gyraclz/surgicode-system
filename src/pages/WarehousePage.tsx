import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import './WarehousePage.css';

// ── Types ────────────────────────────────────────────────────────────────────
interface Location {
  location_id: number;
  warehouse_name: string;
  address: string | null;
  floor: string | null;
  shelf: string | null;
  tray: string | null;
  status: string;
  date_created: string;
}

// Grouped structure: one warehouse name → all its location rows
interface WarehouseGroup {
  warehouse_name: string;
  address: string | null;
  status: string;
  rows: Location[];
  earliest: string;
}

type AddStep = 'choose' | 'warehouse' | 'floor' | 'shelf' | 'tray';

const PAGE_SIZE = 10;
type SortKey = 'warehouse_name' | 'date_created';
type SortDir = 'asc' | 'desc';

// ── Component ────────────────────────────────────────────────────────────────
function WarehousePage() {
  const { user } = useAuth();

  const [locations, setLocations]   = useState<Location[]>([]);
  const [groups, setGroups]         = useState<WarehouseGroup[]>([]);
  const [filtered, setFiltered]     = useState<WarehouseGroup[]>([]);
  const [paginated, setPaginated]   = useState<WarehouseGroup[]>([]);
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);

  // Sort / filter panel
  const [showFilter, setShowFilter]   = useState(false);
  const [sortKey, setSortKey]         = useState<SortKey>('date_created');
  const [sortDir, setSortDir]         = useState<SortDir>('desc');
  const [hideInactive, setHideInactive] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // View modal
  const [viewGroup, setViewGroup]     = useState<WarehouseGroup | null>(null);

  // Add / Edit modal
  const [showFormModal, setShowFormModal] = useState(false);
  const [addStep, setAddStep]             = useState<AddStep>('choose');
  const [editItem, setEditItem]           = useState<Location | null>(null); // null = add mode

  // Form fields
  const [fWarehouse, setFWarehouse]   = useState('');
  const [fAddress, setFAddress]        = useState('');
  const [fFloor, setFFloor]           = useState('');
  const [fShelf, setFShelf]           = useState('');
  const [fTray, setFTray]             = useState('');
  const [fStatus, setFStatus]         = useState('Active');
  const [formError, setFormError]     = useState('');
  const [saving, setSaving]           = useState(false);

  // Confirm status
  const [showConfirm, setShowConfirm]       = useState(false);
  const [confirmTarget, setConfirmTarget]   = useState<Location | null>(null);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // ── Safe unique helper (avoids new Set spread issues) ──────────────────
  const unique = (arr: string[]): string[] => {
    const seen: Record<string, boolean> = {};
    return arr.filter(v => { if (seen[v]) return false; seen[v] = true; return true; }).sort();
  };

  // ── Derived option lists (from existing data) ──────────────────────────
  const existingWarehouses = unique(
    locations.map(l => l.warehouse_name).filter((v): v is string => Boolean(v))
  );

  const floorsFor = (wh: string): string[] =>
    unique(
      locations
        .filter(l => l.warehouse_name === wh && Boolean(l.floor))
        .map(l => l.floor!)
    );

  const shelvesFor = (wh: string, fl: string): string[] =>
    unique(
      locations
        .filter(l => l.warehouse_name === wh && l.floor === fl && Boolean(l.shelf))
        .map(l => l.shelf!)
    );

  // ── Data fetching ───────────────────────────────────────────────────────
  useEffect(() => { fetchLocations(); }, []);

  const fetchLocations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('location')
      .select('*')
      .order('date_created', { ascending: false });
    if (!error && data) setLocations(data);
    setLoading(false);
  };

  // ── Grouping ────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = new Map<string, WarehouseGroup>();
    for (const loc of locations) {
      const key = loc.warehouse_name;
      if (!map.has(key)) {
        map.set(key, {
          warehouse_name: key,
          address: loc.address,
          status: loc.status,
          rows: [],
          earliest: loc.date_created,
        });
      }
      const g = map.get(key)!;
      g.rows.push(loc);
      // group is Active if any row is Active
      if (loc.status === 'Active') g.status = 'Active';
      if (loc.date_created < g.earliest) g.earliest = loc.date_created;
    }
    setGroups(Array.from(map.values()));
  }, [locations]);

  // ── Filter + Sort ───────────────────────────────────────────────────────
  useEffect(() => {
    let data = [...groups];
    if (hideInactive) data = data.filter(g => g.status === 'Active');
    if (search.trim()) {
      const s = search.toLowerCase();
      data = data.filter(g =>
        g.warehouse_name?.toLowerCase().includes(s) ||
        g.address?.toLowerCase().includes(s)
      );
    }
    data.sort((a, b) => {
      let va: any = sortKey === 'date_created' ? new Date(a.earliest).getTime() : a.warehouse_name.toLowerCase();
      let vb: any = sortKey === 'date_created' ? new Date(b.earliest).getTime() : b.warehouse_name.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    setFiltered(data);
    setPage(1);
  }, [groups, search, sortKey, sortDir, hideInactive]);

  useEffect(() => {
    const start = (page - 1) * PAGE_SIZE;
    setPaginated(filtered.slice(start, start + PAGE_SIZE));
  }, [filtered, page]);

  // Close filter on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node))
        setShowFilter(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Open Add (step chooser) ─────────────────────────────────────────────
  const openAdd = () => {
    setEditItem(null);
    setAddStep('choose');
    setFWarehouse(''); setFAddress(''); setFFloor('');
    setFShelf(''); setFTray(''); setFStatus('Active');
    setFormError('');
    setShowFormModal(true);
  };

  // ── Open Edit (a single location row from the view modal) ───────────────
  const openEdit = (item: Location) => {
    setEditItem(item);
    setFWarehouse(item.warehouse_name ?? '');
    setFAddress(item.address ?? '');
    setFFloor(item.floor ?? '');
    setFShelf(item.shelf ?? '');
    setFTray(item.tray ?? '');
    setFStatus(item.status ?? 'Active');
    setFormError('');
    // Determine which step this row represents
    if (item.tray)        setAddStep('tray');
    else if (item.shelf)  setAddStep('shelf');
    else if (item.floor)  setAddStep('floor');
    else                  setAddStep('warehouse');
    setShowFormModal(true);
  };

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setFormError('');
    if (!fWarehouse.trim()) { setFormError('Warehouse name is required.'); return; }
    if (addStep === 'floor'  && !fFloor.trim())  { setFormError('Floor is required.'); return; }
    if (addStep === 'shelf'  && !fShelf.trim())  { setFormError('Shelf is required.'); return; }
    if (addStep === 'tray'   && !fTray.trim())   { setFormError('Tray is required.'); return; }

    setSaving(true);
    const payload: any = {
      warehouse_name: fWarehouse.trim(),
      address:        fAddress.trim() || null,
      floor:          fFloor.trim()   || null,
      shelf:          fShelf.trim()   || null,
      tray:           fTray.trim()    || null,
      status:         fStatus,
    };

    if (editItem) {
      const { error } = await supabase
        .from('location')
        .update(payload)
        .eq('location_id', editItem.location_id);
      if (error) {
        console.error('Supabase update error:', error.message, error.details, error.hint);
        setFormError(`Failed to update: ${error.message}`);
        setSaving(false);
        return;
      }
      await supabase.from('audit_log').insert({
        user_id: user?.user_id, action: 'UPDATE', table_name: 'location',
        record_id: editItem.location_id,
        description: `Updated location: ${fWarehouse}`,
      });
    } else {
      const { data: ins, error } = await supabase
        .from('location')
        .insert(payload)
        .select()
        .single();
      if (error) {
        console.error('Supabase insert error:', error.message, error.details, error.hint);
        setFormError(`Failed to save: ${error.message}`);
        setSaving(false);
        return;
      }
      await supabase.from('audit_log').insert({
        user_id: user?.user_id, action: 'INSERT', table_name: 'location',
        record_id: ins?.location_id,
        description: `Added ${addStep}: ${fWarehouse}${fFloor ? ' / ' + fFloor : ''}${fShelf ? ' / ' + fShelf : ''}${fTray ? ' / ' + fTray : ''}`,
      });
    }

    setSaving(false);
    setShowFormModal(false);
    setViewGroup(null);
    fetchLocations();
  };

  // ── Status toggle ───────────────────────────────────────────────────────
  const confirmStatusChange = async () => {
    if (!confirmTarget) return;
    const newStatus = confirmTarget.status === 'Active' ? 'Inactive' : 'Active';
    await supabase.from('location').update({ status: newStatus }).eq('location_id', confirmTarget.location_id);
    await supabase.from('audit_log').insert({
      user_id: user?.user_id, action: 'UPDATE', table_name: 'location',
      record_id: confirmTarget.location_id,
      description: `Set location #${confirmTarget.location_id} status to ${newStatus}`,
    });
    setShowConfirm(false);
    setConfirmTarget(null);
    fetchLocations();
  };

  // ── Formatters ──────────────────────────────────────────────────────────
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const formatDateTime = (d: string) =>
    new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const isFilterActive = sortKey !== 'date_created' || sortDir !== 'desc' || hideInactive;

  // ── Sort option button ──────────────────────────────────────────────────
  const SortOption = ({ label, sk, sd }: { label: string; sk: SortKey; sd: SortDir }) => (
    <button
      className={`filter-option${sortKey === sk && sortDir === sd ? ' selected' : ''}`}
      onClick={() => { setSortKey(sk); setSortDir(sd); }}
    >
      {sortKey === sk && sortDir === sd && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      )}
      {label}
    </button>
  );

  // ── Add modal form content per step ────────────────────────────────────
  const renderFormBody = () => {
    if (addStep === 'choose') {
      return (
        <div className="step-choose-grid">
          {[
            { step: 'warehouse' as AddStep, icon: '🏢', label: 'Warehouse', desc: 'Add a new warehouse' },
            { step: 'floor'     as AddStep, icon: '📐', label: 'Floor',     desc: 'Add a floor to an existing warehouse' },
            { step: 'shelf'     as AddStep, icon: '📦', label: 'Shelf',     desc: 'Add a shelf to an existing floor' },
            { step: 'tray'      as AddStep, icon: '🗂️', label: 'Tray',      desc: 'Add a tray to an existing shelf' },
          ].map(({ step, icon, label, desc }) => (
            <button key={step} className="step-choose-card" onClick={() => setAddStep(step)}>
              <span className="step-choose-icon">{icon}</span>
              <span className="step-choose-label">{label}</span>
              <span className="step-choose-desc">{desc}</span>
            </button>
          ))}
        </div>
      );
    }

    return (
      <div className="form-fields">
        {/* Step badge */}
        <div className="step-badge">
          Adding: <strong>{addStep.charAt(0).toUpperCase() + addStep.slice(1)}</strong>
          {!editItem && (
            <button className="step-back-link" onClick={() => setAddStep('choose')}>← Change</button>
          )}
        </div>

        {/* Warehouse Name */}
        <div className="form-group">
          <label>Warehouse Name <span className="required">*</span></label>
          {addStep === 'warehouse' ? (
            <input value={fWarehouse} onChange={e => setFWarehouse(e.target.value)}
              placeholder="e.g. Main Warehouse" />
          ) : (
            <select value={fWarehouse} onChange={e => { setFWarehouse(e.target.value); setFFloor(''); setFShelf(''); setFTray(''); }}>
              <option value="">— Select warehouse —</option>
              {existingWarehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          )}
        </div>

        {addStep === 'warehouse' && (
          <div className="form-group">
            <label>Address</label>
            <input value={fAddress} onChange={e => setFAddress(e.target.value)}
              placeholder="e.g. Quezon City" />
          </div>
        )}

        {/* Floor */}
        {(addStep === 'floor' || addStep === 'shelf' || addStep === 'tray') && (
          <div className="form-group">
            <label>Floor {addStep === 'floor' && <span className="required">*</span>}</label>
            {addStep === 'floor' ? (
              <input value={fFloor} onChange={e => setFFloor(e.target.value)}
                placeholder="e.g. Ground, 1st, 2nd" />
            ) : (
              <select value={fFloor} onChange={e => { setFFloor(e.target.value); setFShelf(''); setFTray(''); }}
                disabled={!fWarehouse}>
                <option value="">— Select floor —</option>
                {floorsFor(fWarehouse).map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            )}
          </div>
        )}

        {/* Shelf */}
        {(addStep === 'shelf' || addStep === 'tray') && (
          <div className="form-group">
            <label>Shelf {addStep === 'shelf' && <span className="required">*</span>}</label>
            {addStep === 'shelf' ? (
              <input value={fShelf} onChange={e => setFShelf(e.target.value)}
                placeholder="e.g. A, B, C" />
            ) : (
              <select value={fShelf} onChange={e => { setFShelf(e.target.value); setFTray(''); }}
                disabled={!fFloor}>
                <option value="">— Select shelf —</option>
                {shelvesFor(fWarehouse, fFloor).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>
        )}

        {/* Tray */}
        {addStep === 'tray' && (
          <div className="form-group">
            <label>Tray <span className="required">*</span></label>
            <input value={fTray} onChange={e => setFTray(e.target.value)}
              placeholder="e.g. T1, T2" />
          </div>
        )}

        {/* Status */}
        <div className="form-group">
          <label>Status</label>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="wh-page">

      {/* Header */}
      <div className="wh-header">
        <div>
          <h1 className="wh-title">Warehouse</h1>
          <p className="wh-subtitle">Manage warehouse locations, floors, shelves and trays</p>
        </div>
        <button className="wh-add-btn" onClick={openAdd}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Location
        </button>
      </div>

      {/* Toolbar */}
      <div className="wh-toolbar">
        <div className="wh-search-wrap">
          <svg className="wh-search-icon" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input className="wh-search" placeholder="Search warehouse or location..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="filter-wrap" ref={filterRef}>
          <button className={`filter-btn${isFilterActive ? ' filter-active' : ''}`}
            onClick={() => setShowFilter(v => !v)}>
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
              <SortOption label="A → Z" sk="warehouse_name" sd="asc" />
              <SortOption label="Z → A" sk="warehouse_name" sd="desc" />
              <div className="filter-divider" />
              <div className="filter-section-label">Sort by Date</div>
              <SortOption label="Newest First" sk="date_created" sd="desc" />
              <SortOption label="Oldest First" sk="date_created" sd="asc" />
              <div className="filter-divider" />
              <div className="filter-section-label">Status</div>
              <button className={`filter-option${hideInactive ? ' selected' : ''}`}
                onClick={() => setHideInactive(v => !v)}>
                {hideInactive && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
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

        <div className="wh-count-chip">
          <span>{filtered.length}</span> warehouse{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Table */}
      <div className="wh-table-wrap">
        {loading ? (
          <div className="wh-loading"><span className="wh-spinner" /><p>Loading...</p></div>
        ) : filtered.length === 0 ? (
          <div className="wh-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <p>No warehouses found</p>
          </div>
        ) : (
          <>
            <table className="wh-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Warehouse Name</th>
                  <th>Location</th>
                  <th>Floors</th>
                  <th>Status</th>
                  <th>Date Added</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((group, idx) => {
                  const floors = unique(group.rows.map(r => r.floor).filter((v): v is string => Boolean(v)));
                  const locationText = group.rows.find(r => r.address)?.address ?? null;

                  return (
                    <tr key={group.warehouse_name}>
                      <td className="td-id">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="td-name">
                        <div className="wh-name-cell">
                          <div className="wh-avatar">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                              strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                              <polyline points="9 22 9 12 15 12 15 22"/>
                            </svg>
                          </div>
                          <div className="wh-name-info">
                            <span className="wh-name-primary">{group.warehouse_name}</span>
                            <span className="wh-name-secondary">{group.rows.length} location row{group.rows.length !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      </td>
                      <td className="td-location">{locationText ?? '—'}</td>
                      <td>
                        <div className="floor-pills">
                          {floors.length > 0
                            ? floors.map(f => <span key={f} className="floor-pill">{f}</span>)
                            : <span className="td-muted">—</span>
                          }
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${group.status === 'Active' ? 'status-active' : 'status-inactive'}`}>
                          {group.status}
                        </span>
                      </td>
                      <td className="td-date">{formatDate(group.earliest)}</td>
                      <td>
                        <div className="action-btns">
                          <button className="tbl-btn view" title="View Details"
                            onClick={() => setViewGroup(group)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                              strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                          </button>
                          <button className="tbl-btn edit" title="Edit (opens detail view)"
                            onClick={() => setViewGroup(group)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                              strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <span className="pagination-info">
                  Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <div className="pagination-btns">
                  <button className="page-btn" onClick={() => setPage(1)} disabled={page === 1}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>
                    </svg>
                  </button>
                  <button className="page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                        ? <span key={`e-${i}`} className="page-ellipsis">…</span>
                        : <button key={p} className={`page-btn${page === p ? ' active' : ''}`}
                            onClick={() => setPage(p as number)}>{p}</button>
                    )}
                  <button className="page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                  <button className="page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── VIEW MODAL ─────────────────────────────────────────────────────── */}
      {viewGroup && (
        <div className="modal-overlay" onClick={() => setViewGroup(null)}>
          <div className="modal-card view-modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Warehouse Details</h2>
              <button className="modal-close" onClick={() => setViewGroup(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="modal-body">
              {/* Hero */}
              <div className="view-hero">
                <div className="view-hero-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                </div>
                <div className="view-hero-info">
                  <h3 className="view-hero-name">{viewGroup.warehouse_name}</h3>
                  <div className="view-hero-meta">
                    <span className="view-hero-loc">
                      {viewGroup.rows.find(r => r.address)?.address ?? 'No address set'}
                    </span>
                    <span className={`status-badge ${viewGroup.status === 'Active' ? 'status-active' : 'status-inactive'}`}>
                      {viewGroup.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Grouped floor → shelf → tray tree */}
              <div className="view-section-label">Structure</div>
              <div className="view-tree">
                {/* Warehouse root rows (no floor) */}
                {viewGroup.rows.filter(r => !r.floor).map(row => (
                  <div className="view-row-item" key={row.location_id}>
                    <div className="view-row-path">🏢 Warehouse root</div>
                    <div className="view-row-meta">
                      <span className={`status-badge sm ${row.status === 'Active' ? 'status-active' : 'status-inactive'}`}>{row.status}</span>
                      <span className="view-row-date">{formatDate(row.date_created)}</span>
                    </div>
                    <div className="view-row-actions">
                      <button className="tbl-btn edit" title="Edit" onClick={() => openEdit(row)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button className={`tbl-btn ${row.status === 'Active' ? 'deactivate' : 'activate'}`}
                        title={row.status === 'Active' ? 'Deactivate' : 'Activate'}
                        onClick={() => { setConfirmTarget(row); setShowConfirm(true); }}>
                        {row.status === 'Active'
                          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
                      </button>
                    </div>
                  </div>
                ))}

                {/* Group by floor */}
                {unique(viewGroup.rows.filter(r => r.floor).map(r => r.floor!)).map(floor => {
                  const floorRows = viewGroup.rows.filter(r => r.floor === floor);
                  const floorRootRow = floorRows.find(r => !r.shelf); // row representing the floor itself

                  return (
                    <div className="view-floor-group" key={floor}>
                      {/* Floor header */}
                      <div className="view-floor-header">
                        <span className="view-floor-label">📐 Floor: {floor}</span>
                        {floorRootRow && (
                          <div className="view-row-actions">
                            <button className="tbl-btn edit" title="Edit floor" onClick={() => openEdit(floorRootRow)}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                            <button className={`tbl-btn ${floorRootRow.status === 'Active' ? 'deactivate' : 'activate'}`}
                              onClick={() => { setConfirmTarget(floorRootRow); setShowConfirm(true); }}>
                              {floorRootRow.status === 'Active'
                                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Group by shelf within this floor */}
                      {unique(floorRows.filter(r => r.shelf).map(r => r.shelf!)).map(shelf => {
                        const shelfRows = floorRows.filter(r => r.shelf === shelf);
                        const shelfRootRow = shelfRows.find(r => !r.tray);

                        return (
                          <div className="view-shelf-group" key={shelf}>
                            {/* Shelf header */}
                            <div className="view-shelf-header">
                              <span className="view-shelf-label">📦 Shelf: {shelf}</span>
                              {shelfRootRow && (
                                <div className="view-row-actions">
                                  <button className="tbl-btn edit" title="Edit shelf" onClick={() => openEdit(shelfRootRow)}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                    </svg>
                                  </button>
                                  <button className={`tbl-btn ${shelfRootRow.status === 'Active' ? 'deactivate' : 'activate'}`}
                                    onClick={() => { setConfirmTarget(shelfRootRow); setShowConfirm(true); }}>
                                    {shelfRootRow.status === 'Active'
                                      ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                                      : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Trays within this shelf */}
                            {shelfRows.filter(r => r.tray).map(row => (
                              <div className="view-row-item tray-row" key={row.location_id}>
                                <div className="view-row-path">🗂️ Tray: {row.tray}</div>
                                <div className="view-row-meta">
                                  <span className={`status-badge sm ${row.status === 'Active' ? 'status-active' : 'status-inactive'}`}>{row.status}</span>
                                  <span className="view-row-date">{formatDate(row.date_created)}</span>
                                </div>
                                <div className="view-row-actions">
                                  <button className="tbl-btn edit" title="Edit tray" onClick={() => openEdit(row)}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                    </svg>
                                  </button>
                                  <button className={`tbl-btn ${row.status === 'Active' ? 'deactivate' : 'activate'}`}
                                    onClick={() => { setConfirmTarget(row); setShowConfirm(true); }}>
                                    {row.status === 'Active'
                                      ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                                      : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="modal-footer">
              <button className="modal-cancel" onClick={() => setViewGroup(null)}>Close</button>
              <button className="modal-save" onClick={() => { setViewGroup(null); openAdd(); }}>
                + Add to this Warehouse
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD / EDIT MODAL ────────────────────────────────────────────────── */}
      {showFormModal && (
        <div className="modal-overlay" onClick={() => setShowFormModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editItem ? 'Edit Location' : addStep === 'choose' ? 'What would you like to add?' : `Add ${addStep.charAt(0).toUpperCase() + addStep.slice(1)}`}</h2>
              <button className="modal-close" onClick={() => setShowFormModal(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {formError && <div className="modal-error">{formError}</div>}

            <div className="modal-body">
              {renderFormBody()}
            </div>

            {addStep !== 'choose' && (
              <div className="modal-footer">
                <button className="modal-cancel" onClick={() => setShowFormModal(false)}>Cancel</button>
                <button className="modal-save" onClick={handleSave} disabled={saving}>
                  {saving ? <span className="wh-spinner small" /> : editItem ? 'Save Changes' : 'Add'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CONFIRM STATUS MODAL ────────────────────────────────────────────── */}
      {showConfirm && confirmTarget && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal-card confirm-card" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon-wrap">
              <div className={`confirm-icon ${confirmTarget.status === 'Active' ? 'confirm-icon-warn' : 'confirm-icon-ok'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
            </div>
            <h3 className="confirm-title">Change Status</h3>
            <p className="confirm-text">
              Set location <strong>#{confirmTarget.location_id}</strong> ({[confirmTarget.floor, confirmTarget.shelf, confirmTarget.tray].filter(Boolean).join(' / ') || 'root'}) to{' '}
              <strong>{confirmTarget.status === 'Active' ? 'Inactive' : 'Active'}</strong>?
            </p>
            <div className="confirm-actions">
              <button className="modal-cancel" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button
                className={`modal-save${confirmTarget.status === 'Active' ? ' btn-danger' : ''}`}
                onClick={confirmStatusChange}
              >
                {confirmTarget.status === 'Active' ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WarehousePage;