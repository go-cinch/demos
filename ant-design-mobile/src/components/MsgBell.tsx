import { useNavigate } from 'react-router-dom';
import { useUnreadCount } from '../lib/use-messages';
import { t } from '../locales';
import { Icon } from './UI';
export default function MsgBell() {
  const count = useUnreadCount(),
    navigate = useNavigate();
  return (
    <button
      className="icon-button msg-bell"
      aria-label={t('app.msg.inbox')}
      aria-description={(count ?? 0) > 0 ? t('app.msg.count', { count: count ?? 0 }) : undefined}
      onClick={() => navigate('/msg/inbox')}
    >
      <Icon name="notification" />
      {(count ?? 0) > 0 && (
        <span className="msg-unread-dot" data-testid="message-unread-dot" aria-hidden="true" />
      )}
    </button>
  );
}
