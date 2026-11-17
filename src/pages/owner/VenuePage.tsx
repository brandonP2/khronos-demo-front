import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Check, Map as MapIcon, Pencil, Plus, Trash2, X } from 'lucide-react'
import { api } from '../../api/endpoints'
import type { Zone } from '../../api/types'
import { useMe } from '../../auth/AuthContext'
import { Button, ConfirmDialog, Empty, ErrorNote, Field, Loading, PageHead, pluralize, useToast } from '../../components/ui'
import { useEvents, useInvalidate, useShifts, useZones } from '../../lib/queries'
import { eventDate, today } from '../../lib/time'
import { useVenue } from '../../lib/VenueContext'

export default function VenuePage() {
  const me = useMe()
  const { venue } = useVenue()
  // Only what is ahead matters here: it is what a zone delete would cancel
  const zones = useZones(venue?.id)
  const shifts = useShifts(me.id, zones.data?.map((z) => z.id), { from: today() })
  const events = useEvents(venue?.id, { from: today() })
  const invalidate = useInvalidate()
  const toast = useToast()

  const [name, setName] = useState(venue?.establishmentName ?? '')
  const [address, setAddress] = useState(venue?.establishmentAddress ?? '')
  const [newZone, setNewZone] = useState('')
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null)
  const [deleting, setDeleting] = useState<Zone | null>(null)

  const saveVenue = useMutation({
    mutationFn: () =>
      api.establishments.update(venue!.id, {
        establishmentName: name.trim(),
        establishmentAddress: address.trim(),
        ownerId: me.id,
      }),
    onSuccess: async () => {
      await invalidate.venues()
      toast('Venue saved')
    },
  })

  const addZone = useMutation({
    mutationFn: () => api.zones.create(newZone.trim(), venue!.id),
    onSuccess: async (z) => {
      setNewZone('')
      await invalidate.zones()
      toast(`${z.name} added`)
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
  const t = today()
  const upcoming = (zoneId: number) => ({
    shifts: (shifts.data ?? []).filter((s) => s.zoneId === zoneId && s.date >= t).length,
    events: (events.data ?? []).filter((e) => e.zoneId === zoneId && eventDate(e.dateTime) >= t).length,
  })
  const venueDirty = name.trim() !== venue.establishmentName || address.trim() !== venue.establishmentAddress

  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <PageHead title="Venue and zones" sub="Zones are the areas people work in, like Terrace, Kitchen or Main hall." />

      <section className="card">
        <div className="card-head">
          <h2>Zones</h2>
          <span className="muted mono" style={{ fontSize: 12 }}>
            {zones.data?.length ?? 0}
          </span>
        </div>
        {zones.isLoading ? (
          <div className="card-body">
            <Loading rows={2} />
          </div>
        ) : zones.data?.length === 0 ? (
          <Empty icon={MapIcon} title="No zones yet">
            Add the first one below. Every shift and event belongs to a zone.
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
                        aria-label="Zone name"
                        autoFocus
                        maxLength={50}
                        value={editing.name}
                        onChange={(e) => setEditing({ id: z.id, name: e.target.value })}
                      />
                      <Button size="sm" variant="primary" type="submit" icon={Check} loading={renameZone.isPending}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" iconOnly icon={X} aria-label="Cancel" onClick={() => setEditing(null)} />
                    </form>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontWeight: 500 }}>{z.name}</span>
                      <span className="muted mono hide-sm" style={{ fontSize: 12 }}>
                        {pluralize(u.shifts, 'shift')} · {pluralize(u.events, 'event')} ahead
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        icon={Pencil}
                        aria-label={`Rename ${z.name}`}
                        onClick={() => setEditing({ id: z.id, name: z.name })}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        icon={Trash2}
                        aria-label={`Delete ${z.name}`}
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
            placeholder="New zone name"
            aria-label="New zone name"
            maxLength={50}
            value={newZone}
            onChange={(e) => setNewZone(e.target.value)}
          />
          <Button type="submit" icon={Plus} disabled={!newZone.trim()} loading={addZone.isPending}>
            Add zone
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
          <h2>Venue details</h2>
        </div>
        <form
          className="card-body form"
          onSubmit={(e) => {
            e.preventDefault()
            saveVenue.mutate()
          }}
        >
          <div className="row-2">
            <Field label="Name">
              {(id) => <input id={id} className="input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label="Address">
              {(id) => (
                <input id={id} className="input" maxLength={255} value={address} onChange={(e) => setAddress(e.target.value)} />
              )}
            </Field>
          </div>
          <ErrorNote error={saveVenue.error} />
          <div>
            <Button type="submit" variant="primary" disabled={!venueDirty || !name.trim() || !address.trim()} loading={saveVenue.isPending}>
              Save details
            </Button>
          </div>
        </form>
      </section>

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}`}
          confirmLabel="Delete zone"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api.zones.remove(deleting.id)
            await Promise.all([invalidate.zones(), invalidate.schedule()])
            toast(`${deleting.name} deleted`)
          }}
        >
          {(() => {
            const u = upcoming(deleting.id)
            return u.shifts || u.events
              ? `This also deletes every shift and event in it, including ${pluralize(u.shifts, 'upcoming shift')} and ${pluralize(u.events, 'upcoming event')}. People on those events are emailed. This cannot be undone.`
              : 'This also deletes any past shifts and events recorded in it. This cannot be undone.'
          })()}
        </ConfirmDialog>
      )}
    </div>
  )
}
