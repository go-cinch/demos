'use client';
import { groupMemberAccess } from '../management-access';
import { AButton, useAdminIdentity, useAdminText } from './admin-ui';
import { MemberList } from './record-detail';
import AssociationEditor from './association-editor';
import { type AdminRecord, countMembers } from '@/features/admin/model';
export default function GroupMemberEditor({
  record,
  added,
  removed,
  disabled = false,
  onChange
}: {
  record: AdminRecord;
  added: number[];
  removed: number[];
  disabled?: boolean;
  onChange: (added: number[], removed: number[]) => void;
}) {
  const text = useAdminText();
  const access = groupMemberAccess(useAdminIdentity());
  return (
    <div className='space-y-4' data-testid='group-member-editor'>
      <p role='status'>
        {text('system-members.changes', { added: added.length, removed: removed.length })}
      </p>
      <MemberList
        id={record.id}
        count={countMembers(record)}
        removed={removed}
        disabled={disabled}
        onRemove={access.remove ? (member) => {
          if (disabled || !access.remove) return;
          onChange(added, removed.includes(member.id)
            ? removed.filter((id) => id !== member.id) : [...removed, member.id]);
        } : undefined}
      />
      {access.add && <AssociationEditor
        resource='user'
        browseAllowed={access.add}
        disabled={disabled}
        excludeGroup={record.id}
        value={added}
        onChange={(ids) => { if (!disabled && access.add) onChange(ids.map(Number), removed); }}
      />}
      {!!removed.length && access.remove && (
        <AButton disabled={disabled} onClick={() => { if (!disabled && access.remove) onChange(added, []); }}>{text('system-editor.undo')}</AButton>
      )}
    </div>
  );
}
