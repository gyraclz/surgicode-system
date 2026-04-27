import React, { useState } from "react";
import Login from "./pages/Login";

import { AdminDashboard } from "./pages/dashboards/AdminDashboard";
import { WarehouseDashboard } from "./pages/dashboards/WarehouseDashboard";
import { SalesDashboard } from "./pages/dashboards/SalesDashboard";

const App: React.FC = () => {
  const [role, setRole] = useState<"" | "admin" | "warehouse" | "sales">("");

  const handleLogin = (username: string) => {
    const user = username.toLowerCase();

    if (user === "admin" || user === "warehouse" || user === "sales") {
      setRole(user);
    } else {
      alert("Invalid login. Use: admin / warehouse / sales");
    }
  };

  const logout = () => setRole("");

  if (!role) return <Login onLogin={handleLogin} />;

  return (
    <>
      {role === "admin" && <AdminDashboard onLogout={logout} />}
      {role === "warehouse" && <WarehouseDashboard onLogout={logout} />}
      {role === "sales" && <SalesDashboard onLogout={logout} />}
    </>
  );
};

export default App;
