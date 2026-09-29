import { Skeleton } from 'antd-mobile';

export default function PageSkeleton({
  variant = 'page',
}: {
  variant?: 'list' | 'management' | 'overview' | 'page';
}) {
  if (variant === 'list') {
    return (
      <div className="page-skeleton page-skeleton-list" role="status" aria-busy="true">
        {Array.from({ length: 5 }, (_, index) => (
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
