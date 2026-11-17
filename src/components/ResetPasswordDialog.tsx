import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import { useT } from '../lib/i18n'
import { isValidPassword, passwordError } from '../lib/password'
import { Button, Dialog, ErrorNote, Field, useToast } from './ui'

/**
 * Sets a new password for someone else: an owner for their staff, an admin for an owner.
 * The current password is not needed; the new one is typed twice to confirm it.
 */
export function ResetPasswordDialog({ userId, name, onClose }: { userId: number; name: string; onClose: () => void }) {
  const t = useT()
  const toast = useToast()
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')

  const mutation = useMutation({
    mutationFn: () => api.users.resetPassword(userId, next),
    onSuccess: () => {
      toast(t.resetPassword.done(name))
      onClose()
    },
  })

  const lengthError = passwordError(next, t, !!repeat)
  const mismatch = repeat && next !== repeat ? t.fields.mismatch : undefined
  const valid = isValidPassword(next) && next === repeat
  const apiError = mutation.error instanceof ApiError ? mutation.error.fieldErrors.newPassword : undefined
  const submit = () => valid && mutation.mutate()

  return (
    <Dialog
      title={t.resetPassword.title(name)}
      sub={t.resetPassword.sub}
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" disabled={!valid} loading={mutation.isPending} onClick={submit}>
            {t.resetPassword.action}
          </Button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label={t.resetPassword.newPassword} hint={t.resetPassword.hint} error={lengthError ?? apiError}>
          {(id) => (
            <input
              id={id}
              type="password"
              className="input"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          )}
        </Field>
        <Field label={t.resetPassword.repeat} error={mismatch}>
          {(id) => (
            <input
              id={id}
              type="password"
              className="input"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          )}
        </Field>
        <ErrorNote error={mutation.error} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
