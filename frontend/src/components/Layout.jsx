import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FloatingChatbot from './FloatingChatbot';
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
  FiMessageSquare,
} from 'react-icons/fi';
import { useState } from 'react';
import { ROLE_LABEL } from '../utils/roles';
import { version as appVersion } from '../../package.json';

const navSectionsByRole = {
  SUPER_ADMIN: [
    {
      title: 'Mon espace',
      items: [
        { path: '/admin', icon: FiHome, label: 'Tableau de bord' },
      ],
    },
    {
      title: 'Gestion des inscrits',
      items: [
        { path: '/admin/users', icon: FiUsers, label: 'Utilisateurs' },
        { path: '/admin/enrollments', icon: FiClipboard, label: 'Inscriptions' },
      ],
    },
    {
      title: 'Pédagogie',
      items: [
        { path: '/admin/niveaux', icon: FiSettings, label: 'Pôles et Niveaux' },
        { path: '/admin/classes', icon: FiBookOpen, label: 'Classes' },
        { path: '/admin/professeurs', icon: FiUser, label: 'Professeurs' },
        { path: '/admin/salles', icon: FiHome, label: 'Salles' },
        { path: '/admin/creneaux', icon: FiCalendar, label: 'Créneaux' },
        { path: '/admin/planning', icon: FiCalendar, label: 'Planning' },
      ],
    },
    {
      title: 'Finance',
      items: [
        { path: '/admin/payments', icon: FiCreditCard, label: 'Paiements' },
        { icon: FiCreditCard, label: 'Échéanciers', disabled: true },
        { icon: FiCreditCard, label: 'Impayés', disabled: true },
        { icon: FiCreditCard, label: 'Remboursements', disabled: true },
        { icon: FiCreditCard, label: 'Exports comptables', disabled: true },
      ],
    },
    {
      title: 'Communication',
      items: [
        { path: '/admin/mailing', icon: FiClipboard, label: 'Mailing' },
        { path: '/admin/chat', icon: FiMessageSquare, label: 'Chat' },
        { icon: FiClipboard, label: 'Messages envoyés', disabled: true },
        { icon: FiClipboard, label: 'Templates d\'emails', disabled: true },
        { icon: FiClipboard, label: 'Statistiques SMS', disabled: true },
      ],
    },
    {
      title: 'Statistiques',
      items: [
        { icon: FiBarChart2, label: 'Effectifs', disabled: true },
        { icon: FiBarChart2, label: 'Évolution inter-années', disabled: true },
        { icon: FiBarChart2, label: 'Taux de remplissage', disabled: true },
        { icon: FiBarChart2, label: 'Analyses financières', disabled: true },
      ],
    },
    {
      title: 'Paramètres',
      items: [
        { path: '/admin/settings', icon: FiSettings, label: 'Années scolaires' },
        { path: '/admin/settings', icon: FiSettings, label: 'Tarifs' },
        { path: '/admin/users', icon: FiUsers, label: 'Utilisateurs / Rôles' },
        { icon: FiSettings, label: 'Configuration paiements', disabled: true },
        { path: '/admin/settings', icon: FiSettings, label: 'RGPD / Données' },
      ],
    },
    {
      title: 'Exports',
      items: [
        { path: '/admin/exports', icon: FiBookOpen, label: 'Listes élèves' },
        { path: '/admin/exports', icon: FiClipboard, label: 'Feuilles présence' },
        { path: '/admin/exports', icon: FiBarChart2, label: 'Comptabilité' },
      ],
    },
  ],
  ADMIN: [
    {
      title: 'Mon espace',
      items: [
        { path: '/admin', icon: FiHome, label: 'Tableau de bord' },
      ],
    },
    {
      title: 'Gestion des inscrits',
      items: [
        { path: '/admin/users', icon: FiUsers, label: 'Utilisateurs' },
        { path: '/admin/enrollments', icon: FiClipboard, label: 'Inscriptions' },
      ],
    },
    {
      title: 'Pédagogie',
      items: [
        { path: '/admin/niveaux', icon: FiSettings, label: 'Pôles et Niveaux' },
        { path: '/admin/classes', icon: FiBookOpen, label: 'Classes' },
        { path: '/admin/professeurs', icon: FiUser, label: 'Professeurs' },
        { path: '/admin/salles', icon: FiHome, label: 'Salles' },
        { path: '/admin/creneaux', icon: FiCalendar, label: 'Créneaux' },
        { path: '/admin/planning', icon: FiCalendar, label: 'Planning' },
      ],
    },
    {
      title: 'Finance',
      items: [
        { path: '/admin/payments', icon: FiCreditCard, label: 'Paiements' },
        { icon: FiCreditCard, label: 'Échéanciers', disabled: true },
        { icon: FiCreditCard, label: 'Impayés', disabled: true },
        { icon: FiCreditCard, label: 'Remboursements', disabled: true },
        { icon: FiCreditCard, label: 'Exports comptables', disabled: true },
      ],
    },
    {
      title: 'Communication',
      items: [
        { path: '/admin/mailing', icon: FiClipboard, label: 'Mailing' },
        { path: '/admin/chat', icon: FiMessageSquare, label: 'Chat' },
        { icon: FiClipboard, label: 'Messages envoyés', disabled: true },
        { icon: FiClipboard, label: 'Templates d\'emails', disabled: true },
        { icon: FiClipboard, label: 'Statistiques SMS', disabled: true },
      ],
    },
    {
      title: 'Statistiques',
      items: [
        { icon: FiBarChart2, label: 'Effectifs', disabled: true },
        { icon: FiBarChart2, label: 'Évolution inter-années', disabled: true },
        { icon: FiBarChart2, label: 'Taux de remplissage', disabled: true },
        { icon: FiBarChart2, label: 'Analyses financières', disabled: true },
      ],
    },
    {
      title: 'Paramètres',
      items: [
        { path: '/admin/settings', icon: FiSettings, label: 'Années scolaires' },
        { path: '/admin/settings', icon: FiSettings, label: 'Tarifs' },
        { path: '/admin/users', icon: FiUsers, label: 'Utilisateurs / Rôles' },
        { icon: FiSettings, label: 'Configuration paiements', disabled: true },
        { path: '/admin/settings', icon: FiSettings, label: 'RGPD / Données' },
      ],
    },
    {
      title: 'Exports',
      items: [
        { path: '/admin/exports', icon: FiBookOpen, label: 'Listes élèves' },
        { path: '/admin/exports', icon: FiClipboard, label: 'Feuilles présence' },
        { path: '/admin/exports', icon: FiBarChart2, label: 'Comptabilité' },
      ],
    },
  ],
  TRESORIER: [
    {
      title: 'Finance',
      items: [
        { path: '/tresorier', icon: FiBarChart2, label: 'Tableau de bord' },
        { path: '/tresorier/payments', icon: FiCreditCard, label: 'Paiements' },
        { path: '/tresorier/echeanciers', icon: FiCreditCard, label: 'Échéanciers' },
        { path: '/tresorier/prelevements', icon: FiCreditCard, label: 'Prélèvements' },
      ],
    },
  ],
  PROFESSEUR: [
    {
      title: 'Pédagogie',
      items: [
        { path: '/professeur', icon: FiHome, label: 'Mes classes' },
        { path: '/suivi-pedagogique', icon: FiBarChart2, label: 'Suivi pédagogique' },
      ],
    },
  ],
  FAMILLE: [
    {
      title: 'Mon espace',
      items: [
        { path: '/famille', icon: FiHome, label: 'Tableau de bord' },
        { path: '/famille/inscription', icon: FiBookOpen, label: 'Inscriptions' },
        { path: '/famille/suivi-pedagogique', icon: FiBarChart2, label: 'Suivi pédagogique' },
        { path: '/famille/paiements', icon: FiCreditCard, label: 'Paiements' },
        { path: '/famille/profil', icon: FiUser, label: 'Profil' },
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <img src="/amc_logo.png" alt="AMC" style={{ height: 60, marginBottom: 8 }} />
            <img src="/amc_logo_partner.png" alt="PARTAGE" style={{ height: 48, opacity: 0.95 }} />
          </div>
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

              {section.items.map((item, idx) => {
                const Icon = item.icon;
                const isActive = item.path && (location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
                const itemStyles = {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 24px',
                  color: item.disabled ? 'rgba(255,255,255,0.6)' : 'var(--amc-white)',
                  textDecoration: 'none',
                  background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                  borderLeft: isActive ? '3px solid #0088CC' : '3px solid transparent',
                  cursor: item.disabled ? 'default' : 'pointer',
                  opacity: item.disabled ? 0.65 : 1,
                };
                const itemKey = `${section.title}-${item.path || item.label}-${idx}`;

                if (item.disabled || !item.path) {
                  return (
                    <div key={itemKey} style={itemStyles}>
                      <Icon size={18} />
                      {item.label}
                    </div>
                  );
                }

                return (
                  <Link
                    key={itemKey}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    style={itemStyles}
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
          <div style={{ marginTop: 12, fontSize: 11, opacity: 0.65, textAlign: 'center' }}>
            Version {appVersion}
          </div>
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
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>Version {appVersion}</div>
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
      
      {user && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && <FloatingChatbot />}
    </div>
  );
}
