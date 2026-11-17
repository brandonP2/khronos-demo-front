import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Check, Map as MapIcon, Pencil, Plus, Trash2, X } from 'lucide-react'
import { ApiError } from '../../api/client'
import { api } from '../../api/endpoints'
import type { Zone } from '../../api/types'
import { useMe } from '../../auth/AuthContext'
import { TimeZoneField } from '../../components/TimeZoneField'
import { Button, ConfirmDialog, Empty, ErrorNote, Field, Loading, PageHead, useToast } from '../../components/ui'
import { useT } from '../../lib/i18n'
import { useEvents, useInvalidate, useShifts, useZones } from '../../lib/queries'
import { addDays, DEFAULT_TIME_ZONE, eventDate, shiftWindow, venueTimeZone, zonedToday } from '../../lib/time'
import { useVenue } from '../../lib/VenueContext'

export default function VenuePage() {
  const t = useT()
  const me = useMe()
  const { venue } = useVenue()
  // Only what is ahead matters here: it is what a zone delete would cancel. Today is the venue's,
  // and shifts come from yesterday on, as a night shift that started then may still be running.
  const venueZone = venueTimeZone(venue)
  const day = zonedToday(venueZone)
  const zones = useZones(venue?.id)
  const shifts = useShifts(me.id, zones.data?.map((z) => z.id), { from: addDays(day, -1) })
  const events = useEvents(venue?.id, { from: day })
  const invalidate = useInvalidate()
  const toast = useToast()

  const [name, setName] = useState(venue?.establishmentName ?? '')
  const [address, setAddress] = useState(venue?.establishmentAddress ?? '')
  const savedZone = venue?.timeZone || DEFAULT_TIME_ZONE
  const [timeZone, setTimeZone] = useState(savedZone)
  const [newZone, setNewZone] = useState('')
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null)
  const [deleting, setDeleting] = useState<Zone | null>(null)

  const saveVenue = useMutation({
    mutationFn: () =>
      api.establishments.update(venue!.id, {
        establishmentName: name.trim(),
        establishmentAddress: address.trim(),
        ownerId: me.id,
        timeZone,
      }),
    onSuccess: async () => {
      await invalidate.venues()
      toast(t.venuePage.saved)
    },
  })

  const addZone = useMutation({
    mutationFn: () => api.zones.create(newZone.trim(), venue!.id),
    onSuccess: async (z) => {
      setNewZone('')
      await invalidate.zones()
      toast(t.venuePage.zoneAdded(z.name))
    },
  })

  const renameZone = useMutation({
    mutationFn: (z: { id: number; name: string }) => api.zones.update(z.id, z.name.trim(), venue!.id),
    onSuccess: async () => {
      setEditing(null)
      await Promise.all([invalidate.zones(), invalidate.schedule()])
    },
  })

  if (!venue) return null
  const now = Date.now()
  // A shift is ahead until it ends
  const upcoming = (zoneId: number) => ({
    shifts: (shifts.data ?? []).filter((s) => s.zoneId === zoneId && shiftWindow(s, venueZone).end > now).length,
    events: (events.data ?? []).filter((e) => e.zoneId === zoneId && eventDate(e.dateTime) >= day).length,
  })
  const venueDirty =
    name.trim() !== venue.establishmentName || address.trim() !== venue.establishmentAddress || timeZone !== savedZone
  const venueErrors = saveVenue.error instanceof ApiError ? saveVenue.error.fieldErrors : {}

  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <PageHead title={t.venuePage.title} sub={t.venuePage.sub} />

      <section className="card">
        <div className="card-head">
          <h2>{t.venuePage.zones}</h2>
          <span className="muted mono" style={{ fontSize: 12 }}>
            {zones.data?.length ?? 0}
          </span>
        </div>
        {zones.isLoading ? (
          <div className="card-body">
            <Loading rows={2} />
          </div>
        ) : zones.data?.length === 0 ? (
          <Empty icon={MapIcon} title={t.venuePage.noZones}>
            {t.venuePage.noZonesBody}
          </Empty>
        ) : (
          <div className="list">
            {zones.data?.map((z) => {
              const u = upcoming(z.id)
              const isEditing = editing?.id === z.id
              return (
                <div key={z.id} className="list-row">
                  {isEditing ? (
                    <form
                      className="actions"
                      style={{ flex: 1 }}
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (editing.name.trim()) renameZone.mutate(editing)
                      }}
                    >
                      <input
                        className="input"
                        style={{ maxWidth: 280 }}
                        aria-label={t.venuePage.zoneName}
                        autoFocus
                        maxLength={50}
                        value={editing.name}
                        onChange={(e) => setEditing({ id: z.id, name: e.target.value })}
                      />
                      <Button size="sm" variant="primary" type="submit" icon={Check} loading={renameZone.isPending}>
                        {t.common.save}
                      </Button>
                      <Button size="sm" variant="ghost" iconOnly icon={X} aria-label={t.common.cancel} onClick={() => setEditing(null)} />
                    </form>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontWeight: 500 }}>{z.name}</span>
                      <span className="muted mono hide-sm" style={{ fontSize: 12 }}>
                        {t.venuePage.ahead(u.shifts, u.events)}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        icon={Pencil}
                        aria-label={t.venuePage.rename(z.name)}
                        onClick={() => setEditing({ id: z.id, name: z.name })}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        icon={Trash2}
                        aria-label={t.venuePage.delete(z.name)}
                        onClick={() => setDeleting(z)}
                      />
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <form
          className="card-body actions"
          style={{ borderTop: '1px solid var(--line)', flexWrap: 'nowrap' }}
          onSubmit={(e) => {
            e.preventDefault()
            if (newZone.trim()) addZone.mutate()
          }}
        >
          <input
            className="input"
            placeholder={t.venuePage.newZone}
            aria-label={t.venuePage.newZone}
            maxLength={50}
            value={newZone}
            onChange={(e) => setNewZone(e.target.value)}
          />
          <Button type="submit" icon={Plus} disabled={!newZone.trim()} loading={addZone.isPending}>
            {t.venuePage.addZone}
          </Button>
        </form>
        {(addZone.error || renameZone.error) && (
          <div style={{ padding: '0 20px 20px' }}>
            <ErrorNote error={addZone.error ?? renameZone.error} />
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{t.venuePage.details}</h2>
        </div>
        <form
          className="card-body form"
          onSubmit={(e) => {
            e.preventDefault()
            saveVenue.mutate()
          }}
        >
          <div className="row-2">
            <Field label={t.venuePage.name}>
              {(id) => <input id={id} className="input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label={t.venuePage.address}>
              {(id) => (
                <input id={id} className="input" maxLength={255} value={address} onChange={(e) => setAddress(e.target.value)} />
              )}
            </Field>
          </div>
          <TimeZoneField value={timeZone} onChange={setTimeZone} error={venueErrors.timeZone} />
          <ErrorNote error={saveVenue.error} />
          <div>
            <Button type="submit" variant="primary" disabled={!venueDirty || !name.trim() || !address.trim()} loading={saveVenue.isPending}>
              {t.venuePage.saveDetails}
            </Button>
          </div>
        </form>
      </section>

      {deleting && (
        <ConfirmDialog
          title={t.venuePage.deleteTitle(deleting.name)}
          confirmLabel={t.venuePage.deleteConfirm}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api.zones.remove(deleting.id)
            await Promise.all([invalidate.zones(), invalidate.schedule()])
            toast(t.venuePage.deleted(deleting.name))
          }}
        >
          {(() => {
            const u = upcoming(deleting.id)
            return u.shifts || u.events ? t.venuePage.deleteBodyAhead(u.shifts, u.events) : t.venuePage.deleteBody
          })()}
        </ConfirmDialog>
      )}
    </div>
  )
}
