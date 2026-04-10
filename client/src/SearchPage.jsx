import { useMemo, useState } from 'react'

function SearchPage() {
  const [regNo, setRegNo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const canSearch = useMemo(() => regNo.trim().length > 0, [regNo])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSearch) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/results/${encodeURIComponent(regNo.trim())}`)
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.message || 'Could not find that registration number')
      }

      setResult(payload)
    } catch (fetchError) {
      setResult(null)
      const message =
        fetchError instanceof TypeError
          ? 'Cannot reach API server. Start backend with npm run dev from the project root.'
          : fetchError.message
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const asNumber = (value, fallback = '-') => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return fallback
    }
    return Number(value).toFixed(2)
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="badge">Result Checker</p>
        <h1>Check semester and cumulative performance in seconds</h1>
        <p className="hero-copy">
          Enter your registration number to view current GPA, cumulative GPA, and
          semester-by-semester summary.
        </p>

        <form onSubmit={handleSubmit} className="search-form">
          <label htmlFor="regNo">Registration Number</label>
          <div className="field-row">
            <input
              id="regNo"
              type="text"
              placeholder="e.g. CME/20/109001"
              value={regNo}
              onChange={(event) => setRegNo(event.target.value)}
            />
            <button type="submit" disabled={!canSearch || loading}>
              {loading ? 'Checking...' : 'Check Result'}
            </button>
          </div>
        </form>

        {error ? <p className="error-box">{error}</p> : null}
      </section>

      {result ? (
        <section className="result-grid">
          <article className="card">
            <h2>Student</h2>
            <p className="meta">Reg No: {result.student.regNo}</p>
            <p className="meta">
              Name: {result.student.fullName ? result.student.fullName : 'Not available'}
            </p>
          </article>

          <article className="card metric-card">
            <h2>Current GPA</h2>
            <p className="metric">{asNumber(result.summary.currentGpa)}</p>
            <p className="meta">Latest semester GPA</p>
          </article>

          <article className="card metric-card">
            <h2>Cumulative GPA</h2>
            <p className="metric">{asNumber(result.summary.cumulativeGpa)}</p>
            <p className="meta">Across {result.summary.totalSemesters} semester(s)</p>
          </article>

          <article className="card wide">
            <h2>Semester History</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Semester</th>
                    <th>Level</th>
                    <th>Current GPA</th>
                    <th>Cumulative GPA</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {result.semesters.map((semester) => (
                    <tr
                      key={`${semester.sessionYear}-${semester.semesterName}-${semester.level}`}
                    >
                      <td>{semester.sessionYear}</td>
                      <td>{semester.semesterName}</td>
                      <td>{semester.level || '-'}</td>
                      <td>{asNumber(semester.currentGpa)}</td>
                      <td>{asNumber(semester.cumulativeGpa)}</td>
                      <td>{semester.remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="card wide">
            <h2>Course Grades by Semester</h2>
            <div className="semester-grade-grid">
              {result.semesters.map((semester) => (
                <section
                  key={`courses-${semester.sessionYear}-${semester.semesterName}-${semester.level}`}
                  className="semester-grade-card"
                >
                  <div className="semester-grade-head">
                    <p>
                      {semester.sessionYear} - {semester.semesterName} ({semester.level || '-'})
                    </p>
                    <span>GPA: {asNumber(semester.currentGpa)}</span>
                  </div>

                  {semester.courses && semester.courses.length > 0 ? (
                    <div className="course-chip-wrap">
                      {semester.courses.map((course) => (
                        <div
                          key={`${semester.sessionYear}-${semester.semesterName}-${course.courseCode}`}
                          className="course-chip"
                        >
                          <span className="course-code">{course.courseCode}</span>
                          <span className="course-grade">{course.grade || '-'}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="no-course-data">No individual course grades available.</p>
                  )}
                </section>
              ))}
            </div>
          </article>
        </section>
      ) : (
        <section className="empty-state">
          <p>
            Search for a registration number to display GPA, cumulative GPA, and semester
            history.
          </p>
        </section>
      )}
    </main>
  )
}

export default SearchPage
