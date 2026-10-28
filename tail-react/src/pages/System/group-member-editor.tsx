"use client";
import { AButton, useAdminText } from "./admin-ui";
import { MemberList } from "./record-detail";
import AssociationEditor from "./association-editor";
import { type AdminRecord, countMembers } from "@/utils/admin/model";
export default function GroupMemberEditor({
  record,
  added,
  removed,
  onChange,
}: {
  record: AdminRecord;
  added: number[];
  removed: number[];
  onChange: (added: number[], removed: number[]) => void;
}) {
  const text = useAdminText();
  return (
    <div className="space-y-4" data-testid="group-member-editor">
      <p role="status">
        {text("system-members.changes", {
          added: added.length,
          removed: removed.length,
        })}
      </p>
      <MemberList
        id={record.id}
        count={countMembers(record)}
        removed={removed}
        onRemove={(member) =>
          onChange(
            added,
            removed.includes(member.id)
              ? removed.filter((id) => id !== member.id)
              : [...removed, member.id],
          )
        }
      />
      <AssociationEditor
        resource="user"
        excludeGroup={record.id}
        value={added}
        onChange={(ids) => onChange(ids.map(Number), removed)}
      />
      {!!removed.length && (
        <AButton onClick={() => onChange(added, [])}>
          {text("system-editor.undo")}
        </AButton>
      )}
    </div>
  );
}
