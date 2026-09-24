import { useState, type FC } from 'react'
import { useApp } from '../../context/AppContext'
import { useConfirm } from './Confirm'
import { Notice } from './kit'
import { useToast } from './Toast'

/** Offered once: records the previous software kept only in this browser and that never reached the database. */
export const LegacyCopyBanner: FC = () => {
  const { legacyCopy, importLegacyCopy, discardLegacyCopy } = useApp()
  const confirm = useConfirm()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  if (!legacyCopy) return null

  const doImport = async () => {
    setBusy(true)
    const r = await importLegacyCopy()
    setBusy(false)
    if (r.ok) toast.success(`Imported ${legacyCopy.missing} record(s) from the old browser copy. The old copy was removed from this browser.`)
    else toast.error(r.error)
  }

  const doDiscard = async () => {
    const yes = await confirm({
      title: 'Delete the old browser copy?',
      message: `This browser still holds ${legacyCopy.missing} record(s) of the previous software that are not in the database. If you delete them, they are lost for good.`,
      confirmLabel: 'Delete them',
      tone: 'danger',
    })
    if (yes) discardLegacyCopy()
  }

  return (
    <Notice tone="warning">
      <div>
        <strong>Old data found in this browser.</strong> The previous version of the software kept a copy of the station data here.{' '}
        {legacyCopy.missing} record(s) in it are not in the cloud database yet. Import them now so nothing is lost — existing records are never changed.
      </div>
      <div className="ui-notice-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={doImport} disabled={busy}>
          {busy ? 'Importing…' : 'Import missing records'}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={doDiscard} disabled={busy}>
          Delete old copy
        </button>
      </div>
    </Notice>
  )
}
