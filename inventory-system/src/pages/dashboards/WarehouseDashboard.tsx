import React, { useState } from "react";
import Sidebar from "../../components/Sidebar";
import { FaBox, FaChartLine, FaCog } from "react-icons/fa";

interface Props {
  onLogout: () => void;
}

export const WarehouseDashboard: React.FC<Props> = ({ onLogout }) => {
  const [page, setPage] = useState("inventory");

  const warehouseMenu = [
    { icon: <FaBox />, label: "Inventory", onClick: () => setPage("inventory") },
    { icon: <FaChartLine />, label: "Logs", onClick: () => setPage("logs") },
    { icon: <FaCog />, label: "Settings", onClick: () => setPage("settings") },
  ];

  return (
    <div className="dashboard-body">
      <Sidebar menu={warehouseMenu} onLogout={onLogout} />

      <main className="content">
        <h2>WAREHOUSE DASHBOARD</h2>
        {page === "inventory" && <div className="card">Inventory List Here</div>}
        {page === "logs" && <div className="card">Warehouse Activity Logs</div>}
        {page === "settings" && <div className="card">Settings panel</div>}
      </main>
    </div>
    
    
  );
};

export default WarehouseDashboard;
