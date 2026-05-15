import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';

const STUDENT_COLUMNS = [
  { key: 'name', label: 'Nom élève' },
  { key: 'dob', label: 'Date de naissance' },
  { key: 'class', label: 'Classe' },
  { key: 'schedule', label: 'Créneau' },
  { key: 'parentContacts', label: 'Contacts parents' },
  { key: 'medicalInfo', label: 'Infos médicales' },
  { key: 'paymentStatus', label: 'Statut paiement' },
];

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default function AdminExports() {
  const [activeTab, setActiveTab] = useState('students');
  const [schoolYears, setSchoolYears] = useState([]);
  const [poles, setPoles] = useState([]);
  const [levels, setLevels] = useState([]);
  const [classes, setClasses] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(false);

  const [studentForm, setStudentForm] = useState({
    schoolYearId: '',
    poleId: '',
    levelId: '',
    classId: '',
    format: 'excel',
    columns: STUDENT_COLUMNS.map((c) => c.key),
  });

  const [attendanceForm, setAttendanceForm] = useState({
    classId: '',
    startDate: '',
    endDate: '',
  });

  const [planningForm, setPlanningForm] = useState({
    type: 'global',
    poleId: '',
    classId: '',
    roomId: '',
    teacherId: '',
    format: 'pdf',
  });

  const [accountingForm, setAccountingForm] = useState({
    schoolYearId: '',
    format: 'excel',
  });

  const filteredLevels = useMemo(
    () => levels.filter((lvl) => !studentForm.poleId || lvl.poleId === studentForm.poleId),
    [levels, studentForm.poleId],
  );

  const filteredClasses = useMemo(
    () => classes.filter((cls) => {
      if (studentForm.schoolYearId && cls.schoolYearId !== studentForm.schoolYearId) return false;
      if (studentForm.poleId && cls.poleId !== studentForm.poleId) return false;
      if (studentForm.levelId && cls.levelId !== studentForm.levelId) return false;
      return true;
    }),
    [classes, studentForm.schoolYearId, studentForm.poleId, studentForm.levelId],
  );

  const filteredPlanningClasses = useMemo(
    () => classes.filter((cls) => !planningForm.poleId || cls.poleId === planningForm.poleId),
    [classes, planningForm.poleId],
  );

  useEffect(() => {
    async function load() {
      try {
        const [yearsRes, polesRes, levelsRes, classesRes, roomsRes, teachersRes] = await Promise.all([
          api.get('/admin/school-years'),
          api.get('/admin/poles'),
          api.get('/admin/niveaux'),
          api.get('/admin/classes'),
          api.get('/admin/salles'),
          api.get('/admin/professeurs'),
        ]);

        setSchoolYears(yearsRes.data.schoolYears || []);
        setPoles(polesRes.data.poles || []);
        setLevels(levelsRes.data.levels || []);
        setClasses(classesRes.data.classes || []);
        setRooms(roomsRes.data.rooms || []);
        setTeachers(teachersRes.data.teachers || []);
      } catch (error) {
        toast.error(error?.response?.data?.error || 'Impossible de charger les données d\'export');
      }
    }

    load();
  }, []);

  function toggleColumn(key) {
    setStudentForm((prev) => ({
      ...prev,
      columns: prev.columns.includes(key)
        ? prev.columns.filter((c) => c !== key)
        : [...prev.columns, key],
    }));
  }

  async function handleStudentExport() {
    if (studentForm.columns.length === 0) {
      toast.error('Sélectionnez au moins une colonne');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/admin/exports/students', studentForm, { responseType: 'blob' });
      const extension = studentForm.format === 'pdf' ? 'pdf' : 'xlsx';
      downloadBlob(response.data, `liste-eleves.${extension}`);
      toast.success('Export élèves généré');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur export élèves');
    } finally {
      setLoading(false);
    }
  }

  async function handleAttendanceExport() {
    if (!attendanceForm.classId || !attendanceForm.startDate || !attendanceForm.endDate) {
      toast.error('Veuillez renseigner classe + période');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/admin/exports/attendance-sheet', attendanceForm, { responseType: 'blob' });
      downloadBlob(response.data, 'feuille-presence.pdf');
      toast.success('Feuille de présence générée');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur export présence');
    } finally {
      setLoading(false);
    }
  }

  async function handlePlanningExport() {
    if (!planningForm.type) {
      toast.error('Veuillez sélectionner un type de planning');
      return;
    }

    if (planningForm.type === 'pole' && !planningForm.poleId) {
      toast.error('Veuillez choisir le pôle pour l\'export par pôle');
      return;
    }

    if (planningForm.type === 'class' && !planningForm.classId) {
      toast.error('Veuillez choisir la classe pour l\'export par classe');
      return;
    }

    if (planningForm.type === 'room' && !planningForm.roomId) {
      toast.error('Veuillez choisir la salle pour l\'export par salle');
      return;
    }

    if (planningForm.type === 'teacher' && !planningForm.teacherId) {
      toast.error('Veuillez choisir le professeur pour l\'export par professeur');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/admin/exports/planning', planningForm, { responseType: 'blob' });
      const extension = planningForm.format === 'excel' ? 'xlsx' : 'pdf';
      downloadBlob(response.data, `planning-${planningForm.type}.${extension}`);
      toast.success('Planning généré');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur export planning');
    } finally {
      setLoading(false);
    }
  }

  async function handleAccountingExport(type) {
    setLoading(true);
    try {
      const response = await api.get(`/admin/exports/accounting/${type}`, {
        params: {
          schoolYearId: accountingForm.schoolYearId || undefined,
          format: accountingForm.format,
        },
        responseType: 'blob',
      });

      const extension = accountingForm.format === 'pdf' ? 'pdf' : accountingForm.format === 'csv' ? 'csv' : 'xlsx';
      downloadBlob(response.data, `compta-${type}.${extension}`);
      toast.success('Export comptable généré');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur export comptable');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 16 }}>Exports administratifs</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={`btn ${activeTab === 'students' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('students')}>Listes élèves</button>
        <button className={`btn ${activeTab === 'attendance' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('attendance')}>Feuilles présence</button>
        <button className={`btn ${activeTab === 'planning' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('planning')}>Planning</button>
        <button className={`btn ${activeTab === 'accounting' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('accounting')}>Comptabilité</button>
      </div>

      {activeTab === 'students' && (
        <div className="card">
          <div className="card-header"><h3>Export listes élèves</h3></div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div className="form-group">
              <label>Année scolaire</label>
              <select className="form-control" value={studentForm.schoolYearId} onChange={(e) => setStudentForm((p) => ({ ...p, schoolYearId: e.target.value }))}>
                <option value="">Toutes</option>
                {schoolYears.map((year) => <option key={year.id} value={year.id}>{year.label || year.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Pôle</label>
              <select className="form-control" value={studentForm.poleId} onChange={(e) => setStudentForm((p) => ({ ...p, poleId: e.target.value, levelId: '' }))}>
                <option value="">Tous</option>
                {poles.map((pole) => <option key={pole.id} value={pole.id}>{pole.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Niveau</label>
              <select className="form-control" value={studentForm.levelId} onChange={(e) => setStudentForm((p) => ({ ...p, levelId: e.target.value }))}>
                <option value="">Tous</option>
                {filteredLevels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Classe</label>
              <select className="form-control" value={studentForm.classId} onChange={(e) => setStudentForm((p) => ({ ...p, classId: e.target.value }))}>
                <option value="">Toutes</option>
                {filteredClasses.map((cls) => <option key={cls.id} value={cls.id}>{`${cls.level?.name || 'Classe'} • ${cls.dayOfWeek} ${cls.startTime}`}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Format</label>
              <select className="form-control" value={studentForm.format} onChange={(e) => setStudentForm((p) => ({ ...p, format: e.target.value }))}>
                <option value="excel">Excel</option>
                <option value="pdf">PDF</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Colonnes</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {STUDENT_COLUMNS.map((column) => (
                <label key={column.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={studentForm.columns.includes(column.key)} onChange={() => toggleColumn(column.key)} />
                  {column.label}
                </label>
              ))}
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleStudentExport} disabled={loading}>{loading ? 'Génération...' : 'Générer export élèves'}</button>
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="card">
          <div className="card-header"><h3>Export feuille de présence</h3></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div className="form-group">
              <label>Classe</label>
              <select className="form-control" value={attendanceForm.classId} onChange={(e) => setAttendanceForm((p) => ({ ...p, classId: e.target.value }))}>
                <option value="">Choisir...</option>
                {classes.map((cls) => <option key={cls.id} value={cls.id}>{`${cls.level?.pole?.name || 'Pôle'} - ${cls.level?.name || 'Classe'} (${cls.dayOfWeek} ${cls.startTime})`}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Date début</label>
              <input type="date" className="form-control" value={attendanceForm.startDate} onChange={(e) => setAttendanceForm((p) => ({ ...p, startDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Date fin</label>
              <input type="date" className="form-control" value={attendanceForm.endDate} onChange={(e) => setAttendanceForm((p) => ({ ...p, endDate: e.target.value }))} />
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleAttendanceExport} disabled={loading}>{loading ? 'Génération...' : 'Générer PDF présence'}</button>
        </div>
      )}

      {activeTab === 'planning' && (
        <div className="card">
          <div className="card-header"><h3>Export planning hebdomadaire</h3></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div className="form-group">
              <label>Type de planning</label>
              <select
                className="form-control"
                value={planningForm.type}
                onChange={(e) => {
                  const type = e.target.value;
                  setPlanningForm((p) => ({
                    ...p,
                    type,
                    roomId: type === 'room' ? p.roomId : '',
                    teacherId: type === 'teacher' ? p.teacherId : '',
                  }));
                }}
              >
                <option value="global">Planning global</option>
                <option value="pole">Planning par pôle</option>
                <option value="class">Planning par classe</option>
                <option value="room">Planning par salle</option>
                <option value="teacher">Planning par professeur</option>
              </select>
            </div>
            <div className="form-group">
              <label>Pôle</label>
              <select className="form-control" value={planningForm.poleId} onChange={(e) => setPlanningForm((p) => ({ ...p, poleId: e.target.value }))}>
                <option value="">Tous</option>
                {poles.map((pole) => <option key={pole.id} value={pole.id}>{pole.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Format</label>
              <select className="form-control" value={planningForm.format} onChange={(e) => setPlanningForm((p) => ({ ...p, format: e.target.value }))}>
                <option value="pdf">PDF</option>
                <option value="excel">Excel</option>
              </select>
            </div>
            {planningForm.type === 'class' && (
              <div className="form-group">
                <label>Classe</label>
                <select className="form-control" value={planningForm.classId} onChange={(e) => setPlanningForm((p) => ({ ...p, classId: e.target.value }))}>
                  <option value="">Choisir une classe</option>
                  {filteredPlanningClasses.map((cls) => (
                    <option key={cls.id} value={cls.id}>{`${cls.level?.name || 'Classe'} • ${cls.dayOfWeek} ${cls.startTime}-${cls.endTime}`}</option>
                  ))}
                </select>
              </div>
            )}
            {planningForm.type === 'room' && (
              <div className="form-group">
                <label>Salle</label>
                <select className="form-control" value={planningForm.roomId} onChange={(e) => setPlanningForm((p) => ({ ...p, roomId: e.target.value }))}>
                  <option value="">Choisir une salle</option>
                  {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                </select>
              </div>
            )}
            {planningForm.type === 'teacher' && (
              <div className="form-group">
                <label>Professeur</label>
                <select className="form-control" value={planningForm.teacherId} onChange={(e) => setPlanningForm((p) => ({ ...p, teacherId: e.target.value }))}>
                  <option value="">Choisir un professeur</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{`${teacher.firstName || ''} ${teacher.lastName || ''}`.trim()}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p style={{ color: '#555', marginBottom: 12 }}>
            Génère un planning hebdomadaire avec le thème coloré du planning. Choisissez PDF ou Excel.
          </p>
          <button className="btn btn-primary" onClick={handlePlanningExport} disabled={loading}>{loading ? 'Génération...' : `Générer planning ${planningForm.format === 'excel' ? 'Excel' : 'PDF'}`}</button>
        </div>
      )}

      {activeTab === 'accounting' && (
        <div className="card">
          <div className="card-header"><h3>Exports comptables</h3></div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div className="form-group">
              <label>Année scolaire</label>
              <select className="form-control" value={accountingForm.schoolYearId} onChange={(e) => setAccountingForm((p) => ({ ...p, schoolYearId: e.target.value }))}>
                <option value="">Année en cours</option>
                {schoolYears.map((year) => <option key={year.id} value={year.id}>{year.label || year.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Format</label>
              <select className="form-control" value={accountingForm.format} onChange={(e) => setAccountingForm((p) => ({ ...p, format: e.target.value }))}>
                <option value="excel">Excel</option>
                <option value="csv">CSV</option>
                <option value="pdf">PDF</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className="btn btn-outline" onClick={() => handleAccountingExport('payments')} disabled={loading}>Résumé paiements</button>
            <button className="btn btn-outline" onClick={() => handleAccountingExport('unpaid')} disabled={loading}>Liste impayés</button>
            <button className="btn btn-outline" onClick={() => handleAccountingExport('transactions')} disabled={loading}>Historique transactions</button>
            <button className="btn btn-primary" onClick={() => handleAccountingExport('annual-summary')} disabled={loading}>Bilan annuel</button>
          </div>
        </div>
      )}
    </div>
  );
}
