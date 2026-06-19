"use client";

import { useEffect, useState } from 'react';
import { CheckCircle2, LockKeyhole, RotateCcw, UserRoundCog, X } from 'lucide-react';
import type { AdminQueueAction } from '@/lib/adminQueueActions';

export type OpsUserOption = {
  id: number;
  email: string;
  role: string;
};

const ACTION_COPY: Record<AdminQueueAction, { label: string; title: string; description: string }> = {
  assign: {
    label: 'Assign',
    title: 'Assign selected work',
    description: 'The selected OPS user will become the owner of every eligible record.',
  },
  unassign: {
    label: 'Unassign',
    title: 'Return work to unassigned',
    description: 'Ownership is removed while existing history and attempt records are preserved.',
  },
  complete: {
    label: 'Complete',
    title: 'Mark work complete',
    description: 'This is an administrative completion and will be clearly identified in audit history.',
  },
  close: {
    label: 'Close',
    title: 'Administratively close work',
    description: 'The selected records leave active queues without being treated as successful collections.',
  },
};

const ACTION_ICONS = {
  assign: UserRoundCog,
  unassign: RotateCcw,
  complete: CheckCircle2,
  close: LockKeyhole,
};

type ActionButtonsProps = {
  onAction: (action: AdminQueueAction) => void;
  compact?: boolean;
};

export function AdminQueueActionButtons({ onAction, compact = false }: ActionButtonsProps) {
  return (
    <div className={compact ? 'admin-queue-actions is-compact' : 'admin-queue-actions'}>
      {(Object.keys(ACTION_COPY) as AdminQueueAction[]).map(action => {
        const Icon = ACTION_ICONS[action];
        return (
          <button key={action} type="button" onClick={() => onAction(action)} data-action={action}>
            <Icon size={15} />
            {ACTION_COPY[action].label}
          </button>
        );
      })}
    </div>
  );
}

type ToolbarProps = ActionButtonsProps & {
  count: number;
  onClear: () => void;
};

export function AdminQueueToolbar({ count, onAction, onClear }: ToolbarProps) {
  if (!count) return null;
  return (
    <section className="admin-queue-toolbar" aria-label="Administrative bulk actions">
      <div>
        <strong>{count} selected</strong>
        <span>Actions apply only to eligible active records.</span>
      </div>
      <AdminQueueActionButtons onAction={onAction} compact />
      <button type="button" className="ops-secondary-button" onClick={onClear}>Clear</button>
    </section>
  );
}

type DialogProps = {
  action: AdminQueueAction | null;
  count: number;
  users: OpsUserOption[];
  working: boolean;
  onClose: () => void;
  onSubmit: (action: AdminQueueAction, note: string, assignee?: string) => Promise<void>;
};

export function AdminQueueDialog({ action, count, users, working, onClose, onSubmit }: DialogProps) {
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState('');

  useEffect(() => {
    setNote('');
    setAssignee('');
  }, [action]);

  if (!action) return null;
  const copy = ACTION_COPY[action];
  const Icon = ACTION_ICONS[action];
  const disabled = working || !note.trim() || (action === 'assign' && !assignee);

  return (
    <div className="admin-queue-backdrop" role="presentation">
      <section className="admin-queue-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-queue-title">
        <header>
          <div className="admin-queue-dialog-icon"><Icon size={19} /></div>
          <div>
            <small>Administrator action</small>
            <h2 id="admin-queue-title">{copy.title}</h2>
          </div>
          <button type="button" title="Close" className="ops-icon-button" onClick={onClose}><X size={17} /></button>
        </header>
        <p>{copy.description}</p>
        <div className="admin-queue-selection-summary">
          {count} {count === 1 ? 'record' : 'records'} selected
        </div>
        {action === 'assign' && (
          <label>
            <span>Assign to</span>
            <select value={assignee} onChange={event => setAssignee(event.target.value)}>
              <option value="">Select an OPS user</option>
              {users.map(user => (
                <option key={user.id} value={user.email}>{user.email} ({user.role.replace(/_/g, ' ')})</option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>Required administrative note</span>
          <textarea
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder="Explain why this action is being taken. This note becomes part of every selected record's permanent audit history."
          />
        </label>
        <footer>
          <button type="button" className="ops-secondary-button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="ops-primary-button"
            disabled={disabled}
            onClick={() => void onSubmit(action, note.trim(), assignee || undefined)}
          >
            {working ? 'Applying...' : `${copy.label} ${count === 1 ? 'record' : `${count} records`}`}
          </button>
        </footer>
      </section>
    </div>
  );
}
