// File: src/components/layout/Header.tsx

"use client";

import React from 'react';

interface HeaderProps {
  userProfile: any;
  abaAtiva: 'chat' | 'kanban';
  setAbaAtiva: (aba: 'chat' | 'kanban') => void;
  isAdmin: boolean;
  userUnidade: string;
  onOpenTeamModal: () => void;
  onLogout: () => void;
}

export default function Header({
  userProfile,
  abaAtiva,
  setAbaAtiva,
  isAdmin,
  userUnidade,
  onOpenTeamModal,
  onLogout,
}: HeaderProps) {
  return (
    <div className="bg-white border-b border-slate-200 px-4 md:px-6 h-14 md:h-16 shrink-0 flex items-center justify-between z-20 shadow-sm">
      {/* BRANDING */}
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="Dent'up Odonto" className="h-8 md:h-10 w-auto object-contain" />
        <div className="h-5 w-px bg-slate-200 hidden sm:block"></div>
        <h1 className="text-sm md:text-base font-bold text-slate-800 notranslate hidden sm:block" translate="no">
          CRM <span className="text-slate-400 font-medium">Clínica</span>
        </h1>
      </div>

      {/* AÇÕES E NAVEGAÇÃO */}
      <div className="flex items-center gap-3 md:gap-4">
        {isAdmin && (
          <button
            onClick={onOpenTeamModal}
            className="hidden md:flex bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-md text-xs font-bold transition-all items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span>Gerenciar Equipe</span>
          </button>
        )}

        <div className="hidden md:flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setAbaAtiva('chat')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all notranslate cursor-pointer ${
              abaAtiva === 'chat' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Chat (Mensagens)
          </button>
          <button
            onClick={() => setAbaAtiva('kanban')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all notranslate cursor-pointer ${
              abaAtiva === 'kanban' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Quadro CRM
          </button>
        </div>

        {/* PERFIL DO USUÁRIO & LOGOUT */}
        <div className="flex items-center gap-2 md:gap-3 border-l border-slate-200 pl-3 md:pl-4">
          <div className="text-right">
            <p className="text-xs font-bold text-slate-800 notranslate">{userProfile?.nome || userProfile?.email || 'Usuário'}</p>
            <div className="flex items-center justify-end gap-1">
              <span className="text-[9px] md:text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded uppercase notranslate">
                {userProfile?.cargo || 'Atendente'}
              </span>
              {userUnidade !== 'Todas' && (
                <span className="text-[9px] md:text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded uppercase notranslate">
                  {userUnidade}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Encerrar Sessão"
            className="p-1.5 text-slate-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}