import { NavLink, Outlet } from 'react-router-dom'
import { ChatPanel } from '../chat/ChatPanel'
import { useConfig } from '../../context/ConfigContext'

const NAV = [
  { to: '/', label: 'Workspace', end: true },
  { to: '/styles', label: 'Styles' },
  { to: '/setup', label: 'Setup' },
]

export function AppShell() {
  const { config } = useConfig()
  return (
    <div className="shell">
      <nav className="nav">
        <div>
          <div className="brand-serif">VINCE</div>
          <div className="brand-sub">Product Enrichment</div>
        </div>
        <div className="nav-items">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              {n.label}
            </NavLink>
          ))}
        </div>
        <div className="nav-foot">
          PLM → D365 F&amp;SC
          <br />
          {config.dataSource === 'mock' ? 'Sample data' : 'Live D365'} ·{' '}
          {config.assistant.provider === 'claude-foundry' ? 'Claude (Foundry)' : 'Offline assistant'}
        </div>
      </nav>

      <main className="main">
        <Outlet />
      </main>

      <ChatPanel />
    </div>
  )
}
