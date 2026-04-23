/**
 * 节律调度 —— 像真电台一样按时间段触发
 */

import cron from 'node-cron';
import { log } from './log.js';

export function startScheduler({ onTrigger }) {
  const schedule = [
    { cron: '0 7 * * *',  label: 'morning_wake',     desc: '早间清醒' },
    { cron: '0 9 * * *',  label: 'morning_kickoff',  desc: '早间开工' },
    { cron: '0 13 * * *', label: 'afternoon_focus',  desc: '下午专注' },
    { cron: '0 18 * * *', label: 'dusk',             desc: '傍晚' },
    { cron: '0 22 * * *', label: 'winddown',         desc: '睡前放松' },
    { cron: '0 * * * *',  label: 'hourly_pulse',     desc: '小时情绪检查' },
  ];

  const jobs = schedule.map(({ cron: expr, label, desc }) => {
    log.info(`scheduler → ${expr} ${label} (${desc})`);
    return cron.schedule(expr, () => {
      log.info(`⏰ 触发: ${label}`);
      onTrigger({ trigger: label, desc }).catch(e => log.error('触发失败', e));
    });
  });

  return () => jobs.forEach(j => j.stop());
}
