import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', gap: 12 }}>
      <div style={{ textAlign: 'center' }}>
        <div className="display" style={{ fontSize: 18, marginBottom: 8 }}>Not found</div>
        <div style={{ color: 'var(--text-dim)', marginBottom: 16 }}>
          That destination does not exist.
        </div>
        <Link to="/library" className="btn">Case Library</Link>
      </div>
    </div>
  )
}
