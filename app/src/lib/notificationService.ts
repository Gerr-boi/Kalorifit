/**
 * notificationService.ts
 * Schedules local meal-reminder notifications using the Web Notification API.
 * No server or VAPID required — works when the app is open/in background as a PWA.
 */

export interface MealReminderPrefs {
  breakfast: boolean;
  breakfastTime: string; // "HH:MM"
  lunch: boolean;
  lunchTime: string;
  dinner: boolean;
  dinnerTime: string;
}

// Keep track so we can clear them on reschedule
const _timerIds: ReturnType<typeof setTimeout>[] = [];

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function scheduleMealReminders(
  prefs: Partial<MealReminderPrefs>,
  lang: 'Norsk' | 'English' = 'Norsk',
) {
  // Clear any previously scheduled reminders
  _timerIds.splice(0).forEach(clearTimeout);

  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const msgs =
    lang === 'English'
      ? {
          breakfast: 'Have you logged breakfast today?',
          lunch: 'Have you logged lunch today?',
          dinner: "Don't forget to log dinner!",
        }
      : {
          breakfast: 'Har du logget frokost i dag?',
          lunch: 'Har du logget lunsj i dag?',
          dinner: 'Husk å logge middagen i dag!',
        };

  const schedule = [
    { enabled: prefs.breakfast ?? true, time: prefs.breakfastTime ?? '09:00', body: msgs.breakfast, tag: 'reminder-breakfast' },
    { enabled: prefs.lunch ?? true, time: prefs.lunchTime ?? '12:30', body: msgs.lunch, tag: 'reminder-lunch' },
    { enabled: prefs.dinner ?? true, time: prefs.dinnerTime ?? '18:00', body: msgs.dinner, tag: 'reminder-dinner' },
  ];

  const activeSchedule = schedule.filter((s) => s.enabled).map(({ time, body, tag }) => ({ time, body, tag }));

  // Post schedule to service worker so it can fire reminders even when
  // the main thread is idle (e.g. backgrounded PWA or after page reload).
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SCHEDULE_NOTIFICATIONS',
      schedule: activeSchedule,
    });
  }

  const now = new Date();

  schedule.forEach(({ enabled, time, body, tag }) => {
    if (!enabled) return;
    const [h, m] = time.split(':').map(Number);
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    if (target <= now) return; // already past for today
    const delay = target.getTime() - now.getTime();
    const id = setTimeout(() => {
      try {
        new Notification('KaloriFit', {
          body,
          icon: '/icon-192x192.png',
          badge: '/icon-72x72.png',
          tag,
        });
      } catch {
        // Notification API not available in this context
      }
    }, delay);
    _timerIds.push(id);
  });
}
