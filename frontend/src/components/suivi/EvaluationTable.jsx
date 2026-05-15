export default function EvaluationTable({ rows, mode = 'notes', onGradeChange, onAppreciationChange, onStatusChange, onJustificationChange, onSubmittedToggle }) {
  return (
    <div className="card">
      <div className="card-header">
        <h3>{mode === 'absences' ? 'Gestion des absences' : mode === 'devoirs' ? 'Gestion des devoirs' : 'Gestion des notes'}</h3>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Élève</th>
              {mode === 'notes' && <th>Note</th>}
              {mode === 'notes' && <th>Appréciation</th>}
              {mode === 'absences' && <th>NB Absence</th>}
              {mode === 'absences' && <th>Absent</th>}
              {mode === 'absences' && <th>Justification</th>}
              {mode === 'devoirs' && <th>Note</th>}
              {mode === 'devoirs' && <th>Devoir rendu</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={mode === 'absences' ? 4 : 3}>Aucun élève trouvé pour cette sélection.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.studentId}-${row.lessonId || 'class'}`}>
                  <td>{row.studentName}</td>
                  {mode === 'notes' && (
                    <>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          className="form-control"
                          value={row.grade}
                          onChange={(event) => onGradeChange(row.studentId, Number(event.target.value))}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="form-control"
                          value={row.appreciation}
                          onChange={(event) => onAppreciationChange(row.studentId, event.target.value)}
                          placeholder="Notez un commentaire"
                        />
                      </td>
                    </>
                  )}
                  {mode === 'absences' && (
                    <>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>
                        {row.absenceCount || 0}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={row.status === 'missing'}
                          onChange={(event) => onStatusChange(row.studentId, event.target.checked ? 'missing' : 'on_time')}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="form-control"
                          value={row.justification || ''}
                          onChange={(event) => onJustificationChange(row.studentId, event.target.value)}
                          placeholder="Motif de l'absence"
                        />
                      </td>
                    </>
                  )}
                  {mode === 'devoirs' && (
                    <>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          className="form-control"
                          value={row.grade}
                          onChange={(event) => onGradeChange(row.studentId, Number(event.target.value))}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`btn ${row.submitted ? 'btn-success' : 'btn-outline'}`}
                          onClick={() => onSubmittedToggle(row.studentId)}
                        >
                          {row.submitted ? 'Oui' : 'Non'}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
