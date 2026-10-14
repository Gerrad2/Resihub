import { getNotifications, markNotificationRead } from './api.js';
import { getStudentContext, formatDateTime, node, showError } from './student_utils.js';

let notifications = [];
function render() {
  const container = document.getElementById('notificationList'); const empty = document.getElementById('emptyNotifications');
  if (!container) return; container.replaceChildren();
  if (!notifications.length) { empty?.classList.remove('hidden'); return; } empty?.classList.add('hidden');
  notifications.forEach(n => {
    const item = node('article', `notification-item${n.is_read ? '' : ' unread'}`);
    const title = node('h3', '', n.title || 'Notification');
    const message = node('p', '', n.message || '');
    const date = node('small', '', formatDateTime(n.created_at));
    item.append(title, message, date);
    if (!n.is_read) { const btn = node('button', 'notification-read-btn', 'Mark as read'); btn.type='button'; btn.addEventListener('click', async () => { const result = await markNotificationRead(n.id); if (!result.success) return showError(result.error?.message || 'Could not mark notification as read.'); n.is_read=true; render(); }); item.append(btn); }
    container.append(item);
  });
}
async function init() {
  try { const { user } = await getStudentContext(); const result = await getNotifications(user.id); if (!result.success) throw result.error; notifications=result.data||[]; render(); document.getElementById('markAllReadBtn')?.addEventListener('click', async () => { const unread=notifications.filter(n=>!n.is_read); for (const n of unread) { const r=await markNotificationRead(n.id); if(r.success)n.is_read=true; } render(); }); }
  catch(e){ showError(e?.message || 'Unable to load notifications.'); }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
