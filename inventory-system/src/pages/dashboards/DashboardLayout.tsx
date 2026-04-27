import React from "react";

interface DashboardLayoutProps {
  sidebar: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  sidebar,
  header,
  children,
}) => {
  return (
    <div className="dashboard-layout">
      {sidebar}

      <div className="dashboard-content">
        {header && header}

        <main className="dashboard-main">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
