import React, { useState } from "react";
import { FaSignOutAlt } from "react-icons/fa";

interface Props {
    menu: { icon: React.ReactNode; label: string; onClick: () => void }[];

  onLogout: () => void;
}

const Sidebar: React.FC<Props> = ({ menu, onLogout }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside className={`sidebar ${expanded ? "open" : ""}`}>
      {/* burger menu */}
      <div className="burger-wrapper">
        <button className="burger" onClick={() => setExpanded(!expanded)}>
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>

      {/* menu list */}
      <nav>
        <ul>
          {menu.map((m, index) => (
            <li key={index} onClick={m.onClick}>
              <div className="icon">{m.icon}</div>
              {/* 👇 text only visible when expanded */}
              {expanded && <span className="label">{m.label}</span>}
            </li>
          ))}
        </ul>
      </nav>

      {/* Logout Button */}
      <div className="logout" onClick={onLogout}>
        <FaSignOutAlt className="icon" />
        {expanded && <span className="label">Logout</span>}
      </div>
    </aside>
  );
};

export default Sidebar;
