import { t } from '../locales';
import { Icon } from './UI';
export default function RecordPagination({
  page,
  size,
  total,
  loading,
  change,
  options,
}: {
  page: number;
  size: number;
  total: number;
  loading: boolean;
  change: (v: number) => void;
  options: () => void;
}) {
  return (
    <div className="pagination">
      <button
        className="pagination-button"
        disabled={page === 1 || loading}
        onClick={() => change(page - 1)}
      >
        <Icon name="chevron-left" size={16} />
        <span>{t('previous')}</span>
      </button>
      <div className="page-config">
        <span>
          {t('page', { page })} / {Math.max(1, Math.ceil(total / size))}
        </span>
        <button aria-label={t('pageSize')} onClick={options}>
          <span>
            {size} / {t('pageUnit')}
          </span>
          <Icon name="chevron-down" size={13} />
        </button>
      </div>
      <button
        className="pagination-button"
        disabled={page * size >= total || loading}
        onClick={() => change(page + 1)}
      >
        <span>{t('next')}</span>
        <Icon name="chevron-right" size={16} />
      </button>
    </div>
  );
}
