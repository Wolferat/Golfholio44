import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2, ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import GlassHeader from '@/components/golf/GlassHeader';
import NotificationItem from '@/components/golf/NotificationItem';
import { getNotifications, markNotificationRead } from '@/lib/golfData';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

export default function Notifications() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await getNotifications();
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleTap = async (item) => {
    if (!item.read) {
      await markNotificationRead('read', item.id).catch(() => {});
    }
    if (item.deep_link) {
      navigate(item.deep_link);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markNotificationRead('read_all');
      await load();
      toast({ title: 'All marked as read' });
    } catch {
      toast({ title: 'Could not update' });
    }
  };

  const handleClearAll = async () => {
    try {
      await markNotificationRead('clear_all');
      await load();
      toast({ title: 'Notifications cleared' });
    } catch {
      toast({ title: 'Could not clear' });
    }
  };

  const handleClearOne = async (id) => {
    try {
      await markNotificationRead('clear', id);
      await load();
    } catch {}
  };

  return (
    <div>
      <GlassHeader>
        <div className="h-[60px] px-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full glass-card border border-border grid place-items-center">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-[22px] font-extrabold leading-none">Notifications</h1>
          {unreadCount > 0 && (
            <span className="ml-auto text-[11px] font-bold bg-primary text-primary-foreground rounded-full min-w-[20px] h-5 px-1.5 grid place-items-center">
              {unreadCount}
            </span>
          )}
        </div>
      </GlassHeader>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-2xl shimmer" />)}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground px-6">
            <div className="h-16 w-16 rounded-full bg-secondary/60 grid place-items-center mx-auto mb-4">
              <Bell className="h-7 w-7 opacity-50" />
            </div>
            <p className="font-semibold text-foreground">No notifications yet</p>
            <p className="text-sm mt-1">You'll see updates here when we find verified golf near you.</p>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <Button variant="secondary" className="flex-1 h-10" onClick={handleMarkAllRead}>
                  <CheckCheck className="h-4 w-4" /> Mark all read
                </Button>
              )}
              <Button variant="ghost" className="flex-1 h-10" onClick={handleClearAll}>
                <Trash2 className="h-4 w-4" /> Clear all
              </Button>
            </div>
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <NotificationItem
                  item={item}
                  onTap={() => handleTap(item)}
                  onClear={() => handleClearOne(item.id)}
                />
              </motion.div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}