import { useState, useEffect, useCallback } from 'react';

export function useNotifications(targets = [], supervisions = []) {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') {
      alert('Browser ini belum mendukung Web Notification.');
      return 'denied';
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      new Notification('GradSpace Notifikasi Aktif! 🔔', {
        body: 'Kamu akan menerima pengingat otomatis menjelang target PKL, Sempro, dan Sidang.',
      });
    }
    return result;
  };

  const checkUpcomingAlerts = useCallback(() => {
    if (permission !== 'granted') return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = today.toISOString().split('T')[0];

    const notifiedKey = `gradspace_notified_${todayKey}`;
    if (localStorage.getItem(notifiedKey)) return;

    const urgentTargets = targets.filter((t) => {
      const targetDate = new Date(t.target_date);
      targetDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    });

    const pendingRevisions = supervisions.filter(
      (s) => s.status === 'pending_revision'
    ).length;

    if (urgentTargets.length > 0 || pendingRevisions > 0) {
      const messages = [];
      urgentTargets.forEach((t) => {
        const targetDate = new Date(t.target_date);
        targetDate.setHours(0, 0, 0, 0);
        const diff = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
        messages.push(`${t.title}: ${diff === 0 ? 'Hari Ini!' : `H-${diff} hari`}`);
      });

      if (pendingRevisions > 0) {
        messages.push(`${pendingRevisions} catatan revisi bimbingan belum selesai.`);
      }

      new Notification('Pengingat GradSpace 📅', {
        body: messages.join(' • '),
      });

      localStorage.setItem(notifiedKey, 'true');
    }
  }, [permission, targets, supervisions]);

  useEffect(() => {
    if (targets.length > 0 || supervisions.length > 0) {
      checkUpcomingAlerts();
    }
  }, [targets, supervisions, checkUpcomingAlerts]);

  return { permission, requestPermission };
}