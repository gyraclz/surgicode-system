import React, { useState } from "react";
import Sidebar from "../../components/Sidebar";
import TablePage from "../../components/Table";
import "./Dashboard.css"; // ✅ new styling file
import { FaTable, FaChartPie, FaUserCog } from "react-icons/fa";
import DashboardLayout from "../dashboards/DashboardLayout";

interface Props {
  onLogout: () => void;
}

export const AdminDashboard: React.FC<Props> = ({ onLogout }) => {
  const [page, setPage] = useState("all"); // ✅ default = All warehouses

  const adminMenu = [
    { icon: <FaTable />, label: "Overview", onClick: () => setPage("all") },
    { icon: <FaChartPie />, label: "Analytics", onClick: () => setPage("analytics") },
    { icon: <FaUserCog />, label: "Settings", onClick: () => setPage("settings") },
  ];

  return (
    <div className="dashboard-body">
      <Sidebar menu={adminMenu} onLogout={onLogout} />

      <main className="content">

      <DashboardLayout
      sidebar={<></>}
      header={
        <header className="dashboard-header">

          <nav className="dashboard-nav">
            <button className={page === "all" ? "active" : ""} onClick={() => setPage("all")}>
              All Warehouses
            </button>
            <button className={page === "a" ? "active" : ""} onClick={() => setPage("a")}>
              Warehouse A
            </button>
            <button className={page === "b" ? "active" : ""} onClick={() => setPage("b")}>
              Warehouse B
            </button>
            <button className={page === "c" ? "active" : ""} onClick={() => setPage("c")}>
              Warehouse C
            </button>
          </nav>

          <div className="profile">
            <img src="https://ui-avatars.com/api/?name=Admin" />
            <span>Admin</span>
          </div>
        </header>
      }
    >
      <h1>Showing: {page.toUpperCase()}</h1>
    </DashboardLayout>


        {/* ✅ Pages */}
        {page === "all" && <TablePage />}
        {page === "a" && <div className="card">📦 Warehouse A Table</div>}
        {page === "b" && <div className="card">📦 Warehouse B Table</div>}
        {page === "c" && <div className="card">📦 Warehouse C Table</div>}
        {page === "analytics" && <div className="card">Analytics Content</div>}
        {page === "settings" && <div className="card">Admin Settings</div>}
      </main>
    </div>
  );
};

export default AdminDashboard;
