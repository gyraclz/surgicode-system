import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from './lib/supabase';
import './AdminDashboard.css';

// ── Types ─────────────────────────────────────────────────────────────────────
interface DashboardStats {
  totalProducts: number;
  totalStockValue: number;
  totalUnits: number;
  lowStockItems: number;
  outOfStockItems: number;
  expiringSoon: number;
}

interface TypeStats {
  type: string;
  totalUnits: number;
  totalValue: number;
  productCount: number;
  stockCount: number;
  lowStock: number;
  outOfStock: number;
}

interface WarehouseStock {
  warehouse_name: string;
  s1_units: number;
  s1_value: number;
  bidding_units: number;
  bidding_value: number;
  total_units: number;
  total_value: number;
}

interface RecentTransaction {
  transaction_id: number;
  type: string;
  reference_no: string;
  relation_name: string;
  total_amount: number;
  date_created: string;
  processed_by_name: string;
}

interface TopProduct {
  product_name: string;
  total_sold: number;
  total_revenue: number;
  stock_remaining: number;
  product_type: string;
}

interface StockAlert {
  stock_id: number;
  product_name: string;
  product_type: string;
  quantity: number;
  location: string;
  status: string;
  expiration_date: string | null;
  alert_type: 'out_of_stock' | 'low_stock' | 'expiring_soon' | 'expired';
}

interface Notification {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  time: string;
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [permissions, setPermissions] = useState({
    canViewAll: false,
    allowedTypes: [] as string[],
    allowedLocationId: null as number | null,
  });

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    totalStockValue: 0,
    totalUnits: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
    expiringSoon: 0,
  });

  const [s1Stats, setS1Stats] = useState<TypeStats>({ type: 'S1', totalUnits: 0, totalValue: 0, productCount: 0, stockCount: 0, lowStock: 0, outOfStock: 0 });
  const [biddingStats, setBiddingStats] = useState<TypeStats>({ type: 'Bidding', totalUnits: 0, totalValue: 0, productCount: 0, stockCount: 0, lowStock: 0, outOfStock: 0 });
  const [warehouseStocks, setWarehouseStocks] = useState<WarehouseStock[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const safeExtract = <T,>(data: T[] | T | null | undefined, defaultVal: T): T => {
    if (!data) return defaultVal;
    if (Array.isArray(data)) return (data[0] as T) || defaultVal;
    return data;
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(v);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const getProgressPct = (cur: number, tot: number) => (tot === 0 ? 0 : Math.min(100, (cur / tot) * 100));

  // ── Load user from localStorage ──────────────────────────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem('loggedInUser');
    if (!raw) { setLoading(false); return; }
    try {
      const saved = JSON.parse(raw);
      loadUserPermissions(saved);
    } catch { setLoading(false); }
  }, []);

  const loadUserPermissions = async (saved: any) => {
    const { data, error } = await supabase
      .from('users')
      .select('user_id, full_name, username, role_id, assigned_type, assigned_location_id, role:role_id(role_name)')
      .eq('user_id', saved.user_id)
      .single();

    if (error || !data) { setLoading(false); return; }

    const roleRaw = data.role as any;
    const roleName = Array.isArray(roleRaw)
      ? (roleRaw[0]?.role_name ?? '')
      : (roleRaw?.role_name ?? '');

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

    const at = data.assigned_type;
    const al = data.assigned_location_id;

    if (roleName === 'Admin') {
      setPermissions({ canViewAll: true, allowedTypes: ['S1', 'Bidding'], allowedLocationId: null });
    } else if (roleName === 'Manager') {
      setPermissions({ canViewAll: false, allowedTypes: at ? [at] : ['S1', 'Bidding'], allowedLocationId: null });
    } else if (roleName === 'Warehouse') {
      setPermissions({ canViewAll: false, allowedTypes: at ? [at] : ['S1', 'Bidding'], allowedLocationId: al });
    } else if (roleName === 'Sales') {
      setPermissions({ canViewAll: false, allowedTypes: at ? [at] : ['S1', 'Bidding'], allowedLocationId: null });
    }
    setPermissionsLoaded(true);
  };

  useEffect(() => {
    const t = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (permissionsLoaded) fetchDashboardData();
  }, [selectedPeriod, permissionsLoaded]);

  // ── Fetch all dashboard data ─────────────────────────────────────────────────
  const fetchDashboardData = async () => {
    setLoading(true);
    await Promise.all([
      fetchOverallStats(),
      fetchTypeStats(),
      fetchWarehouseStocks(),
      fetchRecentTransactions(),
      fetchTopProducts(),
      fetchStockAlerts(),
    ]);
    setLoading(false);
  };

  // ── Overall Stats ────────────────────────────────────────────────────────────
  const fetchOverallStats = async () => {
    const { count: productCount } = await supabase
      .from('product')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Active');

    let q = supabase.from('stock').select('quantity, unit_cost, status, expiration_date, product_type, location_id');
    if (!permissions.canViewAll) {
      if (permissions.allowedTypes.length > 0) q = q.in('product_type', permissions.allowedTypes);
      if (permissions.allowedLocationId) q = q.eq('location_id', permissions.allowedLocationId);
    }
    const { data } = await q;

    let totalValue = 0, totalUnits = 0, lowStock = 0, outOfStock = 0, expiringSoon = 0;
    const today = new Date();
    const in30 = new Date(); in30.setDate(today.getDate() + 30);

    (data ?? []).forEach((item: any) => {
      const qty = item.quantity ?? 0;
      totalValue += qty * (item.unit_cost ?? 0);
      totalUnits += qty;
      if (qty === 0) outOfStock++;
      else if (qty < 10) lowStock++;
      if (item.expiration_date) {
        const exp = new Date(item.expiration_date);
        if (exp <= in30 && exp >= today) expiringSoon++;
      }
    });

    setStats({ totalProducts: productCount ?? 0, totalStockValue: totalValue, totalUnits, lowStockItems: lowStock, outOfStockItems: outOfStock, expiringSoon });
  };

  // ── Type Stats ───────────────────────────────────────────────────────────────
  const fetchTypeStats = async () => {
    const types = permissions.canViewAll ? ['S1', 'Bidding'] : permissions.allowedTypes;

    const fetchForType = async (type: string) => {
      let q = supabase.from('stock').select('quantity, unit_cost, status, product:product_id(product_id)').eq('product_type', type);
      if (permissions.allowedLocationId) q = q.eq('location_id', permissions.allowedLocationId);
      const { data } = await q;
      return data;
    };

    const calc = (data: any[] | null, type: string): TypeStats => {
      let totalUnits = 0, totalValue = 0, lowStock = 0, outOfStock = 0;
      const uniq = new Set<number>();
      (data ?? []).forEach((item: any) => {
        const qty = item.quantity ?? 0;
        totalUnits += qty;
        totalValue += qty * (item.unit_cost ?? 0);
        const p = safeExtract(item.product, null as any);
        if (p?.product_id) uniq.add(p.product_id);
        if (qty === 0) outOfStock++;
        else if (qty < 10) lowStock++;
      });
      return { type, totalUnits, totalValue, productCount: uniq.size, stockCount: data?.length ?? 0, lowStock, outOfStock };
    };

    if (types.includes('S1')) setS1Stats(calc(await fetchForType('S1'), 'S1'));
    if (types.includes('Bidding')) setBiddingStats(calc(await fetchForType('Bidding'), 'Bidding'));
  };

  // ── Warehouse Stocks ──────────────────────────────────────────────────────────
  const fetchWarehouseStocks = async () => {
    let q = supabase.from('stock').select('quantity, unit_cost, product_type, location:location_id(warehouse_name)').not('location_id', 'is', null);
    if (!permissions.canViewAll) {
      if (permissions.allowedTypes.length > 0) q = q.in('product_type', permissions.allowedTypes);
      if (permissions.allowedLocationId) q = q.eq('location_id', permissions.allowedLocationId);
    }
    const { data } = await q;

    const map = new Map<string, { s1_units: number; s1_value: number; bidding_units: number; bidding_value: number }>();
    (data ?? []).forEach((item: any) => {
      const loc = safeExtract(item.location, null as any);
      const wh = loc?.warehouse_name ?? 'Unknown';
      const cur = map.get(wh) ?? { s1_units: 0, s1_value: 0, bidding_units: 0, bidding_value: 0 };
      const qty = item.quantity ?? 0;
      const val = qty * (item.unit_cost ?? 0);
      if (item.product_type === 'S1') { cur.s1_units += qty; cur.s1_value += val; }
      else if (item.product_type === 'Bidding') { cur.bidding_units += qty; cur.bidding_value += val; }
      map.set(wh, cur);
    });

    const list: WarehouseStock[] = [];
    map.forEach((v, k) => list.push({
      warehouse_name: k,
      s1_units: v.s1_units, s1_value: v.s1_value,
      bidding_units: v.bidding_units, bidding_value: v.bidding_value,
      total_units: v.s1_units + v.bidding_units, total_value: v.s1_value + v.bidding_value,
    }));
    setWarehouseStocks(list.sort((a, b) => b.total_value - a.total_value));
  };

  // ── Recent Transactions ───────────────────────────────────────────────────────
  const fetchRecentTransactions = async () => {
    const { data } = await supabase
      .from('transactions')
      .select('transaction_id, type, reference_no, date_created, relation:relation_id(name), processed_by:processed_by(full_name), transaction_item(total)')
      .order('date_created', { ascending: false })
      .limit(10);

    const txns: RecentTransaction[] = (data ?? []).map((t: any) => {
      const rel = safeExtract(t.relation, null as any);
      const proc = safeExtract(t.processed_by, null as any);
      const total = Array.isArray(t.transaction_item)
        ? t.transaction_item.reduce((s: number, i: any) => s + (i.total ?? 0), 0)
        : (t.transaction_item?.total ?? 0);
      return {
        transaction_id: t.transaction_id,
        type: t.type,
        reference_no: t.reference_no ?? '—',
        relation_name: rel?.name ?? '—',
        total_amount: total,
        date_created: t.date_created,
        processed_by_name: proc?.full_name ?? 'System',
      };
    });
    setRecentTransactions(txns);
  };

  // ── Top Products ──────────────────────────────────────────────────────────────
  const fetchTopProducts = async () => {
    const cutoff = new Date();
    if (selectedPeriod === 'week') cutoff.setDate(cutoff.getDate() - 7);
    else if (selectedPeriod === 'month') cutoff.setMonth(cutoff.getMonth() - 1);
    else cutoff.setFullYear(cutoff.getFullYear() - 1);

    let stockQ = supabase.from('stock').select('stock_id, product_type, product_id');
    if (!permissions.canViewAll) {
      if (permissions.allowedTypes.length > 0) stockQ = stockQ.in('product_type', permissions.allowedTypes);
      if (permissions.allowedLocationId) stockQ = stockQ.eq('location_id', permissions.allowedLocationId);
    }
    const { data: allowedStocks } = await stockQ;
    const ids = (allowedStocks ?? []).map((s: any) => s.stock_id);
    if (ids.length === 0) { setTopProducts([]); return; }

    const { data } = await supabase
      .from('transaction_item')
      .select('quantity, total, stock:stock_id(product:product_id(product_name, product_id), product_type)')
      .eq('movement', 'OUT')
      .in('stock_id', ids)
      .gte('created_at', cutoff.toISOString());

    const map = new Map<number, { product_name: string; total_sold: number; total_revenue: number; product_type: string; product_id: number }>();
    (data ?? []).forEach((item: any) => {
      const stock = safeExtract(item.stock, null as any);
      if (!stock) return;
      const prod = safeExtract(stock.product, null as any);
      if (!prod) return;
      const cur = map.get(prod.product_id) ?? { product_name: prod.product_name, total_sold: 0, total_revenue: 0, product_type: stock.product_type, product_id: prod.product_id };
      cur.total_sold += item.quantity ?? 0;
      cur.total_revenue += item.total ?? 0;
      map.set(prod.product_id, cur);
    });

    const top = Array.from(map.values()).sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 5);

    const topWithStock = await Promise.all(top.map(async (p) => {
      let q = supabase.from('stock').select('quantity').eq('product_id', p.product_id);
      if (permissions.allowedLocationId) q = q.eq('location_id', permissions.allowedLocationId);
      const { data: sd } = await q;
      const remaining = (sd ?? []).reduce((s: number, r: any) => s + (r.quantity ?? 0), 0);
      return { ...p, stock_remaining: remaining };
    }));

    setTopProducts(topWithStock);
  };

  // ── Stock Alerts & Notifications ──────────────────────────────────────────────
  const fetchStockAlerts = async () => {
    const today = new Date();
    const in30 = new Date(); in30.setDate(today.getDate() + 30);

    let q = supabase
      .from('stock')
      .select('stock_id, quantity, status, product_type, expiration_date, product:product_id(product_name), location:location_id(warehouse_name)')
      .order('quantity', { ascending: true })
      .limit(30);

    if (!permissions.canViewAll) {
      if (permissions.allowedTypes.length > 0) q = q.in('product_type', permissions.allowedTypes);
      if (permissions.allowedLocationId) q = q.eq('location_id', permissions.allowedLocationId);
    }

    const { data } = await q;

    const alerts: StockAlert[] = [];
    const notifs: Notification[] = [];

    (data ?? []).forEach((s: any) => {
      const prod = safeExtract(s.product, null as any);
      const loc = safeExtract(s.location, null as any);
      const name = prod?.product_name ?? 'Unknown';
      const location = loc?.warehouse_name ?? 'Unknown';
      const qty = s.quantity ?? 0;
      const exp = s.expiration_date ? new Date(s.expiration_date) : null;

      let alert_type: StockAlert['alert_type'] | null = null;

      if (qty === 0) alert_type = 'out_of_stock';
      else if (qty < 10) alert_type = 'low_stock';

      if (exp) {
        if (exp < today) alert_type = 'expired';
        else if (exp <= in30) alert_type = alert_type ?? 'expiring_soon';
      }

      if (!alert_type) return;

      alerts.push({
        stock_id: s.stock_id,
        product_name: name,
        product_type: s.product_type ?? '—',
        quantity: qty,
        location,
        status: s.status ?? '—',
        expiration_date: s.expiration_date,
        alert_type,
      });

      // Build notification
      const id = `notif-${s.stock_id}-${alert_type}`;
      if (alert_type === 'out_of_stock') {
        notifs.push({ id, type: 'critical', title: 'Out of Stock', message: `${name} at ${location} is completely out of stock.`, time: 'Now' });
      } else if (alert_type === 'low_stock') {
        notifs.push({ id, type: 'warning', title: 'Low Stock', message: `${name} at ${location} has only ${qty} unit(s) remaining.`, time: 'Now' });
      } else if (alert_type === 'expired') {
        notifs.push({ id, type: 'critical', title: 'Expired Stock', message: `${name} at ${location} has expired.`, time: 'Now' });
      } else if (alert_type === 'expiring_soon') {
        const daysLeft = Math.ceil((exp!.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        notifs.push({ id, type: 'warning', title: 'Expiring Soon', message: `${name} at ${location} expires in ${daysLeft} day(s).`, time: 'Now' });
      }
    });

    // Sort: out_of_stock & expired first
    const priority = { out_of_stock: 0, expired: 1, low_stock: 2, expiring_soon: 3 };
    alerts.sort((a, b) => priority[a.alert_type] - priority[b.alert_type]);

    setStockAlerts(alerts);
    setNotifications(notifs);
  };

  const canSeeS1 = permissions.canViewAll || permissions.allowedTypes.includes('S1');
  const canSeeBidding = permissions.canViewAll || permissions.allowedTypes.includes('Bidding');

  const criticalCount = notifications.filter(n => n.type === 'critical').length;
  const warningCount  = notifications.filter(n => n.type === 'warning').length;
  const totalNotifCount = notifications.length;

  const getDashboardTitle = () => {
    if (!currentUser) return 'Dashboard';
    const map: Record<string, string> = { Admin: 'Admin Dashboard', Manager: 'Manager Dashboard', Warehouse: 'Warehouse Dashboard', Sales: 'Sales Dashboard' };
    return map[currentUser.role_name] ?? 'Dashboard';
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="admin-dashboard">

      {/* ── HEADER ── */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">{getDashboardTitle()}</h1>
          <p className="dashboard-subtitle">
            Inventory Overview & Analytics
            {currentUser && <span className="user-role-chip">{currentUser.role_name}</span>}
            {permissions.allowedTypes.length === 1 && !permissions.canViewAll && <span className="type-chip">{permissions.allowedTypes[0]} only</span>}
            {permissions.allowedLocationId && <span className="location-chip">Warehouse restricted</span>}
          </p>
        </div>
        <div className="dashboard-header-right">
          {/* Notification Bell */}
          <div className="notif-wrap">
            <button className={`notif-bell${totalNotifCount > 0 ? ' has-notif' : ''}`} onClick={() => setShowNotifications(v => !v)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {totalNotifCount > 0 && (
                <span className={`notif-badge ${criticalCount > 0 ? 'critical' : 'warning'}`}>
                  {totalNotifCount > 99 ? '99+' : totalNotifCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="notif-dropdown">
                <div className="notif-dropdown-header">
                  <span className="notif-dropdown-title">Notifications</span>
                  <div className="notif-counts">
                    {criticalCount > 0 && <span className="notif-count-chip critical">{criticalCount} critical</span>}
                    {warningCount > 0 && <span className="notif-count-chip warning">{warningCount} warnings</span>}
                  </div>
                </div>
                <div className="notif-list">
                  {notifications.length === 0 ? (
                    <div className="notif-empty">No alerts at this time</div>
                  ) : (
                    notifications.slice(0, 20).map(n => (
                      <div key={n.id} className={`notif-item ${n.type}`}>
                        <div className={`notif-dot ${n.type}`} />
                        <div className="notif-content">
                          <div className="notif-item-title">{n.title}</div>
                          <div className="notif-item-msg">{n.message}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {notifications.length > 20 && (
                  <div className="notif-more">+{notifications.length - 20} more alerts</div>
                )}
              </div>
            )}
          </div>

          <button className="dashboard-refresh-btn" onClick={fetchDashboardData}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Refresh
          </button>

          <span className="dashboard-user">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            {currentUser?.full_name ?? 'User'}
          </span>
          <span className="dashboard-clock">{currentDateTime.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* ── PERIOD SELECTOR ── */}
      {(currentUser?.role_name === 'Admin' || currentUser?.role_name === 'Manager') && (
        <div className="period-selector">
          {(['week', 'month', 'year'] as const).map(p => (
            <button key={p} className={`period-btn${selectedPeriod === p ? ' active' : ''}`} onClick={() => setSelectedPeriod(p)}>
              {p === 'week' ? 'Last 7 Days' : p === 'month' ? 'Last 30 Days' : 'Last Year'}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="dashboard-loading">
          <div className="spinner" />
          <p>Loading dashboard data...</p>
        </div>
      ) : (
        <>
          {/* ── STOCK ALERTS (TOP) ── */}
          {stockAlerts.length > 0 && (
            <div className="alerts-section top-alerts">
              <div className="alerts-section-header">
                <h2 className="section-title" style={{ margin: 0, border: 0, padding: 0 }}>
                  Stock Alerts
                  <span className="alert-count-badge">{stockAlerts.length}</span>
                </h2>
                <div className="alert-legend">
                  <span className="legend-pill critical">Out of Stock / Expired</span>
                  <span className="legend-pill warning">Low Stock / Expiring Soon</span>
                </div>
              </div>
              <div className="alerts-scroll">
                {stockAlerts.map(alert => (
                  <div key={`${alert.stock_id}-${alert.alert_type}`} className={`alert-card ${alert.alert_type === 'out_of_stock' || alert.alert_type === 'expired' ? 'critical' : 'warning'}`}>
                    <div className="alert-icon">
                      {alert.alert_type === 'out_of_stock' || alert.alert_type === 'expired' ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      ) : alert.alert_type === 'expiring_soon' ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      )}
                    </div>
                    <div className="alert-content">
                      <div className="alert-title">{alert.product_name}</div>
                      <div className="alert-details">
                        <span className={`alert-type-pill ${alert.product_type.toLowerCase()}`}>{alert.product_type}</span>
                        <span className={`alert-badge ${alert.alert_type}`}>
                          {alert.alert_type === 'out_of_stock' ? 'Out of Stock'
                            : alert.alert_type === 'expired' ? 'Expired'
                            : alert.alert_type === 'low_stock' ? `Low: ${alert.quantity} left`
                            : `Expires: ${alert.expiration_date ? new Date(alert.expiration_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}`}
                        </span>
                        <span className="alert-loc">📍 {alert.location}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── KEY METRICS ── */}
          <div className="metrics-grid">
            {[
              { icon: 'blue', label: 'Total Products', value: stats.totalProducts, svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><line x1="16" y1="21" x2="16" y2="15"/><line x1="8" y1="21" x2="8" y2="15"/><line x1="12" y1="21" x2="12" y2="15"/></svg> },
              { icon: 'purple', label: 'Total Units', value: stats.totalUnits.toLocaleString(), svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> },
              { icon: 'green', label: 'Total Stock Value', value: formatCurrency(stats.totalStockValue), svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
              { icon: 'orange', label: 'Low Stock', value: stats.lowStockItems, svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
              { icon: 'red', label: 'Out of Stock', value: stats.outOfStockItems, svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
              { icon: 'yellow', label: 'Expiring ≤30 days', value: stats.expiringSoon, svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
            ].map(m => (
              <div key={m.label} className="metric-card">
                <div className={`metric-icon ${m.icon}`}>{m.svg}</div>
                <div className="metric-content">
                  <span className="metric-value">{m.value}</span>
                  <span className="metric-label">{m.label}</span>
                </div>
              </div>
            ))}
          </div>

          {/* ── TYPE STATS ── */}
          {(canSeeS1 || canSeeBidding) && (
            <div className="type-stats-section">
              <h2 className="section-title">Product Type Analysis</h2>
              <div className="type-stats-grid">
                {canSeeS1 && <TypeCard stats={s1Stats} formatCurrency={formatCurrency} getProgressPct={getProgressPct} />}
                {canSeeBidding && <TypeCard stats={biddingStats} formatCurrency={formatCurrency} getProgressPct={getProgressPct} />}
              </div>
            </div>
          )}

          {/* ── WAREHOUSE DISTRIBUTION ── */}
          {warehouseStocks.length > 0 && (
            <div className="warehouse-section">
              <h2 className="section-title">Warehouse Stock Distribution</h2>
              <div className="warehouse-grid">
                {warehouseStocks.map(w => (
                  <div key={w.warehouse_name} className="warehouse-card">
                    <div className="warehouse-header">
                      <div className="warehouse-name">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                        {w.warehouse_name}
                      </div>
                      <div className="warehouse-total">{formatCurrency(w.total_value)}</div>
                    </div>
                    <div className="warehouse-stats">
                      {canSeeS1 && w.s1_units > 0 && (
                        <div className="warehouse-stat">
                          <div className="stat-type s1">S1</div>
                          <div className="stat-info"><span>{w.s1_units.toLocaleString()} units</span><span>{formatCurrency(w.s1_value)}</span></div>
                          <div className="stat-bar"><div className="stat-bar-fill s1" style={{ width: `${w.total_value > 0 ? (w.s1_value / w.total_value) * 100 : 0}%` }} /></div>
                        </div>
                      )}
                      {canSeeBidding && w.bidding_units > 0 && (
                        <div className="warehouse-stat">
                          <div className="stat-type bidding">Bidding</div>
                          <div className="stat-info"><span>{w.bidding_units.toLocaleString()} units</span><span>{formatCurrency(w.bidding_value)}</span></div>
                          <div className="stat-bar"><div className="stat-bar-fill bidding" style={{ width: `${w.total_value > 0 ? (w.bidding_value / w.total_value) * 100 : 0}%` }} /></div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── TWO COLUMN ── */}
          <div className="two-column-layout">
            {/* Recent Transactions */}
            <div className="recent-transactions">
              <h2 className="section-title">Recent Transactions</h2>
              {recentTransactions.length === 0 ? (
                <div className="empty-state">No transactions found.</div>
              ) : (
                <div className="transactions-list">
                  {recentTransactions.map(txn => (
                    <div key={txn.transaction_id} className="transaction-item">
                      <div className="transaction-type">
                        <span className={`txn-badge ${txn.type.toLowerCase()}`}>{txn.type}</span>
                        <span className="transaction-ref">{txn.reference_no}</span>
                      </div>
                      <div className="transaction-details">
                        <div className="transaction-customer">{txn.relation_name}</div>
                        <div className="transaction-amount">{formatCurrency(txn.total_amount)}</div>
                      </div>
                      <div className="transaction-meta">
                        <span>{txn.processed_by_name}</span>
                        <span>{formatDate(txn.date_created)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Products */}
            <div className="top-products">
              <h2 className="section-title">Top Selling Products</h2>
              {topProducts.length === 0 ? (
                <div className="empty-state">No sales data for this period.</div>
              ) : (
                <div className="products-list">
                  {topProducts.map((p, i) => (
                    <div key={p.product_name} className="product-item">
                      <div className="product-rank">#{i + 1}</div>
                      <div className="product-info">
                        <div className="product-name">
                          {p.product_name}
                          <span className={`product-type-badge ${p.product_type.toLowerCase()}`}>{p.product_type}</span>
                        </div>
                        <div className="product-stats">
                          <span>Sold: {p.total_sold.toLocaleString()}</span>
                          <span>Revenue: {formatCurrency(p.total_revenue)}</span>
                          <span>Stock: {p.stock_remaining.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── TypeCard subcomponent ──────────────────────────────────────────────────────
function TypeCard({ stats, formatCurrency, getProgressPct }: {
  stats: TypeStats;
  formatCurrency: (v: number) => string;
  getProgressPct: (cur: number, tot: number) => number;
}) {
  const good = stats.totalUnits - stats.lowStock - stats.outOfStock;
  return (
    <div className={`type-card ${stats.type.toLowerCase()}-card`}>
      <div className="type-header">
        <div className={`type-badge ${stats.type.toLowerCase()}`}>{stats.type}</div>
        <div className="type-value">{formatCurrency(stats.totalValue)}</div>
      </div>
      <div className="type-stats">
        <div className="type-stat-item"><span className="stat-label">Total Units</span><span className="stat-value">{stats.totalUnits.toLocaleString()}</span></div>
        <div className="type-stat-item"><span className="stat-label">Products</span><span className="stat-value">{stats.productCount}</span></div>
        <div className="type-stat-item"><span className="stat-label">Stock Entries</span><span className="stat-value">{stats.stockCount}</span></div>
      </div>
      <div className="type-progress">
        <div className="progress-label">Stock Health</div>
        <div className="progress-bar">
          <div className="progress-fill good" style={{ width: `${getProgressPct(good, stats.totalUnits)}%` }} />
          <div className="progress-fill warning" style={{ width: `${getProgressPct(stats.lowStock, stats.totalUnits)}%` }} />
          <div className="progress-fill danger" style={{ width: `${getProgressPct(stats.outOfStock, stats.totalUnits)}%` }} />
        </div>
        <div className="progress-legend">
          <span><span className="legend-dot good" /> Good ({good})</span>
          <span><span className="legend-dot warning" /> Low ({stats.lowStock})</span>
          <span><span className="legend-dot danger" /> Out ({stats.outOfStock})</span>
        </div>
      </div>
    </div>
  );
}