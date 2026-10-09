import { Skeleton } from 'antd-mobile';
import RecordListSkeleton from './RecordListSkeleton';
import type { ResourceKind } from '../lib/types';
import { t } from '../locales';

export default function PageSkeleton({
  variant = 'page',
  resource,
  rows,
  listKind,
  selecting,
  columns,
  optionDetail,
}: {
  variant?: 'list' | 'management' | 'overview' | 'page' | 'message-detail' | 'options';
  resource?: ResourceKind;
  rows?: number;
  listKind?: 'resource' | 'message' | 'sent' | 'recent' | 'queue';
  selecting?: boolean;
  columns?: string[];
  optionDetail?: boolean;
}) {
  if (variant === 'list') {
    return (
      <RecordListSkeleton
        resource={resource}
        rows={rows}
        kind={listKind}
        selecting={selecting}
        columns={columns}
      />
    );
  }
  if (variant === 'options') {
    return (
      <div
        className="page-skeleton-options"
        role="status"
        aria-busy="true"
        aria-label={t('loading')}
      >
        {Array.from({ length: rows || 4 }, (_, index) => (
          <div className="option-row" aria-hidden="true" key={index}>
            <span className="option-copy" style={{ width: '70%' }}>
              {optionDetail ? (
                <>
                  <strong>
                    <span className="skeleton-text" style={{ width: '80%' }} />
                  </strong>
                  <small>
                    <span className="skeleton-text" style={{ width: '50%' }} />
                  </small>
                </>
              ) : (
                <span className="skeleton-text" style={{ width: '80%' }} />
              )}
            </span>
            <span className="option-indicator skeleton-fill" />
          </div>
        ))}
      </div>
    );
  }
  if (variant === 'message-detail') {
    return (
      <div className="page-skeleton-message-detail" role="status" aria-busy="true">
        <h3>
          <Skeleton.Title animated />
        </h3>
        <dl className="details">
          {['type', 'scope', 'published', 'content', 'expiry', 'sender', 'recipientIDs'].map(
            (key) => (
              <div key={key}>
                <dt>{t(`app.msg.${key}`)}</dt>
                <dd>
                  <Skeleton
                    animated
                    style={{ width: '75%', height: key === 'content' ? 66 : 18 }}
                  />
                </dd>
              </div>
            ),
          )}
        </dl>
      </div>
    );
  }
  if (variant === 'overview') {
    return (
      <div className="page-skeleton page-skeleton-overview" role="status" aria-busy="true">
        <div className="skeleton-heading">
          <div>
            <Skeleton.Title animated className="skeleton-eyebrow" />
            <div className="skeleton-title-row">
              <Skeleton.Title animated className="skeleton-page-title" />
              <Skeleton.Title animated className="skeleton-pill" />
            </div>
            <Skeleton.Title animated className="skeleton-lead" />
          </div>
        </div>
        <div className="skeleton-metrics">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index}>
              <Skeleton.Title animated />
              <Skeleton.Title animated />
            </div>
          ))}
        </div>
        <Skeleton.Title animated className="skeleton-section-title" />
        <Skeleton animated className="skeleton-card" />
        <Skeleton.Title animated className="skeleton-section-title" />
        <div className="skeleton-quick-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index}>
              <Skeleton.Title animated />
              <Skeleton.Title animated />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (variant === 'management') {
    return (
      <div className="page-skeleton page-skeleton-management" role="status" aria-busy="true">
        <div className="skeleton-management-title">
          <div>
            <Skeleton.Title animated className="skeleton-back" />
            <Skeleton.Title animated className="skeleton-management-heading" />
          </div>
          <Skeleton.Title animated />
        </div>
        <div className="skeleton-search-card">
          <Skeleton.Title animated className="skeleton-search" />
          <div className="skeleton-filters">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton.Title animated key={index} />
            ))}
          </div>
          <div className="skeleton-search-actions">
            <Skeleton.Title animated />
            <Skeleton.Title animated />
            <Skeleton.Title animated />
          </div>
        </div>
        <div className="skeleton-toolbar">
          <Skeleton.Title animated />
          <Skeleton.Title animated />
        </div>
        <div className="card skeleton-results">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="skeleton-list-row" key={index}>
              <Skeleton.Title animated className="skeleton-avatar" />
              <div className="skeleton-lines">
                <Skeleton.Title animated />
                <Skeleton.Title animated />
              </div>
              <Skeleton.Title animated className="skeleton-tail" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className={`page-skeleton page-skeleton-${variant}`} role="status" aria-busy="true">
      <div className="skeleton-heading-simple">
        <Skeleton.Title animated />
        <Skeleton.Title animated />
      </div>
      <div className="card skeleton-page-card">
        <Skeleton.Title animated />
        <Skeleton.Title animated />
        <Skeleton.Title animated />
      </div>
    </div>
  );
}
