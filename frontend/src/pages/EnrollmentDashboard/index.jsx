import React, { useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { toPng } from 'html-to-image';
import {
  FiMenu,
  FiX,
  FiMoon,
  FiSun,
  FiDownload,
  FiChevronDown,
} from 'react-icons/fi';
import { KPICard, Card, FilterBar, TabButton } from './components';
import { OverviewTab, WeeklyTab, ClassesTab } from './tabs';
import { mockEnrollmentData } from './mockData';

const EnrollmentDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [darkMode, setDarkMode] = useState(false);
  const [period, setPeriod] = useState('');
  const [schoolYear, setSchoolYear] = useState('2024-2025');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const overviewStatusRef = useRef(null);
  const overviewTestRef = useRef(null);
  const overviewTrendRef = useRef(null);
  const weeklyChartRef = useRef(null);
  const classesChartRef = useRef(null);

  const { header, kpis } = mockEnrollmentData;

  const captureChartImage = async (node) => {
    if (!node) return null;
    try {
      return await toPng(node, {
        cacheBust: true,
        backgroundColor: darkMode ? '#111827' : '#ffffff',
      });
    } catch (error) {
      console.error('Erreur lors de la capture du graphique:', error);
      return null;
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'AMC Portail';
      workbook.created = new Date();

      const summarySheet = workbook.addWorksheet('Résumé');
      summarySheet.addRow(['Tableau de bord des inscriptions']);
      summarySheet.addRow([`Année scolaire`, schoolYear]);
      summarySheet.addRow([`Généré le`, new Date().toLocaleString('fr-FR')]);
      summarySheet.addRow([]);
      summarySheet.addRow(['Métrique', 'Valeur', 'Variation']);
      summarySheet.getRow(5).font = { bold: true };

      kpis.forEach((kpi) => {
        summarySheet.addRow([kpi.label, kpi.value, `${kpi.trend >= 0 ? '+' : ''}${kpi.trend}%`]);
      });

      summarySheet.columns = [
        { width: 30 },
        { width: 20 },
        { width: 18 },
      ];

      const weeklySheet = workbook.addWorksheet('Inscriptions hebdomadaires');
      weeklySheet.columns = [
        { header: 'Semaine', key: 'week', width: 12 },
        { header: 'Inscriptions', key: 'inscriptions', width: 14 },
        { header: 'Max', key: 'max', width: 12 },
        { header: 'Moyenne', key: 'avg', width: 12 },
      ];
      mockEnrollmentData.enrollmentByWeek.forEach((item) => {
        weeklySheet.addRow({
          week: item.week,
          inscriptions: item.inscriptions,
          max: item.maxInscriptions,
          avg: item.avg,
        });
      });

      const classesSheet = workbook.addWorksheet('Classes');
      classesSheet.columns = [
        { header: 'Classe', key: 'name', width: 12 },
        { header: 'Inscrits', key: 'enrolled', width: 10 },
        { header: 'Capacité', key: 'capacity', width: 10 },
        { header: 'Enseignant', key: 'teacher', width: 22 },
        { header: 'Niveau', key: 'level', width: 18 },
      ];
      mockEnrollmentData.classes.forEach((cls) => {
        classesSheet.addRow({
          name: cls.name,
          enrolled: cls.enrolled,
          capacity: cls.capacity,
          teacher: cls.teacher,
          level: cls.level,
        });
      });

      const chartSheet = workbook.addWorksheet('Graphiques');
      chartSheet.properties.defaultRowHeight = 20;

      const charts = [];
      if (activeTab === 'overview') {
        charts.push({ title: 'Répartition par statut', ref: overviewStatusRef });
        charts.push({ title: 'Test de niveau', ref: overviewTestRef });
        charts.push({ title: 'Évolution des inscriptions', ref: overviewTrendRef });
      } else if (activeTab === 'weekly') {
        charts.push({ title: 'Inscriptions par semaine', ref: weeklyChartRef });
      } else if (activeTab === 'classes') {
        charts.push({ title: 'Classes & capacité', ref: classesChartRef });
      }

      let rowPosition = 0;
      for (const chart of charts) {
        const pngDataUrl = await captureChartImage(chart.ref.current);
        if (!pngDataUrl) continue;

        const imageId = workbook.addImage({
          base64: pngDataUrl.split(',')[1],
          extension: 'png',
        });

        chartSheet.addRow([chart.title]);
        chartSheet.getRow(rowPosition + 1).font = { bold: true };
        chartSheet.addImage(imageId, {
          tl: { col: 0, row: rowPosition + 1 },
          ext: { width: 720, height: 360 },
        });
        rowPosition += 22;
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      saveAs(
        blob,
        `dashboard-inscriptions-${schoolYear}-${new Date().toISOString().split('T')[0]}.xlsx`
      );
    } catch (error) {
      console.error('Erreur d’export Excel:', error);
    } finally {
      setExporting(false);
    }
  };

  // Toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className={`min-h-screen transition-colors ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40 shadow-soft">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            {/* Logo et titre */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:block">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  📊 {header.title}
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {header.subtitle}
                </p>
              </div>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="sm:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                {mobileMenuOpen ? <FiX size={24} /> : <FiMenu size={24} />}
              </button>
            </div>

            {/* Actions header */}
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={handleExportExcel}
                disabled={exporting}
                className="hidden sm:flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm disabled:cursor-not-allowed disabled:bg-blue-400"
              >
                <FiDownload size={16} />
                {exporting ? 'Export en cours...' : 'Exporter Excel'}
              </button>

              <button
                onClick={toggleDarkMode}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title={darkMode ? 'Mode clair' : 'Mode sombre'}
              >
                {darkMode ? (
                  <FiSun size={20} className="text-yellow-500" />
                ) : (
                  <FiMoon size={20} className="text-gray-600" />
                )}
              </button>

              {/* Sélecteur année scolaire */}
              <div className="relative">
                <select
                  value={schoolYear}
                  onChange={(e) => setSchoolYear(e.target.value)}
                  className="hidden sm:block px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white appearance-none pr-8 text-sm cursor-pointer"
                >
                  <option value="2024-2025">2024-2025</option>
                  <option value="2023-2024">2023-2024</option>
                  <option value="2022-2023">2022-2023</option>
                </select>
                <FiChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-600 dark:text-gray-400" />
              </div>
            </div>
          </div>

          {/* Info mise à jour */}
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            ⏰ Mise à jour: {header.lastUpdated}
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {header.title}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {header.subtitle}
            </p>
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              <FiDownload size={16} />
              {exporting ? 'Export en cours...' : 'Exporter Excel'}
            </button>
            <select
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            >
              <option value="2024-2025">2024-2025</option>
              <option value="2023-2024">2023-2024</option>
              <option value="2022-2023">2022-2023</option>
            </select>
          </div>
        )}
      </header>

      {/* Contenu principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 animate-fade-in">
          {kpis.map((kpi) => (
            <KPICard
              key={kpi.id}
              label={kpi.label}
              value={kpi.value}
              trend={kpi.trend}
              color={kpi.color}
              icon={kpi.icon}
              details={kpi.details}
            />
          ))}
        </div>

        {/* Filtres */}
        <FilterBar
          onPeriodChange={setPeriod}
          onYearChange={setSchoolYear}
          onExport={handleExportExcel}
          period={period}
          year={schoolYear}
        />

        {/* Onglets */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            <TabButton
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
              label="📊 Vue générale"
            />
            <TabButton
              active={activeTab === 'weekly'}
              onClick={() => setActiveTab('weekly')}
              label="📈 Inscriptions par semaine"
            />
            <TabButton
              active={activeTab === 'classes'}
              onClick={() => setActiveTab('classes')}
              label="👥 Classes"
            />
          </div>
        </div>

        {/* Contenu des onglets */}
        <div className="animate-slide-up">
          {activeTab === 'overview' && (
            <OverviewTab
              chartRefs={{
                statusChart: overviewStatusRef,
                testChart: overviewTestRef,
                trendChart: overviewTrendRef,
              }}
            />
          )}
          {activeTab === 'weekly' && (
            <WeeklyTab chartRef={weeklyChartRef} />
          )}
          {activeTab === 'classes' && (
            <ClassesTab chartRef={classesChartRef} />
          )}
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            © 2024 AMC Portail - Tableau de bord des inscriptions. Tous droits
            réservés.
          </p>
        </footer>
      </main>
    </div>
  );
};

export default EnrollmentDashboard;
