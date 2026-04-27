import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import './ViewStockPage.css';

// ── Types ──────────────────────────────────────────────────────────────────────
interface StockRow {
  stock_id: number;
  product_id: number;
  location_id: number | null;
  product_type: string | null;
  quantity: number;
  unit_cost: number;
  expiration_date: string | null;
  status: string;
  date_created: string;
  product: {
    product_name: string;
    barcode: string | null;
    category: string | null;
    unit: string | null;
    status: string;
  } | null;
  location: {
    location_id: number;
    warehouse_name: string;
    floor: string | null;
    shelf: string | null;
    tray: string | null;
    status?: string;
  } | null;
}

interface Product {
  product_id: number;
  product_name: string;
  barcode: string | null;
  category: string | null;
  unit: string | null;
}

interface TransactionItem {
  stock_id: number;
  product_id?: number;
  product_name: string;
  barcode?: string | null;
  quantity: number;
  price: number;
  total: number;
  expiration_date: string | null;
  availableQuantity: number;
  location_label?: string;
  isNewStock?: boolean;
}

interface Relation {
  relation_id: number;
  name: string;
  relation_type: string;
}

interface Location {
  location_id: number;
  warehouse_name: string;
  floor: string | null;
  shelf: string | null;
  tray: string | null;
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

type SortKey = 'product_name' | 'stock_id' | 'date_created';
type SortDir = 'asc' | 'desc';
type TypeFilter = 'All' | 'S1' | 'Bidding';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const STATUS_COLOR: Record<string, string> = {
  Available: 'status-active',
  'Out of Stock': 'status-inactive',
  Reserved: 'status-reserved',
  Expired: 'status-expired',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatDate = (d: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const locationStr = (s: StockRow) => {
  const l = s.location;
  if (!l) return '—';
  return [l.warehouse_name, l.floor && `Floor ${l.floor}`, l.shelf && `Shelf ${l.shelf}`, l.tray && `Tray ${l.tray}`]
    .filter(Boolean).join(' › ');
};

const locationLabel = (l: StockRow['location']) => {
  if (!l) return '—';
  return [l.warehouse_name, l.floor && `Floor ${l.floor}`, l.shelf && `Shelf ${l.shelf}`, l.tray && `Tray ${l.tray}`]
    .filter(Boolean).join(' › ');
};

// FEFO sort: nearest expiry first, null last
const fefoSort = (a: StockRow, b: StockRow) => {
  if (!a.expiration_date && !b.expiration_date) return 0;
  if (!a.expiration_date) return 1;
  if (!b.expiration_date) return -1;
  return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function ViewStockPage() {
  const { user: authUser } = useAuth();

  // ── Data ────────────────────────────────────────────────────────────────────
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [filtered, setFiltered] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Current User & Permissions ───────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [permissions, setPermissions] = useState({
    canViewAll: false,
    allowedTypes: [] as string[],
    allowedLocationId: null as number | null,
    canOnlySalesOut: false,
    canDoStockIn: false,
    canDoTransfer: false,
    canDoReturn: false,
  });

  // ── Filters / Sort ───────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [hideInactive, setHideInactive] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('All');
  const [sortKey, setSortKey] = useState<SortKey>('date_created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // ── Pagination ───────────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const startItem = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, filtered.length);

  // ── Modals ───────────────────────────────────────────────────────────────────
  const [viewStock, setViewStock] = useState<StockRow | null>(null);

  // Product batch view
  const [viewProduct, setViewProduct] = useState<{ product_id: number; name: string } | null>(null);
  const [productBatches, setProductBatches] = useState<StockRow[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  // Edit modal
  const [editStock, setEditStock] = useState<StockRow | null>(null);
  const [editForm, setEditForm] = useState({ quantity: '', unit_cost: '', product_type: '', expiration_date: '', status: '' });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Transaction modal
  const [transactionMode, setTransactionMode] = useState<'IN' | 'OUT' | 'TRANSFER' | 'RETURN' | null>(null);
  const [transactionItems, setTransactionItems] = useState<TransactionItem[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [targetLocationId, setTargetLocationId] = useState('');
  const [selectedRelationId, setSelectedRelationId] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [transactionSuccess, setTransactionSuccess] = useState<string | null>(null);

  // Add item sub-modal (for transactions)
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProductStock, setSelectedProductStock] = useState<StockRow[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [addItemQty, setAddItemQty] = useState('');
  const [addItemPrice, setAddItemPrice] = useState('');
  const [addItemExpiry, setAddItemExpiry] = useState('');

  // Invoice modal
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState<TransactionItem[]>([]);
  const [invoiceCustomerId, setInvoiceCustomerId] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceSuccess, setInvoiceSuccess] = useState<string | null>(null);

  // Add to invoice sub-modal
  const [showAddInvoiceItem, setShowAddInvoiceItem] = useState(false);
  const [invoiceSelectedProductId, setInvoiceSelectedProductId] = useState('');
  const [invoiceSelectedProductStock, setInvoiceSelectedProductStock] = useState<StockRow[]>([]);
  const [invoiceSelectedBatchId, setInvoiceSelectedBatchId] = useState('');
  const [addInvoiceQty, setAddInvoiceQty] = useState('');
  const [addInvoicePrice, setAddInvoicePrice] = useState('');

  // Relations
  const [suppliers, setSuppliers] = useState<Relation[]>([]);
  const [customers, setCustomers] = useState<Relation[]>([]);

  // Global toast
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  // ── Init ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authUser) loadUserPermissions(authUser);
    fetchRelations();
    fetchLocations();
    fetchProducts();
  }, [authUser]);

  useEffect(() => { fetchAll(); }, [permissions]);
  useEffect(() => { applyFilters(); }, [stocks, search, sortKey, sortDir, hideInactive, typeFilter]);
  useEffect(() => { setCurrentPage(1); }, [search, sortKey, sortDir, hideInactive, typeFilter, pageSize]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Load permissions from AuthContext user ────────────────────────────────────
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

    if (roleName === 'Admin') {
      setPermissions({ 
        canViewAll: true, 
        allowedTypes: ['S1', 'Bidding'], 
        allowedLocationId: null, 
        canOnlySalesOut: false, 
        canDoStockIn: true, 
        canDoTransfer: true, 
        canDoReturn: true 
      });
    } 
    else if (roleName === 'Manager') {
      setPermissions({ 
        canViewAll: false, 
        allowedTypes: assignedType ? [assignedType] : ['S1', 'Bidding'], 
        allowedLocationId: null, 
        canOnlySalesOut: false, 
        canDoStockIn: true, 
        canDoTransfer: true, 
        canDoReturn: true 
      });
    } 
    else if (roleName === 'Warehouse') {
      setPermissions({ 
        canViewAll: false, 
        allowedTypes: assignedType ? [assignedType] : ['S1', 'Bidding'], 
        allowedLocationId: assignedLocationId, 
        canOnlySalesOut: false, 
        canDoStockIn: true, 
        canDoTransfer: true, 
        canDoReturn: true 
      });
    } 
    else if (roleName === 'Sales') {
      setPermissions({ 
        canViewAll: false, 
        allowedTypes: assignedType ? [assignedType] : ['S1', 'Bidding'], 
        allowedLocationId: null, 
        canOnlySalesOut: true, 
        canDoStockIn: false, 
        canDoTransfer: false, 
        canDoReturn: true 
      });
    } 
    else {
      setPermissions({ 
        canViewAll: false, 
        allowedTypes: [], 
        allowedLocationId: null, 
        canOnlySalesOut: false, 
        canDoStockIn: false, 
        canDoTransfer: false, 
        canDoReturn: false 
      });
    }
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────────
  const fetchAll = async () => {
    setLoading(true);
    let query = supabase
      .from('stock')
      .select(`
        stock_id, product_id, location_id, product_type, quantity, unit_cost,
        expiration_date, status, date_created,
        product:product_id ( product_name, barcode, category, unit, status ),
        location:location_id ( location_id, warehouse_name, floor, shelf, tray, status )
      `);

    if (!permissions.canViewAll) {
      if (permissions.allowedTypes.length > 0 && permissions.allowedTypes.length < 2) {
        query = query.in('product_type', permissions.allowedTypes);
      }
      if (permissions.allowedLocationId) {
        query = query.eq('location_id', permissions.allowedLocationId);
      }
    }

    query = query.eq('product.status', 'Active');
    
    const { data, error } = await query.order('date_created', { ascending: false });
    
    if (!error && data) {
      setStocks(data as unknown as StockRow[]);
    } else if (error) {
      console.error('Error fetching stocks:', error);
    }
    
    setLoading(false);
  };

  const fetchProducts = async () => {
    let query = supabase
      .from('product')
      .select('product_id, product_name, barcode, category, unit')
      .eq('status', 'Active')
      .order('product_name');
    
    const { data } = await query;
    if (data) setProducts(data as Product[]);
  };

  const fetchRelations = async () => {
    const { data } = await supabase.from('relations').select('relation_id, name, relation_type').eq('status', 'Active').order('name');
    if (data) {
      setSuppliers(data.filter((r: any) => r.relation_type === 'Supplier' || r.relation_type === 'Both') as Relation[]);
      setCustomers(data.filter((r: any) => r.relation_type === 'Customer' || r.relation_type === 'Both') as Relation[]);
    }
  };

  const fetchLocations = async () => {
    let query = supabase
      .from('location')
      .select('location_id, warehouse_name, floor, shelf, tray')
      .eq('status', 'Active')
      .order('warehouse_name');
    
    if (permissions.allowedLocationId && !permissions.canViewAll) {
      query = query.eq('location_id', permissions.allowedLocationId);
    }
    
    const { data } = await query;
    if (data) setLocations(data as Location[]);
  };

  const fetchProductBatches = async (productId: number) => {
    setBatchLoading(true);
    let query = supabase
      .from('stock')
      .select(`
        stock_id, product_id, location_id, product_type, quantity, unit_cost,
        expiration_date, status, date_created,
        product:product_id(product_name, barcode, category, unit, status),
        location:location_id(location_id, warehouse_name, floor, shelf, tray)
      `)
      .eq('product_id', productId);
    
    if (!permissions.canViewAll) {
      if (permissions.allowedTypes.length > 0 && permissions.allowedTypes.length < 2) {
        query = query.in('product_type', permissions.allowedTypes);
      }
      if (permissions.allowedLocationId) {
        query = query.eq('location_id', permissions.allowedLocationId);
      }
    }
    
    const { data } = await query;
    if (data) setProductBatches((data as unknown as StockRow[]).sort(fefoSort));
    setBatchLoading(false);
  };

  // ── Filters ───────────────────────────────────────────────────────────────────
  const applyFilters = () => {
    let res = [...stocks];
    if (typeFilter !== 'All') res = res.filter(r => r.product_type === typeFilter);
    if (hideInactive) res = res.filter(r => r.status !== 'Out of Stock' && r.product?.status !== 'Inactive');
    if (search.trim()) {
      const s = search.toLowerCase();
      res = res.filter(r =>
        r.product?.product_name?.toLowerCase().includes(s) ||
        r.product?.barcode?.toLowerCase().includes(s) ||
        r.product?.category?.toLowerCase().includes(s) ||
        r.location?.warehouse_name?.toLowerCase().includes(s)
      );
    }
    res.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'product_name') cmp = (a.product?.product_name ?? '').localeCompare(b.product?.product_name ?? '');
      else if (sortKey === 'stock_id') cmp = a.stock_id - b.stock_id;
      else cmp = new Date(a.date_created).getTime() - new Date(b.date_created).getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });
    setFiltered(res);
  };

  // ── Stats & pagination helpers ─────────────────────────────────────────────────
  const totalQty = filtered.reduce((s, r) => s + (r.quantity ?? 0), 0);
  const lowCount = filtered.filter(r => r.quantity > 0 && r.quantity < 10).length;
  const outCount = filtered.filter(r => r.quantity === 0).length;
  const isFilterActive = hideInactive || sortKey !== 'date_created' || sortDir !== 'desc' || typeFilter !== 'All';

  const sortLabel: Record<string, string> = {
    'product_name-asc': 'Name A → Z', 'product_name-desc': 'Name Z → A',
    'stock_id-asc': 'ID Ascending', 'stock_id-desc': 'ID Descending',
    'date_created-desc': 'Date Newest', 'date_created-asc': 'Date Oldest',
  };

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

  const getQtyClass = (qty: number) => qty === 0 ? 'qty-zero' : qty < 10 ? 'qty-low' : 'qty-ok';

  const showGlobalSuccess = (msg: string) => {
    setGlobalSuccess(msg);
    setTimeout(() => setGlobalSuccess(null), 3000);
  };

  // ── Edit stock ────────────────────────────────────────────────────────────────
  const openEdit = (s: StockRow) => {
    setEditStock(s);
    setEditError(null);
    setEditForm({ quantity: String(s.quantity), unit_cost: String(s.unit_cost), product_type: s.product_type ?? '', expiration_date: s.expiration_date ?? '', status: s.status });
  };

  const handleEditSave = async () => {
    if (!editStock) return;
    setEditLoading(true); setEditError(null);
    const { error } = await supabase.from('stock').update({
      quantity: Number(editForm.quantity),
      unit_cost: Number(editForm.unit_cost),
      product_type: editForm.product_type || null,
      expiration_date: editForm.expiration_date || null,
      status: editForm.status,
    }).eq('stock_id', editStock.stock_id);
    setEditLoading(false);
    if (error) { setEditError(error.message); return; }
    setEditStock(null);
    if (viewProduct) fetchProductBatches(viewProduct.product_id);
    fetchAll();
    showGlobalSuccess('Stock updated successfully!');
  };

  // ── Product batch view ────────────────────────────────────────────────────────
  const openViewProduct = (s: StockRow) => {
    const name = s.product?.product_name ?? 'Product';
    setViewProduct({ product_id: s.product_id, name });
    fetchProductBatches(s.product_id);
  };

  // ── Transaction ───────────────────────────────────────────────────────────────
  const openTransaction = (mode: 'IN' | 'OUT' | 'TRANSFER' | 'RETURN') => {
    if (mode === 'IN' && !permissions.canDoStockIn) {
      showGlobalSuccess('You do not have permission to do Stock In');
      return;
    }
    if (mode === 'TRANSFER' && !permissions.canDoTransfer) {
      showGlobalSuccess('You do not have permission to do Transfer');
      return;
    }
    
    setTransactionMode(mode);
    setTransactionItems([]);
    setSelectedLocationId('');
    setSourceLocationId('');
    setTargetLocationId('');
    setSelectedRelationId('');
    setReferenceNo('');
    setTransactionError(null);
    setTransactionSuccess(null);
  };

  // Get available batches for a product based on filters
  const getAvailableBatchesForProduct = (productId: number) => {
    let batches = stocks.filter(s => s.product_id === productId && s.quantity > 0 && s.status !== 'Out of Stock');
    
    // For TRANSFER mode, filter by source location
    if (transactionMode === 'TRANSFER' && sourceLocationId) {
      batches = batches.filter(s => s.location_id === Number(sourceLocationId));
    }
    
    return batches.sort(fefoSort);
  };

  // Handle product selection in transaction modal
  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
    
    // For Stock In or Return, we don't need to show batches
    if (transactionMode === 'IN' || transactionMode === 'RETURN') {
      setSelectedProductStock([]);
      setSelectedBatchId('');
      setAddItemQty('');
      const product = products.find(p => p.product_id === Number(productId));
      if (product) {
        setAddItemPrice(''); // Let user enter price
      }
      return;
    }
    
    // For OUT and TRANSFER, show available batches
    const batches = getAvailableBatchesForProduct(Number(productId));
    setSelectedProductStock(batches);
    setSelectedBatchId('');
    setAddItemQty('');
    const product = products.find(p => p.product_id === Number(productId));
    if (product) {
      const defaultPrice = batches.length > 0 ? batches[0].unit_cost : 0;
      setAddItemPrice(String(defaultPrice));
    }
  };

  // Handle batch selection
  const handleBatchSelect = (batchId: string) => {
    setSelectedBatchId(batchId);
    const batch = selectedProductStock.find(b => b.stock_id === Number(batchId));
    if (batch) {
      setAddItemPrice(String(batch.unit_cost));
    }
  };

  const confirmAddItem = () => {
    // For Stock In or Return, we don't need an existing batch
    if (transactionMode === 'IN' || transactionMode === 'RETURN') {
      if (!selectedProductId) {
        setTransactionError('Please select a product.');
        return;
      }
      
      const qty = Number(addItemQty);
      if (!qty || qty <= 0) { 
        setTransactionError('Enter a valid quantity.'); 
        return; 
      }
      
      const price = Number(addItemPrice);
      if (!price || price <= 0) {
        setTransactionError('Enter a valid price.');
        return;
      }
      
      const product = products.find(p => p.product_id === Number(selectedProductId));
      if (!product) {
        setTransactionError('Product not found.');
        return;
      }
      
      // For Stock In, we create a temporary item without a stock_id (will be created in transaction)
      const tempId = -Date.now(); // Temporary negative ID for new items
      setTransactionItems(prev => [...prev, { 
        stock_id: tempId,
        product_id: product.product_id,
        product_name: product.product_name, 
        barcode: product.barcode ?? null, 
        quantity: qty, 
        price: price, 
        total: qty * price, 
        expiration_date: addItemExpiry || null, 
        availableQuantity: 999999, // No limit for new stock
        location_label: 'New Stock',
        isNewStock: true
      }]);
      
      // Reset form
      setSelectedProductId('');
      setAddItemQty('');
      setAddItemPrice('');
      setAddItemExpiry('');
      setShowAddItem(false);
      setTransactionError(null);
      return;
    }
    
    // For OUT and TRANSFER, we need an existing batch
    if (!selectedBatchId) {
      setTransactionError('Please select a batch.');
      return;
    }
    
    const batch = selectedProductStock.find(b => b.stock_id === Number(selectedBatchId));
    if (!batch) {
      setTransactionError('Batch not found.');
      return;
    }
    
    const qty = Number(addItemQty);
    if (!qty || qty <= 0) { 
      setTransactionError('Enter a valid quantity.'); 
      return; 
    }
    
    if (qty > batch.quantity) {
      setTransactionError(`Not enough stock. Available: ${batch.quantity}`); 
      return; 
    }
    
    const price = Number(addItemPrice) || batch.unit_cost;
    const existing = transactionItems.findIndex(i => i.stock_id === batch.stock_id);
    
    if (existing >= 0) {
      const newQty = transactionItems[existing].quantity + qty;
      if (newQty > batch.quantity) {
        setTransactionError(`Total would exceed available stock (${batch.quantity}).`); 
        return; 
      }
      setTransactionItems(prev => prev.map((i, idx) => idx === existing ? { ...i, quantity: newQty, total: newQty * i.price } : i));
    } else {
      setTransactionItems(prev => [...prev, { 
        stock_id: batch.stock_id, 
        product_id: batch.product_id, 
        product_name: batch.product?.product_name ?? 'Unknown', 
        barcode: batch.product?.barcode ?? null, 
        quantity: qty, 
        price, 
        total: qty * price, 
        expiration_date: batch.expiration_date, 
        availableQuantity: batch.quantity,
        location_label: locationLabel(batch.location),
        isNewStock: false
      }]);
    }
    
    // Reset form
    setSelectedProductId('');
    setSelectedProductStock([]);
    setSelectedBatchId('');
    setAddItemQty('');
    setShowAddItem(false);
    setTransactionError(null);
  };

  const openAddItemModal = () => {
    setSelectedProductId('');
    setSelectedProductStock([]);
    setSelectedBatchId('');
    setAddItemQty('');
    setAddItemPrice('');
    setAddItemExpiry('');
    setShowAddItem(true);
  };

  const submitTransaction = async () => {
    if (transactionItems.length === 0) { setTransactionError('Add at least one item.'); return; }
    if ((transactionMode === 'IN' || transactionMode === 'RETURN') && !selectedLocationId) { setTransactionError('Select a destination location.'); return; }
    if (transactionMode === 'TRANSFER' && (!sourceLocationId || !targetLocationId)) { setTransactionError('Select source and destination locations.'); return; }

    setTransactionLoading(true); setTransactionError(null);
    const txType = transactionMode === 'IN' ? 'PURCHASE' : transactionMode === 'OUT' ? 'SALE' : transactionMode === 'TRANSFER' ? 'TRANSFER' : 'RETURN';

    const { data: txn, error: txnErr } = await supabase.from('transactions')
      .insert([{ type: txType, relation_id: selectedRelationId ? Number(selectedRelationId) : null, processed_by: currentUser?.user_id ?? null, reference_no: referenceNo || null }])
      .select('transaction_id').single();

    if (txnErr || !txn) { setTransactionError(txnErr?.message ?? 'Failed to create transaction.'); setTransactionLoading(false); return; }

    let hasError = false;
    for (const item of transactionItems) {
      let stockId = item.stock_id;

      if (transactionMode === 'IN' || transactionMode === 'RETURN') {
        // For new items (temp negative ID), create new stock
        if (item.isNewStock || item.stock_id < 0) {
          const { data: ns, error: nsErr } = await supabase.from('stock')
            .insert([{ 
              product_id: item.product_id, 
              location_id: Number(selectedLocationId), 
              product_type: null, 
              quantity: item.quantity, 
              unit_cost: item.price, 
              expiration_date: item.expiration_date || null, 
              status: 'Available' 
            }])
            .select('stock_id').single();
          if (nsErr || !ns) { 
            setTransactionError(`Failed to create stock batch: ${nsErr?.message}`); 
            hasError = true; 
            break; 
          }
          stockId = ns.stock_id;
        } else {
          // Update existing stock
          const { data: ns, error: nsErr } = await supabase.from('stock')
            .insert([{ 
              product_id: item.product_id, 
              location_id: Number(selectedLocationId), 
              product_type: null, 
              quantity: 0, 
              unit_cost: item.price, 
              expiration_date: item.expiration_date || null, 
              status: 'Available' 
            }])
            .select('stock_id').single();
          if (nsErr || !ns) { 
            setTransactionError(`Failed to create stock batch: ${nsErr?.message}`); 
            hasError = true; 
            break; 
          }
          stockId = ns.stock_id;
        }

        const movement = 'IN';
        const { error: itemErr } = await supabase.from('transaction_item').insert([{ transaction_id: txn.transaction_id, stock_id: stockId, movement, quantity: item.quantity, price: item.price, total: item.total }]);
        if (itemErr) { setTransactionError(itemErr.message); hasError = true; break; }
      } 
      else if (transactionMode === 'TRANSFER') {
        const originalStock = stocks.find(s => s.stock_id === item.stock_id);
        const { data: ns, error: nsErr } = await supabase.from('stock')
          .insert([{ product_id: item.product_id, location_id: Number(targetLocationId), product_type: originalStock?.product_type ?? null, quantity: 0, unit_cost: item.price, expiration_date: originalStock?.expiration_date ?? null, status: 'Available' }])
          .select('stock_id').single();
        if (nsErr || !ns) { setTransactionError(`Transfer batch create failed: ${nsErr?.message}`); hasError = true; break; }

        const { error: outErr } = await supabase.from('transaction_item').insert([{ transaction_id: txn.transaction_id, stock_id: item.stock_id, movement: 'OUT', quantity: item.quantity, price: item.price, total: item.total }]);
        if (outErr) { setTransactionError(outErr.message.includes('Not enough') ? `Not enough stock for ${item.product_name}.` : outErr.message); hasError = true; break; }

        const { error: inErr } = await supabase.from('transaction_item').insert([{ transaction_id: txn.transaction_id, stock_id: ns.stock_id, movement: 'IN', quantity: item.quantity, price: item.price, total: item.total }]);
        if (inErr) { setTransactionError(inErr.message); hasError = true; break; }
      } 
      else if (transactionMode === 'OUT') {
        const movement = 'OUT';
        const { error: itemErr } = await supabase.from('transaction_item').insert([{ transaction_id: txn.transaction_id, stock_id: item.stock_id, movement, quantity: item.quantity, price: item.price, total: item.total }]);
        if (itemErr) { setTransactionError(itemErr.message.includes('Not enough') ? `Not enough stock for ${item.product_name}.` : itemErr.message); hasError = true; break; }
      }
    }

    setTransactionLoading(false);
    if (!hasError) {
      setTransactionSuccess(`${transactionMode} completed successfully!`);
      fetchAll();
      setTimeout(() => { setTransactionMode(null); setTransactionSuccess(null); showGlobalSuccess(`${transactionMode} transaction saved!`); }, 1800);
    }
  };

  // ── Invoice ───────────────────────────────────────────────────────────────────
  const openInvoice = () => {
    setShowInvoice(true);
    setInvoiceItems([]);
    setInvoiceCustomerId('');
    setInvoiceRef('');
    setInvoiceError(null);
    setInvoiceSuccess(null);
  };

  const getInvoiceAvailableBatches = (productId: number) => {
    return stocks.filter(s => s.product_id === productId && s.quantity > 0 && s.status !== 'Out of Stock').sort(fefoSort);
  };

  const handleInvoiceProductSelect = (productId: string) => {
    setInvoiceSelectedProductId(productId);
    const batches = getInvoiceAvailableBatches(Number(productId));
    setInvoiceSelectedProductStock(batches);
    setInvoiceSelectedBatchId('');
    setAddInvoiceQty('');
    const product = products.find(p => p.product_id === Number(productId));
    if (product && batches.length > 0) {
      setAddInvoicePrice(String(batches[0].unit_cost));
    }
  };

  const handleInvoiceBatchSelect = (batchId: string) => {
    setInvoiceSelectedBatchId(batchId);
    const batch = invoiceSelectedProductStock.find(b => b.stock_id === Number(batchId));
    if (batch) {
      setAddInvoicePrice(String(batch.unit_cost));
    }
  };

  const openAddInvoiceItem = () => {
    setInvoiceSelectedProductId('');
    setInvoiceSelectedProductStock([]);
    setInvoiceSelectedBatchId('');
    setAddInvoiceQty('');
    setAddInvoicePrice('');
    setShowAddInvoiceItem(true);
  };

  const confirmAddInvoiceItem = () => {
    if (!invoiceSelectedBatchId) {
      setInvoiceError('Please select a batch.');
      return;
    }
    
    const batch = invoiceSelectedProductStock.find(b => b.stock_id === Number(invoiceSelectedBatchId));
    if (!batch) {
      setInvoiceError('Batch not found.');
      return;
    }
    
    const qty = Number(addInvoiceQty);
    const price = Number(addInvoicePrice);
    
    if (!qty || qty <= 0) { 
      setInvoiceError('Enter a valid quantity.'); 
      return; 
    }
    if (qty > batch.quantity) { 
      setInvoiceError(`Not enough stock. Available: ${batch.quantity}`); 
      return; 
    }
    
    const existing = invoiceItems.findIndex(i => i.stock_id === batch.stock_id);
    if (existing >= 0) {
      const newQty = invoiceItems[existing].quantity + qty;
      if (newQty > batch.quantity) { 
        setInvoiceError(`Total would exceed available stock (${batch.quantity}).`); 
        return; 
      }
      setInvoiceItems(prev => prev.map((i, idx) => idx === existing ? { ...i, quantity: newQty, total: newQty * i.price } : i));
    } else {
      setInvoiceItems(prev => [...prev, { 
        stock_id: batch.stock_id, 
        product_id: batch.product_id,
        product_name: batch.product?.product_name ?? 'Unknown', 
        barcode: batch.product?.barcode ?? null,
        quantity: qty, 
        price, 
        total: qty * price, 
        expiration_date: batch.expiration_date, 
        availableQuantity: batch.quantity,
        isNewStock: false
      }]);
    }
    
    setInvoiceSelectedProductId('');
    setInvoiceSelectedProductStock([]);
    setInvoiceSelectedBatchId('');
    setAddInvoiceQty('');
    setShowAddInvoiceItem(false);
    setInvoiceError(null);
  };

  const updateInvoiceItem = (stockId: number, qty: number, price: number) => {
    const avail = invoiceItems.find(i => i.stock_id === stockId)?.availableQuantity ?? 0;
    if (qty > avail) { setInvoiceError(`Not enough stock. Available: ${avail}`); return; }
    setInvoiceItems(prev => prev.map(i => i.stock_id === stockId ? { ...i, quantity: qty, price, total: qty * price } : i));
    setInvoiceError(null);
  };

  const invoiceTotal = invoiceItems.reduce((s, i) => s + i.total, 0);

  const generateInvoicePDF = async (refNo: string) => {
    if (!(window as any).jspdf) {
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload = () => res(); s.onerror = () => rej();
        document.head.appendChild(s);
      });
    }
    if (!(window as any).jspdfAutoTable) {
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
        s.onload = () => res(); s.onerror = () => rej();
        document.head.appendChild(s);
      });
    }
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    const customer = customers.find(c => c.relation_id === Number(invoiceCustomerId));
    const now = new Date();

    doc.setFillColor(27, 60, 83);
    doc.rect(0, 0, 210, 38, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22); doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', 14, 20);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Ref: ${refNo}`, 14, 30);
    doc.text(`Date: ${now.toLocaleDateString()}`, 120, 20);
    doc.text(`SurgiCode Trading Corporation`, 120, 28);

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('CUSTOMER', 14, 48);
    doc.setFont('helvetica', 'normal');
    doc.text(customer?.name ?? '—', 14, 55);
    doc.setFont('helvetica', 'bold');
    doc.text('PROCESSED BY', 120, 48);
    doc.setFont('helvetica', 'normal');
    doc.text(currentUser?.full_name ?? '—', 120, 55);

    const rows = invoiceItems.map((item, i) => [
      i + 1, item.product_name, item.barcode ?? '—',
      item.expiration_date ? formatDate(item.expiration_date) : '—',
      item.quantity, `₱${item.price.toFixed(2)}`, `₱${item.total.toFixed(2)}`,
    ]);

    (doc as any).autoTable({
      startY: 65,
      head: [['#', 'Product', 'Barcode', 'Expiry', 'Qty', 'Unit Price', 'Total']],
      body: rows,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [27, 60, 83], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 247, 250] },
      columnStyles: { 0: { cellWidth: 10 }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFillColor(27, 60, 83);
    doc.rect(120, finalY, 76, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('GRAND TOTAL', 124, finalY + 8);
    doc.text(`₱${invoiceTotal.toFixed(2)}`, 190, finalY + 8, { align: 'right' });

    doc.setTextColor(150, 160, 170);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text('Thank you for your business.', 14, 285);
    doc.text(`Generated: ${now.toLocaleString()}`, 14, 289);
    doc.save(`invoice-${refNo}.pdf`);
  };

  const createInvoice = async () => {
    if (invoiceItems.length === 0) { setInvoiceError('Add at least one item.'); return; }
    if (!invoiceCustomerId) { setInvoiceError('Select a customer.'); return; }
    setInvoiceLoading(true); setInvoiceError(null);
    const refNo = invoiceRef || `INV-${Date.now()}`;
    const { data: txn, error: txnErr } = await supabase.from('transactions')
      .insert([{ type: 'SALE', relation_id: Number(invoiceCustomerId), processed_by: currentUser?.user_id ?? null, reference_no: refNo }])
      .select('transaction_id').single();
    if (txnErr || !txn) { setInvoiceError(txnErr?.message ?? 'Failed to create invoice.'); setInvoiceLoading(false); return; }

    let hasError = false;
    for (const item of invoiceItems) {
      const { error: itemErr } = await supabase.from('transaction_item').insert([{ transaction_id: txn.transaction_id, stock_id: item.stock_id, movement: 'OUT', quantity: item.quantity, price: item.price, total: item.total }]);
      if (itemErr) { setInvoiceError(`Error on ${item.product_name}: ${itemErr.message}`); hasError = true; break; }
    }

    setInvoiceLoading(false);
    if (!hasError) {
      await generateInvoicePDF(refNo);
      setInvoiceSuccess('Invoice created and PDF downloaded!');
      fetchAll();
      setTimeout(() => { setShowInvoice(false); setInvoiceSuccess(null); showGlobalSuccess('Invoice created!'); }, 2000);
    }
  };

  // ── CSV Export ────────────────────────────────────────────────────────────────
  const exportToCSV = () => {
    const headers = ['Stock ID', 'Product', 'Barcode', 'Category', 'Location', 'Type', 'Quantity', 'Unit Cost', 'Total Value', 'Status', 'Expiry Date', 'Date Created'];
    
    const rows = filtered.map(s => [
      s.stock_id,
      s.product?.product_name ?? '—',
      s.product?.barcode ?? '—',
      s.product?.category ?? '—',
      locationStr(s),
      s.product_type ?? '—',
      s.quantity,
      s.unit_cost ?? 0,
      (s.quantity * (s.unit_cost ?? 0)).toFixed(2),
      s.status,
      formatDate(s.expiration_date),
      formatDate(s.date_created)
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-inventory-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showGlobalSuccess('CSV exported successfully!');
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="vs-page">
      {globalSuccess && <div className="global-toast">{globalSuccess}</div>}

      {/* ══ VIEW STOCK MODAL ══════════════════════════════════════════════════ */}
      {viewStock && (
        <div className="modal-overlay" onClick={() => setViewStock(null)}>
          <div className="modal-card view-modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Stock Details</h2>
              <button className="modal-close" onClick={() => setViewStock(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="view-hero">
                <div className="view-hero-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
                </div>
                <div>
                  <p className="view-hero-name">{viewStock.product?.product_name ?? '—'}</p>
                  <div className="view-hero-meta">
                    {viewStock.product?.barcode && <span className="view-hero-loc">#{viewStock.product.barcode}</span>}
                    <span className={`status-badge sm ${STATUS_COLOR[viewStock.status] ?? 'status-inactive'}`}>{viewStock.status}</span>
                    {viewStock.product_type && <span className="floor-pill">{viewStock.product_type}</span>}
                  </div>
                </div>
              </div>
              <div className="view-detail-grid">
                <div className="vd-item"><span className="vd-label">Stock ID</span><span className="vd-value">#{viewStock.stock_id}</span></div>
                <div className="vd-item"><span className="vd-label">Quantity</span><span className={`vd-value bold ${getQtyClass(viewStock.quantity)}`}>{viewStock.quantity} {viewStock.product?.unit ?? ''}</span></div>
                <div className="vd-item"><span className="vd-label">Unit Cost</span><span className="vd-value bold">₱{viewStock.unit_cost?.toFixed(2)}</span></div>
                <div className="vd-item"><span className="vd-label">Total Value</span><span className="vd-value bold">₱{((viewStock.quantity ?? 0) * (viewStock.unit_cost ?? 0)).toFixed(2)}</span></div>
                <div className="vd-item"><span className="vd-label">Category</span><span className="vd-value">{viewStock.product?.category ?? '—'}</span></div>
                <div className="vd-item"><span className="vd-label">Expiration</span><span className="vd-value">{formatDate(viewStock.expiration_date)}</span></div>
                <div className="vd-item full"><span className="vd-label">Location</span><span className="vd-value">{locationStr(viewStock)}</span></div>
                <div className="vd-item full"><span className="vd-label">Date Created</span><span className="vd-value">{formatDate(viewStock.date_created)}</span></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-cancel" onClick={() => setViewStock(null)}>Close</button>
              {!permissions.canOnlySalesOut && (
                <button className="modal-save" onClick={() => { setViewStock(null); openEdit(viewStock); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  Edit Stock
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ PRODUCT BATCH VIEW MODAL ══════════════════════════════════════════ */}
      {viewProduct && (
        <div className="modal-overlay" onClick={() => setViewProduct(null)}>
          <div className="modal-card view-modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{viewProduct.name} — Stock Batches (FEFO)</h2>
              <button className="modal-close" onClick={() => setViewProduct(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="modal-body">
              {batchLoading ? (
                <div className="wh-loading"><span className="wh-spinner" /><p>Loading batches…</p></div>
              ) : productBatches.length === 0 ? (
                <div className="wh-empty"><p>No batches found for this product.</p></div>
              ) : (
                <div className="batch-list">
                  {productBatches.map((b, idx) => (
                    <div key={b.stock_id} className={`batch-card${idx === 0 ? ' batch-first' : ''}`}>
                      <div className="batch-info">
                        <div className="batch-header">
                          <span className="batch-id">Batch #{b.stock_id}</span>
                          {idx === 0 && <span className="batch-fefo-tag">Next to use (FEFO)</span>}
                          <span className={`status-badge sm ${STATUS_COLOR[b.status] ?? 'status-inactive'}`}>{b.status}</span>
                        </div>
                        <div className="batch-details">
                          <span><strong>{b.quantity}</strong> {b.product?.unit ?? 'units'}</span>
                          <span>₱{b.unit_cost?.toFixed(2)}/unit</span>
                          <span>Exp: {formatDate(b.expiration_date)}</span>
                          <span>{locationLabel(b.location)}</span>
                        </div>
                      </div>
                      <div className="batch-actions">
                        <button className="tbl-btn view" title="View batch" onClick={() => { setViewProduct(null); setViewStock(b); }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                        {!permissions.canOnlySalesOut && (
                          <button className="tbl-btn edit" title="Edit batch" onClick={() => { setViewProduct(null); openEdit(b); }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="modal-cancel" onClick={() => setViewProduct(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ EDIT MODAL ════════════════════════════════════════════════════════ */}
      {editStock && (
        <div className="modal-overlay" onClick={() => setEditStock(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Stock — {editStock.product?.product_name}</h2>
              <button className="modal-close" onClick={() => setEditStock(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            {editError && <div className="modal-error">{editError}</div>}
            <div className="modal-body">
              <div className="form-fields">
                <div className="form-row-2">
                  <div className="form-group">
                    <label>Quantity <span className="required">*</span></label>
                    <input type="number" min="0" value={editForm.quantity} onChange={e => setEditForm(p => ({ ...p, quantity: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Unit Cost (₱)</label>
                    <input type="number" min="0" step="0.01" value={editForm.unit_cost} onChange={e => setEditForm(p => ({ ...p, unit_cost: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row-2">
                  <div className="form-group">
                    <label>Product Type</label>
                    <select value={editForm.product_type} onChange={e => setEditForm(p => ({ ...p, product_type: e.target.value }))}>
                      <option value="">— None —</option>
                      <option value="S1">S1</option>
                      <option value="Bidding">Bidding</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}>
                      <option value="Available">Available</option>
                      <option value="Out of Stock">Out of Stock</option>
                      <option value="Reserved">Reserved</option>
                      <option value="Expired">Expired</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Expiration Date</label>
                  <input type="date" value={editForm.expiration_date} onChange={e => setEditForm(p => ({ ...p, expiration_date: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-cancel" onClick={() => setEditStock(null)}>Cancel</button>
              <button className="modal-save" onClick={handleEditSave} disabled={editLoading}>
                {editLoading ? <><span className="wh-spinner small" /> Saving…</> : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ADD ITEM SUB-MODAL (Transaction) ═══════════════════════════════════ */}
      {showAddItem && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setShowAddItem(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add to {transactionMode}</h2>
              <button className="modal-close" onClick={() => setShowAddItem(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-fields">
                {/* Step 1: Select Product from PRODUCTS table (unique) */}
                <div className="form-group">
                  <label>Select Product <span className="required">*</span></label>
                  <select 
                    value={selectedProductId} 
                    onChange={e => handleProductSelect(e.target.value)}
                  >
                    <option value="">— Choose Product —</option>
                    {products.map(p => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.product_name} {p.barcode ? `(${p.barcode})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* For Stock In/Return: No batch selection needed */}
                {(transactionMode === 'IN' || transactionMode === 'RETURN') && selectedProductId && (
                  <>
                    <div className="form-row-2">
                      <div className="form-group">
                        <label>Quantity <span className="required">*</span></label>
                        <input 
                          type="number" 
                          min="1" 
                          value={addItemQty} 
                          onChange={e => setAddItemQty(e.target.value)} 
                          autoFocus 
                        />
                      </div>
                      <div className="form-group">
                        <label>Price per Unit (₱) <span className="required">*</span></label>
                        <input 
                          type="number" 
                          min="0" 
                          step="0.01" 
                          value={addItemPrice} 
                          onChange={e => setAddItemPrice(e.target.value)} 
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Expiration Date</label>
                      <input type="date" value={addItemExpiry} onChange={e => setAddItemExpiry(e.target.value)} />
                    </div>
                  </>
                )}

                {/* For OUT/TRANSFER: Show batch selection */}
                {(transactionMode === 'OUT' || transactionMode === 'TRANSFER') && selectedProductId && selectedProductStock.length > 0 && (
                  <div className="form-group">
                    <label>Select Batch (FEFO) <span className="required">*</span></label>
                    <select 
                      value={selectedBatchId} 
                      onChange={e => handleBatchSelect(e.target.value)}
                    >
                      <option value="">— Choose Batch —</option>
                      {selectedProductStock.map(batch => (
                        <option key={batch.stock_id} value={batch.stock_id}>
                          Stock #{batch.stock_id} | Qty: {batch.quantity} | Exp: {formatDate(batch.expiration_date)} | ₱{batch.unit_cost}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {(transactionMode === 'OUT' || transactionMode === 'TRANSFER') && selectedProductId && selectedProductStock.length === 0 && (
                  <div className="form-group">
                    <div className="modal-error" style={{ marginTop: 0 }}>
                      No available stock for this product.
                    </div>
                  </div>
                )}

                {(transactionMode === 'OUT' || transactionMode === 'TRANSFER') && selectedBatchId && (
                  <div className="form-row-2">
                    <div className="form-group">
                      <label>Quantity <span className="required">*</span></label>
                      <input 
                        type="number" 
                        min="1" 
                        max={selectedProductStock.find(b => b.stock_id === Number(selectedBatchId))?.quantity}
                        value={addItemQty} 
                        onChange={e => setAddItemQty(e.target.value)} 
                        autoFocus 
                      />
                    </div>
                    <div className="form-group">
                      <label>Price per Unit (₱)</label>
                      <input 
                        type="number" 
                        min="0" 
                        step="0.01" 
                        value={addItemPrice} 
                        onChange={e => setAddItemPrice(e.target.value)} 
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-cancel" onClick={() => setShowAddItem(false)}>Cancel</button>
              <button 
                className="modal-save" 
                onClick={confirmAddItem} 
                disabled={
                  !selectedProductId || 
                  !addItemQty || 
                  ((transactionMode === 'OUT' || transactionMode === 'TRANSFER') && !selectedBatchId) ||
                  ((transactionMode === 'IN' || transactionMode === 'RETURN') && !addItemPrice)
                }
              >
                Add to List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ TRANSACTION MODAL ════════════════════════════════════════════════ */}
      {transactionMode && !showAddItem && (
        <div className="modal-overlay" onClick={() => { if (!transactionLoading) setTransactionMode(null); }}>
          <div className="modal-card transaction-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <span className={`scan-mode-badge badge-${transactionMode.toLowerCase()}`}>{transactionMode}</span>
                {transactionMode === 'IN' ? ' Stock In' : transactionMode === 'OUT' ? ' Stock Out' : transactionMode === 'TRANSFER' ? ' Transfer' : ' Return'}
              </h2>
              <button className="modal-close" onClick={() => setTransactionMode(null)} disabled={transactionLoading}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            {transactionError && <div className="modal-error">{transactionError}</div>}
            {transactionSuccess && <div className="modal-success">{transactionSuccess}</div>}
            <div className="modal-body">
              <div className="form-fields">
                {(transactionMode === 'IN' || transactionMode === 'RETURN') && (
                  <div className="form-group">
                    <label>Destination Location <span className="required">*</span></label>
                    <select value={selectedLocationId} onChange={e => setSelectedLocationId(e.target.value)}>
                      <option value="">— Select Location —</option>
                      {locations.map(l => (
                        <option key={l.location_id} value={l.location_id}>
                          {l.warehouse_name}{l.floor ? ` › Floor ${l.floor}` : ''}{l.shelf ? ` › Shelf ${l.shelf}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {transactionMode === 'TRANSFER' && (
                  <div className="form-row-2">
                    <div className="form-group">
                      <label>From Location <span className="required">*</span></label>
                      <select value={sourceLocationId} onChange={e => setSourceLocationId(e.target.value)}>
                        <option value="">— Source —</option>
                        {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.warehouse_name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>To Location <span className="required">*</span></label>
                      <select value={targetLocationId} onChange={e => setTargetLocationId(e.target.value)}>
                        <option value="">— Destination —</option>
                        {locations.filter(l => l.location_id !== Number(sourceLocationId)).map(l => (
                          <option key={l.location_id} value={l.location_id}>{l.warehouse_name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                <div className="form-row-2">
                  <div className="form-group">
                    <label>Reference No.</label>
                    <input placeholder="e.g. PO-001" value={referenceNo} onChange={e => setReferenceNo(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>{transactionMode === 'IN' ? 'Supplier' : 'Customer / Party'}</label>
                    <select value={selectedRelationId} onChange={e => setSelectedRelationId(e.target.value)}>
                      <option value="">— Optional —</option>
                      {(transactionMode === 'IN' ? suppliers : customers).map(r => (
                        <option key={r.relation_id} value={r.relation_id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="invoice-items-section" style={{ marginTop: 16 }}>
                <div className="section-label-row">
                  <label>Items ({transactionItems.length})</label>
                  <button className="add-product-btn" onClick={openAddItemModal}>
                    + Add Product
                  </button>
                </div>
                <div className="invoice-items-list">
                  {transactionItems.length === 0 ? (
                    <div className="invoice-empty">No items added yet. Use "+ Add Product" above.</div>
                  ) : (
                    <table className="invoice-items-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Batch/Location</th>
                          <th>Qty</th>
                          <th>Price</th>
                          <th>Total</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactionItems.map(item => (
                          <tr key={item.stock_id}>
                            <td>{item.product_name}</td>
                            <td style={{ fontSize: '0.8rem' }}>{item.location_label || (item.isNewStock ? 'New Stock' : `Batch #${item.stock_id}`)}</td>
                            <td>
                              <input type="number" min="1" max={item.availableQuantity} value={item.quantity}
                                onChange={e => {
                                  const q = Number(e.target.value);
                                  if (q > item.availableQuantity) { setTransactionError(`Max: ${item.availableQuantity}`); return; }
                                  setTransactionItems(prev => prev.map(i => i.stock_id === item.stock_id ? { ...i, quantity: q, total: q * i.price } : i));
                                  setTransactionError(null);
                                }} style={{ width: 65 }} />
                            </td>
                            <td>
                              <input type="number" min="0" step="0.01" value={item.price}
                                onChange={e => {
                                  const p = Number(e.target.value);
                                  setTransactionItems(prev => prev.map(i => i.stock_id === item.stock_id ? { ...i, price: p, total: i.quantity * p } : i));
                                }} style={{ width: 90 }} />
                            </td>
                            <td style={{ fontWeight: 700 }}>₱{item.total.toFixed(2)}</td>
                            <td><button className="remove-item-btn" onClick={() => setTransactionItems(prev => prev.filter(i => i.stock_id !== item.stock_id))}>×</button></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'right', fontWeight: 600, padding: '10px 12px' }}>Grand Total:</td>
                          <td colSpan={2} style={{ fontWeight: 800, fontSize: '1.05rem', padding: '10px 12px' }}>₱{transactionItems.reduce((s, i) => s + i.total, 0).toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-cancel" onClick={() => setTransactionMode(null)} disabled={transactionLoading}>Cancel</button>
              <button className={`modal-save ${transactionMode === 'OUT' ? 'btn-out' : ''}`} onClick={submitTransaction} disabled={transactionLoading}>
                {transactionLoading ? <><span className="wh-spinner small" /> Processing…</> : `Confirm ${transactionMode}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ADD INVOICE ITEM SUB-MODAL ════════════════════════════════════════ */}
      {showAddInvoiceItem && (
        <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={() => setShowAddInvoiceItem(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add to Invoice</h2>
              <button className="modal-close" onClick={() => setShowAddInvoiceItem(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-fields">
                <div className="form-group">
                  <label>Select Product <span className="required">*</span></label>
                  <select 
                    value={invoiceSelectedProductId} 
                    onChange={e => handleInvoiceProductSelect(e.target.value)}
                  >
                    <option value="">— Choose Product —</option>
                    {products.map(p => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.product_name} {p.barcode ? `(${p.barcode})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {invoiceSelectedProductId && invoiceSelectedProductStock.length > 0 && (
                  <div className="form-group">
                    <label>Select Batch (FEFO) <span className="required">*</span></label>
                    <select 
                      value={invoiceSelectedBatchId} 
                      onChange={e => handleInvoiceBatchSelect(e.target.value)}
                    >
                      <option value="">— Choose Batch —</option>
                      {invoiceSelectedProductStock.map(batch => (
                        <option key={batch.stock_id} value={batch.stock_id}>
                          Stock #{batch.stock_id} | Qty: {batch.quantity} | Exp: {formatDate(batch.expiration_date)} | ₱{batch.unit_cost}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {invoiceSelectedProductId && invoiceSelectedProductStock.length === 0 && (
                  <div className="form-group">
                    <div className="modal-error" style={{ marginTop: 0 }}>
                      No available stock for this product.
                    </div>
                  </div>
                )}

                {invoiceSelectedBatchId && (
                  <div className="form-row-2">
                    <div className="form-group">
                      <label>Quantity <span className="required">*</span></label>
                      <input type="number" min="1" value={addInvoiceQty} onChange={e => setAddInvoiceQty(e.target.value)} autoFocus />
                    </div>
                    <div className="form-group">
                      <label>Price per Unit (₱)</label>
                      <input type="number" min="0" step="0.01" value={addInvoicePrice} onChange={e => setAddInvoicePrice(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-cancel" onClick={() => setShowAddInvoiceItem(false)}>Cancel</button>
              <button className="modal-save" onClick={confirmAddInvoiceItem} disabled={!invoiceSelectedBatchId || !addInvoiceQty}>
                Add to Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ INVOICE MODAL ════════════════════════════════════════════════════ */}
      {showInvoice && !showAddInvoiceItem && (
        <div className="modal-overlay" onClick={() => { if (!invoiceLoading) setShowInvoice(false); }}>
          <div className="modal-card transaction-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18, marginRight: 8 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                Create Invoice
              </h2>
              <button className="modal-close" onClick={() => setShowInvoice(false)} disabled={invoiceLoading}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            {invoiceError && <div className="modal-error">{invoiceError}</div>}
            {invoiceSuccess && <div className="modal-success">{invoiceSuccess}</div>}
            <div className="modal-body">
              <div className="form-fields">
                <div className="form-row-2">
                  <div className="form-group">
                    <label>Customer <span className="required">*</span></label>
                    <select value={invoiceCustomerId} onChange={e => setInvoiceCustomerId(e.target.value)}>
                      <option value="">— Select Customer —</option>
                      {customers.map(c => <option key={c.relation_id} value={c.relation_id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Reference No.</label>
                    <input placeholder="INV-001" value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="invoice-items-section" style={{ marginTop: 16 }}>
                <div className="section-label-row">
                  <label>Invoice Items ({invoiceItems.length})</label>
                  <button className="add-product-btn" onClick={openAddInvoiceItem}>
                    + Add Product
                  </button>
                </div>
                <div className="invoice-items-list">
                  {invoiceItems.length === 0 ? (
                    <div className="invoice-empty">No items added. Use "+ Add Product" above.</div>
                  ) : (
                    <table className="invoice-items-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Batch</th>
                          <th>Expiry</th>
                          <th>Qty</th>
                          <th>Price</th>
                          <th>Total</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceItems.map(item => (
                          <tr key={item.stock_id}>
                            <td>{item.product_name}</td>
                            <td style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>#{item.stock_id}</td>
                            <td className="td-date">{formatDate(item.expiration_date)}</td>
                            <td>
                              <input type="number" min="1" max={item.availableQuantity} value={item.quantity} 
                                onChange={e => updateInvoiceItem(item.stock_id, Number(e.target.value), item.price)} 
                                style={{ width: 65 }} />
                            </td>
                            <td>
                              <input type="number" min="0" step="0.01" value={item.price} 
                                onChange={e => updateInvoiceItem(item.stock_id, item.quantity, Number(e.target.value))} 
                                style={{ width: 90 }} />
                            </td>
                            <td style={{ fontWeight: 700 }}>₱{item.total.toFixed(2)}</td>
                            <td>
                              <button className="remove-item-btn" onClick={() => setInvoiceItems(prev => prev.filter(i => i.stock_id !== item.stock_id))}>×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'right', fontWeight: 600, padding: '10px 12px' }}>Grand Total:</td>
                          <td colSpan={2} style={{ fontWeight: 800, fontSize: '1.05rem', padding: '10px 12px', color: '#1B3C53' }}>₱{invoiceTotal.toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-cancel" onClick={() => setShowInvoice(false)} disabled={invoiceLoading}>Cancel</button>
              <button className="modal-save invoice-save-btn" onClick={createInvoice} disabled={invoiceLoading}>
                {invoiceLoading ? <><span className="wh-spinner small" /> Creating…</> : <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                  </svg>
                  Create Invoice & Download PDF
                </>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ HEADER ════════════════════════════════════════════════════════════ */}
      <div className="wh-header" style={{ marginTop: 16 }}>
        <div>
          <h1 className="wh-title">Stock Inventory</h1>
          <p className="wh-subtitle">
            {filtered.length} records
            {currentUser && <span className="user-role-chip">{currentUser.role_name}</span>}
            {permissions.allowedTypes.length === 1 && !permissions.canViewAll && <span className="type-chip">{permissions.allowedTypes[0]} only</span>}
            {permissions.allowedLocationId && !permissions.canViewAll && <span className="location-chip">Warehouse restricted</span>}
          </p>
        </div>
        <div className="vs-scan-btns">
          {permissions.canDoStockIn && (
            <button className="vs-scan-btn scan-in" onClick={() => openTransaction('IN')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              Stock In
            </button>
          )}
          {permissions.canDoTransfer && (
            <button className="vs-scan-btn scan-transfer" onClick={() => openTransaction('TRANSFER')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 2l4 4-4 4" /><path d="M3 12h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 12h-15" /></svg>
              Transfer
            </button>
          )}
          {permissions.canDoReturn && (
            <button className="vs-scan-btn scan-return" onClick={() => openTransaction('RETURN')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>
              Return
            </button>
          )}
          <button className="vs-scan-btn scan-out" onClick={() => openTransaction('OUT')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Stock Out
          </button>
          <button className="invoice-btn" onClick={openInvoice}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            Create Invoice
          </button>
          
          <button className="wh-add-btn" onClick={fetchAll}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ══ STATS ═════════════════════════════════════════════════════════════ */}
      <div className="vs-stats">
        <div className="vs-stat"><span className="vs-stat-num">{filtered.length}</span><span className="vs-stat-lbl">SKUs</span></div>
        <div className="vs-stat"><span className="vs-stat-num">{totalQty.toLocaleString()}</span><span className="vs-stat-lbl">Total Units</span></div>
        <div className="vs-stat amber"><span className="vs-stat-num">{lowCount}</span><span className="vs-stat-lbl">Low Stock</span></div>
        <div className="vs-stat red"><span className="vs-stat-num">{outCount}</span><span className="vs-stat-lbl">Out of Stock</span></div>
      </div>

      {/* ══ TOOLBAR ═══════════════════════════════════════════════════════════ */}
      <div className="wh-toolbar">
        <div className="wh-search-wrap">
          <svg className="wh-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input className="wh-search" placeholder="Search product, barcode, category, warehouse..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="type-filter-tabs">
          {(['All', 'S1', 'Bidding'] as TypeFilter[])
            .filter(t => {
              if (t === 'All') return true;
              return permissions.canViewAll || permissions.allowedTypes.includes(t);
            })
            .map(t => (
              <button 
                key={t} 
                className={`type-tab${typeFilter === t ? ' active' : ''}`} 
                onClick={() => setTypeFilter(t)}
              >
                {t}
              </button>
            ))}
        </div>

        <div className="filter-wrap" ref={filterRef}>
          <button className={`filter-btn${isFilterActive ? ' filter-active' : ''}`} onClick={() => setFilterOpen(v => !v)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="9" y2="18" /></svg>
            {sortLabel[`${sortKey}-${sortDir}`]}
            {isFilterActive && <span className="filter-dot" />}
          </button>
          {filterOpen && (
            <div className="filter-dropdown">
              <div className="filter-section-label">Alphabetical</div>
              <button className={`filter-option${sortKey === 'product_name' && sortDir === 'asc' ? ' selected' : ''}`} onClick={() => { setSortKey('product_name'); setSortDir('asc'); setFilterOpen(false); }}>↑ Name A → Z</button>
              <button className={`filter-option${sortKey === 'product_name' && sortDir === 'desc' ? ' selected' : ''}`} onClick={() => { setSortKey('product_name'); setSortDir('desc'); setFilterOpen(false); }}>↓ Name Z → A</button>
              <div className="filter-divider" />
              <div className="filter-section-label">By Stock ID</div>
              <button className={`filter-option${sortKey === 'stock_id' && sortDir === 'asc' ? ' selected' : ''}`} onClick={() => { setSortKey('stock_id'); setSortDir('asc'); setFilterOpen(false); }}>↑ ID Ascending</button>
              <button className={`filter-option${sortKey === 'stock_id' && sortDir === 'desc' ? ' selected' : ''}`} onClick={() => { setSortKey('stock_id'); setSortDir('desc'); setFilterOpen(false); }}>↓ ID Descending</button>
              <div className="filter-divider" />
              <div className="filter-section-label">By Date</div>
              <button className={`filter-option${sortKey === 'date_created' && sortDir === 'desc' ? ' selected' : ''}`} onClick={() => { setSortKey('date_created'); setSortDir('desc'); setFilterOpen(false); }}>↓ Newest First</button>
              <button className={`filter-option${sortKey === 'date_created' && sortDir === 'asc' ? ' selected' : ''}`} onClick={() => { setSortKey('date_created'); setSortDir('asc'); setFilterOpen(false); }}>↑ Oldest First</button>
              <div className="filter-divider" />
              <label className="filter-option" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={hideInactive} style={{ accentColor: '#1B3C53' }}
                  onChange={e => { setHideInactive(e.target.checked); setFilterOpen(false); }} />
                Hide Out-of-Stock / Inactive
              </label>
              <div className="filter-divider" />
              <button className="filter-reset" onClick={() => { setSortKey('date_created'); setSortDir('desc'); setHideInactive(false); setTypeFilter('All'); setFilterOpen(false); }}>
                Reset All Filters
              </button>
            </div>
          )}
        </div>

        <div className="wh-count-chip">Showing <span>{filtered.length}</span> records</div>
      </div>

      {/* ══ TABLE ═════════════════════════════════════════════════════════════ */}
      <div className="wh-table-wrap">
        {loading ? (
          <div className="wh-loading"><span className="wh-spinner" /><p>Loading stock data…</p></div>
        ) : filtered.length === 0 ? (
          <div className="wh-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
            <p>No stock records found</p>
          </div>
        ) : (
          <>
            <table className="wh-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>Barcode</th>
                  <th>Location</th>
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Unit Cost</th>
                  <th>Status</th>
                  <th>Expiry</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(s => (
                  <tr key={s.stock_id}>
                    <td className="td-id">{s.stock_id}</td>
                    <td>
                      <div className="wh-name-cell">
                        <div className="wh-avatar">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          </svg>
                        </div>
                        <div className="wh-name-info">
                          <span className="wh-name-primary">{s.product?.product_name ?? '—'}</span>
                          <span className="wh-name-secondary">{s.product?.category ?? '—'} · {s.product?.unit ?? ''}</span>
                        </div>
                      </div>
                    </td>
                    <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{s.product?.barcode ?? '—'}</td>
                    <td className="td-location">{locationStr(s)}</td>
                    <td>{s.product_type ? <span className="floor-pill">{s.product_type}</span> : <span className="td-muted">—</span>}</td>
                    <td><span className={`qty-badge ${getQtyClass(s.quantity)}`}>{s.quantity}</span></td>
                    <td style={{ fontWeight: 600 }}>₱{s.unit_cost?.toFixed(2) ?? '—'}</td>
                    <td><span className={`status-badge sm ${STATUS_COLOR[s.status] ?? 'status-inactive'}`}>{s.status}</span></td>
                    <td className="td-date">{formatDate(s.expiration_date)}</td>
                    <td>
                      <div className="action-btns">
                        <button className="tbl-btn view" title="View" onClick={() => setViewStock(s)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                        <button className="tbl-btn batches" title="View Batches (FEFO)" onClick={() => openViewProduct(s)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="8" y1="6" x2="21" y2="6"/>
                            <line x1="8" y1="12" x2="21" y2="12"/>
                            <line x1="8" y1="18" x2="21" y2="18"/>
                            <line x1="3" y1="6" x2="3.01" y2="6"/>
                            <line x1="3" y1="12" x2="3.01" y2="12"/>
                            <line x1="3" y1="18" x2="3.01" y2="18"/>
                          </svg>
                        </button>
                        {!permissions.canOnlySalesOut && (
                          <button className="tbl-btn edit" title="Edit" onClick={() => openEdit(s)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        )}
                        <button className="tbl-btn add-invoice" title="Add to Invoice" onClick={() => { if (!showInvoice) setShowInvoice(true); openAddInvoiceItem(); }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="12" y1="13" x2="12" y2="17" />
                            <line x1="10" y1="15" x2="14" y2="15" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="pagination">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="pagination-info">
                  Showing <strong>{startItem}–{endItem}</strong> of <strong>{filtered.length}</strong>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#7a8fa0' }}>
                  Rows:
                  <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    style={{ padding: '4px 8px', borderRadius: 7, border: '1.5px solid #d0dce6', fontSize: '0.82rem', color: '#1B3C53', outline: 'none' }}>
                    {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div className="pagination-btns">
                <button className="page-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                {getPageNumbers().map((p, i) =>
                  p === '...'
                    ? <span key={`e${i}`} className="page-ellipsis">…</span>
                    : <button key={p} className={`page-btn${currentPage === p ? ' active' : ''}`} onClick={() => setCurrentPage(p as number)}>{p}</button>
                )}
                <button className="page-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}