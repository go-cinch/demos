import { Tag } from 'antd-mobile';
import type { ResourceKind } from '../lib/types';
import { defaultColumns } from '../lib/resource-presentation';
import { configs } from '../lib/resource-config';
import { t } from '../locales';
export function SkeletonText({ width = '70%' }: { width?: string }) {
  return <span className="skeleton-text" style={{ width }} />;
}
export default function RecordListSkeleton({
  resource,
  rows = 5,
  kind = 'resource',
  selecting = false,
  columns,
}: {
  resource?: ResourceKind;
  rows?: number;
  kind?: 'resource' | 'message' | 'sent' | 'recent' | 'queue';
  selecting?: boolean;
  columns?: string[];
}) {
  if (kind === 'sent') {
    const visible = columns || ['title', 'type', 'scope', 'published_at'];
    return (
      <div
        className="card record-list page-skeleton-list skeleton-records"
        role="status"
        aria-busy="true"
        aria-label={t('loading')}
      >
        {Array.from({ length: rows }, (_, index) => (
          <article className="record-item" aria-hidden="true" key={index}>
            <div className="record">
              {selecting && <span className="skeleton-selection skeleton-fill" />}
              <div className="record-open">
                <span className="record-kind skeleton-fill" />
                <span className="record-main">
                  <strong>
                    <SkeletonText width="112px" />
                  </strong>
                  <span className="record-summary message-record-tags">
                    {visible.includes('type') && (
                      <Tag fill="outline">
                        <SkeletonText width="36px" />
                      </Tag>
                    )}
                    {visible.includes('scope') && (
                      <Tag fill="outline">
                        <SkeletonText width="44px" />
                      </Tag>
                    )}
                  </span>
                </span>
                <span className="skeleton-fill skeleton-chevron" />
              </div>
            </div>
            {visible.includes('published_at') && (
              <dl className="record-fields">
                <div>
                  <dt>{t('app.msg.published')}</dt>
                  <dd>
                    <SkeletonText width="126px" />
                  </dd>
                </div>
              </dl>
            )}
          </article>
        ))}
      </div>
    );
  }
  const fields = columns || (resource ? defaultColumns[resource] : []);
  const summary = resource
    ? {
        user: ['username', 'role', 'status'],
        role: ['name', 'word', 'action_codes'],
        'user-group': ['name', 'word', 'users', 'action_codes'],
        action: ['name', 'word'],
        dictionary: ['name', 'key', 'enabled'],
        whitelist: ['id'],
      }[resource]
    : [];
  const extra = resource
    ? configs.value[resource].columns.filter(
        (column) => fields.includes(column.key) && !summary.includes(column.key),
      )
    : [];
  return (
    <div
      className={`page-skeleton-list skeleton-records skeleton-records-${kind} skeleton-resource-${resource || 'none'}`}
      role="status"
      aria-busy="true"
      aria-label={t('loading')}
    >
      {Array.from({ length: rows }, (_, index) =>
        kind === 'message' ? (
          <div className="skeleton-message-row" key={index} aria-hidden="true">
            <span className="skeleton-fill skeleton-message-avatar" />
            <div>
              <strong>
                <SkeletonText />
              </strong>
              <small>
                <SkeletonText width="90%" />
              </small>
            </div>
            <SkeletonText width="94px" />
          </div>
        ) : (
          <article
            className={resource ? 'record-item' : kind === 'queue' ? 'queue-row' : 'recent-record'}
            key={index}
            aria-hidden="true"
          >
            <div className={resource ? 'record' : 'skeleton-recent-content'}>
              {resource && selecting && <span className="skeleton-selection skeleton-fill" />}
              <div className={resource ? 'record-open' : 'skeleton-recent-content'}>
                <span className={resource ? 'record-kind skeleton-fill' : 'avatar skeleton-fill'} />
                <span className="record-main">
                  <strong>
                    <SkeletonText width="112px" />
                  </strong>
                  <small>
                    <SkeletonText width="96px" />
                  </small>
                  {resource && ['role', 'user-group', 'action'].includes(resource) && (
                    <small className="record-summary">
                      <SkeletonText width="70px" />
                    </small>
                  )}
                  {resource === 'whitelist' && (
                    <span className="resource-tag skeleton-label">
                      {t('system.category.permission')}
                    </span>
                  )}
                </span>
                {resource && ['user', 'dictionary'].includes(resource) && (
                  <span className="skeleton-fill skeleton-tag" />
                )}
                {kind === 'queue' ? (
                  <span className="review-button">
                    <SkeletonText width="34px" />
                  </span>
                ) : (
                  <span className="skeleton-fill skeleton-chevron" />
                )}
              </div>
            </div>
            {extra.length > 0 && (
              <dl className="record-fields">
                {extra.map((column) => (
                  <div key={column.key}>
                    <dt>{column.title}</dt>
                    <dd>
                      {column.display === 'resource-rules' ? (
                        <div className="tags">
                          <span className="resource-tag">
                            <SkeletonText width="90px" />
                          </span>
                          <span className="resource-tag">
                            <SkeletonText width="60px" />
                          </span>
                        </div>
                      ) : column.display === 'category' ? (
                        <span className="resource-tag">
                          <SkeletonText width="90px" />
                        </span>
                      ) : (
                        <SkeletonText width="96px" />
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </article>
        ),
      )}
    </div>
  );
}
