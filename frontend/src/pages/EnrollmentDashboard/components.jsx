import React from 'react';
import {
  FiUsers,
  FiCheckCircle,
  FiClock,
  FiClipboard,
  FiTrendingUp,
  FiTrendingDown,
} from 'react-icons/fi';

// Mappage des icônes
const iconMap = {
  FiUsers: FiUsers,
  FiCheckCircle: FiCheckCircle,
  FiClock: FiClock,
  FiClipboard: FiClipboard,
};

// Couleurs pour chaque KPI
const colorClasses = {
  blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  orange: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
  purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
};

const textColorClasses = {
  blue: 'text-blue-600 dark:text-blue-400',
  green: 'text-green-600 dark:text-green-400',
  orange: 'text-orange-600 dark:text-orange-400',
  purple: 'text-purple-600 dark:text-purple-400',
};

const trendColorClasses = (trend) => {
  return trend >= 0
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';
};

export const KPICard = ({ label, value, trend, color = 'blue', icon, details }) => {
  const Icon = iconMap[icon] || FiUsers;
  const isTrendPositive = trend >= 0;

  return (
    <div
      className={`${colorClasses[color]} border rounded-lg p-6 hover:shadow-md transition-all duration-300 transform hover:scale-105`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {label}
          </p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
            {value.toLocaleString('fr-FR')}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {details}
          </p>
        </div>
        <div className={`${textColorClasses[color]} text-3xl opacity-80`}>
          <Icon />
        </div>
      </div>
      <div className="flex items-center gap-1 mt-4">
        {isTrendPositive ? (
          <FiTrendingUp className={`text-sm ${trendColorClasses(trend)}`} />
        ) : (
          <FiTrendingDown className={`text-sm ${trendColorClasses(trend)}`} />
        )}
        <span className={`text-sm font-semibold ${trendColorClasses(trend)}`}>
          {isTrendPositive ? '+' : ''}{trend}%
        </span>
      </div>
    </div>
  );
};

// Composant Card réutilisable
export const Card = ({ children, className = '', title, action }) => {
  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-soft dark:shadow-none border border-gray-200 dark:border-gray-700 p-6 ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
};

// Badge de statut
export const StatusBadge = ({ status, value }) => {
  const statusConfig = {
    validated: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-200' },
    pending: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-800 dark:text-orange-200' },
    processing: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-800 dark:text-blue-200' },
    cancelled: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-800 dark:text-gray-200' },
    rejected: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-200' },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${config.bg} ${config.text}`}>
      {value}
    </span>
  );
};

// Barre de progression
export const ProgressBar = ({ value, max, color = 'bg-blue-500', showLabel = true }) => {
  const percentage = Math.round((value / max) * 100);

  // Déterminer la couleur basée sur le pourcentage
  let barColor = color;
  if (percentage >= 90) {
    barColor = 'bg-green-500';
  } else if (percentage >= 70) {
    barColor = 'bg-orange-500';
  } else {
    barColor = 'bg-red-500';
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-500`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
      {showLabel && (
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 min-w-12 text-right">
          {percentage}%
        </span>
      )}
    </div>
  );
};

// Composant pour les filtres
export const FilterBar = ({ onPeriodChange, onYearChange, onExport, period, year }) => {
  return (
    <div className="flex flex-col md:flex-row gap-4 mb-6">
      <select
        value={period}
        onChange={(e) => onPeriodChange(e.target.value)}
        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
      >
        <option value="">Toutes les périodes</option>
        <option value="2024-09">Septembre 2024</option>
        <option value="2024-10">Octobre 2024</option>
        <option value="2024-11">Novembre 2024</option>
      </select>

      <select
        value={year}
        onChange={(e) => onYearChange(e.target.value)}
        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
      >
        <option value="2024-2025">2024-2025</option>
        <option value="2023-2024">2023-2024</option>
        <option value="2022-2023">2022-2023</option>
      </select>

      <button
        onClick={onExport}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
      >
        📥 Exporter Excel
      </button>
    </div>
  );
};

// Composant pour les onglets
export const TabButton = ({ active, onClick, label }) => {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 font-medium rounded-lg transition-all ${
        active
          ? 'bg-blue-600 text-white shadow-md'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );
};

// Tooltip personnalisé pour Recharts
export const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900 dark:bg-gray-800 text-white px-3 py-2 rounded-lg shadow-lg text-sm border border-gray-700">
        <p className="font-medium">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};
