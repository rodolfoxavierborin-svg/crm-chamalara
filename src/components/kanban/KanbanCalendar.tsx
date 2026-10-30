// File: src/components/kanban/KanbanCalendar.tsx

"use client";

import React from 'react';

const GOOGLE_CALENDARS: Record<string, { id: string; color: string }> = {
  'Santo André': { id: 'e53816e5210cbd29f4e2d525f75e9fdbad0333c901a13d213e98d791e99b23b0%40group.calendar.google.com', color: '%23D50000' },
  'Diadema': { id: '205188e12762a447906c539183a8be8e191162831ea3526fced0b3d7a9bf31ff%40group.calendar.google.com', color: '%23F6BF26' },
  'Mauá': { id: '6d64444a84645cd3a6871595cc4f6b1929cdd13d175ef676b5c89f3e4ee265b5%40group.calendar.google.com', color: '%230B8043' },
  'São Mateus': { id: '84903b0600945eccd716d5c0b51a620758e8ea1c6dc7a8bfa75a0b498febfbec%40group.calendar.google.com', color: '%238E24AA' },
};

interface KanbanCalendarProps {
  targetUnidade: string;
}

export default function KanbanCalendar({ targetUnidade }: KanbanCalendarProps) {
  const getGoogleCalendarUrl = () => {
    const baseUrl = "https://calendar.google.com/calendar/embed?ctz=America%2FSao_Paulo&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=1&showCalendars=1&showTz=0&mode=WEEK";
    if (targetUnidade !== 'all' && targetUnidade !== 'Todas' && GOOGLE_CALENDARS[targetUnidade]) {
      const cal = GOOGLE_CALENDARS[targetUnidade];
      return `${baseUrl}&src=${cal.id}&color=${cal.color}`;
    }
    const allSources = Object.values(GOOGLE_CALENDARS).map(cal => `&src=${cal.id}&color=${cal.color}`).join('');
    return `${baseUrl}${allSources}`;
  };

  return (
    <div className="flex-1 h-full w-full bg-white p-4">
      <iframe 
        src={getGoogleCalendarUrl()} 
        style={{ border: 0 }} 
        className="w-full h-full rounded-xl border border-slate-200 shadow-sm"
        frameBorder="0" 
        scrolling="no"
      />
    </div>
  );
}