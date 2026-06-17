import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';

const DAYS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];
const SLOT_COLORS = ['#DCFCE7', '#FEF3C7', '#FEE2E2', '#DBEAFE', '#EDE9FE', '#F0F9FF', '#FCE7F3'];

function hashString(value) {
  let hash = 0;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % SLOT_COLORS.length;
  }
  return hash;
}

function getSlotColor(cls) {
  return SLOT_COLORS[hashString(`${cls.id}-${cls.teacherId}-${cls.roomId}-${cls.levelId}`)];
}

function formatTeacher(cls) {
  if (!cls.teacher) return 'Professeur non défini';
  if (cls.teacher.firstName || cls.teacher.lastName) {
    return `${cls.teacher.firstName || ''} ${cls.teacher.lastName || ''}`.trim();
  }
  if (cls.teacher.user) {
    return `${cls.teacher.user.firstName || ''} ${cls.teacher.user.lastName || ''}`.trim();
  }
  return 'Professeur non défini';
}

function formatRoom(cls) {
  return cls.roomRef?.name || cls.room || 'Salle non définie';
}

function formatClassLabel(cls) {
  return cls.level?.name || cls.name || 'Classe non définie';
}

function formatPoleLabel(cls) {
  return cls.pole?.name || cls.level?.pole?.name || 'Pôle non défini';
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default function AdminPlanning() {
  const [schoolYears, setSchoolYears] = useState([]);
  const [poles, setPoles] = useState([]);
  const [classes, setClasses] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [filters, setFilters] = useState({
    type: 'global',
    poleId: '',
    classId: '',
    teacherId: '',
    roomId: '',
    format: 'pdf',
  });

  const selectedSchoolYearId = useMemo(() => {
    const current = schoolYears.find((year) => year.isCurrent);
    return current?.id || schoolYears[0]?.id || '';
  }, [schoolYears]);

  const availableClasses = useMemo(
    () => classes.filter((cls) => !filters.poleId || cls.poleId === filters.poleId),
    [classes, filters.poleId],
  );

  const filteredClasses = useMemo(() => {
    const ref = viewDate ? new Date(viewDate) : null;
    return classes.filter((cls) => {
      // Filter by validity date range
      if (ref) {
        if (cls.validFrom && new Date(cls.validFrom) > ref) return false;
        if (cls.validTo && new Date(cls.validTo) < ref) return false;
      }
      if (filters.type === 'pole' && filters.poleId && cls.poleId !== filters.poleId) return false;
      if (filters.type === 'class' && filters.classId && cls.id !== filters.classId) return false;
      if (filters.type === 'teacher' && filters.teacherId && cls.teacherId !== filters.teacherId) return false;
      if (filters.type === 'room' && filters.roomId && cls.roomId !== filters.roomId) return false;
      if (filters.type === 'class' && !filters.classId) return false;
      if (filters.type === 'pole' && !filters.poleId) return false;
      return filters.type === 'global' ? (!filters.poleId || cls.poleId === filters.poleId) : true;
    });
  }, [classes, filters, viewDate]);

  const periods = useMemo(() => {
    const periodsMap = new Map();
    filteredClasses.forEach((cls) => {
      const key = `${cls.startTime}-${cls.endTime}`;
      if (!periodsMap.has(key)) {
        periodsMap.set(key, { startTime: cls.startTime, endTime: cls.endTime });
      }
    });
    return Array.from(periodsMap.values()).sort((a, b) => {
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return a.endTime.localeCompare(b.endTime);
    });
  }, [filteredClasses]);

  const scheduleByDay = useMemo(() => {
    const schedule = Object.fromEntries(DAYS.map((day) => [day, {}]));
    filteredClasses.forEach((cls) => {
      if (!DAYS.includes(cls.dayOfWeek)) return;
      const key = `${cls.startTime}-${cls.endTime}`;
      schedule[cls.dayOfWeek][key] = schedule[cls.dayOfWeek][key] || [];
      schedule[cls.dayOfWeek][key].push(cls);
    });
    return schedule;
  }, [filteredClasses]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [schoolYearsRes, polesRes, classesRes, roomsRes, teachersRes] = await Promise.all([
          api.get('/admin/school-years'),
          api.get('/admin/poles'),
          api.get('/admin/classes', { params: { schoolYearId: selectedSchoolYearId || undefined } }),
          api.get('/admin/salles'),
          api.get('/admin/professeurs'),
        ]);
        setSchoolYears(schoolYearsRes.data.schoolYears || []);
        setPoles(polesRes.data.poles || []);
        setClasses(classesRes.data.classes || []);
        setRooms(roomsRes.data.rooms || []);
        setTeachers(teachersRes.data.teachers || []);
      } catch (error) {
        console.error(error);
        toast.error(error?.response?.data?.error || 'Impossible de charger les données du planning');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [selectedSchoolYearId]);

  const validateExport = () => {
    if (!filters.type) {
      toast.error('Sélectionnez un type de planning');
      return false;
    }
    if (filters.type === 'pole' && !filters.poleId) {
      toast.error('Choisissez un pôle pour le planning par pôle');
      return false;
    }
    if (filters.type === 'class' && !filters.classId) {
      toast.error('Choisissez une classe pour le planning par classe');
      return false;
    }
    if (filters.type === 'teacher' && !filters.teacherId) {
      toast.error('Choisissez un professeur pour le planning par professeur');
      return false;
    }
    if (filters.type === 'room' && !filters.roomId) {
      toast.error('Choisissez une salle pour le planning par salle');
      return false;
    }
    return true;
  };

  const handleExport = async () => {
    if (!validateExport()) return;

    setExporting(true);
    try {
      const response = await api.post('/admin/exports/planning', {
        type: filters.type,
        poleId: filters.poleId,
        classId: filters.classId,
        teacherId: filters.teacherId,
        roomId: filters.roomId,
        format: filters.format,
      }, { responseType: 'blob' });
      const extension = filters.format === 'excel' ? 'xlsx' : 'pdf';
      downloadBlob(response.data, `planning-${filters.type}.${extension}`);
      toast.success(`Planning ${filters.format === 'excel' ? 'Excel' : 'PDF'} généré`);
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.error || 'Erreur lors de l’export du planning');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: 'var(--amc-primary)', margin: 0, fontSize: 22 }}>Planning des cours</h2>
          <p style={{ margin: '6px 0 0', color: '#555', fontSize: 13 }}>
            Affichez le planning par pôle, classe, professeur ou salle, puis exportez le planning affiché en PDF ou Excel.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="form-control"
            value={filters.format}
            onChange={(e) => setFilters((prev) => ({ ...prev, format: e.target.value }))}
            style={{ minWidth: 140, height: 38 }}
          >
            <option value="pdf">PDF</option>
            <option value="excel">Excel</option>
          </select>
          <button className="btn btn-primary" type="button" onClick={handleExport} disabled={exporting || loading} style={{ minWidth: 160 }}>
            {exporting ? 'Export en cours...' : `Exporter en ${filters.format === 'excel' ? 'Excel' : 'PDF'}`}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 13 }}>Type de planning</label>
            <select
              className="form-control"
              style={{ fontSize: 13, padding: '8px 10px' }}
              value={filters.type}
              onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value, classId: '', teacherId: '', roomId: '' }))}
            >
              <option value="global">Planning global</option>
              <option value="pole">Planning par pôle</option>
              <option value="class">Planning par classe</option>
              <option value="teacher">Planning par professeur</option>
              <option value="room">Planning par salle</option>
            </select>
          </div>

          {(filters.type === 'global' || filters.type === 'pole' || filters.type === 'class') && (
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: 13 }}>Pôle</label>
              <select
                className="form-control"
                style={{ fontSize: 13, padding: '8px 10px' }}
                value={filters.poleId}
                onChange={(e) => setFilters((prev) => ({ ...prev, poleId: e.target.value, classId: '' }))}
              >
                <option value="">Tous</option>
                {poles.map((pole) => (
                  <option key={pole.id} value={pole.id}>{pole.name}</option>
                ))}
              </select>
            </div>
          )}

          {filters.type === 'class' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: 13 }}>Classe</label>
              <select
                className="form-control"
                style={{ fontSize: 13, padding: '8px 10px' }}
                value={filters.classId}
                onChange={(e) => setFilters((prev) => ({ ...prev, classId: e.target.value }))}
              >
                <option value="">Choisir une classe</option>
                {availableClasses.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {`${formatClassLabel(cls)} (${cls.dayOfWeek} ${cls.startTime}-${cls.endTime})`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {filters.type === 'teacher' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: 13 }}>Professeur</label>
              <select
                className="form-control"
                style={{ fontSize: 13, padding: '8px 10px' }}
                value={filters.teacherId}
                onChange={(e) => setFilters((prev) => ({ ...prev, teacherId: e.target.value }))}
              >
                <option value="">Choisir un professeur</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>{`${teacher.firstName || ''} ${teacher.lastName || ''}`.trim()}</option>
                ))}
              </select>
            </div>
          )}

          {filters.type === 'room' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: 13 }}>Salle</label>
              <select
                className="form-control"
                style={{ fontSize: 13, padding: '8px 10px' }}
                value={filters.roomId}
                onChange={(e) => setFilters((prev) => ({ ...prev, roomId: e.target.value }))}
              >
                <option value="">Choisir une salle</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>{room.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 13 }}>Date de référence</label>
            <input
              type="date"
              className="form-control"
              style={{ fontSize: 13, padding: '8px 10px' }}
              value={viewDate}
              onChange={(e) => setViewDate(e.target.value)}
              title="Seules les classes valides à cette date sont affichées"
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Planning affiché</h3>
          <span style={{ color: '#6B7280' }}>{filteredClasses.length} cours affichés</span>
        </div>

        {loading ? (
          <p>Chargement...</p>
        ) : filteredClasses.length === 0 ? (
          <p style={{ color: '#6B7280' }}>Aucun cours trouvé pour ce filtre.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="schedule-table" style={{ minWidth: 780, width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>Horaire</th>
                  {DAYS.map((day) => (
                    <th key={day} style={headerCellStyle}>{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={`${period.startTime}-${period.endTime}`}>
                    <td style={timeCellStyle}>{`${period.startTime} - ${period.endTime}`}</td>
                    {DAYS.map((day) => {
                      const classesForCell = scheduleByDay[day][`${period.startTime}-${period.endTime}`] || [];
                      return (
                        <td key={day} style={cellStyle}>
                          {classesForCell.length === 0 ? (
                            <span style={{ color: '#9CA3AF' }}>—</span>
                          ) : (
                            <div style={{ display: 'grid', gap: 8 }}>
                              {classesForCell.map((cls) => (
                                <div key={cls.id} style={{ padding: 10, borderRadius: 12, background: getSlotColor(cls), border: '1px solid rgba(15, 23, 42, 0.08)', boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)' }}>
                                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{formatClassLabel(cls)}</div>
                                  <div style={{ fontSize: 13, color: '#374151' }}>{formatTeacher(cls)}</div>
                                  <div style={{ fontSize: 12, color: '#6B7280' }}>{formatRoom(cls)}</div>
                                  <div style={{ marginTop: 6, fontSize: 11, color: '#6B7280' }}>{formatPoleLabel(cls)}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const headerCellStyle = {
  padding: '12px 10px',
  background: '#F8FAFC',
  borderBottom: '1px solid #E5E7EB',
  textAlign: 'left',
  fontSize: 13,
  color: '#111827',
};

const timeCellStyle = {
  padding: '10px 8px',
  borderBottom: '1px solid #E5E7EB',
  background: '#F9FAFB',
  fontWeight: 700,
  width: 110,
  verticalAlign: 'top',
  fontSize: 13,
};

const cellStyle = {
  padding: '8px',
  borderBottom: '1px solid #E5E7EB',
  verticalAlign: 'top',
  minWidth: 140,
  fontSize: 13,
};
