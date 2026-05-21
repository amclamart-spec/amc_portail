import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { Card, CustomTooltip } from './components';
import { mockEnrollmentData } from './mockData';

// Onglet 1: Vue générale
export const OverviewTab = ({ chartRefs = {} }) => {
  const { enrollmentByStatus, levelTestDistribution, enrollmentTrend } = mockEnrollmentData;

  return (
    <div className="space-y-6">
      {/* Première ligne: 2 graphiques Pie/Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Répartition par statut */}
        <div ref={chartRefs.statusChart}>
          <Card title="Répartition par statut">
            <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={enrollmentByStatus}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                label={({ name, value }) => `${name} (${value})`}
              >
                {enrollmentByStatus.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => value.toLocaleString('fr-FR')} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        </div>

        {/* Test de niveau */}
        <div ref={chartRefs.testChart}>
          <Card title="Test de niveau">
            <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={levelTestDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                label={({ name, value }) => `${name} (${value})`}
              >
                {levelTestDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => value.toLocaleString('fr-FR')} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>
      </div>

      {/* Graphique ligne: Evolution sur 12 semaines */}
      <div ref={chartRefs.trendChart}>
        <Card title="Évolution des inscriptions (12 dernières semaines)">
          <ResponsiveContainer width="100%" height={350}>
          <LineChart
            data={enrollmentTrend}
            margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="week"
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="inscrits"
              stroke="#0ea5e9"
              strokeWidth={3}
              dot={{ fill: '#0ea5e9', r: 5 }}
              activeDot={{ r: 7 }}
              name="Cumul inscriptions"
            />
          </LineChart>
        </ResponsiveContainer>
        </Card>
      </div>

      {/* Statistiques additionnelles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Pic maximal
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
              205
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Semaine 12
            </p>
          </div>
        </Card>

        <Card>
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Moyenne hebdomadaire
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
              150
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Cumul par semaine
            </p>
          </div>
        </Card>

        <Card>
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Total des inscrits
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
              1247
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Année scolaire
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

// Onglet 2: Inscriptions par semaine
export const WeeklyTab = ({ chartRef }) => {
  const { enrollmentByWeek } = mockEnrollmentData;

  // Statistiques
  const totalInscriptions = enrollmentByWeek.reduce(
    (sum, item) => sum + item.inscriptions,
    0
  );
  const maxWeek = Math.max(...enrollmentByWeek.map((item) => item.inscriptions));
  const avgPerWeek = Math.round(totalInscriptions / enrollmentByWeek.length);

  return (
    <div className="space-y-6">
      {/* Statistiques clés */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Total annuel
            </p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
              {totalInscriptions.toLocaleString('fr-FR')}
            </p>
          </div>
        </Card>

        <Card>
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Pic maximal (semaine)
            </p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
              {maxWeek.toLocaleString('fr-FR')}
            </p>
          </div>
        </Card>

        <Card>
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Moyenne hebdomadaire
            </p>
            <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 mt-2">
              {avgPerWeek.toLocaleString('fr-FR')}
            </p>
          </div>
        </Card>
      </div>

      {/* Graphique des inscriptions par semaine */}
      <div ref={chartRef}>
        <Card title="Inscriptions par semaine (S1 - S36)">
          <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={enrollmentByWeek}
            margin={{ top: 20, right: 30, left: 0, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="week"
              angle={-45}
              textAnchor="end"
              height={80}
              interval={2}
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
            <Tooltip
              content={<CustomTooltip />}
              formatter={(value) => value.toLocaleString('fr-FR')}
            />
            <Legend />
            <Bar
              dataKey="inscriptions"
              fill="#0ea5e9"
              name="Inscriptions"
              radius={[8, 8, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
        </Card>
      </div>

      {/* Tableau détaillé */}
      <Card title="Détail par semaine">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-white">
                  Semaine
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-900 dark:text-white">
                  Inscriptions
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-900 dark:text-white">
                  % de la moyenne
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {enrollmentByWeek.map((item) => {
                const percentage = Math.round(
                  (item.inscriptions / avgPerWeek) * 100
                );
                return (
                  <tr
                    key={item.week}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                      {item.week}
                    </td>
                    <td className="text-right px-4 py-3 text-gray-900 dark:text-white">
                      {item.inscriptions}
                    </td>
                    <td className="text-right px-4 py-3">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                          percentage >= 100
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                            : 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200'
                        }`}
                      >
                        {percentage}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

// Onglet 3: Classes
export const ClassesTab = ({ chartRef }) => {
  const { classes } = mockEnrollmentData;

  // Préparer les données pour le graphique horizontal
  const chartData = classes.map((cls) => ({
    name: cls.name,
    enrolled: cls.enrolled,
    available: cls.capacity - cls.enrolled,
    capacity: cls.capacity,
  }));

  return (
    <div className="space-y-6">
      {/* Graphique horizontal: Inscrits vs Capacité */}
      <div ref={chartRef}>
        <Card title="Comparaison inscrits vs capacité maximale">
          <ResponsiveContainer width="100%" height={350}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 5, right: 30, left: 50, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" stroke="#6b7280" style={{ fontSize: '12px' }} />
            <YAxis
              dataKey="name"
              type="category"
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar
              dataKey="enrolled"
              fill="#0ea5e9"
              name="Inscrits"
              radius={[0, 8, 8, 0]}
            />
            <Bar
              dataKey="available"
              fill="#d1d5db"
              name="Places disponibles"
              radius={[0, 8, 8, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
        </Card>
      </div>

      {/* Cartes de remplissage */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Taux de remplissage par classe
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((cls) => {
            const percentage = Math.round((cls.enrolled / cls.capacity) * 100);
            const color =
              percentage >= 90
                ? 'green'
                : percentage >= 70
                ? 'orange'
                : 'red';
            const bgColor =
              color === 'green'
                ? 'bg-green-100 dark:bg-green-900/30'
                : color === 'orange'
                ? 'bg-orange-100 dark:bg-orange-900/30'
                : 'bg-red-100 dark:bg-red-900/30';
            const textColor =
              color === 'green'
                ? 'text-green-800 dark:text-green-200'
                : color === 'orange'
                ? 'text-orange-800 dark:text-orange-200'
                : 'text-red-800 dark:text-red-200';
            const barColor =
              color === 'green'
                ? 'bg-green-500'
                : color === 'orange'
                ? 'bg-orange-500'
                : 'bg-red-500';

            return (
              <Card key={cls.id}>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {cls.name}
                      </p>
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded ${bgColor} ${textColor}`}
                      >
                        {percentage}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {cls.enrolled} / {cls.capacity} inscrits
                    </p>
                  </div>

                  {/* Barre de progression */}
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full ${barColor} transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  {/* Détails additionnels */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      <span className="font-medium">Niveau:</span> {cls.level}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      <span className="font-medium">Enseignant:</span>{' '}
                      {cls.teacher}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Tableau détaillé */}
      <Card title="Détails par classe">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-white">
                  Classe
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-900 dark:text-white">
                  Inscrits
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-900 dark:text-white">
                  Capacité
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-900 dark:text-white">
                  Taux
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-white">
                  Enseignant
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {classes.map((cls) => {
                const percentage = Math.round((cls.enrolled / cls.capacity) * 100);
                const statusColor =
                  percentage >= 90
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                    : percentage >= 70
                    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200';

                return (
                  <tr
                    key={cls.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {cls.name}
                    </td>
                    <td className="text-right px-4 py-3 text-gray-900 dark:text-white">
                      {cls.enrolled}
                    </td>
                    <td className="text-right px-4 py-3 text-gray-900 dark:text-white">
                      {cls.capacity}
                    </td>
                    <td className="text-right px-4 py-3">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${statusColor}`}
                      >
                        {percentage}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {cls.teacher}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
