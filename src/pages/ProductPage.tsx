import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import './ProductPage.css';

// ── Types ────────────────────────────────────────────────────────────────────
interface Supplier {
  name: string;
  relation_type: string;
}

interface StockRow {
  quantity: number;
  unit_cost: number;
  expiration_date?: string;
}

interface Product {
  product_id: number;
  product_name: string;
  barcode: string | null;
  category: string | null;
  unit: string | null;
  status: string;
  date_created: string;
  supplier_id: number | null;
  relations: Supplier | Supplier[] | null;
  stock: StockRow[];
}

interface RelationOption {
  relation_id: number;
  name: string;
}

interface CategoryOption {
  category_id: number;
  category_name: string;
}

interface UnitOption {
  unit_id: number;
  unit_name: string;
  unit_symbol: string;
}

interface ProductFormData {
  product_name: string;
  barcode: string;
  category: string;
  unit: string;
  status: string;
  supplier_id: string;
}

type SortKey = 'product_name' | 'product_id' | 'date_created';
type SortDir = 'asc' | 'desc';

const STATUS_COLORS: Record<string, string> = {
  Active:   'badge-green',
  Inactive: 'badge-red',
  Archived: 'badge-gray',
  Expired:  'badge-expired',
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const MAX_CATEGORIES = 10;

const EMPTY_FORM: ProductFormData = {
  product_name: '',
  barcode: '',
  category: '',
  unit: '',
  status: 'Active',
  supplier_id: '',
};

// ── Helper Functions ─────────────────────────────────────────────────────────
const checkAndUpdateExpiredStatus = async (productId: number, currentStatus: string) => {
  if (currentStatus === 'Expired') return currentStatus;
  
  const { data: stockData } = await supabase
    .from('stock')
    .select('expiration_date')
    .eq('product_id', productId)
    .order('expiration_date', { ascending: true })
    .limit(1);
  
  if (stockData && stockData[0]?.expiration_date) {
    const expiryDate = new Date(stockData[0].expiration_date);
    const today = new Date();
    
    if (expiryDate < today) {
      await supabase
        .from('product')
        .update({ status: 'Expired' })
        .eq('product_id', productId);
      return 'Expired';
    }
  }
  return currentStatus;
};

const getTotalStockValue = (stock: StockRow[]): number => {
  return stock.reduce((total, item) => total + (item.quantity * item.unit_cost), 0);
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function ProductPage() {
  const [products, setProducts]         = useState<Product[]>([]);
  const [filtered, setFiltered]         = useState<Product[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [hideInactive, setHideInactive] = useState(false);

  // ── Sort ─────────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>('date_created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // ── View Modal ────────────────────────────────────────────────────────────
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // ── Add / Edit Modal ──────────────────────────────────────────────────────
  const [formMode, setFormMode]       = useState<'add' | 'edit' | null>(null);
  const [formData, setFormData]       = useState<ProductFormData>(EMPTY_FORM);
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);
  const [suppliers, setSuppliers]     = useState<RelationOption[]>([]);
  
  // ── Categories & Units ─────────────────────────────────────────────────────
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  
  // ── Stock In ──────────────────────────────────────────────────────────────
  const [stockInOpen, setStockInOpen] = useState(false);
  const [selectedStockProduct, setSelectedStockProduct] = useState<Product | null>(null);
  const [stockInData, setStockInData] = useState({
    quantity: 0,
    unit_cost: 0,
    expiration_date: '',
    location_id: '',
    product_type: 'S1'
  });
  const [locations, setLocations] = useState<Array<{location_id: number; warehouse_name: string}>>([]);
  const [stockInLoading, setStockInLoading] = useState(false);

  // ── Barcode Scanner ───────────────────────────────────────────────────────
  const [scanOpen, setScanOpen]   = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannerReady, setScannerReady] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const scannerContainerId = 'qr-scanner-mount';

  // ── Import ────────────────────────────────────────────────────────────────
  const [importOpen, setImportOpen]       = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult]   = useState<{ ok: number; fail: number } | null>(null);
  const [importError, setImportError]     = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // ── Export dropdown ───────────────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // ── Pagination ────────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize]       = useState(10);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { setCurrentPage(1); }, [search, statusFilter, pageSize, sortKey, sortDir, hideInactive]);

  useEffect(() => { 
    fetchProducts(); 
    fetchSuppliers();
    fetchCategories();
    fetchUnits();
    fetchLocations();
  }, []);
  
  useEffect(() => { applyFilters(); }, [products, search, statusFilter, sortKey, sortDir, hideInactive]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      destroyScanner();
    };
  }, []);

  // Initialize scanner when modal opens and DOM is ready
  useEffect(() => {
    if (scanOpen && !scanError) {
      const timer = setTimeout(() => {
        initScanner();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [scanOpen, scannerReady]);

  // ── Fetch Functions ────────────────────────────────────────────────────────
  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('product')
      .select(`
        product_id, product_name, barcode, category, unit, status, date_created, supplier_id,
        relations!supplier_id(name, relation_type),
        stock(quantity, unit_cost, expiration_date)
      `)
      .order('date_created', { ascending: false });
    
    if (!error && data) {
      const updatedProducts = await Promise.all(
        (data as unknown as Product[]).map(async (product) => {
          const newStatus = await checkAndUpdateExpiredStatus(product.product_id, product.status);
          return { ...product, status: newStatus };
        })
      );
      setProducts(updatedProducts);
    }
    setLoading(false);
  };

  const fetchSuppliers = async () => {
    const { data } = await supabase
      .from('relations')
      .select('relation_id, name')
      .in('relation_type', ['Supplier', 'Both'])
      .eq('status', 'Active')
      .order('name');
    if (data) setSuppliers(data as RelationOption[]);
  };

  const fetchCategories = async () => {
    const { data } = await supabase
      .from('categories')
      .select('category_id, category_name')
      .order('category_name');
    if (data) setCategories(data);
  };

  const fetchUnits = async () => {
    const { data } = await supabase
      .from('units')
      .select('unit_id, unit_name, unit_symbol')
      .order('unit_name');
    if (data) setUnits(data);
  };

  const fetchLocations = async () => {
    const { data } = await supabase
      .from('location')
      .select('location_id, warehouse_name')
      .eq('status', 'Active');
    if (data) setLocations(data);
  };

  const addNewCategory = async () => {
    if (!newCategory.trim()) {
      setCategoryError('Category name is required');
      return;
    }
    
    if (categories.length >= MAX_CATEGORIES) {
      setCategoryError(`Maximum of ${MAX_CATEGORIES} categories reached`);
      return;
    }
    
    const { data, error } = await supabase
      .from('categories')
      .insert([{ category_name: newCategory.trim() }])
      .select()
      .single();
    
    if (error) {
      setCategoryError(error.message);
    } else {
      setCategories([...categories, data]);
      setFormData(prev => ({ ...prev, category: data.category_name }));
      setNewCategory('');
      setShowAddCategory(false);
      setCategoryError(null);
    }
  };

  const handleStockIn = async () => {
    if (!selectedStockProduct) return;
    
    setStockInLoading(true);
    setFormError(null);
    
    try {
      const { data: transaction, error: transError } = await supabase
        .from('transactions')
        .insert([{
          type: 'PURCHASE',
          relation_id: selectedStockProduct.supplier_id,
          processed_by: 1,
          reference_no: `PO-${Date.now()}`
        }])
        .select()
        .single();
      
      if (transError) throw transError;
      
      const { data: stockItem, error: stockError } = await supabase
        .from('stock')
        .insert([{
          product_id: selectedStockProduct.product_id,
          location_id: stockInData.location_id ? parseInt(stockInData.location_id) : null,
          product_type: stockInData.product_type,
          quantity: stockInData.quantity,
          unit_cost: stockInData.unit_cost,
          expiration_date: stockInData.expiration_date || null,
          status: 'Available'
        }])
        .select()
        .single();
      
      if (stockError) throw stockError;
      
      const { error: itemError } = await supabase
        .from('transaction_item')
        .insert([{
          transaction_id: transaction.transaction_id,
          stock_id: stockItem.stock_id,
          movement: 'IN',
          quantity: stockInData.quantity,
          price: stockInData.unit_cost,
          total: stockInData.quantity * stockInData.unit_cost
        }]);
      
      if (itemError) throw itemError;
      
      await checkAndUpdateExpiredStatus(selectedStockProduct.product_id, selectedStockProduct.status);
      await fetchProducts();
      setStockInOpen(false);
      setSelectedStockProduct(null);
      setStockInData({ quantity: 0, unit_cost: 0, expiration_date: '', location_id: '', product_type: 'S1' });
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setStockInLoading(false);
    }
  };

  const applyFilters = () => {
    let result = [...products];
    if (hideInactive) result = result.filter(p => p.status !== 'Inactive');
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(p =>
        p.product_name?.toLowerCase().includes(s) ||
        p.barcode?.toLowerCase().includes(s) ||
        p.category?.toLowerCase().includes(s) ||
        getSupplierName(p)?.toLowerCase().includes(s)
      );
    }
    if (statusFilter !== 'All') result = result.filter(p => p.status === statusFilter);
    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'product_name') cmp = (a.product_name ?? '').localeCompare(b.product_name ?? '');
      else if (sortKey === 'product_id') cmp = a.product_id - b.product_id;
      else cmp = new Date(a.date_created).getTime() - new Date(b.date_created).getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });
    setFiltered(result);
  };

  // ── Scanner helpers ───────────────────────────────────────────────────────
  const destroyScanner = () => {
    if (scannerRef.current) {
      try {
        scannerRef.current.clear();
      } catch (_) {
        // ignore errors during cleanup
      }
      scannerRef.current = null;
    }
  };

  const initScanner = () => {
    const el = document.getElementById(scannerContainerId);
    if (!el) {
      setScanError('Scanner container could not be found. Please try again.');
      return;
    }

    destroyScanner();

    try {
      const scanner = new Html5QrcodeScanner(
        scannerContainerId,
        {
          fps: 10,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(minEdge * 0.7);
            return { width: size, height: Math.floor(size * 0.6) };
          },
          aspectRatio: window.innerWidth <= 480 ? 1.0 : 1.333,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ],
          rememberLastUsedCamera: true,
          showTorchButtonIfSupported: true,
        },
        false
      );

      scanner.render(
        (decodedText: string) => {
          setFormData(prev => ({ ...prev, barcode: decodedText }));
          closeScanner();
        },
        (errorMessage: string) => {
          if (
            errorMessage &&
            !errorMessage.includes('NotFoundException') &&
            !errorMessage.includes('No MultiFormat Readers')
          ) {
            console.debug('Scan decode error:', errorMessage);
          }
        }
      );

      scannerRef.current = scanner;
    } catch (err: any) {
      console.error('Scanner init error:', err);
      setScanError(
        err?.message?.includes('permission') || err?.message?.includes('Permission')
          ? 'Camera permission was denied. Please allow camera access and try again.'
          : err?.message || 'Failed to start the scanner. Please try again.'
      );
    }
  };

  const openScanner = () => {
    setScanError(null);
    setScannerReady(false);
    setScanOpen(true);
    setTimeout(() => setScannerReady(true), 50);
  };

  const closeScanner = () => {
    destroyScanner();
    setScanOpen(false);
    setScanError(null);
    setScannerReady(false);
  };

  const retryScanner = () => {
    setScanError(null);
    setScannerReady(false);
    setTimeout(() => setScannerReady(true), 100);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getSupplierName = (p: Product): string | null => {
    if (!p.relations) return null;
    if (Array.isArray(p.relations)) return p.relations[0]?.name ?? null;
    return (p.relations as Supplier).name ?? null;
  };
  
  const getTotalQty = (p: Product) => p.stock?.reduce((s, r) => s + (r.quantity ?? 0), 0) ?? 0;
  
  const getAvgCost = (p: Product) => {
    if (!p.stock?.length) return null;
    return p.stock.reduce((s, r) => s + (r.unit_cost ?? 0), 0) / p.stock.length;
  };
  
  const formatDate = (d: string) =>
    new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

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

  const totalProducts = filtered.length;
  const activeCount = filtered.filter(p => p.status === 'Active').length;
  const startItem = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, filtered.length);

  const SORT_LABELS: Record<string, string> = {
    'product_name-asc':  'Name A → Z',
    'product_name-desc': 'Name Z → A',
    'product_id-asc':    'ID Ascending',
    'product_id-desc':   'ID Descending',
    'date_created-desc': 'Date Newest',
    'date_created-asc':  'Date Oldest',
  };
  
  const applySort = (key: SortKey, dir: SortDir) => { setSortKey(key); setSortDir(dir); setSortOpen(false); };

  // ── Form handlers ─────────────────────────────────────────────────────────
  const openAddForm = () => { setFormData(EMPTY_FORM); setEditingId(null); setFormError(null); setFormMode('add'); };
  
  const openEditForm = (p: Product) => {
    setFormData({ 
      product_name: p.product_name ?? '', 
      barcode: p.barcode ?? '', 
      category: p.category ?? '',
      unit: p.unit ?? '', 
      status: p.status ?? 'Active', 
      supplier_id: p.supplier_id?.toString() ?? '' 
    });
    setEditingId(p.product_id);
    setFormError(null);
    setFormMode('edit');
    setSelectedProduct(null);
  };
  
  const closeForm = () => { setFormMode(null); setFormError(null); };
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  
  const handleFormSubmit = async () => {
    setFormError(null);
    if (!formData.product_name.trim()) { setFormError('Product name is required.'); return; }
    setFormLoading(true);
    const payload = {
      product_name: formData.product_name.trim(), 
      barcode: formData.barcode.trim() || null,
      category: formData.category.trim() || null, 
      unit: formData.unit.trim() || null,
      status: formData.status, 
      supplier_id: formData.supplier_id ? Number(formData.supplier_id) : null,
    };
    const { error } = formMode === 'add'
      ? await supabase.from('product').insert([payload])
      : await supabase.from('product').update(payload).eq('product_id', editingId);
    setFormLoading(false);
    if (error) { setFormError(error.code === '23505' ? 'A product with this barcode already exists.' : error.message); return; }
    closeForm(); fetchProducts();
  };

  // ── Import CSV / Excel ────────────────────────────────────────────────────
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true); setImportError(null); setImportResult(null);
    try {
      let rows: Record<string, string>[] = [];
      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(Boolean);
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
        rows = lines.slice(1).map(line => {
          const vals = line.split(',');
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim().replace(/^"|"$/g, ''); });
          return obj;
        });
      } else {
        if (!(window as any).XLSX) {
          await new Promise<void>((res, rej) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            s.onload = () => res(); s.onerror = () => rej(new Error('XLSX load failed'));
            document.head.appendChild(s);
          });
        }
        const XLSX = (window as any).XLSX;
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
        rows = raw.map(r => {
          const norm: Record<string, string> = {};
          for (const k of Object.keys(r)) norm[k.trim().toLowerCase().replace(/\s+/g, '_')] = String(r[k]).trim();
          return norm;
        });
      }
      let ok = 0, fail = 0;
      for (const row of rows) {
        if (!row.product_name) { fail++; continue; }
        const payload = {
          product_name: row.product_name, 
          barcode: row.barcode || null,
          category: row.category || null, 
          unit: row.unit || null,
          status: row.status || 'Active',
          supplier_id: row.supplier_id ? Number(row.supplier_id) : null,
        };
        const { error } = await supabase.from('product').insert([payload]);
        error ? fail++ : ok++;
      }
      setImportResult({ ok, fail });
      if (ok > 0) fetchProducts();
    } catch (err: any) {
      setImportError(err.message ?? 'Import failed.');
    } finally {
      setImportLoading(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  // ── Export helpers ────────────────────────────────────────────────────────
  const exportData = filtered.map(p => ({
    ID: p.product_id, 
    'Product Name': p.product_name, 
    Barcode: p.barcode ?? '',
    Category: p.category ?? '', 
    Unit: p.unit ?? '', 
    Status: p.status,
    Supplier: getSupplierName(p) ?? '', 
    'Total Qty': getTotalQty(p),
    'Total Value': getTotalStockValue(p.stock).toFixed(2),
    'Avg Cost': getAvgCost(p)?.toFixed(2) ?? '', 
    'Date Added': p.date_created ? formatDate(p.date_created) : '',
  }));

  const triggerDownload = (name: string, type: string, content: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; a.click();
  };

  const exportCSV = () => {
    const headers = Object.keys(exportData[0] ?? {});
    const csv = [headers.join(','), ...exportData.map(row => headers.map(h => `"${(row as any)[h]}"`).join(','))].join('\n');
    triggerDownload('products.csv', 'text/csv', csv);
    setExportOpen(false);
  };

  const exportExcel = async () => {
    if (!(window as any).XLSX) {
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = () => res(); s.onerror = () => rej();
        document.head.appendChild(s);
      });
    }
    const XLSX = (window as any).XLSX;
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    XLSX.writeFile(wb, 'products.xlsx');
    setExportOpen(false);
  };

  const exportPDF = async () => {
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
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16); doc.setTextColor(27, 60, 83);
    doc.text('Product List', 14, 16);
    doc.setFontSize(9); doc.setTextColor(120, 140, 160);
    doc.text(`Exported: ${new Date().toLocaleString()}   Total: ${filtered.length} products`, 14, 23);
    const cols = ['ID','Product Name','Barcode','Category','Unit','Status','Supplier','Qty','Total Value','Avg Cost','Date Added'];
    const rows = exportData.map(r => [
      r.ID, r['Product Name'], r.Barcode, r.Category, r.Unit, r.Status,
      r.Supplier, r['Total Qty'], r['Total Value'], r['Avg Cost'] ? `₱${r['Avg Cost']}` : '', r['Date Added'],
    ]);
    (doc as any).autoTable({
      head: [cols], body: rows, startY: 28,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [27, 60, 83], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 247, 250] },
      margin: { left: 14, right: 14 },
    });
    doc.save('products.pdf');
    setExportOpen(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="product-page">

      {/* ── IMPORT MODAL ────────────────────────────────────────────────── */}
      {importOpen && (
        <div className="modal-overlay" onClick={() => { if (!importLoading) setImportOpen(false); }}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-left">
                <span className="modal-tag">Import Products</span>
                <h2 className="modal-title">Upload CSV or Excel</h2>
              </div>
              <button className="modal-close" onClick={() => setImportOpen(false)} disabled={importLoading}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="form-body">
              <div className="import-hint">
                <strong>Required column:</strong> <code>product_name</code><br />
                <strong>Optional:</strong> <code>barcode</code>, <code>category</code>, <code>unit</code>, <code>status</code>, <code>supplier_id</code>
              </div>
              {importError && (
                <div className="form-error">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {importError}
                </div>
              )}
              {importResult && (
                <div className={`import-result ${importResult.fail > 0 ? 'partial' : 'success'}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {importResult.ok} product{importResult.ok !== 1 ? 's' : ''} imported.
                  {importResult.fail > 0 && ` ${importResult.fail} row(s) skipped (missing name or duplicate barcode).`}
                </div>
              )}
              <label className="import-drop" onClick={() => importFileRef.current?.click()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>{importLoading ? 'Importing…' : 'Click to select .csv or .xlsx file'}</span>
                <input ref={importFileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
                  onChange={handleImportFile} disabled={importLoading} />
              </label>
            </div>
            <div className="modal-footer">
              <button className="modal-btn-close" onClick={() => setImportOpen(false)} disabled={importLoading}>
                {importResult ? 'Done' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD / EDIT FORM MODAL ──────────────────────────────────────── */}
      {formMode && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-left">
                <span className="modal-tag">{formMode === 'add' ? 'New Product' : 'Edit Product'}</span>
                <h2 className="modal-title">{formMode === 'add' ? 'Add Product' : formData.product_name || 'Edit Product'}</h2>
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
              <div className="form-field">
                <label className="form-label">Product Name <span className="form-required">*</span></label>
                <input className="form-input" name="product_name" value={formData.product_name}
                  onChange={handleFormChange} placeholder="e.g. Scalpel Handle" autoFocus />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label className="form-label">Barcode</label>
                  <div className="barcode-input-wrap">
                    <input className="form-input mono barcode-input" name="barcode" value={formData.barcode}
                      onChange={handleFormChange} placeholder="e.g. SCAL001" />
                    <button type="button" className="scan-btn" title="Scan barcode or QR code" onClick={openScanner}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
                        <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
                        <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
                        <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                        <rect x="7" y="7" width="3" height="3"/>
                        <rect x="14" y="7" width="3" height="3"/>
                        <rect x="7" y="14" width="3" height="3"/>
                        <line x1="14" y1="14" x2="17" y2="14"/>
                        <line x1="17" y1="14" x2="17" y2="17"/>
                        <line x1="14" y1="17" x2="14" y2="17"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="form-field">
                  <label className="form-label">Category</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select 
                      className="form-select" 
                      name="category" 
                      value={formData.category} 
                      onChange={handleFormChange}
                      style={{ flex: 1 }}
                    >
                      <option value="">— Select Category —</option>
                      {categories.map(cat => (
                        <option key={cat.category_id} value={cat.category_name}>{cat.category_name}</option>
                      ))}
                    </select>
                    <button 
                      type="button" 
                      className="scan-btn" 
                      onClick={() => setShowAddCategory(true)}
                      title="Add new category"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                    </button>
                  </div>
                  {categories.length >= MAX_CATEGORIES && (
                    <small style={{ color: '#d97706', fontSize: '0.7rem' }}>
                      Maximum of {MAX_CATEGORIES} categories reached
                    </small>
                  )}
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label className="form-label">Unit</label>
                  <select 
                    className="form-select" 
                    name="unit" 
                    value={formData.unit} 
                    onChange={handleFormChange}
                  >
                    <option value="">— Select Unit —</option>
                    {units.map(unit => (
                      <option key={unit.unit_id} value={unit.unit_name}>
                        {unit.unit_name} {unit.unit_symbol && `(${unit.unit_symbol})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label className="form-label">Status</label>
                  <select className="form-select" name="status" value={formData.status} onChange={handleFormChange}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Archived">Archived</option>
                  </select>
                </div>
              </div>
              <div className="form-field">
                <label className="form-label">Supplier</label>
                <select className="form-select" name="supplier_id" value={formData.supplier_id} onChange={handleFormChange}>
                  <option value="">— No Supplier —</option>
                  {suppliers.map(s => (
                    <option key={s.relation_id} value={s.relation_id}>{s.name}</option>
                  ))}
                </select>
              </div>
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
                    {formMode === 'add' ? 'Add Product' : 'Save Changes'}
                  </>
                )}
              </button>
              <button className="modal-btn-close" onClick={closeForm} disabled={formLoading}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD CATEGORY MODAL ───────────────────────────────────────────── */}
      {showAddCategory && (
        <div className="modal-overlay" onClick={() => setShowAddCategory(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <div className="modal-header-left">
                <span className="modal-tag">Categories</span>
                <h2 className="modal-title">Add New Category</h2>
              </div>
              <button className="modal-close" onClick={() => setShowAddCategory(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="form-body">
              {categoryError && (
                <div className="form-error">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {categoryError}
                </div>
              )}
              <div className="form-field">
                <label className="form-label">Category Name *</label>
                <input 
                  className="form-input" 
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  placeholder="e.g., Surgical, Diagnostic, PPE"
                  autoFocus
                />
                <small style={{ color: '#7a8fa0' }}>
                  {categories.length}/{MAX_CATEGORIES} categories used
                </small>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn-edit" onClick={addNewCategory}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Category
              </button>
              <button className="modal-btn-close" onClick={() => setShowAddCategory(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── STOCK IN MODAL ───────────────────────────────────────────────── */}
      {stockInOpen && selectedStockProduct && (
        <div className="modal-overlay" onClick={() => !stockInLoading && setStockInOpen(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-left">
                <span className="modal-tag">Stock In</span>
                <h2 className="modal-title">Add Stock: {selectedStockProduct.product_name}</h2>
              </div>
              <button className="modal-close" onClick={() => setStockInOpen(false)} disabled={stockInLoading}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="form-body">
              {formError && (
                <div className="form-error">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {formError}
                </div>
              )}
              <div className="form-row">
                <div className="form-field">
                  <label className="form-label">Quantity *</label>
                  <input 
                    className="form-input" 
                    type="number" 
                    value={stockInData.quantity}
                    onChange={e => setStockInData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                    placeholder="e.g., 100"
                    disabled={stockInLoading}
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">Unit Cost (₱) *</label>
                  <input 
                    className="form-input" 
                    type="number" 
                    step="0.01"
                    value={stockInData.unit_cost}
                    onChange={e => setStockInData(prev => ({ ...prev, unit_cost: parseFloat(e.target.value) || 0 }))}
                    placeholder="e.g., 50.00"
                    disabled={stockInLoading}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label className="form-label">Expiration Date</label>
                  <input 
                    className="form-input" 
                    type="date"
                    value={stockInData.expiration_date}
                    onChange={e => setStockInData(prev => ({ ...prev, expiration_date: e.target.value }))}
                    disabled={stockInLoading}
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">Stock Type</label>
                  <select 
                    className="form-select"
                    value={stockInData.product_type}
                    onChange={e => setStockInData(prev => ({ ...prev, product_type: e.target.value }))}
                    disabled={stockInLoading}
                  >
                    <option value="S1">Standard (S1)</option>
                    <option value="Bidding">Bidding</option>
                  </select>
                </div>
              </div>
              <div className="form-field">
                <label className="form-label">Location</label>
                <select 
                  className="form-select"
                  value={stockInData.location_id}
                  onChange={e => setStockInData(prev => ({ ...prev, location_id: e.target.value }))}
                  disabled={stockInLoading}
                >
                  <option value="">— No Location —</option>
                  {locations.map(loc => (
                    <option key={loc.location_id} value={loc.location_id}>{loc.warehouse_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-info">
                <strong>Total Value:</strong> ₱{(stockInData.quantity * stockInData.unit_cost).toFixed(2)}
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn-edit" onClick={handleStockIn} disabled={stockInLoading || !stockInData.quantity || !stockInData.unit_cost}>
                {stockInLoading ? (
                  <><span className="btn-spinner" />Adding Stock…</>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add Stock
                  </>
                )}
              </button>
              <button className="modal-btn-close" onClick={() => setStockInOpen(false)} disabled={stockInLoading}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW MODAL ─────────────────────────────────────────────────── */}
      {selectedProduct && (
        <div className="modal-overlay" onClick={() => setSelectedProduct(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-left">
                <span className="modal-tag">Product Details</span>
                <h2 className="modal-title">{selectedProduct.product_name}</h2>
              </div>
              <button className="modal-close" onClick={() => setSelectedProduct(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="modal-status-row">
              <span className={`badge ${STATUS_COLORS[selectedProduct.status] ?? 'badge-gray'}`}>{selectedProduct.status}</span>
              <span className="modal-id">ID #{selectedProduct.product_id}</span>
            </div>
            <div className="modal-grid">
              <div className="modal-field"><span className="modal-label">Barcode</span><span className="modal-value mono">{selectedProduct.barcode ?? '—'}</span></div>
              <div className="modal-field"><span className="modal-label">Category</span><span className="modal-value">{selectedProduct.category ?? '—'}</span></div>
              <div className="modal-field"><span className="modal-label">Unit</span><span className="modal-value">{selectedProduct.unit ?? '—'}</span></div>
              <div className="modal-field"><span className="modal-label">Supplier</span><span className="modal-value">{getSupplierName(selectedProduct) ?? '—'}</span></div>
              <div className="modal-field">
                <span className="modal-label">Total Qty</span>
                <span className={`modal-value bold ${getTotalQty(selectedProduct) === 0 ? 'color-red' : getTotalQty(selectedProduct) < 10 ? 'color-amber' : 'color-green'}`}>
                  {getTotalQty(selectedProduct)}
                </span>
              </div>
              <div className="modal-field">
                <span className="modal-label">Total Value</span>
                <span className="modal-value bold color-green">₱{getTotalStockValue(selectedProduct.stock).toFixed(2)}</span>
              </div>
              <div className="modal-field">
                <span className="modal-label">Avg Unit Cost</span>
                <span className="modal-value bold">{getAvgCost(selectedProduct) !== null ? `₱${getAvgCost(selectedProduct)!.toFixed(2)}` : '—'}</span>
              </div>
              <div className="modal-field full">
                <span className="modal-label">Date Added</span>
                <span className="modal-value">{selectedProduct.date_created ? formatDate(selectedProduct.date_created) : '—'}</span>
              </div>
            </div>
            {selectedProduct.stock?.length > 0 && (
              <div className="modal-stock-section">
                <p className="modal-section-title">Stock Breakdown</p>
                <div className="modal-stock-table-wrap">
                  <table className="modal-stock-table">
                    <thead>
                      <tr><th>#</th><th>Quantity</th><th>Unit Cost</th><th>Total Value</th><th>Expires</th></tr>
                    </thead>
                    <tbody>
                      {selectedProduct.stock.map((s, i) => (
                        <tr key={i}>
                          <td className="muted">{i + 1}</td>
                          <td><strong>{s.quantity}</strong></td>
                          <td>₱{s.unit_cost?.toFixed(2) ?? '—'}</td>
                          <td>₱{((s.quantity ?? 0) * (s.unit_cost ?? 0)).toFixed(2)}</td>
                          <td>{s.expiration_date ? new Date(s.expiration_date).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="modal-footer">
              <button className="modal-btn-edit" onClick={() => openEditForm(selectedProduct)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit Product
              </button>
              <button className="modal-btn-close" onClick={() => setSelectedProduct(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── SCANNER MODAL ─────────────────────────────────────────────── */}
      {scanOpen && (
        <div className="modal-overlay scanner-modal-overlay" onClick={closeScanner}>
          <div className="modal-card scanner-modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-left">
                <span className="modal-tag">Barcode / QR Scanner</span>
                <h2 className="modal-title">Scan Product Code</h2>
              </div>
              <button className="modal-close" onClick={closeScanner}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="scanner-body">
              {scanError ? (
                <div className="scan-error-box">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <p>{scanError}</p>
                  <button className="retry-btn" onClick={retryScanner}>Try Again</button>
                </div>
              ) : (
                <div className="scanner-viewport">
                  <div id={scannerContainerId} className="scanner-mount" />
                </div>
              )}
              <p className="scanner-hint">
                Point the camera at a barcode or QR code. It will scan automatically.
              </p>
            </div>

            <div className="modal-footer">
              <button className="modal-btn-close" onClick={closeScanner}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ────────────────────────────────────────────────────── */}
      <div className="product-header">
        <div className="product-header-left">
          <h1 className="product-title">Product Management</h1>
          <p className="product-subtitle">Manage products, track inventory, and monitor stock levels</p>
        </div>
        <button className="product-refresh-btn" onClick={fetchProducts}>
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
          <input className="product-search" placeholder="Search by name, barcode, category, supplier..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <select className="product-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="All">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Archived">Archived</option>
          <option value="Expired">Expired</option>
        </select>

        {/* Sort dropdown */}
        <div className="sort-dropdown-wrap" ref={sortRef}>
          <button className={`product-action-btn sort-btn${sortOpen ? ' open' : ''}`} onClick={() => setSortOpen(v => !v)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14}}>
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/>
            </svg>
            {SORT_LABELS[`${sortKey}-${sortDir}`]}
            <svg className={`chevron${sortOpen ? ' flipped' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13}}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {sortOpen && (
            <div className="sort-dropdown">
              <div className="sort-group-label">Alphabetical</div>
              <button className={`sort-option${sortKey==='product_name'&&sortDir==='asc'?' active':''}`} onClick={() => applySort('product_name','asc')}>↑ Name A → Z</button>
              <button className={`sort-option${sortKey==='product_name'&&sortDir==='desc'?' active':''}`} onClick={() => applySort('product_name','desc')}>↓ Name Z → A</button>
              <div className="sort-group-label">By Product ID</div>
              <button className={`sort-option${sortKey==='product_id'&&sortDir==='asc'?' active':''}`} onClick={() => applySort('product_id','asc')}>↑ ID Ascending</button>
              <button className={`sort-option${sortKey==='product_id'&&sortDir==='desc'?' active':''}`} onClick={() => applySort('product_id','desc')}>↓ ID Descending</button>
              <div className="sort-group-label">By Date Added</div>
              <button className={`sort-option${sortKey==='date_created'&&sortDir==='desc'?' active':''}`} onClick={() => applySort('date_created','desc')}>↓ Newest First</button>
              <button className={`sort-option${sortKey==='date_created'&&sortDir==='asc'?' active':''}`} onClick={() => applySort('date_created','asc')}>↑ Oldest First</button>
              <div className="sort-divider" />
              <label className="sort-toggle">
                <input type="checkbox" checked={hideInactive} onChange={e => { setHideInactive(e.target.checked); setSortOpen(false); }} />
                Hide Inactive products
              </label>
            </div>
          )}
        </div>

        <div className="product-filter-actions">
          {/* Import */}
          <button className="product-action-btn" onClick={() => { setImportResult(null); setImportError(null); setImportOpen(true); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13,marginRight:5}}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import
          </button>

          {/* Export dropdown */}
          <div className="sort-dropdown-wrap" ref={exportRef}>
            <button className="product-action-btn" onClick={() => setExportOpen(v => !v)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13,marginRight:5}}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export
              <svg className={`chevron${exportOpen ? ' flipped' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13}}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {exportOpen && (
              <div className="sort-dropdown export-dropdown">
                <button className="sort-option" onClick={exportCSV}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14}}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  Export as CSV
                </button>
                <button className="sort-option" onClick={exportExcel}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14}}>
                    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9l6 6M15 9l-6 6"/>
                  </svg>
                  Export as Excel
                </button>
                <button className="sort-option" onClick={exportPDF}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14}}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                  Export as PDF
                </button>
              </div>
            )}
          </div>

          <button className="product-action-btn primary" onClick={openAddForm}>+ Add Product</button>
        </div>
      </div>

      {/* Stats */}
      <div className="product-stats">
        <div className="stat-chip"><span className="stat-num">{totalProducts}</span><span className="stat-label">Total Products</span></div>
        <div className="stat-chip"><span className="stat-num green">{activeCount}</span><span className="stat-label">Active</span></div>
        <div className="stat-chip"><span className="stat-num">{filtered.filter(p => p.status === 'Expired').length}</span><span className="stat-label">Expired</span></div>
        <div className="stat-chip"><span className="stat-num amber">₱{filtered.reduce((sum, p) => sum + getTotalStockValue(p.stock), 0).toFixed(2)}</span><span className="stat-label">Total Value</span></div>
      </div>

      {/* Table */}
      <div className="product-table-wrap">
        {loading ? (
          <div className="product-loading"><span className="product-spinner" /><p>Loading products...</p></div>
        ) : filtered.length === 0 ? (
          <div className="product-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
            </svg>
            <p>No products found</p>
          </div>
        ) : (
          <>
            <div className="product-table-scroll">
              <table className="product-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Barcode</th>
                    <th>Product Name</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Total Stock</th>
                    <th>Total Value</th>
                    <th>Date Added</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(p => (
                    <tr key={p.product_id}>
                      <td className="td-id">#{p.product_id}</td>
                      <td className="td-mono">{p.barcode ?? '—'}</td>
                      <td className="td-name">{p.product_name}</td>
                      <td>{p.category ?? '—'}</td>
                      <td><span className={`badge ${STATUS_COLORS[p.status] ?? 'badge-gray'}`}>{p.status}</span></td>
                      <td className="td-stock">{getTotalQty(p)}</td>
                      <td className="td-value">₱{getTotalStockValue(p.stock).toFixed(2)}</td>
                      <td className="td-date">{p.date_created ? formatDate(p.date_created) : '—'}</td>
                      <td className="td-actions">
                        <button className="icon-btn view" title="View details" onClick={() => setSelectedProduct(p)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                          </svg>
                        </button>
                        <button className="icon-btn edit" title="Edit product" onClick={() => openEditForm(p)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button className="icon-btn stockin-btn" title="Add Stock" onClick={() => {
                          setSelectedStockProduct(p);
                          setStockInOpen(true);
                        }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="product-pagination">
              <span className="pagination-info">
                Showing <strong>{startItem}–{endItem}</strong> of <strong>{filtered.length}</strong> products
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