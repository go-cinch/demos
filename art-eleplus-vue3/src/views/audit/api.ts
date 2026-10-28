import { getAuditList, getAuditSummary, getAuditDetail, exportAudit } from '@/utils/admin/service'
export const auditApi = {
  list: getAuditList,
  summary: getAuditSummary,
  get: getAuditDetail,
  export: exportAudit
}
