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

interface StockedOutItem {
  item_id: number;
  stock_id: number;
  quantity: number;
  price: number;
  product_name: string;
  barcode: string;
  reference_no: string;
  date_created: string;
  relation_name: string;
}

type SortField = 'item_id' | 'product_name' | 'date_created' | 'total' | 'quantity' | 'none';
type SortDir   = 'asc' | 'desc';

const MOVEMENT_COLORS: Record<string, string> = {
  IN:       'badge-green',
  OUT:      'badge-red',
  TRANSFER: 'badge-purple',
  RETURN:   'badge-amber',
};

const TYPE_COLORS: Record<string, string> = {
  PURCHASE: 'badge-blue',
  SALE:     'badge-amber',
  RETURN:   'badge-gray',
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// ── Invoice Generator ─────────────────────────────────────────────────────────
const generateInvoicePDF = async (log: MovementLog) => {
  if (!(window as any).jspdf) {
    await new Promise<void>((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = () => res(); s.onerror = () => rej();
      document.head.appendChild(s);
    });
  }
  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const primary = [27, 60, 83];
  const light   = [244, 247, 250];
  const muted   = [120, 140, 160];

  doc.setFillColor(...primary as [number,number,number]);
  doc.rect(0, 0, 210, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('SURGICODE', 14, 16);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Inventory Management System', 14, 23);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('SALES INVOICE', 210 - 14, 16, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Ref: ${log.transactions?.reference_no ?? '—'}`, 210 - 14, 23, { align: 'right' });
  doc.text(`Date: ${log.transactions?.date_created ? new Date(log.transactions.date_created).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : '—'}`, 210 - 14, 29, { align: 'right' });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...muted as [number,number,number]);
  doc.text('BILLED TO', 14, 48);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(log.transactions?.relations?.name ?? 'N/A', 14, 55);

  const tableY = 68;
  doc.setFillColor(...light as [number,number,number]);
  doc.rect(14, tableY, 182, 8, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...muted as [number,number,number]);
  doc.text('PRODUCT', 16, tableY + 5.5);
  doc.text('BARCODE',  90, tableY + 5.5);
  doc.text('QTY',     130, tableY + 5.5);
  doc.text('UNIT PRICE', 150, tableY + 5.5);
  doc.text('TOTAL',   185, tableY + 5.5, { align: 'right' });

  const rowY = tableY + 15;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(log.stock?.product?.product_name ?? '—', 16, rowY);
  doc.text(log.stock?.product?.barcode ?? '—',      90, rowY);
  doc.text(String(log.quantity),                   130, rowY);
  doc.text(`₱${log.price?.toFixed(2)}`,            150, rowY);
  doc.text(`₱${log.total?.toFixed(2)}`,            185, rowY, { align: 'right' });

  doc.setDrawColor(...light as [number,number,number]);
  doc.setLineWidth(0.5);
  doc.line(14, rowY + 5, 196, rowY + 5);

  const totY = rowY + 18;
  doc.setFillColor(...light as [number,number,number]);
  doc.rect(130, totY - 6, 66, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...primary as [number,number,number]);
  doc.text('TOTAL AMOUNT', 132, totY + 1);
  doc.setFontSize(13);
  doc.text(`₱${log.total?.toFixed(2)}`, 195, totY + 1, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...muted as [number,number,number]);
  doc.text('Thank you for your business.', 14, 270);
  doc.text('Generated by SurgiCode IMS', 196, 270, { align: 'right' });

  doc.save(`invoice-${log.transactions?.reference_no ?? log.item_id}.pdf`);
};

// ── Component ──────────────────────────────────────────────────────────────────
function MovementLogPage() {
  const { user: authUser } = useAuth();

  const [currentUser, setCurrentUser]   = useState<CurrentUser | null>(null);
  const [permissions, setPermissions]   = useState({
    canViewAll: false,
    allowedTypes: [] as string[],
    allowedLocationId: null as number | null,
  });

  const [logs,     setLogs]     = useState<MovementLog[]>([]);
  const [filtered, setFiltered] = useState<MovementLog[]>([]);
  const [loading,  setLoading]  = useState(true);

  const [activeMovement, setActiveMovement] = useState<'ALL' | 'IN' | 'OUT' | 'TRANSFER' | 'RETURN'>('ALL');

  const [search,     setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [sortField, setSortField]   = useState<SortField>('none');
  const [sortDir,   setSortDir]     = useState<SortDir>('asc');
  const [hideNoRelation, setHideNoRelation] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize,    setPageSize]    = useState(10);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const startItem  = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem    = Math.min(currentPage * pageSize, filtered.length);

  const [returnOpen,         setReturnOpen]         = useState(false);
  const [stockedOutItems,    setStockedOutItems]     = useState<StockedOutItem[]>([]);
  const [returnSearch,       setReturnSearch]        = useState('');
  const [selectedReturnItem, setSelectedReturnItem]  = useState<StockedOutItem | null>(null);
  const [returnQty,          setReturnQty]           = useState(1);
  const [returnCustomer,     setReturnCustomer]      = useState('');
  const [returnCustomers,    setReturnCustomers]     = useState<{ relation_id: number; name: string }[]>([]);
  const [returnLoading,      setReturnLoading]       = useState(false);
  const [returnError,        setReturnError]         = useState<string | null>(null);
  const [returnSuccess,      setReturnSuccess]       = useState(false);

  const [historyOpen,   setHistoryOpen]   = useState(false);
  const [historyItem,   setHistoryItem]   = useState<StockedOutItem | null>(null);
  const [historyLogs,   setHistoryLogs]   = useState<MovementLog[]>([]);
  const [historyLoad,   setHistoryLoad]   = useState(false);

  useEffect(() => { setCurrentPage(1); }, [search, typeFilter, activeMovement, pageSize, sortField, sortDir, hideNoRelation]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setShowExportMenu(false);
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) setShowFilterPanel(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { if (authUser) loadUserPermissions(authUser); }, [authUser]);
  useEffect(() => { fetchLogs(); }, [permissions]);
  useEffect(() => { applyFilters(); }, [logs, search, typeFilter, activeMovement, sortField, sortDir, hideNoRelation]);

  const loadUserPermissions = async (savedUser: any) => {
    const { data, error } = await supabase
      .from('users')
      .select('user_id,full_name,username,role_id,assigned_type,assigned_location_id,role:role_id(role_name)')
      .eq('user_id', savedUser.user_id)
      .single();
    if (error || !data) return;
    let roleName = '';
    if (data.role) {
      const r = Array.isArray(data.role) ? (data.role[0] as any) : (data.role as any);
      roleName = r?.role_name ?? '';
    }
    const user: CurrentUser = { user_id: data.user_id, full_name: data.full_name, username: data.username, role_id: data.role_id, assigned_type: data.assigned_type, assigned_location_id: data.assigned_location_id, role_name: roleName };
    setCurrentUser(user);
    if (roleName === 'Admin')          setPermissions({ canViewAll: true,  allowedTypes: ['S1','Bidding'], allowedLocationId: null });
    else if (roleName === 'Manager')   setPermissions({ canViewAll: false, allowedTypes: data.assigned_type ? [data.assigned_type] : ['S1','Bidding'], allowedLocationId: null });
    else if (roleName === 'Warehouse') setPermissions({ canViewAll: false, allowedTypes: data.assigned_type ? [data.assigned_type] : ['S1','Bidding'], allowedLocationId: data.assigned_location_id });
    else if (roleName === 'Sales')     setPermissions({ canViewAll: false, allowedTypes: data.assigned_type ? [data.assigned_type] : ['S1','Bidding'], allowedLocationId: null });
    else                               setPermissions({ canViewAll: false, allowedTypes: [], allowedLocationId: null });
  };

  const fetchLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('transaction_item')
      .select(`
        item_id, movement, quantity, price, total, transaction_id, stock_id,
        stock:stock_id(product_type, product:product_id(product_name,barcode), location:location_id(location_id,warehouse_name)),
        transactions:transaction_id(type,reference_no,date_created,relations:relation_id(name))
      `)
      .order('item_id', { ascending: false });

    if (error) { setLoading(false); return; }
    let result = (data ?? []) as any[];

    if (!permissions.canViewAll) {
      if (permissions.allowedTypes.length > 0 && permissions.allowedTypes.length < 2)
        result = result.filter((l: any) => permissions.allowedTypes.includes(l.stock?.product_type));
      if (permissions.allowedLocationId)
        result = result.filter((l: any) => l.stock?.location?.location_id === permissions.allowedLocationId);
    }
    setLogs(result);
    setLoading(false);
  };

  const applyFilters = () => {
    let result = [...logs];
    if (activeMovement !== 'ALL') result = result.filter(l => l.movement === activeMovement);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(l =>
        l.stock?.product?.product_name?.toLowerCase().includes(s) ||
        l.stock?.product?.barcode?.toLowerCase().includes(s) ||
        l.transactions?.reference_no?.toLowerCase().includes(s) ||
        l.transactions?.relations?.name?.toLowerCase().includes(s)
      );
    }
    if (typeFilter !== 'All') result = result.filter(l => l.transactions?.type === typeFilter);
    if (hideNoRelation)       result = result.filter(l => !!l.transactions?.relations?.name);
    if (sortField !== 'none') {
      result.sort((a, b) => {
        let aVal: any, bVal: any;
        if (sortField === 'item_id')      { aVal = a.item_id; bVal = b.item_id; }
        if (sortField === 'product_name') { aVal = a.stock?.product?.product_name ?? ''; bVal = b.stock?.product?.product_name ?? ''; }
        if (sortField === 'date_created') { aVal = new Date(a.transactions?.date_created ?? 0).getTime(); bVal = new Date(b.transactions?.date_created ?? 0).getTime(); }
        if (sortField === 'total')        { aVal = a.total ?? 0; bVal = b.total ?? 0; }
        if (sortField === 'quantity')     { aVal = a.quantity ?? 0; bVal = b.quantity ?? 0; }
        if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }
    setFiltered(result);
  };

  const openReturnModal = async () => {
    setReturnOpen(true);
    setReturnError(null);
    setReturnSuccess(false);
    setSelectedReturnItem(null);
    setReturnQty(1);
    setReturnCustomer('');
    setReturnSearch('');

    const { data } = await supabase
      .from('transaction_item')
      .select(`item_id, stock_id, quantity, price, stock:stock_id(product:product_id(product_name,barcode)), transactions:transaction_id(reference_no,date_created,relations:relation_id(name))`)
      .eq('movement', 'OUT')
      .order('item_id', { ascending: false });

    if (data) {
      setStockedOutItems((data as any[]).map(d => ({
        item_id:      d.item_id,
        stock_id:     d.stock_id,
        quantity:     d.quantity,
        price:        d.price,
        product_name: d.stock?.product?.product_name ?? '—',
        barcode:      d.stock?.product?.barcode ?? '—',
        reference_no: d.transactions?.reference_no ?? '—',
        date_created: d.transactions?.date_created ?? '',
        relation_name: d.transactions?.relations?.name ?? '—',
      })));
    }

    const { data: rels } = await supabase
      .from('relations')
      .select('relation_id, name')
      .in('relation_type', ['Customer', 'Both'])
      .eq('status', 'Active')
      .order('name');
    if (rels) setReturnCustomers(rels as any[]);
  };

  const openProductHistory = async (item: StockedOutItem) => {
    setHistoryItem(item);
    setHistoryOpen(true);
    setHistoryLoad(true);
    const { data } = await supabase
      .from('transaction_item')
      .select(`item_id, movement, quantity, price, total, transactions:transaction_id(type,reference_no,date_created,relations:relation_id(name))`)
      .eq('stock_id', item.stock_id)
      .order('item_id', { ascending: false });
    setHistoryLogs((data ?? []) as any[]);
    setHistoryLoad(false);
  };

  const submitReturn = async () => {
    if (!selectedReturnItem) { setReturnError('Please select an item to return.'); return; }
    if (!returnCustomer)     { setReturnError('Customer is required for returns.'); return; }
    if (returnQty < 1 || returnQty > selectedReturnItem.quantity) {
      setReturnError(`Quantity must be between 1 and ${selectedReturnItem.quantity}.`); return;
    }
    setReturnLoading(true);
    setReturnError(null);

    const { data: txn, error: txnErr } = await supabase
      .from('transactions')
      .insert([{ type: 'RETURN', relation_id: Number(returnCustomer), processed_by: currentUser?.user_id, reference_no: `RET-${Date.now()}` }])
      .select('transaction_id')
      .single();

    if (txnErr || !txn) { setReturnError(txnErr?.message ?? 'Failed to create transaction.'); setReturnLoading(false); return; }

    const { error: itemErr } = await supabase
      .from('transaction_item')
      .insert([{ transaction_id: txn.transaction_id, stock_id: selectedReturnItem.stock_id, movement: 'RETURN', quantity: returnQty, price: selectedReturnItem.price, total: returnQty * selectedReturnItem.price }]);

    if (itemErr) { setReturnError(itemErr.message); setReturnLoading(false); return; }

    await supabase.from('audit_log').insert([{
      user_id: currentUser?.user_id,
      action: 'RETURN',
      table_name: 'transaction_item',
      record_id: txn.transaction_id,
      description: `RETURN — ${selectedReturnItem.product_name} | Qty: ${returnQty}`,
    }]);

    setReturnSuccess(true);
    setReturnLoading(false);
    fetchLogs();
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

  const formatDate = (d: string) =>
    new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const formatDateShort = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const activeSortCount = (sortField !== 'none' ? 1 : 0) + (hideNoRelation ? 1 : 0);
  const resetFilters = () => { setSortField('none'); setSortDir('asc'); setHideNoRelation(false); };

  const totalIn    = logs.filter(l => l.movement === 'IN').length;
  const totalOut   = logs.filter(l => l.movement === 'OUT').length;
  const totalTrans = logs.filter(l => l.movement === 'TRANSFER').length;
  const totalRet   = logs.filter(l => l.movement === 'RETURN').length;
  const totalValue = filtered.reduce((s, l) => s + (l.total ?? 0), 0);

  const filteredReturnItems = stockedOutItems.filter(i =>
    !returnSearch.trim() ||
    i.product_name.toLowerCase().includes(returnSearch.toLowerCase()) ||
    i.barcode.toLowerCase().includes(returnSearch.toLowerCase()) ||
    i.reference_no.toLowerCase().includes(returnSearch.toLowerCase())
  );

  const exportCSV = () => {
    const header = 'ID,Barcode,Product,Warehouse,Movement,Type,Reference,Relation,Qty,Price,Total,Date';
    const rows = filtered.map(l => [l.item_id, l.stock?.product?.barcode ?? '', l.stock?.product?.product_name ?? '', l.stock?.location?.warehouse_name ?? '', l.movement, l.transactions?.type ?? '', l.transactions?.reference_no ?? '', l.transactions?.relations?.name ?? '', l.quantity, l.price?.toFixed(2), l.total?.toFixed(2), l.transactions?.date_created ? formatDate(l.transactions.date_created) : ''].join(',')).join('\n');
    const blob = new Blob([header + '\n' + rows], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'movement_log.csv'; a.click();
    setShowExportMenu(false);
  };

  const exportExcel = () => {
    const header = ['ID','Barcode','Product','Warehouse','Movement','Type','Reference','Relation','Qty','Price','Total','Date'];
    const rows = filtered.map(l => [l.item_id, l.stock?.product?.barcode ?? '', l.stock?.product?.product_name ?? '', l.stock?.location?.warehouse_name ?? '', l.movement, l.transactions?.type ?? '', l.transactions?.reference_no ?? '', l.transactions?.relations?.name ?? '', l.quantity, l.price, l.total, l.transactions?.date_created ? formatDate(l.transactions.date_created) : '']);
    const tsv = [header, ...rows].map(r => r.join('\t')).join('\n');
    const blob = new Blob([tsv], { type: 'application/vnd.ms-excel' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'movement_log.xls'; a.click();
    setShowExportMenu(false);
  };

  const exportPDF = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const rows = filtered.map(l => `<tr><td>${l.item_id}</td><td>${l.stock?.product?.barcode ?? '—'}</td><td>${l.stock?.product?.product_name ?? '—'}</td><td>${l.stock?.location?.warehouse_name ?? '—'}</td><td><b style="color:${l.movement==='IN'?'#16a34a':'#dc2626'}">${l.movement}</b></td><td>${l.transactions?.type ?? '—'}</td><td>${l.transactions?.reference_no ?? '—'}</td><td>${l.transactions?.relations?.name ?? '—'}</td><td>${l.quantity}</td><td>₱${l.price?.toFixed(2)}</td><td>₱${l.total?.toFixed(2)}</td><td>${l.transactions?.date_created ? formatDate(l.transactions.date_created) : '—'}</td></tr>`).join('');
    win.document.write(`<html><head><title>Movement Log</title><style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}h2{color:#1B3C53}table{width:100%;border-collapse:collapse}th{background:#1B3C53;color:white;padding:7px 8px;text-align:left;font-size:10px}td{padding:6px 8px;border-bottom:1px solid #eee}tr:nth-child(even) td{background:#f8fafc}</style></head><body><h2>Movement Log</h2><p>Exported ${new Date().toLocaleString()}</p><table><thead><tr><th>#</th><th>Barcode</th><th>Product</th><th>Warehouse</th><th>Move</th><th>Type</th><th>Reference</th><th>Relation</th><th>Qty</th><th>Price</th><th>Total</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print();<\/script></body></html>`);
    win.document.close();
    setShowExportMenu(false);
  };

  const movementCards = [
    { key: 'ALL',      label: 'All',       count: logs.length,  color: '#1B3C53', bg: '#eef4fa' },
    { key: 'IN',       label: 'Stock In',  count: totalIn,      color: '#16a34a', bg: '#dcfce7' },
    { key: 'OUT',      label: 'Stock Out', count: totalOut,     color: '#dc2626', bg: '#fee2e2' },
    { key: 'TRANSFER', label: 'Transfer',  count: totalTrans,   color: '#6d28d9', bg: '#ede9fe' },
    { key: 'RETURN',   label: 'Return',    count: totalRet,     color: '#b45309', bg: '#fef3c7' },
  ];

  return (
    <div className="ml-page">

      {/* ── RETURN MODAL ── */}
      {returnOpen && (
        <div className="ml-modal-overlay" onClick={() => { if (!returnLoading) setReturnOpen(false); }}>
          <div className="ml-modal-card" onClick={e => e.stopPropagation()}>
            <div className="ml-modal-header">
              <div>
                <span className="ml-modal-tag">Stock Return</span>
                <h2 className="ml-modal-title">Process Return</h2>
              </div>
              <button className="ml-modal-close" onClick={() => setReturnOpen(false)} disabled={returnLoading}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {returnSuccess ? (
              <div className="ml-return-success">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="20 6 9 17 4 12"/></svg>
                <p>Return processed successfully!</p>
                <button className="ml-modal-btn-primary" onClick={() => setReturnOpen(false)}>Done</button>
              </div>
            ) : (
              <div className="ml-modal-body">
                {returnError && (
                  <div className="ml-modal-error">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {returnError}
                  </div>
                )}
                <div className="ml-return-step">
                  <label className="ml-return-label">1. Select Previously Stocked-Out Item <span className="ml-required">*</span></label>
                  <input className="ml-return-search" placeholder="Search by product, barcode, reference..." value={returnSearch} onChange={e => setReturnSearch(e.target.value)} />
                  <div className="ml-stocked-list">
                    {filteredReturnItems.length === 0 ? (
                      <div className="ml-stocked-empty">No stocked-out items found</div>
                    ) : filteredReturnItems.slice(0, 30).map(item => (
                      <div
                        key={item.item_id}
                        className={`ml-stocked-item${selectedReturnItem?.item_id === item.item_id ? ' selected' : ''}`}
                        onClick={() => { setSelectedReturnItem(item); setReturnQty(1); }}
                      >
                        <div className="ml-stocked-left">
                          <div className="ml-stocked-name">{item.product_name}</div>
                          <div className="ml-stocked-meta">{item.barcode} · {item.reference_no} · {item.relation_name}</div>
                        </div>
                        <div className="ml-stocked-right">
                          <span className="ml-stocked-qty">Qty: {item.quantity}</span>
                          <button className="ml-history-btn" title="View product history" onClick={e => { e.stopPropagation(); openProductHistory(item); }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedReturnItem && (
                  <>
                    <div className="ml-return-step">
                      <label className="ml-return-label">2. Return Quantity <span className="ml-required">*</span></label>
                      <input type="number" className="ml-return-input" min={1} max={selectedReturnItem.quantity} value={returnQty} onChange={e => setReturnQty(Number(e.target.value))} />
                      <span className="ml-return-hint">Max: {selectedReturnItem.quantity}</span>
                    </div>
                    <div className="ml-return-step">
                      <label className="ml-return-label">3. Customer <span className="ml-required">*</span></label>
                      <select className="ml-return-input" value={returnCustomer} onChange={e => setReturnCustomer(e.target.value)}>
                        <option value="">— Select Customer —</option>
                        {returnCustomers.map(c => <option key={c.relation_id} value={c.relation_id}>{c.name}</option>)}
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}

            {!returnSuccess && (
              <div className="ml-modal-footer">
                <button className="ml-modal-btn-primary" onClick={submitReturn} disabled={returnLoading || !selectedReturnItem || !returnCustomer}>
                  {returnLoading ? <><span className="ml-btn-spinner"/>Processing…</> : 'Process Return'}
                </button>
                <button className="ml-modal-btn-ghost" onClick={() => setReturnOpen(false)} disabled={returnLoading}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PRODUCT HISTORY MODAL ── */}
      {historyOpen && (
        <div className="ml-modal-overlay" style={{ zIndex: 1300 }} onClick={() => setHistoryOpen(false)}>
          <div className="ml-modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 580 }}>
            <div className="ml-modal-header">
              <div>
                <span className="ml-modal-tag">Product History</span>
                <h2 className="ml-modal-title">{historyItem?.product_name}</h2>
              </div>
              <button className="ml-modal-close" onClick={() => setHistoryOpen(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="ml-modal-body">
              {historyLoad ? (
                <div className="ml-history-loading"><span className="ml-btn-spinner" style={{ borderTopColor: '#1B3C53', borderColor: '#d0dce6', width: 24, height: 24 }}/></div>
              ) : historyLogs.length === 0 ? (
                <p className="ml-history-empty">No history found.</p>
              ) : (
                <div className="ml-history-table-wrap">
                  <table className="ml-history-table">
                    <thead>
                      <tr><th>#</th><th>Movement</th><th>Type</th><th>Reference</th><th>Relation</th><th>Qty</th><th>Total</th><th>Date</th></tr>
                    </thead>
                    <tbody>
                      {historyLogs.map(h => (
                        <tr key={h.item_id}>
                          <td className="td-id">{h.item_id}</td>
                          <td><span className={`badge ${MOVEMENT_COLORS[h.movement] ?? 'badge-gray'}`}>{h.movement}</span></td>
                          <td><span className={`badge ${TYPE_COLORS[(h.transactions as any)?.type ?? ''] ?? 'badge-gray'}`}>{(h.transactions as any)?.type ?? '—'}</span></td>
                          <td className="td-mono">{(h.transactions as any)?.reference_no ?? '—'}</td>
                          <td>{(h.transactions as any)?.relations?.name ?? '—'}</td>
                          <td>{h.quantity}</td>
                          <td>₱{h.total?.toFixed(2)}</td>
                          <td className="td-date">{(h.transactions as any)?.date_created ? formatDateShort((h.transactions as any).date_created) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="ml-modal-footer">
              <button className="ml-modal-btn-ghost" onClick={() => setHistoryOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="ml-header">
        <div>
          <h1 className="ml-title">Stock Movement Log</h1>
          <p className="ml-subtitle">
            Track all stock IN / OUT transactions
            {currentUser && <span className="user-role-chip">{currentUser.role_name}</span>}
            {permissions.allowedTypes.length === 1 && !permissions.canViewAll && <span className="type-chip">{permissions.allowedTypes[0]} only</span>}
          </p>
        </div>
        {/* Wrap action buttons so they sit together responsively */}
        <div className="ml-header-actions">
          <button className="ml-refresh-btn" onClick={() => openReturnModal()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.67"/></svg>
            Process Return
          </button>
          <button className="ml-refresh-btn" onClick={fetchLogs}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ── MOVEMENT CARDS ── */}
      <div className="ml-movement-cards">
        {movementCards.map(card => (
          <button
            key={card.key}
            className={`ml-movement-card${activeMovement === card.key ? ' active' : ''}`}
            style={activeMovement === card.key ? { background: card.bg, borderColor: card.color } : {}}
            onClick={() => setActiveMovement(card.key as any)}
          >
            <span className="ml-card-count" style={activeMovement === card.key ? { color: card.color } : {}}>{card.count}</span>
            <span className="ml-card-label" style={activeMovement === card.key ? { color: card.color } : {}}>{card.label}</span>
          </button>
        ))}
      </div>

      {/* ── FILTERS ── */}
      <div className="ml-filters">
        <div className="ml-search-wrap">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="ml-search" placeholder="Search by product, barcode, reference, party..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="ml-dropdown-wrap" ref={filterPanelRef}>
          <button className={`ml-icon-btn${activeSortCount > 0 ? ' active' : ''}`} onClick={() => setShowFilterPanel(v => !v)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
            Filter {activeSortCount > 0 && <span className="ml-badge-count">{activeSortCount}</span>}
          </button>
          {showFilterPanel && (
            <div className="ml-panel">
              <div className="ml-panel-header">
                <span>Sort &amp; Filter</span>
                {activeSortCount > 0 && <button className="ml-panel-reset" onClick={resetFilters}>Reset all</button>}
              </div>
              <div className="ml-panel-section">
                <label className="ml-panel-label">Sort by</label>
                <div className="ml-panel-row">
                  <select className="ml-select ml-select-grow" value={sortField} onChange={e => setSortField(e.target.value as SortField)}>
                    <option value="none">— None —</option>
                    <option value="item_id">ID</option>
                    <option value="product_name">Product Name</option>
                    <option value="date_created">Date</option>
                    <option value="total">Total Value</option>
                    <option value="quantity">Quantity</option>
                  </select>
                  <div className="ml-dir-toggle">
                    <button className={`ml-dir-btn${sortDir==='asc'?' selected':''}`} onClick={() => setSortDir('asc')}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>Asc
                    </button>
                    <button className={`ml-dir-btn${sortDir==='desc'?' selected':''}`} onClick={() => setSortDir('desc')}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>Desc
                    </button>
                  </div>
                </div>
              </div>
              <div className="ml-panel-section">
                <label className="ml-panel-label">Row filters</label>
                <label className="ml-checkbox-row">
                  <input type="checkbox" checked={hideNoRelation} onChange={e => setHideNoRelation(e.target.checked)} />
                  Hide rows without a Relation
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="ml-dropdown-wrap" ref={exportMenuRef}>
          <button className="ml-icon-btn export" onClick={() => setShowExportMenu(v => !v)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
            <svg className="ml-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {showExportMenu && (
            <div className="ml-panel ml-export-panel">
              <button className="ml-export-item" onClick={exportCSV}><span className="ml-export-icon csv">CSV</span><div><div className="ml-export-item-title">Export as CSV</div><div className="ml-export-item-desc">Comma-separated</div></div></button>
              <button className="ml-export-item" onClick={exportExcel}><span className="ml-export-icon xls">XLS</span><div><div className="ml-export-item-title">Export as Excel</div><div className="ml-export-item-desc">Opens in Excel / Sheets</div></div></button>
              <button className="ml-export-item" onClick={exportPDF}><span className="ml-export-icon pdf">PDF</span><div><div className="ml-export-item-title">Export as PDF</div><div className="ml-export-item-desc">Printable report</div></div></button>
            </div>
          )}
        </div>
      </div>

      {/* ── STATS ── */}
      <div className="ml-stats">
        <div className="stat-chip"><span className="stat-num">{filtered.length}</span><span className="stat-label">Showing</span></div>
        <div className="stat-chip"><span className="stat-num">₱{totalValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span><span className="stat-label">Total Value</span></div>
      </div>

      {/* ── TABLE + CARD LIST ── */}
      <div className="ml-table-wrap">
        {loading ? (
          <div className="ml-state"><span className="ml-spinner"/><p>Loading movement logs...</p></div>
        ) : filtered.length === 0 ? (
          <div className="ml-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 17H5a2 2 0 0 0-2 2"/><path d="M21 17h-4a2 2 0 0 0-2 2"/><path d="M13 5H5a2 2 0 0 0-2 2v10"/><path d="M21 7V5a2 2 0 0 0-2-2h-4"/><rect x="9" y="9" width="6" height="10" rx="1"/></svg>
            <p>No movement logs found</p>
          </div>
        ) : (
          <>
            {/* ── DESKTOP TABLE (hidden on mobile via CSS) ── */}
            <div className="ml-table-scroll">
              <table className="ml-table">
                <thead>
                  <tr>
                    <th>#</th><th>Barcode</th><th>Product</th><th>Warehouse</th>
                    <th>Movement</th><th>Type</th><th>Reference</th><th>Relation</th>
                    <th>Qty</th><th>Price</th><th>Total</th><th>Date</th><th>Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(l => (
                    <tr key={l.item_id}>
                      <td className="td-id">{l.item_id}</td>
                      <td className="td-mono">{l.stock?.product?.barcode ?? '—'}</td>
                      <td className="td-name">{l.stock?.product?.product_name ?? '—'}</td>
                      <td>{l.stock?.location?.warehouse_name ?? '—'}</td>
                      <td><span className={`badge ${MOVEMENT_COLORS[l.movement] ?? 'badge-gray'}`}>{l.movement}</span></td>
                      <td><span className={`badge ${TYPE_COLORS[l.transactions?.type ?? ''] ?? 'badge-gray'}`}>{l.transactions?.type ?? '—'}</span></td>
                      <td className="td-mono">{l.transactions?.reference_no ?? '—'}</td>
                      <td>{l.transactions?.relations?.name ?? '—'}</td>
                      <td className="td-qty">{l.quantity}</td>
                      <td>₱{l.price?.toFixed(2) ?? '—'}</td>
                      <td className="td-total">₱{l.total?.toFixed(2) ?? '—'}</td>
                      <td className="td-date">{l.transactions?.date_created ? formatDate(l.transactions.date_created) : '—'}</td>
                      <td>
                        {l.movement === 'OUT' ? (
                          <button className="ml-invoice-btn" title="Download Invoice PDF" onClick={() => generateInvoicePDF(l)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                            Invoice
                          </button>
                        ) : (
                          <span className="td-id">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── MOBILE CARD LIST (shown on mobile via CSS) ── */}
            <div className="ml-card-list">
              {paginated.map(l => (
                <div key={l.item_id} className="ml-log-card">
                  <div className="ml-log-card-top">
                    <span className="ml-log-card-name">{l.stock?.product?.product_name ?? '—'}</span>
                    <div className="ml-log-card-badges">
                      <span className={`badge ${MOVEMENT_COLORS[l.movement] ?? 'badge-gray'}`}>{l.movement}</span>
                      <span className={`badge ${TYPE_COLORS[l.transactions?.type ?? ''] ?? 'badge-gray'}`}>{l.transactions?.type ?? '—'}</span>
                    </div>
                  </div>

                  <div className="ml-log-card-meta">
                    {l.stock?.location?.warehouse_name && (
                      <span className="ml-log-card-meta-item">
                        <span className="ml-log-card-meta-label">Warehouse</span>
                        <span className="ml-log-card-meta-value">{l.stock.location.warehouse_name}</span>
                      </span>
                    )}
                    <span className="ml-log-card-meta-item">
                      <span className="ml-log-card-meta-label">Ref</span>
                      <span className="ml-log-card-meta-value">{l.transactions?.reference_no ?? '—'}</span>
                    </span>
                    {l.transactions?.relations?.name && (
                      <span className="ml-log-card-meta-item">
                        <span className="ml-log-card-meta-label">Relation</span>
                        <span className="ml-log-card-meta-value">{l.transactions.relations.name}</span>
                      </span>
                    )}
                  </div>

                  <div className="ml-log-card-bottom">
                    <div className="ml-log-card-totals">
                      <span className="ml-log-card-total">₱{l.total?.toFixed(2) ?? '—'}</span>
                      <span className="ml-log-card-qty">× {l.quantity} @ ₱{l.price?.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="ml-log-card-date">
                        {l.transactions?.date_created ? formatDateShort(l.transactions.date_created) : '—'}
                      </span>
                      {l.movement === 'OUT' && (
                        <button className="ml-invoice-btn" onClick={() => generateInvoicePDF(l)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                          Invoice
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── PAGINATION (shared) ── */}
            <div className="ml-pagination">
              <span className="pagination-info">
                Showing <strong>{startItem}–{endItem}</strong> of <strong>{filtered.length}</strong> logs
              </span>
              <div className="pagination-controls">
                <div className="pagination-pagesize">
                  <span>Rows:</span>
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

export default MovementLogPage;