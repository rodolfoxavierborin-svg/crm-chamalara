// File: src/components/kanban/KanbanFilters.tsx

"use client";

import React, { useState } from 'react';

interface KanbanFiltersProps {
  activeTab: 'kanban' | 'analytics' | 'calendar';
  setActiveTab: (tab: 'kanban' | 'analytics' | 'calendar') => void;
  isAdmin: boolean;
  userUnidade: string;
  targetUnidade: string;
  setUnidadeFilter: (unidade: string) => void;
  dateRange: string;
  setDateRange: (range: string) => void;
  customStart: string;
  setCustomStart: (val: string) => void;
  customEnd: string;
  setCustomEnd: (val: string) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onNovoPaciente: () => void;
  unidades?: string[];
}

export default function KanbanFilters({
  activeTab,
  setActiveTab,
  isAdmin,
  userUnidade,
  targetUnidade,
  setUnidadeFilter,
  dateRange,
  setDateRange,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  searchTerm,
  setSearchTerm,
  onNovoPaciente,
  unidades = [],
}: KanbanFiltersProps) {
  // TRAVA ANTI-CRASH: Evita 'Cannot read properties of undefined (reading map)'
  const safeUnidades = Array.isArray(unidades) ? unidades : [];
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const hasActiveFilterBadge =
    (targetUnidade && targetUnidade !== 'all' && targetUnidade !== 'Todas') ||
    dateRange !== 'this_month';

  return (
    <div className="px-3 py-2.5 md:px-6 md:py-3 flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 gap-2.5 md:gap-4">
      {/* LINHA 1 MOBILE / ESQUERDA DESKTOP: NAVEGAÇÃO DE ABAS + BOTÃO NOVO PACIENTE MOBILE */}
      <div className="flex items-center justify-between gap-2 w-full md:w-auto">
        <div className="flex flex-1 md:flex-none bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
          <button
            type="button"
            onClick={() => setActiveTab('kanban')}
            className={`flex-1 md:flex-none justify-center px-2.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer ${
              activeTab === 'kanban' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            <span className="hidden sm:inline">Quadro CRM</span>
            <span className="sm:hidden">Quadro</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`flex-1 md:flex-none justify-center px-2.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer ${
              activeTab === 'analytics' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Analytics</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('calendar')}
            className={`flex-1 md:flex-none justify-center px-2.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer ${
              activeTab === 'calendar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Agenda</span>
          </button>
        </div>

        {/* BOTÃO NOVO PACIENTE COMPACTO NO MOBILE */}
        <button
          type="button"
          onClick={onNovoPaciente}
          className="md:hidden bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-3 py-2.5 rounded-xl text-xs transition-all shadow-sm flex items-center gap-1 shrink-0 cursor-pointer"
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span>Novo</span>
        </button>
      </div>

      {/* BARRA RÁPIDA MOBILE: BUSCA + BOTÃO DE EXPANDIR FILTROS */}
      <div className="flex md:hidden items-center gap-2">
        {activeTab !== 'calendar' ? (
          <div className="relative flex-1">
            <input
              type="search"
              placeholder="Buscar paciente ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-8 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 shadow-inner"
            />
            <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-0.5 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 text-xs font-semibold text-slate-500 truncate px-1">
            Unidade: <span className="text-slate-800 font-bold">{targetUnidade === 'all' ? 'Todas' : targetUnidade}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setMobileFiltersOpen((v) => !v)}
          className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
            mobileFiltersOpen || hasActiveFilterBadge
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-slate-50 text-slate-700 border-slate-200'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span>Filtros</span>
          {hasActiveFilterBadge && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
        </button>
      </div>

      {/* CONTROLES E FILTROS (SEMPRE VISÍVEIS NO DESKTOP, EXPANSÍVEIS NO MOBILE) */}
      <div
        className={`${
          mobileFiltersOpen ? 'grid grid-cols-1 gap-2 pt-1 border-t border-slate-100' : 'hidden'
        } md:flex md:items-center md:gap-3 md:flex-wrap`}
      >
        <button
          type="button"
          onClick={onNovoPaciente}
          className="hidden md:flex bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-all shadow-sm hover:shadow items-center gap-1.5 cursor-pointer"
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span>Novo Paciente</span>
        </button>

        {/* SELETOR DE UNIDADE */}
        <select
          disabled={!isAdmin && userUnidade !== 'Todas' && userUnidade !== 'all'}
          value={targetUnidade}
          onChange={(e) => setUnidadeFilter(e.target.value)}
          className="w-full md:w-auto bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 font-semibold outline-none focus:border-blue-500 cursor-pointer"
        >
          <option value="all">Todas as Unidades</option>
          {safeUnidades.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>

        {activeTab !== 'calendar' && (
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:flex-wrap">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full md:w-auto bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 font-medium outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="this_month">Este Mês</option>
              <option value="last_month">Mês Anterior</option>
              <option value="today">Hoje</option>
              <option value="yesterday">Ontem</option>
              <option value="last_7">Últimos 7 dias</option>
              <option value="all">Todo o Período</option>
              <option value="custom">Personalizado</option>
            </select>

            {dateRange === 'custom' && (
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1.5 md:p-1 rounded-lg border border-slate-200/80">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="flex-1 md:flex-none bg-white border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-500 cursor-pointer shadow-sm"
                />
                <span className="text-[11px] font-bold text-slate-400">até</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="flex-1 md:flex-none bg-white border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-500 cursor-pointer shadow-sm"
                />
              </div>
            )}

            <div className="relative hidden md:block">
              <input
                type="text"
                placeholder="Buscar paciente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 w-44 shadow-inner"
              />
              <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}