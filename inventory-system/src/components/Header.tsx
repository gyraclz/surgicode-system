import React from 'react'


interface Props {
onBurger: () => void
onLogout: () => void
}


const Header: React.FC<Props> = ({ onBurger, onLogout }) => {
return (
<header className="app-header">
<button aria-label="menu" className="burger" onClick={onBurger}>
<span />
<span />
<span />
</button>
<div className="brand">My Dashboard</div>
<div className="header-right">
<button className="btn ghost" onClick={onLogout}>Logout</button>
</div>
</header>
)
}


export default Header