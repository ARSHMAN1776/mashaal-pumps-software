import { useState, type FC, type FormEvent } from 'react'
import { useApp } from '../../context/AppContext'
import { CheckCircleIcon } from './Icons'
import { Modal, FormError } from './Modal'
import { Field } from './kit'
import { useSubmit } from './useSubmit'
import { useToast } from './Toast'

/**
 * Change-password dialog. When `forced` is true (first sign-in with a password chosen by the owner or the
 * default one) it cannot be dismissed until a new password is set.
 */
export const PasswordDialog: FC<{ forced?: boolean; onClose?: () => void }> = ({ forced = false, onClose }) => {
  const { changePassword, logout, currentUser } = useApp()
  const toast = useToast()
  const { busy, error, setError, run } = useSubmit()
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (pw1.length < 8) return setError('The password must be at least 8 characters.')
    if (pw1 !== pw2) return setError('The two passwords do not match.')
    if (currentUser && pw1.toLowerCase() === currentUser.username.toLowerCase()) return setError('The password cannot be the same as the username.')
    void run(() => changePassword(pw1), () => {
      toast.success('Password changed.')
      onClose?.()
    })
  }

  return (
    <Modal
      title={forced ? 'Choose a new password' : 'Change my password'}
      subtitle={forced ? 'For security, the password you signed in with must be replaced before you continue.' : `Signed in as ${currentUser?.username}`}
      onClose={() => (forced ? undefined : onClose?.())}
      width={460}
      busy={busy || forced}
    >
      <form className="modal-form-compact" onSubmit={submit}>
        <Field label="New password" hint="At least 8 characters. Use something others cannot guess.">
          <input type="password" className="form-input" value={pw1} onChange={(e) => setPw1(e.target.value)} autoFocus autoComplete="new-password" required />
        </Field>
        <Field label="Repeat the new password">
          <input type="password" className="form-input" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
        </Field>
        <FormError message={error} />
        <div className="modal-actions-footer">
          {forced ? (
            <button type="button" className="btn btn-ghost" onClick={() => void logout()} disabled={busy}>
              Sign out
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <CheckCircleIcon size={16} />
            <span>{busy ? 'Saving…' : 'Save password'}</span>
          </button>
        </div>
      </form>
    </Modal>
  )
}
