import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import './MovementLogPage.css';

// ── Types ─────────────────────────────────────────────────────────────────────
interface MovementLog {
  item_id: number;
  movement: string;
  quantity: number;
  price: number;
  total: number;
  transaction_id: number;
  stock_id: number;
  stock: {
    product_type: string;
    product: { product_name: string; barcode: string } | null;
    location: { location_id: number; warehouse_name: string } | null;
  } | null;
  transactions: {
    type: string;
    reference_no: string;
    date_created: string;
    relations: { name: string } | null;
  } | null;
}

interface CurrentUser {
  user_id: number;
  full_name: string;
  username: string;
  role_id: number;
  assigned_type: string | null;
  assigned_location_id: number | null;
  role_name: string;
}

type SortField = 'item_id' | 'product_name' | 'date_created' | 'total' | 'quantity' | 'none';
type SortDir   = 'asc' | 'desc';

const MOVEMENT_COLORS: Record<string, string> = {
  IN:  'badge-green',
  OUT: 'badge-red',
};

const TYPE_COLORS: Record<string, string> = {
  PURCHASE: 'badge-blue',
  SALE:     'badge-amber',
  RETURN:   'badge-gray',
};

// ── Component ──────────────────────────────────────────────────────────────────
function MovementLogPage() {
  const { user: authUser } = useAuth();
  
  // ── Current User & Permissions ───────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [permissions, setPermissions] = useState({
    canViewAll: false,
    allowedTypes: [] as string[],
    allowedLocationId: null as number | null,
  });

  const [logs, setLogs]               = useState<MovementLog[]>([]);
  const [filtered, setFiltered]       = useState<MovementLog[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [movementFilter, setMovementFilter] = useState('All');
  const [typeFilter, setTypeFilter]   = useState('All');
  const [activeSection, setActiveSection] = useState('overall');

  // Sort / Filter panel
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [sortField, setSortField]   = useState<SortField>('none');
  const [sortDir, setSortDir]       = useState<SortDir>('asc');
  const [hideNoRelation, setHideNoRelation] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  // Export dropdown
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // ── Load User Permissions ─────────────────────────────────────────────────────
  const loadUserPermissions = async (savedUser: any) => {
    const { data, error } = await supabase
      .from('users')
      .select(`
        user_id, 
        full_name, 
        username, 
        role_id, 
        assigned_type, 
        assigned_location_id,
        role:role_id (role_name)
      `)
      .eq('user_id', savedUser.user_id)
      .single();

    if (error || !data) {
      console.error('Error loading user permissions:', error);
      return;
    }

    // Extract role name properly with type-safe approach
    let roleName = '';
    
    if (data.role) {
      if (Array.isArray(data.role) && data.role.length > 0) {
        const roleData = data.role[0] as any;
        roleName = roleData?.role_name || '';
      } else if (typeof data.role === 'object' && !Array.isArray(data.role)) {
        const roleData = data.role as any;
        roleName = roleData?.role_name || '';
      }
    }

    const user: CurrentUser = {
      user_id: data.user_id,
      full_name: data.full_name,
      username: data.username,
      role_id: data.role_id,
      assigned_type: data.assigned_type,
      assigned_location_id: data.assigned_location_id,
      role_name: roleName,
    };
    setCurrentUser(user);

    const assignedType = data.assigned_type;
    const assignedLocationId = data.assigned_location_id;

    // Set permissions based on role
    if (roleName === 'Admin') {
      // Admin can view everything
      setPermissions({ 
        canViewAll: true, 
        allowedTypes: ['S1', 'Bidding'], 
        allowedLocationId: null,
      });
    } 
    else if (roleName === 'Manager') {
      // Manager can access either S1 or Bidding (based on assigned_type)
      setPermissions({ 
        canViewAll: false, 
        allowedTypes: assignedType ? [assignedType] : ['S1', 'Bidding'], 
        allowedLocationId: null,
      });
    } 
    else if (roleName === 'Warehouse') {
      // Warehouse staff: assigned_type AND assigned_location_id
      setPermissions({ 
        canViewAll: false, 
        allowedTypes: assignedType ? [assignedType] : ['S1', 'Bidding'], 
        allowedLocationId: assignedLocationId,
      });
    } 
    else if (roleName === 'Sales') {
      // Sales: can view all warehouses but only one type
      setPermissions({ 
        canViewAll: false, 
        allowedTypes: assignedType ? [assignedType] : ['S1', 'Bidding'], 
        allowedLocationId: null,
      });
    } 
    else {
      // Default: no permissions
      setPermissions({ 
        canViewAll: false, 
        allowedTypes: [], 
        allowedLocationId: null,
      });
    }
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setShowFilterPanel(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (authUser) loadUserPermissions(authUser);
  }, [authUser]);

  useEffect(() => { fetchLogs(); }, [activeSection, permissions]);
  useEffect(() => { applyFilters(); }, [logs, search, movementFilter, typeFilter, sortField, sortDir, hideNoRelation]);

  // ── Fetch with role-based filtering ──────────────────────────────────────────
  const fetchLogs = async () => {
    setLoading(true);
    
    let query = supabase
      .from('transaction_item')
      .select(`
        item_id, movement, quantity, price, total, transaction_id, stock_id,
        stock:stock_id (
          product_type,
          product:product_id ( product_name, barcode ),
          location:location_id ( location_id, warehouse_name )
        ),
        transactions:transaction_id (
          type, reference_no, date_created,
          relations:relation_id ( name )
        )
      `)
      .order('item_id', { ascending: false });

    const { data, error } = await query;

    if (error) { 
      console.error('MovementLog fetch error:', error.message); 
      setLoading(false); 
      return; 
    }

    let result = (data ?? []) as any[];
    
    // Apply role-based filters
    if (!permissions.canViewAll) {
      // Filter by product type (S1 or Bidding)
      if (permissions.allowedTypes.length > 0 && permissions.allowedTypes.length < 2) {
        result = result.filter((l: any) => 
          permissions.allowedTypes.includes(l.stock?.product_type)
        );
      }
      
      // Filter by assigned location (for Warehouse role)
      if (permissions.allowedLocationId) {
        result = result.filter((l: any) => 
          l.stock?.location?.location_id === permissions.allowedLocationId
        );
      }
    }

    // Apply warehouse section filter (overall/warehouse A/B/C)
    const warehouseFilter = getWarehouseFilter(activeSection);
    if (warehouseFilter) {
      result = result.filter((l: any) => 
        l.stock?.location?.warehouse_name === warehouseFilter
      );
    }
    
    setLogs(result);
    setLoading(false);
  };

  const getWarehouseFilter = (section: string): string | null => {
    const warehouseMap: Record<string, string | null> = {
      overall: null,
      warehouseA: 'Warehouse A',
      warehouseB: 'Warehouse B',
      warehouseC: 'Warehouse C',
    };
    return warehouseMap[section] || null;
  };

  const applyFilters = () => {
    let result = [...logs];

    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(l =>
        l.stock?.product?.product_name?.toLowerCase().includes(s) ||
        l.stock?.product?.barcode?.toLowerCase().includes(s) ||
        l.transactions?.reference_no?.toLowerCase().includes(s) ||
        l.transactions?.relations?.name?.toLowerCase().includes(s)
      );
    }

    if (movementFilter !== 'All') result = result.filter(l => l.movement === movementFilter);
    if (typeFilter !== 'All')     result = result.filter(l => l.transactions?.type === typeFilter);
    if (hideNoRelation)           result = result.filter(l => !!l.transactions?.relations?.name);

    // Sort
    if (sortField !== 'none') {
      result.sort((a, b) => {
        let aVal: any, bVal: any;
        if (sortField === 'item_id')      { aVal = a.item_id;   bVal = b.item_id; }
        if (sortField === 'product_name') { aVal = a.stock?.product?.product_name ?? ''; bVal = b.stock?.product?.product_name ?? ''; }
        if (sortField === 'date_created') { aVal = new Date(a.transactions?.date_created ?? 0).getTime(); bVal = new Date(b.transactions?.date_created ?? 0).getTime(); }
        if (sortField === 'total')        { aVal = a.total ?? 0; bVal = b.total ?? 0; }
        if (sortField === 'quantity')     { aVal = a.quantity ?? 0; bVal = b.quantity ?? 0; }

        if (typeof aVal === 'string') {
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }

    setFiltered(result);
  };

  // ── Export helpers ─────────────────────────────────────────────────────────
  const formatDate = (d: string) =>
    new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const toCSVRow = (l: MovementLog) => [
    l.item_id,
    l.stock?.product?.barcode ?? '',
    l.stock?.product?.product_name ?? '',
    l.stock?.location?.warehouse_name ?? '',
    l.movement,
    l.transactions?.type ?? '',
    l.transactions?.reference_no ?? '',
    l.transactions?.relations?.name ?? '',
    l.quantity,
    `${l.price?.toFixed(2)}`,
    `${l.total?.toFixed(2)}`,
    l.transactions?.date_created ? formatDate(l.transactions.date_created) : '',
  ].join(',');

  const exportCSV = () => {
    const header = 'ID,Barcode,Product,Warehouse,Movement,Type,Reference,Relation,Qty,Price,Total,Date';
    const rows   = filtered.map(toCSVRow).join('\n');
    const blob   = new Blob([header + '\n' + rows], { type: 'text/csv' });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement('a');
    a.href = url; a.download = 'movement_log.csv'; a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const exportExcel = () => {
    const header = ['ID','Barcode','Product','Warehouse','Movement','Type','Reference','Relation','Qty','Price','Total','Date'];
    const rows   = filtered.map(l => [
      l.item_id,
      l.stock?.product?.barcode ?? '',
      l.stock?.product?.product_name ?? '',
      l.stock?.location?.warehouse_name ?? '',
      l.movement,
      l.transactions?.type ?? '',
      l.transactions?.reference_no ?? '',
      l.transactions?.relations?.name ?? '',
      l.quantity,
      l.price,
      l.total,
      l.transactions?.date_created ? formatDate(l.transactions.date_created) : '',
    ]);
    const tsv  = [header, ...rows].map(r => r.join('\t')).join('\n');
    const blob = new Blob([tsv], { type: 'application/vnd.ms-excel' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'movement_log.xls'; a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const exportPDF = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const rows = filtered.map(l => `
      <tr>
        <td>${l.item_id}</td>
        <td>${l.stock?.product?.barcode ?? '—'}</td>
        <td>${l.stock?.product?.product_name ?? '—'}</td>
        <td>${l.stock?.location?.warehouse_name ?? '—'}</td>
        <td><b style="color:${l.movement === 'IN' ? '#16a34a' : '#dc2626'}">${l.movement}</b></td>
        <td>${l.transactions?.type ?? '—'}</td>
        <td>${l.transactions?.reference_no ?? '—'}</td>
        <td>${l.transactions?.relations?.name ?? '—'}</td>
        <td>${l.quantity}</td>
        <td>₱${l.price?.toFixed(2)}</td>
        <td>₱${l.total?.toFixed(2)}</td>
        <td>${l.transactions?.date_created ? formatDate(l.transactions.date_created) : '—'}</td>
      </tr>`).join('');

    win.document.write(`
      <html><head><title>Movement Log</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; }
        h2   { color: #1B3C53; margin-bottom: 4px; }
        p    { color: #7a8fa0; margin: 0 0 16px; font-size: 10px; }
        table { width: 100%; border-collapse: collapse; }
        th   { background: #1B3C53; color: white; padding: 7px 8px; text-align: left; font-size: 10px; }
        td   { padding: 6px 8px; border-bottom: 1px solid #eee; }
        tr:nth-child(even) td { background: #f8fafc; }
      </style></head>
      <body>
        <h2>Movement Log</h2>
        <p>Exported ${new Date().toLocaleString()}</p>
        <table>
          <thead><tr>
            <th>#</th><th>Barcode</th><th>Product</th><th>Warehouse</th>
            <th>Move</th><th>Type</th><th>Reference</th><th>Relations</th>
            <th>Qty</th><th>Price</th><th>Total</th><th>Date</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <script>window.onload = () => window.print();<\/script>
      </body></html>`);
    win.document.close();
    setShowExportMenu(false);
  };

  // ── Sort helpers ───────────────────────────────────────────────────────────
  const activeSortCount = (sortField !== 'none' ? 1 : 0) + (hideNoRelation ? 1 : 0);

  const resetFilters = () => {
    setSortField('none');
    setSortDir('asc');
    setHideNoRelation(false);
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalIn    = filtered.filter(l => l.movement === 'IN').length;
  const totalOut   = filtered.filter(l => l.movement === 'OUT').length;
  const totalValue = filtered.reduce((s, l) => s + (l.total ?? 0), 0);

  // ── Warehouse tabs (filtered by permissions) ─────────────────────────────────
  const getAvailableWarehouses = () => {
    // If user has location restriction (Warehouse role), only show that warehouse
    if (permissions.allowedLocationId && !permissions.canViewAll) {
      // Find the warehouse name from the location
      const warehouseNames: Record<number, string> = {
        1: 'Warehouse A',
        2: 'Warehouse B', 
        3: 'Warehouse C',
      };
      const warehouseName = warehouseNames[permissions.allowedLocationId];
      if (warehouseName) {
        return [{ id: warehouseName.toLowerCase().replace(' ', ''), label: warehouseName }];
      }
      return [{ id: 'overall', label: 'Overall' }];
    }
    
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="ml-page">
      {/* Header */}
      <div className="ml-header">
        <div>
          <h1 className="ml-title">Stock Movement Log</h1>
          <p className="ml-subtitle">
            Track all stock IN / OUT transactions
            {currentUser && <span className="user-role-chip">{currentUser.role_name}</span>}
            {permissions.allowedTypes.length === 1 && !permissions.canViewAll && (
              <span className="type-chip">{permissions.allowedTypes[0]} only</span>
            )}
            {permissions.allowedLocationId && !permissions.canViewAll && (
              <span className="location-chip">Warehouse restricted</span>
            )}
          </p>
        </div>
        <button className="ml-refresh-btn" onClick={fetchLogs}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </div>


      {/* Filters */}
      <div className="ml-filters">
        <div className="ml-search-wrap">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="ml-search"
            placeholder="Search by product, barcode, reference, party..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select className="ml-select" value={movementFilter}
          onChange={e => setMovementFilter(e.target.value)}>
          <option value="All">All Movements</option>
          <option value="IN">IN</option>
          <option value="OUT">OUT</option>
        </select>

        <select className="ml-select" value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}>
          <option value="All">All Types</option>
          <option value="PURCHASE">PURCHASE</option>
          <option value="SALE">SALE</option>
          <option value="RETURN">RETURN</option>
        </select>

        {/* ── Sort / Filter button ── */}
        <div className="ml-dropdown-wrap" ref={filterPanelRef}>
          <button
            className={`ml-icon-btn${activeSortCount > 0 ? ' active' : ''}`}
            onClick={() => setShowFilterPanel(v => !v)}
            title="Sort & Filter"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6"  x2="20" y2="6"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
              <line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
            Filter
            {activeSortCount > 0 && (
              <span className="ml-badge-count">{activeSortCount}</span>
            )}
          </button>

          {showFilterPanel && (
            <div className="ml-panel">
              <div className="ml-panel-header">
                <span>Sort &amp; Filter</span>
                {activeSortCount > 0 && (
                  <button className="ml-panel-reset" onClick={resetFilters}>Reset all</button>
                )}
              </div>

              {/* Sort by */}
              <div className="ml-panel-section">
                <label className="ml-panel-label">Sort by</label>
                <div className="ml-panel-row">
                  <select
                    className="ml-select ml-select-grow"
                    value={sortField}
                    onChange={e => setSortField(e.target.value as SortField)}
                  >
                    <option value="none">— None —</option>
                    <option value="item_id">ID (Number)</option>
                    <option value="product_name">Product Name (A–Z)</option>
                    <option value="date_created">Date</option>
                    <option value="total">Total Value</option>
                    <option value="quantity">Quantity</option>
                  </select>

                  <div className="ml-dir-toggle">
                    <button
                      className={`ml-dir-btn${sortDir === 'asc' ? ' selected' : ''}`}
                      onClick={() => setSortDir('asc')}
                      title="Ascending"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="19" x2="12" y2="5"/>
                        <polyline points="5 12 12 5 19 12"/>
                      </svg>
                      Asc
                    </button>
                    <button
                      className={`ml-dir-btn${sortDir === 'desc' ? ' selected' : ''}`}
                      onClick={() => setSortDir('desc')}
                      title="Descending"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <polyline points="19 12 12 19 5 12"/>
                      </svg>
                      Desc
                    </button>
                  </div>
                </div>
              </div>

              {/* Row filters */}
              <div className="ml-panel-section">
                <label className="ml-panel-label">Row filters</label>
                <label className="ml-checkbox-row">
                  <input
                    type="checkbox"
                    checked={hideNoRelation}
                    onChange={e => setHideNoRelation(e.target.checked)}
                  />
                  Hide rows without a Relation
                </label>
              </div>
            </div>
          )}
        </div>

        {/* ── Export dropdown ── */}
        <div className="ml-dropdown-wrap" ref={exportMenuRef}>
          <button
            className="ml-icon-btn export"
            onClick={() => setShowExportMenu(v => !v)}
            title="Export"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export
            <svg className="ml-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {showExportMenu && (
            <div className="ml-panel ml-export-panel">
              <button className="ml-export-item" onClick={exportCSV}>
                <span className="ml-export-icon csv">CSV</span>
                <div>
                  <div className="ml-export-item-title">Export as CSV</div>
                  <div className="ml-export-item-desc">Comma-separated, opens in any editor</div>
                </div>
              </button>
              <button className="ml-export-item" onClick={exportExcel}>
                <span className="ml-export-icon xls">XLS</span>
                <div>
                  <div className="ml-export-item-title">Export as Excel</div>
                  <div className="ml-export-item-desc">Tab-separated, opens in Excel / Sheets</div>
                </div>
              </button>
              <button className="ml-export-item" onClick={exportPDF}>
                <span className="ml-export-icon pdf">PDF</span>
                <div>
                  <div className="ml-export-item-title">Export as PDF</div>
                  <div className="ml-export-item-desc">Printable report with formatting</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="ml-stats">
        <div className="stat-chip">
          <span className="stat-num">{filtered.length}</span>
          <span className="stat-label">Total</span>
        </div>
        <div className="stat-chip">
          <span className="stat-num green">{totalIn}</span>
          <span className="stat-label">IN</span>
        </div>
        <div className="stat-chip">
          <span className="stat-num red">{totalOut}</span>
          <span className="stat-label">OUT</span>
        </div>
        <div className="stat-chip">
          <span className="stat-num">₱{totalValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          <span className="stat-label">Total Value</span>
        </div>
      </div>

      {/* Table */}
      <div className="ml-table-wrap">
        {loading ? (
          <div className="ml-state">
            <span className="ml-spinner" />
            <p>Loading movement logs...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="ml-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 17H5a2 2 0 0 0-2 2"/>
              <path d="M21 17h-4a2 2 0 0 0-2 2"/>
              <path d="M13 5H5a2 2 0 0 0-2 2v10"/>
              <path d="M21 7V5a2 2 0 0 0-2-2h-4"/>
              <rect x="9" y="9" width="6" height="10" rx="1"/>
            </svg>
            <p>No movement logs found</p>
          </div>
        ) : (
          <table className="ml-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Barcode</th>
                <th>Product</th>
                <th>Warehouse</th>
                <th>Movement</th>
                <th>Type</th>
                <th>Reference</th>
                <th>Relation</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.item_id}>
                  <td className="td-id">{l.item_id}</td>
                  <td className="td-mono">{l.stock?.product?.barcode ?? '—'}</td>
                  <td className="td-name">{l.stock?.product?.product_name ?? '—'}</td>
                  <td>{l.stock?.location?.warehouse_name ?? '—'}</td>
                  <td>
                    <span className={`badge ${MOVEMENT_COLORS[l.movement] ?? 'badge-gray'}`}>
                      {l.movement}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${TYPE_COLORS[l.transactions?.type ?? ''] ?? 'badge-gray'}`}>
                      {l.transactions?.type ?? '—'}
                    </span>
                  </td>
                  <td className="td-mono">{l.transactions?.reference_no ?? '—'}</td>
                  <td>{l.transactions?.relations?.name ?? '—'}</td>
                  <td className="td-qty">{l.quantity}</td>
                  <td>₱{l.price?.toFixed(2) ?? '—'}</td>
                  <td className="td-total">₱{l.total?.toFixed(2) ?? '—'}</td>
                  <td className="td-date">
                    {l.transactions?.date_created
                      ? formatDate(l.transactions.date_created)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default MovementLogPage;