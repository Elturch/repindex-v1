import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Check, CheckCheck, Info, AlertTriangle, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserNotification } from '@/hooks/useUserNotifications';

interface NotificationsPanelProps {
  notifications: UserNotification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDismiss: (id: string) => void;
  onClose: () => void;
}

const getNotificationIcon = (type: string, priority: string) => {
  if (priority === 'urgent') return <AlertTriangle className="h-4 w-4 text-destructive" />;
  
  switch (type) {
    case 'newsroom':
    case 'data_refresh':
      return <Megaphone className="h-4 w-4 text-primary" />;
    case 'system':
    case 'feature':
      return <Info className="h-4 w-4 text-blue-500" />;
    default:
      return <Bell className="h-4 w-4 text-muted-foreground" />;
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'urgent': return 'border-l-destructive bg-destructive/5';
    case 'high': return 'border-l-orange-500 bg-orange-500/5';
    default: return 'border-l-primary/30';
  }
};

export function NotificationsPanel({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDismiss,
  onClose,
}: NotificationsPanelProps) {
  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="mb-3 rounded-lg border bg-card shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Notificaciones</span>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="h-5 px-1.5 text-xs">
              {unreadCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={onMarkAllAsRead}
            >
              <CheckCheck className="h-3 w-3" />
              Marcar todas
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Notifications list */}
      <ScrollArea className="max-h-[300px]">
        {notifications.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No tienes notificaciones</p>
          </div>
        ) : (
          <div className="divide-y">
            <AnimatePresence>
              {notifications.map((notif) => (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={`
                    p-3 border-l-4 transition-colors
                    ${getPriorityColor(notif.priority)}
                    ${!notif.is_read ? 'bg-muted/30' : ''}
                  `}
                >
                  <div className="flex gap-2">
                    <div className="flex-shrink-0 mt-0.5">
                      {getNotificationIcon(notif.notification_type, notif.priority)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className={`text-sm ${!notif.is_read ? 'font-semibold' : 'font-medium'}`}>
                          {notif.title}
                        </h4>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 flex-shrink-0 opacity-50 hover:opacity-100"
                          onClick={() => onDismiss(notif.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {notif.content}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(notif.created_at), { 
                            addSuffix: true, 
                            locale: es 
                          })}
                        </span>
                        {!notif.is_read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs gap-1"
                            onClick={() => onMarkAsRead(notif.id)}
                          >
                            <Check className="h-3 w-3" />
                            Leída
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>
    </motion.div>
  );
}
