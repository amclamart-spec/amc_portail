import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  FiHome,
  FiUsers,
  FiBookOpen,
  FiSettings,
  FiLogOut,
  FiMenu,
  FiX,
  FiUser,
  FiClipboard,
  FiBarChart2,
  FiCreditCard,
  FiShield,
  FiCalendar,
} from 'react-icons/fi';
import { useState } from 'react';
import { ROLE_LABEL } from '../utils/roles';

const navSectionsByRole = {
  SUPER_ADMIN: [
    {
      title: 'Administration',
      items: [
        { path: '/super-admin', icon: FiShield, label: 'Rôles & admins' },
        { path: '/admin', icon: FiBarChart2, label: 'Vue Admin' },
        { path: '/admin/users', icon: FiUsers, label: 'Utilisateurs' },
        { path: '/admin/enrollments', icon: FiClipboard, label: 'Inscriptions' },
      ],
    },
    {
      title: 'Paramètres',
      items: [
        { path: '/admin/settings', icon: FiSettings, label: 'Référentiels' },
        { path: '/admin/salles', icon: FiHome, label: 'Salles' },
        { path: '/admin/creneaux', icon: FiCalendar, label: 'Créneaux' },
        { path: '/admin/niveaux', icon: FiSettings, label: 'Niveaux' },
      ],
    },
    {
      title: 'Pédagogie',
      items: [
        { path: '/admin/classes', icon: FiBookOpen, label: 'Classes' },
        { path: '/admin/professeurs', icon: FiUser, label: 'Professeurs' },
      ],
    },
  ],
  ADMIN: [
    {
      title: 'Administration',
      items: [
        { path: '/admin', icon: FiBarChart2, label: 'Tableau de bord' },
        { path: '/admin/users', icon: FiUsers, label: 'Utilisateurs' },
        { path: '/admin/enrollments', icon: FiClipboard, label: 'Inscriptions' },
      ],
    },
    {
      title: 'Paramètres',
      items: [
        { path: '/admin/settings', icon: FiSettings, label: 'Référentiels' },
        { path: '/admin/salles', icon: FiHome, label: 'Salles' },
        { path: '/admin/creneaux', icon: FiCalendar, label: 'Créneaux' },
        { path: '/admin/niveaux', icon: FiSettings, label: 'Niveaux' },
      ],
    },
    {
      title: 'Pédagogie',
      items: [
        { path: '/admin/classes', icon: FiBookOpen, label: 'Classes' },
        { path: '/admin/professeurs', icon: FiUser, label: 'Professeurs' },
      ],
    },
  ],
  TRESORIER: [
    {
      title: 'Finance',
      items: [
        { path: '/tresorier', icon: FiBarChart2, label: 'KPI financiers' },
        { path: '/tresorier/payments', icon: FiCreditCard, label: 'Paiements' },
      ],
    },
  ],
  PROFESSEUR: [
    {
      title: 'Pédagogie',
      items: [{ path: '/professeur', icon: FiHome, label: 'Mes classes' }],
    },
  ],
  FAMILLE: [
    {
      title: 'Mon espace',
      items: [
        { path: '/famille', icon: FiHome, label: 'Tableau de bord' },
        { path: '/famille/enfants', icon: FiUsers, label: 'Mes enfants' },
        { path: '/famille/inscription', icon: FiBookOpen, label: 'Inscription' },
        { path: '/famille/paiements', icon: FiCreditCard, label: 'Paiements' },
        { path: '/famille/profil', icon: FiUser, label: 'Mon profil' },
      ],
    },
  ],
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sections = navSectionsByRole[user?.role] || [];

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: 260,
          background: 'var(--amc-primary)',
          color: 'var(--amc-white)',
          position: 'fixed',
          top: 0,
          left: sidebarOpen ? 0 : -260,
          height: '100vh',
          transition: 'left 0.3s ease',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
        }}
        className="sidebar-desktop"
      >
        <div style={{ padding: '20px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <img src="/amc_logo.png" alt="AMC" style={{ height: 60, marginBottom: 8 }} />
          <div style={{ fontSize: 13, opacity: 0.8 }}>Portail d'inscription</div>
        </div>

        <nav style={{ flex: 1, padding: '16px 0', overflowY: 'auto' }}>
          {sections.map((section) => (
            <div key={section.title} style={{ marginBottom: 12 }}>
              <div
                style={{
                  padding: '4px 24px 8px',
                  fontSize: 12,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  opacity: 0.75,
                  fontWeight: 700,
                }}
              >
                {section.title}
              </div>

              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 24px',
                      color: 'var(--amc-white)',
                      textDecoration: 'none',
                      background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                      borderLeft: isActive ? '3px solid #0088CC' : '3px solid transparent',
                    }}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>{user?.firstName} {user?.lastName}</div>
          <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 12 }}>{user?.email}</div>
          <button onClick={logout} className="btn" style={{ width: '100%' }}>
            <FiLogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} />
      )}

      <div style={{ flex: 1, marginLeft: 0 }} className="main-content-area">
        <header
          style={{
            background: 'var(--amc-white)',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: 'var(--amc-shadow)',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', fontSize: 24 }} className="menu-toggle">
            {sidebarOpen ? <FiX /> : <FiMenu />}
          </button>
          <strong style={{ color: 'var(--amc-primary)' }}>{ROLE_LABEL[user?.role] || 'Espace utilisateur'}</strong>
          <span />
        </header>

        <main style={{ padding: '24px' }}>{children}</main>
      </div>

      <style>{`
        @media (min-width: 769px) {
          .sidebar-desktop { left: 0 !important; }
          .main-content-area { margin-left: 260px !important; }
          .menu-toggle { display: none !important; }
        }
      `}</style>
    </div>
  );
}
