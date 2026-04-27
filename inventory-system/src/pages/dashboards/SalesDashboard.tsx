import React, { useState } from "react";
import Sidebar from "../../components/Sidebar";
import { FaChartLine, FaMoneyBill, FaCog } from "react-icons/fa";

interface Props {
  onLogout: () => void;
}

export const SalesDashboard: React.FC<Props> = ({ onLogout }) => {
  const [page, setPage] = useState("report");

  const salesMenu = [
    { icon: <FaChartLine />, label: "Sales Report", onClick: () => setPage("report") },
    { icon: <FaMoneyBill />, label: "Transactions", onClick: () => setPage("transactions") },
    { icon: <FaCog />, label: "Settings", onClick: () => setPage("settings") },
  ];

  return (
    <div className="dashboard-body">
      <Sidebar menu={salesMenu} onLogout={onLogout} />
      <div className="top-nav"></div>


      <main className="content">
        <h2>SALES DASHBOARD</h2>
        {page === "report" && <div className="card">Daily/Monthly Sales Charts</div>}
        {page === "transactions" && <div className="card">Transaction records</div>}
        {page === "settings" && <div className="card">Settings Page</div>}
      </main>
    </div>
  );
};

export default SalesDashboard;
