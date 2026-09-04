import { useEffect, useState } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { LibraryPage } from '@/features/library/LibraryPage'
import { WorkspacePage } from '@/features/workspace/WorkspacePage'
import { RecordPage } from '@/features/record/RecordPage'
import { NotFound } from '@/components/NotFound'
import { BootScreen } from '@/features/boot/BootScreen'
import { markHydrated, useSessions } from '@/state/store'

/**
 * Three product-level destinations, maximum depth 2. No sidebar, no breadcrumb,
 * no nested routing (§A.1). Everything else in the product is a mode, not a route.
 */
const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/library" replace /> },
  { path: '/library', element: <LibraryPage /> },
  { path: '/case/:caseId', element: <WorkspacePage /> },
  { path: '/case/:caseId/record', element: <RecordPage /> },
  { path: '*', element: <NotFound /> },
])

export function App() {
  const hydrated = useSessions((s) => s.hydrated)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    // Zustand's persist middleware does not fire rehydration when the key is
    // absent, which is the first-run case.
    const t = window.setTimeout(markHydrated, 0)
    return () => window.clearTimeout(t)
  }, [])

  /*
   * The entry sequence covers the app rather than replacing it, so the router
   * mounts underneath while it plays and the first route is warm by the time it
   * lifts. Hydration is a tick, so this is an entry, not a loading gate.
   */
  return (
    <>
      {hydrated && <RouterProvider router={router} />}
      {booting && <BootScreen onDone={() => setBooting(false)} />}
    </>
  )
}
