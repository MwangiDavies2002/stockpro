'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { businessSettingsApi } from '../../lib/api';
import { canAct } from '../../lib/access';
import { useAccess } from '../AccessBoundary';

type SaleGroup = { name: string; max: number | null };
type SaleGroupDraft = { name: string; max: string };
type Props = { onSaved: () => void };

const defaults: SaleGroup[] = [
  { name: 'Micro', max: 50 },
  { name: 'Small', max: 500 },
  { name: 'Medium', max: 1000 },
  { name: 'Large', max: null },
];
const button = 'border rounded-sm px-3 py-2 text-sm disabled:opacity-50';
const errorMessage = (error: unknown) => {
  if (error && typeof error === 'object') {
    const candidate = error as {
      response?: { data?: { message?: string; error?: string } };
      message?: string;
    };
    return candidate.response?.data?.message || candidate.response?.data?.error || candidate.message || 'Unable to save sales groups';
  }
  return 'Unable to save sales groups';
};

function toDraft(groups: SaleGroup[]): SaleGroupDraft[] {
  return groups.map((group) => ({ name: group.name, max: group.max === null ? '' : String(group.max) }));
}

export default function SalesGroupsManager({ onSaved }: Props) {
  const { access } = useAccess();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currency, setCurrency] = useState('KES');
  const [groups, setGroups] = useState<SaleGroupDraft[]>(toDraft(defaults));
  const canManage = !!(access?.owner || canAct(access, 'settings', 'update'));

  async function editGroups() {
    setLoading(true);
    try {
      const { data } = await businessSettingsApi.get();
      setCurrency(data.currency || 'KES');
      setGroups(toDraft(Array.isArray(data.saleSizeGroups) ? data.saleSizeGroups : defaults));
      setOpen(true);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function updateGroup(index: number, patch: Partial<SaleGroupDraft>) {
    setGroups((current) => current.map((group, i) => i === index ? { ...group, ...patch } : group));
  }

  function addGroup() {
    setGroups((current) => {
      const previousLimit = Number(current[current.length - 2]?.max || 0);
      const suffix = current.filter((group) => group.name.startsWith('New group')).length + 1;
      const newGroup = { name: suffix === 1 ? 'New group' : `New group ${suffix}`, max: String(previousLimit + 500) };
      return [...current.slice(0, -1), newGroup, current[current.length - 1]];
    });
  }

  function removeGroup(index: number) {
    setGroups((current) => {
      const remaining = current.filter((_, i) => i !== index);
      if (index === current.length - 1) remaining[remaining.length - 1].max = '';
      return remaining;
    });
  }

  async function saveGroups() {
    if (saving) return;
    setSaving(true);
    try {
      const saleSizeGroups = groups.map((group, index) => ({
        name: group.name,
        max: index === groups.length - 1 ? null : group.max === '' ? '' : Number(group.max),
      }));
      await businessSettingsApi.update({ saleSizeGroups });
      toast.success('Sales groups saved');
      setOpen(false);
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function rangeLabel(index: number) {
    const lower = index === 0 ? 0 : Number((Number(groups[index - 1].max) + 0.01).toFixed(2));
    const format = (value: number) => value.toLocaleString('en-KE', { maximumFractionDigits: 2 });
    const upper = groups[index].max;
    if (index === groups.length - 1) return `${currency} ${format(lower)} and above`;
    if (upper === '') return 'Enter an upper limit';
    return `${currency} ${format(lower)} to ${currency} ${format(Number(upper))}`;
  }

  if (!canManage) return null;

  return (
    <>
      <button className={button} disabled={loading} onClick={editGroups}>
        {loading ? 'Loading groups...' : 'Manage sales groups'}
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed z-[60] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 w-[calc(100%_-_2rem)] max-w-2xl max-h-[92vh] overflow-auto space-y-4">
            <Dialog.Title className="text-xl font-semibold">Manage sales groups</Dialog.Title>
            <Dialog.Description className="text-sm text-gray-500">
              Name each group and set its maximum sale amount. Ranges join together automatically; the last group includes every higher amount. These groups classify the total of each sale.
            </Dialog.Description>
            <div className="space-y-3">
              {groups.map((group, index) => (
                <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end border rounded-sm p-3">
                  <label className="text-sm">
                    Group name
                    <input
                      className="mt-1 w-full border rounded-sm p-2"
                      maxLength={32}
                      value={group.name}
                      onChange={(event) => updateGroup(index, { name: event.target.value })}
                    />
                  </label>
                  <label className="text-sm">
                    {index === groups.length - 1 ? 'Amount range' : `Up to (${currency})`}
                    {index === groups.length - 1
                      ? <div className="mt-1 border rounded-sm bg-gray-50 p-2 text-gray-600">No upper limit</div>
                      : <input
                        className="mt-1 w-full border rounded-sm p-2"
                        type="number"
                        min={index === 0 ? 0 : Number(groups[index - 1].max) + 0.01}
                        max={1000000000}
                        step="0.01"
                        value={group.max}
                        onChange={(event) => updateGroup(index, { max: event.target.value })}
                      />}
                    <span className="block text-xs text-gray-500 mt-1">{rangeLabel(index)}</span>
                  </label>
                  <button
                    className={`${button} text-red-700`}
                    disabled={groups.length <= 2}
                    onClick={() => removeGroup(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">Use between 2 and 12 groups. Enter amounts in {currency}; fractions up to 0.01 are supported.</p>
            <div className="flex flex-wrap justify-between gap-3">
              <button className={button} disabled={groups.length >= 12} onClick={addGroup}>Add a group</button>
              <div className="flex gap-3">
                <Dialog.Close className={button}>Cancel</Dialog.Close>
                <button className={`${button} bg-green-600 text-white`} disabled={saving} onClick={saveGroups}>
                  {saving ? 'Saving...' : 'Save sales groups'}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
