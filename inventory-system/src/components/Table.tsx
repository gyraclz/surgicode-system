import React, { useState, useRef } from "react";

const TableWithPriceHistory: React.FC = () => {
  const [notification, setNotification] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // SHOW / HIDE PRICE HISTORY
  const [showPriceHistory, setShowPriceHistory] = useState(false);

  // Notification System
  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(""), 3000);
  };

  // Main Page Functions
  const addNewProduct = () => showNotification("New Product form opened.");
  const applyFilter = (value: string) => console.log("Filter:", value);

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      showNotification(`Imported: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
      event.target.value = "";
    }
  };

  const exportMainTable = () => {
    showNotification("Preparing export...");

    const csv =
      "ID,Name,Value\n1,Alpha,12.50\n2,Beta,99.00\n3,Gamma,45.20";

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "main_table.csv";
    a.click();

    URL.revokeObjectURL(url);
    showNotification("Export complete!");
  };

  // Price History Export
  const exportPriceHistory = () => {
    showNotification("Preparing Price History export...");

    const csv =
      'Price ID,Date,Selling Price,Description,Updated By,Supplier Name,Warehouse Name\n' +
      'P-001,2024-11-15,$19.99,"Q4 introductory price",Jane Doe,"Mega Wholesale Inc.","Main Warehouse A"';

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "price_history.csv";
    a.click();

    URL.revokeObjectURL(url);
    showNotification("Price history exported!");
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial", background: "#f5f5f5" }}>
      {/* CSS */}
      <style>{`
        table { width: 100%; border-collapse: collapse; background: white; }
        th, td { padding: 12px; border-bottom: 1px solid #ddd; text-align: left; }
        th { background: #1e3a8a; color: white; }

        .btn { width: 36px; height: 36px; border:none; border-radius:6px; cursor:pointer; margin-right:4px;
               display:flex; align-items:center; justify-content:center; color:white; }
        .btn-view { background:#2563eb; }
        .btn-view:hover { background:#1d4ed8; }
        .btn-edit { background:#f59e0b; }
        .btn-edit:hover { background:#d97706; }

        .notification-box {
          position: fixed; bottom: 20px; right: 20px; padding: 12px 24px;
          background: #1e3a8a; color:white; border-radius: 8px;
          opacity: 0; transition: opacity 0.4s;
        }
        .notification-show { opacity: 1 !important; }

        /* PRICE HISTORY MODAL */
        .overlay {
          position: fixed; top:0; left:0; width:100%; height:100%;
          background: rgba(0,0,0,0.6); display:flex; justify-content:center;
          align-items:center; z-index:100;
        }
        .price-card {
          width: 90%; max-width: 900px; background:white;
          padding: 24px; border-radius: 16px; position:relative;
        }
        .close-btn {
          position:absolute; top:16px; right:16px;
          background:red; color:white; border:none;
          padding: 6px 14px; border-radius:6px; cursor:pointer;
        }
      `}</style>

      {/* Notification */}
      {notification && <div className="notification-box notification-show">{notification}</div>}

      {/* ─────────────────────────────────── */}
      {/* MAIN TABLE */}
      {/* ─────────────────────────────────── */}
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          background: "white",
          padding: "24px",
          borderRadius: "12px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
        }}
      >
        {/* Search */}
        <input
          type="text"
          placeholder="Search records..."
          onInput={() => showNotification("Search executed.")}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: "8px",
            border: "1px solid #ccc",
            marginBottom: "20px",
          }}
        />

        {/* Actions */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          <button
            onClick={addNewProduct}
            style={{
              flex: 1, padding: "12px", background: "green", color: "white",
              borderRadius: "8px", border: "none", cursor: "pointer"
            }}
          >
            + Add New Product
          </button>

          <input
            type="file"
            ref={fileInputRef}
            accept=".csv,.xlsx"
            style={{ display: "none" }}
            onChange={handleFileImport}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              flex: 1, padding: "12px", background: "white",
              border: "1px solid green", borderRadius: "8px",
              cursor: "pointer", color: "green"
            }}
          >
            Import Excel
          </button>

          <button
            onClick={exportMainTable}
            style={{
              flex: 1, padding: "12px", background: "white",
              border: "1px solid #ccc", borderRadius: "8px",
              cursor: "pointer"
            }}
          >
            Export
          </button>

          <select
            onChange={(e) => applyFilter(e.target.value)}
            style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "1px solid #ccc" }}
          >
            <option value="all">All</option>
            <option value="today">Today</option>
            <option value="week">A Week</option>
            <option value="month">Month</option>
          </select>
        </div>

        {/* Main Table */}
        <table>
          <thead>
            <tr>
              <th>Product ID</th>
              <th>Barcode</th>
              <th>Name</th>
              <th>Category</th>
              <th>Description</th>
              <th>Supplier</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td>001</td>
              <td>BR12345</td>
              <td>Sample Product</td>
              <td>Electronics</td>
              <td>Sample description</td>
              <td>ABC Supplier</td>
              <td>Active</td>
              <td>
                <button
                  className="btn btn-view"
                  title="View Price History"
                  onClick={() => setShowPriceHistory(true)}
                >
                  👁
                </button>

                <button className="btn btn-edit" title="Edit">✏️</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ─────────────────────────────────── */}
      {/* PRICE HISTORY MODAL */}
      {/* ─────────────────────────────────── */}
      {showPriceHistory && (
        <div className="overlay">
          <div className="price-card">
            <button className="close-btn" onClick={() => setShowPriceHistory(false)}>
              Close ✖
            </button>

            <h2 style={{ fontSize: "22px", marginBottom: "16px" }}>
              Product Price History
            </h2>

            {/* Search */}
            <input
              type="text"
              placeholder="Search price history..."
              onInput={() => showNotification("Search executed.")}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid #ccc",
                marginBottom: "14px"
              }}
            />

            {/* Buttons */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
              <button
                onClick={() => showNotification("Add Purchase not implemented.")}
                style={{ flex: 1, padding: "10px", background: "green", color: "white", borderRadius: "8px", border: "none" }}
              >
                + Add Purchase
              </button>

              <button
                onClick={exportPriceHistory}
                style={{ flex: 1, padding: "10px", background: "white", border: "1px solid green", borderRadius: "8px" }}
              >
                Export / Download
              </button>
            </div>

            {/* SCROLLABLE TABLE */}
            <div
              style={{
                maxHeight: "350px",
                overflowY: "auto",
                border: "1px solid #ddd",
                borderRadius: "8px",
              }}
            >
              <table style={{ width: "100%" }}>
                <thead
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#1e3a8a",
                    color: "white",
                    zIndex: 5
                  }}
                >
                  <tr>
                    <th>Price ID</th>
                    <th>Date</th>
                    <th>Selling Price</th>
                    <th>Description</th>
                    <th>Updated By</th>
                    <th>Supplier</th>
                    <th>Warehouse</th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td>P-001</td>
                    <td>2024-11-15</td>
                    <td>$19.99</td>
                    <td>Q4 introductory price</td>
                    <td>Jane Doe</td>
                    <td>Mega Wholesale Inc.</td>
                    <td>Main Warehouse A</td>
                  </tr>

                  {/* DEMO EXTRA ROWS FOR SCROLL */}
                  {[...Array(20)].map((_, i) => (
                    <tr key={i}>
                      <td>P-{i + 2}</td>
                      <td>2024-11-{10 + i}</td>
                      <td>${(19 + i).toFixed(2)}</td>
                      <td>Sample history {i + 2}</td>
                      <td>User {i + 1}</td>
                      <td>Supplier {i + 1}</td>
                      <td>Warehouse {i + 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TableWithPriceHistory;
