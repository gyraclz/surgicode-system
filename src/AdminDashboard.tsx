import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { useAuth } from './context/AuthContext';
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

// Supabase response types
interface StockWithProduct {
  quantity: number;
  unit_cost: number;
  status: string;
  product: { product_id: number }[] | { product_id: number } | null;
}

interface StockWithLocation {
  quantity: number;
  unit_cost: number;
  product_type: string;
  location: { warehouse_name: string }[] | { warehouse_name: string } | null;
}

interface TransactionWithRelations {
  transaction_id: number;
  type: string;
  reference_no: string;
  date_created: string;
  relation: { name: string }[] | { name: string } | null;
  processed_by: { full_name: string }[] | { full_name: string } | null;
  transaction_item: { total: number }[] | { total: number } | null;
}

interface TransactionItemWithStock {
  quantity: number;
  price: number;
  total: number;
  created_at: string;
  stock: {
    product: { product_name: string }[] | { product_name: string } | null;
    product_type: string;
  }[] | {
    product: { product_name: string }[] | { product_name: string } | null;
    product_type: string;
  } | null;
}

interface StockAlertRaw {
  stock_id: number;
  quantity: number;
  status: string;
  product_type: string;
  product: { product_name: string }[] | { product_name: string } | null;
  location: { warehouse_name: string }[] | { warehouse_name: string } | null;
}

export default function Dashboard() {
  const { user: authUser } = useAuth();
  
  // ── Current User & Permissions ───────────────────────────────────────────────
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
  
  const [s1Stats, setS1Stats] = useState<TypeStats>({
    type: 'S1',
    totalUnits: 0,
    totalValue: 0,
    productCount: 0,
    stockCount: 0,
    lowStock: 0,
    outOfStock: 0,
  });
  
  const [biddingStats, setBiddingStats] = useState<TypeStats>({
    type: 'Bidding',
    totalUnits: 0,
    totalValue: 0,
    productCount: 0,
    stockCount: 0,
    lowStock: 0,
    outOfStock: 0,
  });
  
  const [warehouseStocks, setWarehouseStocks] = useState<WarehouseStock[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  // Helper function to safely extract value from array or object
  const safeExtract = <T,>(data: T[] | T | null | undefined, defaultValue: T): T => {
    if (!data) return defaultValue;
    if (Array.isArray(data)) return data[0] || defaultValue;
    return data;
  };

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

    // Extract role name properly
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
      setPermissions({ 
        canViewAll: true, 
        allowedTypes: ['S1', 'Bidding'], 
        allowedLocationId: null,
      });
    } 
    else if (roleName === 'Manager') {
      setPermissions({ 
        canViewAll: false, 
        allowedTypes: assignedType ? [assignedType] : ['S1', 'Bidding'], 
        allowedLocationId: null,
      });
    } 
    else if (roleName === 'Warehouse') {
      setPermissions({ 
        canViewAll: false, 
        allowedTypes: assignedType ? [assignedType] : ['S1', 'Bidding'], 
        allowedLocationId: assignedLocationId,
      });
    } 
    else if (roleName === 'Sales') {
      setPermissions({ 
        canViewAll: false, 
        allowedTypes: assignedType ? [assignedType] : ['S1', 'Bidding'], 
        allowedLocationId: null,
      });
    } 
    else {
      setPermissions({ 
        canViewAll: false, 
        allowedTypes: [], 
        allowedLocationId: null,
      });
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (authUser) {
      loadUserPermissions(authUser);
    }
  }, [authUser]);

  useEffect(() => {
    if (authUser) {
      fetchDashboardData();
    }
  }, [selectedPeriod, permissions, authUser]);

  const fetchDashboardData = async () => {
    if (!authUser) return;
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

  const fetchOverallStats = async () => {
    // Apply role-based filter to product count
    let productQuery = supabase
      .from('product')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Active');
    
    const { count: productCount } = await productQuery;
    
    // Apply role-based filter to stock
    let stockQuery = supabase
      .from('stock')
      .select('quantity, unit_cost, status, expiration_date, product_type, location_id')
      .not('location', 'is', null);
    
    if (!permissions.canViewAll) {
      if (permissions.allowedTypes.length > 0 && permissions.allowedTypes.length < 2) {
        stockQuery = stockQuery.in('product_type', permissions.allowedTypes);
      }
      if (permissions.allowedLocationId) {
        stockQuery = stockQuery.eq('location_id', permissions.allowedLocationId);
      }
    }
    
    const { data: stockData } = await stockQuery;
    
    let totalValue = 0;
    let totalUnits = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let expiringSoon = 0;
    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);
    
    if (stockData) {
      stockData.forEach((item: any) => {
        const quantity = item.quantity || 0;
        const unitCost = item.unit_cost || 0;
        const value = quantity * unitCost;
        totalValue += value;
        totalUnits += quantity;
        
        if (quantity === 0) outOfStock++;
        if (quantity > 0 && quantity < 10) lowStock++;
        
        if (item.expiration_date) {
          const expDate = new Date(item.expiration_date);
          if (expDate <= thirtyDaysFromNow && expDate >= today) expiringSoon++;
        }
      });
    }
    
    setStats({
      totalProducts: productCount || 0,
      totalStockValue: totalValue,
      totalUnits: totalUnits,
      lowStockItems: lowStock,
      outOfStockItems: outOfStock,
      expiringSoon: expiringSoon,
    });
  };

  const fetchTypeStats = async () => {
    // Only fetch types that user has permission to view
    const typesToFetch = permissions.canViewAll 
      ? ['S1', 'Bidding']
      : permissions.allowedTypes;
    
    let s1Stock: any[] | null = null;
    let biddingStock: any[] | null = null;
    
    if (typesToFetch.includes('S1')) {
      let query = supabase
        .from('stock')
        .select(`
          quantity,
          unit_cost,
          status,
          product:product_id (product_id)
        `)
        .eq('product_type', 'S1');
      
      if (permissions.allowedLocationId) {
        query = query.eq('location_id', permissions.allowedLocationId);
      }
      
      const { data } = await query;
      s1Stock = data;
    }
    
    if (typesToFetch.includes('Bidding')) {
      let query = supabase
        .from('stock')
        .select(`
          quantity,
          unit_cost,
          status,
          product:product_id (product_id)
        `)
        .eq('product_type', 'Bidding');
      
      if (permissions.allowedLocationId) {
        query = query.eq('location_id', permissions.allowedLocationId);
      }
      
      const { data } = await query;
      biddingStock = data;
    }
    
    const calculateTypeStats = (stockData: any[] | null, type: string): TypeStats => {
      let totalUnits = 0;
      let totalValue = 0;
      let lowStock = 0;
      let outOfStock = 0;
      const uniqueProducts = new Set();
      
      if (stockData) {
        stockData.forEach((item: any) => {
          const quantity = item.quantity || 0;
          const unitCost = item.unit_cost || 0;
          totalUnits += quantity;
          totalValue += quantity * unitCost;
          
          const product = safeExtract(item.product, null);
          if (product?.product_id) uniqueProducts.add(product.product_id);
          
          if (quantity === 0) outOfStock++;
          if (quantity > 0 && quantity < 10) lowStock++;
        });
      }
      
      return {
        type,
        totalUnits,
        totalValue,
        productCount: uniqueProducts.size,
        stockCount: stockData?.length || 0,
        lowStock,
        outOfStock,
      };
    };
    
    if (s1Stock !== null) setS1Stats(calculateTypeStats(s1Stock, 'S1'));
    if (biddingStock !== null) setBiddingStats(calculateTypeStats(biddingStock, 'Bidding'));
  };

  const fetchWarehouseStocks = async () => {
    let query = supabase
      .from('stock')
      .select(`
        quantity,
        unit_cost,
        product_type,
        location:location_id (warehouse_name, location_id)
      `)
      .not('location', 'is', null);
    
    if (!permissions.canViewAll) {
      if (permissions.allowedTypes.length > 0 && permissions.allowedTypes.length < 2) {
        query = query.in('product_type', permissions.allowedTypes);
      }
      if (permissions.allowedLocationId) {
        query = query.eq('location_id', permissions.allowedLocationId);
      }
    }
    
    const { data } = await query;
    
    const warehouseMap = new Map<string, {
      s1_units: number;
      s1_value: number;
      bidding_units: number;
      bidding_value: number;
    }>();
    
    if (data) {
      (data as any[]).forEach(item => {
        const location = safeExtract(item.location, null);
        const warehouseName = location?.warehouse_name || 'Unknown';
        
        const current = warehouseMap.get(warehouseName) || {
          s1_units: 0,
          s1_value: 0,
          bidding_units: 0,
          bidding_value: 0,
        };
        
        const quantity = item.quantity || 0;
        const value = quantity * (item.unit_cost || 0);
        
        if (item.product_type === 'S1') {
          current.s1_units += quantity;
          current.s1_value += value;
        } else if (item.product_type === 'Bidding') {
          current.bidding_units += quantity;
          current.bidding_value += value;
        }
        
        warehouseMap.set(warehouseName, current);
      });
    }
    
    const warehouseList: WarehouseStock[] = [];
    warehouseMap.forEach((value, key) => {
      warehouseList.push({
        warehouse_name: key,
        s1_units: value.s1_units,
        s1_value: value.s1_value,
        bidding_units: value.bidding_units,
        bidding_value: value.bidding_value,
        total_units: value.s1_units + value.bidding_units,
        total_value: value.s1_value + value.bidding_value,
      });
    });
    
    setWarehouseStocks(warehouseList.sort((a, b) => b.total_value - a.total_value));
  };

  const fetchRecentTransactions = async () => {
    let query = supabase
      .from('transactions')
      .select(`
        transaction_id,
        type,
        reference_no,
        date_created,
        relation:relation_id (name),
        processed_by:processed_by (full_name),
        transaction_item:transaction_item (total)
      `)
      .order('date_created', { ascending: false })
      .limit(10);
    
    const { data } = await query;
    
    const transactions: RecentTransaction[] = [];
    
    if (data) {
      (data as any[]).forEach(t => {
        const relation = safeExtract(t.relation, null);
        const relationName = relation?.name || '—';
        
        const processedBy = safeExtract(t.processed_by, null);
        const processedByName = processedBy?.full_name || 'System';
        
        let totalAmount = 0;
        if (t.transaction_item) {
          if (Array.isArray(t.transaction_item)) {
            totalAmount = t.transaction_item.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
          } else if (t.transaction_item?.total) {
            totalAmount = t.transaction_item.total;
          }
        }
        
        transactions.push({
          transaction_id: t.transaction_id,
          type: t.type,
          reference_no: t.reference_no || '—',
          relation_name: relationName,
          total_amount: totalAmount,
          date_created: t.date_created,
          processed_by_name: processedByName,
        });
      });
    }
    
    setRecentTransactions(transactions);
  };

  const fetchTopProducts = async () => {
    const dateFilter = new Date();
    if (selectedPeriod === 'week') dateFilter.setDate(dateFilter.getDate() - 7);
    else if (selectedPeriod === 'month') dateFilter.setMonth(dateFilter.getMonth() - 1);
    else if (selectedPeriod === 'year') dateFilter.setFullYear(dateFilter.getFullYear() - 1);
    
    // First, get stock IDs that the user has permission to see
    let stockQuery = supabase
      .from('stock')
      .select('stock_id, product_type');
    
    if (!permissions.canViewAll) {
      if (permissions.allowedTypes.length > 0 && permissions.allowedTypes.length < 2) {
        stockQuery = stockQuery.in('product_type', permissions.allowedTypes);
      }
      if (permissions.allowedLocationId) {
        stockQuery = stockQuery.eq('location_id', permissions.allowedLocationId);
      }
    }
    
    const { data: allowedStocks } = await stockQuery;
    const allowedStockIds = allowedStocks?.map(s => s.stock_id) || [];
    
    if (allowedStockIds.length === 0) {
      setTopProducts([]);
      return;
    }
    
    const { data } = await supabase
      .from('transaction_item')
      .select(`
        quantity,
        price,
        total,
        created_at,
        stock:stock_id (
          product:product_id (product_name),
          product_type
        )
      `)
      .eq('movement', 'OUT')
      .in('stock_id', allowedStockIds)
      .gte('created_at', dateFilter.toISOString());
    
    const productMap = new Map<string, {
      product_name: string;
      total_sold: number;
      total_revenue: number;
      product_type: string;
    }>();
    
    if (data) {
      (data as any[]).forEach(item => {
        const stock = safeExtract(item.stock, null);
        let productName = 'Unknown';
        let productType = 'Unknown';
        
        if (stock) {
          const product = safeExtract(stock.product, null);
          productName = product?.product_name || 'Unknown';
          productType = stock.product_type || 'Unknown';
        }
        
        const current = productMap.get(productName) || {
          product_name: productName,
          total_sold: 0,
          total_revenue: 0,
          product_type: productType,
        };
        
        current.total_sold += item.quantity || 0;
        current.total_revenue += item.total || 0;
        productMap.set(productName, current);
      });
    }
    
    const topList = Array.from(productMap.values())
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, 5);
    
    const topWithStock = await Promise.all(topList.map(async (product) => {
      let stockQuery = supabase
        .from('stock')
        .select('quantity')
        .eq('product_id', product.product_name);
      
      if (permissions.allowedLocationId) {
        stockQuery = stockQuery.eq('location_id', permissions.allowedLocationId);
      }
      
      const { data: stockData } = await stockQuery.limit(1);
      const stockRemaining = (stockData && stockData[0]?.quantity) || 0;
      
      return {
        ...product,
        stock_remaining: stockRemaining,
      };
    }));
    
    setTopProducts(topWithStock);
  };

  const fetchStockAlerts = async () => {
    let query = supabase
      .from('stock')
      .select(`
        stock_id,
        quantity,
        status,
        product_type,
        product:product_id (product_name),
        location:location_id (warehouse_name)
      `)
      .or(`quantity.lte.10,status.eq.Out of Stock`)
      .order('quantity', { ascending: true })
      .limit(10);
    
    if (!permissions.canViewAll) {
      if (permissions.allowedTypes.length > 0 && permissions.allowedTypes.length < 2) {
        query = query.in('product_type', permissions.allowedTypes);
      }
      if (permissions.allowedLocationId) {
        query = query.eq('location_id', permissions.allowedLocationId);
      }
    }
    
    const { data } = await query;
    
    const alerts: StockAlert[] = [];
    
    if (data) {
      (data as any[]).forEach(s => {
        const product = safeExtract(s.product, null);
        const productName = product?.product_name || 'Unknown';
        
        const location = safeExtract(s.location, null);
        const locationName = location?.warehouse_name || 'Unknown';
        
        alerts.push({
          stock_id: s.stock_id,
          product_name: productName,
          product_type: s.product_type || 'Unknown',
          quantity: s.quantity || 0,
          location: locationName,
          status: s.status || 'Unknown',
        });
      });
    }
    
    setStockAlerts(alerts);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getProgressPercentage = (current: number, total: number) => {
    if (total === 0) return 0;
    return (current / total) * 100;
  };

  // Get dashboard title based on role
  const getDashboardTitle = () => {
    if (!currentUser) return 'Dashboard';
    switch (currentUser.role_name) {
      case 'Admin': return 'Admin Dashboard';
      case 'Manager': return 'Manager Dashboard';
      case 'Warehouse': return 'Warehouse Dashboard';
      case 'Sales': return 'Sales Dashboard';
      default: return 'Dashboard';
    }
  };

  // Check if user can see type-specific sections
  const canSeeS1 = permissions.canViewAll || permissions.allowedTypes.includes('S1');
  const canSeeBidding = permissions.canViewAll || permissions.allowedTypes.includes('Bidding');

  return (
    <div className="admin-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">{getDashboardTitle()}</h1>
          <p className="dashboard-subtitle">
            Inventory Overview & Analytics
            {currentUser && <span className="user-role-chip">{currentUser.role_name}</span>}
            {permissions.allowedTypes.length === 1 && !permissions.canViewAll && (
              <span className="type-chip">{permissions.allowedTypes[0]} only</span>
            )}
            {permissions.allowedLocationId && !permissions.canViewAll && (
              <span className="location-chip">Warehouse restricted</span>
            )}
          </p>
        </div>
        <div className="dashboard-header-right">
          <span className="dashboard-user">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            {currentUser?.full_name || 'User'}
          </span>
          <span className="dashboard-clock">{currentDateTime.toLocaleString()}</span>
        </div>
      </div>

      {/* Period Selector - Only show for Admin/Manager */}
      {(currentUser?.role_name === 'Admin' || currentUser?.role_name === 'Manager') && (
        <div className="period-selector">
          <button
            className={`period-btn ${selectedPeriod === 'week' ? 'active' : ''}`}
            onClick={() => setSelectedPeriod('week')}
          >
            Last 7 Days
          </button>
          <button
            className={`period-btn ${selectedPeriod === 'month' ? 'active' : ''}`}
            onClick={() => setSelectedPeriod('month')}
          >
            Last 30 Days
          </button>
          <button
            className={`period-btn ${selectedPeriod === 'year' ? 'active' : ''}`}
            onClick={() => setSelectedPeriod('year')}
          >
            Last Year
          </button>
        </div>
      )}

      {loading ? (
        <div className="dashboard-loading">
          <div className="spinner"></div>
          <p>Loading dashboard data...</p>
        </div>
      ) : (
        <>
          {/* Key Metrics */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-icon blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                  <line x1="16" y1="21" x2="16" y2="15"/>
                  <line x1="8" y1="21" x2="8" y2="15"/>
                  <line x1="12" y1="21" x2="12" y2="15"/>
                </svg>
              </div>
              <div className="metric-content">
                <span className="metric-value">{stats.totalProducts}</span>
                <span className="metric-label">Total Products</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon green">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                </svg>
              </div>
              <div className="metric-content">
                <span className="metric-value">{formatCurrency(stats.totalStockValue)}</span>
                <span className="metric-label">Total Stock Value</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon purple">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="12" x2="12" y2="16"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              </div>
              <div className="metric-content">
                <span className="metric-value">{stats.totalUnits.toLocaleString()}</span>
                <span className="metric-label">Total Units</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon orange">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/>
                  <path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/>
                </svg>
              </div>
              <div className="metric-content">
                <span className="metric-value">{stats.lowStockItems}</span>
                <span className="metric-label">Low Stock Items</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon red">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div className="metric-content">
                <span className="metric-value">{stats.outOfStockItems}</span>
                <span className="metric-label">Out of Stock</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon yellow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div className="metric-content">
                <span className="metric-value">{stats.expiringSoon}</span>
                <span className="metric-label">Expiring Soon (30d)</span>
              </div>
            </div>
          </div>

          {/* Type Statistics - S1 vs Bidding (only show types user has permission for) */}
          {(canSeeS1 || canSeeBidding) && (
            <div className="type-stats-section">
              <h2 className="section-title">Product Type Analysis</h2>
              <div className="type-stats-grid">
                {/* S1 Card - only show if user has permission */}
                {canSeeS1 && (
                  <div className="type-card s1-card">
                    <div className="type-header">
                      <div className="type-badge s1">S1</div>
                      <div className="type-value">{formatCurrency(s1Stats.totalValue)}</div>
                    </div>
                    <div className="type-stats">
                      <div className="type-stat-item">
                        <span className="stat-label">Total Units</span>
                        <span className="stat-value">{s1Stats.totalUnits.toLocaleString()}</span>
                      </div>
                      <div className="type-stat-item">
                        <span className="stat-label">Products</span>
                        <span className="stat-value">{s1Stats.productCount}</span>
                      </div>
                      <div className="type-stat-item">
                        <span className="stat-label">Stock Entries</span>
                        <span className="stat-value">{s1Stats.stockCount}</span>
                      </div>
                    </div>
                    <div className="type-progress">
                      <div className="progress-label">Stock Health</div>
                      <div className="progress-bar">
                        <div 
                          className="progress-fill good"
                          style={{ width: `${getProgressPercentage(
                            s1Stats.totalUnits - s1Stats.lowStock - s1Stats.outOfStock,
                            s1Stats.totalUnits
                          )}%` }}
                        />
                        <div 
                          className="progress-fill warning"
                          style={{ width: `${getProgressPercentage(s1Stats.lowStock, s1Stats.totalUnits)}%` }}
                        />
                        <div 
                          className="progress-fill danger"
                          style={{ width: `${getProgressPercentage(s1Stats.outOfStock, s1Stats.totalUnits)}%` }}
                        />
                      </div>
                      <div className="progress-legend">
                        <span><span className="legend-dot good"></span> Good ({s1Stats.totalUnits - s1Stats.lowStock - s1Stats.outOfStock})</span>
                        <span><span className="legend-dot warning"></span> Low ({s1Stats.lowStock})</span>
                        <span><span className="legend-dot danger"></span> Out ({s1Stats.outOfStock})</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bidding Card - only show if user has permission */}
                {canSeeBidding && (
                  <div className="type-card bidding-card">
                    <div className="type-header">
                      <div className="type-badge bidding">Bidding</div>
                      <div className="type-value">{formatCurrency(biddingStats.totalValue)}</div>
                    </div>
                    <div className="type-stats">
                      <div className="type-stat-item">
                        <span className="stat-label">Total Units</span>
                        <span className="stat-value">{biddingStats.totalUnits.toLocaleString()}</span>
                      </div>
                      <div className="type-stat-item">
                        <span className="stat-label">Products</span>
                        <span className="stat-value">{biddingStats.productCount}</span>
                      </div>
                      <div className="type-stat-item">
                        <span className="stat-label">Stock Entries</span>
                        <span className="stat-value">{biddingStats.stockCount}</span>
                      </div>
                    </div>
                    <div className="type-progress">
                      <div className="progress-label">Stock Health</div>
                      <div className="progress-bar">
                        <div 
                          className="progress-fill good"
                          style={{ width: `${getProgressPercentage(
                            biddingStats.totalUnits - biddingStats.lowStock - biddingStats.outOfStock,
                            biddingStats.totalUnits
                          )}%` }}
                        />
                        <div 
                          className="progress-fill warning"
                          style={{ width: `${getProgressPercentage(biddingStats.lowStock, biddingStats.totalUnits)}%` }}
                        />
                        <div 
                          className="progress-fill danger"
                          style={{ width: `${getProgressPercentage(biddingStats.outOfStock, biddingStats.totalUnits)}%` }}
                        />
                      </div>
                      <div className="progress-legend">
                        <span><span className="legend-dot good"></span> Good ({biddingStats.totalUnits - biddingStats.lowStock - biddingStats.outOfStock})</span>
                        <span><span className="legend-dot warning"></span> Low ({biddingStats.lowStock})</span>
                        <span><span className="legend-dot danger"></span> Out ({biddingStats.outOfStock})</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Warehouse Distribution - show for all but filtered by permissions */}
          {warehouseStocks.length > 0 && (
            <div className="warehouse-section">
              <h2 className="section-title">Warehouse Stock Distribution</h2>
              <div className="warehouse-grid">
                {warehouseStocks.map(warehouse => (
                  <div key={warehouse.warehouse_name} className="warehouse-card">
                    <div className="warehouse-header">
                      <div className="warehouse-name">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                          <polyline points="9 22 9 12 15 12 15 22"/>
                        </svg>
                        {warehouse.warehouse_name}
                      </div>
                      <div className="warehouse-total">{formatCurrency(warehouse.total_value)}</div>
                    </div>
                    <div className="warehouse-stats">
                      {canSeeS1 && (
                        <div className="warehouse-stat">
                          <div className="stat-type s1">S1</div>
                          <div className="stat-info">
                            <span>{warehouse.s1_units.toLocaleString()} units</span>
                            <span>{formatCurrency(warehouse.s1_value)}</span>
                          </div>
                          <div className="stat-bar">
                            <div 
                              className="stat-bar-fill s1"
                              style={{ width: `${(warehouse.s1_value / warehouse.total_value) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {canSeeBidding && (
                        <div className="warehouse-stat">
                          <div className="stat-type bidding">Bidding</div>
                          <div className="stat-info">
                            <span>{warehouse.bidding_units.toLocaleString()} units</span>
                            <span>{formatCurrency(warehouse.bidding_value)}</span>
                          </div>
                          <div className="stat-bar">
                            <div 
                              className="stat-bar-fill bidding"
                              style={{ width: `${(warehouse.bidding_value / warehouse.total_value) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Two Column Layout */}
          <div className="two-column-layout">
            {/* Recent Transactions */}
            <div className="recent-transactions">
              <h2 className="section-title">Recent Transactions</h2>
              <div className="transactions-list">
                {recentTransactions.map(txn => (
                  <div key={txn.transaction_id} className="transaction-item">
                    <div className="transaction-type">
                      <span className={`type-badge ${txn.type.toLowerCase()}`}>
                        {txn.type}
                      </span>
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
            </div>

            {/* Top Products */}
            <div className="top-products">
              <h2 className="section-title">Top Selling Products</h2>
              <div className="products-list">
                {topProducts.map((product, index) => (
                  <div key={product.product_name} className="product-item">
                    <div className="product-rank">#{index + 1}</div>
                    <div className="product-info">
                      <div className="product-name">
                        {product.product_name}
                        <span className={`product-type-badge ${product.product_type.toLowerCase()}`}>
                          {product.product_type}
                        </span>
                      </div>
                      <div className="product-stats">
                        <span>Sold: {product.total_sold.toLocaleString()}</span>
                        <span>Revenue: {formatCurrency(product.total_revenue)}</span>
                        <span>Stock Left: {product.stock_remaining.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stock Alerts */}
          {stockAlerts.length > 0 && (
            <div className="alerts-section">
              <h2 className="section-title">Stock Alerts</h2>
              <div className="alerts-grid">
                {stockAlerts.map(alert => (
                  <div key={alert.stock_id} className={`alert-card ${alert.quantity === 0 ? 'critical' : 'warning'}`}>
                    <div className="alert-icon">
                      {alert.quantity === 0 ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="12" y1="8" x2="12" y2="12"/>
                          <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/>
                          <path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/>
                        </svg>
                      )}
                    </div>
                    <div className="alert-content">
                      <div className="alert-title">{alert.product_name}</div>
                      <div className="alert-details">
                        <span className={`alert-type ${alert.product_type.toLowerCase()}`}>{alert.product_type}</span>
                        <span>Quantity: {alert.quantity}</span>
                        <span>Location: {alert.location}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}