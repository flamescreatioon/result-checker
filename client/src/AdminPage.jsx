import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiUrl } from './api'

function AdminPage() {
  const [file, setFile] = useState(null)
  const [adminPassword, setAdminPassword] = useState('')
  const [level, setLevel] = useState('')
  const [semesterName, setSemesterName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        setError('Please select a .csv file')
        setFile(null)
        return
      }
      setFile(selectedFile)
      setError('')
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    
    if (!file) {
      setError('Please select a CSV file')
      return
    }

    if (!adminPassword.trim()) {
      setError('Admin password is required')
      return
    }

    if (!level.trim()) {
      setError('Level is required')
      return
    }

    if (!semesterName.trim()) {
      setError('Semester is required')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('level', level)
      formData.append('semesterName', semesterName)

      const headers = {
        'x-admin-password': adminPassword
      }

      const response = await fetch(apiUrl('/api/admin/upload-csv'), {
        method: 'POST',
        body: formData,
        headers,
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.message || `Upload failed with status ${response.status}`)
      }

      setSuccess(
        `✓ CSV uploaded successfully!\n\n` +
        `File: ${payload.import.sourceFile}\n` +
        `Rows imported: ${payload.import.imported}\n` +
        `Institution: ${payload.import.metadata?.institution || 'N/A'}\n` +
        `Semester: ${payload.import.metadata?.semester || 'N/A'}`
      )

      setFile(null)
      setAdminPassword('')
      setLevel('')
      setSemesterName('')
      event.target.reset()
    } catch (fetchError) {
      const message =
        fetchError instanceof TypeError
          ? 'Cannot reach API server. Start backend with npm run dev from the project root.'
          : fetchError.message
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <nav className="admin-nav">
        <div className="nav-container">
          <Link to="/" className="back-link">← Back to Search</Link>
        </div>
      </nav>

      <main className="page-shell">
      <section className="hero">
        <p className="badge">Admin Panel</p>
        <h1>Upload Result CSV Files</h1>
        <p className="hero-copy">
          Import new result sheets by uploading CSV files. Files will be processed and added to
          the database.
        </p>
      </section>

      <section className="admin-grid">
        <article className="card wide">
          <h2>Upload CSV File</h2>

          <form onSubmit={handleSubmit} className="admin-form">
            <div className="form-group">
              <label htmlFor="csvFile">Select CSV File *</label>
              <input
                id="csvFile"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                disabled={loading}
                required
              />
              {file && <p className="file-name">Selected: {file.name}</p>}
            </div>

            <div className="form-group">
              <label htmlFor="adminPassword">Admin Password *</label>
              <input
                id="adminPassword"
                type="password"
                placeholder="Enter admin password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                disabled={loading}
                required
              />
              <p className="field-hint">Required to authorize file upload</p>
            </div>

            <div className="form-group-grid">
              <div className="form-group">
                <label htmlFor="level">Level *</label>
                <select
                  id="level"
                  value={level}
                  onChange={(event) => setLevel(event.target.value)}
                  disabled={loading}
                  required
                >
                  <option value="">Select level</option>
                  <option value="100 LEVEL">100 LEVEL</option>
                  <option value="200 LEVEL">200 LEVEL</option>
                  <option value="300 LEVEL">300 LEVEL</option>
                  <option value="400 LEVEL">400 LEVEL</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="semesterName">Semester *</label>
                <select
                  id="semesterName"
                  value={semesterName}
                  onChange={(event) => setSemesterName(event.target.value)}
                  disabled={loading}
                  required
                >
                  <option value="">Select semester</option>
                  <option value="FIRST">FIRST</option>
                  <option value="SECOND">SECOND</option>
                </select>
              </div>
            </div>

            <button type="submit" disabled={!file || loading} className="submit-btn">
              {loading ? 'Uploading...' : 'Upload CSV'}
            </button>
          </form>

          {error && <p className="error-box">{error}</p>}
          {success && <p className="success-box">{success}</p>}
        </article>

        <article className="card">
          <h2>CSV Format</h2>
          <div className="info-box">
            <p>Your CSV file should include:</p>
            <ul>
              <li>Student registration numbers (RegNo column)</li>
              <li>Student full names</li>
              <li>Course codes and grades</li>
              <li>GPA and cumulative GPA values</li>
            </ul>
            <p>
              <strong>Required form fields:</strong> Admin password, level, semester, and CSV file
            </p>
          </div>
        </article>
      </section>
    </main>
    </>
  )
}

export default AdminPage
